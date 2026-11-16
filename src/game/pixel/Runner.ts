// The beaver, seen from behind and a little above: run cycle, lane lean, hop, shield bubble, crash tumble, cheer.
// It is the Learn chef (same fur, red headband, cream apron) turned around: back of the head with two ears and the
// headband knot, apron strings tied in a bow, and the big cross-hatched paddle tail trailing toward the viewer.
// Everything is drawn as offsets from the feet, (0, 0) = centre of the feet on the floor.
import { P } from './palette';
import type { Art, Frame } from './types';

/** Darker red for the headband knot, so the knot reads against the band. */
const RED_SHADE = '#a8232f';
/** Shield bubble colours. */
const SHIELD = '#8ecae6';
const SHIELD_LIGHT = '#e8f7ff';
/** Dizzy stars after a crash. */
const STAR = P.gold;

/** Run-cycle frames per second at cadence 1, and the clamp that keeps it chunky at any speed. */
const RUN_FPS = 9;
const MIN_FPS = 3;
const MAX_FPS = 14;
/** Crash tumble: frame length, and the frame it holds on. */
const CRASH_FPS = 8;
const CRASH_LAST = 3;

/** Run cycle, per frame: left foot, right foot (0 planted, 1 kicked back toward the viewer, -1 swung forward). */
const FOOT_L = [1, 0, -1, 0];
const FOOT_R = [-1, 0, 1, 0];
/** Body bob (passing frames ride 1 px higher) and tail sway, per frame. */
const BOB = [0, 1, 0, 1];
const SWAY = [1, 0, -1, 0];
/** Cheer bounce height per frame. */
const CHEER_LIFT = [0, 2, 3, 2];

export class Runner {
  shieldOn = false;
  private phase = 0;
  private hopT = 1;
  private hopH = 0;
  private lean = 0;
  private crashed = false;
  private crashT = 0;
  private cheering = false;
  private cheerT = 0;

  // The current drawing origin (feet centre), so the small helpers below need no per-frame closures.
  private art: Art | null = null;
  private ox = 0;
  private oy = 0;

  reset(): void {
    this.shieldOn = false;
    this.phase = 0;
    this.hopT = 1;
    this.hopH = 0;
    this.lean = 0;
    this.crashed = false;
    this.crashT = 0;
    this.cheering = false;
    this.cheerT = 0;
  }

  /** strength 0..1 */
  hop(strength: number): void {
    this.hopT = 0;
    this.hopH = 2 + strength * 3;
  }

  crash(): void {
    if (!this.crashed) this.crashT = 0;
    this.crashed = true;
  }

  cheer(): void {
    if (!this.cheering) this.cheerT = 0;
    this.cheering = true;
  }

  /** cadence ~0.4..3 run-cycle speed; leanVel in lanes/s. */
  update(dt: number, cadence: number, leanVel: number): void {
    this.phase += dt * Math.max(MIN_FPS, Math.min(MAX_FPS, cadence * RUN_FPS));
    this.hopT = Math.min(this.hopT + dt / 0.35, 1);
    this.lean = Math.max(-1, Math.min(1, leanVel / 4));
    if (this.crashed) this.crashT += dt;
    if (this.cheering) this.cheerT += dt;
  }

  /** x = centre, y = feet. */
  draw(f: Frame, x: number, y: number): void {
    this.art = f.art;
    const cx = Math.round(x);
    const fy = Math.round(y);
    const lift = Math.round(Math.sin(this.hopT * Math.PI) * this.hopH);

    if (this.crashed) {
      const fr = Math.min(Math.floor(this.crashT * CRASH_FPS), CRASH_LAST);
      if (fr === 0) {
        // Jolt: knocked up off the floor, arms flung out.
        this.shadow(cx, fy, 3);
        this.upright(cx, fy - 3, -1, -1, 0, 1, 0, 'out');
      } else if (fr === 1) {
        // Toppling forward: the head pitches down onto the shoulders.
        this.shadow(cx, fy, 1);
        this.upright(cx, fy - 1, 1, 1, 0, -1, 0, 'out', 3);
      } else {
        // Flat on the floor; a small bounce on the frame it lands, then dizzy stars.
        this.shadow(cx, fy, 0);
        this.sprawl(cx, fy - (fr === 2 ? 1 : 0));
        if (fr === CRASH_LAST) this.stars(cx, fy - 21, f.time);
      }
      return;
    }

    if (this.cheering) {
      const fr = Math.floor(this.cheerT * 8) % 4;
      const up = (f.reduced ? 0 : CHEER_LIFT[fr]) + lift;
      this.shadow(cx, fy, up);
      this.upright(cx, fy - up, 0, 0, 0, fr < 2 ? 1 : -1, 0, 'up');
      if (this.shieldOn) this.bubble(cx, fy - up, f.time);
      return;
    }

    const fr = Math.floor(this.phase) % 4;
    const leaning = Math.abs(this.lean) > 0.35;
    const lean = leaning ? Math.sign(this.lean) : 0;
    this.shadow(cx, fy, lift);
    if (lift > 0) {
      // In the air: feet tucked, tail trailing straight.
      this.upright(cx, fy - lift, -1, -1, 0, -lean, lean, 'swing');
    } else {
      // Leaning into a lane change: body 1 px toward the new lane, tail swung the other way.
      const sway = leaning ? -lean * 2 : SWAY[fr];
      this.upright(cx, fy - BOB[fr], FOOT_L[fr], FOOT_R[fr], BOB[fr], sway, lean, 'swing');
    }
    if (this.shieldOn) this.bubble(cx, fy - lift, f.time);
  }

  // --- helpers -----------------------------------------------------------------------------------------------

  /** A rect at (dx, dy) from the origin. */
  private r(dx: number, dy: number, w: number, h: number, c: string): void {
    this.art!.rect(this.ox + dx, this.oy + dy, w, h, c);
  }

  /** A filled rect with a 1 px ink outline around it (draw all outlines of a shape before its fills). */
  private o(dx: number, dy: number, w: number, h: number): void {
    this.r(dx - 1, dy - 1, w + 2, h + 2, P.ink);
  }

  /** The soft floor shadow, shrinking as the beaver rises. */
  private shadow(cx: number, fy: number, lift: number): void {
    const art = this.art!;
    const rx = Math.max(4, 8 - Math.round(lift / 2));
    art.ctx.globalAlpha = 0.25;
    art.ellipse(cx, fy + 1, rx, 2, P.ink);
    art.ctx.globalAlpha = 1;
  }

  /**
   * The standing / running beaver, origin at (cx, by). Feet are drawn `bob` px lower so they stay on the floor
   * while the body bobs. footL / footR: 1 kicked back toward the viewer (sole showing), 0 planted, -1 swung forward
   * under the body. sway: tail paddle offset in px (also flicks the ribbons). shift: body and head offset (lean).
   * arms: 'swing' with the feet, 'out' flung wide (crash), 'up' (cheer). headDy drops the head (crash topple).
   */
  private upright(
    cx: number,
    by: number,
    footL: number,
    footR: number,
    bob: number,
    sway: number,
    shift: number,
    arms: 'swing' | 'out' | 'up',
    headDy = 0,
  ): void {
    this.ox = cx;
    this.oy = by;
    const s = shift;
    // Feet first: they sit below the hips, either side of the tail.
    this.foot(-7, bob, footL, -1);
    this.foot(4, bob, footR, 1);

    // Arms, behind the body so its outline tucks them in; they swing against the feet.
    if (arms === 'up') {
      this.armUp(-9 + s, -1);
      this.armUp(7 + s, 1);
    } else if (arms === 'out') {
      this.o(-11 + s, -13, 4, 2);
      this.o(7 + s, -13, 4, 2);
      this.r(-11 + s, -13, 4, 2, P.furLight);
      this.r(7 + s, -13, 4, 2, P.furLight);
      this.r(-12 + s, -14, 2, 2, P.furDark);
      this.r(10 + s, -14, 2, 2, P.furDark);
    } else {
      this.armDown(-9 + s, -footL);
      this.armDown(7 + s, -footR);
    }

    // Body: a round back, broad at the hips.
    this.o(-5 + s, -14, 10, 1);
    this.o(-6 + s, -13, 12, 9);
    this.o(-5 + s, -4, 10, 1);
    this.r(-5 + s, -14, 10, 1, P.fur);
    this.r(-6 + s, -13, 12, 9, P.fur);
    this.r(-5 + s, -4, 10, 1, P.fur);
    // shade down the right side and under the hips, highlight on the left shoulder
    this.r(4 + s, -12, 1, 8, P.furDark);
    this.r(-5 + s, -5, 10, 1, P.furDark);
    this.r(-4 + s, -13, 3, 1, P.furLight);
    this.r(-5 + s, -12, 1, 2, P.furLight);

    this.bow(s, -10, sway);
    this.head(s, headDy, sway);
    // The paddle tail, last: it is nearest the viewer and overlaps the hips and feet.
    this.tail(s, sway);
  }

  /** Apron strings across the small of the back, tied in a bow; its ends flutter with the run. y = string row. */
  private bow(dx: number, y: number, sway: number): void {
    this.r(-6 + dx, y, 12, 1, P.apron);
    // two loops either side of the knot
    this.r(-4 + dx, y - 1, 3, 1, P.apron);
    this.r(-4 + dx, y + 1, 3, 1, P.apronShade);
    this.r(1 + dx, y - 1, 3, 1, P.apron);
    this.r(1 + dx, y + 1, 3, 1, P.apronShade);
    this.r(-3 + dx, y, 1, 1, P.apronShade);
    this.r(2 + dx, y, 1, 1, P.apronShade);
    this.r(-1 + dx, y - 1, 2, 2, P.apronShade); // knot
    // ribbon ends hanging from the knot
    const flap = sway > 0 ? 1 : 0;
    this.r(-1 + dx, y + 1, 1, 2 - flap, P.apron);
    this.r(-2 + dx, y + 3 - flap, 1, 1, P.apron);
    this.r(dx, y + 1, 1, 1 + flap, P.apron);
    this.r(1 + dx, y + 2 + flap, 1, 1, P.apron);
  }

  /** The back of a round head: two ears on top, the red headband with its knot at the back, ribbons streaming. */
  private head(dx: number, dy: number, sway: number): void {
    // outline
    this.o(-5 + dx, -22 + dy, 2, 2);
    this.o(3 + dx, -22 + dy, 2, 2);
    this.o(-3 + dx, -21 + dy, 6, 1);
    this.o(-4 + dx, -20 + dy, 8, 1);
    this.o(-5 + dx, -19 + dy, 10, 4);
    this.o(-4 + dx, -15 + dy, 8, 1);
    this.o(-3 + dx, -14 + dy, 6, 1);
    // ears: dark rims, lighter inside edge
    this.r(-5 + dx, -22 + dy, 2, 2, P.furDark);
    this.r(3 + dx, -22 + dy, 2, 2, P.furDark);
    this.r(-4 + dx, -21 + dy, 1, 1, P.fur);
    this.r(3 + dx, -21 + dy, 1, 1, P.fur);
    // fur
    this.r(-3 + dx, -21 + dy, 6, 1, P.fur);
    this.r(-4 + dx, -20 + dy, 8, 1, P.fur);
    this.r(-5 + dx, -19 + dy, 10, 4, P.fur);
    this.r(-4 + dx, -15 + dy, 8, 1, P.fur);
    this.r(-3 + dx, -14 + dy, 6, 1, P.fur);
    this.r(-3 + dx, -18 + dy, 2, 1, P.furLight); // the back of the head catches the light
    this.r(-4 + dx, -17 + dy, 1, 1, P.furLight);
    this.r(4 + dx, -17 + dy, 1, 2, P.furDark);
    this.r(-3 + dx, -14 + dy, 6, 1, P.furDark);
    this.r(3 + dx, -15 + dy, 1, 1, P.furDark);
    // headband high round the crown, tied at the back: a knot with two small loops, and both ribbon ends streaming
    // off to one side in the wind, flicking over with the stride
    this.r(-4 + dx, -20 + dy, 8, 1, P.red);
    this.r(-5 + dx, -19 + dy, 10, 1, P.red);
    this.r(-1 + dx, -20 + dy, 2, 2, RED_SHADE);
    this.r(-2 + dx, -21 + dy, 1, 1, P.red);
    this.r(1 + dx, -21 + dy, 1, 1, P.red);
    const side = sway < 0 ? -1 : 1;
    const k = side > 0 ? 0 : -1; // the knot column the ribbons leave from
    this.r(dx + k + side, -18 + dy, 1, 1, P.red);
    this.r(dx + k + side * 2, -17 + dy, 1, 2, P.red);
    this.r(dx + k + side * 3, -15 + dy, 1, 1, RED_SHADE);
    this.r(dx + k, -18 + dy, 1, 2, P.red);
    this.r(dx + k + side, -16 + dy, 1, 1, RED_SHADE);
  }

  /** A foot below the hips. dx = left column; kick 1 kicks it back and out, showing the sole. side -1 left, 1 right. */
  private foot(dx: number, bob: number, kick: number, side: number): void {
    const y = bob; // undo the body bob: feet stay on the floor
    if (kick > 0) {
      const x = dx + side; // kicked out past the hip
      this.o(x, y - 1, 3, 3);
      this.r(x, y - 1, 3, 3, P.furDark);
      this.r(x, y + 1, 3, 1, P.ink); // webbed toes, sole up
      this.r(x + 1, y + 1, 1, 1, P.furDark);
    } else if (kick < 0) {
      this.o(dx, y - 4, 3, 2); // swung forward, tucked under the body
      this.r(dx, y - 4, 3, 2, P.furDark);
    } else {
      this.o(dx, y - 3, 3, 3);
      this.r(dx, y - 3, 3, 3, P.furDark);
      this.r(dx, y - 3, 3, 1, P.fur);
    }
  }

  /** An arm hanging at the side; swing -1 forward (shorter, higher), 1 back (lower). */
  private armDown(dx: number, swing: number): void {
    const top = -12 + (swing < 0 ? -1 : 0);
    const len = swing < 0 ? 4 : swing > 0 ? 6 : 5;
    this.o(dx, top, 2, len);
    this.r(dx, top, 2, len, P.furLight);
    this.r(dx, top + len - 1, 2, 1, P.furDark);
  }

  /** An arm raised beside the head (cheer). side -1 left, 1 right. */
  private armUp(dx: number, side: number): void {
    this.o(dx, -23, 2, 10);
    this.r(dx, -23, 2, 10, P.furLight);
    this.r(dx - (side < 0 ? 1 : 0), -25, 3, 2, P.furDark);
    this.r(dx - (side < 0 ? 1 : 0) - 1, -26, 5, 1, P.ink);
    this.r(dx - (side < 0 ? 1 : 0) - 1, -25, 1, 2, P.ink);
    this.r(dx - (side < 0 ? 1 : 0) + 3, -25, 1, 2, P.ink);
  }

  /**
   * The flat paddle tail, hanging from the hips and trailing toward the viewer past the feet, cross-hatched like
   * the forest and Learn beavers. dx shifts the root (lean), sway the paddle.
   */
  private tail(dx: number, sway: number): void {
    const p = dx + sway;
    const m = dx + Math.sign(sway);
    // outline
    this.o(-1 + dx, -6, 2, 2); // root
    this.o(-4 + m, -4, 8, 1);
    this.o(-5 + p, -3, 10, 5);
    this.o(-4 + p, 2, 8, 1);
    // fill
    this.r(-1 + dx, -6, 2, 2, P.furDark);
    this.r(-4 + m, -4, 8, 1, P.furDark);
    this.r(-5 + p, -3, 10, 5, P.furDark);
    this.r(-4 + p, 2, 8, 1, P.furDark);
    // cross-hatching: two sets of diagonals in the lighter fur colour, as on the forest and Learn beavers
    for (let y = -3; y <= 1; y++) {
      for (let x = -4; x <= 3; x++) {
        const a = (((x + y) % 3) + 3) % 3;
        const b = (((x - y) % 3) + 3) % 3;
        if (a === 0 || b === 0) this.r(x + p, y, 1, 1, P.fur);
      }
    }
  }

  /** Lying face down after a crash: arms and legs splayed, tail flat on the floor, ribbons limp. */
  private sprawl(cx: number, by: number): void {
    this.ox = cx;
    this.oy = by;
    // legs splayed out to the sides, soles up
    this.o(-9, -2, 3, 2);
    this.o(6, -2, 3, 2);
    this.r(-9, -2, 3, 2, P.furDark);
    this.r(6, -2, 3, 2, P.furDark);
    this.r(-9, -1, 3, 1, P.ink);
    this.r(6, -1, 3, 1, P.ink);
    // arms flung out past the head
    this.o(-10, -14, 3, 2);
    this.o(7, -14, 3, 2);
    this.r(-10, -14, 3, 2, P.furLight);
    this.r(7, -14, 3, 2, P.furLight);
    this.r(-11, -15, 2, 2, P.furDark);
    this.r(9, -15, 2, 2, P.furDark);
    // body, flatter and wider than standing
    this.o(-6, -12, 12, 1);
    this.o(-7, -11, 14, 8);
    this.o(-6, -3, 12, 1);
    this.r(-6, -12, 12, 1, P.fur);
    this.r(-7, -11, 14, 8, P.fur);
    this.r(-6, -3, 12, 1, P.fur);
    this.r(5, -10, 1, 7, P.furDark);
    this.r(-6, -4, 12, 1, P.furDark);
    this.r(-5, -11, 4, 1, P.furLight);
    this.bow(0, -8, 0);
    // head face down on the floor, sunk onto the shoulders
    this.head(0, 5, 0);
    this.tail(0, 0);
  }

  /** Dizzy stars wheeling over the head, at a chunky 6 fps. */
  private stars(cx: number, y: number, time: number): void {
    const step = Math.floor(time * 6);
    for (let i = 0; i < 3; i++) {
      const a = ((step + i * 4) % 12) * (Math.PI / 6);
      const sx = Math.round(cx + Math.cos(a) * 7);
      const sy = Math.round(y + Math.sin(a) * 2);
      const art = this.art!;
      art.rect(sx, sy - 1, 1, 3, STAR);
      art.rect(sx - 1, sy, 3, 1, STAR);
      if ((step + i) % 2 === 0) art.rect(sx, sy, 1, 1, P.white);
    }
  }

  /** The PRISM shield: a dotted light-blue bubble whose dashes crawl round, with a glint sliding over it. */
  private bubble(cx: number, fy: number, time: number): void {
    const art = this.art!;
    const ey = fy - 10;
    const rx = 12;
    const ry = 14;
    const N = 40;
    const march = Math.floor(time * 8);
    for (let i = 0; i < N; i++) {
      if ((i + march) % 4 === 3) continue;
      const a = (i / N) * Math.PI * 2;
      art.rect(Math.round(cx + Math.cos(a) * rx), Math.round(ey + Math.sin(a) * ry), 1, 1, SHIELD);
    }
    // the glint: three bright dots on the rim, travelling round
    const g = Math.floor(time * 6) % N;
    for (let k = 0; k < 3; k++) {
      const a = ((g + k) / N) * Math.PI * 2;
      art.rect(Math.round(cx + Math.cos(a) * rx), Math.round(ey + Math.sin(a) * ry), 1, 1, SHIELD_LIGHT);
    }
    // a fixed shine on the upper left of the bubble
    art.rect(cx - 8, ey - 9, 2, 1, SHIELD_LIGHT);
    art.rect(cx - 9, ey - 8, 1, 2, SHIELD_LIGHT);
  }
}
