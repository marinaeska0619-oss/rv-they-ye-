// Небо: смена дня и ночи, солнце, луна, звёзды, облака, дождь (в болоте).
import * as THREE from 'three';
import { smoothstep, lerp } from './utils.js';

export const DAY_LEN = 900; // секунд на полные сутки (≈7.5 мин день / 7.5 мин ночь)
const blob = (stops) => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
};
const cloudTex = () => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  for (let i = 0; i < 11; i++) { const px = 40 + Math.random() * 176, py = 50 + Math.random() * 30, r = 22 + Math.random() * 26, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); }
  return new THREE.CanvasTexture(c);
};

export class Sky {
  constructor(scene) {
    this.g = new THREE.Group(); scene.add(this.g);
    const sp = (map, s, op = 1) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false, opacity: op })); m.scale.set(s, s, 1); this.g.add(m); return m; };
    this.sun = sp(blob([[0, '#fff'], [0.25, '#fff6c8'], [1, 'rgba(255,240,200,0)']]), 180);
    this.moon = sp(blob([[0, '#fff'], [0.35, '#e4ecff'], [0.5, '#9fb2d8'], [0.52, 'rgba(159,178,216,0)'], [1, 'rgba(0,0,0,0)']]), 70);
    const ct = cloudTex(); this.clouds = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: 0.85 }));
      m.userData = { a: Math.random() * 6.283, r: 350 + Math.random() * 250, h: 130 + Math.random() * 90 };
      const k = 180 + Math.random() * 160; m.scale.set(k, k * 0.45, 1); this.g.add(m); this.clouds.push(m);
    }
    const sp3 = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) { const a = Math.random() * 6.283, b = Math.acos(Math.random() * 2 - 1); sp3[i * 3] = Math.sin(b) * Math.cos(a) * 780; sp3[i * 3 + 1] = Math.cos(b) * 780; sp3[i * 3 + 2] = Math.sin(b) * Math.sin(a) * 780; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp3, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false })); this.g.add(this.stars);
    const N = 500; this.rp = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 40, y = Math.random() * 26 - 12, z = (Math.random() - 0.5) * 40; this.rp.set([x, y, z, x + 0.06, y + 0.8, z], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(this.rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.45 })); this.rain.frustumCulled = false; this.rain.visible = false; scene.add(this.rain);
    this.dayCol = new THREE.Color(0x9cc7ee); this.nightCol = new THREE.Color(0x070b18); this.duskCol = new THREE.Color(0xe58a54);
  }
  update(cam, tm, dt, rainOn) {
    const ang = (2 * Math.PI * tm) / DAY_LEN + 0.6, e = Math.sin(ang), dayK = smoothstep(-0.12, 0.28, e), dusk = Math.max(0, 1 - Math.abs(e) / 0.3);
    this.g.position.copy(cam.position);
    const dir = new THREE.Vector3(Math.cos(ang), e, 0.35).normalize();
    this.sun.position.copy(dir).multiplyScalar(600); this.sun.visible = e > -0.08; this.sun.material.opacity = smoothstep(-0.08, 0.05, e);
    this.moon.position.copy(dir).multiplyScalar(-600); this.moon.visible = e < 0.12;
    this.stars.material.opacity = (1 - dayK) * (1 - dayK);
    for (const c of this.clouds) { const u = c.userData; u.a += dt * 0.004; c.position.set(Math.cos(u.a) * u.r, u.h, Math.sin(u.a) * u.r); c.material.color.setScalar(0.22 + 0.78 * dayK); }
    const col = this.nightCol.clone().lerp(this.dayCol, dayK).lerp(this.duskCol, dusk * 0.65);
    // дождь
    this.rain.visible = !!rainOn; this.rain.position.copy(cam.position);
    if (rainOn) {
      const p = this.rp;
      for (let i = 0; i < p.length; i += 6) { p[i + 1] -= 30 * dt; p[i + 4] -= 30 * dt; if (p[i + 1] < -12) { p[i + 1] = 14; p[i + 4] = 14.8; p[i] = p[i + 3] = (Math.random() - 0.5) * 40; p[i + 2] = p[i + 5] = (Math.random() - 0.5) * 40; } }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    return { col, light: lerp(0.14, 1, dayK), e, dayK, dir };
  }
}
