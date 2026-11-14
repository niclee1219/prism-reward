// Request handling for every endpoint. Runtime-neutral: it runs unchanged in Deno
// (Supabase Edge Functions) and in Node (local development and tests).
// Trust-sensitive work happens in the SQL functions; this layer validates input,
// applies the score cap and rate limits, and checks the admin PIN.
import { implausibleReason } from './scoring.ts';

export interface Deps {
  /** Calls a SQL function with named arguments and returns its jsonb result. */
  rpc(fn: string, args: Record<string, unknown>): Promise<any>;
  adminPin: string;
  allowedOrigin?: string;
}

export const LIMITS = {
  COOLDOWN_S: 10,
  /** Whole venues share one public IP, so the per-IP limit has to be generous. */
  IP_PER_MIN: 900,
  DEVICE_PER_MIN: 40,
  PIN_FAILS_PER_10_MIN: 10,
  NICKNAME_MAX: 16,
};

/** Must match the check constraint in migration 0004 and src/content/dishes.ts. */
export const DISH_IDS: unknown[] = ['chicken-rice', 'char-kway-teow', 'laksa'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const STATUS: Record<string, number> = {
  cooldown: 429,
  rate_limited: 429,
  closed: 403,
  unauthorized: 401,
  no_run: 404,
  no_player: 404,
  not_found: 404,
  already_redeemed: 409,
  bonus_off: 409,
  run_id_taken: 409,
  implausible: 422,
  name_taken: 409,
  bad_name: 422,
};

function cors(deps: Deps): Record<string, string> {
  return {
    'access-control-allow-origin': deps.allowedOrigin || '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-admin-pin',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
  };
}

function json(deps: Deps, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(deps) },
  });
}

/** Turns a SQL function result into a response; {"error": code} becomes the matching HTTP status. */
function reply(deps: Deps, result: any): Response {
  if (result && typeof result === 'object' && typeof result.error === 'string') {
    return json(deps, result, STATUS[result.error] ?? 400);
  }
  return json(deps, result);
}

const fail = (deps: Deps, error: string, extra: Record<string, unknown> = {}) =>
  json(deps, { error, ...extra }, STATUS[error] ?? 400);

function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'unknown').trim();
}

export function cleanNickname(raw: unknown): string {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.NICKNAME_MAX)
    .trim();
  return s || 'Player';
}

/** Minimal blocklist for a public leaderboard; matched against the name with spaces/symbols removed. */
const BLOCKED = ['fuck', 'shit', 'cunt', 'bitch', 'dick', 'cock', 'pussy', 'whore', 'slut', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'cb', 'knn', 'ccb', 'chibai'];
export function isCleanName(name: string): boolean {
  const flat = name.toLowerCase().replace(/[^a-z]/g, '');
  return !BLOCKED.some((w) => (w.length <= 3 ? flat === w : flat.includes(w)));
}

const isDevice = (v: unknown): v is string => typeof v === 'string' && v.length >= 8 && v.length <= 64 && /^[\w-]+$/.test(v);

function samePin(a: string, b: string): boolean {
  if (!b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handle(route: string, req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(deps) });
  try {
    const ip = clientIp(req);
    if (!(await deps.rpc('prism_rate_ok', { p_key: `ip:${ip}`, p_max: LIMITS.IP_PER_MIN, p_window_s: 60 }))) {
      return fail(deps, 'rate_limited');
    }
    const url = new URL(req.url);
    const body: any = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const device = req.method === 'POST' ? body.device_id : url.searchParams.get('device_id');

    if (route === 'admin') return await admin(req, url, body, ip, deps);

    if (device != null) {
      if (!isDevice(device)) return fail(deps, 'bad_request');
      if (!(await deps.rpc('prism_rate_ok', { p_key: `dev:${device}`, p_max: LIMITS.DEVICE_PER_MIN, p_window_s: 60 }))) {
        return fail(deps, 'rate_limited');
      }
    }

    if (route === 'leaderboard' && req.method === 'GET') {
      const limit = Number(url.searchParams.get('limit') ?? 10);
      return reply(deps, await deps.rpc('prism_leaderboard', { p_limit: Number.isFinite(limit) ? Math.floor(limit) : 10, p_device_id: device ?? null }));
    }
    if (req.method !== 'POST' || !isDevice(device)) return fail(deps, 'bad_request');

    switch (route) {
      case 'submit-run': {
        if (!UUID.test(String(body.run_id))) return fail(deps, 'bad_request');
        const run = {
          score: body.score, correct: body.correct, wrong: body.wrong, gates: body.gates, duration_ms: body.duration_ms,
        };
        // The score cap. Never trust anything else the client says about its result.
        const reason = implausibleReason(run);
        if (reason) return fail(deps, 'implausible', { reason });
        // Optional (older clients send none); if present it must be a known dish.
        if (body.dish != null && !DISH_IDS.includes(body.dish)) return fail(deps, 'bad_request');
        return reply(deps, await deps.rpc('prism_submit_run', {
          p_run_id: body.run_id, p_device_id: device, p_nickname: cleanNickname(body.nickname),
          p_score: run.score, p_correct: run.correct, p_wrong: run.wrong, p_gates: run.gates,
          p_duration_ms: run.duration_ms, p_cooldown_s: LIMITS.COOLDOWN_S, p_dish: body.dish ?? null,
        }));
      }
      case 'claim-name': {
        const name = cleanNickname(body.nickname);
        if (String(body.nickname ?? '').trim() === '' || !isCleanName(name)) return fail(deps, 'bad_name');
        return reply(deps, await deps.rpc('prism_claim_name', { p_device_id: device, p_nickname: name }));
      }
      case 'spin':
        if (!UUID.test(String(body.run_id))) return fail(deps, 'bad_request');
        return reply(deps, await deps.rpc('prism_spin', { p_run_id: body.run_id, p_device_id: device }));
      case 'vote':
        return reply(deps, await deps.rpc('prism_vote', { p_device_id: device, p_voted: body.voted === true }));
      case 'email': {
        const email = String(body.email ?? '').trim();
        if (email.length > 254 || !EMAIL.test(email)) return fail(deps, 'bad_email');
        return reply(deps, await deps.rpc('prism_email', { p_device_id: device, p_email: email, p_consent: body.consent === true }));
      }
    }
    return fail(deps, 'not_found');
  } catch (e) {
    console.error(`[${route}]`, e);
    return json(deps, { error: 'server_error' }, 500);
  }
}

async function admin(req: Request, url: URL, body: any, ip: string, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return fail(deps, 'bad_request');
  const failKey = { p_key: `pinfail:${ip}`, p_max: LIMITS.PIN_FAILS_PER_10_MIN, p_window_s: 600 };
  if (!(await deps.rpc('prism_rate_peek', failKey))) return fail(deps, 'rate_limited');
  if (!samePin(req.headers.get('x-admin-pin') ?? '', deps.adminPin)) {
    await deps.rpc('prism_rate_ok', failKey);
    return fail(deps, 'unauthorized');
  }
  const action = url.pathname.replace(/\/+$/, '').split('/').pop();
  switch (action) {
    case 'login':
      return json(deps, { ok: true });
    case 'redeem':
      return reply(deps, await deps.rpc('prism_admin_redeem', { p_code: String(body.code ?? '') }));
    case 'runs':
      return reply(deps, await deps.rpc('prism_admin_runs', { p_search: String(body.search ?? ''), p_limit: 50 }));
    case 'delete-run':
    case 'restore-run':
      if (!UUID.test(String(body.run_id))) return fail(deps, 'bad_request');
      return reply(deps, await deps.rpc('prism_admin_set_run_status', {
        p_run_id: body.run_id, p_status: action === 'delete-run' ? 'removed' : 'valid',
      }));
    case 'prizes':
      return reply(deps, await deps.rpc('prism_admin_prizes', {}));
    case 'set-prize': {
      const stock = Number(body.stock);
      const weight = body.weight == null ? null : Number(body.weight);
      if (!UUID.test(String(body.id)) || !Number.isInteger(stock) || (weight !== null && !Number.isInteger(weight))) {
        return fail(deps, 'bad_request');
      }
      return reply(deps, await deps.rpc('prism_admin_set_prize', { p_id: body.id, p_stock: stock, p_weight: weight }));
    }
    case 'config':
      return reply(deps, await deps.rpc('prism_admin_config', {}));
    case 'set-config':
      return reply(deps, await deps.rpc('prism_admin_set_config', { p_key: String(body.key ?? ''), p_value: String(body.value ?? '') }));
    case 'stats':
      return reply(deps, await deps.rpc('prism_admin_stats', {}));
    case 'export-emails':
      return reply(deps, await deps.rpc('prism_admin_export_emails', {}));
  }
  return fail(deps, 'not_found');
}
