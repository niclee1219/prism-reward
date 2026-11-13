import { JUICE } from '../config';

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** Vibrates where supported (not iOS Safari). Visuals must carry the feel without it. */
export function buzz(kind: keyof typeof JUICE.VIBRATE): void {
  if (!canVibrate) return;
  try {
    navigator.vibrate(JUICE.VIBRATE[kind]);
  } catch {
    /* ignore */
  }
}
