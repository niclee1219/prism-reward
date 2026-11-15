import { reducedMotion } from '../game/perf';

const COLOURS = ['#e63946', '#ffd166', '#52e08a', '#8ecae6', '#9b5de5', '#f15bb5'];

/**
 * A short burst of falling confetti drawn on a throwaway canvas over `host`.
 * With `origin` (pixels inside `host`) it pops out of that point like a party cannon instead of raining from the top.
 */
export function confetti(host: HTMLElement, amount = 80, origin?: { x: number; y: number }): void {
  if (reducedMotion) amount = Math.min(amount, 20);
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const w = (canvas.width = host.clientWidth);
  const h = (canvas.height = host.clientHeight);
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const bits = Array.from({ length: amount }, () => {
    const colour = COLOURS[Math.floor(Math.random() * COLOURS.length)];
    const size = 5 + Math.random() * 6;
    if (origin) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2; // mostly upwards
      const sp = 260 + Math.random() * 520;
      return { x: origin.x, y: origin.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size, colour, wobble: Math.random() * 6, g: 900 };
    }
    return {
      x: Math.random() * w,
      y: -20 - Math.random() * h * 0.5,
      vx: (Math.random() - 0.5) * 120,
      vy: 140 + Math.random() * 220,
      size,
      colour,
      wobble: Math.random() * 6,
      g: 0,
    };
  });
  let last = performance.now();
  const start = last;
  const frame = (now: number) => {
    const dt = Math.min(now - last, 50) / 1000;
    last = now;
    ctx.clearRect(0, 0, w, h);
    for (const b of bits) {
      b.vy += b.g * dt;
      if (b.g) b.vx *= 1 - 1.2 * dt; // air drag, so the burst blooms then drifts down
      b.x += (b.vx + Math.sin(now / 200 + b.wobble) * 40) * dt;
      b.y += b.vy * dt;
      ctx.fillStyle = b.colour;
      ctx.fillRect(Math.round(b.x), Math.round(b.y), b.size, b.size);
    }
    if (now - start < 3200 && canvas.isConnected) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
