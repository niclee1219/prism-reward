// Sprites for the Learn scenes, drawn with filled rectangles on a pixelCanvas (no image files). The beaver uses the
// same palette and face as the side-view beavers in src/ui/forest.ts, stood upright behind the stall counter, with the
// runner's red headband and apron.
import { hash, type PixelCanvas } from '../scene/pixelCanvas';

export const P = {
  ink: '#2a1608',
  fur: '#9a5f2c',
  furDark: '#6d3f1b',
  furLight: '#b87a3e',
  cream: '#ecd0a0',
  tooth: '#ffffff',
  pink: '#f08f8a',
  red: '#e63946',
  apron: '#fff5d6',
  apronShade: '#e6d3a6',
  paper: '#fff5d6',
  paperShade: '#e6d3a6',
  scribble: '#8a7a68',
  gold: '#ffd166',
  goldShade: '#e09f1f',
  white: '#ffffff',
  wood: '#b78247',
  woodLight: '#d39a5a',
  woodDark: '#8a5a30',
  woodEdge: '#5e3110',
  tile: '#cfe6d6',
  tileLine: '#b3d3bf',
  tileShade: '#bcdcc8',
  lowWall: '#e9d9b8',
  lowWallLine: '#d8c49c',
  steel: '#c9d1d9',
  steelLight: '#e6ebf0',
  steelFront: '#9aa6b2',
  steelDark: '#76828f',
  skin: '#f1c9a0',
  skinShade: '#d9a77c',
  sleeve: '#4cc9f0',
  sleeveShade: '#2a9dc4',
};

/** Topic colours for the card tabs and shelves. */
export const SHELF_COLOUR: Record<string, string> = { scores: '#e63946', changes: '#9b5de5', data: '#2a9d8f' };

type Rect = PixelCanvas['rect'];

/** A box helper mirrored around x when dir = -1 (sprites are authored facing right). */
function mirror(rect: Rect, x: number, y: number, dir: number) {
  return (dx: number, dy: number, w: number, h: number, c: string) => {
    const a = Math.round(x + dx * dir);
    const b = Math.round(x + (dx + w) * dir);
    rect(Math.min(a, b), Math.round(y + dy), Math.abs(b - a), h, c);
  };
}

export type Arm = 'down' | 'forward' | 'up' | 'scratch' | 'chop' | 'chopDown' | 'hug';

/**
 * The beaver chef, standing, feet on (x, y), facing right when dir = 1. About 18 x 30 art pixels.
 * `blink` closes the eye, `bob` lifts the whole body by that many pixels.
 */
export function chef(p: PixelCanvas, x: number, y: number, dir: number, o: { arm?: Arm; blink?: boolean; bob?: number; mouth?: boolean } = {}): void {
  const b = mirror(p.rect, x, y - (o.bob ?? 0), dir);
  // tail: flat paddle behind, cross-hatched like the forest beavers
  b(-11, -10, 5, 9, P.furDark);
  b(-10, -8, 1, 1, P.fur);
  b(-8, -6, 1, 1, P.fur);
  b(-10, -4, 1, 1, P.fur);
  b(-8, -2, 1, 1, P.fur);
  // feet
  b(-5, -3, 4, 3, P.furDark);
  b(1, -3, 5, 3, P.furDark);
  // body
  b(-6, -18, 12, 15, P.fur);
  b(-5, -19, 10, 1, P.fur);
  b(-6, -17, 1, 13, P.furDark);
  // apron with a red bow at the back
  b(-2, -15, 8, 12, P.apron);
  b(-2, -4, 8, 1, P.apronShade);
  b(-1, -18, 1, 3, P.apron);
  b(4, -18, 1, 3, P.apron);
  b(0, -10, 4, 2, P.apronShade);
  b(-8, -13, 2, 2, P.red);
  b(-9, -14, 1, 1, P.red);
  b(-9, -11, 1, 1, P.red);
  // head
  b(-4, -28, 10, 10, P.fur);
  b(-3, -29, 8, 1, P.fur);
  b(-2, -31, 2, 2, P.furDark); // ear
  b(3, -30, 2, 1, P.furDark);
  b(5, -24, 3, 4, P.cream); // snout
  b(8, -24, 1, 2, P.ink); // nose
  if (o.mouth) b(6, -20, 2, 1, P.ink);
  b(6, -20 + (o.mouth ? 1 : 0), 1, 2, P.tooth); // buck teeth
  b(7, -20 + (o.mouth ? 1 : 0), 1, 2, P.tooth);
  if (o.blink) b(2, -25, 2, 1, P.ink);
  else b(3, -26, 1, 2, P.ink); // eye
  b(1, -22, 2, 1, P.pink); // cheek
  // headband, knot tails flying behind
  b(-4, -28, 10, 2, P.red);
  b(-6, -28, 2, 1, P.red);
  b(-7, -27, 1, 2, P.red);
  // arms
  switch (o.arm ?? 'down') {
    case 'down':
      b(2, -16, 3, 8, P.furLight);
      b(2, -9, 3, 2, P.furDark);
      break;
    case 'forward':
      b(3, -16, 8, 3, P.furLight);
      b(10, -16, 2, 3, P.furDark);
      break;
    case 'hug':
      b(1, -15, 8, 3, P.furLight);
      b(8, -15, 2, 3, P.furDark);
      break;
    case 'up':
      b(3, -27, 3, 11, P.furLight);
      b(3, -29, 3, 2, P.furDark);
      break;
    case 'scratch':
      b(-1, -27, 3, 10, P.furLight);
      b(-1, -30, 3, 3, P.furDark);
      break;
    case 'chop':
      b(4, -28, 3, 12, P.furLight);
      b(4, -30, 3, 2, P.furDark);
      break;
    case 'chopDown':
      b(3, -16, 9, 3, P.furLight);
      b(11, -16, 2, 3, P.furDark);
      break;
  }
}

/** Ah Ma's notes, lying open: scribbles, stains, sticky notes and a page working loose. About 30 x 14. */
export function messyBook(p: PixelCanvas, x: number, y: number, t: number, still: boolean): void {
  const { rect } = p;
  // cover peeking out under the pages
  rect(x - 1, y + 1, 32, 12, '#a23f2d');
  rect(x - 1, y + 12, 32, 2, '#7a2d20');
  // pages
  rect(x, y, 14, 12, P.paper);
  rect(x + 16, y, 14, 12, P.paper);
  rect(x + 14, y, 2, 12, P.paperShade);
  rect(x, y + 11, 30, 1, P.paperShade);
  // scribbles: crooked lines in pencil, blue and red
  const inks = [P.scribble, '#3a6fb0', P.scribble, '#c0392b'];
  for (let i = 0; i < 5; i++) {
    for (const side of [0, 16]) {
      const len = 4 + Math.round(hash(i, side + 3) * 8);
      const dx = Math.round(hash(i, side + 7) * 2);
      for (let k = 0; k < len; k++) rect(x + side + 1 + dx + k, y + 2 + i * 2 + (hash(k, i + side) > 0.7 ? 1 : 0), 1, 1, inks[(i + side) % 4]);
    }
  }
  // crossed-out word and a big question mark
  rect(x + 3, y + 6, 6, 1, '#c0392b');
  rect(x + 24, y + 3, 2, 1, '#c0392b');
  rect(x + 26, y + 4, 1, 2, '#c0392b');
  rect(x + 25, y + 6, 1, 1, '#c0392b');
  rect(x + 25, y + 8, 1, 1, '#c0392b');
  // a curry stain
  p.ellipse(x + 9, y + 9, 3, 1.5, '#e9b872');
  // sticky notes sticking out of the top
  rect(x + 4, y - 4, 5, 5, '#ffe066');
  rect(x + 4, y - 4, 5, 1, '#f5c400');
  rect(x + 21, y - 3, 5, 4, '#ff9fc0');
  // a loose page flapping in the breeze
  const flap = still ? 0 : Math.round(Math.sin(t * 3) * 1.5);
  rect(x + 28, y - 3 - flap, 6, 8, P.paper);
  rect(x + 28, y - 3 - flap, 6, 1, P.paperShade);
  rect(x + 29, y - 1 - flap, 4, 1, P.scribble);
  rect(x + 29, y + 1 - flap, 3, 1, P.scribble);
}

/** The codebase as a closed, scruffy book with a "</>" on the cover. About 18 x 14 (plus sticky notes). `pages` thins it. */
export function codeBook(p: PixelCanvas, x: number, y: number, pages = 1): void {
  const { rect } = p;
  const th = Math.max(2, Math.round(6 * pages)); // page block thickness
  const top = y + (6 - th);
  rect(x, top - 8, 18, 8, '#a23f2d'); // cover (seen from the front, tilted up)
  rect(x, top - 8, 18, 1, '#c8553d');
  rect(x + 1, top, 17, th, P.paper); // page edges
  for (let i = 1; i < th; i += 2) rect(x + 2, top + i, 15, 1, P.paperShade);
  rect(x, top, 1, th + 1, '#7a2d20'); // spine
  rect(x, top + th, 18, 1, '#7a2d20');
  // "</>" on the cover
  const g = '#fff5d6';
  rect(x + 5, top - 5, 1, 1, g);
  rect(x + 4, top - 4, 1, 1, g);
  rect(x + 5, top - 3, 1, 1, g);
  rect(x + 9, top - 3, 1, 1, g);
  rect(x + 10, top - 5, 1, 2, g);
  rect(x + 13, top - 5, 1, 1, g);
  rect(x + 14, top - 4, 1, 1, g);
  rect(x + 13, top - 3, 1, 1, g);
  if (pages > 0.5) {
    rect(x + 2, top - 11, 4, 3, '#ffe066'); // sticky notes
    rect(x + 12, top - 10, 4, 2, '#ff9fc0');
  }
}

/** A recipe card: cream, ink outline, a coloured tab for its topic and a few lines. 8 x 10. `glow` rings it in gold. */
export function card(p: PixelCanvas, x: number, y: number, colour: string, o: { glow?: boolean; seed?: number; question?: boolean } = {}): void {
  const { rect } = p;
  if (o.glow) rect(x - 2, y - 2, 12, 14, P.gold);
  rect(x - 1, y - 1, 10, 12, P.ink);
  if (o.question) {
    rect(x, y, 8, 10, P.gold);
    rect(x, y + 9, 8, 1, P.goldShade);
    // a "?"
    rect(x + 3, y + 2, 2, 1, P.ink);
    rect(x + 5, y + 3, 1, 1, P.ink);
    rect(x + 4, y + 4, 1, 2, P.ink);
    rect(x + 4, y + 7, 1, 1, P.ink);
    return;
  }
  rect(x, y, 8, 10, P.paper);
  rect(x, y, 8, 2, colour);
  const s = o.seed ?? 0;
  for (let i = 0; i < 3; i++) rect(x + 1, y + 3 + i * 2, 3 + Math.round(hash(s, i) * 3), 1, P.scribble);
}

/** The tidy, bound docs PRISM writes: blue cover, gold corners, "DOCS" on it. 22 x 18. */
export function docsBook(p: PixelCanvas, x: number, y: number): void {
  const { rect } = p;
  rect(x - 1, y - 1, 24, 20, P.ink);
  rect(x, y, 22, 18, '#2b5ea8');
  rect(x, y, 22, 1, '#4f86d6');
  rect(x, y, 3, 18, '#1d4580'); // spine
  rect(x + 19, y + 1, 3, 3, P.gold);
  rect(x + 19, y + 14, 3, 3, P.gold);
  word(p, 'DOCS', x + 5, y + 4, P.gold);
  rect(x + 5, y + 11, 14, 1, '#9cc2f0');
  rect(x + 5, y + 13, 10, 1, '#9cc2f0');
}

// A 3 x 5 pixel font for the few words drawn into the art.
const GLYPHS: Record<string, string[]> = {
  D: ['110', '101', '101', '101', '110'],
  O: ['111', '101', '101', '101', '111'],
  C: ['111', '100', '100', '100', '111'],
  S: ['111', '100', '111', '001', '111'],
  '?': ['111', '001', '011', '000', '010'],
  '!': ['010', '010', '010', '000', '010'],
};
export function word(p: PixelCanvas, s: string, x: number, y: number, colour: string): void {
  [...s].forEach((ch, i) => {
    const g = GLYPHS[ch];
    if (!g) return;
    g.forEach((row, ry) => [...row].forEach((bit, rx) => bit === '1' && p.rect(x + i * 4 + rx, y + ry, 1, 1, colour)));
  });
}

/** The visitor's hand, reaching up from the bottom edge, with a blue sleeve. Fingertips at (x, y). */
export function hand(p: PixelCanvas, x: number, y: number, h: number): void {
  const { rect } = p;
  rect(x - 4, y + 4, 9, h, P.sleeve);
  rect(x - 4, y + 4, 2, h, P.sleeveShade);
  rect(x - 4, y, 9, 5, P.skin);
  rect(x - 4, y, 9, 1, P.skinShade);
  rect(x + 5, y + 1, 2, 3, P.skin); // thumb
  rect(x - 1, y + 4, 1, 1, P.skinShade);
  rect(x + 2, y + 4, 1, 1, P.skinShade);
}

/**
 * A hawker's cleaver held in a paw at (x, y). Raised: the blade stands up above the paw. Down: the blade lies flat,
 * reaching out in front of the paw (to the right when dir = 1), its cutting edge at y + 3.
 */
export function cleaver(p: PixelCanvas, x: number, y: number, down: boolean, dir = 1): void {
  const b = mirror(p.rect, x, y, dir);
  if (down) {
    b(0, -1, 3, 2, P.woodEdge);
    b(3, -3, 10, 6, '#d6dde4');
    b(3, -3, 10, 1, '#9aa6b2');
    b(3, 2, 10, 1, P.white);
  } else {
    b(0, -2, 2, 4, P.woodEdge);
    b(-1, -12, 6, 10, '#d6dde4');
    b(-1, -12, 1, 10, P.white);
    b(4, -12, 1, 10, '#9aa6b2');
  }
}

/** A sparkle (plus shape) that twinkles with `on`. */
export function sparkle(p: PixelCanvas, x: number, y: number, on: boolean, c = P.gold): void {
  p.rect(x, y, 1, 1, c);
  if (on) {
    p.rect(x - 2, y, 1, 1, c);
    p.rect(x + 2, y, 1, 1, c);
    p.rect(x, y - 2, 1, 1, c);
    p.rect(x, y + 2, 1, 1, c);
  }
}

export function heart(p: PixelCanvas, x: number, y: number): void {
  const c = '#ff4f7b';
  p.rect(x, y, 2, 1, c);
  p.rect(x + 3, y, 2, 1, c);
  p.rect(x, y + 1, 5, 1, c);
  p.rect(x + 1, y + 2, 3, 1, c);
  p.rect(x + 2, y + 3, 1, 1, c);
  p.rect(x, y, 1, 1, '#ffb3c6');
}

/** A floating question mark in a speech bubble. */
export function bubbleQ(p: PixelCanvas, x: number, y: number): void {
  p.rect(x - 1, y - 1, 9, 9, P.ink);
  p.rect(x, y, 7, 7, P.white);
  p.rect(x + 1, y + 8, 2, 1, P.ink);
  p.rect(x + 1, y + 7, 2, 1, P.white);
  word(p, '?', x + 2, y + 1, P.ink);
}

/**
 * The hawker-centre stall wall behind the counter: green tiles, a red and cream awning along the top, and a hanging
 * lamp at x = lamp (a fraction of the width) whose shade sits at y = lampY. `dusk` warms it for the ending.
 */
export function stallWall(p: PixelCanvas, top: number, o: { lamp?: number; lampY?: number; dusk?: boolean } = {}): void {
  const { rect, w } = p;
  rect(0, 0, w, top, o.dusk ? '#b9d2c0' : P.tile);
  const line = o.dusk ? '#a5c3ae' : P.tileLine;
  for (let y = 0; y < top; y += 6) rect(0, y, w, 1, line);
  for (let y = 0; y < top; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < w; x += 6) rect(x, y, 1, 6, line);
  for (let y = 3; y < top; y += 12) for (let x = 2; x < w; x += 12) rect(x, y, 2, 2, o.dusk ? '#aac8b4' : P.tileShade);
  // a wooden rail where the wall meets the counter
  rect(0, top - 3, w, 3, P.woodDark);
  rect(0, top - 3, w, 1, P.wood);
  const aw = 7;
  for (let x = 0; x < w; x += 8) {
    rect(x, 0, 4, aw, P.red);
    rect(x + 4, 0, 4, aw, P.apron);
    rect(x, aw, 4, 2, P.red);
    rect(x + 4, aw, 4, 1, P.apron);
  }
  if (o.lamp !== undefined) {
    const lx = Math.round(w * o.lamp);
    const ly = Math.max(aw + 6, o.lampY ?? aw + 10);
    rect(lx, 0, 1, ly, P.ink);
    rect(lx - 4, ly, 9, 3, '#e09f1f');
    rect(lx - 3, ly - 1, 7, 1, '#c27a12');
    rect(lx - 3, ly + 3, 7, 1, '#fff3b0');
    if (o.dusk) {
      p.ctx.globalAlpha = 0.25;
      for (let i = 1; i < 6; i++) rect(lx - i * 3, ly + 3 + i * 4, i * 6 + 1, 4, '#ffe6a0');
      p.ctx.globalAlpha = 1;
    }
  }
}

/** The steel counter in front of the stall: its top is at y = top and its ribbed front runs to the bottom. */
export function counter(p: PixelCanvas, top: number): void {
  const { rect, w, h } = p;
  rect(0, top, w, 3, P.steelLight);
  rect(0, top + 3, w, 2, P.steel);
  rect(0, top + 5, w, h - top - 5, P.steelFront);
  for (let x = 3; x < w; x += 7) rect(x, top + 7, 1, h - top - 7, P.steelDark);
  rect(0, top + 5, w, 1, P.steelDark);
}

/** The stall's menu board: three bowls (chicken rice, char kway teow, laksa) with price dots. 30 x 16. */
export function menuBoard(p: PixelCanvas, x: number, y: number): void {
  const { rect } = p;
  rect(x, y, 30, 16, P.woodEdge);
  rect(x + 1, y + 1, 28, 14, '#2f4f3a');
  rect(x + 1, y + 1, 28, 1, '#3d6a4d');
  const bowls: [string, string][] = [['#fff5d6', '#e9a13b'], ['#5a3a1f', '#2b2b33'], ['#ff8a3d', '#c0392b']];
  bowls.forEach(([food, topper], i) => {
    const bx = x + 3 + i * 9;
    rect(bx, y + 5, 7, 2, food);
    rect(bx + 2, y + 4, 3, 1, topper);
    rect(bx, y + 7, 7, 2, P.white);
    rect(bx + 1, y + 9, 5, 1, '#d0d8e0');
    rect(bx + 2, y + 12, 1, 1, P.gold);
    rect(bx + 4, y + 12, 1, 1, P.gold);
  });
}

/** A gas stove with a wok and live flames. Wok rim centre at (x, y). `toss` (0..1) lifts the wok and flares the fire. */
export function wok(p: PixelCanvas, x: number, y: number, frame: number, toss = 0, still = false): void {
  const { rect } = p;
  const lift = Math.round(Math.sin(Math.min(1, toss) * Math.PI) * 6);
  // flames (under the wok)
  const big = toss > 0 ? 2 : 1;
  for (let i = -3; i <= 3; i++) {
    const fh = (2 + ((still ? 1 : frame + i * 3) % 3)) * big;
    rect(x + i * 2, y + 4 - fh, 1, fh, i % 2 ? '#ff9f1c' : '#ffd166');
    rect(x + i * 2, y + 4 - Math.max(1, fh - 2), 1, 1, P.red);
  }
  rect(x - 8, y + 4, 17, 2, '#3a3a48'); // burner ring
  // wok
  const wy = y - lift;
  rect(x - 8, wy - 1, 17, 1, '#55555f');
  rect(x - 7, wy, 15, 2, '#2b2b33');
  rect(x - 5, wy + 2, 11, 1, '#2b2b33');
  rect(x + 9, wy - 1, 5, 1, P.woodEdge); // handle
  // food in the wok jumps on a toss
  if (toss > 0) for (let i = 0; i < 5; i++) rect(x - 4 + i * 2, wy - 2 - Math.round(Math.sin(toss * Math.PI) * (4 + (i % 3) * 2)), 1, 1, i % 2 ? '#ffd166' : '#52e08a');
  else rect(x - 4, wy - 1, 8, 1, '#e9a13b');
}

/** Steam puffs rising from (x, y). */
export function steam(p: PixelCanvas, x: number, y: number, t: number): void {
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.7 + i / 4) % 1;
    const sx = x + Math.round(Math.sin(k * 6 + i) * 2);
    const sy = y - Math.round(k * 16);
    p.ctx.globalAlpha = 0.65 * (1 - k);
    p.rect(sx, sy, 2, 2, P.white);
    p.ctx.globalAlpha = 1;
  }
}

/** Ah Ma's framed portrait: an older beaver with white hair in a bun and round glasses. 16 x 18. */
export function portrait(p: PixelCanvas, x: number, y: number): void {
  const { rect } = p;
  rect(x, y, 16, 18, P.woodEdge);
  rect(x + 1, y + 1, 14, 16, P.wood);
  rect(x + 2, y + 2, 12, 14, '#f6e7c8');
  // hair bun and hair
  rect(x + 6, y + 3, 4, 2, '#f0f0f0');
  rect(x + 4, y + 5, 8, 2, '#e0e0e0');
  // face
  rect(x + 4, y + 7, 8, 7, P.fur);
  rect(x + 6, y + 11, 4, 2, P.cream);
  rect(x + 7, y + 11, 2, 1, P.ink);
  rect(x + 7, y + 13, 1, 1, P.tooth);
  rect(x + 8, y + 13, 1, 1, P.tooth);
  // round glasses
  rect(x + 4, y + 8, 3, 3, P.ink);
  rect(x + 9, y + 8, 3, 3, P.ink);
  rect(x + 5, y + 9, 1, 1, '#cfe9ff');
  rect(x + 10, y + 9, 1, 1, '#cfe9ff');
  rect(x + 7, y + 9, 2, 1, P.ink);
  rect(x + 4, y + 14, 8, 2, '#c0392b'); // red blouse collar
  rect(x + 7, y + 17, 2, 2, P.ink); // hook
}

/** A wooden shelf unit: `rows` shelves of `cols` card slots (10 art px apart). Returns the slot origin function. */
export function shelfUnit(p: PixelCanvas, x: number, y: number, rows: number, cols: number, colours: string[], rowH = 16): (row: number, col: number) => { x: number; y: number } {
  const { rect } = p;
  const wIn = cols * 10 + 3;
  const hIn = rows * rowH;
  rect(x - 2, y - 2, wIn + 4, hIn + 4, P.woodEdge);
  rect(x, y, wIn, hIn, '#6b4423');
  for (let r = 0; r < rows; r++) {
    const py = y + (r + 1) * rowH - 3;
    rect(x, py, wIn, 3, P.wood);
    rect(x, py, wIn, 1, P.woodLight);
    rect(x, py + 3 - 1, wIn, 1, P.woodDark);
    rect(x - 2, py - rowH + 3, 2, rowH, colours[r]); // topic colour on the side of each shelf
  }
  return (row, col) => ({ x: x + 2 + col * 10, y: y + row * rowH + rowH - 14 });
}
