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

function readCookie(name: string): string | null {
  try {
    const m = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
    return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string): void {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=31536000; path=/; SameSite=Lax`;
  } catch {
    /* cookies blocked */
  }
}

/** The device's account id. Kept in localStorage and mirrored to a cookie, so clearing only one of them keeps the same account. */
export function deviceId(): string {
  let id = getItem('prism.device') ?? readCookie('prism.device');
  if (!id) id = uuid();
  setItem('prism.device', id);
  writeCookie('prism.device', id);
  return id;
}

export const local = {
  get nickname(): string | null {
    return getItem('prism.nickname');
  },
  set nickname(v: string | null) {
    if (v) setItem('prism.nickname', v);
  },
  /** The name this device has claimed. Once set it never changes. */
  get locked(): string | null {
    return getItem('prism.locked') ?? readCookie('prism.locked');
  },
  set locked(v: string | null) {
    if (v) {
      setItem('prism.locked', v);
      writeCookie('prism.locked', v);
    }
  },
  /** Has this phone been through Learn (finished or skipped)? Until it has, the game opens on Learn. */
  get seenLearn(): boolean {
    return getItem('prism.learn') === '1';
  },
  set seenLearn(v: boolean) {
    setItem('prism.learn', v ? '1' : '0');
  },
  /** Has this phone seen the controls slides? They show once, on the first PLAY tap. */
  get seenHowto(): boolean {
    return getItem('prism.howto') === '1';
  },
  set seenHowto(v: boolean) {
    setItem('prism.howto', v ? '1' : '0');
  },
  get dish(): string | null {
    return getItem('prism.dish');
  },
  set dish(v: string | null) {
    if (v) setItem('prism.dish', v);
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
  /** Dishes this device has finished a run on (served or not). Shown as a tick on the home screen. */
  get doneDishes(): string[] {
    return getJson<string[]>('prism.done', []);
  },
  markDishDone(id: string) {
    const all = this.doneDishes;
    if (!all.includes(id)) setJson('prism.done', [...all, id]);
  },
};
