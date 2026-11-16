// Screenshot a page of the running dev server, for looking at the pixel art.
//
//   npm run shot -- <urlPath> <out.png> [--w 390] [--h 780] [--full] [--wait ms] [--eval "js"] ...
//
// It never starts or stops the dev server: run `npx vite --port 5199 --strictPort` first (if the port is taken,
// someone else's server is already there; just use it). SHOT_BASE overrides http://localhost:5199.
// --wait and --eval run in the order given, after the page loads (no steps: wait 600 ms). An --eval is an
// expression (its JSON result is printed) or a block of statements (use `return` to print something); it may await.
// --full captures the whole page, not just the viewport (the sprite gallery is taller than a phone).
// Learn and the controls slides are marked as seen, so the game page opens on PLAY (or straight into a run with
// /?demo=1). Every call launches its own browser and writes only <out.png>, so several can run at once.
//
// Examples:
//   npm run shot -- '/dev/sprites.html?t=1.2' shots/gallery.png --w 1300 --h 900 --full
//   npm run shot -- '/?demo=1' shots/demo.png --w 390 --h 605 --wait 3000 --eval "window.__prism.debugState()"
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const FALLBACK = '/Users/nicholas/.npm/_npx/6bcb61ec6d5aea22/node_modules/playwright';
const BASE = process.env.SHOT_BASE ?? 'http://localhost:5199';
const AsyncFunction = (async () => {}).constructor;

function usage(msg) {
  if (msg) console.error(`shot: ${msg}`);
  console.error('usage: npm run shot -- <urlPath> <out.png> [--w 390] [--h 780] [--full] [--wait ms] [--eval "js"] ...');
  process.exit(2);
}

const args = process.argv.slice(2);
const positional = [];
const steps = [];
let w = 390;
let h = 780;
let full = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => {
    if (i + 1 >= args.length) usage(`${a} needs a value`);
    return args[++i];
  };
  if (a === '--w') w = Number(next());
  else if (a === '--h') h = Number(next());
  else if (a === '--full') full = true;
  else if (a === '--wait') steps.push({ wait: Number(next()) });
  else if (a === '--eval') steps.push({ eval: next() });
  else if (a.startsWith('--')) usage(`unknown option ${a}`);
  else positional.push(a);
}
if (positional.length !== 2) usage('need <urlPath> and <out.png>');
if (!(w > 0 && h > 0)) usage('--w and --h must be positive numbers');
if (!steps.length) steps.push({ wait: 600 });
const [urlPath, outArg] = positional;
const out = resolve(outArg);
const url = new URL(urlPath, BASE).href;

function loadPlaywright() {
  const tried = [];
  for (const id of ['playwright', process.env.PLAYWRIGHT_MODULE, FALLBACK]) {
    if (!id) continue;
    try {
      return require(id);
    } catch (e) {
      tried.push(`${id} (${e.code ?? e.message})`);
    }
  }
  console.error(`shot: cannot load Playwright. Tried:\n  ${tried.join('\n  ')}\nSet PLAYWRIGHT_MODULE to a playwright package folder.`);
  process.exit(1);
}

try {
  await fetch(BASE, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`shot: no dev server at ${BASE}. Start one with: npx vite --port 5199 --strictPort`);
  process.exit(1);
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
let failed = false;
try {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('prism.learn', '1');
      localStorage.setItem('prism.howto', '1');
    } catch {
      // storage blocked: the page still loads, Learn may show
    }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    failed = true;
    console.error(`page error: ${e.message}`);
  });
  page.on('console', (m) => {
    // Chrome blocks vibration until a real tap; the game's haptics hit that on every run, so it is just noise here.
    if (m.type() === 'error' && !m.text().includes('navigator.vibrate')) console.error(`console error: ${m.text()}`);
  });
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  for (const s of steps) {
    if (s.wait !== undefined) await page.waitForTimeout(s.wait);
    else {
      let result;
      try {
        // An expression first; if it does not parse as one, run it as a function body.
        new AsyncFunction(`return (${s.eval});`);
        result = await page.evaluate(`(async () => (${s.eval}))()`);
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
        result = await page.evaluate(`(async () => { ${s.eval} })()`);
      }
      if (result !== undefined) console.log(JSON.stringify(result));
    }
  }
  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: full });
  console.log(`shot: ${url} -> ${out} (${w}x${h}${full ? ', full page' : ''})`);
} finally {
  await browser.close();
}
if (failed) process.exitCode = 1;
