/* Розрахунок стійкості ґрунтового укосу методом граничної рівноваги.
   Кругоциліндричні поверхні ковзання, метод відсіків: Феленіус (звичайний),
   Бішоп спрощений, Янбу спрощений (без поправки f0). Пошук критичного кола —
   сітка центрів × радіуси (як Grid Search у Slide) з уточненням.
   Працює в браузері (window.SlopeEngine), у Web Worker і в Node (require). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SlopeEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const D2R = Math.PI / 180;
  const EPS = 1e-9;
  const METHODS = ['bishop', 'janbu', 'fellenius'];

  // ---------- полілінії ----------

  // y(x) ламаної, точки зліва направо; вертикальні уступи (дві точки з однаковим x) дозволені.
  // bias: -1 — значення зліва від уступу, +1 — справа, 0 — перший відрізок, що містить x.
  function polyY(pts, x, bias) {
    const n = pts.length;
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    if (bias > 0) {
      for (let i = n - 2; i >= 0; i--) {
        const a = pts[i], b = pts[i + 1];
        if (b[0] > a[0] && a[0] <= x && x < b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (b[0] > a[0] && a[0] <= x && x <= b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
    }
    return pts[n - 1][1];
  }

  // перетини кола з ламаною; тільки нижня половина кола (y <= yc)
  function circlePolyX(pts, xc, yc, R) {
    const xs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const dx = x2 - x1, dy = y2 - y1;
      const fx = x1 - xc, fy = y1 - yc;
      const a = dx * dx + dy * dy;
      if (a < EPS) continue;
      const b = 2 * (fx * dx + fy * dy);
      const c = fx * fx + fy * fy - R * R;
      const D = b * b - 4 * a * c;
      if (D < 0) continue;
      const sD = Math.sqrt(D);
      for (const p of [(-b - sD) / (2 * a), (-b + sD) / (2 * a)]) {
        if (p >= -1e-12 && p <= 1 + 1e-12) {
          const y = y1 + p * dy;
          if (y <= yc + 1e-9) xs.push(x1 + p * dx);
        }
      }
    }
    xs.sort((a, b) => a - b);
    const out = [];
    for (const x of xs) if (!out.length || x - out[out.length - 1] > 1e-7) out.push(x);
    return out;
  }

  // ---------- модель ----------

  function num(v, d) { const x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v; return Number.isFinite(x) ? x : d; }

  function cleanPts(pts) {
    return (pts || []).map(p => [num(p[0], NaN), num(p[1], NaN)]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }

  function matOf(m, i) {
    const phi = num(m.phi, 0);
    return {
      id: i, name: m.name || ('Ґрунт ' + (i + 1)), color: m.color,
      gamma: num(m.gamma, 18), gammaSat: m.gammaSat === '' || m.gammaSat == null ? null : num(m.gammaSat, null),
      c: num(m.c, 0), phi, tanphi: Math.tan(phi * D2R)
    };
  }

  // Перевіряє й готує модель до розрахунку. Кидає Error з українським текстом.
  function prepare(input) {
    const M = { warnings: [] };
    M.surface = cleanPts(input.surface);
    if (M.surface.length < 2) throw new Error('Поверхня укосу: потрібно щонайменше 2 точки.');
    for (let i = 1; i < M.surface.length; i++)
      if (M.surface[i][0] < M.surface[i - 1][0]) throw new Error('Поверхня: точки мають іти зліва направо (x не спадає).');
    M.xmin = M.surface[0][0];
    M.xmax = M.surface[M.surface.length - 1][0];
    if (M.xmax - M.xmin <= 0) throw new Error('Поверхня: модель має нульову ширину.');
    M.span = M.xmax - M.xmin;
    const ys = M.surface.map(p => p[1]);
    M.ytopMax = Math.max(...ys);
    M.ytopMin = Math.min(...ys);
    M.ybot = num(input.ybot, M.ytopMin - (M.ytopMax - M.ytopMin));
    if (M.ybot > M.ytopMin + 1e-9) throw new Error('Низ моделі не може бути вище за найнижчу точку поверхні.');

    const layers = input.layers || [];
    if (!layers.length) throw new Error('Додайте хоча б один ґрунт.');
    M.layers = layers.map((L, i) => {
      const m = matOf(L, i);
      const last = i === layers.length - 1;
      m.bottom = last ? null : cleanPts(L.bottom);
      if (!last && m.bottom.length < 2) throw new Error('Шар «' + m.name + '»: задайте нижню межу (щонайменше 2 точки) або зробіть його останнім.');
      if (m.bottom) for (let k = 1; k < m.bottom.length; k++)
        if (m.bottom[k][0] < m.bottom[k - 1][0]) throw new Error('Межа шару «' + m.name + '»: точки мають іти зліва направо.');
      if (m.phi < 0 || m.phi >= 90) throw new Error('Шар «' + m.name + '»: кут φ має бути від 0 до 90°.');
      if (m.gamma <= 0) throw new Error('Шар «' + m.name + '»: γ має бути більше 0.');
      return m;
    });
    M.inclusions = (input.inclusions || []).map((r, i) => {
      const m = matOf(r, 100 + i);
      m.name = r.name || ('Включення ' + (i + 1));
      m.x1 = Math.min(num(r.x1, 0), num(r.x2, 0)); m.x2 = Math.max(num(r.x1, 0), num(r.x2, 0));
      m.y1 = Math.min(num(r.y1, 0), num(r.y2, 0)); m.y2 = Math.max(num(r.y1, 0), num(r.y2, 0));
      return m;
    }).filter(r => r.x2 > r.x1 && r.y2 > r.y1);

    const w = input.water || {};
    M.gw = num(w.gammaW, 9.81);
    M.water = w.enabled && cleanPts(w.line).length >= 2 ? cleanPts(w.line) : null;
    M.loads = (input.loads || []).map(l => ({ x1: Math.min(num(l.x1, 0), num(l.x2, 0)), x2: Math.max(num(l.x1, 0), num(l.x2, 0)), q: num(l.q, 0) }))
      .filter(l => l.x2 > l.x1 && l.q !== 0);

    const s = input.search || {};
    const dirIn = s.direction || 'auto';
    if (dirIn === 'left') M.dir = 1;
    else if (dirIn === 'right') M.dir = -1;
    else M.dir = M.surface[M.surface.length - 1][1] >= M.surface[0][1] ? 1 : -1;
    // dir = +1: маса сповзає вліво (бровка праворуч), dir = -1: вправо

    M.anchorMode = input.anchorMode === 'passive' ? 'passive' : 'active';
    M.anchors = (input.anchors || []).map(a => {
      const ang = num(a.angle, 0) * D2R;
      return {
        type: a.type === 'end' ? 'end' : 'grouted',
        x: num(a.x, 0), y: num(a.y, 0), angle: num(a.angle, 0),
        u: [M.dir * Math.cos(ang), -Math.sin(ang)],
        L: num(a.length, 10), bondPct: num(a.bondPct, 50), bond: num(a.bond, 0),
        T: num(a.tensile, 100), plate: num(a.plate, 100), S: Math.max(num(a.spacing, 1), 1e-6)
      };
    }).filter(a => a.L > 0);
    if (M.anchors.length && M.anchors.some(a => a.y < polyY(M.surface, a.x) - 0.5))
      M.warnings.push('Головка одного з анкерів нижче поверхні більш ніж на 0,5 м — перевірте точки анкерів.');

    // x, на яких мають бути межі відсіків
    const xb = [];
    M.surface.forEach(p => xb.push(p[0]));
    M.inclusions.forEach(r => xb.push(r.x1, r.x2));
    M.loads.forEach(l => xb.push(l.x1, l.x2));
    M.layers.forEach(L => L.bottom && L.bottom.forEach(p => xb.push(p[0])));
    if (M.water) M.water.forEach(p => xb.push(p[0]));
    M.xbreaks = Array.from(new Set(xb.map(v => +v.toFixed(9)))).sort((a, b) => a - b);

    M.opts = {
      slices: Math.max(3, Math.round(num(s.slices, 25))),
      malphaMin: num(s.malphaMin, 0.2),
      minWidth: num(s.minWidth, Math.max(0.05, 0.005 * M.span)),
      minDepth: num(s.minDepth, 0),
      noLayerSplit: !!s.noLayerSplit
    };
    return M;
  }

  function surfY(M, x, bias) { return polyY(M.surface, x, bias || 0); }
  function waterY(M, x) { return M.water ? polyY(M.water, x, 0) : -Infinity; }

  function inRect(r, x, y) { return x >= r.x1 - EPS && x <= r.x2 + EPS && y >= r.y1 - EPS && y <= r.y2 + EPS; }

  function materialAt(M, x, y) {
    for (const r of M.inclusions) if (inRect(r, x, y)) return r;
    for (const L of M.layers) if (!L.bottom || y >= polyY(L.bottom, x, 0)) return L;
    return M.layers[M.layers.length - 1];
  }

  // вага вертикального стовпчика ґрунту (кН/м²) між yb і ys у точці x
  function columnWeight(M, x, yb, ys) {
    if (ys <= yb) return 0;
    const br = [yb, ys];
    for (const L of M.layers) if (L.bottom) { const y = polyY(L.bottom, x, 0); if (y > yb && y < ys) br.push(y); }
    for (const r of M.inclusions) if (x >= r.x1 - EPS && x <= r.x2 + EPS) { if (r.y1 > yb && r.y1 < ys) br.push(r.y1); if (r.y2 > yb && r.y2 < ys) br.push(r.y2); }
    const yw = waterY(M, x);
    if (yw > yb && yw < ys) br.push(yw);
    br.sort((a, b) => a - b);
    let w = 0;
    for (let i = 0; i < br.length - 1; i++) {
      const dy = br[i + 1] - br[i];
      if (dy <= 0) continue;
      const ym = 0.5 * (br[i] + br[i + 1]);
      const m = materialAt(M, x, ym);
      const g = (ym < yw && m.gammaSat != null) ? m.gammaSat : m.gamma;
      w += g * dy;
    }
    if (yw > ys) w += M.gw * (yw - ys); // вода над поверхнею — як вертикальне навантаження
    return w;
  }

  // ---------- коло ----------

  function arcY(xc, yc, R, x) { return yc - Math.sqrt(Math.max(R * R - (x - xc) * (x - xc), 0)); }

  // межі маси, що сповзає (xl, xr) або null
  function slipMass(M, xc, yc, R) {
    const xs = circlePolyX(M.surface, xc, yc, R);
    if (xs.length < 2) return null;
    let best = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const xm = 0.5 * (xs[i] + xs[i + 1]);
      if (Math.abs(xm - xc) >= R) continue;
      if (arcY(xc, yc, R, xm) < surfY(M, xm) - 1e-6) {
        if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
      }
    }
    if (!best || best[1] - best[0] < M.opts.minWidth) return null;
    if (best[0] < M.xmin - 1e-6 || best[1] > M.xmax + 1e-6) return null;
    const xlow = Math.min(Math.max(xc, best[0]), best[1]);
    if (arcY(xc, yc, R, xlow) < M.ybot - 1e-6) return null;
    return best;
  }

  // Відсіки. n рівних + додаткові межі у вершинах поверхні, шарів, води, навантажень,
  // включень і в точках перетину кола з межами шарів (основа відсіку — в одному ґрунті).
  function makeSlices(M, xc, yc, R, xl, xr) {
    const n = M.opts.slices;
    const xb = [];
    for (let i = 0; i <= n; i++) xb.push(xl + (xr - xl) * i / n);
    for (const x of M.xbreaks) if (x > xl && x < xr) xb.push(x);
    if (!M.opts.noLayerSplit) for (const L of M.layers) if (L.bottom) for (const x of circlePolyX(L.bottom, xc, yc, R)) if (x > xl && x < xr) xb.push(x);
    for (const r of M.inclusions) for (const y of [r.y1, r.y2]) {
      const d = R * R - (y - yc) * (y - yc);
      if (y < yc && d > 0) for (const x of [xc - Math.sqrt(d), xc + Math.sqrt(d)]) if (x > xl && x < xr && x > r.x1 && x < r.x2) xb.push(x);
    }
    xb.sort((a, b) => a - b);
    const tol = 1e-6 * Math.max(1, M.span);
    const bnd = [];
    for (const x of xb) if (!bnd.length || x - bnd[bnd.length - 1] > tol) bnd.push(x);
    bnd[bnd.length - 1] = xr;

    const out = [];
    for (let i = 0; i < bnd.length - 1; i++) {
      const xa = bnd[i], xbb = bnd[i + 1], b = xbb - xa;
      if (b <= tol) continue;
      const xm = 0.5 * (xa + xbb);
      const ya = arcY(xc, yc, R, xa), yb2 = arcY(xc, yc, R, xbb), ym = arcY(xc, yc, R, xm);
      const ta = surfY(M, xa, 1), tb = surfY(M, xbb, -1), tm = surfY(M, xm, 0);
      // вага: Сімпсон по ширині відсіку (межі шарів усередині відсіку лінійні)
      const Wsoil = b / 6 * (columnWeight(M, xa, ya, ta) + 4 * columnWeight(M, xm, ym, tm) + columnWeight(M, xbb, yb2, tb));
      let Q = 0;
      for (const l of M.loads) { const ov = Math.min(xbb, l.x2) - Math.max(xa, l.x1); if (ov > 0) Q += l.q * ov; }
      const araw = Math.atan2(yb2 - ya, b);
      const alpha = M.dir > 0 ? araw : -araw;
      const l = Math.hypot(b, yb2 - ya);
      const mat = materialAt(M, xm, ym + 1e-4);
      const yw = waterY(M, xm);
      const u = M.water ? M.gw * Math.max(0, yw - ym) : 0;
      out.push({
        xa, xb: xbb, b, xm, yb: ym, ytop: tm, h: Math.max(0, tm - ym),
        Wsoil, Q, W: Wsoil + Q, alpha, sin: Math.sin(alpha), cos: Math.cos(alpha), l,
        c: mat.c, phi: mat.phi, tanphi: mat.tanphi, u, mat: mat.name
      });
    }
    return out;
  }

  // ---------- анкери (ґрунтовий анкер / Grouted Tieback, як у Slide) ----------

  function anchorForce(a, s) {
    if (a.type === 'end') return { F: a.T / a.S, mode: 'розрив' };
    const Lb = a.L * a.bondPct / 100, free = a.L - Lb;
    const behind = s <= free ? Lb : a.L - s;         // зчеплена довжина за поверхнею ковзання
    const inside = Math.max(0, s - free);            // зчеплена довжина в масі, що сповзає
    const pull = a.bond * behind, strip = a.plate + a.bond * inside;
    const F = Math.min(a.T, pull, strip);
    const mode = F === a.T ? 'розрив' : (F === pull ? 'висмикування' : 'зрив');
    return { F: F / a.S, mode };
  }

  function anchorTerms(M, xc, yc, R, xl, xr) {
    const out = [];
    for (const a of M.anchors) {
      if (!(a.x > xl && a.x < xr)) continue;
      const [ux, uy] = a.u;
      const fx = a.x - xc, fy = a.y - yc;
      const b = 2 * (fx * ux + fy * uy), c = fx * fx + fy * fy - R * R;
      const D = b * b - 4 * c;
      if (D < 0) continue;
      const roots = [(-b - Math.sqrt(D)) / 2, (-b + Math.sqrt(D)) / 2].sort((p, q) => p - q);
      for (const s of roots) {
        if (s <= 1e-6 || s > a.L) continue;
        const x = a.x + s * ux, y = a.y + s * uy;
        if (!(y < yc && x >= xl && x <= xr)) continue;
        const { F, mode } = anchorForce(a, s);
        const sina = M.dir * (x - xc) / R, cosa = Math.sqrt(Math.max(1 - sina * sina, 1e-12));
        const tx = F * ux, ty = F * uy;
        const TS = M.dir * tx * cosa + ty * sina;   // уздовж основи, проти зсуву
        const TN = M.dir * tx * sina - ty * cosa;   // притискає до основи
        const m = materialAt(M, x, y + 1e-4);
        out.push({ x, y, s, F, mode, TS, TN, tanphi: m.tanphi, hx: a.x, hy: a.y });
        break;
      }
    }
    return out;
  }

  // ---------- методи ----------

  // Бішоп спрощений: F = Σ[(c·b + (W − u·b)·tgφ)/mα] / ΣW·sinα, mα = cosα + sinα·tgφ/F
  // З анкерами (як у Slide): active — F = (Σ + ΣTN·tgφ)/(ΣW·sinα − ΣTS); passive — F = (Σ + ΣTN·tgφ + ΣTS)/ΣW·sinα
  function bishop(sl, T, mode, malphaMin) {
    let drive = 0;
    for (const s of sl) drive += s.W * s.sin;
    let add = 0;
    if (T && T.length) {
      let TS = 0, TNt = 0;
      for (const t of T) { TS += t.TS; TNt += t.TN * t.tanphi; }
      if (mode === 'passive') add = TNt + TS; else { drive -= TS; add = TNt; }
    }
    if (drive < 0.1) return { F: null, err: 'drive' };
    let F = 1;
    for (let it = 0; it < 300; it++) {
      let res = 0;
      for (const s of sl) {
        const ma = s.cos + s.sin * s.tanphi / F;
        res += (s.c * s.b + (s.W - s.u * s.b) * s.tanphi) / Math.max(ma, 1e-3);
      }
      const Fn = (res + add) / drive;
      if (!(Fn > 0) || !Number.isFinite(Fn)) return { F: null, err: 'conv' };
      if (Math.abs(Fn - F) < 1e-7) { F = Fn; return checkMa(sl, F, malphaMin, false); }
      F = Fn;
    }
    return { F: null, err: 'conv' };
  }

  // Янбу спрощений (без f0): F = Σ[(c·b + (W − u·b)·tgφ)/(cosα·mα)] / ΣW·tgα
  function janbu(sl, malphaMin) {
    let drive = 0;
    for (const s of sl) drive += s.W * s.sin / s.cos;
    if (drive < 0.1) return { F: null, err: 'drive' };
    let F = 1;
    for (let it = 0; it < 300; it++) {
      let res = 0;
      for (const s of sl) {
        const ma = s.cos + s.sin * s.tanphi / F;
        res += (s.c * s.b + (s.W - s.u * s.b) * s.tanphi) / (s.cos * Math.max(ma, 1e-3));
      }
      const Fn = res / drive;
      if (!(Fn > 0) || !Number.isFinite(Fn)) return { F: null, err: 'conv' };
      if (Math.abs(Fn - F) < 1e-7) { F = Fn; return checkMa(sl, F, malphaMin, true); }
      F = Fn;
    }
    return { F: null, err: 'conv' };
  }

  function checkMa(sl, F, malphaMin, janbuMode) {
    let mmin = Infinity;
    for (const s of sl) mmin = Math.min(mmin, s.cos + s.sin * s.tanphi / F);
    if (malphaMin > 0 && mmin < malphaMin) return { F: null, err: 'malpha', Fraw: F };
    return { F };
  }

  // Феленіус (звичайний): F = Σ[c·l + (W·cosα − u·l)·tgφ] / ΣW·sinα
  function fellenius(sl, T, mode) {
    let drive = 0, res = 0;
    for (const s of sl) {
      drive += s.W * s.sin;
      res += s.c * s.l + (s.W * s.cos - s.u * s.l) * s.tanphi;
    }
    if (T && T.length) {
      let TS = 0, TNt = 0;
      for (const t of T) { TS += t.TS; TNt += t.TN * t.tanphi; }
      if (mode === 'passive') res += TNt + TS; else { drive -= TS; res += TNt; }
    }
    if (drive < 0.1) return { F: null, err: 'drive' };
    const F = res / drive;
    return F > 0 && Number.isFinite(F) ? { F } : { F: null, err: 'conv' };
  }

  // ---------- одне коло ----------

  function evalCircle(M, xc, yc, R, detail) {
    const m = slipMass(M, xc, yc, R);
    if (!m) return null;
    const [xl, xr] = m;
    if (M.opts.minDepth > 0) {
      let dmax = 0;
      for (let i = 0; i <= 20; i++) { const x = xl + (xr - xl) * i / 20; dmax = Math.max(dmax, surfY(M, x) - arcY(xc, yc, R, x)); }
      if (dmax < M.opts.minDepth) return null;
    }
    const sl = makeSlices(M, xc, yc, R, xl, xr);
    if (sl.length < 3) return null;
    const T = M.anchors.length ? anchorTerms(M, xc, yc, R, xl, xr) : [];
    const b = bishop(sl, T, M.anchorMode, M.opts.malphaMin);
    const f = fellenius(sl, T, M.anchorMode);
    const j = M.anchors.length ? { F: null, err: 'anchors' } : janbu(sl, M.opts.malphaMin);
    const r = { xc, yc, R, xl, xr, F: { bishop: b.F, janbu: j.F, fellenius: f.F }, err: { bishop: b.err, janbu: j.err, fellenius: f.err }, nsl: sl.length, nanch: T.length };
    if (detail) { r.slices = sl; r.terms = T; }
    return r;
  }

  // таблиця відсіків для звіту (метод — для N', S, mα)
  function sliceTable(M, c, method) {
    const r = evalCircle(M, c.xc, c.yc, c.R, true);
    if (!r) return null;
    const F = r.F[method] || r.F.bishop || r.F.fellenius;
    const rows = r.slices.map((s, i) => {
      const ma = s.cos + s.sin * s.tanphi / F;
      let Np, S;
      if (method === 'fellenius') { Np = s.W * s.cos - s.u * s.l; S = (s.c * s.l + Np * s.tanphi) / F; }
      else { Np = (s.W - s.u * s.b - s.c * s.l * s.sin / F) / ma; S = (s.c * s.l + Np * s.tanphi) / F; }
      return { i: i + 1, b: s.b, h: s.h, W: s.W, alpha: s.alpha / D2R, c: s.c, phi: s.phi, u: s.u, l: s.l, ma, Np, S, Wsin: s.W * s.sin, mat: s.mat };
    });
    return { F, rows, terms: r.terms, result: r };
  }

  // ---------- пошук ----------

  function distToPoly(pts, x, y) {
    let d = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
      let t = L2 > 0 ? ((x - x1) * dx + (y - y1) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      d = Math.min(d, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
    }
    return d;
  }

  function radiusRange(M, xc, yc) {
    return [distToPoly(M.surface, xc, yc), yc - M.ybot];
  }

  // автоматична сітка центрів над укосом (якщо не задано)
  function autoGrid(M) {
    const s = M.surface, H = Math.max(M.ytopMax - M.ytopMin, 1);
    let xa = M.xmin, xb2 = M.xmax;
    for (const p of s) if (p[1] > M.ytopMin + 0.01 * H) { xa = p[0]; break; }
    for (let i = s.length - 1; i >= 0; i--) if (s[i][1] < M.ytopMax - 0.01 * H) { xb2 = s[i][0]; break; }
    if (M.dir < 0) { // укіс опускається вправо
      xa = M.xmin; xb2 = M.xmax;
      for (const p of s) if (p[1] < M.ytopMax - 0.01 * H) { xa = p[0]; break; }
      for (let i = s.length - 1; i >= 0; i--) if (s[i][1] > M.ytopMin + 0.01 * H) { xb2 = s[i][0]; break; }
    }
    if (xb2 <= xa) { xa = M.xmin; xb2 = M.xmax; }
    const Ls = xb2 - xa, w = Ls + H;
    const x1 = M.dir > 0 ? xa - 0.4 * w : xa - 0.1 * w;
    const x2 = M.dir > 0 ? xb2 + 0.1 * w : xb2 + 0.4 * w;
    return { x1, x2, y1: M.ytopMax + 0.05 * H, y2: M.ytopMax + 0.7 * w, nx: 20, ny: 20, auto: true };
  }

  function better(a, b) { return a != null && (b == null || a < b); }

  // Повний пошук: сітка центрів × радіуси, потім уточнення для кожного методу.
  function search(input, progress) {
    const M = prepare(input);
    const s = input.search || {};
    const g0 = s.grid || {};
    const gridAuto = s.gridAuto !== false && !(Number.isFinite(num(g0.x1, NaN)) && Number.isFinite(num(g0.x2, NaN)) && Number.isFinite(num(g0.y1, NaN)) && Number.isFinite(num(g0.y2, NaN)));
    const G = gridAuto ? autoGrid(M) : {
      x1: Math.min(num(g0.x1), num(g0.x2)), x2: Math.max(num(g0.x1), num(g0.x2)),
      y1: Math.min(num(g0.y1), num(g0.y2)), y2: Math.max(num(g0.y1), num(g0.y2)), auto: false
    };
    G.nx = Math.max(1, Math.round(num(g0.nx, 20)));
    G.ny = Math.max(1, Math.round(num(g0.ny, 20)));
    const nr = Math.max(2, Math.round(num(s.radii, 50)));
    const best = { bishop: null, janbu: null, fellenius: null };
    const map = [];
    const cells = { bishop: [], janbu: [], fellenius: [] };
    let total = 0, valid = 0;
    const errs = { drive: 0, malpha: 0, conv: 0 };
    const t0 = Date.now();
    // радіуси: рівномірно від rmin до rmax + згущення біля поверхні (мілкі кола в піску)
    const fr = [];
    for (let k = 1; k <= nr; k++) fr.push(k / nr);
    const nq = Math.round(nr / 2);
    for (let k = 1; k <= nq; k++) fr.push(0.25 * Math.pow(k / (nq + 1), 2));
    fr.sort((a, b) => a - b);
    for (let j = 0; j <= G.ny; j++) {
      const row = [];
      for (let i = 0; i <= G.nx; i++) {
        const xc = G.x1 + (G.x2 - G.x1) * i / G.nx;
        const yc = G.y1 + (G.y2 - G.y1) * j / G.ny;
        const [rmin, rmax] = radiusRange(M, xc, yc);
        let cell = null;
        const cb = { bishop: null, janbu: null, fellenius: null };
        if (rmax > rmin) {
          for (const f of fr) {
            const R = rmin + (rmax - rmin) * f;
            const r = evalCircle(M, xc, yc, R, false);
            if (!r) continue;
            total++;
            if (r.F.bishop != null) valid++; else if (r.err.bishop) errs[r.err.bishop] = (errs[r.err.bishop] || 0) + 1;
            for (const mth of METHODS) {
              const F = r.F[mth];
              if (F == null) continue;
              if (!cb[mth] || F < cb[mth].F) cb[mth] = { F, xc, yc, R, xl: r.xl, xr: r.xr, i, j };
            }
          }
        }
        for (const mth of METHODS) if (cb[mth]) {
          cells[mth].push(cb[mth]);
          if (!best[mth] || cb[mth].F < best[mth].F) best[mth] = cb[mth];
        }
        row.push(cb.bishop ? cb.bishop.F : null);
      }
      map.push(row);
      if (progress) progress((j + 1) / (G.ny + 1) * 0.8);
    }
    const gridBest = {};
    for (const mth of METHODS) gridBest[mth] = best[mth] ? Object.assign({}, best[mth]) : null;

    const warnings = M.warnings.slice();
    if (best.bishop) {
      const b = best.bishop;
      if (b.i === 0 || b.i === G.nx || b.j === 0 || b.j === G.ny)
        warnings.push('Центр критичного кола на межі сітки центрів — варто розширити сітку в той бік.');
    }
    if (s.refine !== false) {
      const cellW = (G.x2 - G.x1) / G.nx, cellH = (G.y2 - G.y1) / G.ny;
      METHODS.forEach((mth, k) => {
        // уточнюємо з 3 найкращих центрів, що не сусідять, і беремо мінімум
        const starts = [];
        for (const c of cells[mth].sort((a, b) => a.F - b.F)) {
          if (starts.every(q => Math.abs(q.i - c.i) > 1 || Math.abs(q.j - c.j) > 1)) starts.push(c);
          if (starts.length === 3) break;
        }
        for (const st of starts) {
          const r = refine(M, st, mth, cellW, cellH);
          if (!best[mth].refined || r.F < best[mth].F) { r.gridF = gridBest[mth].F; best[mth] = r; }
        }
        if (progress) progress(0.8 + 0.2 * (k + 1) / 3);
      });
    }
    const result = {
      grid: G, radii: nr, map, total, valid, errs, ms: Date.now() - t0, warnings, dir: M.dir,
      gridBest, best, anchors: M.anchors.length, anchorMode: M.anchorMode, slicesN: M.opts.slices
    };
    return result;
  }

  // Уточнення: покоординатний пошук по (xc, yc, R) з половинним кроком.
  function refine(M, start, mth, cw, ch) {
    let cur = { xc: start.xc, yc: start.yc, R: start.R, F: start.F, xl: start.xl, xr: start.xr };
    let st = [cw / 2, ch / 2, Math.max(cw, ch) / 2];
    const minStep = 1e-4 * Math.max(1, M.span);
    let iter = 0;
    while (Math.max(...st) > minStep && iter < 400) {
      iter++;
      let moved = false;
      for (let d = 0; d < 3; d++) for (const sg of [1, -1]) {
        const p = [cur.xc, cur.yc, cur.R];
        p[d] += sg * st[d];
        if (p[2] <= 0) continue;
        const r = evalCircle(M, p[0], p[1], p[2], false);
        const F = r && r.F[mth];
        if (F != null && F < cur.F - 1e-9) { cur = { xc: p[0], yc: p[1], R: p[2], F, xl: r.xl, xr: r.xr }; moved = true; }
      }
      if (!moved) st = st.map(v => v / 2);
    }
    cur.refined = true;
    cur.gridF = start.F;
    return cur;
  }

  // Розрахунок заданого кола (як «Add surface» у Slide)
  function single(input, xc, yc, R) {
    const M = prepare(input);
    const r = evalCircle(M, num(xc), num(yc), num(R), true);
    return { M, r };
  }

  return {
    D2R, METHODS, polyY, circlePolyX, prepare, materialAt, columnWeight, slipMass, makeSlices,
    anchorTerms, anchorForce, bishop, janbu, fellenius, evalCircle, sliceTable, search, single,
    autoGrid, radiusRange, arcY, surfY, waterY, num
  };
});
