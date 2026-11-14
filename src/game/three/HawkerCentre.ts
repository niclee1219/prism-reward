// An open-air hawker street at dusk (think Satay Street): a dark terrazzo walkway with
// scrolling lane dashes, then a row of recycled 6 m segments. Each segment has a lit stall
// on both sides (neon signboard, striped awning, glowing serving hatch), seating, lamp posts
// with lanterns, a string of festoon bulbs overhead and an HDB block with lit windows behind.
// Segments that pass behind the camera jump to the far end, so the street never ends.
//
// Draw-call budget per segment: 1 lit mesh + 1 self-lit mesh + 1 additive halo mesh + 2 signs.
import * as THREE from 'three';
import { WORLD } from '../../config';
import { BEND, Builder, GLOW_MAT, Quads, VC_MAT, bend, canvasTexture, haloMaterial, whiteGlow } from './build';

const SEG_LEN = 6;
const SEGMENTS = 10;
const BEHIND = 10; // a segment this far behind the player (metres) is recycled
const ROAD_HALF = WORLD.LANE_M * 1.5 + 0.15;
const STALL_FRONT = 5.0;

/** Fog and horizon colour: far stalls melt into the sunset haze instead of popping in. */
export const HAZE = '#ff7a6b';

const STALLS = [
  'CHICKEN RICE', 'CHAR KWAY TEOW', 'LAKSA', 'ROTI PRATA', 'SATAY', 'KOPI · TEH',
  'NASI LEMAK', 'HOKKIEN MEE', 'CARROT CAKE', 'BAK CHOR MEE', 'FISHBALL NOODLE', 'CHENDOL',
];
const NEON = ['#ff5d8f', '#4cc9f0', '#ffd166', '#52e08a', '#b388ff', '#ff9f1c'];
const STALL_PASTEL = ['#f6bd60', '#84a59d', '#f28482', '#a3c4f3', '#cdb4db', '#90be6d'];
const HATCH_GLOW = ['#ffb84d', '#ffd98a', '#ff9e6b', '#ffe0a3'];
const AWNING = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d'];
const STOOL = ['#e63946', '#1d7bd8', '#2a9d8f', '#f4a261'];
const BLOCK = ['#3b2a63', '#2c2a5e', '#4a2d6b', '#2b3467', '#352457'];
const WINDOW = ['#ffd166', '#ffb703', '#ffe8b0', '#8ecae6', '#ff9ebb'];
const BULB = ['#ffd166', '#ff5d8f', '#4cc9f0', '#52e08a', '#ff9f1c', '#b388ff'];

/** Cheap repeatable pseudo-random in 0..1, so the street looks the same every load. */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function signTexture(name: string, i: number): THREE.CanvasTexture {
  const neon = NEON[i % NEON.length];
  return canvasTexture(512, 112, (ctx) => {
    ctx.fillStyle = '#160d2b';
    ctx.fillRect(0, 0, 512, 112);
    ctx.shadowColor = neon;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = neon;
    ctx.lineWidth = 5;
    ctx.strokeRect(9, 9, 494, 94);
    ctx.fillStyle = '#fff6e0';
    ctx.font = '900 52px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Drawn twice: once for the coloured glow, once for a crisp bright core.
    ctx.fillText(name, 256, 50, 460);
    ctx.shadowBlur = 4;
    ctx.fillText(name, 256, 50, 460);
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = neon;
    ctx.fillText(`#01-${String(10 + i * 3).padStart(2, '0')}`, 256, 91);
  });
}

/** Dark terrazzo for the seating areas either side of the walkway (one 2 m tile). */
function floorTexture(): THREE.CanvasTexture {
  const t = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#2a1e44';
    ctx.fillRect(0, 0, 128, 128);
    const speck = ['#3a2b5c', '#4b3a70', '#241a3a', '#5a4580'];
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = speck[i % speck.length];
      const s = 1 + (i % 3);
      ctx.fillRect((i * 53) % 128, (i * 97 + (i >> 3) * 13) % 128, s, s);
    }
    ctx.fillStyle = '#1d1433';
    ctx.fillRect(0, 126, 128, 2);
    ctx.fillRect(126, 0, 2, 128);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * The walkway itself: three lanes across, 4 m of length per repeat. Dashed dividers and
 * faint forward chevrons scroll under the runner, which is most of the feeling of speed.
 */
function roadTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const t = canvasTexture(W, H, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#33254f');
    g.addColorStop(0.5, '#44336a');
    g.addColorStop(1, '#33254f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 420; i++) {
      ctx.fillStyle = ['#584584', '#2b1f45', '#6b5598', '#3a2b5c'][i % 4];
      const s = 1 + (i % 3);
      ctx.fillRect((i * 71) % W, (i * 113 + (i >> 2) * 29) % H, s, s);
    }
    // A chevron in each lane, pointing the way you run (up the canvas = away from the camera).
    ctx.strokeStyle = 'rgba(255, 246, 224, 0.1)';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    const road = W - 16;
    for (let lane = 0; lane < 3; lane++) {
      const cx = 8 + road * ((lane + 0.5) / 3);
      ctx.beginPath();
      ctx.moveTo(cx - 20, 150);
      ctx.lineTo(cx, 126);
      ctx.lineTo(cx + 20, 150);
      ctx.stroke();
    }
    // Dashed lane dividers.
    ctx.fillStyle = 'rgba(255, 246, 224, 0.75)';
    for (const k of [1, 2]) ctx.fillRect(8 + (road * k) / 3 - 2.5, 20, 5, 110);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Sunset sky, painted once: indigo with stars at the top, down through magenta to the haze. */
export function skyTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#150c33');
    g.addColorStop(0.2, '#3a1a6b');
    g.addColorStop(0.36, '#b03a8c');
    g.addColorStop(0.47, HAZE);
    g.addColorStop(0.56, '#ffb37a');
    g.addColorStop(1, '#ffb37a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 512);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 + hash(i) * 0.6})`;
      ctx.fillRect(hash(i + 40) * 64, hash(i + 80) * 120, 1, 1);
    }
  });
}

interface Segment {
  root: THREE.Group;
  bulbs: THREE.Mesh;
  halos: THREE.Mesh;
}

/** One 6 m slice of the street. Mirrored stalls on the left (side -1) and right (side 1). */
function buildSegment(index: number, halo: THREE.Material): Segment {
  const b = new Builder(); // lit
  const gl = new Builder(); // self-lit
  const fx = new Quads(); // additive halos and pools of light
  const bulbs = new Quads(); // festoon-bulb halos, kept apart so they can twinkle
  const root = new THREE.Group();
  const zMid = -SEG_LEN / 2;
  const len = SEG_LEN - 0.6;

  for (const side of [-1, 1] as const) {
    const k = index * 2 + (side > 0 ? 1 : 0);
    const x0 = side * STALL_FRONT; // stall front line
    const xBack = side * (STALL_FRONT + 2.6);
    const pastel = STALL_PASTEL[k % STALL_PASTEL.length];
    const warm = HATCH_GLOW[k % HATCH_GLOW.length];

    // Stall shell, set back behind the counter so no two faces share a plane (no flicker).
    const shellFront = x0 + side * 0.35;
    b.box(Math.abs(xBack - shellFront), 3.4, len, '#2a1f3d', [(shellFront + xBack) / 2, 1.7, zMid]);
    // The serving hatch glows from inside; the fascia and columns frame it.
    gl.box(0.06, 1.5, len - 0.5, warm, [shellFront - side * 0.05, 1.8, zMid]);
    b.box(0.2, 0.9, len, pastel, [x0 + side * 0.2, 3.0, zMid]);
    b.box(0.3, 3.4, 0.3, pastel, [x0 + side * 0.2, 1.7, -0.45]);
    b.box(0.3, 3.4, 0.3, pastel, [x0 + side * 0.2, 1.7, -SEG_LEN + 0.45]);
    // Counter with a stainless top and a lit glass display box.
    b.box(0.6, 1.0, len - 0.6, '#c9ccd1', [x0 + side * 0.25, 0.5, zMid]);
    b.box(0.72, 0.05, len - 0.5, '#eef1f4', [x0 + side * 0.25, 1.03, zMid]);
    gl.box(0.4, 0.42, 1.8, '#dff6ff', [x0 + side * 0.25, 1.27, zMid + 0.9]);
    // Hanging roast ducks, silhouetted against the hatch.
    for (let i = 0; i < 3; i++) b.sphere(0.13, '#7a3b12', [x0 + side * 0.22, 2.25, zMid + 0.5 + i * 0.32], [1, 1.4, 1]);
    // A big pot and a wok with fire under it.
    b.cyl(0.3, 0.26, 0.45, '#8d99ae', [x0 + side * 0.25, 1.28, zMid - 1.9], 12);
    b.cyl(0.36, 0.18, 0.16, '#2b2d42', [x0 + side * 0.25, 1.14, zMid - 0.9], 12);
    fx.add(x0 + side * 0.1, 1.25, zMid - 0.9, 1.3, 1.3, '#ff7b00', 'cam', 0.9);
    // Striped awning sloping out over the counter.
    const slats = 8;
    for (let i = 0; i < slats; i++) {
      const z = -0.3 - (i + 0.5) * (len / slats);
      b.box(1.0, 0.04, len / slats, i % 2 ? '#fff6e0' : AWNING[k % AWNING.length], [x0 - side * 0.4, 2.55, z], [0, 0, side * 0.32]);
    }
    // Light spilling out of the stall onto the floor.
    fx.add(side * (ROAD_HALF + 1.3), 0.03, zMid, 4.2, 5.5, warm, 'floor', 0.3);

    // Seating: a marble table with four plastic stools, every other segment per side.
    if ((index + (side > 0 ? 1 : 0)) % 2 === 0) {
      const tx = side * (ROAD_HALF + 1.35);
      b.cyl(0.55, 0.55, 0.06, '#f1ece2', [tx, 0.76, zMid], 16);
      b.cyl(0.06, 0.06, 0.74, '#6c757d', [tx, 0.37, zMid], 6);
      const stool = STOOL[k % STOOL.length];
      for (let s = 0; s < 4; s++) {
        const a = (s / 4) * Math.PI * 2 + 0.4;
        b.cyl(0.17, 0.21, 0.46, stool, [tx + Math.cos(a) * 0.82, 0.23, zMid + Math.sin(a) * 0.82], 8);
      }
      b.box(0.14, 0.05, 0.1, '#ffffff', [tx + 0.15, 0.82, zMid - 0.1]); // tissue packet "choping" the table
    }

    // Lamp post with a red lantern, at the start of the segment.
    const px = side * (ROAD_HALF + 0.5);
    b.box(0.12, 4.6, 0.12, '#1d1433', [px, 2.3, -0.1]);
    b.box(0.5, 0.08, 0.08, '#1d1433', [px - side * 0.2, 4.3, -0.1]);
    const lx = px - side * 0.42;
    gl.sphere(0.24, '#ff3b3b', [lx, 3.85, -0.1], [1, 1.15, 1]);
    gl.cyl(0.12, 0.12, 0.06, '#ffd166', [lx, 4.14, -0.1], 8);
    gl.cyl(0.1, 0.1, 0.05, '#ffd166', [lx, 3.56, -0.1], 8);
    gl.box(0.03, 0.22, 0.03, '#ffd166', [lx, 3.42, -0.1]);
    fx.add(lx, 3.85, -0.05, 1.9, 1.9, '#ff5a3c', 'cam', 0.8);
    fx.add(lx, 0.03, -0.1, 3.2, 3.2, '#ff6a4a', 'floor', 0.35);

    // Neon kerb along the edge of the walkway.
    gl.box(0.1, 0.05, SEG_LEN, index % 2 ? '#ff5d8f' : '#ff9f1c', [side * ROAD_HALF, 0.025, zMid]);

    // HDB block behind the stall, with lit windows on the faces the camera can see.
    const h = 9 + Math.floor(hash(k) * 5) * 2;
    const bx = side * (STALL_FRONT + 6.2);
    const bz = zMid;
    const inner = bx - side * 2.8;
    b.box(5.6, h, SEG_LEN - 1.0, BLOCK[k % BLOCK.length], [bx, h / 2, bz]);
    for (let row = 0; row * 1.5 + 4.6 < h - 0.6; row++) {
      const y = 4.6 + row * 1.5;
      for (let c = 0; c < 3; c++) {
        if (hash(k * 31 + row * 7 + c) < 0.3) continue;
        gl.box(0.06, 0.7, 0.9, WINDOW[Math.floor(hash(k + row * 3 + c * 11) * WINDOW.length)], [inner - side * 0.03, y, bz + (c - 1) * 1.5]);
      }
      for (let c = 0; c < 2; c++) {
        if (hash(k * 17 + row * 5 + c + 3) < 0.35) continue;
        gl.box(0.9, 0.7, 0.06, WINDOW[Math.floor(hash(k * 3 + row + c * 5) * WINDOW.length)], [bx - side * (0.9 + c * 1.5), y, bz + (SEG_LEN - 1.0) / 2 + 0.03]);
      }
    }

    // Neon signboard, facing the walkway.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(SEG_LEN - 1.2, 1.1),
      bend(new THREE.MeshBasicMaterial({ map: signTexture(STALLS[k % STALLS.length], k) })),
    );
    sign.position.set(x0 - side * 0.08, 4.0, zMid);
    sign.rotation.y = -side * (Math.PI / 2);
    root.add(sign);
    b.box(0.1, 1.24, SEG_LEN - 1.06, '#160d2b', [x0 + side * 0.02, 4.0, zMid]); // board behind the sign
    fx.add(x0 - side * 0.3, 4.0, zMid, 3.2, 2.6, NEON[k % NEON.length], 'cam', 0.28);
  }

  // Festoon bulbs strung across the walkway between the two lamp posts, sagging in the middle.
  const span = ROAD_HALF + 0.5;
  const N = 11;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const x = (t * 2 - 1) * span;
    const y = 4.45 - 0.75 * (1 - (t * 2 - 1) ** 2);
    const colour = BULB[(i + index) % BULB.length];
    gl.box(0.1, 0.13, 0.1, colour, [x, y, -0.1]);
    bulbs.add(x, y, 0.02, 0.75, 0.75, colour, 'cam', 0.85);
    if (i < N - 1) {
      const t2 = (i + 1) / (N - 1);
      const x2 = (t2 * 2 - 1) * span;
      const y2 = 4.45 - 0.75 * (1 - (t2 * 2 - 1) ** 2);
      b.box(Math.hypot(x2 - x, y2 - y), 0.02, 0.02, '#1d1433', [(x + x2) / 2, (y + y2) / 2 + 0.08, -0.1], [0, 0, Math.atan2(y2 - y, x2 - x)]);
    }
  }
  // Halfway along: a second string, of small paper lanterns.
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x = (t * 2 - 1) * (span - 0.6);
    const y = 4.7 - 0.5 * (1 - (t * 2 - 1) ** 2);
    const colour = i % 2 ? '#ffd166' : '#ff5d8f';
    gl.sphere(0.15, colour, [x, y, zMid], [1, 1.2, 1]);
    fx.add(x, y, zMid + 0.05, 1.0, 1.0, colour, 'cam', 0.6);
  }
  b.box((span - 0.6) * 2, 0.02, 0.02, '#1d1433', [0, 4.86, zMid]);

  const halos = fx.mesh(halo);
  const bulbMesh = bulbs.mesh(haloMaterial());
  root.add(new THREE.Mesh(b.geometry(), VC_MAT), new THREE.Mesh(gl.geometry(), GLOW_MAT), halos, bulbMesh);
  return { root, bulbs: bulbMesh, halos };
}

export class HawkerCentre {
  readonly group = new THREE.Group();
  private segments: Segment[] = [];
  private floorTex = floorTexture();
  private roadTex = roadTexture();
  private halo = haloMaterial();
  private sun: THREE.Sprite;
  private lastM = 0;
  private animate = true;

  constructor() {
    const floorLen = SEG_LEN * SEGMENTS + 20;
    const floorW = 34;
    const zc = BEHIND + 6 - floorLen / 2;
    this.floorTex.repeat.set(floorW / 2, floorLen / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorW, floorLen, 1, 24), bend(new THREE.MeshBasicMaterial({ map: this.floorTex })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zc);
    this.group.add(floor);

    // The walkway. Subdivided along its length so the curved-world bend has vertices to move.
    this.roadTex.repeat.set(1, floorLen / 4);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, floorLen, 1, 24), bend(new THREE.MeshBasicMaterial({ map: this.roadTex })));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.012, zc);
    this.group.add(road);

    for (let i = 0; i < SEGMENTS; i++) {
      const seg = buildSegment(i, this.halo);
      seg.root.position.z = BEHIND - i * SEG_LEN;
      this.group.add(seg.root);
      this.segments.push(seg);
    }

    // The setting sun at the end of the street. Not fogged and not bent: it belongs to the sky.
    this.sun = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: whiteGlow(), color: '#ffe2a8', blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.sun.scale.setScalar(40);
    this.sun.position.set(0, 1.5, -88);
    this.group.add(this.sun);
  }

  /**
   * Slow phone: drop the big see-through light halos (they cost the most pixels to draw)
   * and stop the twinkle and sway. The lanterns, bulbs and neon themselves stay.
   */
  lowFx(): void {
    this.animate = false;
    BEND.x.value = 0;
    for (const s of this.segments) s.halos.visible = s.bulbs.visible = false;
  }

  /** `travelledM`: total metres the player has run. `time` in seconds, for the lights. */
  update(travelledM: number, time: number): void {
    const step = travelledM - this.lastM;
    this.lastM = travelledM;
    this.floorTex.offset.y = (travelledM / 2) % 1;
    this.roadTex.offset.y = (travelledM / 4) % 1;
    for (const s of this.segments) {
      s.root.position.z += step;
      if (s.root.position.z - SEG_LEN > BEHIND) s.root.position.z -= SEG_LEN * SEGMENTS;
    }
    if (!this.animate) return;
    // The street winds gently left and right as you run.
    BEND.x.value = Math.sin(travelledM * 0.021) * 0.0007 + Math.sin(travelledM * 0.0083 + 1.3) * 0.0005;
    this.halo.color.setScalar(0.9 + Math.sin(time * 2.1) * 0.1);
    this.segments.forEach((s, i) => (s.bulbs.material as THREE.MeshBasicMaterial).color.setScalar(0.65 + 0.35 * Math.sin(time * 5 + i * 2.1)));
    this.sun.scale.setScalar(40 + Math.sin(time * 0.9) * 2);
  }
}
