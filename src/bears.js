import * as THREE from 'three';

export class BearSim {
  constructor(id, x, z, W) { this.id = id; this.x = x; this.z = z; this.W = W; this.y = W.height(x, z); this.yaw = Math.random() * 6.28; this.st = 0; this.atk = 0; this.wt = 0; }
  // targets: [{id,x,z}] игроки вне машины; rv: {x,z,eng,horn}. Возвращает id игроков, получивших удар.
  update(dt, targets, rv) {
    let tx = null, tz = null, hit = null, best = 30;
    for (const t of targets) { const d = Math.hypot(t.x - this.x, t.z - this.z); if (d < best) { best = d; tx = t.x; tz = t.z; hit = t; } }
    let speed = 1.2, d = best;
    if (tx === null) {
      const r = rv.horn ? 260 : rv.eng ? 110 : 0, dr = Math.hypot(rv.x - this.x, rv.z - this.z);
      if (r && dr < r && dr > 7) { tx = rv.x; tz = rv.z; d = dr; }
    }
    const out = [];
    if (tx !== null) {
      this.yaw = Math.atan2(-(tx - this.x), -(tz - this.z));
      if (hit && d < 2.3) { this.st = 2; this.atk -= dt; if (this.atk <= 0) { this.atk = 1.2; out.push(hit.id); } speed = 0; }
      else { this.st = 1; speed = 6.5; }
    } else {
      this.st = 0; this.wt -= dt;
      if (this.wt <= 0) { this.wt = 2 + Math.random() * 4; this.yaw += (Math.random() - 0.5) * 2.5; }
    }
    if (speed > 0) {
      const nx = this.x - Math.sin(this.yaw) * speed * dt, nz = this.z - Math.cos(this.yaw) * speed * dt, ny = this.W.height(nx, nz);
      if (Math.abs(ny - this.y) < 0.9 * speed * dt + 0.15 && Math.abs(nx) < 980 && Math.abs(nz) < 980) { this.x = nx; this.z = nz; this.y = ny; } else this.yaw += 1.5;
    }
    return out;
  }
}

export function createBearMesh() {
  const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0x4a3222 });
  const b = (w, h, l, x, y, z) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); me.position.set(x, y, z); g.add(me); return me; };
  b(1.1, 1.1, 1.9, 0, 1.1, 0); b(0.7, 0.6, 0.7, 0, 1.45, -1.15); b(0.3, 0.2, 0.3, 0, 1.3, -1.55).material = new THREE.MeshLambertMaterial({ color: 0x151008 });
  b(0.9, 0.5, 0.8, 0, 1.55, -0.5); b(0.14, 0.2, 0.1, -0.25, 1.85, -1.1); b(0.14, 0.2, 0.1, 0.25, 1.85, -1.1);
  g.userData.legs = [];
  for (const [x, z] of [[-0.4, -0.7], [0.4, -0.7], [-0.4, 0.7], [0.4, 0.7]]) {
    const lg = new THREE.Group(); lg.position.set(x, 0.7, z);
    const lm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), m); lm.position.y = -0.35; lg.add(lm); g.add(lg); g.userData.legs.push(lg);
  }
  return g;
}

// Змеи: медленно ползают, кусают (урон + яд), если подойти близко
export class SnakeSim {
  constructor(id, x, z, W) { this.id = id; this.x = x; this.z = z; this.W = W; this.y = W.height(x, z); this.yaw = Math.random() * 6.28; this.wt = 0; this.cd = 0; }
  update(dt, targets) {
    this.cd -= dt; this.wt -= dt; let hit = null;
    for (const t of targets) { const d = Math.hypot(t.x - this.x, t.z - this.z); if (d < 1.3 && this.cd <= 0) { hit = t; this.cd = 2.5; } }
    if (this.wt <= 0) { this.wt = 2 + Math.random() * 4; this.yaw += (Math.random() - 0.5) * 3; }
    const nx = this.x - Math.sin(this.yaw) * 0.9 * dt, nz = this.z - Math.cos(this.yaw) * 0.9 * dt, ny = this.W.height(nx, nz), hz = this.W.hazardAt(nx, nz, 2);
    if (!hz && Math.abs(ny - this.y) < 0.2) { this.x = nx; this.z = nz; this.y = ny; } else this.yaw += 2;
    return hit ? hit.id : null;
  }
}
export function createSnakeMesh() {
  const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0x6b8e23 }), segs = [];
  for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.25), i === 0 ? new THREE.MeshLambertMaterial({ color: 0x3d5a12 }) : m); s.position.set(0, 0.06, i * 0.22); g.add(s); segs.push(s); }
  g.userData.segs = segs; return g;
}
