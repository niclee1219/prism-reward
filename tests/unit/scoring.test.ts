import { describe, expect, it } from 'vitest';
import { implausibleReason, maxPlausibleScore, multiplierFor, speedFactorAt, SCORING } from '../../supabase/functions/_shared/scoring';
import { ScoreKeeper } from '../../src/game/scoring';
import { gateInterval, obstacleInterval, tierAt } from '../../src/game/difficulty';

describe('scoring', () => {
  it('multiplier is min(1 + floor(streak / 2), 5)', () => {
    expect([0, 1, 2, 3, 4, 7, 8, 20].map(multiplierFor)).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
  });
  it('wrong answers reset the streak and earn nothing', () => {
    const s = new ScoreKeeper();
    expect(s.answer(true)).toBe(100);
    expect(s.answer(true)).toBe(200);
    expect(s.answer(false)).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.answer(true)).toBe(100);
    expect([s.correct, s.wrong, s.gates]).toEqual([3, 1, 4]);
  });
  it('a perfect, always-boosted simulated run stays under the server cap', () => {
    for (const seconds of [5, 30, 90, 150, 180]) {
      const s = new ScoreKeeper();
      let nextGate = 3;
      for (let t = 0; t < seconds; t += 1 / 60) {
        s.addDistance(1 / 60, speedFactorAt(t) * SCORING.BOOST_FACTOR);
        if (t >= nextGate) {
          s.answer(true);
          nextGate += gateInterval(t);
        }
      }
      const payload = { score: s.score, correct: s.correct, wrong: 0, gates: s.gates, duration_ms: seconds * 1000 };
      expect(implausibleReason(payload)).toBeNull();
    }
  });
  it('rejects impossible runs', () => {
    expect(implausibleReason({ score: 999999, correct: 5, wrong: 0, gates: 5, duration_ms: 30000 })).toBe('score_too_high');
    expect(implausibleReason({ score: 10, correct: 0, wrong: 0, gates: 0, duration_ms: 200000 })).toBe('too_long');
    expect(implausibleReason({ score: 10, correct: 30, wrong: 0, gates: 30, duration_ms: 10000 })).toBe('too_many_gates');
    expect(implausibleReason({ score: 10, correct: 4, wrong: 4, gates: 5, duration_ms: 60000 })).toBe('bad_counts');
    expect(implausibleReason({ score: -1, correct: 0, wrong: 0, gates: 0, duration_ms: 1000 })).toBe('bad_numbers');
    expect(maxPlausibleScore(0, 0)).toBeLessThan(100);
  });
});

describe('difficulty', () => {
  it('ramps', () => {
    expect(gateInterval(0)).toBe(6);
    expect(gateInterval(500)).toBe(4);
    expect(obstacleInterval(0)).toBeGreaterThan(obstacleInterval(150));
    expect(obstacleInterval(150)).toBeGreaterThan(obstacleInterval(175));
    expect([tierAt(0), tierAt(40), tierAt(100)]).toEqual([1, 2, 3]);
  });
});
