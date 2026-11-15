import { reducedMotion } from '../game/perf';

/**
 * One small emoji that drifts up and fades, like the reactions on a live video.
 * `from` is the point (pixels inside `layer`) where it starts; the layer should be position:absolute and pointer-events:none.
 */
export function floatEmoji(layer: HTMLElement, emoji: string, from?: { x: number; y: number }): void {
  if (layer.childElementCount > 40) return; // a spamming phone cannot grow the DOM without bound
  const e = document.createElement('span');
  e.className = 'floaty';
  e.textContent = emoji;
  const w = layer.clientWidth || 300;
  const h = layer.clientHeight || 500;
  const x = (from?.x ?? w * 0.5) + (Math.random() - 0.5) * 36;
  const y = from?.y ?? h * 0.85;
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  e.style.setProperty('--rise', `${reducedMotion ? 80 : 160 + Math.random() * 180}px`);
  e.style.setProperty('--sway', `${(Math.random() - 0.5) * 90}px`);
  e.style.setProperty('--dur', `${reducedMotion ? 900 : 1500 + Math.random() * 700}ms`);
  e.addEventListener('animationend', () => e.remove());
  layer.append(e);
}
