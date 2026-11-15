// Pure logic for the /leaderboard hype screen: compare two top-10 snapshots and say what is worth a show.
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
  | { type: 'entry'; entry: Entry; bumped: Entry | null };

export const TOP_N = 10;

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
    const isNew = !before.has(entry.key);
    if (entry.rank === 1) {
      if (prev.length === 0) events.push({ type: 'first', entry });
      else if (oldKing && oldKing.key !== entry.key) events.push({ type: 'king', entry, previous: oldKing, isNew });
      continue;
    }
    if (isNew) {
      // Whoever sat at the entrant's slot before has been pushed down (or off the board).
      const bumped = prev.find((e) => e.rank === entry.rank) ?? null;
      events.push({ type: 'entry', entry, bumped: bumped && bumped.key !== entry.key ? bumped : null });
    }
  }

  const weight = (e: BoardEvent): number => (e.type === 'entry' ? 1000 - e.entry.rank : e.type === 'first' ? 2000 : 3000);
  events.sort((a, b) => weight(a) - weight(b));
  return events;
}

/** What it takes to get on the board right now. */
export function entryTarget(top: Entry[]): { open: number; cutoff: number } {
  if (top.length < TOP_N) return { open: TOP_N - top.length, cutoff: 0 };
  return { open: 0, cutoff: top[TOP_N - 1].score };
}
