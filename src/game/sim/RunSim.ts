// The whole run as pure logic: no rendering, no DOM. The 3D renderer reads this state
// every frame and reacts to its events. Depth is "distance ahead of the player" (d);
// the player is always at d = 0 and the world moves toward them.
import { GATES, OBSTACLES, PICKUPS, RUN, SCORING, SERVE, WORLD, servedBonus, speedFactorAt } from '../../config';
import type { DishId } from '../../content/dishes';
import { doubleRowChance, gateInterval, gateReadTime, obstacleInterval, tierAt } from '../difficulty';
import { GateDirector, type GateQuestion } from '../gateDirector';
import { ScoreKeeper } from '../scoring';

export type EndReason = 'crash' | 'timeup' | 'served';

export interface RunResult {
  score: number;
  correct: number;
  wrong: number;
  gates: number;
  duration_ms: number;
  bestStreak: number;
  reason: EndReason;
  /** Question ids the player got wrong, in order. */
  missed: string[];
  dish: DishId;
  /** Recipe steps recovered (0..RECIPE_STEPS). */
  recovered: number;
  /** Bonus points included in `score` for serving the dish. */
  bonus: number;
  coins: number;
}

export type PowerKind = 'double' | 'magnet' | 'shield';

export interface HudState {
  score: number;
  multiplier: number;
  streak: number;
  shield: boolean;
  /** 0..1 of the 180 s limit used. */
  progress: number;
  recovered: number;
  coins: number;
  /** Timed power-up running now, with seconds left. */
  power: { kind: 'double' | 'magnet'; left: number } | null;
}

export interface RunHooks {
  onHud(h: HudState): void;
  /** A new question is on its way (null clears the panel). */
  onQuestion(gq: GateQuestion | null, tutorial: boolean): void;
  onGateResult(chosenLane: number, correctLane: number, correct: boolean): void;
  onEnd(result: RunResult): void;
}

/** Obstacle models, picked at random. The renderer has one model per kind. */
export const OBSTACLE_KINDS = ['stools', 'trolley', 'wetfloor', 'uncle', 'cat'] as const;
export type ObstacleKind = (typeof OBSTACLE_KINDS)[number];

export interface Obstacle {
  id: number;
  lane: number;
  d: number;
  kind: ObstacleKind;
  resolved: boolean;
}

export interface Gate {
  id: number;
  d: number;
  gq: GateQuestion;
  tutorial: boolean;
}

/** A collectible. Coins come in lines; a tingkat is a mystery power-up. */
export interface Pickup {
  id: number;
  kind: 'coin' | 'tingkat';
  lane: number;
  d: number;
  /** Coins: which line they belong to (for "perfect line"). */
  line: number;
  taken: boolean;
}

/** Things the renderer animates. Positions are lanes / depth so it can place effects. */
export type SimEvent =
  | { type: 'gate'; gateId: number; chosenLane: number; correctLane: number; correct: boolean; points: number; multiplier: number; streak: number; recovered: number }
  | { type: 'coin'; pickupId: number; points: number; doubled: boolean }
  | { type: 'perfectLine'; count: number }
  | { type: 'power'; pickupId: number; kind: PowerKind }
  | { type: 'shieldGained' }
  | { type: 'shieldUsed'; obstacleId: number }
  | { type: 'nearMiss' }
  | { type: 'lane'; dir: -1 | 1 }
  | { type: 'crash'; obstacleId: number }
  | { type: 'end'; reason: EndReason };

export class RunSim {
  mode: 'attract' | 'run' | 'ending' = 'attract';
  /** Seconds into the run. Public so the end-to-end test can jump the clock. */
  t = 0;
  lane = 1;
  /** Smoothed lateral position in lanes (0..2), eased toward `lane`. */
  playerX = 1;
  /** Total distance travelled (units), for scrolling the scenery. */
  travelled = 0;
  hasShield = false;
  gate: Gate | null = null;
  obstacles: Obstacle[] = [];
  pickups: Pickup[] = [];
  score = new ScoreKeeper();
  /** Run time (s) until which the power-ups last. */
  doubleUntil = 0;
  magnetUntil = 0;
  dish: DishId = 'chicken-rice';
  /** Current speed modifiers, read by the renderer for camera effects. */
  boosted = false;
  slowed = false;
  ramp = 1;
  /** Why the run ended (null while running), and seconds since it did. For the renderer's cutscenes. */
  endReason: EndReason | null = null;
  endingT = 0;

  private hooks: RunHooks | null = null;
  private listeners: ((e: SimEvent) => void)[] = [];
  private director: GateDirector;
  private nowMs = 0;
  private prevLane = 1;
  private laneFrom = 1;
  private laneChangeAt = -9999;
  private boostUntil = 0;
  private slowUntil = 0;
  private slowmoUntil = 0;
  private nextGateAt = 0;
  private nextRowAt = 0;
  private tutorialDone = false;
  private hudClock = 0;
  private endAt = 0;
  private serveFrom = 0;
  private result: RunResult | null = null;
  private missed: string[] = [];
  private nextId = 1;
  private nextCoinAt = 0;
  private nextTingkatAt = 0;
  private lineNo = 0;
  /** Per coin line: coins still out, and whether any was missed. */
  private lines = new Map<number, { left: number; missed: boolean; size: number }>();

  constructor(private rng: () => number = Math.random) {
    this.director = new GateDirector(rng);
  }

  on(listener: (e: SimEvent) => void): void {
    this.listeners.push(listener);
  }

  get recovered(): number {
    return Math.min(this.score.correct, SCORING.RECIPE_STEPS);
  }

  /** Begins a fresh run. Safe to call again after a run has ended. */
  startRun(hooks: RunHooks, dish: DishId = this.dish): void {
    this.hooks = hooks;
    this.dish = dish;
    this.mode = 'run';
    this.t = 0;
    this.lane = this.prevLane = this.laneFrom = 1;
    this.playerX = 1;
    this.laneChangeAt = -9999;
    this.boostUntil = this.slowUntil = this.slowmoUntil = 0;
    this.boosted = this.slowed = false;
    this.hasShield = false;
    this.tutorialDone = false;
    this.nextGateAt = GATES.TUTORIAL_AT_S;
    this.nextRowAt = 0;
    this.gate = null;
    this.obstacles = [];
    this.pickups = [];
    this.lines.clear();
    this.doubleUntil = this.magnetUntil = 0;
    this.nextCoinAt = PICKUPS.FIRST_COINS_S;
    this.nextTingkatAt = PICKUPS.TINGKAT_FIRST_S;
    this.score = new ScoreKeeper();
    this.director = new GateDirector(this.rng);
    this.missed = [];
    this.result = null;
    this.endReason = null;
    this.endingT = 0;
    hooks.onQuestion(null, false);
    this.pushHud();
  }

  /** Back to the idle jog shown behind the menus and during the pre-run countdown. */
  idle(): void {
    this.mode = 'attract';
    this.endReason = null;
    this.result = null;
    this.gate = null;
    this.obstacles = [];
    this.pickups = [];
    this.lane = this.prevLane = this.laneFrom = 1;
    this.hasShield = false;
  }

  /** Lane change from the input layer. One call moves at most one lane. */
  move(dir: -1 | 1): void {
    if (this.mode !== 'run') return;
    const target = Math.min(Math.max(this.lane + dir, 0), 2);
    if (target === this.lane) return;
    this.prevLane = this.lane;
    this.laneFrom = this.playerX;
    this.lane = target;
    this.laneChangeAt = this.nowMs;
    this.emit({ type: 'lane', dir });
  }

  /** Advance by `realDt` seconds of wall-clock time. */
  update(realDt: number): void {
    realDt = Math.min(realDt, 0.05);
    this.nowMs += realDt * 1000;
    this.easeLane();

    if (this.mode === 'attract') {
      this.travelled += RUN.BASE_SPEED * 0.5 * realDt;
      return;
    }
    if (this.mode === 'ending') {
      this.endingT += realDt;
      // Served: the score is already final. The runner dashes on and eases to a stop at the table.
      if (this.endReason === 'served') {
        const k = Math.min(this.endingT / SERVE.DASH_S, 1);
        this.travelled = this.serveFrom + SERVE.DASH_UNITS * (1 - (1 - k) ** 3);
      }
      if (this.result && this.nowMs >= this.endAt) {
        const r = this.result;
        this.result = null;
        this.hooks?.onEnd(r);
      }
      return;
    }

    this.t += realDt;
    if (this.t >= RUN.MAX_S) {
      this.finish('timeup');
      return;
    }

    // Time scale: the tutorial gate and near-miss moments run in slow motion.
    let timeScale = 1;
    if (this.gate?.tutorial) timeScale = GATES.TUTORIAL_SLOWMO;
    if (this.nowMs < this.slowmoUntil) timeScale = Math.min(timeScale, OBSTACLES.NEAR_MISS_SLOWMO);
    const dt = realDt * timeScale;

    this.boosted = this.t < this.boostUntil;
    this.slowed = this.t < this.slowUntil;
    const mod = this.slowed ? GATES.SLOW_FACTOR : this.boosted ? GATES.BOOST_FACTOR : 1;
    this.ramp = speedFactorAt(this.t);
    const factor = this.ramp * mod;
    const step = RUN.BASE_SPEED * factor * dt;

    this.score.addDistance(dt, factor);
    this.travelled += step;
    this.spawn();
    this.moveGate(step);
    if (this.mode !== 'run') return;
    this.moveObstacles(step);
    if (this.mode !== 'run') return;
    this.movePickups(step);

    this.hudClock += realDt;
    if (this.hudClock > 0.1) {
      this.hudClock = 0;
      this.pushHud();
    }
  }

  /** Distance (units) still to cover before the runner reaches the serving table. */
  get serveLeft(): number {
    return this.endReason === 'served' ? this.serveFrom + SERVE.DASH_UNITS - this.travelled : 0;
  }

  // --- world ---------------------------------------------------------------

  private easeLane(): void {
    const k = Math.min((this.nowMs - this.laneChangeAt) / RUN.LANE_TWEEN_MS, 1);
    const eased = Math.sin((k * Math.PI) / 2); // Sine.easeOut, as before
    this.playerX = this.laneFrom + (this.lane - this.laneFrom) * eased;
  }

  private spawn(): void {
    const nominalSpeed = RUN.BASE_SPEED * this.ramp;

    if (!this.gate && this.t >= this.nextGateAt) {
      const tutorial = !this.tutorialDone;
      const gq = tutorial
        ? this.director.next(1, { avoidLane: this.lane, type: 'pain_vs_fix' })
        : this.director.next(tierAt(this.t));
      this.nextGateAt = this.t + gateInterval(this.t);
      if (gq) {
        const read = tutorial ? 2 : gateReadTime(this.t);
        this.gate = { id: this.nextId++, d: nominalSpeed * read, gq, tutorial };
        this.hooks?.onQuestion(gq, tutorial);
      }
      this.tutorialDone = true;
    }

    // Coin lines. The interval is a hard minimum: the server's score cap relies on it.
    if (this.t >= this.nextCoinAt) {
      this.nextCoinAt = this.t + SCORING.COIN_LINE_INTERVAL_S + this.rng() * 0.6;
      this.spawnCoinLine();
    }

    if (this.t >= this.nextRowAt) {
      this.nextRowAt = this.t + obstacleInterval(this.t) * (0.85 + this.rng() * 0.3);
      const d = WORLD.SPAWN_DIST;
      const arrival = this.t + d / nominalSpeed;
      if (arrival < RUN.INVULNERABLE_S) return;
      if (this.gate) {
        const gap = d - this.gate.d; // > 0: the row is behind the gate (arrives after it)
        const clear = gap > 0 ? OBSTACLES.CLEAR_AFTER_GATE_S : OBSTACLES.CLEAR_BEFORE_GATE_S;
        if (Math.abs(gap) < nominalSpeed * clear + 24) return;
      }
      const lanes = this.shuffle([0, 1, 2]);
      const blocked = this.rng() < doubleRowChance(this.t) ? 2 : 1;
      for (let i = 0; i < blocked; i++) {
        const kind = OBSTACLE_KINDS[Math.floor(this.rng() * OBSTACLE_KINDS.length)];
        this.obstacles.push({ id: this.nextId++, lane: lanes[i], d, kind, resolved: false });
        this.clearCoinsNear(lanes[i], d);
      }
      // A mystery tingkat rides alongside a row, in a lane the row leaves open.
      if (this.t >= this.nextTingkatAt) {
        this.nextTingkatAt = this.t + PICKUPS.TINGKAT_MIN_S + this.rng() * (PICKUPS.TINGKAT_MAX_S - PICKUPS.TINGKAT_MIN_S);
        const lane = lanes[blocked];
        this.clearCoinsNear(lane, d);
        this.pickups.push({ id: this.nextId++, kind: 'tingkat', lane, d, line: -1, taken: false });
      }
    }
  }

  /** A line of coins down one lane, in a lane with no obstacle along its length. */
  private spawnCoinLine(): void {
    const len = (SCORING.COINS_PER_LINE - 1) * PICKUPS.COIN_SPACING;
    const d0 = WORLD.SPAWN_DIST;
    const free = [0, 1, 2].filter(
      (l) => !this.obstacles.some((o) => o.lane === l && o.d > d0 - 40 && o.d < d0 + len + 40),
    );
    if (free.length === 0) return;
    // Lean toward a different lane from the player, so collecting takes a decision.
    const away = free.filter((l) => l !== this.lane);
    const pool = away.length && this.rng() < 0.7 ? away : free;
    const lane = pool[Math.floor(this.rng() * pool.length)];
    const line = ++this.lineNo;
    for (let i = 0; i < SCORING.COINS_PER_LINE; i++) {
      this.pickups.push({ id: this.nextId++, kind: 'coin', lane, d: d0 + i * PICKUPS.COIN_SPACING, line, taken: false });
    }
    this.lines.set(line, { left: SCORING.COINS_PER_LINE, missed: false, size: SCORING.COINS_PER_LINE });
  }

  /** Removes coins that a new obstacle would sit on (that line can no longer be perfect). */
  private clearCoinsNear(lane: number, d: number): void {
    this.pickups = this.pickups.filter((p) => {
      if (p.kind !== 'coin' || p.taken || p.lane !== lane || Math.abs(p.d - d) > 30) return true;
      const ln = this.lines.get(p.line);
      if (ln) {
        ln.left--;
        ln.missed = true;
      }
      return false;
    });
  }

  private movePickups(step: number): void {
    const magnet = this.t < this.magnetUntil;
    const doubled = this.t < this.doubleUntil;
    for (const p of this.pickups) {
      p.d -= step;
      if (p.taken) continue;
      const near = Math.abs(p.d) < PICKUPS.HIT_DEPTH;
      const inLane = Math.abs(p.lane - this.playerX) < PICKUPS.HIT_LANES;
      if (p.kind === 'coin') {
        if (near && (inLane || magnet)) {
          p.taken = true;
          const points = this.score.coin(doubled);
          this.emit({ type: 'coin', pickupId: p.id, points, doubled });
          this.settleLine(p.line, false);
        } else if (p.d < -PICKUPS.HIT_DEPTH) {
          p.taken = true; // gone past: counts as missed
          this.settleLine(p.line, true);
        }
      } else if (near && inLane) {
        p.taken = true;
        const kinds: PowerKind[] = this.hasShield ? ['double', 'magnet'] : ['double', 'magnet', 'shield'];
        const kind = kinds[Math.floor(this.rng() * kinds.length)];
        if (kind === 'double') this.doubleUntil = this.t + PICKUPS.DOUBLE_S;
        if (kind === 'magnet') this.magnetUntil = this.t + PICKUPS.MAGNET_S;
        if (kind === 'shield') this.hasShield = true;
        this.emit({ type: 'power', pickupId: p.id, kind });
        this.pushHud();
      }
    }
    // Collected pickups vanish now; missed coins stay visible until they are behind the camera.
    this.pickups = this.pickups.filter((p) => p.d > WORLD.DESPAWN_DIST && !(p.taken && p.d >= -PICKUPS.HIT_DEPTH));
  }

  private settleLine(line: number, missed: boolean): void {
    const ln = this.lines.get(line);
    if (!ln) return;
    ln.left--;
    if (missed) ln.missed = true;
    if (ln.left > 0) return;
    this.lines.delete(line);
    if (!ln.missed) this.emit({ type: 'perfectLine', count: ln.size });
  }

  /** Is the magnet pulling this coin right now? (For the renderer.) */
  magnetPulls(p: Pickup): boolean {
    return p.kind === 'coin' && !p.taken && this.t < this.magnetUntil && p.d < PICKUPS.MAGNET_RANGE;
  }

  private moveGate(step: number): void {
    const gate = this.gate;
    if (!gate) return;
    gate.d -= step;
    if (gate.d > WORLD.GATE_HIT_DIST) return;

    // The gate has reached the player: the lane they are in is their answer.
    this.gate = null;
    const correct = this.lane === gate.gq.correctLane;
    const points = this.score.answer(correct);
    this.hooks?.onGateResult(this.lane, gate.gq.correctLane, correct);

    if (correct) {
      this.boostUntil = this.t + GATES.BOOST_S;
      this.slowUntil = 0;
      if (this.score.streak % GATES.SHIELD_STREAK === 0 && !this.hasShield) {
        this.hasShield = true;
        this.emit({ type: 'shieldGained' });
      }
    } else {
      this.missed.push(gate.gq.question.id);
      this.slowUntil = this.t + GATES.SLOW_S;
      this.boostUntil = 0;
    }
    this.emit({
      type: 'gate',
      gateId: gate.id,
      chosenLane: this.lane,
      correctLane: gate.gq.correctLane,
      correct,
      points,
      multiplier: this.score.multiplier,
      streak: this.score.streak,
      recovered: this.recovered,
    });
    this.pushHud();
    if (this.recovered >= SCORING.RECIPE_STEPS) this.finish('served');
  }

  private moveObstacles(step: number): void {
    for (const o of this.obstacles) {
      o.d -= step;
      if (o.resolved) continue;
      if (Math.abs(o.d) < OBSTACLES.HIT_DEPTH && Math.abs(o.lane - this.playerX) < OBSTACLES.HIT_LANES) {
        o.resolved = true;
        if (this.hasShield) {
          this.hasShield = false;
          o.d = -Infinity; // removed below
          this.emit({ type: 'shieldUsed', obstacleId: o.id });
          this.pushHud();
        } else {
          this.emit({ type: 'crash', obstacleId: o.id });
          this.finish('crash');
          return;
        }
      } else if (o.d < -OBSTACLES.HIT_DEPTH) {
        o.resolved = true;
        // Dodged out of this obstacle's lane at the last moment?
        if (o.lane === this.prevLane && this.nowMs - this.laneChangeAt < OBSTACLES.NEAR_MISS_MS) {
          this.slowmoUntil = this.nowMs + OBSTACLES.NEAR_MISS_SLOWMO_MS;
          this.emit({ type: 'nearMiss' });
        }
      }
    }
    this.obstacles = this.obstacles.filter((o) => o.d > WORLD.DESPAWN_DIST);
  }

  // --- endings -------------------------------------------------------------

  private finish(reason: EndReason): void {
    if (this.mode !== 'run') return;
    this.mode = 'ending';
    const duration_ms = Math.round(Math.min(this.t, RUN.MAX_S) * 1000);
    // Bonus is computed from the rounded duration, exactly as the server does.
    const bonus = reason === 'served' ? servedBonus(this.score.correct, duration_ms) : 0;
    this.score.bonus = bonus;
    this.result = {
      score: this.score.score,
      correct: this.score.correct,
      wrong: this.score.wrong,
      gates: this.score.gates,
      duration_ms,
      bestStreak: this.score.bestStreak,
      reason,
      missed: [...this.missed],
      dish: this.dish,
      recovered: this.recovered,
      bonus,
      coins: this.score.coins,
    };
    this.endReason = reason;
    this.endingT = 0;
    this.serveFrom = this.travelled;
    this.endAt = this.nowMs + (reason === 'crash' ? 850 : reason === 'served' ? SERVE.TOTAL_MS : 1100);
    this.pushHud();
    this.hooks?.onQuestion(null, false);
    this.emit({ type: 'end', reason });
  }

  private pushHud(): void {
    this.hooks?.onHud({
      score: this.score.score,
      multiplier: this.score.multiplier,
      streak: this.score.streak,
      shield: this.hasShield,
      progress: this.t / RUN.MAX_S,
      recovered: this.recovered,
      coins: this.score.coins,
      power:
        this.t < this.doubleUntil
          ? { kind: 'double', left: this.doubleUntil - this.t }
          : this.t < this.magnetUntil
            ? { kind: 'magnet', left: this.magnetUntil - this.t }
            : null,
    });
  }

  private emit(e: SimEvent): void {
    for (const l of this.listeners) l(e);
  }

  private shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Read-only snapshot used by the automated end-to-end test. */
  debugState() {
    return {
      mode: this.mode,
      t: this.t,
      lane: this.lane,
      gateLane: this.gate?.gq.correctLane ?? null,
      obstacles: this.obstacles.filter((o) => !o.resolved).map((o) => ({ lane: o.lane, d: o.d })),
      score: this.score.score,
      correct: this.score.correct,
      wrong: this.score.wrong,
      recovered: this.recovered,
      shield: this.hasShield,
      coins: this.score.coins,
    };
  }
}
