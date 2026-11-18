// Авторитетная симуляция (только у хоста): RV, игроки, предметы, звери, опасности, лебёдки, достижения.
import * as CANNON from 'cannon-es';
import { RVSim, DOOR, SEAT, GRILL, GRILL2, COFFEE, SMOKE, TAPE, WARD, SLOTS, MOUNTS, WHEELS, FLOOR_Y, GEAR_SEQ, FRIDGE } from './rv.js';
import { PlayerSim, HATS } from './player.js';
import { ITEMS, KINDS } from './items.js';
import { BearSim, SnakeSim } from './bears.js';
import { CPS, FINISH_Z, RAVINES, routeX, stationPos } from './world.js';
import { mulberry32, clamp, fwdOf } from './utils.js';
import { ACH } from './achievements.js';

const V3 = (x, y, z) => new CANNON.Vec3(x, y, z);
export const SIGNALS = ['Стой!', 'Цепляй трос!', 'Поехали!', 'Медведь!'];
const R = (v) => Math.round(v * 100) / 100, K = Object.fromEntries(KINDS.map((k, i) => [k, i]));
const ANCH = ['tree', 'dead', 'post', 'pole'];

export class Host {
  constructor(W, phys) {
    this.W = W; this.phys = phys; this.players = new Map(); this.items = []; this.bears = []; this.snakes = []; this.nid = 1; this.cp = 0; this.fin = false; this.focusT = -9; this.onChat = () => {};
    this.time = 60; this.fridge = 8; this.tapesGot = new Set(); this.clothGot = new Set(); this.hats = new Set([0, 1, 2, 3]); this.tapeNow = -1;
    this.stats = { dist: 0, time: 0, night: 0, tapes: 0, cloth: 0, meals: 0, coffee: 0, cig: 0, revive: 0, down: 0, winch: 0, tarzan: 0, safety: 0, bridge: 0, golf: 0, crash: 0, honk: 0, flip: 0, mud: 0, lava: 0, drown: 0, poison: 0, bear: 0, snake: 0, rock: 0, heli: 0, repair: 0, tire: 0, store: 0, cp: 0, finish: 0, fast: 0, nodeath: 0, fall: 0 };
    this.ach = new Set(); this.achV = 0; this.achT = 0; this.rocks = []; this.rockT = 8; this.heli = null; this.shells = []; this.expl = []; this.horn0 = 0; this.flipT = -99; this.lastHn = 0;
    const s = CPS[0]; phys.sync([{ x: s.x, z: s.z }]);
    this.rv = new RVSim(phys, s.x, W.height(s.x, s.z) + 2.6, s.z);
    this.spawnItems(); this.spawnBears(); this.spawnSnakes(); this.spawnGolf();
  }
  st(k, n = 1) { this.stats[k] += n; }

  // ---------- старт ----------
  spawnItems() {
    const W = this.W, rng = mulberry32(W.seed + 99), s = CPS[0], at = (z, dx) => [routeX(z) + dx, z];
    const put = (k, x, z) => this.spawnItem(k, x, W.height(x, z) + 1.2, z, rng() * 6.28);
    const camp = (k, n) => { for (let i = 0; i < n; i++) put(k, s.x - 9 + i * 1.2 + rng(), s.z - 4 + rng() * 3); };
    camp(K.plank, 4); camp(K.oil, 2); camp(K.kit, 3); camp(K.tire, 2); camp(K.patty, 3); camp(K.medkit, 2); camp(K.epipen, 1); camp(K.cola, 3); camp(K.antidote, 2); camp(K.tools, 1); camp(K.fuel, 2);
    for (const r of RAVINES) for (let i = 0; i < 3; i++) put(K.plank, ...at(r.z + 24 + i * 2, -4 + rng() * 3));
    for (const cp of CPS.slice(1)) { const [x, z] = [cp.x, cp.z]; put(K.oil, x - 3, z + 2); put(K.kit, x - 1, z + 3); put(K.tire, x + 1, z + 3); put(K.patty, x + 3, z + 2); put(K.medkit, x + 5, z + 3); put(K.cola, x + 6, z + 2); put(K.antidote, x - 5, z + 3); }
    const cyc = [K.kit, K.cola, K.tire, K.antidote, K.medkit, K.oil, K.patty, K.fuel];
    for (let z = 700; z > -700; z -= 90) put(cyc[(((z + 700) / 90) | 0) % cyc.length], ...at(z, 3 + rng() * 4));
  }
  spawnBears() {
    const rng = mulberry32(this.W.seed + 5), zs = [[820, 330, 4], [300, -300, 4], [-320, -760, 2]];
    let id = 0;
    for (const [a, b, n] of zs) for (let i = 0; i < n; i++) { const z = a + (b - a) * rng(), x = routeX(z) + (rng() < 0.5 ? -1 : 1) * (25 + rng() * 80); this.bears.push(new BearSim(id++, x, z, this.W)); }
  }
  spawnSnakes() {
    const rng = mulberry32(this.W.seed + 17); let id = 0;
    for (const [a, b, n] of [[290, -290, 8], [-320, -760, 6]]) for (let i = 0; i < n; i++) {
      for (let t = 0; t < 10; t++) { const z = a + (b - a) * rng(), x = routeX(z) + (rng() < 0.5 ? -1 : 1) * (8 + rng() * 70); if (this.W.hazardAt(x, z, 3)) continue; this.snakes.push(new SnakeSim(id++, x, z, this.W)); break; }
    }
  }
  spawnGolf() {
    const [tx, tz] = this.W.golf.tee, y = this.W.height(tx, tz);
    this.phys.sync([{ x: tx, z: tz }]);
    this.ball = this.spawnItem(K.golf, tx, y + 0.5, tz); this.spawnItem(K.club, tx + 1.2, y + 0.5, tz + 1);
  }
  spawnItem(k, x, y, z, yaw = 0) {
    const it = { id: this.nid++, k, st: 0, by: -1, slot: -1, lp: [0, 0, 0], cook: 0, body: null };
    this.makeBody(it, [x, y, z], yaw); this.items.push(it); return it;
  }
  makeBody(it, pos, yaw, vel) {
    const d = ITEMS[KINDS[it.k]], b = new CANNON.Body({ mass: d.m, material: this.phys.mats.body });
    b.addShape(it.k === K.golf ? new CANNON.Sphere(0.1) : new CANNON.Box(V3(...d.h))); b.position.set(...pos); b.quaternion.setFromEuler(0, yaw, 0);
    b.linearDamping = it.k === K.golf ? 0.25 : 0.2; b.angularDamping = 0.6; if (vel) b.velocity.set(...vel);
    this.phys.world.addBody(b); it.body = b; it.st = 0; it.slot = -1;
  }
  removeItem(it) { if (it.body) this.phys.world.removeBody(it.body); this.items.splice(this.items.indexOf(it), 1); }
  giveItem(p, k) { const it = { id: this.nid++, k, st: 2, by: p.id, slot: -1, lp: [0, 0, 0], cook: 0, body: null }; this.items.push(it); p.held = it.id; return it; }

  // ---------- игроки ----------
  focusAll(extra = []) {
    const pts = [{ x: this.rv.body.position.x, z: this.rv.body.position.z }, ...extra];
    for (const p of this.players.values()) if (!p.inRV) pts.push({ x: p.body.position.x, z: p.body.position.z });
    this.phys.sync(pts);
  }
  addPlayer(id, info) {
    const s = this.rv.body.position, n = this.players.size, x = s.x + 4 + n, z = s.z + 3;
    this.phys.sync([{ x, z }, { x: s.x, z: s.z }]);
    const p = new PlayerSim(this.phys, id, info, x, this.W.height(x, z) + 1.5, z); this.players.set(id, p); return p;
  }
  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    if (p.swing) this.endSwing(p, false);
    if (p.drive) { p.drive = false; this.rv.drv = -1; }
    if (p.held >= 0) this.drop(p); if (p.hook >= 0) this.stow(p);
    if (!p.inRV) this.phys.world.removeBody(p.body); this.players.delete(id);
  }
  setInput(id, inp) { const p = this.players.get(id); if (p) p.inp = inp; }
  note(p, m) { p.nt = m; p.nc++; }
  driver() { for (const p of this.players.values()) if (p.drive) return p; return null; }
  rvFwd() { return this.rv.body.quaternion.vmult(V3(0, 0, -1)); }
  rvYaw() { const f = this.rvFwd(); return Math.atan2(-f.x, -f.z); }
  pw(p) { if (p.inRV) { const w = this.rv.body.pointToWorldFrame(V3(p.lp[0], p.lp[1] + 1, p.lp[2])); return [w.x, w.y, w.z]; } const q = p.body.position; return [q.x, q.y, q.z]; }
  iw(it) {
    if (it.st === 0) { const q = it.body.position; return [q.x, q.y, q.z]; }
    if (it.st === 1) { const w = this.rv.body.pointToWorldFrame(V3(...it.lp)); return [w.x, w.y, w.z]; }
    const h = this.players.get(it.by); return h ? this.pw(h) : [0, 0, 0];
  }
  heldItem(p) { return p.held >= 0 ? this.items.find((i) => i.id === p.held) : null; }

  damage(p, n) {
    if (p.down) return; p.hp -= n;
    if (p.hp <= 0) {
      p.hp = 0; p.down = true; p.downT = 0; this.st('down');
      if (p.swing) this.endSwing(p, false);
      if (p.drive) { p.drive = false; this.rv.drv = -1; }
      if (p.held >= 0) this.drop(p); if (p.hook >= 0) this.stow(p);
      this.note(p, 'Вы упали! Ждите, пока вас поднимут.');
    }
  }
  poison(p) { if (p.pois <= 0) { this.st('poison'); this.note(p, '☠ Вы отравлены! Нужно противоядие.'); } p.pois = 12; }
  revive(p, hp) { p.down = false; p.dead = false; p.hp = hp; p.downT = 0; p.pois = 0; this.st('revive'); this.note(p, 'Вас подняли!'); }
  goDead(p) { // павший игрок попадает на могилу у АЗС последнего чекпоинта
    if (p.inRV) this.exit(p);
    const [sx, sz] = stationPos(CPS[this.cp]), ox = sx + (p.id % 4) * 1.6 - 2.4, oz = sz + 6;
    this.focusAll([{ x: ox, z: oz }]);
    p.body.position.set(ox, this.W.height(ox, oz) + 1, oz); p.body.velocity.set(0, 0, 0); p.dead = true;
    this.note(p, '☠ Вы погибли. Друзья могут воскресить вас у АЗС (могила).'); this.onChat('Система', '🪦 ' + p.name + ' лежит у АЗС — поднимите его!');
  }
  respawn(p) {
    const cp = CPS[this.cp]; if (p.inRV) this.exit(p); if (p.swing) this.endSwing(p, false);
    this.focusAll([{ x: cp.x, z: cp.z }]);
    p.body.position.set(cp.x + 3, this.W.height(cp.x + 3, cp.z) + 1.5, cp.z); p.body.velocity.set(0, 0, 0); p.hp = 60; p.down = false; p.dead = false; p.pois = 0;
  }

  // ---------- действия по E ----------
  actions(p) {
    const a = [], rv = this.rv, b = rv.body; if (p.down || p.drive || p.swing) return a;
    const pw = this.pw(p), held = this.heldItem(p), D = (x, y, z) => Math.hypot(pw[0] - x, pw[1] - y, pw[2] - z);
    if (!held && p.hook < 0) for (const it of this.items) {
      if (it.st === 2 || it.k === K.golf) continue;
      if (it.st === 1) { const outer = it.slot >= 6 || it.slot === -3; if (outer === p.inRV) continue; }
      const q = this.iw(it), d = D(q[0], q[1], q[2]), kd = ITEMS[KINDS[it.k]];
      if (d < (it.st === 1 && it.slot >= 6 ? 5 : kd.reach)) a.push({ d, text: '[E] Взять: ' + kd.n, run: () => this.pick(p, it) });
    }
    if (!p.inRV) {
      for (const t of this.W.tapes) { if (this.tapesGot.has(t.id)) continue; const d = Math.hypot(pw[0] - t.x, pw[2] - t.z); if (d < 2.6 && Math.abs(pw[1] - t.y) < 3.5) a.push({ d, text: '[E] Подобрать кассету №' + (t.id + 1) + ' (' + this.tapesGot.size + '/71)', run: () => { this.tapesGot.add(t.id); this.stats.tapes = this.tapesGot.size; this.note(p, '📼 Кассета №' + (t.id + 1) + ' найдена! Слушайте в магнитофоне (стол в салоне).'); } }); }
      for (const c of this.W.cloth) { if (this.clothGot.has(c.id)) continue; const d = Math.hypot(pw[0] - c.x, pw[2] - c.z); if (d < 2.6 && Math.abs(pw[1] - c.y) < 3.5) a.push({ d, text: '[E] Подобрать: ' + HATS[c.hat], run: () => { this.clothGot.add(c.id); this.hats.add(c.hat); this.stats.cloth = this.clothGot.size; this.note(p, '👒 Новая шляпа: ' + HATS[c.hat] + '. Переодевайтесь в шкафу автодома!'); } }); }
      if (!held && p.hook < 0) { const an = this.W.nearAnchor(pw[0], pw[2], 4); if (an && (an.k === 'tree' || an.k === 'dead' || an.k === 'pole') && an.h >= 6) a.push({ d: Math.hypot(pw[0] - an.x, pw[2] - an.z), text: '[E] Тарзанка: схватить лиану (прыжок — отпустить)', run: () => this.startSwing(p, an) }); }
    }
    if (held && held.k === K.club && this.ball && this.ball.st === 0) { const q = this.ball.body.position, d = Math.hypot(pw[0] - q.x, pw[2] - q.z); if (d < 2.8) a.push({ d, text: '[E] Ударить по мячу (целься выше — мяч выше)', run: () => this.strike(p) }); }
    for (let i = 0; i < 2; i++) {
      const w = rv.winch[i], m = rv.mountWorld(i), dm = D(m.x, m.y, m.z), nm = i ? 'заднюю' : 'переднюю';
      if (w.st === 0 && !held && p.hook < 0 && dm < 3.2) a.push({ d: dm, text: '[E] Взять крюк: ' + nm + ' лебёдку', run: () => { w.st = 1; w.by = p.id; p.hook = i; } });
      if (p.hook === i) {
        const an = this.W.nearAnchor(pw[0], pw[2], 3.3);
        if (an) a.push({ d: 0.5, text: '[E] Зацепить трос (' + (an.k === 'post' ? 'столб' : an.k === 'tree' ? 'дерево' : an.k === 'pole' ? 'опору' : 'ствол') + ')', run: () => this.attachAnchor(p, i, an) });
        else if (dm < 3.2) a.push({ d: dm, text: '[E] Смотать крюк', run: () => this.stow(p) });
        for (const o of this.players.values()) if (o !== p && !o.inRV) { const q = o.body.position, d = Math.hypot(pw[0] - q.x, pw[2] - q.z); if (d < 3.4) a.push({ d: d - 0.3, text: '[E] Пристегнуть трос к ' + o.name + ' (страховка)', run: () => this.attachPlayer(p, i, o) }); }
      }
      if (w.st === 2 && w.anchor && !held && p.hook < 0) { const da = D(w.anchor.x, w.anchor.y, w.anchor.z); if (da < 4) a.push({ d: da, text: '[E] Снять трос', run: () => { w.st = 1; w.by = p.id; w.anchor = null; w.ap = -1; p.hook = i; } }); }
    }
    if (p.inRV) {
      const L = p.lp, H2 = (t) => Math.hypot(L[0] - t[0], L[2] - t[2]);
      const df = H2(FRIDGE); if (!held && p.hook < 0 && this.fridge > 0 && df < 1.4) a.push({ d: df, text: '[E] Достать из холодильника (' + this.fridge + ')', run: () => { this.fridge--; this.giveItem(p, Math.random() < 0.7 ? K.patty : K.cola); } });
      const dc = H2(COFFEE); if (dc < 1.3) a.push({ d: dc, text: '[E] Выпить кофе (бесконечно) — ускорение', run: () => { p.boost = 20; this.st('coffee'); this.st('meals'); this.note(p, '☕ Бодрость! Бег быстрее 20 секунд'); } });
      const dq = H2(SMOKE); if (dq < 1.3) a.push({ d: dq, text: '[E] Закурить (бесконечно) — ускорение', run: () => { p.boost = 12; this.st('cig'); this.note(p, '🚬 Рывок! Бег быстрее 12 секунд'); } });
      const dt2 = H2(TAPE); if (dt2 < 1.3) a.push({ d: dt2, text: '[E] Магнитофон: ' + (this.tapesGot.size ? (this.tapeNow < 0 ? 'включить кассету' : 'следующая / выключить') : 'нет кассет'), run: () => this.nextTape(p) });
      const dw = H2(WARD); if (dw < 1.5 && this.hats.size > 1) { const nx = this.nextHat(p.hat); a.push({ d: dw, text: '[E] Переодеться: ' + HATS[nx], run: () => { p.hat = nx; } }); }
      const dl = H2(DOOR); if (dl < 1.5) a.push({ d: dl, text: '[E] Выйти наружу', run: () => this.exit(p) });
      const ds = H2(SEAT); if (!this.driver() && ds < 1.3) a.push({ d: ds, text: '[E] Сесть за руль', run: () => { p.drive = true; rv.drv = p.id; if (p.hook >= 0) this.stow(p); } });
    } else {
      const dw = b.pointToWorldFrame(V3(DOOR[0] + 0.6, DOOR[1], DOOR[2])), dd = Math.hypot(pw[0] - dw.x, pw[2] - dw.z);
      if (dd < 2.2 && !(held && held.k === K.plank)) a.push({ d: dd, text: '[E] Войти в автодом', run: () => this.enter(p) });
    }
    if (held && D(b.position.x, b.position.y, b.position.z) < 6.5) {
      if (held.k === K.kit && rv.hull < 100) a.push({ d: 0.3, text: '[E] Починить корпус (металлолом)', run: () => { rv.hull = Math.min(100, rv.hull + 35); this.st('repair'); this.consume(p, held); } });
      if (held.k === K.oil && rv.hp < 100) a.push({ d: 0.3, text: '[E] Залить масло в двигатель', run: () => { rv.hp = Math.min(100, rv.hp + 25); this.st('repair'); this.consume(p, held); } });
      if (held.k === K.tire || held.k === K.tools) for (let i = 0; i < 4; i++) if (!rv.wok[i]) { const w = b.pointToWorldFrame(V3(...WHEELS[i])), d = D(w.x, w.y, w.z); if (d < 3.2) a.push({ d, text: held.k === K.tire ? '[E] Заменить колесо' : '[E] Залатать колесо (инструменты)', run: () => { rv.wok[i] = 1; this.st('repair'); if (held.k === K.tire) { this.st('tire'); this.consume(p, held); } } }); }
    }
    for (const o of this.players.values()) if (o !== p && o.down && !o.inRV) { const q = o.body.position, d = D(q.x, q.y, q.z); if (d < 2.8) a.push({ d: d - 1, text: '[E] Поднять товарища' + (o.dead ? ' (с могилы)' : ''), run: () => this.revive(o, 30) }); }
    return a.sort((x, y) => x.d - y.d);
  }
  interact(p) { if (p.drive || p.down || p.swing) return; const a = this.actions(p)[0]; if (a) a.run(); }
  pick(p, it) {
    if (it.body) { this.phys.world.removeBody(it.body); it.body = null; }
    it.st = 2; it.by = p.id; it.slot = -1; it.cook = 0; p.held = it.id;
  }
  consume(p, it) { p.held = -1; this.removeItem(it); }
  stow(p) { const w = this.rv.winch[p.hook]; if (w) { w.st = 0; w.by = -1; w.anchor = null; w.ap = -1; } p.hook = -1; }
  attachAnchor(p, i, an) {
    const rv = this.rv, w = rv.winch[i]; w.anchor = { x: an.x, y: an.y + 1.2, z: an.z }; w.st = 2; w.by = -1; w.ap = -1; p.hook = -1; this.st('winch');
    const mm = rv.mountWorld(i); w.len = Math.hypot(w.anchor.x - mm.x, w.anchor.y - mm.y, w.anchor.z - mm.z) + 0.2;
  }
  attachPlayer(p, i, o) {
    const rv = this.rv, w = rv.winch[i], q = o.body.position, mm = rv.mountWorld(i);
    w.anchor = { x: q.x, y: q.y + 0.3, z: q.z }; w.st = 2; w.by = -1; w.ap = o.id; p.hook = -1; this.st('safety');
    w.len = Math.hypot(q.x - mm.x, q.y - mm.y, q.z - mm.z) + 0.5; this.note(o, '🪢 Вы пристёгнуты тросом к автодому');
  }
  throwHook(p) {
    if (p.hook < 0 || p.down) return;
    const pw = this.pw(p), ey = pw[1] + 0.6, cp = Math.cos(p.pitch), look = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
    let best = null, bd = 0.965;
    for (const o of this.W.near(pw[0], pw[2], 36)) {
      if (!ANCH.includes(o.k)) continue;
      const dx = o.x - pw[0], dy = o.y + 1.2 - ey, dz = o.z - pw[2], d = Math.hypot(dx, dy, dz); if (d > 32 || d < 1) continue;
      const dot = (dx * look[0] + dy * look[1] + dz * look[2]) / d; if (dot > bd) { bd = dot; best = o; }
    }
    if (best) { this.attachAnchor(p, p.hook, best); this.note(p, '🪝 Крюк заброшен!'); } else this.note(p, 'Мимо — цельтесь в дерево или столб (до 30 м)');
  }
  startSwing(p, an) {
    const top = [an.x, an.y + Math.min(an.h, 11) * 0.88, an.z], q = p.body.position, d = Math.hypot(q.x - top[0], q.y - top[1], q.z - top[2]);
    const ab = new CANNON.Body({ mass: 0 }); ab.position.set(...top); this.phys.world.addBody(ab);
    const con = new CANNON.DistanceConstraint(p.body, ab, Math.max(d, 5)); this.phys.world.addConstraint(con);
    p.swing = { con, ab, top, t: 0 }; this.st('tarzan');
  }
  endSwing(p, boost) {
    const s = p.swing; if (!s) return; this.phys.world.removeConstraint(s.con); this.phys.world.removeBody(s.ab); p.swing = null; p.prevVy = 0;
    if (boost) { p.body.velocity.y += 3; p.body.velocity.x *= 1.15; p.body.velocity.z *= 1.15; }
  }
  strike(p) {
    const b = this.ball.body, th = clamp(0.28 + p.pitch * 0.9, 0.12, 1.05), s = 26, [fx, fz] = fwdOf(p.yaw);
    b.velocity.set(fx * Math.cos(th) * s, Math.sin(th) * s, fz * Math.cos(th) * s);
  }
  nextTape(p) {
    const list = [...this.tapesGot].sort((a, b) => a - b); if (!list.length) { this.note(p, 'Нет кассет — ищите их на карте'); return; }
    const i = list.indexOf(this.tapeNow); this.tapeNow = this.tapeNow < 0 ? list[0] : i + 1 < list.length ? list[i + 1] : -1;
  }
  nextHat(cur) { const l = [...this.hats].sort((a, b) => a - b), i = l.indexOf(cur); return l[(i + 1) % l.length]; }
  enter(p) { p.inRV = true; p.lp = [DOOR[0] - 0.6, FLOOR_Y, DOOR[2]]; this.phys.world.removeBody(p.body); }
  exit(p) {
    const b = this.rv.body, w = b.pointToWorldFrame(V3(DOOR[0] + 1.5, DOOR[1] + 1.0, DOOR[2]));
    p.body.position.set(w.x, w.y, w.z); p.body.velocity.copy(b.velocity); this.phys.world.addBody(p.body); p.inRV = false; p.drive = false;
    if (this.rv.drv === p.id) this.rv.drv = -1;
  }
  drop(p) {
    const it = this.heldItem(p); if (!it) { if (p.hook >= 0) this.stow(p); return; }
    const kd = ITEMS[KINDS[it.k]], rv = this.rv; it.by = -1; p.held = -1;
    if (p.inRV) {
      if (it.k === K.plank || it.k === K.club) { p.held = it.id; it.by = p.id; this.note(p, 'Это не поместится в салоне — на крышу (у лестницы) или наружу'); return; }
      it.st = 1;
      if (it.k === K.patty && Math.hypot(p.lp[0] - GRILL[0], p.lp[2] - GRILL[2]) < 1.1) { it.slot = -2; it.lp = [GRILL[0], -0.37, GRILL[2]]; it.cook = 0; return; } // жарим на плите
      let best = -1, bd = 1.5;
      for (let s = 0; s < 6; s++) { if (this.items.some((o) => o.st === 1 && o.slot === s)) continue; const S = SLOTS[s], d = Math.hypot(p.lp[0] - S[0], p.lp[2] - S[2]); if (d < bd) { bd = d; best = s; } }
      if (best >= 0) { it.slot = best; it.lp = [...SLOTS[best]]; this.st('store'); } else { it.slot = -1; it.lp = [p.lp[0], FLOOR_Y + kd.h[1], p.lp[2]]; this.note(p, 'Предмет брошен на пол — при тряске вылетит!'); }
      return;
    }
    const q = p.body.position, rear = rv.body.pointToWorldFrame(V3(0, 0, 3.4)), g2 = rv.body.pointToWorldFrame(V3(...GRILL2));
    if (it.k === K.patty && Math.hypot(q.x - g2.x, q.z - g2.z) < 2.2) { it.st = 1; it.slot = -3; it.lp = [GRILL2[0], GRILL2[1] + 0.06, GRILL2[2]]; it.cook = 0; return; } // гриль снаружи
    if (Math.hypot(q.x - rear.x, q.z - rear.z) < 3.6) for (let s = 6; s < 10; s++) if (!this.items.some((o) => o.st === 1 && o.slot === s)) { it.st = 1; it.slot = s; it.lp = [...SLOTS[s]]; this.st('store'); return; }
    const [fx, fz] = fwdOf(p.yaw), off = kd.off || 0.8; if (it.k === K.plank) this.st('bridge');
    this.makeBody(it, [q.x + fx * off, q.y + 0.6, q.z + fz * off], p.yaw, [p.body.velocity.x + fx * 1.5, 0.5, p.body.velocity.z + fz * 1.5]);
  }
  use(p) {
    if (p.drive) { p.drive = false; this.rv.drv = -1; p.lp = [SEAT[0] + 0.9, FLOOR_Y, SEAT[2] + 0.8]; return; }
    const it = this.heldItem(p); if (!it) return; const kd = ITEMS[KINDS[it.k]];
    if (it.k === K.antidote) { p.pois = 0; this.consume(p, it); this.note(p, '💊 Яд снят'); return; }
    if (!kd.heal) return;
    const dn = [...this.players.values()].find((o) => o !== p && o.down && !o.inRV && Math.hypot(o.body.position.x - p.body.position.x, o.body.position.z - p.body.position.z) < 2.8);
    if (dn) { this.revive(dn, kd.heal + 20); this.consume(p, it); }
    else if (p.hp < 100) { p.hp = Math.min(100, p.hp + kd.heal); if (it.k === K.patty || it.k === K.burger || it.k === K.cola) this.st('meals'); this.consume(p, it); }
    else this.note(p, 'Здоровье и так полное');
  }
  eject(it) {
    const rv = this.rv, w = rv.body.pointToWorldFrame(V3(...it.lp)), v = rv.body.velocity;
    this.makeBody(it, [w.x, w.y, w.z], 0, [v.x + (Math.random() - 0.5) * 4, v.y + 2, v.z + (Math.random() - 0.5) * 4]);
  }
  event(id, ev) {
    const p = this.players.get(id); if (!p) return;
    switch (ev.a) {
      case 'interact': this.interact(p); break;
      case 'drop': if (!p.down && !p.swing) this.drop(p); break;
      case 'use': if (!p.down) this.use(p); break;
      case 'throw': if (!p.drive) this.throwHook(p); break;
      case 'engine': if (p.drive && !this.rv.toggleEngine()) this.note(p, 'Не завести: двигатель или корпус разбиты!'); break;
      case 'lights': if (p.drive) this.rv.lights = !this.rv.lights; break;
      case 'gear': if (p.drive) { const i = ev.v !== undefined ? GEAR_SEQ.indexOf(ev.v) : clamp(GEAR_SEQ.indexOf(this.rv.gear) + ev.d, 0, 6); if (i >= 0) this.rv.gear = GEAR_SEQ[i]; } break;
      case 'reset': this.resetRV(); break;
      case 'sig': this.onChat(p.name, '📣 ' + (SIGNALS[ev.v] || '')); break;
    }
  }
  resetRV() {
    const cp = CPS[this.cp], y = this.W.height(cp.x, cp.z) + 2.6; this.phys.sync([{ x: cp.x, z: cp.z }]); this.rv.reset(cp.x, y, cp.z);
    for (const p of this.players.values()) { if (!p.inRV) { p.body.position.set(cp.x + 4, y - 1, cp.z + 3); p.body.velocity.set(0, 0, 0); } if (p.hook >= 0) p.hook = -1; }
  }

  // ---------- шаг ----------
  step(dt) {
    const rv = this.rv, phys = this.phys; this.time += dt; this.stats.time += dt / 60;
    if (phys.t - this.focusT > 0.4) { this.focusT = phys.t; this.focusAll(); }
    const drv = this.driver(), c = { thr: 0, brk: 0, steer: 0, hand: 1 }; rv.horn = 0;
    if (drv && !drv.down) { const i = drv.inp; c.thr = clamp(i.thr || 0, 0, 1); c.brk = clamp(i.brk || 0, 0, 1); c.steer = clamp(i.steer || 0, -1, 1); c.hand = i.hand ? 1 : 0; rv.horn = i.horn ? 1 : 0; }
    if (rv.horn && !this.horn0) this.st('honk'); this.horn0 = rv.horn;
    if (drv) { this.stats.dist += (Math.abs(rv.speed) / 3.6) * dt / 1000; if (Math.sin((2 * Math.PI * this.time) / 900 + 0.6) < -0.1) this.stats.night += dt / 60; if (this.W.mud(rv.body.position.x, rv.body.position.z)) this.stats.mud += dt; }
    rv.update(dt, c);
    for (let w = 0; w < 2; w++) { let r = 0; for (const p of this.players.values()) { const q = this.pw(p); if (Math.hypot(q[0] - rv.body.position.x, q[2] - rv.body.position.z) < 9) r += (w ? p.inp.wr : p.inp.wf) || 0; } rv.reel(w, clamp(r, -1, 1), dt); }
    for (let i = 0; i < 2; i++) { // трос-страховка на игроке: тянет игрока к автодому
      const w = rv.winch[i]; if (w.st !== 2 || w.ap < 0) continue;
      const o = this.players.get(w.ap); if (!o || o.inRV) { w.st = 0; w.ap = -1; w.anchor = null; continue; }
      const q = o.body.position, m = rv.mountWorld(i), dx = m.x - q.x, dy = m.y - q.y, dz = m.z - q.z, dist = Math.hypot(dx, dy, dz) || 1, ex = dist - w.len;
      w.anchor = { x: q.x, y: q.y + 0.3, z: q.z }; if (ex > 0) { const F = clamp(ex * 2500, 0, 3500); o.body.applyForce(V3((dx / dist) * F, (dy / dist) * F, (dz / dist) * F), V3(0, 0, 0)); w.ten = F; } else w.ten = 0;
    }
    const rvYaw = this.rvYaw();
    for (const p of this.players.values()) this.updatePlayer(p, dt, rvYaw);
    const targets = [...this.players.values()].filter((p) => !p.inRV && !p.down).map((p) => ({ id: p.id, x: p.body.position.x, z: p.body.position.z }));
    const rvn = { x: rv.body.position.x, z: rv.body.position.z, eng: rv.eng && rv.hp > 0, horn: rv.horn };
    for (const br of this.bears) for (const id of br.update(dt, targets, rvn)) { const p = this.players.get(id); if (p) { this.damage(p, 18); this.st('bear'); const dx = p.body.position.x - br.x, dz = p.body.position.z - br.z, l = Math.hypot(dx, dz) || 1; p.body.velocity.x += (dx / l) * 6; p.body.velocity.z += (dz / l) * 6; p.body.velocity.y += 3; } }
    for (const sn of this.snakes) { const id = sn.update(dt, targets); if (id !== null) { const p = this.players.get(id); if (p) { this.damage(p, 6); this.poison(p); this.st('snake'); } } }
    this.updateRocks(dt); this.updateHeli(dt);
    const hp = rv.body.position, hz = this.W.hazardAt(hp.x, hp.z, 1); // автодом в лаве / в воде
    if (hz) { if (hz.k === 'lava') { rv.hp = Math.max(0, rv.hp - 12 * dt); rv.hull = Math.max(0, rv.hull - 12 * dt); rv.eng = false; } else if (hp.y - 1.5 < hz.y - 0.6) { rv.eng = false; rv.hp = Math.max(0, rv.hp - 6 * dt); } }
    phys.step(dt);
    this.post(dt);
  }
  updatePlayer(p, dt, rvYaw) {
    p.yaw = p.inp.yaw || 0; p.pitch = p.inp.pitch || 0;
    if (p.boost > 0) p.boost -= dt;
    if (p.pois > 0 && !p.down) { p.pois -= dt; this.damage(p, 3 * dt); }
    if (p.down) {
      p.downT += dt; if (p.swing) this.endSwing(p, false);
      if (!p.dead && p.downT > 50) this.goDead(p); else if (p.dead && p.downT > 170) this.respawn(p);
      if (!p.inRV) { p.body.velocity.x *= 0.85; p.body.velocity.z *= 0.85; }
    } else if (p.inRV) { if (p.drive) p.lp = [SEAT[0], FLOOR_Y, SEAT[2]]; else p.moveInside(dt, rvYaw); }
    else {
      const bp = p.body.position, hz = this.W.hazardAt(bp.x, bp.z, 0); let slow = 1, inWater = false;
      if (hz && hz.k === 'lava') { this.damage(p, 25 * dt); if (!p.inPool) { p.inPool = 1; this.st('lava'); } }
      else if (hz && bp.y - 0.5 < hz.y - 0.6) { // под водой: плывём, воздух ограничен
        inWater = true; slow = 0.5; p.air -= dt; if (p.air < 0) this.damage(p, 8 * dt); if (!p.inPool) { p.inPool = 1; this.st('drown'); }
        p.body.velocity.y = p.inp.jump ? 2.5 : -1.0;
      } else { p.inPool = 0; p.air = Math.min(8, p.air + dt * 3); }
      if (p.swing) { // тарзанка: раскачиваемся силой, прыжок — отпустить
        const i = p.inp, y = i.yaw || 0, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y), mx = i.mx || 0, mz = i.mz || 0;
        p.body.applyForce(V3((fx * mz + rx * mx) * 700, 0, (fz * mz + rz * mx) * 700), V3(0, 0, 0)); p.swing.t += dt;
        if (i.jump || p.swing.t > 14) this.endSwing(p, !!i.jump);
      } else {
        const dmg = p.moveOutside(dt, this.W, slow); if (dmg > 2) { this.damage(p, dmg); this.st('fall', dmg); }
      }
      if (!inWater && bp.y < -60) this.respawn(p);
    }
    if (p.hook >= 0) { // привязь: трос не длиннее 38 м
      const m = this.rv.mountWorld(p.hook), q = this.pw(p), d = Math.hypot(q[0] - m.x, q[2] - m.z);
      if (d > 38 && !p.inRV) { const k = 38 / d; p.body.position.x = m.x + (q[0] - m.x) * k; p.body.position.z = m.z + (q[2] - m.z) * k; p.body.velocity.x = p.body.velocity.z = 0; }
    }
    const a = this.actions(p)[0]; p.prompt = a ? a.text : '';
  }
  updateRocks(dt) {
    const rv = this.rv, rp = rv.body.position, inCan = rp.z < 300 && rp.z > -300;
    this.rockT -= dt;
    if (inCan && this.rockT <= 0) {
      this.rockT = 10 + Math.random() * 12; const v = rv.body.velocity, x = rp.x + v.x * 2 + (Math.random() - 0.5) * 14, z = rp.z + v.z * 2 - 6 + (Math.random() - 0.5) * 14, rad = 0.7 + Math.random() * 0.7;
      const b = new CANNON.Body({ mass: 700, material: this.phys.mats.body }); b.addShape(new CANNON.Sphere(rad)); b.position.set(x, this.W.height(x, z) + 32, z); b.velocity.set(0, -5, 0); this.phys.world.addBody(b);
      this.rocks.push({ id: this.nid++, b, rad, age: 0, hit: new Set() }); this.st('rock');
    }
    for (const r of this.rocks.slice()) {
      r.age += dt; const q = r.b.position, sp = r.b.velocity.length();
      if (r.age > 25 || q.y < -60) { this.phys.world.removeBody(r.b); this.rocks.splice(this.rocks.indexOf(r), 1); continue; }
      if (sp > 5) for (const p of this.players.values()) { if (p.inRV || p.down || r.hit.has(p.id)) continue; const pq = p.body.position; if (Math.hypot(pq.x - q.x, pq.y - q.y, pq.z - q.z) < r.rad + 0.8) { r.hit.add(p.id); this.damage(p, 35); } }
    }
  }
  updateHeli(dt) {
    const rv = this.rv, rp = rv.body.position, active = !this.fin && rp.z < -600;
    if (active && !this.heli) this.heli = { x: rp.x + 40, y: rp.y + 30, z: rp.z + 40, a: 0, yaw: 0, t: 3 };
    if (!active) this.heli = null;
    const h = this.heli;
    if (h) {
      h.a += dt * 0.5; const k = 1 - Math.exp(-dt * 1.2);
      h.x += (rp.x + Math.cos(h.a) * 28 - h.x) * k; h.z += (rp.z + Math.sin(h.a) * 28 - h.z) * k; h.y += (rp.y + 26 - h.y) * k; h.yaw = Math.atan2(-(rp.x - h.x), -(rp.z - h.z));
      h.t -= dt;
      if (h.t <= 0) { h.t = 3.5; const v = rv.body.velocity, x = rp.x + v.x * 1.6 + (Math.random() - 0.5) * 4, z = rp.z + v.z * 1.6 + (Math.random() - 0.5) * 4; this.shells.push({ x, z, y: this.W.height(x, z) + 0.3, t: 1.6 }); }
    }
    for (const s of this.shells.slice()) { s.t -= dt; if (s.t <= 0) { this.explode(s); this.shells.splice(this.shells.indexOf(s), 1); } }
    for (const e of this.expl.slice()) { e.age += dt; if (e.age > 0.8) this.expl.splice(this.expl.indexOf(e), 1); }
  }
  explode(s) {
    this.expl.push({ x: s.x, y: s.y, z: s.z, age: 0 });
    for (const p of this.players.values()) { const q = this.pw(p), d = Math.hypot(q[0] - s.x, q[2] - s.z); if (d < 7 && Math.abs(q[1] - s.y) < 8) this.damage(p, 45 * (1 - d / 7)); }
    const rv = this.rv, rp = rv.body.position, dx = rp.x - s.x, dz = rp.z - s.z, d = Math.hypot(dx, dz) || 1;
    if (d < 8) { const f = 1 - d / 8; rv.hp = Math.max(0, rv.hp - 22 * f); rv.hull = Math.max(0, rv.hull - 22 * f); rv.body.applyImpulse(V3((dx / d) * 6000 * f, 5000 * f, (dz / d) * 6000 * f), V3(0, 0, 0)); }
    if (d < 15) this.st('heli');
  }
  post(dt) {
    const rv = this.rv;
    if (rv.hitN !== this.lastHn) { this.stats.crash += rv.hitN - this.lastHn; this.lastHn = rv.hitN; }
    if (rv.tilt > 2.3 && this.time - this.flipT > 10) { this.flipT = this.time; this.st('flip'); }
    for (const it of this.items.slice()) {
      if (it.st === 1) {
        if ((it.slot === -2 || it.slot === -3) && it.k === K.patty) { it.cook += dt; if (it.cook > 4) { it.k = K.burger; it.cook = 0; } }
        else if (it.slot === -1 && (rv.jerk > 12 || rv.tilt > 1.0)) this.eject(it);
        else if (it.slot >= 0 && rv.tilt > 1.35) this.eject(it);
      } else if (it.st === 0 && it.k !== K.golf && it.body.position.y < -80) { const cp = CPS[this.cp]; it.body.position.set(cp.x + 3, this.W.height(cp.x + 3, cp.z) + 2, cp.z); it.body.velocity.set(0, 0, 0); }
    }
    if (this.ball && this.ball.st === 0) { // гольф: лунка или вылет за карту
      const q = this.ball.body.position, [hx, hz] = this.W.golf.hole, [tx, tz] = this.W.golf.tee;
      const reset = () => { this.ball.body.position.set(tx, this.W.height(tx, tz) + 0.5, tz); this.ball.body.velocity.set(0, 0, 0); };
      if (Math.hypot(q.x - hx, q.z - hz) < 0.9 && q.y < this.W.height(hx, hz) + 0.8) { this.st('golf'); this.onChat('Система', '⛳ Лунка! Забито: ' + this.stats.golf); reset(); }
      else if (q.y < -60) reset();
    }
    const z = rv.body.position.z;
    while (this.cp + 1 < CPS.length && z < CPS[this.cp + 1].z) { this.cp++; this.stats.cp = this.cp; this.onChat('Система', '🏁 Чекпоинт: ' + CPS[this.cp].name); }
    if (!this.fin && z < FINISH_Z) { this.fin = true; this.stats.finish = 1; this.stats.fast = this.stats.time < 25 ? 1 : 0; this.stats.nodeath = this.stats.down === 0 ? 1 : 0; this.onChat('Система', '🎉 Route 65! Вы доехали!'); }
    if (rv.body.position.y < -70) this.resetRV();
    this.checkAch(dt);
  }
  checkAch(dt) {
    this.achT -= dt; if (this.achT > 0) return; this.achT = 0.5;
    for (const a of ACH) if (!this.ach.has(a.id) && (this.stats[a.stat] || 0) >= a.need) { this.ach.add(a.id); this.achV++; this.onChat('🏆', 'Достижение: ' + a.name + ' — ' + a.desc); }
  }

  // ---------- снимок для рендера/сети ----------
  snapshot() {
    const rv = this.rv, b = rv.body, p3 = b.position, q = b.quaternion;
    const pl = [...this.players.values()].map((p) => ({
      id: p.id, n: p.name, c: p.color, h: p.hat, p: (p.inRV ? p.lp : [p.body.position.x, p.body.position.y - 0.5, p.body.position.z]).map(R),
      y: R(p.yaw), pt: R(p.pitch), hp: Math.round(p.hp), ir: p.inRV ? 1 : 0, dr: p.drive ? 1 : 0, hd: p.held, hk: p.hook, dn: p.down ? 1 : 0, dd: p.dead ? 1 : 0,
      pz: p.pois > 0 ? 1 : 0, bs: p.boost > 0 ? 1 : 0, sw: p.swing ? p.swing.top.map(R) : 0, pr: p.prompt, nt: p.nt, nc: p.nc,
    }));
    const it = this.items.map((i) => {
      if (i.st === 0) { const bp = i.body.position, bq = i.body.quaternion; return [i.id, i.k, 0, R(bp.x), R(bp.y), R(bp.z), ...[bq.x, bq.y, bq.z, bq.w].map((v) => Math.round(v * 1000) / 1000), -1]; }
      if (i.st === 1) return [i.id, i.k, 1, ...i.lp.map(R), 0, 0, 0, 1, -1];
      return [i.id, i.k, 2, 0, 0, 0, 0, 0, 0, 1, i.by];
    });
    return {
      rv: { p: [p3.x, p3.y, p3.z].map(R), q: [q.x, q.y, q.z, q.w].map((v) => Math.round(v * 1000) / 1000), w: rv.veh.wheelInfos.map((w) => [R(w.suspensionLength), R(w.rotation), R(w.steering)]),
        s: Math.round(rv.speed), g: rv.gear, e: rv.eng ? 1 : 0, hp: Math.round(rv.hp), hu: Math.round(rv.hull), wk: rv.wok.slice(), l: rv.lights ? 1 : 0, h: rv.horn, rpm: Math.round(rv.rpm), tl: R(rv.tilt), hn: rv.hitN },
      wn: rv.winch.map((w) => [w.st, w.by, w.anchor ? R(w.anchor.x) : 0, w.anchor ? R(w.anchor.y) : 0, w.anchor ? R(w.anchor.z) : 0, R(w.len), Math.round(w.ten)]),
      pl, it, br: this.bears.map((x) => [R(x.x), R(x.y), R(x.z), R(x.yaw), x.st]), sn: this.snakes.map((x) => [R(x.x), R(x.y), R(x.z), R(x.yaw)]),
      rk: this.rocks.map((r) => [r.id, R(r.b.position.x), R(r.b.position.y), R(r.b.position.z), R(r.rad)]),
      hc: this.heli ? [R(this.heli.x), R(this.heli.y), R(this.heli.z), R(this.heli.yaw)] : 0, sh: this.shells.map((s) => [R(s.x), R(s.y), R(s.z), R(s.t)]), ex: this.expl.map((e) => [R(e.x), R(e.y), R(e.z), R(e.age)]),
      tg: [...this.tapesGot], cg: [...this.clothGot], tn: this.tapeNow, ac: this.ach.size,
      cp: this.cp, fin: this.fin ? 1 : 0, tm: Math.round(this.time * 10) / 10, fr: this.fridge,
    };
  }
}
