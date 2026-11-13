// Small localStorage-backed store for this device. All reads tolerate a blocked or empty store.
const mem: Record<string, string> = {};

export function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? mem[key] ?? null;
  } catch {
    return mem[key] ?? null;
  }
}

export function setItem(key: string, value: string): void {
  mem[key] = value;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: keep the in-memory copy */
  }
}

export function getJson<T>(key: string, fallback: T): T {
  try {
    const raw = getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setJson(key: string, value: unknown): void {
  setItem(key, JSON.stringify(value));
}

export function uuid(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function deviceId(): string {
  let id = getItem('prism.device');
  if (!id) {
    id = uuid();
    setItem('prism.device', id);
  }
  return id;
}

export interface WonPrize {
  code: string;
  name: string;
  won_at: number;
}

export const local = {
  get nickname(): string | null {
    return getItem('prism.nickname');
  },
  set nickname(v: string | null) {
    if (v) setItem('prism.nickname', v);
  },
  get voted(): boolean {
    return getItem('prism.voted') === '1';
  },
  set voted(v: boolean) {
    setItem('prism.voted', v ? '1' : '0');
  },
  get emailGiven(): boolean {
    return getItem('prism.email') === '1';
  },
  set emailGiven(v: boolean) {
    setItem('prism.email', v ? '1' : '0');
  },
  get prizes(): WonPrize[] {
    return getJson<WonPrize[]>('prism.prizes', []);
  },
  addPrize(p: WonPrize) {
    setJson('prism.prizes', [p, ...this.prizes.filter((x) => x.code !== p.code)].slice(0, 10));
  },
};
