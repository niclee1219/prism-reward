// Pixel effects drawn on the canvas: sparkle bursts, confetti, expanding rings, fire trail, speed lines.
// Everything is pooled with a fixed cap, so effects never allocate while a run is going.
// PLACEHOLDER (Task 1): square particles and square rings. Task 5 polishes; keep the exported signature.
// Coordinates are art px; `speed` is art px per second; `life` is seconds.
import type { Frame } from './types';

const MAX_PARTS = 400;
const MAX_RINGS = 16;
const GRAVITY = 60; // art px / s^2 for sparks
const CONFETTI_FALL = 14; // art px / s, confetti flutters down instead of dropping

export class Fx {
  private x = new Float32Array(MAX_PARTS);
  private y = new Float32Array(MAX_PARTS);
  private vx = new Float32Array(MAX_PARTS);
  private vy = new Float32Array(MAX_PARTS);
  private age = new Float32Array(MAX_PARTS);
  private life = new Float32Array(MAX_PARTS);
  private kind = new Uint8Array(MAX_PARTS); // 0 = free, 1 = spark, 2 = confetti
  private colour: string[] = new Array<string>(MAX_PARTS).fill('#fff');
  private next = 0;
  private rx = new Float32Array(MAX_RINGS);
  private ry = new Float32Array(MAX_RINGS);
  private rAge = new Float32Array(MAX_RINGS);
  private rSize = new Float32Array(MAX_RINGS);
  private rColour: string[] = new Array<string>(MAX_RINGS).fill('#fff');
  private rNext = 0;

  reset(): void {
    this.kind.fill(0);
    this.rSize.fill(0);
  }

  private spawn(k: number, x: number, y: number, vx: number, vy: number, life: number, c: string): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_PARTS; // oldest particle is reused when the pool is full
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
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(1, x, y, Math.cos(a) * s, Math.sin(a) * s - speed * 0.4, life * (0.6 + Math.random() * 0.4), colours[n % colours.length]);
    }
  }

  confetti(x: number, y: number, colours: readonly string[], count: number): void {
    for (let n = 0; n < count; n++) {
      this.spawn(2, x + (Math.random() - 0.5) * 8, y, (Math.random() - 0.5) * 50, -20 - Math.random() * 40, 2 + Math.random(), colours[n % colours.length]);
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

  /** Call each frame while on a streak. */
  fireTrail(x: number, y: number): void {
    const c = Math.random() < 0.5 ? '#ff7b00' : Math.random() < 0.5 ? '#ffd166' : '#e63946';
    this.spawn(1, x + (Math.random() - 0.5) * 8, y, (Math.random() - 0.5) * 10, 10 + Math.random() * 10, 0.35, c);
  }

  /** scrollPx = how far the ground moved down this frame; effects live on the ground and move with it. */
  update(dt: number, scrollPx: number): void {
    for (let i = 0; i < MAX_PARTS; i++) {
      const k = this.kind[i];
      if (!k) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.kind[i] = 0;
        continue;
      }
      if (k === 1) this.vy[i] += GRAVITY * dt;
      else {
        this.vx[i] *= 1 - Math.min(dt * 2, 1);
        this.vy[i] += (CONFETTI_FALL - this.vy[i]) * Math.min(dt * 2, 1);
      }
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt + scrollPx;
    }
    for (let i = 0; i < MAX_RINGS; i++) {
      if (!this.rSize[i]) continue;
      this.rAge[i] += dt;
      this.ry[i] += scrollPx;
      if (this.rAge[i] > 0.45) this.rSize[i] = 0;
    }
  }

  draw(f: Frame): void {
    const { rect } = f.art;
    for (let i = 0; i < MAX_PARTS; i++) {
      const k = this.kind[i];
      if (!k) continue;
      const s = k === 2 ? 2 : this.age[i] < this.life[i] * 0.5 ? 2 : 1;
      rect(this.x[i], this.y[i], s, s, this.colour[i]);
    }
    for (let i = 0; i < MAX_RINGS; i++) {
      if (!this.rSize[i]) continue;
      // Grows to `size` * 2 art px across, as a hollow square of 1 px edges.
      const r = Math.round(2 + (this.rAge[i] / 0.45) * this.rSize[i] * 2);
      const x = Math.round(this.rx[i]);
      const y = Math.round(this.ry[i]);
      const c = this.rColour[i];
      rect(x - r, y - (r >> 1), r * 2, 1, c);
      rect(x - r, y + (r >> 1), r * 2, 1, c);
      rect(x - r, y - (r >> 1), 1, r, c);
      rect(x + r, y - (r >> 1), 1, r + 1, c);
    }
  }

  /** 0..1, white streaks at the screen edges. */
  speedLines(f: Frame, amount: number): void {
    if (amount <= 0 || f.lowFx) return;
    const { rect } = f.art;
    const v = f.view;
    const n = Math.round(amount * 6);
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      const x = left ? 1 + ((i * 3) % Math.max(1, v.roadX - 2)) : v.w - 2 - ((i * 3) % Math.max(1, v.roadX - 2));
      const y = ((f.time * 260 + i * 53) % (v.h + 30)) - 20;
      rect(x, y, 1, 10, '#ffffff');
    }
  }
}
