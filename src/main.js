import './style.css';
import * as THREE from 'three';
import { UI } from './ui.js';
import { Net } from './network.js';
import { createWorld, TerrainView, buildStatics, buildLandmarks, buildPickups, biomeAt, CPS } from './world.js';
import { Physics } from './physics.js';
import { Host } from './host.js';
import { View } from './view.js';
import { Input } from './player.js';
import { Touch, isCoarse } from './touch.js';
import { Sky } from './sky.js';
import { Voice } from './voice.js';

const ui = new UI();

// ---- звук: мотор, клаксон, удары, музыка кассет (WebAudio) ----
class Sound {
  constructor() { this.ctx = null; this.tapeId = -1; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const c = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.eng = c.createOscillator(); this.eg = c.createGain(); this.eng.type = 'sawtooth'; this.eg.gain.value = 0; this.eng.connect(this.eg).connect(c.destination); this.eng.start();
    this.hornO = [220, 277].map((f) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.value = 0; o.connect(g).connect(c.destination); o.start(); return g; });
    this.tg = c.createGain(); this.tg.gain.value = 0; this.tg.connect(c.destination); if (this.tapeId >= 0) this.tape(this.tapeId);
  }
  update(r, dist) {
    if (!this.ctx) return; const t = this.ctx.currentTime, vol = Math.max(0, 1 - dist / 120);
    this.eng.frequency.setTargetAtTime(30 + r.rpm / 45, t, 0.05); this.eg.gain.setTargetAtTime(r.e ? 0.05 * vol : 0, t, 0.1);
    for (const g of this.hornO) g.gain.setTargetAtTime(r.h ? 0.06 * Math.max(vol, 0.1) : 0, t, 0.02);
  }
  thud(vol) {
    if (!this.ctx || vol <= 0) return; const c = this.ctx, b = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(); s.buffer = b; g.gain.value = 0.5 * vol; f.type = 'lowpass'; f.frequency.value = 500;
    s.connect(f).connect(g).connect(c.destination); s.start();
  }
  note(f, dur, type, vol) { const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.tg); o.start(t); o.stop(t + dur + 0.05); }
  tape(id) { // процедурная мелодия: у каждой кассеты своя
    this.tapeId = id; clearInterval(this.tt); if (!this.ctx || id < 0) return;
    let s = (id + 1) * 2654435761 >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const scale = [0, 2, 4, 7, 9, 12, 14, 16], root = [110, 123.5, 130.8, 98][id % 4], seq = Array.from({ length: 16 }, () => scale[(rnd() * scale.length) | 0]); let i = 0;
    this.tt = setInterval(() => { this.note(root * Math.pow(2, seq[i % 16] / 12), 0.22, 'triangle', 0.25); if (i % 4 === 0) this.note(root / 2, 0.5, 'sine', 0.35); i++; }, 160 + (id % 5) * 35);
  }
  tapeVol(v) { if (this.tg) this.tg.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.1); }
}

class Game {
  constructor({ W, host, net, me, code, isHost }) {
    Object.assign(this, { W, host, net, me, isHost, snap: null, lastSend: 0, lastBc: 0, micState: 'off' });
    const canvas = (this.canvas = document.createElement('canvas')); document.body.prepend(canvas);
    this.mobile = isCoarse();
    const r = (this.r = new THREE.WebGLRenderer({ canvas, antialias: !this.mobile })); r.setPixelRatio(this.mobile ? 1 : Math.min(devicePixelRatio, 1.5));
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0xa9cbe6); this.scene.fog = new THREE.Fog(0xa9cbe6, 80, 420);
    this.cam = new THREE.PerspectiveCamera(75, 1, 0.1, 900); this.mcam = new THREE.PerspectiveCamera(60, 1, 0.3, 400);
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x554433, 1.5); this.sun = new THREE.DirectionalLight(0xffffff, 1.8); this.sun.position.set(0.5, 1, 0.3);
    this.scene.add(this.hemi, this.sun);
    this.terrain = new TerrainView(this.scene, W); buildStatics(this.scene, W); buildLandmarks(this.scene, W);
    this.view = new View(this.scene); this.view.setPickups(buildPickups(this.scene, W)); this.sound = new Sound(); this.sky = new Sky(this.scene);
    this.voice = new Voice(net); net.setupVoice();
    this.input = new Input(canvas); this.input.onEvent = (ev) => { this.sound.init(); this.sendEvent(ev); }; this.input.onChat = () => ui.focusChat();
    this.input.onLocal = (a) => (a === 'mic' ? this.toggleMic() : ui.toggleAch());
    ui.onMic = () => this.toggleMic();
    canvas.addEventListener('click', () => { this.sound.init(); this.voice.ensureCtx(); });
    this.touch = new Touch(this.input, ui); this.touch.enable(this.mobile);
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { this.sound.init(); this.voice.ensureCtx(); if (!this.touch.on) { this.mobile = true; this.touch.enable(true); } } });
    ui.onChat = (t) => (isHost ? this.hostChat(0, t) : net.send({ t: 'chat', text: t }));
    addEventListener('resize', () => this.resize()); this.resize();
    ui.showHud(code); this.last = performance.now(); this.envT = { bg: new THREE.Color(0xa9cbe6), near: 80, far: 420, bl: 1 };
    requestAnimationFrame(() => this.loop());
  }
  resize() { this.r.setSize(innerWidth, innerHeight, false); this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); }
  sendEvent(ev) { if (this.isHost) this.host.event(this.me, ev); else this.net.send({ t: 'ev', ...ev }); }
  hostChat(pid, text) { const p = this.host.players.get(pid); this.hostSay(p ? p.name : '?', text); }
  hostSay(name, text) { ui.addChat(name, text); this.net.broadcast({ t: 'chat', n: name, text }); }
  async toggleMic() {
    this.voice.ensureCtx();
    try {
      if (this.micState === 'off') { await this.net.enableMic(); this.micState = 'on'; ui.toast('🎤 Микрофон включён — вас слышат по расстоянию', 2500); }
      else { this.micState = this.micState === 'on' ? 'muted' : 'on'; this.net.muteMic(this.micState === 'muted'); }
    } catch (e) { ui.toast('Нет доступа к микрофону (нужен HTTPS и разрешение)', 4000); }
    ui.setMic(this.micState);
  }
  syncAch(now) { // хост рассылает достижения и статистику
    if (!this.isHost) return; const h = this.host;
    if (h.achV !== this.achSent || now - (this.achAt || 0) > 5000) { this.achSent = h.achV; this.achAt = now; const m = { t: 'ach', u: [...h.ach], s: h.stats }; this.net.broadcast(m); ui.setAch(m.u, m.s); }
  }

  loop() {
    const now = performance.now(), dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const inp = this.input.sample();
    if (this.isHost) {
      this.host.setInput(this.me, inp); this.host.step(dt); this.snap = this.host.snapshot(); this.syncAch(now);
      if (now - this.lastBc > 50) { this.lastBc = now; this.net.broadcast({ t: 'st', s: this.snap }); }
    } else if (now - this.lastSend > 33) { this.lastSend = now; this.net.send({ t: 'in', i: inp }); }
    if (this.snap) {
      this.view.apply(this.snap, dt, !this.isHost); this.view.setSelf(this.me);
      const mp = this.snap.pl.find((p) => p.id === this.me);
      this.input.driving = !!(mp && mp.dr); this.touch.setState({ driving: this.input.driving, winch: this.snap.wn.some((w) => w[0] === 2) });
      const tod = this.updateCamera(mp, dt); ui.update(this.snap, this.me, biomeAt(this.cam.position.z), tod);
      if (this.lastCp !== undefined && this.lastCp !== this.snap.cp) ui.toast('🏁 Чекпоинт: ' + CPS[this.snap.cp].name, 4000); this.lastCp = this.snap.cp;
      const rp = this.snap.rv.p, dist = Math.hypot(rp[0] - this.cam.position.x, rp[2] - this.cam.position.z);
      this.sound.update(this.snap.rv, dist);
      if (this.lastHn !== undefined && this.snap.rv.hn !== this.lastHn) this.sound.thud(Math.max(0, 1 - dist / 80)); this.lastHn = this.snap.rv.hn;
      // кассета в магнитофоне: мелодия слышна возле автодома
      if (this.snap.tn !== this.lastTn) { this.lastTn = this.snap.tn; this.sound.tape(this.snap.tn); ui.showTape(this.snap.tn); }
      this.sound.tapeVol(this.snap.tn >= 0 ? Math.max(0, 1 - dist / 40) * (mp && mp.ir ? 1.3 : 0.7) : 0);
      // голос по расстоянию
      const eye = this.cam.position;
      this.voice.update({ x: eye.x, y: eye.y, z: eye.z, ir: mp ? mp.ir : 0 }, (pid) => { const v = this.view.pv.get(pid), p = this.snap.pl.find((q) => q.id === pid); if (!v || !p) return null; const w = v.group.getWorldPosition(new THREE.Vector3()); return { x: w.x, y: w.y, z: w.z, ir: p.ir }; });
    }
    this.r.render(this.scene, this.cam);
    this.renderMirrors(); requestAnimationFrame(() => this.loop());
  }
  // зеркала и камера заднего вида (обзор из кабины ограничен)
  renderMirrors() {
    if (!this.input.driving) { ui.setMirrors(null); return; }
    const W = innerWidth, H = innerHeight, side = Math.min(W * 0.2, 220), sh = Math.min(H * 0.22, 150), rw = Math.min(W * 0.34, 400);
    const defs = [
      { x: W / 2 - rw / 2, y: 8, w: rw, h: 90, pos: [0, 1.35, 3.2], fov: 65, label: 'Камера заднего вида' },
      { x: 12, y: 170, w: side, h: sh, pos: [-1.5, -0.1, -2.7], fov: 45, label: 'Левое зеркало' },
      { x: W - 12 - side, y: 170, w: side, h: sh, pos: [1.5, -0.1, -2.7], fov: 45, label: 'Правое зеркало' },
    ];
    ui.setMirrors(defs); const r = this.r, g = this.view.rv.group, flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    r.setScissorTest(true);
    for (const d of defs) {
      const vy = H - d.y - d.h; r.setViewport(d.x, vy, d.w, d.h); r.setScissor(d.x, vy, d.w, d.h);
      this.mcam.fov = d.fov; this.mcam.aspect = d.w / d.h; this.mcam.updateProjectionMatrix();
      this.mcam.position.copy(g.localToWorld(new THREE.Vector3(...d.pos))); this.mcam.quaternion.copy(g.quaternion).multiply(flip);
      r.render(this.scene, this.mcam);
    }
    r.setScissorTest(false); r.setViewport(0, 0, W, H);
  }
  updateCamera(mp, dt) {
    const eye = this.view.eye(this.me); if (!eye) return 'День';
    this.cam.position.copy(eye); this.cam.rotation.set(mp && mp.dn ? 0.2 : this.input.pitch, this.input.yaw, 0, 'YXZ');
    this.terrain.update(eye.x, eye.z, this.mobile ? 3 : 4);
    const z = eye.z, sw = z < -300 && z > -790, can = z < 300 && z >= -300;
    const s = this.sky.update(this.cam, this.snap.tm || 0, dt, sw);
    let bg = s.col.clone(), near = 80, far = 420, bl = 1;
    if (sw) { bg.lerp(new THREE.Color(0x56634f).multiplyScalar(0.25 + 0.75 * s.dayK), 0.75); near = 4; far = 120; bl = 0.6; }
    else if (can) { bg.lerp(new THREE.Color(0xd9c8a8).multiplyScalar(0.2 + 0.8 * s.dayK), 0.35); far = 380; bl = 0.9; }
    const k = 1 - Math.exp(-dt * 1.5), e = this.envT;
    e.bg.lerp(bg, k); e.near += (near - e.near) * k; e.far += (far - e.far) * k; e.bl += (bl - e.bl) * k;
    this.scene.background.copy(e.bg); this.scene.fog.color.copy(e.bg); this.scene.fog.near = e.near; this.scene.fog.far = this.mobile ? Math.min(e.far, 270) : e.far;
    this.hemi.intensity = 1.5 * s.light * e.bl; this.sun.intensity = 1.8 * s.dayK * e.bl; this.sun.position.copy(s.dir);
    this.view.rv.lamp.intensity = 3 + 16 * (1 - s.dayK);
    return s.e > 0.15 ? 'День' : s.e > -0.1 ? 'Сумерки' : 'Ночь';
  }
}

async function startHost(profile) {
  ui.status('Создаём комнату…');
  const net = new Net(); let code;
  try { code = await net.host(); } catch (e) { ui.status('Сетевая ошибка: ' + (e.message || e)); return; }
  ui.status('Генерируем мир…'); await new Promise((r) => setTimeout(r, 30));
  const seed = (Math.random() * 2 ** 31) | 0, W = createWorld(seed), phys = new Physics(W), host = new Host(W, phys);
  host.addPlayer(0, profile);
  const peers = new Map(); let nextId = 1, game;
  const peerList = () => [[0, net.peer.id], ...[...host.players.values()].filter((p) => p.id !== 0 && p.peer).map((p) => [p.id, p.peer])];
  const sendPeers = () => { const l = peerList(); net.broadcast({ t: 'peers', l }); game.voice.setPeers(l, 0, net.peer.id); };
  host.onChat = (n, t) => game.hostSay(n, t);
  net.on('msg', (m, peer) => {
    if (m.t === 'hello') {
      if (host.players.size >= 4) return net.sendTo(peer, { t: 'full' });
      const id = nextId++; peers.set(peer, id); const p = host.addPlayer(id, m.p); p.peer = m.peer || null;
      net.sendTo(peer, { t: 'welcome', id, seed, code }); net.sendTo(peer, { t: 'ach', u: [...host.ach], s: host.stats });
      game.hostSay('Система', (m.p.name || 'Игрок') + ' подключился'); sendPeers();
    } else if (peers.has(peer)) {
      const id = peers.get(peer);
      if (m.t === 'in') host.setInput(id, m.i); else if (m.t === 'ev') host.event(id, m); else if (m.t === 'chat') game.hostChat(id, String(m.text).slice(0, 120));
    }
  });
  net.on('leave', (peer) => { const id = peers.get(peer); if (id !== undefined) { const p = host.players.get(id); game.hostSay('Система', (p ? p.name : 'Игрок') + ' вышел'); host.removePlayer(id); peers.delete(peer); sendPeers(); } });
  game = new Game({ W, host, net, me: 0, code, isHost: true });
}

async function startJoin(code, profile) {
  ui.status('Подключаемся…'); const net = new Net();
  try { await net.join(code); } catch (e) { ui.status('Не удалось: ' + (e.message || e)); return; }
  let game = null, pending = null;
  net.on('msg', async (m) => {
    if (m.t === 'welcome' && !game) {
      ui.status('Генерируем мир…'); await new Promise((r) => setTimeout(r, 30));
      game = new Game({ W: createWorld(m.seed), host: null, net, me: m.id, code: m.code, isHost: false }); game.myId = m.id;
      if (pending) game.voice.setPeers(pending, m.id, net.peer.id);
    }
    else if (m.t === 'st' && game) game.snap = m.s;
    else if (m.t === 'chat') ui.addChat(m.n, m.text);
    else if (m.t === 'ach') ui.setAch(m.u, m.s);
    else if (m.t === 'peers') { pending = m.l; if (game) game.voice.setPeers(m.l, game.myId, net.peer.id); }
    else if (m.t === 'full') ui.status('Комната заполнена (макс. 4 игрока)');
  });
  net.on('closed', () => { ui.toast('Хост отключился. Обновите страницу.', 60000); });
  net.send({ t: 'hello', p: profile, peer: net.peer.id });
}

ui.onHost = startHost; ui.onJoin = startJoin;
window.__rvLoaded = true;
