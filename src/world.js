// Процедурный мир: единая детерминированная функция высоты height(x,z) по seed.
// Маршрут идёт от старта (z=+880) к шоссе Route 65 (z=-880). Размер карты 2000x2000 м.
import * as THREE from 'three';
import { Noise, mulberry32, smoothstep, lerp } from './utils.js';

export const HALF = 1000, CHUNK = 100;
export const routeX = (z) => 140 * Math.sin(z / 260) + 70 * Math.sin(z / 110 + 1.3);
export const RAVINES = [{ z: 140, w: 2.2, d: 24 }, { z: -120, w: 2.3, d: 26 }];
export const CPS = [880, 560, -330, -745].map((z, i) => ({ z, x: routeX(z), name: ['Стартовый лагерь', 'Опушка леса', 'Выход из каньона', 'Край болота'][i] }));
export const FINISH_Z = -875;
export const RAMPS = [{ z: 700, len: 12, h: 1.8 }, { z: 450, len: 12, h: 1.8 }, { z: 156, len: 12, h: 2.2 }, { z: -103, len: 12, h: 2.4 }, { z: -250, len: 10, h: 1.5 }]; // трамплины (едем в сторону -Z)
export const stationPos = (cp) => [cp.x + 24, cp.z + 10]; // АЗС: могилы павших игроков
export const biomeAt = (z) => (z > 830 ? 'Стартовый лагерь' : z > 320 ? 'Лесная чаща' : z > -300 ? 'Каньон' : z > -790 ? 'Болото' : 'Route 65');

export function createWorld(seed) {
  const n1 = new Noise(seed), n2 = new Noise((seed ^ 0x5bd1e995) >>> 0);
  const prof = (z) => 6 + 10 * Math.sin(z / 150) + 5 * Math.sin(z / 47 + 2);
  const swampK = (z) => smoothstep(-300, -360, z) * smoothstep(-790, -740, z);
  const canK = (z) => 1 - smoothstep(300, 360, Math.abs(z));

  function baseHeight(x, z) {
    const d = Math.abs(x - routeX(z));
    let h = n1.fbm(x / 320, z / 320, 4) * 40 + n2.fbm(x / 70, z / 70, 3) * 4;
    h += canK(z) * smoothstep(50, 140, d) * (32 + n2.fbm(x / 40, z / 40, 2) * 10);   // стены каньона
    const sw = swampK(z);
    h = lerp(h, -1 + n2.fbm(x / 25, z / 25, 2) * 1.2, sw * 0.9);                      // болото
    const rh = lerp(prof(z), 0.4, sw) + n2.fbm(x / 12, z / 12, 2) * 0.4;
    h = lerp(h, rh, smoothstep(34, 6, d));                                            // дорога
    h = lerp(h, prof(880), smoothstep(60, 25, Math.hypot(x - routeX(880), z - 880))); // лагерь
    for (const r of RAMPS) { const t = (r.z - z) / r.len; if (t > 0 && t < 1) h += r.h * t * smoothstep(6, 3.5, d); }   // трамплины
    for (const r of RAVINES) h -= r.d * smoothstep(r.w + 1.2, r.w - 1.2, Math.abs(z - r.z)) * smoothstep(260, 200, d); // овраги
    h = lerp(h, 3, smoothstep(-790, -830, z));                                        // шоссе
    h += smoothstep(940, 990, Math.max(Math.abs(x), Math.abs(z))) * 60;               // края карты
    return h;
  }
  // лава (каньон) и водоёмы (болото): вдавливаем рельеф и кладём плоскость поверхности
  const pools = [], rpool = mulberry32((seed * 97 + 13) >>> 0);
  const tryPool = (k, zmin, zmax, dmin, dmax, rmin, rmax) => {
    for (let t = 0; t < 40; t++) {
      const z = lerp(zmin, zmax, rpool()), x = routeX(z) + (rpool() < 0.5 ? -1 : 1) * lerp(dmin, dmax, rpool()), r = lerp(rmin, rmax, rpool());
      if (RAVINES.some((q) => Math.abs(z - q.z) < r + 14) || pools.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 12)) continue;
      pools.push({ k, x, z, r, y: baseHeight(x, z) }); return;
    }
  };
  for (let i = 0; i < 8; i++) tryPool('lava', 280, -280, 16, 80, 5, 9);
  tryPool('lava', 240, 20, 10, 12, 3.5, 4.5); tryPool('lava', -20, -260, 10, 12, 3.5, 4.5);
  for (let i = 0; i < 6; i++) tryPool('water', -340, -750, 18, 130, 6, 12);
  const inPool = (x, z, m = 3) => pools.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + m);
  const hazardAt = (x, z, extra = 0) => { for (const p of pools) if (Math.hypot(p.x - x, p.z - z) < p.r + extra) return p; return null; };
  function height(x, z) {
    let h = baseHeight(x, z);
    for (const p of pools) { const dd = Math.hypot(x - p.x, z - p.z); if (dd < p.r + 4) h = lerp(h, p.y - (p.k === 'water' ? 3 : 1), smoothstep(p.r + 4, p.r, dd)); }
    return h;
  }
  function ramp(x, z) { const d = Math.abs(x - routeX(z)); for (const r of RAMPS) { const t = (r.z - z) / r.len; if (t > 0 && t < 1) return smoothstep(6, 3.5, d); } return 0; }
  function mud(x, z) {
    const d = Math.abs(x - routeX(z));
    if (swampK(z) > 0.5) return n1.fbm(x / 22, z / 22, 2) > -0.05 || d < 12 ? 1 : 0;
    if (z > 320 && z < 820 && d < 90 && n2.fbm(x / 16, z / 16, 2) > 0.28) return 1;
    return 0;
  }

  // ---- препятствия ----
  const obs = [], grid = new Map(), rng = mulberry32((seed * 2654435761) >>> 0);
  const ck = (cx, cz) => (cx + 60) * 200 + (cz + 60);
  function add(o) {
    o.id = obs.length; if (o.y === undefined) o.y = height(o.x, o.z);
    obs.push(o); const key = ck(Math.floor(o.x / 40), Math.floor(o.z / 40));
    if (!grid.has(key)) grid.set(key, []); grid.get(key).push(o); return o;
  }
  const farFromCamp = (x, z) => Math.hypot(x - routeX(880), z - 880) > 45;
  for (let i = 0; i < 1800; i++) { // лес
    const z = lerp(830, 320, rng()), x = routeX(z) + (rng() * 2 - 1) * 230;
    if (Math.abs(x - routeX(z)) < 9 || mud(x, z) || !farFromCamp(x, z)) continue;
    add({ k: 'tree', x, z, r: 0.45 + rng() * 0.25, h: 7 + rng() * 6 });
  }
  for (let i = 0; i < 28; i++) { // поваленные брёвна
    const z = lerp(800, 340, rng()), x = routeX(z) + (rng() < 0.5 ? (rng() - 0.5) * 6 : (rng() - 0.5) * 80);
    add({ k: 'log', x, z, yaw: rng() * Math.PI, len: 7, r: 0.5 });
  }
  for (let i = 0; i < 260; i++) { // валуны (каньон + немного везде)
    const inC = i < 220, z = inC ? lerp(310, -310, rng()) : lerp(830, -800, rng());
    const x = routeX(z) + (rng() * 2 - 1) * (inC ? 130 : 200), d = Math.abs(x - routeX(z));
    if ((d < 5 && rng() < 0.7) || !farFromCamp(x, z) || mud(x, z) || inPool(x, z, 3)) continue;
    add({ k: 'rock', x, z, r: 0.8 + rng() * 1.8 });
  }
  for (let i = 0; i < 130; i++) { // мёртвые деревья в болоте
    const z = lerp(-320, -750, rng()), x = routeX(z) + (rng() * 2 - 1) * 200;
    if (Math.abs(x - routeX(z)) < 9 || inPool(x, z, 3)) continue;
    add({ k: 'dead', x, z, r: 0.35, h: 6 + rng() * 3 });
  }
  const anchorsAt = [];
  for (const r of RAVINES) for (const s of [-1, 1]) anchorsAt.push([routeX(r.z + s * (r.w + 7)) + 5, r.z + s * (r.w + 7)]);
  for (let z = -330; z > -780; z -= 60) anchorsAt.push([routeX(z) + (rng() < 0.5 ? -9 : 9), z]);
  for (const [x, z] of anchorsAt) add({ k: 'post', x, z, r: 0.25, h: 2.6 });
  for (const r of RAVINES) for (const s of [-1, 1]) add({ k: 'pole', x: routeX(r.z) + 3.5, z: r.z + s * 5.6, r: 0.3, h: 11 }); // высокие столбы для тарзанки
  { // остатки моста через второй овраг (консоль 3 м с ближней стороны)
    const r = RAVINES[1], zc = r.z + 3.0;
    for (const dx of [-1.3, 1.3]) add({ k: 'bridge', x: routeX(zc) + dx, z: zc, y: height(routeX(zc) + dx, r.z + 5) + 0.07, hx: 0.35, hy: 0.07, hz: 1.5 });
  }
  // декор без физики: кусты, папоротники, цветы, камыш, кактусы
  const deco = [], drng = mulberry32((seed * 40503) >>> 0);
  const dec = (k, x, z, s, c = 0) => deco.push({ k, x, z, y: height(x, z), s, c });
  for (let i = 0; i < 2600; i++) {
    const z = lerp(880, 320, drng()), x = routeX(z) + (drng() * 2 - 1) * 240;
    if (Math.abs(x - routeX(z)) < 4 || mud(x, z)) continue;
    dec(drng() < 0.65 ? 'bush' : 'fern', x, z, 0.5 + drng() * 0.9);
  }
  for (let i = 0; i < 700; i++) {
    const z = lerp(890, 330, drng()), x = routeX(z) + (drng() * 2 - 1) * 120;
    if (Math.abs(x - routeX(z)) < 3 || mud(x, z)) continue;
    dec('flower', x, z, 0.5 + drng() * 0.6, (drng() * 4) | 0);
  }
  for (let i = 0; i < 1100; i++) {
    const z = lerp(-310, -780, drng()), x = routeX(z) + (drng() * 2 - 1) * 220;
    if (Math.abs(x - routeX(z)) < 5) continue;
    dec('reed', x, z, 0.8 + drng() * 1.2);
  }
  for (let i = 0; i < 700; i++) {
    const z = lerp(310, -310, drng()), x = routeX(z) + (drng() * 2 - 1) * 160;
    if (Math.abs(x - routeX(z)) < 4) continue;
    dec(i < 640 ? 'shrub' : 'cactus', x, z, 0.5 + drng() * 0.9);
  }
  function near(x, z, r) {
    const out = [];
    for (let cx = Math.floor((x - r) / 40); cx <= Math.floor((x + r) / 40); cx++)
      for (let cz = Math.floor((z - r) / 40); cz <= Math.floor((z + r) / 40); cz++) { const l = grid.get(ck(cx, cz)); if (l) out.push(...l); }
    return out;
  }
  function nearAnchor(x, z, r) {
    let best = null, bd = r;
    for (const o of near(x, z, r + 2)) { if (o.k !== 'tree' && o.k !== 'dead' && o.k !== 'post' && o.k !== 'pole') continue; const d = Math.hypot(o.x - x, o.z - z) - o.r; if (d < bd) { bd = d; best = o; } }
    return best;
  }
  // кассеты (71), шляпы (6), гольф
  const prng = mulberry32((seed * 7919) >>> 0), tapes = [], cloth = [];
  const spot = (f, spread) => {
    const zf = lerp(870, -850, f);
    for (let t = 0; t < 14; t++) {
      const z = zf + (prng() - 0.5) * 12, x = routeX(z) + (prng() < 0.5 ? -1 : 1) * (6 + prng() * spread);
      if (RAVINES.some((q) => Math.abs(z - q.z) < 12) || inPool(x, z, 5) || (mud(x, z) && t < 13)) continue;
      return [x, z];
    }
    return [routeX(zf) + 8, zf];
  };
  for (let i = 0; i < 71; i++) { const [x, z] = spot((i + 0.5) / 71, 70); tapes.push({ id: i, x, z, y: height(x, z) }); }
  [0.08, 0.22, 0.38, 0.55, 0.72, 0.88].forEach((f, i) => { const [x, z] = spot(f, 40); cloth.push({ id: i, hat: 4 + i, x, z, y: height(x, z) }); });
  const gcx = routeX(880), golf = { tee: [gcx + 40, 855], hole: [gcx + 95, 840] };
  return { seed, height, mud, ramp, hazardAt, pools, obs, deco, near, nearAnchor, tapes, cloth, golf };
}

// ---------------- визуализация ----------------
const COL = { grass: new THREE.Color(0x4f7a3a), grass2: new THREE.Color(0x3f6a30), sand: new THREE.Color(0xb08a5c), rock: new THREE.Color(0x7a746a), swamp: new THREE.Color(0x4d5a35), mud: new THREE.Color(0x4a3626), road: new THREE.Color(0xa88a60), asph: new THREE.Color(0x38393c), camp: new THREE.Color(0x8d9360), red: new THREE.Color(0xa0603a), ramp: new THREE.Color(0x8a5a2b) };

export class TerrainView {
  constructor(scene, W) {
    this.scene = scene; this.W = W; this.chunks = new Map(); this.n = new Noise(7);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  }
  color(x, z, h, slope, out) {
    const W = this.W, d = Math.abs(x - routeX(z)), m = W.mud(x, z);
    let c;
    if (Math.abs(z + 880) < 9) c = COL.asph;
    else if (m) c = COL.mud;
    else if (W.ramp(x, z) > 0.2) c = COL.ramp;
    else if (d < 5 && z < 830 && z > -830) c = COL.road;
    else if (z > -300 && z <= 320) { // каньон: слои породы по высоте
      out.copy(COL.sand).lerp(COL.red, (Math.sin(h * 0.55) * 0.5 + 0.5) * 0.7); out.offsetHSL(0, 0, this.n.v(x / 6, z / 6) * 0.05); return;
    }
    else if (slope > 0.95) c = COL.rock;
    else if (z > 830) c = COL.camp;
    else if (z > 320) c = this.n.v(x / 30, z / 30) > 0 ? COL.grass : COL.grass2;
    else if (z > -790) c = COL.swamp;
    else c = COL.grass;
    out.copy(c).offsetHSL(0, 0, this.n.v(x / 6, z / 6) * 0.05);
  }
  build(i, j) {
    const S = 50, n = S + 1, step = CHUNK / S, W = this.W, pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), c = new THREE.Color();
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const x = i * CHUNK + a * step, z = j * CHUNK + b * step, h = W.height(x, z), k = (a * n + b) * 3;
      const slope = Math.hypot(W.height(x + 2, z) - h, W.height(x, z + 2) - h) / 2;
      pos[k] = x; pos[k + 1] = h; pos[k + 2] = z; this.color(x, z, h, slope, c); col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
    const idx = [];
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) { const v0 = a * n + b, v1 = v0 + 1, v2 = (a + 1) * n + b, v3 = v2 + 1; idx.push(v0, v1, v2, v2, v1, v3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.mat); this.scene.add(m); return m;
  }
  update(px, pz, R = 4) {
    const ci = Math.floor(px / CHUNK), cj = Math.floor(pz / CHUNK), want = [];
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { const i = ci + a, j = cj + b; if (i < -10 || i > 9 || j < -10 || j > 9) continue; want.push([a * a + b * b, i, j]); }
    want.sort((p, q) => p[0] - q[0]);
    const keys = new Set(want.map((w) => w[1] + ',' + w[2]));
    let made = 0;
    for (const [, i, j] of want) { const k = i + ',' + j; if (!this.chunks.has(k) && made < 2) { this.chunks.set(k, this.build(i, j)); made++; } }
    for (const [k, m] of this.chunks) if (!keys.has(k)) { this.scene.remove(m); m.geometry.dispose(); this.chunks.delete(k); }
  }
}

export function buildStatics(scene, W) {
  const d = new THREE.Object3D(), Lw = () => new THREE.MeshLambertMaterial({ color: 0xffffff }), L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const by = (k) => W.obs.filter((o) => o.k === k), dc = (k) => W.deco.filter((o) => o.k === k);
  const hsl = (h, s, l) => new THREE.Color().setHSL(h, s, l);
  const inst = (geo, mat, list, fn, colorFn) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((o, i) => { d.position.set(0, 0, 0); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); fn(o, d); d.updateMatrix(); m.setMatrixAt(i, d.matrix); if (colorFn) m.setColorAt(i, colorFn(o)); });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false; scene.add(m);
  };
  const trees = by('tree');
  inst(new THREE.CylinderGeometry(0.35, 0.5, 1, 6), L(0x5b3d22), trees, (o, d) => { d.position.set(o.x, o.y + o.h * 0.35, o.z); d.scale.set(o.r / 0.5, o.h * 0.7, o.r / 0.5); });
  const fol = () => hsl(0.27 + Math.random() * 0.07, 0.45, 0.17 + Math.random() * 0.1);
  inst(new THREE.ConeGeometry(1, 1, 7), Lw(), trees, (o, d) => { d.position.set(o.x, o.y + o.h * 0.6, o.z); d.scale.set(o.h * 0.3, o.h * 0.55, o.h * 0.3); }, fol);
  inst(new THREE.ConeGeometry(1, 1, 7), Lw(), trees, (o, d) => { d.position.set(o.x, o.y + o.h * 0.85, o.z); d.scale.set(o.h * 0.22, o.h * 0.45, o.h * 0.22); }, fol);
  inst(new THREE.CylinderGeometry(0.2, 0.5, 1, 5), L(0x4a4338), by('dead'), (o, d) => { d.position.set(o.x, o.y + o.h / 2, o.z); d.scale.set(o.r / 0.5, o.h, o.r / 0.5); });
  inst(new THREE.BoxGeometry(1, 1, 1), L(0x7b5330), by('post'), (o, d) => { d.position.set(o.x, o.y + o.h / 2, o.z); d.scale.set(0.5, o.h, 0.5); });
  inst(new THREE.CylinderGeometry(0.25, 0.35, 1, 8), L(0x6b4a2a), by('pole'), (o, d) => { d.position.set(o.x, o.y + o.h / 2, o.z); d.scale.set(1, o.h, 1); });
  inst(new THREE.BoxGeometry(1, 1, 1), L(0xff2d2d), by('pole'), (o, d) => { d.position.set(o.x, o.y + o.h - 0.4, o.z); d.scale.set(0.7, 0.5, 0.7); });
  inst(new THREE.BoxGeometry(1, 1, 1), L(0xff6a00), by('post'), (o, d) => { d.position.set(o.x, o.y + o.h + 0.1, o.z); d.scale.set(0.58, 0.22, 0.58); });   // оранжевая «шапка» — крепление для троса
  inst(new THREE.IcosahedronGeometry(1, 0), Lw(), by('rock'), (o, d) => { d.position.set(o.x, o.y + o.r * 0.2, o.z); d.scale.set(o.r, o.r * 0.8, o.r * 1.1); d.rotation.set(o.x, o.z, 0); }, () => hsl(0.07 + Math.random() * 0.03, 0.12, 0.38 + Math.random() * 0.15));
  inst(new THREE.CylinderGeometry(1, 1, 1, 8).rotateZ(Math.PI / 2), L(0x5a4026), by('log'), (o, d) => { d.position.set(o.x, o.y + o.r, o.z); d.rotation.y = o.yaw; d.scale.set(o.len, o.r, o.r); });
  for (const o of by('bridge')) { const m = new THREE.Mesh(new THREE.BoxGeometry(o.hx * 2, o.hy * 2, o.hz * 2), L(0x9a6a35)); m.position.set(o.x, o.y, o.z); scene.add(m); }
  // декор
  inst(new THREE.IcosahedronGeometry(1, 0), Lw(), dc('bush'), (o, d) => { d.position.set(o.x, o.y + o.s * 0.45, o.z); d.scale.set(o.s, o.s * 0.75, o.s); }, () => hsl(0.25 + Math.random() * 0.08, 0.5, 0.2 + Math.random() * 0.1));
  inst(new THREE.ConeGeometry(0.5, 1, 5), Lw(), dc('fern'), (o, d) => { d.position.set(o.x, o.y + o.s * 0.3, o.z); d.scale.set(o.s, o.s * 0.7, o.s); }, () => hsl(0.3, 0.55, 0.3 + Math.random() * 0.1));
  const fc = [0xffe14d, 0xff6b9a, 0xffffff, 0xb36bff];
  inst(new THREE.SphereGeometry(0.1, 5, 4), Lw(), dc('flower'), (o, d) => { d.position.set(o.x, o.y + 0.25 * o.s + 0.1, o.z); d.scale.setScalar(o.s); }, (o) => new THREE.Color(fc[o.c]));
  inst(new THREE.ConeGeometry(0.07, 1, 4), Lw(), dc('reed'), (o, d) => { d.position.set(o.x, o.y + o.s * 0.5, o.z); d.scale.set(1, o.s * 1.6, 1); }, () => hsl(0.14 + Math.random() * 0.05, 0.4, 0.3));
  inst(new THREE.IcosahedronGeometry(1, 0), Lw(), dc('shrub'), (o, d) => { d.position.set(o.x, o.y + o.s * 0.25, o.z); d.scale.set(o.s * 0.7, o.s * 0.4, o.s * 0.7); }, () => hsl(0.12, 0.35, 0.28 + Math.random() * 0.1));
  const cac = dc('cactus');
  inst(new THREE.CylinderGeometry(0.22, 0.28, 1, 8), L(0x3f7a4a), cac, (o, d) => { d.position.set(o.x, o.y + o.s * 1.1, o.z); d.scale.set(o.s, o.s * 2.2, o.s); });
  inst(new THREE.CylinderGeometry(0.14, 0.14, 1, 6), L(0x3f7a4a), cac, (o, d) => { d.position.set(o.x + 0.4 * o.s, o.y + o.s * 1.3, o.z); d.scale.set(o.s, o.s * 0.9, o.s); });
}

function sign(text, w = 14, h = 2, bg = '#1b5e20') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 512, 64); x.fillStyle = '#fff'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.fillText(text, 256, 44);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.DoubleSide }));
}
export function buildLandmarks(scene, W) {
  const L = (c) => new THREE.MeshLambertMaterial({ color: c }), Bm = (c) => new THREE.MeshBasicMaterial({ color: c }), wood = L(0x6b4a2a);
  const put = (geo, mat, x, z, dy = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, W.height(x, z) + dy, z); scene.add(m); return m; };
  CPS.slice(0, 4).forEach((cp, i) => {
    const y = W.height(cp.x, cp.z), g = new THREE.Group(); g.position.set(cp.x, y, cp.z);
    for (const s of [-8, 8]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), wood); p.position.set(s, 3.5, 0); g.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(17, 0.5, 0.5), wood); beam.position.y = 7; g.add(beam);
    const sg = sign(i === 0 ? 'ЛАГЕРЬ — СТАРТ' : 'ЧЕКПОИНТ ' + i + ': ' + cp.name); sg.position.y = 5.8; g.add(sg); scene.add(g);
  });
  const fx = routeX(-870), fy = W.height(fx, -870), f = new THREE.Group(); f.position.set(fx, fy, -870);
  for (const s of [-12, 12]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 10, 0.8), wood); p.position.set(s, 5, 0); f.add(p); }
  const sg = sign('ROUTE 65 — ФИНИШ!', 26, 3); sg.position.y = 9; f.add(sg); scene.add(f);

  // ---- стартовый лагерь ----
  const cx = routeX(880), cz = 880;
  for (const [dx, dz, c] of [[14, -6, 0xd9822b], [19, 3, 0x3f7fbf], [-18, -9, 0x7a9a3a]]) { const t = put(new THREE.ConeGeometry(2.4, 2.4, 4), L(c), cx + dx, cz + dz, 1.2); t.rotation.y = Math.PI / 4; }
  const fx2 = cx - 14, fz2 = cz + 7;
  for (let i = 0; i < 6; i++) { const lg = put(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6).rotateZ(Math.PI / 2), L(0x4a3320), fx2, fz2, 0.15); lg.rotation.y = (i * Math.PI) / 3; }
  put(new THREE.ConeGeometry(0.45, 1.1, 7), Bm(0xff6a00), fx2, fz2, 0.75); put(new THREE.ConeGeometry(0.25, 0.65, 6), Bm(0xffd54a), fx2, fz2, 0.55);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; put(new THREE.IcosahedronGeometry(0.22, 0), L(0x777777), fx2 + Math.cos(a) * 1.1, fz2 + Math.sin(a) * 1.1, 0.1); }
  put(new THREE.BoxGeometry(2.2, 0.1, 0.9), wood, cx + 10, cz + 9, 0.8); for (const dz of [-0.9, 0.9]) put(new THREE.BoxGeometry(2.2, 0.08, 0.3), wood, cx + 10, cz + 9 + dz, 0.45);
  for (const [dx, dz] of [[-12, 12], [-11, 13.2], [-13, 13]]) put(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 10), L(0xa32121), cx + dx, cz + dz, 0.45);
  const cab = put(new THREE.BoxGeometry(6, 3, 5), L(0x8a5a2b), cx + 34, cz - 14, 1.5); const roof = put(new THREE.ConeGeometry(5.2, 2, 4), L(0x5a3a1e), cx + 34, cz - 14, 4); roof.rotation.y = Math.PI / 4;
  put(new THREE.BoxGeometry(1, 2, 0.1), L(0x2b1c10), cx + 34, cz - 11.5, 1); put(new THREE.BoxGeometry(1.2, 0.9, 0.1), L(0xffe9a8), cx + 36.5, cz - 11.5, 1.8);
  for (const s of [-1, 1]) put(new THREE.BoxGeometry(0.2, 3, 0.2), wood, cx + s * 4 - 6, cz - 22, 1.5);
  const ws = sign('Route 65 — 1.8 км на юг. Удачи!', 8, 1); ws.position.set(cx - 6, W.height(cx - 6, cz - 22) + 2.6, cz - 22); scene.add(ws);

  // ---- знаки перед оврагами ----
  for (const r of RAVINES) {
    const z = r.z + 16, x = routeX(z) + 5;
    put(new THREE.BoxGeometry(0.15, 2.4, 0.15), wood, x, z, 1.2);
    const sgn = sign('⚠ ОБРЫВ! Нужен мост', 6, 0.8, '#b71c1c'); sgn.position.set(x, W.height(x, z) + 2.3, z); scene.add(sgn);
  }
  // ---- болотная вода ----
  const water = new THREE.Mesh(new THREE.PlaneGeometry(800, 520).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x35503f, transparent: true, opacity: 0.75 }));
  water.position.set(0, -1.15, -545); scene.add(water);

  // ---- шоссе Route 65 ----
  const hy = 3.04, dash = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 0.03, 0.3), Bm(0xf2c200), 50), d = new THREE.Object3D();
  for (let i = 0; i < 50; i++) { d.position.set(-300 + i * 12, hy, -880); d.updateMatrix(); dash.setMatrixAt(i, d.matrix); }
  dash.frustumCulled = false; scene.add(dash);
  const rail = L(0xb0b4b8);
  for (const z of [-870.3, -889.7]) { const r = new THREE.Mesh(new THREE.BoxGeometry(700, 0.25, 0.08), rail); r.position.set(0, 3.6, z); scene.add(r); }
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), rail, 140);
  for (let i = 0; i < 70; i++) for (let k = 0; k < 2; k++) { d.position.set(-345 + i * 10, 3.4, k ? -889.7 : -870.3); d.updateMatrix(); posts.setMatrixAt(i * 2 + k, d.matrix); }
  posts.frustumCulled = false; scene.add(posts);
  for (let x = -300; x <= 300; x += 60) { const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7, 6), L(0x555555)); lp.position.set(x, 6.5, -891); scene.add(lp); const lh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.4), Bm(0xfff2b0)); lh.position.set(x, 10, -890.2); scene.add(lh); }
  const car = (x, z, c) => { const g = new THREE.Group(); const b1 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 1.8), L(c)); b1.position.y = 0.8; const b2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.6), L(0x8fb7d8)); b2.position.set(-0.2, 1.65, 0); g.add(b1, b2); for (const wx of [-1.3, 1.3]) for (const wz of [-0.9, 0.9]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12).rotateX(Math.PI / 2), L(0x111111)); w.position.set(wx, 0.4, wz); g.add(w); } g.position.set(x, 3, z); scene.add(g); };
  car(-60, -886, 0xc0392b); car(40, -874, 0x2e86c1); car(110, -887, 0xf1c40f);
  const bb = sign('ROUTE 65 — ДОБРО ПОЖАЛОВАТЬ', 20, 3); bb.position.set(fx + 40, 9, -895); scene.add(bb);

  // ---- АЗС у каждого чекпоинта (здесь стоят могилы павших) ----
  CPS.forEach((cp) => {
    const [sx, sz] = stationPos(cp), g = new THREE.Group(); g.position.set(sx, W.height(sx, sz), sz);
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    add(new THREE.BoxGeometry(12, 0.4, 7), L(0xd32f2f), 0, 5, 0);
    for (const [dx, dz] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) add(new THREE.BoxGeometry(0.4, 5, 0.4), L(0xdddddd), dx, 2.5, dz);
    for (const dx of [-2.5, 2.5]) { add(new THREE.BoxGeometry(0.7, 1.5, 0.6), L(0xc62828), dx, 0.75, 0); add(new THREE.BoxGeometry(0.5, 0.3, 0.05), Bm(0x66ff88), dx, 1.1, -0.33); }
    add(new THREE.BoxGeometry(9, 3.5, 5), L(0xe0d6b8), 13, 1.75, 0); add(new THREE.BoxGeometry(9.4, 0.3, 5.4), L(0x8d3a2b), 13, 3.65, 0);
    add(new THREE.BoxGeometry(1.2, 2.2, 0.1), L(0x2b1c10), 11, 1.1, -2.55); add(new THREE.BoxGeometry(2, 1.2, 0.1), L(0xbfe3ff), 15, 1.8, -2.55);
    const sg2 = sign('АЗС', 6, 1, '#c62828'); sg2.position.set(0, 6.1, -3.6); g.add(sg2);
    const gs = sign('Могилы: поднимите друга [E]', 7, 0.9, '#37474f'); gs.position.set(0, 2.4, 9); g.add(gs);
    for (const dx of [-3, 3]) add(new THREE.BoxGeometry(0.15, 2.4, 0.15), wood, dx, 1.2, 9);
    scene.add(g);
  });
  // ---- гольф: площадка, лунка с флажком ----
  const [tx, tz] = W.golf.tee, [hx, hz] = W.golf.hole;
  put(new THREE.BoxGeometry(1.4, 0.06, 1.4), L(0x2e7d32), tx, tz, 0.03);
  const hole = put(new THREE.CircleGeometry(0.28, 14).rotateX(-Math.PI / 2), Bm(0x050505), hx, hz, 0.04);
  put(new THREE.CylinderGeometry(0.02, 0.02, 2.6, 6), L(0xffffff), hx, hz, 1.3);
  put(new THREE.BoxGeometry(0.6, 0.35, 0.02), Bm(0xe53935), hx + 0.3, hz, 2.4);
  const gsn = sign('⛳ Гольф: клюшка + мяч, ударить [E]. Лунка → 55 м', 9, 0.9, '#2e7d32'); gsn.position.set(tx, W.height(tx, tz) + 2.4, tz + 2); scene.add(gsn);
  // ---- лава и вода ----
  for (const p of W.pools) {
    if (p.k === 'lava') { put(new THREE.CircleGeometry(p.r * 1.05, 28).rotateX(-Math.PI / 2), Bm(0xff4a00), p.x, p.z, 0).position.y = p.y - 0.45; put(new THREE.CircleGeometry(p.r * 0.6, 20).rotateX(-Math.PI / 2), Bm(0xffc21a), p.x, p.z, 0).position.y = p.y - 0.42; }
    else { const w2 = new THREE.Mesh(new THREE.CircleGeometry(p.r * 1.05, 28).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1f4a5c, transparent: true, opacity: 0.8 })); w2.position.set(p.x, p.y - 0.6, p.z); scene.add(w2); }
  }
}

// подбираемые коллекционные предметы: кассеты и шляпы (видимость и «покачивание» — во view)
export function buildPickups(scene, W) {
  const L = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o }), Bm = (c) => new THREE.MeshBasicMaterial({ color: c });
  const tapes = W.tapes.map((o) => {
    const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.32), L(0x222222)), new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.075, 0.2), Bm(0x66ff88)));
    g.position.set(o.x, o.y + 0.5, o.z); g.userData = { y0: o.y + 0.5, id: o.id }; scene.add(g); return g;
  });
  const cloth = W.cloth.map((o) => {
    const g = new THREE.Group(), c = new THREE.Color().setHSL(o.id / 6, 0.8, 0.55);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), L(c, { emissive: c.clone().multiplyScalar(0.35) })), new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.45), Bm(0xffffff)));
    g.position.set(o.x, o.y + 0.7, o.z); g.userData = { y0: o.y + 0.7, id: o.id }; scene.add(g); return g;
  });
  return { tapes, cloth };
}
