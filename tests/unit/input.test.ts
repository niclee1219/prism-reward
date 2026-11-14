import { describe, expect, it } from 'vitest';
import { SwipeTracker } from '../../src/game/input';

describe('SwipeTracker: one gesture, at most one lane', () => {
  it('a long flick fires exactly once', () => {
    const s = new SwipeTracker(30);
    s.down(100, 300);
    const fired = [110, 135, 170, 220, 300].map((x) => s.move(x, 302)).filter(Boolean);
    expect(fired).toEqual([1]);
    expect(s.up(300, 302, 200)).toBeNull(); // a swipe is not also a tap
  });
  it('a new gesture can fire again, in either direction', () => {
    const s = new SwipeTracker(30);
    s.down(200, 300);
    expect(s.move(160, 300)).toBe(-1);
    s.up(160, 300, 200);
    s.down(200, 300);
    expect(s.move(240, 300)).toBe(1);
  });
  it('mostly vertical drags and short wiggles do nothing', () => {
    const s = new SwipeTracker(30);
    s.down(100, 300);
    expect(s.move(135, 360)).toBeNull();
    expect(s.move(120, 300)).toBeNull();
  });
  it('a tap moves toward the tapped half', () => {
    const s = new SwipeTracker(30);
    s.down(50, 300);
    expect(s.up(52, 301, 200)).toBe(-1);
    s.down(350, 300);
    expect(s.up(350, 300, 200)).toBe(1);
  });
});
