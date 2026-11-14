// Obstacles (things you really dodge in a hawker centre) and the answer gates.
// Each obstacle kind is one merged geometry; meshes are pooled and reused.
import * as THREE from 'three';
import type { ObstacleKind } from '../sim/RunSim';
import { Builder, LANE_COLOURS, VC_MAT, bend, canvasTexture } from './build';

function stools(): THREE.BufferGeometry {
  const b = new Builder();
  // A wobbly stack of red plastic stools.
  for (let i = 0; i < 5; i++) {
    b.cyl(0.26, 0.32, 0.42, i % 2 ? '#d62828' : '#e63946', [Math.sin(i * 1.7) * 0.04, 0.21 + i * 0.27, 0], 10);
  }
  b.cyl(0.27, 0.27, 0.05, '#f07167', [0.04, 1.5, 0], 10);
  return b.geometry();
}

function trolley(): THREE.BufferGeometry {
  const b = new Builder();
  // Tray-return trolley: steel frame, stacked trays, wheels.
  for (const x of [-0.45, 0.45]) for (const z of [-0.3, 0.3]) b.box(0.05, 1.3, 0.05, '#adb5bd', [x, 0.75, z]);
  for (let i = 0; i < 4; i++) {
    b.box(0.95, 0.04, 0.65, '#ced4da', [0, 0.35 + i * 0.3, 0]);
    b.box(0.8, 0.06, 0.5, ['#2a9d8f', '#f4a261', '#457b9d', '#e63946'][i], [0, 0.4 + i * 0.3, 0]);
    b.cyl(0.1, 0.07, 0.08, '#fff6e0', [0.15, 0.47 + i * 0.3, 0.05], 8); // a bowl left on a tray
  }
  for (const x of [-0.42, 0.42]) for (const z of [-0.28, 0.28]) b.cyl(0.07, 0.07, 0.05, '#212529', [x, 0.07, z], 8, [Math.PI / 2, 0, 0]);
  b.box(1.0, 0.06, 0.06, '#adb5bd', [0, 1.38, 0.32]); // handle
  return b.geometry();
}

function wetFloor(): THREE.BufferGeometry {
  const b = new Builder();
  // Yellow A-frame "CAUTION WET FLOOR" sign, plus a spilled puddle.
  b.box(0.62, 1.05, 0.04, '#ffd60a', [0, 0.52, -0.18], [-0.32, 0, 0]);
  b.box(0.62, 1.05, 0.04, '#ffd60a', [0, 0.52, 0.18], [0.32, 0, 0]);
  b.box(0.36, 0.36, 0.02, '#1b1b2f', [0, 0.6, 0.215], [0.32, 0, 0]);
  b.box(0.2, 0.2, 0.025, '#ffd60a', [0, 0.6, 0.22], [0.32, 0, 0]);
  b.cyl(0.65, 0.65, 0.01, '#9ecae1', [0.1, 0.006, 0], 18);
  return b.geometry();
}

function uncle(): THREE.BufferGeometry {
  const b = new Builder();
  // An uncle carrying a tray of bowls, facing the player.
  const skin = '#c68b59';
  b.box(0.2, 0.75, 0.22, '#6c757d', [-0.14, 0.38, 0]);
  b.box(0.2, 0.75, 0.22, '#6c757d', [0.14, 0.38, 0]);
  b.box(0.58, 0.7, 0.34, '#f8f9fa', [0, 1.1, 0]); // white singlet
  b.sphere(0.24, '#f8f9fa', [0, 1.0, 0.12], [1.1, 1, 0.8]); // tummy
  b.box(0.36, 0.38, 0.34, skin, [0, 1.65, 0]);
  b.box(0.38, 0.1, 0.36, '#adb5bd', [0, 1.86, 0]); // grey hair
  b.box(0.14, 0.45, 0.14, skin, [-0.36, 1.2, 0.18], [-1.1, 0, 0]);
  b.box(0.14, 0.45, 0.14, skin, [0.36, 1.2, 0.18], [-1.1, 0, 0]);
  b.box(0.8, 0.04, 0.5, '#2a9d8f', [0, 1.28, 0.38]); // tray
  b.cyl(0.13, 0.09, 0.1, '#fff6e0', [-0.2, 1.35, 0.38], 10);
  b.cyl(0.13, 0.09, 0.1, '#fff6e0', [0.18, 1.35, 0.42], 10);
  b.cyl(0.06, 0.06, 0.16, '#7f5539', [0.02, 1.38, 0.28], 8); // kopi
  return b.geometry();
}

function cat(): THREE.BufferGeometry {
  const b = new Builder();
  // The hawker-centre cat, sitting in the way and not moving for anyone. (Big cat.)
  b.sphere(0.36, '#f4a261', [0, 0.38, 0], [0.9, 1, 1.25]);
  b.sphere(0.25, '#f4a261', [0, 0.82, 0.22]);
  b.box(0.1, 0.16, 0.06, '#f4a261', [-0.13, 1.06, 0.22], [0, 0, 0.3]);
  b.box(0.1, 0.16, 0.06, '#f4a261', [0.13, 1.06, 0.22], [0, 0, -0.3]);
  b.box(0.06, 0.06, 0.02, '#1b1b2f', [-0.09, 0.86, 0.46]);
  b.box(0.06, 0.06, 0.02, '#1b1b2f', [0.09, 0.86, 0.46]);
  b.cyl(0.05, 0.07, 0.7, '#e76f51', [0.3, 0.3, -0.35], 6, [0.9, 0, -0.6]);
  for (let i = 0; i < 3; i++) b.box(0.5, 0.05, 0.02, '#e76f51', [0, 0.5 + i * 0.12, 0.44 - i * 0.03]);
  return b.geometry();
}

const GEOMETRY: Record<ObstacleKind, () => THREE.BufferGeometry> = { stools, trolley, wetfloor: wetFloor, uncle, cat };

/** The cat also turns up as a customer in the serve scene. */
export const catGeometry = cat;

export class ObstaclePool {
  private geoms = new Map<ObstacleKind, THREE.BufferGeometry>();
  private free = new Map<ObstacleKind, THREE.Mesh[]>();

  constructor(private parent: THREE.Object3D) {}

  take(kind: ObstacleKind): THREE.Mesh {
    const spare = this.free.get(kind)?.pop();
    if (spare) {
      spare.visible = true;
      spare.scale.setScalar(1);
      spare.rotation.set(0, 0, 0);
      return spare;
    }
    let g = this.geoms.get(kind);
    if (!g) this.geoms.set(kind, (g = GEOMETRY[kind]()));
    const m = new THREE.Mesh(g, VC_MAT);
    m.userData.kind = kind;
    this.parent.add(m);
    return m;
  }

  give(m: THREE.Mesh): void {
    m.visible = false;
    const kind = m.userData.kind as ObstacleKind;
    if (!this.free.has(kind)) this.free.set(kind, []);
    this.free.get(kind)!.push(m);
  }
}

/**
 * Pickups: spinning gold coins and the tingkat (stacked enamel tiffin carrier) mystery box.
 * Pooled like obstacles. Each mesh is a group so the bob/spin does not fight the placement.
 */
export class PickupPool {
  private coinGeom: THREE.BufferGeometry;
  private coinMat = bend(new THREE.MeshLambertMaterial({ color: '#ffd166', emissive: '#c98a12', emissiveIntensity: 0.85 }));
  private tingkatGeom: THREE.BufferGeometry;
  private glowMat: THREE.SpriteMaterial;
  private free: Record<'coin' | 'tingkat', THREE.Group[]> = { coin: [], tingkat: [] };

  constructor(private parent: THREE.Object3D, glow: THREE.Texture) {
    // Coin: a fat disc facing the camera, with a raised rim and a centre stamp.
    const c = new Builder();
    c.cyl(0.3, 0.3, 0.07, '#ffd166', [0, 0, 0], 18, [Math.PI / 2, 0, 0]);
    c.cyl(0.33, 0.33, 0.05, '#e09f3e', [0, 0, -0.01], 18, [Math.PI / 2, 0, 0]);
    c.box(0.08, 0.26, 0.09, '#e09f3e', [0, 0, 0]);
    this.coinGeom = c.geometry();

    // Tingkat: three enamel tiers, steel bands, carry handle and a "?" tag.
    const t = new Builder();
    const tiers = ['#e63946', '#2a9d8f', '#fff6e0'];
    for (let i = 0; i < 3; i++) {
      t.cyl(0.32, 0.3, 0.26, tiers[i], [0, 0.15 + i * 0.29, 0], 16);
      t.cyl(0.33, 0.33, 0.04, '#ced4da', [0, 0.3 + i * 0.29, 0], 16);
    }
    t.cyl(0.18, 0.32, 0.12, '#ced4da', [0, 1.06, 0], 16); // lid
    for (const x of [-0.34, 0.34]) t.box(0.04, 1.1, 0.06, '#adb5bd', [x, 0.75, 0]);
    t.box(0.72, 0.05, 0.06, '#adb5bd', [0, 1.3, 0]);
    t.box(0.2, 0.26, 0.03, '#ffd166', [0, 0.6, 0.33]); // tag
    t.box(0.06, 0.06, 0.04, '#1b1b2f', [0, 0.53, 0.35]); // "?" dot
    t.box(0.1, 0.05, 0.04, '#1b1b2f', [0, 0.66, 0.35]);
    this.tingkatGeom = t.geometry();
    this.glowMat = bend(new THREE.SpriteMaterial({ map: glow, color: '#ffd166', blending: THREE.AdditiveBlending, depthWrite: false }), true);
  }

  take(kind: 'coin' | 'tingkat'): THREE.Group {
    const spare = this.free[kind].pop();
    if (spare) {
      spare.visible = true;
      return spare;
    }
    const g = new THREE.Group();
    g.userData.kind = kind;
    const body =
      kind === 'coin' ? new THREE.Mesh(this.coinGeom, this.coinMat) : new THREE.Mesh(this.tingkatGeom, VC_MAT);
    body.name = 'body';
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(kind === 'coin' ? 0.9 : 2.2);
    glow.position.y = kind === 'coin' ? 0 : 0.6;
    g.add(glow, body);
    this.parent.add(g);
    return g;
  }

  give(g: THREE.Group): void {
    g.visible = false;
    this.free[g.userData.kind as 'coin' | 'tingkat'].push(g);
  }
}

let curtainTex: THREE.CanvasTexture | null = null;
/** Vertical fade, bright at the bottom: makes a doorway read as a curtain of light. */
function curtain(): THREE.CanvasTexture {
  return (curtainTex ??= canvasTexture(8, 64, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 64);
  }));
}

/** An arch over the walkway: one coloured doorway per lane, matching the answer cards. */
export class GateMesh {
  readonly group = new THREE.Group();
  readonly panels: THREE.Mesh[] = [];
  readonly tops: THREE.Mesh[] = [];
  private strips: THREE.Mesh[] = [];
  private fadeT = -1;

  constructor(laneM: number, private tutorialLane: number | null) {
    const b = new Builder();
    const half = laneM * 1.5;
    for (const x of [-half, -laneM / 2, laneM / 2, half]) b.box(0.12, 2.7, 0.12, '#1b1b2f', [x, 1.35, 0]);
    b.box(half * 2 + 0.2, 0.14, 0.16, '#1b1b2f', [0, 2.75, 0]);
    this.group.add(b.mesh());
    for (let l = 0; l < 3; l++) {
      const x = (l - 1) * laneM;
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(laneM - 0.16, 2.35),
        bend(new THREE.MeshBasicMaterial({ color: LANE_COLOURS[l], map: curtain(), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })),
      );
      panel.position.set(x, 1.3, 0);
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(laneM - 0.16, 0.34, 0.1),
        bend(new THREE.MeshBasicMaterial({ color: LANE_COLOURS[l], transparent: true })),
      );
      top.position.set(x, 2.5, 0);
      // A strip of the lane's colour on the floor leading up to the doorway, so the answer
      // colours can be matched to lanes from far away.
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(laneM - 0.3, 7, 1, 6),
        bend(new THREE.MeshBasicMaterial({ color: LANE_COLOURS[l], map: curtain(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), true),
      );
      strip.rotation.set(-Math.PI / 2, 0, Math.PI); // bright end at the doorway
      strip.position.set(x, 0.03, 3.5);
      strip.visible = tutorialLane === null || l === tutorialLane;
      this.group.add(strip);
      this.strips.push(strip);
      if (tutorialLane !== null && l !== tutorialLane) {
        (panel.material as THREE.MeshBasicMaterial).opacity = 0.12;
        (top.material as THREE.MeshBasicMaterial).opacity = 0.3;
      }
      this.group.add(panel, top);
      this.panels.push(panel);
      this.tops.push(top);
    }
  }

  /** Light the result: chosen lane red if wrong, correct lane green; then fade out. */
  resolve(chosen: number, correctLane: number, correct: boolean): void {
    const paint = (l: number, c: number) => {
      (this.panels[l].material as THREE.MeshBasicMaterial).color.setHex(c);
      (this.panels[l].material as THREE.MeshBasicMaterial).opacity = 0.9;
      (this.tops[l].material as THREE.MeshBasicMaterial).color.setHex(c);
      (this.tops[l].material as THREE.MeshBasicMaterial).opacity = 1;
    };
    paint(correctLane, 0x52e08a);
    if (!correct) paint(chosen, 0xe63946);
    this.fadeT = 0;
  }

  get fading(): boolean {
    return this.fadeT >= 0;
  }

  /** Returns false once fully faded (caller removes it). */
  update(dt: number, time: number): boolean {
    if (this.tutorialLane !== null && this.fadeT < 0) {
      const p = this.panels[this.tutorialLane];
      (p.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(time * 9) * 0.3;
      this.tops[this.tutorialLane].scale.y = 1 + Math.abs(Math.sin(time * 9)) * 0.8;
    }
    if (this.fadeT < 0) return true;
    this.fadeT += dt;
    const k = 1 - this.fadeT / 0.3;
    for (const m of [...this.panels, ...this.tops, ...this.strips]) {
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(mat.opacity, Math.max(k, 0));
    }
    // The arch carries on past the runner toward the camera: drop it before it fills the lens.
    return k > 0 && this.group.position.z < 2.5;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (o.material !== VC_MAT) (o.material as THREE.Material).dispose();
        o.geometry.dispose();
      }
    });
  }
}
