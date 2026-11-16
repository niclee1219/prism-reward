// `/leaderboard?demo` runs the screen against a fake board so it can be previewed without a backend.
// Space adds a player, K adds a player who takes the crown, J lets a top-10 player beat their score,
// L adds a run that misses the top 10, R resets the board.
import { suggestNickname } from '../content/nicknames';
import type { LeaderboardResult, RecentRun } from '../net/api';

const DISHES = ['chicken-rice', 'char-kway-teow', 'laksa'];

interface Player {
  key: string;
  nickname: string;
  score: number;
  at: number;
  dish: string;
  served: boolean;
}
interface Run {
  id: string;
  key: string;
  score: number;
  first: boolean;
}

export interface Demo {
  fetch: () => Promise<LeaderboardResult>;
  add: (king?: boolean) => void;
  improve: () => void;
  miss: () => void;
  reset: () => void;
}

export function createDemo(): Demo {
  let players: Player[] = [];
  let runs: Run[] = [];
  let seq = 0;

  const sort = () => players.sort((a, b) => b.score - a.score || a.at - b.at);
  const record = (p: Player, score: number, first: boolean): void => {
    runs.push({ id: `run-${seq++}`, key: p.key, score, first });
    if (score > p.score) p.score = score;
    sort();
  };

  const add = (king = false): void => {
    const top = Math.max(0, ...players.map((p) => p.score));
    const score = king ? Math.round(top * 1.08 + 120 + Math.random() * 400) : Math.round(600 + Math.random() * 5200);
    const p: Player = { key: `demo-${seq++}`, nickname: suggestNickname(), score: 0, at: seq, dish: DISHES[seq % 3], served: Math.random() < 0.4 };
    players.push(p);
    record(p, score, true);
  };

  /** A top-10 player (not the king) plays again and beats their score: usually a climb. */
  const improve = (): void => {
    const pool = players.slice(1, 10);
    if (!pool.length) return add();
    const p = pool[(Math.random() * pool.length) | 0];
    const above = players[Math.max(0, players.indexOf(p) - 1 - ((Math.random() * 3) | 0))];
    record(p, Math.max(p.score + 40, above.score + 10 + Math.round(Math.random() * 60)), false);
  };

  /** A run that stays out of the top 10 (a new player, or a returning one who does not improve). */
  const miss = (): void => {
    if (players.length < 10) return add();
    const cutoff = players[9].score;
    const again = players.length > 10 && Math.random() < 0.35;
    if (again) {
      const p = players[10 + ((Math.random() * (players.length - 10)) | 0)];
      return record(p, Math.max(50, Math.round(p.score * (0.7 + Math.random() * 0.25))), false);
    }
    const p: Player = { key: `demo-${seq++}`, nickname: suggestNickname(), score: 0, at: seq, dish: DISHES[seq % 3], served: false };
    players.push(p);
    record(p, Math.max(50, Math.round(cutoff * (0.4 + Math.random() * 0.55))), true);
  };

  // A scripted opening: empty board, then a first entry, then a mix of entries, climbs, misses and kings.
  setTimeout(() => add(), 4000);
  let n = 0;
  setInterval(() => {
    if (players.length === 0) return;
    n++;
    if (n % 7 === 0) add(true);
    else if (n % 3 === 0) improve();
    else if (players.length >= 10 && n % 2 === 0) miss();
    else add();
  }, 7000);

  return {
    add,
    improve,
    miss,
    reset: () => ((players = []), (runs = [])),
    fetch: async () => {
      const rankOf = new Map(players.map((p, i) => [p.key, i + 1]));
      const byKey = new Map(players.map((p) => [p.key, p]));
      const recent: RecentRun[] = runs
        .slice(-8)
        .reverse()
        .map((r) => {
          const p = byKey.get(r.key)!;
          return { id: r.id, key: r.key, nickname: p.nickname, run_score: r.score, score: p.score, rank: rankOf.get(r.key)!, best: r.score >= p.score, first: r.first, dish: p.dish };
        });
      return {
        top: players.slice(0, 10).map((p, i) => ({ rank: i + 1, key: p.key, nickname: p.nickname, score: p.score, dish: p.dish, served: p.served })),
        recent,
        total_players: players.length,
        total_plays: runs.length,
        me: null,
        vote_bonus_enabled: false,
      };
    },
  };
}
