import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { clamp } from './utils.js';

// Автодом: перёд = -Z (локально), право = +X. Центр масс высоко => реалистично кренится.
export const WHEELS = [[-1.15, -0.9, -2.1], [1.15, -0.9, -2.1], [-1.15, -0.9, 2.1], [1.15, -0.9, 2.1]]; // ПЛ, ПП, ЗЛ, ЗП
export const MOUNTS = [[0, -1.0, -3.25], [0, -1.0, 3.25]]; // лебёдки: передняя, задняя
export const DOOR = [1.2, -1.3, 0.6], SEAT = [-0.55, -1.3, -1.9], GRILL = [-0.82, -1.3, 0.0], FRIDGE = [-0.85, -1.3, 1.15], FLOOR_Y = -1.3;
export const COFFEE = [-0.85, -1.3, -0.85], SMOKE = [0.85, -1.3, -0.15], TAPE = [0.85, -1.3, -0.45], WARD = [0.85, -1.3, 1.75], GRILL2 = [0, -0.55, 3.95]; // кофеварка, сигареты, магнитофон, шкаф с одеждой, гриль снаружи
export const SLOTS = [ // 0-5 — внутри (столешница, стол, кровать, шкаф), 6-9 — багажник на крыше
  [-0.85, -0.34, -0.6], [-0.85, -0.34, 0.6], [0.85, -0.5, -0.7], [-0.5, -0.6, 2.5], [0.5, -0.6, 2.5], [0.85, -0.25, 1.75],
  [-0.9, 1.25, 0], [-0.3, 1.25, 0], [0.3, 1.25, 0], [0.9, 1.25, 0]];
// мебель внутри (xmin,xmax,zmin,zmax) — игрок не может пройти сквозь неё
export const COLL = [[-1.12, -0.6, -1.0, 0.75], [-1.12, -0.6, 0.85, 1.45], [0.6, 1.12, -1.3, -0.1], [0.6, 1.12, 1.4, 2.05], [-1.12, 1.12, 2.0, 3.2], [-1.12, -0.25, -2.25, -1.6], [0.25, 1.12, -2.25, -1.6], [-1.12, 1.12, -3.2, -2.5]];
export function resolveInterior(lp, r = 0.28) {
  for (const [x0, x1, z0, z1] of COLL) {
    const px = lp[0], pz = lp[2];
    if (px > x0 - r && px < x1 + r && pz > z0 - r && pz < z1 + r) {
      const dl = px - (x0 - r), dr = x1 + r - px, dt = pz - (z0 - r), db = z1 + r - pz, m = Math.min(dl, dr, dt, db);
      if (m === dl) lp[0] = x0 - r; else if (m === dr) lp[0] = x1 + r; else if (m === dt) lp[2] = z0 - r; else lp[2] = z1 + r;
    }
  }
  lp[0] = clamp(lp[0], -1.0, 1.0); lp[2] = clamp(lp[2], -2.5, 2.6);
}
// передача: [макс. скорость км/ч, суммарная сила тяги Н]
export const GEARS = { '-1': [20, -5000], 0: [0, 0], 1: [20, 9000], 2: [38, 6500], 3: [56, 4800], 4: [76, 3500], 5: [95, 2600] };
export const GEAR_SEQ = [-1, 0, 1, 2, 3, 4, 5];

export class RVSim {
  constructor(phys, x, y, z) {
    this.phys = phys;
    const b = (this.body = new CANNON.Body({ mass: 1800, material: phys.mats.body }));
    b.addShape(new CANNON.Box(new CANNON.Vec3(1.2, 1.3, 3.1)), new CANNON.Vec3(0, -0.2, 0));
    b.position.set(x, y, z); b.angularDamping = 0.3; b.linearDamping = 0.03; b.allowSleep = false;
    const v = (this.veh = new CANNON.RaycastVehicle({ chassisBody: b, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 }));
    const o = { radius: 0.55, directionLocal: new CANNON.Vec3(0, -1, 0), axleLocal: new CANNON.Vec3(-1, 0, 0), suspensionStiffness: 18, suspensionRestLength: 0.6, frictionSlip: 2.2, dampingRelaxation: 2.4, dampingCompression: 4.4, maxSuspensionForce: 300000, rollInfluence: 0.6, maxSuspensionTravel: 0.5 };
    for (const w of WHEELS) v.addWheel({ ...o, chassisConnectionPointLocal: new CANNON.Vec3(...w) });
    v.addToWorld(phys.world);
    this.hp = 100; this.hull = 100; this.hitN = 0; this.eng = false; this.gear = 0; this.lights = false; this.horn = 0; this.wok = [1, 1, 1, 1];
    this.t = 0; this.lastHit = -9; this.rpm = 0; this.speed = 0; this.tilt = 0; this.jerk = 0; this.lv = new CANNON.Vec3(); this.drv = -1;
    this.winch = [0, 1].map(() => ({ st: 0, by: -1, anchor: null, len: 0, ten: 0, ap: -1 })); // st: 0 смотан, 1 в руках, 2 зацеплен
    b.addEventListener('collide', (e) => { const imp = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (imp > 5.5) this.hit(imp); });
  }
  hit(v) {
    if (this.t - this.lastHit < 0.3) return; this.lastHit = this.t; this.hitN++;
    const dmg = (v - 5) * 2.2; this.hp = Math.max(0, this.hp - dmg); this.hull = Math.max(0, this.hull - dmg * 1.3);
    if (this.hp <= 0 || this.hull <= 0) this.eng = false;
    if (v > 8.5 && Math.random() < 0.3) this.wok[(Math.random() * 4) | 0] = 0; // прокол / слетело колесо
  }
  toggleEngine() {
    if (this.eng) this.eng = false; else if (this.hp > 0 && this.hull > 0) this.eng = true;
    return this.eng || (this.hp > 0 && this.hull > 0);
  }
  mountWorld(i) { return this.body.pointToWorldFrame(new CANNON.Vec3(...MOUNTS[i])); }

  update(dt, c) {
    this.t += dt;
    const b = this.body, v = this.veh, vel = b.velocity;
    const fwd = b.quaternion.vmult(new CANNON.Vec3(0, 0, -1)), up = b.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    const sp = vel.dot(fwd); this.speed = sp * 3.6; this.tilt = Math.acos(clamp(up.y, -1, 1));
    const dv = Math.hypot(vel.x - this.lv.x, vel.y - this.lv.y, vel.z - this.lv.z) / Math.max(dt, 1e-3);
    this.jerk += (dv - this.jerk) * 0.4; this.lv.copy(vel);
    const g = GEARS[this.gear];
    if (this.eng && this.hp < 30 && Math.random() < dt * 0.08) this.eng = false; // изношенный двигатель глохнет сам
    if (this.eng && this.gear >= 3 && Math.abs(sp) < 1.2 && c.thr > 0.5) this.eng = false; // заглохли на высокой передаче
    let F = 0;
    if (this.eng && this.hp > 0 && this.gear !== 0 && !c.hand && !c.brk) {
      const mx = g[0] / 3.6; if (this.gear < 0 ? -sp < mx : sp < mx) F = g[1] * c.thr * (this.hull < 30 ? 0.5 : 1); // сильно побитый корпус — хромаем
    }
    this.rpm = this.eng ? 900 + Math.min(1, Math.abs(this.speed) / Math.max(12, g[0] || 30)) * 5200 * (0.5 + 0.5 * c.thr) : 0;
    let mudSum = 0;
    for (let i = 0; i < 4; i++) {
      const wi = v.wheelInfos[i], p = wi.chassisConnectionPointWorld, m = this.phys.W.mud(p.x, p.z), ok = this.wok[i];
      mudSum += m; wi.radius = ok ? 0.55 : 0.42;
      wi.frictionSlip = 2.2 * (m ? 0.3 : 1) * (ok ? 1 : 0.5); // в грязи колёса буксуют
      v.applyEngineForce((F / 4) * (m ? 0.5 : 1) * (ok ? 1 : 0.5), i);
      let br = c.brk * 60;
      if (c.hand) br = i >= 2 ? 140 : 40; else if (!c.thr) br = Math.max(br, 4);
      v.setBrake(F ? 0 : br, i);
    }
    const st = (-c.steer * 0.5) / (1 + Math.abs(sp) / 12);
    v.setSteeringValue(st, 0); v.setSteeringValue(st, 1);
    if (mudSum >= 2) { const k = 1 - 0.5 * dt; vel.x *= k; vel.z *= k; }
    // лебёдки: трос тянет только на растяжение (пружина с демпфером)
    for (let i = 0; i < 2; i++) {
      const w = this.winch[i]; w.ten = 0; if (w.st !== 2 || !w.anchor || w.ap >= 0) continue;
      const m = this.mountWorld(i), dx = w.anchor.x - m.x, dy = w.anchor.y - m.y, dz = w.anchor.z - m.z, dist = Math.hypot(dx, dy, dz) || 1, ex = dist - w.len;
      if (ex <= 0) continue;
      const rel = b.getVelocityAtWorldPoint(m, new CANNON.Vec3()), vr = -(rel.x * dx + rel.y * dy + rel.z * dz) / dist;
      const F2 = clamp(ex * 14000 + vr * 2500, 0, 26000); w.ten = F2;
      b.applyForce(new CANNON.Vec3((dx / dist) * F2, (dy / dist) * F2, (dz / dist) * F2), m.vsub(b.position));
    }
  }
  reel(i, dir, dt) {
    const w = this.winch[i]; if (w.st !== 2 || !w.anchor || !dir) return;
    const m = this.mountWorld(i), d = Math.hypot(w.anchor.x - m.x, w.anchor.y - m.y, w.anchor.z - m.z);
    if (dir > 0) w.len = Math.max(2, Math.min(w.len, d) - 1.6 * dt); else w.len = Math.min(45, w.len + 2.5 * dt);
  }
  reset(x, y, z) {
    const b = this.body; b.position.set(x, y, z); b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); b.quaternion.set(0, 0, 0, 1);
    this.hp = Math.max(this.hp, 50); this.hull = Math.max(this.hull, 50); this.wok = [1, 1, 1, 1]; this.eng = false; this.gear = 0;
    for (const w of this.winch) { w.st = 0; w.by = -1; w.anchor = null; w.ap = -1; }
  }
}

// ======================= МОДЕЛЬ АВТОДОМА (снаружи и внутри) =======================
function tex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}

export function createRVMesh() {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide, ...o });
  const m = {
    cream: M(0xeee7d3), teal: M(0x1f8a8a), dark: M(0x24252a), black: M(0x111114), chrome: M(0xcfd3d8), steel: M(0x9aa0a6),
    glass: M(0x9ad0ff, { transparent: true, opacity: 0.22 }), wood: M(0x8a5a2b), cab: M(0xc9a06a), fabric: M(0x2f5f9a), lam: M(0xe8e4da),
    fridge: M(0xf4f4f6), red: M(0xb3261e), orange: M(0xff7a1a, { emissive: 0x7a2a00 }), lamp: M(0xfff1c4, { emissive: 0xffe08a }),
    green: M(0x3c8a3c), cur: M(0xd9893b), blanket: M(0xb23a3a), pillow: M(0xf2efe6), rug: M(0x8e2f2f), amber: M(0xffa000, { emissive: 0x663d00 }),
    floor: new THREE.MeshLambertMaterial({ map: tex(128, 128, (x, w, h) => { x.fillStyle = '#a06f40'; x.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#946438' : '#aa7a4a'; x.fillRect(0, i * 16, w, 15); x.fillStyle = '#5a3a1e'; x.fillRect(0, i * 16 + 15, w, 1); x.fillRect((i * 37) % 128, i * 16, 1, 15); } }, [1.1, 3]) }),
    plate: M(0xffffff, { map: tex(128, 64, (x, w, h) => { x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, w, h); x.strokeStyle = '#124'; x.lineWidth = 4; x.strokeRect(2, 2, w - 4, h - 4); x.fillStyle = '#124'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.fillText('RV-65', w / 2, 44); }) }),
  };
  const B = (w, h, d, x, y, z, mt, p = g) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt); me.position.set(x, y, z); p.add(me); return me; };
  const C = (rt, rb, h, x, y, z, mt, rx = 0, rz = 0, seg = 12) => { const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mt); me.position.set(x, y, z); me.rotation.set(rx, 0, rz); g.add(me); return me; };

  // ---- корпус ----
  B(2.4, 0.2, 6.2, 0, -1.4, 0, m.dark);                                              // днище
  B(2.2, 0.03, 6.0, 0, -1.285, 0, m.floor);                                          // пол (паркет)
  B(0.1, 0.9, 6.2, -1.15, -0.85, 0, m.cream);                                        // левая стена
  B(0.1, 0.9, 3.3, 1.15, -0.85, -1.45, m.cream); B(0.1, 0.9, 2.1, 1.15, -0.85, 2.05, m.cream); // правая — с проёмом двери
  B(2.4, 0.9, 0.1, 0, -0.85, 3.1, m.cream); B(2.4, 0.9, 0.1, 0, -0.85, -3.1, m.cream);
  B(0.05, 1.1, 6.0, -1.17, 0.15, 0, m.glass); B(0.05, 1.1, 3.2, 1.17, 0.15, -1.4, m.glass); B(0.05, 1.1, 2.0, 1.17, 0.15, 2.0, m.glass);
  B(2.3, 1.1, 0.05, 0, 0.15, -3.12, m.glass); B(2.3, 1.1, 0.05, 0, 0.15, 3.12, m.glass);
  for (const x of [-1.15, 1.15]) for (const z of [-3.1, 3.1]) B(0.14, 1.1, 0.14, x, 0.15, z, m.cream);        // угловые стойки
  for (const z of [-1.4, 1.6]) { B(0.1, 1.1, 0.08, -1.17, 0.15, z, m.cream); B(0.1, 1.1, 0.08, 1.17, 0.15, z, m.cream); }
  for (const z of [0.2, 1.0]) B(0.12, 2.0, 0.12, 1.17, -0.3, z, m.dark);                                       // дверной проём
  B(2.5, 0.4, 6.3, 0, 0.9, 0, m.cream);                                                                        // крыша
  for (const s of [-1, 1]) { B(0.03, 0.16, 6.1, s * 1.21, -1.0, 0, m.teal); B(0.03, 0.05, 6.1, s * 1.21, -0.78, 0, m.orange); }
  B(2.42, 0.16, 0.03, 0, -1.0, 3.12, m.teal); B(2.42, 0.16, 0.03, 0, -1.0, -3.12, m.teal);
  // ---- перёд ----
  B(2.5, 0.28, 0.35, 0, -1.25, -3.3, m.dark); B(2.3, 0.05, 0.38, 0, -1.1, -3.3, m.chrome);                    // бампер
  B(1.4, 0.4, 0.05, 0, -0.85, -3.16, m.dark); for (let i = 0; i < 5; i++) B(1.3, 0.03, 0.02, 0, -1.02 + i * 0.07, -3.2, m.chrome); // решётка
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 16).rotateX(Math.PI / 2), m.lamp); hl.position.set(s * 0.85, -0.8, -3.17); g.add(hl);
    B(0.18, 0.1, 0.05, s * 1.05, -1.0, -3.17, m.amber);
    B(0.25, 0.04, 0.04, s * 1.32, -0.15, -2.9, m.dark); B(0.06, 0.32, 0.2, s * 1.46, -0.15, -2.9, m.black);       // зеркала
    B(0.55, 0.02, 0.02, s * 0.45, -0.34, -3.09, m.black).rotation.z = s * 0.15;                                  // дворники
  }
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), m.plate); pl.position.set(0, -1.25, -3.49); pl.rotation.y = Math.PI; g.add(pl);
  // ---- зад ----
  B(2.5, 0.28, 0.35, 0, -1.25, 3.3, m.dark); B(2.3, 0.05, 0.38, 0, -1.1, 3.3, m.chrome);
  for (const s of [-1, 1]) { B(0.25, 0.35, 0.05, s * 0.95, -0.7, 3.14, m.red); B(0.06, 2.4, 0.06, s * 0.4, -0.2, 3.27, m.dark); }
  for (let i = 0; i < 7; i++) B(0.8, 0.04, 0.04, 0, -1.25 + i * 0.4, 3.27, m.dark);                              // лестница
  const pl2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), m.plate); pl2.position.set(0.8, -1.2, 3.49); g.add(pl2);
  C(0.05, 0.05, 0.5, -0.8, -1.5, 3.35, m.chrome, Math.PI / 2);                                                  // выхлоп
  // ---- арки колёс, подножка, рейлинги, люки ----
  for (const w of WHEELS) { const s = Math.sign(w[0]); B(0.55, 0.1, 1.4, s * 1.2, -0.76, w[2], m.dark); B(0.04, 0.5, 1.4, s * 1.47, -1.0, w[2], m.dark); B(0.04, 0.32, 0.4, s * 1.4, -1.35, w[2] + 0.75, m.black); }
  B(0.4, 0.08, 0.9, 1.4, -1.52, 0.6, m.dark); B(0.4, 0.04, 0.9, 1.4, -1.0, 0.6 + 0.0, m.chrome).visible = false;
  for (const x of [-1.05, 1.05]) B(0.06, 0.1, 6.6, x, 1.17, 0, m.dark);
  for (const z of [-2.6, 0, 2.6]) B(2.2, 0.06, 0.08, 0, 1.15, z, m.dark);
  for (const z of [-2.4, 2.4]) { B(0.5, 0.08, 0.5, 0, 1.12, z, m.chrome); C(0.18, 0.2, 0.08, 0, 1.18, z, m.white || m.cream); }
  C(0.015, 0.015, 0.8, -1.0, 1.5, -2.8, m.black);                                                                // антенна
  // ---- ИНТЕРЬЕР: кабина ----
  B(2.2, 0.5, 0.5, 0, -1.0, -2.8, m.dark); B(2.2, 0.05, 0.5, 0, -0.74, -2.8, m.black);                          // панель
  B(0.5, 0.18, 0.02, SEAT[0], -0.62, -2.54, m.black);
  [[-0.7, 0x44ff66], [-0.55, 0xffaa00], [-0.4, 0xff4444]].forEach(([x, c]) => { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 10).rotateX(Math.PI / 2), M(c, { emissive: c })); d.position.set(x, -0.62, -2.53); g.add(d); });
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 22), m.dark); wheel.position.set(SEAT[0], -0.5, -2.35); wheel.rotation.x = 1.1; g.add(wheel);
  C(0.03, 0.03, 0.3, SEAT[0], -0.62, -2.45, m.dark, 1.1);
  for (const x of [SEAT[0], 0.55]) { B(0.5, 0.18, 0.5, x, -1.15, SEAT[2], m.fabric); B(0.5, 0.65, 0.12, x, -0.78, SEAT[2] + 0.28, m.fabric); B(0.28, 0.18, 0.1, x, -0.38, SEAT[2] + 0.3, m.fabric); B(0.06, 0.2, 0.4, x + 0.27, -0.95, SEAT[2], m.dark); }
  B(0.28, 0.28, 0.5, 0, -1.15, SEAT[2], m.dark);                                                                  // консоль
  C(0.08, 0.06, 0.1, 0.85, -0.65, -2.75, m.rug); const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), m.green); leaf.position.set(0.85, -0.5, -2.75); g.add(leaf); // растение
  // ---- кухня (слева) ----
  B(0.55, 0.9, 1.75, -0.825, -0.85, -0.125, m.cab); B(0.6, 0.04, 1.8, -0.82, -0.4, -0.125, m.lam);
  for (const z of [-0.7, -0.1, 0.5]) B(0.01, 0.7, 0.02, -0.54, -0.85, z, m.dark);
  B(0.36, 0.04, 0.42, -0.82, -0.385, 0.5, m.steel); C(0.015, 0.015, 0.2, -0.95, -0.3, 0.5, m.chrome); B(0.12, 0.02, 0.02, -0.89, -0.2, 0.5, m.chrome);   // мойка
  B(0.5, 0.02, 0.5, -0.82, -0.38, 0.0, m.black);                                                                  // плита
  for (const dx of [-0.1, 0.1]) for (const dz of [-0.1, 0.1]) { const bn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 14), m.orange); bn.position.set(-0.82 + dx, -0.37, dz); g.add(bn); }
  B(0.34, 0.65, 1.7, -0.93, 0.33, -0.15, m.cab); for (const z of [-0.7, -0.15, 0.4]) B(0.01, 0.55, 0.02, -0.76, 0.33, z, m.dark);   // верхние шкафы
  B(0.5, 1.4, 0.6, -0.85, -0.6, 1.15, m.fridge); B(0.03, 0.35, 0.04, -0.58, -0.45, 0.95, m.dark); B(0.01, 0.02, 0.58, -0.59, -0.2, 1.15, m.dark); // холодильник
  // ---- диван и стол (справа) ----
  B(0.5, 0.05, 0.7, 0.85, -0.55, -0.7, m.wood); C(0.04, 0.04, 0.7, 1.0, -0.9, -0.7, m.dark);
  for (const z of [-1.15, -0.25]) { B(0.5, 0.35, 0.3, 0.85, -1.1, z, m.fabric); B(0.06, 0.45, 0.3, 1.07, -0.75, z, m.fabric); }
  B(0.18, 0.02, 0.12, 0.85, -0.52, -0.7, m.red); C(0.04, 0.04, 0.1, 0.9, -0.47, -0.8, m.pillow);                 // скатерть-салфетка и кружка
  // ---- санузел-шкаф и кровать ----
  B(0.5, 1.0, 0.6, 0.85, -0.8, 1.75, m.lam); B(0.01, 0.8, 0.02, 0.59, -0.8, 1.75, m.dark); B(0.03, 0.15, 0.03, 0.59, -0.75, 1.9, m.chrome);
  B(2.18, 0.4, 1.1, 0, -1.1, 2.55, m.wood); B(2.1, 0.18, 1.0, 0, -0.82, 2.55, m.pillow); B(2.12, 0.06, 0.6, 0, -0.7, 2.25, m.blanket);
  B(0.55, 0.1, 0.3, -0.5, -0.7, 2.9, m.pillow); B(0.55, 0.1, 0.3, 0.5, -0.7, 2.9, m.pillow);
  // ---- шторы, коврик, свет ----
  for (const z of [-2.3, -0.3, 1.9]) B(0.02, 0.75, 0.7, -1.1, 0.3, z, m.cur);
  for (const z of [-2.3, -0.5, 1.9]) B(0.02, 0.75, 0.7, 1.1, 0.3, z, m.cur);
  B(0.7, 0.01, 1.1, 0, -1.27, 0.4, m.rug);
  B(0.3, 0.04, 0.3, 0, 0.66, -0.5, m.lamp); B(0.3, 0.04, 0.3, 0, 0.66, 1.5, m.lamp);
  const lampL = new THREE.PointLight(0xffe2b0, 6, 8, 2); lampL.position.set(0, 0.3, 0.5); g.add(lampL);

  // кофеварка, пачка сигарет, магнитофон, гриль на задней подвеске
  B(0.25, 0.35, 0.25, COFFEE[0], -0.22, COFFEE[2], m.black); B(0.05, 0.05, 0.02, COFFEE[0] + 0.12, -0.15, COFFEE[2], m.red); C(0.04, 0.04, 0.08, COFFEE[0], -0.36, COFFEE[2] + 0.05, m.cream);
  B(0.1, 0.03, 0.07, SMOKE[0], -0.9, SMOKE[2], m.red); B(0.1, 0.005, 0.07, SMOKE[0], -0.883, SMOKE[2], m.cream);
  B(0.3, 0.12, 0.2, TAPE[0], -0.465, TAPE[2], m.black); B(0.12, 0.05, 0.01, TAPE[0], -0.465, TAPE[2] + 0.101, m.amber); for (const s of [-1, 1]) C(0.04, 0.04, 0.01, TAPE[0] + s * 0.09, -0.465, TAPE[2] - 0.101, m.steel, Math.PI / 2);
  B(0.8, 0.12, 0.6, 0, -1.1, 3.62, m.dark); B(0.8, 0.35, 0.6, 0, -0.78, 3.95, m.dark); B(0.7, 0.03, 0.5, 0, -0.58, 3.95, m.orange); for (const s of [-1, 1]) B(0.05, 0.55, 0.05, s * 0.35, -1.0, 4.2, m.dark);
  // ---- колёса (протектор вращается — видно ход) ----
  const wheels = WHEELS.map((w) => {
    const wg = new THREE.Group(), s = Math.sign(w[0]);
    wg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 22).rotateZ(Math.PI / 2), M(0x1a1a1a)));
    wg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.43, 14).rotateZ(Math.PI / 2), m.chrome));
    wg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.47, 8).rotateZ(Math.PI / 2), m.dark));
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.13), M(0x0c0c0c)); t.position.set(0, Math.cos(a) * 0.55, Math.sin(a) * 0.55); t.rotation.x = a; wg.add(t); }
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, bl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 6).rotateZ(Math.PI / 2), m.steel); bl.position.set(s * 0.23, Math.cos(a) * 0.2, Math.sin(a) * 0.2); wg.add(bl); }
    wg.position.set(...w); g.add(wg); return wg;
  });
  const spots = [-0.8, 0.8].map((x) => { const sp = new THREE.SpotLight(0xfff2cc, 0, 90, 0.5, 0.4, 2); sp.position.set(x, -0.8, -3.2); sp.target.position.set(x, -1.8, -30); g.add(sp, sp.target); return sp; });
  return { group: g, wheels, spots, lamp: lampL };
}
