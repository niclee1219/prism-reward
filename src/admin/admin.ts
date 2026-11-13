// Staff page: redeem prizes, remove runs, edit prize stock, flip toggles, export emails.
import '../ui/styles.css';
import './admin.css';
import { ApiError, api } from '../net/api';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let pin = sessionStorage.getItem('prism.pin') ?? '';

function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  return api<T>(`/admin/${action}`, { method: 'POST', body, headers: { 'x-admin-pin': pin } });
}

function h(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function explain(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Something went wrong.';
  if (e.code === 'unauthorized') return 'Wrong PIN.';
  if (e.code === 'rate_limited') return 'Too many wrong PINs. Wait 10 minutes.';
  if (e.code === 'network' || e.code === 'no_backend') return 'No connection.';
  return `Error: ${e.code}`;
}

// ---------- login ----------
const loginForm = $<HTMLFormElement>('login');
const app = $('app');
async function unlock(): Promise<void> {
  try {
    await call('login');
    sessionStorage.setItem('prism.pin', pin);
    loginForm.hidden = true;
    app.hidden = false;
    $('code').focus();
  } catch (e) {
    pin = '';
    sessionStorage.removeItem('prism.pin');
    $('login-msg').textContent = explain(e);
  }
}
loginForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  pin = $<HTMLInputElement>('pin').value.trim();
  void unlock();
});
if (pin) void unlock();

// ---------- tabs ----------
const loaders: Record<string, () => void> = { runs: loadRuns, prizes: loadPrizes, toggles: loadToggles, export: loadStats };
$('tabs').addEventListener('click', (ev) => {
  const tab = (ev.target as HTMLElement).dataset.tab;
  if (!tab) return;
  document.querySelectorAll<HTMLElement>('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
  loaders[tab]?.();
});

// ---------- redeem ----------
const codeInput = $<HTMLInputElement>('code');
const redeemResult = $('redeem-result');
async function redeem(code: string): Promise<void> {
  if (!code.trim()) return;
  redeemResult.className = 'result';
  redeemResult.textContent = 'Checking...';
  try {
    const r = await call<{ prize_name: string; nickname: string; code: string }>('redeem', { code });
    redeemResult.className = 'result ok';
    redeemResult.textContent = `✔ ${r.prize_name}`;
    redeemResult.append(h('small', '', `${r.code} · ${r.nickname} · hand over the prize`));
    codeInput.value = '';
  } catch (e) {
    redeemResult.className = 'result bad';
    if (e instanceof ApiError && e.code === 'already_redeemed') redeemResult.textContent = '✖ Already redeemed. Do not hand over.';
    else if (e instanceof ApiError && e.code === 'not_found') redeemResult.textContent = '✖ No such code.';
    else redeemResult.textContent = explain(e);
  }
}
$('redeem-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  void redeem(codeInput.value);
});

// Optional camera scan, only where the browser can read text-free codes (QR) natively.
// The redeem screen shows the code as text, so typing always works.
type Detector = { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> };
const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
if (BD && navigator.mediaDevices?.getUserMedia) {
  const scanBtn = $('scan');
  const video = $<HTMLVideoElement>('scan-video');
  scanBtn.hidden = false;
  scanBtn.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      const detector = new BD({ formats: ['qr_code'] });
      const stop = () => {
        stream.getTracks().forEach((t) => t.stop());
        video.hidden = true;
      };
      const started = Date.now();
      const loop = async () => {
        if (Date.now() - started > 20000) return stop();
        const found = await detector.detect(video).catch(() => []);
        const code = found[0]?.rawValue?.trim().toUpperCase();
        if (code && /^[A-Z0-9]{5}$/.test(code)) {
          stop();
          codeInput.value = code;
          void redeem(code);
        } else requestAnimationFrame(loop);
      };
      void loop();
    } catch {
      redeemResult.className = 'result bad';
      redeemResult.textContent = 'Camera not available. Type the code.';
    }
  });
}

// ---------- runs ----------
interface RunRow { id: string; nickname: string; score: number; correct: number; gates: number; duration_ms: number; status: string }
let searchTimer = 0;
$('run-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadRuns, 350);
});
async function loadRuns(): Promise<void> {
  const list = $('runs-list');
  try {
    const rows = await call<RunRow[]>('runs', { search: $<HTMLInputElement>('run-search').value });
    list.innerHTML = '';
    if (!rows.length) list.append(h('p', 'notice', 'No runs found.'));
    for (const r of rows) {
      const item = h('div', `item${r.status === 'removed' ? ' removed' : ''}`);
      const info = h('div', 'grow');
      info.append(h('div', 't', `${r.score} · ${r.nickname}`), h('div', 's', `${r.correct}/${r.gates} correct · ${Math.round(r.duration_ms / 1000)} s`));
      const removed = r.status === 'removed';
      const btn = h('button', removed ? 'neutral' : '', removed ? 'Restore' : 'Delete') as HTMLButtonElement;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await call(removed ? 'restore-run' : 'delete-run', { run_id: r.id }).catch((e) => alert(explain(e)));
        void loadRuns();
      });
      item.append(info, btn);
      list.append(item);
    }
  } catch (e) {
    list.textContent = explain(e);
  }
}

// ---------- prizes ----------
interface PrizeRow { id: string; name: string; stock: number; weight: number; won: number; redeemed: number }
async function loadPrizes(): Promise<void> {
  const list = $('prizes-list');
  try {
    const rows = await call<PrizeRow[]>('prizes');
    list.innerHTML = '';
    for (const p of rows) {
      const item = h('div', 'item');
      const info = h('div', 'grow');
      info.append(h('div', 't', p.name), h('div', 's', `${p.won} won · ${p.redeemed} redeemed`));
      const mk = (label: string, value: number) => {
        const l = h('label', '', label);
        const i = document.createElement('input');
        i.type = 'number';
        i.min = '0';
        i.value = String(value);
        l.append(i);
        return { l, i };
      };
      const stock = mk('stock', p.stock);
      const weight = mk('weight', p.weight);
      const save = h('button', 'neutral', 'Save') as HTMLButtonElement;
      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          await call('set-prize', { id: p.id, stock: Number(stock.i.value), weight: Number(weight.i.value) });
          save.textContent = 'Saved';
        } catch (e) {
          alert(explain(e));
        }
        save.disabled = false;
      });
      item.append(info, stock.l, weight.l, save);
      list.append(item);
    }
  } catch (e) {
    list.textContent = explain(e);
  }
}

// ---------- toggles ----------
async function loadToggles(): Promise<void> {
  const list = $('toggles-list');
  try {
    const cfg = await call<Record<string, string>>('config');
    list.innerHTML = '';
    const toggle = (key: string, title: string, sub: string) => {
      const item = h('div', 'item');
      const info = h('div', 'grow');
      info.append(h('div', 't', title), h('div', 's', sub));
      const on = cfg[key] === 'true';
      const btn = h('button', `switch${on ? ' on' : ''}`, on ? 'ON' : 'OFF') as HTMLButtonElement;
      btn.id = `toggle-${key}`;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await call('set-config', { key, value: String(!on) }).catch((e) => alert(explain(e)));
        void loadToggles();
      });
      item.append(info, btn);
      list.append(item);
    };
    toggle('vote_bonus_enabled', 'Vote bonus', `Voters get x${cfg.vote_bonus_multiplier ?? '1.1'}. Off removes it from the board at once.`);
    toggle('submissions_open', 'Submissions open', 'Off stops new scores being accepted.');

    const item = h('div', 'item');
    const info = h('div', 'grow');
    info.append(h('div', 't', 'Vote bonus multiplier'), h('div', 's', 'Between 1.0 and 1.2 (hard cap).'));
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.05';
    input.min = '1';
    input.max = '1.2';
    input.value = cfg.vote_bonus_multiplier ?? '1.1';
    const save = h('button', 'neutral', 'Save') as HTMLButtonElement;
    save.addEventListener('click', async () => {
      await call('set-config', { key: 'vote_bonus_multiplier', value: input.value }).catch((e) => alert(explain(e)));
      void loadToggles();
    });
    item.append(info, input, save);
    list.append(item);
  } catch (e) {
    list.textContent = explain(e);
  }
}

// ---------- export + stats ----------
const STAT_LABELS: Record<string, string> = {
  players: 'players', valid_runs: 'runs on the board', top_score: 'top score', avg_score: 'average score',
  median_duration_s: 'median run (s)', avg_correct_pct: '% answers correct', spins: 'spins',
  prizes_won: 'prizes won', redeemed: 'codes redeemed', emails: 'emails', voted: 'ticked "voted"',
};
async function loadStats(): Promise<void> {
  const grid = $('stats');
  try {
    const s = await call<Record<string, number>>('stats');
    grid.innerHTML = '';
    for (const [key, label] of Object.entries(STAT_LABELS)) {
      const d = h('div');
      d.append(h('b', '', String(s[key] ?? 0)), h('span', '', label));
      grid.append(d);
    }
  } catch (e) {
    grid.textContent = explain(e);
  }
}
$('export-emails').addEventListener('click', async () => {
  const msg = $('export-msg');
  try {
    const rows = await call<{ nickname: string; email: string; updates_consent: boolean }[]>('export-emails');
    // Quote every cell, and defuse values a spreadsheet would run as a formula.
    const esc = (v: unknown) => `"${String(v).replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`;
    const csv = ['nickname,email,updates_consent', ...rows.map((r) => [r.nickname, r.email, r.updates_consent].map(esc).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'prism-run-emails.csv';
    a.click();
    msg.textContent = `${rows.length} email${rows.length === 1 ? '' : 's'} exported.`;
  } catch (e) {
    msg.textContent = explain(e);
  }
});
