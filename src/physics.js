// Cannon-es: чанки хайтфилдов (1 м) вокруг игроков + статические препятствия рядом с ними.
import * as CANNON from 'cannon-es';
import { CHUNK } from './world.js';

export class Physics {
  constructor(W) {
    this.W = W; this.t = 0;
    const w = (this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) }));
    w.solver.iterations = 14; w.allowSleep = false;
    this.mats = { ground: new CANNON.Material('ground'), body: new CANNON.Material('body'), player: new CANNON.Material('player') };
    w.addContactMaterial(new CANNON.ContactMaterial(this.mats.ground, this.mats.body, { friction: 0.5, restitution: 0.02 }));
    w.addContactMaterial(new CANNON.ContactMaterial(this.mats.body, this.mats.body, { friction: 0.4, restitution: 0.02 }));
    // у игрока нулевое трение: скорость задаётся кодом, иначе земля «тормозит» его, и двигаться можно только в прыжке
    for (const m of [this.mats.ground, this.mats.body, this.mats.player]) w.addContactMaterial(new CANNON.ContactMaterial(this.mats.player, m, { friction: 0, restitution: 0 }));
    this.terr = new Map(); this.stat = new Map();
  }
  step(dt) { this.t += dt; this.world.step(1 / 60, dt, 4); }

  // points: [{x,z}] — вокруг них держим землю (3x3 чанка) и препятствия (R м)
  sync(points, R = 55) {
    const want = new Set(), ids = new Set();
    for (const p of points) {
      const ci = Math.floor(p.x / CHUNK), cj = Math.floor(p.z / CHUNK);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const i = ci + a, j = cj + b; if (i >= -10 && i <= 9 && j >= -10 && j <= 9) want.add(i + ',' + j); }
      for (const o of this.W.near(p.x, p.z, R)) ids.add(o.id);
    }
    for (const k of want) if (!this.terr.has(k)) this.makeChunk(k);
    for (const [k, b] of this.terr) if (!want.has(k)) { this.world.removeBody(b); this.terr.delete(k); }
    for (const id of ids) if (!this.stat.has(id)) this.makeStatic(this.W.obs[id]);
    for (const [id, b] of this.stat) if (!ids.has(id)) { this.world.removeBody(b); this.stat.delete(id); }
  }
  makeChunk(k) {
    const [i, j] = k.split(',').map(Number), N = CHUNK + 1, x0 = i * CHUNK, z0 = j * CHUNK, data = [];
    for (let a = 0; a < N; a++) { const col = []; for (let b = 0; b < N; b++) col.push(this.W.height(x0 + a, z0 + CHUNK - b)); data.push(col); }
    const body = new CANNON.Body({ mass: 0, material: this.mats.ground });
    body.addShape(new CANNON.Heightfield(data, { elementSize: 1 }));
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0); body.position.set(x0, 0, z0 + CHUNK);
    this.world.addBody(body); this.terr.set(k, body);
  }
  makeStatic(o) {
    const b = new CANNON.Body({ mass: 0, material: this.mats.body });
    if (o.k === 'rock') { b.addShape(new CANNON.Sphere(o.r * 0.85)); b.position.set(o.x, o.y + o.r * 0.2, o.z); }
    else if (o.k === 'log') { b.addShape(new CANNON.Box(new CANNON.Vec3(o.len / 2, o.r, o.r))); b.position.set(o.x, o.y + o.r, o.z); b.quaternion.setFromEuler(0, o.yaw, 0); }
    else if (o.k === 'bridge') { b.addShape(new CANNON.Box(new CANNON.Vec3(o.hx, o.hy, o.hz))); b.position.set(o.x, o.y, o.z); }
    else { const hw = o.k === 'post' ? 0.25 : o.r * 0.9; b.addShape(new CANNON.Box(new CANNON.Vec3(hw, o.h / 2, hw))); b.position.set(o.x, o.y + o.h / 2, o.z); }
    this.world.addBody(b); this.stat.set(o.id, b);
  }
}
