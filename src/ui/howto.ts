// "How it works": four short looping animated slides. Shown once on the first visit, reopenable from the start screen.
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

const SLIDES: Slide[] = [
  {
    title: 'SWIPE TO DODGE',
    text: 'Swipe left or right to change lane. Hit a stall hazard and you lose time and streak.',
    accent: '#4cc9f0',
    art: `<div class="ht ht-road">
      <div class="road"><i></i><i></i></div>
      <i class="hz h1"></i><i class="hz h2"></i><i class="hz h3"></i>
      <span class="runner">🏃</span>
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
      <span class="runner">🏃</span>
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
  {
    title: 'PRISM DECODES THE RECIPE',
    text: 'Vague notes like "cook until it smells right" become exact steps, with sources. Decode all 8 to serve the dish, then spin the wheel for a prize.',
    accent: '#b388ff',
    art: `<div class="ht ht-prism">
      <span class="note">"cook till it smells right"</span>
      <div class="split"><i class="in"></i><i class="tri"></i><i class="out"></i></div>
      <span class="decoded">→ Simmer 18 min at 92°C <small>· source: recipe.md</small></span>
    </div>`,
  },
];

const AUTO_MS = 6000;

export function showHowto(root: HTMLElement): void {
  root.innerHTML = '';
  root.hidden = false;
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let auto = true;

  const close = () => {
    if (timer) clearTimeout(timer);
    local.seenHowto = true;
    root.hidden = true;
    root.innerHTML = '';
  };

  const card = document.createElement('div');
  card.className = 'howto-card';
  const dots = document.createElement('div');
  dots.className = 'dots howto-dots';
  const row = document.createElement('div');
  row.className = 'nav-row';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn btn-back';
  backBtn.textContent = '◂';
  backBtn.setAttribute('aria-label', 'Back');
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn';
  row.append(backBtn, nextBtn);
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'link-btn';
  skip.textContent = 'Skip';
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
    nextBtn.textContent = i === SLIDES.length - 1 ? "GOT IT, LET'S PLAY" : 'NEXT ▸';
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
