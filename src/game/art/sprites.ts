// Every sprite is a small character grid drawn with the palette below.
// '.' is transparent. Grids are baked into one atlas texture at start-up.

export const PALETTE: Record<string, string> = {
  k: '#1b1b2f', // outline
  w: '#fff6e0',
  r: '#e63946',
  o: '#f4a261',
  y: '#ffd166',
  g: '#2a9d8f',
  G: '#52b788',
  b: '#457b9d',
  B: '#8ecae6',
  p: '#9b5de5',
  P: '#f15bb5',
  n: '#7f5539',
  N: '#b08968',
  s: '#ffcdb2',
  d: '#6c757d',
  D: '#adb5bd',
};

export interface SpriteDef {
  rows: string[];
  /** Pixel size multiplier when baked. */
  scale: number;
}

const body = [
  '....kkkk....',
  '...knnnnk...',
  '..knnnnnnk..',
  '..knnnnnnk..',
  '..knnnnnnk..',
  '...ksnnsk...',
  '..kkyyyykk..',
  '.kyyyyyyyyk.',
  'kskyyyyyyksk',
  'kskyyyyyyksk',
  '.k.kyyyyk.k.',
  '...kbbbbk...',
  '...kbbbbk...',
];

export const SPRITES: Record<string, SpriteDef> = {
  run0: { scale: 2, rows: [...body, '..kbbkkbk...', '..kbk.kwk...', '..kwk..k....'] },
  run1: { scale: 2, rows: [...body, '...kbkkbbk..', '...kwk.kbk..', '....k..kwk..'] },
  prism: {
    scale: 2,
    rows: [
      '....k....',
      '...kwk...',
      '..kwBBk..',
      '..kBBpk..',
      '.kwBppPk.',
      '.kBBpPPk.',
      'kwBBpPyyk',
      'kkkkkkkkk',
    ],
  },
  stall: {
    scale: 2,
    rows: [
      'kkkkkkkkkkkkkkkk',
      'krrwwrrwwrrwwrrk',
      'krrwwrrwwrrwwrrk',
      'krrwwrrwwrrwwrrk',
      'kkkkkkkkkkkkkkkk',
      '.kyyyyyyyyyyyyk.',
      '.kykkkykkykkkyk.',
      '.kyyyyyyyyyyyyk.',
      'kkkkkkkkkkkkkkkk',
      'kNNNNNNNNNNNNNNk',
      'kNnNNNNnnNNNNnNk',
      'kNNNNNNNNNNNNNNk',
      'kNNNNNNNNNNNNNNk',
      'knnnnnnnnnnnnnnk',
      'kkkkkkkkkkkkkkkk',
      '.kk..........kk.',
    ],
  },
  cart: {
    scale: 2,
    rows: [
      '................',
      '.kkkkkkkkkkkkkk.',
      '.kDDDDDDDDDDDDk.',
      '.kDwwwDgggDooDk.',
      '.kDDDDDDDDDDDDk.',
      '.kkkkkkkkkkkkkk.',
      '.kd..........dk.',
      '.kkkkkkkkkkkkkk.',
      '.kDDDDDDDDDDDDk.',
      '.kDrrrDwwwDBBDk.',
      '.kDDDDDDDDDDDDk.',
      '.kkkkkkkkkkkkkk.',
      '.kd..........dk.',
      '.kd..........dk.',
      'kkkk........kkkk',
      'kddk........kddk',
    ],
  },
  spill: {
    scale: 2,
    rows: [
      '................',
      '....nnnnn.......',
      '..nnnNNnnnn..kk.',
      '.nnNNnnnnnnnkwwk',
      '.nnnnnnnnNnnkwwk',
      'nnnnNnnnnnnnnkk.',
      '.nnnnnnnNNnnn...',
      '..nnnnnnnnnn....',
      '....nnnnn.......',
      '................',
    ],
  },
  uncle: {
    scale: 2,
    rows: [
      '.....kkkkkk.....',
      '....kddddddk....',
      '....kssssssk....',
      '....kskssksk....',
      '....kssssssk....',
      '.....kswwsk.....',
      '...kkkGGGGkkk...',
      '..kGGGGGGGGGGk..',
      '.kGkGGGGGGGGkGk.',
      '.kskGGGGGGGGksk.',
      'kkkkkkkkkkkkkkkk',
      'kDDDwwDDDooDDDDk',
      'kkkkkkkkkkkkkkkk',
      '....kbbkkbbk....',
      '....kbbk.kbbk...',
      '....kkk..kkk....',
    ],
  },
  kopi: {
    scale: 1,
    rows: [
      '.kkkkkk..',
      'kwwwwwwk.',
      'knnnnnnkk',
      'kwwwwwwkk',
      'kwwrrwwk.',
      '.kwwwwk..',
      '..kkkk...',
    ],
  },
  arrow: {
    scale: 2,
    rows: [
      '....k....',
      '...kyk...',
      '..kyyyk..',
      '.kyyyyyk.',
      'kkkyyykkk',
      '..kyyyk..',
      '..kyyyk..',
      '..kkkkk..',
    ],
  },
  px: { scale: 1, rows: ['ww', 'ww'] },
  line: { scale: 1, rows: ['w', 'w', 'w', 'w', 'w', 'w', 'w', 'w', 'w', 'w'] },
};

export const OBSTACLE_KEYS = ['stall', 'cart', 'spill', 'uncle'] as const;
