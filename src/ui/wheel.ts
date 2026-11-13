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
      const label = name.length > 16 ? `${name.slice(0, 15)}…` : name;
      html += `<text transform="rotate(${deg}) translate(0,-58) rotate(90)" text-anchor="middle" dominant-baseline="middle" font-family="Courier New, monospace" font-weight="700" font-size="${n > 6 ? 8.5 : 10}" fill="#1b1b2f">${label.replace(/[<&>]/g, '')}</text>`;
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
