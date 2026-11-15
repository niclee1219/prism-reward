// The serve cutscene's set: Ah Ma's stall banner over the walkway, a table of hungry
// customers under it, and the finished dish itself. The World drives the timeline;
// this file only builds the pieces and poses them for a given moment.
import * as THREE from 'three';
import { WORLD } from '../../config';
import type { Dish, DishId } from '../../content/dishes';
import { Builder, GLOW_MAT, PIXEL_FONT, Quads, VC_MAT, bend, canvasTexture, haloMaterial, pixelTextTexture } from './build';
import { catGeometry } from './Props';

/** Seconds into the cutscene: the dish appears overhead, leaves the hands, lands on the table. */
export const SERVE_T = { RAISE: 1.65, THROW: 2.5, LAND: 2.9 };

const TABLE_Z = -1.7;
const TABLE_TOP = 0.84;
const HOLD = new THREE.Vector3(0, 2.3, -0.05);
/** Held overhead, the dish tips toward the camera so the food (not the plate's underside) shows. */
const HOLD_TILT = 0.75;
const ROAD_HALF = WORLD.LANE_M * 1.5 + 0.15;

function plate(b: Builder): Builder {
  return b.cyl(0.5, 0.34, 0.07, '#ffffff', [0, 0.035, 0], 20).cyl(0.52, 0.5, 0.02, '#8ecae6', [0, 0.075, 0], 20);
}

const DISH_MODELS: Record<DishId, () => THREE.BufferGeometry> = {
  'chicken-rice': () => {
    const b = plate(new Builder());
    b.sphere(0.25, '#fffdf5', [-0.14, 0.1, 0.02], [1, 0.75, 1]); // dome of rice
    for (let i = 0; i < 5; i++) {
      // Sliced chicken fanned out, pale meat with golden skin on top.
      b.box(0.3, 0.07, 0.085, '#f6dfb8', [0.2, 0.12, -0.2 + i * 0.1], [0, 0.15, 0.35]);
      b.box(0.3, 0.02, 0.09, '#e0a84e', [0.185, 0.165, -0.2 + i * 0.1], [0, 0.15, 0.35]);
    }
    for (let i = 0; i < 3; i++) b.cyl(0.07, 0.07, 0.025, '#7bc96f', [-0.3 + i * 0.09, 0.09, 0.3 - i * 0.03], 10, [0.3, 0, 0]);
    b.cyl(0.085, 0.07, 0.05, '#fff6e0', [0.06, 0.1, 0.34], 10).cyl(0.07, 0.07, 0.02, '#e63946', [0.06, 0.125, 0.34], 10); // chilli dip
    b.box(0.05, 0.02, 0.12, '#2a9d8f', [-0.14, 0.29, 0.02], [0, 0.6, 0]); // coriander
    return b.geometry();
  },
  'char-kway-teow': () => {
    const b = plate(new Builder());
    b.sphere(0.36, '#7a4a21', [0, 0.08, 0], [1, 0.45, 1]);
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4;
      b.box(0.34, 0.03, 0.06, i % 3 ? '#c98d4b' : '#e2b06c', [Math.cos(a) * 0.14, 0.2 + (i % 4) * 0.012, Math.sin(a) * 0.14], [0, a * 1.7, 0.1]);
    }
    for (const [x, z] of [[0.16, 0.1], [-0.12, -0.14]]) b.sphere(0.075, '#ff8fa3', [x, 0.27, z], [1.5, 0.8, 0.9]); // prawns
    b.sphere(0.07, '#ffd166', [-0.16, 0.25, 0.12], [1.3, 0.6, 1]); // egg
    for (let i = 0; i < 5; i++) b.box(0.16, 0.02, 0.025, '#52b788', [Math.cos(i * 1.9) * 0.2, 0.27, Math.sin(i * 1.9) * 0.2], [0, i * 1.3, 0]); // chives
    b.cyl(0.05, 0.05, 0.02, '#b5651d', [0.05, 0.27, -0.2], 8); // lap cheong
    return b.geometry();
  },
  laksa: () => {
    const b = new Builder();
    b.cyl(0.5, 0.3, 0.32, '#fff6e0', [0, 0.16, 0], 20).cyl(0.51, 0.49, 0.05, '#e63946', [0, 0.3, 0], 20); // bowl with a red band
    b.cyl(0.46, 0.46, 0.02, '#f08c2e', [0, 0.325, 0], 20); // curry broth
    for (let i = 0; i < 7; i++) b.box(0.3, 0.03, 0.05, '#fffaf0', [Math.cos(i * 2.1) * 0.12, 0.345, Math.sin(i * 2.1) * 0.12], [0, i * 1.1, 0]); // noodles
    b.sphere(0.08, '#ff8fa3', [0.2, 0.37, 0.1], [1.5, 0.8, 0.9]).sphere(0.08, '#ff8fa3', [0.1, 0.37, -0.22], [1.5, 0.8, 0.9]); // prawns
    b.sphere(0.1, '#ffffff', [-0.2, 0.35, 0.14], [1, 0.5, 1.2]).sphere(0.055, '#ffb703', [-0.2, 0.385, 0.14], [1, 0.5, 1]); // half an egg
    b.box(0.2, 0.02, 0.1, '#2d6a4f', [-0.08, 0.37, -0.14], [0, 0.7, 0]).box(0.16, 0.02, 0.08, '#40916c', [0.02, 0.38, -0.05], [0, -0.4, 0]); // laksa leaf
    b.sphere(0.06, '#c1121f', [0.26, 0.37, -0.1], [1, 0.6, 1]); // sambal
    return b.geometry();
  },
};

/** A seated-height customer with both arms thrown up. */
function customer(shirt: string, hair: string, skin: string, bun: boolean): THREE.BufferGeometry {
  const b = new Builder();
  b.box(0.2, 0.5, 0.22, '#3d405b', [-0.13, 0.25, 0]).box(0.2, 0.5, 0.22, '#3d405b', [0.13, 0.25, 0]);
  b.box(0.56, 0.62, 0.32, shirt, [0, 0.8, 0]);
  b.box(0.36, 0.36, 0.34, skin, [0, 1.3, 0]);
  b.box(0.38, 0.14, 0.36, hair, [0, 1.46, -0.01]);
  if (bun) b.sphere(0.12, hair, [0, 1.58, -0.08]);
  b.box(0.06, 0.07, 0.02, '#1b1b2f', [-0.09, 1.33, 0.175]).box(0.06, 0.07, 0.02, '#1b1b2f', [0.09, 1.33, 0.175]);
  b.box(0.12, 0.08, 0.02, '#7a1f1f', [0, 1.2, 0.175]); // mouth wide open
  b.box(0.13, 0.5, 0.13, skin, [-0.42, 1.2, 0], [0, 0, 0.55]).box(0.13, 0.5, 0.13, skin, [0.42, 1.2, 0], [0, 0, -0.55]);
  return b.geometry();
}

function bannerTexture(dish: Dish): THREE.CanvasTexture {
  return pixelTextTexture(1024, 256, (ctx) => {
    ctx.fillStyle = '#160d2b';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = dish.colour; // a hard double frame instead of a soft glow, to match the pixel street
    ctx.lineWidth = 12;
    ctx.strokeRect(14, 14, 996, 228);
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, 952, 184);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd166';
    ctx.font = `44px ${PIXEL_FONT}`;
    ctx.fillText("AH MA'S", 512, 80);
    ctx.fillStyle = '#fff6e0';
    ctx.font = `76px ${PIXEL_FONT}`;
    ctx.fillStyle = '#2a1608';
    ctx.fillText(dish.name.toUpperCase(), 518, 170, 900); // hard drop shadow
    ctx.fillStyle = '#fff6e0';
    ctx.fillText(dish.name.toUpperCase(), 512, 164, 900);
  });
}

function raysTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    ctx.translate(128, 128);
    for (let i = 0; i < 14; i++) {
      ctx.rotate((Math.PI * 2) / 14);
      const g = ctx.createLinearGradient(0, 0, 0, -128);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-16, -128);
      ctx.lineTo(16, -128);
      ctx.fill();
    }
  });
}

const elasticOut = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : 2 ** (-10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);

export class ServeScene {
  /** The stall and table. Slides toward the runner with the world. */
  readonly set = new THREE.Group();
  /** The dish and its halo. Lives in runner space (the runner has stopped by the time it shows). */
  readonly dish = new THREE.Group();
  private dishMesh: THREE.Mesh | null = null;
  private dishGeoms = new Map<DishId, THREE.BufferGeometry>();
  private rays: THREE.Sprite;
  private banner: THREE.Mesh;
  private banners = new Map<DishId, THREE.CanvasTexture>();
  private customers: { mesh: THREE.Mesh; baseY: number; phase: number }[] = [];
  private landed = false;

  constructor() {
    const b = new Builder();
    const gl = new Builder();
    const fx = new Quads();
    // Marble table with a red rim and four stools.
    b.cyl(0.9, 0.9, 0.07, '#f7f1e3', [0, TABLE_TOP - 0.04, TABLE_Z], 22).cyl(0.92, 0.92, 0.03, '#e63946', [0, TABLE_TOP - 0.08, TABLE_Z], 22);
    b.cyl(0.09, 0.16, TABLE_TOP - 0.08, '#6c757d', [0, (TABLE_TOP - 0.08) / 2, TABLE_Z], 8);
    for (const x of [-1.25, 1.25]) b.cyl(0.19, 0.23, 0.46, '#1d7bd8', [x, 0.23, TABLE_Z], 10);
    b.cyl(0.19, 0.23, 0.46, '#f4a261', [0.15, 0.23, TABLE_Z - 1.15], 10);
    // Arch over the walkway carrying the stall's banner, ringed with bulbs.
    for (const s of [-1, 1]) b.box(0.16, 4.5, 0.16, '#1d1433', [s * (ROAD_HALF + 0.25), 2.25, TABLE_Z - 1.9]);
    b.box(ROAD_HALF * 2 + 0.7, 1.5, 0.1, '#160d2b', [0, 3.75, TABLE_Z - 1.93]);
    for (let i = 0; i < 13; i++) {
      const x = (i / 12 - 0.5) * (ROAD_HALF * 2 + 0.5);
      const colour = ['#ffd166', '#ff5d8f', '#4cc9f0'][i % 3];
      gl.box(0.11, 0.11, 0.11, colour, [x, 4.56, TABLE_Z - 1.85]);
      fx.add(x, 4.56, TABLE_Z - 1.7, 0.7, 0.7, colour, 'cam', 0.9);
    }
    fx.add(0, 0.04, TABLE_Z, 6.5, 6.5, '#ffd166', 'floor', 0.55); // spotlight on the table
    this.set.add(new THREE.Mesh(b.geometry(), VC_MAT), new THREE.Mesh(gl.geometry(), GLOW_MAT), fx.mesh(haloMaterial()));

    this.banner = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + 0.5, 1.36), bend(new THREE.MeshBasicMaterial()));
    this.banner.position.set(0, 3.75, TABLE_Z - 1.87);
    this.set.add(this.banner);

    const people: [number, number, number, THREE.BufferGeometry][] = [
      [-1.25, 0.2, 0.45, customer('#ff8fab', '#e9ecef', '#d9a066', true)], // auntie
      [1.25, 0.2, -0.45, customer('#74c69d', '#1b1b2f', '#c68b59', false)], // uncle
    ];
    for (const [x, y, turn, geom] of people) {
      const mesh = new THREE.Mesh(geom, VC_MAT);
      mesh.position.set(x, y, TABLE_Z);
      mesh.rotation.y = turn;
      this.set.add(mesh);
      this.customers.push({ mesh, baseY: y, phase: x });
    }
    const cat = new THREE.Mesh(catGeometry(), VC_MAT);
    cat.position.set(0.15, 0.46, TABLE_Z - 1.15);
    cat.scale.setScalar(0.75);
    this.set.add(cat);
    this.customers.push({ mesh: cat, baseY: 0.46, phase: 2.2 });

    this.rays = new THREE.Sprite(
      bend(new THREE.SpriteMaterial({ map: raysTexture(), color: '#ffd166', blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }), true),
    );
    this.rays.position.y = 0.2;
    this.dish.add(this.rays);
    this.set.visible = this.dish.visible = false;
  }

  /** Where the dish comes to rest, in runner space. */
  get tablePoint(): THREE.Vector3 {
    return new THREE.Vector3(0, TABLE_TOP, TABLE_Z);
  }

  start(dish: Dish): void {
    let geom = this.dishGeoms.get(dish.id);
    if (!geom) this.dishGeoms.set(dish.id, (geom = DISH_MODELS[dish.id]()));
    if (this.dishMesh) this.dish.remove(this.dishMesh);
    this.dishMesh = new THREE.Mesh(geom, VC_MAT);
    this.dish.add(this.dishMesh);
    let tex = this.banners.get(dish.id);
    if (!tex) this.banners.set(dish.id, (tex = bannerTexture(dish)));
    const mat = this.banner.material as THREE.MeshBasicMaterial;
    mat.map = tex;
    mat.needsUpdate = true;
    this.rays.material.color.set(dish.colour).lerp(new THREE.Color('#ffffff'), 0.35);
    this.landed = false;
    this.set.visible = true;
    this.dish.visible = false;
  }

  stop(): void {
    this.set.visible = this.dish.visible = false;
  }

  /**
   * @param st seconds into the cutscene, @param leftM metres the runner still has to go.
   * Returns true on the one frame the dish lands on the table.
   */
  update(st: number, leftM: number, time: number): boolean {
    this.set.position.z = -leftM;
    const T = SERVE_T;
    const mesh = this.dishMesh;
    let justLanded = false;
    if (mesh && st >= T.RAISE) {
      this.dish.visible = true;
      const pop = elasticOut((st - T.RAISE) / 0.55);
      if (st < T.THROW) {
        this.dish.position.copy(HOLD);
        this.dish.position.y += Math.sin(time * 5) * 0.03;
        this.dish.rotation.x = HOLD_TILT;
        mesh.scale.setScalar(pop * 0.85);
        mesh.rotation.y = time * 1.5;
      } else if (st < T.LAND) {
        const k = (st - T.THROW) / (T.LAND - T.THROW);
        this.dish.position.lerpVectors(HOLD, this.tablePoint, k);
        this.dish.position.y += Math.sin(k * Math.PI) * 0.75;
        this.dish.rotation.x = HOLD_TILT * (1 - k);
        mesh.rotation.y = time * 1.5 + k * Math.PI * 2;
        mesh.scale.setScalar(0.85 + k * 0.15);
      } else {
        if (!this.landed) justLanded = this.landed = true;
        const u = st - T.LAND;
        const wobble = Math.exp(-7 * u) * Math.cos(22 * u) * 0.3;
        this.dish.position.copy(this.tablePoint);
        this.dish.rotation.x = 0;
        mesh.scale.set(1 + wobble * 0.5, 1 - wobble, 1 + wobble * 0.5);
        mesh.rotation.y += 0.01;
      }
      const glow = st < T.LAND ? Math.min((st - T.RAISE) / 0.3, 1) * 0.75 : 0.9;
      this.rays.material.opacity = glow;
      this.rays.material.rotation = time * 0.9;
      this.rays.scale.setScalar((st < T.LAND ? 2.4 : 3.6) + Math.sin(time * 6) * 0.25);
    }
    // Customers lean in hungrily, then jump for joy once the food is down.
    for (const c of this.customers) {
      c.mesh.position.y = c.baseY + (this.landed ? Math.abs(Math.sin((st - T.LAND) * 9 + c.phase)) * 0.38 : Math.abs(Math.sin(time * 4 + c.phase)) * 0.05);
    }
    return justLanded;
  }
}
