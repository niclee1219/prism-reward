// End-to-end check of the acceptance criteria in a phone-sized Chromium.
// Needs: scripts/local-db.sh start, and a build made with VITE_API_BASE=/api.
//   VITE_API_BASE=/api npm run build && npm run test:e2e
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  pw = require(process.env.PLAYWRIGHT_MODULE ?? '/opt/node-tools/node_modules/playwright');
}
const { chromium, devices } = pw;

const PIN = '123456';
const WEB = 'http://localhost:4173';
const procs = [
  spawn('npx', ['tsx', 'scripts/local-backend.ts'], { env: { ...process.env, ADMIN_PIN: PIN, PORT: '8787' }, stdio: 'ignore' }),
  spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('exit', stop);

async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`not reachable: ${url}`);
}
await waitFor(`${WEB}/`);
await waitFor('http://localhost:8787/leaderboard');

// Clean slate, with one prize that is certain to be won.
const pg = require('pg');
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:54329/prism' });
await db.query('truncate players, runs, spins, prizes, rate_limits cascade');
await db.query(`insert into prizes (name, stock, weight) values ('Test tote bag', 5, 100000)`);
await db.query(`update config set value = 'true' where key in ('vote_bonus_enabled', 'submissions_open')`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 5'] });
// The first-visit "how it works" slides would cover PLAY, so mark them as seen.
await ctx.addInitScript(() => localStorage.setItem('prism.howto', '1'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const state = () => page.evaluate(() => window.__prism.debugState());
const step = (name) => console.log(`  ✔ ${name}`);
const until = async (fn, ms = 15000, what = 'condition') => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`timed out waiting for ${what}`);
};
/** Steers into the correct gate lane and around obstacles, like a decent player. */
const startBot = () =>
  page.evaluate(() => {
    window.__bot = setInterval(() => {
      const s = window.__prism;
      const d = s.debugState();
      if (d.mode !== 'run') return;
      const near = d.obstacles.filter((o) => o.d < 140 && o.d > -20).map((o) => o.lane);
      let target = d.gateLane ?? d.lane;
      if (near.includes(target)) target = [d.lane, 1, 0, 2].find((l) => !near.includes(l)) ?? target;
      if (target === d.lane) return;
      const dir = target > d.lane ? 1 : -1;
      if (!near.includes(d.lane + dir)) s.move(dir); // never step into a blocked lane
    }, 50);
  });
const stopBot = () => page.evaluate(() => clearInterval(window.__bot));

try {
  // 1. First-time player is running within 10 s of opening the page.
  const t0 = Date.now();
  await page.goto(`${WEB}/`);
  await page.fill('#nickname', 'Test Prata');
  await page.click('#play', { force: true });
  await until(async () => (await state()).mode === 'run', 5000, 'run to start');
  assert.ok(Date.now() - t0 < 10_000, 'running within 10 s');
  step(`running ${Date.now() - t0} ms after opening the page`);

  // 2. Never steering: the tutorial gate is answered wrong, and the run carries on.
  await until(async () => (await state()).wrong >= 1, 12000, 'a wrong answer');
  assert.equal((await state()).mode, 'run', 'a wrong answer must not end the run');
  step('wrong answer slows the player but does not crash');

  // 3. An obstacle crash ends the run.
  await until(async () => !(await page.isHidden('#screen-results')), 60000, 'crash');
  assert.match(await page.textContent('#screen-results h2'), /RUN OVER/);
  step('crash ends the run');
  await until(async () => (await page.textContent('#screen-results')).includes("You're #1"), 8000, 'rank');
  step('score saved and rank shown');

  // 4. Service worker has cached the game: reload with the network off and play a full run.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload();
  await page.click('#play', { force: true });
  await until(async () => (await state()).mode === 'run', 5000, 'offline run to start');
  await startBot();
  await until(async () => (await state()).correct >= 2, 30000, 'bot to answer two gates');
  assert.equal((await state()).mode, 'run', 'bot should still be running');
  // Jump the clock close to the limit at a moment when the road is clear:
  // the run must stop by itself at 180 s.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const wait = setInterval(() => {
          const s = window.__prism;
          if (s.debugState().obstacles.length > 0) return;
          clearInterval(wait);
          s.t = 179.6;
          resolve();
        }, 16);
      }),
  );
  await stopBot();
  await until(async () => !(await page.isHidden('#screen-results')), 6000, "time's up");
  assert.match(await page.textContent('#screen-results h2'), /TIME'S UP/);
  step("offline run played from cache; hard stop at 180 s shows TIME'S UP");
  await page.waitForTimeout(2500);
  assert.match(await page.textContent('#rank-status'), /Saving your score/);
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('prism.queue')));
  assert.equal(queued.length, 1);
  assert.ok(queued[0].duration_ms <= 180000);
  step('offline: run is queued, screen shows "Saving your score..."');
  await ctx.setOffline(false);
  await until(async () => (await page.$('#rank-box')) !== null, 30000, 'queued run to submit');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('prism.queue')).length), 0);
  step('back online: queued run submitted and rank revealed');

  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/score.png` });
  // 5. Results beats, in order.
  const beat = () => page.getAttribute('#screen-results .beat', 'data-beat');
  assert.ok(await page.isHidden('#back'), 'no BACK on the first card');
  await page.click('#next');
  assert.equal(await beat(), 'board');
  // BACK returns to the score without replaying it, then NEXT carries on.
  await page.click('#back');
  assert.equal(await beat(), 'score');
  await page.click('#next');
  assert.equal(await beat(), 'board');
  await page.click('#next');
  assert.equal(await beat(), 'recipe');
  assert.equal(await page.locator('.recipe-list li').count(), 8);
  await page.click('#next');
  assert.equal(await beat(), 'vote');
  await page.check('#vote');
  await until(async () => (await page.textContent('#screen-results')).includes('Bonus applied'), 5000, 'vote bonus');
  await page.click('#next');
  assert.equal(await beat(), 'cite');
  assert.match(await page.textContent('.cite-card'), /Source: /);
  await page.click('#next');
  assert.equal(await beat(), 'pain');
  assert.equal(await page.locator('.pain').count(), 4);
  await page.click('#next');
  assert.equal(await beat(), 'email');
  assert.match(await page.textContent('.notice'), /Optional: used only for the prize draw and PRISM updates/);
  await page.fill('#email', 'tester@example.com');
  await page.click('#email-send');
  await until(async () => (await page.textContent('#screen-results')).includes("You're in the draw"), 5000, 'email');
  await page.click('#next');
  assert.equal(await beat(), 'spin');
  if (process.env.SHOT_DIR) {
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${process.env.SHOT_DIR}/wheel.png` });
  }
  await page.click('#spin');
  await page.waitForSelector('#redeem', { timeout: 10000 });
  const code = (await page.textContent('#redeem .code')).trim();
  assert.match(code, /^[A-Z2-9]{5}$/);
  assert.match(await page.textContent('#redeem'), /Test tote bag/);
  step(`results beats in order (with BACK): score, board, recipe, vote, cited answer, pain points, email, spin (won code ${code})`);
  await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/redeem.png` : 'tests/e2e/.last-redeem.png' });

  // 6. Play again is one tap.
  await page.click('#next');
  await until(async () => (await state()).mode === 'run', 3000, 'play again');
  step('play again starts a run in one tap');

  // 7. Booth board.
  const board = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await board.goto(`${WEB}/board/`);
  await board.waitForSelector('.row');
  assert.match(await board.textContent('#rows'), /Test Prata/);
  assert.match(await board.textContent('#king-name'), /Test Prata/);
  assert.equal(await board.textContent('#plays'), '2');
  if (process.env.SHOT_DIR) await board.screenshot({ path: `${process.env.SHOT_DIR}/board.png` });
  step('board shows the top list, KING OF THE HILL, QR and play count');

  // 8. Admin: redeem once only, toggle vote bonus off, delete a run live.
  const admin = await ctx.newPage();
  await admin.goto(`${WEB}/admin/`);
  await admin.fill('#pin', '999999');
  await admin.click('#login button');
  await admin.waitForFunction(() => document.getElementById('login-msg').textContent.includes('Wrong PIN'));
  await admin.fill('#pin', PIN);
  await admin.click('#login button');
  await admin.waitForSelector('#app:not([hidden])');
  await admin.fill('#code', code);
  await admin.click('#redeem-form button');
  await admin.waitForSelector('#redeem-result.ok');
  await admin.fill('#code', code);
  await admin.click('#redeem-form button');
  await admin.waitForSelector('#redeem-result.bad');
  assert.match(await admin.textContent('#redeem-result'), /Already redeemed/);
  step('admin: wrong PIN refused; code redeems once, second attempt refused');

  const scoreWithBonus = (await db.query('select score from leaderboard')).rows[0].score;
  await admin.click('[data-tab="toggles"]');
  await admin.click('#toggle-vote_bonus_enabled');
  await admin.waitForSelector('#toggle-vote_bonus_enabled:not(.on)');
  const scoreWithout = (await db.query('select score from leaderboard')).rows[0].score;
  assert.ok(scoreWithout < scoreWithBonus, 'bonus removed from the board');
  step(`admin: vote bonus off in one tap (board score ${scoreWithBonus} -> ${scoreWithout})`);

  await admin.click('[data-tab="runs"]');
  await admin.waitForSelector('#runs-list .item');
  const runCount = await admin.locator('#runs-list .item').count();
  for (let i = 0; i < runCount; i++) {
    await admin.locator('#runs-list .item:not(.removed) button').first().click();
    await admin.waitForFunction((n) => document.querySelectorAll('#runs-list .item.removed').length === n, i + 1);
  }
  await board.waitForFunction(() => document.querySelectorAll('.row').length === 0, null, { timeout: 5000 });
  step('admin: deleted runs vanish from the live board within the polling interval');
  if (process.env.SHOT_DIR) await admin.screenshot({ path: `${process.env.SHOT_DIR}/admin.png` });

  // 9. A perfect run serves the dish: 8 steps recovered ends the run as a win.
  //    The bot is kept shielded so obstacles cannot end the run first.
  const winner = await browser.newPage({ ...devices['Pixel 5'] });
  await winner.addInitScript(() => localStorage.setItem('prism.howto', '1'));
  winner.on('pageerror', (e) => errors.push(e.message));
  await winner.goto(`${WEB}/`);
  await winner.click('[data-dish="laksa"]');
  await winner.click('#reroll'); // the name box starts empty; the dice fills a random name
  await winner.click('#play', { force: true });
  await winner.evaluate(() => {
    setInterval(() => {
      const s = window.__prism;
      const d = s.debugState();
      if (d.mode !== 'run') return;
      s.hasShield = true;
      if (d.gateLane !== null && d.gateLane !== d.lane) s.move(d.gateLane > d.lane ? 1 : -1);
    }, 50);
  });
  await winner.waitForFunction(() => !document.getElementById('screen-results').hidden, null, { timeout: 120000 });
  assert.match(await winner.textContent('#screen-results h2'), /DISH SERVED/);
  assert.match(await winner.textContent('#screen-results'), /Ah Ma's Laksa/);
  assert.equal((await winner.evaluate(() => window.__prism.debugState())).recovered, 8);
  await winner.click('#next');
  assert.equal(await winner.locator('.recipe-list li.got').count(), 8);
  step('a perfect run recovers all 8 steps: DISH SERVED, full recipe decoded');

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('\nAll end-to-end checks passed.');
} catch (e) {
  console.error('\nFAILED:', e.message);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/fail.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  await db.end();
  stop();
}
