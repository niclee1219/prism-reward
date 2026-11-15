// The prize screen: show it to the PRISM team, who hold DONE to mark it handed over.
// A redeemed code is remembered on the device (localStorage + cookie) and never shown as a prize again.
import { buzz } from '../game/haptics';
import { local, type WonPrize } from '../net/device';
import { confetti } from './confetti';

const HOLD_MS = 900;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/**
 * Builds the prize screen into `host`. `onRedeemed` runs once the team has marked it done
 * (not when the screen is opened for a code that was already redeemed).
 */
export function renderPrize(host: HTMLElement, p: WonPrize, onRedeemed?: () => void): void {
  host.classList.add('prize-screen');
  const won = p.won !== false;
  const head = el('h2', `headline ${won ? 'served' : 'timeup'}`, won ? 'YOU WON!' : 'SO CLOSE!');
  const prompt = el('div', 'show-team');
  prompt.append(el('span', 'megaphone', '📣'), el('b', '', 'Show this screen to the PRISM team'));

  const card = el('div', 'redeem');
  card.id = 'redeem';
  const live = el('div', 'live');
  const clock = el('span');
  live.append(el('i'), clock);
  // A live clock proves it is this phone, now, not a screenshot.
  const tick = () => {
    clock.textContent = `LIVE ${new Date().toLocaleTimeString('en-GB')}`;
    if (card.isConnected || !card.dataset.started) setTimeout(tick, 1000);
    card.dataset.started = '1';
  };
  tick();
  const stamp = el('div', 'stamp', 'REDEEMED');
  card.append(el('div', 'prize', p.name), el('div', 'code', p.code), live, el('small', '', `${p.nickname ?? local.locked ?? ''}`.trim() || 'PRISM Run'), stamp);

  // Staff-only: press and hold, so a player cannot mark it by tapping around.
  const done = el('button', 'staff-done');
  done.type = 'button';
  done.id = 'staff-done';
  done.append(el('i', 'fill'), el('span', '', 'PRISM TEAM: HOLD TO MARK DONE'));
  const after = el('div', 'redeemed-msg', '✔ Redeemed. Enjoy, and thanks for playing!');

  host.append(head, prompt, card, done, after);

  const setRedeemed = (fresh: boolean) => {
    host.classList.add('is-redeemed');
    head.textContent = 'REDEEMED';
    head.className = 'headline served';
    done.remove();
    if (fresh) {
      buzz('win');
      confetti(host.closest('.screen') ?? host, 120);
      onRedeemed?.();
    }
  };
  if (local.isRedeemed(p.code)) return setRedeemed(false);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const start = (e: Event) => {
    e.preventDefault();
    if (timer) return;
    done.classList.add('holding');
    buzz('tick');
    timer = setTimeout(() => {
      timer = undefined;
      local.markRedeemed(p.code);
      setRedeemed(true);
    }, HOLD_MS);
  };
  const cancel = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = undefined;
    done.classList.remove('holding');
  };
  done.addEventListener('pointerdown', start);
  done.addEventListener('pointerup', cancel);
  done.addEventListener('pointerleave', cancel);
  done.addEventListener('pointercancel', cancel);
  done.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press menu on phones
  done.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start(e);
  });
  done.addEventListener('keyup', cancel);
}

/** On start-up (and from the start screen): bring back a prize that has not been handed over yet. */
export function showPendingPrize(root: HTMLElement, onClose?: () => void): boolean {
  const pending = local.unredeemed[0];
  if (!pending) return false;
  root.innerHTML = '';
  root.hidden = false;
  const body = el('div', 'beat prize-pending');
  const close = el('button', 'link-btn', 'Later');
  close.type = 'button';
  const finish = () => {
    root.hidden = true;
    root.innerHTML = '';
    onClose?.();
  };
  // Before redeeming: "Later". After: "Close", or on to the next prize if there is one.
  close.addEventListener('click', () => (local.isRedeemed(pending.code) && local.unredeemed.length ? showPendingPrize(root, onClose) : finish()));
  renderPrize(body, pending, () => {
    close.textContent = local.unredeemed.length ? 'Next prize ▸' : 'Close';
    close.className = 'btn';
  });
  root.append(body, close);
  return true;
}
