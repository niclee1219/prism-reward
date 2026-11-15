// Staff page: remove runs, flip toggles, see stats, export the lucky-draw entries, close the site and reset all data.
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
    loadRuns();
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
const loaders: Record<string, () => void> = { runs: loadRuns, toggles: loadToggles, export: loadStats, event: loadEvent };
$('tabs').addEventListener('click', (ev) => {
  const tab = (ev.target as HTMLElement).dataset.tab;
  if (!tab) return;
  document.querySelectorAll<HTMLElement>('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
  loaders[tab]?.();
});

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
  median_duration_s: 'median run (s)', avg_correct_pct: '% answers correct', entries: 'lucky draw entries', voted: 'ticked "voted"',
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
$('export-entries').addEventListener('click', async () => {
  const msg = $('export-msg');
  try {
    const rows = await call<{ nickname: string; email: string; message: string | null; created_at: string }[]>('export-entries');
    // Quote every cell, and defuse values a spreadsheet would run as a formula.
    const esc = (v: unknown) => `"${String(v ?? '').replace(/^([=+\-@\t\r])/, "'$1").replace(/"/g, '""')}"`;
    const csv = ['nickname,email,feedback,entered_at', ...rows.map((r) => [r.nickname, r.email, r.message, r.created_at].map(esc).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'prism-run-lucky-draw.csv';
    a.click();
    msg.textContent = `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} exported.`;
  } catch (e) {
    msg.textContent = explain(e);
  }
});

// ---------- event: close the site, reset all data ----------
interface ModalOptions { title: string; body: HTMLElement; ok: string; danger?: boolean; type?: string }
/** A warning dialog. Resolves true only if the person confirms (and, if `type` is set, types that word). */
function confirmModal(o: ModalOptions): Promise<boolean> {
  const modal = $('modal');
  const box = modal.querySelector<HTMLElement>('.modal-box')!;
  const input = $<HTMLInputElement>('modal-input');
  const ok = $<HTMLButtonElement>('modal-ok');
  $('modal-title').textContent = o.title;
  const body = $('modal-body');
  body.innerHTML = '';
  body.append(o.body);
  box.classList.toggle('danger', !!o.danger);
  ok.textContent = o.ok;
  ok.classList.toggle('danger-btn', !!o.danger);
  input.hidden = !o.type;
  input.value = '';
  input.placeholder = o.type ? `Type ${o.type}` : '';
  ok.disabled = !!o.type;
  modal.hidden = false;
  if (o.type) input.focus();
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      modal.hidden = true;
      ok.removeEventListener('click', yes);
      $('modal-cancel').removeEventListener('click', no);
      input.removeEventListener('input', check);
      resolve(v);
    };
    const yes = () => done(true);
    const no = () => done(false);
    const check = () => (ok.disabled = input.value.trim() !== o.type);
    ok.addEventListener('click', yes);
    $('modal-cancel').addEventListener('click', no);
    input.addEventListener('input', check);
  });
}

let siteOpen = true;
async function loadEvent(): Promise<void> {
  try {
    const cfg = await call<Record<string, string>>('config');
    siteOpen = cfg.site_open !== 'false';
    $('site-state').textContent = siteOpen ? '🟢 OPEN: players can play' : '🔴 CLOSED: players see the forest';
    $('site-toggle').textContent = siteOpen ? 'Close the site…' : 'Reopen the site';
    $('site-toggle').classList.toggle('danger-btn', siteOpen);
  } catch (e) {
    $('site-state').textContent = explain(e);
  }
}
$('site-toggle').addEventListener('click', async () => {
  if (siteOpen) {
    const body = h('p', '', 'Anyone who opens the game will see the "We\'re closed" forest screen and cannot start a run. Players already mid-run can finish and save their score. You can reopen at any time.');
    if (!(await confirmModal({ title: 'Close the site?', body, ok: 'Close the site', danger: true }))) return;
  }
  try {
    await call('set-config', { key: 'site_open', value: String(!siteOpen) });
  } catch (e) {
    alert(explain(e));
  }
  void loadEvent();
});

$('reset-open').addEventListener('click', async () => {
  const msg = $('reset-msg');
  msg.className = 'msg';
  msg.textContent = '';
  let counts: Record<string, number> = {};
  try {
    counts = await call<Record<string, number>>('stats');
  } catch (e) {
    msg.className = 'msg err';
    msg.textContent = explain(e);
    return;
  }
  const body = h('div');
  body.append(h('p', '', 'This PERMANENTLY deletes:'));
  const ul = h('ul');
  for (const line of [
    `${counts.players ?? 0} players and their names`,
    `${counts.runs ?? 0} runs and the whole leaderboard`,
    `${counts.entries ?? 0} lucky draw entries (emails and feedback)`,
    'all live reactions',
  ]) ul.append(h('li', '', line));
  body.append(ul, h('p', '', 'Settings are kept. There is no undo. Download the lucky draw entries from the Export tab first if you need them.'));
  const yes = await confirmModal({ title: '⚠ Reset ALL data?', body, ok: 'Delete everything', danger: true, type: 'RESET' });
  if (!yes) return;
  try {
    const r = await call<{ deleted: Record<string, number> }>('reset', { confirm: 'RESET' });
    msg.textContent = `Done. Deleted ${r.deleted.players} players, ${r.deleted.runs} runs, ${r.deleted.entries} entries and ${r.deleted.reactions} reactions.`;
  } catch (e) {
    msg.className = 'msg err';
    msg.textContent = explain(e);
  }
});
