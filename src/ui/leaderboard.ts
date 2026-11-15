// In-game leaderboard: top 10 with the player's own row highlighted (or pinned below when outside the top 10).
import { DISHES } from '../content/dishes';
import { api, type LeaderboardResult } from '../net/api';
import { deviceId, local } from '../net/device';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function row(rank: number, name: string, score: number, opts: { dish?: string | null; served?: boolean; you?: boolean; delay: number }): HTMLLIElement {
  const li = el('li', `lb-row${opts.you ? ' you' : ''}${rank <= 3 ? ` top${rank}` : ''}`);
  li.style.setProperty('--d', `${opts.delay}ms`);
  const dish = DISHES.find((d) => d.id === opts.dish);
  li.append(
    el('span', 'lb-rank', `#${rank}`), // the top 3 are coloured gold, silver, bronze (as on the big screen)
    el('span', 'lb-name', `${dish ? `${dish.emoji} ` : ''}${name}${opts.served ? ' 🍽️' : ''}${opts.you ? ' (you)' : ''}`),
    el('span', 'lb-score', score.toLocaleString('en')),
  );
  return li;
}

/** Fills `into` with a live leaderboard. Returns nothing; shows its own loading and error states. */
export function mountLeaderboard(into: HTMLElement, limit = 10): void {
  into.innerHTML = '';
  const list = el('ol', 'lb-list');
  for (let i = 0; i < 6; i++) list.append(el('li', 'lb-row skeleton'));
  const foot = el('div', 'lb-foot');
  into.append(list, foot);

  const load = async () => {
    try {
      const data = await api<LeaderboardResult>(`/leaderboard?limit=${limit}&device_id=${encodeURIComponent(deviceId())}`);
      if (!into.isConnected) return;
      list.innerHTML = '';
      const mine = (local.locked ?? '').toLowerCase();
      if (!data.top.length) {
        list.append(el('li', 'lb-empty', 'No scores yet. Be the first on the board!'));
      }
      let youShown = false;
      data.top.forEach((e, i) => {
        const you = !!mine && e.nickname.toLowerCase() === mine;
        youShown ||= you;
        list.append(row(e.rank, e.nickname, e.score, { dish: e.dish, served: e.served, you, delay: i * 55 }));
      });
      if (!youShown && data.me && local.locked) {
        list.append(el('li', 'lb-gap', '⋯'));
        list.append(row(data.me.rank, local.locked, data.me.score, { you: true, delay: data.top.length * 55 + 80 }));
      }
      foot.textContent = `${data.total_players.toLocaleString('en')} players · ${data.total_plays.toLocaleString('en')} runs`;
    } catch {
      if (!into.isConnected) return;
      list.innerHTML = '';
      const msg = el('li', 'lb-empty', "Can't reach the leaderboard.");
      const retry = el('button', 'pix-btn pix-btn--cream link-btn', 'TRY AGAIN');
      retry.type = 'button';
      retry.addEventListener('click', () => mountLeaderboard(into, limit));
      msg.append(document.createElement('br'), retry);
      list.append(msg);
    }
  };
  void load();
}

/** Full-screen overlay opened from the start screen. */
export function showLeaderboard(root: HTMLElement): void {
  root.innerHTML = '';
  root.hidden = false;
  const title = el('h2', 'ov-title', '🏆 LEADERBOARD');
  const body = el('div', 'lb-body');
  const close = el('button', 'pix-btn pix-btn--cream btn', 'CLOSE');
  close.type = 'button';
  close.addEventListener('click', () => {
    root.hidden = true;
    root.innerHTML = '';
  });
  root.append(title, body, close);
  mountLeaderboard(body);
}
