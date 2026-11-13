// Chooses the question for each gate.
// Rules: tier follows run time, never the same type twice in a row,
// never the same question twice in a run, correct lane shuffled.
import bank from '../content/questions.json';

export type QuestionType = 'pain_vs_fix' | 'best_question' | 'trust_answer' | 'who_needs';

export interface Question {
  id: string;
  type: QuestionType;
  tier: 1 | 2 | 3;
  q: string;
  answers: [string, string, string];
  correct: 0 | 1 | 2;
  explain: string;
  citation: string;
}

/** A question as placed on a gate: answers shuffled into lanes. */
export interface GateQuestion {
  question: Question;
  /** laneAnswers[lane] is the text shown in that lane. */
  laneAnswers: [string, string, string];
  correctLane: 0 | 1 | 2;
}

export const QUESTIONS = (bank as unknown as { questions: Question[] }).questions;

export class GateDirector {
  private used = new Set<string>();
  private lastType: QuestionType | null = null;

  constructor(
    private rng: () => number = Math.random,
    private pool: Question[] = QUESTIONS,
  ) {}

  /**
   * Next question for the wanted tier, or null when nothing valid is left.
   * Falls back to the nearest tier, but never breaks the type or repeat rules.
   */
  next(tier: 1 | 2 | 3, opts: { avoidLane?: number; type?: QuestionType } = {}): GateQuestion | null {
    const free = this.pool.filter(
      (q) => !this.used.has(q.id) && q.type !== this.lastType && (!opts.type || q.type === opts.type),
    );
    if (free.length === 0) return null;
    const dist = Math.min(...free.map((q) => Math.abs(q.tier - tier)));
    const candidates = free.filter((q) => Math.abs(q.tier - tier) === dist);
    const question = candidates[Math.floor(this.rng() * candidates.length)];
    this.used.add(question.id);
    this.lastType = question.type;

    const lanes = [0, 1, 2].filter((l) => l !== opts.avoidLane);
    const correctLane = lanes[Math.floor(this.rng() * lanes.length)] as 0 | 1 | 2;
    const wrong = question.answers.filter((_, i) => i !== question.correct);
    if (this.rng() < 0.5) wrong.reverse();
    const laneAnswers = ['', '', ''] as [string, string, string];
    laneAnswers[correctLane] = question.answers[question.correct];
    let w = 0;
    for (let l = 0; l < 3; l++) if (l !== correctLane) laneAnswers[l] = wrong[w++];
    return { question, laneAnswers, correctLane };
  }
}
