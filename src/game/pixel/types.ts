// What every drawing module gets each frame.
import type { RunSim } from '../sim/RunSim';
import type { View } from './view';

/** The pixel canvas, in art pixels. Same helpers as src/scene/pixelCanvas.ts so Learn's sprites draw on it. */
export interface Art {
  readonly ctx: CanvasRenderingContext2D;
  /** Fill a rectangle; x and y are rounded to whole art pixels. */
  rect(x: number, y: number, w: number, h: number, color: string): void;
  /** Fill a pixel ellipse centred on (cx, cy), drawn as one-pixel rows. */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void;
}

/** The Art helpers for a 2D context. The functions are plain closures, so they also work destructured. */
export function makeArt(ctx: CanvasRenderingContext2D): Art {
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, color: string) => {
    for (let y = -Math.round(ry); y <= Math.round(ry); y++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      rect(cx - half, cy + y, half * 2, 1, color);
    }
  };
  return { ctx, rect, ellipse };
}

export interface Frame {
  art: Art;
  view: View;
  sim: RunSim;
  /** Seconds; `time` keeps running in every mode. */
  dt: number;
  time: number;
  /** The device is struggling: drop decoration (never gameplay sprites). */
  lowFx: boolean;
  /** prefers-reduced-motion: no shake, no flashes, no intro hop. */
  reduced: boolean;
}
