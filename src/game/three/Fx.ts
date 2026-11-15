// Feedback effects. 3D: glowing sparks, paper confetti, floor shockwaves, speed streaks
// and drifting motes. DOM: pop-up text, banners and a screen flash (crisp pixel-font text over the
// low-res street, zero GPU cost).
import * as THREE from 'three';
import { bend, canvasTexture, whiteGlow } from './build';

/**
 * One Points object holds every particle; dead particles are parked out of sight.
 * `glow` particles are soft additive sparks. Otherwise they are solid paper squares that
 * flutter down (confetti), which still read against a bright sky.
 */
export class Particles {
  readonly points: THREE.Points;
  private cap: number;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private gravity: Float32Array;
  private next = 0;
  private c = new THREE.Color();

  constructor(private glow = true, cap = 520, size = 0.42) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.gravity = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    for (let i = 0; i < cap; i++) this.pos[i * 3 + 1] = -100;
    const mat = glow
      ? new THREE.PointsMaterial({ size, map: whiteGlow(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
      : new THREE.PointsMaterial({ size, vertexColors: true });
    this.points = new THREE.Points(g, bend(mat, glow));
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  emit(at: THREE.Vector3, colors: number[], count: number, speed = 4, gravity = 6, life = 0.7, spread = 1): void {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.cap;
      this.pos[i * 3] = at.x + (Math.random() - 0.5) * 0.2;
      this.pos[i * 3 + 1] = at.y + (Math.random() - 0.5) * 0.2;
      this.pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * 0.2;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const s = speed * (0.4 + Math.random() * 0.6);
      this.vel[i * 3] = Math.cos(a) * s * spread;
      this.vel[i * 3 + 1] = up * s;
      this.vel[i * 3 + 2] = Math.sin(a) * s * spread;
      this.c.setHex(colors[Math.floor(Math.random() * colors.length)]);
      this.col[i * 3] = this.c.r;
      this.col[i * 3 + 1] = this.c.g;
      this.col[i * 3 + 2] = this.c.b;
      this.life[i] = life * (0.6 + Math.random() * 0.4);
      this.gravity[i] = gravity;
    }
  }

  /** `worldStep`: metres the world moved toward the camera this frame. */
  update(dt: number, worldStep: number, time = 0): void {
    const { pos, vel, col, life } = this;
    for (let i = 0; i < this.cap; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const j = i * 3;
      // Particles ride toward the camera with the world; past the runner they would balloon, so drop them.
      if (life[i] <= 0 || pos[j + 2] > 3.2) {
        life[i] = 0;
        pos[j + 1] = -100;
        continue;
      }
      vel[j + 1] -= this.gravity[i] * dt;
      if (!this.glow) {
        // Paper: air drag, a slow fall and a side-to-side flutter.
        vel[j] *= 1 - 1.6 * dt;
        vel[j + 2] *= 1 - 1.6 * dt;
        vel[j + 1] = Math.max(vel[j + 1], -2.2);
        pos[j] += Math.sin(time * 7 + i) * 0.9 * dt;
      }
      pos[j] += vel[j] * dt;
      pos[j + 1] = Math.max(pos[j + 1] + vel[j + 1] * dt, 0.03);
      pos[j + 2] += vel[j + 2] * dt + worldStep;
      if (this.glow && life[i] < 0.25) {
        col[j] *= 0.9;
        col[j + 1] *= 0.9;
        col[j + 2] *= 0.9;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

/** Expanding rings on the floor: the "thump" under a correct answer or a power-up. */
export class Shockwaves {
  readonly group = new THREE.Group();
  private rings: { mesh: THREE.Mesh; t: number; size: number }[] = [];

  constructor() {
    const tex = canvasTexture(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 34, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.72, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    });
    const geom = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        geom,
        bend(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), true),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.rings.push({ mesh, t: 1, size: 1 });
      this.group.add(mesh);
    }
  }

  fire(x: number, z: number, color: THREE.ColorRepresentation, size = 5): void {
    const r = this.rings.reduce((a, b) => (b.t > a.t ? b : a));
    r.t = 0;
    r.size = size;
    r.mesh.visible = true;
    r.mesh.position.set(x, 0.05, z);
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(color);
  }

  update(dt: number, worldStep: number): void {
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(r.t + dt / 0.55, 1);
      const k = 1 - (1 - r.t) ** 3;
      r.mesh.scale.setScalar(0.6 + k * r.size);
      r.mesh.position.z += worldStep;
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - r.t) * 0.9;
      if (r.t >= 1) r.mesh.visible = false;
    }
  }
}

/** Thin streaks of light rushing past low on both sides when boosted or very fast. */
export class SpeedStreaks {
  readonly group = new THREE.Group();
  private mat = new THREE.MeshBasicMaterial({ color: '#ffe9c4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  private streaks: THREE.Mesh[] = [];

  constructor() {
    const g = new THREE.BoxGeometry(0.012, 0.012, 3.6);
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(g, this.mat);
      this.place(m, true);
      this.streaks.push(m);
      this.group.add(m);
    }
    this.group.visible = false;
  }

  private place(m: THREE.Mesh, anywhere: boolean): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    m.position.set(side * (2.9 + Math.random() * 2.6), 0.2 + Math.random() * 2.6, anywhere ? -Math.random() * 30 : -30);
  }

  update(dt: number, intensity: number, speedMs: number): void {
    this.mat.opacity += (Math.max(0, Math.min(intensity, 1)) * 0.5 - this.mat.opacity) * Math.min(dt * 6, 1);
    this.group.visible = this.mat.opacity > 0.01;
    if (!this.group.visible) return;
    for (const m of this.streaks) {
      m.position.z += speedMs * 2.2 * dt;
      if (m.position.z > 8) this.place(m, false);
    }
  }
}

/** Fireflies / embers hanging in the air. They slide past faster than the floor, which adds depth. */
export class Motes {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private seed: Float32Array;
  private n = 70;

  constructor() {
    this.pos = new Float32Array(this.n * 3);
    this.seed = new Float32Array(this.n);
    const col = new Float32Array(this.n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < this.n; i++) {
      this.seed[i] = Math.random() * 100;
      this.pos[i * 3] = (Math.random() - 0.5) * 12;
      this.pos[i * 3 + 1] = 0.4 + Math.random() * 4.5;
      this.pos[i * 3 + 2] = 4 - Math.random() * 40;
      c.set(['#ffd166', '#ff9f1c', '#ffb3c8', '#fff6e0'][i % 4]).multiplyScalar(0.8);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(
      g,
      bend(new THREE.PointsMaterial({ size: 0.2, map: whiteGlow(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), true),
    );
    this.points.frustumCulled = false;
  }

  update(dt: number, worldStep: number, time: number): void {
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      this.pos[j] += Math.sin(time * 0.7 + this.seed[i]) * 0.25 * dt;
      this.pos[j + 1] += Math.cos(time * 0.9 + this.seed[i]) * 0.2 * dt;
      this.pos[j + 2] += worldStep + 0.6 * dt;
      if (this.pos[j + 2] > 5) {
        this.pos[j + 2] -= 40;
        this.pos[j] = (Math.random() - 0.5) * 12;
        this.pos[j + 1] = 0.4 + Math.random() * 4.5;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Press Start 2P is about 1.6x as wide as the sans the pop-up sizes were tuned for. */
const PIXEL_FONT_K = 0.62;

/** Pop-up text, banners and screen flash, as DOM elements over the canvas. */
export class Overlay {
  private layer: HTMLDivElement;
  private flashEl: HTMLDivElement;
  private feverEl: HTMLDivElement;
  private recent: { y: number; at: number }[] = [];

  constructor(private stage: HTMLElement, private reduced: boolean) {
    this.layer = document.createElement('div');
    this.layer.className = 'fx-layer';
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'fx-flash';
    this.feverEl = document.createElement('div');
    this.feverEl.className = 'fx-fever';
    stage.append(this.feverEl, this.layer, this.flashEl);
  }

  /**
   * `x`, `y` in CSS px relative to the stage. Two pop-ups fired close together would land
   * on top of each other and be unreadable, so a new one steps above any recent neighbour.
   */
  pop(text: string, x: number, y: number, color: string, size = 26, cls = ''): HTMLDivElement {
    const now = performance.now();
    this.recent = this.recent.filter((r) => now - r.at < 650);
    const gap = size * 1.25;
    for (let guard = 0; guard < 6 && this.recent.some((r) => Math.abs(r.y - y) < gap); guard++) y -= gap;
    this.recent.push({ y, at: now });

    const el = document.createElement('div');
    el.className = `fx-pop ${cls}`;
    el.textContent = text;
    el.style.left = `${Math.min(Math.max(x, 70), this.stage.clientWidth - 70)}px`;
    el.style.top = `${Math.max(y, 60)}px`;
    el.style.color = color;
    // Pop-ups use the pixel display font, whose letters are a full em wide: scale the requested size down to
    // match the old look, and never let a long call-out run off the screen.
    const fit = (this.stage.clientWidth - 28) / Math.max(text.length, 1);
    el.style.fontSize = `${Math.round(Math.min(size * PIXEL_FONT_K, fit))}px`;
    this.layer.append(el);
    el.addEventListener('animationend', () => el.remove());
    return el;
  }

  /** A big two-line banner that slams in and stays (the serve celebration). */
  banner(title: string, sub: string, color: string): void {
    const el = document.createElement('div');
    el.className = 'fx-banner';
    el.style.setProperty('--c', color);
    const t = document.createElement('b');
    t.textContent = title;
    const s = document.createElement('span');
    s.textContent = sub;
    el.append(t, s);
    this.layer.append(el);
  }

  /** An emoji that floats up and away (cheering customers). */
  emoji(char: string, x: number, y: number): void {
    const el = document.createElement('div');
    el.className = 'fx-emoji';
    el.textContent = char;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--drift', `${(Math.random() - 0.5) * 80}px`);
    this.layer.append(el);
    el.addEventListener('animationend', () => el.remove());
  }

  flash(color: string): void {
    if (this.reduced) return;
    this.flashEl.style.background = color;
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  }

  /** Glowing screen edges while the player is on a streak. */
  fever(on: boolean): void {
    this.feverEl.classList.toggle('on', on && !this.reduced);
  }

  clear(): void {
    this.layer.innerHTML = '';
    this.recent = [];
    this.fever(false);
  }
}
