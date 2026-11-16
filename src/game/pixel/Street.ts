// The scrolling hawker-centre floor and the scenery strips at both sides.
// The floor is fixed to the world: everything here is placed in world rows (art px up the street) and shifted down
// the screen by the distance run, so the same `travelled` always draws the same street. The lanes stay calm (low
// contrast tiles, faint dividers) so obstacles and coins pop; the life goes in the thin strips past the kerbs,
// where each object is cropped by the screen edge and drawn so that the visible sliver still reads.
import { hash } from '../../scene/pixelCanvas';
import { P, TILE } from './palette';
import type { Art, Frame } from './types';
import { scrollPx } from './view';

/** Floor tile size in art px. */
const TILE_PX = 8;
/** World rows per scenery cell, and scenery cells per zone (a run of stall counters, or a seating area). */
const CELL = 20;
const ZONE = 3;

// Floor colours. The lane colours stay within a few shades of P.tile so a fast scroll never strobes.
const DIVIDER = '#e6f2e9';
const SIDE_FLOOR = '#dcc6a0';
const SIDE_LINE = '#c9b087';
const SIDE_SHADE = '#d4bc93';

// Scenery colours.
const HAIR = '#3b2414';
const STOOL = '#2a9d8f';
const STOOL_DARK = '#1f7a6f';
const LEAF = '#52b788';
const LEAF_DARK = '#2d6a4f';
const LEAF_LIGHT = '#95d5b2';
const POT = '#c8693a';
const POT_DARK = '#9c4a22';
const NOODLE = '#f4c95d';
const SOUP = '#e07a3a';
const SIGN = '#ffd166';
const SIGN_GREEN = '#2a9d8f';
const SHIRTS = ['#4cc9f0', '#f08f8a', '#9b5de5', '#2a9d8f', '#ffb703', '#ffffff'];
const SHIRT_SHADE = ['#2a9d8f', '#d06a66', '#7a3fc0', '#1f7a6f', '#e09f1f', '#d8d8d8'];
const TRAYS = ['#8ecae6', '#2a9d8f', '#ffd166', '#cdb4db'];
/** Awning colours, one per run of stalls; red is only one of them so the sides never shout like a hazard pad. */
const AWNINGS = [P.red, SIGN_GREEN, '#e09f1f', P.sleeveShade, P.red];

const enum Kind {
  Empty,
  Stall,
  Table,
  Diner,
  Plant,
  Rack,
  Fan,
}

// The scenery helpers draw in "strip space": dx counts art px in from the screen edge (0 = the edge column) and dy
// down from the cell's top, so one drawing serves both sides. These are set before each object, so nothing is
// allocated while drawing.
let A: Art;
let W = 0;
let LEFT = true;
let CY = 0;

function box(dx: number, dy: number, w: number, h: number, c: string): void {
  A.rect(LEFT ? dx : W - dx - w, CY + dy, w, h, c);
}

function oval(dx: number, dy: number, rx: number, ry: number, c: string): void {
  A.ellipse(LEFT ? dx : W - dx, CY + dy, rx, ry, c);
}

/** A stall counter with its red and cream awning; stripes follow world rows so neighbouring cells join up. */
function stall(seed: number, awning: string, first: boolean, frame: number): void {
  // counter: a steel top running along the strip, lip towards the lanes, ink edge
  box(0, 0, 8, CELL, P.ink);
  box(5, 0, 1, CELL, P.steel);
  box(6, 0, 1, CELL, P.steelLight);
  // awning over the back of the counter, stripes every 4 rows, a scallop on each red one
  for (let y = 0; y < CELL; y += 8) {
    box(0, y, 4, 4, awning);
    box(0, y + 4, 4, 4, P.apron);
    box(4, y + 1, 1, 2, awning);
  }
  if (first) {
    // the sign board's corner, hanging over the awning at the start of each run of stalls
    box(-1, 2, 6, 9, P.ink);
    box(-1, 3, 5, 7, SIGN);
    box(0, 5, 3, 1, P.red);
    box(0, 7, 2, 1, P.red);
  } else if (seed < 0.6) {
    // a bowl waiting on the counter lip, with steam
    const by = 6 + Math.floor(seed * 12);
    box(4, by, 4, 4, P.ink);
    box(5, by + 1, 2, 2, P.white);
    box(5, by + 1, 1, 1, SOUP);
    if (frame >= 0) {
      const k = (frame + Math.floor(seed * 40)) % 6;
      box(5 + (k % 2), by - 1 - k, 1, 1, P.white);
      if (k < 4) box(6 - (k % 2), by - 3 - k, 1, 1, P.white);
    }
  }
}

/** A round marble table (cut in half by the edge) with two stools at the aisle side. */
function table(seed: number): void {
  // stools: little round seats at the aisle side
  stool(2);
  stool(14);
  // table: ink rim, front shade, marble top
  oval(0, 10, 6, 6, P.ink);
  oval(0, 10, 5, 5, P.apronShade);
  oval(0, 9, 5, 4, P.apron);
  box(3, 6, 1, 1, P.white);
  if (seed < 0.6) {
    // a bowl of noodles
    box(1, 8, 4, 4, P.ink);
    box(1, 9, 3, 2, P.white);
    box(1, 9, 2, 1, NOODLE);
  } else {
    // a cup of kopi
    box(1, 9, 3, 3, P.ink);
    box(1, 10, 2, 1, P.woodDark);
  }
}

function stool(dy: number): void {
  box(5, dy, 2, 4, P.ink);
  box(4, dy + 1, 4, 2, P.ink);
  box(5, dy + 1, 2, 2, STOOL);
  box(5, dy + 1, 1, 1, P.white);
}

/** A diner on a stool, seen from above and behind: hair, shoulders, an arm going from the bowl to the mouth. */
function diner(seed: number, frame: number): void {
  const shirt = Math.floor(seed * SHIRTS.length) % SHIRTS.length;
  // the table edge with a bowl of noodles
  box(0, 0, 3, CELL, P.apron);
  box(2, 0, 1, CELL, P.apronShade);
  box(-1, 7, 3, 5, P.ink);
  box(-1, 8, 2, 3, P.white);
  box(0, 9, 1, 1, NOODLE);
  // shoulders and back, rounded at the corners
  box(4, 4, 4, 12, P.ink);
  box(5, 3, 2, 14, P.ink);
  box(5, 5, 2, 10, SHIRTS[shirt]);
  box(4, 6, 1, 8, SHIRTS[shirt]);
  box(6, 5, 1, 10, SHIRT_SHADE[shirt]);
  // head leaning over the bowl: dark hair, a skin ear and nape
  box(2, 7, 5, 6, P.ink);
  box(3, 8, 3, 4, HAIR);
  box(4, 8, 1, 1, P.furLight);
  box(5, 10, 1, 1, P.skin);
  // arms: one rests on the table, the other lifts the chopsticks to the mouth and back
  box(1, 15, 3, 2, P.ink);
  box(1, 15, 2, 1, P.skin);
  const up = frame >= 0 && (frame + Math.floor(seed * 20)) % 8 < 3;
  if (up) {
    box(2, 4, 3, 3, P.ink);
    box(2, 5, 2, 1, P.skin);
    box(1, 6, 1, 2, P.woodDark);
  } else {
    box(0, 3, 5, 2, P.ink);
    box(1, 3, 3, 1, P.skin);
    box(0, 5, 1, 3, P.woodDark);
  }
}

/** A potted palm, round leaves over a terracotta pot. */
function plant(): void {
  oval(3, 12, 4, 4, P.ink);
  oval(3, 12, 3, 3, POT);
  box(1, 14, 4, 1, POT_DARK);
  // leaves spill over the pot in a cross
  box(0, 5, 7, 9, P.ink);
  box(-1, 7, 9, 5, P.ink);
  box(1, 6, 5, 7, LEAF);
  box(0, 8, 7, 3, LEAF);
  box(3, 6, 1, 7, LEAF_DARK);
  box(0, 9, 7, 1, LEAF_DARK);
  box(1, 7, 1, 1, LEAF_LIGHT);
  box(5, 11, 1, 1, LEAF_LIGHT);
}

/** The tray-return rack: a steel frame of stacked coloured trays with a green sign on top. */
function rack(seed: number): void {
  box(-1, 1, 8, 18, P.ink);
  box(-1, 2, 7, 16, P.steelFront);
  for (let i = 0; i < 4; i++) {
    const c = TRAYS[(i + Math.floor(seed * 4)) % TRAYS.length];
    box(-1, 3 + i * 4, 6, 3, c);
    box(-1, 3 + i * 4, 6, 1, P.white);
  }
  box(5, 2, 1, 16, P.steel);
  // sign: a white arrow on green
  box(0, -2, 6, 5, P.ink);
  box(0, -1, 5, 3, SIGN_GREEN);
  box(1, 0, 3, 1, P.white);
  box(3, -1, 1, 3, P.white);
}

/** A standing fan, head in the cage, blades turning by frames. */
function fan(frame: number): void {
  // stand and base
  oval(3, 16, 3, 2, P.ink);
  oval(3, 16, 2, 1, P.steelDark);
  box(2, 10, 2, 6, P.steelDark);
  // cage
  oval(3, 7, 4, 4, P.ink);
  oval(3, 7, 3, 3, P.steelLight);
  const f = frame >= 0 ? frame % 2 : 0;
  if (f === 0) {
    box(2, 4, 2, 6, P.sleeve);
    box(0, 6, 6, 2, P.sleeve);
  } else {
    box(1, 5, 1, 1, P.sleeve);
    box(4, 5, 1, 1, P.sleeve);
    box(1, 8, 1, 1, P.sleeve);
    box(4, 8, 1, 1, P.sleeve);
    box(2, 6, 2, 2, P.sleeveShade);
  }
  box(2, 6, 2, 2, P.ink);
}

export class Street {
  /** Nothing to clear: the street is drawn from the sim's distance alone. World calls it like the other parts. */
  reset(): void {}

  draw(f: Frame): void {
    const { art, view: v, sim } = f;
    const { rect } = art;
    const right = v.roadX + 3 * v.laneW;
    // World row wy sits at screen y = wy + scroll; scroll grows as the run goes on, so the floor moves down.
    const scroll = scrollPx(v, sim.travelled) + v.playerY;
    const frame = f.lowFx || f.reduced ? -1 : Math.floor(f.time * 6);

    // --- lanes: pale green tiles, soft per-tile shading, subtle grout --------------------------------------
    rect(v.roadX, 0, right - v.roadX, v.h, TILE.base);
    // Columns are centred on the middle lane so the grid sits evenly between the kerbs.
    const mid = v.roadX + Math.round(1.5 * v.laneW) - TILE_PX / 2;
    const col0 = Math.floor((v.roadX - mid) / TILE_PX);
    const col1 = Math.floor((right - 1 - mid) / TILE_PX);
    const row0 = Math.floor(-scroll / TILE_PX);
    const row1 = Math.floor((v.h - scroll) / TILE_PX);
    for (let r = row0; r <= row1; r++) {
      const y = r * TILE_PX + scroll;
      for (let c = col0; c <= col1; c++) {
        if (hash(c, r) < 0.28) {
          const x0 = Math.max(mid + c * TILE_PX + 1, v.roadX);
          const x1 = Math.min(mid + (c + 1) * TILE_PX, right);
          if (x1 > x0) rect(x0, y + 1, x1 - x0, TILE_PX - 1, TILE.shade);
        }
      }
      rect(v.roadX, y, right - v.roadX, 1, TILE.line);
    }
    for (let c = col0 + 1; c <= col1; c++) rect(mid + c * TILE_PX, 0, 1, v.h, TILE.line);

    // A rare drain cover, pale and flat so it never reads as something to dodge or grab. (No painted arrows in the
    // lanes: in a swipe game an arrow on the floor reads as an instruction.)
    for (let r = row0 - 1; r <= row1; r++) {
      const y = r * TILE_PX + scroll;
      for (let l = 0; l < 3; l++) {
        const k = hash(r * 3 + l, 911);
        if (k >= 0.02) continue;
        const lx = v.roadX + l * v.laneW;
        const x = lx + 4 + Math.floor(k * 700) % (v.laneW - 13);
        rect(x, y + 1, 6, 6, P.steelFront);
        rect(x + 1, y + 2, 4, 4, P.steel);
        rect(x + 1, y + 3, 4, 1, P.steelFront);
        rect(x + 1, y + 5, 4, 1, P.steelFront);
      }
    }

    // Faint painted lane dividers, dashed and moving with the floor.
    for (let l = 1; l < 3; l++) {
      const x = v.roadX + l * v.laneW;
      for (let r = row0; r <= row1; r++) rect(x, r * TILE_PX + scroll + 2, 1, 4, DIVIDER);
    }

    // --- side strips: a cream floor, scenery, then the kerb rails ----------------------------------------
    const sideW = v.w - right;
    rect(0, 0, v.roadX, v.h, SIDE_FLOOR);
    rect(right, 0, sideW, v.h, SIDE_FLOOR);
    for (let r = row0; r <= row1; r++) {
      const y = r * TILE_PX + scroll;
      rect(0, y, v.roadX, 1, SIDE_LINE);
      rect(right, y, sideW, 1, SIDE_LINE);
      if (hash(r, 77) < 0.3) rect(1, y + 1, v.roadX - 4, TILE_PX - 1, SIDE_SHADE);
      if (hash(r, 78) < 0.3) rect(right + 3, y + 1, sideW - 4, TILE_PX - 1, SIDE_SHADE);
    }
    rect(4, 0, 1, v.h, SIDE_LINE);
    rect(v.w - 5, 0, 1, v.h, SIDE_LINE);

    A = art;
    W = v.w;
    // One cell above the screen too: tall objects (the rack's sign) poke above their cell.
    const cell0 = Math.floor(-scroll / CELL) - 1;
    const cell1 = Math.floor((v.h - scroll) / CELL);
    for (let side = 0; side < 2; side++) {
      LEFT = side === 0;
      for (let c = cell0; c <= cell1; c++) {
        CY = c * CELL + scroll;
        const zone = Math.floor(c / ZONE);
        const seed = hash(c, side * 31 + 5);
        const z = hash(zone, side * 17 + 3);
        if (z < 0.38) {
          stall(seed, AWNINGS[Math.floor(z * 13) % AWNINGS.length], c - zone * ZONE === 0, frame);
          continue;
        }
        switch (Math.floor(seed * 7) as Kind) {
          case Kind.Table:
            table(hash(c, 401 + side));
            break;
          case Kind.Diner:
          case Kind.Stall:
            diner(hash(c, 402 + side), frame);
            break;
          case Kind.Plant:
            plant();
            break;
          case Kind.Rack:
            rack(hash(c, 403 + side));
            break;
          case Kind.Fan:
            fan(frame);
            break;
          default:
            break;
        }
      }
    }

    // Kerb rails: a wooden rail with a dark edge on the lane side. Drawn last, so no scenery
    // ever spills into the lanes.
    rect(v.roadX - 2, 0, 1, v.h, P.woodLight);
    rect(v.roadX - 1, 0, 1, v.h, P.woodEdge);
    rect(right, 0, 1, v.h, P.woodEdge);
    rect(right + 1, 0, 1, v.h, P.woodLight);
    // a soft shadow line on the floor beside each rail
    rect(v.roadX, 0, 1, v.h, TILE.line);
    rect(right - 1, 0, 1, v.h, TILE.line);
  }
}
