// /leaderboard: the "come and play" screen for a laptop. Polls the top 10 and the latest runs, and
// stages a show for every finisher: a small one for a run outside the top 10, a bigger one for a new
// high score or a climb, and the full works for landing in the top 10 or stealing the crown.
import QRCode from 'qrcode';
import '../ui/styles.css';
import './leaderboard.css';
import { NET } from '../config';
import { DISHES } from '../content/dishes';
import { reducedMotion } from '../game/perf';
import { api, type LeaderboardResult } from '../net/api';
import { createDemo } from './demo';
import { diffBoard, diffRuns, entryTarget, TOP_N, weight, type BoardEvent, type Entry } from './diff';
import { Fx, Sound, type Stinger } from './fx';
import { startSkyline } from '../scene/skyline';
import { planReactions } from './reactions';
import { REACTION_EMOJI, type ReactionKind, type ReactionsResult } from '../net/reactions';

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

// The night-market skyline behind everything; the clock tower stands in the gap between the list and the side panel.
const gap = $('sky-gap');
startSkyline($<HTMLCanvasElement>('sky'), {
  towerX: () => {
    const r = gap.getBoundingClientRect();
    return (r.left + r.width / 2) / innerWidth;
  },
});

const demo = new URLSearchParams(location.search).has('demo') ? createDemo() : null;
const gameUrl = NET.GAME_URL || `${location.origin}/`;
void QRCode.toCanvas($<HTMLCanvasElement>('qr'), gameUrl, { width: 480, margin: 0, color: { dark: '#1b1b2f', light: '#fff6e0' } });

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fmt = (n: number) => n.toLocaleString('en');
const dishEmoji = (id?: string | null) => DISHES.find((d) => d.id === id)?.emoji;
const label = (e: Entry) => `${dishEmoji(e.dish) ? `${dishEmoji(e.dish)} ` : ''}${e.nickname}`;

// ---------- state ----------
let current: Entry[] | null = null;
/** Run ids already shown (or already there when the screen opened); null until the first poll. */
let seenRuns: Set<string> | null = null;
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

/** Light up a row that is already on the board (a climb or a new high score). */
function highlight(key: string): void {
  const li = rows.get(key);
  if (!li) return;
  replay(li, 'climb');
  const r = li.getBoundingClientRect();
  fx.sparks(r.left + r.width / 2, r.top + r.height / 2, 40);
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
  // Never let the room wait more than a few beats: drop the smallest moments first (runs, then
  // records, climbs, entries; oldest first among equals), and never first/king.
  while (queue.length > 6) {
    let drop = -1;
    queue.forEach((e, i) => {
      if (e.type !== 'first' && e.type !== 'king' && (drop < 0 || weight(e) < weight(queue[drop]))) drop = i;
    });
    if (drop < 0) break;
    const [ev] = queue.splice(drop, 1);
    if (ev.type === 'entry') reveal(ev.entry.key);
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

interface Show {
  kind: string;
  kicker: string;
  title: string;
  sub: string;
  stinger: Stinger;
  sparks: number;
  cannons: number;
  rain: number;
  heat: number;
  ms: number;
  /** Screen shake and white flash: only for moments that change the top 10. */
  big: boolean;
  /** What the score counts up to on the card. */
  score: number;
  ticker: string;
}

function describe(ev: BoardEvent): Show {
  const e = ev.entry;
  const who = e.nickname.toUpperCase();
  const base = { cannons: 0, rain: 0, big: true, score: e.score };
  switch (ev.type) {
    case 'first':
      return { ...base, kind: 'first', kicker: '🚨 THE BOARD IS OPEN 🚨', title: 'FIRST BLOOD', sub: 'SOMEBODY HAD TO GO FIRST. NOW BEAT THEM.', stinger: 'first', sparks: 120, cannons: 90, rain: 120, heat: 1, ms: 5600, ticker: `${who} OPENS THE BOARD WITH ${fmt(e.score)}` };
    case 'king': {
      const lead = ev.previous ? e.score - ev.previous.score : 0;
      const sub = ev.previous ? `${ev.previous.nickname.toUpperCase()} HAS BEEN DETHRONED${lead > 0 ? ` BY ${fmt(lead)}` : ''}` : 'LONG MAY THEY REIGN';
      return { ...base, kind: 'king', kicker: '👑 THE CROWN CHANGES HANDS 👑', title: 'NEW KING', sub, stinger: 'king', sparks: 160, cannons: 160, rain: 200, heat: 1, ms: 6000, ticker: `${who} TAKES THE CROWN WITH ${fmt(e.score)}` };
    }
    case 'entry': {
      const podium = e.rank <= 3;
      return {
        ...base,
        kind: podium ? 'podium' : 'entry',
        kicker: podium ? '🏆 ON THE PODIUM' : '🔥 NEW CHALLENGER',
        title: `#${e.rank}`,
        sub: ev.bumped ? `${ev.bumped.nickname.toUpperCase()} SLIPS TO #${ev.bumped.rank + 1}` : 'ENTERS THE TOP 10',
        stinger: podium ? 'podium' : 'entry',
        sparks: podium ? 80 : 50,
        cannons: podium ? 50 : 0,
        rain: podium ? 40 : 0,
        heat: podium ? 0.85 : 0.6,
        ms: podium ? 4200 : 3400,
        ticker: `${who} ENTERS AT #${e.rank} WITH ${fmt(e.score)}`,
      };
    }
    case 'climb': {
      const [first, ...rest] = ev.passed;
      const passed = first ? `OVERTAKES ${first.nickname.toUpperCase()}${rest.length ? ` +${rest.length} MORE` : ''}` : `+${fmt(ev.gain)} POINTS`;
      const podium = e.rank <= 3;
      return { ...base, kind: 'climb', kicker: podium ? '🏆 CLIMBS ONTO THE PODIUM' : '📈 ON THE RISE', title: `#${ev.from} ▸ #${e.rank}`, sub: passed, stinger: 'climb', sparks: 70, cannons: podium ? 40 : 0, heat: 0.7, ms: 3800, ticker: `${who} CLIMBS TO #${e.rank} WITH ${fmt(e.score)}` };
    }
    case 'record':
      return { ...base, kind: 'record', kicker: '⭐ NEW HIGH SCORE', title: `+${fmt(ev.gain)}`, sub: e.rank === 1 ? 'THE KING RAISES THE BAR' : `HOLDS ON TO #${e.rank}`, stinger: 'climb', sparks: 50, heat: 0.55, ms: 3200, ticker: `${who} RAISES THEIR BEST TO ${fmt(e.score)}` };
    case 'run': {
      const r = ev.run;
      const cutoff = current ? entryTarget(current).cutoff : 0;
      const sub =
        e.rank > TOP_N
          ? `${fmt(Math.max(1, cutoff - e.score + 1))} POINTS FROM THE TOP 10`
          : r.best
            ? `#${e.rank} ON THE BOARD`
            : `BEST STAYS ${fmt(e.score)} AT #${e.rank}`;
      return {
        ...base,
        big: false,
        score: r.run_score,
        kind: 'run',
        kicker: r.first ? '🏁 NEW RUNNER' : r.best ? '⭐ PERSONAL BEST' : '🔁 BACK FOR MORE',
        title: `#${e.rank}`,
        sub,
        stinger: 'run',
        sparks: 30,
        heat: 0.35,
        ms: 2600,
        ticker: `${who} FINISHES ${r.first ? 'THEIR FIRST RUN ' : ''}WITH ${fmt(r.run_score)}`,
      };
    }
  }
}

async function play(ev: BoardEvent, rushed: boolean): Promise<void> {
  const key = ev.entry.key;
  if (ev.type !== 'run') {
    const live = current?.find((e) => e.key === key);
    if (!live) return; // knocked off the board again before its turn: skip
    // Entries show where the player stands now; a climb or record keeps the rank it reached, or a
    // later king pushing the climber down would turn "#10 ▸ #9" into "#10 ▸ #10".
    if (ev.type !== 'climb' && ev.type !== 'record') ev = { ...ev, entry: live };
  }
  const d = describe(ev);
  const ms = rushed ? d.ms * 0.6 : d.ms;

  remember(d.ticker);
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
  setTimeout(() => countTo(score, d.score, d.big ? 1100 : 800), d.big ? 600 : 400);

  sound.play(d.stinger);
  fx.boost(d.heat);
  if (d.big) {
    replay(flash, 'go');
    stage.classList.remove('shake');
    void stage.offsetWidth;
    stage.classList.add('shake');
  }
  if (d.cannons) setTimeout(() => fx.cannons(d.cannons), 350);
  if (d.rain) setTimeout(() => fx.rain(d.rain), 700);
  setTimeout(() => fx.sparks(innerWidth / 2, innerHeight / 2, d.sparks), 250);
  if (ev.type === 'first' || ev.type === 'king') setTimeout(() => fx.sparks(innerWidth / 2, innerHeight / 2, d.sparks), 1100);

  await sleep(ms);
  takeover.classList.add('out');
  await sleep(300);
  takeover.hidden = true;
  if (ev.type === 'climb' || ev.type === 'record') highlight(key);
  else if (ev.type !== 'run') {
    reveal(key);
    sound.play('thud');
    replay(flash, 'go');
  }
  await sleep(rushed ? 250 : d.big ? 900 : 500);
}

// ---------- data ----------
function onData(data: LeaderboardResult): void {
  const top: Entry[] = data.top;
  const recent = data.recent ?? [];
  const boardEvents = diffBoard(current, top);
  const runEvents = diffRuns(seenRuns, recent, new Set(boardEvents.map((e) => e.entry.key)));
  seenRuns = new Set([...(seenRuns ?? []), ...recent.map((r) => r.id)].slice(-200));
  const known = new Set((current ?? []).map((e) => e.key));
  for (const ev of boardEvents) if (!known.has(ev.entry.key)) pending.add(ev.entry.key);
  renderRows(top);
  renderSide(data);
  current = top;
  if (!history.length || boardEvents.length + runEvents.length === 0) renderTicker(top);
  enqueue([...runEvents, ...boardEvents]);
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

// ---------- reactions from phones: confetti and emoji ----------
let since = -1; // -1: the first poll only learns the newest id, it does not replay old reactions
const fakeReactions: { id: number; kind: ReactionKind }[] = []; // ?demo: filled by the keyboard
let fakeId = 0;

function showReactions(items: { kind: ReactionKind }[], spreadMs: number): void {
  const plan = planReactions(items);
  for (let i = 0; i < plan.bursts; i++) {
    setTimeout(() => {
      fx.cannons(90); // 45 pieces from each cannon
      fx.rain(36);
      fx.boost(0.55);
    }, i * 250);
  }
  // Spread the emoji across the poll interval so they stream up instead of arriving in one clump.
  plan.emoji.forEach((kind, i) => setTimeout(() => fx.emoji(REACTION_EMOJI[kind]), (i / Math.max(1, plan.emoji.length)) * spreadMs));
}

async function pollReactions(): Promise<void> {
  try {
    const r: ReactionsResult = demo
      ? { latest: fakeId, items: fakeReactions.splice(0) }
      : await api<ReactionsResult>(`/reactions?since=${since}`);
    since = r.latest; // also resets cleanly if the server's ids went backwards
    if (r.items.length) showReactions(r.items, NET.REACTION_POLL_MS * 0.9);
  } catch {
    /* reactions are decoration: never let them disturb the board */
  }
  setTimeout(pollReactions, NET.REACTION_POLL_MS);
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
  else if (demo && k === 'j') demo.improve();
  else if (demo && k === 'l') demo.miss();
  else if (demo && k === 'r') demo.reset();
  else if (demo && k === 'c') fakeReactions.push({ id: ++fakeId, kind: 'confetti' });
  else if (demo && k === 'e') {
    const kinds: ReactionKind[] = ['heart', 'like', 'fire', 'penguin', 'party'];
    for (let i = 0; i < 4; i++) fakeReactions.push({ id: ++fakeId, kind: kinds[(Math.random() * kinds.length) | 0] });
  }
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
showHint(demo ? 'DEMO · SPACE adds a player · K crowns a new king · J a climb · L a run outside the top 10 · C confetti · E emoji · R resets · click for sound' : 'click once to enable sound · F fullscreen', 6000);

renderRows([]);
void poll();
void pollReactions();
