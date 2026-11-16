// Pure logic for the /leaderboard hype screen: compare two snapshots and say what is worth a show.
import type { RecentRun } from '../net/api';

export interface Entry {
  key: string;
  rank: number;
  nickname: string;
  score: number;
  dish?: string | null;
  served?: boolean;
}

export type BoardEvent =
  /** The board was empty and someone just got on it. */
  | { type: 'first'; entry: Entry }
  /** Someone took #1 from somebody else (a brand new player, or a climber). */
  | { type: 'king'; entry: Entry; previous: Entry | null; isNew: boolean }
  /** A player appeared in the top 10 who was not there before. */
  | { type: 'entry'; entry: Entry; bumped: Entry | null }
  /** A player already in the top 10 beat their score and moved up (not to #1: that is 'king'). */
  | { type: 'climb'; entry: Entry; from: number; gain: number; passed: Entry[] }
  /** A player already in the top 10 beat their score but kept their rank (the king raising the bar, too). */
  | { type: 'record'; entry: Entry; gain: number }
  /** A finished run that did not change who is in the top 10: outside the board, or no improvement. */
  | { type: 'run'; entry: Entry; run: RecentRun };

export const TOP_N = 10;

/** Drama order: smallest moments first, the new king last. Also used to decide what to drop when busy. */
export function weight(e: BoardEvent): number {
  switch (e.type) {
    case 'run':
      return 0;
    case 'record':
      return 100 - e.entry.rank;
    case 'climb':
      return 500 - e.entry.rank;
    case 'entry':
      return 1000 - e.entry.rank;
    case 'first':
      return 2000;
    case 'king':
      return 3000;
  }
}

/**
 * `prev` is null before the first successful poll: nothing is announced for scores that were
 * already there when the screen was opened. Events come back ordered for drama: lowest rank first,
 * the new king last.
 */
export function diffBoard(prev: Entry[] | null, next: Entry[]): BoardEvent[] {
  if (prev === null) return [];
  const before = new Map(prev.map((e) => [e.key, e]));
  const events: BoardEvent[] = [];
  const oldKing = prev[0] ?? null;

  for (const entry of next) {
    const old = before.get(entry.key);
    const isNew = !old;
    if (entry.rank === 1) {
      if (prev.length === 0) events.push({ type: 'first', entry });
      else if (oldKing && oldKing.key !== entry.key) events.push({ type: 'king', entry, previous: oldKing, isNew });
      else if (old && entry.score > old.score) events.push({ type: 'record', entry, gain: entry.score - old.score });
      continue;
    }
    if (!old) {
      // Whoever sat at the entrant's slot before has been pushed down (or off the board).
      const bumped = prev.find((e) => e.rank === entry.rank) ?? null;
      events.push({ type: 'entry', entry, bumped: bumped && bumped.key !== entry.key ? bumped : null });
      continue;
    }
    // Only a better score counts: rising because a run above was removed is not the player's doing.
    if (entry.score <= old.score) continue;
    const gain = entry.score - old.score;
    if (entry.rank < old.rank) {
      const passed = prev.filter((e) => e.key !== entry.key && e.rank >= entry.rank && e.rank < old.rank);
      events.push({ type: 'climb', entry, from: old.rank, gain, passed });
    } else events.push({ type: 'record', entry, gain });
  }

  events.sort((a, b) => weight(a) - weight(b));
  return events;
}

/**
 * Finished runs the board diff did not already cover. `seen` is null before the first poll (the
 * runs already there are only remembered, not announced). Oldest first, so they play in order.
 */
export function diffRuns(seen: ReadonlySet<string> | null, recent: RecentRun[], covered: ReadonlySet<string>): BoardEvent[] {
  if (seen === null) return [];
  return recent
    .filter((r) => !seen.has(r.id) && !covered.has(r.key))
    .reverse()
    .map((run) => ({ type: 'run', run, entry: { key: run.key, rank: run.rank, nickname: run.nickname, score: run.score, dish: run.dish } }));
}

/** What it takes to get on the board right now. */
export function entryTarget(top: Entry[]): { open: number; cutoff: number } {
  if (top.length < TOP_N) return { open: TOP_N - top.length, cutoff: 0 };
  return { open: 0, cutoff: top[TOP_N - 1].score };
}
