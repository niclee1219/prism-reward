// Where things go on the pixel-art street: pure maths, no drawing and no DOM, so it is unit tested.
// The art is the stage divided into VIEW.PIXEL_SIZE squares; the three lanes run straight up the middle 80% of
// it (exactly under the answer cards, whose row has 10% side margins) and depth maps linearly to height.
import { WORLD } from '../../config';

export interface View {
  /** Art size in art pixels. */
  w: number;
  h: number;
  /** CSS px per art pixel. */
  px: number;
  /** CSS px the canvas overhangs the stage's left / top edge (under one art pixel, the stage clips it). */
  offX: number;
  offY: number;
  /** Left edge of lane 0 and the lane width, in art px (3 lanes = 80% of w, centred). */
  roadX: number;
  laneW: number;
  /** Art y of the beaver's feet (depth 0). */
  playerY: number;
  /** Sim units per art pixel; WORLD.SPAWN_DIST maps to y <= -24 so things scroll in and never pop in. */
  unitsPerPx: number;
}

/** The question panel at the bottom needs this many CSS px under the beaver's feet on the shortest stage. */
const PANEL_ROOM = 200;
/** Spawned things start this many art px above the top edge (taller than any sprite). */
const SPAWN_ABOVE = 24;

export function makeView(stageW: number, stageH: number, px: number): View {
  const w = Math.ceil(stageW / px);
  const h = Math.ceil(stageH / px);
  const offX = (w * px - stageW) / 2;
  const offY = (h * px - stageH) / 2;
  const laneW = Math.round((0.8 * w) / 3);
  const roadX = Math.round((w - 3 * laneW) / 2);
  // About 62% down, but never so low that the bottom panel would reach the feet.
  const lowest = Math.floor((stageH - PANEL_ROOM + offY) / px);
  const playerY = Math.min(Math.round(h * 0.62), lowest);
  const unitsPerPx = WORLD.SPAWN_DIST / (playerY + SPAWN_ABOVE);
  return { w, h, px, offX, offY, roadX, laneW, playerY, unitsPerPx };
}

/** Centre x of a (possibly fractional) lane, whole art px. */
export function laneX(v: View, lane: number): number {
  return Math.round(v.roadX + (lane + 0.5) * v.laneW);
}

/** Ground y at depth d (sim units ahead of the beaver), whole art px. */
export function depthY(v: View, d: number): number {
  return Math.round(v.playerY - d / v.unitsPerPx);
}

/** Art px to stage CSS px (for pop-ups and HUD hooks). */
export function toStage(v: View, x: number, y: number): { x: number; y: number } {
  return { x: x * v.px - v.offX, y: y * v.px - v.offY };
}
