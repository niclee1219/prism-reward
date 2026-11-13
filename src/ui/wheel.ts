// The wheel only animates. The server decides the outcome.
const COLOURS = ['#e63946', '#ffd166', '#2a9d8f', '#8ecae6', '#9b5de5', '#f4a261', '#52b788', '#f15bb5'];
const NS = 'http://www.w3.org/2000/svg';

export class Wheel {
  readonly el: HTMLDivElement;
  private svg: SVGSVGElement;
  private segments: string[] = [];
  private turns = 0;

  constructor(segments: string[]) {
    this.el = document.createElement('div');
    this.el.className = 'wheel-wrap';
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('viewBox', '-105 -105 210 210');
    this.el.appendChild(this.svg);
    this.setSegments(segments);
  }

  setSegments(segments: string[]): void {
    if (segments.join('|') === this.segments.join('|')) return;
    this.segments = segments;
    const n = Math.max(segments.length, 1);
    const step = (Math.PI * 2) / n;
    let html = '<circle r="104" fill="#1b1b2f"/>';
    segments.forEach((name, i) => {
      // Segment i is centred at angle i * step, measured clockwise from the top.
      const a0 = i * step - step / 2 - Math.PI / 2;
      const a1 = a0 + step;
      const p = (a: number, r: number) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
      const d = n === 1 ? '' : `M0,0 L${p(a0, 100)} A100,100 0 0 1 ${p(a1, 100)} Z`;
      html += n === 1 ? `<circle r="100" fill="${COLOURS[0]}"/>` : `<path d="${d}" fill="${COLOURS[i % COLOURS.length]}" stroke="#1b1b2f" stroke-width="2"/>`;
      const deg = (i * 360) / n;
      // Long names wrap onto two lines, split at the space nearest the middle.
      const clean = name.replace(/[<&>]/g, '');
      let lines = [clean];
      if (clean.length > 12 && clean.includes(' ')) {
        const spaces = [...clean].map((ch, at) => (ch === ' ' ? at : -1)).filter((at) => at > 0);
        const cut = spaces.reduce((best, at) => (Math.abs(at - clean.length / 2) < Math.abs(best - clean.length / 2) ? at : best));
        lines = [clean.slice(0, cut), clean.slice(cut + 1)];
      }
      const longest = Math.max(...lines.map((l) => l.length));
      const size = n > 6 || longest > 12 ? 7.5 : 9;
      const spans = lines
        .map((line, li) => `<tspan x="0" dy="${li === 0 ? (lines.length === 1 ? 0 : -size * 0.6) : size * 1.2}">${line.length > 17 ? `${line.slice(0, 16)}…` : line}</tspan>`)
        .join('');
      html += `<text transform="rotate(${deg}) translate(0,-60) rotate(90)" text-anchor="middle" dominant-baseline="middle" font-family="Courier New, monospace" font-weight="700" font-size="${size}" fill="#1b1b2f">${spans}</text>`;
    });
    html += '<circle r="12" fill="#fff6e0" stroke="#1b1b2f" stroke-width="3"/>';
    this.svg.innerHTML = html;
  }

  /** Spins so that segment `index` stops under the pointer. Resolves when it has stopped. */
  spinTo(index: number): Promise<void> {
    const n = Math.max(this.segments.length, 1);
    this.turns += 5;
    const jitter = (Math.random() - 0.5) * (360 / n) * 0.6;
    const angle = this.turns * 360 - (index * 360) / n + jitter;
    return new Promise((resolve) => {
      const done = () => {
        this.svg.removeEventListener('transitionend', done);
        clearTimeout(fallback);
        resolve();
      };
      const fallback = setTimeout(done, 4800);
      this.svg.addEventListener('transitionend', done);
      requestAnimationFrame(() => (this.svg.style.transform = `rotate(${angle}deg)`));
    });
  }
}
