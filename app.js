/* Інтерфейс: введення моделі, розрахунок, результати, варіанти, JSON, Telegram. */
(function () {
  'use strict';
  const E = window.SlopeEngine, P = window.SlopePresets, D = window.SlopeDraw;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const fmt = (v, d) => v == null || !isFinite(v) ? '—' : (+v).toFixed(d).replace('.', ',').replace('-', '−');
  const clone = o => JSON.parse(JSON.stringify(o));
  const METHOD_NAMES = { bishop: 'Бішоп', janbu: 'Янбу', fellenius: 'Феленіус' };
  const METHOD_FULL = { bishop: 'Бішоп спрощений', janbu: 'Янбу спрощений', fellenius: 'Феленіус (звичайний)' };

  // ---------- Telegram ----------
  const tg = window.Telegram && window.Telegram.WebApp;
  const inTg = !!(tg && tg.initData !== undefined && tg.platform && tg.platform !== 'unknown');
  if (inTg) {
    document.documentElement.classList.add('tg');
    try { tg.ready(); tg.expand(); } catch (e) { /* старі версії */ }
    try { tg.setHeaderColor('secondary_bg_color'); tg.setBackgroundColor('secondary_bg_color'); } catch (e) { /* немає в старих версіях */ }
  }
  const haptic = t => { try { inTg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred(t); } catch (e) { /* ні */ } };

  // ---------- сховище ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  // ---------- стан ----------
  const S = { model: null, result: null, method: 'bishop', detail: null, table: null, tab: 'geom', busy: false, single: null };

  // модель у посиланні: #z=<base64url(deflate(JSON))> або #m=<base64url(JSON)>, якщо стиснення недоступне
  const b64u = bytes => { let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); }); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function encodeModel(m) {
    const bytes = new TextEncoder().encode(JSON.stringify(m));
    if (window.CompressionStream) { try { return 'z=' + b64u(await pipe(bytes, new CompressionStream('deflate-raw'))); } catch (e) { /* без стиснення */ } }
    return 'm=' + b64u(bytes);
  }
  async function decodeModel(kind, s) {
    let bytes = unb64u(s);
    if (kind === 'z') {
      if (!window.DecompressionStream) throw new Error('браузер застарий для стиснених посилань');
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // ---------- точки ----------
  function parsePts(text) {
    const out = [];
    for (const raw of String(text || '').split(/\n/)) {
      const line = raw.trim();
      if (!line) continue;
      let parts = line.split(/[\s;\t]+/).filter(Boolean);
      if (parts.length === 1 && (line.match(/,/g) || []).length === 1) parts = line.split(',');
      const nums = parts.map(t => parseFloat(t.replace(',', '.')));
      if (nums.length >= 2 && isFinite(nums[0]) && isFinite(nums[1])) out.push([nums[0], nums[1]]);
      else return { error: 'Не вдалося прочитати рядок: «' + line + '»' };
    }
    return out;
  }
  const n2s = v => v == null || v === '' || !isFinite(v) ? '' : String(+(+v).toFixed(4)).replace('.', ',');
  const fmtPts = pts => (pts || []).map(p => n2s(p[0]) + ' ' + n2s(p[1])).join('\n');
  const val = el => { const t = String(el.value || '').trim().replace(',', '.'); return t === '' ? '' : (isFinite(+t) ? +t : NaN); };

  // ---------- форма ----------
  function fillForm() {
    const m = S.model;
    $('#mTitle').value = m.title || '';
    $('#variantName').textContent = m.title || 'Без назви';
    $('#mSurface').value = fmtPts(m.surface);
    $('#mYbot').value = n2s(m.ybot);
    renderLayers(); renderIncls(); renderLoads();
    const w = m.water || {};
    $('#wOn').checked = !!w.enabled; $('#wLine').value = fmtPts(w.line); $('#wGw').value = n2s(w.gammaW == null ? 9.81 : w.gammaW);
    const a0 = (m.anchors && m.anchors[0]) || { type: 'grouted', angle: 10, length: 15, bondPct: 50, bond: 15, tensile: 100, plate: 100, spacing: 1 };
    $('#aMode').value = m.anchorMode || 'active';
    $('#aType').value = a0.type || 'grouted'; $('#aAngle').value = n2s(a0.angle); $('#aLen').value = n2s(a0.length);
    $('#aT').value = n2s(a0.tensile); $('#aS').value = n2s(a0.spacing); $('#aBondPct').value = n2s(a0.bondPct);
    $('#aBond').value = n2s(a0.bond); $('#aPlate').value = n2s(a0.plate);
    $('#aHeads').value = fmtPts((m.anchors || []).map(a => [a.x, a.y]));
    toggleAnchorType();
    const s = m.search || {}, g = s.grid || {};
    $('#sSlices').value = s.slices || 25; $('#sRadii').value = s.radii || 50; $('#sReq').value = n2s(m.required == null ? 1.2 : m.required);
    $('#sAuto').checked = s.gridAuto !== false;
    $('#gX1').value = n2s(g.x1); $('#gX2').value = n2s(g.x2); $('#gY1').value = n2s(g.y1); $('#gY2').value = n2s(g.y2);
    $('#gNx').value = g.nx || 20; $('#gNy').value = g.ny || 20;
    $('#sRefine').checked = s.refine !== false; $('#sDir').value = s.direction || 'auto';
    $('#sMa').checked = s.malphaMin !== 0;
    toggleGrid();
    if (S.model.surface && S.model.surface.length) {
      const sf = S.model.surface;
      if ($('#pX1').value === '') { $('#pX1').value = n2s(sf[Math.floor(sf.length / 2)][0]); $('#pY1').value = n2s(sf[Math.floor(sf.length / 2)][1]); }
    }
  }

  function layerCard(L, i, last) {
    const d = document.createElement('div');
    d.className = 'card item'; d.dataset.i = i;
    d.innerHTML = `
      <div class="item-head">
        <input type="color" data-k="color" value="${L.color || P.COLORS[i % P.COLORS.length]}" aria-label="Колір">
        <input type="text" data-k="name" value="${(L.name || '').replace(/"/g, '&quot;')}" aria-label="Назва ґрунту">
        <button type="button" class="icon-btn" data-act="up" title="Вище" aria-label="Перемістити вище">↑</button>
        <button type="button" class="icon-btn" data-act="del" title="Видалити" aria-label="Видалити шар">✕</button>
      </div>
      <div class="grid4">
        <label class="fld"><span>γ, кН/м³</span><input data-k="gamma" inputmode="decimal" value="${n2s(L.gamma)}"></label>
        <label class="fld"><span>γнас, кН/м³</span><input data-k="gammaSat" inputmode="decimal" placeholder="= γ" value="${n2s(L.gammaSat)}"></label>
        <label class="fld"><span>c, кПа</span><input data-k="c" inputmode="decimal" value="${n2s(L.c)}"></label>
        <label class="fld"><span>φ, °</span><input data-k="phi" inputmode="decimal" value="${n2s(L.phi)}"></label>
      </div>
      ${last ? '<p class="hint">Останній шар — до низу моделі.</p>' : `<label class="fld"><span>Нижня межа шару: «x y»</span><textarea data-k="bottom" rows="3" spellcheck="false">${fmtPts(L.bottom)}</textarea></label>`}`;
    return d;
  }
  function renderLayers() {
    const box = $('#layers'); box.innerHTML = '';
    const Ls = S.model.layers || [];
    Ls.forEach((L, i) => box.appendChild(layerCard(L, i, i === Ls.length - 1)));
  }
  function inclCard(r, i) {
    const d = document.createElement('div');
    d.className = 'card item'; d.dataset.i = i;
    d.innerHTML = `
      <div class="item-head">
        <input type="color" data-k="color" value="${r.color || '#9e9e9e'}" aria-label="Колір">
        <input type="text" data-k="name" value="${(r.name || '').replace(/"/g, '&quot;')}" aria-label="Назва">
        <button type="button" class="icon-btn" data-act="del" aria-label="Видалити включення">✕</button>
      </div>
      <div class="grid4">
        <label class="fld"><span>x від</span><input data-k="x1" inputmode="decimal" value="${n2s(r.x1)}"></label>
        <label class="fld"><span>x до</span><input data-k="x2" inputmode="decimal" value="${n2s(r.x2)}"></label>
        <label class="fld"><span>y від</span><input data-k="y1" inputmode="decimal" value="${n2s(r.y1)}"></label>
        <label class="fld"><span>y до</span><input data-k="y2" inputmode="decimal" value="${n2s(r.y2)}"></label>
        <label class="fld"><span>γ, кН/м³</span><input data-k="gamma" inputmode="decimal" value="${n2s(r.gamma)}"></label>
        <label class="fld"><span>c, кПа</span><input data-k="c" inputmode="decimal" value="${n2s(r.c)}"></label>
        <label class="fld"><span>φ, °</span><input data-k="phi" inputmode="decimal" value="${n2s(r.phi)}"></label>
      </div>`;
    return d;
  }
  function renderIncls() { const b = $('#incls'); b.innerHTML = ''; (S.model.inclusions || []).forEach((r, i) => b.appendChild(inclCard(r, i))); }
  function renderLoads() {
    const b = $('#loads'); b.innerHTML = '';
    (S.model.loads || []).forEach((l, i) => {
      const d = document.createElement('div'); d.className = 'card item'; d.dataset.i = i;
      d.innerHTML = `<div class="grid4" style="align-items:end">
        <label class="fld"><span>x від, м</span><input data-k="x1" inputmode="decimal" value="${n2s(l.x1)}"></label>
        <label class="fld"><span>x до, м</span><input data-k="x2" inputmode="decimal" value="${n2s(l.x2)}"></label>
        <label class="fld"><span>q, кПа</span><input data-k="q" inputmode="decimal" value="${n2s(l.q)}"></label>
        <div class="fld"><button type="button" class="icon-btn" data-act="del" aria-label="Видалити навантаження" style="width:100%">✕</button></div></div>`;
      b.appendChild(d);
    });
  }
  function toggleAnchorType() { $$('.g-only').forEach(e => { e.style.display = $('#aType').value === 'grouted' ? '' : 'none'; }); }
  function toggleGrid() { $('#gridBox').style.opacity = $('#sAuto').checked ? 0.45 : 1; $$('#gridBox input').forEach(i => { i.disabled = $('#sAuto').checked; }); }

  function readCards(box, keys) {
    return Array.from(box.children).map(card => {
      const o = {};
      card.querySelectorAll('[data-k]').forEach(el => {
        const k = el.dataset.k;
        if (k === 'bottom') o[k] = parsePts(el.value);
        else if (k === 'name' || k === 'color') o[k] = el.value;
        else o[k] = val(el);
      });
      keys && keys.forEach(k => { if (!(k in o)) o[k] = undefined; });
      return o;
    });
  }

  // читає форму в S.model; повертає текст першої помилки або null
  function readForm() {
    let err = null;
    const pts = (id, label) => {
      const el = $(id); const r = parsePts(el.value);
      el.classList.toggle('err', !!r.error);
      if (r.error && !err) err = label + ': ' + r.error;
      return r.error ? [] : r;
    };
    const m = S.model;
    m.title = $('#mTitle').value.trim();
    $('#variantName').textContent = m.title || 'Без назви';
    m.surface = pts('#mSurface', 'Поверхня');
    m.ybot = val($('#mYbot'));
    m.layers = readCards($('#layers')).map(L => {
      if (L.bottom && L.bottom.error) { if (!err) err = 'Межа шару «' + L.name + '»: ' + L.bottom.error; L.bottom = []; }
      if (L.gammaSat === '') delete L.gammaSat;
      return L;
    });
    m.inclusions = readCards($('#incls'));
    m.loads = readCards($('#loads'));
    m.water = { enabled: $('#wOn').checked, line: pts('#wLine', 'Лінія РҐВ'), gammaW: val($('#wGw')) === '' ? 9.81 : val($('#wGw')) };
    m.anchorMode = $('#aMode').value;
    const ap = {
      type: $('#aType').value, angle: val($('#aAngle')), length: val($('#aLen')), tensile: val($('#aT')), spacing: val($('#aS')),
      bondPct: val($('#aBondPct')), bond: val($('#aBond')), plate: val($('#aPlate'))
    };
    m.anchors = pts('#aHeads', 'Анкери').map(([x, y]) => Object.assign({ x, y }, ap));
    m.search = {
      slices: val($('#sSlices')) || 25, radii: val($('#sRadii')) || 50, gridAuto: $('#sAuto').checked,
      grid: { x1: val($('#gX1')), x2: val($('#gX2')), y1: val($('#gY1')), y2: val($('#gY2')), nx: val($('#gNx')) || 20, ny: val($('#gNy')) || 20 },
      refine: $('#sRefine').checked, direction: $('#sDir').value, malphaMin: $('#sMa').checked ? 0.2 : 0
    };
    m.required = val($('#sReq')) === '' ? 1.2 : val($('#sReq'));
    return err;
  }

  // ---------- малювання ----------
  function redraw() {
    const showGrid = $('#showGrid').checked;
    const lbl = S.detail && S.detail.F ? METHOD_NAMES[S.method] + ': K = ' + fmt(S.detail.F[S.method] != null ? S.detail.F[S.method] : S.detail.K, 3) : '';
    D.drawModel($('#cv'), S.model, { res: S.result, detail: S.detail, showGrid, label: S.single ? S.single.label : lbl });
    if (S.result && S.tab === 'res') {
      const r = D.drawMap($('#cvMap'), S.result);
      if (r) $('#mapRange').textContent = 'від ' + fmt(r.kmin, 3) + ' до ' + fmt(r.kmax, 2);
    }
    const lg = $('#legend'); lg.innerHTML = '';
    (S.model.layers || []).forEach((L, i) => { lg.insertAdjacentHTML('beforeend', `<span><i style="background:${L.color || P.COLORS[i % P.COLORS.length]}"></i>${esc(L.name || 'шар ' + (i + 1))}: γ ${n2s(L.gamma)}, c ${n2s(L.c)}, φ ${n2s(L.phi)}°</span>`); });
    (S.model.inclusions || []).forEach(r => lg.insertAdjacentHTML('beforeend', `<span><i style="background:${r.color || '#9e9e9e'}"></i>${esc(r.name || 'включення')}</span>`));
    $('#viewerTitle').textContent = S.single ? 'Задане коло' : (S.detail ? 'Критична поверхня — ' + METHOD_FULL[S.method] : 'Модель');
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let tSave = 0, tDraw = 0;
  function changed(invalidate) {
    const err = readForm();
    if (invalidate !== false && S.result) { S.result = null; S.detail = null; S.single = null; renderResults(); }
    clearTimeout(tDraw); tDraw = setTimeout(redraw, 60);
    clearTimeout(tSave); tSave = setTimeout(() => store.set('ukis.current', S.model), 400);
    return err;
  }

  // ---------- розрахунок ----------
  let worker = null, workerOk = location.protocol !== 'file:';
  function compute(model) {
    return new Promise((resolve, reject) => {
      const prog = p => { $('#progress div').style.width = Math.round(p * 100) + '%'; };
      if (workerOk) {
        try {
          if (!worker) worker = new Worker('worker.js?v=2b11fb8b8ad41d98');
          worker.onmessage = e => {
            const d = e.data;
            if (d.progress != null) prog(d.progress);
            else if (d.error) reject(new Error(d.error));
            else resolve(d.result);
          };
          worker.onerror = ev => { ev.preventDefault && ev.preventDefault(); workerOk = false; worker = null; compute(model).then(resolve, reject); };
          worker.postMessage({ model });
          return;
        } catch (e) { workerOk = false; }
      }
      setTimeout(() => { try { resolve(E.search(model, prog)); } catch (e) { reject(e); } }, 30);
    });
  }

  async function run() {
    if (S.busy) return;
    const err = readForm();
    if (err) { toast(err); haptic('error'); return; }
    try { E.prepare(S.model); } catch (e) { toast(e.message); haptic('error'); return; }
    S.busy = true; setBusy(true);
    try {
      const res = await compute(clone(S.model));
      S.result = res; S.single = null;
      S.method = res.best.bishop ? 'bishop' : (res.best.fellenius ? 'fellenius' : 'janbu');
      if (!res.best[S.method]) throw new Error('Не знайдено жодної допустимої поверхні ковзання. Перевірте сітку центрів і геометрію.');
      selectMethod(S.method);
      setTab('res');
      haptic('success');
    } catch (e) {
      toast(e.message || String(e)); haptic('error');
    } finally { S.busy = false; setBusy(false); }
  }

  function setBusy(b) {
    $('#progress').hidden = !b; $('#progress div').style.width = '0';
    $('#btnRun').disabled = b; $('#btnRun').textContent = b ? 'Рахую…' : 'Розрахувати';
    if (inTg) { try { b ? tg.MainButton.showProgress(false) : tg.MainButton.hideProgress(); } catch (e) { /* ні */ } }
  }

  function selectMethod(m) {
    S.method = m;
    const b = S.result && S.result.best[m];
    S.detail = null; S.table = null;
    if (b) {
      const t = E.sliceTable(E.prepare(S.model), b, m);
      if (t) { S.table = t; S.detail = Object.assign({}, t.result, { slices: t.result.slices, terms: t.terms }); }
    }
    $('#tblMethod').value = m;
    renderResults();
    redraw();
  }

  // ---------- результати ----------
  function status(K, req) {
    if (K == null) return '<span class="st">—</span>';
    if (K < 1) return '<span class="st bad">K &lt; 1 — нестійкий</span>';
    if (K < req) return '<span class="st warn">K &lt; ' + fmt(req, 2) + ' — не забезпечено</span>';
    return '<span class="st ok">K ≥ ' + fmt(req, 2) + ' — стійкий</span>';
  }

  function renderResults() {
    const R = S.result;
    $('#resEmpty').hidden = !!R; $('#resBox').hidden = !R;
    $('#btnBrowser').hidden = !inTg;
    updateMainButton();
    if (!R) return;
    const req = S.model.required == null ? 1.2 : S.model.required;
    $('#kcards').innerHTML = E.METHODS.map(m => {
      const b = R.best[m];
      const note = m === 'janbu' && R.anchors ? '<span class="st">з анкерами не рахується</span>' : status(b && b.F, req);
      return `<button type="button" class="kcard${m === S.method ? ' on' : ''}" data-m="${m}"><small>${METHOD_FULL[m]}</small><b>${b ? fmt(b.F, 3) : '—'}</b>${note}</button>`;
    }).join('');
    const b = R.best[S.method];
    const d = S.detail;
    const rows = [];
    if (b) {
      rows.push(['Метод', METHOD_FULL[S.method]]);
      rows.push(['Центр кола', '(' + fmt(b.xc, 2) + '; ' + fmt(b.yc, 2) + ') м']);
      rows.push(['Радіус', fmt(b.R, 2) + ' м']);
      rows.push(['Вихід на поверхню', 'x = ' + fmt(b.xl, 2) + ' … ' + fmt(b.xr, 2) + ' м']);
      if (b.gridF != null) rows.push(['K на сітці / після уточнення', fmt(b.gridF, 3) + ' / ' + fmt(b.F, 3)]);
      if (d) rows.push(['Відсіків', String(d.nsl)]);
    }
    rows.push(['Сітка центрів', (R.grid.auto ? 'авто: ' : '') + 'x ' + fmt(R.grid.x1, 1) + '…' + fmt(R.grid.x2, 1) + ', y ' + fmt(R.grid.y1, 1) + '…' + fmt(R.grid.y2, 1) + ' (' + R.grid.nx + '×' + R.grid.ny + ')']);
    rows.push(['Перевірено кіл', R.total.toLocaleString('uk-UA') + ' (' + (R.ms / 1000).toFixed(1).replace('.', ',') + ' с)']);
    if (R.anchors) {
      rows.push(['Анкери', R.anchors + ' шт., ' + (R.anchorMode === 'passive' ? 'Passive' : 'Active')]);
      if (d && d.terms) rows.push(['Перетинає критичне коло', d.terms.length ? d.terms.map(t => fmt(t.F, 1) + ' кН/м (' + t.mode + ')').join('; ') : 'жоден']);
    }
    let html = '<dl class="info-list">' + rows.map(r => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('') + '</dl>';
    if (R.warnings && R.warnings.length) html += '<ul class="warns">' + R.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>';
    $('#resInfo').innerHTML = html;
    renderTable();
  }

  // рядки таблиці відсіків з утримуючими й зсувними складовими обраного методу
  function tableRows(t, m) {
    return t.rows.map(r => {
      const a = r.alpha * Math.PI / 180, tp = Math.tan(r.phi * Math.PI / 180);
      let res, drv;
      if (m === 'fellenius') { res = r.c * r.l + (r.W * Math.cos(a) - r.u * r.l) * tp; drv = r.W * Math.sin(a); }
      else if (m === 'janbu') { res = (r.c * r.b + (r.W - r.u * r.b) * tp) / (Math.cos(a) * r.ma); drv = r.W * Math.tan(a); }
      else { res = (r.c * r.b + (r.W - r.u * r.b) * tp) / r.ma; drv = r.W * Math.sin(a); }
      return Object.assign({ res, drv }, r);
    });
  }

  function renderTable() {
    const t = S.table, m = S.method;
    const tb = $('#tbl');
    if (!t) { tb.innerHTML = ''; return; }
    const rows = tableRows(t, m);
    const resH = m === 'fellenius' ? 'c·l+N′·tgφ' : (m === 'janbu' ? 'утр./(cosα·mα)' : '(c·b+(W−ub)tgφ)/mα');
    const drvH = m === 'janbu' ? 'W·tgα' : 'W·sinα';
    let h = `<thead><tr><th>№</th><th>b, м</th><th>h, м</th><th>W, кН/м</th><th>α, °</th><th>c, кПа</th><th>φ, °</th><th>u, кПа</th>${m === 'fellenius' ? '' : '<th>mα</th>'}<th>N′, кН/м</th><th>${resH}</th><th>${drvH}</th></tr></thead><tbody>`;
    let sW = 0, sR = 0, sD = 0;
    for (const r of rows) {
      sW += r.W; sR += r.res; sD += r.drv;
      h += `<tr><td>${r.i}</td><td>${fmt(r.b, 2)}</td><td>${fmt(r.h, 2)}</td><td>${fmt(r.W, 1)}</td><td>${fmt(r.alpha, 1)}</td><td>${fmt(r.c, 1)}</td><td>${fmt(r.phi, 1)}</td><td>${fmt(r.u, 1)}</td>${m === 'fellenius' ? '' : `<td>${fmt(r.ma, 3)}</td>`}<td>${fmt(r.Np, 1)}</td><td>${fmt(r.res, 1)}</td><td>${fmt(r.drv, 1)}</td></tr>`;
    }
    const span = m === 'fellenius' ? 9 : 10;
    h += `</tbody><tfoot><tr><td colspan="3">Σ</td><td>${fmt(sW, 1)}</td><td colspan="${span - 4}"></td><td>${fmt(sR, 1)}</td><td>${fmt(sD, 1)}</td></tr>`;
    if (!(S.result && S.result.anchors && t.terms && t.terms.length))
      h += `<tr><td colspan="${span + 2}" style="text-align:left">K = Σутр / Σзсув = ${fmt(sR, 1)} / ${fmt(sD, 1)} = ${fmt(sR / sD, 3)}</td></tr>`;
    else h += `<tr><td colspan="${span + 2}" style="text-align:left">З анкерами: K = (Σутр + ΣTN·tgφ${S.result.anchorMode === 'passive' ? ' + ΣTS' : ''}) / (Σзсув${S.result.anchorMode === 'passive' ? '' : ' − ΣTS'}) = ${fmt(t.F, 3)}</td></tr>`;
    tb.innerHTML = h + '</tfoot>';
  }

  // ---------- вкладки, кнопки ----------
  function setTab(t) {
    S.tab = t;
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $$('.panel').forEach(p => p.classList.toggle('on', p.dataset.panel === t));
    const on = $('.tabs button.on'); on && on.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    $('#runBar').hidden = t === 'res' && !!S.result;
    updateMainButton();
    if (t === 'res') redraw();
  }

  let mbHandler = null;
  function updateMainButton() {
    if (!inTg) return;
    const mb = tg.MainButton;
    if (mbHandler) mb.offClick(mbHandler);
    if (S.tab === 'res' && S.result) { mb.setText('Звіт PDF'); mbHandler = pdf; }
    else { mb.setText('Розрахувати'); mbHandler = run; }
    mb.onClick(mbHandler); mb.show();
  }

  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms || 4200);
  }

  // ---------- діалоги ----------
  const dlg = $('#dlg');
  function openDlg(title, html, bind) {
    $('#dlgTitle').textContent = title; $('#dlgBody').innerHTML = html;
    bind && bind($('#dlgBody'));
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  const closeDlg = () => { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); };

  function loadModel(m, msg) {
    S.model = Object.assign({ water: { enabled: false, line: [], gammaW: 9.81 }, loads: [], inclusions: [], anchors: [], anchorMode: 'active', search: {}, required: 1.2 }, clone(m));
    S.result = null; S.detail = null; S.table = null; S.single = null;
    fillForm(); readForm(); renderResults(); redraw();
    store.set('ukis.current', S.model);
    if (msg) toast(msg, 2500);
  }

  const STARTERS = [
    ['_new', 'Однорідний укіс', 'Один ґрунт, H = 10 м, β = 30° — найпростіший старт'],
    ['pr2', 'Два шари й будівля на бровці', 'Супісок і пісок, фундамент з навантаженням 65 кПа'],
    ['pr4', 'Укіс з ґрунтовими анкерами', '5 анкерів, Active / Passive, як Tutorial 06 у Slide'],
    ['arai3', 'Укіс з ґрунтовими водами', 'Лінія РҐВ і поровий тиск']
  ];
  function openExample(id) {
    if (id === '_new') loadModel(newSlope(), 'Відкрито: однорідний укіс');
    else loadModel(P.get(id).model, 'Відкрито: ' + P.get(id).model.title);
    setTab('geom');
  }
  function presetsDlg() {
    const pick = (id, t, sub) => `<button type="button" class="pick" data-id="${id}">${esc(t)}<small>${esc(sub)}</small></button>`;
    let html = '<div class="grp">Приклади для початку — відкрийте й змінюйте</div><div class="list">' + STARTERS.map(s => pick(s[0], s[1], s[2])).join('') + '</div>';
    for (const [g, t] of [['САПР', 'Роботи з курсу САПР (ГС-61мп)'], ['Еталони', 'Еталонні приклади для перевірки програми']]) {
      html += `<div class="grp">${t}</div><div class="list">` + P.list.filter(p => p.group === g).map(p => pick(p.id, p.model.title, p.expect.src)).join('') + '</div>';
    }
    openDlg('Приклади', html, b => b.querySelectorAll('.pick').forEach(el => el.addEventListener('click', () => { closeDlg(); openExample(el.dataset.id); })));
  }

  function moreDlg() {
    const html = `<div class="list">
      <button type="button" class="pick" data-a="help">Як користуватися<small>3 кроки і приклади</small></button>
      <button type="button" class="pick" data-a="variants">Збережені варіанти<small>Зберегти поточний або відкрити збережений</small></button>
      <button type="button" class="pick" data-a="json">Імпорт / експорт JSON<small>Файл моделі для обміну й архіву</small></button>
      <button type="button" class="pick" data-a="about">Про програму й перевірку<small>Методи, еталони, обмеження</small></button></div>`;
    openDlg('Меню', html, b => b.querySelectorAll('[data-a]').forEach(el => el.addEventListener('click', () => {
      const a = el.dataset.a; closeDlg();
      if (a === 'help') showIntro(); else if (a === 'variants') variantsDlg(); else if (a === 'json') jsonDlg(); else aboutDlg();
    })));
  }
  function aboutDlg() {
    openDlg('Про програму', `<p><b>Укіс</b> рахує стійкість ґрунтового укосу методом граничної рівноваги: кругоциліндричні поверхні ковзання, метод відсіків — Феленіус (звичайний), Бішоп спрощений, Янбу спрощений (без поправки f₀). Критичне коло шукається по сітці центрів і радіусів (як Grid Search у Slide) з уточненням.</p>
      <p>Перевірено на опублікованих прикладах (Rocscience Slide2 Verification Manual: ACADS 1(a), 1(c), Arai & Tagyo, Yamagami & Ueta, Duncan & Wright з анкером): відхилення від Slide — до 1 %. Таблиці звірки — у README.</p>
      <p>Чого немає: некругових поверхонь, строгих методів (Спенсер, Моргенштерн–Прайс), сейсміки, тріщин відриву. Навантаження — лише вертикальне рівномірне.</p>
      <p class="note">Навчальний інструмент. Результат варто перевіряти: вручну за таблицею відсіків або в ліцензованій програмі. Акаунтів, реклами й збору даних немає — модель і варіанти зберігаються лише у вашому браузері; посилання «Поділитися» містить саму модель.</p>`);
  }
  function showIntro() {
    store.set('ukis.intro', 'shown');
    $('#intro').hidden = false; setTab('geom');
    $('#intro').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function shareUrl() { readForm(); return location.href.split('#')[0] + '#' + await encodeModel(S.model) + (S.result ? '&run=1' : ''); }
  async function share() {
    let url;
    try { url = await shareUrl(); } catch (e) { toast('Не вдалося зробити посилання: ' + e.message); return; }
    const text = 'Розрахунок стійкості укосу' + (S.model.title ? ': ' + S.model.title : '');
    const html = `<p>Посилання відкриває цей розрахунок у браузері${S.result ? ' й одразу рахує його' : ''}. Модель зашита в саме посилання — на сервер нічого не надсилається.</p>
      <p class="share-url" id="shUrl">${esc(url)}</p>
      <div class="actions"><button type="button" class="btn" id="shCopy">Копіювати</button>${inTg ? '<button type="button" class="btn ghost-btn" id="shTg">Надіслати в Telegram</button>' : (navigator.share ? '<button type="button" class="btn ghost-btn" id="shSys">Надіслати…</button>' : '')}</div>`;
    openDlg('Поділитися', html, b => {
      b.querySelector('#shCopy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); toast('Посилання скопійовано', 1600); }
        catch (e) { const r = document.createRange(); r.selectNodeContents(b.querySelector('#shUrl')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Виділено — скопіюйте вручну', 2500); }
      });
      const tgB = b.querySelector('#shTg');
      if (tgB) tgB.addEventListener('click', () => { closeDlg(); tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text)); });
      const sys = b.querySelector('#shSys');
      if (sys) sys.addEventListener('click', async () => { try { await navigator.share({ title: 'Укіс', text, url }); closeDlg(); } catch (e) { /* скасовано */ } });
    });
  }

  function newSlope() {
    return {
      title: 'Новий укіс', surface: quickSurface({ H: 10, beta: 30, y0: 20, Lb: 15, Lt: 25, side: 'right' }), ybot: 10,
      layers: [{ name: 'суглинок', gamma: 19, c: 15, phi: 20, color: P.COLORS[0] }],
      inclusions: [], loads: [], water: { enabled: false, line: [], gammaW: 9.81 }, anchors: [], anchorMode: 'active',
      search: { slices: 25, radii: 50, gridAuto: true, refine: true, direction: 'auto', grid: { nx: 20, ny: 20 } }, required: 1.2
    };
  }
  function quickSurface(q) {
    const L = q.H / Math.tan(q.beta * Math.PI / 180), r = v => +v.toFixed(3);
    if (q.side === 'left') return [[0, q.y0 + q.H], [q.Lt, q.y0 + q.H], [r(q.Lt + L), q.y0], [r(q.Lt + L + q.Lb), q.y0]];
    return [[0, q.y0], [q.Lb, q.y0], [r(q.Lb + L), q.y0 + q.H], [r(q.Lb + L + q.Lt), q.y0 + q.H]];
  }

  function variantsDlg() {
    const list = store.get('ukis.variants', []);
    const html = `<div class="vrow"><input id="vName" type="text" placeholder="Назва варіанта" value="${esc(S.model.title || '')}"><button type="button" class="btn" id="vSave">Зберегти</button></div>
      <div class="list">${list.length ? list.map((v, i) => `<div class="vrow"><button type="button" class="pick" data-i="${i}">${esc(v.name)}<small>${new Date(v.at).toLocaleString('uk-UA')}${v.K ? ' · K = ' + fmt(v.K, 3) : ''}</small></button><button type="button" class="icon-btn" data-del="${i}" aria-label="Видалити">✕</button></div>`).join('') : '<p class="hint">Ще немає збережених варіантів. Вони зберігаються на цьому пристрої.</p>'}</div>`;
    openDlg('Варіанти', html, b => {
      b.querySelector('#vSave').addEventListener('click', () => {
        readForm();
        const name = b.querySelector('#vName').value.trim() || S.model.title || 'Варіант';
        const l = store.get('ukis.variants', []).filter(v => v.name !== name);
        l.unshift({ name, at: Date.now(), K: S.result && S.result.best.bishop ? S.result.best.bishop.F : null, model: Object.assign(clone(S.model), { title: name }) });
        if (store.set('ukis.variants', l)) { S.model.title = name; $('#mTitle').value = name; $('#variantName').textContent = name; toast('Збережено: ' + name, 2000); }
        else toast('Не вдалося зберегти: сховище браузера недоступне.');
        closeDlg();
      });
      b.querySelectorAll('[data-i]').forEach(el => el.addEventListener('click', () => {
        const v = store.get('ukis.variants', [])[+el.dataset.i]; closeDlg(); if (v) { loadModel(v.model, 'Відкрито: ' + v.name); setTab('geom'); }
      }));
      b.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', () => {
        const l = store.get('ukis.variants', []); l.splice(+el.dataset.del, 1); store.set('ukis.variants', l); variantsDlg();
      }));
    });
  }

  function jsonDlg() {
    readForm();
    const txt = JSON.stringify(S.model, null, 1);
    const html = `<textarea id="jTxt" rows="12" spellcheck="false">${esc(txt)}</textarea>
      <div class="actions"><button type="button" class="btn ghost-btn" id="jCopy">Копіювати</button><button type="button" class="btn ghost-btn" id="jFile">Файл .json</button></div>
      <div class="actions"><button type="button" class="btn" id="jImport">Імпортувати з поля</button><label class="btn ghost-btn" style="margin:0">Відкрити файл<input type="file" id="jOpen" accept=".json,application/json" hidden></label></div>
      <p class="hint">Щоб імпортувати, вставте JSON у поле й натисніть «Імпортувати» або відкрийте файл.</p>`;
    openDlg('Імпорт / експорт JSON', html, b => {
      b.querySelector('#jCopy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(b.querySelector('#jTxt').value); toast('Скопійовано', 1500); }
        catch (e) { b.querySelector('#jTxt').select(); document.execCommand && document.execCommand('copy'); toast('Скопійовано', 1500); }
      });
      b.querySelector('#jFile').addEventListener('click', () => saveBlob(new Blob([b.querySelector('#jTxt').value], { type: 'application/json' }), fileBase() + '.json'));
      b.querySelector('#jImport').addEventListener('click', () => importJson(b.querySelector('#jTxt').value));
      b.querySelector('#jOpen').addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        const rd = new FileReader(); rd.onload = () => importJson(rd.result); rd.readAsText(f);
      });
    });
  }
  function importJson(text) {
    try {
      const m = JSON.parse(text);
      const mm = m.model && m.model.surface ? m.model : m;
      if (!Array.isArray(mm.surface) || !Array.isArray(mm.layers)) throw new Error('у файлі немає surface або layers');
      E.prepare(mm);
      closeDlg(); loadModel(mm, 'Імпортовано: ' + (mm.title || 'модель')); setTab('geom');
    } catch (e) { toast('Не вдалося імпортувати: ' + e.message); }
  }
  function fileBase() { return ('ukis-' + (S.model.title || 'model')).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 60); }
  // посилання на файл живе хвилину: Safari на iPhone спершу питає «Завантажити?», і раннє прибирання ламало завантаження
  function downloadUrl(url, name) {
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
  }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    downloadUrl(url, name); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

  async function openInBrowser(withPdf) {
    readForm();
    const url = location.href.split('#')[0] + '#' + await encodeModel(S.model) + '&run=1' + (withPdf === true ? '&pdf=1' : '');
    try { tg.openLink(url); } catch (e) { window.open(url, '_blank'); }
  }

  let pdfUrl = null;
  async function pdf() {
    if (!S.result) { toast('Спершу виконайте розрахунок.'); return; }
    let blob;
    try {
      toast('Готую звіт…', 1500);
      blob = await window.SlopeReport.make({ model: S.model, result: S.result, methodNames: METHOD_FULL, tableRows });
    } catch (e) { toast('Не вдалося зробити PDF: ' + e.message); return; }
    const name = fileBase() + '.pdf';
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(blob);
    // комп'ютер, звичайний браузер — просто завантажуємо, як раніше
    if (!inTg && !isMobile()) { downloadUrl(pdfUrl, name); return; }
    // телефон або Telegram: кнопки, які спрацьовують від натискання (iPhone інакше не дає зберегти файл)
    let file = null;
    try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) { /* старий браузер */ }
    const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
    const html = `<p>Звіт «${esc(name)}» готовий (${Math.round(blob.size / 1024)} КБ).</p>
      <div class="list">
        ${canShare ? '<button type="button" class="btn" id="rShare">Зберегти у Файли / надіслати</button>' : ''}
        <button type="button" class="btn${canShare ? ' ghost-btn' : ''}" id="rOpen">Відкрити PDF</button>
        <button type="button" class="btn ghost-btn" id="rDl">Завантажити файл</button>
        ${inTg ? '<button type="button" class="btn ghost-btn" id="rBr">Відкрити в браузері</button>' : ''}
      </div>
      <p class="hint">На iPhone: «Зберегти у Файли», або «Відкрити PDF» → кнопка «Поділитися» → «Зберегти у Файли».${inTg ? ' Якщо тут нічого не спрацьовує — «Відкрити в браузері»: там звіт підготується сам.' : ' Якщо сторінка відкрита у вбудованому браузері Telegram і нічого не відбувається — меню ⋯ → «Відкрити в Safari».'}</p>`;
    openDlg('Звіт PDF', html, b => {
      const sh = b.querySelector('#rShare');
      if (sh) sh.addEventListener('click', async () => {
        try { await navigator.share({ files: [file], title: name }); closeDlg(); }
        catch (e) { if (e.name !== 'AbortError') toast('Не вдалося поділитися: ' + e.message + '. Спробуйте «Відкрити PDF».'); }
      });
      b.querySelector('#rOpen').addEventListener('click', () => {
        const w = window.open(pdfUrl, '_blank');
        if (!w) location.href = pdfUrl;
      });
      b.querySelector('#rDl').addEventListener('click', () => downloadUrl(pdfUrl, name));
      const br = b.querySelector('#rBr');
      if (br) br.addEventListener('click', () => { closeDlg(); openInBrowser(true); });
    });
  }

  // ---------- події ----------
  function bind() {
    $$('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    document.querySelector('.side').addEventListener('input', e => {
      if (e.target.closest('#dlg') || e.target.id === 'tblMethod') return;
      if (e.target.id === 'aType') toggleAnchorType();
      if (e.target.id === 'sAuto') toggleGrid();
      if (e.target.closest('[data-panel="search"] details')) return;
      if (e.target.closest('#quick') || e.target.closest('[data-panel="anch"] details')) return;
      changed();
    });
    for (const [box, key] of [['#layers', 'layers'], ['#incls', 'inclusions'], ['#loads', 'loads']]) {
      $(box).addEventListener('click', e => {
        const btn = e.target.closest('[data-act]'); if (!btn) return;
        readForm();
        const i = +btn.closest('.item').dataset.i, arr = S.model[key];
        if (btn.dataset.act === 'del') {
          if (key === 'layers' && arr.length === 1) { toast('Має лишитися хоча б один шар.'); return; }
          arr.splice(i, 1);
        } else if (btn.dataset.act === 'up' && i > 0) { const t = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t; }
        if (key === 'layers') {
          // у нового останнього шару межі немає; у колишнього останнього — з'являється
          arr.forEach((L, k) => { if (k < arr.length - 1 && (!L.bottom || !L.bottom.length)) L.bottom = defaultBoundary(); });
        }
        fillForm(); changed();
      });
    }
    $('#addLayer').addEventListener('click', () => {
      readForm();
      const arr = S.model.layers, last = arr[arr.length - 1];
      if (last) last.bottom = last.bottom && last.bottom.length ? last.bottom : defaultBoundary();
      arr.push({ name: 'Ґрунт ' + (arr.length + 1), gamma: 18, c: 5, phi: 25, color: P.COLORS[arr.length % P.COLORS.length] });
      fillForm(); changed();
    });
    $('#addIncl').addEventListener('click', () => {
      readForm();
      const sf = S.model.surface, top = sf.length ? Math.max(...sf.map(p => p[1])) : 0, xr = sf.length ? sf[sf.length - 1][0] : 10;
      S.model.inclusions.push(Object.assign({ x1: +(xr - 20).toFixed(1), x2: +(xr - 10).toFixed(1), y1: +(top - 1.5).toFixed(2), y2: top }, P.CONCRETE, { name: 'фундамент (бетон)' }));
      fillForm(); changed();
    });
    $('#addLoad').addEventListener('click', () => {
      readForm();
      const sf = S.model.surface, xr = sf.length ? sf[sf.length - 1][0] : 10;
      S.model.loads.push({ x1: +(xr - 20).toFixed(1), x2: +(xr - 10).toFixed(1), q: 50 });
      fillForm(); changed();
    });
    $('#btnQuick').addEventListener('click', () => {
      const q = {}; $$('[data-q]').forEach(el => { q[el.dataset.q] = el.tagName === 'SELECT' ? el.value : val(el); });
      if (!(q.H > 0 && q.beta > 0 && q.beta < 90)) { toast('Задайте H > 0 і 0° < β < 90°.'); return; }
      $('#mSurface').value = fmtPts(quickSurface(q));
      $('#mYbot').value = n2s(q.y0 - (q.D || q.H));
      S.model.search = Object.assign(S.model.search || {}, { gridAuto: true });
      $('#sAuto').checked = true; toggleGrid();
      changed(); toast('Поверхню побудовано', 1500);
    });
    $('#btnPattern').addEventListener('click', () => {
      const p1 = [val($('#pX1')), val($('#pY1'))], p2 = [val($('#pX2')), val($('#pY2'))], st = val($('#pStep'));
      if (![...p1, ...p2, st].every(v => v !== '' && isFinite(v)) || st <= 0) { toast('Задайте дві точки й крок.'); return; }
      $('#aHeads').value = fmtPts(P.anchorPattern(p1, p2, st, {}).map(a => [a.x, a.y]));
      changed(); toast('Головки анкерів розставлено', 1500);
    });
    $('#clearAnch').addEventListener('click', () => { $('#aHeads').value = ''; changed(); });
    $('#btnRun').addEventListener('click', run);
    $('#showGrid').addEventListener('change', redraw);
    $('#kcards').addEventListener('click', e => { const b = e.target.closest('.kcard'); if (b && S.result && S.result.best[b.dataset.m]) { S.single = null; selectMethod(b.dataset.m); } });
    $('#tblMethod').addEventListener('change', e => { if (S.result && S.result.best[e.target.value]) { S.single = null; selectMethod(e.target.value); } else { e.target.value = S.method; toast('Для цього методу немає результату.'); } });
    $('#btnPdf').addEventListener('click', pdf);
    $('#btnBrowser').addEventListener('click', openInBrowser);
    $('#btnPresets').addEventListener('click', presetsDlg);
    $('#btnMore').addEventListener('click', moreDlg);
    $('#btnShare').addEventListener('click', share);
    $('#btnShare2').addEventListener('click', share);
    $('#btnHelp').addEventListener('click', showIntro);
    $('#introHide').addEventListener('click', () => { $('#intro').hidden = true; store.set('ukis.intro', 'hidden'); });
    $$('#intro [data-ex]').forEach(b => b.addEventListener('click', () => openExample(b.dataset.ex)));
    $('#btnCircle').addEventListener('click', () => {
      const err = readForm(); if (err) { toast(err); return; }
      try {
        const { r } = E.single(S.model, val($('#cX')), val($('#cY')), val($('#cR')));
        if (!r) { $('#circleOut').textContent = 'Коло не утворює маси, що сповзає (не перетинає поверхню двічі, виходить за модель або нижче за її низ).'; return; }
        $('#circleOut').innerHTML = 'Бішоп ' + fmt(r.F.bishop, 3) + ', Янбу ' + fmt(r.F.janbu, 3) + ', Феленіус ' + fmt(r.F.fellenius, 3) +
          '; вихід x = ' + fmt(r.xl, 2) + ' … ' + fmt(r.xr, 2) + ' м, відсіків ' + r.nsl + (r.nanch ? ', анкерів перетинає ' + r.nanch : '') +
          (r.err.bishop === 'malpha' ? '. Бішоп: mα < 0,2 — Slide таке коло відкидає.' : '');
        S.detail = r; S.single = { label: 'K = ' + fmt(r.F.bishop, 3) + ' (Бішоп)' }; redraw();
      } catch (e) { toast(e.message); }
    });
    let tR = 0;
    window.addEventListener('resize', () => { clearTimeout(tR); tR = setTimeout(redraw, 120); });
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
    if (inTg) { try { tg.onEvent('themeChanged', redraw); } catch (e) { /* ні */ } }
  }
  function defaultBoundary() {
    const sf = S.model.surface;
    if (!sf || sf.length < 2) return [[0, 0], [10, 0]];
    const ys = sf.map(p => p[1]), y = +(Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) / 3).toFixed(2);
    return [[sf[0][0], y], [sf[sf.length - 1][0], y]];
  }

  // ---------- старт ----------
  async function start() {
    bind();
    let m = null, autorun = false, autopdf = false;
    const h = location.hash.match(/#([zm])=([^&]+)/);
    if (h) { try { m = await decodeModel(h[1], h[2]); autorun = /[#&]run=1/.test(location.hash); autopdf = /[#&]pdf=1/.test(location.hash); } catch (e) { toast('Посилання пошкоджене (' + e.message + ') — відкрито останній варіант.'); } }
    if (h && m) history.replaceState(null, '', location.pathname + location.search);
    if (!m) m = store.get('ukis.current', null);
    try { if (m) E.prepare(m); } catch (e) { m = null; }
    $('#intro').hidden = store.get('ukis.intro', '') === 'hidden';
    loadModel(m || newSlope());
    setTab('geom');
    if (autorun) { await run(); if (autopdf && S.result) pdf(); }
  }
  start();
})();
