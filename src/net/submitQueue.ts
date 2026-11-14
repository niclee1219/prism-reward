// Finished runs wait here until the server has them. The queue lives in localStorage,
// so a run survives a dead connection, a closed tab or a reload.
import { NET } from '../config';
import { ApiError, api, type SubmitResult } from './api';
import { deviceId, getJson, setJson } from './device';

export interface QueuedRun {
  run_id: string;
  nickname: string;
  score: number;
  correct: number;
  wrong: number;
  gates: number;
  duration_ms: number;
  /** Which recipe was played. Optional: runs queued by an older version have none. */
  dish?: string;
}

export type Outcome = { ok: true; result: SubmitResult } | { ok: false; code: string };

const KEY = 'prism.queue';
const listeners = new Map<string, (o: Outcome) => void>();
const settled = new Map<string, Outcome>();
let flushing = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let delay = NET.RETRY_MIN_MS;

const read = () => getJson<QueuedRun[]>(KEY, []);
const write = (q: QueuedRun[]) => setJson(KEY, q);

export function enqueue(run: QueuedRun): void {
  write([...read(), run]);
  delay = NET.RETRY_MIN_MS;
  void flush();
}

/** Calls back once the run is stored or rejected. Fires at once if that already happened. */
export function onOutcome(runId: string, cb: (o: Outcome) => void): void {
  const done = settled.get(runId);
  if (done) cb(done);
  else listeners.set(runId, cb);
}

export function isPending(runId: string): boolean {
  return read().some((r) => r.run_id === runId);
}

function settle(runId: string, outcome: Outcome): void {
  write(read().filter((r) => r.run_id !== runId));
  settled.set(runId, outcome);
  listeners.get(runId)?.(outcome);
  listeners.delete(runId);
}

export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  if (timer) clearTimeout(timer);
  timer = null;
  try {
    for (;;) {
      const next = read()[0];
      if (!next) break;
      try {
        const result = await api<SubmitResult>('/submit-run', { body: { ...next, device_id: deviceId() } });
        settle(next.run_id, { ok: true, result });
        delay = NET.RETRY_MIN_MS;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError('unknown', 0, true);
        if (!err.retryable) {
          settle(next.run_id, { ok: false, code: err.code });
          continue;
        }
        // Keep the run and try again later, backing off up to the maximum.
        timer = setTimeout(() => void flush(), delay);
        delay = Math.min(delay * 1.7, NET.RETRY_MAX_MS);
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    delay = NET.RETRY_MIN_MS;
    void flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void flush();
  });
}
