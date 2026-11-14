// The player: a chunky young hawker in a singlet, apron and headband, seen from behind,
// with the PRISM gem floating over their shoulder and an optional shield bubble.
import * as THREE from 'three';
import { Builder, bend, canvasTexture, glowTexture } from './build';

function part(build: (b: Builder) => void, pivotY = 0): THREE.Group {
  const b = new Builder();
  build(b);
  const mesh = b.mesh();
  mesh.position.y = -pivotY;
  const pivot = new THREE.Group();
  pivot.position.y = pivotY;
  pivot.add(mesh);
  return pivot;
}

export class Runner {
  readonly group = new THREE.Group();
  readonly body = new THREE.Group();
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private gem: THREE.Mesh;
  private gemGlow: THREE.Sprite;
  private shield: THREE.Sprite;
  private phase = 0;
  private tumble = 0;
  /** Squash-and-stretch impulse: 1 right after a lane change or launch, springs back to 0. */
  private stretch = 0;
  /** 0 = running, 1 = standing tall with both arms up, presenting the dish. */
  private serveK = 0;
  private cheerT = -1;
  serving = false;

  constructor() {
    const SKIN = '#e0a878';
    // Torso, head, apron strings and headband in one mesh. The front faces -z (away from camera).
    const torso = new Builder()
      .box(0.56, 0.62, 0.32, '#fff6e0', [0, 1.12, 0]) // singlet
      .box(0.5, 0.5, 0.02, '#e63946', [0, 1.02, -0.17]) // apron front
      .box(0.58, 0.05, 0.34, '#e63946', [0, 0.92, 0]) // apron strings round the waist
      .box(0.06, 0.22, 0.02, '#e63946', [0, 0.8, 0.17]) // bow at the back
      .box(0.58, 0.24, 0.34, '#457b9d', [0, 0.78, 0]) // shorts
      .box(0.16, 0.12, 0.16, SKIN, [0, 1.48, 0]) // neck
      .box(0.38, 0.38, 0.36, SKIN, [0, 1.71, 0]) // head
      .box(0.4, 0.2, 0.38, '#1b1b2f', [0, 1.86, 0.01]) // hair
      .box(0.41, 0.07, 0.39, '#e63946', [0, 1.79, 0]) // headband
      .box(0.05, 0.14, 0.05, '#e63946', [0.08, 1.75, 0.22]) // headband tails
      .box(0.05, 0.12, 0.05, '#e63946', [-0.02, 1.73, 0.23])
      .box(0.06, 0.08, 0.02, '#1b1b2f', [-0.09, 1.7, -0.185]) // eyes and a grin, for the serve close-up
      .box(0.06, 0.08, 0.02, '#1b1b2f', [0.09, 1.7, -0.185])
      .box(0.16, 0.04, 0.02, '#9c3b2e', [0, 1.6, -0.185])
      .mesh();
    this.body.add(torso);

    for (const s of [-1, 1]) {
      const leg = part((b) => {
        b.box(0.2, 0.42, 0.22, '#457b9d', [s * 0.15, 0.62, 0]); // thigh in shorts
        b.box(0.16, 0.4, 0.18, SKIN, [s * 0.15, 0.27, 0]); // shin
        b.box(0.2, 0.08, 0.32, '#2a9d8f', [s * 0.15, 0.04, -0.04]); // slipper
      }, 0.8);
      this.legs.push(leg);
      this.body.add(leg);
      const arm = part((b) => {
        b.box(0.14, 0.5, 0.14, SKIN, [s * 0.36, 1.13, 0]);
      }, 1.38);
      this.arms.push(arm);
      this.body.add(arm);
    }
    this.group.add(this.body);

    // Contact shadow.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 20),
      new THREE.MeshBasicMaterial({ map: glowTexture('rgba(0,0,0,0.75)'), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.group.add(shadow);

    // The PRISM gem: a faceted crystal with a soft glow.
    this.gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.2, 0),
      new THREE.MeshLambertMaterial({ color: '#8ecae6', emissive: '#5a4fcf', emissiveIntensity: 0.9, flatShading: true }),
    );
    this.gem.scale.set(1, 1.35, 1);
    this.gemGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture('rgba(160,200,255,0.9)'), blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.gemGlow.scale.setScalar(1.1);
    this.group.add(this.gem, this.gemGlow);

    // Shield bubble: a sprite that is clear in the middle and bright at the rim, like a soap bubble.
    const bubble = canvasTexture(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 62);
      g.addColorStop(0, 'rgba(142,202,230,0.04)');
      g.addColorStop(0.75, 'rgba(142,202,230,0.2)');
      g.addColorStop(0.93, 'rgba(210,240,255,0.95)');
      g.addColorStop(1, 'rgba(142,202,230,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(44, 36, 13, 6, -0.7, 0, Math.PI * 2);
      ctx.fill();
    });
    this.shield = new THREE.Sprite(bend(new THREE.SpriteMaterial({ map: bubble, depthWrite: false, blending: THREE.AdditiveBlending }), true));
    this.shield.scale.setScalar(2.3);
    this.shield.position.y = 1.22; // clear of the floor, or the floor would slice the bubble
    this.shield.visible = false;
    this.group.add(this.shield);
  }

  set shieldOn(on: boolean) {
    this.shield.visible = on;
  }

  reset(): void {
    this.tumble = 0;
    this.stretch = 0;
    this.serveK = 0;
    this.cheerT = -1;
    this.serving = false;
    this.body.scale.setScalar(1);
    for (const a of this.arms) a.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.group.visible = true;
  }

  /** A quick stretch-then-settle, for lane changes and the launch off the start line. */
  hop(strength = 1): void {
    this.stretch = strength;
  }

  /** Start bouncing for joy (the dish has landed). */
  cheer(): void {
    this.cheerT = 0;
  }

  /** Spin and fall over (crash). */
  crash(): void {
    this.tumble = 1;
  }

  /**
   * @param dt seconds, @param cadence speed factor (1 = base speed), @param leanVel lateral velocity
   * in lanes / s (leans into lane changes), @param time seconds for idle motion.
   */
  update(dt: number, cadence: number, leanVel: number, time: number): void {
    if (this.tumble > 0) {
      this.tumble += dt;
      const k = Math.min(this.tumble - 1, 0.7) / 0.7;
      this.body.rotation.x = k * 1.5;
      this.body.rotation.z = k * 0.6;
      this.body.position.y = Math.sin(k * Math.PI) * 0.6;
      this.body.position.z = -k * 0.8;
    } else {
      this.phase += dt * (7 + cadence * 5);
      this.serveK += ((this.serving ? 1 : 0) - this.serveK) * Math.min(dt * 7, 1);
      const run = 1 - this.serveK;
      const swing = Math.sin(this.phase) * run;
      this.legs[0].rotation.x = swing * 0.9;
      this.legs[1].rotation.x = -swing * 0.9;
      // Arms swing while running, then both go straight up to hold the dish overhead.
      this.arms[0].rotation.x = -swing * 0.8 + this.serveK * Math.PI;
      this.arms[1].rotation.x = swing * 0.8 + this.serveK * Math.PI;
      this.arms[0].rotation.z = this.serveK * 0.12;
      this.arms[1].rotation.z = -this.serveK * 0.12;
      let y = Math.abs(Math.cos(this.phase)) * 0.08 * run;
      if (this.cheerT >= 0) {
        this.cheerT += dt;
        y += Math.abs(Math.sin(this.cheerT * 9)) * 0.22;
      }
      this.stretch = Math.max(0, this.stretch - dt * 5.5);
      const s = Math.sin(this.stretch * Math.PI) * 0.16; // out and back
      this.body.scale.set(1 - s * 0.7, 1 + s, 1 - s * 0.7);
      this.body.position.y = y + s * 0.9;
      this.body.rotation.z = THREE.MathUtils.clamp(-leanVel * 0.06, -0.3, 0.3);
      this.body.rotation.x = -0.12 * run; // lean forward into the run
    }
    const bob = Math.sin(time * 3.2) * 0.08;
    this.gem.position.set(0.55, 2.25 + bob, 0.1);
    this.gem.rotation.y += dt * 2.2;
    this.gemGlow.position.copy(this.gem.position);
    this.shield.material.opacity = 0.8 + Math.sin(time * 6) * 0.2;
  }

  /** World position of the gem, for effects. */
  gemWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.gem.getWorldPosition(target);
  }
}
