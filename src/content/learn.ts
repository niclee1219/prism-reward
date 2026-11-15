// Learn mode: how PRISM works, in ten scenes, for a general employee (not an engineer).
//
// DRAFT: needs human review. The scene lines and the three "coming next" signposts were agreed with the owner
// (docs/superpowers/specs/2026-11-15-pixel-rework-design.md, Phase 4). The ML model, its code, the files and line numbers
// below are INVENTED for the demo: they only have to look plausible and agree with each other. Check that the answers
// match the code snippets and the citations before the event.
//
// The idea every scene builds towards: PRISM cuts the code into pieces, files them by meaning, finds the pieces that
// match a question, and answers from them with sources. Different questions must pull different pieces.

export type ShelfId = 'scores' | 'changes' | 'data';

export interface LearnScene {
  id: string;
  /** What the scene teaches (for reviewers; not shown). */
  concept: string;
  /** The one line of text on screen. */
  line: string;
  /** The real term, stamped on only after the visitor has done (or watched) the step. */
  stamp?: string;
  /** Small print under the stamp. */
  stampSub?: string;
  /** What to do, shown where NEXT will appear until the step is done. Absent: NEXT shows straight away. */
  todo?: string;
}

export const LEARN_SCENES: LearnScene[] = [
  { id: 'problem', concept: 'The problem', line: "Code with no docs is like Ah Ma's notes." },
  { id: 'upload', concept: 'Upload', line: 'Give PRISM your codebase.' },
  { id: 'split', concept: 'Split', line: 'PRISM breaks it into small pieces.', stamp: 'CHUNKING', todo: 'Tap the book' },
  { id: 'embed', concept: 'Embed', line: 'Each piece is filed by meaning, not by keyword.', stamp: 'EMBEDDING', todo: 'Tap the cards' },
  { id: 'ask', concept: 'Ask', line: 'Your question gets filed the same way.', todo: 'Pick a question' },
  { id: 'retrieve', concept: 'Retrieve', line: 'PRISM pulls only the pieces that match.', stamp: 'RETRIEVAL', todo: 'Watch the shelves' },
  { id: 'generate', concept: 'Generate', line: 'It answers from those pieces and shows its sources.', stamp: 'GENERATION', todo: 'Tap GENERATE' },
  {
    id: 'docs',
    concept: 'Docs, and the name for all of it',
    line: 'It can write the docs too. Together this is called RAG.',
    stamp: 'RAG',
    stampSub: 'Retrieval-Augmented Generation',
  },
  { id: 'why', concept: 'Why PRISM', line: 'Runs on the intranet, so code never leaves. Current government AI tools do not read code.' },
  { id: 'next', concept: 'Coming next', line: 'Coming next to PRISM.', todo: 'Tap each sign' },
];

/** What the chop counter says after each tap in the split scene (the book takes three chops). */
export const SPLIT_AGAIN = ['Again!', 'One more!'];

/** The shelves in the embed scene, top to bottom. Plain words: these are meanings, not keywords. */
export const SHELVES: { id: ShelfId; label: string; icon: string }[] = [
  { id: 'scores', label: 'Scores', icon: '🧮' },
  { id: 'changes', label: 'Changes', icon: '🕓' },
  { id: 'data', label: 'Data in', icon: '📥' },
];

export interface Piece {
  id: string;
  /** Plain-words name, shown when the card is filed and when it is pulled. */
  name: string;
  shelf: ShelfId;
  file: string;
  lines: string;
  /** A few lines of the (invented) code, shown in the Generate scene. */
  code: string[];
}

/**
 * The invented codebase: a model that gives each case a risk score from 0 to 100.
 * v2.1 weights: late_payments 0.30, income_change 0.25, industry_risk 0.20, amended_returns 0.15, years_registered 0.10.
 * v2.0 weights: late_payments 0.25, income_change 0.30, industry_risk 0.25, years_registered 0.20 (no amended_returns).
 */
export const PIECES: Piece[] = [
  {
    id: 'score-formula',
    name: 'Risk score formula',
    shelf: 'scores',
    file: 'risk_model/scoring.py',
    lines: '40-58',
    code: ['def risk_score(case):', '    total = sum(WEIGHTS[k] * case[k]', '                for k in WEIGHTS)', '    return min(round(total * 100), 100)'],
  },
  {
    id: 'weights',
    name: 'How much each factor counts',
    shelf: 'scores',
    file: 'risk_model/config/weights.yaml',
    lines: '1-12',
    code: ['late_payments:    0.30', 'income_change:    0.25', 'industry_risk:    0.20', 'amended_returns:  0.15'],
  },
  {
    id: 'bands',
    name: 'Low, medium and high bands',
    shelf: 'scores',
    file: 'risk_model/scoring.py',
    lines: '61-74',
    code: ['def band(score):', '    if score >= 70: return "HIGH"', '    if score >= 40: return "MEDIUM"', '    return "LOW"'],
  },
  {
    id: 'release-notes',
    name: 'Release notes for v2.1',
    shelf: 'changes',
    file: 'risk_model/CHANGELOG.md',
    lines: '1-14',
    code: ['## v2.1', '- New input: amended_returns', '- late_payments weight 0.25 -> 0.30', '- income_change weight 0.30 -> 0.25'],
  },
  {
    id: 'old-weights',
    name: 'Weights before v2.1',
    shelf: 'changes',
    file: 'risk_model/config/weights_v2_0.yaml',
    lines: '1-9',
    code: ['# v2.0, kept for comparison', 'late_payments:    0.25', 'income_change:    0.30', 'industry_risk:    0.25'],
  },
  {
    id: 'new-input',
    name: 'New input: amended returns',
    shelf: 'changes',
    file: 'risk_model/features.py',
    lines: '49-60',
    code: ['# new in v2.1', 'def amended_returns(case):', '    n = case.amendments_last_3y', '    return min(n / 3, 1.0)'],
  },
  {
    id: 'input-list',
    name: 'List of inputs the model reads',
    shelf: 'data',
    file: 'risk_model/features.py',
    lines: '12-30',
    code: ['FEATURES = [', '    "late_payments", "income_change",', '    "industry_risk", "amended_returns",', '    "years_registered"]'],
  },
  {
    id: 'late-payments',
    name: 'Late payments, last 2 years',
    shelf: 'data',
    file: 'risk_model/features.py',
    lines: '33-47',
    code: ['def late_payments(case):', '    recent = case.payments(years=2)', '    late = [p for p in recent', '            if p.days_late > 30]'],
  },
  {
    id: 'missing',
    name: 'Fill in missing values',
    shelf: 'data',
    file: 'risk_model/prepare.py',
    lines: '8-25',
    code: ['def prepare(case):', '    for k in FEATURES:', '        case[k] = case.get(k) or 0.0', '    return case'],
  },
];

/** The first three cards the visitor files by hand: none of them shares a word with its shelf's label. */
export const FILE_BY_HAND = ['weights', 'release-notes', 'late-payments'];

export interface LearnQuestion {
  id: string;
  q: string;
  /** A two- or three-word version for the small "try another" buttons. */
  short: string;
  /** Ids of the pieces this question pulls, in citation order: [1] is the first. */
  retrieves: string[];
  /** The answer, with [n] markers pointing at `retrieves`. Every piece it pulls is cited at least once. */
  answer: string;
}

export const LEARN_QUESTIONS: LearnQuestion[] = [
  {
    id: 'how-score',
    q: 'How is the risk score calculated?',
    short: 'Risk score?',
    retrieves: ['score-formula', 'weights', 'bands'],
    answer: 'Each input is multiplied by its weight [2], then added up and scaled to a score out of 100 [1]. A score of 70 or more is marked HIGH [3].',
  },
  {
    id: 'which-data',
    q: 'What data does this model use?',
    short: 'Which data?',
    retrieves: ['input-list', 'late-payments', 'new-input'],
    answer: 'Five inputs [1], including late payments over the last 2 years [2]. Amended returns is the newest one, added in v2.1 [3].',
  },
  {
    id: 'what-changed',
    q: 'What changed since the last version?',
    short: 'What changed?',
    retrieves: ['release-notes', 'old-weights', 'new-input'],
    answer: 'v2.1 added amended returns as an input [3] and raised the weight on late payments from 0.25 to 0.30 [1][2].',
  },
];

/** Scene 10: what is coming next to PRISM. The owner's definitions; do not reword without asking. */
export const SIGNPOSTS: { id: string; title: string; text: string }[] = [
  { id: 'governance', title: 'MODEL GOVERNANCE', text: 'Every ML model documented the same way, including the business reasoning behind it.' },
  { id: 'audit', title: 'AUDIT LOG', text: 'See exactly what changed between one version of a model and the next.' },
  { id: 'standard', title: 'STANDARDISATION', text: 'Spot when two models handle the same formula differently.' },
];

/** The moment after FINISH. PLAY lands on the home screen, where the player picks a dish and a name. */
export const LEARN_ENDING = {
  title: 'NOW COOK DINNER!',
  sub: "Help the beaver decode Ah Ma's recipe, one question at a time.",
  play: 'PLAY',
};

export const pieceById = (id: string): Piece => {
  const p = PIECES.find((x) => x.id === id);
  if (!p) throw new Error(`unknown piece ${id}`);
  return p;
};

export const citation = (p: Piece): string => `${p.file} · lines ${p.lines}`;
