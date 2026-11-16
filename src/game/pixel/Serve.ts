// The serve cutscene. Before SERVE_T.CUT the World draws the top-down dash up the street; from CUT this scene
// draws the whole frame: a side view of Ah Ma's stall, the same place as in Learn (tiled wall, awning, lamp, her
// portrait, the menu board, the steel counter and the chef beaver), with a hawker table on the right where Ah Ma
// and a customer wait. The chef holds an empty plate, the ingredients fly into it, he lifts the finished dish
// overhead, throws it in an arc and it lands on the table at LAND; then everyone cheers.
//
// Layout is worked out from the view on every frame (into one reused object), anchored to the floor line so the
// characters sit in the lower part of the screen, under the HUD and the DISH SERVED! banner.
import type { Dish } from '../../content/dishes';
import { chef, counter, heart, menuBoard, portrait, stallWall, type Arm } from '../../learn/art';
import type { PixelCanvas } from '../../scene/pixelCanvas';
import { P } from './palette';
import type { Art, Frame } from './types';
import type { View } from './view';

/** Seconds into the cutscene. CUT: the top-down dash ends and the side view starts. */
export const SERVE_T = { CUT: 1.15, RAISE: 1.65, THROW: 2.5, LAND: 2.9 };

/** The wipe in from the street: ink bars slide away in steps. */
const WIPE_S = 0.3;
const WIPE_BARS = 8;
const WIPE_STEPS = 6;
/** How high the thrown dish arcs above the straight line, art px. */
const ARC_PX = 16;

type Rect = Art['rect'];

// Colours not in Learn's palette: people, the table and the floor.
const HAIR = '#2b2b33';
const HAIR_LIGHT = '#4a4a58';
const PANTS = '#3a4a6b';
const SHIRT2 = '#52b788';
const SHIRT2_SHADE = '#2d8a5f';
const AMA_HAIR = '#e0e0e0';
const AMA_HAIR_LIGHT = '#f0f0f0';
const AMA_BLOUSE = '#c0392b';
const AMA_BLOUSE_SHADE = '#922b20';
const GLASS = '#cfe9ff';
const STOOL = '#e63946';
const STOOL_SHADE = '#a8262f';
const TABLE_TOP = '#f2efe6';
const TABLE_EDGE = '#c9c2b0';
const FLOOR = '#d9c7a3';
const FLOOR_LINE = '#c4af88';
const FLOOR_SHADOW = '#b89f74';
const PLATE_UNDER = '#d0d8e0';
const RICE = '#fff5d6';
const NOODLE = '#5a3a1f';
const CHIVE = '#52e08a';
const SOUP_BOWL = '#f2efe6';
const SIGN_BG = '#a8262f';

// Option objects for the Learn sprites, reused every frame so drawing allocates nothing.
const WALL_OPT = { lamp: 0.72, lampY: 0 };
const CHEF_OPT: { arm: Arm; mouth: boolean; bob: number; blink: boolean } = { arm: 'forward', mouth: false, bob: 0, blink: false };
const CUST_OPT = { cheer: false, bob: 0, lookUp: false, reach: false };
const AMA_OPT = { cheer: false, bob: 0, lookUp: false };

// A 3 x 5 font for the stall sign (Learn's word() has only the letters its scenes need).
const SIGN_TEXT = 'AH MA';
const GLYPH: Record<string, string> = {
  A: '010101111101101',
  H: '101101111101101',
  M: '101111111101101',
};

/** A box helper mirrored around x when dir = -1, like Learn's sprites, but with no closure per call. */
let mRect: Rect = () => {};
let mX = 0;
let mY = 0;
let mDir = 1;
function at(rect: Rect, x: number, y: number, dir: number): void {
  mRect = rect;
  mX = x;
  mY = y;
  mDir = dir;
}
function b(dx: number, dy: number, w: number, h: number, c: string): void {
  const a = Math.round(mX + dx * mDir);
  const e = Math.round(mX + (dx + w) * mDir);
  mRect(Math.min(a, e), Math.round(mY + dy), Math.abs(e - a), h, c);
}

/** A PixelCanvas whose size can be changed, so Learn's counter() can be drawn narrower than the screen. */
type StallCanvas = { -readonly [K in keyof PixelCanvas]: PixelCanvas[K] };

interface Layout {
  floor: number;
  /** The chef's feet (he stands on the stall's raised floor, hidden by the counter) and the counter top. */
  chefX: number;
  feet: number;
  counterTop: number;
  counterW: number;
  /** Table centre and the y of its top surface. */
  tableX: number;
  tableTop: number;
  seatY: number;
  /** Customer on the near side of the table (faces right), Ah Ma on the far side (faces left). */
  custX: number;
  amaX: number;
  /** Where the plate's top row sits: held low, raised overhead, on the table. */
  lowX: number;
  lowY: number;
  upX: number;
  upY: number;
  landX: number;
  landY: number;
}

function layout(v: View, o: Layout): Layout {
  // Floor about 24 px from the bottom on a short phone; taller phones split the extra between floor and wall.
  o.floor = Math.round(v.h - 24 - Math.max(0, v.h - 152) * 0.3);
  o.chefX = Math.round(v.w * 0.22);
  o.feet = o.floor - 6;
  o.counterTop = o.feet - 10;
  o.counterW = Math.round(v.w * 0.42);
  o.tableX = Math.round(v.w * 0.72);
  o.tableTop = o.floor - 15;
  o.seatY = o.floor - 9;
  o.custX = o.tableX - 17;
  o.amaX = o.tableX + 17;
  o.lowX = o.chefX + 13;
  o.lowY = o.feet - 19;
  o.upX = o.chefX + 5;
  o.upY = o.feet - 32;
  o.landX = o.tableX - 1;
  o.landY = o.tableTop - 3;
  return o;
}

export class ServeScene {
  private dish: Dish | null = null;
  private landed = false;
  private food = '#ffd166';
  private foodShade = '#e09f1f';
  private L: Layout = layout({ w: 98, h: 152 } as View, {} as Layout);
  /** Learn's stall helpers want a whole PixelCanvas; one object, made on first draw and refreshed each frame. */
  private pc: StallCanvas | null = null;

  start(dish: Dish): void {
    this.dish = dish;
    this.landed = false;
    this.food = dish.colour;
    this.foodShade = darken(dish.colour);
  }

  stop(): void {
    this.dish = null;
    this.landed = false;
  }

  /** st = seconds into the cutscene; true exactly once, at LAND. */
  update(_f: Frame, st: number): boolean {
    if (this.landed || !this.dish || st < SERVE_T.LAND) return false;
    this.landed = true;
    return true;
  }

  /** Call only when st >= SERVE_T.CUT. Draws the whole frame, including the wipe in from the street. */
  draw(f: Frame, st: number): void {
    const { art, view: v } = f;
    const { rect } = art;
    const L = layout(v, this.L);
    const pc = this.canvasFor(art, v);
    const T = SERVE_T;
    const still = f.reduced;
    const frame8 = Math.floor(f.time * 8);
    const party = st >= T.LAND;

    // --- the stall wall, as in Learn ---
    WALL_OPT.lampY = L.floor - 45;
    stallWall(pc, L.floor, WALL_OPT);
    const board = Math.min(v.w - 32, L.tableX - 6);
    portrait(pc, Math.max(L.counterW + 2, board - 20), L.floor - 76);
    menuBoard(pc, board, L.floor - 74);
    this.floor(rect, v, L);
    this.stall(rect, L);

    // --- the chef behind the counter ---
    let arm: Arm = 'forward';
    if (party) arm = 'up';
    else if (st >= T.RAISE && st < T.THROW + 0.08) arm = 'up';
    const hop = still ? 0 : party ? (frame8 % 4 < 2 ? 2 : 0) : st >= T.RAISE && st < T.THROW ? frame8 & 1 : 0;
    CHEF_OPT.arm = arm;
    CHEF_OPT.mouth = st >= T.THROW;
    CHEF_OPT.bob = hop;
    CHEF_OPT.blink = !party && frame8 % 23 === 0;
    chef(art, L.chefX, L.feet, 1, CHEF_OPT);
    const s = pc;
    const fullW = s.w;
    const fullH = s.h;
    s.w = L.counterW;
    s.h = L.floor;
    counter(s, L.counterTop);
    s.w = fullW;
    s.h = fullH;
    this.counterThings(rect, L, f.time, still || f.lowFx);

    // --- the table, Ah Ma and the customer ---
    const flying = st >= T.THROW && st < T.LAND;
    this.table(rect, art, L);
    const cheerA = party && (still || frame8 % 4 < 2);
    const cheerB = party && (still || (frame8 + 1) % 4 < 2);
    CUST_OPT.cheer = cheerA;
    CUST_OPT.bob = party && !still && cheerA ? 1 : 0;
    CUST_OPT.lookUp = flying;
    CUST_OPT.reach = !party && !flying;
    person(rect, L.custX, L.seatY, L.floor, 1, CUST_OPT);
    AMA_OPT.cheer = cheerB;
    AMA_OPT.bob = party && !still && cheerB ? 1 : 0;
    AMA_OPT.lookUp = flying || (st >= T.RAISE && !party);
    ahMa(rect, L.amaX, L.seatY, L.floor, -1, AMA_OPT);
    if (party && !still && !f.lowFx) {
      // A little heart rises from Ah Ma, in steps.
      const k = (frame8 % 12) / 12;
      if (k < 0.75) heart(pc, L.amaX - 6, Math.round(L.seatY - 30 - k * 10));
    }

    // --- the dish ---
    if (this.dish) {
      if (st < T.RAISE) {
        plate(rect, L.lowX, L.lowY, null, '', '');
      } else if (st < T.THROW) {
        // Overhead; it rides the chef's bob.
        this.drawDish(rect, L.upX, L.upY - hop);
      } else if (st < T.LAND) {
        // Thrown: a chunky arc, stepped like an old game, with a few sparkles left behind.
        const k = Math.floor(((st - T.THROW) / (T.LAND - T.THROW)) * 7) / 7;
        for (let i = 1; i <= 2; i++) {
          const kk = Math.max(0, k - i / 7);
          if (kk === k) break;
          rect(arcX(L, kk), arcY(L, kk) - 2, 1, 1, i === 1 ? P.gold : P.white);
        }
        this.drawDish(rect, arcX(L, k), arcY(L, k));
      } else {
        this.drawDish(rect, L.landX, L.landY);
        if (!still && !f.lowFx) steamPuffs(rect, L.landX, L.landY - 5, f.time);
      }
    }

    this.wipe(rect, v, st);
  }

  /** Art px where the raised dish is (target of onPlating). */
  dishPoint(v: View): { x: number; y: number } {
    const L = layout(v, this.L);
    return { x: L.upX, y: L.upY - 3 };
  }

  /** Art px of the table (landing effects): the dish once it has landed. */
  tablePoint(v: View): { x: number; y: number } {
    const L = layout(v, this.L);
    return { x: L.landX, y: L.landY - 2 };
  }

  private canvasFor(art: Art, v: View): StallCanvas {
    let pc = this.pc;
    if (!pc) {
      pc = this.pc = {
        canvas: art.ctx.canvas,
        ctx: art.ctx,
        w: v.w,
        h: v.h,
        scale: v.px,
        rect: art.rect,
        ellipse: art.ellipse,
        toArt: () => ({ x: 0, y: 0 }),
        run: () => {},
        stop: () => {},
      };
    }
    pc.ctx = art.ctx;
    pc.rect = art.rect;
    pc.ellipse = art.ellipse;
    pc.w = v.w;
    pc.h = v.h;
    return pc;
  }

  /** Hawker-centre floor in front of the stall: big tiles with a skirting shadow along the wall. */
  private floor(rect: Rect, v: View, L: Layout): void {
    rect(0, L.floor, v.w, v.h - L.floor, FLOOR);
    rect(0, L.floor, v.w, 1, FLOOR_SHADOW);
    // Tile joints get further apart towards the viewer, for a little depth.
    let y = L.floor + 4;
    for (let gap = 5; y < v.h; gap += 3) {
      rect(0, y, v.w, 1, FLOOR_LINE);
      y += gap;
    }
    for (let x = 4; x < v.w; x += 14) rect(x, L.floor + 1, 1, v.h - L.floor - 1, FLOOR_LINE);
  }

  /** The stall front: two wooden posts, a striped awning over the counter and the red "AH MA" sign on top. */
  private stall(rect: Rect, L: Layout): void {
    const w = L.counterW;
    const top = L.feet - 50;
    // posts
    rect(1, top + 6, 3, L.counterTop - top - 6, P.woodEdge);
    rect(2, top + 6, 1, L.counterTop - top - 6, P.wood);
    rect(w - 4, top + 6, 3, L.counterTop - top - 6, P.woodEdge);
    rect(w - 3, top + 6, 1, L.counterTop - top - 6, P.wood);
    // awning: red and cream stripes with a scalloped edge
    rect(-1, top - 1, w + 3, 8, P.ink);
    for (let x = 0; x < w + 1; x += 6) {
      const c = (x / 6) % 2 ? P.apron : P.red;
      rect(x, top, 6, 6, c);
      rect(x + 1, top + 6, 4, 1, c);
      rect(x + 1, top + 7, 4, 1, P.ink);
    }
    rect(0, top, w + 1, 1, P.white);
    // the sign
    const sw = SIGN_TEXT.length * 4 + 5;
    const sx = Math.round((w - sw) / 2);
    const sy = top - 11;
    rect(sx + 3, sy + 9, 1, 2, P.ink);
    rect(sx + sw - 4, sy + 9, 1, 2, P.ink);
    rect(sx - 1, sy - 1, sw + 2, 11, P.ink);
    rect(sx, sy, sw, 9, SIGN_BG);
    rect(sx, sy, sw, 1, P.red);
    rect(sx, sy + 8, sw, 1, '#7a1d16');
    for (let i = 0; i < SIGN_TEXT.length; i++) {
      const g = GLYPH[SIGN_TEXT[i]];
      if (!g) continue;
      for (let p = 0; p < 15; p++) if (g.charCodeAt(p) === 49) rect(sx + 3 + i * 4 + (p % 3), sy + 2 + ((p / 3) | 0), 1, 1, P.gold);
    }
  }

  /** A stack of bowls and a steaming pot on the counter behind the chef. */
  private counterThings(rect: Rect, L: Layout, t: number, still: boolean): void {
    const x = 5;
    const y = L.counterTop;
    // pot
    rect(x - 1, y - 8, 12, 8, P.ink);
    rect(x, y - 7, 10, 6, P.steelFront);
    rect(x, y - 7, 10, 1, P.steelLight);
    rect(x + 1, y - 5, 1, 3, P.steelLight);
    rect(x - 2, y - 6, 2, 1, P.ink);
    rect(x + 10, y - 6, 2, 1, P.ink);
    if (!still) {
      const k = Math.floor(t * 6) % 6;
      rect(x + 3 + (k & 1), y - 10 - k, 2, 2, P.white);
      rect(x + 6 - (k & 1), y - 12 - ((k + 3) % 6), 1, 1, P.white);
    }
  }

  private table(rect: Rect, art: Art, L: Layout): void {
    const x = L.tableX;
    const y = L.tableTop;
    art.ellipse(x, L.floor + 1, 15, 1.5, FLOOR_SHADOW);
    // stools
    stool(rect, L.custX, L.seatY, L.floor);
    stool(rect, L.amaX, L.seatY, L.floor);
    // pedestal and foot
    rect(x - 2, y + 3, 4, L.floor - y - 4, P.ink);
    rect(x - 1, y + 3, 2, L.floor - y - 4, P.steelDark);
    rect(x - 7, L.floor - 2, 14, 2, P.ink);
    rect(x - 6, L.floor - 2, 12, 1, P.steelFront);
    // round top seen side on
    rect(x - 14, y - 1, 28, 5, P.ink);
    rect(x - 13, y, 26, 2, TABLE_TOP);
    rect(x - 13, y + 2, 26, 1, TABLE_EDGE);
    rect(x - 11, y, 4, 1, P.white);
  }

  private drawDish(rect: Rect, x: number, y: number): void {
    const d = this.dish;
    if (!d) return;
    plate(rect, x, y, d, this.food, this.foodShade);
  }

  /** Ink bars slide away to alternate sides, in a few chunky steps. */
  private wipe(rect: Rect, v: View, st: number): void {
    const k = (st - SERVE_T.CUT) / WIPE_S;
    if (k >= 1.6) return;
    const q = Math.floor(Math.max(0, k) * WIPE_STEPS) / WIPE_STEPS;
    const bh = Math.ceil(v.h / WIPE_BARS);
    for (let i = 0; i < WIPE_BARS; i++) {
      // Bars further down start a step later, so the scene opens from the top like blinds.
      const open = Math.min(1, Math.max(0, q * 1.6 - i * 0.075));
      const left = Math.round(v.w * (1 - open));
      if (left <= 0) continue;
      const y = i * bh;
      if (i & 1) {
        rect(v.w - left, y, left, bh, P.ink);
        if (open > 0) rect(v.w - left, y, 1, bh, P.gold);
      } else {
        rect(0, y, left, bh, P.ink);
        if (open > 0) rect(left - 1, y, 1, bh, P.gold);
      }
    }
  }
}

function arcX(L: Layout, k: number): number {
  return Math.round(L.upX + (L.landX - L.upX) * k);
}
function arcY(L: Layout, k: number): number {
  return Math.round(L.upY + (L.landY - L.upY) * k - Math.sin(k * Math.PI) * ARC_PX);
}

/**
 * A plate seen from the side, its top row at y and centred on x, with the dish's food heaped on it. Laksa comes in
 * a bowl. With no dish it is the empty plate the chef holds while the ingredients fly in.
 */
function plate(rect: Rect, x: number, y: number, d: Dish | null, food: string, shade: string): void {
  if (d && d.id === 'laksa') {
    // bowl: ink outline, white sides, gold soup, red chilli and greens
    rect(x - 7, y - 2, 15, 1, P.ink);
    rect(x - 7, y - 1, 15, 3, P.ink);
    rect(x - 6, y + 2, 13, 2, P.ink);
    rect(x - 6, y - 1, 13, 3, SOUP_BOWL);
    rect(x - 5, y + 2, 11, 1, PLATE_UNDER);
    rect(x - 6, y - 1, 13, 1, food);
    rect(x - 5, y - 3, 4, 1, shade);
    rect(x + 1, y - 3, 3, 1, NOODLE);
    rect(x - 2, y - 4, 2, 2, P.red);
    rect(x + 3, y - 4, 2, 1, CHIVE);
    rect(x - 6, y, 2, 1, P.white);
    return;
  }
  // plate
  rect(x - 8, y, 17, 2, P.ink);
  rect(x - 6, y + 2, 13, 1, P.ink);
  rect(x - 7, y, 15, 1, P.white);
  rect(x - 5, y + 1, 11, 1, PLATE_UNDER);
  if (!d) return;
  if (d.id === 'chicken-rice') {
    // a dome of rice with slices of chicken laid over it
    rect(x - 5, y - 4, 10, 4, P.ink);
    rect(x - 4, y - 5, 8, 1, P.ink);
    rect(x - 4, y - 3, 8, 3, RICE);
    rect(x - 3, y - 4, 6, 1, RICE);
    rect(x - 2, y - 4, 5, 2, food);
    rect(x - 1, y - 2, 4, 1, shade);
    rect(x - 2, y - 4, 2, 1, P.white);
    rect(x + 4, y - 2, 1, 1, CHIVE);
    rect(x - 4, y - 1, 1, 1, CHIVE);
  } else {
    // a heap of noodles in the dish colour, dark strands and green chives
    rect(x - 6, y - 4, 12, 4, P.ink);
    rect(x - 4, y - 5, 8, 1, P.ink);
    rect(x - 5, y - 3, 10, 3, food);
    rect(x - 3, y - 4, 6, 1, food);
    rect(x - 4, y - 1, 9, 1, shade);
    rect(x - 4, y - 2, 3, 1, NOODLE);
    rect(x + 1, y - 3, 3, 1, NOODLE);
    rect(x - 1, y - 4, 2, 1, P.white);
    rect(x + 3, y - 1, 1, 1, CHIVE);
    rect(x - 3, y - 3, 1, 1, CHIVE);
  }
}

function stool(rect: Rect, x: number, seatY: number, floor: number): void {
  rect(x - 4, seatY, 9, 3, P.ink);
  rect(x - 3, seatY, 7, 1, STOOL);
  rect(x - 3, seatY + 1, 7, 1, STOOL_SHADE);
  rect(x - 1, seatY + 3, 3, floor - seatY - 3, P.ink);
  rect(x, seatY + 3, 1, floor - seatY - 3, P.steelDark);
}

/**
 * A seated customer facing right when dir = 1 (people are drawn in Learn's skin and sleeve colours). (x, seatY) is
 * the middle of the stool top. `reach` rests a hand on the table, `cheer` throws both arms up.
 */
function person(rect: Rect, x: number, seatY: number, floor: number, dir: number, o: { cheer: boolean; bob: number; lookUp: boolean; reach: boolean }): void {
  at(rect, x, seatY - o.bob, dir);
  // legs: thigh along the seat, shin to the floor, shoe
  b(-2, -3, 8, 3, PANTS);
  b(4, 0, 3, floor - seatY - 2 + o.bob, PANTS);
  b(4, floor - seatY - 2 + o.bob, 5, 2, P.ink);
  // body
  b(-3, -13, 7, 11, P.ink);
  b(-2, -12, 5, 10, P.sleeve);
  b(-2, -12, 1, 10, P.sleeveShade);
  // head: hair at the back and top, face forward
  b(-3, -21, 8, 8, P.ink);
  b(-2, -20, 6, 6, P.skin);
  b(-3, -21, 7, 3, HAIR);
  b(-3, -18, 3, 3, HAIR);
  b(-1, -21, 3, 1, HAIR_LIGHT);
  b(3, o.lookUp ? -19 : -18, 1, 2, P.ink); // eye
  b(1, -15, 2, 1, P.skinShade); // ear
  b(4, -16, 1, 1, P.skinShade); // mouth corner
  if (o.cheer) {
    b(4, -16, 1, 1, P.ink);
    b(1, -26, 3, 14, P.sleeve);
    b(1, -26, 1, 14, P.sleeveShade);
    b(1, -28, 3, 2, P.skin);
  } else if (o.reach) {
    b(1, -9, 7, 3, P.sleeve);
    b(1, -7, 7, 1, P.sleeveShade);
    b(8, -9, 2, 3, P.skin);
  } else {
    b(1, -11, 3, 7, P.sleeve);
    b(1, -5, 3, 2, P.skin);
  }
}

/**
 * Ah Ma, seated: the chef's grandmother, a beaver in her portrait's colours (white bun, round glasses, red blouse).
 * Faces right when dir = 1; (x, seatY) is the middle of the stool top.
 */
function ahMa(rect: Rect, x: number, seatY: number, floor: number, dir: number, o: { cheer: boolean; bob: number; lookUp: boolean }): void {
  at(rect, x, seatY - o.bob, dir);
  // tail flat on the stool behind her, cross-hatched like the chef's
  b(-10, -3, 7, 3, P.furDark);
  b(-9, -2, 1, 1, P.fur);
  b(-7, -3, 1, 1, P.fur);
  b(-5, -2, 1, 1, P.fur);
  // lap, short legs and feet
  b(-2, -4, 8, 4, P.fur);
  b(4, 0, 3, floor - seatY - 2 + o.bob, P.furDark);
  b(4, floor - seatY - 2 + o.bob, 5, 2, P.furDark);
  // body in the red blouse
  b(-4, -14, 9, 11, AMA_BLOUSE);
  b(-4, -14, 1, 11, AMA_BLOUSE_SHADE);
  b(1, -13, 4, 1, P.apron); // collar
  if (o.cheer) {
    b(2, -29, 3, 17, P.furLight);
    b(2, -31, 3, 2, P.furDark);
  }
  // head
  b(-3, -23, 9, 9, P.fur);
  b(-2, -24, 7, 1, P.fur);
  b(5, -19, 3, 3, P.cream); // snout
  b(8, -19, 1, 2, P.ink); // nose
  b(6, -16, 1, 2, P.tooth);
  b(7, -16, 1, 2, P.tooth);
  b(1, -17, 2, 1, P.pink);
  // white hair in a bun
  b(-3, -25, 8, 3, AMA_HAIR);
  b(-3, -22, 2, 4, AMA_HAIR);
  b(-6, -27, 4, 4, AMA_HAIR_LIGHT);
  b(-5, -27, 2, 1, P.white);
  // round glasses
  b(2, -22, 3, 3, P.ink);
  b(3, o.lookUp ? -22 : -21, 1, 1, GLASS);
  b(5, -21, 1, 1, P.ink);
  // arms: the cheering arm rises behind her head, so only the paw shows above the bun
  if (!o.cheer) {
    b(1, -12, 3, 7, P.furLight);
    b(2, -6, 4, 2, P.furDark);
  }
}

/** Three steam puffs rising off the landed dish in steps; whole pixels, no alpha. */
function steamPuffs(rect: Rect, x: number, y: number, t: number): void {
  const k = Math.floor(t * 6);
  for (let i = 0; i < 3; i++) {
    const s = (k + i * 3) % 9;
    const sx = x - 3 + i * 3 + (s % 3 === 1 ? 1 : 0);
    const sy = y - s * 2;
    rect(sx, sy, s < 5 ? 2 : 1, s < 5 ? 2 : 1, P.white);
  }
}

/** The dish colour about a third darker, for the shaded side of the food. Called once per dish, not per frame. */
function darken(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  if (!Number.isFinite(n) || hex.length !== 7) return hex;
  const ch = (s: number) => Math.round(((n >> s) & 255) * 0.7);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}
