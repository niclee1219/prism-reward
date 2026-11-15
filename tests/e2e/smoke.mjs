// End-to-end check of the acceptance criteria in a phone-sized Chromium.
// Needs: scripts/local-db.sh start, and a build made with VITE_API_BASE=/api.
//   VITE_API_BASE=/api npm run build && npm run test:e2e
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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

// Clean slate.
const pg = require('pg');
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:54329/prism' });
await db.query('truncate players, runs, draw_entries, reactions, rate_limits cascade');
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
  assert.match(await page.textContent('#screen-results'), /win a \$10 Starbucks gift card/);
  assert.match(await page.textContent('.notice'), /Only @iras\.gov\.sg emails/);
  // The big /leaderboard screen is already open, so it will see the reactions sent below.
  const lb = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const firstPoll = lb.waitForResponse((r) => r.url().includes('/reactions?since=-1'));
  await lb.goto(`${WEB}/leaderboard/`);
  await firstPoll; // the screen has learned the newest reaction id, so it only shows what comes next
  await page.fill('#email', 'tester@gmail.com');
  await page.click('#email-send');
  await until(async () => (await page.textContent('#screen-results .msg')).includes('@iras.gov.sg'), 5000, 'non-IRAS email refused');
  assert.equal(await beat(), 'email');
  await page.fill('#email', 'Tester@IRAS.gov.sg');
  await page.fill('#feedback', 'PRISM could help my team find the right section fast.');
  await page.click('#email-send');
  await until(async () => (await beat()) === 'thanks', 5000, 'thank-you after entering');
  const entry = (await db.query('select email, message from draw_entries')).rows;
  assert.deepEqual(entry, [{ email: 'tester@iras.gov.sg', message: 'PRISM could help my team find the right section fast.' }]);
  step('email card: non-IRAS refused, IRAS email + feedback saved, lands on the thank-you screen');

  // 5b. Thank-you: beaver, confetti button, emoji reactions that reach the big screen.
  await page.waitForSelector('.beaver-stage canvas, .beaver-fallback');
  assert.equal(await page.textContent('#next'), 'PLAY AGAIN');
  // The big screen polls every second; it must receive the emoji the phone sends.
  const seenOnBoard = lb.waitForResponse(async (r) => r.url().includes('/reactions?since=') && !r.url().includes('since=-1') && (await r.json()).items?.some((i) => i.kind === 'fire'), { timeout: 8000 });
  await page.click('#confetti-btn');
  await page.waitForSelector('canvas.confetti');
  await page.waitForTimeout(800); // the phone throttles sends a little
  await page.click('.react-btn[data-kind="fire"]');
  await page.waitForSelector('.floaty');
  await seenOnBoard;
  const kinds = (await db.query('select kind from reactions order by id')).rows.map((r) => r.kind);
  assert.deepEqual(kinds, ['confetti', 'fire']);
  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/thanks.png` });
    await lb.screenshot({ path: `${process.env.SHOT_DIR}/leaderboard-reactions.png` });
  }
  step('thank-you: beaver shown, confetti + emoji reach the /leaderboard screen');
  await lb.close();

  step(`results beats in order (with BACK): score, board, recipe, vote, cited answer, pain points, email, thanks`);

  // 6b. Play again goes home (it does not start a run) and ticks the dish.
  await page.click('#next');
  await page.waitForSelector('#screen-start:not([hidden])');
  assert.notEqual((await state()).mode, 'run', 'play again must not start a run');
  assert.ok(await page.isHidden('#screen-results'));
  assert.ok(await page.locator('.dish-done:not([hidden])').count() >= 1, 'finished dish is ticked');
  step('play again returns to the home screen with the finished dish ticked');

  // 7. Booth board.
  const board = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await board.goto(`${WEB}/board/`);
  await board.waitForSelector('.row');
  assert.match(await board.textContent('#rows'), /Test Prata/);
  assert.match(await board.textContent('#king-name'), /Test Prata/);
  assert.equal(await board.textContent('#plays'), '2');
  if (process.env.SHOT_DIR) await board.screenshot({ path: `${process.env.SHOT_DIR}/board.png` });
  step('board shows the top list, KING OF THE HILL, QR and play count');

  // 8. Admin: toggle vote bonus off, delete a run live, export the draw.
  const admin = await ctx.newPage();
  await admin.goto(`${WEB}/admin/`);
  await admin.fill('#pin', '999999');
  await admin.click('#login button');
  await admin.waitForFunction(() => document.getElementById('login-msg').textContent.includes('Wrong PIN'));
  await admin.fill('#pin', PIN);
  await admin.click('#login button');
  await admin.waitForSelector('#app:not([hidden])');
  assert.equal(await admin.locator('#tabs button').count(), 4);
  assert.equal(await admin.locator('[data-tab="redeem"], [data-tab="prizes"]').count(), 0);
  step('admin: wrong PIN refused; only Runs, Toggles, Export and Event remain');

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
  await admin.click('[data-tab="export"]');
  await admin.waitForSelector('#stats div');
  const [dl] = await Promise.all([admin.waitForEvent('download'), admin.click('#export-entries')]);
  const csv = await readFile(await dl.path(), 'utf8');
  assert.match(csv, /tester@iras\.gov\.sg/);
  assert.match(csv, /PRISM could help my team/);
  step('admin: lucky draw entries export as CSV');
  if (process.env.SHOT_DIR) await admin.screenshot({ path: `${process.env.SHOT_DIR}/admin.png` });

  // 8b. Close the site: players see the beaver forest and cannot play. Then reopen.
  await admin.click('[data-tab="event"]');
  await admin.waitForFunction(() => document.getElementById('site-state').textContent.includes('OPEN'));
  await admin.click('#site-toggle');
  assert.ok(await admin.isVisible('#modal'), 'closing asks first');
  await admin.click('#modal-cancel');
  assert.ok(await admin.isHidden('#modal'));
  assert.match(await admin.textContent('#site-state'), /OPEN/, 'cancel leaves the site open');
  await admin.click('#site-toggle');
  await admin.click('#modal-ok');
  await admin.waitForFunction(() => document.getElementById('site-state').textContent.includes('CLOSED'));
  const visitor = await browser.newPage({ ...devices['Pixel 5'] });
  visitor.on('pageerror', (e) => errors.push(e.message));
  await visitor.addInitScript(() => localStorage.setItem('prism.howto', '1'));
  await visitor.goto(`${WEB}/`);
  await visitor.waitForSelector('#screen-closed:not([hidden]) canvas.forest');
  assert.match(await visitor.textContent('#screen-closed'), /WE'RE CLOSED/);
  await visitor.waitForTimeout(1500); // let the beavers move
  if (process.env.SHOT_DIR) await visitor.screenshot({ path: `${process.env.SHOT_DIR}/closed.png` });
  assert.notEqual((await visitor.evaluate(() => window.__prism.debugState())).mode, 'run');
  await visitor.click('#play', { force: true }).catch(() => {});
  assert.notEqual((await visitor.evaluate(() => window.__prism.debugState())).mode, 'run', 'cannot play while closed');
  step('admin: closing the site shows the beaver forest and blocks play');
  // Reopen: the open page notices within its polling interval (shortened here by a visibility refresh).
  await admin.click('#site-toggle'); // reopen needs no warning
  await admin.waitForFunction(() => document.getElementById('site-state').textContent.includes('OPEN'));
  await visitor.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await visitor.waitForSelector('#screen-closed', { state: 'hidden', timeout: 5000 });
  step('admin: reopening lets players back in without a reload');
  await visitor.close();

  // 8c. Reset all data: warning, must type RESET, cancel keeps everything.
  await admin.click('#reset-open');
  await admin.waitForSelector('#modal:not([hidden])');
  assert.match(await admin.textContent('#modal'), /PERMANENTLY deletes/);
  assert.ok(await admin.isDisabled('#modal-ok'), 'delete is disabled until RESET is typed');
  await admin.fill('#modal-input', 'reset please');
  assert.ok(await admin.isDisabled('#modal-ok'));
  await admin.click('#modal-cancel');
  assert.ok((await db.query('select count(*)::int n from players')).rows[0].n > 0, 'cancel deletes nothing');
  await admin.click('#reset-open');
  await admin.fill('#modal-input', 'RESET');
  await admin.click('#modal-ok');
  await admin.waitForFunction(() => document.getElementById('reset-msg').textContent.startsWith('Done.'));
  for (const t of ['players', 'runs', 'draw_entries', 'reactions']) {
    assert.equal((await db.query(`select count(*)::int n from ${t}`)).rows[0].n, 0, t);
  }
  step('admin: reset needs a warning and the word RESET; it then deletes all data');

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
  await winner.click('#next'); // leaderboard card
  await winner.click('#next'); // recipe card
  assert.equal(await winner.getAttribute('#screen-results .beat', 'data-beat'), 'recipe');
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
