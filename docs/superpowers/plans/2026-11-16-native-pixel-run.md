# Native Pixel-Art Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Three.js run with a top-down run drawn in code as pixel art, in the same hand as Learn mode.

**Architecture:** A new `src/game/pixel/` folder exposes a `World` class with the same public surface as
`src/game/three/World.ts`, so `src/main.ts` changes one import. `World` owns one small 2D canvas, steps the sim every
animation frame and draws it through five drawing modules (street, runner, props, effects, serve) that share one
`View` (pure layout maths) and one `Art` drawing surface. Task 1 builds the whole thing with placeholder boxes;
Tasks 2 to 5 each replace one module's body in parallel; Task 6 removes the 3D code.

**Tech Stack:** TypeScript, Vite, 2D canvas, Vitest. No new dependencies; `three` is removed.

**Spec:** `docs/superpowers/specs/2026-11-16-native-pixel-run-design.md` (read it first; it is the authority).

## Global Constraints

- Do not change `src/game/sim/RunSim.ts`, scoring, difficulty, `gateDirector`, input, questions, anything under
  `supabase/`, the results flow, Learn's behaviour, the forest or the skyline. `src/ui/hud.ts` logic stays.
- No image files. Sprites are `rect` calls in the style of `chef()` in `src/learn/art.ts`: `P.ink` outline, flat
  fills, one shade, one highlight, no gradients, no anti-aliasing, no rotating or scaling drawn art.
- Every draw position is a whole art pixel. The sim is stepped and the scene redrawn every animation frame.
- Hazards: cool, dark, angular, on a red pad (`#d7322b`) with a red-and-black (`#161622`) band. Rewards: warm, round,
  glinting. Scenery never enters the lanes.
- `reducedMotion` (from `src/game/perf.ts`): no shake, no flash, no intro hop.
- No per-frame allocation in draw paths; pooled particles with fixed caps.
- Do not touch or stage `.env.example`. Implementers do **not** run `git add` / `git commit`; the coordinator commits.
- `npm run build` and `npm test` are green at the end of every task.
- Looking at your work: Task 1 provides `npm run shot` (see its Interfaces). Use it; pixel art must be looked at.

## Review Focus

1. Very short or very tall stages (`VIEW.MIN_ASPECT` 1.55, `MAX_ASPECT` 2.25) and `?px=2..6`: the bottom question
   panel must never cover the beaver; nothing may be drawn from fractional positions. Test in Task 1 (`view` tests).
2. Resize or rotate mid-run: the view is rebuilt; no module may cache art coordinates across frames.
3. `world.reset()` in any state (mid-serve, mid-crash, particles alive): next run starts clean. Each module has a
   `reset()`; Task 1's World calls all of them.
4. `world.paused = true` then false after minutes (Learn): no giant `dt`, no burst of queued effects.
5. Low-effects mode tripping mid-run: decorative effects stop, gameplay sprites and the gate stay.

---

### Task 1: Base (view, world, placeholders, bottom question panel, screenshot tool)

**Files:**
- Create: `src/game/pixel/view.ts`, `types.ts`, `palette.ts`, `Overlay.ts`, `World.ts`, `Street.ts`, `Runner.ts`,
  `Props.ts`, `Fx.ts`, `Serve.ts` (all under `src/game/pixel/`)
- Create: `dev/sprites.html`, `src/game/pixel/devGallery.ts`, `scripts/shot.mjs`
- Modify: `src/main.ts` (import `World` from `./game/pixel/World`), `src/ui/styles.css` (question panel),
  `src/learn/art.ts` (only the *type* of the first parameter of `chef`, `ahMa` portrait and counter helpers: accept
  `Pick<PixelCanvas, 'rect'>` or whatever minimal shape they really use, so the game can call them), `package.json`
  (`"shot"` script)
- Test: `tests/unit/pixelView.test.ts`
- Leave `src/game/three/` in place and unused (Task 6 deletes it).

**Interfaces (produced; Tasks 2 to 5 rely on these exact names):**

```ts
// view.ts — pure, no DOM
export interface View {
  w: number; h: number;          // art size
  px: number;                    // CSS px per art pixel
  offX: number; offY: number;    // CSS px the canvas overhangs the stage's left / top edge
  roadX: number; laneW: number;  // left edge of lane 0 and lane width, art px (3 lanes = 80% of w, centred)
  playerY: number;               // art y of the beaver's feet (depth 0), about 62% down
  unitsPerPx: number;            // sim units per art pixel; WORLD.SPAWN_DIST maps to y <= -24
}
export function makeView(stageW: number, stageH: number, px: number): View;
export function laneX(v: View, lane: number): number;   // centre x of a (possibly fractional) lane, rounded
export function depthY(v: View, d: number): number;     // ground y at depth d, rounded; depthY(v, 0) === v.playerY
export function toStage(v: View, x: number, y: number): { x: number; y: number }; // art px -> stage CSS px

// types.ts
export interface Art {
  readonly ctx: CanvasRenderingContext2D;
  rect(x: number, y: number, w: number, h: number, color: string): void;   // rounds x, y
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void;
}
export interface Frame {
  art: Art; view: View; sim: RunSim;
  dt: number; time: number;      // seconds; time keeps running in every mode
  lowFx: boolean; reduced: boolean;
}

// palette.ts
export { P } from '../../learn/art';
export const LANE_COLOURS: [string, string, string]; // '#4cc9f0', '#b388ff', '#ffb703' (must equal --lane0..2 in styles.css)
export const HAZARD_RED = '#d7322b'; export const HAZARD_BLACK = '#161622';
export const TILE: { base: string; line: string; shade: string }; // from P.tile, P.tileLine, P.tileShade

// Street.ts
export class Street { reset(): void; draw(f: Frame): void; }   // fills the whole canvas: floor, lane dividers, side scenery; scrolls with f.sim.travelled

// Runner.ts
export class Runner {
  shieldOn: boolean;
  reset(): void;
  hop(strength: number): void;   // 0..1
  crash(): void;
  cheer(): void;
  update(dt: number, cadence: number, leanVel: number): void; // cadence ~0.4..3 run-cycle speed; leanVel in lanes/s
  draw(f: Frame, x: number, y: number): void;                 // x = centre, y = feet
}

// Props.ts
import type { ObstacleKind } from '../sim/RunSim';
export function drawObstacle(f: Frame, kind: ObstacleKind, x: number, y: number, id: number): void; // x centre, y ground
export function drawPickup(f: Frame, kind: 'coin' | 'tingkat', x: number, y: number, id: number): void;
export class GateSprite {
  constructor(hintLane: number | null);       // tutorial gate: the lane to highlight, else null
  resolve(chosen: number, correct: number, ok: boolean): void;
  update(dt: number): boolean;                // false once the resolve animation has finished (remove it)
  draw(f: Frame, y: number): void;            // y = ground y of the gate line; spans all three lanes
}

// Fx.ts — all coordinates art px
export class Fx {
  reset(): void;
  burst(x: number, y: number, colours: readonly string[], count: number, speed: number, life?: number): void;
  confetti(x: number, y: number, colours: readonly string[], count: number): void;
  ring(x: number, y: number, colour: string, size: number): void;
  fireTrail(x: number, y: number): void;      // call each frame while on a streak
  update(dt: number, scrollPx: number): void; // scrollPx = how far the ground moved down this frame
  draw(f: Frame): void;                       // particles, confetti, rings
  speedLines(f: Frame, amount: number): void; // 0..1, edge streaks
}

// Serve.ts
import type { Dish } from '../../content/dishes';
export const SERVE_T: { CUT: number; RAISE: 1.65; THROW: 2.5; LAND: 2.9 }; // CUT ~1.15: top-down dash before it, side view after
export class ServeScene {
  start(dish: Dish): void;
  stop(): void;
  update(f: Frame, st: number): boolean;        // st = seconds into the cutscene; true exactly once, at LAND
  draw(f: Frame, st: number): void;             // call only when st >= SERVE_T.CUT; draws the whole frame incl. the wipe
  dishPoint(v: View): { x: number; y: number }; // art px where the raised dish is (target of onPlating)
  tablePoint(v: View): { x: number; y: number };// art px of the table (landing effects)
}

// World.ts — identical public surface to src/game/three/World.ts
export interface WorldHooks { /* copy verbatim */ }
export class World { constructor(stage: HTMLElement, mount: HTMLElement, sim: RunSim, hooks: WorldHooks); paused: boolean; reset(): void; intro(go: () => void): void; }
```

Screenshot tool (produced):
- `npm run shot -- <urlPath> <out.png> [--w 390 --h 780] [--wait ms] [--eval "js"]` starts nothing itself; it expects
  `npx vite --port 5199 --strictPort` to be running (start it in the background, kill it when done; if the port is
  taken, another agent's server is already there, just use it). Loads Playwright from `node_modules`, else from
  `process.env.PLAYWRIGHT_MODULE`, else `/Users/nicholas/.npm/_npx/6bcb61ec6d5aea22/node_modules/playwright`.
  Sets `localStorage['prism.learn'] = '1'` and `['prism.howto'] = '1'` before load.
- `dev/sprites.html` + `devGallery.ts` (dev server only, not a build input): one big canvas at 6 CSS px per art
  pixel that draws, on a tiled-floor background, every obstacle kind, both pickups, the gate (idle, hint, resolved
  right, resolved wrong), every runner pose over a few `time` values, a strip of `Street`, and (query `?serve=<st>`)
  the serve scene at that time. `?t=<seconds>` freezes `time` for repeatable shots. It calls only the interfaces
  above, so it shows whatever the modules currently draw.
- `/?demo=1` on the game page (dev builds only, `import.meta.env.DEV`): starts a run immediately with a fixed
  nickname and no network, so `shot --eval` can drive `window.__prism` (e.g. set `t`, call `debugState()`).

- [ ] **Step 1: Write `tests/unit/pixelView.test.ts`** with these assertions, for stages 390x605, 390x780, 430x932
  and px 3, 4, 5:
  - `w === Math.ceil(stageW / px)`, `h === Math.ceil(stageH / px)`; `offX`, `offY` in `[0, px)`
  - `laneW * 3` is within 1 px of `0.8 * w` rounded, lanes centred: `Math.abs((roadX + 1.5 * laneW) - w / 2) <= 1`
  - `laneX(v, 1) - laneX(v, 0) === laneX(v, 2) - laneX(v, 1)` (within 1), all inside `[0, w)`
  - `depthY(v, 0) === v.playerY`; `depthY(v, WORLD.SPAWN_DIST) <= -24`; `depthY` strictly decreases as d grows by 10
  - `depthY(v, WORLD.DESPAWN_DIST) > v.playerY`
  - `Number.isInteger` for every `laneX` / `depthY` result
  - `toStage(v, x, y)` equals `{ x: x * px - offX, y: y * px - offY }`
  - the beaver's feet in CSS px (`toStage(v, 0, v.playerY).y`) are at least 200 CSS px above the stage bottom on the
    390x605 stage (room for the question panel)
- [ ] **Step 2:** Run `npx vitest run tests/unit/pixelView.test.ts`; expect failures (module missing).
- [ ] **Step 3: Implement `view.ts`, `types.ts`, `palette.ts`.** `playerY = round(h * 0.62)`, lowered or raised only
  as far as the 200 px rule needs. `unitsPerPx = WORLD.SPAWN_DIST / (playerY + 24)`.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5: `Overlay.ts`**: move the `Overlay` class (and its font-scale constant) from `src/game/three/Fx.ts`
  unchanged.
- [ ] **Step 6: Placeholder modules** with exactly the signatures above and the simplest visible bodies: `Street`
  fills `TILE.base` plus a scrolling grout grid and lane dividers; `Runner` a brown box with a red band;
  obstacles dark boxes on a red pad; coin a gold square; tingkat an orange box; `GateSprite` three bars in
  `LANE_COLOURS`; `Fx` square particles (real pooled implementation is fine here, Task 5 polishes); `ServeScene`
  a flat backdrop with the Learn `chef()` and a coloured dish box that follows the RAISE / THROW / LAND timings.
- [ ] **Step 7: `World.ts`.** Port `src/game/three/World.ts` behaviour, not its code:
  - Canvas sizing as its `resize()` (buffer = ceil(stage / px), CSS size = buffer * px, centred, `pix-crisp`),
    `px = ?px=N` or `VIEW.PIXEL_SIZE`. Rebuild the `View` on resize.
  - Loop with `requestAnimationFrame`; `paused` skips work and resets the clock; `dt = min(elapsed, 0.05)`;
    `perf.tick(dt)` trips `lowFx`.
  - Each frame: intro countdown, `sim.update(dt)`, then draw: `street.draw`; obstacles, pickups, gate and runner
    in far-to-near order (`depthY`), obstacles and pickups skipped while serving; `fx.draw`; `fx.speedLines`.
    From `SERVE_T.CUT` the serve scene draws the frame instead. Screen shake offsets the whole draw by whole pixels.
  - Magnet: coins with `sim.magnetPulls(p)` are drawn drifting toward the runner (as `syncPickups` does today).
  - Runner cadence and `shieldOn`: same formulas as `World.frame` lines 249 to 259 today.
  - Event switch: every case of today's `onEvent` (lines 455 to 552) and `startServe`, `updateServe`,
    `dishLanded`, `intro` / `updateIntro` with the **same** pop-up texts, colours, sizes, CSS classes, haptics,
    banner and hook calls. 3D effects map to: `sparks.emit` -> `fx.burst`, `confetti.emit` -> `fx.confetti`,
    `rings.fire` -> `fx.ring`, `fovPunch` -> dropped, `overlay.*` unchanged. Hook coordinates go through `toStage`.
  - `reset()` calls every module's `reset()` / `stop()` and `overlay.clear()`.
- [ ] **Step 8: Question panel to the bottom** in `src/ui/styles.css`: `.qpanel` is absolutely positioned at the
  bottom of `#hud` (above `env(safe-area-inset-bottom)`), answer cards first then the question text below them (CSS
  `order` or `flex-direction: column-reverse`, no change to `hud.ts`), `.q-card::after` arrow moved to the top edge
  and flipped to point up, the drop-in animation rises from below. Check `.tutorial`, `.hint`, `.right`, `.wrong`,
  `.done` still read correctly.
- [ ] **Step 9: Dev gallery, `?demo=1`, `scripts/shot.mjs`, `"shot"` npm script.**
- [ ] **Step 10: Verify.** `npm run build && npm test` green. Take shots of `/dev/sprites.html` and of a `?demo=1`
  run at 390x605 and 390x844 with a question showing; look at them: lanes line up with the answer cards, the panel
  does not touch the beaver, boxes scroll, pop-ups appear. Report the shot paths.

### Tasks 2 to 5 run in parallel. Each edits **only its own file** (plus nothing else), keeps the exported
signatures exactly, and checks its work with `npm run shot` on `/dev/sprites.html?t=...` and `/?demo=1`.

### Task 2: Street

**Files:** Modify `src/game/pixel/Street.ts` only.

- [ ] Floor: `TILE` colours, grout grid every ~8 art px scrolling with `sim.travelled / view.unitsPerPx`, subtle
  per-tile shade variation from `hash()`, faint dashed lane dividers, rare harmless floor details (drain cover,
  yellow tray-return arrow) that cannot be read as hazards (no red, no dark blocks).
- [ ] Side strips (`0..roadX` and `roadX + 3 * laneW..w`, about 10 px each): a kerb line, then scenery chosen per
  row-cell with `hash(cell, side)` from a small set: stall counter edge with awning stripe and sign corner, round
  table with stools, a seated diner (head, shoulders, bowl), potted plant, tray-return rack, standing fan. Objects
  are clipped by the screen edge and never cross into the lanes. Deterministic: the same `travelled` always draws
  the same street.
- [ ] Ambient life at ~6 fps from `f.time` (steam wisps, a diner's arm, fan blades); skipped when `f.lowFx` or
  `f.reduced`.
- [ ] No allocation per frame; draw only rows on screen. Verify with shots at two `travelled` values and a build.

### Task 3: Runner

**Files:** Modify `src/game/pixel/Runner.ts` only.

- [ ] Beaver from behind, about 16 x 20: round body in `P.fur` with `P.furDark` shade, ears, red headband knot
  (`P.red`), cream apron strings and bow across the back, big cross-hatched paddle tail (as the forest and Learn
  beavers), feet. `P.ink` outline. A soft dark ellipse shadow on the floor.
- [ ] 4-frame run cycle (feet alternate, tail sways, 1 px body bob) advanced by `cadence`; a lean frame when
  `|leanVel|` is high (body shifts 1 px, tail swings the other way); `hop(strength)` lifts the sprite up to ~5 px
  and shrinks the shadow; `crash()` plays a tumble (3 or 4 frames, stars or dizzy marks) and holds the last frame;
  `cheer()` arms up, bouncing, until `reset()`.
- [ ] `shieldOn`: a light-blue (`#8ecae6`) dotted bubble outline around the beaver with a moving glint.
- [ ] Verify every pose in the gallery at several `t` values; build passes.

### Task 4: Props

**Files:** Modify `src/game/pixel/Props.ts` only.

- [ ] Obstacles, each on the red pad with the hazard band at its base, cool dark palette, up to 22 px wide:
  `stools` (wobbly stack of slate stools), `trolley` (steel frame, stacked trays, a bowl), `wetfloor` (yellow is
  not allowed to dominate: dark A-frame sign with a small caution mark), `uncle` (a person in navy and grey
  carrying a tray, seen from the tilted top view), `cat` (dark grey cat, tail flicking by `f.time`). Small idle
  animation is welcome; `id` seeds per-instance variation.
- [ ] Pickups: `coin` 7 px, 4-frame spin from `f.time + id`, gold with a white glint, tiny shadow; `tingkat`
  about 10 x 13 stacked tiffin carrier in warm colours, bobbing 1 px with a sparkle.
- [ ] `GateSprite`: three arches, one per lane, in `LANE_COLOURS`, each `laneW` wide, posts with ink outline and a
  banner bar, readable from the top of the screen; `hintLane` arch pulses (tutorial). `resolve`: correct arch
  flashes green (`#52e08a`) and stays a moment, the others drop away; a wrong pick flashes red (`#e63946`);
  `update` returns false after about 0.6 s.
- [ ] Verify in the gallery (all kinds, all gate states) and in a `?demo=1` run; build passes.

### Task 5: Effects and serve scene

**Files:** Modify `src/game/pixel/Fx.ts` and `src/game/pixel/Serve.ts` only.

- [ ] `Fx`: fixed pools (about 300 particles, 200 confetti, 8 rings). Particles are 1 or 2 px squares with gravity
  and fade by shrinking / dropping out (no alpha gradients); confetti are 2 px squares that flutter (alternate
  width) and fall; rings are 1 px pixel circles that expand to `size * ~4` px; everything moves down with
  `scrollPx` so effects stay stuck to the floor. `fireTrail`: orange / gold / red squares behind the runner.
  `speedLines`: short vertical streaks near the left and right edges, count and length scaled by `amount`.
- [ ] `ServeScene` (side view, drawn full-frame from `SERVE_T.CUT`): a quick pixel wipe in (a few frames of
  horizontal bars or an iris), Ah Ma's stall as in Learn (tiled wall, wooden counter, sign; reuse helpers and
  colours from `src/learn/art.ts`), the `chef()` beaver at the counter facing right, a table to the right with Ah Ma
  (beaver, reuse her Learn portrait colours) and one or two human customers. Before RAISE the chef holds the dish
  low; at RAISE lifts it overhead (`arm: 'up'`) at `dishPoint`; from THROW to LAND the dish travels in an arc to
  `tablePoint`; `update` returns true once at LAND; after LAND customers bounce / cheer. The dish is a plate with
  food in `dish.colour`. Layout derives from `view.w` / `view.h` every frame.
- [ ] Verify with `/dev/sprites.html?serve=1.3`, `1.8`, `2.7`, `3.5` and a served run; build passes.

### Task 6: Remove 3D, clean up, verify

**Files:** Delete `src/game/three/`. Modify `package.json` / `package-lock.json` (remove `three`, `@types/three`),
`vite.config.ts` (drop `chunkSizeWarningLimit` if the build has no warning without it), `src/config.ts`
(`VIEW.PIXEL_SIZE` comment now describes the drawn run; remove `WORLD.M_PER_UNIT` and `LANE_M` if unused),
`src/ui/styles.css` (rules only the 3D canvas needed), `README.md` (story of the run, pixel size, folder list,
any Three.js mention), `tests/e2e/smoke.mjs` only if it references anything removed.

- [ ] `grep -ri "three" src tests README.md vite.config.ts package.json` shows no Three.js reference.
- [ ] `npm run build && npm test` green; note the main bundle size before and after.
- [ ] Shots at 390x605, 390x780, 430x932: start screen, mid-run with a question, a power-up, crash, served ending.
- [ ] Performance: in headless Chromium with 4x CPU throttling (CDP `Emulation.setCPUThrottlingRate`), run
  `?demo=1` for 30 s and confirm low-effects mode does not trip (expose nothing new; read it from a `console.debug`
  the World emits once when it trips).
- [ ] Review Focus items 2 to 5 exercised by hand (resize mid-run, reset mid-serve, pause / resume, forced lowFx).

### Task 7: Ship (coordinator)

- [ ] Whole-change review, fix findings.
- [ ] Commit (never `.env.example`), push the current branch.
- [ ] Build with `.env.local` values and upload `dist/` to the Cloudflare Pages project `prism-run`
  (production branch `main`) with the Cloudflare MCP tools; confirm the live site serves the new build.
