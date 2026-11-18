import { goFull, isCoarse } from './touch.js';
import { CPS, FINISH_Z } from './world.js';
import { ACH } from './achievements.js';
import { TAPES } from './tapes.js';
const $ = (s) => document.querySelector(s);
const TOTAL = 880 + Math.abs(FINISH_Z);

export class UI {
  constructor() {
    this.onHost = () => {}; this.onJoin = () => {}; this.onChat = () => {}; this.onMic = () => {}; this.achU = []; this.achS = {};
    $('#ui').innerHTML = `
    <div id="menu"><div class="card"><h1>🚐 RV: Доедем до Route 65?</h1>
      <label>Имя</label><input id="name" maxlength="14" value="Турист"/>
      <div class="row"><div><label>Цвет</label><input id="color" type="color" value="#e5533d"/></div>
      <div><label>Шляпа</label><select id="hat"><option value="0">Кепка</option><option value="1">Ковбойская</option><option value="2">Шапка</option><option value="3">Без шляпы</option></select></div></div>
      <button id="host">Создать игру (Host)</button>
      <div class="row"><input id="code" placeholder="ID комнаты" maxlength="6" style="text-transform:uppercase"/><button id="join">Присоединиться</button></div>
      <div id="status"></div>
      <div class="small">📱 Телефон: держите горизонтально. Левая половина экрана — джойстик (за рулём: влево/вправо руль, вверх газ, вниз тормоз), правая — взгляд, кнопки — действия.<br>💻 ПК: WASD — ходьба/руль · E — действие · G — бросить · F — съесть/слезть с водительского · R двигатель · Q/E или 1-5 передачи (0 — задняя, 9 — нейтраль) · Space — ручник · L фары · H/ЛКМ клаксон · [ ] или T/Y — передняя лебёдка, B/N — задняя · Z X C V — быстрые сигналы · Enter — чат · Backspace — вернуть RV на чекпоинт<br>🪝 Q — бросить крюк лебёдки в прицел · 🌿 тарзанка у высоких столбов · 📼 71 кассета (магнитофон на столе) · 👒 шляпы (шкаф) · ⛳ гольф у лагеря · 🎤 M — голосовой чат (громкость по расстоянию) · 🏆 J — достижения · 🍔 котлеты из холодильника — на плиту · 🌙 ночью включайте фары (L).</div></div></div>
    <div id="hud" style="display:none"><div id="cross"></div><div id="prompt"></div><div id="loc"></div>
      <div id="room">Комната: <b id="rc"></b><button id="copy">Копировать</button></div>
      <div id="help">WASD · E действие · G бросить · F использовать<br>Руль: R мотор · Q/E передачи · Space ручник · L фары · H клаксон<br>Лебёдка: [ ] / T Y (перед), B N (зад)<br>Z X C V сигналы · Enter чат · Backspace сброс RV</div>
      <div id="winch"></div><div id="toast"></div>
      <div id="chat"><div id="log"></div><input id="chatin" maxlength="120" placeholder="Сообщение… (Enter)"/></div>
      <div id="stats"><div class="bar"><i id="hpb" style="background:#e53935"></i><span>Здоровье</span></div><div class="bar"><i id="rvb" style="background:#fb8c00"></i><span id="rvt">Двигатель</span></div><div class="bar"><i id="hub" style="background:#fdd835"></i><span>Корпус</span></div></div>
      <div id="chips"></div><div id="tools"><button id="mic" title="Голосовой чат (M)">🎤</button><button id="achb" title="Достижения (J)">🏆</button></div>
      <div id="achp" style="display:none"></div><div id="mirs"></div>
      <div id="prog"><div id="ptrack"><i id="pdot"></i></div><span id="pt"></span></div>
      <div id="speedo"><b id="spd">0</b> км/ч<div id="gear"></div></div></div>`;
    CPS.slice(1).concat([{ z: FINISH_Z, name: 'Финиш' }]).forEach((c) => { const m = document.createElement('b'); m.className = 'pm'; m.style.left = ((880 - c.z) / TOTAL) * 100 + '%'; m.title = c.name; $('#ptrack').appendChild(m); });
    $('#host').onclick = () => { isCoarse() && goFull(); this.onHost(this.profile()); };
    $('#join').onclick = () => { const c = $('#code').value.trim(); if (c) { isCoarse() && goFull(); this.onJoin(c, this.profile()); } else this.status('Введите ID комнаты'); };
    $('#mic').onclick = () => this.onMic(); $('#achb').onclick = () => this.toggleAch();
    $('#copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText($('#rc').textContent); this.toast('ID скопирован', 1500); };
    const ci = $('#chatin');
    ci.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { if (ci.value.trim()) this.onChat(ci.value.trim()); ci.value = ''; ci.style.display = 'none'; ci.blur(); } if (e.key === 'Escape') { ci.style.display = 'none'; ci.blur(); } });
    this.lastNc = {}; this.toastT = 0;
  }
  profile() { return { name: $('#name').value.trim() || 'Игрок', color: $('#color').value, hat: +$('#hat').value }; }
  status(t) { $('#status').textContent = t; }
  showHud(code) { $('#menu').style.display = 'none'; $('#hud').style.display = 'block'; $('#rc').textContent = code; }
  focusChat() { const ci = $('#chatin'); ci.style.display = 'block'; ci.focus(); }
  addChat(n, t) { const l = $('#log'), d = document.createElement('div'); d.textContent = n + ': ' + t; l.appendChild(d); while (l.children.length > 7) l.firstChild.remove(); setTimeout(() => d.remove(), 20000); }
  toast(t, ms = 3000) { const e = $('#toast'); e.textContent = t; clearTimeout(this.toastT); this.toastT = setTimeout(() => (e.textContent = ''), ms); }
  setMic(st) { $('#mic').textContent = st === 'on' ? '🎤' : st === 'muted' ? '🔇' : '🎤✖'; $('#mic').style.background = st === 'on' ? '#43a047' : ''; }
  setAch(u, s) { this.achU = u; this.achS = s; if ($('#achp').style.display !== 'none') this.renderAch(); }
  toggleAch() { const e = $('#achp'); e.style.display = e.style.display === 'none' ? 'block' : 'none'; if (e.style.display === 'block') this.renderAch(); }
  renderAch() {
    const got = new Set(this.achU), s = this.achS;
    $('#achp').innerHTML = '<h3>🏆 Достижения ' + got.size + '/' + ACH.length + '</h3><div class="al">' + ACH.map((a) => { const v = Math.min(a.need, s[a.stat] || 0), ok = got.has(a.id); return '<div class="a' + (ok ? ' ok' : '') + '"><b>' + (ok ? '✔ ' : '') + a.name + '</b><br>' + a.desc + (ok ? '' : ' <i>(' + (Math.round(v * 10) / 10) + '/' + a.need + ')</i>') + '</div>'; }).join('') + '</div>';
  }
  showTape(id) { if (id < 0) { this.toast('📼 Магнитофон выключен', 2000); return; } const t = TAPES[id]; this.toast('📼 №' + (id + 1) + (t.type === 'music' ? ' — играет: ' + t.title : ' — ' + t.title + '\n' + t.text), 9000); }
  setMirrors(rects) { const m = $('#mirs'); if (!rects) { m.innerHTML = ''; this.mirOn = false; return; } if (this.mirOn) return; this.mirOn = true; m.innerHTML = rects.map((r) => `<div class="mir" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px"><span>${r.label}</span></div>`).join(''); }
  update(s, me, biome, tod) {
    const r = s.rv, p = s.pl.find((x) => x.id === me); if (!p) return;
    $('#prompt').textContent = document.body.classList.contains('touch') ? (p.pr || '').replace('[E]', 'Кнопка E:') : p.pr || '';
    $('#hpb').style.width = p.hp + '%'; $('#rvb').style.width = r.hp + '%'; $('#hub').style.width = r.hu + '%';
    const bad = r.wk.filter((x) => !x).length; $('#rvt').textContent = 'Двигатель' + (bad ? ' · колёса: −' + bad : '') + (r.hp <= 0 ? ' · РАЗБИТ' : '');
    $('#chips').textContent = [p.pz ? '☠ Яд — нужно противоядие' : '', p.bs ? '⚡ Бодрость' : '', p.dd ? '🪦 Вы погибли — ждите воскрешения у АЗС' : '', p.sw ? '🌿 Тарзанка: Space — отпустить' : ''].filter(Boolean).join('   ·   ');
    $('#achb').textContent = '🏆 ' + s.ac + '/96';
    $('#spd').textContent = Math.abs(r.s); $('#gear').textContent = 'Передача: ' + (r.g < 0 ? 'R' : r.g === 0 ? 'N' : r.g) + (r.e ? ' · мотор ' + Math.round(r.rpm / 100) / 10 + 'k' : ' · мотор выкл.') + (r.l ? ' · 💡' : '');
    $('#loc').textContent = biome + ' · ' + tod + ' · чекпоинт ' + s.cp + '/3' + (s.fin ? ' · 🏁 ФИНИШ!' : '') + ' · 📼 ' + s.tg.length + '/71';
    const z = r.p[2], nz = s.cp + 1 < CPS.length ? CPS[s.cp + 1].z : FINISH_Z;
    $('#pdot').style.left = Math.max(0, Math.min(100, ((880 - z) / TOTAL) * 100)) + '%'; $('#pt').textContent = s.fin ? 'Финиш!' : 'До ' + (s.cp + 1 < CPS.length ? 'чекпоинта' : 'финиша') + ': ' + Math.max(0, Math.round(z - nz)) + ' м';
    const w = s.wn.map((x, i) => (x[0] ? (i ? 'Задняя' : 'Передняя') + ' лебёдка: ' + (x[0] === 1 ? 'крюк в руках' : 'зацеплена, трос ' + x[5].toFixed(1) + ' м, натяжение ' + Math.round(x[6] / 100) / 10 + ' кН') : '')).filter(Boolean);
    const wn = $('#winch'); wn.style.display = w.length ? 'block' : 'none'; wn.innerHTML = w.join('<br>');
    if (p.nc !== (this.lastNc[me] || 0)) { this.lastNc[me] = p.nc; if (p.nt) this.toast(p.nt); }
    if (s.fin && !this.fin) { this.fin = 1; this.toast('🎉 Route 65! Вы доехали!', 8000); }
    if (p.dn) this.toast('Вы упали — ждём помощи…', 500);
  }
}
