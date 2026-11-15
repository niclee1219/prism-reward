// The Learn scenes. Each one draws a little animated pixel scene on its own canvas (src/scene/pixelCanvas.ts), puts
// real DOM elements over it for anything to read or tap, and returns a handle whose stop() ends its loop and timers.
// The controller (learn.ts) owns the line of text, the stamp, the dots and BACK / NEXT / SKIP.
import { citation, FILE_BY_HAND, LEARN_ENDING, LEARN_QUESTIONS, LEARN_SCENES, PIECES, pieceById, SHELVES, SIGNPOSTS, SPLIT_AGAIN } from '../content/learn';
import { buzz } from '../game/haptics';
import { createPixelCanvas, reducedMotion, type PixelCanvas } from '../scene/pixelCanvas';
import { startSkyline } from '../scene/skyline';
import { startForest } from '../ui/forest';
import {
  bubbleQ, card, chef, cleaver, codeBook, counter, docsBook, hand, heart, menuBoard, messyBook, P, portrait, SHELF_COLOUR,
  shelfUnit, sparkle, stallWall, steam, wok, type Arm,
} from './art';

export interface LearnState {
  /** The question picked in the Ask scene. */
  question: string | null;
  /** Ids of the scenes whose step is done. */
  done: Set<string>;
  /** Signposts opened in the last scene. */
  signs: Set<string>;
}

export interface SceneEnv {
  /** Full-screen layer: the canvas, plus DOM placed over spots in the art. */
  layer: HTMLElement;
  /** The free area between the line of text and the navigation, for DOM panels. */
  band: HTMLElement;
  state: LearnState;
  /** The step is done: the stamp lands and NEXT appears. Safe to call more than once. */
  done(): void;
  /** Change the "what to do" text shown where NEXT will appear. */
  todo(text: string): void;
  /** The visitor did something: restart the waiting-hint timer. */
  poke(): void;
  /** Where the stamp lands, as a fraction of the screen height (its centre). */
  stampAt(fy: number): void;
}

export interface SceneHandle {
  stop(): void;
}

export type SceneBuilder = (env: SceneEnv, wasDone: boolean) => SceneHandle;

// ---------------------------------------------------------------------------------------------------------------------
// helpers

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

const clamp01 = (k: number) => (k < 0 ? 0 : k > 1 ? 1 : k);
/** A point along a hop from a to b; `lift` is how high the arc goes. */
function arc(a: { x: number; y: number }, b: { x: number; y: number }, k: number, lift: number) {
  const e = clamp01(k);
  const s = e * e * (3 - 2 * e);
  return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s - Math.sin(e * Math.PI) * lift };
}
/** Animation time: zero under prefers-reduced-motion, so every step completes at once. */
const dur = (s: number) => (reducedMotion ? 0 : s);
/** How far (0..1) an animation of length d that started at `at` has got by time t; a zero length is already done. */
const prog = (t: number, at: number, d: number) => (d <= 0 ? (t >= at ? 1 : 0) : (t - at) / d);

interface Stage {
  px: PixelCanvas;
  /** The DOM band in art pixels, this frame. */
  band(): { top: number; bottom: number };
  /** Pin an element's anchor point (see .learn-tag in learn.css) to an art position, in % so it follows resizes. */
  pin(e: HTMLElement, x: number, y: number, w?: number, h?: number): void;
  /** A label pinned over the art. */
  tag(text: string, cls?: string): HTMLElement;
  /** A big invisible button over the scene that does the step: tapping anywhere sensible works. */
  tapArea(label: string, onTap: () => void): HTMLButtonElement;
  /** The marked spot the waiting hint points at. */
  ring(): HTMLElement;
  timers: Set<ReturnType<typeof setTimeout>>;
  later(ms: number, fn: () => void): void;
  stop(): void;
}

function stage(env: SceneEnv, fps = 15): Stage {
  const canvas = el('canvas', 'learn-canvas pix-crisp');
  canvas.setAttribute('aria-hidden', 'true');
  env.layer.prepend(canvas);
  const px = createPixelCanvas(canvas, { scale: (cw) => Math.min(6, Math.max(3, Math.round(cw / 80))), fps, minWidth: 60, minHeight: 90 });
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const band = () => {
    const L = env.layer.getBoundingClientRect();
    const B = env.band.getBoundingClientRect();
    const k = px.h / (L.height || 1);
    return { top: Math.round((B.top - L.top) * k), bottom: Math.round((B.bottom - L.top) * k) };
  };
  const pin = (e: HTMLElement, x: number, y: number, w?: number, h?: number) => {
    e.style.left = `${((x / px.w) * 100).toFixed(2)}%`;
    e.style.top = `${((y / px.h) * 100).toFixed(2)}%`;
    if (w !== undefined) e.style.width = `${((w / px.w) * 100).toFixed(2)}%`;
    if (h !== undefined) e.style.height = `${((h / px.h) * 100).toFixed(2)}%`;
  };
  return {
    px,
    band,
    pin,
    tag(text, cls = '') {
      const t = el('span', `learn-tag ${cls}`, text);
      env.layer.append(t);
      return t;
    },
    tapArea(label, onTap) {
      const b = el('button', 'learn-tap');
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => {
        env.poke();
        onTap();
      });
      env.layer.append(b);
      return b;
    },
    ring() {
      const r = el('i', 'learn-ring learn-target');
      r.setAttribute('aria-hidden', 'true');
      env.layer.append(r);
      return r;
    },
    timers,
    later(ms, fn) {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    },
    stop() {
      px.stop();
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}

/** Where the counter top goes: low in the free band, but not so low that tall phones get a wall of empty tiles. */
function counterTop(b: { top: number; bottom: number }): number {
  return Math.round(b.top + Math.min((b.bottom - b.top) * 0.8, 112));
}

/** A gentle idle: a blink now and then and a slow bob. */
function idle(frame: number, seed = 0) {
  return { blink: !reducedMotion && (frame + seed * 7) % 46 < 2, bob: reducedMotion ? 0 : (frame + seed) % 16 < 8 ? 0 : 1 };
}

// Shelf layout shared by the Embed, Ask and Retrieve scenes: which slot (row, column) each card and question sits in.
// Rows follow SHELVES (scores, changes, data). A question lands in the gap next to the cards it is closest to.
const SLOT: Record<string, [number, number]> = {
  'score-formula': [0, 0], weights: [0, 1], bands: [0, 2],
  'release-notes': [1, 0], 'old-weights': [1, 1], 'new-input': [1, 2],
  missing: [2, 0], 'input-list': [2, 1], 'late-payments': [2, 3],
};
const Q_SLOT: Record<string, [number, number]> = { 'how-score': [0, 3], 'what-changed': [1, 3], 'which-data': [2, 2] };
const ROW_COLOUR = SHELVES.map((s) => SHELF_COLOUR[s.id]);
const colourOf = (pieceId: string) => SHELF_COLOUR[pieceById(pieceId).shelf];
const seedOf = (pieceId: string) => PIECES.findIndex((p) => p.id === pieceId) + 3;

/** Where the shelf unit goes: top left of the band, a little shorter on short phones. */
function shelfGeom(b: { top: number; bottom: number }) {
  const compact = b.bottom - b.top < 105;
  const rowH = compact ? 14 : 16;
  const y = b.top + (compact ? 4 : 6);
  return { x: 3, y, rowH, bottom: y + 3 * rowH + 2 };
}
/** Draws the shelf unit and pins its labels. Returns the slot function. */
function shelves(s: Stage, labels: HTMLElement[]) {
  const g = shelfGeom(s.band());
  const slot = shelfUnit(s.px, g.x, g.y, 3, 4, ROW_COLOUR, g.rowH);
  labels.forEach((l, r) => s.pin(l, g.x + 4 * 10 + 3 + 4, g.y + r * g.rowH + g.rowH / 2 + 1));
  return { slot, ...g };
}
function shelfLabels(s: Stage): HTMLElement[] {
  return SHELVES.map((sh, r) => {
    const t = s.tag(`${sh.icon} ${sh.label}`, 'learn-tag--shelf');
    t.style.setProperty('--c', ROW_COLOUR[r]);
    return t;
  });
}

/** The card pile on the counter: three neat stacks; spot i (0 = top of the first stack). */
function pileSpot(i: number, x: number, top: number) {
  const stack = i % 3;
  const depth = Math.floor(i / 3);
  return { x: x + stack * 9 + depth, y: top - 11 + depth * 2 - 4 };
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. The problem: Ah Ma's stall, her messy recipe book

const problem: SceneBuilder = (env) => {
  const s = stage(env);
  const plate = s.tag('AH MA', 'learn-tag--plate');
  env.stampAt(0.4);
  s.px.run((t, f) => {
    const { px } = s;
    const b = s.band();
    const top = counterTop(b);
    const wallMid = Math.round(b.top + (top - b.top) * 0.38);
    stallWall(px, top, { lamp: 0.5, lampY: wallMid - 6 });
    const ax = Math.round(px.w * 0.08);
    portrait(px, ax, wallMid - 9);
    s.pin(plate, ax + 8, wallMid + 15);
    menuBoard(px, px.w - 34, wallMid - 7);
    const id = idle(f);
    chef(px, Math.round(px.w * 0.78), top + 10, -1, { arm: 'scratch', blink: id.blink, bob: id.bob });
    counter(px, top);
    const bx = Math.round(px.w * 0.36) - 15;
    messyBook(px, bx, top - 12, t, reducedMotion);
    // question marks drift up out of the notes
    for (let i = 0; i < 3; i++) {
      const k = reducedMotion ? 0.3 + i * 0.2 : (t * 0.35 + i / 3) % 1;
      px.ctx.globalAlpha = reducedMotion ? 1 : Math.min(1, (1 - k) * 2);
      const rise = Math.max(4, Math.min(22, top - 30 - (wallMid + 14)));
      bubbleQ(px, bx + 2 + i * 10, Math.round(top - 24 - k * rise - (i % 2) * 3));
      px.ctx.globalAlpha = 1;
    }
  });
  return s;
};

// ---------------------------------------------------------------------------------------------------------------------
// 2. Upload: the visitor's hand slides the book across the counter to the beaver (PRISM)

const upload: SceneBuilder = (env) => {
  const s = stage(env);
  const name = s.tag('PRISM', 'learn-tag--name');
  env.stampAt(0.4);
  s.px.run((t, f) => {
    const { px } = s;
    const b = s.band();
    const top = counterTop(b);
    const wallMid = Math.round(b.top + (top - b.top) * 0.38);
    stallWall(px, top, { lamp: 0.5, lampY: wallMid - 6 });
    portrait(px, Math.round(px.w * 0.08), wallMid - 9);
    menuBoard(px, px.w - 34, wallMid - 7);
    const cx = Math.round(px.w * 0.72);
    const T = reducedMotion ? 9 : t;
    const got = T > 1.7;
    const id = idle(f);
    const arm: Arm = !got ? (T > 1.2 ? 'forward' : 'down') : 'hug';
    chef(px, cx, top + 10, -1, { arm, blink: id.blink, bob: got ? id.bob : 0, mouth: got });
    s.pin(name, cx, top - 25);
    counter(px, top);
    // the book: rises from the bottom edge onto the counter, then slides across to the beaver's paws
    const start = { x: Math.round(px.w * 0.12), y: px.h + 4 };
    const onCounter = { x: Math.round(px.w * 0.22), y: top - 7 };
    const atPaws = { x: cx - 25, y: top - 7 };
    const pos = T < 0.8 ? arc(start, onCounter, T / 0.8, 0) : arc(onCounter, atPaws, (T - 0.8) / 0.9, 2);
    const bob = got ? -id.bob : 0;
    codeBook(px, Math.round(pos.x), Math.round(pos.y) + bob);
    // the visitor's hand pushes it, then lets go and drops away
    const handY = T < 1.7 ? pos.y + 6 : pos.y + 6 + (T - 1.7) * 60;
    if (handY < px.h) hand(px, Math.round(pos.x) + 3, Math.round(handY), px.h);
    if (got) {
      for (let i = 0; i < 3; i++) sparkle(px, cx - 22 + i * 12, top - 30 - (i % 2) * 6, reducedMotion || (f + i * 3) % 8 < 4);
      if (!reducedMotion && T < 4.5) heart(px, cx - 6, Math.round(top - 34 - (T - 1.7) * 6));
    }
  });
  return s;
};

// ---------------------------------------------------------------------------------------------------------------------
// 3. Split: tap the book, the beaver chops it into recipe cards (three chops)

const split: SceneBuilder = (env, wasDone) => {
  const s = stage(env);
  const name = s.tag('PRISM', 'learn-tag--name');
  const ring = s.ring();
  env.stampAt(0.3);
  const ORDER = [...FILE_BY_HAND, ...PIECES.map((p) => p.id).filter((id) => !FILE_BY_HAND.includes(id))];
  let chops = wasDone ? 3 : 0;
  let chopAt = -9;
  let now = 0;
  // flights[i]: when card i left the book (it lands 0.55 s later)
  const flights: number[] = wasDone ? ORDER.map(() => -9) : [];
  let lastTap = 0;
  s.tapArea('Chop the book into pieces', () => {
    // Real time, not scene time: scene time slows down when frames drop, and a quick tap must still count.
    const ms = performance.now();
    if (chops >= 3 || ms - lastTap < 150) return;
    lastTap = ms;
    chopAt = now;
    chops++;
    buzz('near');
    for (let k = 0; k < 3; k++) flights.push(now + dur(0.12) + dur(k * 0.08));
    if (chops < 3) env.todo(SPLIT_AGAIN[chops - 1]);
    else s.later(reducedMotion ? 0 : 900, () => env.done());
  });
  s.px.run((t, f) => {
    now = t;
    const { px } = s;
    const b = s.band();
    const top = counterTop(b);
    const wallMid = Math.round(b.top + (top - b.top) * 0.38);
    stallWall(px, top, { lamp: 0.5, lampY: wallMid - 6 });
    portrait(px, Math.round(px.w * 0.08), wallMid - 9);
    menuBoard(px, px.w - 34, wallMid - 7);
    env.stampAt((top - 38) / px.h);
    const cx = Math.round(px.w * 0.24);
    const k = t - chopAt;
    const swinging = k < dur(0.28);
    const id = idle(f);
    chef(px, cx, top + 10, 1, { arm: swinging ? 'chopDown' : 'chop', blink: id.blink, mouth: chops >= 3 });
    s.pin(name, cx, top - 25);
    counter(px, top);
    // chopping board
    const bx = Math.round(px.w * 0.5);
    px.ellipse(bx, top - 1, 13, 3, P.woodDark);
    px.ellipse(bx, top - 2, 13, 3, '#c58b4f');
    px.ellipse(bx, top - 2, 9, 1.5, '#d9a066');
    // the book gets thinner with each chop; a white cut line flashes on impact
    if (chops < 3) {
      codeBook(px, bx - 9, top - 10, 1 - chops / 3);
      if (k < dur(0.2) && k >= 0) px.rect(bx + 1, top - 18, 1, 14, P.white);
    } else if (!reducedMotion && k < 0.4) {
      for (let i = 0; i < 6; i++) px.rect(bx - 8 + i * 3, top - 5 - ((i * 7) % 4), 1, 1, P.paper);
    }
    // the cleaver in the paw
    if (swinging) cleaver(px, cx + 11, top - 5, true, 1);
    else cleaver(px, cx + 5, top - 20, false, 1);
    // cards fly out of the book onto the pile at the right
    const pileX = Math.min(bx + 12, px.w - 31);
    flights.map((at, i) => [at, i] as const).reverse().forEach(([at, i]) => {
      const to = pileSpot(i, pileX, top);
      const p = arc({ x: bx - 4, y: top - 14 }, to, prog(t, at, dur(0.55)), 10);
      if (t >= at) card(px, Math.round(p.x), Math.round(p.y), colourOf(ORDER[i]), { seed: seedOf(ORDER[i]) });
    });
    s.pin(ring, bx, top - 9, 30, 22);
    ring.classList.toggle('done', chops >= 3);
  });
  return s;
};

// ---------------------------------------------------------------------------------------------------------------------
// 4. Embed: tap the pile, each card flies to the shelf for its meaning; after three the rest file themselves

const embed: SceneBuilder = (env, wasDone) => {
  const s = stage(env);
  const labels = shelfLabels(s);
  const name = s.tag('PRISM', 'learn-tag--name');
  const ring = s.ring();
  const chip = s.tag('', 'learn-tag--chip');
  chip.hidden = true;
  const ORDER = [...FILE_BY_HAND, ...PIECES.map((p) => p.id).filter((id) => !FILE_BY_HAND.includes(id))];
  const launched: number[] = wasDone ? ORDER.map(() => -9) : [];
  let now = 0;
  let finishing = false;
  const launch = () => {
    const i = launched.length;
    if (i >= ORDER.length) return;
    launched.push(now);
    const id = ORDER[i];
    const row = SLOT[id][0];
    s.later(dur(0.5) * 1000, () => {
      labels[row].classList.remove('flash');
      void labels[row].offsetWidth;
      labels[row].classList.add('flash');
    });
    return id;
  };
  s.tapArea('File the next card', () => {
    if (finishing) return;
    const id = launch();
    if (!id) return;
    buzz('tick');
    chip.hidden = false;
    const shelf = SHELVES.find((x) => x.id === pieceById(id).shelf)!;
    chip.innerHTML = '';
    chip.append(el('span', '', `“${pieceById(id).name}”`), el('b', '', `→ ${shelf.icon} ${shelf.label}`));
    chip.classList.remove('pop');
    void chip.offsetWidth;
    chip.classList.add('pop');
    if (launched.length === FILE_BY_HAND.length) {
      finishing = true;
      env.todo('The beaver files the rest…');
      // The visitor got the idea: the beaver files the rest, quickly.
      const rest = ORDER.length - launched.length;
      for (let n = 0; n < rest; n++) s.later((reducedMotion ? 0 : 1300) + n * (reducedMotion ? 0 : 200), () => launch());
      s.later((reducedMotion ? 0 : 1300) + rest * (reducedMotion ? 0 : 200) + (reducedMotion ? 0 : 700), () => {
        chip.hidden = true;
        env.done();
      });
    } else env.todo(launched.length === 1 ? 'Tap the cards again' : 'And once more');
  });
  s.px.run((t, f) => {
    now = t;
    const { px } = s;
    const b = s.band();
    const top = Math.max(counterTop(b), shelfGeom(b).bottom + 34);
    stallWall(px, top);
    const sh = shelves(s, labels);
    const cx = Math.round(px.w * 0.84);
    const id = idle(f);
    chef(px, cx, top + 10, -1, { arm: finishing && launched.length < ORDER.length && f % 6 < 3 ? 'forward' : 'down', blink: id.blink, bob: id.bob });
    s.pin(name, cx, top - 25);
    counter(px, top);
    const pileX = Math.round(px.w * 0.16);
    // cards still on the pile, back ones first
    for (let i = ORDER.length - 1; i >= launched.length; i--) {
      const p = pileSpot(i, pileX, top);
      card(px, p.x, p.y, colourOf(ORDER[i]), { seed: seedOf(ORDER[i]) });
    }
    // cards on their way or already on the shelves
    launched.forEach((at, i) => {
      const id = ORDER[i];
      const [r, c] = SLOT[id];
      const from = pileSpot(i, pileX, top);
      const p = arc(from, sh.slot(r, c), prog(t, at, dur(0.5)), 14);
      card(px, Math.round(p.x), Math.round(p.y), colourOf(id), { seed: seedOf(id) });
    });
    s.pin(ring, pileX + 12, top - 13, 36, 22);
    ring.classList.toggle('done', launched.length >= FILE_BY_HAND.length);
    s.pin(chip, px.w / 2, top - 26);
    env.stampAt((sh.bottom + (top - 26 - sh.bottom) / 2) / px.h);
  });
  return s;
};

// ---------------------------------------------------------------------------------------------------------------------
// 5. Ask: pick a question; it becomes a gold card and is filed next to the cards closest in meaning

function questionButtons(env: SceneEnv, cls: string, short: boolean, onPick: (id: string) => void) {
  const box = el('div', `learn-questions ${cls}`);
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Questions');
  const btns = LEARN_QUESTIONS.map((q) => {
    const b = el('button', 'learn-q', short ? q.short : q.q);
    b.type = 'button';
    if (short) b.setAttribute('aria-label', q.q);
    b.dataset.q = q.id;
    b.addEventListener('click', () => {
      env.poke();
      onPick(q.id);
    });
    box.append(b);
    return b;
  });
  const mark = () => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === env.state.question)));
  mark();
  return { box, mark };
}

const ask: SceneBuilder = (env, wasDone) => {
  const s = stage(env);
  const labels = shelfLabels(s);
  env.stampAt(0.5);
  let fly = { from: null as null | { x: number; y: number }, at: -9 };
  let now = 0;
  let last: { x: number; y: number } | null = null;
  const qs = questionButtons(env, 'learn-questions--big', false, (id) => {
    if (id === env.state.question && fly.at > now - 0.6) return;
    buzz('tick');
    fly = { from: last, at: now };
    env.state.question = id;
    qs.mark();
    s.later(dur(0.7) * 1000, () => env.done());
  });
  qs.box.classList.add('learn-target');
  env.band.append(qs.box);
  if (!wasDone) env.state.question = null;
  qs.mark();
  s.px.run((t) => {
    now = t;
    const { px } = s;
    const b = s.band();
    stallWall(px, px.h);
    const sh = shelves(s, labels);
    for (const id of Object.keys(SLOT)) {
      const [r, c] = SLOT[id];
      const p = sh.slot(r, c);
      card(px, p.x, p.y, colourOf(id), { seed: seedOf(id) });
    }
    const q = env.state.question;
    if (q) {
      const [r, c] = Q_SLOT[q];
      const to = sh.slot(r, c);
      const from = fly.from ?? { x: Math.round(px.w / 2), y: b.bottom - 10 };
      const p = arc(from, to, prog(t, fly.at, dur(0.6)), 12);
      const landed = t - fly.at >= dur(0.6);
      card(px, Math.round(p.x), Math.round(p.y), P.gold, { question: true, glow: landed && (reducedMotion || Math.floor(t * 3) % 2 === 0) });
      if (landed) last = to;
    }
  });
  return s;
};

// ---------------------------------------------------------------------------------------------------------------------
// 6. Retrieve: a ripple spreads from the question; the closest cards light up and hop down onto the beaver's tray

const retrieve: SceneBuilder = (env, wasDone) => {
  const s = stage(env);
  const labels = shelfLabels(s);
  const name = s.tag('PRISM', 'learn-tag--name');
  const pulled = el('div', 'learn-pulled pix-panel');
  pulled.hidden = true;
  env.layer.append(pulled);
  env.stampAt(0.5);
  let start = wasDone ? -99 : 0;
  let now = 0;
  const RIPPLE = dur(1.0);
  const HOP_AT = dur(1.5);
  const HOP_GAP = dur(0.3);
  const HOP = dur(0.5);
  const showPulled = () => {
    const q = LEARN_QUESTIONS.find((x) => x.id === env.state.question)!;
    pulled.innerHTML = '';
    pulled.setAttribute('aria-label', `Pulled for: ${q.q}`);
    const ul = el('ul');
    q.retrieves.forEach((id) => {
      const li = el('li', '', pieceById(id).name);
      li.style.setProperty('--c', colourOf(id));
      ul.append(li);
    });
    pulled.append(ul);
    pulled.hidden = false;
  };
  // The list and the stamp come once the last card has landed on the tray (checked in the draw loop, in scene time).
  const TOTAL = HOP_AT + HOP_GAP * 2 + HOP + dur(0.3);
  let landed = wasDone;
  const play = () => {
    start = now;
    pulled.hidden = true;
    landed = false;
  };
  if (!env.state.question) env.state.question = LEARN_QUESTIONS[0].id;
  const qs = questionButtons(env, 'learn-questions--row', true, (id) => {
    if (id === env.state.question) return;
    buzz('tick');
    env.state.question = id;
    qs.mark();
    play();
  });
  const again = el('div', 'learn-again');
  again.append(el('span', '', 'Try another:'), qs.box);
  env.band.append(again);
  if (wasDone) showPulled();
  else play();
  s.px.run((t, f) => {
    now = t;
    const { px } = s;
    const b = s.band();
    // the counter sits above the "try another" row, below the shelves
    const rowTop = Math.round(((again.getBoundingClientRect().top - env.layer.getBoundingClientRect().top) / (env.layer.clientHeight || 1)) * px.h);
    const top = Math.max(shelfGeom(b).bottom + 22, rowTop - 3);
    env.stampAt((b.top + 30) / px.h);
    stallWall(px, top);
    const sh2 = shelves(s, labels);
    const q = LEARN_QUESTIONS.find((x) => x.id === env.state.question)!;
    const k = t - start;
    if (!landed && k >= TOTAL) {
      landed = true;
      showPulled();
      env.done();
      buzz('tick');
    }
    const [qr, qc] = Q_SLOT[q.id];
    const qp = sh2.slot(qr, qc);
    // chef and tray
    const cx = Math.round(px.w * 0.84);
    const id = idle(f);
    chef(px, cx, top + 10, -1, { arm: k > HOP_AT && k < HOP_AT + HOP_GAP * 3 ? 'forward' : 'down', blink: id.blink, bob: id.bob });
    s.pin(name, cx, top - 25);
    counter(px, top);
    const trayX = Math.round(px.w * 0.12);
    px.rect(trayX - 2, top - 2, 36, 2, '#c0392b');
    px.rect(trayX - 3, top - 3, 38, 1, '#e05a4a');
    const trayAt = (n: number) => ({ x: trayX + 2 + n * 11, y: top - 13 });
    // the cards on the shelves; the pulled ones light up, then hop down to the tray
    for (const pid of Object.keys(SLOT)) {
      const [r, c] = SLOT[pid];
      const home = sh2.slot(r, c);
      const n = q.retrieves.indexOf(pid);
      if (n < 0) {
        card(px, home.x, home.y, colourOf(pid), { seed: seedOf(pid) });
        continue;
      }
      const hopAt = HOP_AT + n * HOP_GAP;
      const lit = k >= RIPPLE * 0.8 && (reducedMotion || k > hopAt || Math.floor(k * 6) % 2 === 0);
      const p = k < hopAt ? home : arc(home, trayAt(n), prog(k, hopAt, HOP), 10);
      card(px, Math.round(p.x), Math.round(p.y), colourOf(pid), { seed: seedOf(pid), glow: lit });
    }
    card(px, qp.x, qp.y, P.gold, { question: true });
    // the ripple: rings spreading out from the question card
    if (!reducedMotion && k >= 0 && k < RIPPLE) {
      for (const lag of [0, 0.35]) {
        const kk = (k - lag) / (RIPPLE - 0.35);
        if (kk < 0 || kk > 1) continue;
        const r = Math.round(4 + kk * 20);
        px.ctx.globalAlpha = 1 - kk;
        for (let a = 0; a < 28; a++) {
          const ang = (a / 28) * Math.PI * 2;
          px.rect(Math.round(qp.x + 4 + Math.cos(ang) * r), Math.round(qp.y + 5 + Math.sin(ang) * r * 0.8), 1, 1, P.gold);
        }
        px.ctx.globalAlpha = 1;
      }
    }
    s.pin(pulled, 3, sh2.bottom + 3);
    pulled.style.maxWidth = `${((cx - 12) / px.w) * 100}%`;
  });
  return s;
};

// ---------------------------------------------------------------------------------------------------------------------
// 7. Generate: the pieces go into the wok, the answer types out, and each source stamps on

const generate: SceneBuilder = (env, wasDone) => {
  const s = stage(env);
  env.stampAt(0.24);
  const q = LEARN_QUESTIONS.find((x) => x.id === env.state.question) ?? LEARN_QUESTIONS[0];
  const pieces = q.retrieves.map(pieceById);
  const chat = el('div', 'learn-chat');
  chat.append(el('div', 'who', '◆ PRISM'), el('div', 'you', q.q));
  const codes = el('div', 'learn-codes');
  pieces.forEach((p, n) => {
    const c = el('div', 'learn-code');
    c.style.setProperty('--c', colourOf(p.id));
    c.append(el('div', 'file', `[${n + 1}] ${citation(p)}`));
    const pre = el('pre');
    pre.textContent = p.code.join('\n');
    c.append(pre);
    codes.append(c);
  });
  const go = el('button', 'pix-btn learn-generate learn-target', '✨ GENERATE');
  go.type = 'button';
  const ans = el('div', 'ans');
  ans.hidden = true;
  const srcs = el('ol', 'srcs');
  srcs.hidden = true;
  pieces.forEach((p, n) => {
    const li = el('li', 'later', `[${n + 1}] ${citation(p)}`);
    li.style.setProperty('--c', colourOf(p.id));
    srcs.append(li);
  });
  chat.append(codes, go, ans, srcs);
  env.band.append(chat);
  let tossAt = -9;
  let now = 0;
  let raf = 0;
  const finish = () => {
    ans.textContent = q.answer;
    ans.classList.remove('typing');
    srcs.querySelectorAll('li').forEach((li) => li.classList.add('in'));
    env.done();
  };
  const run = () => {
    tossAt = now;
    buzz('boost');
    env.todo('PRISM is answering…');
    go.hidden = true;
    codes.classList.add('gone');
    chat.classList.add('answered');
    ans.hidden = false;
    srcs.hidden = false;
    if (reducedMotion) return finish();
    ans.classList.add('typing');
    const t0 = performance.now() + 500;
    const type = (ms: number) => {
      if (!ans.isConnected) return;
      const n = Math.max(0, Math.min(q.answer.length, Math.floor((ms - t0) / 28)));
      ans.textContent = q.answer.slice(0, n);
      if (n < q.answer.length) {
        raf = requestAnimationFrame(type);
        return;
      }
      ans.classList.remove('typing');
      // the sources stamp on one by one
      srcs.querySelectorAll('li').forEach((li, i) =>
        s.later(250 + i * 280, () => {
          li.classList.add('in');
          buzz('tick');
        }),
      );
      s.later(250 + pieces.length * 280 + 200, () => env.done());
    };
    raf = requestAnimationFrame(type);
  };
  go.addEventListener('click', () => {
    env.poke();
    run();
  });
  if (wasDone) {
    go.hidden = true;
    codes.classList.add('gone');
    chat.classList.add('answered');
    ans.hidden = false;
    srcs.hidden = false;
    finish();
  }
  s.px.run((t, f) => {
    now = t;
    const { px } = s;
    const top = px.h - 22;
    stallWall(px, top, { lamp: 0.2, lampY: 14 });
    const cx = Math.round(px.w * 0.6);
    const toss = tossAt > -9 && !reducedMotion ? clamp01((t - tossAt) / 0.9) : 0;
    const id = idle(f);
    chef(px, cx, top + 10, 1, { arm: toss > 0 && toss < 1 ? 'forward' : 'down', blink: id.blink });
    counter(px, top);
    wok(px, cx + 18, top - 4, f, toss > 0 && toss < 1 ? toss : 0, reducedMotion);
    steam(px, cx + 18, top - 8, t);
  });
  return {
    stop() {
      cancelAnimationFrame(raf);
      s.stop();
    },
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// 8. Docs: the beaver hands back a tidy bound book; the four stamps add up to RAG

const docs: SceneBuilder = (env, wasDone) => {
  const s = stage(env);
  const recap = el('div', 'learn-recap');
  recap.setAttribute('aria-hidden', 'true');
  LEARN_SCENES.filter((x) => x.stamp && x.stamp !== 'RAG').forEach((x, i) => {
    const m = el('span', 'mini-stamp', x.stamp);
    m.style.setProperty('--i', String(i));
    recap.append(m);
  });
  env.band.append(recap);
  if (wasDone || reducedMotion) recap.classList.add('shown');
  else s.later(1800, () => recap.classList.add('shown'));
  s.later(wasDone || reducedMotion ? 0 : 3200, () => env.done());
  s.px.run((t, f) => {
    const { px } = s;
    const b = s.band();
    const top = counterTop(b);
    stallWall(px, top, { lamp: 0.85, lampY: Math.round(b.top + (top - b.top) * 0.3) });
    const cx = Math.round(px.w * 0.66);
    // RAG lands just under the four stamps it sums up, clear of the beaver where there is room
    const L = env.layer.getBoundingClientRect();
    const recapBottom = recap.getBoundingClientRect().bottom - L.top;
    const headTop = ((top - 26) / px.h) * L.height;
    env.stampAt(Math.max(recapBottom + 74, (recapBottom + headTop) / 2) / (L.height || 1));
    const T = reducedMotion || wasDone ? 9 : t;
    const id = idle(f);
    // 0..1.1 s: holds the new book up proudly; then hands it over the counter to the visitor
    const handing = T > 1.1;
    chef(px, cx, top + 10, -1, { arm: handing ? 'forward' : 'up', blink: id.blink, mouth: true, bob: handing ? 0 : id.bob });
    counter(px, top);
    const up = { x: cx - 10, y: top - 46 };
    const given = { x: Math.round(px.w * 0.22), y: top - 14 };
    const p = T < 1.1 ? up : arc(up, given, (T - 1.1) / 0.8, 6);
    if (T > 1.5) hand(px, Math.round(given.x) + 11, Math.round(top + 2 + Math.max(0, 1 - (T - 1.5) / 0.4) * 30), px.h);
    docsBook(px, Math.round(p.x), Math.round(p.y));
    for (let i = 0; i < 4; i++) sparkle(px, Math.round(p.x) - 4 + (i % 2) * 30, Math.round(p.y) + (i < 2 ? -3 : 18), reducedMotion || (f + i * 4) % 8 < 4);
  });
  return s;
};

// ---------------------------------------------------------------------------------------------------------------------
// 9. Why PRISM: the night skyline; a fence round Lau Pa Sat keeps the code in, an outside AI tool cannot read it

const why: SceneBuilder = (env) => {
  const canvas = el('canvas', 'learn-canvas pix-crisp');
  canvas.setAttribute('aria-hidden', 'true');
  env.layer.prepend(canvas);
  env.layer.classList.add('night');
  const sign = el('span', 'learn-tag learn-tag--wood', 'INTRANET ONLY');
  env.layer.append(sign);
  env.stampAt(0.5);
  const sky = startSkyline(canvas, {
    towerX: 0.42,
    afterDraw: (px, at) => {
      const { rect } = px;
      const f = at.frame;
      const t = at.t;
      const gy = at.groundY;
      const left = Math.max(1, at.hallX - at.hallHalfW - 4);
      const right = Math.min(px.w - 2, at.hallX + at.hallHalfW + 4);
      // code pages circling inside the fence: they never get past it
      for (let i = 0; i < 3; i++) {
        const a = (reducedMotion ? 0 : t * 0.9) + (i * Math.PI * 2) / 3;
        const x = Math.round(at.hallX + Math.cos(a) * at.hallHalfW * 0.75);
        const y = Math.round(gy - 34 + Math.sin(a) * 8);
        rect(x - 1, y - 1, 7, 8, P.ink);
        rect(x, y, 5, 6, P.paper);
        rect(x + 1, y + 1, 3, 1, '#4f86d6');
        rect(x + 1, y + 3, 2, 1, P.scribble);
      }
      // the fence: back rail high on the walls, posts down both sides, a front run of pickets with a locked gate
      const fy = gy + 6;
      for (const x of [left, right]) {
        rect(x, gy - 30, 2, fy - gy + 31, P.woodEdge);
        rect(x, gy - 30, 1, fy - gy + 31, P.wood);
      }
      rect(left, gy - 30, right - left + 2, 1, P.woodDark);
      for (let x = left; x <= right; x += 3) {
        rect(x, fy - 8, 2, 9, '#d8c49c');
        rect(x, fy - 9, 1, 1, '#d8c49c');
        rect(x + 1, fy - 8, 1, 9, '#b39b6d');
      }
      rect(left, fy - 6, right - left + 2, 1, '#8a6f45');
      rect(left, fy - 2, right - left + 2, 1, '#8a6f45');
      const gx = Math.round(at.hallX);
      rect(gx - 3, fy - 5, 7, 5, P.gold);
      rect(gx - 2, fy - 8, 5, 3, P.gold);
      rect(gx - 1, fy - 7, 3, 2, '#2a1608');
      rect(gx, fy - 3, 1, 2, '#2a1608');
      // a little robot outside the fence, puzzling over a page of code
      const rx = right + 6 <= px.w - 10 ? right + 6 : px.w - 12;
      const ry = right + 6 <= px.w - 10 ? gy + 2 : fy + 14;
      const bob = reducedMotion ? 0 : f % 12 < 6 ? 0 : 1;
      rect(rx, ry - 12 + bob, 8, 7, '#9aa6b2');
      rect(rx + 1, ry - 11 + bob, 6, 3, '#2b2b33');
      rect(rx + 2, ry - 10 + bob, 1, 1, '#52e08a');
      rect(rx + 5, ry - 10 + bob, 1, 1, '#52e08a');
      rect(rx + 3, ry - 14 + bob, 2, 2, '#76828f');
      rect(rx + 1, ry - 5, 6, 4, '#76828f');
      rect(rx + 1, ry - 1, 2, 2, '#55555f');
      rect(rx + 5, ry - 1, 2, 2, '#55555f');
      rect(rx - 3, ry - 6, 4, 5, P.paper);
      rect(rx - 2, ry - 5, 2, 1, '#4f86d6');
      if (reducedMotion || f % 20 < 14) {
        rect(rx + 4, ry - 21 + bob, 6, 6, P.white);
        rect(rx + 6, ry - 20 + bob, 2, 1, P.ink);
        rect(rx + 7, ry - 19 + bob, 1, 1, P.ink);
        rect(rx + 6, ry - 18 + bob, 1, 1, P.ink);
        rect(rx + 6, ry - 16 + bob, 1, 1, P.ink);
      }
      sign.style.left = `${((gx / px.w) * 100).toFixed(2)}%`;
      sign.style.top = `${(((fy + 3) / px.h) * 100).toFixed(2)}%`;
    },
  });
  return {
    stop() {
      sky.stop();
      env.layer.classList.remove('night');
    },
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// 10. Coming next: three signposts along the forest path; tap each to read it

const next: SceneBuilder = (env, wasDone) => {
  const canvas = el('canvas', 'learn-canvas pix-crisp');
  canvas.setAttribute('aria-hidden', 'true');
  env.layer.prepend(canvas);
  env.layer.classList.add('day');
  const forest = startForest(canvas, { bottomInset: 0.12 });
  const box = el('div', 'learn-signs');
  const detail = el('p', 'learn-sign-text pix-panel');
  detail.setAttribute('aria-live', 'polite');
  detail.hidden = true;
  const signs = SIGNPOSTS.map((sp, i) => {
    const b = el('button', 'learn-sign pix-sign learn-target');
    b.type = 'button';
    b.style.setProperty('--i', String(i));
    b.append(el('span', 'learn-sign-title', sp.title));
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', () => {
      env.poke();
      open(i);
      buzz('tick');
    });
    box.append(b);
    return b;
  });
  const open = (i: number) => {
    env.state.signs.add(SIGNPOSTS[i].id);
    signs.forEach((b, n) => {
      b.setAttribute('aria-expanded', String(n === i));
      b.classList.toggle('read', env.state.signs.has(SIGNPOSTS[n].id));
      b.classList.toggle('learn-target', !env.state.signs.has(SIGNPOSTS[n].id));
    });
    detail.hidden = false;
    detail.textContent = SIGNPOSTS[i].text;
    detail.classList.remove('in');
    void detail.offsetWidth;
    detail.classList.add('in');
    const left = SIGNPOSTS.length - env.state.signs.size;
    if (left === 0) env.done();
    else env.todo(left === 1 ? 'One more sign' : 'Tap each sign');
  };
  box.append(detail);
  env.band.append(box);
  if (wasDone) open(SIGNPOSTS.length - 1);
  return {
    stop() {
      forest.stop();
      env.layer.classList.remove('day');
    },
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// The ending: dinner service at the stall, the beaver tossing the wok

export const ending: SceneBuilder = (env) => {
  const s = stage(env);
  const sign = el('div', 'pix-sign learn-end-sign', LEARN_ENDING.title);
  sign.append(el('small', '', LEARN_ENDING.sub));
  env.band.append(sign);
  s.px.run((t, f) => {
    const { px } = s;
    const b = s.band();
    const top = Math.round(b.top + (b.bottom - b.top) * 0.72);
    const signBottom = Math.round(((sign.getBoundingClientRect().bottom - env.layer.getBoundingClientRect().top) / (env.layer.clientHeight || 1)) * px.h);
    stallWall(px, top, { lamp: 0.85, lampY: Math.max(signBottom + 4, top - 44) });
    menuBoard(px, Math.round(px.w / 2 - 15), Math.round((signBottom + top - 30) / 2) - 8);
    const cx = Math.round(px.w * 0.36);
    const toss = reducedMotion ? 0 : (t % 1.6) / 0.9;
    const id = idle(f);
    chef(px, cx, top + 10, 1, { arm: toss < 1 ? 'forward' : 'down', blink: id.blink, mouth: true });
    counter(px, top);
    wok(px, cx + 18, top - 4, f, toss < 1 ? toss : 0, reducedMotion);
    steam(px, cx + 18, top - 8, t);
    if (!reducedMotion && toss < 1 && toss > 0.4) heart(px, cx - 4, Math.round(top - 34 - toss * 6));
    // three empty bowls waiting on the counter: the dishes the player will cook
    for (let i = 0; i < 3; i++) {
      const bx = Math.round(px.w * 0.04) + i * 8;
      if (bx + 7 > cx - 8) break;
      px.rect(bx, top - 4, 7, 3, P.white);
      px.rect(bx + 1, top - 1, 5, 1, '#d0d8e0');
      px.rect(bx, top - 4, 7, 1, '#e6ebf0');
    }
  });
  return s;
};

export const SCENES: Record<string, SceneBuilder> = { problem, upload, split, embed, ask, retrieve, generate, docs, why, next };
