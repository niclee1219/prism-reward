// Visual feedback: speed lines, fire trail, pop-up text, bursts.
import Phaser from 'phaser';
import { VIEW } from '../config';
import { ATLAS } from './art/buildAtlas';

export const LANE_COLOURS = [0x4cc9f0, 0xb388ff, 0xffb703];

export class Juice {
  private lines: Phaser.GameObjects.Particles.ParticleEmitter;
  private fire: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst: Phaser.GameObjects.Particles.ParticleEmitter;
  /** When true, decorative effects are skipped (slow device). */
  lowFx = false;

  constructor(
    private scene: Phaser.Scene,
    private reduced: boolean,
  ) {
    const h = scene.scale.height;
    this.lines = scene.add
      .particles(0, 0, ATLAS, {
        frame: 'line',
        x: { min: VIEW.SIDE + 2, max: VIEW.WIDTH - VIEW.SIDE - 2 },
        y: -12,
        speedY: { min: 520, max: 760 },
        lifespan: (h / 520) * 1000,
        alpha: { start: 0.55, end: 0.1 },
        scaleY: { min: 1, max: 2.2 },
        frequency: 60,
        emitting: false,
      })
      .setDepth(6);
    this.fire = scene.add
      .particles(0, 0, ATLAS, {
        frame: 'px',
        speedY: { min: 40, max: 110 },
        speedX: { min: -18, max: 18 },
        lifespan: 380,
        scale: { start: 2.2, end: 0.4 },
        alpha: { start: 0.95, end: 0 },
        tint: [0xffd166, 0xf4a261, 0xe63946],
        frequency: 28,
        emitting: false,
      })
      .setDepth(4);
    this.burst = scene.add
      .particles(0, 0, ATLAS, {
        frame: 'px',
        speed: { min: 60, max: 190 },
        lifespan: 520,
        scale: { start: 2, end: 0 },
        gravityY: 260,
        emitting: false,
      })
      .setDepth(7);
  }

  follow(target: Phaser.GameObjects.Sprite): void {
    this.fire.startFollow(target, 0, 14);
  }

  /** intensity 0..1; 0 switches the lines off. */
  speedLines(intensity: number): void {
    if (this.lowFx || intensity <= 0) {
      if (this.lines.emitting) this.lines.stop();
      return;
    }
    this.lines.frequency = 90 - 70 * Math.min(intensity, 1);
    if (!this.lines.emitting) this.lines.start();
  }

  fireTrail(on: boolean): void {
    if (this.lowFx) on = false;
    if (on && !this.fire.emitting) this.fire.start();
    if (!on && this.fire.emitting) this.fire.stop();
  }

  shake(intensity: number, ms = 160): void {
    if (this.reduced || this.lowFx) return;
    this.scene.cameras.main.shake(ms, intensity);
  }

  /** A single soft flash. Skipped entirely for reduced motion. */
  flash(colour: number, ms = 140): void {
    if (this.reduced) return;
    const c = Phaser.Display.Color.IntegerToColor(colour);
    this.scene.cameras.main.flash(ms, c.red, c.green, c.blue, false);
  }

  pop(x: number, y: number, text: string, colour = '#ffffff', size = 12): void {
    const t = this.scene.add
      .text(x, y, text, {
        fontFamily: '"Courier New", monospace',
        fontStyle: 'bold',
        fontSize: `${size}px`,
        color: colour,
        stroke: '#1b1b2f',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(10);
    t.x = Phaser.Math.Clamp(t.x, t.width / 2 + 2, VIEW.WIDTH - t.width / 2 - 2);
    t.setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      y: y - 26,
      alpha: 0,
      delay: 380,
      duration: 380,
      onComplete: () => t.destroy(),
    });
  }

  burstAt(x: number, y: number, tints: number[], count = 14): void {
    const n = this.lowFx ? Math.ceil(count / 3) : count;
    this.burst.setParticleTint(tints[0]);
    this.burst.explode(n, x, y);
  }

  stopAll(): void {
    this.lines.stop();
    this.fire.stop();
  }
}
