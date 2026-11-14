// Low-poly building blocks. Many small boxes and cylinders are merged into ONE geometry
// with per-vertex colours, so a whole stall or obstacle is a single draw call.
// That is what keeps a busy hawker centre at 60 fps on a mid-range phone.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from '../../config';

export const LANE_COLOURS = [0x4cc9f0, 0xb388ff, 0xffb703];

/** One shared material for every vertex-coloured mesh in the game. */
export const VC_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

export const laneX = (lane: number) => (lane - 1) * WORLD.LANE_M;
export const depthZ = (d: number) => -d * WORLD.M_PER_UNIT;

type V3 = [number, number, number];

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

export class Builder {
  private parts: THREE.BufferGeometry[] = [];

  add(geom: THREE.BufferGeometry, color: THREE.ColorRepresentation, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): this {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    geom.dispose();
    tmpM.compose(tmpP.set(...pos), tmpQ.setFromEuler(tmpE.set(...rot)), tmpS.set(...scale));
    g.applyMatrix4(tmpM);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    this.parts.push(g);
    return this;
  }

  /** Box of size w (x) × h (y) × d (z), positioned by its centre. */
  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, pos: V3, rot?: V3): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, pos, rot);
  }

  cyl(rTop: number, rBottom: number, h: number, color: THREE.ColorRepresentation, pos: V3, seg = 10, rot?: V3): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg), color, pos, rot);
  }

  sphere(r: number, color: THREE.ColorRepresentation, pos: V3, scale?: V3): this {
    return this.add(new THREE.SphereGeometry(r, 10, 8), color, pos, [0, 0, 0], scale);
  }

  geometry(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts)!;
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }

  mesh(): THREE.Mesh {
    return new THREE.Mesh(this.geometry(), VC_MAT);
  }
}

/** A canvas-backed texture, for signboards, the floor and glows. */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Soft round glow, for additive sprites. */
export function glowTexture(color: string): THREE.CanvasTexture {
  return canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

/** Unlit vertex-coloured material for things that glow by themselves (lanterns, bulbs, neon, windows). */
export const GLOW_MAT = new THREE.MeshBasicMaterial({ vertexColors: true });

/**
 * Curved world: every bent material drops away (and sways sideways) with the square of its
 * distance from the camera. It is done in view space in the vertex shader, so game
 * coordinates stay flat and exact; only the picture curves.
 */
export const BEND = { y: { value: 0.0015 }, x: { value: 0 } };
const BEND_GLSL =
  'mvPosition.y -= uBendY * mvPosition.z * mvPosition.z; mvPosition.x += uBendX * mvPosition.z * mvPosition.z; gl_Position = projectionMatrix * mvPosition;';

/**
 * Makes a material follow the curved world. `additive` materials also fade to black in
 * the fog (the stock fog would fade them to the fog colour, which glows when added).
 */
export function bend<T extends THREE.Material>(m: T, additive = false): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBendY = BEND.y;
    shader.uniforms.uBendX = BEND.x;
    const v = shader.vertexShader;
    shader.vertexShader =
      'uniform float uBendY;\nuniform float uBendX;\n' +
      (v.includes('#include <project_vertex>')
        ? v.replace('#include <project_vertex>', `#include <project_vertex>\n${BEND_GLSL}`)
        : v.replace('gl_Position = projectionMatrix * mvPosition;', BEND_GLSL)); // sprites
    if (additive) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        '#ifdef USE_FOG\n gl_FragColor.rgb *= 1.0 - smoothstep( fogNear, fogFar, vFogDepth );\n#endif',
      );
    }
  };
  m.customProgramCacheKey = () => (additive ? 'bend-add' : 'bend');
  return m;
}
bend(VC_MAT);
bend(GLOW_MAT);

let sharedGlow: THREE.CanvasTexture | null = null;
/** White soft dot, tinted per use by vertex or material colour. */
export function whiteGlow(): THREE.CanvasTexture {
  return (sharedGlow ??= canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }));
}

/** Additive material for `Quads` halos. */
export function haloMaterial(): THREE.MeshBasicMaterial {
  return bend(
    new THREE.MeshBasicMaterial({ map: whiteGlow(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    true,
  );
}

/**
 * Many soft light halos in ONE mesh. The chase camera always looks down the walkway, so a
 * quad that simply faces +z reads as a billboard; 'floor' quads lie flat as pools of light.
 */
export class Quads {
  private pos: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private c = new THREE.Color();

  add(x: number, y: number, z: number, w: number, h: number, color: THREE.ColorRepresentation, facing: 'cam' | 'floor' | 'side' = 'cam', strength = 1): this {
    const a = w / 2;
    const b = h / 2;
    const corners: V3[] =
      facing === 'cam'
        ? [[x - a, y - b, z], [x + a, y - b, z], [x + a, y + b, z], [x - a, y + b, z]]
        : facing === 'floor'
          ? [[x - a, y, z + b], [x + a, y, z + b], [x + a, y, z - b], [x - a, y, z - b]]
          : [[x, y - b, z + a], [x, y - b, z - a], [x, y + b, z - a], [x, y + b, z + a]];
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    this.c.set(color).multiplyScalar(strength);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(...corners[i]);
      this.uv.push(...uvs[i]);
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
    return this;
  }

  mesh(material: THREE.Material): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.renderOrder = 2;
    return m;
  }
}
