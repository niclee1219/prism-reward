import { JUICE } from '../config';

export const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Watches the frame rate and flips `lowFx` on when the device cannot keep up. */
export class PerfMonitor {
  lowFx = false;
  private frames = 0;
  private elapsed = 0;
  private warmup = 2;

  /** dt in seconds of real time. Returns true on the frame lowFx switches on. */
  tick(dt: number): boolean {
    if (this.lowFx) return false;
    if (this.warmup > 0) {
      this.warmup -= dt;
      return false;
    }
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < 2) return false;
    const fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    if (fps < JUICE.LOW_FPS) {
      this.lowFx = true;
      return true;
    }
    return false;
  }
}
