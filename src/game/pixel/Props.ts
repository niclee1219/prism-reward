// Obstacles, pickups and the answer gate.
// PLACEHOLDER (Task 1): dark boxes on a red pad, a gold coin square, an orange tingkat box, three lane bars.
// Task 4 replaces the bodies; keep the exported signatures.
import type { ObstacleKind } from '../sim/RunSim';
import { HAZARD_BLACK, HAZARD_RED, LANE_COLOURS, P } from './palette';
import type { Frame } from './types';
import { laneX } from './view';

/** Width x height of each placeholder box, so the kinds can be told apart in the gallery. */
const BOX: Record<ObstacleKind, [number, number, string]> = {
  stools: [14, 14, '#3a4a6b'],
  trolley: [20, 12, '#76828f'],
  wetfloor: [10, 16, '#e0b020'],
  uncle: [12, 20, '#2f5f8a'],
  cat: [10, 7, '#3b3b48'],
};

/** x centre, y ground. */
export function drawObstacle(f: Frame, kind: ObstacleKind, x: number, y: number, id: number): void {
  void id;
  const { rect } = f.art;
  const [w, h, c] = BOX[kind];
  rect(x - 11, y - 3, 22, 6, HAZARD_RED);
  for (let i = 0; i < 22; i += 4) rect(x - 11 + i, y + 2, 2, 1, HAZARD_BLACK);
  rect(x - (w >> 1) - 1, y - h - 1, w + 2, h + 2, P.ink);
  rect(x - (w >> 1), y - h, w, h, c);
}

export function drawPickup(f: Frame, kind: 'coin' | 'tingkat', x: number, y: number, id: number): void {
  const { rect } = f.art;
  if (kind === 'coin') {
    const bob = Math.round(Math.sin(f.time * 4 + id) * 1);
    rect(x - 4, y - 9 + bob, 8, 8, P.ink);
    rect(x - 3, y - 8 + bob, 6, 6, P.gold);
    rect(x - 2, y - 7 + bob, 2, 2, P.white);
    return;
  }
  const bob = Math.round(Math.abs(Math.sin(f.time * 3)) * 2);
  rect(x - 6, y - 14 - bob, 12, 14, P.ink);
  rect(x - 5, y - 13 - bob, 10, 12, '#ff9f1c');
  rect(x - 5, y - 9 - bob, 10, 1, '#c27a12');
}

/** The answer gate: one bar per lane in the lane colours, spanning the road. */
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
    return !this.resolved || this.t < 0.8;
  }

  /** y = ground y of the gate line. */
  draw(f: Frame, y: number): void {
    const { rect } = f.art;
    const v = f.view;
    for (let l = 0; l < 3; l++) {
      let c: string = LANE_COLOURS[l];
      let drop = 0;
      if (this.resolved) {
        if (l === this.correct) c = Math.floor(this.t * 10) % 2 ? '#52e08a' : P.white;
        else if (l === this.chosen && !this.ok) c = Math.floor(this.t * 10) % 2 ? P.red : P.white;
        else drop = Math.round(this.t * 30);
      } else if (this.hintLane !== null && l !== this.hintLane) {
        c = P.steelDark;
      }
      const x = laneX(v, l);
      const half = (v.laneW >> 1) - 2;
      rect(x - half, y - 12 + drop, half * 2, 12, P.ink);
      rect(x - half + 1, y - 11 + drop, half * 2 - 2, 10, c);
      if (this.hintLane === l && !this.resolved && Math.floor(f.time * 4) % 2) rect(x - half + 1, y - 11, half * 2 - 2, 2, P.gold);
    }
  }
}
