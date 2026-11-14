import { SCORING, multiplierFor } from '../config';

/** Running score for one run. Kept free of Phaser so it can be unit tested. */
export class ScoreKeeper {
  distance = 0;
  answerPoints = 0;
  streak = 0;
  bestStreak = 0;
  correct = 0;
  wrong = 0;
  gates = 0;

  /** dt in seconds, speedFactor = current speed / base speed. */
  addDistance(dt: number, speedFactor: number): void {
    this.distance += dt * speedFactor * SCORING.DISTANCE_POINTS_PER_S;
  }

  /** Returns the points just earned (0 for a wrong answer). */
  answer(isCorrect: boolean): number {
    this.gates++;
    if (!isCorrect) {
      this.wrong++;
      this.streak = 0;
      return 0;
    }
    this.correct++;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const pts = SCORING.ANSWER_POINTS * multiplierFor(this.streak);
    this.answerPoints += pts;
    return pts;
  }

  get multiplier(): number {
    return multiplierFor(this.streak);
  }

  /** Served-dish bonus, set once when the run ends as served. */
  bonus = 0;
  coins = 0;
  coinPoints = 0;

  /** Returns the points for one coin. */
  coin(doubled: boolean): number {
    const pts = SCORING.COIN_POINTS * (doubled ? SCORING.COIN_DOUBLE : 1);
    this.coins++;
    this.coinPoints += pts;
    return pts;
  }

  get score(): number {
    return Math.floor(this.distance + this.answerPoints) + this.coinPoints + this.bonus;
  }
}
