// Booth TV leaderboard. Polls every 2 seconds, so it recovers by itself after a dropped connection.
import QRCode from 'qrcode';
import '../ui/styles.css';
import './board.css';
import { NET } from '../config';
import { DISHES } from '../content/dishes';
import { api, type LeaderboardResult } from '../net/api';
import { startSkyline } from '../scene/skyline';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const rowsEl = $('rows');
const statusEl = $('status');
const kingEl = $('king');
const kingName = $('king-name');
const playsEl = $('plays');
const emptyEl = $('empty');

const gap = $('sky-gap');
startSkyline($<HTMLCanvasElement>('sky'), {
  towerX: () => {
    const r = gap.getBoundingClientRect();
    return (r.left + r.width / 2) / innerWidth;
  },
});

const gameUrl = NET.GAME_URL || `${location.origin}/`;
void QRCode.toCanvas($<HTMLCanvasElement>('qr'), gameUrl, { width: 640, margin: 1, color: { dark: '#1b1b2f', light: '#fff6e0' } });

const rows = new Map<string, HTMLLIElement>();
let lastKing = '';
let lastPlays = -1;
let failures = 0;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function render(data: LeaderboardResult): void {
  emptyEl.hidden = data.top.length > 0;

  // FLIP: remember where each row was, re-order, then animate from the old position.
  const before = new Map<string, number>();
  rows.forEach((el, key) => before.set(key, el.getBoundingClientRect().top));
  const oldRank = new Map<string, number>();
  rows.forEach((el, key) => oldRank.set(key, Number(el.dataset.rank)));

  const seen = new Set<string>();
  data.top.forEach((entry) => {
    seen.add(entry.key);
    let li = rows.get(entry.key);
    const isNew = !li;
    if (!li) {
      li = document.createElement('li');
      li.innerHTML = '<span class="n"></span><span class="name"></span><span class="score"></span>';
      rows.set(entry.key, li);
    }
    li.className = `row r${entry.rank}`;
    li.dataset.rank = String(entry.rank);
    (li.children[0] as HTMLElement).textContent = `#${entry.rank}`;
    // Dish emoji before the name, and a plate for players who served the full recipe.
    const dish = DISHES.find((d) => d.id === entry.dish);
    (li.children[1] as HTMLElement).textContent = `${dish ? `${dish.emoji} ` : ''}${entry.nickname}${entry.served ? ' 🍽️' : ''}`;
    (li.children[2] as HTMLElement).textContent = entry.score.toLocaleString('en');
    rowsEl.appendChild(li); // appending in rank order re-orders existing rows
    if (isNew && lastPlays >= 0) li.classList.add('new');
    else if (!isNew && entry.rank < (oldRank.get(entry.key) ?? entry.rank)) li.classList.add('up');
  });
  rows.forEach((el, key) => {
    if (!seen.has(key)) {
      el.remove();
      rows.delete(key);
    }
  });

  if (!reduced) {
    rows.forEach((el, key) => {
      const was = before.get(key);
      if (was === undefined) return;
      const dy = was - el.getBoundingClientRect().top;
      if (!dy) return;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }

  const king = data.top[0];
  kingEl.hidden = !king;
  if (king) {
    kingName.textContent = king.nickname;
    if (lastKing && lastKing !== king.key) {
      kingEl.classList.remove('changed');
      void kingEl.offsetWidth;
      kingEl.classList.add('changed');
    }
    lastKing = king.key;
  }

  if (data.total_plays !== lastPlays) {
    playsEl.textContent = data.total_plays.toLocaleString('en');
    if (lastPlays >= 0) {
      playsEl.classList.remove('bump');
      void playsEl.offsetWidth;
      playsEl.classList.add('bump');
    }
    lastPlays = data.total_plays;
  }
}

async function poll(): Promise<void> {
  try {
    render(await api<LeaderboardResult>('/leaderboard?limit=10'));
    failures = 0;
    statusEl.textContent = '● LIVE';
    statusEl.className = 'status live';
  } catch {
    failures++;
    statusEl.textContent = '● reconnecting...';
    statusEl.className = 'status down';
  }
  // Back off a little while the connection is down, but never stop trying.
  setTimeout(poll, failures > 3 ? Math.min(NET.BOARD_POLL_MS * 2.5, 5000) : NET.BOARD_POLL_MS);
}
void poll();
