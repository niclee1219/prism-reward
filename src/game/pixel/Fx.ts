// Pixel effects drawn on the canvas: sparkle bursts, confetti, expanding rings, fire trail, speed lines.
// Everything lives in fixed pools that are filled in place (the oldest entry is reused when a pool is full), so
// effects never allocate while a run is going. Coordinates are art px; `speed` is art px per second; `life` is seconds.
//
// The look follows the Learn sprites: flat squares, whole pixels, no alpha. Particles move on a chunky 15 fps clock
// (like an old console) but ride the ground scroll every frame, so they stay stuck to the floor without jitter.
// Bursts are kept short by drag, so a big pop never spreads across the lanes and hides what is coming.
import type { Frame } from './types';

const MAX_PARTS = 300;
const MAX_CONFETTI = 200;
const MAX_RINGS = 8;
/** Own motion steps at this rate; the ground scroll is applied every frame. */
const STEP = 1 / 15;
const GRAVITY = 70; // art px / s^2 for sparks
const DRAG = 4.2; // per second: sparks burst out fast, then hang and fall
const CONFETTI_FALL = 16; // art px / s, confetti flutters down instead of dropping
const RING_LIFE = 0.42;
/** Floor rings are seen from above at a tilt, so they are a little flatter than they are wide. */
const RING_SQUASH = 0.75;

const FIRE = ['#ff7b00', '#ffd166', '#e63946', '#ff9f1c'] as const;
const STREAK = '#ffffff';
const STREAK_TAIL = '#cfe9ff';

export class Fx {
  // Sparks (bursts and the fire trail).
  private x = new Float32Array(MAX_PARTS);
  private y = new Float32Array(MAX_PARTS);
  private vx = new Float32Array(MAX_PARTS);
  private vy = new Float32Array(MAX_PARTS);
  private age = new Float32Array(MAX_PARTS);
  private life = new Float32Array(MAX_PARTS);
  /** 0 = free, 1 = spark, 2 = fire (no gravity, drifts back). */
  private kind = new Uint8Array(MAX_PARTS);
  private colour: string[] = new Array<string>(MAX_PARTS).fill('#fff');
  private next = 0;
  // Confetti.
  private cx = new Float32Array(MAX_CONFETTI);
  private cy = new Float32Array(MAX_CONFETTI);
  private cvx = new Float32Array(MAX_CONFETTI);
  private cvy = new Float32Array(MAX_CONFETTI);
  private cAge = new Float32Array(MAX_CONFETTI);
  private cLife = new Float32Array(MAX_CONFETTI);
  private cPhase = new Uint8Array(MAX_CONFETTI);
  private cColour: string[] = new Array<string>(MAX_CONFETTI).fill('#fff');
  private cNext = 0;
  // Rings.
  private rx = new Float32Array(MAX_RINGS);
  private ry = new Float32Array(MAX_RINGS);
  private rAge = new Float32Array(MAX_RINGS);
  private rSize = new Float32Array(MAX_RINGS);
  private rColour: string[] = new Array<string>(MAX_RINGS).fill('#fff');
  private rNext = 0;
  /** Time not yet stepped on the chunky clock, and the number of steps so far (drives the confetti flutter). */
  private clock = 0;
  private steps = 0;

  reset(): void {
    this.kind.fill(0);
    this.cLife.fill(0);
    this.rSize.fill(0);
  }

  private spawn(k: number, x: number, y: number, vx: number, vy: number, life: number, c: string): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_PARTS;
    this.kind[i] = k;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.age[i] = 0;
    this.life[i] = life;
    this.colour[i] = c;
  }

  burst(x: number, y: number, colours: readonly string[], count: number, speed: number, life = 0.6): void {
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      // A little upward kick so a burst fountains before gravity pulls it down.
      this.spawn(1, x, y, Math.cos(a) * s, Math.sin(a) * s - speed * 0.35, life * (0.6 + Math.random() * 0.4), colours[n % colours.length]);
    }
  }

  confetti(x: number, y: number, colours: readonly string[], count: number): void {
    for (let n = 0; n < count; n++) {
      const i = this.cNext;
      this.cNext = (this.cNext + 1) % MAX_CONFETTI;
      this.cx[i] = x + (Math.random() - 0.5) * 8;
      this.cy[i] = y;
      // Popped up and well out to the sides, so a big shower spreads over the scene instead of piling on one spot.
      this.cvx[i] = (Math.random() - 0.5) * 110;
      this.cvy[i] = -24 - Math.random() * 46;
      this.cAge[i] = 0;
      this.cLife[i] = 2 + Math.random();
      this.cPhase[i] = n & 3;
      this.cColour[i] = colours[n % colours.length];
    }
  }

  ring(x: number, y: number, colour: string, size: number): void {
    const i = this.rNext;
    this.rNext = (this.rNext + 1) % MAX_RINGS;
    this.rx[i] = x;
    this.ry[i] = y;
    this.rAge[i] = 0;
    this.rSize[i] = size;
    this.rColour[i] = colour;
  }

  /** Call each frame while on a streak. (x, y) are the runner's feet; the flames trail behind, down the screen. */
  fireTrail(x: number, y: number): void {
    const c = FIRE[(Math.random() * FIRE.length) | 0];
    this.spawn(2, x + (Math.random() - 0.5) * 9, y - 2 - Math.random() * 4, (Math.random() - 0.5) * 8, 18 + Math.random() * 14, 0.3 + Math.random() * 0.12, c);
  }

  /** scrollPx = how far the ground moved down this frame; effects live on the ground and move with it. */
  update(dt: number, scrollPx: number): void {
    this.clock += dt;
    let n = 0;
    while (this.clock >= STEP && n < 4) {
      this.clock -= STEP;
      this.step();
      n++;
    }
    if (this.clock > STEP) this.clock = 0; // a long stall: drop the backlog rather than fast-forward
    for (let i = 0; i < MAX_PARTS; i++) {
      if (!this.kind[i]) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) this.kind[i] = 0;
      else this.y[i] += scrollPx;
    }
    for (let i = 0; i < MAX_CONFETTI; i++) {
      if (!this.cLife[i]) continue;
      this.cAge[i] += dt;
      if (this.cAge[i] >= this.cLife[i]) this.cLife[i] = 0;
      else this.cy[i] += scrollPx;
    }
    for (let i = 0; i < MAX_RINGS; i++) {
      if (!this.rSize[i]) continue;
      this.rAge[i] += dt;
      this.ry[i] += scrollPx;
      if (this.rAge[i] > RING_LIFE) this.rSize[i] = 0;
    }
  }

  /** One tick of the chunky clock: own motion only. */
  private step(): void {
    const dt = STEP;
    const drag = Math.max(0, 1 - DRAG * dt);
    this.steps++;
    for (let i = 0; i < MAX_PARTS; i++) {
      const k = this.kind[i];
      if (!k) continue;
      if (k === 1) {
        this.vx[i] *= drag;
        this.vy[i] = this.vy[i] * drag + GRAVITY * dt;
      }
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
    }
    for (let i = 0; i < MAX_CONFETTI; i++) {
      if (!this.cLife[i]) continue;
      this.cvx[i] *= 0.82;
      this.cvy[i] += (CONFETTI_FALL - this.cvy[i]) * 0.2;
      // Flutter: a side-to-side sway as it falls, out of step with its neighbours.
      const sway = ((this.steps + this.cPhase[i] * 2) & 7) < 4 ? 6 : -6;
      this.cx[i] += (this.cvx[i] + sway) * dt;
      this.cy[i] += this.cvy[i] * dt;
    }
  }

  draw(f: Frame): void {
    const { rect } = f.art;
    // Rings first: they are on the floor, under the sparks.
    for (let i = 0; i < MAX_RINGS; i++) {
      if (!this.rSize[i]) continue;
      const k = this.rAge[i] / RING_LIFE;
      // Eases out: jumps open, then slows, as a shock ring does.
      const r = Math.round(2 + (1 - (1 - k) * (1 - k)) * this.rSize[i] * 2);
      pixelRing(rect, Math.round(this.rx[i]), Math.round(this.ry[i]), r, Math.max(1, Math.round(r * RING_SQUASH)), this.rColour[i], k > 0.65);
    }
    const blink = this.steps & 1;
    for (let i = 0; i < MAX_PARTS; i++) {
      const k = this.kind[i];
      if (!k) continue;
      const left = this.age[i] / this.life[i];
      // Fade by shrinking, then flicker out on alternate ticks: no alpha.
      if (left > 0.75 && (i & 1) === blink) continue;
      const s = left < 0.45 ? 2 : 1;
      rect(this.x[i], this.y[i], s, s, this.colour[i]);
    }
    for (let i = 0; i < MAX_CONFETTI; i++) {
      if (!this.cLife[i]) continue;
      // A square turning over shows its edge every other tick.
      const edge = ((this.steps + this.cPhase[i]) & 3) === 0;
      if (this.cAge[i] > this.cLife[i] - 0.4 && (i & 1) === blink) continue;
      rect(this.cx[i], this.cy[i], edge ? 1 : 2, 2, this.cColour[i]);
    }
  }

  /** 0..1, white streaks at the screen edges, outside the lanes so they never cover a gate or obstacle. */
  speedLines(f: Frame, amount: number): void {
    if (amount <= 0 || f.lowFx) return;
    const { rect } = f.art;
    const v = f.view;
    const n = Math.round(amount * 8);
    if (!n) return;
    const len = Math.round(5 + amount * 9);
    const margin = Math.max(2, v.roadX + 3);
    // Streaks move on a 20 fps clock, so they read as chunky dashes rather than smears.
    const t = Math.floor(f.time * 20) / 20;
    const span = v.h + len * 2;
    for (let i = 0; i < n; i++) {
      const left = (i & 1) === 0;
      const lane = (i >> 1) % 4; // four columns per side, spread across the margin
      const off = 1 + Math.round(((lane * 7 + i * 3) % 10) * (margin - 2) / 10);
      const x = left ? off : v.w - 1 - off;
      const y = Math.round(((t * (230 + (i % 3) * 40) + i * 47) % span) - len);
      rect(x, y, 1, len - 3, STREAK);
      rect(x, y + len - 3, 1, 3, STREAK_TAIL);
    }
  }
}

/** A 1 px pixel ellipse outline, no fill. `dashed` drops every other pixel as the ring fades out. */
function pixelRing(rect: Frame['art']['rect'], cx: number, cy: number, rx: number, ry: number, c: string, dashed: boolean): void {
  // Walk x for the flat top and bottom, then y for the steep sides, so the outline has no gaps.
  for (let x = -rx; x <= rx; x++) {
    if (dashed && x & 1) continue;
    const y = Math.round(ry * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx))));
    rect(cx + x, cy - y, 1, 1, c);
    rect(cx + x, cy + y, 1, 1, c);
  }
  for (let y = -ry; y <= ry; y++) {
    if (dashed && y & 1) continue;
    const x = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    rect(cx - x, cy + y, 1, 1, c);
    rect(cx + x, cy + y, 1, 1, c);
  }
}
