import { describe, expect, it } from 'vitest';
import bank from '../../src/content/questions.json';
import { GateDirector, QUESTIONS } from '../../src/game/gateDirector';

const words = (s: string) => s.trim().split(/\s+/).length;

describe('question bank', () => {
  it('is flagged as a draft', () => {
    expect((bank as { _comment: string })._comment).toContain('DRAFT: needs human accuracy review');
  });
  it('has 36 questions, 9 per type, unique ids', () => {
    expect(QUESTIONS).toHaveLength(36);
    const byType: Record<string, number> = {};
    for (const q of QUESTIONS) byType[q.type] = (byType[q.type] ?? 0) + 1;
    expect(byType).toEqual({ pain_vs_fix: 9, best_question: 9, trust_answer: 9, who_needs: 9 });
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(36);
  });
  it.each(QUESTIONS.map((q) => [q.id, q] as const))('%s meets the writing rules', (_id, q) => {
    expect(words(q.q)).toBeLessThanOrEqual(10);
    expect(q.answers).toHaveLength(3);
    for (const a of q.answers) expect(words(a)).toBeLessThanOrEqual(5);
    expect(new Set(q.answers).size).toBe(3);
    expect([0, 1, 2]).toContain(q.correct);
    expect([1, 2, 3]).toContain(q.tier);
    expect(q.explain.length).toBeGreaterThan(10);
    expect(q.citation.length).toBeGreaterThan(3);
  });
});

describe('gate director', () => {
  it('never repeats a question or a type back to back, over 1000 runs', () => {
    for (let run = 0; run < 1000; run++) {
      const d = new GateDirector();
      const seen = new Set<string>();
      let last = '';
      for (let g = 0; g < 45; g++) {
        const tier = g < 5 ? 1 : g < 13 ? 2 : 3;
        const gq = d.next(tier);
        if (!gq) break;
        expect(seen.has(gq.question.id)).toBe(false);
        expect(gq.question.type).not.toBe(last);
        expect(gq.laneAnswers[gq.correctLane]).toBe(gq.question.answers[gq.question.correct]);
        expect([...gq.laneAnswers].sort()).toEqual([...gq.question.answers].sort());
        seen.add(gq.question.id);
        last = gq.question.type;
      }
      expect(seen.size).toBeGreaterThanOrEqual(20);
    }
  });
  it('spreads the correct lane across all three lanes', () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < 600; i++) counts[new GateDirector().next(1)!.correctLane]++;
    for (const c of counts) expect(c).toBeGreaterThan(120);
  });
  it('can keep the correct answer out of a given lane', () => {
    for (let i = 0; i < 100; i++) expect(new GateDirector().next(1, { avoidLane: 1 })!.correctLane).not.toBe(1);
  });
});
