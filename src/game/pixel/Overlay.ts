// Pop-up text, banners, emoji, screen flash and the fever border: DOM elements over the canvas, so text stays sharp.

/** Press Start 2P is about 1.6x as wide as the sans the pop-up sizes were tuned for. */
const PIXEL_FONT_K = 0.62;

/** Pop-up text, banners and screen flash, as DOM elements over the canvas. */
export class Overlay {
  private layer: HTMLDivElement;
  private flashEl: HTMLDivElement;
  private feverEl: HTMLDivElement;
  private recent: { y: number; at: number }[] = [];

  constructor(private stage: HTMLElement, private reduced: boolean) {
    this.layer = document.createElement('div');
    this.layer.className = 'fx-layer';
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'fx-flash';
    this.feverEl = document.createElement('div');
    this.feverEl.className = 'fx-fever';
    stage.append(this.feverEl, this.layer, this.flashEl);
  }

  /**
   * `x`, `y` in CSS px relative to the stage. Two pop-ups fired close together would land
   * on top of each other and be unreadable, so a new one steps above any recent neighbour.
   */
  pop(text: string, x: number, y: number, color: string, size = 26, cls = ''): HTMLDivElement {
    const now = performance.now();
    this.recent = this.recent.filter((r) => now - r.at < 650);
    const gap = size * 1.25;
    for (let guard = 0; guard < 6 && this.recent.some((r) => Math.abs(r.y - y) < gap); guard++) y -= gap;
    this.recent.push({ y, at: now });

    const el = document.createElement('div');
    el.className = `fx-pop ${cls}`;
    el.textContent = text;
    el.style.left = `${Math.min(Math.max(x, 70), this.stage.clientWidth - 70)}px`;
    el.style.top = `${Math.max(y, 60)}px`;
    el.style.color = color;
    // Pop-ups use the pixel display font, whose letters are a full em wide: scale the requested size down to
    // match the old look, and never let a long call-out run off the screen.
    const fit = (this.stage.clientWidth - 28) / Math.max(text.length, 1);
    el.style.fontSize = `${Math.round(Math.min(size * PIXEL_FONT_K, fit))}px`;
    this.layer.append(el);
    el.addEventListener('animationend', () => el.remove());
    return el;
  }

  /** A big two-line banner that slams in and stays (the serve celebration). */
  banner(title: string, sub: string, color: string): void {
    const el = document.createElement('div');
    el.className = 'fx-banner';
    el.style.setProperty('--c', color);
    const t = document.createElement('b');
    t.textContent = title;
    const s = document.createElement('span');
    s.textContent = sub;
    el.append(t, s);
    this.layer.append(el);
  }

  /** An emoji that floats up and away (cheering customers). */
  emoji(char: string, x: number, y: number): void {
    const el = document.createElement('div');
    el.className = 'fx-emoji';
    el.textContent = char;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--drift', `${(Math.random() - 0.5) * 80}px`);
    this.layer.append(el);
    el.addEventListener('animationend', () => el.remove());
  }

  flash(color: string): void {
    if (this.reduced) return;
    this.flashEl.style.background = color;
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  }

  /** Glowing screen edges while the player is on a streak. */
  fever(on: boolean): void {
    this.feverEl.classList.toggle('on', on && !this.reduced);
  }

  clear(): void {
    this.layer.innerHTML = '';
    this.recent = [];
    this.fever(false);
  }
}
