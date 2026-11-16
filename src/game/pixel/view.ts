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

/**
 * CSS px the question panel can take at the bottom of the stage (its 8 px bottom gap, the question, the cards and
 * the arrows on top of them), measured in the browser with every question in questions.json. Narrow stages wrap
 * the words onto more lines, so the room grows as the stage gets narrower: the tallest panel is 202 px at 439 px
 * wide, 226 px at 361 and 267 px at 291, and this line sits on or above all of them. PANEL_CLEAR is the gap kept
 * between the arrows and the beaver. Re-measure if the questions or the panel's CSS change.
 */
const PANEL_AT_390 = 224;
const PANEL_PER_PX = 0.44;
const PANEL_MIN = 181;
const PANEL_CLEAR = 6;
/** The beaver's lowest pixel (the tail and a kicked-back foot) is this many art px below the feet row, plus one. */
const BELOW_FEET = 4;
/** Spawned things start this many art px above the top edge (taller than any sprite). */
const SPAWN_ABOVE = 24;
/** The feet never sit higher than this fraction of the way down the screen. */
const MIN_FEET = 0.3;

export function makeView(stageW: number, stageH: number, px: number): View {
  const w = Math.ceil(stageW / px);
  const h = Math.ceil(stageH / px);
  const offX = (w * px - stageW) / 2;
  const offY = (h * px - stageH) / 2;
  const laneW = Math.round((0.8 * w) / 3);
  const roadX = Math.round((w - 3 * laneW) / 2);
  // About 62% down, but never so low that the bottom panel would reach the beaver's tail. On a stage too short for
  // the panel (a tiny desktop window) keep the feet at least 30% down anyway, so the depth scale stays positive.
  const lowest = Math.floor((stageH - panelRoom(stageW) + offY) / px) - BELOW_FEET;
  const playerY = Math.max(Math.min(Math.round(h * 0.62), lowest), Math.round(h * MIN_FEET), 1);
  const unitsPerPx = WORLD.SPAWN_DIST / (playerY + SPAWN_ABOVE);
  return { w, h, px, offX, offY, roadX, laneW, playerY, unitsPerPx };
}

/** CSS px kept clear at the bottom of a stage this wide for the question panel, so it never touches the beaver. */
export function panelRoom(stageW: number): number {
  return Math.ceil(Math.max(PANEL_MIN, PANEL_AT_390 + (390 - stageW) * PANEL_PER_PX)) + PANEL_CLEAR;
}

/** Centre x of a (possibly fractional) lane, whole art px. */
export function laneX(v: View, lane: number): number {
  return Math.round(v.roadX + (lane + 0.5) * v.laneW);
}

/** Ground y at depth d (sim units ahead of the beaver), whole art px. */
export function depthY(v: View, d: number): number {
  return Math.round(v.playerY - d / v.unitsPerPx);
}

/**
 * How far the floor has scrolled, in whole art px, after `travelled` sim units. The street and the things on it
 * both round the distance this one way, so a prop and the tiles under it step on the same frame.
 */
export function scrollPx(v: View, travelled: number): number {
  return Math.round(travelled / v.unitsPerPx);
}

/**
 * Ground y of a thing d units ahead after `travelled` units, whole art px. Its spot on the floor is rounded once
 * and the scroll is added on top, so it moves with the floor; depthY can step a frame early or late against it.
 */
export function floorY(v: View, d: number, travelled: number): number {
  return v.playerY + scrollPx(v, travelled) - Math.round((d + travelled) / v.unitsPerPx);
}

/** Art px to stage CSS px (for pop-ups and HUD hooks). */
export function toStage(v: View, x: number, y: number): { x: number; y: number } {
  return { x: x * v.px - v.offX, y: y * v.px - v.offY };
}
