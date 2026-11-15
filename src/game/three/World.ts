// Draws the RunSim in 3D, Subway-Surfers style: a chase camera behind and above the runner,
// looking down a hawker street at dusk. The sim owns all rules; this file only mirrors
// its state into meshes each frame and turns its events into effects.
// It also directs the three "cinematic" moments, which are camera work and nothing else:
// the slow hero shot behind the start screen, the swoop + countdown into a run, and the
// serve cutscene after the last recipe step.
import * as THREE from 'three';
import { GATES, SCORING, SERVE, VIEW, WORLD } from '../../config';
import { dishById } from '../../content/dishes';
import { buzz } from '../haptics';
import { PerfMonitor, reducedMotion } from '../perf';
import type { RunSim, SimEvent } from '../sim/RunSim';
import { LANE_COLOURS, depthZ, glowTexture, laneX } from './build';
import { Motes, Overlay, Particles, Shockwaves, SpeedStreaks } from './Fx';
import { HAZE, HawkerCentre, skyTexture } from './HawkerCentre';
import { GateMesh, ObstaclePool, PickupPool } from './Props';
import { Runner } from './Runner';
import { SERVE_T, ServeScene } from './Serve';

const BASE_HFOV = 50; // degrees of horizontal view: keeps all 3 lanes on screen in portrait
const BOOST_HFOV = 8;
const PARTY = [0xffd166, 0xe63946, 0x52e08a, 0x8ecae6, 0xb388ff, 0xff5d8f];
const CHEERS = ['😋', '👏', '❤️', '🤤', '⭐', '🔥'];
/** Countdown shown while the camera swoops in behind the runner: [seconds, text, colour]. */
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

export class World {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 0.5, 0.1, 130);
  private centre = new HawkerCentre();
  private runner = new Runner();
  private serve = new ServeScene();
  private obstaclesRoot = new THREE.Group();
  private pool = new ObstaclePool(this.obstaclesRoot);
  private obstacleMeshes = new Map<number, THREE.Mesh>();
  private pickupsRoot = new THREE.Group();
  private pickupPool = new PickupPool(this.pickupsRoot, glowTexture('rgba(255,209,102,0.9)'));
  private pickupMeshes = new Map<number, THREE.Group>();
  private gate: { id: number; mesh: GateMesh } | null = null;
  private dyingGates: GateMesh[] = [];
  private sparks = new Particles(true, 520, 0.36);
  private confetti = new Particles(false, 360, 0.11);
  private rings = new Shockwaves();
  private streaks = new SpeedStreaks();
  private motes = new Motes();
  private overlay: Overlay;
  private perf = new PerfMonitor();
  private lastTravelled = 0;
  private lastPlayerX = 1;
  private hfov = BASE_HFOV;
  private fovPunch = 0;
  private shake = 0;
  private time = 0;
  private lastFrame = 0;
  private fireClock = 0;
  private tmp = new THREE.Vector3();
  private lowFx = false;
  /** The canvas's CSS size and how far it overhangs the stage's left / top edge (see resize). */
  private canvasBox = { w: 1, h: 1, x: 0, y: 0 };
  // Camera: every mode just says where it WANTS the camera; the camera eases there.
  private camPos = new THREE.Vector3(0, 2.1, 4.6);
  private camLook = new THREE.Vector3(0, 2.3, -10);
  private wantPos = new THREE.Vector3();
  private wantLook = new THREE.Vector3();
  // Intro (camera swoop + countdown) state.
  private introT = -1;
  private introShown = 0;
  private introDone: (() => void) | null = null;
  // Serve cutscene state.
  private serving = false;
  private plated = false;
  private partyClock = 0;
  private cheerClock = 0;

  constructor(
    private stage: HTMLElement,
    mount: HTMLElement,
    private sim: RunSim,
    private hooks: WorldHooks,
  ) {
    // Pixel art: the scene is drawn small (one buffer pixel per VIEW.PIXEL_SIZE CSS px) with no antialiasing,
    // and CSS scales the canvas up with nearest-neighbour sampling (see resize()).
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(HAZE);
    this.renderer.domElement.classList.add('pix-crisp');
    mount.append(this.renderer.domElement);
    this.overlay = new Overlay(stage, reducedMotion);

    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(HAZE, 18, 47);
    // Midday lighting: bright blue-white sky light, warm pavement bounce, a high hard sun and a
    // soft fill from behind the camera so the runner's back never goes dark.
    this.scene.add(new THREE.HemisphereLight('#f4faff', '#cdbfa6', 2.1));
    const sun = new THREE.DirectionalLight('#fff3d6', 1.9);
    sun.position.set(-4, 12, -3);
    const fill = new THREE.DirectionalLight('#e8f1ff', 0.8);
    fill.position.set(2, 6, 6);
    this.scene.add(
      sun, fill, this.centre.group, this.runner.group, this.serve.set, this.serve.dish, this.obstaclesRoot, this.pickupsRoot,
      this.rings.group, this.motes.points, this.sparks.points, this.confetti.points, this.streaks.group,
    );

    sim.on((e) => this.onEvent(e));
    new ResizeObserver(() => this.resize()).observe(stage);
    this.resize();
    this.lastTravelled = sim.travelled;
    this.lastFrame = performance.now();
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  /** True while a full-screen page (Learn) hides the street: frames are skipped until it is false again. */
  paused = false;

  /** Clears the world for a new run. Call before `intro` / `sim.startRun`. */
  reset(): void {
    for (const m of this.obstacleMeshes.values()) this.pool.give(m);
    this.obstacleMeshes.clear();
    for (const m of this.pickupMeshes.values()) this.pickupPool.give(m);
    this.pickupMeshes.clear();
    for (const g of [this.gate?.mesh, ...this.dyingGates]) if (g) this.removeGate(g);
    this.gate = null;
    this.dyingGates = [];
    this.runner.reset();
    this.serve.stop();
    this.serving = this.plated = false;
    this.overlay.clear();
    this.shake = 0;
  }

  /**
   * The start of a run: the camera swoops in behind the runner over a READY / SET count,
   * then `go` is called on GO! (that is where the run really starts).
   */
  intro(go: () => void): void {
    if (reducedMotion) {
      this.camPos.set(0, 2.95, 4.5);
      this.camLook.set(0, 2.6, -10);
      go();
      return;
    }
    // Cut to a low close-up at the runner's side; the chase camera then eases in from there,
    // so every run (first or replay) opens with the same swoop.
    this.camPos.set(2.5, 1.25, 1.7);
    this.camLook.set(0, 1.35, -1.2);
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
      buzz('near');
    }
    if (this.introT < INTRO_GO_S) return;
    this.introT = -1;
    this.popScreen('GO!', 0.5, 0.4, '#52e08a', 76, 'count go');
    this.overlay.flash('rgba(255,246,224,0.45)');
    this.fovPunch = 9;
    this.runner.hop(1);
    this.rings.fire(0, 0, '#52e08a', 7);
    this.sparks.emit(this.tmp.set(0, 0.2, 0.2), [0xfff6e0, 0xffd166, 0x52e08a], 36, 5, 5, 0.6);
    buzz('boost');
    const go = this.introDone;
    this.introDone = null;
    go?.();
  }

  // --- frame ---------------------------------------------------------------

  private frame(now: number): void {
    // Something covers the whole street (Learn): skip the work, and keep the frame-rate watcher out of it.
    if (this.paused) {
      this.lastFrame = now;
      return;
    }
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    this.time += dt;
    if (this.perf.tick(dt)) this.goLowFx();

    this.updateIntro(dt);
    this.sim.update(dt);

    const sim = this.sim;
    const stepM = (sim.travelled - this.lastTravelled) * WORLD.M_PER_UNIT;
    this.lastTravelled = sim.travelled;
    const leanVel = (sim.playerX - this.lastPlayerX) / Math.max(dt, 1e-3);
    this.lastPlayerX = sim.playerX;
    const speedMs = stepM / Math.max(dt, 1e-3);
    const running = sim.mode === 'run';
    const st = this.serving ? sim.endingT : -1;

    this.centre.update(sim.travelled * WORLD.M_PER_UNIT, this.time);
    if (!this.serving) {
      this.syncObstacles();
      this.syncPickups();
    }
    this.syncGate(dt, stepM);

    // In the serve cutscene the runner drifts to the middle of the walkway, where the table is.
    const px = laneX(sim.playerX) * (this.serving ? 1 - smooth(st / 0.9) : 1);
    const cadence = this.serving
      ? Math.min(speedMs / 15, 2)
      : sim.mode === 'attract'
        ? 0.6
        : running
          ? sim.ramp * (sim.boosted ? GATES.BOOST_FACTOR : sim.slowed ? GATES.SLOW_FACTOR : 1)
          : 0.4;
    this.runner.group.position.x = px;
    this.runner.shieldOn = sim.hasShield && !this.serving;
    this.runner.update(dt, cadence, this.serving ? 0 : leanVel, this.time);
    if (this.serving) this.updateServe(dt, st);

    const onFire = running && sim.score.streak >= GATES.FIRE_STREAK;
    this.overlay.fever(onFire);
    if (!this.lowFx) {
      const fast = running ? (sim.boosted ? 1 : sim.slowed ? 0 : (sim.ramp - 1.15) / 1.4) : this.serving && st < 1.2 ? 1 : 0;
      this.streaks.update(dt, fast, speedMs);
      this.motes.update(dt, stepM, this.time);
      if (onFire) {
        this.fireClock += dt;
        while (this.fireClock > 0.03) {
          this.fireClock -= 0.03;
          this.sparks.emit(this.tmp.set(px, 0.15, 0.25), [0xff7b00, 0xffd166, 0xe63946], 2, 1.2, -1.5, 0.35, 0.6);
        }
      }
    }
    this.sparks.update(dt, stepM);
    this.confetti.update(dt, stepM, this.time);
    this.rings.update(dt, stepM);
    this.updateCamera(dt, px, leanVel, st);
    this.renderer.render(this.scene, this.camera);
  }

  /** The serve cutscene, `st` seconds in. The sim moves the world; this adds the show. */
  private updateServe(dt: number, st: number): void {
    const T = SERVE_T;
    this.runner.serving = st > T.RAISE - 0.3; // stands tall, arms up, from here to the end
    if (this.serve.update(st, this.sim.serveLeft * WORLD.M_PER_UNIT, this.time)) this.dishLanded();
    // Just before the dish appears, the recovered ingredients leave the HUD and fly into it.
    if (!this.plated && st > T.RAISE - 0.55) {
      this.plated = true;
      const s = this.toScreen(this.tmp.set(0, 2.35, 0));
      this.hooks.onPlating(s.x, s.y);
    }
    if (st > T.RAISE && st < T.THROW && !this.lowFx) {
      this.sparks.emit(this.tmp.set(0, 2.4, 0), [0xffd166, 0xfff6e0], 1, 2.2, -1, 0.5);
    }
    if (st < T.LAND || st > SERVE.TOTAL_MS / 1000 + 0.6) return;
    // Party: fireworks overhead, confetti raining on the table, customers cheering.
    this.partyClock += dt;
    while (this.partyClock > 0.14) {
      this.partyClock -= 0.14;
      const at = this.tmp.set(-4 + Math.random() * 6, 3.4 + Math.random() * 2.6, -6 + Math.random() * 6);
      this.sparks.emit(at, [PARTY[Math.floor(Math.random() * PARTY.length)], 0xffffff], 34, 5, 3, 1.0);
      this.confetti.emit(this.tmp.set((Math.random() - 0.5) * 5, 4.5, -1.5 + (Math.random() - 0.5) * 3), PARTY, 7, 1.5, 3, 2.6);
    }
    this.cheerClock += dt;
    if (this.cheerClock > 0.22) {
      this.cheerClock = 0;
      const s = this.toScreen(this.tmp.set((Math.random() - 0.5) * 3, 1.8 + Math.random() * 0.6, -1.7));
      this.overlay.emoji(CHEERS[Math.floor(Math.random() * CHEERS.length)], s.x, s.y);
    }
  }

  private dishLanded(): void {
    const dish = dishById(this.sim.dish);
    const table = this.serve.tablePoint;
    this.overlay.flash('rgba(255,209,102,0.6)');
    this.shake = 0.35;
    this.fovPunch = 6;
    this.rings.fire(table.x, table.z, '#ffd166', 9);
    this.rings.fire(table.x, table.z, dish.colour, 5);
    this.sparks.emit(table.clone().setY(1.1), [0xffd166, 0xffffff, 0xff9f1c], 90, 7, 6, 0.9);
    for (let i = 0; i < 5; i++) this.confetti.emit(this.tmp.set((i - 2) * 1.1, 1.2, -1.2), PARTY, 26, 6.5, 7, 2.8);
    this.overlay.banner('DISH SERVED!', `Ah Ma's ${dish.name}`, dish.colour);
    if (this.sim.score.bonus) this.popScreen(`+${this.sim.score.bonus} BONUS`, 0.5, 0.46, '#52e08a', 30, 'combo');
    this.runner.cheer();
    this.cheerClock = 1;
    buzz('crash');
  }

  private updateCamera(dt: number, px: number, leanVel: number, st: number): void {
    const boost = this.sim.boosted && this.sim.mode === 'run' ? BOOST_HFOV : 0;
    this.fovPunch = Math.max(0, this.fovPunch - dt * 22);
    this.hfov += (BASE_HFOV + boost - this.hfov) * Math.min(dt * 4, 1);
    const aspect = this.camera.aspect;
    const hfov = this.hfov + this.fovPunch;
    const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfov / 2)) / aspect));
    const clamped = THREE.MathUtils.clamp(vfov, 45, 100);
    if (Math.abs(clamped - this.camera.fov) > 0.01) {
      this.camera.fov = clamped;
      this.camera.updateProjectionMatrix();
    }

    // Where does this moment want the camera, and how eagerly should it get there?
    let rate = 9;
    if (this.sim.mode === 'attract' && this.introT < 0 && !this.introDone) {
      // Start screen: a slow, low hero shot swinging round the runner's shoulder.
      this.wantPos.set(Math.sin(this.time * 0.35) * 2.4, 2.1 + Math.sin(this.time * 0.23) * 0.3, 4.6);
      this.wantLook.set(Math.sin(this.time * 0.35) * -0.8, 2.3, -10);
      rate = 2;
    } else if (this.serving && st > 0) {
      // Serve: push in during the dash, then swing round to the side to watch the plate land.
      const a = smooth((st - 1.2) / 1.3) * 1.05;
      const r = 4.6 + smooth((st - SERVE_T.LAND) / 1.5) * 0.8;
      this.wantPos.set(Math.sin(a) * r, 2.9, Math.cos(a) * r - smooth((st - 1.2) / 1.3) * 1.0);
      this.wantLook.set(0, 2.6 - smooth((st - 1.2) / 1.0) * 1.0, -10 + smooth((st - 1.0) / 1.2) * 8.9);
      rate = 5;
    } else {
      // Chase: low and close behind the runner, looking well down the street.
      this.wantPos.set(px * 0.55, 2.95, 4.5);
      this.wantLook.set(px * 0.4, 2.6, -10);
      if (this.introT >= 0) rate = 3.4; // the swoop in from the hero shot
    }
    const k = Math.min(dt * rate, 1);
    this.camPos.lerp(this.wantPos, k);
    this.camLook.lerp(this.wantLook, k);

    this.shake = Math.max(0, this.shake - dt * 1.8);
    const s = reducedMotion ? 0 : this.shake;
    this.camera.position.set(
      this.camPos.x + Math.sin(this.time * 67) * s * 0.5,
      this.camPos.y + Math.sin(this.time * 53 + 1) * s * 0.5,
      this.camPos.z,
    );
    this.camera.lookAt(this.camLook);
    if (this.sim.mode === 'run') this.camera.rotateZ(THREE.MathUtils.clamp(-leanVel * 0.01, -0.06, 0.06));
  }

  // --- syncing sim state into meshes -----------------------------------------

  private syncObstacles(): void {
    const alive = new Set<number>();
    for (const o of this.sim.obstacles) {
      alive.add(o.id);
      let m = this.obstacleMeshes.get(o.id);
      if (!m) {
        m = this.pool.take(o.kind);
        m.rotation.y = (Math.random() - 0.5) * 0.5;
        this.obstacleMeshes.set(o.id, m);
      }
      m.position.set(laneX(o.lane), 0, depthZ(o.d));
    }
    for (const [id, m] of this.obstacleMeshes) {
      if (alive.has(id) || this.sim.mode === 'ending') continue;
      this.pool.give(m);
      this.obstacleMeshes.delete(id);
    }
  }

  private syncPickups(): void {
    const sim = this.sim;
    const alive = new Set<number>();
    const px = laneX(sim.playerX);
    for (const p of sim.pickups) {
      if (p.taken && p.d > -20) continue; // collected (sim drops it next frame)
      alive.add(p.id);
      let g = this.pickupMeshes.get(p.id);
      if (!g) {
        g = this.pickupPool.take(p.kind);
        this.pickupMeshes.set(p.id, g);
      }
      let x = laneX(p.lane);
      // Magnet: coins swing across toward the runner as they approach.
      if (sim.magnetPulls(p)) x += (px - x) * (1 - Math.max(p.d, 0) / 90);
      const body = g.getObjectByName('body')!;
      if (p.kind === 'coin') {
        g.position.set(x, 0.75 + Math.sin(this.time * 4 + p.id) * 0.08, depthZ(p.d));
        body.rotation.y = this.time * 4 + p.id;
      } else {
        g.position.set(x, 0.15 + Math.abs(Math.sin(this.time * 3)) * 0.25, depthZ(p.d));
        body.rotation.y = Math.sin(this.time * 2) * 0.5;
      }
    }
    for (const [id, g] of this.pickupMeshes) {
      if (alive.has(id)) continue;
      this.pickupPool.give(g);
      this.pickupMeshes.delete(id);
    }
  }

  private syncGate(dt: number, stepM: number): void {
    const g = this.sim.gate;
    if (g && this.gate?.id !== g.id) {
      const mesh = new GateMesh(WORLD.LANE_M, g.tutorial ? g.gq.correctLane : null);
      this.scene.add(mesh.group);
      this.gate = { id: g.id, mesh };
    }
    if (g && this.gate) this.gate.mesh.group.position.z = depthZ(g.d);
    this.gate?.mesh.update(dt, this.time);
    this.dyingGates = this.dyingGates.filter((m) => {
      m.group.position.z += stepM;
      if (m.update(dt, this.time)) return true;
      this.removeGate(m);
      return false;
    });
  }

  private removeGate(m: GateMesh): void {
    this.scene.remove(m.group);
    m.dispose();
  }

  // --- effects -------------------------------------------------------------

  private onEvent(e: SimEvent): void {
    const head = () => this.tmp.set(laneX(this.sim.playerX), 1.4, 0);
    switch (e.type) {
      case 'gate': {
        if (this.gate) {
          this.gate.mesh.resolve(e.chosenLane, e.correctLane, e.correct);
          this.dyingGates.push(this.gate.mesh);
          this.gate = null;
        }
        if (e.correct) {
          this.shake = Math.max(this.shake, 0.12);
          this.fovPunch = 5;
          this.runner.hop(0.7);
          this.rings.fire(laneX(e.correctLane), 0, LANE_COLOURS[e.correctLane], 6);
          this.sparks.emit(head(), [0x52e08a, 0xffd166, 0x8ecae6], 40, 5);
          this.popAt(head(), `+${e.points}`, '#52e08a', 28);
          // The winning answer gets DISH SERVED on its own, not a streak call-out on top of it.
          const hype = e.recovered >= SCORING.RECIPE_STEPS ? undefined : HYPE[Math.min(e.streak, 7)];
          if (hype) {
            const lvl = Math.min(e.streak, 7);
            this.popScreen(hype[0], 0.5, 0.36, hype[1], 26 + lvl * 3, `combo hype${lvl}`);
            if (e.multiplier > 1) this.popScreen(`x${e.multiplier} COMBO`, 0.5, 0.43, '#fff6e0', 18, 'combo');
            this.shake = Math.max(this.shake, 0.05 * lvl);
            if (!this.lowFx) this.sparks.emit(head(), [0xffd166, 0xff5d8f, 0xb388ff], 10 * lvl, 4 + lvl);
          }
          const s = this.toScreen(head());
          this.hooks.onIngredient(s.x, s.y, e.recovered);
          buzz('correct');
        } else {
          this.popAt(head(), 'OOPS', '#ff8a8a', 26);
          this.shake = Math.max(this.shake, 0.15);
          this.overlay.flash('rgba(230,57,70,0.25)');
          buzz('wrong');
        }
        break;
      }
      case 'coin': {
        const g = this.pickupMeshes.get(e.pickupId);
        if (g && !this.lowFx) this.sparks.emit(g.position.clone(), e.doubled ? [0xffd166, 0xff5d8f] : [0xffd166, 0xfff6e0], 7, 2.8, 4, 0.4);
        this.hooks.onCoin(e.points, e.doubled);
        buzz(e.doubled ? 'coinDouble' : 'coin');
        break;
      }
      case 'lane':
        // A little hop and a puff of dust at the feet on every lane change.
        this.runner.hop(0.55);
        if (!this.lowFx) this.sparks.emit(this.tmp.set(laneX(this.sim.playerX), 0.08, 0.1), [0xfff6e0, 0xcdb4db], 5, 1.6, 1, 0.3);
        break;
      case 'perfectLine':
        this.rings.fire(laneX(this.sim.playerX), 0, '#ffd166', 4);
        buzz('perfect');
        break;
      case 'power': {
        const g = this.pickupMeshes.get(e.pickupId);
        const [text, color] = POWER_TEXT[e.kind];
        this.sparks.emit((g?.position.clone() ?? head()).setY(1), [0xffd166, 0xffffff, new THREE.Color(color).getHex()], 70, 7);
        this.overlay.flash('rgba(255,209,102,0.35)');
        this.rings.fire(laneX(this.sim.playerX), 0, color, 7);
        this.fovPunch = 6;
        this.popScreen(text, 0.5, 0.5, color, 38, 'power');
        this.shake = Math.max(this.shake, 0.25);
        this.hooks.onPower(e.kind);
        buzz('shield');
        break;
      }
      case 'shieldGained':
        this.popAt(this.tmp.set(laneX(this.sim.playerX), 2.4, 0), 'PRISM SHIELD', '#8ecae6', 22);
        buzz('shield');
        break;
      case 'shieldUsed': {
        const m = this.obstacleMeshes.get(e.obstacleId);
        if (m) this.sparks.emit(m.position.clone().setY(0.8), [0x8ecae6, 0xffffff], 50, 6);
        this.rings.fire(laneX(this.sim.playerX), 0, '#8ecae6', 7);
        this.popAt(head(), 'SHIELDED!', '#8ecae6', 26);
        this.shake = Math.max(this.shake, 0.18);
        buzz('shield');
        break;
      }
      case 'nearMiss':
        this.popAt(head(), 'CLOSE!', '#ffffff', 24);
        buzz('near');
        break;
      case 'crash':
        this.shake = 0.6;
        this.overlay.flash('rgba(255,255,255,0.8)');
        this.sparks.emit(head(), [0xffd166, 0xe63946, 0xffffff], 70, 6);
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

  /** The last recipe step is in: clear the walkway and begin the serve cutscene. */
  private startServe(): void {
    this.serving = true;
    this.plated = false;
    this.partyClock = this.cheerClock = 0;
    for (const m of this.obstacleMeshes.values()) {
      this.sparks.emit(m.position.clone().setY(0.8), [0xfff6e0, 0xcdb4db], 14, 3, 2, 0.5);
      this.pool.give(m);
    }
    this.obstacleMeshes.clear();
    for (const g of this.pickupMeshes.values()) this.pickupPool.give(g);
    this.pickupMeshes.clear();
    this.serve.start(dishById(this.sim.dish));
    this.overlay.flash('rgba(255,209,102,0.5)');
    this.fovPunch = 10;
    this.popScreen('ORDER UP!', 0.5, 0.36, '#ffd166', 40, 'power');
    buzz('shield');
  }

  /** World point to stage CSS px. The canvas can overhang the stage by under one art pixel (see resize). */
  private toScreen(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.camera);
    const c = this.canvasBox;
    return { x: ((p.x + 1) / 2) * c.w - c.x, y: ((1 - p.y) / 2) * c.h - c.y };
  }

  private popAt(v: THREE.Vector3, text: string, color: string, size: number): void {
    const s = this.toScreen(v);
    this.overlay.pop(text, s.x, s.y, color, size);
  }

  private popScreen(text: string, fx: number, fy: number, color: string, size: number, cls = ''): void {
    this.overlay.pop(text, this.stage.clientWidth * fx, this.stage.clientHeight * fy, color, size, cls);
  }

  /**
   * Slow device: drop the decorative effects. The resolution is already low (the pixel-art render draws
   * 1/PIXEL_SIZE² of the stage's pixels), so it stays as it is and the look does not change mid-run.
   */
  private goLowFx(): void {
    this.lowFx = true;
    this.centre.lowFx();
    this.streaks.group.visible = false;
    this.motes.points.visible = false;
  }

  /**
   * The drawing buffer is the stage size divided by PIXEL_SIZE, rounded UP, and the canvas is shown at exactly
   * PIXEL_SIZE CSS px per buffer pixel (so every art pixel is the same size), centred on the stage. It can
   * overhang each edge by less than one art pixel; the stage clips that.
   */
  private resize(): void {
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    if (!w || !h) return;
    const px = Math.max(1, Math.round(urlNumber('px') ?? VIEW.PIXEL_SIZE));
    const bw = Math.ceil(w / px);
    const bh = Math.ceil(h / px);
    this.renderer.setSize(bw, bh, false);
    const c = this.canvasBox;
    c.w = bw * px;
    c.h = bh * px;
    c.x = (c.w - w) / 2;
    c.y = (c.h - h) / 2;
    const s = this.renderer.domElement.style;
    s.width = `${c.w}px`;
    s.height = `${c.h}px`;
    s.left = `${-c.x}px`;
    s.top = `${-c.y}px`;
    this.camera.aspect = bw / bh;
    this.camera.fov = 0; // force a projection update next frame
  }
}
