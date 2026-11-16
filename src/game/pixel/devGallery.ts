// Dev-only sprite gallery for the pixel run (dev/sprites.html, served by `npx vite`; not a build input).
// Draws every exported drawing function of the pixel modules in a labelled grid, so whoever works on one module can
// screenshot it (`npm run shot -- /dev/sprites.html?t=1.2 out.png --w 1300 --h 1500`). It calls only the public
// interfaces, so it shows whatever the modules currently draw.
//   ?t=<seconds>  freeze time (repeatable shots); without it the gallery animates.
//   ?serve=<st>   show the serve scene at that many seconds in (default: two moments).
//   ?dish=<id>    dish for the serve scene.
//   ?only=<word>  only the sections whose title contains the word (e.g. obstacle, pickup, gate, runner, fx, street,
//                 serve), for a smaller, sharper screenshot.
// Math.random is replaced by a seeded generator, reset every frame, so effects look the same in every shot.
import { DISHES, dishById, isDishId } from '../../content/dishes';
import { OBSTACLE_KINDS, RunSim } from '../sim/RunSim';
import { Fx } from './Fx';
import { HAZARD_RED, LANE_COLOURS, P, TILE } from './palette';
import { GateSprite, drawObstacle, drawPickup } from './Props';
import { Runner } from './Runner';
import { SERVE_T, ServeScene } from './Serve';
import { Street } from './Street';
import { makeArt, type Frame } from './types';
import { depthY, laneX, makeView, type View } from './view';

const SCALE = 6; // CSS px per art px
const WIDTH = 216; // art px
const LABEL = 3; // art px reserved above each cell for its label
const SECTION = 5; // art px for a section title
const GAP = 4;

const q = new URLSearchParams(location.search);
const frozen = q.get('t') !== null && Number.isFinite(Number(q.get('t'))) ? Number(q.get('t')) : null;
const serveAt = q.get('serve') !== null && Number.isFinite(Number(q.get('serve'))) ? Number(q.get('serve')) : null;
const dishId = q.get('dish');
const dish = isDishId(dishId) ? dishById(dishId) : DISHES[0];
const only = (q.get('only') ?? '').toLowerCase();
let showing = true;

let seed = 1;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const canvas = document.getElementById('gallery') as HTMLCanvasElement;
const wrap = document.getElementById('wrap') as HTMLElement;
const ctx = canvas.getContext('2d', { alpha: false })!;
const art = makeArt(ctx);
const sim = new RunSim(() => 0.5);
/** A phone-sized view (390 x 605 CSS px stage at 4 px): what the street, gate and serve scene are laid out for. */
const phone = makeView(390, 605, 4);
const f: Frame = { art, view: phone, sim, dt: 1 / 60, time: 0, lowFx: false, reduced: false };

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fill the cell with the tiled floor first (false: the drawing fills the cell itself). */
  floor: boolean;
  draw(t: number): void;
}
const cells: Cell[] = [];

// --- layout: a simple flow, left to right, wrapping, with sections --------------------------------------------
let cx = GAP;
let cy = GAP;
let rowH = 0;
function label(text: string, x: number, y: number, cls = ''): void {
  const el = document.createElement('div');
  el.className = `lbl ${cls}`;
  el.textContent = text;
  el.style.left = `${x * SCALE}px`;
  el.style.top = `${y * SCALE}px`;
  wrap.append(el);
}
function section(title: string): void {
  showing = !only || title.toLowerCase().includes(only);
  if (!showing) return;
  if (rowH) newRow();
  label(title, GAP, cy, 'section');
  cy += SECTION;
}
function newRow(): void {
  cx = GAP;
  cy += rowH + GAP;
  rowH = 0;
}
function cell(name: string, w: number, h: number, draw: (t: number) => void, floor = true): void {
  if (!showing) return;
  if (cx + w > WIDTH - GAP && cx > GAP) newRow();
  label(name, cx, cy);
  cells.push({ x: cx, y: cy + LABEL, w, h, floor, draw });
  cx += w + GAP;
  rowH = Math.max(rowH, h + LABEL);
}

// Obstacles: x centre, y ground. Two ids each, in case a module varies by id.
section('Obstacles: drawObstacle(kind, x, y, id)');
for (const kind of OBSTACLE_KINDS) {
  cell(`${kind} id0`, 30, 30, (t) => {
    f.time = t;
    drawObstacle(f, kind, 15, 25, 0);
  });
}
for (const kind of OBSTACLE_KINDS) {
  cell(`${kind} id7`, 30, 30, (t) => {
    f.time = t;
    drawObstacle(f, kind, 15, 25, 7);
  });
}

section('Pickups: drawPickup(kind, x, y, id) at t, t+.1, t+.2, t+.3');
for (const dt of [0, 0.1, 0.2, 0.3]) {
  cell(`coin +${dt}`, 22, 22, (t) => {
    f.time = t + dt;
    drawPickup(f, 'coin', 11, 18, 3);
  });
}
for (const dt of [0, 0.3]) {
  cell(`tingkat +${dt}`, 22, 22, (t) => {
    f.time = t + dt;
    drawPickup(f, 'tingkat', 11, 19, 4);
  });
}

// Gates span the three lanes of the phone view, so their cells are a phone wide. They are tall enough for the
// tutorial's hint arrow bouncing above the arches.
const GATE_H = 50;
const GATE_GROUND = 44;
section('GateSprite: draw(y) spans the lanes; resolve(chosen, correct, ok) then update(dt)');
const gateCases: [string, number | null, [number, number, boolean] | null, number][] = [
  ['idle', null, null, 0],
  ['tutorial hint lane 1', 1, null, 0],
  ['right: chose 2, correct 2 (+0.15 s)', null, [2, 2, true], 0.15],
  ['wrong: chose 0, correct 2 (+0.15 s)', null, [0, 2, false], 0.15],
  ['right, later (+0.5 s)', null, [1, 1, true], 0.5],
  ['wrong, later (+0.5 s)', null, [0, 1, false], 0.5],
];
for (const [name, hint, res, after] of gateCases) {
  cell(name, phone.w, GATE_H, (t) => {
    f.time = t;
    const g = new GateSprite(hint);
    g.update(t % 1);
    if (res) {
      g.resolve(res[0], res[1], res[2]);
      g.update(after);
    }
    laneGuides(phone, GATE_H);
    g.draw(f, GATE_GROUND);
  });
}

section('Runner: draw(x, feet y) after update(dt, cadence, leanVel)');
const poses: [string, (r: Runner, t: number) => void][] = [
  ['run t', (r, t) => r.update(t, 1, 0)],
  ['run t+.06', (r, t) => r.update(t + 0.06, 1, 0)],
  ['run t+.12', (r, t) => r.update(t + 0.12, 1, 0)],
  ['run t+.18', (r, t) => r.update(t + 0.18, 1, 0)],
  ['fast x3', (r, t) => r.update(t, 3, 0)],
  ['idle x0.4', (r, t) => r.update(t, 0.4, 0)],
  ['lean left', (r, t) => r.update(t, 1, -4)],
  ['lean right', (r, t) => r.update(t, 1, 4)],
  ['hop(1) +.17', (r, t) => { r.update(t, 1, 0); r.hop(1); r.update(0.17, 1, 0); }],
  ['shield', (r, t) => { r.shieldOn = true; r.update(t, 1, 0); }],
  ['crash +.05', (r, t) => { r.update(t, 1, 0); r.crash(); r.update(0.05, 1, 0); }],
  ['crash +.15', (r, t) => { r.update(t, 1, 0); r.crash(); r.update(0.15, 1, 0); }],
  ['crash +.3', (r, t) => { r.update(t, 1, 0); r.crash(); r.update(0.3, 1, 0); }],
  ['crash +1', (r, t) => { r.update(t, 1, 0); r.crash(); r.update(1, 1, 0); }],
  ['cheer', (r, t) => { r.cheer(); r.update(t, 1, 0); }],
];
// Feet 8 px above the cell's bottom, so the tail and its outline under the beaver show in full.
for (const [name, pose] of poses) {
  cell(name, 30, 42, (t) => {
    f.time = t;
    const r = new Runner();
    pose(r, t);
    r.draw(f, 15, 34);
  });
}

section('Fx (0.25 s after firing): burst, ring, confetti, fireTrail; speedLines(1)');
const fxCases: [string, (fx: Fx) => void][] = [
  ['burst', (fx) => fx.burst(25, 22, ['#52e08a', '#ffd166', '#8ecae6'], 40, 45)],
  ['ring', (fx) => fx.ring(25, 22, '#ffd166', 7)],
  ['confetti', (fx) => fx.confetti(25, 8, ['#ffd166', '#e63946', '#52e08a', '#b388ff'], 30)],
  ['fireTrail x10', (fx) => { for (let i = 0; i < 10; i++) { fx.fireTrail(25, 30); fx.update(0.03, 0); } }],
];
for (const [name, fire] of fxCases) {
  cell(name, 50, 40, (t) => {
    f.time = t;
    const fx = new Fx();
    fire(fx);
    for (let i = 0; i < 5; i++) fx.update(0.05, 0);
    fx.draw(f);
  });
}

section('Street (phone view) and a scene');
cell('street travelled=0', phone.w, phone.h, (t) => {
  f.time = t;
  sim.travelled = 0;
  new Street().draw(f);
}, false);
cell('street + things, travelled=150*t, speedLines(1)', phone.w, phone.h, (t) => {
  f.time = t;
  sim.travelled = 150 * t;
  new Street().draw(f);
  const g = new GateSprite(null);
  g.draw(f, depthY(phone, 300));
  drawObstacle(f, 'trolley', laneX(phone, 0), depthY(phone, 200), 1);
  drawObstacle(f, 'cat', laneX(phone, 2), depthY(phone, 120), 2);
  for (let i = 0; i < 4; i++) drawPickup(f, 'coin', laneX(phone, 1), depthY(phone, 90 + i * 30), i);
  drawPickup(f, 'tingkat', laneX(phone, 2), depthY(phone, 40), 9);
  drawObstacle(f, 'uncle', laneX(phone, 0), depthY(phone, -30), 3);
  const r = new Runner();
  r.update(t, 1, 0);
  r.draw(f, laneX(phone, 1), phone.playerY);
  new Fx().speedLines(f, 1);
}, false);
section('Serve scene (side view)');
const serveTimes = serveAt !== null ? [Math.max(serveAt, SERVE_T.CUT)] : [SERVE_T.CUT + 0.1, SERVE_T.RAISE + 0.3, SERVE_T.THROW + 0.2, SERVE_T.LAND + 0.4];
for (const st of serveTimes) {
  cell(`serve st=${st.toFixed(2)}`, phone.w, phone.h, (t) => {
    f.time = t;
    const s = new ServeScene();
    s.start(dish);
    s.update(f, st);
    s.draw(f, st);
    // Mark the two points the World aims effects at.
    const d = s.dishPoint(phone);
    const tp = s.tablePoint(phone);
    art.rect(d.x, d.y, 1, 1, '#ff00ff');
    art.rect(tp.x, tp.y, 1, 1, '#00ffff');
  }, false);
}
showing = true;
newRow();
label('magenta dot = dishPoint, cyan dot = tablePoint; faint coloured ticks = lane centres', GAP, cy);
cy += LABEL + GAP;

/** Lane centre ticks under the gate cells, so lanes can be checked against the arches. */
function laneGuides(v: View, h: number): void {
  for (let l = 0; l < 3; l++) art.rect(laneX(v, l), h - 2, 1, 2, LANE_COLOURS[l]);
  art.rect(v.roadX, h - 1, 3 * v.laneW, 1, HAZARD_RED);
}

canvas.width = WIDTH;
canvas.height = cy;
canvas.style.width = `${WIDTH * SCALE}px`;
canvas.style.height = `${cy * SCALE}px`;
ctx.imageSmoothingEnabled = false;

function floor(c: Cell): void {
  art.rect(0, 0, c.w, c.h, TILE.base);
  for (let y = 0; y < c.h; y += 8) art.rect(0, y, c.w, 1, TILE.line);
  for (let x = 0; x < c.w; x += 8) art.rect(x, 0, 1, c.h, TILE.line);
}

function render(t: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  art.rect(0, 0, canvas.width, canvas.height, '#1b1b2f');
  for (const c of cells) {
    seed = 1;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.beginPath();
    ctx.rect(0, 0, c.w, c.h);
    ctx.clip();
    if (c.floor) floor(c);
    else art.rect(0, 0, c.w, c.h, P.ink);
    c.draw(t);
    ctx.restore();
  }
}

if (frozen !== null) render(frozen);
else {
  const tick = (now: number) => {
    render(now / 1000);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
(window as unknown as { __galleryReady?: boolean }).__galleryReady = true;
