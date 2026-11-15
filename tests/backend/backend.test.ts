// Integration tests: the real router and the real SQL, against a local Postgres.
// Start the database first:  scripts/local-db.sh start
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_DB, makeDeps } from '../../scripts/local-backend';
import { handle, type Deps } from '../../supabase/functions/_shared/router';

const PIN = '424242';
let pool: pg.Pool;
let deps: Deps;

async function call(route: string, body?: unknown, opts: { pin?: string; path?: string; query?: string } = {}) {
  const url = `http://local/${route}${opts.path ? `/${opts.path}` : ''}${opts.query ?? ''}`;
  const res = await handle(
    route,
    new Request(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(opts.pin ? { 'x-admin-pin': opts.pin } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    deps,
  );
  return { status: res.status, body: (await res.json()) as any };
}
const admin = (action: string, body: unknown = {}, pin = PIN) => call('admin', body, { pin, path: action });

const device = () => `dev-${randomUUID()}`;
const run = (over: Record<string, unknown> = {}) => ({
  run_id: randomUUID(), device_id: device(), nickname: `P${randomUUID().slice(0, 8)}`,
  score: 1500, correct: 6, wrong: 2, gates: 8, duration_ms: 60_000, ...over,
});

beforeAll(() => {
  pool = new pg.Pool({ connectionString: LOCAL_DB, max: 60 });
  deps = makeDeps(pool, PIN);
});
afterAll(() => pool.end());
beforeEach(async () => {
  await pool.query('truncate players, runs, draw_entries, reactions, rate_limits cascade');
  await pool.query(`update config set value = 'true' where key in ('vote_bonus_enabled', 'submissions_open', 'site_open')`);
  await pool.query(`update config set value = '1.1' where key = 'vote_bonus_multiplier'`);
});

describe('submit-run', () => {
  it('stores a run and returns rank, total_players, beat_count, run_id', async () => {
    const a = await call('submit-run', run({ score: 1000 }));
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ rank: 1, total_players: 1, beat_count: 0, is_best: true });
    const b = await call('submit-run', run({ score: 2000 }));
    expect(b.body).toMatchObject({ rank: 1, total_players: 2, beat_count: 1 });
    const c = await call('submit-run', run({ score: 500 }));
    expect(c.body).toMatchObject({ rank: 3, total_players: 3, beat_count: 0 });
    expect(c.body.wheel).toBeUndefined();
  });

  it('rejects an impossible score', async () => {
    const r = await call('submit-run', run({ score: 900_000 }));
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ error: 'implausible', reason: 'score_too_high' });
    expect((await call('submit-run', run({ duration_ms: 186_000 }))).body.reason).toBe('too_long');
    expect((await call('submit-run', run({ score: 12.5 }))).status).toBe(422);
    expect((await pool.query('select count(*)::int as n from runs')).rows[0].n).toBe(0);
  });

  it('rejects a rapid resubmit from the same device (cooldown)', async () => {
    const d = device();
    expect((await call('submit-run', run({ device_id: d }))).status).toBe(200);
    const again = await call('submit-run', run({ device_id: d }));
    expect(again.status).toBe(429);
    expect(again.body.error).toBe('cooldown');
    // Once the cooldown has passed, the same device can submit again.
    await pool.query(`update runs set created_at = now() - interval '11 seconds'`);
    expect((await call('submit-run', run({ device_id: d }))).status).toBe(200);
  });

  it('accepts a retry of the same run id exactly once (idempotent)', async () => {
    const r = run();
    const first = await call('submit-run', r);
    const retry = await call('submit-run', r);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.body.run_id).toBe(first.body.run_id);
    expect(retry.body.is_new).toBe(false);
    expect((await pool.query('select count(*)::int as n from runs')).rows[0].n).toBe(1);
  });

  it('ignores a client-sent rank and cleans the nickname', async () => {
    const r = await call('submit-run', run({ rank: 1, score: 10, nickname: '  <b>Very   Long Nickname Indeed</b>  ' }));
    await call('submit-run', run({ score: 5000 }));
    const lb = await call('leaderboard', undefined, { query: `?limit=10&device_id=${'x'.repeat(10)}` });
    expect(lb.body.top[0].score).toBe(5000);
    expect(lb.body.top[1].nickname).toBe('bVery Long Nickn');
    expect(r.body.rank).toBe(1);
  });

  it('refuses runs while submissions are closed', async () => {
    await admin('set-config', { key: 'submissions_open', value: 'false' });
    const r = await call('submit-run', run());
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('closed');
  });

  it('keeps the best run per player on the leaderboard', async () => {
    const d = device();
    await call('submit-run', run({ device_id: d, score: 3000, correct: 8, wrong: 0, gates: 8 }));
    await pool.query(`update runs set created_at = now() - interval '11 seconds'`);
    const second = await call('submit-run', run({ device_id: d, score: 100 }));
    expect(second.body).toMatchObject({ score: 3000, run_score: 100, is_best: false, total_players: 1 });
    const lb = await call('leaderboard', undefined, { query: `?device_id=${d}` });
    expect(lb.body).toMatchObject({ total_players: 1, total_plays: 2, me: { rank: 1, score: 3000 } });
  });
});

describe('vote bonus', () => {
  it('applies once per player and vanishes when toggled off', async () => {
    const d = device();
    await call('submit-run', run({ device_id: d, score: 1000 }));
    await call('submit-run', run({ score: 1050 }));
    const voted = await call('vote', { device_id: d, voted: true });
    expect(voted.body).toMatchObject({ score: 1100, rank: 1 });
    // Ticking again changes nothing: the bonus is not stacked.
    expect((await call('vote', { device_id: d, voted: true })).body.score).toBe(1100);

    expect((await admin('set-config', { key: 'vote_bonus_enabled', value: 'false' })).body.ok).toBe(true);
    const lb = await call('leaderboard', undefined, { query: `?device_id=${d}` });
    expect(lb.body.me).toMatchObject({ rank: 2, score: 1000 });
    expect((await call('vote', { device_id: d, voted: true })).status).toBe(409);
  });

  it('caps the multiplier at 1.2', async () => {
    const set = await admin('set-config', { key: 'vote_bonus_multiplier', value: '3' });
    expect(set.body.value).toBe('1.2');
    await pool.query(`update config set value = '9' where key = 'vote_bonus_multiplier'`); // even if edited by hand
    const d = device();
    await call('submit-run', run({ device_id: d, score: 1000 }));
    expect((await call('vote', { device_id: d, voted: true })).body.score).toBe(1200);
  });
});

describe('admin', () => {
  it('needs the PIN and locks out after repeated wrong PINs', async () => {
    expect((await admin('stats', {}, 'nope')).status).toBe(401);
    expect((await call('admin', {}, { path: 'stats' })).status).toBe(401);
    expect((await admin('login')).body.ok).toBe(true);
    for (let i = 0; i < 9; i++) await admin('stats', {}, '000000');
    expect((await admin('stats', {}, '000000')).status).toBe(429);
    expect((await admin('stats')).status).toBe(429); // right PIN is refused too while locked out
  });

  it('removes a run from the board live, and can restore it', async () => {
    const cheat = run({ score: 5000, correct: 10, wrong: 0, gates: 10 });
    await call('submit-run', cheat);
    await call('submit-run', run({ score: 800 }));
    const list = await admin('runs', { search: '' });
    expect(list.body[0]).toMatchObject({ id: cheat.run_id, score: 5000 });
    expect((await admin('delete-run', { run_id: cheat.run_id })).body.ok).toBe(true);
    const lb = await call('leaderboard', undefined);
    expect(lb.body.top.map((t: any) => t.score)).toEqual([800]);
    await admin('restore-run', { run_id: cheat.run_id });
    expect((await call('leaderboard', undefined)).body.top[0].score).toBe(5000);
  });

  it('exports lucky draw entries and reports stats', async () => {
    const r = run({ nickname: 'Kopi Peng' });
    await call('submit-run', r);
    await call('email', { device_id: r.device_id, email: 'Kopi.Peng@IRAS.gov.sg', message: 'Would love this for my team' });
    const rows = (await admin('export-entries')).body;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ nickname: 'Kopi Peng', email: 'kopi.peng@iras.gov.sg', message: 'Would love this for my team' });
    expect((await admin('stats')).body).toMatchObject({ players: 1, valid_runs: 1, entries: 1 });
  });

  it('no longer has any prize or redeem actions', async () => {
    for (const action of ['redeem', 'prizes', 'set-prize', 'export-emails']) {
      expect((await admin(action, {})).status).toBe(404);
    }
  });
});

describe('closing the site', () => {
  it('is open by default, closes and reopens from admin, and anyone can ask', async () => {
    expect((await call('status', undefined)).body).toEqual({ open: true });
    expect((await admin('set-config', { key: 'site_open', value: 'false' })).body.ok).toBe(true);
    expect((await call('status', undefined)).body).toEqual({ open: false });
    expect((await admin('config')).body.site_open).toBe('false');
    expect((await admin('set-config', { key: 'site_open', value: 'maybe' })).status).toBe(400);
    await admin('set-config', { key: 'site_open', value: 'true' });
    expect((await call('status', undefined)).body).toEqual({ open: true });
  });

  it('cannot be switched from outside admin', async () => {
    expect((await call('admin', { key: 'site_open', value: 'false' }, { path: 'set-config' })).status).toBe(401);
    expect((await call('status', undefined)).body.open).toBe(true);
  });
});

describe('reset all data', () => {
  it('needs the PIN and the confirmation word', async () => {
    const r = run();
    await call('submit-run', r);
    expect((await admin('reset', { confirm: 'RESET' }, 'nope')).status).toBe(401);
    expect((await admin('reset', {})).status).toBe(400);
    expect((await admin('reset', { confirm: 'reset' })).status).toBe(400);
    expect((await pool.query('select count(*)::int as n from runs')).rows[0].n).toBe(1); // nothing was deleted
  });

  it('deletes players, runs, entries and reactions, keeps the settings, and reports what it removed', async () => {
    const a = run();
    const b = run();
    await call('submit-run', a);
    await call('submit-run', b);
    await call('email', { device_id: a.device_id, email: 'a@iras.gov.sg' });
    await call('reactions', { device_id: a.device_id, kind: 'fire' });
    await admin('set-config', { key: 'site_open', value: 'false' });

    const res = await admin('reset', { confirm: 'RESET' });
    expect(res.body).toEqual({ ok: true, deleted: { players: 2, runs: 2, entries: 1, reactions: 1 } });
    for (const t of ['players', 'runs', 'draw_entries', 'reactions']) {
      expect((await pool.query(`select count(*)::int as n from ${t}`)).rows[0].n, t).toBe(0);
    }
    expect((await call('leaderboard', undefined)).body).toMatchObject({ top: [], total_players: 0, total_plays: 0 });
    expect((await admin('config')).body.site_open).toBe('false'); // settings survive
    // A fresh start works: the same name and email can be used again.
    expect((await call('submit-run', { ...a, run_id: randomUUID() })).status).toBe(200);
    expect((await call('email', { device_id: a.device_id, email: 'a@iras.gov.sg' })).body.ok).toBe(true);
  });
});

describe('lucky draw entry', () => {
  const enter = (r: { device_id: string }, email: string, extra: Record<string, unknown> = {}) =>
    call('email', { device_id: r.device_id, email, ...extra });

  it('accepts only exact @iras.gov.sg addresses, in any case', async () => {
    const r = run();
    await call('submit-run', r);
    for (const bad of ['not-an-email', 'a@gmail.com', 'a@x.iras.gov.sg', 'a@iras.gov.sg.evil.com', 'a@iras.gov', '@iras.gov.sg', 'a b@iras.gov.sg']) {
      const res = await enter(r, bad);
      expect(res.status, bad).toBe(422);
      expect(res.body.error).toBe('bad_email');
    }
    expect((await enter(r, 'Jane.Tan@IRAS.GOV.SG')).body.ok).toBe(true);
    expect((await pool.query('select email from draw_entries')).rows).toEqual([{ email: 'jane.tan@iras.gov.sg' }]);
  });

  it('needs a known device', async () => {
    expect((await enter({ device_id: device() }, 'a@iras.gov.sg')).status).toBe(404);
  });

  it('allows one entry per device and one per email', async () => {
    const a = run();
    const b = run();
    await call('submit-run', a);
    await call('submit-run', b);
    expect((await enter(a, 'one@iras.gov.sg')).body.ok).toBe(true);
    expect((await enter(a, 'other@iras.gov.sg')).body.error).toBe('already_entered');
    const dup = await enter(b, 'ONE@iras.gov.sg');
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('email_taken');
    await pool.query(`update runs set created_at = now() - interval '11 seconds'`); // past the cooldown
    expect((await call('submit-run', { ...a, run_id: randomUUID(), score: 900 })).body.entered).toBe(true);
    expect((await pool.query('select count(*)::int as n from draw_entries')).rows[0].n).toBe(1);
  });

  it('keeps the optional feedback short and plain', async () => {
    const r = run();
    await call('submit-run', r);
    await enter(r, 'a@iras.gov.sg', { message: `<b>hi</b>${'x'.repeat(900)}` });
    const m = (await pool.query('select message from draw_entries')).rows[0].message as string;
    expect(m.length).toBe(500);
    expect(m).not.toMatch(/[<>]/);
    const blank = run();
    await call('submit-run', blank);
    await enter(blank, 'b@iras.gov.sg', { message: '   ' });
    expect((await pool.query(`select message from draw_entries where email = 'b@iras.gov.sg'`)).rows[0].message).toBeNull();
  });
});

describe('reactions', () => {
  const react = (device_id: string, kind: string) => call('reactions', { device_id, kind });

  it('stores reactions and serves only the new ones', async () => {
    const first = await call('reactions', undefined, { query: '?since=-1' });
    expect(first.body).toEqual({ latest: 0, items: [] }); // a fresh screen learns the cursor, no replay
    const d = device();
    expect((await react(d, 'heart')).body.ok).toBe(true);
    expect((await react(d, 'confetti')).body.ok).toBe(true);
    const got = await call('reactions', undefined, { query: '?since=0' });
    expect(got.body.items.map((i: any) => i.kind)).toEqual(['heart', 'confetti']);
    const latest = got.body.latest;
    expect((await call('reactions', undefined, { query: `?since=${latest}` })).body.items).toEqual([]);
    await react(d, 'penguin');
    expect((await call('reactions', undefined, { query: `?since=${latest}` })).body.items.map((i: any) => i.kind)).toEqual(['penguin']);
  });

  it('only knows the six kinds', async () => {
    const d = device();
    for (const kind of ['confetti', 'heart', 'like', 'fire', 'penguin', 'party']) {
      expect((await react(d, kind)).status, kind).toBe(200);
    }
    expect((await react(d, 'skull')).status).toBe(400);
    expect((await call('reactions', { device_id: d })).status).toBe(400);
  });

  it('stops one phone from flooding the big screen', async () => {
    const d = device();
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) statuses.push((await react(d, 'fire')).status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(12);
    expect(statuses.slice(12)).toEqual([429, 429]);
  });

  it('ignores reactions older than two minutes', async () => {
    await react(device(), 'like');
    await pool.query(`update reactions set created_at = now() - interval '3 minutes'`);
    expect((await call('reactions', undefined, { query: '?since=0' })).body.items).toEqual([]);
  });
});

describe('accounts and unique names', () => {
  it('claims a name and locks it to the device', async () => {
    const d = device();
    const a = await call('claim-name', { device_id: d, nickname: 'Crispy Prata' });
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ nickname: 'Crispy Prata', locked: true });
    // Claiming again with a different name returns the locked one.
    const again = await call('claim-name', { device_id: d, nickname: 'Something Else' });
    expect(again.body).toEqual({ nickname: 'Crispy Prata', locked: true });
  });

  it('rejects a name already used, ignoring case and spacing', async () => {
    await call('claim-name', { device_id: device(), nickname: 'Kaya Toast' });
    const dup = await call('claim-name', { device_id: device(), nickname: '  kaya   TOAST ' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('name_taken');
  });

  it('refuses an empty or blocked name', async () => {
    expect((await call('claim-name', { device_id: device(), nickname: '   ' })).body.error).toBe('bad_name');
    expect((await call('claim-name', { device_id: device(), nickname: 'big F u c k' })).body.error).toBe('bad_name');
  });

  it('lets only one of many parallel claims win a name', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => call('claim-name', { device_id: device(), nickname: 'Race Name' })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.body.error === 'name_taken')).toHaveLength(19);
  });

  it('never renames a player when a run is submitted, and keeps scores on one account', async () => {
    const d = device();
    await call('claim-name', { device_id: d, nickname: 'First Name' });
    const r1 = await call('submit-run', run({ device_id: d, nickname: 'Hacker Rename', score: 1000 }));
    expect(r1.status).toBe(200);
    expect(r1.body.nickname).toBe('First Name');
    await pool.query(`update runs set created_at = now() - interval '11 seconds'`);
    const r2 = await call('submit-run', run({ device_id: d, score: 2000 }));
    expect(r2.body).toMatchObject({ total_players: 1, rank: 1 });
    expect((await pool.query('select count(*)::int as n from players')).rows[0].n).toBe(1);
    const lb = await call('leaderboard', undefined, { query: '?limit=5' });
    expect(lb.body.top).toHaveLength(1);
    expect(lb.body.top[0]).toMatchObject({ nickname: 'First Name', score: 2000 });
  });

  it('returns name_taken from submit-run for a new device using a taken name', async () => {
    await call('claim-name', { device_id: device(), nickname: 'Taken Name' });
    const r = await call('submit-run', run({ nickname: 'taken name' }));
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('name_taken');
  });
});

