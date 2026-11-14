import { NET } from '../config';

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    /** True when trying again later could succeed (offline, timeout, server busy, cooldown). */
    public retryable: boolean,
  ) {
    super(code);
  }
}

export interface RankInfo {
  rank: number | null;
  total_players: number;
  beat_count: number;
  /** The player's leaderboard score (best run, bonus included). */
  score: number | null;
}

export interface SubmitResult extends RankInfo {
  run_id: string;
  run_score: number;
  is_best: boolean;
  vote_bonus_enabled: boolean;
  vote_bonus_multiplier: number;
  voted: boolean;
  is_new: boolean;
  nickname: string;
  wheel: string[];
}

export async function claimName(deviceId: string, nickname: string): Promise<{ nickname: string; locked: boolean }> {
  return api('/claim-name', { body: { device_id: deviceId, nickname } });
}

export interface LeaderboardResult {
  top: { rank: number; nickname: string; score: number; key: string; dish?: string | null; served?: boolean }[];
  total_players: number;
  total_plays: number;
  me: { rank: number; score: number } | null;
  vote_bonus_enabled: boolean;
  wheel: string[];
}

export interface SpinResult {
  prize_id: string | null;
  prize_name: string;
  code: string;
  segments: string[];
  index: number;
  redeemed: boolean;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  if (!NET.API_BASE) throw new ApiError('no_backend', 0, true);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), NET.REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${NET.API_BASE}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(NET.ANON_KEY ? { apikey: NET.ANON_KEY, authorization: `Bearer ${NET.ANON_KEY}` } : {}),
        ...init.headers,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: ctl.signal,
    });
  } catch {
    throw new ApiError('network', 0, true);
  } finally {
    clearTimeout(timer);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    const code = (data as { error?: string } | null)?.error ?? `http_${res.status}`;
    throw new ApiError(code, res.status, res.status >= 500 || res.status === 429 || res.status === 408);
  }
  return data as T;
}
