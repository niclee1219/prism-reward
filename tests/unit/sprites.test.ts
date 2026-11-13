import { describe, expect, it } from 'vitest';
import { PALETTE, SPRITES } from '../../src/game/art/sprites';

describe('sprites', () => {
  it.each(Object.entries(SPRITES))('%s has even rows and known colours', (_name, s) => {
    const w = s.rows[0].length;
    for (const row of s.rows) {
      expect(row.length).toBe(w);
      for (const ch of row) expect(ch === '.' || ch in PALETTE).toBe(true);
    }
  });
});
