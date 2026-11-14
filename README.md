# PRISM Run

**Ah Ma's Recipe**: a mobile-web 3D runner for the PRISM exhibition booth. You have inherited Ah Ma's hawker
stall, and her recipe notes are as vague as undocumented code ("cook until it smells right"). Players scan a QR
code, pick a dish (chicken rice, char kway teow or laksa), run through a hawker centre and answer question
gates. Each correct answer decodes one recipe step with PRISM ("talk to your code, understand it in minutes").
Decode all 8 and the dish is served: that is the win. A leaderboard, a spin wheel and a live booth screen make
it competitive.

- `/` the game (phone, portrait)
- `/board` the booth TV leaderboard (landscape)
- `/admin` the staff page (PIN-protected, phone-friendly)

**Stack:** Vite + TypeScript + Three.js on the front end (game rules in a renderer-free `RunSim`); Supabase (Postgres + Edge Functions) on the back
end; static hosting on Cloudflare Pages.

> **Before the event:** `src/content/questions.json` and the recipe steps in `src/content/dishes.ts` are
> DRAFTS. A human must review all 36 questions and 24 recipe steps for accuracy. The prizes seeded by the first
> migration are placeholders too.

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

## 2. Tests

| Command | What it checks |
|---|---|
| `npm test` | Scoring, score cap (incl. the served bonus), difficulty curves, question rules (36 questions, 3 answers, word limits), gate director rules over 1 000 simulated runs, `RunSim` (bot runs reach DISH SERVED, crashes, time-up, one lane per move, every honest run passes the server check), one lane per swipe, dish list in sync with the server |
| `npm run test:backend` | The real router and SQL against local Postgres: impossible score rejected, rapid resubmit rejected, idempotent retry, vote bonus on/off and cap, spin stock never negative under 50 parallel spins, code redeems once, admin PIN and lockout |
| `npm run load-test` | 200 concurrent submissions, zero errors, leaderboard catches up within 2 s |
| `VITE_API_BASE=/api npm run build && npm run test:e2e` | A phone-sized Chromium plays the game: first run starts in under 10 s, wrong answers do not crash, a crash ends the run, a full run plays offline from the service-worker cache and submits when the network returns, the 180 s hard stop, the six results beats in order, the board, and the admin actions |

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

   (Or paste the files in `supabase/migrations/` into the SQL editor in order, `0001` to `0004`. Each is
   safe to run more than once.)

3. Set the staff PIN:

   ```bash
   supabase secrets set ADMIN_PIN=your-6-digit-pin
   ```

4. Deploy the six functions (`supabase/config.toml` already turns the platform JWT check off for them; they
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
4. `/board` and `/admin` are real pages in the build, so no redirect rules are needed. `public/_headers`
   sets long caching for hashed assets and no caching for the service worker.

## 5. Pre-event checklist

- [ ] **Questions reviewed** by a human; `_comment` draft flag removed from `src/content/questions.json`.
- [ ] **Real prizes** entered in `/admin` → Prizes (name changes need SQL: `update prizes set name = ...`),
      with stock and weights. The fallback segment's weight is the `fallback_weight` config row (default 60).
- [ ] **Vote bonus decision** confirmed with the organisers. One tap in `/admin` → Toggles turns it off.
- [ ] **Load test against the real project:**

      ```bash
      API_BASE=https://YOUR_PROJECT_REF.supabase.co/functions/v1 ANON_KEY=your-anon-key npm run load-test
      ```

- [ ] **Reset before doors open** (clears test data, keeps prizes and config). Run in the Supabase SQL editor:

      ```sql
      truncate players, runs, spins, rate_limits cascade;
      ```

- [ ] **Real devices:** play a full run on a low-end Android (about 3 GB RAM, Chrome) and an iPhone (Safari).
      Check frame rate, swipe feel, the notch/safe areas, and that iPhone feels fine without vibration.
- [ ] **Offline drill:** load the game, switch on flight mode, finish a run, switch flight mode off, and
      watch the score save.
- [ ] **Staff phones:** open `/admin`, enter the PIN, redeem a test code twice (the second must be refused).
- [ ] **Booth TV:** open `/board` full-screen in landscape; check it is readable from 3 m and that the QR
      code scans from the queue.
- [ ] **Top prize:** staff look at the top scorer's phone before handing it over.
- [ ] **Playtest tuning:** median run should be 60 to 90 s. Adjust `src/config.ts` (see section 7).

## 6. Post-event

1. Do the prize draw: `/admin` → Export → Download emails (CSV).
2. Purge emails. In the Supabase SQL editor, run `scripts/purge-emails.sql`. It deletes every email whose
   owner did not opt in to updates (as promised on the email screen) and prints how many remain. The file
   also contains a commented one-liner that deletes **all** emails.
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
  main.ts                  start -> run -> results -> play again
  content/questions.json   36 draft questions (4 types x 9, tiers 1-3)
  game/RunScene.ts         the run: lanes, scrolling, gates, obstacles, endings
  game/gateDirector.ts     picks questions: tier by time, no type twice in a row, no repeats, shuffled lanes
  game/difficulty.ts       speed / gate / obstacle curves
  game/juice.ts            speed lines, fire trail, pop text, shake
  game/art/                pixel sprites as character grids, baked into one atlas at start-up
  ui/                      HUD, results beats, wheel, confetti
  net/submitQueue.ts       localStorage queue with backoff: a finished run is never lost
  board/  admin/           the other two pages
supabase/
  migrations/              tables, leaderboard view, SQL functions
  functions/_shared/       router.ts (all endpoint logic), scoring.ts (shared with the client)
  functions/<name>/        one-line entry points: submit-run, leaderboard, spin, vote, email, admin
scripts/                   local DB + backend, load test, email purge
```

**Endpoints** (all under `VITE_API_BASE`):

| Endpoint | Purpose |
|---|---|
| `POST /submit-run` | Validates and stores a run. Returns `rank`, `total_players`, `beat_count`, `run_id`. |
| `GET /leaderboard?limit=10&device_id=...` | Top N, total plays, and the caller's rank. |
| `POST /spin` | Server picks the prize (weighted, stock-capped) and returns it with a redeem code. |
| `POST /vote` | Sets or clears the player's "I voted" flag. |
| `POST /email` | Saves the optional email and updates consent. |
| `POST /admin/<action>` | PIN in the `x-admin-pin` header. Actions: `login`, `redeem`, `runs`, `delete-run`, `restore-run`, `prizes`, `set-prize`, `config`, `set-config`, `stats`, `export-emails`. |

**Anti-cheat** (lightweight by design): server-side score cap from run length and correct answers; runs
over 185 s rejected; 10 s cooldown per device; rate limits per device and per IP; rank always computed by
the server; staff can remove any run live.

## 9. Decisions made where the spec left room

1. **Sprites are drawn in code** (`src/game/art/sprites.ts`) and baked into one atlas at start-up. No image
   downloads. To use real art later, replace `buildAtlas.ts` with an atlas loader that keeps the frame names.
2. **Lane-change only, no jump, no sound**, as the spec allows when time is short.
3. **The question and answers sit in a panel at the top**, with one answer card above each lane, while a
   coloured gate travels down the road. Text on a moving gate was too hard to read.
4. **Tutorial:** the first gate is a tier-1 question whose correct lane is never the one the player is in.
   The approach runs in slow motion, the right card glows, and an arrow pulses beside the player.
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
11. **Spins: one per run, as specified.** A player who replays can spin again. Prize weights, stock and the
    fallback weight are what limit how fast prizes go; tune them in `/admin`.
12. **Every spin gets a code,** including "Better luck next time + sticker", so the sticker can be redeemed
    and counted too.
13. **Redeem by typing the 5-character code** (no look-alike characters). The redeem screen also shows a QR
    of the code; `/admin` offers camera scanning only on browsers with a built-in barcode reader (Android
    Chrome). iPhone staff type the code.
14. **The per-IP rate limit is generous (900 requests a minute)** because a whole venue usually shares one
    public IP address. The per-device limit (40 a minute) does the real work.
15. **Admin PIN lockout:** 10 wrong PINs from one IP address locks `/admin` for that address for up to
    10 minutes. Because venue Wi-Fi shares one address, a prankster could lock staff out; staff can switch
    to mobile data, which has a different address.
16. **Results beats the player has already completed are skipped** on later runs (vote already ticked, email
    already given), which keeps "play again" fast. The vote beat is also skipped when the bonus is off or
    the score has not saved yet.
17. **Nicknames are trimmed to 16 characters with markup characters removed.** There is no profanity filter;
    staff remove offending runs in `/admin` → Runs.
18. **Earlier prize codes are listed under a new win** on the spin screen, so a player who tapped "play
    again" before reaching the staff does not lose a code. Codes are stored on the device only.

## 10. Known limits

- Difficulty numbers are first guesses. They have been exercised by an automated player, not by people.
- Not yet tested on physical phones (frame rate on low-end Android, iPhone Safari quirks, notch handling).
- The backend has been tested against local Postgres with the same SQL and router code, but not against a
  deployed Supabase project.
