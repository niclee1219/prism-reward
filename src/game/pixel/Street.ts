// The scrolling hawker-centre floor and the scenery strips at both sides.
// PLACEHOLDER (Task 1): flat tiles, a grout grid that scrolls with the run, lane dividers and plain side strips.
// Task 2 replaces the body; keep the exported signature.
import { P, TILE } from './palette';
import type { Frame } from './types';

const TILE_PX = 8;

export class Street {
  reset(): void {}

  draw(f: Frame): void {
    const { art, view: v, sim } = f;
    const { rect } = art;
    rect(0, 0, v.w, v.h, TILE.base);
    // The floor is fixed to the world, so it moves down by one art px per unitsPerPx travelled.
    const scroll = Math.floor(sim.travelled / v.unitsPerPx);
    const off = (((v.playerY + scroll) % TILE_PX) + TILE_PX) % TILE_PX;
    for (let y = off - TILE_PX; y < v.h; y += TILE_PX) rect(0, y, v.w, 1, TILE.line);
    for (let x = v.roadX; x < v.roadX + 3 * v.laneW; x += TILE_PX) rect(x, 0, 1, v.h, TILE.line);
    // Faint dashed lane dividers.
    for (let l = 1; l < 3; l++) {
      const x = v.roadX + l * v.laneW;
      for (let y = off - TILE_PX; y < v.h; y += TILE_PX) rect(x, y + 2, 1, 4, TILE.shade);
    }
    // Scenery strips (never inside the lanes).
    const right = v.roadX + 3 * v.laneW;
    rect(0, 0, v.roadX, v.h, P.lowWall);
    rect(right, 0, v.w - right, v.h, P.lowWall);
    rect(v.roadX - 1, 0, 1, v.h, P.woodDark);
    rect(right, 0, 1, v.h, P.woodDark);
    for (let y = off - TILE_PX * 2; y < v.h; y += TILE_PX * 4) {
      rect(1, y, v.roadX - 3, 5, P.wood);
      rect(right + 2, y + TILE_PX * 2, v.w - right - 3, 5, P.wood);
    }
  }
}
