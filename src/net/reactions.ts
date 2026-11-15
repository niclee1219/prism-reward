// Live reactions: phones send them, the /leaderboard screen shows them.
import { NET } from '../config';
import { api } from './api';
import { deviceId } from './device';

export type ReactionKind = 'confetti' | 'heart' | 'like' | 'fire' | 'penguin' | 'party';

/** Emoji for each kind. 'confetti' has its own button, so it is not in EMOJI_KINDS. */
export const REACTION_EMOJI: Record<ReactionKind, string> = {
  confetti: '🎊',
  heart: '❤️',
  like: '👍',
  fire: '🔥',
  penguin: '🐧',
  party: '🎉',
};
export const EMOJI_KINDS: ReactionKind[] = ['heart', 'like', 'fire', 'penguin', 'party'];

export interface ReactionsResult {
  latest: number;
  items: { id: number; kind: ReactionKind }[];
}

let lastSent = 0;
/** Fire and forget. Taps closer together than the throttle still animate locally but are not sent. */
export function sendReaction(kind: ReactionKind): void {
  const now = performance.now();
  if (now - lastSent < NET.REACTION_GAP_MS) return;
  lastSent = now;
  void api('/reactions', { body: { device_id: deviceId(), kind } }).catch(() => {});
}
