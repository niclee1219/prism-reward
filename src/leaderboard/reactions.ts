// Turns the reactions that arrived since the last poll into a bounded show for the big screen.
import type { ReactionKind } from '../net/reactions';

/** Most confetti bursts and emoji one poll is allowed to put on screen, so a flood cannot bury the board. */
export const MAX_BURSTS = 3;
export const MAX_EMOJI = 24;

export interface ReactionPlan {
  /** Number of confetti bursts to fire (each is one cannon volley). */
  bursts: number;
  /** Emoji kinds to float up, in arrival order. */
  emoji: Exclude<ReactionKind, 'confetti'>[];
}

export function planReactions(items: { kind: ReactionKind }[]): ReactionPlan {
  let bursts = 0;
  const emoji: ReactionPlan['emoji'] = [];
  for (const { kind } of items) {
    if (kind === 'confetti') bursts++;
    else emoji.push(kind);
  }
  return { bursts: Math.min(bursts, MAX_BURSTS), emoji: emoji.slice(-MAX_EMOJI) };
}
