import { RUN } from '../config';

/**
 * Swipe left / right anywhere on the element to change lane.
 * A lane change fires as soon as the finger has travelled far enough,
 * without waiting for it to lift. A plain tap on the left or right half also works,
 * and arrow keys work for desktop testing.
 */
export function attachInput(el: HTMLElement, onMove: (dir: -1 | 1) => void): () => void {
  let startX = 0;
  let startY = 0;
  let active = false;
  let moved = false;

  const down = (e: PointerEvent) => {
    active = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
  };
  const move = (e: PointerEvent) => {
    if (!active) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) >= RUN.SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
      onMove(dx > 0 ? 1 : -1);
      moved = true;
      startX = e.clientX; // a continued drag can trigger a second lane change
      startY = e.clientY;
    }
  };
  const up = (e: PointerEvent) => {
    if (active && !moved && Math.abs(e.clientX - startX) < 8 && Math.abs(e.clientY - startY) < 8) {
      const r = el.getBoundingClientRect();
      onMove(e.clientX < r.left + r.width / 2 ? -1 : 1);
    }
    active = false;
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
