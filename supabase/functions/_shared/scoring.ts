// Shared between the game client and the Edge Functions.
// Anything the server uses to judge a run lives here so both sides agree.
// No imports: this file must load unchanged in the browser, Node and Deno.

export const SCORING = {
  /** Hard stop for a run, in seconds. */
  RUN_MAX_S: 180,
  /** Server rejects runs longer than this (hard stop + slack). */
  MAX_DURATION_MS: 185_000,
  /** Distance points earned per second at speed factor 1. */
  DISTANCE_POINTS_PER_S: 20,
  /** Points for a correct answer before the multiplier. */
  ANSWER_POINTS: 100,
  /** Multiplier is min(1 + floor(streak / STREAK_PER_MULT), MAX_MULT). */
  STREAK_PER_MULT: 2,
  MAX_MULT: 5,
  /** Speed factor ramps linearly from 1 to SPEED_MAX_FACTOR over SPEED_RAMP_S. */
  SPEED_MAX_FACTOR: 2.5,
  SPEED_RAMP_S: 150,
  /** Speed modifier while boosted (correct answer). */
  BOOST_FACTOR: 1.3,
  /** Shortest possible gap between two gates, in seconds. */
  MIN_GATE_INTERVAL_S: 4,
  /** Slack on the server-side score cap. */
  CAP_SLACK: 1.05,
  /** Correct answers needed to recover the whole recipe; reaching it ends the run as "served". */
  RECIPE_STEPS: 8,
  /** Flat bonus for serving the dish. */
  SERVED_BONUS: 1000,
  /** Extra points per second left on the clock when the dish is served. */
  TIME_BONUS_PER_S: 10,
  /** Points per coin; doubled while the "2x coins" power-up runs. */
  COIN_POINTS: 10,
  COIN_DOUBLE: 2,
  /** Coins come in lines of this many, at most one line per COIN_LINE_INTERVAL_S of run time. */
  COINS_PER_LINE: 5,
  COIN_LINE_INTERVAL_S: 1.6,
} as const;

/** Most coin points an honest run of this length could collect (every coin, always doubled). */
export function maxCoinPoints(durationMs: number): number {
  const lines = Math.floor(Math.max(0, durationMs) / 1000 / SCORING.COIN_LINE_INTERVAL_S) + 1;
  return lines * SCORING.COINS_PER_LINE * SCORING.COIN_POINTS * SCORING.COIN_DOUBLE;
}

/** Bonus for a served run that took `durationMs`. Zero if the recipe was not fully recovered. */
export function servedBonus(correct: number, durationMs: number): number {
  if (correct < SCORING.RECIPE_STEPS) return 0;
  const left = Math.max(0, SCORING.RUN_MAX_S - Math.max(0, durationMs) / 1000);
  return SCORING.SERVED_BONUS + Math.floor(left * SCORING.TIME_BONUS_PER_S);
}

export function multiplierFor(streak: number): number {
  return Math.min(1 + Math.floor(streak / SCORING.STREAK_PER_MULT), SCORING.MAX_MULT);
}

/** Speed factor from the difficulty ramp alone (no boost or slowdown). */
export function speedFactorAt(tSeconds: number): number {
  const k = Math.min(Math.max(tSeconds / SCORING.SPEED_RAMP_S, 0), 1);
  return 1 + (SCORING.SPEED_MAX_FACTOR - 1) * k;
}

/** Most gates a run of this length could have passed. */
export function maxGatesFor(durationMs: number): number {
  return Math.floor(durationMs / 1000 / (SCORING.MIN_GATE_INTERVAL_S - 0.5)) + 2;
}

/**
 * Highest score an honest run could reach: boosted the whole way,
 * every gate answered correctly at the top multiplier.
 */
export function maxPlausibleScore(durationMs: number, gates: number): number {
  const t = Math.max(0, durationMs) / 1000;
  const ramp = Math.min(t, SCORING.SPEED_RAMP_S);
  // Integral of the linear ramp, then the flat part.
  const slope = (SCORING.SPEED_MAX_FACTOR - 1) / SCORING.SPEED_RAMP_S;
  const factorSeconds = ramp + (slope * ramp * ramp) / 2 + Math.max(0, t - ramp) * SCORING.SPEED_MAX_FACTOR;
  const distance = factorSeconds * SCORING.DISTANCE_POINTS_PER_S * SCORING.BOOST_FACTOR;
  const answers = Math.max(0, gates) * SCORING.ANSWER_POINTS * SCORING.MAX_MULT;
  return Math.ceil((distance + answers) * SCORING.CAP_SLACK) + 50 + servedBonus(gates, durationMs) + maxCoinPoints(durationMs);
}

export interface RunPayload {
  score: number;
  correct: number;
  wrong: number;
  gates: number;
  duration_ms: number;
}

/** Returns null when the run is plausible, otherwise a short reason code. */
export function implausibleReason(r: RunPayload): string | null {
  const ints = [r.score, r.correct, r.wrong, r.gates, r.duration_ms];
  if (!ints.every((n) => Number.isInteger(n) && n >= 0)) return 'bad_numbers';
  if (r.duration_ms > SCORING.MAX_DURATION_MS) return 'too_long';
  if (r.gates > maxGatesFor(r.duration_ms)) return 'too_many_gates';
  if (r.correct + r.wrong > r.gates) return 'bad_counts';
  // Only correct answers earn answer points, so cap on those.
  if (r.score > maxPlausibleScore(r.duration_ms, r.correct)) return 'score_too_high';
  return null;
}
