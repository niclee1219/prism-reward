// Read-only review page for the question bank, so the team can check every question, answer and explanation.
import './qna.css';
import bank from '../content/questions.json';

type Question = (typeof bank.questions)[number];

const TYPE_LABELS: Record<string, string> = {
  pain_vs_fix: 'Pain vs fix',
  best_question: 'Best question to ask',
  trust_answer: 'Trusting the answer',
  who_needs: 'Who needs PRISM',
};
const TIER_LABELS: Record<number, string> = { 1: 'Tier 1 · easy', 2: 'Tier 2 · medium', 3: 'Tier 3 · hard' };
const LETTERS = ['A', 'B', 'C', 'D'];

const questions = bank.questions as Question[];
const types = [...new Set(questions.map((q) => q.type))];
const list = document.getElementById('list')!;
const filters = document.getElementById('filters')!;

document.getElementById('summary')!.textContent =
  `${questions.length} questions across ${types.length} types`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function card(q: Question, n: number): HTMLElement {
  const art = el('article', 'qa');
  const meta = el('div', 'qa-meta');
  meta.append(el('span', 'qa-num', `#${n}`), el('span', 'qa-id', q.id), el('span', `qa-tier t${q.tier}`, TIER_LABELS[q.tier] ?? `Tier ${q.tier}`));
  art.append(meta, el('h3', 'qa-q', q.q));

  const ol = el('ol', 'qa-answers');
  q.answers.forEach((a, i) => {
    const li = el('li', i === q.correct ? 'correct' : '');
    li.append(el('span', 'qa-letter', LETTERS[i]), el('span', 'qa-text', a));
    if (i === q.correct) li.append(el('span', 'qa-tick', '✓ correct'));
    ol.append(li);
  });
  art.append(ol);

  const ex = el('div', 'qa-explain');
  ex.append(el('strong', '', 'Explanation: '), document.createTextNode(q.explain));
  art.append(ex);
  if (q.citation) art.append(el('div', 'qa-cite', `Citation: ${q.citation}`));
  return art;
}

function render(only: string | null): void {
  list.replaceChildren();
  let n = 0;
  for (const t of types) {
    const group = questions.filter((q) => q.type === t);
    if (only && t !== only) {
      n += group.length;
      continue;
    }
    const sec = el('section', 'qna-group');
    sec.append(el('h2', '', `${TYPE_LABELS[t] ?? t} (${group.length})`));
    for (const q of group) sec.append(card(q, ++n));
    list.append(sec);
  }
}

function filterButton(label: string, value: string | null): HTMLButtonElement {
  const b = el('button', 'chip', label);
  b.type = 'button';
  b.addEventListener('click', () => {
    filters.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
    b.classList.add('on');
    render(value);
  });
  return b;
}

const all = filterButton(`All (${questions.length})`, null);
all.classList.add('on');
filters.append(all, ...types.map((t) => filterButton(TYPE_LABELS[t] ?? t, t)));
render(null);
