// The prize wheel. It only animates: the server decides the outcome.
// Drawn in SVG; rotation runs on requestAnimationFrame so every peg that passes the pointer can
// flick it and give a haptic tick, like a real carnival wheel.
import { buzz } from '../game/haptics';
import { reducedMotion } from '../game/perf';

const COLOURS = ['#e63946', '#ffd166', '#2a9d8f', '#8ecae6', '#9b5de5', '#f4a261', '#52b788', '#f15bb5'];
/** Text colour that reads on each segment colour. */
const INK = ['#fff6e0', '#1b1b2f', '#fff6e0', '#1b1b2f', '#fff6e0', '#1b1b2f', '#1b1b2f', '#fff6e0'];
const NS = 'http://www.w3.org/2000/svg';
const R = 100; // face radius
const IDLE_DEG_PER_S = 7;

export class Wheel {
  readonly el: HTMLDivElement;
  private svg: SVGSVGElement;
  private rot: SVGGElement;
  private pointer: SVGGElement;
  private segments: string[] = [];
  private angle = 0;
  private spinning = false;
  private idleRaf = 0;
  private lastPeg = 0;
  private seen = false;

  constructor(segments: string[]) {
    this.el = document.createElement('div');
    this.el.className = 'wheel-wrap';
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('viewBox', '-122 -128 244 250');
    this.svg.innerHTML = `
      <defs>
        <radialGradient id="wh-gloss" cx="0" cy="0" r="${R}" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#fff" stop-opacity="0.35"/>
          <stop offset="0.55" stop-color="#fff" stop-opacity="0.06"/>
          <stop offset="0.9" stop-color="#000" stop-opacity="0.08"/>
          <stop offset="1" stop-color="#000" stop-opacity="0.35"/>
        </radialGradient>
        <linearGradient id="wh-gold" x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stop-color="#fff1b0"/><stop offset="0.5" stop-color="#ffd166"/><stop offset="1" stop-color="#c7962f"/>
        </linearGradient>
        <linearGradient id="wh-rim" x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stop-color="#3b3e66"/><stop offset="1" stop-color="#14142a"/>
        </linearGradient>
      </defs>
      <circle class="wh-glow" r="118"/>
      <circle r="116" fill="url(#wh-rim)" stroke="url(#wh-gold)" stroke-width="3"/>
      <g class="wh-bulbs"></g>
      <g class="wh-rot"></g>
      <circle r="${R}" fill="url(#wh-gloss)" pointer-events="none"/>
      <circle r="${R}" fill="none" stroke="#1b1b2f" stroke-width="3" pointer-events="none"/>
      <g class="wh-hub" pointer-events="none">
        <circle r="19" fill="#1b1b2f"/>
        <circle r="16" fill="url(#wh-gold)" stroke="#fff6e0" stroke-width="1.5"/>
        <path d="M0,-9 L8,5 L-8,5 Z" fill="#bfe9ff" stroke="#1b1b2f" stroke-width="1.5"/>
      </g>
      <g class="wh-pointer" transform="translate(0,-112)">
        <g class="wh-flap">
          <path d="M-13,-12 L13,-12 L0,16 Z" fill="#e63946" stroke="#fff6e0" stroke-width="2.5" stroke-linejoin="round"/>
          <circle cy="-10" r="5" fill="url(#wh-gold)" stroke="#1b1b2f" stroke-width="1.5"/>
        </g>
      </g>`;
    this.rot = this.svg.querySelector('.wh-rot') as SVGGElement;
    this.pointer = this.svg.querySelector('.wh-flap') as SVGGElement;
    // 24 bulbs around the rim; CSS chases them, faster while spinning.
    const bulbs = this.svg.querySelector('.wh-bulbs')!;
    let b = '';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      b += `<circle class="bulb ${i % 2 ? 'odd' : 'even'}" cx="${(Math.cos(a) * 108).toFixed(2)}" cy="${(Math.sin(a) * 108).toFixed(2)}" r="3.6"/>`;
    }
    bulbs.innerHTML = b;
    this.el.appendChild(this.svg);
    this.setSegments(segments);
    this.idle();
  }

  setSegments(segments: string[]): void {
    if (segments.join('|') === this.segments.join('|')) return;
    this.segments = segments;
    const n = Math.max(segments.length, 1);
    const step = (Math.PI * 2) / n;
    const p = (a: number, r: number) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
    let html = '';
    segments.forEach((name, i) => {
      // Segment i is centred at angle i * step, measured clockwise from the top.
      const a0 = i * step - step / 2 - Math.PI / 2;
      const a1 = a0 + step;
      const colour = COLOURS[i % COLOURS.length];
      html +=
        n === 1
          ? `<circle class="seg" data-i="${i}" r="${R}" fill="${colour}"/>`
          : `<path class="seg" data-i="${i}" d="M0,0 L${p(a0, R)} A${R},${R} 0 0 1 ${p(a1, R)} Z" fill="${colour}" stroke="#1b1b2f" stroke-width="1.5"/>`;
      // A peg on the rim at each boundary: these are what the pointer clicks against.
      if (n > 1) html += `<circle cx="${p(a0, R - 5).split(',')[0]}" cy="${p(a0, R - 5).split(',')[1]}" r="3" fill="#fff6e0" stroke="#1b1b2f" stroke-width="1.2"/>`;
      // Long names wrap onto two lines, split at the space nearest the middle.
      const clean = name.replace(/[<&>"]/g, '');
      let lines = [clean];
      if (clean.length > 11 && clean.includes(' ')) {
        const spaces = [...clean].map((ch, at) => (ch === ' ' ? at : -1)).filter((at) => at > 0);
        const cut = spaces.reduce((best, at) => (Math.abs(at - clean.length / 2) < Math.abs(best - clean.length / 2) ? at : best));
        lines = [clean.slice(0, cut), clean.slice(cut + 1)];
      }
      const longest = Math.max(...lines.map((l) => l.length));
      const size = n > 6 || longest > 11 ? 8 : 9.5;
      const spans = lines
        .map((line, li) => `<tspan x="0" dy="${li === 0 ? (lines.length === 1 ? 0 : -size * 0.6) : size * 1.2}">${line.length > 16 ? `${line.slice(0, 15)}…` : line}</tspan>`)
        .join('');
      const deg = (i * 360) / n;
      html += `<text transform="rotate(${deg}) translate(0,-62) rotate(90)" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="${size}" fill="${INK[i % INK.length]}">${spans}</text>`;
    });
    this.rot.innerHTML = html;
    this.apply();
  }

  /** Slow drift while waiting, so the wheel looks alive and begs to be spun. */
  private idle(): void {
    if (reducedMotion) return;
    let last = performance.now();
    const frame = (now: number) => {
      if (this.spinning) return;
      // Stop for good once the wheel has been on screen and then removed.
      if (this.el.isConnected) this.seen = true;
      else if (this.seen) return;
      this.angle += ((now - last) / 1000) * IDLE_DEG_PER_S;
      last = now;
      this.apply();
      this.idleRaf = requestAnimationFrame(frame);
    };
    this.idleRaf = requestAnimationFrame(frame);
  }

  private apply(): void {
    this.rot.setAttribute('transform', `rotate(${this.angle.toFixed(3)})`);
  }

  /** Flick the pointer and tick, once per peg that passes the top. */
  private pegCheck(): void {
    const n = Math.max(this.segments.length, 2);
    const step = 360 / n;
    const peg = Math.floor((this.angle + step / 2) / step);
    if (peg !== this.lastPeg) {
      this.lastPeg = peg;
      this.pointer.classList.remove('flick');
      void this.pointer.getBoundingClientRect();
      this.pointer.classList.add('flick');
      buzz('tick');
    }
  }

  /** Spins so that segment `index` stops under the pointer. Resolves when it has stopped. */
  spinTo(index: number): Promise<void> {
    cancelAnimationFrame(this.idleRaf);
    this.spinning = true;
    this.el.classList.add('spinning');
    this.el.classList.remove('landed');
    this.rot.querySelectorAll('.seg.win').forEach((s) => s.classList.remove('win'));
    const n = Math.max(this.segments.length, 1);
    const step = 360 / n;
    const jitter = (Math.random() - 0.5) * step * 0.6;
    // Rotating by `a` brings segment i to i*step + a; we need that to be a multiple of 360.
    const want = -index * step + jitter;
    const start = this.angle;
    const delta = ((((want - start) % 360) + 360) % 360) + 360 * (reducedMotion ? 2 : 6);
    const windup = reducedMotion ? 0 : 14;
    const windMs = reducedMotion ? 0 : 380;
    const spinMs = reducedMotion ? 1600 : 5200;
    this.lastPeg = Math.floor((start + step / 2) / step);
    const t0 = performance.now();
    return new Promise((resolve) => {
      let done = false;
      const land = () => {
        if (done) return;
        done = true;
        this.angle = start + delta;
        this.apply();
        this.spinning = false;
        this.el.classList.remove('spinning');
        this.el.classList.add('landed');
        this.rot.querySelector(`.seg[data-i="${index}"]`)?.classList.add('win');
        buzz('thump');
        resolve();
      };
      // requestAnimationFrame stops in a background tab; never leave the player waiting on it.
      setTimeout(land, windMs + spinMs + 400);
      const frame = (now: number) => {
        if (done) return;
        const t = now - t0;
        if (t < windMs) {
          // A little pull back before the throw.
          const k = t / windMs;
          this.angle = start - windup * Math.sin(k * Math.PI * 0.5);
        } else {
          const k = Math.min((t - windMs) / spinMs, 1);
          const eased = 1 - Math.pow(1 - k, 4);
          this.angle = start - windup + (delta + windup) * eased;
          if (k >= 1) return land();
        }
        this.apply();
        this.pegCheck();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }
}
