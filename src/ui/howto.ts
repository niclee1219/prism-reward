// "How to play": three short looping animated slides about the controls (how PRISM works is Learn's job, src/learn/).
// Shown once on the first PLAY tap, then the run starts; reopenable any time from the start screen's HOW TO PLAY link.
// BACK / NEXT, swipe, and an auto-advance that stops as soon as the player navigates themselves.
import { buzz } from '../game/haptics';
import { local } from '../net/device';

interface Slide {
  title: string;
  text: string;
  /** Accent colour for this slide's card and art. */
  accent: string;
  art: string;
}

/** The hero, as a tiny pixel sprite seen from behind (as in the game): ears, red headband, apron bow, paddle tail. */
const BEAVER = '<svg aria-hidden="true" viewBox="0 0 14 25" shape-rendering="crispEdges"><path fill="#2a1608" d="M2 0h2v1h-2zM10 0h2v1h-2zM1 1h1v1h-1zM4 1h1v1h-1zM9 1h1v1h-1zM12 1h1v1h-1zM1 2h1v1h-1zM4 2h6v1h-6zM12 2h1v1h-1zM2 3h1v1h-1zM11 3h1v1h-1zM1 4h1v1h-1zM12 4h1v1h-1zM1 5h1v1h-1zM12 5h1v1h-1zM1 6h1v1h-1zM13 6h1v1h-1zM2 7h1v1h-1zM11 7h1v1h-1zM13 7h1v1h-1zM1 8h3v1h-3zM10 8h3v1h-3zM0 9h1v1h-1zM3 9h1v1h-1zM10 9h1v1h-1zM13 9h1v1h-1zM0 10h1v1h-1zM3 10h1v1h-1zM10 10h1v1h-1zM13 10h1v1h-1zM0 11h1v1h-1zM3 11h1v1h-1zM10 11h1v1h-1zM13 11h1v1h-1zM0 12h1v1h-1zM3 12h1v1h-1zM10 12h1v1h-1zM13 12h1v1h-1zM1 13h3v1h-3zM10 13h3v1h-3zM2 14h1v1h-1zM11 14h1v1h-1zM1 15h1v1h-1zM4 15h1v1h-1zM9 15h1v1h-1zM12 15h1v1h-1zM1 16h1v1h-1zM4 16h1v1h-1zM9 16h1v1h-1zM12 16h1v1h-1zM3 17h1v1h-1zM10 17h1v1h-1zM2 18h1v1h-1zM11 18h1v1h-1zM2 19h1v1h-1zM11 19h1v1h-1zM2 20h1v1h-1zM11 20h1v1h-1zM2 21h1v1h-1zM11 21h1v1h-1zM3 22h1v1h-1zM10 22h1v1h-1zM4 23h6v1h-6z"/><path fill="#6e3d17" d="M2 1h2v1h-2zM10 1h2v1h-2zM2 2h1v1h-1zM11 2h1v1h-1zM1 12h2v1h-2zM11 12h2v1h-2zM2 15h2v1h-2zM10 15h2v1h-2zM2 16h2v1h-2zM10 16h2v1h-2z"/><path fill="#b8722f" d="M3 2h1v1h-1zM10 2h1v1h-1zM3 3h8v1h-8zM2 4h10v1h-10zM2 6h9v1h-9zM3 7h8v1h-8zM4 8h6v1h-6zM1 9h2v1h-2zM4 9h6v1h-6zM11 9h2v1h-2zM1 10h2v1h-2zM4 10h6v1h-6zM11 10h2v1h-2zM1 11h2v1h-2zM11 11h2v1h-2zM4 12h1v1h-1zM9 12h1v1h-1zM4 13h2v1h-2zM8 13h2v1h-2zM3 14h8v1h-8zM5 15h4v1h-4z"/><path fill="#e63946" d="M2 5h10v1h-10zM11 6h2v1h-2zM12 7h1v1h-1zM4 11h6v1h-6zM5 12h4v1h-4zM6 13h2v1h-2z"/><path fill="#8a5a2c" d="M5 16h1v1h-1zM4 17h1v1h-1zM6 17h1v1h-1zM8 17h1v1h-1zM3 18h1v1h-1zM7 18h1v1h-1zM4 19h1v1h-1zM6 19h1v1h-1zM8 19h1v1h-1zM10 19h1v1h-1zM5 20h1v1h-1zM9 20h1v1h-1zM4 21h1v1h-1zM6 21h1v1h-1zM8 21h1v1h-1zM10 21h1v1h-1zM7 22h1v1h-1z"/><path fill="#4a2810" d="M6 16h3v1h-3zM5 17h1v1h-1zM7 17h1v1h-1zM9 17h1v1h-1zM4 18h3v1h-3zM8 18h3v1h-3zM3 19h1v1h-1zM5 19h1v1h-1zM7 19h1v1h-1zM9 19h1v1h-1zM3 20h2v1h-2zM6 20h3v1h-3zM10 20h1v1h-1zM3 21h1v1h-1zM5 21h1v1h-1zM7 21h1v1h-1zM9 21h1v1h-1zM4 22h3v1h-3zM8 22h2v1h-2z"/></svg>';

const SLIDES: Slide[] = [
  {
    title: 'SWIPE TO DODGE',
    text: 'Swipe left or right to change lane. Hit a stall hazard and you lose time and streak.',
    accent: '#4cc9f0',
    art: `<div class="ht ht-road">
      <div class="road"><i></i><i></i></div>
      <i class="hz h1"></i><i class="hz h2"></i><i class="hz h3"></i>
      <span class="runner">${BEAVER}</span>
      <span class="finger">👆</span>
    </div>`,
  },
  {
    title: 'PICK THE RIGHT ANSWER',
    text: "Question gates ask about Ah Ma's notes. Run through the lane with the right answer to decode a recipe step.",
    accent: '#52e08a',
    art: `<div class="ht ht-gates">
      <div class="q">How long to poach?</div>
      <div class="gates"><b class="g">5 min</b><b class="g right">40 min</b><b class="g">2 hrs</b></div>
      <span class="plus">+100</span>
      <span class="runner">${BEAVER}</span>
    </div>`,
  },
  {
    title: 'GOLD COINS, BIG STREAKS',
    text: 'Grab gold coins for points. Each right answer in a row grows your streak multiplier, up to x5. A wrong one resets it.',
    accent: '#ffd166',
    art: `<div class="ht ht-coins">
      <i class="coin-a c1"></i><i class="coin-a c2"></i><i class="coin-a c3"></i><i class="coin-a c4"></i>
      <div class="mult"><b>x1</b><b>x2</b><b>x3</b><b>x4</b><b>x5</b></div>
      <div class="fire">🔥🔥🔥</div>
    </div>`,
  },
];

const AUTO_MS = 6000;

export interface HowtoOptions {
  /** Called once the slides close (last button or SKIP). */
  onClose?: () => void;
  /** Opened by the first PLAY tap: the last button says the run comes next. */
  playing?: boolean;
}

export function showHowto(root: HTMLElement, opts: HowtoOptions = {}): void {
  root.innerHTML = '';
  root.hidden = false;
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let auto = true;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    local.seenHowto = true;
    root.hidden = true;
    root.innerHTML = '';
    opts.onClose?.();
  };

  const card = document.createElement('div');
  card.className = 'howto-card';
  const dots = document.createElement('div');
  dots.className = 'dots howto-dots';
  const row = document.createElement('div');
  row.className = 'nav-row';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'pix-btn pix-btn--cream btn btn-back';
  backBtn.textContent = '◂';
  backBtn.setAttribute('aria-label', 'Back');
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'pix-btn btn';
  row.append(backBtn, nextBtn);
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'pix-btn pix-btn--cream link-btn';
  skip.textContent = 'SKIP';
  skip.addEventListener('click', close);
  root.append(card, dots, row, skip);

  const draw = (dir: 'fwd' | 'back') => {
    const s = SLIDES[i];
    card.style.setProperty('--accent', s.accent);
    card.className = 'howto-card';
    void card.offsetWidth;
    card.className = `howto-card in-${dir}`;
    card.innerHTML = `<div class="step">${i + 1} / ${SLIDES.length}</div>${s.art}<h2>${s.title}</h2><p>${s.text}</p>`;
    // The current dot fills up as a timer while auto-advance is on.
    dots.innerHTML = SLIDES.map((_, n) => `<i class="${n < i ? 'on' : n === i ? `now${auto && i < SLIDES.length - 1 ? ' timing' : ''}` : ''}"><b></b></i>`).join('');
    dots.style.setProperty('--auto', `${AUTO_MS}ms`);
    backBtn.hidden = i === 0;
    nextBtn.textContent = i === SLIDES.length - 1 ? (opts.playing ? "GOT IT, LET'S PLAY" : 'GOT IT') : 'NEXT ▸';
    if (timer) clearTimeout(timer);
    if (auto && i < SLIDES.length - 1) timer = setTimeout(() => step(1, false), AUTO_MS);
  };
  const step = (d: 1 | -1, manual: boolean) => {
    if (manual) {
      auto = false;
      buzz('tick');
    }
    if (d > 0 && i >= SLIDES.length - 1) return close();
    if (d < 0 && i === 0) return;
    i += d;
    draw(d > 0 ? 'fwd' : 'back');
  };
  nextBtn.addEventListener('click', () => step(1, true));
  backBtn.addEventListener('click', () => step(-1, true));
  dots.addEventListener('click', (e) => {
    const n = [...dots.children].indexOf((e.target as HTMLElement).closest('i')!);
    if (n < 0 || n === i) return;
    auto = false;
    const dir = n > i ? 'fwd' : 'back';
    i = n;
    draw(dir);
  });

  let sx = 0;
  let sy = 0;
  card.addEventListener('pointerdown', (e) => {
    sx = e.clientX;
    sy = e.clientY;
  });
  card.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx;
    if (Math.abs(dx) < 50 || Math.abs(e.clientY - sy) > Math.abs(dx) * 0.7) return;
    // Swiping left past the last slide does not start the game; only the button does.
    if (dx < 0 && i < SLIDES.length - 1) step(1, true);
    else if (dx > 0) step(-1, true);
  });
  draw('fwd');
}
