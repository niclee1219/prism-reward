import type { Dish } from '../content/dishes';
import type { GateQuestion } from '../game/gateDirector';
import { PICKUPS } from '../config';
import type { HudState } from '../game/sim/RunSim';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  private root = $('hud');
  private score = $('hud-score');
  private mult = $('hud-mult');
  private shield = $('hud-shield');
  private coins = $('hud-coins');
  private coinN = $('hud-coin-n');
  private power = $('hud-power');
  private powerLabel = $('hud-power-label');
  private powerBar = $('hud-power-bar');
  private coinCount = 0;
  private progress = $('hud-progress');
  private recipe = $('hud-recipe');
  private recipeDish = $('hud-dish');
  private panel = $('qpanel');
  private qText = $('q-text');
  private cards = [...this.panel.querySelectorAll<HTMLElement>('.q-card')];
  private slots: HTMLElement[] = [];
  private dish: Dish | null = null;
  private lastMult = 1;
  private lastScore = 0;
  private shown = 0;

  constructor(private stage: HTMLElement) {}

  show(on: boolean, dish?: Dish): void {
    this.root.hidden = !on;
    if (!on || !dish) return;
    this.dish = dish;
    this.shown = 0;
    this.coinCount = 0;
    this.coinN.textContent = '0';
    this.score.textContent = '0';
    this.lastScore = 0;
    this.mult.hidden = this.shield.hidden = true;
    this.panel.hidden = true;
    this.power.hidden = true;
    this.recipeDish.textContent = dish.emoji;
    this.recipe.innerHTML = '';
    this.slots = dish.steps.map((s) => {
      const slot = document.createElement('i');
      slot.className = 'slot';
      slot.dataset.emoji = s.emoji;
      slot.textContent = '?';
      this.recipe.append(slot);
      return slot;
    });
  }

  update(h: HudState): void {
    this.score.textContent = String(h.score);
    if (h.score - this.lastScore >= 50) this.bump(this.score); // a real gain, not the distance trickle
    this.lastScore = h.score;
    this.mult.hidden = h.multiplier <= 1;
    this.mult.textContent = `x${h.multiplier}`;
    if (h.multiplier > this.lastMult) this.bump(this.mult);
    this.lastMult = h.multiplier;
    this.shield.hidden = !h.shield;
    this.power.hidden = !h.power;
    if (h.power) {
      const full = h.power.kind === 'double' ? PICKUPS.DOUBLE_S : PICKUPS.MAGNET_S;
      this.power.dataset.kind = h.power.kind;
      this.powerLabel.textContent = h.power.kind === 'double' ? '2X COINS' : '🧲 MAGNET';
      this.powerBar.style.width = `${Math.max(0, h.power.left / full) * 100}%`;
    }
    if (h.coins !== this.coinCount) {
      this.coinCount = h.coins;
      this.coinN.textContent = String(h.coins);
    }
    this.progress.style.width = `${Math.min(h.progress, 1) * 100}%`;
    // Safety net: if an ingredient flight was skipped, fill the slot anyway.
    for (let i = this.shown; i < h.recovered; i++) this.fill(i);
  }

  /** A recipe step was recovered: fly its ingredient from (x, y) into its slot. */
  ingredient(x: number, y: number, step: number): void {
    const i = step - 1;
    const slot = this.slots[i];
    if (!slot || !this.dish) return;
    const s = this.stage.getBoundingClientRect();
    const r = slot.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = 'ingredient-fly';
    fly.textContent = this.dish.steps[i].emoji;
    fly.style.left = `${x}px`;
    fly.style.top = `${y}px`;
    fly.style.setProperty('--dx', `${r.left - s.left + r.width / 2 - x}px`);
    fly.style.setProperty('--dy', `${r.top - s.top + r.height / 2 - y}px`);
    this.stage.append(fly);
    fly.addEventListener('animationend', () => {
      fly.remove();
      this.fill(i);
    });
    this.shown = Math.max(this.shown, step); // the flight now owns this slot
  }

  /** A coin was collected: count it immediately (the HUD state only refreshes every 100 ms). */
  coin(doubled: boolean): void {
    this.coinCount++;
    this.coinN.textContent = String(this.coinCount);
    this.coins.classList.toggle('doubled', doubled);
    this.bump(this.coins);
  }

  /**
   * Serve cutscene: every recovered ingredient leaves its slot and flies into the dish at
   * (x, y), one after another, so the recipe visibly becomes the plate of food.
   */
  plating(x: number, y: number): void {
    const s = this.stage.getBoundingClientRect();
    this.slots.forEach((slot, i) => {
      if (!this.dish) return;
      this.fill(i);
      const r = slot.getBoundingClientRect();
      const fly = document.createElement('div');
      fly.className = 'ingredient-fly plating';
      fly.textContent = this.dish.steps[i].emoji;
      const fx = r.left - s.left + r.width / 2;
      const fy = r.top - s.top + r.height / 2;
      fly.style.left = `${fx}px`;
      fly.style.top = `${fy}px`;
      fly.style.setProperty('--dx', `${x - fx}px`);
      fly.style.setProperty('--dy', `${y - fy}px`);
      fly.style.animationDelay = `${i * 55}ms`;
      this.stage.append(fly);
      fly.addEventListener('animationend', () => fly.remove());
      setTimeout(() => slot.classList.add('sent'), i * 55);
    });
  }

  private fill(i: number): void {
    const slot = this.slots[i];
    if (!slot || slot.classList.contains('got')) return;
    slot.textContent = slot.dataset.emoji ?? '';
    slot.classList.add('got');
    this.bump(slot);
    this.shown = Math.max(this.shown, i + 1);
  }

  private bump(el: HTMLElement): void {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
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
