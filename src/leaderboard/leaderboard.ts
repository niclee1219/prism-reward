// /leaderboard: the "come and play" screen for a laptop. Polls the top 10, and every time somebody
// makes the board for the first time, or lands in the top 10, or steals the crown, it stages a show.
import QRCode from 'qrcode';
import '../ui/styles.css';
import './leaderboard.css';
import { NET } from '../config';
import { DISHES } from '../content/dishes';
import { reducedMotion } from '../game/perf';
import { api, type LeaderboardResult } from '../net/api';
import { createDemo } from './demo';
import { diffBoard, entryTarget, TOP_N, type BoardEvent, type Entry } from './diff';
import { Fx, Sound, type Stinger } from './fx';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $('lb-stage');
const rowsEl = $('rows');
const statusEl = $('status');
const kingEl = $('king');
const takeover = $('takeover');
const flash = $('flash');
const hint = $('hint');
const fx = new Fx($<HTMLCanvasElement>('fx'));
const sound = new Sound();

const demo = new URLSearchParams(location.search).has('demo') ? createDemo() : null;
const gameUrl = NET.GAME_URL || `${location.origin}/`;
void QRCode.toCanvas($<HTMLCanvasElement>('qr'), gameUrl, { width: 480, margin: 0, color: { dark: '#1b1b2f', light: '#fff6e0' } });

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fmt = (n: number) => n.toLocaleString('en');
const dishEmoji = (id?: string | null) => DISHES.find((d) => d.id === id)?.emoji;
const label = (e: Entry) => `${dishEmoji(e.dish) ? `${dishEmoji(e.dish)} ` : ''}${e.nickname}`;

// ---------- state ----------
let current: Entry[] | null = null;
let lastPlays = -1;
let failures = 0;
const rows = new Map<string, HTMLLIElement>();
/** Keys of new rows whose announcement has not played yet; they show as "??? INCOMING" until it does. */
const pending = new Set<string>();
const queue: BoardEvent[] = [];
let playing = false;
const history: string[] = [];

// ---------- number count-up ----------
const shown = new WeakMap<HTMLElement, number>();
function countTo(el: HTMLElement, to: number, ms = 900): void {
  const from = shown.get(el) ?? 0;
  shown.set(el, to);
  if (from === to || reducedMotion) {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * eased));
    if (k < 1 && shown.get(el) === to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- rows ----------
function makeRow(): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'row';
  li.innerHTML = '<span class="n"></span><span class="name"></span><span class="score"><i class="move"></i><b></b></span>';
  return li;
}

function renderRows(top: Entry[]): void {
  const before = new Map<string, number>();
  rows.forEach((el, key) => before.set(key, el.getBoundingClientRect().top));
  rowsEl.querySelectorAll('.row.open').forEach((el) => el.remove());

  const seen = new Set<string>();
  top.forEach((e) => {
    seen.add(e.key);
    let li = rows.get(e.key);
    if (!li) {
      li = makeRow();
      rows.set(e.key, li);
      if (pending.has(e.key)) li.classList.add('pending');
    }
    const oldRank = Number(li.dataset.rank ?? e.rank);
    li.dataset.rank = String(e.rank);
    (li.children[0] as HTMLElement).textContent = `#${e.rank}`;
    (li.children[1] as HTMLElement).textContent = `${label(e)}${e.served ? ' 🍽️' : ''}`;
    const score = li.children[2] as HTMLElement;
    countTo(score.querySelector('b')!, e.score);
    if (e.rank !== oldRank && !pending.has(e.key)) {
      const move = score.querySelector('.move') as HTMLElement;
      const up = e.rank < oldRank;
      move.className = `move ${up ? 'up' : 'down'}`;
      move.textContent = `${up ? '▲' : '▼'}${Math.abs(e.rank - oldRank)}`;
      setTimeout(() => (move.className = 'move'), 9000);
      if (up) replay(li, 'climb');
    }
    rowsEl.appendChild(li); // appending in rank order re-orders existing rows
  });
  rows.forEach((el, key) => {
    if (!seen.has(key)) {
      el.remove();
      rows.delete(key);
    }
  });
  // Empty slots, so a half-empty board reads as a dare rather than as a bug.
  for (let r = top.length + 1; r <= TOP_N; r++) {
    const li = document.createElement('li');
    li.className = 'row open';
    li.dataset.rank = String(r);
    li.innerHTML = `<span class="n">#${r}</span><span class="name">UP FOR GRABS</span><span></span>`;
    rowsEl.appendChild(li);
  }

  if (!reducedMotion) {
    rows.forEach((el, key) => {
      const was = before.get(key);
      if (was === undefined) return;
      const dy = was - el.getBoundingClientRect().top;
      if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.2,.9,.2,1)' });
    });
  }
}

function replay(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Lift a row out of "incoming" and slam it onto the board. */
function reveal(key: string): void {
  pending.delete(key);
  const li = rows.get(key);
  if (!li) return;
  li.classList.remove('pending');
  replay(li, 'slam');
  const r = li.getBoundingClientRect();
  fx.sparks(r.left + r.width / 2, r.top + r.height / 2, 60);
}

// ---------- side panel ----------
function renderSide(data: LeaderboardResult): void {
  const top = data.top;
  const king = top[0];
  const name = $('king-name');
  const prevName = name.textContent;
  name.textContent = king ? label(king) : 'UNCLAIMED';
  if (king) countTo($('king-score'), king.score);
  else $('king-score').textContent = '—';
  if (king && prevName !== 'UNCLAIMED' && prevName !== name.textContent) replay(kingEl, 'changed');

  const t = entryTarget(top);
  const big = $('target-big');
  const small = $('target-small');
  let nextBig: string;
  if (!top.length) [nextBig, small.textContent] = ['NOBODY YET', 'BE THE FIRST NAME ON THE BOARD'];
  else if (t.open) [nextBig, small.textContent] = [`${t.open} SPOT${t.open > 1 ? 'S' : ''} OPEN`, 'ANY SCORE GETS YOU IN'];
  else [nextBig, small.textContent] = [`BEAT ${fmt(t.cutoff)}`, 'TO ENTER THE TOP 10'];
  if (big.textContent !== nextBig) {
    big.textContent = nextBig;
    replay($('target'), 'bump');
  }

  if (data.total_plays !== lastPlays) {
    const plays = $('plays');
    countTo(plays, data.total_plays, 600);
    if (lastPlays >= 0) replay(plays, 'bump');
    lastPlays = data.total_plays;
  }
}

// ---------- ticker ----------
function renderTicker(top: Entry[]): void {
  const king = top[0];
  const items = [
    ...history,
    king ? `THINK YOU CAN BEAT ${king.nickname.toUpperCase()}? ${fmt(king.score)} POINTS TO BEAT` : 'THE BOARD IS EMPTY · BE THE FIRST',
    'SCAN THE QR · RUN · ANSWER · SERVE THE DISH',
    'TOP 10 GETS YOUR NAME IN LIGHTS',
  ];
  const track = $('ticker');
  const html = items.map((t) => `<span></span>`).join('');
  track.innerHTML = html + html; // doubled for a seamless loop
  track.querySelectorAll('span').forEach((s, i) => (s.textContent = items[i % items.length]));
  track.style.setProperty('--dur', `${Math.max(24, items.length * 9)}s`);
}

function remember(line: string): void {
  history.unshift(line);
  history.length = Math.min(history.length, 6);
}

// ---------- the show ----------
function enqueue(events: BoardEvent[]): void {
  queue.push(...events);
  // Never let the room wait more than a few beats: drop the oldest entries first, keep first/king.
  while (queue.length > 5) {
    const i = queue.findIndex((e) => e.type === 'entry');
    if (i < 0) break;
    reveal(queue[i].entry.key);
    queue.splice(i, 1);
  }
  void drain();
}

async function drain(): Promise<void> {
  if (playing) return;
  playing = true;
  while (queue.length) {
    const ev = queue.shift()!;
    await play(ev, queue.length >= 2);
  }
  playing = false;
  pending.forEach(reveal); // anything that never got its moment still must not stay hidden
}

function describe(ev: BoardEvent): { kind: string; kicker: string; title: string; sub: string; stinger: Stinger; sparks: number; cannons: number; rain: number; heat: number; ms: number } {
  const e = ev.entry;
  if (ev.type === 'first')
    return { kind: 'first', kicker: '🚨 THE BOARD IS OPEN 🚨', title: 'FIRST BLOOD', sub: 'SOMEBODY HAD TO GO FIRST. NOW BEAT THEM.', stinger: 'first', sparks: 120, cannons: 90, rain: 120, heat: 1, ms: 5600 };
  if (ev.type === 'king') {
    const lead = ev.previous ? e.score - ev.previous.score : 0;
    const sub = ev.previous ? `${ev.previous.nickname.toUpperCase()} HAS BEEN DETHRONED${lead > 0 ? ` BY ${fmt(lead)}` : ''}` : 'LONG MAY THEY REIGN';
    return { kind: 'king', kicker: '👑 THE CROWN CHANGES HANDS 👑', title: 'NEW KING', sub, stinger: 'king', sparks: 160, cannons: 160, rain: 200, heat: 1, ms: 6000 };
  }
  const podium = e.rank <= 3;
  const sub = ev.bumped ? `${ev.bumped.nickname.toUpperCase()} SLIPS TO #${ev.bumped.rank + 1}` : 'ENTERS THE TOP 10';
  return {
    kind: podium ? 'podium' : 'entry',
    kicker: podium ? '🏆 ON THE PODIUM' : '🔥 NEW CHALLENGER',
    title: `#${e.rank}`,
    sub,
    stinger: podium ? 'podium' : 'entry',
    sparks: podium ? 80 : 50,
    cannons: podium ? 50 : 0,
    rain: podium ? 40 : 0,
    heat: podium ? 0.85 : 0.6,
    ms: podium ? 4200 : 3400,
  };
}

async function play(ev: BoardEvent, rushed: boolean): Promise<void> {
  const key = ev.entry.key;
  const live = current?.find((e) => e.key === key);
  if (!live) return; // knocked off the board again before its turn: skip
  const d = describe(ev);
  const ms = rushed ? d.ms * 0.6 : d.ms;

  remember(
    ev.type === 'first'
      ? `${ev.entry.nickname.toUpperCase()} OPENS THE BOARD WITH ${fmt(live.score)}`
      : ev.type === 'king'
        ? `${ev.entry.nickname.toUpperCase()} TAKES THE CROWN WITH ${fmt(live.score)}`
        : `${ev.entry.nickname.toUpperCase()} ENTERS AT #${live.rank} WITH ${fmt(live.score)}`,
  );
  if (current) renderTicker(current);

  $('to-kicker').textContent = d.kicker;
  $('to-title').textContent = d.title;
  $('to-name').textContent = label(ev.entry);
  const score = $('to-score');
  shown.delete(score);
  score.textContent = '0';
  $('to-sub').textContent = d.sub;
  takeover.className = `takeover kind-${d.kind}`;
  takeover.hidden = false;
  setTimeout(() => countTo(score, live.score, 1100), 600);

  sound.play(d.stinger);
  fx.boost(d.heat);
  replay(flash, 'go');
  stage.classList.remove('shake');
  void stage.offsetWidth;
  stage.classList.add('shake');
  if (d.cannons) setTimeout(() => fx.cannons(d.cannons), 350);
  if (d.rain) setTimeout(() => fx.rain(d.rain), 700);
  setTimeout(() => fx.sparks(innerWidth / 2, innerHeight / 2, d.sparks), 250);
  if (ev.type !== 'entry') setTimeout(() => fx.sparks(innerWidth / 2, innerHeight / 2, d.sparks), 1100);

  await sleep(ms);
  takeover.classList.add('out');
  await sleep(300);
  takeover.hidden = true;
  reveal(key);
  sound.play('thud');
  replay(flash, 'go');
  await sleep(rushed ? 250 : 900);
}

// ---------- data ----------
function onData(data: LeaderboardResult): void {
  const top: Entry[] = data.top;
  const events = diffBoard(current, top);
  const known = new Set((current ?? []).map((e) => e.key));
  for (const ev of events) if (!known.has(ev.entry.key)) pending.add(ev.entry.key);
  renderRows(top);
  renderSide(data);
  current = top;
  if (!history.length || events.length === 0) renderTicker(top);
  enqueue(events);
}

async function poll(): Promise<void> {
  try {
    onData(await (demo ? demo.fetch() : api<LeaderboardResult>(`/leaderboard?limit=${TOP_N}`)));
    failures = 0;
    statusEl.textContent = demo ? '● DEMO' : '● LIVE';
    statusEl.className = 'status live';
  } catch {
    failures++;
    statusEl.textContent = '● RECONNECTING';
    statusEl.className = 'status down';
  }
  setTimeout(poll, failures > 3 ? Math.min(NET.BOARD_POLL_MS * 2.5, 5000) : NET.BOARD_POLL_MS);
}

// ---------- room controls: sound unlock, fullscreen, screen wake ----------
function showHint(text: string, ms = 3500): void {
  hint.textContent = text;
  hint.classList.add('show');
  setTimeout(() => hint.classList.remove('show'), ms);
}
const unlock = () => {
  const was = sound.ready;
  sound.unlock();
  if (!was) showHint('🔊 SOUND ON · M mutes · F fullscreen');
};
addEventListener('pointerdown', unlock);
addEventListener('keydown', (ev) => {
  unlock();
  const k = ev.key.toLowerCase();
  if (k === 'm') {
    sound.muted = !sound.muted;
    showHint(sound.muted ? '🔇 MUTED' : '🔊 SOUND ON');
  } else if (k === 'f') {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  } else if (demo && k === ' ') demo.add();
  else if (demo && k === 'k') demo.add(true);
  else if (demo && k === 'r') demo.reset();
});
async function keepAwake(): Promise<void> {
  try {
    await navigator.wakeLock?.request('screen');
  } catch {
    /* not supported, or the tab is hidden */
  }
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void keepAwake());
void keepAwake();
showHint(demo ? 'DEMO · SPACE adds a player · K crowns a new king · R resets · click for sound' : 'click once to enable sound · F fullscreen', 6000);

renderRows([]);
void poll();
