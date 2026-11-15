// "Closed" screen scene: a pixel-art forest where beavers wander, gnaw a log and swim in a pond.
// Everything is drawn with filled rectangles on a tiny canvas that CSS scales up with crisp pixels,
// so there are no image files. Positions are fractions of the canvas, so any phone shape works.
import { reducedMotion } from '../game/perf';

const PX = 4; // CSS pixels per art pixel
const TICK_MS = 1000 / 15; // chunky 15 fps, like an old game

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
  firefly: '#fff27a',
};

/** Cheap deterministic noise so the grass looks scattered but never flickers. */
function hash(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

interface Chip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export function startForest(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!;
  let w = 0;
  let h = 0;
  const size = () => {
    w = canvas.width = Math.max(40, Math.ceil(canvas.clientWidth / PX));
    h = canvas.height = Math.max(60, Math.ceil(canvas.clientHeight / PX));
    ctx.imageSmoothingEnabled = false;
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(canvas);

  const rect = (x: number, y: number, rw: number, rh: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), rw, rh);
  };

  // ---------- scene state ----------
  let t = 0; // seconds
  let frame = 0;
  const chips: Chip[] = [];
  const logLen = { v: 1 }; // fraction of the log left
  let logReset = 0;
  const walker = { x: 0.15, dir: 1, carry: true };
  const swimmer = { x: 0.35, dir: 1, slap: 0 };

  // ---------- pieces ----------
  const horizon = () => Math.floor(h * 0.36);
  const pond = () => ({ cx: w * 0.5, cy: h * 0.66, rx: w * 0.4, ry: h * 0.07 });

  function drawSky(): void {
    const hy = horizon();
    const band = Math.ceil(hy / C.sky.length);
    C.sky.forEach((c, i) => rect(0, i * band, w, band + 1, c));
    // sun with a pixel halo
    const sx = Math.round(w * 0.72);
    const sy = Math.round(hy * 0.62);
    for (let dy = -7; dy <= 7; dy++) {
      const half = Math.round(Math.sqrt(49 - dy * dy));
      rect(sx - half, sy + dy, half * 2 + 1, 1, Math.abs(dy) > 5 ? C.sunEdge : C.sun);
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
    const ellipse = (rx: number, ry: number, color: string, dy = 0) => {
      for (let y = -Math.round(ry); y <= Math.round(ry); y++) {
        const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
        rect(p.cx - half, p.cy + y + dy, half * 2, 1, color);
      }
    };
    ellipse(p.rx + 3, p.ry + 3, C.dirtDark, 1);
    ellipse(p.rx + 2, p.ry + 2, C.dirt);
    ellipse(p.rx, p.ry, C.water);
    ellipse(p.rx * 0.78, p.ry * 0.7, C.waterMid, -1);
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
    const baseY = Math.round(h * 0.9);
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
    const y = Math.round(h * 0.8);
    const step = reducedMotion ? 0 : Math.round(Math.sin(frame * 0.9) * 1.5);
    const bob = reducedMotion ? 0 : frame % 4 < 2 ? 0 : -1;
    beaver(w * walker.x, y + bob, walker.dir, { step, stick: walker.carry });
  }

  function drawGnawer(): void {
    const baseY = Math.round(h * 0.9);
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
    const biting = frame % 6 < 3;
    const hd = reducedMotion ? 0 : biting ? 2 : -1;
    // The beaver faces left toward the log, sitting upright-ish with its head bobbing into the wood.
    beaver(end + 15, baseY - 6, -1, { sit: true, headDy: hd });
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
    const y = Math.round(p.cy + p.ry * 0.1) + bob;
    const d = swimmer.dir;
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
    if (!reducedMotion && slapAt > 4.2 && slapAt < 5) {
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
    oak(Math.round(w * 0.06), Math.round(h * 0.55), Math.round(h * 0.2), 13, sway * 1.2);
    pine(Math.round(w * 0.95), Math.round(h * 0.5), Math.round(h * 0.34), sway);
    // tufts, flowers and a toadstool in the grass
    for (let i = 0; i < 16; i++) {
      const gx = Math.round(hash(i, 11) * w);
      const gy = Math.round(h * 0.72 + hash(i, 12) * h * 0.26);
      if (gy > h * 0.88 && gx < w * 0.58) continue; // keep the log area clear
      rect(gx, gy - 2, 1, 3, C.grassDark);
      rect(gx + 1, gy - 3, 1, 4, C.grassLight);
      rect(gx + 2, gy - 1, 1, 2, C.grassDark);
      if (i % 5 === 0) rect(gx + 1, gy - 5, 2, 2, C.flower);
    }
    const mx = Math.round(w * 0.82);
    const my = Math.round(h * 0.93);
    rect(mx, my - 5, 5, 2, C.mush);
    rect(mx + 1, my - 6, 3, 1, C.mush);
    rect(mx + 1, my - 5, 1, 1, C.tooth);
    rect(mx + 2, my - 3, 1, 3, C.cream);
  }

  function drawFireflies(): void {
    for (let i = 0; i < 9; i++) {
      const x = hash(i, 21) * w + Math.sin(t * 0.6 + i * 2) * 5;
      const y = h * 0.4 + hash(i, 22) * h * 0.4 + Math.cos(t * 0.8 + i) * 4;
      if (Math.sin(t * 2 + i * 1.7) > 0.2) rect(x, y, 1, 1, C.firefly);
    }
  }

  // ---------- loop ----------
  let last = performance.now();
  let acc = 0;
  let raf = 0;
  let alive = true;
  const render = () => {
    drawSky();
    drawClouds();
    drawHills();
    drawBackTrees();
    drawGround();
    drawPond();
    drawLodge();
    drawSwimmer();
    drawWalker();
    drawGnawer();
    drawChips();
    drawFront();
    drawFireflies();
  };
  const loop = (now: number) => {
    if (!alive) return;
    acc += Math.min(now - last, 250);
    last = now;
    if (acc >= TICK_MS) {
      acc %= TICK_MS;
      t += 1 / 15;
      frame++;
      render();
    }
    raf = requestAnimationFrame(loop);
  };
  render();
  raf = requestAnimationFrame(loop);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
  };
}
