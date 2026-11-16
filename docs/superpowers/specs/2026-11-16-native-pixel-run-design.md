# PRISM Run: native pixel-art run

Date: 2026-11-16. Status: approved by the owner on 2026-11-16.

## Intent

Learn mode, the forest and the big-screen skyline are hand-drawn pixel art: every sprite is built from filled
rectangles on a tiny canvas (`src/scene/pixelCanvas.ts`). The run itself is still a 3D scene rendered small and scaled
up, so it reads as blurry 3D and not as the same world. The owner wants the run to look like it belongs with Learn:
real ("native") pixel art, in the same hand, palette and grain.

This supersedes decision 1 of `2026-11-15-pixel-rework-design.md` ("keep the 3D runner, no 2D rewrite").

## Decisions made by the owner

1. **Native pixel art.** The run is drawn in code on a small canvas like Learn. No 3D engine look.
2. **Viewpoint: top-down.** The street scrolls down the screen, three lanes run straight up, the beaver sits near the
   bottom.
3. **Setting: daytime hawker centre in Learn's stall palette** (pale green tiles, warm wood, cream paper, the same
   beaver colours as `src/learn/art.ts`).
4. **Approach A:** a new hand-drawn renderer replaces the 3D one. The 3D code and the Three.js dependency are removed.
   No hidden fallback switch.
5. **Build with parallel subagents.** When finished: commit to the current branch, push, and deploy using the MCP
   tools. The live site is the Cloudflare Pages project `prism-run` (direct upload, production branch `main`, not
   connected to GitHub), so the built `dist/` is uploaded to it.
6. **The question panel moves to the bottom of the screen**, under the beaver. The answer cards sit directly below
   the three lanes with their arrows pointing up at them. Score, chips, recipe slots and the progress bar stay at the
   top. This keeps the street above the beaver clear at all times.

## Calls made by the planner (owner saw these and did not object)

- Lanes take 80% of the stage width, exactly under/over the answer cards (`.q-answers` has 10% side margins). The
  scenery strips are therefore thin (about 10 art pixels each side): stalls, tables and customers poke in from the
  edges and are never shown whole.
- Ah Ma is a beaver (her Learn portrait in `src/learn/art.ts`). Customers, seated diners and the uncle obstacle are
  people, drawn with Learn's skin and sleeve colours.
- "Not slower than today" is judged in a desktop browser with CPU throttling, old build against new; the pass mark is
  `PerfMonitor` not tripping during a full run.
- The view is tilted slightly (classic top-down adventure game), so the beaver is seen from behind (paddle tail, ears,
  red headband, apron strings) and stalls show their fronts.
- Grain: `VIEW.PIXEL_SIZE` (4 CSS px per art pixel, the forest's grain) and the `?px=N` override stay.
- Obstacles stay cool, dark and angular on a red warning pad with a red-and-black band; collectibles stay warm, round
  and glinting. One glance must tell hazard from reward.
- Effects become pixel versions (sparkle bursts, confetti squares, expanding pixel rings, screen shake, speed lines at
  the screen edges, fire trail on a streak).
- The three camera moments are replaced:
  - **Start screen:** the beaver idles on the street, which scrolls gently behind the PLAY button.
  - **Run intro:** the beaver hops into place under READY / SET / GO (same timings and pop-up text as today).
  - **Serve cutscene:** the beaver dashes up the street, then the view cuts to a side-view scene at Ah Ma's stall
    that reuses the Learn chef beaver and counter. The dish is raised, lands on the table, and the party starts.

## Non-goals and anti-goals

- Do not change `src/game/sim/RunSim.ts`, scoring, difficulty, `gateDirector`, input, the question set, anything
  under `supabase/`, the results flow, Learn, the forest or the skyline. The HUD changes only as decision 6 says
  (where the question panel sits and which way its arrows point); its logic in `src/ui/hud.ts` stays.
- No image files for sprites or scenes. Everything is drawn in code.
- Gameplay must not get harder to read. Legibility beats decoration: the lanes, the beaver, hazards, coins and the
  gate must be obvious on a phone at arm's length under booth lighting. Scenery at the sides must never be mistaken
  for something in a lane.
- It must not be slower than today on a mid-range phone, and motion must stay smooth: the sim is stepped and the scene
  redrawn every animation frame (not at the 15 fps scene rate), with positions snapped to whole art pixels.
- `prefers-reduced-motion` (`reducedMotion` in `src/game/perf.ts`) stays respected: no shake, no flashes, no intro
  hop, as today.
- Do not commit or touch `.env.example` (owner's uncommitted work).

## How the run works today (what the new renderer must replace)

`src/main.ts` creates `new World(stage, $('game'), sim, hooks)` from `src/game/three/World.ts` and uses only:

- `world.paused` (true while Learn covers the street: skip all work),
- `world.reset()` (clear for a new run),
- `world.intro(go)` (READY / SET, then `go()` on GO!, which starts the run; with reduced motion call `go()` at once),
- the `WorldHooks` callbacks: `onIngredient(x, y, step)`, `onCoin(points, doubled)`, `onPower(kind)`,
  `onPlating(x, y)`; x and y are stage CSS pixels.

The world owns the frame loop: each frame it calls `sim.update(dt)` (dt capped at 0.05 s) and then mirrors the sim:
`sim.mode` (`attract` | `run` | `ending`), `playerX` (0..2, eased), `travelled`, `obstacles` (5 kinds: stools,
trolley, wetfloor, uncle, cat), `pickups` (coin, tingkat; `sim.magnetPulls(p)`), `gate`, `hasShield`, `boosted`,
`slowed`, `ramp`, `score.streak`, `endReason`, `endingT`, `serveLeft`, `dish`. It subscribes with `sim.on(e)` and
turns every `SimEvent` (gate, coin, perfectLine, power, shieldGained, shieldUsed, nearMiss, lane, crash, end) into
effects, pop-up text, haptics (`buzz`) and the hook calls. `World.ts` lines 455 to 571 are the reference for exactly
which event produces which text, colour, haptic and hook; the new renderer keeps all of them.

Pop-up text, banners, emoji, flashes and the fever border are DOM elements made by the `Overlay` class at the bottom
of `src/game/three/Fx.ts`. It has no 3D in it and is kept as is (moved to the new folder).

Depth is in sim units (`WORLD.SPAWN_DIST` 420 ahead, `DESPAWN_DIST` -60 behind). Speed runs from 150 to about 490
units per second.

## Design

### Files

New folder `src/game/pixel/` replaces `src/game/three/`:

| File | Job |
|---|---|
| `view.ts` | Pure maths, no drawing: art size from the stage, lane to x, depth to y, art pixel to stage CSS px. Unit tested. |
| `World.ts` | Same public surface as today's `World` (constructor, `paused`, `reset`, `intro`, `WorldHooks`). Owns the canvas, the frame loop, the sim mirror, the event switch, shake and low-effects mode. |
| `Street.ts` | The scrolling floor and the scenery on both sides. |
| `Runner.ts` | The beaver from behind: run cycle, lane lean, hop, shield bubble, crash tumble, cheer. |
| `Props.ts` | The five obstacles, coin, tingkat, and the answer gate (approach, resolve right/wrong). |
| `Fx.ts` | Pixel particles, confetti, rings, speed lines, fire trail. |
| `Overlay.ts` | The existing DOM overlay class, moved unchanged. |
| `Serve.ts` | The serve cutscene, including the side-view stall scene. |
| `palette.ts` | Colours shared by the above. Imports `P` from `src/learn/art.ts` for the beaver, wood, tile and paper colours so the two cannot drift. |

`src/main.ts` changes one import. `three` and `@types/three` leave `package.json`; `chunkSizeWarningLimit` in
`vite.config.ts` goes back to the default if the build no longer needs it. `VIEW.PIXEL_SIZE`'s comment and
`WORLD.M_PER_UNIT` / `LANE_M` in `src/config.ts` are updated or removed. `LANE_COLOURS` (blue, purple, amber) moves
to `palette.ts`; the HUD's answer colours must still match the gate's lane colours.

### Layout (`view.ts`)

- Art size = stage CSS size / pixel size, rounded up, canvas centred, as `World.resize()` does today. A phone is
  about 98 x 175 art pixels.
- The three lanes take the middle 80% of the width. The rest is scenery, split evenly left and right.
- Depth 0 (the beaver's feet) sits about 62% of the way down. `SPAWN_DIST` maps to just above the top edge, so things
  scroll in and never pop in (about 3 to 4 units per art pixel). The top HUD rows cover roughly the first 100 CSS px;
  nothing else covers the street ahead.
- The question panel is anchored to the bottom of the stage (above the safe-area inset) and must never overlap the
  beaver, on the shortest stage (`VIEW.MIN_ASPECT`) with a two-line question and three-line answers. If it would,
  the beaver row moves up, not the panel.
- Things behind the beaver keep scrolling off the bottom until `DESPAWN_DIST`.
- Draw order is by depth (far first), the beaver in its place in that order, effects on top.

### Sprites

All sprites are drawn with `rect` calls in the style of `chef()` in `src/learn/art.ts`: dark ink outline
(`P.ink`), flat fills with one shade and one highlight, no gradients, no anti-aliasing, no rotation or scaling of
drawn art (animation is by frame, flips are by mirroring). For speed, sprites may be drawn once into small offscreen
canvases and stamped with `drawImage` at whole-pixel positions.

Approximate sizes on a ~98 px wide screen (lane about 26 px): beaver about 20 x 26 with its outline, obstacles up
to 22 wide, coin 7, tingkat about 12 x 15, gate arches one lane wide each in the lane colours. (The beaver and the
tingkat were first planned at 16 x 20 and 10 x 13; they were built bigger because they read more clearly on a phone.)

- **Street:** pale green tiles with a grout grid that scrolls with `travelled`; faint lane dividers; occasional floor
  details (drain cover, yellow tray-return arrow) that never look like hazards. At the sides: stall fronts with
  wooden counters, awnings and signs, round tables with stools, seated customers eating, potted plants, fans, a
  tray-return rack. Built from a small set of tiles picked with `hash()` so the street varies but never flickers.
  Some ambient life (steam, a customer lifting chopsticks) at a chunky frame rate; dropped in low-effects mode.
- **Beaver:** 4-frame run cycle whose speed follows the sim's cadence (as `World.frame` computes today), a lean
  frame while changing lanes, a hop on lane change and on a correct answer, a translucent PRISM shield bubble,
  a tumble on crash, arms-up cheer.
- **Obstacles:** stools (wobbly stack), trolley (steel, stacked trays), wet-floor sign, uncle (cool-toned clothes,
  carrying a tray), cat. Each on the red pad with the hazard band.
- **Pickups:** coin spins (4 frames) and glints; tingkat bobs with a sparkle. Magnet-pulled coins drift toward the
  beaver as today.
- **Gate:** three arches across the lanes in the lane colours, readable from the top of the screen. On an answer the
  correct arch flashes green and the others fall away; a wrong pick flashes red.

### Cutscenes

- **Attract (start screen):** street scrolls slowly, beaver jogs in the middle lane, no obstacles.
- **Intro:** same timings (`COUNTDOWN`, `INTRO_GO_S`), same pop-ups and haptics; on GO the beaver hops, a ring and a
  burst fire.
- **Serve** (`sim.endReason === 'served'`; timings `SERVE_T` RAISE 1.65 s, THROW 2.5 s, LAND 2.9 s, whole thing
  `SERVE.TOTAL_MS`): ORDER UP!, remaining obstacles and pickups puff away, the beaver dashes up the street with speed
  lines. Before RAISE the view wipes to the side-view stall: the chef beaver (`chef()` from Learn) at the counter,
  Ah Ma and customers at a table. `onPlating(x, y)` fires just before RAISE with the dish's position so the HUD
  ingredients fly into it. The dish (in `dishById(sim.dish).colour`) is raised, sent to the table, and on LAND:
  flash, shake, DISH SERVED! banner, bonus pop-up, confetti, fireworks and cheering emoji until the results screen.
- **Crash / time up:** as today (shake, flash, burst, CRASH! or TIME'S UP!).

### Performance

One 2D canvas of about 17,000 pixels. No per-frame allocation in the hot path; particles are pooled with fixed
caps. `PerfMonitor` stays: when it trips, drop ambient scenery animation, speed lines and decorative particles
(gameplay sprites and the gate never drop).

### Tests

- New `tests/unit/pixelView.test.ts` for `view.ts`: lanes are evenly spaced and inside the screen; depth 0 lands on
  the beaver's row; `SPAWN_DIST` is off the top; deeper is always higher; art-to-stage conversion round-trips.
- `npm run build` and `npm test` stay green. `tests/e2e/smoke.mjs` drives the sim through `window.__prism` and does
  not look at the canvas, so it should not need changes; check it for any 3D-specific selector.
- Visual check in a real browser at phone size: start screen, a full run with every obstacle kind, a power-up, a
  wrong and a right gate, a crash, and a served ending.

### Docs

Update the README where it describes the 3D run, `VIEW.PIXEL_SIZE`, and the folder list.

## Approaches considered

- **A. New hand-drawn renderer, 3D removed (chosen).** Plugs into the same slot as the 3D world; rules, HUD and
  server untouched; drops the largest dependency from the phone download.
- **B. Same, keeping 3D behind `?view=3d`.** Safety net, at the cost of two renderers to maintain and Three.js staying
  in the project. Owner declined.
- Ruled out: sprite image files (breaks the drawn-in-code rule, would not match Learn's hand); keeping Three.js with a
  flat camera (still not native); reviving the first top-down version from git history (Phaser-based, predates the
  current sim).
- Viewpoints considered: behind-the-runner road in perspective (closest to today, but scaled sprites look rough);
  side view (matches the Learn chef but breaks left/right swipes). Owner chose top-down.

## Build order

1. **Base (one builder, first):** `view.ts` and its tests, `palette.ts`, `Overlay.ts` moved, `World.ts` with the
   loop, sim mirror, full event switch and placeholder rectangles for everything, wired into `main.ts`; the question
   panel moved to the bottom in `src/ui/styles.css`. The game is
   fully playable with coloured boxes at this point. This fixes the interfaces the parallel work draws against.
2. **In parallel (four builders, one file each):** `Street.ts`; `Runner.ts`; `Props.ts`; `Fx.ts` plus `Serve.ts`.
3. **Finish (one builder):** remove `src/game/three/` and the Three.js packages, config and README clean-up, build
   and tests, browser check, review.
4. Commit, push, deploy with the MCP tools.

## Left to the builder

Exact sprite pixels, palettes beyond the shared colours, animation timing, scenery tile set, whether sprites are
pre-rendered, the wipe used for the serve cut, and the interfaces between the files in `src/game/pixel/`, provided
the decisions and anti-goals above hold.
