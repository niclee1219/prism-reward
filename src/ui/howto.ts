// "How it works": four short looping animated slides. Shown once on the first visit, reopenable from the start screen.
import { local } from '../net/device';

interface Slide {
  title: string;
  text: string;
  art: string;
}

const SLIDES: Slide[] = [
  {
    title: 'SWIPE TO DODGE',
    text: 'Swipe left or right to change lane. Hit a stall hazard and you lose time and streak.',
    art: '<div class="ht ht-lanes"><i class="runner">🏃</i><i class="hz h1"></i><i class="hz h2"></i><i class="hz h3"></i></div>',
  },
  {
    title: 'PICK THE RIGHT ANSWER',
    text: "Question gates ask about Ah Ma's notes. Run through the lane with the right answer to decode a recipe step.",
    art: '<div class="ht ht-gates"><b class="g g0">A</b><b class="g g1 right">B ✔</b><b class="g g2">C</b></div>',
  },
  {
    title: 'GOLD COINS, BIG STREAKS',
    text: 'Grab gold coins for points. Each right answer in a row grows your streak multiplier, up to x5. A wrong one resets it.',
    art: '<div class="ht ht-coins"><i class="coin-a"></i><i class="coin-a"></i><i class="coin-a"></i><span class="mult">x1 → x2 → x3</span></div>',
  },
  {
    title: 'PRISM DECODES THE RECIPE',
    text: 'Vague notes like "cook until it smells right" become exact steps, with sources. Decode all 8 to serve the dish, then spin the wheel for a prize.',
    art: '<div class="ht ht-prism"><span class="note">"cook till it smells right"</span><i class="beam"></i><span class="decoded">→ Simmer 18 min at 92°C</span></div>',
  },
];

export function showHowto(root: HTMLElement): void {
  root.innerHTML = '';
  root.hidden = false;
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const close = () => {
    if (timer) clearTimeout(timer);
    local.seenHowto = true;
    root.hidden = true;
    root.innerHTML = '';
  };

  const card = document.createElement('div');
  card.className = 'howto-card';
  const dots = document.createElement('div');
  dots.className = 'dots';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn';
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'link-btn';
  skip.textContent = 'Skip';
  skip.addEventListener('click', close);
  root.append(card, dots, nextBtn, skip);

  const draw = () => {
    const s = SLIDES[i];
    card.className = 'howto-card';
    void card.offsetWidth;
    card.className = 'howto-card in';
    card.innerHTML = `${s.art}<h2>${s.title}</h2><p>${s.text}</p>`;
    dots.innerHTML = SLIDES.map((_, n) => `<i class="${n <= i ? 'on' : ''}"></i>`).join('');
    nextBtn.textContent = i === SLIDES.length - 1 ? "GOT IT, LET'S PLAY" : 'NEXT ▸';
    if (timer) clearTimeout(timer);
    // Auto-advance, except on the last slide.
    if (i < SLIDES.length - 1) timer = setTimeout(() => { i++; draw(); }, 5500);
  };
  nextBtn.addEventListener('click', () => {
    if (i >= SLIDES.length - 1) close();
    else {
      i++;
      draw();
    }
  });
  draw();
}
