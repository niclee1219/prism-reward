export interface PainPoint {
  icon: string;
  title: string;
  /** The same problem in the stall's kitchen, to bridge the story to the code pitch. */
  kitchen: string;
  pain: string;
  fix: string;
}

export const PAIN_POINTS: PainPoint[] = [
  {
    icon: '🏃',
    title: 'Someone leaves',
    kitchen: 'Like taking over a recipe nobody explained.',
    pain: 'You inherit their system. The knowledge left with them.',
    fix: 'Ask PRISM how it works and get answers that point to the exact code.',
  },
  {
    icon: '🌱',
    title: 'New hire joins',
    kitchen: 'Like a new helper learning the stall.',
    pain: 'Weeks of reading code before they can help.',
    fix: 'They ask PRISM in plain English and understand it in minutes.',
  },
  {
    icon: '🔎',
    title: 'Auditor asks "how is this calculated?"',
    kitchen: 'Like the inspector asking where a step is written.',
    pain: 'Days of digging to prove one figure.',
    fix: 'PRISM explains the calculation and cites the file and line.',
  },
  {
    icon: '🕸️',
    title: 'Undocumented legacy code',
    kitchen: 'Like "cook until it smells right".',
    pain: 'Nobody dares touch it. Nobody remembers why.',
    fix: 'PRISM untangles it and shows its sources, so you can check.',
  },
];
