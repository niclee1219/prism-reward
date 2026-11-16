# PRISM Run

**The Secret Recipe**: a mobile-web pixel-art runner for the PRISM exhibition booth. You play a little beaver cook
who has just taken over a hawker stall and its recipe, and the recipe notes are as vague as undocumented code ("cook
until it smells right"). Players scan a QR code, pick a dish (chicken rice, nasi lemak or laksa), run through a
hawker centre and answer question gates. Each correct answer decodes one recipe step with PRISM ("talk to your code, understand it in minutes").
Decode all 8 and the dish is served: that is the win. A leaderboard and a live booth screen make it
competitive, and everyone who finishes can enter an IRAS lucky draw for a Starbucks gift card.

- `/` the game (phone, portrait). A phone's first visit opens **Learn** over the home screen: ten short pixel scenes
  in which the visitor does each step of PRISM themselves (chop the code into pieces, file them by meaning, ask, pull
  the matching pieces, generate a sourced answer) and the real term is stamped on afterwards (CHUNKING, EMBEDDING,
  RETRIEVAL, GENERATION, then RAG). It ends with "Now cook dinner!" and a PLAY button that lands on the home screen.
  Finishing or skipping it is remembered on the phone (`prism.learn` in localStorage), so later visits land on home,
  which has a "Learn how PRISM works" link. The three controls slides show once, on the first PLAY tap, then the run
  starts.
- `/board` the booth TV leaderboard (landscape)
- `/leaderboard` the high-energy laptop leaderboard: a full-screen show whenever someone makes the board for the first time, enters the top 10 or steals the crown (see below)
- `/admin` the staff page (PIN-protected, phone-friendly): remove runs, flip the toggles, export the lucky draw entries

**Stack:** Vite + TypeScript on the front end, with the run drawn as pixel art on a plain 2D canvas (game rules in a
renderer-free `RunSim`); Supabase (Postgres + Edge Functions) on the back end; static hosting on Cloudflare Pages.

> **Before the event:** `src/content/questions.json`, the recipe steps in `src/content/dishes.ts` and the Learn
> content in `src/content/learn.ts` are DRAFTS. A human must review all 36 questions, 24 recipe steps (no pork or lard in any recipe), and Learn's
> scene lines, three preset questions, answers and citations. Learn's ML model, code and file names are invented
> for the demo; check that each answer agrees with its code snippets and that the line numbers look sensible.

---

## 1. Run it locally

Needs Node 22+ (vitest 5 requires it) and a local Postgres 14+ (only the `initdb`, `pg_ctl` and `psql` binaries).

```bash
npm install
```

```bash
scripts/local-db.sh start
```

```bash
npm run backend:local
```

```bash
VITE_API_BASE=/api npm run dev
```

The dev server proxies `/api` to the local backend on port 8787. The local admin PIN is `123456`
(override with `ADMIN_PIN=...`). Open the printed URL on your phone (same Wi-Fi) or in a desktop browser
with the device toolbar on. Arrow keys steer on desktop.

Without `VITE_API_BASE` the game still plays; scores simply wait in the retry queue.

**Developer notes for the pixel art** (these only work with the dev server, `npx vite --port 5199 --strictPort`):

- `/dev/sprites.html` is a gallery of every sprite in the run (obstacles, coins, tingkat, gate, beaver poses,
  effects, the street and the serve scene). Add `?t=1.2` to freeze the animation, `?only=runner` to show one section.
- `/?demo=1` starts a run straight away with the name DEMO: no name claim, no Learn, no score upload, and nothing
  saved on the device. The page exposes the run as `window.__prism` for scripts.
- `npm run shot -- '/?demo=1' shots/run.png --w 390 --h 780 --wait 3000` saves a screenshot of any page (run it with
  no arguments for the options). It needs Playwright: either installed in this project, or point `PLAYWRIGHT_MODULE`
  at a Playwright package folder.

## 2. Tests

| Command | What it checks |
|---|---|
| `npm test` | Scoring, score cap (incl. the served bonus), difficulty curves, question rules (36 questions, 3 answers, word limits), gate director rules over 1 000 simulated runs, `RunSim` (bot runs reach DISH SERVED, crashes, time-up, one lane per move, every honest run passes the server check), one lane per swipe, dish list in sync with the server, Learn content (ten scenes each with a line, stamps in order, no term named before its stamp, every preset question pulls at least one card and no two pull the same set, every answer cites exactly the pieces it pulled) |
| `npm run test:backend` | The real router and SQL against local Postgres: impossible score rejected, rapid resubmit rejected, idempotent retry, vote bonus on/off and cap, lucky draw entries (only `*.gov.sg`, one per device and per email), reactions (kinds, polling cursor, flood limit), admin PIN and lockout |
| `npm run load-test` | 200 concurrent submissions, zero errors, leaderboard catches up within 2 s |
| `VITE_API_BASE=/api npm run build && npm run test:e2e` | A phone-sized Chromium plays the game: first run starts in under 10 s, wrong answers do not crash, a crash ends the run, a full run plays offline from the service-worker cache and submits when the network returns, the 180 s hard stop, the results beats in order (ending on the thank-you card), reactions reaching `/leaderboard`, play again returning home with the dish ticked, the board, the admin actions (closing the site keeps Learn shut on a brand-new phone), and a first visit (Learn opens, a step must be done before NEXT, SKIP marks it seen, home links back, the first PLAY shows the three controls slides and then runs) |

`test:backend`, `load-test` and `test:e2e` need `scripts/local-db.sh start` first. `test:e2e` needs
Playwright (`npm i -D playwright && npx playwright install chromium`) if it is not already on the machine.

## 3. Environment variables

**Front end** (build-time; set in Cloudflare Pages, see `.env.example`):

| Name | Meaning |
|---|---|
| `VITE_API_BASE` | `https://<project-ref>.supabase.co/functions/v1` |
| `VITE_SUPABASE_ANON_KEY` | The project's anon (publishable) key. Safe to ship: every table is locked by Row Level Security with no public policies. |
| `VITE_GAME_URL` | Optional. The URL encoded in the board's QR code. Defaults to the site's own origin. |

**Edge Functions** (secrets; never in the front end):

| Name | Meaning |
|---|---|
| `ADMIN_PIN` | Staff PIN for `/admin`. Use at least 6 digits. |
| `ALLOWED_ORIGIN` | Optional. Your site origin, to restrict browser calls to it. Defaults to `*`. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions by Supabase automatically.

## 4. Deploy

### Supabase

1. Create a project, then install the [Supabase CLI](https://supabase.com/docs/guides/cli) and link it:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

2. Create the tables and functions:

   ```bash
   supabase db push
   ```

   (Or paste the files in `supabase/migrations/` into the SQL editor in order, `0001` to `0009`. Each is
   safe to run more than once.)

3. Set the staff PIN:

   ```bash
   supabase secrets set ADMIN_PIN=your-6-digit-pin
   ```

4. Deploy the functions (`submit-run`, `leaderboard`, `vote`, `email`, `reactions`, `status`, `admin`, `claim-name`) (`supabase/config.toml` already turns the platform JWT check off for them; they
   do their own checks):

   ```bash
   supabase functions deploy
   ```

5. Smoke test:

   ```bash
   curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/leaderboard?limit=3"
   ```

### Cloudflare Pages

1. Create a Pages project from this repository.
2. Build command `npm run build`, output directory `dist`.
3. Add the three `VITE_*` variables above, then deploy.
4. `/leaderboard`, `/board` and `/admin` are real pages in the build, so no redirect rules are needed. `public/_headers`
   sets long caching for hashed assets and no caching for the service worker.

### The `/leaderboard` screen

Meant to sit open on a laptop at the booth and pull people in. It polls the same `GET /leaderboard?limit=10`
every 2 s and compares each snapshot with the last (`src/leaderboard/diff.ts`, unit-tested):

| What happened | Show |
|---|---|
| First ever entry on an empty board | **FIRST BLOOD** takeover, siren, confetti cannons |
| Someone takes #1 (new player or a climber) | **NEW KING** takeover, "X has been dethroned by N", crown shakes |
| A player appears in the top 10 | **#N** takeover (silver "on the podium" style for #2 and #3), the bumped player is named |

A row that is about to be announced shows as `??? INCOMING ???` and slams onto the board when its takeover ends.
Events queue (and speed up when the queue is long), so a burst of players never leaves the room waiting.
The side panel always says what it takes to get on ("BEAT 1,823" or "3 SPOTS OPEN"), and a ticker replays the latest moments.

- `F` fullscreen, `M` mute. Browsers keep sound locked until the first click or key press, so click once after opening it.
- The screen asks the browser to keep the display awake. Scores already on the board when it opens are not announced.
- Preview with no backend: open `/leaderboard?demo`. `Space` adds a player, `K` adds one who takes the crown, `R` resets.
- Honours `prefers-reduced-motion` (fewer particles, no shake).

## 5. Pre-event checklist

- [ ] **Questions reviewed** by a human; `_comment` draft flag removed from `src/content/questions.json`.
- [ ] **Learn reviewed** by a human: lines, preset questions, answers and citations in `src/content/learn.ts`; walk
      through it once on a phone (clear site data first, or open it from the home screen link).
- [ ] **Gift card** bought and someone assigned to run the draw (entries come from `/admin` → Export).
- [ ] **Vote bonus decision** confirmed with the organisers. One tap in `/admin` → Toggles turns it off.
- [ ] **Load test against the real project:**

      ```bash
      API_BASE=https://YOUR_PROJECT_REF.supabase.co/functions/v1 ANON_KEY=your-anon-key npm run load-test
      ```

- [ ] **Reset before doors open** (clears test data, keeps config). Run in the Supabase SQL editor:

      ```sql
      truncate players, runs, draw_entries, reactions, rate_limits cascade;
      ```

- [ ] **Real devices:** play a full run on a low-end Android (about 3 GB RAM, Chrome) and an iPhone (Safari).
      Check frame rate, swipe feel, the notch/safe areas, and that iPhone feels fine without vibration.
- [ ] **Offline drill:** load the game, switch on flight mode, finish a run, switch flight mode off, and
      watch the score save.
- [ ] **Staff phones:** open `/admin`, enter the PIN, check Runs, Toggles and Export load.
- [ ] **Lucky draw:** enter a test `.gov.sg` address from a phone, check the thank-you screen, and that the entry shows up in `/admin` → Export. Tap confetti and the emoji and watch them appear on `/leaderboard`.
- [ ] **Booth TV:** open `/board` full-screen in landscape; check it is readable from 3 m and that the QR
      code scans from the queue.
- [ ] **Playtest tuning:** median run should be 60 to 90 s. Adjust `src/config.ts` (see section 7).

## 6. Post-event

1. Do the lucky draw: `/admin` → Export → Download lucky draw entries (CSV). The CSV also has the optional
   "how can PRISM benefit you" feedback, which is the list of people to follow up with.
2. Purge the entries. In the Supabase SQL editor, run `scripts/purge-emails.sql`. It deletes every entry
   (as promised on the entry card) and prints how many remain. Export first if you still need the feedback.
3. Turn submissions off: `/admin` → Toggles → Submissions open.
4. Delete the downloaded CSV once the draw is done.

## 7. Tuning

Everything tunable is in two files:

- `src/config.ts`: speeds, lane feel, gate timing, tier times, boost/slow, shield, obstacle density, near-miss
  window, frame-rate threshold, haptic patterns, retry timings.
- `supabase/functions/_shared/scoring.ts`: anything the **server also relies on** (points, multiplier, speed
  ramp, run limit, score cap). The client imports this file, so the two cannot drift. **Redeploy the Edge
  Functions after changing it.**

Server-side limits (cooldown, rate limits, PIN lockout) are in `LIMITS` at the top of
`supabase/functions/_shared/router.ts`.

Likely first adjustments after a playtest:

| Runs feel... | Change |
|---|---|
| Too short | Raise `OBSTACLES.INTERVAL_START_S` / `INTERVAL_END_S`, lower `DOUBLE_END` |
| Too long | The opposite, or lower `SCORING.SPEED_RAMP_S` (then redeploy functions) |
| Too little reading time | Raise `GATES.READ_START_S` / `READ_END_S` |

## 8. How it works

```
src/
  config.ts                all client tunables
  main.ts                  first visit -> Learn; start -> (controls slides once) -> run -> results -> play again
  content/learn.ts         Learn: scene lines, the invented ML code pieces, preset questions, answers, signposts (DRAFT)
  learn/                   Learn mode: learn.ts (frame, stamps, BACK / NEXT / SKIP), scenes.ts (the ten scenes), art.ts (sprites)
  scene/                   pixelCanvas.ts (tiny crisp canvases), skyline.ts (night market); the forest is ui/forest.ts
  content/questions.json   36 draft questions (4 types x 9, tiers 1-3)
  game/sim/RunSim.ts       the run's rules: lanes, scrolling, gates, obstacles, pickups, endings (no drawing)
  game/pixel/              draws the run top-down as pixel art: World.ts (each frame, effects, the serve cutscene),
                           Street.ts, Runner.ts (the beaver), Props.ts (obstacles, coins, tingkat, gate),
                           Fx.ts (particles), Serve.ts (the stall), Overlay.ts (pop-up text), view.ts (layout)
  game/gateDirector.ts     picks questions: tier by time, no type twice in a row, no repeats, shuffled lanes
  game/difficulty.ts       speed / gate / obstacle curves
  ui/                      HUD, results beats, thank-you card (pixel forest), confetti, shared pixel styles
  net/submitQueue.ts       localStorage queue with backoff: a finished run is never lost
  board/  leaderboard/  admin/   the other pages
supabase/
  migrations/              tables, leaderboard view, SQL functions
  functions/_shared/       router.ts (all endpoint logic), scoring.ts (shared with the client)
  functions/<name>/        one-line entry points: submit-run, leaderboard, reactions, vote, email, admin
scripts/                   local DB + backend, load test, email purge
```

**Endpoints** (all under `VITE_API_BASE`):

| Endpoint | Purpose |
|---|---|
| `POST /submit-run` | Validates and stores a run. Returns `rank`, `total_players`, `beat_count`, `run_id`. |
| `GET /leaderboard?limit=10&device_id=...` | Top N, total plays, and the caller's rank. |
| `GET /reactions?since=<id>` / `POST /reactions` | Live reactions. Phones POST a kind (`confetti`, `heart`, `like`, `fire`, `penguin`, `party`); `/leaderboard` polls for the new ones each second. Limited to 12 per phone per 10 s. |
| `POST /vote` | Sets or clears the player's "I voted" flag. |
| `GET /status` | `{open: true/false}`. When staff close the site from `/admin` → Event, the game shows a pixel forest with beavers instead of the home screen. |
| `POST /email` | Lucky draw entry: a `*.gov.sg` address such as `@iras.gov.sg` or `@mof.gov.sg` (checked on the phone and on the server) plus optional feedback text. One entry per device and per email. |
| `POST /admin/<action>` | PIN in the `x-admin-pin` header. Actions: `login`, `runs`, `delete-run`, `restore-run`, `config`, `set-config`, `stats`, `export-entries`, `reset` (needs `{"confirm":"RESET"}`). |

**Anti-cheat** (lightweight by design): server-side score cap from run length and correct answers; runs
over 185 s rejected; 10 s cooldown per device; rate limits per device and per IP; rank always computed by
the server; staff can remove any run live.

## 9. Decisions made where the spec left room

1. **Sprites are drawn in code** (`src/game/pixel/`, and `src/learn/art.ts` for Learn) as small filled squares,
   so there are no image downloads. The whole run is drawn on one small canvas, one canvas pixel per art pixel, and
   blown up with crisp edges. `VIEW.PIXEL_SIZE` in `src/config.ts` sets how big an art pixel is (4 screen pixels);
   open the game as `/?px=3` to try another size on a phone without a rebuild.
2. **Lane-change only, no jump, no sound**, as the spec allows when time is short.
3. **The question and answers sit in a panel at the bottom**, under the beaver, with one answer card under each
   lane, while a coloured gate comes down the street towards the beaver. Text on a moving gate was too hard to read.
4. **Tutorial:** the first gate is a tier-1 question whose correct lane is never the one the player is in.
   The approach runs in slow motion, the right card glows, and a white arrow bounces over the
   right arch of the gate.
5. **Vote bonus is sticky per player and applied when the board is read.** Ticking the box once marks the
   player; the board shows `floor(best score x multiplier)`. Turning the toggle off removes the bonus from
   the board immediately. This needed one column beyond the spec's data model: `players.voted`.
   `runs.vote_bonus` records whether the player was marked when that run was stored.
6. **`/board` polls every 2 seconds** (the spec's permitted fallback) instead of using Realtime. It needs no
   public table access and recovers from a dropped connection by itself.
7. **Two endpoints beyond the spec's list:** `POST /vote` and `POST /email`, both needed by the results flow.
8. **Submissions are idempotent.** The client creates the run id, so a retried submission returns the stored
   result instead of creating a duplicate or tripping the cooldown.
9. **A "cooldown" rejection is retried, not dropped.** Two runs finished offline are sent 10 s apart.
10. **`questions.json` carries the draft flag as a `_comment` field,** because JSON cannot hold `//` comments.
11. **No prizes to hand out.** The spin wheel, prize codes and staff redeem step are gone: the booth runs one
    lucky draw (a Starbucks gift card) from the email entries, drawn by hand from the CSV.
12. **Lucky draw entries are public-officer-only** (any `*.gov.sg` such as `@iras.gov.sg` or `@mof.gov.sg`, any case; bare `@gov.sg` refused) and there is no
    consent checkbox: the card says the email is used only for the draw and to follow up on feedback.
13. **Reactions poll, like the boards.** A `reactions` table and a `/reactions` endpoint; `/leaderboard` asks
    for new ones every second and caps how many it shows at once, so a flood cannot bury the board.
14. **The per-IP rate limit is generous (900 requests a minute)** because a whole venue usually shares one
    public IP address. The per-device limit (40 a minute) does the real work.
15. **Admin PIN lockout:** 10 wrong PINs from one IP address locks `/admin` for that address for up to
    10 minutes. Because venue Wi-Fi shares one address, a prankster could lock staff out; staff can switch
    to mobile data, which has a different address.
16. **Results beats the player has already completed are skipped** on later runs (vote already ticked, lucky draw
    already entered), which keeps "play again" fast. The vote beat is also skipped when the bonus is off or
    the score has not saved yet.
17. **Nicknames are trimmed to 16 characters with markup characters removed.** There is no profanity filter;
    staff remove offending runs in `/admin` → Runs.
18. **Play again returns to the home screen** and ticks the dish you just finished (kept on the device only).
19. **Learn and a closed site.** Learn never opens while staff have the site closed, and the "seen" flag is only set
    while it is open. A first visit opens Learn straight away (no waiting on the network); if the first status check
    then says the site is closed, Learn is closed again before the visitor has touched it and only the closed screen
    shows. If the site closes while someone is already part-way through Learn, they can finish it (like a run in
    progress); FINISH, PLAY or SKIP then land on the closed screen, and the flag is not set, so Learn opens again on
    their next visit once the booth reopens.
20. **Learn pauses the street** behind it (it is fully covered), so a phone is not drawing two scenes at once.

## 10. Known limits

- Difficulty numbers are first guesses. They have been exercised by an automated player, not by people.
- Not yet tested on physical phones (frame rate on low-end Android, iPhone Safari quirks, notch handling).
- The backend has been tested against local Postgres with the same SQL and router code, but not against a
  deployed Supabase project.
