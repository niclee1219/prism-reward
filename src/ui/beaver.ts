// The thank-you mascot: a chubby beaver in a blue "ONE IRAS" tee, winking and giving a thumbs-up.
// Built the same way as the rest of the game (boxes and spheres merged with vertex colours) and
// drawn on its own small transparent canvas, so it can sit on top of any screen.
import * as THREE from 'three';
import { reducedMotion } from '../game/perf';
import { Builder, VC_MAT, canvasTexture } from '../game/three/build';

const FUR = '#a85f2a';
const FUR_DARK = '#7d4318';
const CREAM = '#f3d3a5';
const TEE = '#2e4fb8';
const PINK = '#f2958f';
const INK = '#2a1608';

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

function build(): { root: THREE.Group; head: THREE.Group; armR: THREE.Group; tail: THREE.Group; eyeL: THREE.Mesh } {
  const root = new THREE.Group();

  // Torso (the tee), feet and the pale belly peeking under the hem.
  const body = new Builder()
    .sphere(0.5, TEE, [0, 0.5, 0], [1, 1.08, 0.86])
    .sphere(0.3, CREAM, [0, 0.12, 0.12], [1.15, 0.5, 0.9]) // belly under the tee
    .box(0.34, 0.12, 0.36, FUR_DARK, [-0.2, 0.06, 0.16]) // feet
    .box(0.34, 0.12, 0.36, FUR_DARK, [0.2, 0.06, 0.16])
    .mesh();
  root.add(body);

  // "ONE IRAS" printed on the chest.
  const label = canvasTexture(256, 128, (c) => {
    c.clearRect(0, 0, 256, 128);
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.font = '800 66px system-ui, sans-serif';
    c.fillText('ONE', 128, 62);
    c.font = '800 56px system-ui, sans-serif';
    c.fillText('IRAS', 128, 118);
  });
  const chest = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: label, transparent: true }));
  chest.position.set(0, 0.5, 0.45);
  root.add(chest);

  // Flat paddle tail, tucked low on the left like in the sticker.
  const tail = part(
    (b) => {
      b.add(new THREE.BoxGeometry(0.5, 0.1, 0.62), FUR_DARK, [-0.46, 0.12, 0.02], [0.2, 0, 0.5]);
      b.add(new THREE.BoxGeometry(0.4, 0.02, 0.5), '#5e3110', [-0.46, 0.18, 0.02], [0.2, 0, 0.5]);
    },
    [-0.3, 0.15, 0],
  );
  root.add(tail);

  // Left arm hangs down.
  root.add(
    new Builder()
      .box(0.2, 0.34, 0.22, TEE, [-0.52, 0.5, 0.05], [0, 0, 0.18])
      .sphere(0.12, FUR, [-0.58, 0.28, 0.08])
      .mesh(),
  );

  // Right arm: raised, thumbs-up. Pivots at the shoulder so it can bob.
  const armR = part(
    (b) => {
      b.box(0.2, 0.3, 0.22, TEE, [0.58, 0.68, 0.08], [0, 0, -0.6]); // sleeve
      b.sphere(0.15, FUR, [0.76, 0.86, 0.14]); // fist
      b.box(0.11, 0.13, 0.11, FUR, [0.78, 1.0, 0.14]); // thumb: short and chunky, so it reads as a thumbs-up
      b.sphere(0.058, FUR, [0.78, 1.07, 0.14]);
    },
    [0.5, 0.62, 0.08],
  );
  root.add(armR);

  // Head group, so it can tilt.
  const head = new THREE.Group();
  head.position.y = 1.2;
  const skull = new Builder()
    .sphere(0.5, FUR, [0, 0, 0], [1.08, 0.94, 0.96])
    .sphere(0.15, FUR, [-0.4, 0.4, -0.02], [1, 1, 0.7]) // ears
    .sphere(0.15, FUR, [0.4, 0.4, -0.02], [1, 1, 0.7])
    .sphere(0.085, PINK, [-0.4, 0.4, 0.07], [1, 1, 0.5])
    .sphere(0.085, PINK, [0.4, 0.4, 0.07], [1, 1, 0.5])
    .sphere(0.27, CREAM, [0, -0.17, 0.33], [1.2, 0.82, 0.78]) // muzzle
    .sphere(0.065, INK, [0, -0.02, 0.5], [1.2, 0.8, 0.7]) // nose
    .box(0.07, 0.12, 0.03, '#ffffff', [-0.04, -0.27, 0.54]) // buck teeth
    .box(0.07, 0.12, 0.03, '#ffffff', [0.04, -0.27, 0.54])
    .box(0.2, 0.03, 0.02, INK, [0, -0.21, 0.52]) // smile
    .box(0.05, 0.05, 0.02, INK, [-0.11, -0.2, 0.52], [0, 0, 0.6])
    .box(0.05, 0.05, 0.02, INK, [0.11, -0.2, 0.52], [0, 0, -0.6])
    .sphere(0.085, PINK, [-0.32, -0.1, 0.38], [1, 0.8, 0.4]) // cheeks
    .sphere(0.085, PINK, [0.32, -0.1, 0.38], [1, 0.8, 0.4])
    .box(0.17, 0.04, 0.02, INK, [0.2, 0.1, 0.46], [0, 0, 0.35]) // winking eye (right)
    .box(0.17, 0.035, 0.02, INK, [0.2, 0.13, 0.46], [0, 0, -0.35])
    .box(0.14, 0.04, 0.02, INK, [0.2, 0.2, 0.44], [0, 0, -0.16]) // brows: outer ends low, so it looks friendly
    .box(0.14, 0.04, 0.02, INK, [-0.2, 0.22, 0.44], [0, 0, 0.16])
    .mesh();
  head.add(skull);
  // Open left eye is its own mesh so it can blink.
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshLambertMaterial({ color: INK }));
  eyeL.position.set(-0.2, 0.1, 0.45);
  eyeL.scale.set(1, 1.25, 0.6);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  glint.position.set(0.02, 0.03, 0.06);
  eyeL.add(glint);
  head.add(eyeL);
  root.add(head);

  return { root, head, armR, tail, eyeL };
}

export interface Beaver {
  /** A little hop, for when the player taps confetti or a reaction. */
  cheer(): void;
  dispose(): void;
}

/** Mounts the beaver into `host`. Falls back to an emoji if WebGL is unavailable. */
export function mountBeaver(host: HTMLElement): Beaver {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    const fb = document.createElement('div');
    fb.className = 'beaver-fallback';
    fb.textContent = '🦫';
    host.append(fb);
    return { cheer() {}, dispose: () => fb.remove() };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'beaver-canvas';
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.05));
  const sun = new THREE.DirectionalLight(0xfff1dd, 1.7);
  sun.position.set(1.5, 3, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0.12, 1.05, 4.6);
  camera.lookAt(0.1, 0.9, 0);

  const { root, head, armR, tail, eyeL } = build();
  scene.add(root);

  const resize = () => {
    const w = Math.max(host.clientWidth, 1);
    const h = Math.max(host.clientHeight, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  let hop = 0;
  let raf = 0;
  const t0 = performance.now();
  const frame = (now: number) => {
    if (!host.isConnected) return dispose();
    const t = (now - t0) / 1000;
    const k = reducedMotion ? 0.25 : 1;
    hop = Math.max(0, hop - 0.04);
    const jump = Math.sin(Math.min(hop, 1) * Math.PI) * 0.35;
    root.position.y = Math.sin(t * 2.4) * 0.035 * k + jump;
    root.rotation.y = Math.sin(t * 0.9) * 0.18 * k;
    head.rotation.z = Math.sin(t * 1.7) * 0.06 * k;
    armR.rotation.z = Math.sin(t * 5) * 0.09 * k - hop * 0.3;
    tail.rotation.z = Math.sin(t * 2.2) * 0.06 * k;
    // Blink the open eye every few seconds.
    const blink = t % 3.4 > 3.28 ? 0.1 : 1.25;
    eyeL.scale.y = blink;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  function dispose(): void {
    cancelAnimationFrame(raf);
    ro.disconnect();
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.Material & { map?: THREE.Texture };
        m.map?.dispose();
        if (m !== VC_MAT) m.dispose(); // VC_MAT is shared with the game
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    cheer: () => {
      hop = 1;
    },
    dispose,
  };
}
