// The pixel-art forest behind the thank-you card and the closed screen: beavers wander, gnaw a log and swim in a
// pond; birds fly, butterflies drift, leaves fall, a fish jumps and a bunny hops. celebrate() makes them all cheer.
// Everything is drawn with filled rectangles on a tiny canvas that CSS scales up with crisp pixels,
// so there are no image files. Positions are fractions of the canvas, so any phone shape works.
import { createPixelCanvas, hash, reducedMotion } from '../scene/pixelCanvas';

const PX = 4; // CSS pixels per art pixel
const FPS = 15; // chunky 15 fps, like an old game

const C = {
  sky: ['#6fc8f2', '#8fd6f6', '#aee2f7', '#cdeef2', '#e8f4dc', '#fbf3c8'],
  sun: '#fff7b0',
  sunEdge: '#ffe36e',
  cloud: '#ffffff',
  cloudShade: '#dcecf5',
  hillFar: '#86c1a6',
  hillMid: '#5fae83',
  pineDark: '#1f6b4a',
  pineMid: '#2d8a58',
  pineLight: '#43ab6b',
  leafDark: '#2f8f4a',
  leafMid: '#4cb35a',
  leafLight: '#7ad06a',
  trunk: '#6b4423',
  trunkLight: '#8a5a30',
  grass: '#58b85a',
  grassDark: '#47a24e',
  grassLight: '#76cf67',
  dirt: '#c9a66b',
  dirtDark: '#a98250',
  water: '#3ba3da',
  waterMid: '#5bbdeb',
  waterLight: '#a6e2f7',
  foam: '#e8f8ff',
  log: '#9c6b3a',
  logDark: '#774c25',
  logRing: '#e0b97f',
  chip: '#e9c48a',
  fur: '#9a5f2c',
  furDark: '#6d3f1b',
  furLight: '#b87a3e',
  cream: '#ecd0a0',
  tooth: '#ffffff',
  ink: '#2a1608',
  pink: '#f08f8a',
  reed: '#3e8f3e',
  reedTop: '#8a5a30',
  pad: '#3f9f4c',
  padLight: '#69c36a',
  flower: '#ff8fb0',
  mush: '#e8483f',
  ray: '#fff7b0',
  bunny: '#ffffff',
  bunnyShade: '#e6dada',
  fish: '#ff9f43',
  fishLight: '#ffc27a',
  autumn: '#e9a13b',
  heart: '#ff4f7b',
  heartLight: '#ffb3c6',
  spark: '#fff27a',
};
const FLOWERS = ['#ff8fb0', '#fff27a', '#ffffff', '#c9a4ff'];
const BUTTERFLIES = ['#f15bb5', '#ffd166', '#9b5de5'];
const CHEER = 1.8; // seconds a celebration lasts

interface Chip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  kind: 'heart' | 'spark';
}

interface Leaf {
  x: number;
  y: number;
  ph: number;
  fast: boolean;
}

export interface ForestOptions {
  /** Fraction of the height at the bottom that the page covers with its own buttons: creatures stay above it. */
  bottomInset?: number;
}

export interface ForestHandle {
  /** Stops the animation loop. Safe to call more than once. */
  stop(): void;
  /** Every creature answers: beavers jump, the bunny flips, the fish leaps, birds and butterflies swirl. */
  celebrate(): void;
}

export function startForest(canvas: HTMLCanvasElement, opts: ForestOptions = {}): ForestHandle {
  const px = createPixelCanvas(canvas, { scale: PX, fps: FPS, minWidth: 40, minHeight: 60 });
  const { rect, ellipse } = px;
  // Art size and clock, refreshed from px at the start of every draw.
  let w = px.w;
  let h = px.h;
  let t = 0; // seconds
  let frame = 0;

  // ---------- scene state ----------
  const chips: Chip[] = [];
  const logLen = { v: 1 }; // fraction of the log left
  let logReset = 0;
  const inset = opts.bottomInset ?? 0;
  const walker = { x: 0.15, dir: 1, carry: true };
  const swimmer = { x: 0.35, dir: 1, slap: 0 };
  type Bunny = { x: number; dir: number; ph: number; lo: number; hi: number; y: number };
  // The main bunny keeps to the far right, clear of the log and the gnawing beaver; a second one lives in the meadow
  // of the roomy layout (closed screen).
  const roomy = inset === 0;
  const bunnies: Bunny[] = [{ x: 0.86, dir: -1, ph: 0, lo: 0.82, hi: 0.93, y: 0.9 }];
  if (roomy) bunnies.push({ x: 0.3, dir: 1, ph: 2, lo: 0.14, hi: 0.46, y: 0.72 });
  const fish = { t: -1, next: 2.5 };
  const bits: Bit[] = [];
  const leaves: Leaf[] = [];
  let cheer = 0; // seconds of celebration left
  let floor = 0; // art y of the bottom of the play area: creatures live above it
  const dt = 1 / FPS;

  /** 0..1: how far through the current celebration we are (1 when none). */
  const cheerP = () => 1 - cheer / CHEER;
  /** A bounce for a creature during a celebration; `phase` makes them jump out of step. */
  function hop(phase: number, height = 8): number {
    if (cheer <= 0 || reducedMotion) return 0;
    const k = cheer / CHEER;
    return Math.round(Math.abs(Math.sin(cheerP() * Math.PI * 4 + phase)) * height * Math.min(1, k * 2.5));
  }
  function emit(x: number, y: number, kind: Bit['kind']): void {
    if (bits.length > 70) return;
    bits.push({ x, y, vx: (Math.random() - 0.5) * 1.2, vy: -(0.6 + Math.random() * 0.9), life: 1, kind });
  }

  // ---------- pieces ----------
  const horizon = () => Math.floor(h * 0.36);
  const pond = () => (roomy ? { cx: w * 0.5, cy: h * 0.5, rx: w * 0.4, ry: h * 0.085 } : { cx: w * 0.5, cy: floor * 0.66, rx: w * 0.4, ry: h * 0.07 });

  function drawSky(): void {
    const hy = horizon();
    const band = Math.ceil(hy / C.sky.length);
    C.sky.forEach((c, i) => rect(0, i * band, w, band + 1, c));
    // sun with a pixel halo
    const sx = Math.round(w * 0.72);
    const sy = Math.round(hy * 0.76);
    for (let dy = -7; dy <= 7; dy++) {
      const half = Math.round(Math.sqrt(49 - dy * dy));
      rect(sx - half, sy + dy, half * 2 + 1, 1, Math.abs(dy) > 5 ? C.sunEdge : C.sun);
    }
    // Twinkling rays; they stretch while everyone is celebrating.
    if (reducedMotion || frame % 30 < 15 || cheer > 0) {
      const far = cheer > 0 && !reducedMotion ? 15 : 11;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) rect(sx + dx * far - 1, sy + dy * far - 1, 2, 2, C.ray);
      if (cheer > 0 && !reducedMotion) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rect(sx + dx * 11 - 1, sy + dy * 11 - 1, 2, 2, C.ray);
    }
  }

  function drawBirds(): void {
    const hy = horizon();
    const boost = cheer > 0 && !reducedMotion ? 2.2 : 1;
    for (let i = 0; i < 3; i++) {
      const span = w + 20;
      const x = reducedMotion ? hash(i, 61) * w : ((t * (5 + i * 2) * boost + i * 40 + hash(i, 62) * 30) % span) - 10;
      const base = [h * 0.09, h * 0.19, hy * 0.85][i];
      const y = Math.round(base + (reducedMotion ? 0 : Math.sin(t * 2 + i) * 2 - (cheer > 0 ? Math.sin(cheerP() * Math.PI) * 4 : 0)));
      const up = reducedMotion ? true : (frame + i * 3) % (cheer > 0 ? 4 : 8) < (cheer > 0 ? 2 : 4);
      rect(x, y + (up ? 0 : 1), 2, 1, C.ink);
      rect(x + 2, y + (up ? 1 : 0), 1, 1, C.ink);
      rect(x + 3, y + (up ? 0 : 1), 2, 1, C.ink);
    }
  }

  function drawClouds(): void {
    const defs = [
      { y: 0.07, s: 4, speed: 1.6, o: 0.1 },
      { y: 0.17, s: 3, speed: 1.0, o: 0.55 },
      { y: 0.25, s: 5, speed: 0.7, o: 0.85 },
    ];
    for (const d of defs) {
      const span = w + d.s * 14;
      const x = ((d.o * span + t * d.speed * 3) % span) - d.s * 7;
      const y = Math.round(h * d.y);
      rect(x, y + d.s, d.s * 7, d.s, C.cloud);
      rect(x + d.s, y, d.s * 4, d.s, C.cloud);
      rect(x + d.s * 2, y - d.s, d.s * 2, d.s, C.cloud);
      rect(x, y + d.s * 2, d.s * 7, 1, C.cloudShade);
    }
  }

  function drawHills(): void {
    const hy = horizon();
    for (let x = 0; x < w; x++) {
      const far = hy - 4 - Math.round(4 + Math.sin(x * 0.07) * 3 + Math.sin(x * 0.19 + 1) * 1.5);
      rect(x, far, 1, hy - far + 1, C.hillFar);
      const mid = hy - Math.round(3 + Math.sin(x * 0.11 + 2) * 2);
      rect(x, mid, 1, 6, C.hillMid);
    }
  }

  function pine(x: number, base: number, ph: number, sway: number): void {
    const layers = Math.max(3, Math.round(ph / 5));
    rect(x - 1, base - 2, 2, 3, C.trunk);
    for (let i = 0; i < layers; i++) {
      const lw = 3 + i * 2 + Math.round(ph / 8);
      const y = base - 3 - (layers - i) * 3 - 1 + layers * 3;
      const k = (layers - i) / layers;
      const off = Math.round(sway * k);
      const yy = base - ph + i * Math.round((ph - 3) / layers);
      rect(x - Math.floor(lw / 2) + off, yy, lw, Math.round((ph - 3) / layers) + 2, C.pineMid);
      rect(x - Math.floor(lw / 2) + off, yy, Math.ceil(lw / 3), Math.round((ph - 3) / layers) + 2, C.pineDark);
      rect(x + Math.floor(lw / 2) - 1 + off, yy, 1, Math.round((ph - 3) / layers) + 2, C.pineLight);
      void y;
    }
  }

  function oak(x: number, base: number, th: number, cr: number, sway: number): void {
    rect(x - 2, base - th, 4, th, C.trunk);
    rect(x - 2, base - th, 1, th, C.trunkLight);
    rect(x + 2, base - 4, 4, 1, C.trunk); // a root flare
    for (let dy = -cr; dy <= cr; dy++) {
      const half = Math.round(Math.sqrt(cr * cr - dy * dy) * 1.15);
      const off = Math.round(sway * ((cr - dy) / (cr * 2)));
      const y = base - th - cr + dy;
      rect(x - half + off, y, half * 2, 1, C.leafMid);
      rect(x - half + off, y, Math.max(1, Math.round(half * 0.5)), 1, C.leafDark);
      if (dy < 0) rect(x + Math.round(half * 0.2) + off, y, Math.max(1, Math.round(half * 0.5)), 1, C.leafLight);
    }
  }

  function drawBackTrees(): void {
    const hy = horizon();
    const sway = reducedMotion ? 0 : Math.sin(t * 1.1);
    for (let x = 4; x < w; x += 9) {
      const hh = 10 + Math.round(hash(x, 7) * 6);
      pine(x + Math.round(hash(x, 3) * 3), hy + 7, hh, sway * 0.8);
    }
  }

  function drawGround(): void {
    const hy = horizon() + 6;
    rect(0, hy, w, h - hy, C.grass);
    for (let y = hy; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const n = hash(x, y);
        if (n < 0.1) rect(x, y, 2, 1, C.grassDark);
        else if (n > 0.94) rect(x, y, 1, 2, C.grassLight);
      }
    }
  }

  function drawPond(): void {
    const p = pond();
    ellipse(p.cx, p.cy + 1, p.rx + 3, p.ry + 3, C.dirtDark);
    ellipse(p.cx, p.cy, p.rx + 2, p.ry + 2, C.dirt);
    ellipse(p.cx, p.cy, p.rx, p.ry, C.water);
    ellipse(p.cx, p.cy - 1, p.rx * 0.78, p.ry * 0.7, C.waterMid);
    // Shimmer: light pixels that blink on and off at fixed spots.
    for (let i = 0; i < 26; i++) {
      const ax = p.cx + (hash(i, 1) - 0.5) * p.rx * 1.7;
      const ay = p.cy + (hash(i, 2) - 0.5) * p.ry * 1.5;
      if (((t * 2 + hash(i, 3) * 6) % 3) < 1) rect(ax, ay, 2, 1, C.waterLight);
    }
    // Lily pads
    for (const [fx, fy, big] of [[-0.45, 0.2, 1], [0.5, 0.35, 0], [-0.1, -0.35, 0]] as const) {
      const lx = p.cx + fx * p.rx;
      const ly = p.cy + fy * p.ry;
      rect(lx, ly, 5 + big * 2, 2, C.pad);
      rect(lx + 1, ly, 2, 1, C.padLight);
      if (big) rect(lx + 3, ly - 1, 1, 1, C.flower);
    }
    // Reeds on the bank, swaying
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const rx = p.cx + side * (p.rx - 1 - i * 3);
        const ry = p.cy - p.ry * 0.5 + (side > 0 ? i * 2 : -i * 1) + p.ry * 0.4;
        const sw = reducedMotion ? 0 : Math.round(Math.sin(t * 1.6 + i + side) * 0.9);
        rect(rx, ry - 6, 1, 7, C.reed);
        rect(rx + sw, ry - 8, 1, 3, C.reed);
        rect(rx + sw, ry - 9, 1, 2, C.reedTop);
      }
    }
  }

  function drawLodge(): void {
    const p = pond();
    const bx = Math.round(p.cx + p.rx * 0.42);
    const by = Math.round(p.cy - p.ry * 0.25);
    for (let dy = 0; dy < 11; dy++) {
      const half = Math.round(Math.sqrt(Math.max(0, 1 - ((10 - dy) / 11) ** 2)) * 13);
      rect(bx - half, by - 10 + dy, half * 2, 1, dy % 3 === 0 ? C.logDark : C.log);
    }
    for (let i = -3; i <= 3; i++) rect(bx + i * 3, by - 8 + Math.abs(i), 3, 1, C.logRing); // stick ends
    rect(bx - 2, by - 3, 4, 4, '#2a1608'); // door
  }

  function drawLog(): void {
    const baseY = Math.round(floor * 0.9);
    const x0 = Math.round(w * 0.08);
    const full = Math.round(w * 0.46);
    const len = Math.max(0, Math.round(full * logLen.v));
    if (len < 4) return;
    rect(x0, baseY - 6, len, 7, C.log);
    rect(x0, baseY - 6, len, 2, '#b78247');
    rect(x0, baseY - 1, len, 2, C.logDark);
    for (let i = 4; i < len - 3; i += 7) rect(x0 + i, baseY - 4, 3, 1, C.logDark); // bark lines
    rect(x0 - 1, baseY - 5, 2, 5, C.logRing); // cut end on the left
    // The gnawed end on the right: ragged and pale
    rect(x0 + len - 1, baseY - 5, 2, 5, C.logRing);
    rect(x0 + len - 3, baseY - 6, 2, 1, C.chip);
    rect(x0 + len - 2, baseY, 2, 1, C.chip);
  }

  // ---------- beavers (side view, facing right when dir = 1) ----------
  function beaver(x: number, y: number, dir: number, o: { step?: number; headDy?: number; stick?: boolean; sit?: boolean }): void {
    const f = (dx: number) => Math.round(x + dx * dir); // mirror around x
    const box = (dx: number, dy: number, bw: number, bh: number, c: string) => {
      const a = f(dx);
      const b = f(dx + bw);
      rect(Math.min(a, b), Math.round(y + dy), Math.abs(b - a), bh, c);
    };
    const hd = o.headDy ?? 0;
    // tail: flat paddle with cross-hatching
    box(-9, 1, 5, 4, C.furDark);
    box(-8, 2, 1, 1, C.fur);
    box(-6, 3, 1, 1, C.fur);
    box(-5, 2, 1, 1, C.fur);
    // body
    box(-5, -1, 12, 7, C.fur);
    box(-4, -2, 10, 1, C.fur);
    box(-3, -3, 7, 1, C.furLight);
    box(-2, 3, 8, 3, C.furLight);
    // feet
    const s = o.sit ? 0 : o.step ?? 0;
    box(-3 + s, 6, 3, 2, C.furDark);
    box(3 - s, 6, 3, 2, C.furDark);
    // head
    box(5, -3 + hd, 7, 7, C.fur);
    box(6, -4 + hd, 5, 1, C.fur);
    box(6, -5 + hd, 2, 1, C.furDark); // ear
    box(10, 0 + hd, 3, 3, C.cream); // snout
    box(13, 0 + hd, 1, 2, C.ink); // nose
    box(11, 3 + hd, 1, 2, C.tooth); // buck teeth
    box(12, 3 + hd, 1, 2, C.tooth);
    box(9, -1 + hd, 1, 1, C.ink); // eye
    box(8, 1 + hd, 1, 1, C.pink); // cheek
    if (o.stick) {
      box(10, -1 + hd, 10, 1, C.logDark); // a branch carried in the teeth
      box(15, -3 + hd, 1, 2, C.logDark);
      box(17, -2 + hd, 1, 1, C.leafMid);
    }
  }

  function drawWalker(): void {
    const speed = 0.045;
    if (!reducedMotion) walker.x += walker.dir * speed * (1 / 15);
    if (walker.x > 0.86) walker.dir = -1;
    if (walker.x < 0.12) walker.dir = 1;
    const y = Math.round(floor * 0.8);
    const j = hop(0);
    const step = reducedMotion || j ? 0 : Math.round(Math.sin(frame * 0.9) * 1.5);
    const bob = reducedMotion ? 0 : frame % 4 < 2 ? 0 : -1;
    beaver(w * walker.x, y + bob - j, walker.dir, { step, stick: walker.carry && !j });
    if (j && frame % 3 === 0) emit(w * walker.x, y - j - 6, 'heart');
  }

  function drawGnawer(): void {
    const baseY = Math.round(floor * 0.9);
    const x0 = Math.round(w * 0.08);
    const full = Math.round(w * 0.46);
    if (logReset > 0) {
      logReset -= 1 / 15;
      if (logReset <= 0) logLen.v = 1;
    } else {
      logLen.v -= 0.0016 * (reducedMotion ? 0.3 : 1);
      if (logLen.v < 0.34) {
        logReset = 1.2; // a fresh log rolls in
        logLen.v = 0.33;
      }
    }
    drawLog();
    if (logReset > 0) return;
    const end = x0 + Math.round(full * logLen.v);
    const j = hop(2);
    const biting = frame % 6 < 3 && !j;
    const hd = reducedMotion ? 0 : j ? -1 : biting ? 2 : -1;
    // The beaver faces left toward the log, sitting upright-ish with its head bobbing into the wood.
    beaver(end + 15, baseY - 6 - j, -1, { sit: true, headDy: hd });
    if (j && frame % 3 === 0) emit(end + 17, baseY - 14 - j, 'heart');
    if (!reducedMotion && biting && frame % 6 === 0) {
      for (let i = 0; i < 3; i++) chips.push({ x: end + 1, y: baseY - 4, vx: -(0.3 + Math.random() * 1.2), vy: -(1 + Math.random() * 1.8), life: 1 });
    }
  }

  function drawSwimmer(): void {
    const p = pond();
    if (!reducedMotion) swimmer.x += swimmer.dir * 0.05 * (1 / 15);
    const lim = 0.5 * 0.62;
    const cx = p.cx / w;
    if (swimmer.x > cx + lim) swimmer.dir = -1;
    if (swimmer.x < cx - lim) swimmer.dir = 1;
    const bob = reducedMotion ? 0 : Math.round(Math.sin(t * 3));
    const x = Math.round(w * swimmer.x);
    const j = hop(1, 6);
    const y = Math.round(p.cy + p.ry * 0.1) + bob - j;
    const d = swimmer.dir;
    if (j && frame % 3 === 0) emit(x, y - 5, 'heart');
    // wake ripples
    const wob = Math.floor(frame / 3) % 3;
    for (let i = 0; i < 3; i++) {
      const rw = 6 + i * 5 + wob;
      rect(x - d * (3 + i * 4) - rw / 2, y + 3 + (i % 2), rw, 1, C.foam);
    }
    // body and head poking out of the water
    rect(x - 5 * d - (d < 0 ? 5 : 0), y, 6, 2, C.fur);
    const hx = d > 0 ? x : x - 6;
    rect(hx + d * 2, y - 2, 6, 4, C.fur);
    rect(hx + (d > 0 ? 6 : -1) + d, y - 1, 2, 2, C.cream);
    rect(hx + (d > 0 ? 8 : -2), y - 1, 1, 1, C.ink);
    rect(hx + (d > 0 ? 3 : 2), y - 3, 2, 1, C.furDark); // ear
    rect(hx + (d > 0 ? 5 : 0), y - 2, 1, 1, C.ink); // eye
    // an occasional tail slap with a splash
    swimmer.slap += 1 / 15;
    const slapAt = swimmer.slap % 6;
    const tx = x - d * 8;
    if (!reducedMotion && ((slapAt > 4.2 && slapAt < 5) || (cheer > 0 && frame % 6 < 3))) {
      rect(tx, y - 4, 2, 5, C.furDark);
      rect(tx - 1, y - 6, 4, 2, C.furDark);
      for (const [dx, dy] of [[-3, -7], [4, -8], [-5, -4], [6, -5], [0, -10]]) rect(tx + dx, y + dy, 1, 1, C.foam);
    } else {
      rect(tx, y, 4, 1, C.furDark);
    }
  }

  function drawChips(): void {
    for (const c of chips) {
      c.life -= 1 / 15;
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.35;
      rect(c.x, c.y, 1, 1, C.chip);
    }
    for (let i = chips.length - 1; i >= 0; i--) if (chips[i].life <= 0) chips.splice(i, 1);
  }

  function drawFront(): void {
    const sway = reducedMotion ? 0 : Math.sin(t * 1.1);
    // big trees framing the left and right edges
    const shake = cheer > 0 && !reducedMotion ? Math.sin(t * 14) * 1.2 : 0;
    oak(Math.round(w * 0.06), Math.round(h * 0.55), Math.round(h * 0.2), 13, sway * 1.2 + shake);
    pine(Math.round(w * 0.95), Math.round(h * 0.5), Math.round(h * 0.34), sway + shake);
    // tufts, flowers and a toadstool in the grass
    for (let i = 0; i < (roomy ? 40 : 24); i++) {
      const gx = Math.round(hash(i, 11) * w);
      const top = roomy ? 0.64 : 0.72;
      const gy = Math.round(floor * top + hash(i, 12) * (h - floor * top));
      if (gy > floor * 0.88 && gy < floor * 0.95 && gx < w * 0.58) continue; // keep the log area clear
      rect(gx, gy - 2, 1, 3, C.grassDark);
      rect(gx + 1, gy - 3, 1, 4, C.grassLight);
      rect(gx + 2, gy - 1, 1, 2, C.grassDark);
      if (i % 3 === 0) {
        const amp = cheer > 0 ? 2.2 : 0.8; // flowers nod harder when everyone cheers
        const s = reducedMotion ? 0 : Math.round(Math.sin(t * (cheer > 0 ? 7 : 2) + i) * amp);
        rect(gx + s, gy - 6, 3, 3, FLOWERS[i % FLOWERS.length]);
        rect(gx + 1 + s, gy - 5, 1, 1, '#ffb000');
      }
    }
    const mx = Math.round(w * 0.04);
    const my = Math.round(floor * 0.97);
    rect(mx, my - 5, 5, 2, C.mush);
    rect(mx + 1, my - 6, 3, 1, C.mush);
    rect(mx + 1, my - 5, 1, 1, C.tooth);
    rect(mx + 2, my - 3, 1, 3, C.cream);
  }

  // ---------- meadow (roomy layout only) ----------
  function bush(x: number, y: number, r: number, berries: string): void {
    ellipse(x, y + 1, r + 1, r * 0.62, C.leafDark);
    ellipse(x, y, r, r * 0.6, C.leafMid);
    ellipse(x - r * 0.25, y - r * 0.2, r * 0.55, r * 0.3, C.leafLight);
    for (let i = 0; i < 6; i++) rect(x + (hash(i, Math.round(x)) - 0.5) * r * 1.5, y + (hash(i, 9) - 0.4) * r * 0.7, 1, 1, berries);
  }
  function rock(x: number, y: number, rw: number): void {
    rect(x, y, rw, 3, '#9aa0a6');
    rect(x + 1, y - 1, rw - 2, 1, '#b8bec4');
    rect(x, y + 3, rw, 1, '#6e747a');
    rect(x + 1, y, 2, 1, '#d4d9dd');
  }
  function drawPath(): void {
    if (!roomy) return;
    // a dirt track winding from the pond down to the bottom of the screen
    for (let y = Math.round(h * 0.6); y < h; y++) {
      const cx = Math.round(w * 0.62 + Math.sin(y * 0.09) * 5);
      rect(cx - 6, y, 13, 1, C.dirtDark);
      rect(cx - 5, y, 11, 1, C.dirt);
      if (hash(y, 3) > 0.8) rect(cx - 3 + Math.round(hash(y, 4) * 6), y, 1, 1, C.dirtDark);
    }
  }
  function drawMeadow(): void {
    if (!roomy) return;
    bush(w * 0.1, h * 0.66, 8, '#e8483f');
    bush(w * 0.9, h * 0.65, 9, '#8f5bd6');
    bush(w * 0.82, h * 0.76, 6, '#e8483f');
    rock(w * 0.3, h * 0.67, 6);
    rock(w * 0.33, h * 0.675, 4);
    rock(w * 0.74, h * 0.695, 5);
    // flower patches
    for (const [fx, fy, c0] of [[0.22, 0.72, 0], [0.5, 0.7, 1], [0.78, 0.84, 2], [0.4, 0.8, 3]] as const) {
      for (let i = 0; i < 6; i++) {
        const x = w * fx + (hash(i, 31 + c0) - 0.5) * 14;
        const y = h * fy + (hash(i, 32 + c0) - 0.5) * 6;
        const sw = reducedMotion ? 0 : Math.round(Math.sin(t * (cheer > 0 ? 7 : 2) + i + c0));
        rect(x, y - 1, 1, 3, C.grassDark);
        rect(x + sw, y - 3, 2, 2, FLOWERS[(i + c0) % FLOWERS.length]);
      }
    }
  }

  // ---------- new life ----------
  function drawBunny(bunny: Bunny): void {
    const speedUp = cheer > 0 ? 0 : 1;
    if (!reducedMotion && speedUp) {
      bunny.ph += 0.12;
      bunny.x += bunny.dir * (Math.max(0, Math.sin(bunny.ph)) * 0.0035);
      if (bunny.x > bunny.hi) bunny.dir = -1;
      if (bunny.x < bunny.lo) bunny.dir = 1;
    }
    const base = floor * bunny.y;
    let q = 0;
    let lift = reducedMotion ? 0 : Math.round(Math.abs(Math.sin(bunny.ph)) * 3);
    if (cheer > 0 && !reducedMotion) {
      const p = cheerP();
      if (p < 0.7) {
        const k = p / 0.7; // two backflips in the first 70% of the cheer
        lift = Math.round(Math.sin(k * Math.PI) * 15);
        q = Math.floor(k * 8) % 4;
      }
    }
    const x = Math.round(w * bunny.x);
    const y = Math.round(base - lift);
    const parts: [number, number, number, number, string][] = [
      [0, 0, 6, 4, C.bunny],
      [0, 3, 6, 1, C.bunnyShade],
      [4, -2, 3, 3, C.bunny],
      [4, -5, 1, 3, C.bunny],
      [6, -5, 1, 3, C.bunny],
      [5, -4, 1, 2, C.pink],
      [6, -1, 1, 1, C.ink],
      [-1, 1, 1, 2, C.bunnyShade],
    ];
    for (const [rx, ry, rw, rh, c] of parts) {
      // mirror by direction, then rotate by q quarter turns around the middle of the body
      const px0 = bunny.dir > 0 ? rx - 3 : -(rx + rw) + 3;
      const py0 = ry - 1;
      const pts = [[px0, py0], [px0 + rw, py0 + rh]].map(([ax, ay]) => {
        let X = ax;
        let Y = ay;
        for (let i = 0; i < q; i++) [X, Y] = [-Y, X];
        return [X, Y];
      });
      const lx = Math.min(pts[0][0], pts[1][0]);
      const ly = Math.min(pts[0][1], pts[1][1]);
      rect(x + lx, y + ly, Math.max(1, Math.abs(pts[1][0] - pts[0][0])), Math.max(1, Math.abs(pts[1][1] - pts[0][1])), c);
    }
    if (cheer > 0 && frame % 4 === 0 && !reducedMotion) emit(x, y - 8, 'spark');
  }

  function drawFish(): void {
    if (reducedMotion) return;
    const p = pond();
    if (fish.t < 0) {
      fish.next -= dt;
      if (fish.next <= 0) fish.t = 0;
    } else {
      fish.t += dt;
      if (fish.t > 1.5) {
        fish.t = -1;
        fish.next = cheer > 0 ? 0.5 : 4 + hash(frame, 5) * 2;
      }
    }
    if (fish.t < 0) return;
    const ph = fish.t / 1.1;
    const fx = Math.round(p.cx - p.rx * 0.55 + ph * p.rx * 0.35);
    if (ph < 1) {
      const fy = Math.round(p.cy - Math.sin(ph * Math.PI) * 13);
      rect(fx, fy, 4, 2, C.fish);
      rect(fx + 1, fy, 2, 1, C.fishLight);
      rect(fx - 2, fy - 1, 2, 4, C.fish);
      rect(fx + 3, fy, 1, 1, C.ink);
    } else {
      const sx = Math.round(p.cx - p.rx * 0.55 + 0.35 * p.rx);
      for (const [dx, dy] of [[-2, -2], [2, -3], [0, -4], [-4, -1], [4, -1]]) rect(sx + dx, p.cy + dy, 1, 1, C.foam);
    }
  }

  function drawButterflies(): void {
    const swirl = cheer > 0 && !reducedMotion;
    for (let i = 0; i < 3; i++) {
      const sp = swirl ? 2.6 : 0.7;
      const ph = reducedMotion ? 0 : t;
      const x = w * (0.2 + i * 0.28) + Math.sin(ph * sp + i * 2) * w * 0.12;
      const y = floor * (0.64 + i * 0.1) + Math.sin(ph * sp * 1.8 + i) * 6 - (swirl ? Math.sin(cheerP() * Math.PI) * 8 : 0);
      const open = reducedMotion ? true : (frame + i) % (swirl ? 2 : 4) < (swirl ? 1 : 2);
      const c = BUTTERFLIES[i];
      rect(x, y, 1, 2, C.ink);
      if (open) {
        rect(x - 2, y - 1, 2, 3, c);
        rect(x + 1, y - 1, 2, 3, c);
      } else {
        rect(x - 1, y - 1, 1, 3, c);
        rect(x + 1, y - 1, 1, 3, c);
      }
    }
  }

  function drawLeaves(): void {
    if (reducedMotion) return;
    const gap = cheer > 0 ? 3 : 14;
    if (frame % gap === 0 && leaves.length < 40) {
      const fromOak = Math.random() < 0.5;
      leaves.push({ x: fromOak ? w * 0.06 + (Math.random() - 0.5) * 18 : w * 0.95 + (Math.random() - 0.5) * 10, y: h * 0.28 + Math.random() * h * 0.08, ph: Math.random() * 6, fast: cheer > 0 });
    }
    for (const l of leaves) {
      l.y += l.fast ? 0.9 : 0.5;
      l.x += Math.sin(l.y * 0.15 + l.ph) * 0.5 + 0.15;
      rect(l.x, l.y, 2, 1, l.ph > 3 ? C.autumn : C.leafLight);
    }
    for (let i = leaves.length - 1; i >= 0; i--) if (leaves[i].y > h) leaves.splice(i, 1);
  }

  function drawBits(): void {
    for (const b of bits) {
      b.life -= dt * 0.9;
      b.x += b.vx;
      b.y += b.vy;
      if (b.kind === 'heart') {
        rect(b.x, b.y, 1, 1, C.heart);
        rect(b.x + 2, b.y, 1, 1, C.heart);
        rect(b.x, b.y + 1, 3, 1, C.heart);
        rect(b.x + 1, b.y + 2, 1, 1, C.heart);
        rect(b.x, b.y, 1, 1, C.heartLight);
      } else {
        rect(b.x, b.y, 1, 1, C.spark);
        rect(b.x - 1, b.y + 1, 3, 1, C.spark);
        rect(b.x, b.y + 2, 1, 1, C.spark);
      }
    }
    for (let i = bits.length - 1; i >= 0; i--) if (bits[i].life <= 0) bits.splice(i, 1);
  }

  // ---------- loop ----------
  px.run((time, n) => {
    w = px.w;
    h = px.h;
    t = time;
    frame = n;
    if (n > 0 && !canvas.isConnected) {
      px.stop(); // the page removed us without calling stop(): do not leak the loop
      return;
    }
    floor = Math.round(h * (1 - inset));
    if (cheer > 0) cheer = Math.max(0, cheer - dt);
    drawSky();
    drawClouds();
    drawBirds();
    drawHills();
    drawBackTrees();
    drawGround();
    drawPath();
    drawPond();
    drawLodge();
    drawMeadow();
    drawFish();
    drawSwimmer();
    for (const b of bunnies) drawBunny(b);
    drawWalker();
    drawGnawer();
    drawChips();
    drawFront();
    drawButterflies();
    drawLeaves();
    drawBits();
  });

  return {
    stop: () => px.stop(),
    celebrate() {
      if (reducedMotion) return;
      cheer = CHEER;
      fish.next = Math.min(fish.next, 0.2);
      for (let i = 0; i < 14; i++) emit(Math.random() * w, floor * (0.6 + Math.random() * 0.3), i % 2 ? 'heart' : 'spark');
    },
  };
}
