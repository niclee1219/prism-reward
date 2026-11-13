// Fires N concurrent run submissions (default 200) and checks that every one succeeds
// and that the leaderboard reflects them within 2 seconds.
//   Local:      scripts/local-db.sh start && npm run load-test
//   Real stack: API_BASE=https://xyz.supabase.co/functions/v1 ANON_KEY=... npm run load-test
// Note: against the real stack this leaves N test players behind. Run it before the event,
// then clear the tables (see README, "Reset before doors open").
import { randomUUID } from 'node:crypto';
import { startLocalBackend } from './local-backend.ts';

const N = Number(process.env.N ?? 200);
let base = process.env.API_BASE ?? '';
const anon = process.env.ANON_KEY ?? '';
let local: ReturnType<typeof startLocalBackend> | null = null;
if (!base) {
  local = startLocalBackend(8799, 'load-test');
  base = 'http://localhost:8799';
}
const headers: Record<string, string> = { 'content-type': 'application/json' };
if (anon) Object.assign(headers, { apikey: anon, authorization: `Bearer ${anon}` });

const before = (await (await fetch(`${base}/leaderboard?limit=1`, { headers })).json()) as { total_players: number };
const started = Date.now();
const results = await Promise.all(
  Array.from({ length: N }, async (_, i) => {
    const t0 = Date.now();
    const res = await fetch(`${base}/submit-run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        run_id: randomUUID(), device_id: `load-${randomUUID()}`, nickname: `Load ${i}`,
        score: i === 0 ? 20_000 : 500 + i, correct: 36, wrong: 0, gates: 36, duration_ms: 170_000,
      }),
    });
    return { status: res.status, ms: Date.now() - t0, body: await res.text() };
  }),
);
const elapsed = Date.now() - started;
const failed = results.filter((r) => r.status !== 200);
const times = results.map((r) => r.ms).sort((a, b) => a - b);

// How long until the board shows all of them?
let boardMs = -1;
const t1 = Date.now();
while (Date.now() - t1 < 5000) {
  const lb = (await (await fetch(`${base}/leaderboard?limit=10`, { headers })).json()) as { total_players: number; top: { score: number }[] };
  if (lb.total_players >= before.total_players + N - failed.length) {
    boardMs = Date.now() - started;
    break;
  }
  await new Promise((r) => setTimeout(r, 100));
}

console.log(`${N} concurrent submissions: ${N - failed.length} ok, ${failed.length} failed, all done in ${elapsed} ms`);
console.log(`latency p50 ${times[Math.floor(N / 2)]} ms, p95 ${times[Math.floor(N * 0.95)]} ms, max ${times[N - 1]} ms`);
console.log(boardMs >= 0 ? `leaderboard showed every run ${boardMs} ms after the burst started` : 'leaderboard did NOT catch up within 5 s');
if (failed.length) console.log('first failure:', failed[0].status, failed[0].body);
local?.server.close();
await local?.pool.end();
process.exit(failed.length === 0 && boardMs >= 0 && boardMs <= elapsed + 2000 ? 0 : 1);
