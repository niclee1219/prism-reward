import { describe, expect, it } from 'vitest';
import { RUN, SCORING, WORLD, implausibleReasonFor } from './simHelpers';
import { SERVE } from '../../src/config';
import { RunSim, type RunHooks, type RunResult } from '../../src/game/sim/RunSim';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hooks(onEnd: (r: RunResult) => void): RunHooks {
  return { onHud() {}, onQuestion() {}, onGateResult() {}, onEnd };
}

/** Steers into the correct gate lane and around obstacles, like the e2e bot; goes for pickups when free. */
function steer(sim: RunSim) {
  const near = sim.obstacles.filter((o) => !o.resolved && o.d < 140 && o.d > -20).map((o) => o.lane);
  const loot = sim.pickups.filter((p) => !p.taken && p.d > 0 && p.d < 160).sort((a, b) => a.d - b.d)[0];
  let target = sim.gate?.gq.correctLane ?? loot?.lane ?? sim.lane;
  if (near.includes(target)) target = ([sim.lane, 1, 0, 2].find((l) => !near.includes(l)) ?? target) as 0 | 1 | 2;
  if (target === sim.lane) return;
  const dir = target > sim.lane ? 1 : -1;
  if (!near.includes(sim.lane + dir)) sim.move(dir);
}

function play(seed: number, bot: boolean, greedy = false): RunResult {
  const sim = new RunSim(mulberry32(seed));
  let result: RunResult | null = null;
  sim.startRun(hooks((r) => (result = r)), 'laksa');
  for (let i = 0; i < 60 * 200 && !result; i++) {
    // Worst case for the server cap: 2x coins and the magnet on for the whole run.
    if (greedy) sim.doubleUntil = sim.magnetUntil = Infinity;
    if (bot && i % 3 === 0) steer(sim);
    sim.update(1 / 60);
  }
  if (!result) throw new Error('run never ended');
  return result;
}

describe('RunSim', () => {
  it('a good player recovers all 8 steps and the dish is served', () => {
    let served = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = play(seed, true);
      if (r.reason !== 'served') continue;
      served++;
      expect(r.recovered).toBe(SCORING.RECIPE_STEPS);
      expect(r.correct).toBe(SCORING.RECIPE_STEPS);
      expect(r.dish).toBe('laksa');
      expect(r.bonus).toBeGreaterThanOrEqual(SCORING.SERVED_BONUS);
      expect(r.duration_ms).toBeLessThan(90_000);
      // The server must accept every honest served run.
      expect(implausibleReasonFor(r)).toBeNull();
    }
    expect(served).toBeGreaterThanOrEqual(12); // the naive bot serves 15/20; a regression here means the run got much harder
  });

  it('coins: collected by a good player, and even every coin doubled stays under the server cap', () => {
    let total = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r = play(seed, true);
      total += r.coins;
      expect(implausibleReasonFor(r)).toBeNull();
      const g = play(seed, true, true);
      expect(g.coins).toBeGreaterThan(0);
      expect(implausibleReasonFor(g)).toBeNull();
    }
    expect(total).toBeGreaterThan(50);
  });

  it('perfect runs no longer tie: coins separate them', () => {
    const served = [];
    for (let seed = 1; seed <= 20; seed++) {
      const r = play(seed, true);
      if (r.reason === 'served') served.push(r.score);
    }
    expect(new Set(served).size).toBeGreaterThan(served.length / 2);
  });

  it('never steering: wrong answers do not end the run, an obstacle does', () => {
    const r = play(7, false);
    expect(r.reason).toBe('crash');
    expect(r.wrong).toBeGreaterThanOrEqual(1);
    expect(r.recovered).toBe(0);
    expect(r.bonus).toBe(0);
    expect(r.duration_ms).toBeGreaterThan(RUN.INVULNERABLE_S * 1000);
  });

  it('runs that end early still pass the server check', () => {
    for (let seed = 1; seed <= 10; seed++) expect(implausibleReasonFor(play(seed, false))).toBeNull();
  });

  it('one move() is one lane, clamped to the road', () => {
    const sim = new RunSim(mulberry32(1));
    sim.startRun(hooks(() => {}));
    sim.move(1);
    expect(sim.lane).toBe(2);
    sim.move(1);
    expect(sim.lane).toBe(2);
    sim.move(-1);
    sim.move(-1);
    sim.move(-1);
    expect(sim.lane).toBe(0);
    for (let i = 0; i < 20; i++) sim.update(1 / 60);
    expect(sim.playerX).toBeCloseTo(0, 5);
  });

  it('obstacles spawn above the top of the screen and none can arrive before the safe period ends', () => {
    const sim = new RunSim(mulberry32(3));
    sim.startRun(hooks(() => {}));
    for (let i = 0; i < 60 * RUN.INVULNERABLE_S; i++) {
      sim.update(1 / 60);
      for (const o of sim.obstacles) expect(o.d).toBeGreaterThan(OBSTACLE_FREE_ZONE);
    }
    expect(Math.max(...sim.obstacles.map((o) => o.d), WORLD.SPAWN_DIST)).toBe(WORLD.SPAWN_DIST);
  });

  it('served: the result is frozen at the last answer, then the runner coasts to the table', () => {
    // Find a seed the bot serves on (most of them), stopping at the moment of the last answer.
    let sim!: RunSim;
    let result: RunResult | null = null;
    for (let seed = 1; seed <= 20; seed++) {
      sim = new RunSim(mulberry32(seed));
      result = null;
      sim.startRun(hooks((r) => (result = r)), 'laksa');
      for (let i = 0; i < 60 * 200 && sim.mode === 'run'; i++) {
        if (i % 3 === 0) steer(sim);
        sim.update(1 / 60);
      }
      if (sim.endReason === 'served') break;
    }
    expect(sim.endReason).toBe('served');
    const score = sim.score.score;
    const from = sim.travelled;
    // The cutscene: no result yet, the world keeps scrolling, and input is ignored.
    for (let i = 0; i < 60; i++) sim.update(1 / 60);
    expect(result).toBeNull();
    expect(sim.travelled).toBeGreaterThan(from);
    expect(sim.serveLeft).toBeGreaterThan(0);
    sim.move(1);
    expect(sim.lane).not.toBe(3);
    for (let i = 0; i < 60 * 5 && !result; i++) sim.update(1 / 60);
    expect(result!.reason).toBe('served');
    expect(result!.score).toBe(score);
    expect(sim.travelled - from).toBeCloseTo(SERVE.DASH_UNITS, 3);
    expect(sim.serveLeft).toBeCloseTo(0, 3);
    // Back to the menu jog for the next player.
    sim.idle();
    expect(sim.mode).toBe('attract');
    expect(sim.obstacles).toHaveLength(0);
  });

  it('time limit ends the run as timeup', () => {
    const sim = new RunSim(mulberry32(5));
    let result: RunResult | null = null;
    sim.startRun(hooks((r) => (result = r)));
    sim.obstacles = [];
    sim.t = RUN.MAX_S - 0.01;
    for (let i = 0; i < 200 && !result; i++) sim.update(1 / 60);
    expect(result!.reason).toBe('timeup');
    expect(result!.duration_ms).toBe(RUN.MAX_S * 1000);
  });
});

// Within the first 9 s nothing may get closer than the hit window.
const OBSTACLE_FREE_ZONE = 22;

describe('dishes', () => {
  it('server accepts exactly the dishes the game offers, each with 8 steps', async () => {
    const { DISHES } = await import('../../src/content/dishes');
    const { DISH_IDS } = await import('../../supabase/functions/_shared/router');
    expect([...DISH_IDS].sort()).toEqual(DISHES.map((d) => d.id).sort());
    for (const d of DISHES) expect(d.steps).toHaveLength(SCORING.RECIPE_STEPS);
  });
});
