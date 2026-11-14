import { RUN } from '../config';

/**
 * Turns one pointer gesture into at most one lane change.
 * A swipe fires as soon as the finger has travelled far enough (no need to lift),
 * but the rest of that same drag is ignored, so a long flick can never skip two lanes.
 * A plain tap on the left or right half also moves one lane.
 * Pure logic (no DOM), so it is unit-tested directly.
 */
export class SwipeTracker {
  private startX = 0;
  private startY = 0;
  private active = false;
  private fired = false;

  constructor(private minPx: number = RUN.SWIPE_MIN_PX) {}

  down(x: number, y: number): void {
    this.active = true;
    this.fired = false;
    this.startX = x;
    this.startY = y;
  }

  /** Returns a direction the first time this gesture crosses the swipe threshold, else null. */
  move(x: number, y: number): -1 | 1 | null {
    if (!this.active || this.fired) return null;
    const dx = x - this.startX;
    const dy = y - this.startY;
    if (Math.abs(dx) >= this.minPx && Math.abs(dx) > Math.abs(dy)) {
      this.fired = true;
      return dx > 0 ? 1 : -1;
    }
    return null;
  }

  /** Returns a direction for a tap (little movement, no swipe), else null. `midX` splits left from right. */
  up(x: number, y: number, midX: number): -1 | 1 | null {
    const wasTap = this.active && !this.fired && Math.abs(x - this.startX) < 8 && Math.abs(y - this.startY) < 8;
    this.active = false;
    if (!wasTap) return null;
    return x < midX ? -1 : 1;
  }
}

/** Swipe or tap anywhere on the element to change lane; arrow keys work for desktop testing. */
export function attachInput(el: HTMLElement, onMove: (dir: -1 | 1) => void): () => void {
  const swipe = new SwipeTracker();

  const down = (e: PointerEvent) => swipe.down(e.clientX, e.clientY);
  const move = (e: PointerEvent) => {
    const dir = swipe.move(e.clientX, e.clientY);
    if (dir) onMove(dir);
  };
  const up = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const dir = swipe.up(e.clientX, e.clientY, r.left + r.width / 2);
    if (dir) onMove(dir);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') onMove(-1);
    if (e.key === 'ArrowRight' || e.key === 'd') onMove(1);
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  window.addEventListener('keydown', key);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    window.removeEventListener('keydown', key);
  };
}
