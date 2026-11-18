// Пространственный голосовой чат: громкость падает с расстоянием, вдали голос глуше и с эхом.
export class Voice {
  constructor(net) { this.net = net; this.ctx = null; this.r = new Map(); this.peerPid = new Map(); net.on('vstream', (p, s) => this.add(p, s)); net.on('vclose', (p) => this.drop(p)); }
  ensureCtx() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); }
  setPeers(list, me, myPeer) { for (const [pid, peer] of list) { this.peerPid.set(peer, pid); if (pid < me && peer !== myPeer) this.net.callPeer(peer); } }
  add(peer, stream) {
    this.ensureCtx(); this.drop(peer); const c = this.ctx, a = new Audio(); a.srcObject = stream; a.muted = true; a.play().catch(() => {}); // нужно Chrome, чтобы поток «потёк»
    const src = c.createMediaStreamSource(stream), lp = c.createBiquadFilter(), dry = c.createGain(), dl = c.createDelay(0.6), fb = c.createGain(), wet = c.createGain();
    lp.type = 'lowpass'; dl.delayTime.value = 0.14; fb.gain.value = 0.4; wet.gain.value = 0; dry.gain.value = 0;
    src.connect(lp); lp.connect(dry); dry.connect(c.destination); lp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(c.destination);
    this.r.set(peer, { a, src, lp, dry, wet });
  }
  drop(peer) { const o = this.r.get(peer); if (!o) return; try { o.src.disconnect(); o.a.srcObject = null; } catch (e) {} this.r.delete(peer); }
  update(L, posOf) { // L: слушатель {x,y,z,ir}; posOf(pid) -> {x,y,z,ir} | null
    if (!this.ctx) return; const t = this.ctx.currentTime;
    for (const [peer, o] of this.r) {
      const pid = this.peerPid.get(peer), p = pid === undefined ? null : posOf(pid); if (!p) { o.dry.gain.setTargetAtTime(0, t, 0.05); continue; }
      const d = Math.hypot(L.x - p.x, L.y - p.y, L.z - p.z); let vol = Math.pow(Math.max(0, Math.min(1, 1 - (d - 4) / 56)), 1.5); if (L.ir !== p.ir) vol *= 0.6;
      o.dry.gain.setTargetAtTime(vol, t, 0.05); o.wet.gain.setTargetAtTime(Math.min(0.7, Math.max(0, (d - 10) / 40)) * vol * 1.4, t, 0.1); o.lp.frequency.setTargetAtTime(8000 - 7000 * Math.min(1, d / 60), t, 0.1);
    }
  }
}
