// The night-market skyline: Lau Pa Sat in front of the CBD towers, drawn in code on a tiny canvas and upscaled crisp.
// Used behind /leaderboard and /board, and later behind the phone screens in portrait.
//
//   const sky = startSkyline(canvas, { towerX: () => 0.58 });   // canvas: CSS-sized, class "pix-crisp"
//   sky.stop();
//
// It lays itself out from the real canvas size: the ground is a fixed share of the height, towers are scaled to the
// sky above it, Lau Pa Sat narrows on a narrow canvas, and stalls that would not fit are dropped. Art pixels are
// about 1/360 of the width on landscape screens (5 CSS px on 1080p) and about 1/210 of the height in portrait.
import { createPixelCanvas, hash, reducedMotion, type PixelCanvas } from './pixelCanvas';

export interface SkylineOptions {
  /** Where the clock tower stands, as a fraction (0..1) of the canvas width, or a function re-read every frame so the
   *  page can point it at a gap in its layout. Default 0.62 on landscape, 0.5 in portrait. */
  towerX?: number | (() => number);
  /** Where the moon hangs, as a fraction of the canvas width. Default 0.85. */
  moonX?: number;
  /** Draws extra things over the finished scene each frame (Learn's fence), told where the street and Lau Pa Sat are. */
  afterDraw?: (px: PixelCanvas, at: SkylineLayout) => void;
}

/** Where things ended up this frame, in art pixels. */
export interface SkylineLayout {
  /** Ground line (top of the street). */
  groundY: number;
  /** Street height. */
  streetH: number;
  /** Lau Pa Sat's centre and half-width at street level. */
  hallX: number;
  hallHalfW: number;
  t: number;
  frame: number;
}

export interface SkylineHandle {
  stop(): void;
}

const SKY = ['#0b1030', '#121a47', '#1a2560', '#243279', '#31408f', '#4a55a8'];
const BACK = '#161c40';
const TW = ['#1a2148', '#232c5c', '#2c3870'];
const LIT = ['#ffe08a', '#8fd3ff', '#ffe08a'];
const UNLIT = '#0f1433';
const STREET = '#1c1c2e';
const BULBS = ['#e63946', '#ffd166', '#52e08a', '#8ecae6', '#9b5de5'];
const SHIRTS = ['#e63946', '#ffd166', '#52e08a', '#8ecae6', '#9b5de5', '#f15bb5'];

const skylineScale = (cw: number, ch: number): number =>
  ch > cw ? Math.max(2, Math.round(ch / 210)) : Math.max(2, Math.round(cw / 360));

interface Smoke { x: number; y: number; life: number }
interface Walker { x: number; d: number; sp: number; c: string; lane: number; placed: boolean }

export function startSkyline(canvas: HTMLCanvasElement, opts: SkylineOptions = {}): SkylineHandle {
  const px = createPixelCanvas(canvas, { scale: skylineScale, fps: reducedMotion ? 2 : 15, minWidth: 80, minHeight: 120 });
  const { ctx } = px;
  const R = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const trap = (cx: number, y0: number, y1: number, w0: number, w1: number, c: string, c2: string) => {
    for (let y = y0; y < y1; y++) {
      const w = w0 + ((w1 - w0) * (y - y0)) / (y1 - y0);
      R(cx - w / 2, y, w, 1, (y - y0) % 3 === 2 ? c2 : c);
    }
  };

  const smoke: Smoke[] = [];
  const walkers: Walker[] = Array.from({ length: 14 }, (_, i) => ({
    x: 0,
    d: hash(i, 31) > 0.5 ? 1 : -1,
    sp: 0.15 + hash(i, 32) * 0.25,
    c: SHIRTS[i % 6],
    lane: hash(i, 33),
    placed: false,
  }));

  px.run((time, frame) => {
    const W = px.w;
    const H = px.h;
    const t = reducedMotion ? 20 : time;
    const f = reducedMotion ? 0 : frame;
    const gh = Math.max(32, Math.round(H * 0.22)); // street height
    const GY = H - gh; // ground line
    const k = GY / 150; // vertical scale for the towers

    // ---- sky ----
    const band = Math.ceil((GY / 6) * 0.8);
    SKY.forEach((c, i) => R(0, i * band, W, band + 1, c));
    R(0, band * 6, W, GY, SKY[5]);
    const stars = Math.round(W * 0.14);
    for (let i = 0; i < stars; i++) if (Math.sin(t * 1.5 + i * 2.3) > -0.3) R(hash(i, 40) * W, hash(i, 41) * GY * 0.46, 1, 1, '#fff');
    const mx = Math.round(W * (opts.moonX ?? 0.85));
    const my = Math.round(GY * 0.15);
    for (let dy = -6; dy <= 6; dy++) {
      const half = Math.round(Math.sqrt(36 - dy * dy));
      R(mx - half, my + dy, half * 2 + 1, 1, '#fff7c8');
    }
    R(mx + 2, my - 4, 3, 3, '#e6dca0');
    ([[GY * 0.09, 3, 1.2, 0.2], [GY * 0.23, 4, 0.7, 0.7]] as const).forEach(([y, s, sp, o]) => {
      const span = W + s * 14;
      const x = ((o * span + t * sp * 3) % span) - s * 7;
      R(x, y + s, s * 7, s, '#3a479a');
      R(x + s, y, s * 4, s, '#3a479a');
    });
    {
      const px0 = ((t * 9) % (W + 60)) - 30;
      const py = Math.round(GY * 0.2);
      R(px0, py, 5, 1, '#cfd6ff');
      R(px0 + 1, py - 1, 1, 1, '#cfd6ff');
      if (f % 10 < 5) R(px0 + 5, py, 1, 1, '#ff3b3b');
    }

    // ---- CBD ----
    for (let x = 0; x < W; x += 11) {
      const h = (30 + hash(x, 9) * 50) * k;
      R(x, GY - h, 10, h, BACK);
    }
    for (let i = 0, x = -6; x < W; i++) {
      const w = 14 + Math.round(hash(i, 1) * 14);
      const h = Math.round((52 + hash(i, 2) * 74) * k);
      const c = i % 3;
      const top = Math.floor(hash(i, 4) * 4);
      const y = GY - h;
      R(x, y, w, h, TW[c]);
      R(x, y, 2, h, TW[(c + 1) % 3]);
      if (top === 0) {
        R(x + w / 2, y - 9, 1, 9, TW[c]);
        if (f % 20 < 10) R(x + w / 2, y - 10, 1, 1, '#ff3b3b');
      }
      if (top === 1) trap(x + w / 2, y - 6, y, 2, w, TW[c], TW[c]);
      if (top === 2) R(x + 3, y - 4, w - 6, 4, TW[c]);
      for (let wy = y + 4; wy < GY - 4; wy += 4)
        for (let wx = x + 3; wx < x + w - 3; wx += 3) {
          const on = hash(wx * 7 + i, wy + Math.floor(t / 2.5 + hash(wx, wy) * 9)) > 0.52;
          R(wx, wy, 2, 2, on ? LIT[(wx + wy) % 3] : UNLIT);
        }
      x += w + 1 + Math.round(hash(i, 3) * 3);
    }

    // ---- Lau Pa Sat ----
    const hw = Math.max(40, Math.min(78, Math.round(W * 0.2)));
    const u = hw / 78;
    const frac = typeof opts.towerX === 'function' ? opts.towerX() : (opts.towerX ?? (W > H ? 0.62 : 0.5));
    const LX = Math.round(Math.max(hw + 2, Math.min(W - hw - 2, frac * W)));
    const roof = '#c8553d';
    const roofD = '#a23f2d';
    const cream = '#f1e3c4';
    const iron = '#2f7d5b';
    const glow = '#ffb347';
    trap(LX, GY - 88, GY - 74, 2, 22, roof, roofD);
    R(LX, GY - 94, 1, 6, cream);
    R(LX - 1, GY - 92, 3, 1, cream);
    R(LX - 9, GY - 74, 18, 26, cream);
    R(LX - 9, GY - 74, 2, 26, '#d8c9a6');
    R(LX - 10, GY - 75, 20, 2, iron);
    const CY = GY - 63;
    for (let dy = -5; dy <= 5; dy++) {
      const half = Math.round(Math.sqrt(25 - dy * dy));
      R(LX - half, CY + dy, half * 2 + 1, 1, '#fffbe8');
    }
    {
      const a = t * 0.4;
      const a2 = t * 0.05;
      for (let n = 1; n <= 4; n++) R(LX + Math.sin(a) * n, CY - Math.cos(a) * n, 1, 1, '#2a1608');
      for (let n = 1; n <= 3; n++) R(LX + Math.sin(a2) * n, CY - Math.cos(a2) * n, 1, 1, '#2a1608');
    }
    R(LX - 3, GY - 55, 6, 6, glow);
    trap(LX, GY - 50, GY - 37, 46 * u, 104 * u, roof, roofD);
    R(LX - 52 * u, GY - 37, 104 * u, 7, cream);
    for (let x = LX - 49 * u; x < LX + 50 * u; x += 6) R(x, GY - 35, 3, 4, f % 40 < 38 || hash(x, 1) > 0.2 ? glow : '#e09030');
    trap(LX, GY - 30, GY - 17, 112 * u, 2 * hw, roof, roofD);
    trap(LX, GY - 34, GY - 17, 2, 34 * u, cream, cream);
    R(LX - 3, GY - 26, 6, 6, glow);
    R(LX - hw, GY - 17, 2 * hw, 17, cream);
    R(LX - hw, GY - 17, 2 * hw, 2, iron);
    const step = Math.max(10, Math.round(12 * u));
    const aw = step - 4;
    let ax = LX - hw + 4;
    for (; ax < LX + hw - step; ax += step) {
      R(ax + 1, GY - 12, aw, 12, glow);
      R(ax + 2, GY - 13, aw - 2, 1, glow);
      R(ax + 3, GY - 14, aw - 4, 1, glow);
      R(ax - 2, GY - 15, 2, 15, iron);
      R(ax + 1 + Math.floor(aw / 3), GY - 7, 1, 7, '#7a4a1e');
      R(ax + 1 + Math.floor((2 * aw) / 3), GY - 6, 1, 6, '#7a4a1e');
    }
    R(ax - 2, GY - 15, 2, 15, iron);

    // ---- street ----
    R(0, GY, W, gh, STREET);
    for (let x = 0; x < W; x += 16) R(x, GY + Math.round(gh * 0.5), 8, 1, '#4a4a66');
    for (let i = 0, x = 8; x < W; i++, x += 10.2) {
      const y = GY - 22 + Math.sin((x / W) * Math.PI * 3) * 4 + 3;
      R(x, y, 1, 1, '#333');
      if ((i + ((f / 6) | 0)) % 3) R(x, y + 1, 2, 2, BULBS[i % 5]);
    }

    // satay stalls: outside the building if there is room, else at both edges in front of it
    const clear = (x: number) => x + 22 < LX - hw || x > LX + hw;
    let stallXs = [W * 0.05, W * 0.2, W * 0.94 - 22, W * 0.8 - 22].map(Math.round).filter(clear);
    if (stallXs.length < 2) stallXs = [1, W - 23];
    const stallCols = ['#e63946', '#ffd166', '#52e08a', '#e63946'];
    stallXs.forEach((x, i) => {
      const c = stallCols[i % 4];
      R(x, GY + 2, 22, 9, '#6b4423');
      R(x + 1, GY + 3, 20, 2, '#8a5a30');
      R(x, GY - 9, 1, 11, '#444');
      R(x + 21, GY - 9, 1, 11, '#444');
      for (let n = 0; n < 22; n += 4) {
        R(x + n, GY - 12, 2, 4, c);
        R(x + n + 2, GY - 12, 2, 4, '#fff');
      }
      R(x + 4, GY, 12, 2, '#ff6b35');
      for (let n = 0; n < 4; n++) R(x + 5 + n * 3, GY - 1, 1, 3, '#c98b4a');
      if (!reducedMotion && f % 5 === i % 5) smoke.push({ x: x + 6 + Math.random() * 10, y: GY - 2, life: 1 });
    });
    for (const s of smoke) {
      s.life -= 0.022;
      s.y -= 0.45;
      s.x += Math.sin(s.y * 0.2) * 0.3;
      const sz = s.life > 0.6 ? 2 : s.life > 0.3 ? 3 : 2;
      ctx.globalAlpha = Math.max(0, s.life) * 0.7;
      R(s.x, s.y, sz, sz, '#e8e8f0');
      ctx.globalAlpha = 1;
    }
    for (let i = smoke.length - 1; i >= 0; i--) if (smoke[i].life <= 0) smoke.splice(i, 1);

    // people
    const crowd = Math.min(walkers.length, Math.round(W / 36) + 2);
    const lanes = Math.min(14, gh - 20);
    for (let i = 0; i < crowd; i++) {
      const p = walkers[i];
      if (!p.placed) {
        p.x = hash(i, 30) * W;
        p.placed = true;
      }
      if (!reducedMotion) p.x += p.d * p.sp;
      if (p.x > W + 4) p.x = -4;
      if (p.x < -4) p.x = W + 4;
      const y = GY + 9 + Math.round(p.lane * lanes);
      const b = (f + i * 2) % 8 < 4 ? 0 : 1;
      R(p.x, y - 6 - b, 2, 2, '#f1c9a0');
      R(p.x - 1, y - 4 - b, 4, 3, p.c);
      R(p.x - (b ? 1 : 0), y - 1, 1, 2, '#222');
      R(p.x + 1 + (b ? 1 : 0), y - 1, 1, 2, '#222');
    }

    // beaver cameo, carrying a satay stick
    {
      const x = ((t * 6) % (W + 40)) - 20;
      const y = GY + Math.min(22, gh - 10) + (f % 4 < 2 ? 0 : -1);
      R(x - 9, y + 1, 5, 4, '#7d4318');
      R(x - 5, y - 1, 12, 7, '#a85f2a');
      R(x - 3, y + 6, 3, 2, '#7d4318');
      R(x + 3, y + 6, 3, 2, '#7d4318');
      R(x + 5, y - 3, 7, 7, '#a85f2a');
      R(x + 6, y - 5, 2, 2, '#7d4318');
      R(x + 10, y, 3, 3, '#f3d3a5');
      R(x + 13, y, 1, 2, '#2a1608');
      R(x + 9, y - 1, 1, 1, '#2a1608');
      R(x + 11, y + 3, 2, 2, '#fff');
      R(x + 12, y - 4, 1, 6, '#c98b4a');
      R(x + 11, y - 6, 3, 3, '#b5651d');
    }

    opts.afterDraw?.(px, { groundY: GY, streetH: gh, hallX: LX, hallHalfW: hw, t, frame: f });
  });

  return { stop: () => px.stop() };
}
