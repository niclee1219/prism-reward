// Obstacles, pickups and the answer gate, drawn as pixel sprites in the hand of Learn's chef.
// One rule so a player at full speed can sort them in a glance: obstacles are cool, dark and angular and always
// stand on a red warning pad with a red-and-black band; coins and the tingkat are warm, round and glinting.
import type { ObstacleKind } from '../sim/RunSim';
import { HAZARD_BLACK, HAZARD_RED, LANE_COLOURS, P } from './palette';
import type { Art, Frame } from './types';
import { laneX } from './view';

// --- a mirrored box helper without per-call closures ------------------------------------------------------------
// Sprites are authored around x = 0 with y = 0 on the ground; D = -1 mirrors them. These are module state so the
// draw paths allocate nothing.
let R: Art['rect'] = () => {};
let X = 0;
let Y = 0;
let D = 1;
function at(rect: Art['rect'], x: number, y: number, dir: number): void {
  R = rect;
  X = x;
  Y = y;
  D = dir;
}
function b(dx: number, dy: number, w: number, h: number, c: string): void {
  R(D === 1 ? X + dx : X - dx - w, Y + dy, w, h, c);
}
/** The ink outline of a part: drawn for every part first, so the fills merge into one outlined silhouette. */
function o(dx: number, dy: number, w: number, h: number): void {
  b(dx - 1, dy - 1, w + 2, h + 2, P.ink);
}

const SHADOW = 'rgba(22, 22, 34, 0.35)';
const PAD_LIGHT = '#ef5b4b';

// Cool, dark materials for the hazards.
const SLATE = '#3a4a6b';
const SLATE_D = '#28334c';
const SLATE_L = '#5a6f99';
const FRAME_IN = '#1c232e';
const TRAY = '#2f5f8a';
const TRAY_D = '#22476a';
const TRAY_L = '#4f84b3';
const SIGN = '#2e3440';
const SIGN_D = '#20242d';
const SIGN_L = '#4c566a';
const SIGN_TEXT = '#8a93a6';
const CAUTION = '#ffd23f';
const PUDDLE = '#7fb8d8';
const NAVY = '#33415c';
const NAVY_D = '#243049';
const NAVY_L = '#4a5d82';
const SHORTS = '#5f6b7a';
const SHORTS_D = '#4a5462';
const HAIR = '#b8c0c8';
const UNCLE_TRAY = '#546e7a';
const UNCLE_TRAY_L = '#78909c';
const UNCLE_TRAY_D = '#37474f';
const BOWL = '#e3e9ee';
const SLIPPER = '#20242d';
const CAT = '#3b3b48';
const CAT_D = '#2a2a35';
const CAT_L = '#5a5a72';
const CAT_EYE = '#c7f464';

/** Half the width of the red warning pad, at most: 22 px wide. */
const PAD_HALF = 11;

/**
 * The red warning pad every obstacle stands on: 22 wide (narrower on narrow lanes, so pads in neighbouring lanes
 * never touch), red top, a red-and-black band along its front edge. half = half the width, outline included.
 */
function pad(half: number): void {
  const w = half * 2;
  b(-half, -6, w, 9, P.ink);
  b(1 - half, -5, w - 2, 5, HAZARD_RED);
  b(1 - half, -5, w - 2, 1, PAD_LIGHT);
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < w - 2; i += 1) b(1 - half + i, r, 1, 1, (i + 4 - r) % 4 < 2 ? HAZARD_BLACK : HAZARD_RED);
  }
}

/** A sway of -1, 0 or 1 at a chunky 6 fps, out of step between instances. */
function sway(time: number, id: number): number {
  const k = (Math.floor(time * 6) + id * 3) % 8;
  return k === 1 || k === 2 ? 1 : k === 5 || k === 6 ? -1 : 0;
}

/** x centre, y ground. */
export function drawObstacle(f: Frame, kind: ObstacleKind, x: number, y: number, id: number): void {
  at(f.art.rect, x, y, id % 2 ? -1 : 1);
  // Leave at least 2 px of floor between the pads of two neighbouring lanes.
  pad(Math.min(PAD_HALF, (f.view.laneW - 2) >> 1));
  switch (kind) {
    case 'stools':
      stools(f.time, id);
      break;
    case 'trolley':
      trolley(f.time, id);
      break;
    case 'wetfloor':
      wetFloor(f.time, id);
      break;
    case 'uncle':
      uncle(f.time, id);
      break;
    case 'cat':
      cat(f.time, id);
      break;
  }
}

/** A wobbly stack of slate plastic stools, legs splayed at the bottom; the top of the stack sways. */
function stools(time: number, id: number): void {
  const s = sway(time, id);
  ell(X, Y - 2, 9, 2, SHADOW);
  // outlines: splayed legs, three rims, the top seat
  o(-8, -7, 3, 6);
  o(5, -7, 3, 6);
  for (let k = 0; k < 3; k++) o(-7 + lean(k, s), -10 - 3 * k, 14, 3);
  o(-7 + lean(2, s), -20, 14, 4);
  // legs, the back pair in shade, a cut-out between the front pair
  b(-5, -7, 2, 4, SLATE_D);
  b(3, -7, 2, 4, SLATE_D);
  b(-8, -7, 3, 6, SLATE);
  b(5, -7, 3, 6, SLATE);
  b(-8, -7, 1, 6, SLATE_L);
  b(7, -7, 1, 6, SLATE_D);
  // stacked rims, bottom up, each with a dark lip under it
  for (let k = 0; k < 3; k++) {
    const dx = lean(k, s);
    b(-7 + dx, -10 - 3 * k, 14, 3, SLATE);
    b(-7 + dx, -8 - 3 * k, 14, 1, SLATE_D);
    b(-7 + dx, -10 - 3 * k, 1, 2, SLATE_L);
    b(-3 + dx, -9 - 3 * k, 6, 1, SLATE_D); // the leg cut-out showing through
  }
  // the top seat, seen from above, with its carry slot
  const dx = lean(2, s);
  b(-7 + dx, -20, 14, 4, SLATE_L);
  b(-7 + dx, -17, 14, 1, SLATE);
  b(-2 + dx, -19, 4, 1, P.ink);
}
/** How far rim k leans: the bottom of the stack is steady, the top sways most. */
function lean(k: number, s: number): number {
  return k === 0 ? 0 : k === 1 ? (s > 0 ? 1 : 0) : s;
}

/** A tray-return trolley: steel frame, stacked blue trays, a bowl left on top, wheels. */
function trolley(_time: number, _id: number): void {
  ell(X, Y - 2, 10, 2, SHADOW);
  o(-8, -22, 16, 1); // handle bar
  o(-8, -21, 1, 2);
  o(7, -21, 1, 2);
  o(-10, -19, 20, 16); // body, top face included
  o(-9, -3, 3, 2); // wheels
  o(6, -3, 3, 2);
  b(-8, -22, 16, 1, P.steelFront);
  b(-8, -21, 1, 2, P.steelDark);
  b(7, -21, 1, 2, P.steelDark);
  // top face: a tray stack seen from above, a bowl on it
  b(-10, -19, 20, 4, P.steelFront);
  b(-9, -18, 18, 2, TRAY_L);
  b(-9, -18, 18, 1, TRAY);
  b(2, -19, 4, 3, BOWL);
  b(3, -18, 2, 1, P.steelDark);
  // front: dark inside, two posts, three shelves of trays
  b(-10, -15, 20, 12, FRAME_IN);
  for (let s = 0; s < 3; s++) {
    const sy = -14 + s * 4;
    b(-8, sy, 16, 1, TRAY_L);
    b(-8, sy + 1, 16, 1, s === 2 ? TRAY_D : TRAY);
    b(-8, sy + 2, 16, 1, P.steelDark);
  }
  b(-10, -15, 2, 12, P.steelFront);
  b(8, -15, 2, 12, P.steelDark);
  b(-10, -15, 1, 12, P.steelLight);
  b(-9, -3, 3, 2, SIGN_D);
  b(6, -3, 3, 2, SIGN_D);
  b(-8, -3, 1, 1, P.steelDark);
  b(7, -3, 1, 1, P.steelDark);
}

/** A dark A-frame wet-floor sign on splayed feet, a small caution triangle, and the puddle it warns about. */
function wetFloor(time: number, id: number): void {
  // the puddle on the pad, a glint walking across it
  ell(X + 7 * D, Y - 2, 3, 1, PUDDLE);
  b(5 + ((Math.floor(time * 3) + id) % 4), -2, 1, 1, P.white);
  ell(X, Y - 2, 8, 1, SHADOW);
  // outlines: the panel widens in steps toward the floor, then two feet with a gap between
  o(-4, -20, 8, 4);
  o(-5, -16, 10, 5);
  o(-6, -11, 12, 5);
  o(-7, -6, 14, 3);
  o(-7, -3, 3, 2);
  o(4, -3, 3, 2);
  b(-4, -20, 8, 4, SIGN);
  b(-5, -16, 10, 5, SIGN);
  b(-6, -11, 12, 5, SIGN);
  b(-7, -6, 14, 3, SIGN);
  b(-7, -3, 3, 2, SIGN_D);
  b(4, -3, 3, 2, SIGN_D);
  // the top edge catches the light and carries the handle slot; the right edge is in shade
  b(-4, -20, 8, 1, SIGN_L);
  b(-2, -19, 4, 1, P.ink);
  b(3, -19, 1, 3, SIGN_D);
  b(4, -16, 1, 5, SIGN_D);
  b(5, -11, 1, 5, SIGN_D);
  b(6, -6, 1, 3, SIGN_D);
  // caution triangle with its "!"
  b(0, -16, 1, 1, CAUTION);
  b(-1, -15, 3, 1, CAUTION);
  b(-2, -14, 5, 1, CAUTION);
  b(-3, -13, 7, 1, CAUTION);
  b(0, -15, 1, 1, P.ink);
  b(0, -13, 1, 1, P.ink);
  // the words, as grey lines
  b(-4, -10, 8, 1, SIGN_TEXT);
  b(-3, -8, 6, 1, SIGN_TEXT);
  b(-4, -5, 8, 1, SIGN_TEXT);
}

/** An uncle in a navy singlet and grey shorts, walking at you with a tray of bowls and a kopi. */
function uncle(time: number, id: number): void {
  const step = (Math.floor(time * 5) + id) % 2;
  ell(X, Y - 2, 8, 2, SHADOW);
  // outlines
  o(-4, -3 - step, 3, 2);
  o(1, -4 + step, 3, 2);
  o(-4, -6, 3, 3);
  o(1, -6, 3, 3);
  o(-5, -11, 10, 5);
  o(-5, -18, 10, 8);
  o(-7, -16, 2, 4);
  o(5, -16, 2, 4);
  o(-3, -23, 6, 5);
  o(-4, -21, 8, 3);
  o(-8, -14, 16, 4);
  o(4, -17, 2, 3);
  // legs and slippers
  b(-4, -6, 3, 3, P.skin);
  b(1, -6, 3, 3, P.skin);
  b(3, -6, 1, 3, P.skinShade);
  b(-4, -3 - step, 3, 2, SLIPPER);
  b(1, -4 + step, 3, 2, SLIPPER);
  // shorts and singlet
  b(-5, -11, 10, 5, SHORTS);
  b(-5, -7, 10, 1, SHORTS_D);
  b(0, -9, 1, 3, SHORTS_D);
  b(-5, -18, 10, 8, NAVY);
  b(-5, -18, 1, 8, NAVY_L);
  b(4, -18, 1, 8, NAVY_D);
  b(-3, -18, 6, 1, P.skin); // neck under the singlet's scoop
  // arms reaching forward to the tray
  b(-7, -16, 2, 4, P.skin);
  b(5, -16, 2, 4, P.skinShade);
  // head: bald top, grey sides, eyes on you
  b(-3, -23, 6, 5, P.skin);
  b(-4, -21, 8, 3, P.skin);
  b(-3, -23, 6, 1, P.skinShade);
  b(-4, -21, 1, 3, HAIR);
  b(3, -21, 1, 3, HAIR);
  b(-2, -20, 1, 1, P.ink);
  b(1, -20, 1, 1, P.ink);
  b(-1, -19, 2, 1, P.skinShade);
  // the tray, seen from above, two bowls and a kopi
  b(-8, -14, 16, 4, UNCLE_TRAY);
  b(-8, -14, 16, 1, UNCLE_TRAY_L);
  b(-8, -11, 16, 1, UNCLE_TRAY_D);
  b(-6, -14, 4, 2, BOWL);
  b(-5, -13, 2, 1, P.steelFront);
  b(-1, -14, 4, 2, BOWL);
  b(0, -13, 2, 1, P.steelFront);
  b(4, -17, 2, 3, P.steelLight);
  b(4, -17, 2, 1, SLIPPER);
}

/** Tail tips for the flick, as [dx, dy, w, h] after the base: up, out, low, out. */
const TAIL = [
  [7, -9, 2, 4],
  [8, -7, 2, 3],
  [8, -5, 2, 2],
  [8, -7, 2, 3],
] as const;

/** The hawker-centre cat: big, dark grey, sitting in your lane and not moving for anyone. */
function cat(time: number, id: number): void {
  const t = TAIL[(Math.floor(time * 7) + id) % 4];
  const blink = (Math.floor(time * 7) + id * 5) % 23 === 0;
  ell(X, Y - 2, 7, 2, SHADOW);
  o(4, -5, 4, 2); // tail base
  o(t[0], t[1], t[2], t[3]);
  o(-5, -10, 10, 8); // body
  o(-4, -11, 8, 1);
  o(-4, -17, 8, 6); // head
  o(-4, -19, 2, 2); // ears
  o(2, -19, 2, 2);
  b(4, -5, 4, 2, CAT);
  b(t[0], t[1], t[2], t[3], CAT);
  b(t[0], t[1], 1, t[3], CAT_L);
  b(-5, -10, 10, 8, CAT);
  b(-4, -11, 8, 1, CAT);
  b(3, -10, 2, 8, CAT_D);
  b(-2, -9, 4, 4, CAT_L); // chest
  b(-3, -3, 2, 1, CAT_L); // front paws
  b(1, -3, 2, 1, CAT_L);
  b(-4, -17, 8, 6, CAT);
  b(-4, -19, 2, 2, CAT);
  b(2, -19, 2, 2, CAT);
  b(-3, -18, 1, 1, CAT_L);
  b(2, -18, 1, 1, CAT_L);
  b(3, -16, 1, 5, CAT_D);
  if (blink) {
    b(-3, -14, 2, 1, P.ink);
    b(1, -14, 2, 1, P.ink);
  } else {
    b(-3, -15, 2, 2, CAT_EYE);
    b(1, -15, 2, 2, CAT_EYE);
    b(-2, -15, 1, 2, P.ink);
    b(1, -15, 1, 2, P.ink);
  }
  b(-1, -12, 2, 1, SIGN_TEXT); // nose
}

/** A pixel ellipse through the current rect, for the floor shadows (same rows as Art.ellipse). */
function ell(cx: number, cy: number, rx: number, ry: number, c: string): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
    R(cx - half, cy + dy, half * 2, 1, c);
  }
}

// --- pickups ----------------------------------------------------------------------------------------------------

const ENAMEL = '#f4743b';
const ENAMEL_D = '#c4501f';
const ENAMEL_L = '#ffb38a';
/** Where the tingkat's sparkle shows next, around the pot. */
const SPARKLE = [
  [-7, -14],
  [6, -10],
  [-6, -6],
  [6, -16],
] as const;

export function drawPickup(fr: Frame, kind: 'coin' | 'tingkat', x: number, y: number, id: number): void {
  at(fr.art.rect, x, y, 1);
  if (kind === 'coin') coin(fr.time, id);
  else tingkat(fr.time, id, fr.reduced);
}

/**
 * A small round gold coin, 5 px tall with its outline, sitting on a 3 px shadow, spinning through four frames;
 * neighbours spin out of step. Coins in a line are only about 6 art px apart on a short phone, so the coin plus its
 * shadow fit in 6 rows: each coin's shadow is the dark gap that separates it from the next one, not a gold rod.
 */
function coin(time: number, id: number): void {
  const k = Math.floor((time + id * 0.09) * 9) % 4;
  b(-1, 0, 3, 1, SHADOW);
  const top = -5;
  if (k === 0) {
    // face on: a 5 x 5 disc with its corners cut, a white glint top left and a shaded rim bottom right
    b(-1, top, 3, 5, P.ink);
    b(-2, top + 1, 5, 3, P.ink);
    b(-1, top + 1, 3, 3, P.gold);
    b(1, top + 2, 1, 2, P.goldShade);
    b(0, top + 3, 1, 1, P.goldShade);
    b(-1, top + 1, 1, 1, P.white);
  } else if (k === 2) {
    // edge on
    b(-1, top, 3, 5, P.ink);
    b(0, top + 1, 1, 3, P.goldShade);
    b(0, top + 1, 1, 1, P.gold);
  } else {
    // three quarters, turning: one column narrower, the glint and the shade swapping sides
    const l = k === 1 ? -1 : -2;
    b(l + 1, top, 2, 5, P.ink);
    b(l, top + 1, 4, 3, P.ink);
    b(l + 1, top + 1, 2, 3, P.gold);
    b(k === 1 ? 0 : -1, top + 1, 1, 1, P.white);
    b(k === 1 ? 1 : 0, top + 2, 1, 2, P.goldShade);
  }
}

/** A stacked enamel tiffin carrier: three warm tiers, gold bands, lid and handle, bobbing with a sparkle. */
function tingkat(time: number, id: number, reduced: boolean): void {
  const bob = reduced ? 0 : (Math.floor(time * 3) + id) % 2;
  ell(X, Y - 1, 5, 1, SHADOW);
  const t = Y - bob;
  const y0 = Y;
  Y = t;
  // outlines: handle, lid, rounded body
  o(-3, -17, 6, 1);
  o(-3, -16, 1, 3);
  o(2, -16, 1, 3);
  o(-4, -13, 8, 2);
  b(-5, -12, 10, 11, P.ink);
  b(-6, -11, 12, 9, P.ink);
  // handle and lid
  b(-3, -17, 6, 1, P.gold);
  b(-3, -16, 1, 3, P.goldShade);
  b(2, -16, 1, 3, P.goldShade);
  b(-4, -13, 8, 2, P.gold);
  b(-4, -12, 8, 1, P.goldShade);
  b(-3, -13, 2, 1, P.white);
  // three tiers with gold bands between them
  b(-5, -11, 10, 9, ENAMEL);
  b(-5, -11, 1, 9, ENAMEL_L);
  b(3, -11, 2, 9, ENAMEL_D);
  b(-5, -8, 10, 1, P.gold);
  b(-5, -5, 10, 1, P.gold);
  b(3, -8, 2, 1, P.goldShade);
  b(3, -5, 2, 1, P.goldShade);
  b(-5, -3, 10, 1, ENAMEL_D);
  // painted flowers
  b(0, -10, 1, 1, P.cream);
  b(-2, -7, 1, 1, P.cream);
  b(1, -4, 1, 1, P.cream);
  Y = y0;
  // a sparkle that pops up somewhere around it, plus-shaped at its peak
  const s = Math.floor(time * 8) + id * 3;
  const phase = s % 6;
  if (phase < 3) {
    const p = SPARKLE[Math.floor(s / 6) % 4];
    b(p[0], p[1] - bob, 1, 1, P.white);
    if (phase === 1) {
      b(p[0] - 1, p[1] - bob, 1, 1, P.gold);
      b(p[0] + 1, p[1] - bob, 1, 1, P.gold);
      b(p[0], p[1] - 1 - bob, 1, 1, P.gold);
      b(p[0], p[1] + 1 - bob, 1, 1, P.gold);
    }
  }
}

// --- the answer gate --------------------------------------------------------------------------------------------

/** Per lane: shade and light of the lane colour, and a dim version for the tutorial's other arches. */
const LANE_SHADE = ['#2a8fb8', '#7c55c9', '#c98400'] as const;
const LANE_LIGHT = ['#b5ecfb', '#dccbff', '#ffe08a'] as const;
const LANE_DIM = ['#2d5d72', '#56447e', '#7d5e1a'] as const;
const GREEN = '#52e08a';
const GREEN_D = '#2f9e5c';
const GREEN_L = '#b6f5cf';
const WRONG = '#e63946';
const WRONG_D = '#a3202c';
const WRONG_L = '#ff9aa3';
/** Arch height above the ground line: the beaver (20 px) fits under the banner. */
const ARCH_H = 27;
const BANNER_H = 6;
/** Seconds: how long the gate lives after an answer, and how long the other arches take to sink away. */
const RESOLVE_S = 0.6;
const SINK_S = 0.3;

/** The answer gate: three arches, one per lane in the lane colours, posts at the lane edges and a banner across. */
export class GateSprite {
  private t = 0;
  private resolved = false;
  private chosen = -1;
  private correct = -1;
  private ok = false;

  /** hintLane: the tutorial gate's lane to highlight, else null. */
  constructor(private hintLane: number | null) {}

  resolve(chosen: number, correct: number, ok: boolean): void {
    this.resolved = true;
    this.chosen = chosen;
    this.correct = correct;
    this.ok = ok;
    this.t = 0;
  }

  /** False once the resolve animation has finished (remove it). */
  update(dt: number): boolean {
    this.t += dt;
    return !this.resolved || this.t < RESOLVE_S;
  }

  /** y = ground y of the gate line. */
  draw(f: Frame, y: number): void {
    const { rect } = f.art;
    const v = f.view;
    const blink = !f.reduced && Math.floor(this.t * 12) % 2 === 1;
    for (let l = 0; l < 3; l++) {
      let fill: string = LANE_COLOURS[l];
      let shade: string = LANE_SHADE[l];
      let light: string = LANE_LIGHT[l];
      let sink = 0;
      if (this.resolved) {
        if (l === this.correct) {
          fill = blink ? P.white : GREEN;
          shade = GREEN_D;
          light = GREEN_L;
        } else if (l === this.chosen && !this.ok) {
          // the wrong pick flashes red, then sinks after the others
          fill = blink && this.t < SINK_S ? P.white : WRONG;
          shade = WRONG_D;
          light = WRONG_L;
          sink = sinkBy(this.t - SINK_S);
        } else {
          sink = sinkBy(this.t);
        }
      } else if (this.hintLane !== null && l !== this.hintLane) {
        fill = LANE_SHADE[l];
        shade = LANE_DIM[l];
        light = LANE_COLOURS[l];
      }
      if (sink >= ARCH_H - 2) continue;
      const hint = !this.resolved && this.hintLane === l;
      arch(rect, v.roadX + l * v.laneW, v.laneW, y, sink, fill, shade, light);
      if (hint) {
        // the tutorial arch pulses its banner and a white arrow bounces above it
        const beat = f.reduced ? 0 : Math.floor(f.time * 4) % 2;
        const top = y - ARCH_H;
        if (beat) rect(v.roadX + l * v.laneW + 3, top + 1, v.laneW - 6, BANNER_H - 2, light);
        const ax = laneX(v, l);
        const ay = top - 6 - beat;
        rect(ax - 3, ay - 1, 7, 2, P.ink);
        rect(ax - 2, ay + 1, 5, 1, P.ink);
        rect(ax - 1, ay + 2, 3, 1, P.ink);
        rect(ax - 2, ay, 5, 1, P.white);
        rect(ax - 1, ay + 1, 3, 1, P.white);
        rect(ax, ay + 2, 1, 1, P.white);
        rect(ax, ay + 3, 1, 1, P.ink);
      }
    }
  }
}

/** How far a dropping arch has sunk into the floor, t seconds after it started (eased in). */
function sinkBy(t: number): number {
  if (t <= 0) return 0;
  const k = Math.min(1, t / SINK_S);
  return Math.round(ARCH_H * k * k);
}

/** One arch, `w` wide from x0: a post at each lane edge, a banner across the top, sunk `sink` px into the floor. */
function arch(rect: Art['rect'], x0: number, w: number, y: number, sink: number, fill: string, shade: string, light: string): void {
  const top = y - ARCH_H + sink;
  const postH = y - top;
  const lx = x0 + 1;
  const rx = x0 + w - 5;
  // a coloured threshold on the floor between the posts, so the lane colour reads from far away
  if (sink === 0) rect(lx + 3, y - 1, w - 8, 2, shade);
  // feet, posts and banner outlines
  rect(lx - 1, y - 1, 6, 3, P.ink);
  rect(rx - 1, y - 1, 6, 3, P.ink);
  rect(lx, top, 4, postH + 1, P.ink);
  rect(rx, top, 4, postH + 1, P.ink);
  rect(x0 + 1, top, w - 2, BANNER_H + 2, P.ink);
  // posts: lit left column, shaded right
  rect(lx + 1, top + 1, 2, postH - 1, fill);
  rect(lx + 1, top + 1, 1, postH - 1, light);
  rect(rx + 1, top + 1, 2, postH - 1, shade);
  rect(rx + 1, top + 1, 1, postH - 1, fill);
  // banner: top face catches the light, front in the lane colour, shaded lip, a shine at the left end
  rect(x0 + 2, top + 1, w - 4, BANNER_H, fill);
  rect(x0 + 2, top + 1, w - 4, 1, light);
  rect(x0 + 2, top + BANNER_H, w - 4, 1, shade);
  rect(x0 + 4, top + 3, 3, 1, light);
  // pennants hanging under the banner
  for (let px = x0 + 7; px + 2 <= x0 + w - 6; px += 4) {
    rect(px, top + BANNER_H + 1, 3, 1, shade);
    rect(px + 1, top + BANNER_H + 2, 1, 1, shade);
  }
}
