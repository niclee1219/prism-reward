import Phaser from 'phaser';
import { GATES, OBSTACLES, RUN, VIEW, speedFactorAt } from '../config';
import { ATLAS, FLOOR, SIDE, buildAtlas } from './art/buildAtlas';
import { OBSTACLE_KEYS } from './art/sprites';
import { doubleRowChance, gateInterval, gateReadTime, obstacleInterval, tierAt } from './difficulty';
import { GateDirector, type GateQuestion } from './gateDirector';
import { buzz } from './haptics';
import { Juice, LANE_COLOURS } from './juice';
import { PerfMonitor, reducedMotion } from './perf';
import { ScoreKeeper } from './scoring';

export interface RunResult {
  score: number;
  correct: number;
  wrong: number;
  gates: number;
  duration_ms: number;
  bestStreak: number;
  reason: 'crash' | 'timeup';
  /** Question ids the player got wrong, in order. */
  missed: string[];
}

export interface HudState {
  score: number;
  multiplier: number;
  streak: number;
  shield: boolean;
  /** 0..1 of the 180 s limit used. */
  progress: number;
}

export interface RunHooks {
  onHud(h: HudState): void;
  /** A new question is on its way (null clears the panel). */
  onQuestion(gq: GateQuestion | null, tutorial: boolean): void;
  onGateResult(chosenLane: number, correctLane: number, correct: boolean): void;
  onEnd(result: RunResult): void;
}

interface Obstacle {
  sprite: Phaser.GameObjects.Image;
  lane: number;
  resolved: boolean;
}

interface Gate {
  box: Phaser.GameObjects.Container;
  panels: Phaser.GameObjects.Rectangle[];
  gq: GateQuestion;
  tutorial: boolean;
}

const ROAD_W = VIEW.WIDTH - VIEW.SIDE * 2;
const LANE_W = ROAD_W / 3;
const laneX = (lane: number) => VIEW.SIDE + LANE_W * (lane + 0.5);

export class RunScene extends Phaser.Scene {
  private hooks: RunHooks | null = null;
  private mode: 'attract' | 'run' | 'ending' = 'attract';

  private floor!: Phaser.GameObjects.TileSprite;
  private sides!: Phaser.GameObjects.TileSprite[];
  private player!: Phaser.GameObjects.Sprite;
  private prism!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Arc;
  private shieldRing!: Phaser.GameObjects.Arc;
  private arrow!: Phaser.GameObjects.Image;
  private juice!: Juice;
  private perf = new PerfMonitor();

  private playerY = 0;
  private lane = 1;
  private prevLane = 1;
  private lastLaneChangeAt = -9999;
  private t = 0;
  private animClock = 0;
  private hudClock = 0;
  private boostUntil = 0;
  private slowUntil = 0;
  private slowmoUntil = 0;
  private hasShield = false;
  private nextGateAt = 0;
  private nextRowAt = 0;
  private tutorialDone = false;
  private gate: Gate | null = null;
  private obstacles: Obstacle[] = [];
  private score = new ScoreKeeper();
  private director = new GateDirector();
  private missed: string[] = [];

  constructor() {
    super('run');
  }

  create(): void {
    buildAtlas(this);
    const h = this.scale.height;
    this.playerY = h - VIEW.PLAYER_FROM_BOTTOM;

    this.floor = this.add.tileSprite(VIEW.SIDE, 0, ROAD_W, h, FLOOR).setOrigin(0).setDepth(0);
    this.sides = [
      this.add.tileSprite(0, 0, VIEW.SIDE, h, SIDE).setOrigin(0).setDepth(1),
      this.add.tileSprite(VIEW.WIDTH - VIEW.SIDE, 0, VIEW.SIDE, h, SIDE).setOrigin(0).setDepth(1).setFlipX(true),
    ];
    // Faint lane dividers.
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x1b1b2f, 0.12);
    g.fillRect(VIEW.SIDE + LANE_W - 1, 0, 2, h);
    g.fillRect(VIEW.SIDE + LANE_W * 2 - 1, 0, 2, h);

    this.glow = this.add.circle(laneX(1), this.playerY - 30, 13, 0x8ecae6, 0.35).setDepth(4);
    this.tweens.add({ targets: this.glow, scale: 1.35, alpha: 0.15, duration: 600, yoyo: true, repeat: -1 });
    this.player = this.add.sprite(laneX(1), this.playerY, ATLAS, 'run0').setDepth(5);
    this.prism = this.add.image(laneX(1), this.playerY - 30, ATLAS, 'prism').setDepth(5);
    this.shieldRing = this.add.circle(laneX(1), this.playerY - 6, 24).setStrokeStyle(2, 0x8ecae6, 0.9).setDepth(5);
    this.shieldRing.setVisible(false);
    this.tweens.add({ targets: this.shieldRing, scale: 1.12, duration: 420, yoyo: true, repeat: -1 });
    this.arrow = this.add.image(0, 0, ATLAS, 'arrow').setDepth(8).setVisible(false);

    this.juice = new Juice(this, reducedMotion);
    this.juice.follow(this.player);
    (window as unknown as { __prism?: unknown }).__prism = this;
  }

  /** Begins a fresh run. Safe to call again after a run has ended. */
  startRun(hooks: RunHooks): void {
    this.hooks = hooks;
    this.clearWorld();
    this.mode = 'run';
    this.t = 0;
    this.lane = this.prevLane = 1;
    this.lastLaneChangeAt = -9999;
    this.boostUntil = this.slowUntil = this.slowmoUntil = 0;
    this.hasShield = false;
    this.tutorialDone = false;
    this.nextGateAt = GATES.TUTORIAL_AT_S;
    this.nextRowAt = 0;
    this.score = new ScoreKeeper();
    this.director = new GateDirector();
    this.missed = [];
    this.tweens.killTweensOf(this.player);
    this.player.setPosition(laneX(1), this.playerY).setAngle(0).setAlpha(1).setScale(1);
    this.shieldRing.setVisible(false);
    this.cameras.main.resetFX();
    hooks.onQuestion(null, false);
    this.pushHud();
  }

  /** Lane change from the input layer. */
  move(dir: -1 | 1): void {
    if (this.mode !== 'run') return;
    const target = Phaser.Math.Clamp(this.lane + dir, 0, 2);
    if (target === this.lane) return;
    this.prevLane = this.lane;
    this.lane = target;
    this.lastLaneChangeAt = this.time.now;
    this.tweens.add({ targets: this.player, x: laneX(target), duration: RUN.LANE_TWEEN_MS, ease: 'Sine.easeOut' });
    this.player.setAngle(dir * 10);
    this.tweens.add({ targets: this.player, angle: 0, duration: 160 });
  }

  update(_time: number, delta: number): void {
    const realDt = Math.min(delta, 50) / 1000;
    if (this.perf.tick(realDt)) this.juice.lowFx = true;

    if (this.mode === 'attract') {
      this.scroll(RUN.BASE_SPEED * 0.5 * realDt);
      this.animate(realDt, 0.6);
      this.followPlayer();
      return;
    }
    if (this.mode === 'ending') {
      this.followPlayer();
      return;
    }

    this.t += realDt;
    if (this.t >= RUN.MAX_S) {
      this.finish('timeup');
      return;
    }

    // Time scale: tutorial approach and near-miss moments run in slow motion.
    let timeScale = 1;
    if (this.gate?.tutorial && this.gate.box.y > -20) timeScale = GATES.TUTORIAL_SLOWMO;
    if (this.time.now < this.slowmoUntil) timeScale = Math.min(timeScale, OBSTACLES.NEAR_MISS_SLOWMO);
    const dt = realDt * timeScale;

    const boosted = this.t < this.boostUntil;
    const slowed = this.t < this.slowUntil;
    const mod = slowed ? GATES.SLOW_FACTOR : boosted ? GATES.BOOST_FACTOR : 1;
    const ramp = speedFactorAt(this.t);
    const factor = ramp * mod;
    const speed = RUN.BASE_SPEED * factor;
    const step = speed * dt;

    this.score.addDistance(dt, factor);
    this.scroll(step);
    this.animate(dt, factor);
    this.spawn(ramp);
    this.moveGate(step);
    this.moveObstacles(step);
    if (this.mode !== 'run') return;
    this.followPlayer();

    this.juice.speedLines(boosted ? 1 : slowed ? 0 : (ramp - 1.15) / 1.4);
    this.juice.fireTrail(this.score.streak >= GATES.FIRE_STREAK);

    this.hudClock += realDt;
    if (this.hudClock > 0.1) {
      this.hudClock = 0;
      this.pushHud();
    }
  }

  // --- world ---------------------------------------------------------------

  private scroll(step: number): void {
    this.floor.tilePositionY -= step;
    for (const s of this.sides) s.tilePositionY -= step;
  }

  private animate(dt: number, factor: number): void {
    this.animClock += dt * factor;
    this.player.setFrame(Math.floor(this.animClock / 0.13) % 2 === 0 ? 'run0' : 'run1');
  }

  private followPlayer(): void {
    const bob = Math.sin(this.time.now / 180) * 2;
    this.prism.setPosition(this.player.x, this.player.y - 30 + bob);
    this.glow.setPosition(this.prism.x, this.prism.y);
    this.shieldRing.setPosition(this.player.x, this.player.y - 6);
    this.prism.setVisible(this.player.alpha > 0);
    this.glow.setVisible(this.player.alpha > 0);
  }

  private spawn(ramp: number): void {
    const nominalSpeed = RUN.BASE_SPEED * ramp;

    if (!this.gate && this.t >= this.nextGateAt) {
      const tutorial = !this.tutorialDone;
      const gq = tutorial
        ? this.director.next(1, { avoidLane: this.lane, type: 'pain_vs_fix' })
        : this.director.next(tierAt(this.t));
      this.nextGateAt = this.t + gateInterval(this.t);
      if (gq) {
        const read = tutorial ? 2 : gateReadTime(this.t);
        this.makeGate(gq, tutorial, this.playerY - nominalSpeed * read);
        this.hooks?.onQuestion(gq, tutorial);
      }
      this.tutorialDone = true;
    }

    if (this.t >= this.nextRowAt) {
      this.nextRowAt = this.t + obstacleInterval(this.t) * Phaser.Math.FloatBetween(0.85, 1.15);
      const y = -40;
      const arrival = this.t + (this.playerY - y) / nominalSpeed;
      if (arrival < RUN.INVULNERABLE_S) return;
      if (this.gate) {
        const gap = this.gate.box.y - y; // > 0: row is behind the gate (arrives after it)
        const clear = gap > 0 ? OBSTACLES.CLEAR_AFTER_GATE_S : OBSTACLES.CLEAR_BEFORE_GATE_S;
        if (Math.abs(gap) < nominalSpeed * clear + 24) return;
      }
      const lanes = Phaser.Utils.Array.Shuffle([0, 1, 2]);
      const blocked = Math.random() < doubleRowChance(this.t) ? 2 : 1;
      for (let i = 0; i < blocked; i++) {
        const key = Phaser.Utils.Array.GetRandom([...OBSTACLE_KEYS]);
        const sprite = this.add.image(laneX(lanes[i]), y, ATLAS, key).setDepth(3);
        this.obstacles.push({ sprite, lane: lanes[i], resolved: false });
      }
    }
  }

  private makeGate(gq: GateQuestion, tutorial: boolean, y: number): void {
    const box = this.add.container(0, y).setDepth(2);
    const panels: Phaser.GameObjects.Rectangle[] = [];
    for (let l = 0; l < 3; l++) {
      const post = this.add.rectangle(laneX(l), 0, LANE_W - 2, 12, 0x1b1b2f);
      const panel = this.add.rectangle(laneX(l), 0, LANE_W - 6, 8, LANE_COLOURS[l]);
      box.add([post, panel]);
      panels.push(panel);
      if (tutorial) {
        if (l === gq.correctLane) {
          this.tweens.add({ targets: panel, scaleY: 1.9, duration: 300, yoyo: true, repeat: -1 });
        } else {
          panel.setAlpha(0.3);
        }
      }
    }
    this.gate = { box, panels, gq, tutorial };
    if (tutorial) {
      // Pulsing arrow beside the player, pointing at the lane to steer into.
      const dir = gq.correctLane < this.lane ? -1 : 1;
      this.arrow
        .setVisible(true)
        .setAngle(dir * 90)
        .setPosition(laneX(this.lane) + dir * 26, this.playerY - 8)
        .setScale(1);
      this.tweens.add({
        targets: this.arrow,
        x: this.arrow.x + dir * 12,
        scale: 1.3,
        duration: 380,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private moveGate(step: number): void {
    const gate = this.gate;
    if (!gate) return;
    gate.box.y += step;
    if (gate.tutorial && this.lane === gate.gq.correctLane) this.hideArrow();
    if (gate.box.y < this.playerY - 6) return;

    // The gate has reached the player: the lane they are in is their answer.
    this.gate = null;
    this.hideArrow();
    const correct = this.lane === gate.gq.correctLane;
    const points = this.score.answer(correct);
    const px = this.player.x;
    this.hooks?.onGateResult(this.lane, gate.gq.correctLane, correct);

    if (correct) {
      this.boostUntil = this.t + GATES.BOOST_S;
      this.slowUntil = 0;
      gate.panels[this.lane].setFillStyle(0x52e08a);
      this.juice.shake(0.006);
      this.juice.burstAt(px, this.playerY - 10, [0x52e08a, 0xffd166]);
      this.juice.pop(px, this.playerY - 46, `+${points}`, '#52e08a', 13);
      if (this.score.multiplier > 1) {
        this.juice.pop(VIEW.WIDTH / 2, this.playerY - 84, `x${this.score.multiplier} COMBO`, '#ffd166', 15);
      }
      buzz('boost');
      if (this.score.streak % GATES.SHIELD_STREAK === 0 && !this.hasShield) {
        this.hasShield = true;
        this.shieldRing.setVisible(true);
        this.juice.pop(px, this.playerY - 66, 'PRISM SHIELD', '#8ecae6', 11);
        buzz('shield');
      }
    } else {
      this.missed.push(gate.gq.question.id);
      this.slowUntil = this.t + GATES.SLOW_S;
      this.boostUntil = 0;
      gate.panels[this.lane].setFillStyle(0xe63946);
      gate.panels[gate.gq.correctLane].setFillStyle(0x52e08a);
      this.juice.pop(px, this.playerY - 46, 'OOPS', '#ff8a8a', 12);
      this.tweens.add({ targets: this.player, alpha: 0.4, duration: 90, yoyo: true, repeat: 3 });
      buzz('stumble');
    }
    this.pushHud();
    this.tweens.add({
      targets: gate.box,
      alpha: 0,
      duration: 450,
      onUpdate: () => (gate.box.y += 1.5),
      onComplete: () => gate.box.destroy(),
    });
  }

  private hideArrow(): void {
    if (!this.arrow.visible) return;
    this.tweens.killTweensOf(this.arrow);
    this.arrow.setVisible(false);
  }

  private moveObstacles(step: number): void {
    const h = this.scale.height;
    for (const o of this.obstacles) {
      o.sprite.y += step;
      if (o.resolved) continue;
      const dy = o.sprite.y - this.playerY;
      if (Math.abs(dy) < OBSTACLES.HIT_HALF_H * 2 && Math.abs(o.sprite.x - this.player.x) < OBSTACLES.HIT_HALF_W * 2 - 8) {
        o.resolved = true;
        if (this.hasShield) {
          this.hasShield = false;
          this.shieldRing.setVisible(false);
          this.juice.burstAt(o.sprite.x, o.sprite.y, [0x8ecae6], 18);
          this.juice.pop(this.player.x, this.playerY - 46, 'SHIELDED!', '#8ecae6', 12);
          this.juice.shake(0.008);
          buzz('shield');
          o.sprite.destroy();
          this.pushHud();
        } else {
          this.crash();
          return;
        }
      } else if (dy > OBSTACLES.HIT_HALF_H * 2) {
        o.resolved = true;
        // Dodged out of this obstacle's lane at the last moment?
        if (o.lane === this.prevLane && this.time.now - this.lastLaneChangeAt < OBSTACLES.NEAR_MISS_MS) {
          this.slowmoUntil = this.time.now + OBSTACLES.NEAR_MISS_SLOWMO_MS;
          this.juice.pop(this.player.x, this.playerY - 46, 'CLOSE!', '#ffffff', 13);
          buzz('near');
        }
      }
    }
    this.obstacles = this.obstacles.filter((o) => {
      if (o.sprite.active && o.sprite.y < h + 40) return true;
      o.sprite.destroy();
      return false;
    });
  }

  // --- endings -------------------------------------------------------------

  private crash(): void {
    this.juice.shake(0.02, 300);
    this.juice.flash(0xffffff, 120);
    this.juice.burstAt(this.player.x, this.playerY, [0xffd166, 0xe63946], 24);
    this.juice.pop(VIEW.WIDTH / 2, this.playerY - 70, 'CRASH!', '#ff8a8a', 18);
    buzz('crash');
    this.tweens.add({ targets: this.player, angle: 540, y: this.playerY + 30, alpha: 0, duration: 600 });
    this.finish('crash');
  }

  private finish(reason: 'crash' | 'timeup'): void {
    if (this.mode !== 'run') return;
    this.mode = 'ending';
    this.juice.stopAll();
    this.hideArrow();
    if (reason === 'timeup') this.juice.pop(VIEW.WIDTH / 2, this.scale.height / 2, "TIME'S UP!", '#ffd166', 20);
    const result: RunResult = {
      score: this.score.score,
      correct: this.score.correct,
      wrong: this.score.wrong,
      gates: this.score.gates,
      duration_ms: Math.round(Math.min(this.t, RUN.MAX_S) * 1000),
      bestStreak: this.score.bestStreak,
      reason,
      missed: [...this.missed],
    };
    this.pushHud();
    this.hooks?.onQuestion(null, false);
    this.time.delayedCall(reason === 'crash' ? 850 : 1100, () => this.hooks?.onEnd(result));
  }

  private clearWorld(): void {
    for (const o of this.obstacles) o.sprite.destroy();
    this.obstacles = [];
    this.gate?.box.destroy();
    this.gate = null;
    this.hideArrow();
    this.juice.stopAll();
  }

  private pushHud(): void {
    this.hooks?.onHud({
      score: this.score.score,
      multiplier: this.score.multiplier,
      streak: this.score.streak,
      shield: this.hasShield,
      progress: this.t / RUN.MAX_S,
    });
  }

  /** Read-only snapshot used by the automated end-to-end test. */
  debugState() {
    return {
      mode: this.mode,
      t: this.t,
      lane: this.lane,
      gateLane: this.gate?.gq.correctLane ?? null,
      obstacles: this.obstacles.filter((o) => !o.resolved).map((o) => ({ lane: o.lane, y: o.sprite.y })),
      playerY: this.playerY,
      score: this.score.score,
      shield: this.hasShield,
    };
  }
}
