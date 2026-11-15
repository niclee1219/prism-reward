// Shared machinery for the code-drawn pixel-art scenes (forest, skyline, Learn scenes): a tiny canvas whose
// resolution is the art resolution, scaled up by CSS with crisp pixels, redrawn on a fixed, chunky frame rate.
//
//   const px = createPixelCanvas(canvas, { scale: 4 });           // 4 CSS px per art pixel (phone forest)
//   const px = createPixelCanvas(canvas, { scale: scaleForArtWidth(400) }); // big screens: ~400 art px wide
//   px.run((t, frame) => { px.rect(0, 0, px.w, px.h, '#123'); ... });      // first draw happens immediately
//   canvas.addEventListener('pointerdown', (e) => { const p = px.toArt(e); ... });
//   px.stop();                                                    // stops the loop and the ResizeObserver
//
// The canvas element needs a CSS size (the art is sized from clientWidth/clientHeight) and crisp upscaling
// (class "pix-crisp" from src/ui/pixel.css, or image-rendering: pixelated). Respecting prefers-reduced-motion is the
// scene's job: check `reducedMotion` (re-exported below) in the draw code, as forest.ts does.
export { reducedMotion } from '../game/perf';

export interface PixelCanvasOptions {
  /** CSS pixels per art pixel: a number, or a function of the canvas CSS size, re-evaluated on every resize. */
  scale: number | ((cssWidth: number, cssHeight: number) => number);
  /** Ticks per second of the draw loop. Default 15 (an old-game feel, and cheap on phones). */
  fps?: number;
  /** Smallest art size, so a canvas that is not laid out yet still gets a usable buffer. Defaults 40 x 60. */
  minWidth?: number;
  minHeight?: number;
  /** Called after the art size changes (the canvas is blank until the next tick redraws it). */
  onResize?: (w: number, h: number) => void;
}

/** Called once per tick. `t` is seconds of scene time (advances by exactly 1/fps per tick), `frame` counts ticks. */
export type DrawFn = (t: number, frame: number) => void;

export interface PixelCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Art size in art pixels (the canvas buffer size). Changes on resize, so read it inside the draw function. */
  readonly w: number;
  readonly h: number;
  /** Current CSS pixels per art pixel. */
  readonly scale: number;
  /** Fill a rectangle. x and y are rounded to whole art pixels; width and height are used as given. */
  rect(x: number, y: number, rw: number, rh: number, color: string): void;
  /** Fill a pixel ellipse centred on (cx, cy), drawn as one-pixel rows. */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void;
  /** Map a pointer position (clientX/clientY, e.g. a PointerEvent) to whole art-pixel coordinates (may be outside). */
  toArt(point: { clientX: number; clientY: number }): { x: number; y: number };
  /** Start the fixed-fps loop. Draws frame 0 (t = 0) immediately. Call at most once. */
  run(draw: DrawFn): void;
  /** Stop the loop and the resize watching. Safe to call more than once. */
  stop(): void;
}

/** Cheap deterministic noise in [0, 1] so scattered details look random but never flicker. */
export function hash(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/**
 * A `scale` option for big screens: picks whole CSS px per art pixel so the art is about `artWidth` pixels wide,
 * e.g. scaleForArtWidth(400) gives 5 on a 1920 px wide screen and 3 on a 1280 px laptop. Never below `min`.
 */
export function scaleForArtWidth(artWidth: number, min = 2): (cssWidth: number) => number {
  return (cssWidth) => Math.max(min, Math.round(cssWidth / artWidth));
}

export function createPixelCanvas(canvas: HTMLCanvasElement, opts: PixelCanvasOptions): PixelCanvas {
  const ctx = canvas.getContext('2d')!;
  const tickMs = 1000 / (opts.fps ?? 15);
  const dt = 1 / (opts.fps ?? 15);
  const minW = opts.minWidth ?? 40;
  const minH = opts.minHeight ?? 60;
  let w = 0;
  let h = 0;
  let scale = 1;

  const size = () => {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    scale = typeof opts.scale === 'number' ? opts.scale : Math.max(1, opts.scale(cw, ch));
    const nw = Math.max(minW, Math.ceil(cw / scale));
    const nh = Math.max(minH, Math.ceil(ch / scale));
    w = canvas.width = nw;
    h = canvas.height = nh;
    ctx.imageSmoothingEnabled = false;
    opts.onResize?.(w, h);
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(canvas);

  const rect = (x: number, y: number, rw: number, rh: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), rw, rh);
  };

  const ellipse = (cx: number, cy: number, rx: number, ry: number, color: string) => {
    for (let y = -Math.round(ry); y <= Math.round(ry); y++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      rect(cx - half, cy + y, half * 2, 1, color);
    }
  };

  const toArt = (p: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.floor(((p.clientX - r.left) / (r.width || 1)) * w),
      y: Math.floor(((p.clientY - r.top) / (r.height || 1)) * h),
    };
  };

  let raf = 0;
  let alive = true;
  let running = false;

  const run = (draw: DrawFn) => {
    if (running) throw new Error('pixelCanvas: run() called twice');
    running = true;
    if (!alive) return;
    let t = 0;
    let frame = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      if (!alive) return;
      acc += Math.min(now - last, 250);
      last = now;
      if (acc >= tickMs) {
        acc %= tickMs;
        t += dt;
        frame++;
        draw(t, frame);
      }
      raf = requestAnimationFrame(loop);
    };
    draw(t, frame);
    raf = requestAnimationFrame(loop);
  };

  const stop = () => {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
  };

  return {
    canvas,
    ctx,
    get w() {
      return w;
    },
    get h() {
      return h;
    },
    get scale() {
      return scale;
    },
    rect,
    ellipse,
    toArt,
    run,
    stop,
  };
}
