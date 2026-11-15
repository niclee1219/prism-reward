import { describe, expect, it } from 'vitest';
import { MAX_BURSTS, MAX_EMOJI, planReactions } from '../../src/leaderboard/reactions';
import { REACTION_KINDS } from '../../supabase/functions/_shared/router';
import { REACTION_EMOJI } from '../../src/net/reactions';

describe('planReactions', () => {
  it('splits confetti from emoji', () => {
    const p = planReactions([{ kind: 'heart' }, { kind: 'confetti' }, { kind: 'fire' }]);
    expect(p.bursts).toBe(1);
    expect(p.emoji).toEqual(['heart', 'fire']);
  });

  it('caps a flood so the board stays readable', () => {
    const flood = Array.from({ length: 200 }, (_, i) => ({ kind: (i % 2 ? 'confetti' : 'penguin') as 'confetti' | 'penguin' }));
    const p = planReactions(flood);
    expect(p.bursts).toBe(MAX_BURSTS);
    expect(p.emoji).toHaveLength(MAX_EMOJI);
  });

  it('does nothing for no reactions', () => {
    expect(planReactions([])).toEqual({ bursts: 0, emoji: [] });
  });
});

describe('reaction kinds', () => {
  it('the phone and the server agree on every kind', () => {
    expect(Object.keys(REACTION_EMOJI).sort()).toEqual([...REACTION_KINDS].map(String).sort());
  });
});
