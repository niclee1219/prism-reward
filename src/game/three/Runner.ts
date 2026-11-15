// The player: a chubby beaver cook seen from behind, in Ah Ma's red apron and headband. From behind a beaver
// is mostly its round brown back, two round ears and the big flat paddle tail, so the tail is large, sits
// flat enough for the chase camera to see its top, and wags as it runs. The face (for the serve close-up)
// is on the far side. The PRISM gem floats over its shoulder and an optional shield bubble surrounds it.
import * as THREE from 'three';
import { Builder, bend, canvasTexture, glowTexture } from './build';

const FUR = '#b8722f';
const FUR_DARK = '#6e3d17';
const CREAM = '#f3d3a5';
const TAIL = '#40220c';
const TAIL_EDGE = '#241207';
const TAIL_SCALE = '#7d4c22';
const APRON = '#e63946';
const INK = '#2a1608';
const PINK = '#f2958f';

/** Builds a mesh around a pivot point, so it can swing from there (hip, shoulder, tail root). */
function part(build: (b: Builder) => void, pivot: [number, number, number]): THREE.Group {
  const b = new Builder();
  build(b);
  const mesh = b.mesh();
  mesh.position.set(-pivot[0], -pivot[1], -pivot[2]);
  const g = new THREE.Group();
  g.position.set(...pivot);
  g.add(mesh);
  return g;
}

export class Runner {
  readonly group = new THREE.Group();
  readonly body = new THREE.Group();
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private tail: THREE.Group;
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
    // Body, head, ears, apron and headband in one mesh. The front (face, apron bib) faces -z, away from the camera.
    const torso = new Builder()
      .sphere(0.36, FUR, [0, 0.86, 0.02], [1, 0.95, 0.92]) // round bottom
      .box(0.6, 0.5, 0.44, FUR, [0, 1.16, 0]) // chest and back
      .sphere(0.3, CREAM, [0, 1.0, -0.12], [0.95, 1.1, 0.7]) // pale belly (front)
      .box(0.5, 0.5, 0.03, APRON, [0, 1.02, -0.27]) // apron bib
      .box(0.64, 0.06, 0.48, APRON, [0, 0.98, 0]) // apron strings round the waist
      .box(0.1, 0.1, 0.06, APRON, [0, 0.98, 0.26]) // the knot at the back...
      .box(0.2, 0.12, 0.04, APRON, [-0.13, 1.0, 0.26], [0, 0, 0.35]) // ...and its two loops
      .box(0.2, 0.12, 0.04, APRON, [0.13, 1.0, 0.26], [0, 0, -0.35])
      .box(0.06, 0.2, 0.03, APRON, [-0.05, 0.86, 0.26], [0, 0, -0.2]) // and two ends hanging down
      .box(0.06, 0.2, 0.03, APRON, [0.05, 0.86, 0.26], [0, 0, 0.2])
      .sphere(0.3, FUR, [0, 1.64, 0], [1, 0.92, 0.95]) // round head, no neck
      .sphere(0.1, FUR_DARK, [-0.21, 1.86, 0.02], [1, 1, 0.6]) // round ears
      .sphere(0.1, FUR_DARK, [0.21, 1.86, 0.02], [1, 1, 0.6])
      .sphere(0.055, PINK, [-0.21, 1.86, -0.04], [1, 1, 0.4])
      .sphere(0.055, PINK, [0.21, 1.86, -0.04], [1, 1, 0.4])
      .cyl(0.29, 0.29, 0.08, APRON, [0, 1.72, 0], 12) // headband
      .box(0.06, 0.18, 0.04, APRON, [0.06, 1.65, 0.29], [0, 0, 0.25]) // headband tails
      .box(0.06, 0.15, 0.04, APRON, [-0.04, 1.64, 0.3], [0, 0, -0.3])
      // The face, for the serve close-up: cream muzzle, nose, buck teeth, eyes, a grin.
      .sphere(0.16, CREAM, [0, 1.56, -0.22], [1.2, 0.85, 0.8])
      .sphere(0.05, INK, [0, 1.6, -0.35], [1.3, 0.9, 0.8])
      .box(0.05, 0.08, 0.02, '#ffffff', [-0.028, 1.46, -0.33])
      .box(0.05, 0.08, 0.02, '#ffffff', [0.028, 1.46, -0.33])
      .box(0.06, 0.08, 0.02, INK, [-0.12, 1.7, -0.27])
      .box(0.06, 0.08, 0.02, INK, [0.12, 1.7, -0.27])
      .sphere(0.05, PINK, [-0.19, 1.58, -0.24], [1, 0.8, 0.4])
      .sphere(0.05, PINK, [0.19, 1.58, -0.24], [1, 0.8, 0.4])
      .mesh();
    this.body.add(torso);

    // The paddle tail: a flat oval with a dark rim and a criss-cross of scales, hanging from the base of the
    // back and trailing toward the camera, tipped down a little so the camera sees its broad top.
    this.tail = part(
      (b) => {
        b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.07, 16), TAIL_EDGE, [0, 0.66, 0.62], [0.32, 0, 0], [0.5, 1, 0.84]);
        b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16), TAIL, [0, 0.69, 0.62], [0.32, 0, 0], [0.43, 1, 0.76]);
        for (const s of [-1, 1]) {
          for (const k of [-0.18, 0.02, 0.22]) {
            b.add(new THREE.BoxGeometry(0.035, 0.02, 0.5), TAIL_SCALE, [0, 0.72 - k * 0.32, 0.62 + k], [0.32, s * 0.7, 0]);
          }
        }
        b.box(0.18, 0.14, 0.22, FUR_DARK, [0, 0.76, 0.3], [0.32, 0, 0]); // the root, where it meets the body
      },
      [0, 0.8, 0.26],
    );
    this.body.add(this.tail);

    for (const s of [-1, 1]) {
      const leg = part(
        (b) => {
          b.box(0.22, 0.46, 0.26, FUR, [s * 0.17, 0.4, 0]); // short, stout leg
          b.box(0.26, 0.08, 0.36, FUR_DARK, [s * 0.17, 0.04, -0.04]); // big webbed foot
        },
        [0, 0.66, 0],
      );
      this.legs.push(leg);
      this.body.add(leg);
      const arm = part(
        (b) => {
          b.box(0.15, 0.44, 0.15, FUR, [s * 0.37, 1.12, 0]);
          b.box(0.15, 0.08, 0.16, FUR_DARK, [s * 0.37, 0.88, -0.01]); // paw
        },
        [0, 1.34, 0],
      );
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
    shadow.scale.set(1, 1.3, 1); // the tail lies behind, so the shadow is longer
    shadow.position.z = 0.15;
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
    this.tail.rotation.set(0, 0, 0);
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
      this.tail.rotation.x = -k * 0.6; // the tail flops up as it goes over
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
      let wag = 0.32 * run;
      if (this.cheerT >= 0) {
        this.cheerT += dt;
        y += Math.abs(Math.sin(this.cheerT * 9)) * 0.22;
        wag = 0.5; // happy beaver: a big fast wag while it bounces
      }
      // The tail wags side to side in time with the stride and slaps up and down a little.
      const wagPhase = this.cheerT >= 0 ? this.cheerT * 14 : this.phase;
      this.tail.rotation.y = Math.sin(wagPhase) * wag;
      this.tail.rotation.z = Math.sin(wagPhase) * wag * 0.4;
      this.tail.rotation.x = Math.cos(wagPhase * 2) * 0.1 * run - this.serveK * 0.15;
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
