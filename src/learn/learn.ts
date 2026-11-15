// Learn mode: ten full-screen pixel scenes that show, by doing, how PRISM works (a RAG system over a codebase).
// This controller owns the frame around the scenes: the progress dots and SKIP at the top, the one line of text, the
// stamp that names each step once it is done, and BACK / NEXT (or the "what to do" text while a step is pending).
// The scenes themselves are in scenes.ts; the words are in src/content/learn.ts.
//
//   const learn = openLearn(root, { onSeen, onClose });   // root: the empty #screen-learn section
//   learn.close();                                        // stops everything; onClose is called
//
// No timers advance anything, nothing is scored, nothing goes over the network.
import './learn.css';
import { LEARN_ENDING, LEARN_SCENES } from '../content/learn';
import { buzz } from '../game/haptics';
import { reducedMotion } from '../scene/pixelCanvas';
import { ending, SCENES, type LearnState, type SceneEnv, type SceneHandle } from './scenes';

export interface LearnOptions {
  /** The visitor finished (tapped FINISH) or skipped: they have seen Learn. */
  onSeen(): void;
  /** Learn has closed (PLAY on the ending, SKIP, or close()). */
  onClose(): void;
}

export interface LearnHandle {
  close(): void;
  /** True once the visitor has moved past the first scene or done anything. */
  readonly touched: boolean;
}

/** Waiting this long on an unfinished step brings up the pointing hint. */
const HINT_MS = 5000;
/** Taps closer together than this on the navigation are treated as one (no skipping a scene by double-tapping). */
const NAV_GUARD_MS = 350;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function openLearn(root: HTMLElement, opts: LearnOptions): LearnHandle {
  root.innerHTML = '';
  root.hidden = false;
  root.classList.add('learn');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'How PRISM works');

  const layer = el('div', 'learn-layer');
  const top = el('div', 'learn-top');
  const dots = el('div', 'learn-dots');
  dots.setAttribute('aria-hidden', 'true');
  const count = el('span', 'sr');
  const skip = el('button', 'pix-btn pix-btn--cream link-btn learn-skip', 'SKIP ▸▸');
  skip.type = 'button';
  skip.setAttribute('aria-label', 'Skip the explainer');
  top.append(dots, count, skip);
  const line = el('p', 'learn-line pix-panel');
  line.setAttribute('aria-live', 'polite');
  const band = el('div', 'learn-band');
  const stamp = el('div', 'learn-stamp');
  stamp.setAttribute('role', 'status');
  stamp.hidden = true;
  const hand = el('i', 'learn-hand', '👆');
  hand.setAttribute('aria-hidden', 'true');
  hand.hidden = true;
  const nav = el('div', 'nav-row learn-nav');
  const back = el('button', 'pix-btn pix-btn--cream btn btn-back', '◂');
  back.type = 'button';
  back.setAttribute('aria-label', 'Back');
  const todo = el('div', 'learn-todo');
  todo.setAttribute('aria-live', 'polite');
  const next = el('button', 'pix-btn btn learn-next');
  next.type = 'button';
  nav.append(back, todo, next);
  root.append(layer, top, line, band, stamp, hand, nav);

  const state: LearnState = { question: null, done: new Set(), signs: new Set() };
  const total = LEARN_SCENES.length;
  let i = 0; // 0..total-1 are the scenes; total is the ending
  let scene: SceneHandle | null = null;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
  let dockTimer: ReturnType<typeof setTimeout> | undefined;
  let lastNav = 0;
  let enteredAt = 0;
  let touched = false;
  let open = true;

  const clearHint = () => {
    clearTimeout(hintTimer);
    root.classList.remove('hinting');
    hand.hidden = true;
  };
  const showHint = () => {
    const target = root.querySelector<HTMLElement>('.learn-target:not(.done):not([hidden])');
    if (!target || !open) return;
    const r = target.getBoundingClientRect();
    const R = root.getBoundingClientRect();
    hand.style.left = `${r.left - R.left + r.width / 2}px`;
    hand.style.top = `${r.top - R.top + r.height * 0.7}px`;
    hand.hidden = false;
    root.classList.add('hinting');
  };
  const armHint = () => {
    clearHint();
    const s = LEARN_SCENES[i];
    if (i < total && s.todo && !state.done.has(s.id)) hintTimer = setTimeout(showHint, HINT_MS);
  };

  /** NEXT, or the "what to do" text while the step is pending. */
  const showNext = (ready: boolean) => {
    next.hidden = !ready;
    todo.hidden = ready;
    clearTimeout(nudgeTimer);
    next.classList.remove('nudge');
    // A gentle nudge on NEXT if the visitor lingers once it is there.
    if (ready && !reducedMotion) nudgeTimer = setTimeout(() => next.classList.add('nudge'), 7000);
  };

  /** Tuck the stamp under the line, as a small label on it, so it stops covering the scene. */
  const dock = (instant: boolean) => {
    if (stamp.hidden || !open) return;
    // Layout offsets, not getBoundingClientRect: the line may still be sliding in (a transform) when we measure.
    // Right-aligned with the line's panel; 0.55 is the docked scale in learn.css.
    const half = (stamp.offsetWidth * 0.55) / 2;
    stamp.style.setProperty('--dx', `${Math.round(line.offsetLeft + line.offsetWidth - half + 4)}px`);
    stamp.style.setProperty('--dy', `${Math.round(line.offsetTop + line.offsetHeight + 6)}px`);
    stamp.classList.toggle('instant', instant);
    stamp.classList.add('docked');
  };
  const showStamp = (animate: boolean) => {
    const s = LEARN_SCENES[i];
    if (!s?.stamp) return;
    stamp.innerHTML = '';
    stamp.append(el('b', '', s.stamp));
    if (s.stampSub) stamp.append(el('small', '', s.stampSub));
    stamp.classList.toggle('big', s.stamp.length <= 4);
    stamp.classList.remove('slam', 'docked', 'instant');
    stamp.hidden = false;
    clearTimeout(dockTimer);
    // The last stamp (RAG, with its long name under it) stays where it lands: it is the point of that scene.
    const docks = !s.stampSub;
    if (animate && !reducedMotion) {
      void stamp.offsetWidth;
      stamp.classList.add('slam');
      if (docks) dockTimer = setTimeout(() => dock(false), 1600);
    } else if (docks) dock(true);
  };

  const env = (id: string): SceneEnv => ({
    layer,
    band,
    state,
    done() {
      if (!open || LEARN_SCENES[i]?.id !== id || state.done.has(id)) return;
      state.done.add(id);
      touched = true;
      clearHint();
      showStamp(true);
      if (LEARN_SCENES[i].stamp) buzz('correct');
      showNext(true);
      renderDots();
    },
    todo(text) {
      if (LEARN_SCENES[i]?.id === id) todo.textContent = text;
    },
    poke() {
      touched = true;
      armHint();
    },
    stampAt(fy) {
      stamp.style.setProperty('--sy', `${Math.round(fy * 100)}%`);
    },
  });

  const renderDots = () => {
    dots.innerHTML = '';
    LEARN_SCENES.forEach((s, n) => dots.append(el('i', n === i ? 'now' : n < i || state.done.has(s.id) ? 'on' : '')));
    count.textContent = i < total ? `Step ${i + 1} of ${total}` : '';
  };

  const show = (to: number, dir: 'fwd' | 'back') => {
    scene?.stop();
    scene = null;
    clearHint();
    clearTimeout(dockTimer);
    i = to;
    enteredAt = performance.now();
    layer.innerHTML = '';
    band.innerHTML = '';
    layer.className = 'learn-layer';
    stamp.hidden = true;
    stamp.classList.remove('slam', 'docked', 'instant');
    stamp.style.removeProperty('--sy');
    root.dataset.scene = i < total ? LEARN_SCENES[i].id : 'ending';
    root.classList.remove('in-fwd', 'in-back');
    void root.offsetWidth;
    root.classList.add(`in-${dir}`);
    back.style.visibility = i === 0 ? 'hidden' : '';
    if (i === total) {
      // The ending: no dots, no line, no skip; just the sign and PLAY.
      top.hidden = true;
      line.hidden = true;
      next.textContent = LEARN_ENDING.play;
      next.classList.add('learn-play');
      showNext(true);
      scene = ending(env('ending'), false);
      return;
    }
    top.hidden = false;
    line.hidden = false;
    next.classList.remove('learn-play');
    const s = LEARN_SCENES[i];
    line.textContent = s.line;
    next.textContent = i === total - 1 ? 'FINISH ▸' : 'NEXT ▸';
    todo.textContent = s.todo ?? '';
    const wasDone = state.done.has(s.id);
    showNext(!s.todo || wasDone);
    renderDots();
    scene = SCENES[s.id](env(s.id), wasDone);
    if (wasDone) showStamp(false);
    armHint();
  };

  const go = (d: 1 | -1) => {
    const now = performance.now();
    if (now - lastNav < NAV_GUARD_MS || !open) return;
    lastNav = now;
    touched = true;
    buzz('tick');
    if (d < 0) {
      if (i > 0) show(i - 1, 'back');
      return;
    }
    if (i === total) return close();
    if (i === total - 1) opts.onSeen();
    show(i + 1, 'fwd');
  };

  const close = () => {
    if (!open) return;
    open = false;
    scene?.stop();
    scene = null;
    clearHint();
    clearTimeout(nudgeTimer);
    clearTimeout(dockTimer);
    root.hidden = true;
    root.innerHTML = '';
    root.classList.remove('learn', 'hinting', 'in-fwd', 'in-back');
    delete root.dataset.scene;
    opts.onClose();
  };

  next.addEventListener('click', () => go(1));
  back.addEventListener('click', () => go(-1));
  skip.addEventListener('click', () => {
    if (!open) return;
    opts.onSeen();
    close();
  });
  // "Tap to continue" scenes: a tap on the picture itself also moves on (not straight after arriving, so a quick
  // double tap on NEXT cannot skip the scene).
  layer.addEventListener('click', (e) => {
    const s = LEARN_SCENES[i];
    if (!s || s.todo || (e.target as HTMLElement).closest('button')) return;
    if (performance.now() - enteredAt < 700) return;
    go(1);
  });

  show(0, 'fwd');
  return {
    close,
    get touched() {
      return touched || i > 0;
    },
  };
}
