// Draws the RunSim as top-down pixel art on one small 2D canvas: the street scrolls down the screen, three lanes
// run straight up, the beaver sits near the bottom. The sim owns all rules; this file mirrors its state every
// animation frame and turns its events into effects, pop-ups, haptics and HUD hooks.
// It also directs the three moments that used to be camera work: the jog behind the start screen, the hop in under
// READY / SET / GO, and the serve cutscene (a dash up the street, then the side-view stall from Serve.ts).
import { GATES, SCORING, SERVE, VIEW, WORLD } from '../../config';
import { dishById } from '../../content/dishes';
import { buzz } from '../haptics';
import { PerfMonitor, reducedMotion } from '../perf';
import type { Pickup, RunSim, SimEvent } from '../sim/RunSim';
import { Fx } from './Fx';
import { Overlay } from './Overlay';
import { LANE_COLOURS, P } from './palette';
import { GateSprite, drawObstacle, drawPickup } from './Props';
import { Runner } from './Runner';
import { SERVE_T, ServeScene } from './Serve';
import { Street } from './Street';
import { makeArt, type Art, type Frame } from './types';
import { depthY, laneX, makeView, toStage, type View } from './view';

const PARTY = ['#ffd166', '#e63946', '#52e08a', '#8ecae6', '#b388ff', '#ff5d8f'];
const CHEERS = ['😋', '👏', '❤️', '🤤', '⭐', '🔥'];
/** Countdown shown while the beaver hops into place: [seconds, text, colour]. */
const COUNTDOWN: [number, string, string][] = [
  [0, 'READY', '#8ecae6'],
  [0.55, 'SET', '#ffd166'],
];
const INTRO_GO_S = 1.1;

/** Escalating call-outs for answer streaks. Bigger and louder the longer the streak. */
const HYPE: Record<number, [string, string]> = {
  2: ['NICE!', '#8ecae6'],
  3: ['SHIOK!', '#52e08a'],
  4: ['STEADY LAH!', '#ffd166'],
  5: ['POWERFUL!', '#ff9f1c'],
  6: ['UNSTOPPABLE!', '#ff5d8f'],
  7: ['AH MA PROUD!', '#b388ff'],
};
const POWER_TEXT: Record<string, [string, string]> = {
  double: ['2X COINS!', '#ffd166'],
  magnet: ['MAGNET!', '#ff5d8f'],
  shield: ['PRISM SHIELD!', '#8ecae6'],
};

// Effect colours, built once so firing an effect never allocates.
const C_GO = ['#fff6e0', '#ffd166', '#52e08a'];
const C_RIGHT = ['#52e08a', '#ffd166', '#8ecae6'];
const C_HYPE = ['#ffd166', '#ff5d8f', '#b388ff'];
const C_COIN = ['#ffd166', '#fff6e0'];
const C_COIN2 = ['#ffd166', '#ff5d8f'];
const C_DUST = ['#fff6e0', '#cdb4db'];
const C_POWER: Record<string, string[]> = {
  double: ['#ffd166', '#ffffff', POWER_TEXT.double[1]],
  magnet: ['#ffd166', '#ffffff', POWER_TEXT.magnet[1]],
  shield: ['#ffd166', '#ffffff', POWER_TEXT.shield[1]],
};
const C_SHIELD = ['#8ecae6', '#ffffff'];
const C_CRASH = ['#ffd166', '#e63946', '#ffffff'];
const C_DISH = ['#ffd166', '#fff6e0'];
const C_LAND = ['#ffd166', '#ffffff', '#ff9f1c'];
const C_FIREWORK: string[][] = PARTY.map((c) => [c, '#ffffff']);

/** The old 3D metres per sim unit: the runner's cadence formula is tuned in metres per second. */
const M_PER_UNIT = 0.1;
/** Art px the beaver's head is above its feet (pop-ups and flying ingredients start there). */
const HEAD = 16;
/** Art px of shake per unit of `shake`. */
const SHAKE_PX = 5;
/** Burst speeds in art px per second. */
const SPD = 9;

/** A number from the page URL (`?px=4`), for trying pixel settings on a phone without a rebuild. */
function urlNumber(name: string): number | null {
  const v = new URLSearchParams(location.search).get(name);
  return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
}

const smooth = (k: number) => {
  k = Math.min(Math.max(k, 0), 1);
  return k * k * (3 - 2 * k);
};

export interface WorldHooks {
  /** A recipe step was just recovered; (x, y) is where the ingredient starts, in stage CSS px. */
  onIngredient(x: number, y: number, step: number): void;
  /** A coin was collected (for the HUD counter). */
  onCoin(points: number, doubled: boolean): void;
  /** A tingkat power-up was opened. */
  onPower(kind: 'double' | 'magnet' | 'shield'): void;
  /** Serve cutscene: the recovered ingredients should fly from the HUD to (x, y), stage CSS px. */
  onPlating(x: number, y: number): void;
}

/** Draw queue entry kinds, sorted by ground y so nearer things cover farther ones. */
const enum Item {
  Obstacle,
  Pickup,
  Gate,
  DyingGate,
  Runner,
}
const MAX_ITEMS = 256;

export class World {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private art: Art;
  private view: View;
  private f: Frame;
  private street = new Street();
  private runner = new Runner();
  private serve = new ServeScene();
  private fx = new Fx();
  private overlay: Overlay;
  private perf = new PerfMonitor();
  private gate: { id: number; sprite: GateSprite } | null = null;
  /** Answered gates finishing their animation; d keeps scrolling with the ground. */
  private dyingGates: { sprite: GateSprite; d: number }[] = [];
  private lastTravelled = 0;
  private lastPlayerX = 1;
  private shake = 0;
  private time = 0;
  private lastFrame = 0;
  private fireClock = 0;
  private lowFx = false;
  // Draw queue (preallocated).
  private qn = 0;
  private qKind = new Uint8Array(MAX_ITEMS);
  private qRef = new Int32Array(MAX_ITEMS);
  private qY = new Float64Array(MAX_ITEMS);
  private qOrder = new Uint16Array(MAX_ITEMS);
  // Intro (hop + countdown) state.
  private introT = -1;
  private introShown = 0;
  private introDone: (() => void) | null = null;
  // Serve cutscene state.
  private serving = false;
  private plated = false;
  private partyClock = 0;
  private cheerClock = 0;
  private dishPt = { x: 0, y: 0 };
  private tablePt = { x: 0, y: 0 };

  constructor(
    private stage: HTMLElement,
    mount: HTMLElement,
    private sim: RunSim,
    private hooks: WorldHooks,
  ) {
    // Pixel art: the canvas buffer is one pixel per art pixel and CSS scales it up with crisp pixels (see resize).
    this.canvas.classList.add('pix-crisp');
    mount.append(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.art = makeArt(this.ctx);
    this.view = makeView(Math.max(stage.clientWidth, 1), Math.max(stage.clientHeight, 1), VIEW.PIXEL_SIZE);
    this.f = { art: this.art, view: this.view, sim, dt: 0, time: 0, lowFx: false, reduced: reducedMotion };
    this.overlay = new Overlay(stage, reducedMotion);

    sim.on((e) => this.onEvent(e));
    new ResizeObserver(() => this.resize()).observe(stage);
    this.resize();
    this.lastTravelled = sim.travelled;
    this.lastFrame = performance.now();
    requestAnimationFrame(this.loop);
  }

  /** True while a full-screen page (Learn) hides the street: frames are skipped until it is false again. */
  paused = false;

  /** Clears the world for a new run. Call before `intro` / `sim.startRun`. */
  reset(): void {
    this.gate = null;
    this.dyingGates = [];
    this.street.reset();
    this.runner.reset();
    this.fx.reset();
    this.serve.stop();
    this.serving = this.plated = false;
    this.overlay.clear();
    this.shake = 0;
  }

  /**
   * The start of a run: the beaver hops into place over a READY / SET count,
   * then `go` is called on GO! (that is where the run really starts).
   */
  intro(go: () => void): void {
    if (reducedMotion) {
      go();
      return;
    }
    this.introT = 0;
    this.introShown = 0;
    this.introDone = go;
  }

  private updateIntro(dt: number): void {
    if (this.introT < 0) return;
    this.introT += dt;
    const next = COUNTDOWN[this.introShown];
    if (next && this.introT >= next[0]) {
      this.introShown++;
      this.popScreen(next[1], 0.5, 0.4, next[2], 46, 'count');
      this.runner.hop(0.4);
      buzz('near');
    }
    if (this.introT < INTRO_GO_S) return;
    this.introT = -1;
    this.popScreen('GO!', 0.5, 0.4, '#52e08a', 76, 'count go');
    this.overlay.flash('rgba(255,246,224,0.45)');
    const x = laneX(this.view, this.sim.playerX);
    const y = this.view.playerY;
    this.runner.hop(1);
    this.fx.ring(x, y, '#52e08a', 7);
    this.fx.burst(x, y - 2, C_GO, 36, 5 * SPD, 0.6);
    buzz('boost');
    const go = this.introDone;
    this.introDone = null;
    go?.();
  }

  // --- frame ---------------------------------------------------------------

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    this.frame(now);
  };

  private frame(now: number): void {
    // Something covers the whole street (Learn): skip the work, and keep the frame-rate watcher out of it.
    if (this.paused) {
      this.lastFrame = now;
      return;
    }
    // A rAF timestamp can be a little older than the performance.now() taken when the world was built: never step
    // backwards (it would also cancel an intro started before the first frame).
    const dt = Math.min(Math.max((now - this.lastFrame) / 1000, 0), 0.05);
    this.lastFrame = now;
    this.time += dt;
    if (this.perf.tick(dt)) this.lowFx = true;

    this.updateIntro(dt);
    this.sim.update(dt);

    const sim = this.sim;
    const v = this.view;
    const step = sim.travelled - this.lastTravelled;
    this.lastTravelled = sim.travelled;
    const leanVel = (sim.playerX - this.lastPlayerX) / Math.max(dt, 1e-3);
    this.lastPlayerX = sim.playerX;
    const speedMs = (step * M_PER_UNIT) / Math.max(dt, 1e-3);
    const running = sim.mode === 'run';
    const st = this.serving ? sim.endingT : -1;
    const sideView = this.serving && st >= SERVE_T.CUT;
    const scrollPx = sideView ? 0 : step / v.unitsPerPx;

    const f = this.f;
    f.dt = dt;
    f.time = this.time;
    f.lowFx = this.lowFx;
    f.view = v;

    // In the serve dash the beaver drifts to the middle lane and runs up the street.
    const lane = this.serving ? sim.playerX + (1 - sim.playerX) * smooth(st / 0.9) : sim.playerX;
    const px = laneX(v, lane);
    const py = this.serving ? v.playerY - Math.round(smooth(st / SERVE_T.CUT) * v.playerY * 0.5) : v.playerY;
    const cadence = this.serving
      ? Math.min(speedMs / 15, 2)
      : sim.mode === 'attract'
        ? 0.6
        : running
          ? sim.ramp * (sim.boosted ? GATES.BOOST_FACTOR : sim.slowed ? GATES.SLOW_FACTOR : 1)
          : 0.4;
    this.runner.shieldOn = sim.hasShield && !this.serving;
    this.runner.update(dt, cadence, this.serving ? 0 : leanVel);
    if (this.serving) this.updateServe(dt, st);

    this.gate?.sprite.update(dt);
    for (let i = this.dyingGates.length - 1; i >= 0; i--) {
      const g = this.dyingGates[i];
      g.d -= step;
      if (!g.sprite.update(dt)) this.dyingGates.splice(i, 1);
    }
    const g = sim.gate;
    if (g && this.gate?.id !== g.id) this.gate = { id: g.id, sprite: new GateSprite(g.tutorial ? g.gq.correctLane : null) };

    const onFire = running && sim.score.streak >= GATES.FIRE_STREAK;
    this.overlay.fever(onFire);
    if (onFire && !this.lowFx) {
      this.fireClock += dt;
      while (this.fireClock > 0.03) {
        this.fireClock -= 0.03;
        this.fx.fireTrail(px, py);
      }
    }
    this.fx.update(dt, scrollPx);

    // --- draw ---
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const s = reducedMotion ? 0 : this.shake;
    const ox = Math.round(Math.sin(this.time * 67) * s * SHAKE_PX);
    const oy = Math.round(Math.sin(this.time * 53 + 1) * s * SHAKE_PX);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (ox || oy) this.art.rect(0, 0, v.w, v.h, P.ink);
    ctx.setTransform(1, 0, 0, 1, ox, oy);
    if (sideView) {
      this.serve.draw(f, st);
    } else {
      this.street.draw(f);
      this.drawThings(px, py);
      const fast = running ? (sim.boosted ? 1 : sim.slowed ? 0 : (sim.ramp - 1.15) / 1.4) : this.serving && st < 1.2 ? 1 : 0;
      this.fx.speedLines(f, Math.min(Math.max(fast, 0), 1));
    }
    this.fx.draw(f);
  }

  /** Obstacles, pickups, gates and the beaver, far to near. */
  private drawThings(px: number, py: number): void {
    const sim = this.sim;
    const v = this.view;
    this.qn = 0;
    if (!this.serving) {
      for (let i = 0; i < sim.obstacles.length; i++) {
        const o = sim.obstacles[i];
        if (Number.isFinite(o.d)) this.queue(Item.Obstacle, i, depthY(v, o.d));
      }
      for (let i = 0; i < sim.pickups.length; i++) {
        const p = sim.pickups[i];
        if (p.taken && p.d > -20) continue; // collected (sim drops it next frame)
        this.queue(Item.Pickup, i, depthY(v, p.d));
      }
    }
    if (this.gate && sim.gate) this.queue(Item.Gate, 0, depthY(v, sim.gate.d));
    for (let i = 0; i < this.dyingGates.length; i++) this.queue(Item.DyingGate, i, depthY(v, this.dyingGates[i].d));
    this.queue(Item.Runner, 0, py);

    // Insertion sort by y (a few dozen items at most): far (small y) first.
    const n = this.qn;
    const order = this.qOrder;
    for (let i = 0; i < n; i++) {
      let j = i;
      while (j > 0 && this.qY[order[j - 1]] > this.qY[i]) {
        order[j] = order[j - 1];
        j--;
      }
      order[j] = i;
    }
    const f = this.f;
    for (let k = 0; k < n; k++) {
      const i = order[k];
      const y = this.qY[i];
      const ref = this.qRef[i];
      switch (this.qKind[i]) {
        case Item.Obstacle: {
          const o = sim.obstacles[ref];
          drawObstacle(f, o.kind, laneX(v, o.lane), y, o.id);
          break;
        }
        case Item.Pickup: {
          const p = sim.pickups[ref];
          drawPickup(f, p.kind, this.pickupX(p), y, p.id);
          break;
        }
        case Item.Gate:
          this.gate!.sprite.draw(f, y);
          break;
        case Item.DyingGate:
          this.dyingGates[ref].sprite.draw(f, y);
          break;
        case Item.Runner:
          this.runner.draw(f, px, py);
          break;
      }
    }
  }

  private queue(kind: Item, ref: number, y: number): void {
    if (this.qn >= MAX_ITEMS || y < -40 || y > this.view.h + 40) return;
    const i = this.qn++;
    this.qKind[i] = kind;
    this.qRef[i] = ref;
    this.qY[i] = y;
  }

  /** A pickup's x; magnet-pulled coins swing across toward the runner as they approach. */
  private pickupX(p: Pickup): number {
    const v = this.view;
    const x = laneX(v, p.lane);
    if (!this.sim.magnetPulls(p)) return x;
    const px = laneX(v, this.sim.playerX);
    return Math.round(x + (px - x) * (1 - Math.max(p.d, 0) / 90));
  }

  /** The serve cutscene, `st` seconds in. The sim moves the world; this adds the show. */
  private updateServe(dt: number, st: number): void {
    const T = SERVE_T;
    if (this.serve.update(this.f, st)) this.dishLanded();
    // Just before the dish appears, the recovered ingredients leave the HUD and fly into it.
    if (!this.plated && st > T.RAISE - 0.55) {
      this.plated = true;
      const s = toStage(this.view, this.dishPt.x, this.dishPt.y);
      this.hooks.onPlating(s.x, s.y);
    }
    if (st > T.RAISE && st < T.THROW && !this.lowFx) this.fx.burst(this.dishPt.x, this.dishPt.y, C_DISH, 1, 2.2 * SPD, 0.5);
    if (st < T.LAND || st > SERVE.TOTAL_MS / 1000 + 0.6) return;
    // Party: fireworks overhead, confetti raining on the table, customers cheering.
    const v = this.view;
    this.partyClock += dt;
    while (this.partyClock > 0.14) {
      this.partyClock -= 0.14;
      const fx = Math.round(v.w * (0.1 + Math.random() * 0.8));
      const fy = Math.round(v.h * (0.08 + Math.random() * 0.3));
      this.fx.burst(fx, fy, C_FIREWORK[Math.floor(Math.random() * PARTY.length)], 34, 5 * SPD, 1.0);
      this.fx.confetti(Math.round(v.w * Math.random()), 0, PARTY, 7);
    }
    this.cheerClock += dt;
    if (this.cheerClock > 0.22) {
      this.cheerClock = 0;
      const s = toStage(v, this.tablePt.x + (Math.random() - 0.5) * 30, this.tablePt.y - 20 - Math.random() * 10);
      this.overlay.emoji(CHEERS[Math.floor(Math.random() * CHEERS.length)], s.x, s.y);
    }
  }

  private dishLanded(): void {
    const dish = dishById(this.sim.dish);
    const t = this.tablePt;
    this.overlay.flash('rgba(255,209,102,0.6)');
    this.shake = 0.35;
    this.fx.ring(t.x, t.y, '#ffd166', 9);
    this.fx.ring(t.x, t.y, dish.colour, 5);
    this.fx.burst(t.x, t.y - 4, C_LAND, 90, 7 * SPD, 0.9);
    for (let i = 0; i < 5; i++) this.fx.confetti(t.x + (i - 2) * 8, t.y - 10, PARTY, 26);
    this.overlay.banner('DISH SERVED!', `Ah Ma's ${dish.name}`, dish.colour);
    if (this.sim.score.bonus) this.popScreen(`+${this.sim.score.bonus} BONUS`, 0.5, 0.46, '#52e08a', 30, 'combo');
    this.runner.cheer();
    this.cheerClock = 1;
    buzz('crash');
  }

  // --- effects -------------------------------------------------------------

  private onEvent(e: SimEvent): void {
    const v = this.view;
    const hx = laneX(v, this.sim.playerX);
    const hy = v.playerY - HEAD;
    switch (e.type) {
      case 'gate': {
        if (this.gate) {
          this.gate.sprite.resolve(e.chosenLane, e.correctLane, e.correct);
          this.dyingGates.push({ sprite: this.gate.sprite, d: WORLD.GATE_HIT_DIST }); // the sim answers a gate when it reaches this depth
          this.gate = null;
        }
        if (e.correct) {
          this.shake = Math.max(this.shake, 0.12);
          this.runner.hop(0.7);
          this.fx.ring(laneX(v, e.correctLane), v.playerY, LANE_COLOURS[e.correctLane], 6);
          this.fx.burst(hx, hy, C_RIGHT, 40, 5 * SPD);
          this.popAt(hx, hy, `+${e.points}`, '#52e08a', 28);
          // The winning answer gets DISH SERVED on its own, not a streak call-out on top of it.
          const hype = e.recovered >= SCORING.RECIPE_STEPS ? undefined : HYPE[Math.min(e.streak, 7)];
          if (hype) {
            const lvl = Math.min(e.streak, 7);
            this.popScreen(hype[0], 0.5, 0.36, hype[1], 26 + lvl * 3, `combo hype${lvl}`);
            if (e.multiplier > 1) this.popScreen(`x${e.multiplier} COMBO`, 0.5, 0.43, '#fff6e0', 18, 'combo');
            this.shake = Math.max(this.shake, 0.05 * lvl);
            if (!this.lowFx) this.fx.burst(hx, hy, C_HYPE, 10 * lvl, (4 + lvl) * SPD);
          }
          const s = toStage(v, hx, hy);
          this.hooks.onIngredient(s.x, s.y, e.recovered);
          buzz('correct');
        } else {
          this.popAt(hx, hy, 'OOPS', '#ff8a8a', 26);
          this.shake = Math.max(this.shake, 0.15);
          this.overlay.flash('rgba(230,57,70,0.25)');
          buzz('wrong');
        }
        break;
      }
      case 'coin': {
        const p = this.findPickup(e.pickupId);
        if (p && !this.lowFx) this.fx.burst(this.pickupX(p), depthY(v, p.d) - 5, e.doubled ? C_COIN2 : C_COIN, 7, 2.8 * SPD, 0.4);
        this.hooks.onCoin(e.points, e.doubled);
        buzz(e.doubled ? 'coinDouble' : 'coin');
        break;
      }
      case 'lane':
        // A little hop and a puff of dust at the feet on every lane change.
        this.runner.hop(0.55);
        if (!this.lowFx) this.fx.burst(hx, v.playerY, C_DUST, 5, 1.6 * SPD, 0.3);
        break;
      case 'perfectLine':
        this.fx.ring(hx, v.playerY, '#ffd166', 4);
        buzz('perfect');
        break;
      case 'power': {
        const p = this.findPickup(e.pickupId);
        const [text, color] = POWER_TEXT[e.kind];
        this.fx.burst(p ? this.pickupX(p) : hx, p ? depthY(v, p.d) - 6 : hy, C_POWER[e.kind], 70, 7 * SPD);
        this.overlay.flash('rgba(255,209,102,0.35)');
        this.fx.ring(hx, v.playerY, color, 7);
        this.popScreen(text, 0.5, 0.5, color, 38, 'power');
        this.shake = Math.max(this.shake, 0.25);
        this.hooks.onPower(e.kind);
        buzz('shield');
        break;
      }
      case 'shieldGained':
        this.popAt(hx, v.playerY - 24, 'PRISM SHIELD', '#8ecae6', 22);
        buzz('shield');
        break;
      case 'shieldUsed': {
        // The obstacle was right at the beaver (the sim has already flung its depth away), so burst in its lane.
        const o = this.sim.obstacles.find((x) => x.id === e.obstacleId);
        if (o) this.fx.burst(laneX(v, o.lane), v.playerY - 8, C_SHIELD, 50, 6 * SPD);
        this.fx.ring(hx, v.playerY, '#8ecae6', 7);
        this.popAt(hx, hy, 'SHIELDED!', '#8ecae6', 26);
        this.shake = Math.max(this.shake, 0.18);
        buzz('shield');
        break;
      }
      case 'nearMiss':
        this.popAt(hx, hy, 'CLOSE!', '#ffffff', 24);
        buzz('near');
        break;
      case 'crash':
        this.shake = 0.6;
        this.overlay.flash('rgba(255,255,255,0.8)');
        this.fx.burst(hx, hy, C_CRASH, 70, 6 * SPD);
        this.popScreen('CRASH!', 0.5, 0.35, '#ff8a8a', 44);
        this.runner.crash();
        buzz('crash');
        break;
      case 'end':
        if (e.reason === 'served') this.startServe();
        else if (e.reason === 'timeup') {
          this.popScreen("TIME'S UP!", 0.5, 0.4, '#ffd166', 40);
        }
        break;
    }
  }

  private findPickup(id: number): Pickup | undefined {
    return this.sim.pickups.find((p) => p.id === id);
  }

  /** The last recipe step is in: clear the walkway and begin the serve cutscene. */
  private startServe(): void {
    this.serving = true;
    this.plated = false;
    this.partyClock = this.cheerClock = 0;
    const v = this.view;
    for (const o of this.sim.obstacles) {
      if (Number.isFinite(o.d)) this.fx.burst(laneX(v, o.lane), depthY(v, o.d) - 6, C_DUST, 14, 3 * SPD, 0.5);
    }
    this.serve.start(dishById(this.sim.dish));
    this.servePoints();
    this.overlay.flash('rgba(255,209,102,0.5)');
    this.popScreen('ORDER UP!', 0.5, 0.36, '#ffd166', 40, 'power');
    buzz('shield');
  }

  /** Where the serve scene's dish and table are, cached so the cutscene's frames allocate nothing. */
  private servePoints(): void {
    const d = this.serve.dishPoint(this.view);
    const t = this.serve.tablePoint(this.view);
    this.dishPt.x = d.x;
    this.dishPt.y = d.y;
    this.tablePt.x = t.x;
    this.tablePt.y = t.y;
  }

  private popAt(x: number, y: number, text: string, color: string, size: number): void {
    const s = toStage(this.view, x, y);
    this.overlay.pop(text, s.x, s.y, color, size);
  }

  private popScreen(text: string, fx: number, fy: number, color: string, size: number, cls = ''): void {
    this.overlay.pop(text, this.stage.clientWidth * fx, this.stage.clientHeight * fy, color, size, cls);
  }

  /**
   * The drawing buffer is the stage size divided by the pixel size, rounded UP, and the canvas is shown at exactly
   * that many CSS px per buffer pixel (so every art pixel is the same size), centred on the stage. It can
   * overhang each edge by less than one art pixel; the stage clips that.
   */
  private resize(): void {
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    if (!w || !h) return;
    const px = Math.max(1, Math.round(urlNumber('px') ?? VIEW.PIXEL_SIZE));
    const v = (this.view = makeView(w, h, px));
    this.f.view = v;
    this.canvas.width = v.w;
    this.canvas.height = v.h;
    this.ctx.imageSmoothingEnabled = false;
    const s = this.canvas.style;
    s.width = `${v.w * px}px`;
    s.height = `${v.h * px}px`;
    s.left = `${-v.offX}px`;
    s.top = `${-v.offY}px`;
    this.servePoints();
  }
}
