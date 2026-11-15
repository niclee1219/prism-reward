// `/leaderboard?demo` runs the screen against a fake board so it can be previewed without a backend.
// Space adds a player, K adds a player who takes the crown, R resets the board.
import { suggestNickname } from '../content/nicknames';
import type { LeaderboardResult } from '../net/api';

const DISHES = ['chicken-rice', 'char-kway-teow', 'laksa'];

export function createDemo(): { fetch: () => Promise<LeaderboardResult>; add: (king?: boolean) => void; reset: () => void } {
  let players: { key: string; nickname: string; score: number; dish: string; served: boolean }[] = [];
  let plays = 0;
  let seq = 0;

  const add = (king = false): void => {
    plays++;
    const top = Math.max(0, ...players.map((p) => p.score));
    const score = king ? Math.round(top * 1.08 + 120 + Math.random() * 400) : Math.round(600 + Math.random() * 5200);
    players.push({ key: `demo-${seq++}`, nickname: suggestNickname(), score, dish: DISHES[seq % 3], served: Math.random() < 0.4 });
    players.sort((a, b) => b.score - a.score);
  };

  // A scripted opening: empty board, then a first entry, then a trickle, with a king change now and then.
  setTimeout(() => add(), 4000);
  let n = 0;
  setInterval(() => {
    if (players.length === 0) return;
    n++;
    add(n % 5 === 0);
  }, 7000);
  // Pad the plays counter between entries, like runs that did not make the cut.
  setInterval(() => players.length && plays++, 2500);

  return {
    add,
    reset: () => ((players = []), (plays = 0)),
    fetch: async () => ({
      top: players.slice(0, 10).map((p, i) => ({ rank: i + 1, ...p })),
      total_players: players.length,
      total_plays: plays,
      me: null,
      vote_bonus_enabled: false,
    }),
  };
}
