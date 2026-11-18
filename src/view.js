// Рендер снимка состояния (одинаков у хоста и клиентов).
import * as THREE from 'three';
import { createRVMesh, MOUNTS, WHEELS } from './rv.js';
import { createAvatar } from './player.js';
import { createItemMesh, ITEMS, KINDS } from './items.js';
import { createBearMesh, createSnakeMesh } from './bears.js';
import { angLerp } from './utils.js';

const T = new THREE.Vector3(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);

export class View {
  constructor(scene) {
    this.scene = scene; this.rv = createRVMesh(); scene.add(this.rv.group);
    this.pv = new Map(); this.iv = new Map(); this.bv = []; this.rvYaw = 0; this.snap = null;
    const rope = () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), new THREE.MeshBasicMaterial({ color: 0x151515 })); m.visible = false; scene.add(m); return m; };
    this.ropes = [rope(), rope()];
    this.hooks = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xff8800 })); m.visible = false; scene.add(m); return m; });
    const sm = new THREE.SpriteMaterial({ color: 0x555555, transparent: true, opacity: 0.5 });
    this.smoke = Array.from({ length: 14 }, (_, i) => { const s = new THREE.Sprite(sm.clone()); s.visible = false; s.userData.t = i / 14; scene.add(s); return s; });
    this.time = 0; this.rkv = new Map(); this.sv = []; this.heli = null; this.rings = []; this.fx = []; this.graves = new Map(); this.sropes = []; this.pk = null;
  }
  setPickups(pk) { this.pk = pk; }
  apply(snap, dt, smooth) {
    this.snap = snap; this.time += dt; const k = smooth ? 1 - Math.exp(-dt * 18) : 1, r = snap.rv, g = this.rv.group, scene = this.scene;
    g.position.lerp(T.set(...r.p), k); g.quaternion.slerp(Q.set(...r.q), k);
    r.w.forEach((w, i) => { const wg = this.rv.wheels[i]; wg.position.set(WHEELS[i][0], WHEELS[i][1] - w[0], WHEELS[i][2]); wg.rotation.set(-w[1], w[2], 0, 'YXZ'); wg.scale.setScalar(r.wk[i] ? 1 : 0.8); });
    this.rv.spots.forEach((s) => (s.intensity = r.l ? 900 : 0));
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(g.quaternion); this.rvYaw = Math.atan2(-f.x, -f.z);

    // игроки
    const seen = new Set();
    for (const p of snap.pl) {
      seen.add(p.id); let v = this.pv.get(p.id);
      if (v && v.hat !== p.h) { v.group.parent.remove(v.group); this.pv.delete(p.id); v = null; } // сменили шляпу — пересобираем аватар
      if (!v) { v = createAvatar(p.n, p.c, p.h); v.hat = p.h; this.pv.set(p.id, v); scene.add(v.group); }
      const parent = p.ir ? g : scene; let fresh = false;
      if (v.group.parent !== parent) { parent.add(v.group); fresh = true; }
      const kk = fresh ? 1 : k; v.group.position.lerp(T.set(...p.p), kk);
      const yaw = p.ir ? p.y - this.rvYaw : p.y; v.group.rotation.y = fresh ? yaw : angLerp(v.group.rotation.y, yaw, kk);
      v.body.rotation.x = p.dn ? -Math.PI / 2 : 0; v.body.position.y = p.dn ? 0.3 : 0;
      v.hand.rotation.x = p.pt * 0.5; v.snapDown = p.dn; v.hd = p.hd; v.hk = p.hk;
      // анимация ходьбы: скорость по сдвигу отрисованной позиции
      if (!v.prev) v.prev = new THREE.Vector3().copy(v.group.position);
      const sp = fresh ? 0 : Math.min(9, v.group.position.distanceTo(v.prev) / Math.max(dt, 1e-3)); v.prev.copy(v.group.position);
      v.ph = (v.ph || 0) + sp * dt * 2.4; const sw = Math.sin(v.ph) * Math.min(1, sp / 3) * 0.9;
      if (p.dr) { v.legs[0].rotation.x = v.legs[1].rotation.x = -1.4; v.arms[0].rotation.x = v.arms[1].rotation.x = -1.0; }
      else if (p.dn) { v.legs[0].rotation.x = v.legs[1].rotation.x = v.arms[0].rotation.x = v.arms[1].rotation.x = 0; }
      else { v.legs[0].rotation.x = sw; v.legs[1].rotation.x = -sw; v.arms[0].rotation.x = -sw * 0.8; v.arms[1].rotation.x = p.hd >= 0 || p.hk >= 0 ? -0.9 : sw * 0.8; }
    }
    for (const [id, v] of this.pv) if (!seen.has(id)) { v.group.parent.remove(v.group); this.pv.delete(id); }

    // предметы
    const seenI = new Set();
    for (const it of snap.it) {
      const [id, kind, st, x, y, z, qx, qy, qz, qw, by] = it; seenI.add(id);
      let m = this.iv.get(id);
      if (!m || m.userData.kind !== kind) { if (m && m.parent) m.parent.remove(m); m = createItemMesh(kind); m.userData.kind = kind; this.iv.set(id, m); }
      const kd = ITEMS[KINDS[kind]], hv = st === 2 ? this.pv.get(by) : null;
      const parent = st === 0 ? scene : st === 1 ? g : hv ? hv.hand : scene;
      const fresh = m.parent !== parent; if (fresh) parent.add(m);
      if (st === 2) { m.position.set(0, 0, -(kd.off || 0)); m.quaternion.identity(); }
      else if (st === 1) { m.position.set(x, y, z); m.quaternion.identity(); }
      else { const kk = fresh ? 1 : k; m.position.lerp(T.set(x, y, z), kk); m.quaternion.slerp(Q.set(qx, qy, qz, qw), kk); }
    }
    for (const [id, m] of this.iv) if (!seenI.has(id)) { m.parent && m.parent.remove(m); this.iv.delete(id); }

    // медведи
    while (this.bv.length < snap.br.length) { const m = createBearMesh(); scene.add(m); this.bv.push(m); }
    snap.br.forEach((b, i) => {
      const m = this.bv[i]; m.position.lerp(T.set(b[0], b[1], b[2]), k); m.rotation.y = angLerp(m.rotation.y, b[3], k);
      m.rotation.z = b[4] === 2 ? Math.sin(this.time * 14) * 0.06 : 0;
      const sw = b[4] === 1 ? Math.sin(this.time * 11) * 0.7 : b[4] === 0 ? Math.sin(this.time * 3) * 0.12 : 0;
      m.userData.legs.forEach((l, j) => (l.rotation.x = j % 3 === 0 ? sw : -sw));
    });

    // тросы
    scene.updateMatrixWorld(true);
    snap.wn.forEach((w, i) => {
      const rope = this.ropes[i], hook = this.hooks[i], a = g.localToWorld(new THREE.Vector3(...MOUNTS[i]));
      let b = null;
      if (w[0] === 1) { const h = [...this.pv.values()].find((v) => v.hk === i); if (h) b = h.hand.getWorldPosition(new THREE.Vector3()); }
      else if (w[0] === 2) b = new THREE.Vector3(w[2], w[3], w[4]);
      rope.visible = hook.visible = !!b; if (!b) return;
      hook.position.copy(b); const d = b.clone().sub(a), len = d.length() || 0.01;
      rope.position.copy(a).addScaledVector(d, 0.5); rope.scale.set(1, len, 1); rope.quaternion.setFromUnitVectors(UP, d.normalize());
    });

    this.extra(snap, dt);

    // дым из-под капота при повреждении
    const sm = r.hp < 45;
    const src = g.localToWorld(new THREE.Vector3(0, 0.2, -3.2));
    for (const s of this.smoke) {
      if (!sm) { s.visible = false; continue; }
      s.userData.t = (s.userData.t + dt * 0.6) % 1; const t = s.userData.t; s.visible = true;
      s.position.set(src.x + Math.sin(t * 9 + s.id) * 0.4, src.y + t * 5, src.z + Math.cos(t * 7 + s.id) * 0.4); s.scale.setScalar(0.8 + t * 3); s.material.opacity = 0.55 * (1 - t);
    }
  }
  extra(snap, dt) {
    const sc = this.scene, tn = this.time, M = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, transparent: true, ...o });
    // камнепады
    const seen = new Set();
    for (const r of snap.rk) { seen.add(r[0]); let m = this.rkv.get(r[0]); if (!m) { m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x6e665c })); sc.add(m); this.rkv.set(r[0], m); } m.position.set(r[1], r[2], r[3]); m.scale.setScalar(r[4]); m.rotation.x += dt * 2; }
    for (const [id, m] of this.rkv) if (!seen.has(id)) { sc.remove(m); this.rkv.delete(id); }
    // змеи
    while (this.sv.length < snap.sn.length) { const m = createSnakeMesh(); sc.add(m); this.sv.push(m); }
    snap.sn.forEach((s, i) => { const m = this.sv[i]; m.position.set(s[0], s[1], s[2]); m.rotation.y = s[3]; m.userData.segs.forEach((g, j) => (g.position.x = Math.sin(tn * 4 + j * 0.9) * 0.12)); });
    // вертолёт
    if (snap.hc) { if (!this.heli) { this.heli = createHeli(); sc.add(this.heli); } this.heli.visible = true; this.heli.position.set(snap.hc[0], snap.hc[1], snap.hc[2]); this.heli.rotation.y = snap.hc[3]; this.heli.userData.rotor.rotation.y = tn * 30; this.heli.userData.tail.rotation.x = tn * 30; }
    else if (this.heli) this.heli.visible = false;
    // метки обстрела и взрывы
    while (this.rings.length < snap.sh.length) { const m = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.2, 28).rotateX(-Math.PI / 2), M(0xff2020, { opacity: 0.7, side: THREE.DoubleSide })); sc.add(m); this.rings.push(m); }
    this.rings.forEach((m, i) => { const s = snap.sh[i]; m.visible = !!s; if (s) { m.position.set(s[0], s[1] + 0.1, s[2]); m.scale.setScalar(1 + 0.15 * Math.sin(tn * 20)); } });
    while (this.fx.length < snap.ex.length) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), M(0xff8a00)); sc.add(m); this.fx.push(m); }
    this.fx.forEach((m, i) => { const e = snap.ex[i]; m.visible = !!e; if (e) { m.position.set(e[0], e[1] + 1, e[2]); m.scale.setScalar(1 + e[3] * 7); m.material.opacity = Math.max(0, 1 - e[3] / 0.8); } });
    // кассеты и шляпы: скрываем собранные, покачиваем
    if (this.pk) {
      const tg = new Set(snap.tg), cg = new Set(snap.cg);
      for (const m of this.pk.tapes) { m.visible = !tg.has(m.userData.id); m.position.y = m.userData.y0 + Math.sin(tn * 2 + m.userData.id) * 0.1; m.rotation.y += dt; }
      for (const m of this.pk.cloth) { m.visible = !cg.has(m.userData.id); m.position.y = m.userData.y0 + Math.sin(tn * 2 + m.userData.id) * 0.15; m.rotation.y += dt * 1.5; }
    }
    // могилы павших (рядом с лежащим игроком)
    const dead = new Set();
    for (const p of snap.pl) if (p.dd && !p.ir) {
      dead.add(p.id); let g = this.graves.get(p.id);
      if (!g) { g = new THREE.Group(); const s = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.2), new THREE.MeshLambertMaterial({ color: 0x8a8f96 })), t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.24), new THREE.MeshLambertMaterial({ color: 0x6d7278 })); s.position.y = 0.55; t.position.y = 1.15; g.add(s, t); sc.add(g); this.graves.set(p.id, g); }
      g.position.set(p.p[0], p.p[1], p.p[2] - 1.0);
    }
    for (const [id, g] of this.graves) if (!dead.has(id)) { sc.remove(g); this.graves.delete(id); }
    // верёвки тарзанки
    const sw = snap.pl.filter((p) => p.sw);
    while (this.sropes.length < sw.length) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 5), new THREE.MeshBasicMaterial({ color: 0x6b4a2a })); sc.add(m); this.sropes.push(m); }
    this.sropes.forEach((m, i) => {
      const p = sw[i]; m.visible = !!p; if (!p) return;
      const v = this.pv.get(p.id); if (!v) { m.visible = false; return; }
      const a = new THREE.Vector3(...p.sw), b = v.group.localToWorld(new THREE.Vector3(0, 1.3, 0)), d = b.clone().sub(a), len = d.length() || 0.01;
      m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, len, 1); m.quaternion.setFromUnitVectors(UP, d.normalize());
    });
  }
  // положение глаз игрока (для камеры)
  eye(id) {
    const v = this.pv.get(id); if (!v) return null; v.group.updateWorldMatrix(true, false);
    return v.group.localToWorld(new THREE.Vector3(0, v.snapDown ? 0.4 : 1.6, 0));
  }
  setSelf(id) { for (const [pid, v] of this.pv) v.body.visible = pid !== id; if (this.pv.get(id)) this.pv.get(id).label.visible = false; }
}

function createHeli() {
  const g = new THREE.Group(), L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const bx = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), L(c)); m.position.set(x, y, z); g.add(m); return m; };
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), L(0x3b4a3a)); body.scale.set(1.5, 1.2, 3); g.add(body);
  bx(0.4, 0.4, 5, 0x3b4a3a, 0, 0.3, 4.5); bx(1.6, 0.9, 0.05, 0x9ad0ff, 0, 0.3, -2.7).material.transparent = true;
  bx(0.2, 1.4, 0.8, 0x3b4a3a, 0, 0.9, 6.6);
  for (const s of [-1, 1]) { bx(0.1, 0.1, 3, 0x222222, s * 1.1, -1.4, 0); bx(0.1, 0.8, 0.1, 0x222222, s * 1.1, -1.0, -0.8); bx(0.1, 0.8, 0.1, 0x222222, s * 1.1, -1.0, 0.8); }
  bx(0.5, 0.3, 1.4, 0x222222, -1.5, -0.2, -1.2); bx(0.5, 0.3, 1.4, 0x222222, 1.5, -0.2, -1.2);
  const rotor = new THREE.Group(); rotor.position.y = 1.5; rotor.add(new THREE.Mesh(new THREE.BoxGeometry(12, 0.05, 0.4), L(0x111111)), new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 12), L(0x111111))); g.add(rotor);
  const tail = new THREE.Group(); tail.position.set(0.25, 0.9, 6.6); tail.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.8, 0.2), L(0x111111))); g.add(tail);
  g.userData = { rotor, tail }; return g;
}
