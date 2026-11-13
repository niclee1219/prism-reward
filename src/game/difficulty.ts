// Pure difficulty curves. `t` is seconds since the run started.
import { GATES, OBSTACLES } from '../config';

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const lerp = (a: number, b: number, k: number) => a + (b - a) * clamp01(k);

export function gateInterval(t: number): number {
  return lerp(GATES.INTERVAL_START_S, GATES.INTERVAL_END_S, t / GATES.INTERVAL_RAMP_S);
}

export function gateReadTime(t: number): number {
  return lerp(GATES.READ_START_S, GATES.READ_END_S, t / GATES.INTERVAL_RAMP_S);
}

export function obstacleInterval(t: number): number {
  if (t <= OBSTACLES.RAMP_S) return lerp(OBSTACLES.INTERVAL_START_S, OBSTACLES.INTERVAL_END_S, t / OBSTACLES.RAMP_S);
  return lerp(OBSTACLES.INTERVAL_END_S, OBSTACLES.INTERVAL_FINAL_S, (t - OBSTACLES.RAMP_S) / 15);
}

export function doubleRowChance(t: number): number {
  if (t > OBSTACLES.RAMP_S) return 0.95;
  return lerp(OBSTACLES.DOUBLE_START, OBSTACLES.DOUBLE_END, t / OBSTACLES.RAMP_S);
}

export function tierAt(t: number): 1 | 2 | 3 {
  if (t < GATES.TIER_TIMES_S[0]) return 1;
  if (t < GATES.TIER_TIMES_S[1]) return 2;
  return 3;
}
