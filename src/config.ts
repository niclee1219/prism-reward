// Every tunable number for the game lives here (or in the shared scoring file
// that the server also reads). Tune after playtests; nothing else should need editing.
import { SCORING } from '../supabase/functions/_shared/scoring.ts';

export { SCORING, multiplierFor, speedFactorAt, maxPlausibleScore, servedBonus } from '../supabase/functions/_shared/scoring.ts';

export const VIEW = {
  /** Stage height / width is clamped to this range so phones are not letterboxed. */
  MIN_ASPECT: 1.55,
  MAX_ASPECT: 2.25,
  /** Cap on device pixel ratio for the 3D canvas (lowered further on slow devices). */
  MAX_DPR: 2,
  LOW_FX_DPR: 1,
};

/**
 * The simulation measures depth as distance ahead of the player, in "units".
 * One unit is one pixel of the old top-down game, so all speeds and intervals carry over.
 */
export const WORLD = {
  /** Obstacle rows appear this far ahead (beyond the fog, so nothing pops in). */
  SPAWN_DIST: 420,
  /** Things are removed once they are this far behind the player. */
  DESPAWN_DIST: -60,
  /** A gate is answered when it is this close. */
  GATE_HIT_DIST: 6,
  /** World metres per unit of depth, and per lane, for the 3D renderer. */
  M_PER_UNIT: 0.1,
  LANE_M: 1.7,
};

export const RUN = {
  MAX_S: SCORING.RUN_MAX_S,
  /** No obstacle can reach the player before this many seconds. */
  INVULNERABLE_S: 9,
  /** World scroll speed at speed factor 1, in logical pixels per second. */
  BASE_SPEED: 150,
  /** Lane-change tween length. */
  LANE_TWEEN_MS: 90,
  /** Minimum horizontal finger travel (CSS px) that counts as a swipe. */
  SWIPE_MIN_PX: 30,
};

export const GATES = {
  /** When the tutorial gate's question appears. */
  TUTORIAL_AT_S: 3,
  /** Time scale while the tutorial gate approaches. */
  TUTORIAL_SLOWMO: 0.55,
  /** Seconds between gates at the start and at RAMP_S. */
  INTERVAL_START_S: 6,
  INTERVAL_END_S: SCORING.MIN_GATE_INTERVAL_S,
  INTERVAL_RAMP_S: 120,
  /** How long the player gets to read before the gate arrives (start / late). */
  READ_START_S: 3.4,
  READ_END_S: 2.6,
  /** Tier 1 before the first value, tier 2 before the second, tier 3 after. */
  TIER_TIMES_S: [30, 75],
  BOOST_S: 2,
  BOOST_FACTOR: SCORING.BOOST_FACTOR,
  SLOW_S: 1.5,
  SLOW_FACTOR: 0.6,
  /** Streak at which a shield is granted (and every multiple of it after). */
  SHIELD_STREAK: 3,
  /** Streak at which the fire trail turns on. */
  FIRE_STREAK: 3,
};

/** The serve cutscene, after the last recipe step. The score is already final when it starts. */
export const SERVE = {
  /** The runner dashes this far (units), easing to a stop at the customers' table... */
  DASH_UNITS: 230,
  /** ...over this many seconds. */
  DASH_S: 1.8,
  /** Whole cutscene, from the last answer to the results screen. */
  TOTAL_MS: 4400,
};

export const OBSTACLES = {
  /** Seconds between obstacle rows at the start and at RAMP_S. */
  INTERVAL_START_S: 1.5,
  INTERVAL_END_S: 0.5,
  RAMP_S: 150,
  /** After RAMP_S the interval keeps shrinking to this, so a crash is near certain. */
  INTERVAL_FINAL_S: 0.34,
  /** Chance that a row blocks two lanes, at the start and at RAMP_S. */
  DOUBLE_START: 0.05,
  DOUBLE_END: 0.75,
  /** Keep this much travel time clear before / after a gate. */
  CLEAR_BEFORE_GATE_S: 0.55,
  CLEAR_AFTER_GATE_S: 0.3,
  /** Collision: depth window (units) and lateral overlap (lanes) that count as a hit. */
  HIT_DEPTH: 22,
  HIT_LANES: 0.46,
  /** Window after a lane change in which dodging counts as a near miss. */
  NEAR_MISS_MS: 320,
  NEAR_MISS_SLOWMO: 0.35,
  NEAR_MISS_SLOWMO_MS: 260,
};

export const PICKUPS = {
  /** First coin line appears this early, so the very first seconds already pay out. */
  FIRST_COINS_S: 1,
  /** Gap between coins in a line, in depth units. */
  COIN_SPACING: 22,
  /** Pickup window: depth (units) and lateral reach (lanes). */
  HIT_DEPTH: 16,
  HIT_LANES: 0.55,
  /** Tingkat (tiffin carrier) mystery box: first one, then every MIN..MAX seconds. */
  TINGKAT_FIRST_S: 9,
  TINGKAT_MIN_S: 9,
  TINGKAT_MAX_S: 14,
  /** Power-up lengths. */
  DOUBLE_S: 8,
  MAGNET_S: 8,
  /** With the magnet on, coins this close (units) fly to the player from any lane. */
  MAGNET_RANGE: 90,
};

export const JUICE = {
  /** Below this average fps, decorative effects are switched off. */
  LOW_FPS: 45,
  SHAKE_BOOST: 0.006,
  SHAKE_CRASH: 0.02,
  VIBRATE: { boost: 20, stumble: [30, 40, 30], shield: [15, 30, 15], crash: [80, 40, 120], near: 10 } as Record<
    string,
    number | number[]
  >,
};

export const NET = {
  /** Base URL of the Edge Functions, e.g. https://xyz.supabase.co/functions/v1 */
  API_BASE: (import.meta.env?.VITE_API_BASE as string | undefined) ?? '',
  ANON_KEY: (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  /** Public URL of the game, used for the QR code on the board. Defaults to the site origin. */
  GAME_URL: (import.meta.env?.VITE_GAME_URL as string | undefined) ?? '',
  RETRY_MIN_MS: 1500,
  RETRY_MAX_MS: 20_000,
  REQUEST_TIMEOUT_MS: 8000,
  BOARD_POLL_MS: 2000,
};

export const NICKNAME_MAX = 16;
