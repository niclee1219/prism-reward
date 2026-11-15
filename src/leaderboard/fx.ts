// Full-screen effects for the /leaderboard hype screen: rising embers, confetti cannons, sparks and sound.
// Everything is drawn on one canvas behind the UI, plus a short burst layer on top via `burst`.
import { reducedMotion } from '../game/perf';

const CONFETTI = ['#e63946', '#ffd166', '#52e08a', '#8ecae6', '#b388ff', '#f15bb5', '#ffffff'];
const EMBER = ['#ff9f1c', '#ffbf69', '#ff6b35', '#ffd166', '#e63946'];

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  size: number;
  life: number;
  max: number;
  colour: string;
  kind: 'ember' | 'conf' | 'spark' | 'emoji';
  spin: number;
  rot: number;
  /** Only for kind 'emoji'. */
  text?: string;
}

export class Fx {
  private ctx: CanvasRenderingContext2D;
  private bits: Bit[] = [];
  private w = 0;
  private h = 0;
  private last = performance.now();
  /** 0 = calm, 1 = inferno. Decays by itself; events push it up. */
  heat = 0.15;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      this.w = canvas.width = Math.floor(innerWidth * dpr);
      this.h = canvas.height = Math.floor(innerHeight * dpr);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    };
    resize();
    addEventListener('resize', resize);
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Raise the heat; the embers get thicker and faster for a few seconds. */
  boost(to: number): void {
    this.heat = Math.max(this.heat, to);
  }

  /** Confetti raining over the whole screen. */
  rain(amount: number): void {
    const n = reducedMotion ? Math.ceil(amount / 4) : amount;
    for (let i = 0; i < n; i++) {
      this.bits.push({
        x: Math.random() * this.w,
        y: -Math.random() * this.h * 0.6,
        vx: (Math.random() - 0.5) * 200,
        vy: 160 + Math.random() * 360,
        g: 40,
        size: (6 + Math.random() * 8) * this.scale(),
        life: 0,
        max: 6,
        colour: CONFETTI[(Math.random() * CONFETTI.length) | 0],
        kind: 'conf',
        spin: (Math.random() - 0.5) * 12,
        rot: Math.random() * 6,
      });
    }
  }

  /** Two confetti cannons firing in from the bottom corners. */
  cannons(amount: number): void {
    const n = reducedMotion ? Math.ceil(amount / 4) : amount;
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      const speed = (700 + Math.random() * 900) * this.scale();
      const dir = -Math.PI / 2 + (left ? 1 : -1) * (0.15 + Math.random() * 0.5);
      this.bits.push({
        x: left ? 0 : this.w,
        y: this.h,
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        g: 900 * this.scale(),
        size: (6 + Math.random() * 8) * this.scale(),
        life: 0,
        max: 4,
        colour: CONFETTI[(Math.random() * CONFETTI.length) | 0],
        kind: 'conf',
        spin: (Math.random() - 0.5) * 16,
        rot: Math.random() * 6,
      });
    }
  }

  /** A ring of sparks from a point, in CSS pixels. */
  sparks(cx: number, cy: number, amount: number, palette = EMBER): void {
    const n = reducedMotion ? Math.ceil(amount / 4) : amount;
    const dpr = this.w / innerWidth;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (200 + Math.random() * 900) * dpr;
      this.bits.push({
        x: cx * dpr,
        y: cy * dpr,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        g: 500 * dpr,
        size: (2 + Math.random() * 4) * dpr,
        life: 0,
        max: 0.6 + Math.random() * 0.9,
        colour: palette[(Math.random() * palette.length) | 0],
        kind: 'spark',
        spin: 0,
        rot: 0,
      });
    }
  }

  /**
   * One small emoji floating up from the bottom, like the reactions on a live video.
   * Kept deliberately smaller than the confetti, and capped so a busy room cannot bury the board.
   */
  emoji(glyph: string): void {
    if (this.bits.filter((b) => b.kind === 'emoji').length > 50) return;
    const dpr = this.w / innerWidth;
    const lane = 0.62 + Math.random() * 0.36; // drift up the right-hand side, away from the rows
    this.bits.push({
      x: this.w * lane,
      y: this.h - 24 * dpr,
      vx: 0,
      vy: -(150 + Math.random() * 130) * dpr,
      g: 0,
      size: (30 + Math.random() * 12) * dpr,
      life: 0,
      max: reducedMotion ? 1.6 : 3 + Math.random() * 1.2,
      colour: '#fff',
      kind: 'emoji',
      spin: Math.random() * 6.28,
      rot: 0,
      text: glyph,
    });
  }

  private scale(): number {
    return this.w / 1440;
  }

  private spawnEmbers(dt: number): void {
    const rate = (reducedMotion ? 6 : 26) + this.heat * (reducedMotion ? 20 : 150); // per second
    let n = rate * dt;
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n--;
      const s = this.scale();
      this.bits.push({
        x: Math.random() * this.w,
        y: this.h + 10,
        vx: (Math.random() - 0.5) * 40 * s,
        vy: -(60 + Math.random() * 160 + this.heat * 260) * s,
        g: 0,
        size: (1.5 + Math.random() * 3.5) * s,
        life: 0,
        max: 3 + Math.random() * 4,
        colour: EMBER[(Math.random() * EMBER.length) | 0],
        kind: 'ember',
        spin: Math.random() * 6,
        rot: 0,
      });
    }
  }

  private frame(now: number): void {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.heat = Math.max(0.12, this.heat - dt * 0.12);
    this.spawnEmbers(dt);

    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    // A glow along the bottom edge that breathes with the heat.
    const g = ctx.createLinearGradient(0, h, 0, h * (1 - 0.18 - this.heat * 0.3));
    g.addColorStop(0, `rgba(255,107,53,${0.12 + this.heat * 0.4})`);
    g.addColorStop(1, 'rgba(255,107,53,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const live: Bit[] = [];
    for (const b of this.bits) {
      b.life += dt;
      if (b.life > b.max) continue;
      b.vy += b.g * dt;
      b.x += (b.vx + (b.kind === 'ember' ? Math.sin(now / 400 + b.spin) * 30 : 0)) * dt;
      b.y += b.vy * dt;
      if (b.y > h + 40 && b.kind !== 'ember') continue;
      if (b.y < -40 && b.kind === 'ember') continue;
      if (b.kind === 'emoji') {
        const t = b.life / b.max;
        const pop = Math.min(1, b.life / 0.18); // quick pop-in
        ctx.globalAlpha = Math.max(0, Math.min(1, (1 - t) * 3));
        ctx.font = `${Math.round(b.size * (0.6 + 0.4 * pop))}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.text ?? '', b.x + Math.sin(now / 350 + b.spin) * 22 * (this.w / innerWidth), b.y);
        live.push(b);
        continue;
      }
      const fade = b.kind === 'conf' ? Math.min(1, (b.max - b.life) * 1.5) : 1 - b.life / b.max;
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = b.colour;
      if (b.kind === 'conf') {
        b.rot += b.spin * dt;
        const squash = Math.abs(Math.sin(b.rot));
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot * 0.5);
        ctx.fillRect(-b.size / 2, (-b.size / 2) * squash, b.size, b.size * squash + 1);
        ctx.restore();
      } else {
        if (b.kind === 'ember') ctx.shadowColor = b.colour;
        ctx.shadowBlur = b.kind === 'ember' ? 8 : 0;
        ctx.fillRect(b.x, b.y, b.size, b.size);
        ctx.shadowBlur = 0;
      }
      live.push(b);
    }
    ctx.globalAlpha = 1;
    this.bits = live.length > 900 ? live.slice(-900) : live;
    requestAnimationFrame((t) => this.frame(t));
  }
}

// ---------- sound: tiny synthesised stingers, no audio files ----------
export type Stinger = 'first' | 'king' | 'entry' | 'podium' | 'thud';

export class Sound {
  private ctx: AudioContext | null = null;
  muted = false;
  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture (browsers keep audio locked until then). */
  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
    } catch {
      /* no audio on this device */
    }
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime + at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + at + dur);
    g.gain.setValueAtTime(0.0001, c.currentTime + at);
    g.gain.exponentialRampToValueAtTime(vol, c.currentTime + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + at);
    o.stop(c.currentTime + at + dur + 0.05);
  }

  private noise(at: number, dur: number, vol: number): void {
    const c = this.ctx!;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource();
    s.buffer = buf;
    const g = c.createGain();
    g.gain.value = vol;
    s.connect(g).connect(c.destination);
    s.start(c.currentTime + at);
  }

  play(kind: Stinger): void {
    if (this.muted || !this.ready) return;
    switch (kind) {
      case 'first': // siren riser into a boom
        this.tone(220, 0, 0.9, 'sawtooth', 0.12, 880);
        this.tone(330, 0, 0.9, 'square', 0.05, 1320);
        this.tone(70, 0.9, 0.7, 'sine', 0.5, 30);
        this.noise(0.9, 0.5, 0.3);
        break;
      case 'king': // riser then a rising fanfare
        this.tone(180, 0, 0.8, 'sawtooth', 0.12, 720);
        this.noise(0.7, 0.4, 0.25);
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.8 + i * 0.11, 0.5, 'square', 0.09));
        this.tone(1047, 1.4, 1.2, 'triangle', 0.14);
        this.tone(65, 0.8, 0.8, 'sine', 0.5, 35);
        break;
      case 'podium':
      case 'entry': {
        const base = kind === 'podium' ? 392 : 330;
        this.tone(base / 2, 0, 0.35, 'sawtooth', 0.1, base * 2);
        [1, 1.25, 1.5].forEach((m, i) => this.tone(base * m, 0.35 + i * 0.08, 0.35, 'square', 0.08));
        this.tone(55, 0.35, 0.4, 'sine', 0.4, 30);
        break;
      }
      case 'thud':
        this.tone(110, 0, 0.25, 'sine', 0.45, 40);
        this.noise(0, 0.12, 0.18);
        break;
    }
  }
}
