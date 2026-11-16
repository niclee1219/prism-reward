// The serve cutscene. Before SERVE_T.CUT the World draws the top-down dash up the street; from CUT this scene
// draws the whole frame: a side view of Ah Ma's stall with the Learn chef beaver at the counter, the dish raised,
// thrown to the table, and landing at LAND.
// PLACEHOLDER (Task 1): flat backdrop, Learn's chef and counter, Ah Ma's portrait, boxes for customers and the dish.
// Task 5 replaces the body; keep the exported signature.
import type { Dish } from '../../content/dishes';
import { chef, counter, portrait } from '../../learn/art';
import { P } from './palette';
import type { Art, Frame } from './types';
import type { View } from './view';

/** Seconds into the cutscene. CUT: the top-down dash ends and the side view starts. */
export const SERVE_T: { CUT: number; RAISE: 1.65; THROW: 2.5; LAND: 2.9 } = { CUT: 1.15, RAISE: 1.65, THROW: 2.5, LAND: 2.9 };

const WIPE_S = 0.3;

export class ServeScene {
  private dish: Dish | null = null;
  private landed = false;
  /** Learn's counter() wants the canvas size next to rect; one reusable object, filled in on each draw. */
  private surf: { rect: Art['rect']; w: number; h: number } = { rect: () => {}, w: 0, h: 0 };

  start(dish: Dish): void {
    this.dish = dish;
    this.landed = false;
  }

  stop(): void {
    this.dish = null;
    this.landed = false;
  }

  /** st = seconds into the cutscene; true exactly once, at LAND. */
  update(f: Frame, st: number): boolean {
    void f;
    if (this.landed || !this.dish || st < SERVE_T.LAND) return false;
    this.landed = true;
    return true;
  }

  /** Call only when st >= SERVE_T.CUT. Draws the whole frame, including the wipe in from the street. */
  draw(f: Frame, st: number): void {
    const { art, view: v } = f;
    const { rect } = art;
    const top = counterTop(v);
    rect(0, 0, v.w, top, P.tile);
    for (let y = 0; y < top; y += 6) rect(0, y, v.w, 1, P.tileLine);
    for (let x = 0; x < v.w; x += 8) {
      rect(x, 0, 4, 7, P.red);
      rect(x + 4, 0, 4, 7, P.apron);
    }
    portrait(art, Math.round(v.w * 0.08), 14);
    // Ah Ma (a beaver box) and two customers behind the table end of the counter.
    const tx = Math.round(v.w * 0.7);
    const ty = top;
    const ax = Math.round(v.w * 0.3);
    const ay = top - 26;
    rect(tx - 22, top - 20, 10, 20, P.furDark);
    rect(tx - 21, top - 26, 8, 7, P.fur);
    rect(tx - 21, top - 26, 8, 2, '#e0e0e0');
    rect(tx + 6, top - 18, 9, 18, P.sleeve);
    rect(tx + 7, top - 24, 7, 6, P.skin);
    rect(tx + 17, top - 18, 9, 18, P.red);
    rect(tx + 18, top - 24, 7, 6, P.skinShade);
    const raised = st >= SERVE_T.RAISE && st < SERVE_T.THROW;
    chef(art, ax, top + 8, 1, { arm: raised ? 'up' : st >= SERVE_T.LAND ? 'up' : 'forward', mouth: st >= SERVE_T.LAND, bob: raised ? Math.round(Math.abs(Math.sin(f.time * 8))) : 0 });
    const s = this.surf;
    s.rect = rect;
    s.w = v.w;
    s.h = v.h;
    counter(s, top);
    if (this.dish && st >= SERVE_T.RAISE) {
      let x = ax;
      let y = ay;
      if (st >= SERVE_T.LAND) {
        x = tx;
        y = ty;
      } else if (st >= SERVE_T.THROW) {
        const k = (st - SERVE_T.THROW) / (SERVE_T.LAND - SERVE_T.THROW);
        x = ax + (tx - ax) * k;
        y = ay + (ty - ay) * k - Math.sin(k * Math.PI) * 18;
      }
      rect(x - 6, y - 5, 12, 6, P.ink);
      rect(x - 5, y - 4, 10, 4, this.dish.colour);
      rect(x - 6, y, 12, 1, P.white);
    }
    // Wipe in from the street: an ink panel slides off to the right.
    const k = (st - SERVE_T.CUT) / WIPE_S;
    if (k < 1) {
      const edge = Math.round(v.w * Math.max(0, k));
      rect(edge, 0, v.w - edge, v.h, P.ink);
    }
  }

  /** Art px where the raised dish is (target of onPlating). */
  dishPoint(v: View): { x: number; y: number } {
    return { x: Math.round(v.w * 0.3), y: counterTop(v) - 26 };
  }

  /** Art px of the table (landing effects). */
  tablePoint(v: View): { x: number; y: number } {
    return { x: Math.round(v.w * 0.7), y: counterTop(v) };
  }
}

/** The counter top sits a little above the beaver's usual row, so the scene clears the question panel's space. */
function counterTop(v: View): number {
  return v.playerY - 12;
}
