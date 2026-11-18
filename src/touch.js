// Сенсорное управление для телефона/планшета: плавающий джойстик (слева), взгляд свайпом (справа),
// кнопки действий. Эмулирует клавиши класса Input, поэтому хост/сеть менять не нужно.
import { clamp } from './utils.js';

export const isCoarse = () => matchMedia('(pointer:coarse)').matches;
export function goFull() {
  try { const r = document.documentElement; (r.requestFullscreen || r.webkitRequestFullscreen || (() => {})).call(r); screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
}

export class Touch {
  constructor(input, ui) {
    this.input = input; this.ui = ui; this.on = false; this.st = {};
    const root = (this.root = document.createElement('div')); root.id = 'touch'; root.style.display = 'none';
    root.innerHTML = '<div id="look"></div><div id="jbase"></div><div id="jknob"></div>';
    document.getElementById('ui').appendChild(root);
    const grp = (cls) => { const g = document.createElement('div'); g.className = 'tg ' + cls; root.appendChild(g); return g; };
    const mk = (g, label, cls, o) => {
      const b = document.createElement('div'); b.className = 'tb ' + cls; b.textContent = label; g.appendChild(b);
      const up = () => { b.classList.remove('on'); if (o.hold) delete input.k[o.hold]; };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); b.setPointerCapture && b.setPointerCapture(e.pointerId); if (o.hold) input.k[o.hold] = 1; if (o.tap) input.edge(o.tap); if (o.fn) o.fn(); });
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      return b;
    };
    // пешком
    const walk = (this.walk = grp('walk'));
    mk(walk, 'F', 'sm', { tap: 'KeyF' }); mk(walk, 'G', 'sm', { tap: 'KeyG' });
    mk(walk, '🪝', 'sm', { tap: 'KeyQ' }); mk(walk, '⬆', 'md', { hold: 'Space' }); mk(walk, 'E', 'lg', { tap: 'KeyE' });
    // за рулём
    const drive = (this.drive = grp('drive'));
    mk(drive, '▲', 'md', { tap: 'KeyE' }); mk(drive, '▼', 'md', { tap: 'KeyQ' }); mk(drive, 'ПЕРЕДАЧА', 'tag', {});
    mk(drive, '🔑', 'sm', { tap: 'KeyR' }); mk(drive, '💡', 'sm', { tap: 'KeyL' }); mk(drive, '🚪', 'sm', { tap: 'KeyF' });
    mk(drive, '📯', 'md', { hold: 'KeyH' }); mk(drive, '🛑', 'lg', { hold: 'Space' });
    // лебёдка (когда трос зацеплен)
    const wn = (this.winch = grp('winch'));
    mk(wn, 'Перед ⟲', 'sm', { hold: 'BracketRight' }); mk(wn, 'Перед ⟳', 'sm', { hold: 'BracketLeft' });
    mk(wn, 'Зад ⟲', 'sm', { hold: 'KeyB' }); mk(wn, 'Зад ⟳', 'sm', { hold: 'KeyN' });
    // меню: чат/сигналы/сброс/полный экран
    const top = grp('top'), panel = (this.panel = grp('chatp')); panel.style.display = 'none';
    mk(top, '💬', 'sm', { fn: () => (panel.style.display = panel.style.display === 'none' ? 'flex' : 'none') });
    mk(top, '⛶', 'sm', { fn: goFull }); mk(top, '🎤', 'sm', { tap: 'KeyM' }); mk(top, '🏆', 'sm', { tap: 'KeyJ' });
    ['Стой!', 'Цепляй трос!', 'Поехали!', 'Медведь!'].forEach((t, i) => mk(panel, t, 'wide', { fn: () => { input.onEvent({ a: 'sig', v: i }); panel.style.display = 'none'; } }));
    mk(panel, '⌨ Написать', 'wide', { fn: () => { panel.style.display = 'none'; ui.focusChat(); } });
    mk(panel, '↺ RV на чекпоинт', 'wide', { tap: 'Backspace', fn: () => (panel.style.display = 'none') });

    // джойстик + взгляд
    const look = root.querySelector('#look'), base = root.querySelector('#jbase'), knob = root.querySelector('#jknob'), R = 55;
    let jid = null, lid = null, ox = 0, oy = 0, lx = 0, ly = 0;
    const dead = (v) => (Math.abs(v) < 0.12 ? 0 : v);
    look.addEventListener('pointerdown', (e) => {
      e.preventDefault(); look.setPointerCapture(e.pointerId); panel.style.display = 'none';
      if (e.clientX < innerWidth * 0.42 && jid === null) { jid = e.pointerId; ox = e.clientX; oy = e.clientY; base.style.cssText = `display:block;left:${ox}px;top:${oy}px`; knob.style.cssText = `display:block;left:${ox}px;top:${oy}px`; }
      else if (lid === null) { lid = e.pointerId; lx = e.clientX; ly = e.clientY; }
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId === jid) {
        let dx = (e.clientX - ox) / R, dy = (e.clientY - oy) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        input.axis.x = dead(dx); input.axis.y = dead(-dy); knob.style.left = ox + dx * R + 'px'; knob.style.top = oy + dy * R + 'px';
      } else if (e.pointerId === lid) {
        input.yaw -= (e.clientX - lx) * 0.0045; input.pitch = clamp(input.pitch - (e.clientY - ly) * 0.0045, -1.45, 1.45); lx = e.clientX; ly = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === jid) { jid = null; input.axis.x = input.axis.y = 0; base.style.display = knob.style.display = 'none'; }
      if (e.pointerId === lid) lid = null;
    };
    look.addEventListener('pointerup', end); look.addEventListener('pointercancel', end);
  }
  enable(on) { this.on = on; this.root.style.display = on ? 'block' : 'none'; document.body.classList.toggle('touch', on); }
  setState({ driving, winch }) {
    if (this.st.d !== driving) { this.st.d = driving; this.drive.style.display = driving ? 'flex' : 'none'; this.walk.style.display = driving ? 'none' : 'flex'; }
    if (this.st.w !== winch) { this.st.w = winch; this.winch.style.display = winch ? 'flex' : 'none'; }
  }
}
