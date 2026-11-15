import { JUICE } from '../config';

export type BuzzKind = keyof typeof JUICE.VIBRATE;

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
const LIGHT: BuzzKind[] = ['coin', 'coinDouble', 'tick'];
let lastLight = 0;

/**
 * iOS Safari has no navigator.vibrate, but since iOS 18 toggling an `<input type="checkbox" switch>`
 * gives a system haptic tick. Best effort: Safari may only honour it close to a real tap.
 */
let iosSwitch: HTMLLabelElement | null = null;
function iosTick(): void {
  if (!iosSwitch) {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9px;top:0';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.append(input);
    document.body.append(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}
const isIos = typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent);

/** Vibrates where supported. Visuals must carry the feel without it. */
export function buzz(kind: BuzzKind): void {
  if (LIGHT.includes(kind)) {
    const now = performance.now();
    if (now - lastLight < JUICE.TICK_GAP_MS) return;
    lastLight = now;
  }
  const pattern = JUICE.VIBRATE[kind];
  try {
    if (canVibrate) navigator.vibrate(pattern);
    else if (isIos) {
      // One system tick per pulse of the pattern.
      const pulses = Array.isArray(pattern) ? pattern.filter((_, i) => i % 2 === 0).length : 1;
      for (let i = 0; i < Math.min(pulses, 3); i++) setTimeout(iosTick, i * 90);
    }
  } catch {
    /* ignore */
  }
}
