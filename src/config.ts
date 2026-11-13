// Every tunable number for the game lives here (or in the shared scoring file
// that the server also reads). Tune after playtests; nothing else should need editing.
import { SCORING } from '../supabase/functions/_shared/scoring.ts';

export { SCORING, multiplierFor, speedFactorAt, maxPlausibleScore } from '../supabase/functions/_shared/scoring.ts';

export const VIEW = {
  /** Logical canvas width in pixels. The canvas is scaled up with crisp pixels. */
  WIDTH: 180,
  MIN_HEIGHT: 280,
  MAX_HEIGHT: 400,
  /** Width of each decorative side strip. Road = WIDTH - 2 * SIDE. */
  SIDE: 18,
  /** Distance of the player from the bottom of the canvas. */
  PLAYER_FROM_BOTTOM: 64,
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
  SWIPE_MIN_PX: 22,
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
  /** Collision half-sizes in logical pixels. */
  HIT_HALF_W: 15,
  HIT_HALF_H: 11,
  /** Window after a lane change in which dodging counts as a near miss. */
  NEAR_MISS_MS: 320,
  NEAR_MISS_SLOWMO: 0.35,
  NEAR_MISS_SLOWMO_MS: 260,
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
