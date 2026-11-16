// The beaver, seen from behind: run cycle, lane lean, hop, shield bubble, crash tumble, cheer.
// PLACEHOLDER (Task 1): a brown box with a red headband, legs that alternate, a hop, a shield ring.
// Task 3 replaces the body; keep the exported signature.
import { P } from './palette';
import type { Frame } from './types';

export class Runner {
  shieldOn = false;
  private phase = 0;
  private hopT = 1;
  private hopH = 0;
  private lean = 0;
  private crashed = false;
  private cheering = false;

  reset(): void {
    this.shieldOn = false;
    this.phase = 0;
    this.hopT = 1;
    this.hopH = 0;
    this.lean = 0;
    this.crashed = false;
    this.cheering = false;
  }

  /** strength 0..1 */
  hop(strength: number): void {
    this.hopT = 0;
    this.hopH = 3 + strength * 5;
  }

  crash(): void {
    this.crashed = true;
  }

  cheer(): void {
    this.cheering = true;
  }

  /** cadence ~0.4..3 run-cycle speed; leanVel in lanes/s. */
  update(dt: number, cadence: number, leanVel: number): void {
    this.phase += dt * cadence * 8;
    this.hopT = Math.min(this.hopT + dt / 0.35, 1);
    this.lean = Math.max(-1, Math.min(1, leanVel / 4));
  }

  /** x = centre, y = feet. */
  draw(f: Frame, x: number, y: number): void {
    const { rect } = f.art;
    const lift = Math.round(Math.sin(this.hopT * Math.PI) * this.hopH);
    const cx = Math.round(x + this.lean * 2);
    const top = y - 20 - lift;
    if (this.crashed) {
      rect(cx - 10, y - 8, 20, 8, P.ink);
      rect(cx - 9, y - 7, 18, 6, P.fur);
      rect(cx + 4, y - 7, 2, 6, P.red);
      return;
    }
    const step = Math.floor(this.phase) % 2;
    rect(cx - 5, y - 4 - lift - step, 3, 4, P.furDark);
    rect(cx + 2, y - 4 - lift - (1 - step), 3, 4, P.furDark);
    rect(cx - 8, top, 16, 17, P.ink);
    rect(cx - 7, top + 1, 14, 15, P.fur);
    rect(cx - 7, top + 3, 14, 2, P.red);
    rect(cx - 3, top + 12, 6, 6, P.furDark); // tail
    if (this.cheering) {
      rect(cx - 10, top - 5, 3, 7, P.furLight);
      rect(cx + 7, top - 5, 3, 7, P.furLight);
    }
    if (this.shieldOn) {
      const { ctx } = f.art;
      ctx.globalAlpha = 0.35;
      f.art.ellipse(cx, top + 9, 12, 13, '#8ecae6');
      ctx.globalAlpha = 1;
    }
  }
}
