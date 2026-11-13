export interface PainPoint {
  icon: string;
  title: string;
  pain: string;
  fix: string;
}

export const PAIN_POINTS: PainPoint[] = [
  {
    icon: '🏃',
    title: 'Someone leaves',
    pain: 'You inherit their system. The knowledge left with them.',
    fix: 'Ask PRISM how it works and get answers that point to the exact code.',
  },
  {
    icon: '🌱',
    title: 'New hire joins',
    pain: 'Weeks of reading code before they can help.',
    fix: 'They ask PRISM in plain English and understand it in minutes.',
  },
  {
    icon: '🔎',
    title: 'Auditor asks "how is this calculated?"',
    pain: 'Days of digging to prove one figure.',
    fix: 'PRISM explains the calculation and cites the file and line.',
  },
  {
    icon: '🕸️',
    title: 'Undocumented legacy code',
    pain: 'Nobody dares touch it. Nobody remembers why.',
    fix: 'PRISM untangles it and shows its sources, so you can check.',
  },
];
