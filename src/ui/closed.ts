// The "we're closed" screen: a pixel forest with beavers, shown instead of the game while staff have the site closed.
import { startForest } from './forest';

let stop: (() => void) | null = null;

export function showClosed(root: HTMLElement): void {
  if (!root.hidden && stop) return; // already showing
  root.innerHTML = `
    <canvas class="forest" aria-hidden="true"></canvas>
    <div class="closed-card" role="status">
      <h2>WE'RE CLOSED</h2>
      <p>The booth is resting and the beavers have taken over.<br />Thanks for playing PRISM Run!</p>
    </div>`;
  root.hidden = false;
  stop?.();
  stop = startForest(root.querySelector('canvas')!);
}

export function hideClosed(root: HTMLElement): void {
  if (root.hidden) return;
  stop?.();
  stop = null;
  root.hidden = true;
  root.innerHTML = '';
}
