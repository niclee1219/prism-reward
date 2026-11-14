import { implausibleReason } from '../../supabase/functions/_shared/scoring';
import type { RunResult } from '../../src/game/sim/RunSim';

export { RUN, SCORING, WORLD } from '../../src/config';

/** What the server's submit-run check says about this run (null = accepted). */
export const implausibleReasonFor = (r: RunResult) =>
  implausibleReason({ score: r.score, correct: r.correct, wrong: r.wrong, gates: r.gates, duration_ms: r.duration_ms });
