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
  run_id: randomUUID(), device_id: device(), nickname: 'Kopi Peng',
  score: 1500, correct: 6, wrong: 2, gates: 8, duration_ms: 60_000, ...over,
});

beforeAll(() => {
  pool = new pg.Pool({ connectionString: LOCAL_DB, max: 60 });
  deps = makeDeps(pool, PIN);
});
afterAll(() => pool.end());
beforeEach(async () => {
  await pool.query('truncate players, runs, spins, prizes, rate_limits cascade');
  await pool.query(`update config set value = 'true' where key in ('vote_bonus_enabled', 'submissions_open')`);
  await pool.query(`update config set value = '1.1' where key = 'vote_bonus_multiplier'`);
  await pool.query(`update config set value = '60' where key = 'fallback_weight'`);
  await pool.query(`insert into prizes (name, stock, weight) values ('Tote bag', 3, 10), ('Kopi voucher', 5, 10)`);
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
    expect(c.body.wheel).toEqual(['Kopi voucher', 'Tote bag', 'Better luck next time + sticker']);
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

describe('spin', () => {
  it('is decided by the server, once per run, and only for the owning device', async () => {
    const r = run();
    await call('submit-run', r);
    expect((await call('spin', { run_id: r.run_id, device_id: device() })).status).toBe(404);
    const s1 = await call('spin', { run_id: r.run_id, device_id: r.device_id });
    expect(s1.status).toBe(200);
    expect(s1.body.code).toMatch(/^[A-HJKMNP-Z2-9]{5}$/);
    expect(s1.body.segments[s1.body.index]).toBe(s1.body.prize_name);
    const s2 = await call('spin', { run_id: r.run_id, device_id: r.device_id });
    expect(s2.body.code).toBe(s1.body.code);
    expect(s2.body.segments[s2.body.index]).toBe(s1.body.prize_name);
    expect((await pool.query('select count(*)::int as n from spins')).rows[0].n).toBe(1);
  });

  it('never drives stock below zero under 50 parallel spins', async () => {
    await pool.query(`update config set value = '1' where key = 'fallback_weight'`);
    await pool.query(`update prizes set weight = 1000`); // nearly every spin wants a prize: 8 in stock
    const runs = Array.from({ length: 50 }, () => run());
    await Promise.all(runs.map((r) => call('submit-run', r)));
    const spins = await Promise.all(runs.map((r) => call('spin', { run_id: r.run_id, device_id: r.device_id })));
    expect(spins.every((s) => s.status === 200)).toBe(true);
    const won = spins.filter((s) => s.body.prize_id).length;
    expect(won).toBe(8);
    const stock = await pool.query('select min(stock)::int as lo, sum(stock)::int as left from prizes');
    expect(stock.rows[0]).toEqual({ lo: 0, left: 0 });
    expect(new Set(spins.map((s) => s.body.code)).size).toBe(50);
    // With everything out of stock, the wheel is just the fallback segment.
    const r = run();
    await call('submit-run', r);
    const last = await call('spin', { run_id: r.run_id, device_id: r.device_id });
    expect(last.body).toMatchObject({ prize_id: null, segments: ['Better luck next time + sticker'], index: 0 });
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

  it('redeems a code only once, even when two staff tap at the same time', async () => {
    const r = run();
    await call('submit-run', r);
    const spin = await call('spin', { run_id: r.run_id, device_id: r.device_id });
    const [a, b] = await Promise.all([
      admin('redeem', { code: spin.body.code.toLowerCase() }),
      admin('redeem', { code: spin.body.code }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await admin('redeem', { code: spin.body.code })).body.error).toBe('already_redeemed');
    expect((await admin('redeem', { code: 'ZZZZZ' })).status).toBe(404);
    expect((await call('spin', { run_id: r.run_id, device_id: r.device_id })).body.redeemed).toBe(true);
  });

  it('edits prize stock, exports emails and reports stats', async () => {
    const prizes = await admin('prizes');
    const tote = prizes.body.find((p: any) => p.name === 'Tote bag');
    expect((await admin('set-prize', { id: tote.id, stock: 0 })).body.ok).toBe(true);
    expect((await admin('set-prize', { id: tote.id, stock: -1 })).status).toBe(400);
    const r = run();
    const sub = await call('submit-run', r);
    expect(sub.body.wheel).toEqual(['Kopi voucher', 'Better luck next time + sticker']);

    expect((await call('email', { device_id: r.device_id, email: 'not-an-email' })).status).toBe(400);
    expect((await call('email', { device_id: device(), email: 'a@b.sg' })).status).toBe(404);
    expect((await call('email', { device_id: r.device_id, email: 'a@b.sg', consent: true })).body.ok).toBe(true);
    expect((await admin('export-emails')).body).toEqual([{ nickname: 'Kopi Peng', email: 'a@b.sg', updates_consent: true }]);
    expect((await admin('stats')).body).toMatchObject({ players: 1, valid_runs: 1, emails: 1 });
  });
});
