import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { clamp } from './utils.js';
import { FLOOR_Y, resolveInterior } from './rv.js';

export const HATS = ['Кепка', 'Ковбойская шляпа', 'Шапка', 'Без шляпы', 'Цилиндр', 'Корона', 'Каска шахтёра', 'Шлем викинга', 'Красный стетсон', 'Колпак повара'];
// ---- серверная часть игрока (на хосте) ----
export class PlayerSim {
  constructor(phys, id, info, x, y, z) {
    this.phys = phys; this.id = id;
    this.name = (info.name || 'Игрок').slice(0, 14); this.color = info.color || '#e55'; this.hat = info.hat | 0;
    this.hp = 100; this.inRV = false; this.drive = false; this.lp = [0, FLOOR_Y, 0]; this.yaw = 0; this.pitch = 0;
    this.held = -1; this.hook = -1; this.down = false; this.downT = 0; this.prompt = ''; this.nt = ''; this.nc = 0;
    this.inp = { mx: 0, mz: 0, yaw: 0, pitch: 0 }; this.groundT = -9; this.prevVy = 0;
    this.boost = 0; this.pois = 0; this.swing = null; this.dead = false; this.air = 8; this.peer = null; this.inPool = 0;
    const b = (this.body = new CANNON.Body({ mass: 70, material: phys.mats.player, fixedRotation: true, linearDamping: 0.05 }));
    b.addShape(new CANNON.Sphere(0.5)); b.position.set(x, y, z); b.allowSleep = false; phys.world.addBody(b);
    b.addEventListener('collide', (e) => { const c = e.contact, up = c.bi === b ? -c.ni.y : c.ni.y; if (up > 0.5) this.groundT = phys.t; });
  }
  moveOutside(dt, W, slow = 1) {
    const b = this.body, i = this.inp;
    if (this.down) { b.velocity.x *= 0.85; b.velocity.z *= 0.85; return 0; }
    let mx = i.mx || 0, mz = i.mz || 0; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    const y = i.yaw || 0, sp = (i.sprint ? 8 : 5) * (this.boost > 0 ? 1.35 : 1) * slow, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
    const k = Math.min(1, dt * 10);
    b.velocity.x += ((fx * mz + rx * mx) * sp - b.velocity.x) * k; b.velocity.z += ((fz * mz + rz * mx) * sp - b.velocity.z) * k;
    const grounded = this.phys.t - this.groundT < 0.15 || b.position.y - W.height(b.position.x, b.position.z) < 0.62;
    if (i.jump && grounded && b.velocity.y < 2) b.velocity.y = 6;
    const vy = b.velocity.y; let dmg = 0;
    if (this.prevVy < -13 && vy > -4) dmg = (-this.prevVy - 13) * 6; // урон от падения
    this.prevVy = vy; return dmg;
  }
  moveInside(dt, rvYaw) {
    const i = this.inp; let mx = i.mx || 0, mz = i.mz || 0; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    const y = (i.yaw || 0) - rvYaw, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
    const spd = 3 * (this.boost > 0 ? 1.35 : 1); this.lp[0] += (fx * mz + rx * mx) * spd * dt; this.lp[2] += (fz * mz + rz * mx) * spd * dt; this.lp[1] = FLOOR_Y;
    resolveInterior(this.lp); // мебель не пропускает
  }
}

// ---- аватар (рендер): руки и ноги качаются при ходьбе (анимация в view.js) ----
export function createAvatar(name, color, hat) {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const bx = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), L(c)); m.position.set(x, y, z); body.add(m); return m; };
  const skin = 0xf0c8a0, dark = new THREE.Color(color).multiplyScalar(0.55).getHex(), pants = 0x35435a;
  bx(0.56, 0.66, 0.3, color, 0, 0.95, 0); bx(0.5, 0.18, 0.28, pants, 0, 0.68, 0); bx(0.4, 0.5, 0.2, dark, 0, 0.98, 0.25); // торс, пояс, рюкзак
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), L(skin)); head.position.y = 1.5; body.add(head);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), L(0x111111)); e.position.set(s * 0.08, 1.53, -0.2); body.add(e); }
  const limb = (x, y, w, h, c, hand) => {
    const p = new THREE.Group(); p.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), L(c)); m.position.y = -h / 2; p.add(m);
    if (hand) { const hm = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, w), L(hand)); hm.position.y = -h - 0.02; p.add(hm); }
    body.add(p); return p;
  };
  const legs = [limb(-0.14, 0.62, 0.2, 0.62, pants), limb(0.14, 0.62, 0.2, 0.62, pants)];
  const arms = [limb(-0.37, 1.24, 0.15, 0.55, color, skin), limb(0.37, 1.24, 0.15, 0.55, color, skin)];
  const hm = [0x1565c0, 0x6d4c41, 0xc62828][hat % 3];
  if (hat === 0) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.12, 12), L(hm)); c.position.y = 1.68; const br = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.25), L(hm)); br.position.set(0, 1.63, -0.2); body.add(c, br); }
  else if (hat === 1) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 12), L(hm)); c.position.y = 1.74; const br = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 16), L(hm)); br.position.y = 1.64; body.add(c, br); }
  else if (hat === 4) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 14), L(0x111111)); c.position.y = 1.8; const br = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), L(0x111111)); br.position.y = 1.64; body.add(c, br); }
  else if (hat === 5) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.14, 12), L(0xffc400)); c.position.y = 1.7; body.add(c); for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28, t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), L(0xffc400)); t.position.set(Math.cos(a) * 0.18, 1.83, Math.sin(a) * 0.18); body.add(t); } }
  else if (hat === 6) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, 6.28, 0, 1.6), L(0xffd600)); c.position.y = 1.55; const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.08), L(0xffffcc)); lamp.position.set(0, 1.7, -0.24); body.add(c, lamp); }
  else if (hat === 7) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, 6.28, 0, 1.6), L(0x9e9e9e)); c.position.y = 1.55; body.add(c); for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 6), L(0xf5f0dc)); h.position.set(s * 0.28, 1.72, 0); h.rotation.z = -s * 0.7; body.add(h); } }
  else if (hat === 8) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 12), L(0xb71c1c)); c.position.y = 1.74; const br = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 16), L(0xb71c1c)); br.position.y = 1.64; body.add(c, br); }
  else if (hat === 9) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.3, 12), L(0xffffff)); c.position.y = 1.78; const t = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), L(0xffffff)); t.position.y = 1.97; body.add(c, t); }
  else if (hat === 2) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, 6.28, 0, 1.6), L(hm)); c.position.y = 1.55; body.add(c); }
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48; const x = cv.getContext('2d');
  x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.fillStyle = '#000a'; x.fillRect(0, 4, 256, 40); x.fillStyle = '#fff'; x.fillText(name, 128, 36);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false })); sp.scale.set(1.6, 0.3, 1); sp.position.y = 2.1; group.add(sp);
  const hand = new THREE.Object3D(); hand.position.set(0.35, 1.15, -0.55); group.add(hand);
  return { group, body, hand, label: sp, legs, arms };
}

// ---- ввод ----
export class Input {
  constructor(canvas) {
    this.k = {}; this.axis = { x: 0, y: 0 }; this.yaw = 0; this.pitch = 0; this.mouse = false; this.driving = false;
    this.onEvent = () => {}; this.onChat = () => {}; this.onLocal = () => {};
    const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';
    addEventListener('keydown', (e) => {
      if (typing()) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'Backspace'].includes(e.code)) e.preventDefault();
      this.k[e.code] = 1; if (!e.repeat) this.edge(e.code);
    });
    addEventListener('keyup', (e) => { delete this.k[e.code]; });
    canvas.addEventListener('click', () => canvas.requestPointerLock && canvas.requestPointerLock());
    addEventListener('mousedown', () => { if (document.pointerLockElement === canvas) this.mouse = true; });
    addEventListener('mouseup', () => { this.mouse = false; });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.yaw -= e.movementX * 0.0022; this.pitch = clamp(this.pitch - e.movementY * 0.0022, -1.45, 1.45);
    });
  }
  edge(c) {
    const d = this.driving, E = (o) => this.onEvent(o);
    if (c === 'KeyE') E(d ? { a: 'gear', d: 1 } : { a: 'interact' });
    else if (c === 'KeyQ') E(d ? { a: 'gear', d: -1 } : { a: 'throw' });
    else if (c === 'KeyM') this.onLocal('mic'); else if (c === 'KeyJ') this.onLocal('ach');
    else if (c === 'KeyR') E({ a: 'engine' });
    else if (c === 'KeyL') E({ a: 'lights' });
    else if (c === 'KeyG') E({ a: 'drop' });
    else if (c === 'KeyF') E({ a: 'use' });
    else if (c === 'Backspace') E({ a: 'reset' });
    else if (/^Digit[1-5]$/.test(c)) E({ a: 'gear', v: +c[5] });
    else if (c === 'Digit0') E({ a: 'gear', v: -1 });
    else if (c === 'Digit9') E({ a: 'gear', v: 0 });
    else if (c === 'KeyZ') E({ a: 'sig', v: 0 }); else if (c === 'KeyX') E({ a: 'sig', v: 1 });
    else if (c === 'KeyC') E({ a: 'sig', v: 2 }); else if (c === 'KeyV') E({ a: 'sig', v: 3 });
    else if (c === 'Enter') { document.exitPointerLock(); this.onChat(); }
  }
  sample() {
    const k = this.k, a = (c) => (k[c] ? 1 : 0), ax = this.axis.x, ay = this.axis.y, cl = (v) => clamp(v, -1, 1);
    return {
      mx: cl(a('KeyD') - a('KeyA') + ax), mz: cl(a('KeyW') - a('KeyS') + ay), yaw: this.yaw, pitch: this.pitch,
      sprint: a('ShiftLeft') || (Math.hypot(ax, ay) > 0.92 && !this.driving ? 1 : 0), jump: a('Space'),
      thr: Math.max(a('KeyW'), ay > 0 ? ay : 0), brk: Math.max(a('KeyS'), ay < 0 ? -ay : 0), steer: cl(a('KeyD') - a('KeyA') + ax), hand: a('Space'), horn: a('KeyH') || this.mouse ? 1 : 0,
      wf: (a('BracketRight') || a('KeyT')) - (a('BracketLeft') || a('KeyY')), wr: a('KeyB') - a('KeyN'),
    };
  }
}
