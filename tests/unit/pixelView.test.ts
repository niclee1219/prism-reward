import { describe, expect, it } from 'vitest';
import { WORLD } from '../../src/config';
import { depthY, laneX, makeView, toStage } from '../../src/game/pixel/view';

const STAGES: [number, number][] = [
  [390, 605],
  [390, 780],
  [430, 932],
];
const SIZES = [3, 4, 5];

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
          for (let d = WORLD.DESPAWN_DIST; d < WORLD.SPAWN_DIST; d += 10) {
            const y = depthY(v, d);
            expect(Number.isInteger(y)).toBe(true);
            expect(depthY(v, d + 10)).toBeLessThan(y);
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

  it('leaves room for the question panel under the beaver on the shortest stage', () => {
    for (const px of SIZES) {
      const v = makeView(390, 605, px);
      expect(605 - toStage(v, 0, v.playerY).y).toBeGreaterThanOrEqual(200);
    }
  });
});
