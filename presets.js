/* Готові моделі: роботи з САПР (ПР 2–4, РГР) і еталонні приклади для перевірки.
   expect — з чим звіряємо (тести й README). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SlopePresets = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // «Add Support Pattern» у Slide: анкери від p1 до p2 по поверхні з кроком уздовж схилу
  function anchorPattern(p1, p2, step, props) {
    const [x1, y1] = p1, [x2, y2] = p2;
    const L = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.floor(L / step + 1e-6) + 1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = L > 0 ? step * i / L : 0;
      out.push(Object.assign({ x: +(x1 + (x2 - x1) * t).toFixed(3), y: +(y1 + (y2 - y1) * t).toFixed(3) }, props));
    }
    return out;
  }

  const COLORS = ['#e9c46a', '#8ab17d', '#e76f51', '#90a4c8', '#c9a27e', '#b5838d'];
  const CONCRETE = { name: 'бетон', gamma: 25, c: 10000, phi: 0, color: '#9e9e9e' };
  const search = (o) => Object.assign({ slices: 25, radii: 50, refine: true, direction: 'auto', gridAuto: true, grid: { nx: 20, ny: 20 } }, o || {});
  const grid = (x1, x2, y1, y2) => ({ gridAuto: false, grid: { x1, x2, y1, y2, nx: 20, ny: 20 } });

  // ---- САПР: моделі з робіт студента ----
  const pr2 = {
    title: 'ПР 2. Схил + будівля (заняття)',
    surface: [[0, 30], [50, 30], [80, 50], [130, 50]], ybot: 0,
    layers: [
      { name: 'супісок', gamma: 17.8, c: 6, phi: 20, color: COLORS[0], bottom: [[0, 34.5], [130, 34.5]] },
      { name: 'пісок гравелистий', gamma: 16.4, c: 0.1, phi: 38, color: COLORS[1] }
    ],
    inclusions: [Object.assign({ x1: 92, x2: 116, y1: 47, y2: 50 }, CONCRETE, { name: 'фундамент (бетон)' })],
    loads: [{ x1: 92, x2: 116, q: 65 }],
    water: { enabled: false, line: [], gammaW: 9.81 },
    anchors: [], anchorMode: 'active',
    search: search(grid(30.5, 65.3, 52.4, 87.3)),
    required: 1.2
  };

  const wall = JSON.parse(JSON.stringify(pr2));
  wall.title = 'ПР 3. Стіна в ґрунті біля бровки';
  wall.inclusions.push(Object.assign({ x1: 80, x2: 81.5, y1: 31, y2: 50 }, CONCRETE, { name: 'стіна (бетон)' }));

  const ANCH_TUT = { type: 'grouted', angle: 10, length: 15, bondPct: 50, bond: 15, tensile: 100, plate: 100, spacing: 1 };
  const pr4 = {
    title: 'ПР 4. Анкери (Slide Tutorial 06)',
    surface: [[20, 25], [30, 25], [50, 35], [70, 35]], ybot: 20,
    layers: [{ name: 'ґрунт', gamma: 20, c: 3, phi: 19.6, color: COLORS[0] }],
    inclusions: [], loads: [], water: { enabled: false, line: [], gammaW: 9.81 },
    anchors: anchorPattern([45, 32.5], [34, 27], 3, ANCH_TUT), anchorMode: 'active',
    search: search(grid(22, 62, 36, 76)),
    required: 1.2
  };

  const pr4own = JSON.parse(JSON.stringify(pr2));
  pr4own.title = 'ПР 4. Анкери на схилі з ПР 2';
  pr4own.anchors = anchorPattern([78, 48.67], [56, 34], 3, { type: 'grouted', angle: 15, length: 20, bondPct: 50, bond: 15, tensile: 100, plate: 100, spacing: 1 });
  pr4own.anchorMode = 'passive';
  pr4own.search = search(grid(30, 70, 52, 100));

  // РГР «Стійкість ґрунтового укосу», варіант 8 (параметри з rgr.py)
  const G = 9.81;
  function rgr(cSlope) {
    const H = 15.5, A = 5.5, B = 7.5, D = 1.3, Q = 170;
    const xcr = 39.5, ycr = 45.5, xt = xcr - cSlope, ylay = ycr - H / 3;
    return {
      title: cSlope === 9.5 ? 'РГР, варіант 8: вихідний укіс' : 'РГР, варіант 8: укіс із закладенням ' + String(cSlope).replace('.', ',') + ' м',
      surface: [[0, 30], [xt, 30], [xcr, ycr], [90, ycr]], ybot: 0,
      layers: [
        { name: 'суглинок (№8)', gamma: +(1.96 * G).toFixed(4), c: 18, phi: 18, color: COLORS[4], bottom: [[0, +ylay.toFixed(4)], [90, +ylay.toFixed(4)]] },
        { name: 'пісок дрібний (№18)', gamma: +(1.82 * G).toFixed(4), c: 0.1, phi: 29, color: COLORS[0] }
      ],
      inclusions: [Object.assign({ x1: xcr + A, x2: xcr + A + B, y1: +(ycr - D).toFixed(4), y2: ycr }, CONCRETE, { name: 'фундамент (бетон)' })],
      loads: [{ x1: xcr + A, x2: xcr + A + B, q: Q }],
      water: { enabled: false, line: [], gammaW: 9.81 },
      anchors: [], anchorMode: 'active',
      search: cSlope === 9.5 ? search(grid(15, 50, 46, 85)) : search(grid(xt - 40, xcr + 10, 46, 170)),
      required: 1.2
    };
  }

  // ---- Еталонні приклади (Rocscience Slide2 Verification Manual) ----
  const acads1a = {
    title: 'Еталон: ACADS 1(a), однорідний укіс',
    surface: [[20, 25], [30, 25], [50, 35], [70, 35]], ybot: 20,
    layers: [{ name: 'ґрунт', gamma: 20, c: 3, phi: 19.6, color: COLORS[0] }],
    inclusions: [], loads: [], water: { enabled: false, line: [], gammaW: 9.81 }, anchors: [], anchorMode: 'active',
    search: search(grid(22.8, 43.7, 42.3, 62.6)), required: 1.0
  };
  const acads1c = {
    title: 'Еталон: ACADS 1(c), три шари',
    surface: [[20, 25], [30, 25], [50, 35], [70, 35]], ybot: 20,
    layers: [
      { name: 'ґрунт 1', gamma: 19.5, c: 0, phi: 38, color: COLORS[0], bottom: [[20, 25], [30, 25], [40, 27], [50, 29], [54, 31], [70, 31]] },
      { name: 'ґрунт 2', gamma: 19.5, c: 5.3, phi: 23, color: COLORS[1], bottom: [[20, 25], [30, 25], [40, 27], [52, 24], [70, 24]] },
      { name: 'ґрунт 3', gamma: 19.5, c: 7.2, phi: 20, color: COLORS[2] }
    ],
    inclusions: [], loads: [], water: { enabled: false, line: [], gammaW: 9.81 }, anchors: [], anchorMode: 'active',
    search: search(), required: 1.0
  };
  const arai1 = {
    title: 'Еталон: Arai & Tagyo (1985), приклад 1',
    surface: [[0, 15], [18, 15], [48, 35], [66, 35]], ybot: 0,
    layers: [{ name: 'ґрунт', gamma: 18.82, c: 41.65, phi: 15, color: COLORS[0] }],
    inclusions: [], loads: [], water: { enabled: false, line: [], gammaW: 9.81 }, anchors: [], anchorMode: 'active',
    search: search(), required: 1.0
  };
  const arai3 = JSON.parse(JSON.stringify(arai1));
  arai3.title = 'Еталон: Arai & Tagyo (1985), приклад 3, РҐВ';
  arai3.water = { enabled: true, line: [[0, 15], [18, 15], [30, 23], [48, 29], [66, 32]], gammaW: 9.81 };
  const yamagami = {
    title: 'Еталон: Yamagami & Ueta (1988)',
    surface: [[0, 5], [5, 5], [15, 10], [25, 10]], ybot: 0,
    layers: [{ name: 'ґрунт', gamma: 17.64, c: 9.8, phi: 10, color: COLORS[0] }],
    inclusions: [], loads: [], water: { enabled: false, line: [], gammaW: 9.81 }, anchors: [], anchorMode: 'active',
    search: search(), required: 1.0
  };
  // Duncan & Wright (2005), рис. 6.34: глинистий укіс φ = 0 з одним анкером 9000 lb/ft.
  // Переведено з футів у SI (коефіцієнт стійкості від одиниць не залежить).
  const FT = 0.3048, PSF = 0.0478803, PCF = 0.157087, LBFT = 0.0145939;
  const duncan = {
    title: 'Еталон: Duncan & Wright, анкер (φ = 0)',
    surface: [[15 * FT, 10 * FT], [25 * FT, 30 * FT], [57 * FT, 30 * FT]].map(p => p.map(v => +v.toFixed(4))), ybot: +(10 * FT).toFixed(4),
    layers: [{ name: 'насичена глина', gamma: +(98 * PCF).toFixed(4), c: +(350 * PSF).toFixed(4), phi: 0, color: COLORS[0] }],
    inclusions: [], loads: [], water: { enabled: false, line: [], gammaW: 9.81 },
    anchors: [{ type: 'end', x: +(20 * FT).toFixed(4), y: +(20 * FT).toFixed(4), angle: 0, length: +(37 * FT).toFixed(4), bondPct: 50, bond: 0, tensile: +(9000 * LBFT).toFixed(3), plate: 0, spacing: 1 }],
    anchorMode: 'active',
    search: search(), required: 1.0
  };

  const list = [
    { id: 'pr2', group: 'САПР', model: pr2, expect: { bishop: 0.867, src: 'власна програма (ПР 2), Slide на занятті — 0,872' } },
    { id: 'wall', group: 'САПР', model: wall, expect: { bishop: 0.894, src: 'власна програма (ПР 3)' } },
    { id: 'pr4', group: 'САПР', model: pr4, expect: { bishop: 1.462, none: 0.988, passive: 1.459, src: 'ПР 4 (власна програма); Slide у методичці: без анкерів 0,982, з анкерами 1,391 (некругові поверхні)' } },
    { id: 'pr4own', group: 'САПР', model: pr4own, expect: { bishop: 1.623, active: 1.960, src: 'ПР 4, ч. 2 (власна програма)' } },
    { id: 'rgr', group: 'САПР', model: rgr(9.5), expect: { bishop: 0.395, src: 'РГР (власна програма)' } },
    { id: 'rgr35', group: 'САПР', model: rgr(35), expect: { bishop: 1.287, src: 'РГР (власна програма)' } },
    { id: 'acads1a', group: 'Еталони', model: acads1a, expect: { bishop: 0.987, ref: 1.00, src: 'Slide2 Verification #1; рекомендована відповідь ACADS 1,00' } },
    { id: 'acads1c', group: 'Еталони', model: acads1c, expect: { bishop: 1.405, ref: 1.39, src: 'Slide2 Verification #3; середнє Бішопа (16 програм) 1,406' } },
    { id: 'arai1', group: 'Еталони', model: arai1, expect: { bishop: 1.409, ref: 1.451, src: 'Slide2 Verification #14; Arai & Tagyo (Бішоп) 1,451' } },
    { id: 'arai3', group: 'Еталони', model: arai3, expect: { bishop: 1.118, janbu: 1.046, ref: 1.138, src: 'Slide2 Verification #16; Arai & Tagyo (Бішоп) 1,138' } },
    { id: 'yamagami', group: 'Еталони', model: yamagami, expect: { bishop: 1.344, fellenius: 1.278, ref: 1.348, src: 'Slide2 Verification #17; Yamagami & Ueta: Бішоп 1,348, Феленіус 1,282' } },
    { id: 'duncan', group: 'Еталони', model: duncan, expect: { bishop: 1.531, passive: 1.324, ref: 1.51, src: 'Slide2 Verification #85; Duncan & Wright: active 1,51, passive 1,32' } }
  ];

  return { list, anchorPattern, COLORS, CONCRETE, get: id => list.find(p => p.id === id) };
});
