// The last card: the pixel forest as a full-screen backdrop, a thank-you on a wooden sign, plus a confetti button and emoji reactions that
// also show up on the big /leaderboard screen.
import { buzz } from '../game/haptics';
import { EMOJI_KINDS, REACTION_EMOJI, sendReaction, type ReactionKind } from '../net/reactions';
import { confetti } from './confetti';
import { floatEmoji } from './floaty';
import { startForest } from './forest';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/**
 * Builds the thank-you card into `b`. `screen` is the full results screen: the forest is its backdrop and it is the
 * confetti canvas. Returns a cleanup that stops the forest and removes the backdrop; call it when leaving the card.
 */
export function renderThanks(b: HTMLElement, screen: HTMLElement, opts: { entered: boolean; first: boolean }): () => void {
  b.classList.add('thanks');
  const canvas = el('canvas', 'forest forest-backdrop pix-crisp');
  canvas.setAttribute('aria-hidden', 'true');
  screen.prepend(canvas);
  screen.classList.add('thanks-on');
  // Keep the creatures clear of the buttons and navigation along the bottom.
  const forest = startForest(canvas, { bottomInset: 0.27 });

  const sign = el('div', 'pix-sign thanks-sign', 'THANK YOU!');
  sign.append(
    el('small', '', opts.entered ? "You're in the draw for a $10 Starbucks gift card. Good luck!" : 'Thanks for playing PRISM Run!'),
  );
  b.append(sign);

  const layer = el('div', 'react-layer');
  layer.setAttribute('aria-hidden', 'true');
  b.append(layer);

  const bar = el('div', 'react-bar');
  const party = el('button', 'pix-btn btn-confetti', '🎊 CONFETTI!');
  party.type = 'button';
  party.id = 'confetti-btn';
  party.addEventListener('click', () => {
    const s = screen.getBoundingClientRect();
    const r = party.getBoundingClientRect();
    confetti(screen, 150, { x: r.left - s.left + r.width / 2, y: r.top - s.top });
    buzz('party');
    forest.celebrate();
    sendReaction('confetti');
  });

  const row = el('div', 'react-row');
  for (const kind of EMOJI_KINDS) {
    const btn = el('button', 'pix-btn pix-btn--icon react-btn', REACTION_EMOJI[kind]);
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
    forest.celebrate();
    sendReaction(kind);
  }

  if (opts.first) {
    confetti(screen, 200);
    buzz('win');
    forest.celebrate();
  }

  return () => {
    forest.stop();
    canvas.remove();
    screen.classList.remove('thanks-on');
  };
}
