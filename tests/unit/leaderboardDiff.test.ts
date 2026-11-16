import { describe, expect, it } from 'vitest';
import { diffBoard, diffRuns, entryTarget, weight, type Entry } from '../../src/leaderboard/diff';
import type { RecentRun } from '../../src/net/api';

const board = (...scores: [string, number][]): Entry[] =>
  scores.sort((a, b) => b[1] - a[1]).map(([key, score], i) => ({ key, score, rank: i + 1, nickname: key.toUpperCase() }));

describe('diffBoard', () => {
  it('announces nothing for what was already on the board at start-up', () => {
    expect(diffBoard(null, board(['a', 500], ['b', 300]))).toEqual([]);
  });
  it('first entry on an empty board', () => {
    const ev = diffBoard([], board(['a', 500]));
    expect(ev.map((e) => e.type)).toEqual(['first']);
  });
  it('a new entrant below the king is an entry, and reports who was bumped', () => {
    const ev = diffBoard(board(['a', 500], ['b', 300]), board(['a', 500], ['c', 400], ['b', 300]));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: 'entry', entry: { key: 'c', rank: 2 }, bumped: { key: 'b' } });
  });
  it('a brand new player taking #1 is a king event, not an entry', () => {
    const ev = diffBoard(board(['a', 500], ['b', 300]), board(['a', 500], ['c', 900], ['b', 300]));
    expect(ev.map((e) => e.type)).toEqual(['king']);
    expect(ev[0]).toMatchObject({ entry: { key: 'c' }, previous: { key: 'a' }, isNew: true });
  });
  it('an existing player climbing to #1 is a king event too', () => {
    const ev = diffBoard(board(['a', 500], ['b', 300]), board(['a', 500], ['b', 800]));
    expect(ev[0]).toMatchObject({ type: 'king', entry: { key: 'b' }, isNew: false });
  });
  it('climbing inside the top 10 is a climb, and the king improving is a record', () => {
    const ev = diffBoard(board(['a', 500], ['b', 300], ['c', 200]), board(['a', 700], ['c', 400], ['b', 300]));
    expect(ev.map((e) => e.type)).toEqual(['record', 'climb']);
    expect(ev[0]).toMatchObject({ entry: { key: 'a' }, gain: 200 });
    expect(ev[1]).toMatchObject({ entry: { key: 'c', rank: 2 }, from: 3, gain: 200, passed: [{ key: 'b' }] });
  });
  it('a better score that keeps the same rank is a record', () => {
    const ev = diffBoard(board(['a', 500], ['b', 300], ['c', 200]), board(['a', 500], ['b', 350], ['c', 200]));
    expect(ev).toEqual([expect.objectContaining({ type: 'record', entry: expect.objectContaining({ key: 'b' }), gain: 50 })]);
  });
  it('rising only because someone above was removed is not an event', () => {
    expect(diffBoard(board(['a', 500], ['b', 300], ['c', 200]), board(['a', 500], ['c', 200]))).toEqual([]);
  });
  it('players pushed down by an entrant are not climbs', () => {
    const ev = diffBoard(board(['a', 500], ['b', 300]), board(['a', 500], ['c', 400], ['b', 300]));
    expect(ev.map((e) => e.type)).toEqual(['entry']);
  });
  it('a score falling off the board and a new one replacing it is one entry', () => {
    const full = Array.from({ length: 10 }, (_, i) => [`p${i}`, 1000 - i * 10] as [string, number]);
    const next = [...full.slice(0, 9), ['new', 995] as [string, number]];
    const ev = diffBoard(board(...full), board(...next));
    expect(ev.map((e) => e.type)).toEqual(['entry']);
  });
  it('orders several events for drama: low ranks first, king last', () => {
    const ev = diffBoard(board(['a', 500]), board(['a', 500], ['x', 900], ['y', 400], ['z', 100]));
    expect(ev.map((e) => (e.type === 'entry' ? `entry${e.entry.rank}` : e.type))).toEqual(['entry4', 'entry3', 'king']);
  });
});

describe('diffRuns', () => {
  const run = (id: string, key: string, rank: number, extra: Partial<RecentRun> = {}): RecentRun => ({
    id, key, rank, nickname: key.toUpperCase(), run_score: 100, score: 100, best: true, first: true, ...extra,
  });
  it('announces nothing for runs already there at start-up', () => {
    expect(diffRuns(null, [run('r1', 'a', 14)], new Set())).toEqual([]);
  });
  it('announces unseen runs oldest first, as run events with the player standing', () => {
    const ev = diffRuns(new Set(['r0']), [run('r2', 'b', 20), run('r1', 'a', 14), run('r0', 'z', 3)], new Set());
    expect(ev.map((e) => e.entry.key)).toEqual(['a', 'b']);
    expect(ev[0]).toMatchObject({ type: 'run', entry: { rank: 14, nickname: 'A' }, run: { id: 'r1' } });
  });
  it('skips players the board diff already has a show for', () => {
    expect(diffRuns(new Set(), [run('r1', 'a', 2), run('r2', 'b', 30)], new Set(['a'])).map((e) => e.entry.key)).toEqual(['b']);
  });
  it('runs come before board events in drama order', () => {
    expect(weight(diffRuns(new Set(), [run('r1', 'a', 30)], new Set())[0])).toBeLessThan(
      weight({ type: 'record', entry: { key: 'k', rank: 1, nickname: 'K', score: 1 }, gain: 1 }),
    );
  });
});

describe('entryTarget', () => {
  it('counts open spots while the board is not full, then the cut-off score', () => {
    expect(entryTarget(board(['a', 5]))).toEqual({ open: 9, cutoff: 0 });
    const full = board(...Array.from({ length: 10 }, (_, i) => [`p${i}`, 100 + i] as [string, number]));
    expect(entryTarget(full)).toEqual({ open: 0, cutoff: 100 });
  });
});
