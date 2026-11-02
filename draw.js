/* Малювання схеми укосу й карти коефіцієнтів (canvas). */
(function (root) {
  'use strict';
  const E = root.SlopeEngine;

  function theme(light) {
    if (light) return { text: '#1c1f24', hint: '#6b7280', line: '#d5d9df', bg: '#ffffff' };
    const cs = getComputedStyle(document.documentElement);
    const v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    return { text: v('--text', '#1c1f24'), hint: v('--hint', '#6b7280'), line: v('--line', '#e2e5ea'), bg: v('--card', '#fff') };
  }

  function setup(cv, w, h) {
    const dpr = w ? 2 : Math.min(window.devicePixelRatio || 1, 3);
    const W = w || cv.clientWidth, H = h || cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W, H };
  }

  function niceStep(range, n) {
    const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  const fmt = (v, d) => (+v).toFixed(d).replace('.', ',').replace('-', '−');

  function kColor(K, kmin, kmax) {
    const t = kmax > kmin ? Math.max(0, Math.min(1, (K - kmin) / (kmax - kmin))) : 0;
    return 'hsl(' + Math.round(t * 230) + ',78%,52%)';
  }

  function layerColor(L, i) {
    const C = (root.SlopePresets && root.SlopePresets.COLORS) || ['#e9c46a'];
    return L.color || C[i % C.length];
  }

  // Схема: model — вхідна модель; o: {res, method, detail(evalCircle з slices), showGrid, light, w, h}
  function drawModel(cv, model, o) {
    o = o || {};
    const { ctx, W, H } = setup(cv, o.w, o.h);
    const th = theme(o.light);
    ctx.fillStyle = o.light ? '#fff' : 'transparent';
    ctx.clearRect(0, 0, W, H);
    if (o.light) ctx.fillRect(0, 0, W, H);
    let M;
    try { M = E.prepare(model); } catch (e) {
      ctx.fillStyle = th.hint; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(e.message, W / 2, H / 2, W - 20);
      return null;
    }
    const res = o.res;
    let G = res ? res.grid : null;
    if (!G) {
      const s = model.search || {};
      const g = s.grid || {};
      G = (s.gridAuto !== false && !(isFinite(parseFloat(g.x1)) && isFinite(parseFloat(g.y2)))) ? E.autoGrid(M)
        : { x1: E.num(g.x1), x2: E.num(g.x2), y1: E.num(g.y1), y2: E.num(g.y2), nx: E.num(g.nx, 20), ny: E.num(g.ny, 20) };
    }
    const showGrid = o.showGrid && G && isFinite(G.x1);
    let x0 = M.xmin, x1 = M.xmax, y0 = M.ybot, y1 = M.ytopMax;
    for (const a of M.anchors) { x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); }
    if (showGrid) { x0 = Math.min(x0, G.x1); x1 = Math.max(x1, G.x2); y1 = Math.max(y1, G.y2); }
    const det = o.detail;
    if (det) y1 = Math.max(y1, det.yc);
    const padL = 40, padB = 24, padT = 12, padR = 12;
    const sc = Math.min((W - padL - padR) / (x1 - x0), (H - padT - padB) / (y1 - y0));
    const ox = padL + ((W - padL - padR) - sc * (x1 - x0)) / 2, oy = H - padB - ((H - padT - padB) - sc * (y1 - y0)) / 2;
    const X = x => ox + (x - x0) * sc, Y = y => oy - (y - y0) * sc;

    // осі
    ctx.font = '11px -apple-system, Roboto, sans-serif';
    ctx.strokeStyle = th.line; ctx.fillStyle = th.hint; ctx.lineWidth = 1;
    const step = niceStep(Math.max(x1 - x0, y1 - y0), 8);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let x = Math.ceil(x0 / step) * step; x <= x1 + 1e-9; x += step) {
      ctx.beginPath(); ctx.moveTo(X(x), Y(y0)); ctx.lineTo(X(x), Y(y0) + 4); ctx.stroke();
      ctx.fillText(fmt(x, step < 1 ? 1 : 0), X(x), Y(y0) + 6);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let y = Math.ceil(y0 / step) * step; y <= y1 + 1e-9; y += step) {
      ctx.beginPath(); ctx.moveTo(X(x0) - 4, Y(y)); ctx.lineTo(X(x0), Y(y)); ctx.stroke();
      ctx.fillText(fmt(y, step < 1 ? 1 : 0), X(x0) - 6, Y(y));
    }

    // карта сітки центрів (кольорові клітинки) або точки сітки
    if (showGrid) {
      const map = res && res.map;
      const nx = G.nx, ny = G.ny, dx = (G.x2 - G.x1) / nx, dy = (G.y2 - G.y1) / ny;
      if (map) {
        const ks = map.flat().filter(v => v != null);
        const kmin = Math.min(...ks), kmax = Math.min(Math.max(...ks), kmin * 2.5);
        ctx.globalAlpha = 0.35;
        for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
          const K = map[j][i]; if (K == null) continue;
          ctx.fillStyle = kColor(K, kmin, kmax);
          const cx = G.x1 + dx * i, cy = G.y1 + dy * j;
          ctx.fillRect(X(cx - dx / 2), Y(cy + dy / 2), dx * sc + 0.5, dy * sc + 0.5);
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = th.hint;
        for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) ctx.fillRect(X(G.x1 + dx * i) - 0.75, Y(G.y1 + dy * j) - 0.75, 1.5, 1.5);
      }
      ctx.strokeStyle = th.hint; ctx.setLineDash([4, 3]);
      ctx.strokeRect(X(G.x1), Y(G.y2), (G.x2 - G.x1) * sc, (G.y2 - G.y1) * sc);
      ctx.setLineDash([]);
    }

    // шари
    const xsSet = new Set();
    const addX = x => { if (x >= M.xmin && x <= M.xmax) xsSet.add(x); };
    M.surface.forEach(p => { addX(p[0]); addX(p[0] - 1e-6); addX(p[0] + 1e-6); });
    M.layers.forEach(L => L.bottom && L.bottom.forEach(p => addX(p[0])));
    for (let i = 0; i <= 400; i++) addX(M.xmin + (M.xmax - M.xmin) * i / 400);
    const xs = Array.from(xsSet).sort((a, b) => a - b);
    const top = xs.map((x, k) => E.polyY(M.surface, x, k && xs[k] - xs[k - 1] < 1e-5 ? 1 : -1));
    let upper = top.slice();
    M.layers.forEach((L, i) => {
      const bot = xs.map((x, k) => L.bottom ? Math.min(Math.max(E.polyY(L.bottom, x, 0), M.ybot), upper[k]) : M.ybot);
      ctx.beginPath();
      xs.forEach((x, k) => k ? ctx.lineTo(X(x), Y(upper[k])) : ctx.moveTo(X(x), Y(upper[k])));
      for (let k = xs.length - 1; k >= 0; k--) ctx.lineTo(X(xs[k]), Y(bot[k]));
      ctx.closePath();
      ctx.fillStyle = layerColor(L, i); ctx.fill();
      if (L.bottom) {
        ctx.beginPath(); xs.forEach((x, k) => k ? ctx.lineTo(X(x), Y(bot[k])) : ctx.moveTo(X(x), Y(bot[k])));
        ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1; ctx.stroke();
      }
      upper = upper.map((u, k) => Math.min(u, bot[k]));
    });
    // включення
    for (const r of M.inclusions) {
      ctx.fillStyle = r.color || '#9e9e9e';
      ctx.fillRect(X(r.x1), Y(r.y2), (r.x2 - r.x1) * sc, (r.y2 - r.y1) * sc);
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeRect(X(r.x1), Y(r.y2), (r.x2 - r.x1) * sc, (r.y2 - r.y1) * sc);
    }
    // контур
    ctx.beginPath();
    M.surface.forEach((p, k) => k ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])));
    ctx.lineTo(X(M.xmax), Y(M.ybot)); ctx.lineTo(X(M.xmin), Y(M.ybot)); ctx.closePath();
    ctx.strokeStyle = o.light ? '#444' : th.text; ctx.lineWidth = 1.4; ctx.stroke();

    // вода
    if (M.water) {
      ctx.beginPath(); M.water.forEach((p, k) => k ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])));
      ctx.strokeStyle = '#1f6feb'; ctx.lineWidth = 2; ctx.stroke();
      const xm = M.water[0][0] + (M.water[M.water.length - 1][0] - M.water[0][0]) * 0.15, ym = E.polyY(M.water, xm, 0);
      ctx.fillStyle = '#1f6feb'; ctx.beginPath();
      ctx.moveTo(X(xm) - 6, Y(ym) - 11); ctx.lineTo(X(xm) + 6, Y(ym) - 11); ctx.lineTo(X(xm), Y(ym) - 2); ctx.closePath(); ctx.fill();
    }
    // навантаження
    for (const l of M.loads) {
      const n = Math.max(2, Math.round((l.x2 - l.x1) * sc / 14));
      const hgt = 22;
      ctx.strokeStyle = '#7a3ce0'; ctx.fillStyle = '#7a3ce0'; ctx.lineWidth = 1.3;
      const ya = x => Y(E.surfY(M, x));
      ctx.beginPath(); ctx.moveTo(X(l.x1), ya(l.x1) - hgt); ctx.lineTo(X(l.x2), ya(l.x2) - hgt); ctx.stroke();
      for (let k = 0; k <= n; k++) {
        const x = l.x1 + (l.x2 - l.x1) * k / n, yb = ya(x) - 1;
        ctx.beginPath(); ctx.moveTo(X(x), yb - hgt); ctx.lineTo(X(x), yb); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(X(x) - 3, yb - 5); ctx.lineTo(X(x) + 3, yb - 5); ctx.lineTo(X(x), yb); ctx.closePath(); ctx.fill();
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = '11px sans-serif';
      ctx.fillText('q = ' + fmt(l.q, 0) + ' кПа', X((l.x1 + l.x2) / 2), ya((l.x1 + l.x2) / 2) - hgt - 2);
    }
    // анкери
    for (const a of M.anchors) {
      const Lb = a.type === 'grouted' ? a.L * a.bondPct / 100 : 0;
      const ex = a.x + a.u[0] * a.L, ey = a.y + a.u[1] * a.L;
      const fx = a.x + a.u[0] * (a.L - Lb), fy = a.y + a.u[1] * (a.L - Lb);
      ctx.lineWidth = 1.6; ctx.strokeStyle = '#333';
      ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(fx), Y(fy)); ctx.stroke();
      if (Lb > 0) { ctx.lineWidth = 3.5; ctx.strokeStyle = '#b5179e'; ctx.beginPath(); ctx.moveTo(X(fx), Y(fy)); ctx.lineTo(X(ex), Y(ey)); ctx.stroke(); }
      ctx.fillStyle = '#333'; ctx.fillRect(X(a.x) - 3, Y(a.y) - 3, 6, 6);
    }

    // критичне коло з відсіками
    if (det) {
      const { xc, yc, R, xl, xr } = det;
      if (det.slices) {
        ctx.strokeStyle = 'rgba(200,30,30,.55)'; ctx.lineWidth = 1;
        const bx = [det.slices[0].xa].concat(det.slices.map(s => s.xb));
        for (const x of bx.slice(1, -1)) {
          ctx.beginPath(); ctx.moveTo(X(x), Y(E.arcY(xc, yc, R, x))); ctx.lineTo(X(x), Y(E.surfY(M, x))); ctx.stroke();
        }
      }
      ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(200,30,30,.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(xl), Y(E.arcY(xc, yc, R, xl))); ctx.lineTo(X(xc), Y(yc)); ctx.lineTo(X(xr), Y(E.arcY(xc, yc, R, xr))); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#d62828'; ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (let k = 0; k <= 160; k++) {
        const x = xl + (xr - xl) * k / 160;
        k ? ctx.lineTo(X(x), Y(E.arcY(xc, yc, R, x))) : ctx.moveTo(X(x), Y(E.arcY(xc, yc, R, x)));
      }
      ctx.stroke();
      ctx.fillStyle = '#d62828';
      ctx.beginPath(); ctx.arc(X(xc), Y(yc), 4, 0, 7); ctx.fill();
      if (det.terms) for (const t of det.terms) { ctx.fillStyle = '#1f6feb'; ctx.beginPath(); ctx.arc(X(t.x), Y(t.y), 4, 0, 7); ctx.fill(); }
      if (o.label) {
        ctx.font = 'bold 14px -apple-system, Roboto, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        const tx = Math.min(X(xc) + 8, W - 120);
        ctx.fillStyle = o.light ? '#fff' : th.bg; const tw = ctx.measureText(o.label).width;
        ctx.globalAlpha = 0.85; ctx.fillRect(tx - 3, Y(yc) - 20, tw + 6, 19); ctx.globalAlpha = 1;
        ctx.fillStyle = '#d62828'; ctx.fillText(o.label, tx, Y(yc) - 3);
      }
    }
    return M;
  }

  // Карта мінімальних K по вузлах сітки центрів
  function drawMap(cv, res, o) {
    o = o || {};
    const { ctx, W, H } = setup(cv, o.w, o.h);
    const th = theme(o.light);
    ctx.clearRect(0, 0, W, H);
    if (o.light) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
    const G = res.grid, map = res.map;
    const ks = map.flat().filter(v => v != null);
    if (!ks.length) return;
    const kmin = Math.min(...ks), kmax = Math.min(Math.max(...ks), kmin * 2.5);
    const padL = 44, padB = 34, padT = 8, padR = 64;
    const nx = G.nx, ny = G.ny;
    const cw = (W - padL - padR) / (nx + 1), ch = (H - padT - padB) / (ny + 1);
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const K = map[j][i];
      ctx.fillStyle = K == null ? (o.light ? '#eee' : th.line) : kColor(K, kmin, kmax);
      ctx.fillRect(padL + i * cw, H - padB - (j + 1) * ch, Math.ceil(cw), Math.ceil(ch));
    }
    const b = res.gridBest && res.gridBest.bishop;
    if (b) {
      const cx = padL + (b.i + 0.5) * cw, cy = H - padB - (b.j + 0.5) * ch;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 5, cy + 5); ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx - 5, cy + 5); ctx.stroke();
    }
    ctx.fillStyle = th.hint; ctx.font = '11px -apple-system, Roboto, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const i of [0, Math.round(nx / 2), nx]) ctx.fillText(fmt(G.x1 + (G.x2 - G.x1) * i / nx, 1), padL + (i + 0.5) * cw, H - padB + 4);
    ctx.fillText('xc, м', padL + (W - padL - padR) / 2, H - padB + 18);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const j of [0, Math.round(ny / 2), ny]) ctx.fillText(fmt(G.y1 + (G.y2 - G.y1) * j / ny, 1), padL - 4, H - padB - (j + 0.5) * ch);
    ctx.save(); ctx.translate(10, padT + (H - padT - padB) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('yc, м', 0, 0); ctx.restore();
    // шкала
    const lx = W - padR + 14, lh = H - padT - padB;
    for (let k = 0; k < lh; k++) { ctx.fillStyle = kColor(kmin + (kmax - kmin) * (1 - k / lh), kmin, kmax); ctx.fillRect(lx, padT + k, 12, 1.5); }
    ctx.fillStyle = th.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(fmt(kmax, 2) + (kmax < Math.max(...ks) ? '+' : ''), lx + 15, padT + 5);
    ctx.fillText(fmt((kmin + kmax) / 2, 2), lx + 15, padT + lh / 2);
    ctx.fillText(fmt(kmin, 3), lx + 15, padT + lh - 5);
    return { kmin, kmax };
  }

  root.SlopeDraw = { drawModel, drawMap, kColor, fmt };
})(typeof self !== 'undefined' ? self : this);
