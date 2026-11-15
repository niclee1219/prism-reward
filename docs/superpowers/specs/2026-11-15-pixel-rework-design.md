# PRISM Run: pixel-art rework and Learn mode

Date: 2026-11-15. Status: approved in conversation; build all phases in order.

## Intent

PRISM Run is a booth game (phone, portrait) with two big screens (`/leaderboard`, `/board`). The owner wants the whole
experience to feel cute, lively and coherent in pixel art, with one mascot (a beaver), and wants new visitors to first
learn how PRISM actually works (it is a RAG system over a codebase) in plain language before they play.

## Decisions made by the owner

1. **Game look:** keep the 3D runner and its rules. Render it low-res with crisp upscaling so it reads as pixel art,
   and restyle every screen around it with a pixel font and chunky panels. No 2D rewrite.
2. **Thank-you card:** the livelier forest is the full-screen backdrop. The 3D sticker beaver is removed. No hero
   beaver: the small side-view beaver family carries the scene and the message sits on a wooden sign. **No ONE IRAS
   branding** on this screen. Every creature reacts when the player celebrates (beavers jump, bunny flips).
3. **Leaderboard backdrop:** pixel-art Lau Pa Sat in front of the CBD, **night market** mood.
4. **Reactions:** about 20% stronger, not more. Roughly 45 confetti pieces per cannon on the big screen (find the
   current count and scale ~1.2x), emoji slightly bigger (~1.2x). No screen flash, no bounce animation.
5. **Learn mode** (was "zen mode"): explains how PRISM works technically, to a general employee. Interactive: the
   visitor performs the key steps. Real terms are stamped on after each step. No lucky draw. Not reachable while the
   booth is closed.
6. **Flow:** first visit on a phone opens Learn; FINISH prompts the visitor to play. Later visits load the game home
   directly, with a link back to Learn.
7. **Story:** the runner becomes a beaver cooking dinner after learning PRISM. Hawker centre, dishes, questions,
   scoring and the server all stay.
8. Invented-but-plausible ML code examples in Learn are acceptable; they are DRAFT content for human review.

## Calls made by the planner (owner did not object)

- Ah Ma is the beaver's grandmother, so existing copy and all 36 questions stay valid.
- `/board` gets the same skyline as `/leaderboard`. `/admin` is untouched.
- The closed screen uses the same forest, with WE'RE CLOSED on the wooden sign.
- Fonts are bundled (offline PWA): `@fontsource/press-start-2p` for display text, `@fontsource/jersey-15` for
  body text (Press Start 2P is unreadable for sentences at phone sizes; Pixelify Sans was tried and rejected because its c reads as o). Jersey 15 has one weight: never use font-weight for emphasis, and size it about 1.2x a normal sans (18px minimum for phone sentences).
- The same 20% reaction boost applies on the phone thank-you screen.
- A Skip link is visible throughout Learn.
- The old how-to keeps only its three controls slides (swipe, gates, coins) and shows once on the first PLAY tap.
- "First visit" is a per-phone localStorage flag, like the existing `seenHowto`. Nothing server-side.
- The pixel size of the game render is a config constant so the owner can tune it after seeing it.

## Non-goals and anti-goals

- Do not change `RunSim`, scoring, difficulty, the question set, or anything under `supabase/`.
- Do not add image files for scenes: scenes are drawn in code on small canvases, like `src/ui/forest.ts` today.
- Legibility beats style: score, questions and leaderboard rows must stay readable at arm's length (phone) and
  across a booth (big screens). `prefers-reduced-motion` (`reducedMotion` in `src/game/perf.ts`) stays respected.
- It must not get slower on mid-range phones; the low-res render should help, not hurt.
- Do not commit, and do not touch `.env.example` or `beaver.png` (owner's uncommitted work).

## Visual references (approved mockups, working code to port from)

- `.superpowers/brainstorm/49796-1794754577/content/thanks-beaver.html`: option **B** (phone `phB`) is approved:
  beaver family, wooden sign, plus the new forest life (birds, butterflies, falling leaves, swaying flowers, jumping
  fish, bunny, twinkling sun). Ignore option A and its `heroSprite`.
- `.superpowers/brainstorm/49796-1794754577/content/leaderboard-skyline.html`: palette `night` is approved (Lau Pa
  Sat, towers with blinking windows, satay stalls with smoke, string lights, walking people, plane, beaver cameo).
  The "proposed" reaction buttons there are too strong; see decision 4.

## Phases

Each phase leaves `npm run build` and `npm test` green and the site usable.

### Phase 0: shared pixel style

- Add the two font packages; make sure the font files are bundled and in the service-worker precache
  (`vite.config.ts`).
- `src/ui/pixel.css`: font faces, colour tokens, and reusable classes: panel, button (with pressed state), wooden
  sign, hard offset shadows, square corners. Imported by the game, `/leaderboard` and `/board` stylesheets. Phase 0
  only defines these; it does not restyle existing screens.
- `src/scene/pixelCanvas.ts`: extract the tiny-canvas machinery from `src/ui/forest.ts` (resize to art pixels,
  fixed-fps tick loop, `rect`/ellipse helpers, deterministic `hash`, stop function) so forest, skyline and Learn
  scenes share it. Port `forest.ts` onto it with no visual change.
- Add `.superpowers/` to `.gitignore`.

### Phase 1: forest, thank-you card, closed screen (parallel with Phase 2)

- `src/ui/forest.ts`: add the life from the mockup. Return a handle with `stop()` and `celebrate()`.
- `src/ui/thanks.ts`: full-screen forest behind the last results card, wooden sign with THANK YOU! and the existing
  sub line, pixel-styled confetti button and emoji row. Celebrating calls `celebrate()`. The results navigation must
  stay visible and usable on top. Stop the scene when the card is left.
- Remove the 3D beaver from the thank-you card, but **leave `src/ui/beaver.ts` in place**: Phase 3 adapts it.
- `src/ui/closed.ts`: wooden sign.
- Confetti and floating emoji on the phone about 20% stronger.

### Phase 2: night-market skyline on the big screens (parallel with Phase 1)

- `src/scene/skyline.ts`: the night scene from the mockup, sized so art pixels stay chunky on a 1080p screen.
- `/leaderboard` and `/board`: skyline behind the UI, panels restyled with the pixel classes and fonts. Keep the
  takeover show and its effects. Ambient effects that would hide the scene can be reduced.
- Reactions per decision 4; raise the per-poll caps modestly (bursts 3 to 4, emoji 24 to 30) and update
  `tests/unit/reactions.test.ts`.

### Phase 3: pixel look for the game, beaver runner

- `src/game/three/World.ts`: render at a fraction of CSS size and upscale with `image-rendering: pixelated`;
  antialiasing off. Constant in `src/config.ts`. Screen-space callbacks used by the HUD must still land correctly.
  A cheap colour-quantise pass is welcome if it holds frame rate; otherwise skip it.
- `src/game/three/Runner.ts`: the runner is a beaver seen from behind (paddle tail, ears, apron and headband kept).
  Reuse parts of `src/ui/beaver.ts`, then delete that file and its leftover CSS. Running, lane change, tumble and
  serve animations keep working.
- Restyle start screen, HUD, question panel, all results cards, in-game leaderboard overlay, controls slides and the
  rotate notice with the Phase 0 classes.
- Copy: the hero is a beaver; Ah Ma is its grandmother. Update README's story paragraph.
- Do not change the visit flow (Phase 4 owns `main.ts` flow, `howto.ts` slide list and `device.ts` flags).

### Phase 4: Learn mode and the first-visit flow

Scenes (content in `src/content/learn.ts`, marked DRAFT):

| # | Concept | Scene | Line | Interaction | Stamp |
|---|---|---|---|---|---|
| 1 | The problem | Ah Ma's stall, messy recipe book | Code with no docs is like Ah Ma's notes. | tap to continue | |
| 2 | Upload | Book handed to the beaver | Give PRISM your codebase. | tap to continue | |
| 3 | Split | Beaver cuts the book into recipe cards | PRISM breaks it into small pieces. | tap the book | CHUNKING |
| 4 | Embed | Cards fly to shelves, similar ones together | Each piece is filed by meaning, not by keyword. | tap cards | EMBEDDING |
| 5 | Ask | Three preset questions | Your question gets filed the same way. | pick one | |
| 6 | Retrieve | Nearest cards light up and hop off | PRISM pulls only the pieces that match. | watch result of the pick; can re-pick | RETRIEVAL |
| 7 | Generate | Answer types out, source stamps on | It answers from those pieces and shows its sources. | tap to generate | GENERATION |
| 8 | Docs | Beaver hands back a tidy bound book | It can write the docs too. Together this is called RAG. | tap to continue | RAG |
| 9 | Why PRISM | Night skyline, fence round the building | Runs on the intranet, so code never leaves. Current government AI tools do not read code. | tap to continue | |
| 10 | Coming next | Three signposts in the forest | see below | tap each sign | |

Scene 10 signposts:
- **Model governance:** Every ML model documented the same way, including the business reasoning behind it.
- **Audit log:** See exactly what changed between one version of a model and the next.
- **Standardisation:** Spot when two models handle the same formula differently.

Scenes 1 to 6 use the recipe-book picture. Scene 7 switches to real-looking code: the three preset questions are about
an ML model (for example "How is the risk score calculated?", "Which features does this model use?", "What changed
since the last version?") and the answers cite invented files and lines (for example `risk_model/scoring.py · lines
40-58`). Different questions must light up different cards: that is the core idea.

Behaviour:
- No timer, no auto-advance, no score, no network calls. BACK, progress dots, and a Skip link on every scene.
  Interactive scenes show NEXT once the step is done, with a gentle hint if the visitor waits.
- Last scene: FINISH, then a "Now cook dinner!" prompt with a PLAY button that lands on the home screen.
- First visit (new flag in `src/net/device.ts`) opens Learn; finishing or skipping sets the flag. Later visits land
  on home, which has a "Learn how PRISM works" link.
- While the site is closed, only the closed screen shows; Learn does not open and the flag is not set.
- Controls slides: remove the PRISM slide, show the remaining three once on the first PLAY tap, then start the run.
- Backdrops reuse `startForest` and the skyline scene; the stall and shelf scenes are new, on `pixelCanvas`.
- Update `tests/e2e/smoke.mjs` for the new flow, add unit tests for the Learn content, update the README.

## Left to the builder

Exact palettes, sprite details, animation timing, CSS class names, file splits within a phase, and how the low-res
render is wired, provided the decisions and anti-goals above hold.
