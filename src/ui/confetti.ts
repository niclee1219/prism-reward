import { reducedMotion } from '../game/perf';

const COLOURS = ['#e63946', '#ffd166', '#52e08a', '#8ecae6', '#9b5de5', '#f15bb5'];

/** A short burst of falling confetti drawn on a throwaway canvas over `host`. */
export function confetti(host: HTMLElement, amount = 80): void {
  if (reducedMotion) amount = Math.min(amount, 20);
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const w = (canvas.width = host.clientWidth);
  const h = (canvas.height = host.clientHeight);
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const bits = Array.from({ length: amount }, () => ({
    x: Math.random() * w,
    y: -20 - Math.random() * h * 0.5,
    vx: (Math.random() - 0.5) * 120,
    vy: 140 + Math.random() * 220,
    size: 5 + Math.random() * 6,
    colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
    wobble: Math.random() * 6,
  }));
  let last = performance.now();
  const start = last;
  const frame = (now: number) => {
    const dt = Math.min(now - last, 50) / 1000;
    last = now;
    ctx.clearRect(0, 0, w, h);
    for (const b of bits) {
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
