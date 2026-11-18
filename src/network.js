// P2P поверх WebRTC (PeerJS, публичный брокер). Хост — авторитетный сервер физики.
import Peer from 'peerjs';
const PFX = 'rvthere-', ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class Net {
  constructor() { this.h = {}; this.conns = new Map(); this.peer = null; this.conn = null; }
  on(t, f) { this.h[t] = f; return this; }
  emit(t, ...a) { this.h[t] && this.h[t](...a); }

  host() {
    return new Promise((res, rej) => {
      const code = Array.from({ length: 5 }, () => ABC[(Math.random() * ABC.length) | 0]).join('');
      const p = (this.peer = new Peer(PFX + code));
      p.on('open', () => res(code));
      p.on('error', (e) => { if (e.type === 'unavailable-id') { p.destroy(); this.host().then(res, rej); } else { rej(e); this.emit('error', e); } });
      p.on('connection', (c) => {
        c.on('open', () => { this.conns.set(c.peer, c); this.emit('join', c.peer); });
        c.on('data', (d) => this.emit('msg', d, c.peer));
        c.on('close', () => { this.conns.delete(c.peer); this.emit('leave', c.peer); });
        c.on('error', () => {});
      });
    });
  }

  join(code) {
    return new Promise((res, rej) => {
      const p = (this.peer = new Peer());
      const to = setTimeout(() => rej(new Error('Таймаут подключения')), 12000);
      p.on('error', (e) => { clearTimeout(to); rej(new Error(e.type === 'peer-unavailable' ? 'Комната не найдена' : e.message)); });
      p.on('open', () => {
        const c = (this.conn = p.connect(PFX + code.toUpperCase().trim(), { reliable: true }));
        c.on('open', () => { clearTimeout(to); res(); });
        c.on('data', (d) => this.emit('msg', d));
        c.on('close', () => this.emit('closed'));
      });
    });
  }
  send(m) { if (this.conn && this.conn.open) this.conn.send(m); }
  sendTo(id, m) { const c = this.conns.get(id); if (c && c.open) c.send(m); }
  broadcast(m) { for (const c of this.conns.values()) if (c.open) c.send(m); }

  // ---- голосовой чат: WebRTC-звонки между всеми игроками (звук — пространственный, см. voice.js) ----
  setupVoice() {
    if (this.v) return; this.v = { calls: new Map(), mic: null, dummy: null };
    this.peer.on('call', (c) => { c.answer(this.vStream()); this.hookCall(c); });
  }
  vStream() {
    if (this.v.mic) return this.v.mic;
    if (!this.v.dummy) { const ctx = new (window.AudioContext || window.webkitAudioContext)(), d = ctx.createMediaStreamDestination(), o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0; o.connect(g).connect(d); o.start(); this.v.dummy = d.stream; }
    return this.v.dummy;
  }
  hookCall(c) { this.v.calls.set(c.peer, c); c.on('stream', (s) => this.emit('vstream', c.peer, s)); c.on('close', () => { this.v.calls.delete(c.peer); this.emit('vclose', c.peer); }); }
  callPeer(id) { if (!this.v || this.v.calls.has(id)) return; this.hookCall(this.peer.call(id, this.vStream())); }
  async enableMic() {
    if (this.v.mic) return true;
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.v.mic = s; const tr = s.getAudioTracks()[0];
    for (const c of this.v.calls.values()) { const snd = c.peerConnection && c.peerConnection.getSenders().find((x) => x.track && x.track.kind === 'audio'); if (snd) snd.replaceTrack(tr); }
    return true;
  }
  muteMic(on) { if (this.v && this.v.mic) this.v.mic.getAudioTracks().forEach((t) => (t.enabled = !on)); }
}
