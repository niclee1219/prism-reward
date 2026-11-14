// Lau Pa Sat at weekday lunch: a sunlit paved walkway with a lane-dash texture, then a row
// of recycled 6 m segments. Each segment has a hawker stall on both sides (painted signboard
// with its unit number, striped awning, steaming pot), a queue of office workers or a table
// with a chope tissue packet, green cast-iron columns and a glass CBD tower behind. At the end
// of the street stand the octagonal Victorian market with its clock tower and the skyline.
// Segments that pass behind the camera jump to the far end, so the street never ends.
//
// Draw-call budget per segment: 1 lit mesh + 1 self-lit mesh + 1 steam mesh + 2 signs.
import * as THREE from 'three';
import { WORLD } from '../../config';
import { BEND, Builder, GLOW_MAT, Quads, VC_MAT, bend, canvasTexture, haloMaterial, whiteGlow } from './build';

const SEG_LEN = 6;
const SEGMENTS = 10;
const BEHIND = 10; // a segment this far behind the player (metres) is recycled
const ROAD_HALF = WORLD.LANE_M * 1.5 + 0.15;
const STALL_FRONT = 5.0;

/** Fog and horizon colour: far stalls melt into the midday haze instead of popping in. */
export const HAZE = '#cfe8f5';

const IRON = '#2f6b4f'; // heritage cast-iron green
const CREAM = '#f2ead3';

const STALLS = [
  'CHICKEN RICE', 'CHAR KWAY TEOW', 'LAKSA', 'ROTI PRATA', 'SATAY', 'KOPI · TEH',
  'NASI LEMAK', 'HOKKIEN MEE', 'CARROT CAKE', 'BAK CHOR MEE', 'FISHBALL NOODLE', 'CHENDOL',
];
const SIGN_ACCENT = ['#d7322b', '#2f6b4f', '#1d7bd8', '#e07a1f', '#7b3fa0', '#0f8b8d'];
const STALL_PASTEL = ['#f6bd60', '#84a59d', '#f28482', '#a3c4f3', '#cdb4db', '#90be6d'];
const AWNING = ['#d7322b', '#2a9d8f', '#e07a1f', '#457b9d'];
const STOOL = ['#d7322b', '#1d7bd8', '#2a9d8f', '#e07a1f'];
const GLASS = ['#6fa8c9', '#5b93b8', '#7fb5d1', '#4f86ab', '#8bbcd6'];
const SHIRT = ['#ffffff', '#eef3f8', '#dbe8f5', '#fbeaea', '#ffffff', '#e6f2e8'];
const SKIN = ['#e8b48a', '#c98f66', '#f1c9a5', '#a8754f'];
const HAIR = ['#1b1b2f', '#2b2118', '#3a2a1f', '#111111'];
const LANYARD = ['#d7322b', '#1d7bd8', '#f5c031', '#2f6b4f'];

/** Cheap repeatable pseudo-random in 0..1, so the street looks the same every load. */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function signTexture(name: string, i: number): THREE.CanvasTexture {
  const accent = SIGN_ACCENT[i % SIGN_ACCENT.length];
  const yellow = i % 3 === 0;
  return canvasTexture(512, 112, (ctx) => {
    ctx.fillStyle = yellow ? '#f5c031' : CREAM;
    ctx.fillRect(0, 0, 512, 112);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 8;
    ctx.strokeRect(5, 5, 502, 102);
    ctx.fillStyle = '#1b1b2f';
    ctx.font = '900 50px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 256, 48, 450);
    // Unit number in a coloured tab, the way real hawker stalls are labelled.
    ctx.fillStyle = accent;
    ctx.fillRect(176, 78, 160, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.fillText(`#01-${String(10 + i * 3).padStart(2, '0')}`, 256, 92);
  });
}

/** Pale terrazzo paving for the seating areas either side of the walkway (one 2 m tile). */
function floorTexture(): THREE.CanvasTexture {
  const t = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#d8d1c2';
    ctx.fillRect(0, 0, 128, 128);
    const speck = ['#cdc5b4', '#e4ddcf', '#bfb7a6', '#d0c0a4'];
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = speck[i % speck.length];
      const s = 1 + (i % 3);
      ctx.fillRect((i * 53) % 128, (i * 97 + (i >> 3) * 13) % 128, s, s);
    }
    ctx.fillStyle = '#b6ae9d';
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
    g.addColorStop(0, '#9b958a');
    g.addColorStop(0.5, '#aaa498');
    g.addColorStop(1, '#9b958a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 420; i++) {
      ctx.fillStyle = ['#8a8479', '#b4aea2', '#948e83', '#a09a8e'][i % 4];
      const s = 1 + (i % 3);
      ctx.fillRect((i * 71) % W, (i * 113 + (i >> 2) * 29) % H, s, s);
    }
    // A chevron in each lane, pointing the way you run (up the canvas = away from the camera).
    ctx.strokeStyle = 'rgba(40, 36, 30, 0.16)';
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
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    for (const k of [1, 2]) ctx.fillRect(8 + (road * k) / 3 - 2.5, 20, 5, 110);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Midday sky, painted once: clear blue overhead fading to pale haze at the horizon. */
export function skyTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#3f8fdc');
    g.addColorStop(0.25, '#76b6ea');
    g.addColorStop(0.42, '#b8def5');
    g.addColorStop(0.5, HAZE);
    g.addColorStop(0.56, '#f1ede0');
    g.addColorStop(1, '#f1ede0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 512);
  });
}

interface Segment {
  root: THREE.Group;
  steam: THREE.Mesh;
}

type V3 = [number, number, number];

/** An office worker: navy trousers, white shirt, a lanyard and a tray. Faces `face` (+1/-1 along x). */
function worker(b: Builder, x: number, z: number, n: number, face: 1 | -1): void {
  b.cyl(0.11, 0.11, 0.55, '#243050', [x - 0.09, 0.28, z], 6);
  b.cyl(0.11, 0.11, 0.55, '#243050', [x + 0.09, 0.28, z], 6);
  b.cyl(0.17, 0.2, 0.62, SHIRT[n % SHIRT.length], [x, 0.86, z], 8);
  b.sphere(0.15, SKIN[n % SKIN.length], [x, 1.32, z]);
  b.sphere(0.16, HAIR[(n >> 1) % HAIR.length], [x, 1.38, z], [1, 0.7, 1]);
  b.box(0.03, 0.28, 0.12, LANYARD[n % LANYARD.length], [x + face * 0.18, 0.92, z]);
  b.box(0.2, 0.03, 0.3, '#c9ccd1', [x + face * 0.3, 0.78, z]);
}

/** One 6 m slice of the street. Mirrored stalls on the left (side -1) and right (side 1). */
function buildSegment(index: number): Segment {
  const b = new Builder(); // lit
  const gl = new Builder(); // self-lit
  const steam = new Quads(); // soft white steam over the pots, kept apart so it can breathe
  const root = new THREE.Group();
  const zMid = -SEG_LEN / 2;
  const len = SEG_LEN - 0.6;

  for (const side of [-1, 1] as const) {
    const k = index * 2 + (side > 0 ? 1 : 0);
    const x0 = side * STALL_FRONT; // stall front line
    const xBack = side * (STALL_FRONT + 2.6);
    const pastel = STALL_PASTEL[k % STALL_PASTEL.length];

    // Stall shell, set back behind the counter so no two faces share a plane (no flicker).
    const shellFront = x0 + side * 0.35;
    b.box(Math.abs(xBack - shellFront), 3.4, len, '#cfc6b3', [(shellFront + xBack) / 2, 1.7, zMid]);
    // The serving hatch is warm-lit from inside; the fascia and columns frame it.
    gl.box(0.06, 1.5, len - 0.5, '#f2cf86', [shellFront - side * 0.05, 1.8, zMid]);
    b.box(0.2, 0.9, len, pastel, [x0 + side * 0.2, 3.0, zMid]);
    b.box(0.3, 3.4, 0.3, pastel, [x0 + side * 0.2, 1.7, -0.45]);
    b.box(0.3, 3.4, 0.3, pastel, [x0 + side * 0.2, 1.7, -SEG_LEN + 0.45]);
    // Counter with a stainless top and a glass display box.
    b.box(0.6, 1.0, len - 0.6, '#c9ccd1', [x0 + side * 0.25, 0.5, zMid]);
    b.box(0.72, 0.05, len - 0.5, '#eef1f4', [x0 + side * 0.25, 1.03, zMid]);
    gl.box(0.4, 0.42, 1.8, '#e6f4fb', [x0 + side * 0.25, 1.27, zMid + 0.9]);
    // Hanging roast ducks, silhouetted against the hatch.
    for (let i = 0; i < 3; i++) b.sphere(0.13, '#7a3b12', [x0 + side * 0.22, 2.25, zMid + 0.5 + i * 0.32], [1, 1.4, 1]);
    // A big pot (with steam) and a wok.
    b.cyl(0.3, 0.26, 0.45, '#8d99ae', [x0 + side * 0.25, 1.28, zMid - 1.9], 12);
    b.cyl(0.36, 0.18, 0.16, '#2b2d42', [x0 + side * 0.25, 1.14, zMid - 0.9], 12);
    steam.add(x0 + side * 0.1, 1.95, zMid - 1.9, 0.9, 1.5, '#ffffff', 'cam', 0.45);
    steam.add(x0 + side * 0.1, 1.7, zMid - 0.9, 0.8, 1.2, '#ffffff', 'cam', 0.35);
    // Striped awning sloping out over the counter.
    const slats = 8;
    for (let i = 0; i < slats; i++) {
      const z = -0.3 - (i + 0.5) * (len / slats);
      b.box(1.0, 0.04, len / slats, i % 2 ? '#fff6e0' : AWNING[k % AWNING.length], [x0 - side * 0.4, 2.55, z], [0, 0, side * 0.32]);
    }

    // Lunch rush: either a queue of office workers at the counter or a table with a chope packet.
    if ((index + (side > 0 ? 1 : 0)) % 2 === 0) {
      const tx = side * (ROAD_HALF + 1.35);
      b.cyl(0.55, 0.55, 0.06, '#f1ece2', [tx, 0.76, zMid], 16);
      b.cyl(0.06, 0.06, 0.74, '#6c757d', [tx, 0.37, zMid], 6);
      const stool = STOOL[k % STOOL.length];
      for (let s = 0; s < 4; s++) {
        const a = (s / 4) * Math.PI * 2 + 0.4;
        b.cyl(0.17, 0.21, 0.46, stool, [tx + Math.cos(a) * 0.82, 0.23, zMid + Math.sin(a) * 0.82], 8);
      }
      // The chope packet: a tissue pack that reserves the seat, plus a lunch tray on the table.
      b.box(0.16, 0.05, 0.11, '#ffffff', [tx + 0.15, 0.82, zMid - 0.1]);
      b.box(0.3, 0.03, 0.22, '#d7322b', [tx - 0.15, 0.81, zMid + 0.12]);
    } else {
      const qx = x0 - side * 0.95;
      const n = 4 + ((k * 7) % 2);
      for (let w = 0; w < n; w++) worker(b, qx + ((w * 5 + k) % 3 - 1) * 0.08, zMid - 1.6 + w * 0.72, k * 5 + w, side);
    }

    // Cast-iron column (Victorian market style): green shaft, cream capital and a bracket arm.
    const px = side * (ROAD_HALF + 0.5);
    b.cyl(0.1, 0.13, 4.6, IRON, [px, 2.3, -0.1], 8);
    b.cyl(0.17, 0.17, 0.12, CREAM, [px, 0.06, -0.1], 8);
    b.box(0.34, 0.18, 0.34, CREAM, [px, 4.55, -0.1]);
    b.box(0.55, 0.1, 0.1, IRON, [px - side * 0.24, 4.38, -0.1]);

    // Kerb along the edge of the walkway, in alternating cream and green.
    b.box(0.12, 0.07, SEG_LEN, index % 2 ? CREAM : IRON, [side * ROAD_HALF, 0.035, zMid]);

    // Glass CBD tower behind the stall, with bright window bands on the face the camera sees.
    const h = 14 + Math.floor(hash(k) * 6) * 3;
    const bx = side * (STALL_FRONT + 6.2);
    const bz = zMid;
    const inner = bx - side * 2.8;
    b.box(5.6, h, SEG_LEN - 1.0, GLASS[k % GLASS.length], [bx, h / 2, bz]);
    b.box(5.8, 0.3, SEG_LEN - 0.8, '#3c6f93', [bx, h + 0.15, bz]); // roof rim
    for (let row = 0; row * 1.6 + 4.6 < h - 0.6; row++) {
      const y = 4.6 + row * 1.6;
      gl.box(0.05, 0.55, SEG_LEN - 1.3, '#bfe0f0', [inner - side * 0.03, y, bz]);
      gl.box(5.2, 0.55, 0.05, '#bfe0f0', [bx, y, bz + (SEG_LEN - 1.0) / 2 + 0.03]);
    }

    // Painted signboard with the stall name and unit number, facing the walkway.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(SEG_LEN - 1.2, 1.1),
      bend(new THREE.MeshBasicMaterial({ map: signTexture(STALLS[k % STALLS.length], k) })),
    );
    sign.position.set(x0 - side * 0.08, 4.0, zMid);
    sign.rotation.y = -side * (Math.PI / 2);
    root.add(sign);
    b.box(0.1, 1.24, SEG_LEN - 1.06, '#3a3a45', [x0 + side * 0.02, 4.0, zMid]); // frame behind the sign
  }

  // Cast-iron lattice beam across the walkway between the two columns, with fretwork brackets.
  const span = ROAD_HALF + 0.5;
  b.box(span * 2, 0.12, 0.12, IRON, [0, 4.5, -0.1]);
  b.box(span * 2, 0.05, 0.05, CREAM, [0, 4.35, -0.1]);
  for (let i = 0; i < 9; i++) {
    const x = (i / 8 * 2 - 1) * (span - 0.2);
    b.box(0.07, 0.34, 0.05, i % 2 ? IRON : CREAM, [x, 4.28, -0.1]);
  }

  const steamMesh = steam.mesh(haloMaterial());
  root.add(new THREE.Mesh(b.geometry(), VC_MAT), new THREE.Mesh(gl.geometry(), GLOW_MAT), steamMesh);
  return { root, steam: steamMesh };
}

/** The end of the street: the octagonal Victorian market with its clock tower, and the CBD skyline. */
function buildLandmark(): THREE.Group {
  const g = new THREE.Group();
  const tint = (c: string) => new THREE.Color(c).lerp(new THREE.Color(HAZE), 0.2);
  const mat = (c: string) => new THREE.MeshBasicMaterial({ color: tint(c), fog: false });
  const add = (geo: THREE.BufferGeometry, c: string, pos: V3, rotY = 0) => {
    const m = new THREE.Mesh(geo, mat(c));
    m.position.set(...pos);
    m.rotation.y = rotY;
    g.add(m);
    return m;
  };
  const oct = Math.PI / 8;
  // Market hall: octagonal body, double-tiered green roof, vented clerestory, clock tower.
  add(new THREE.CylinderGeometry(16, 16, 7, 8), CREAM, [0, 3.5, 0], oct);
  add(new THREE.CylinderGeometry(16.6, 16.6, 0.9, 8), IRON, [0, 7.2, 0], oct);
  add(new THREE.ConeGeometry(16.4, 5.5, 8), IRON, [0, 10.4, 0], oct);
  add(new THREE.CylinderGeometry(7.5, 7.5, 3, 8), CREAM, [0, 13.5, 0], oct);
  add(new THREE.ConeGeometry(8.2, 4.5, 8), IRON, [0, 17.2, 0], oct);
  add(new THREE.BoxGeometry(3.4, 11, 3.4), CREAM, [0, 24, 0]);
  add(new THREE.ConeGeometry(2.6, 4, 4), IRON, [0, 31.5, 0], Math.PI / 4);
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 20),
    new THREE.MeshBasicMaterial({ map: canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = '#fffaf0';
      ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1b1b2f'; ctx.lineWidth = 4; ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(32, 32); ctx.lineTo(32, 12); ctx.moveTo(32, 32); ctx.lineTo(44, 38); ctx.stroke();
    }), fog: false }),
  );
  face.position.set(0, 26, 1.75);
  g.add(face);
  // Skyline of glass towers either side.
  const towers: [number, number, number, number][] = [
    [-30, 42, 12, 12], [-46, 58, 14, 14], [-62, 36, 12, 12], [30, 48, 12, 12], [48, 64, 14, 14], [64, 40, 12, 12], [-20, 30, 9, 9], [22, 34, 9, 9],
  ];
  towers.forEach(([x, h, w, d], i) => {
    add(new THREE.BoxGeometry(w, h, d), GLASS[i % GLASS.length], [x, h / 2, -8 - (i % 3) * 4]);
    // Pale window bands, a thin box per few floors.
    for (let y = 6; y < h - 2; y += 4) add(new THREE.BoxGeometry(w + 0.1, 1.1, d + 0.1), '#c3e3f2', [x, y, -8 - (i % 3) * 4]);
  });
  return g;
}

export class HawkerCentre {
  readonly group = new THREE.Group();
  private segments: Segment[] = [];
  private floorTex = floorTexture();
  private roadTex = roadTexture();
  private lastM = 0;
  private animate = true;
  private sun: THREE.Sprite;
  private steamMat: THREE.MeshBasicMaterial;

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
      const seg = buildSegment(i);
      seg.root.position.z = BEHIND - i * SEG_LEN;
      this.group.add(seg.root);
      this.segments.push(seg);
    }
    this.steamMat = this.segments[0].steam.material as THREE.MeshBasicMaterial;
    for (const s of this.segments) s.steam.material = this.steamMat; // one shared steam material, pulsed together

    // Landmark and skyline at the end of the street. Not fogged and not bent: they belong to the sky.
    const landmark = buildLandmark();
    landmark.position.set(0, -2, -105);
    this.group.add(landmark);

    // The midday sun: a hot white glow high over the market.
    this.sun = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: whiteGlow(), color: '#fffbe6', blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.sun.scale.setScalar(34);
    this.sun.position.set(-18, 46, -95);
    this.group.add(this.sun);
  }

  /** Slow phone: drop the see-through steam (it costs pixels) and stop the sway. */
  lowFx(): void {
    this.animate = false;
    BEND.x.value = 0;
    for (const s of this.segments) s.steam.visible = false;
  }

  /** `travelledM`: total metres the player has run. `time` in seconds, for the steam and sun shimmer. */
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
    this.steamMat.color.setScalar(0.6 + 0.4 * Math.sin(time * 2.4));
    this.sun.scale.setScalar(34 + Math.sin(time * 0.9) * 1.5);
  }
}
