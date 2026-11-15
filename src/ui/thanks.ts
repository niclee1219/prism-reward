// The last card: a thank-you from the beaver, plus a confetti button and emoji reactions that
// also show up on the big /leaderboard screen.
import { buzz } from '../game/haptics';
import { EMOJI_KINDS, REACTION_EMOJI, sendReaction, type ReactionKind } from '../net/reactions';
import { mountBeaver } from './beaver';
import { confetti } from './confetti';
import { floatEmoji } from './floaty';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Builds the thank-you card into `b`. `screen` is the full results screen, used as the confetti canvas. */
export function renderThanks(b: HTMLElement, screen: HTMLElement, opts: { entered: boolean; first: boolean }): void {
  b.classList.add('thanks');
  b.append(el('h2', 'thanks-title', 'THANK YOU!'));
  const stage = el('div', 'beaver-stage');
  b.append(stage);
  b.append(
    el(
      'p',
      'thanks-sub',
      opts.entered ? "You're in the draw for a $10 Starbucks gift card. Good luck!" : 'Thanks for playing PRISM Run!',
    ),
  );

  const layer = el('div', 'react-layer');
  layer.setAttribute('aria-hidden', 'true');
  b.append(layer);

  const beaver = mountBeaver(stage);

  const bar = el('div', 'react-bar');
  const party = el('button', 'btn btn-confetti', '🎊 CONFETTI!');
  party.type = 'button';
  party.id = 'confetti-btn';
  party.addEventListener('click', () => {
    const s = screen.getBoundingClientRect();
    const r = party.getBoundingClientRect();
    confetti(screen, 150, { x: r.left - s.left + r.width / 2, y: r.top - s.top });
    buzz('party');
    beaver.cheer();
    sendReaction('confetti');
  });

  const row = el('div', 'react-row');
  for (const kind of EMOJI_KINDS) {
    const btn = el('button', 'react-btn', REACTION_EMOJI[kind]);
    btn.type = 'button';
    btn.dataset.kind = kind;
    btn.setAttribute('aria-label', `React ${kind}`);
    btn.addEventListener('click', () => react(kind, btn));
    row.append(btn);
  }
  bar.append(party, row);
  b.append(bar);

  function react(kind: ReactionKind, from: HTMLElement): void {
    const l = layer.getBoundingClientRect();
    const r = from.getBoundingClientRect();
    floatEmoji(layer, REACTION_EMOJI[kind], { x: r.left - l.left + r.width / 2, y: r.top - l.top });
    buzz('pop');
    sendReaction(kind);
  }

  if (opts.first) {
    confetti(screen, 200);
    buzz('win');
    beaver.cheer();
  }
}
