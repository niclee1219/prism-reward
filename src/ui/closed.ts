// The "we're closed" screen: a pixel forest with beavers, shown instead of the game while staff have the site closed.
import { startForest, type ForestHandle } from './forest';

let forest: ForestHandle | null = null;

export function showClosed(root: HTMLElement): void {
  if (!root.hidden && forest) return; // already showing
  root.innerHTML = `
    <canvas class="forest pix-crisp" aria-hidden="true"></canvas>
    <div class="pix-sign closed-sign" role="status">
      WE'RE CLOSED
      <small>The booth is resting and the beavers have taken over.<br />Thanks for playing PRISM Run!</small>
    </div>`;
  root.hidden = false;
  forest?.stop();
  forest = startForest(root.querySelector('canvas')!);
}

export function hideClosed(root: HTMLElement): void {
  if (root.hidden) return;
  forest?.stop();
  forest = null;
  root.hidden = true;
  root.innerHTML = '';
}
