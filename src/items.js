import * as THREE from 'three';
export const KINDS = ['plank', 'oil', 'kit', 'tire', 'patty', 'burger', 'medkit', 'epipen', 'fuel', 'cola', 'antidote', 'tools', 'club', 'golf'];
// h — полуразмеры физ. коробки, m — масса, reach — дальность подбора, off — вынос центра вперёд при переноске
export const ITEMS = {
  plank:  { n: 'Доска', h: [0.35, 0.06, 4], m: 30, c: 0x9a6a35, reach: 5, off: 3.5 },
  oil:    { n: 'Канистра с маслом', h: [0.15, 0.22, 0.12], m: 6, c: 0xc23a2a, reach: 2.7 },
  kit:    { n: 'Металлолом (ремонт корпуса)', h: [0.25, 0.14, 0.15], m: 5, c: 0x7a7f86, reach: 2.7 },
  tire:   { n: 'Запасное колесо', h: [0.5, 0.5, 0.15], m: 14, c: 0x222222, reach: 2.7 },
  patty:  { n: 'Сырая котлета', h: [0.12, 0.04, 0.12], m: 0.5, c: 0xd77a7a, reach: 2.7, heal: 5 },
  burger: { n: 'Бургер', h: [0.13, 0.09, 0.13], m: 0.5, c: 0xd9a050, reach: 2.7, heal: 35 },
  medkit: { n: 'Аптечка', h: [0.22, 0.12, 0.15], m: 3, c: 0xf2f2f2, reach: 2.7, heal: 60 },
  fuel:   { n: 'Канистра', h: [0.2, 0.25, 0.13], m: 8, c: 0xd4a017, reach: 2.7 },
  cola:   { n: 'Лимонад', h: [0.08, 0.14, 0.08], m: 0.4, c: 0x1e88e5, reach: 2.7, heal: 15 },
  antidote: { n: 'Противоядие', h: [0.05, 0.1, 0.05], m: 0.2, c: 0x7cfc00, reach: 2.7 },
  tools:  { n: 'Ящик инструментов', h: [0.3, 0.18, 0.18], m: 6, c: 0xd32f2f, reach: 2.7 },
  club:   { n: 'Клюшка для гольфа', h: [0.05, 0.05, 0.5], m: 1.5, c: 0xc0c0c0, reach: 3 },
  golf:   { n: 'Мяч для гольфа', h: [0.1, 0.1, 0.1], m: 0.05, c: 0xffffff, reach: 0 },
  epipen: { n: 'EpiPen', h: [0.04, 0.04, 0.1], m: 0.2, c: 0xf2c200, reach: 2.7, heal: 30 },
};
const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
export function createItemMesh(k) {
  const g = new THREE.Group(), d = ITEMS[KINDS[k]], box = (w, h, l, c, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat(c)); m.position.set(x, y, z); g.add(m); return m; };
  switch (KINDS[k]) {
    case 'plank': box(0.7, 0.12, 8, d.c); break;
    case 'oil': box(0.3, 0.44, 0.24, d.c); box(0.1, 0.1, 0.1, 0x111111, 0.05, 0.26, 0); break;
    case 'kit': box(0.5, 0.2, 0.3, d.c); box(0.3, 0.12, 0.2, 0x555a60, 0.05, 0.14, 0); box(0.15, 0.2, 0.1, 0x8a8f96, -0.15, 0.1, 0.05); break;
    case 'tire': { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16).rotateX(Math.PI / 2), mat(d.c)); g.add(t); break; }
    case 'patty': { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12), mat(d.c)); g.add(t); break; }
    case 'burger': { const a = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 6), mat(d.c)); a.scale.y = 0.7; g.add(a); box(0.22, 0.03, 0.22, 0x5a2d12, 0, -0.01, 0); break; }
    case 'medkit': box(0.44, 0.24, 0.3, d.c); box(0.1, 0.26, 0.32, 0xd32f2f); box(0.3, 0.26, 0.1, 0xd32f2f); break;
    case 'fuel': box(0.4, 0.5, 0.26, d.c); box(0.12, 0.1, 0.1, 0x111111, 0.1, 0.3, 0); box(0.3, 0.04, 0.28, 0x333333, 0, 0.1, 0); break;
    case 'cola': { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 10), mat(d.c)); g.add(t); box(0.1, 0.03, 0.1, 0xcccccc, 0, 0.15, 0); break; }
    case 'antidote': { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), mat(d.c)); g.add(t); box(0.04, 0.05, 0.04, 0xffffff, 0, 0.12, 0); break; }
    case 'tools': box(0.6, 0.3, 0.36, d.c); box(0.5, 0.04, 0.12, 0x222222, 0, 0.17, 0); break;
    case 'club': { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 6).rotateX(Math.PI / 2), mat(0xcccccc)); g.add(t); box(0.14, 0.06, 0.12, 0x999999, 0, -0.02, -0.5); break; }
    case 'golf': { const t = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0xffffff)); g.add(t); break; }
    case 'epipen': { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8).rotateX(Math.PI / 2), mat(d.c)); g.add(t); break; }
  }
  return g;
}
