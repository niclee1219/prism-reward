import type { GateQuestion } from '../game/gateDirector';
import type { HudState } from '../game/RunScene';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  private root = $('hud');
  private score = $('hud-score');
  private mult = $('hud-mult');
  private shield = $('hud-shield');
  private progress = $('hud-progress');
  private panel = $('qpanel');
  private qText = $('q-text');
  private cards = [...this.panel.querySelectorAll<HTMLElement>('.q-card')];
  private lastMult = 1;

  show(on: boolean): void {
    this.root.hidden = !on;
  }

  update(h: HudState): void {
    this.score.textContent = String(h.score);
    this.mult.hidden = h.multiplier <= 1;
    this.mult.textContent = `x${h.multiplier}`;
    if (h.multiplier > this.lastMult) {
      this.mult.classList.remove('bump');
      void this.mult.offsetWidth;
      this.mult.classList.add('bump');
    }
    this.lastMult = h.multiplier;
    this.shield.hidden = !h.shield;
    this.progress.style.width = `${Math.min(h.progress, 1) * 100}%`;
  }

  question(gq: GateQuestion | null, tutorial: boolean): void {
    if (!gq) {
      // Leave a just-answered panel on screen to fade; hide anything else.
      if (!this.panel.classList.contains('done')) this.panel.hidden = true;
      return;
    }
    this.panel.hidden = true;
    void this.panel.offsetWidth; // restart the drop-in animation
    this.panel.className = tutorial ? 'qpanel tutorial' : 'qpanel';
    this.qText.textContent = gq.question.q;
    this.cards.forEach((c, lane) => {
      c.className = `q-card lane${lane}`;
      c.textContent = gq.laneAnswers[lane];
      if (tutorial && lane === gq.correctLane) c.classList.add('hint');
    });
    this.panel.hidden = false;
  }

  gateResult(chosen: number, correctLane: number, correct: boolean): void {
    this.panel.classList.remove('tutorial');
    this.cards[correctLane].classList.add('right');
    if (!correct) this.cards[chosen].classList.add('wrong');
    this.panel.classList.add('done');
  }
}
