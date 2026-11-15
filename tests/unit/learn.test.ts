import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FILE_BY_HAND, LEARN_ENDING, LEARN_QUESTIONS, LEARN_SCENES, PIECES, pieceById, SHELVES, SIGNPOSTS } from '../../src/content/learn';

const words = (s: string) => s.trim().split(/\s+/).length;

describe('Learn content', () => {
  it('is flagged as a draft for human review', () => {
    expect(readFileSync('src/content/learn.ts', 'utf8')).toContain('DRAFT: needs human review');
  });

  it('has ten scenes, each with a short line', () => {
    expect(LEARN_SCENES).toHaveLength(10);
    expect(new Set(LEARN_SCENES.map((s) => s.id)).size).toBe(10);
    for (const s of LEARN_SCENES) {
      expect(s.line.trim().length, s.id).toBeGreaterThan(0);
      expect(words(s.line), s.id).toBeLessThanOrEqual(16);
    }
  });

  it('stamps the real terms in order, RAG last', () => {
    expect(LEARN_SCENES.filter((s) => s.stamp).map((s) => s.stamp)).toEqual(['CHUNKING', 'EMBEDDING', 'RETRIEVAL', 'GENERATION', 'RAG']);
  });

  it('never names a term in a line before its stamp lands', () => {
    const terms = ['chunk', 'embed', 'retriev', 'generat'];
    LEARN_SCENES.forEach((s, i) => {
      for (const t of terms) {
        const stampedAt = LEARN_SCENES.findIndex((x) => x.stamp?.toLowerCase().startsWith(t));
        if (i < stampedAt) expect(s.line.toLowerCase(), `${s.id} says "${t}" early`).not.toContain(t);
      }
    });
  });

  it('every piece sits on a known shelf and cites a file and lines', () => {
    const shelves = new Set(SHELVES.map((s) => s.id));
    expect(new Set(PIECES.map((p) => p.id)).size).toBe(PIECES.length);
    for (const p of PIECES) {
      expect(shelves.has(p.shelf), p.id).toBe(true);
      expect(p.file).toMatch(/^[\w./-]+\.\w+$/);
      expect(p.lines).toMatch(/^\d+-\d+$/);
      const [a, b] = p.lines.split('-').map(Number);
      expect(a).toBeLessThan(b);
      expect(p.code.length, p.id).toBeGreaterThan(0);
    }
    for (const id of FILE_BY_HAND) expect(() => pieceById(id)).not.toThrow();
  });

  it('has three preset questions, and every one retrieves at least one card', () => {
    expect(LEARN_QUESTIONS).toHaveLength(3);
    for (const q of LEARN_QUESTIONS) {
      expect(q.retrieves.length, q.id).toBeGreaterThan(0);
      for (const id of q.retrieves) expect(() => pieceById(id), `${q.id} -> ${id}`).not.toThrow();
      expect(new Set(q.retrieves).size, q.id).toBe(q.retrieves.length);
    }
  });

  it('different questions pull different cards', () => {
    const sets = LEARN_QUESTIONS.map((q) => [...q.retrieves].sort().join(','));
    expect(new Set(sets).size).toBe(LEARN_QUESTIONS.length);
    // ...and each question pulls at least one card no other question pulls
    for (const q of LEARN_QUESTIONS) {
      const others = new Set(LEARN_QUESTIONS.filter((o) => o !== q).flatMap((o) => o.retrieves));
      expect(q.retrieves.some((id) => !others.has(id)), q.id).toBe(true);
    }
  });

  it('every answer cites each piece it pulled, and nothing else', () => {
    for (const q of LEARN_QUESTIONS) {
      const cited = new Set([...q.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
      expect([...cited].sort(), q.id).toEqual(q.retrieves.map((_, i) => i + 1));
    }
  });

  it('has the three signposts the owner agreed', () => {
    expect(SIGNPOSTS.map((s) => s.title)).toEqual(['MODEL GOVERNANCE', 'AUDIT LOG', 'STANDARDISATION']);
    for (const s of SIGNPOSTS) expect(s.text.length).toBeGreaterThan(0);
  });

  it('ends on a PLAY prompt', () => {
    expect(LEARN_ENDING.title).toBe('NOW COOK DINNER!');
    expect(LEARN_ENDING.play).toBe('PLAY');
  });
});
