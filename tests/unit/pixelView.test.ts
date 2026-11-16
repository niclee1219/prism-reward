import { describe, expect, it } from 'vitest';
import { WORLD } from '../../src/config';
import { depthY, floorY, laneX, makeView, panelRoom, scrollPx, toStage } from '../../src/game/pixel/view';

const STAGES: [number, number][] = [
  [320, 496],
  [320, 500],
  [356, 553],
  [360, 560],
  [390, 605],
  [390, 780],
  [390, 877],
  [430, 932],
  [430, 967],
];
const SIZES = [3, 4, 5];
/** Art px from the ground row up to the top of the tallest floor sprite (the hawker uncle's head outline). */
const TALLEST_SPRITE = 24;

describe('pixel view', () => {
  for (const [sw, sh] of STAGES) {
    for (const px of SIZES) {
      describe(`${sw}x${sh} at ${px} px`, () => {
        const v = makeView(sw, sh, px);

        it('art size covers the stage, overhang under one art pixel', () => {
          expect(v.w).toBe(Math.ceil(sw / px));
          expect(v.h).toBe(Math.ceil(sh / px));
          expect(v.px).toBe(px);
          expect(v.offX).toBeGreaterThanOrEqual(0);
          expect(v.offX).toBeLessThan(px);
          expect(v.offY).toBeGreaterThanOrEqual(0);
          expect(v.offY).toBeLessThan(px);
        });

        it('three lanes take the middle 80%, evenly spaced and on screen', () => {
          expect(Math.abs(v.laneW * 3 - Math.round(0.8 * v.w))).toBeLessThanOrEqual(1);
          expect(Math.abs(v.roadX + 1.5 * v.laneW - v.w / 2)).toBeLessThanOrEqual(1);
          const xs = [0, 1, 2].map((l) => laneX(v, l));
          expect(Math.abs(xs[1] - xs[0] - (xs[2] - xs[1]))).toBeLessThanOrEqual(1);
          for (const x of xs) {
            expect(Number.isInteger(x)).toBe(true);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(v.w);
          }
          expect(Number.isInteger(laneX(v, 0.37))).toBe(true);
        });

        it('depth 0 is the beaver row, spawn is off the top, deeper is higher', () => {
          expect(depthY(v, 0)).toBe(v.playerY);
          expect(depthY(v, WORLD.SPAWN_DIST)).toBeLessThanOrEqual(-24);
          expect(depthY(v, WORLD.DESPAWN_DIST)).toBeGreaterThan(v.playerY);
          // passed things leave the bottom of the screen before the sim removes them, the tallest one's top included
          expect(depthY(v, WORLD.DESPAWN_DIST) - TALLEST_SPRITE).toBeGreaterThanOrEqual(v.h);
          for (let d = WORLD.DESPAWN_DIST; d < WORLD.SPAWN_DIST; d += 10) {
            const y = depthY(v, d);
            expect(Number.isInteger(y)).toBe(true);
            expect(depthY(v, d + 10)).toBeLessThan(y);
          }
        });

        it('things on the floor step on the same frames as the floor', () => {
          for (const at of [300, 517.3, 1000.9]) {
            let prevFloor = scrollPx(v, 0);
            let prevY = floorY(v, at, 0);
            for (let t = 0.37; t < 1500; t += 0.37) {
              const y = floorY(v, at - t, t);
              const floor = scrollPx(v, t);
              expect(Number.isInteger(y)).toBe(true);
              expect(y - prevY).toBe(floor - prevFloor);
              // and never more than a pixel from the plain depth mapping
              expect(Math.abs(y - depthY(v, at - t))).toBeLessThanOrEqual(1);
              prevFloor = floor;
              prevY = y;
            }
          }
        });

        it('art pixels map to stage CSS px', () => {
          for (const [x, y] of [[0, 0], [10, 20], [v.w - 1, v.h - 1]]) {
            expect(toStage(v, x, y)).toEqual({ x: x * px - v.offX, y: y * px - v.offY });
          }
        });
      });
    }
  }

  it('keeps every number finite and depth decreasing on a tiny stage', () => {
    for (const px of SIZES) {
      const v = makeView(200, 150, px);
      for (const n of [v.w, v.h, v.playerY, v.unitsPerPx, v.roadX, v.laneW]) expect(Number.isFinite(n)).toBe(true);
      expect(v.playerY).toBeGreaterThan(0);
      expect(v.playerY).toBeLessThan(v.h);
      expect(v.unitsPerPx).toBeGreaterThan(0);
      // one step of a whole art pixel's worth of depth always moves up the screen
      const step = Math.ceil(v.unitsPerPx);
      for (let d = WORLD.DESPAWN_DIST; d < WORLD.SPAWN_DIST; d += step) {
        expect(Number.isFinite(depthY(v, d))).toBe(true);
        expect(depthY(v, d + step)).toBeLessThan(depthY(v, d));
      }
    }
  });

  // The tallest question panel (8 px bottom gap + question + cards + the arrows above them), in CSS px, over every
  // question in questions.json, measured in the browser: [narrowest stage width it holds for, height]. Narrower
  // stages wrap the words onto more lines. Re-measure if the questions or the panel's CSS change.
  const TALLEST_PANEL: [number, number][] = [
    [280, 267],
    [292, 247],
    [312, 243],
    [335, 226],
    [362, 206],
    [367, 202],
    [440, 181],
  ];
  const tallestPanel = (w: number) => TALLEST_PANEL.filter(([from]) => w >= from).at(-1)![1];

  it('reserves at least the tallest measured panel at every stage width', () => {
    for (let w = 280; w <= 600; w++) expect(panelRoom(w)).toBeGreaterThan(tallestPanel(w));
    // and does not just reserve one big number: wide stages keep more road than narrow ones
    expect(panelRoom(430)).toBeLessThan(panelRoom(320));
  });

  it('keeps the whole beaver, tail included, above the question panel on short and tall phones', () => {
    const phones: [number, number][] = [
      [320, 500],
      [356, 553],
      [360, 560],
      [360, 640],
      [375, 667],
      [390, 605],
      [390, 780],
      [390, 844],
      [430, 932],
    ];
    for (const [sw, sh] of phones) {
      for (const px of SIZES) {
        const v = makeView(sw, sh, px);
        // the tail's outline is the lowest beaver pixel, on the row 3 art px under the feet
        const beaverBottom = toStage(v, 0, v.playerY + 4).y;
        expect(beaverBottom, `${sw}x${sh} at ${px} px`).toBeLessThanOrEqual(sh - tallestPanel(sw));
        expect(v.playerY).toBeGreaterThanOrEqual(Math.round(v.h * 0.3));
      }
    }
  });
});
