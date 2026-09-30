/* Listino: lettura del file Excel dell'agente, riconoscimento colonne, ricerca.
   Il file non fa parte dell'app: viene caricato dall'agente e salvato solo nel suo browser. */
(function () {
  const RX = {
    cod: /^(cod(ice)?|code|art(icolo)?|sku|part|rif)\b|^cod\.|codice/i,
    desc: /descr|description|denominaz|articolo desc/i,
    prezzo: /prezz|price|listino|eur|€|importo|pubblico/i,
    fam: /famigl|family|gruppo|linea/i,
    cat: /categ|sottogrup|tipolog/i
  };

  const norm = s => String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  function parsePrice(v) {
    if (typeof v === 'number') return v;
    let s = String(v == null ? '' : v).replace(/[€\s]/g, '').replace(/eur/i, '');
    if (!s || s === '-') return null;
    // 1.234,56 -> 1234.56 ; 1,234.56 -> 1234.56 ; 1234,5 -> 1234.5
    if (s.includes(',') && s.includes('.')) {
      s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, ''); // 1.250 all'italiana = milleduecentocinquanta
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function sheetRows(ws) {
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
    const txt = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
    return { raw, txt };
  }

  function detectHeader(txtRows) {
    let best = null;
    const lim = Math.min(txtRows.length, 40);
    for (let r = 0; r < lim; r++) {
      const row = txtRows[r] || [];
      const m = { cod: -1, desc: -1, prezzo: -1, fam: -1, cat: -1 };
      row.forEach((cell, i) => {
        const t = String(cell || '').trim();
        if (!t || t.length > 40) return;
        for (const k of ['desc', 'cod', 'prezzo', 'fam', 'cat']) {
          if (m[k] === -1 && RX[k].test(t) && !Object.values(m).includes(i)) { m[k] = i; break; }
        }
      });
      const score = (m.cod >= 0) + (m.desc >= 0) + (m.prezzo >= 0);
      if (score >= 2 && (!best || score > best.score)) best = { row: r, map: m, score };
      if (score === 3) break;
    }
    return best;
  }

  function analyze(workbook) {
    const sheets = workbook.SheetNames.map(name => {
      const rows = sheetRows(workbook.Sheets[name]);
      return { name, ...rows, det: detectHeader(rows.txt) };
    });
    const pick = sheets.filter(s => s.det).sort((a, b) => b.det.score - a.det.score)[0] || sheets[0];
    return { sheets, pick };
  }

  function build(sheet, headerRow, map) {
    const items = [];
    for (let r = headerRow + 1; r < sheet.raw.length; r++) {
      const rawR = sheet.raw[r] || [], txtR = sheet.txt[r] || [];
      const c = String(txtR[map.cod] ?? '').trim();
      const d = String(txtR[map.desc] ?? '').trim();
      if (!c || !d) continue;
      const p = map.prezzo >= 0 ? parsePrice(rawR[map.prezzo]) : null;
      const g = [map.fam >= 0 ? txtR[map.fam] : '', map.cat >= 0 ? txtR[map.cat] : '']
        .map(x => String(x || '').trim()).filter(Boolean);
      items.push({ c, d, p, f: g[0] || '', k: g[1] || '' });
    }
    return items;
  }

  let cache;
  function current() {
    if (cache === undefined) cache = Store.get(Store.KEYS.listino, null);
    return cache;
  }

  function save(meta, items) {
    const data = { name: meta.name, loadedAt: new Date().toISOString(), sheet: meta.sheet, items };
    const ok = Store.set(Store.KEYS.listino, data);
    index = null; cache = undefined;
    return ok ? data : null;
  }

  function reset() { Store.del(Store.KEYS.listino); index = null; cache = undefined; }

  let index = null;
  function getIndex() {
    const l = current();
    if (!l) return null;
    if (!index || index.ref !== l.loadedAt) {
      const byCode = new Map();
      const rows = l.items.map((it, i) => {
        it.i = i;
        const k = it.c.toUpperCase();
        if (!byCode.has(k)) byCode.set(k, []);
        byCode.get(k).push(it);
        return { it, hay: norm(it.c + ' ' + it.d), code: norm(it.c) };
      });
      index = { ref: l.loadedAt, rows, byCode, fams: [...new Set(l.items.map(i => i.f).filter(Boolean))] };
    }
    return index;
  }

  // tutte le righe di listino con quel codice (alcuni listini ripetono un codice con prezzi diversi)
  function lookupAll(code) {
    const ix = getIndex();
    if (!ix || !code) return [];
    const k = String(code).trim().toUpperCase();
    return ix.byCode.get(k) || ix.byCode.get(k.replace(/^0+/, '')) || [];
  }
  function lookup(code) { return lookupAll(code)[0] || null; }
  function byIndex(i) { const l = current(); return l ? l.items[i] : null; }

  function search(q, fam, limit = 80) {
    const ix = getIndex();
    if (!ix) return [];
    const toks = norm(q).split(/\s+/).filter(Boolean);
    const out = [];
    for (const r of ix.rows) {
      if (fam && r.it.f !== fam) continue;
      if (toks.every(t => r.hay.includes(t))) {
        const score = toks.length && r.code.startsWith(toks[0]) ? 0 : 1;
        out.push({ ...r, score });
      }
    }
    out.sort((a, b) => a.score - b.score);
    return out.slice(0, limit).map(r => r.it);
  }

  function families() { const ix = getIndex(); return ix ? ix.fams : []; }

  function sameDesc(a, b) { return norm(a).replace(/\s+/g, ' ') === norm(b).replace(/\s+/g, ' '); }

  window.Listino = { analyze, build, save, reset, current, lookup, lookupAll, byIndex, search, families, parsePrice, sameDesc, norm };
})();
