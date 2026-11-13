import Phaser from 'phaser';
import { VIEW } from '../../config';
import { PALETTE, SPRITES } from './sprites';

export const ATLAS = 'atlas';
export const FLOOR = 'floor';
export const SIDE = 'side';

/** Bakes every sprite grid into a single canvas texture with named frames. */
export function buildAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS)) return;
  const entries = Object.entries(SPRITES);
  const pad = 2;
  let width = pad;
  let height = 0;
  for (const [, s] of entries) {
    width += s.rows[0].length * s.scale + pad;
    height = Math.max(height, s.rows.length * s.scale);
  }
  const tex = scene.textures.createCanvas(ATLAS, width, height + pad * 2)!;
  const ctx = tex.getContext();
  let x = pad;
  for (const [name, s] of entries) {
    const w = s.rows[0].length * s.scale;
    const h = s.rows.length * s.scale;
    s.rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const c = PALETTE[row[rx]];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x + rx * s.scale, pad + ry * s.scale, s.scale, s.scale);
      }
    });
    tex.add(name, 0, x, pad, w, h);
    x += w + pad;
  }
  tex.refresh();

  // Floor tile: hawker-centre terrazzo with grout lines and a few speckles.
  const T = 24;
  const floor = scene.textures.createCanvas(FLOOR, T, T)!;
  const f = floor.getContext();
  f.fillStyle = '#d9d2c3';
  f.fillRect(0, 0, T, T);
  f.fillStyle = '#c2baa8';
  f.fillRect(0, T - 1, T, 1);
  f.fillRect(T - 1, 0, 1, T);
  const speck: [number, number, string][] = [
    [3, 4, '#bfb6a3'], [9, 15, '#e8e2d6'], [16, 6, '#bfb6a3'], [19, 18, '#e8e2d6'], [6, 20, '#cdb9a0'], [13, 10, '#e8e2d6'],
  ];
  for (const [sx, sy, c] of speck) {
    f.fillStyle = c;
    f.fillRect(sx, sy, 1, 1);
  }
  floor.refresh();

  // Side strip: a row of stall fronts with striped awnings, tiled vertically.
  const W = VIEW.SIDE;
  const H = 96;
  const side = scene.textures.createCanvas(SIDE, W, H)!;
  const s = side.getContext();
  const awnings = ['#e63946', '#2a9d8f', '#f4a261'];
  for (let i = 0; i < 3; i++) {
    const y0 = i * 32;
    s.fillStyle = '#1b1b2f';
    s.fillRect(0, y0, W, 32);
    s.fillStyle = '#3d405b';
    s.fillRect(1, y0 + 1, W - 2, 30);
    for (let y = 2; y < 30; y += 4) {
      s.fillStyle = (y / 4) % 2 < 1 ? awnings[i] : '#fff6e0';
      s.fillRect(2, y0 + y, W - 4, 4);
    }
    s.fillStyle = '#ffd166';
    s.fillRect(5, y0 + 12, W - 10, 8);
    s.fillStyle = '#1b1b2f';
    s.fillRect(7, y0 + 14, W - 14, 1);
    s.fillRect(7, y0 + 17, W - 14, 1);
  }
  side.refresh();
}
