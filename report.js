/* PDF-звіт українською (jsPDF + DejaVu Sans Condensed). Бібліотеки вантажаться лише при першому звіті. */
(function (root) {
  'use strict';
  const fmt = (v, d) => v == null || !isFinite(v) ? '—' : (+v).toFixed(d).replace('.', ',').replace('-', '−');
  const pt = p => '(' + fmt(p[0], 2).replace(/,00$/, '') + '; ' + fmt(p[1], 2).replace(/,00$/, '') + ')';

  function loadScript(src) {
    return new Promise((ok, fail) => {
      const s = document.createElement('script'); s.src = src; s.onload = ok;
      s.onerror = () => fail(new Error('не завантажився ' + src));
      document.head.appendChild(s);
    });
  }
  async function libs() {
    if (!root.jspdf) await loadScript('jspdf.umd.min.js');
    if (!root.UKIS_FONTS) await loadScript('fonts.js');
  }

  async function make(o) {
    await libs();
    const { model, result: R, methodNames, tableRows } = o;
    const E = root.SlopeEngine, D = root.SlopeDraw;
    const M = E.prepare(model);
    const doc = new root.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.addFileToVFS('dv.ttf', root.UKIS_FONTS.regular); doc.addFont('dv.ttf', 'DV', 'normal');
    doc.addFileToVFS('dvb.ttf', root.UKIS_FONTS.bold); doc.addFont('dvb.ttf', 'DV', 'bold');
    const L = 25, Rm = 12, T = 18, B = 18, PW = 210, PH = 297, W = PW - L - Rm;
    let y = T;
    const font = (sz, bold) => { doc.setFont('DV', bold ? 'bold' : 'normal'); doc.setFontSize(sz); };
    const need = h => { if (y + h > PH - B) { doc.addPage(); y = T; } };
    function para(text, sz, opts) {
      opts = opts || {};
      font(sz || 10.5, opts.bold);
      const lines = doc.splitTextToSize(text, W - (opts.indent || 0));
      const lh = (sz || 10.5) * 0.43;
      for (const ln of lines) { need(lh); doc.text(ln, opts.center ? L + W / 2 : L + (opts.indent || 0), y + lh * 0.8, opts.center ? { align: 'center' } : undefined); y += lh; }
      y += opts.after == null ? 1.5 : opts.after;
    }
    const centerText = (t, sz, bold) => { font(sz, bold); need(sz * 0.45); doc.text(t, L + W / 2, y + sz * 0.36, { align: 'center' }); y += sz * 0.45 + 1; };
    const head = t => { y += 2; need(12); para(t, 12, { bold: true, after: 1.5 }); };

    function table(cols, rows, sz, foot) {
      sz = sz || 8;
      const total = cols.reduce((s, c) => s + c.w, 0), k = W / total;
      cols.forEach(c => { c.mm = c.w * k; });
      const lh = sz * 0.42, pad = 1.2;
      const drawRow = (cells, bold, fill) => {
        font(sz, bold);
        const parts = cells.map((c, i) => doc.splitTextToSize(String(c), cols[i].mm - 2 * pad));
        const h = Math.max(...parts.map(p => p.length)) * lh + 2 * pad;
        if (y + h > PH - B) { doc.addPage(); y = T; drawRow(cols.map(c => c.h), true, true); font(sz, bold); }
        let x = L;
        if (fill) { doc.setFillColor(238, 240, 243); doc.rect(L, y, W, h, 'F'); }
        doc.setDrawColor(170); doc.setLineWidth(0.15);
        parts.forEach((p, i) => {
          const c = cols[i];
          doc.rect(x, y, c.mm, h);
          p.forEach((ln, j) => {
            const ty = y + pad + lh * (j + 0.8);
            if (c.a === 'l' || bold && fill) doc.text(ln, c.a === 'l' ? x + pad : x + c.mm / 2, ty, c.a === 'l' ? undefined : { align: 'center' });
            else doc.text(ln, x + c.mm - pad, ty, { align: 'right' });
          });
          x += c.mm;
        });
        y += h;
      };
      drawRow(cols.map(c => c.h), true, true);
      rows.forEach(r => drawRow(r, false, false));
      if (foot) foot.forEach(r => drawRow(r, true, false));
      y += 3;
    }

    function figure(drawFn, wmm, hmm, caption) {
      const cw = 900, ch = Math.round(cw * hmm / wmm);
      const cv = document.createElement('canvas');
      drawFn(cv, cw, ch);
      need(hmm + 9);
      doc.addImage(cv.toDataURL('image/png'), 'PNG', L + (W - wmm) / 2, y, wmm, hmm);
      y += hmm + 2;
      para(caption, 10, { center: true, after: 3 });
    }

    // ---- титул ----
    centerText('Розрахунок стійкості ґрунтового укосу', 15, true);
    centerText(model.title || 'Варіант без назви', 11.5, false);
    font(9.5); doc.setTextColor(90);
    centerText('Метод граничної рівноваги, кругоциліндричні поверхні ковзання · ' + new Date().toLocaleDateString('uk-UA'), 9.5);
    doc.setTextColor(0); y += 2;

    // ---- 1. вихідні дані ----
    head('1. Вихідні дані');
    para('Поверхня укосу задана ламаною (x; y), м: ' + M.surface.map(pt).join(', ') + '. Низ моделі: y = ' + fmt(M.ybot, 2) + ' м. ' +
      'Напрям зсуву: ' + (R.dir > 0 ? 'вліво (бровка праворуч)' : 'вправо (бровка ліворуч)') + '.');
    para('Таблиця 1 – Фізико-механічні характеристики ґрунтів', 10, { after: 1 });
    table([{ h: '№', w: 5 }, { h: 'Ґрунт', w: 24, a: 'l' }, { h: 'γ, кН/м³', w: 10 }, { h: 'γнас, кН/м³', w: 11 }, { h: 'c, кПа', w: 9 }, { h: 'φ, °', w: 8 }, { h: 'Нижня межа шару (x; y), м', w: 40, a: 'l' }],
      M.layers.map((s, i) => [i + 1, s.name, fmt(s.gamma, 2), s.gammaSat == null ? '—' : fmt(s.gammaSat, 2), fmt(s.c, 1), fmt(s.phi, 1), s.bottom ? s.bottom.map(pt).join(', ') : 'до низу моделі']), 8.5);
    if (M.inclusions.length) {
      para('Таблиця 1а – Включення (прямокутні області)', 10, { after: 1 });
      table([{ h: 'Назва', w: 26, a: 'l' }, { h: 'x, м', w: 16 }, { h: 'y, м', w: 16 }, { h: 'γ, кН/м³', w: 10 }, { h: 'c, кПа', w: 10 }, { h: 'φ, °', w: 8 }],
        M.inclusions.map(r => [r.name, fmt(r.x1, 2) + ' … ' + fmt(r.x2, 2), fmt(r.y1, 2) + ' … ' + fmt(r.y2, 2), fmt(r.gamma, 1), fmt(r.c, 0), fmt(r.phi, 1)]), 8.5);
    }
    para(M.water ? 'Рівень ґрунтових вод (лінія): ' + M.water.map(pt).join(', ') + '; γw = ' + fmt(M.gw, 2) + ' кН/м³. Поровий тиск в основі відсіку u = γw·hw, де hw — відстань по вертикалі від основи до РҐВ.'
      : 'Ґрунтові води не враховуються (u = 0).');
    para(M.loads.length ? 'Рівномірно розподілене навантаження: ' + M.loads.map(l => 'q = ' + fmt(l.q, 1) + ' кПа на ділянці x = ' + fmt(l.x1, 2) + ' … ' + fmt(l.x2, 2) + ' м').join('; ') + '.'
      : 'Зовнішнього навантаження немає.');
    if (M.anchors.length) {
      const a = M.anchors[0];
      para('Анкерне кріплення: ' + M.anchors.length + ' анкер(ів), робота — ' + (M.anchorMode === 'passive' ? 'Passive (сила додається до утримуючих)' : 'Active (сила зменшує зсувні)') + '. ' +
        (a.type === 'grouted'
          ? 'Ґрунтовий анкер: довжина ' + fmt(a.L, 2) + ' м, кут ' + fmt(a.angle, 1) + '° вниз від горизонту, закладення ' + fmt(a.bondPct, 0) + ' % (' + fmt(a.L * a.bondPct / 100, 2) + ' м), зчеплення ' + fmt(a.bond, 1) + ' кН/м, міцність на розрив ' + fmt(a.T, 1) + ' кН, опорна плита ' + fmt(a.plate, 1) + ' кН, крок з площини ' + fmt(a.S, 2) + ' м. '
          : 'Анкер з постійною силою ' + fmt(a.T, 1) + ' кН, довжина ' + fmt(a.L, 2) + ' м, кут ' + fmt(a.angle, 1) + '°, крок ' + fmt(a.S, 2) + ' м. ') +
        'Головки: ' + M.anchors.map(q => pt([q.x, q.y])).join(', ') + '.');
    }
    para('Нормативний коефіцієнт стійкості Kст = ' + fmt(model.required == null ? 1.2 : model.required, 2) + '.');

    // ---- 2. методика ----
    head('2. Методика розрахунку');
    para('Масив над можливою кругоциліндричною поверхнею ковзання ділиться на вертикальні відсіки (' + R.slicesN + ' рівних; додаткові межі ставляться у вершинах поверхні, шарів, навантажень і в точках перетину кола з межами шарів, щоб основа кожного відсіку лежала в одному ґрунті). ' +
      'Вага відсіку W включає ґрунт і навантаження на його ширині. Коефіцієнт стійкості — відношення утримуючих сил до зсувних:');
    const f = [
      'Феленіус (звичайний):  K = Σ[c·l + (W·cosα − u·l)·tgφ] / Σ W·sinα',
      'Бішоп спрощений:  K = Σ[(c·b + (W − u·b)·tgφ) / mα] / Σ W·sinα,   mα = cosα + sinα·tgφ / K',
      'Янбу спрощений (без f₀):  K = Σ[(c·b + (W − u·b)·tgφ) / (cosα·mα)] / Σ W·tgα'
    ];
    f.forEach(t => para(t, 10, { indent: 6, after: 0.8 }));
    para('де b — ширина відсіку, l = b / cosα — довжина основи, α — кут нахилу основи, c і φ — характеристики ґрунту в основі, u — поровий тиск. У методах Бішопа і Янбу K є з обох боків рівняння, тому він знаходиться ітераціями до збіжності (точність 10⁻⁷). Кола з mα < 0,2 ' + ((model.search || {}).malphaMin === 0 ? 'не відкидаються.' : 'відкидаються, як у Slide.'), 10);
    if (M.anchors.length) para('Анкер діє лише на кола, які він перетинає; сила прикладається в точці перетину вздовж анкера і розкладається на дотичну TS та нормальну TN складові до основи. Active: K = (Σутр + ΣTN·tgφ) / (Σзсув − ΣTS); Passive: K = (Σутр + ΣTN·tgφ + ΣTS) / Σзсув. Величина сили — найменша з розриву, висмикування й зриву, поділена на крок анкерів. Метод Янбу з анкерами не застосовується.', 10);
    const G = R.grid;
    para('Пошук критичної поверхні: сітка центрів x = ' + fmt(G.x1, 2) + ' … ' + fmt(G.x2, 2) + ' м, y = ' + fmt(G.y1, 2) + ' … ' + fmt(G.y2, 2) + ' м, ' + G.nx + ' × ' + G.ny + ' інтервалів (' + (G.nx + 1) * (G.ny + 1) + ' центрів)' +
      (G.auto ? ', розміщена автоматично над укосом' : '') + '; для кожного центру — ' + R.radii + ' радіусів від найменшого, що перетинає поверхню, до кола, що торкається низу моделі, з додатковим згущенням біля поверхні. ' +
      'Усього перевірено ' + R.total.toLocaleString('uk-UA') + ' кіл. ' + (R.best.bishop && R.best.bishop.refined ? 'Після сітки виконано уточнення: локальний пошук центру й радіуса з трьох найкращих вузлів окремо для кожного методу.' : ''), 10);

    // ---- 3. результати ----
    head('3. Результати розрахунку');
    para('Таблиця 2 – Мінімальні коефіцієнти стійкості', 10, { after: 1 });
    table([{ h: 'Метод', w: 30, a: 'l' }, { h: 'Kmin', w: 10 }, { h: 'K на сітці', w: 11 }, { h: 'Центр кола (xc; yc), м', w: 22 }, { h: 'R, м', w: 9 }, { h: 'Вихід на поверхню x, м', w: 20 }],
      E.METHODS.map(m => {
        const b = R.best[m];
        if (!b) return [methodNames[m], '—', '—', m === 'janbu' && R.anchors ? 'з анкерами не рахується' : '—', '—', '—'];
        return [methodNames[m], fmt(b.F, 3), fmt(b.gridF != null ? b.gridF : b.F, 3), pt([b.xc, b.yc]), fmt(b.R, 2), fmt(b.xl, 2) + ' … ' + fmt(b.xr, 2)];
      }), 8.5);

    const mainM = R.best.bishop ? 'bishop' : 'fellenius';
    const bb = R.best[mainM];
    const t = E.sliceTable(M, bb, mainM);
    figure((cv, w, h) => D.drawModel(cv, model, { res: R, detail: Object.assign({}, t.result, { terms: t.terms }), showGrid: true, light: true, w, h, label: 'K = ' + fmt(bb.F, 3) }),
      W, W * 0.6, 'Рисунок 1 – Розрахункова схема, сітка центрів і критична поверхня ковзання (' + methodNames[mainM].toLowerCase() + ')');
    figure((cv, w, h) => D.drawMap(cv, R, { light: true, w, h }), W * 0.8, W * 0.36,
      'Рисунок 2 – Мінімальні коефіцієнти стійкості у вузлах сітки центрів (Бішоп); × — найменший');

    para('Таблиця 3 – Розрахунок за відсіками для критичного кола (' + methodNames[mainM].toLowerCase() + ', K = ' + fmt(bb.F, 3) + ')', 10, { after: 1 });
    const rows = tableRows(t, mainM);
    let sW = 0, sR = 0, sD = 0;
    rows.forEach(r => { sW += r.W; sR += r.res; sD += r.drv; });
    const isF = mainM === 'fellenius';
    const cols = [{ h: '№', w: 5 }, { h: 'b, м', w: 7 }, { h: 'h, м', w: 7 }, { h: 'W, кН/м', w: 9 }, { h: 'α, °', w: 7 }, { h: 'c, кПа', w: 7 }, { h: 'φ, °', w: 6 }, { h: 'u, кПа', w: 7 }]
      .concat(isF ? [] : [{ h: 'mα', w: 7 }]).concat([{ h: 'N′, кН/м', w: 9 }, { h: isF ? 'c·l + N′·tgφ' : '(c·b+(W−u·b)·tgφ)/mα', w: 12 }, { h: 'W·sinα', w: 9 }]);
    table(cols, rows.map(r => [r.i, fmt(r.b, 2), fmt(r.h, 2), fmt(r.W, 1), fmt(r.alpha, 1), fmt(r.c, 1), fmt(r.phi, 1), fmt(r.u, 1)]
      .concat(isF ? [] : [fmt(r.ma, 3)]).concat([fmt(r.Np, 1), fmt(r.res, 1), fmt(r.drv, 1)])), 7.5,
      [['Σ', '', '', fmt(sW, 1), '', '', '', ''].concat(isF ? [] : ['']).concat(['', fmt(sR, 1), fmt(sD, 1)])]);
    if (t.terms && t.terms.length) {
      para('Анкери, що перетинають критичне коло: ' + t.terms.map((q, i) => (i + 1) + ') у точці ' + pt([q.x, q.y]) + ', сила ' + fmt(q.F, 1) + ' кН/м (' + q.mode + '), TS = ' + fmt(q.TS, 1) + ', TN = ' + fmt(q.TN, 1)).join('; ') + '.', 10);
      para('K = ' + fmt(bb.F, 3) + ' з урахуванням анкерів (' + (R.anchorMode === 'passive' ? 'Passive' : 'Active') + ').', 10);
    } else {
      para('K = Σутр / Σзсув = ' + fmt(sR, 1) + ' / ' + fmt(sD, 1) + ' = ' + fmt(sR / sD, 3) + (R.anchors ? ' (анкери це коло не перетинають)' : '') + '.', 10);
    }
    if (R.warnings && R.warnings.length) para('Примітки: ' + R.warnings.join(' '), 10);

    // ---- 4. висновок ----
    head('4. Висновок');
    const req = model.required == null ? 1.2 : model.required;
    const K = bb.F;
    const others = E.METHODS.filter(m => m !== mainM && R.best[m]).map(m => methodNames[m].split(' ')[0] + ' — ' + fmt(R.best[m].F, 3)).join(', ');
    para('Мінімальний коефіцієнт стійкості за методом ' + (mainM === 'bishop' ? 'Бішопа' : 'Феленіуса') + ' K = ' + fmt(K, 3) + (others ? ' (' + others + ')' : '') + '. ' +
      (K >= req ? 'K ≥ Kст = ' + fmt(req, 2) + ', стійкість укосу забезпечена.'
        : K >= 1 ? 'K < Kст = ' + fmt(req, 2) + ': укіс формально стоїть (K > 1), але нормативний запас не забезпечено — потрібні заходи (виположування, зрізка, утримуючі конструкції, анкери, дренаж).'
          : 'K < 1: укіс нестійкий, потрібні заходи з підвищення стійкості (виположування, зрізка, утримуючі конструкції, анкери, дренаж).') +
      ' Критичне коло: центр ' + pt([bb.xc, bb.yc]) + ' м, R = ' + fmt(bb.R, 2) + ' м, виходить на поверхню при x = ' + fmt(bb.xl, 2) + ' і ' + fmt(bb.xr, 2) + ' м.');

    // нумерація сторінок
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); font(8); doc.setTextColor(120);
      doc.text('Укіс — розрахунок стійкості схилу', L, PH - 9);
      doc.text(i + ' / ' + n, PW - Rm, PH - 9, { align: 'right' });
      doc.setTextColor(0);
    }
    return doc.output('blob');
  }

  root.SlopeReport = { make };
})(typeof self !== 'undefined' ? self : this);
