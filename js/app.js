/* Ordine Italia - logica dell'interfaccia */
(function () {
  const APP_VERSION = '1.1.0';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------- stato ----------------
  const state = {
    view: 'ordine',
    settings: Store.merge(Store.defaultSettings(), Store.get(Store.KEYS.settings)),
    forms: {
      ordine: Store.merge(Store.defaultOrdine(), Store.sget(Store.KEYS.ordine)),
      garanzia: Store.merge(Store.defaultGaranzia(), Store.sget(Store.KEYS.garanzia))
    },
    showErrors: { ordine: false, garanzia: false },
    lastPdf: null,
    workbook: null
  };
  // Riaprendo l'app il modulo parte vuoto: la bozza sta in sessionStorage, non in localStorage.
  // I campi "privati" (_id, _autoRif…) non sono nei default: li recuperiamo dalla sessione.
  const PRIV = ['_id', '_autoRif', '_counted', '_dirty', '_status', '_savedAt'];
  for (const k of ['ordine', 'garanzia']) {
    Store.del(Store.KEYS[k]); // bozze della v1.0 salvate in modo permanente: eliminate
    const saved = Store.sget(Store.KEYS[k]);
    if (saved) for (const p of PRIV) if (saved[p] !== undefined) state.forms[k][p] = saved[p];
  }

  const objOf = name => name === 'settings' ? state.settings : state.forms[name];
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

  let saveTimer = null;
  function persist(name) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNow(name), 250);
  }
  function saveNow(name) {
    if (name === 'settings') Store.set(Store.KEYS.settings, state.settings);
    else Store.sset(Store.KEYS[name], state.forms[name]);
  }
  // modifica fatta dall'utente su un documento
  function touch(name) {
    const f = state.forms[name];
    if (!f._dirty) { f._dirty = true; renderEditBar(name); }
    persist(name);
  }

  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------------- numerazione riferimenti ----------------
  function nextRif(peek = true) {
    const yy = String(new Date().getFullYear()).slice(2);
    let c = Store.get(Store.KEYS.counter, { year: yy, n: 0 });
    if (c.year !== yy) c = { year: yy, n: 0 };
    const n = c.n + 1;
    if (!peek) Store.set(Store.KEYS.counter, { year: yy, n });
    const sig = (state.settings.sigla || '').trim().toUpperCase();
    return (sig ? sig + '-' : '') + yy + '-' + String(n).padStart(3, '0');
  }

  // ---------------- viste ----------------
  function showView(v) {
    state.view = v;
    $$('.view').forEach(el => el.classList.toggle('is-active', el.id === 'view-' + v));
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === v));
    $('#actionbar').hidden = !(v === 'ordine' || v === 'garanzia');
    if (v === 'archivio') renderArchivio();
    if (v === 'impostazioni') renderListinoStatus();
    if (v === 'ordine' || v === 'garanzia') refreshReady();
    window.scrollTo({ top: 0 });
  }

  // ---------------- binding campi ----------------
  function fillForm(name) {
    const root = name === 'settings' ? $('#view-impostazioni') : $('#view-' + name);
    const obj = objOf(name);
    $$('[data-f]', root).forEach(el => {
      const v = getPath(obj, el.dataset.f);
      if (el.type === 'radio') el.checked = String(v) === el.value;
      else if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v == null ? '' : v;
    });
    if (name !== 'settings') { renderRighe(name); applyConditions(name); refreshReady(); renderEditBar(name); }
  }

  function onFieldInput(e) {
    const el = e.target;
    if (!el.dataset || !el.dataset.f) return;
    const view = el.closest('[data-form]');
    if (!view) return;
    const name = view.dataset.form;
    const obj = objOf(name);
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'radio' && !el.checked) return;
    setPath(obj, el.dataset.f, v);
    if (el.dataset.f === 'rif') obj._autoRif = false;
    if (el.dataset.f === 'pesante' && v) obj.servSponda = false;
    if (name === 'settings') persist(name); else touch(name);
    if (name === 'settings') {
      if (el.dataset.f === 'sigla') refreshAutoRif();
      return;
    }
    applyConditions(name);
    refreshReady();
  }

  function refreshAutoRif() {
    for (const k of ['ordine', 'garanzia']) {
      const f = state.forms[k];
      if (f._autoRif && !f._counted) { f.rif = nextRif(); persist(k); const i = $(`#view-${k} [data-f="rif"]`); if (i) i.value = f.rif; }
    }
  }

  // data-show="campo=valore|valore2"  data-hide="..."
  function testCond(obj, expr) {
    const [k, vals] = expr.split('=');
    const v = String(getPath(obj, k));
    return vals.split('|').includes(v);
  }
  function applyConditions(name) {
    const root = $('#view-' + name), obj = objOf(name);
    $$('[data-show]', root).forEach(el => { el.hidden = !testCond(obj, el.dataset.show); });
    $$('[data-hide]', root).forEach(el => { if (testCond(obj, el.dataset.hide)) el.hidden = true; else if (!el.dataset.show) el.hidden = false; });
  }

  // ---------------- righe ----------------
  function rigaFlag(r) {
    if (!Listino.current() || !r.cod) return '';
    const all = Listino.lookupAll(r.cod);
    const it = all[0];
    if (!it) return '<span class="flag bad">Codice non presente a listino: verifica</span>';
    const parts = [];
    const prices = [...new Set(all.map(x => x.p))];
    if (all.length > 1 && prices.length > 1) parts.push(`<span class="flag bad">Codice presente ${all.length} volte a listino con prezzi diversi (${prices.map(p => esc(PDF.eur(p))).join(' / ')}): verifica</span>`);
    if (r.desc && !all.some(x => Listino.sameDesc(r.desc, x.d))) parts.push(`<span class="flag">Descrizione diversa dal listino <button type="button" data-act="use-desc">Usa quella del listino</button></span>`);
    const p = Listino.parsePrice(r.prezzo);
    if (r.prezzo !== undefined && p != null && it.p != null && prices.length === 1 && Math.abs(p - it.p) > 0.005) parts.push(`<span class="flag">Listino ${esc(PDF.eur(it.p))} <button type="button" data-act="use-price">Usa</button></span>`);
    if (!parts.length) return '<span class="flag ok">✓ A listino</span>';
    return parts.join(' ');
  }

  function rigaHTML(name, r, i) {
    const hasL = !!Listino.current();
    const searchBtn = hasL ? `<button type="button" class="btn small" data-act="cerca-riga" aria-label="Cerca a listino">Cerca</button>` : '';
    const common = `
      <span class="riga-num">Riga ${i + 1}</span>
      <label class="fld r-cod"><span>Codice</span><span class="cod-wrap"><input data-r="cod" value="${esc(r.cod)}" autocomplete="off" autocapitalize="characters">${searchBtn}</span></label>
      <label class="fld r-desc"><span>Descrizione</span><input data-r="desc" value="${esc(r.desc)}"></label>
      <label class="fld r-qta"><span>Q.tà</span><input data-r="qta" value="${esc(r.qta)}" inputmode="decimal"></label>`;
    if (name === 'ordine') {
      const imp = PDF.rigaImporto(r);
      return `<div class="riga" data-i="${i}">${common}
        <label class="fld r-prz"><span>Prezzo unitario €</span><input data-r="prezzo" value="${esc(r.prezzo)}" inputmode="decimal"></label>
        <label class="fld r-sc"><span>Sconto %</span><input data-r="sconto" value="${esc(r.sconto)}" inputmode="decimal"></label>
        <label class="fld r-dt"><span>Data spedizione</span><input type="date" data-r="data" value="${esc(r.data)}"></label>
        <div class="fld r-imp"><span>Importo</span><div class="val" data-imp>${imp != null ? esc(PDF.eur(imp)) : '—'}</div></div>
        <div class="r-tools"><span data-flag>${rigaFlag(r)}</span><span class="spacer"></span><button type="button" class="btn small ghost" data-act="del-riga">Elimina riga</button></div>
      </div>`;
    }
    return `<div class="riga" data-i="${i}">${common}
      <label class="fld r-dt"><span>Data consegna</span><input type="date" data-r="data" value="${esc(r.data)}"></label>
      <div class="r-tools"><span data-flag>${rigaFlag(r)}</span><span class="spacer"></span><button type="button" class="btn small ghost" data-act="del-riga">Elimina riga</button></div>
    </div>`;
  }

  function renderRighe(name) {
    const box = $('#righe-' + name);
    box.classList.toggle('garanzia', name === 'garanzia');
    box.innerHTML = state.forms[name].righe.map((r, i) => rigaHTML(name, r, i)).join('');
    renderTotale(name);
    markErrors(name);
  }

  function renderTotale(name) {
    if (name !== 'ordine') return;
    let tot = 0, any = false;
    state.forms.ordine.righe.forEach(r => { const v = PDF.rigaImporto(r); if (v != null) { tot += v; any = true; } });
    $('#totale-ordine').innerHTML = any ? `Totale ${esc(PDF.eur(tot))}<small>imponibile, IVA esclusa</small>` : '';
  }

  function onRigaInput(e) {
    const el = e.target;
    if (!el.dataset.r) return;
    const rowEl = el.closest('.riga');
    const name = el.closest('[data-form]').dataset.form;
    const r = state.forms[name].righe[+rowEl.dataset.i];
    r[el.dataset.r] = el.value;
    if (name === 'ordine') {
      const imp = PDF.rigaImporto(r);
      $('[data-imp]', rowEl).textContent = imp != null ? PDF.eur(imp) : '—';
      renderTotale(name);
    }
    if (e.type === 'change' && el.dataset.r === 'cod') autofillFromListino(name, r, rowEl);
    if (e.type === 'change' || el.dataset.r !== 'cod') $('[data-flag]', rowEl).innerHTML = rigaFlag(r);
    touch(name);
    refreshReady();
  }

  function autofillFromListino(name, r, rowEl) {
    const it = Listino.lookup(r.cod);
    if (!it) return;
    r.cod = it.c;
    if (!r.desc) r.desc = it.d;
    if (name === 'ordine' && !r.prezzo && it.p != null) r.prezzo = String(it.p).replace('.', ',');
    $('[data-r="cod"]', rowEl).value = r.cod;
    $('[data-r="desc"]', rowEl).value = r.desc;
    if (name === 'ordine') {
      $('[data-r="prezzo"]', rowEl).value = r.prezzo;
      const imp = PDF.rigaImporto(r);
      $('[data-imp]', rowEl).textContent = imp != null ? PDF.eur(imp) : '—';
      renderTotale(name);
    }
  }

  function addRiga(name, item) {
    const f = state.forms[name];
    const empty = name === 'ordine' ? Store.emptyRigaOrdine() : Store.emptyRigaGaranzia();
    let r;
    const last = f.righe[f.righe.length - 1];
    if (item && last && !last.cod && !last.desc) r = last;
    else { r = empty; f.righe.push(r); }
    if (item) fillRigaFromItem(name, r, item);
    touch(name);
    renderRighe(name);
    refreshReady();
    const rows = $$('#righe-' + name + ' .riga');
    const target = rows[f.righe.indexOf(r)];
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (!item) $('[data-r="cod"]', target).focus({ preventScroll: true });
    }
  }

  function fillRigaFromItem(name, r, it) {
    r.cod = it.c; r.desc = it.d;
    if (name === 'ordine' && it.p != null) r.prezzo = String(it.p).replace('.', ',');
    if (!r.qta) r.qta = '1';
  }

  // ---------------- validazione ----------------
  const CAP_RX = /^\d{5}$/;
  function validate(name) {
    const f = state.forms[name];
    const out = [];
    const err = (k, msg) => out.push({ k, msg, level: 'err' });
    const wrn = (k, msg) => out.push({ k, msg, level: 'wrn' });
    const blank = v => !String(v || '').trim();

    if (name === 'ordine') {
      if (blank(f.cliente)) err('cliente', 'Cliente');
      if (blank(f.riferimento)) err('riferimento', 'Riferimento cliente (chi ha richiesto, n. ordine…)');
      if (f.destTipo === 'diversa') {
        if (blank(f.dest.indirizzo)) err('destIndirizzo', 'Indirizzo di destinazione');
        if (!CAP_RX.test(String(f.dest.cap).trim())) err('destCap', 'CAP destinazione (5 cifre)');
        if (blank(f.dest.citta)) err('destCitta', 'Località di destinazione');
        if (blank(f.dest.telefono)) err('destTel', 'Telefono della destinazione');
      }
      if (blank(f.pagTipo)) err('pagTipo', 'Tipologia di pagamento');
      else if (f.pagTipo !== 'SOLITO' && blank(f.pagScad)) err('pagScad', 'Scadenza del pagamento');
      if (f.pagTipo === 'ALTRO' && blank(f.pagAltro)) err('pagTipo', 'Specifica la modalità di pagamento');
      if (blank(f.porto)) err('porto', 'Porto (franco, franco con addebito, assegnato)');
      if (blank(f.cura)) err('cura', 'Trasporto a cura del (mittente, destinatario, vettore)');
      if ((f.porto === 'Franco' || f.porto === 'Franco c/addebito')) {
        const cap = f.destTipo === 'diversa' ? f.dest.cap : f.capSede;
        if (f.destTipo !== 'diversa' && !CAP_RX.test(String(cap).trim())) err('capSede', 'CAP della sede, per la quotazione del trasporto');
        if (f.pesante && blank(f.scaricoPesante)) err('porto', 'Scarico attrezzatura pesante: muletto o mezzo con gru');
        if (f.porto === 'Franco c/addebito' && blank(f.portoImporto)) wrn('porto', 'Importo del trasporto ancora da quotare');
      }
    } else {
      if (blank(f.cliente)) err('cliente', 'Cliente');
      if (blank(f.cura)) err('cura', 'Spedizione con');
      if (blank(f.porto)) err('porto', 'Porto');
      if (blank(f.modello)) err('modello', 'Modello macchina');
      if (blank(f.matricola)) err('matricola', 'Matricola');
      if (blank(f.difetto)) err('difetto', 'Difetto riscontrato');
    }

    const righe = f.righe.map((r, i) => ({ r, i })).filter(x => !blank(x.r.cod) || !blank(x.r.desc) || (name === 'ordine' && !blank(x.r.prezzo)));
    if (!righe.length) err('righe', 'Almeno una riga con codice, descrizione e quantità');
    const hasL = !!Listino.current();
    righe.forEach(({ r, i }) => {
      const n = 'Riga ' + (i + 1);
      if (blank(r.cod)) err('riga:' + i, n + ': codice');
      if (blank(r.desc)) err('riga:' + i, n + ': descrizione');
      const q = Listino.parsePrice(r.qta);
      if (!(q > 0)) err('riga:' + i, n + ': quantità');
      if (name === 'ordine' && blank(r.prezzo)) wrn('riga:' + i, n + ': prezzo mancante');
      if (hasL && !blank(r.cod)) {
        const all = Listino.lookupAll(r.cod);
        if (!all.length) wrn('riga:' + i, n + ': codice ' + r.cod + ' non trovato a listino');
        else if (new Set(all.map(x => x.p)).size > 1) wrn('riga:' + i, n + ': codice ' + r.cod + ' presente più volte a listino con prezzi diversi');
        if (all.length && !blank(r.desc) && !all.some(x => Listino.sameDesc(r.desc, x.d))) wrn('riga:' + i, n + ': la descrizione non corrisponde al codice (fa fede il codice)');
      }
    });
    if (blank(f.rif)) wrn('rif', 'Ns. riferimento vuoto: verrà assegnato in automatico');
    return out;
  }

  function markErrors(name) {
    const root = $('#view-' + name);
    $$('.is-missing', root).forEach(el => el.classList.remove('is-missing'));
    if (!state.showErrors[name]) return;
    validate(name).filter(x => x.level === 'err').forEach(x => {
      if (x.k.startsWith('riga:')) {
        const row = $$('.riga', root)[+x.k.slice(5)];
        if (row) $$('.fld', row).forEach(fl => { const inp = $('input', fl); if (inp && !inp.value.trim() && inp.dataset.r !== 'prezzo' && inp.dataset.r !== 'sconto' && inp.dataset.r !== 'data') fl.classList.add('is-missing'); });
      } else {
        const el = $(`[data-k="${x.k}"]`, root);
        if (el) el.classList.add('is-missing');
      }
    });
  }

  function refreshReady() {
    const name = state.view;
    if (name !== 'ordine' && name !== 'garanzia') return;
    const list = validate(name);
    const errs = list.filter(x => x.level === 'err'), wrns = list.filter(x => x.level === 'wrn');
    const b = $('#ready');
    b.classList.toggle('is-ok', !errs.length);
    if (errs.length) {
      b.innerHTML = `<span class="meter">${errs.length}</span><span class="txt">${errs.length === 1 ? 'Manca 1 dato' : 'Mancano ' + errs.length + ' dati'}<small>${esc(errs.slice(0, 3).map(x => x.msg.split(' (')[0]).join(', '))}</small></span>`;
    } else {
      b.innerHTML = `<span class="meter"></span><span class="txt">Completo${wrns.length ? '' : ', pronto da inviare'}<small>${wrns.length ? (wrns.length === 1 ? '1 avviso da controllare' : wrns.length + ' avvisi da controllare') : 'Tutti i dati richiesti ci sono'}</small></span>`;
    }
    markErrors(name);
  }

  function openIssues(name, forPdf) {
    const list = validate(name);
    const errs = list.filter(x => x.level === 'err');
    const ul = $('#missing-list');
    ul.innerHTML = list.length
      ? list.map((x, i) => `<li class="${x.level}"><button type="button" data-goto="${i}">${esc(x.msg)}</button></li>`).join('')
      : '<li>Nessun dato mancante.</li>';
    $('#dlg-missing h2').textContent = errs.length ? 'Dati da completare' : (list.length ? 'Controlla prima di inviare' : 'Tutto a posto');
    const anyway = $('#btn-pdf-anyway');
    anyway.hidden = !forPdf;
    anyway.textContent = errs.length ? 'Crea PDF comunque' : 'Crea PDF';
    anyway.className = errs.length ? 'btn' : 'btn primary';
    ul.onclick = e => {
      const btn = e.target.closest('[data-goto]');
      if (!btn) return;
      $('#dlg-missing').close();
      goTo(name, list[+btn.dataset.goto].k);
    };
    $('#dlg-missing').showModal();
  }

  function goTo(name, k) {
    const root = $('#view-' + name);
    let el;
    if (k.startsWith('riga:')) el = $$('.riga', root)[+k.slice(5)];
    else if (k === 'righe') el = $('#righe-' + name);
    else if (k === 'rif') el = $('[data-f="rif"]', root)?.closest('.fld');
    else el = $(`[data-k="${k}"]`, root);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const inp = el.matches('input,select,textarea') ? el : $('input:not([type=radio]):not([type=checkbox]),select,textarea,input', el);
    if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 350);
  }

  // ---------------- PDF ----------------
  function onPdfClick() {
    const name = state.view;
    state.showErrors[name] = true;
    refreshReady();
    const list = validate(name);
    if (list.length) openIssues(name, true);
    else createPdf(name);
  }

  function safeName(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40); }

  function createPdf(name, fromArchive) {
    const f = fromArchive ? fromArchive.data : state.forms[name];
    const s = state.settings;
    if (!fromArchive) {
      assignRif(name);
      if (!f._id) f._id = newId();
    }
    let doc;
    try {
      doc = name === 'ordine' ? PDF.ordine(f, s) : PDF.garanzia(f, s);
    } catch (e) {
      console.error(e);
      toast('Errore nella creazione del PDF: ' + e.message, 5000);
      return;
    }
    const blob = doc.output('blob');
    const base = name === 'ordine' ? 'Ordine' : 'Garanzia';
    const filename = [base, safeName(f.rif), safeName(f.cliente)].filter(Boolean).join('_') + '.pdf';
    if (state.lastPdf && state.lastPdf.url) URL.revokeObjectURL(state.lastPdf.url);
    state.lastPdf = { blob, filename, url: URL.createObjectURL(blob), name, form: f };
    if (!fromArchive) commitDoc(name, 'pdf');
    else if (fromArchive.status !== 'pdf') { fromArchive.data._status = 'pdf'; archive(name, fromArchive.data, 'pdf', fromArchive.savedAt); if (state.forms[name]._id === fromArchive.id) { state.forms[name]._status = 'pdf'; saveNow(name); renderEditBar(name); } }
    showPdfDialog();
  }

  const newId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // consuma il numero progressivo solo quando il documento viene salvato davvero
  function assignRif(name) {
    const f = state.forms[name];
    if (!String(f.rif || '').trim() || (f._autoRif && !f._counted)) {
      f.rif = nextRif(false);
      f._autoRif = true;
    }
    f._counted = true;
    const ri = $(`#view-${name} [data-f="rif"]`); if (ri) ri.value = f.rif;
  }

  // salva il documento in archivio (bozza o PDF creato)
  function commitDoc(name, status) {
    const f = state.forms[name];
    assignRif(name);
    if (!f._id) f._id = newId();
    f._status = status;
    f._dirty = false;
    f._savedAt = new Date().toISOString();
    archive(name, f, status);
    saveNow(name);
    renderEditBar(name);
  }

  function saveDraft(name) {
    const f = state.forms[name];
    if (!hasContent(name)) { toast('Il documento è vuoto: niente da salvare'); return; }
    if (f._id && !f._dirty) { toast('Nessuna modifica da salvare'); return; }
    commitDoc(name, 'bozza');
    toast('Salvato in Archivio');
  }

  function deleteCurrent(name) {
    const f = state.forms[name];
    if (!f._id) return;
    if (!confirm(`Eliminare definitivamente ${name === 'ordine' ? 'l\'ordine' : 'la richiesta'} rif. ${f.rif} da questo dispositivo?`)) return;
    const list = Store.get(Store.KEYS.archivio, []).filter(e => e.id !== f._id);
    Store.set(Store.KEYS.archivio, list);
    newDoc(name, true);
    toast('Documento eliminato');
  }

  function renderEditBar(name) {
    const bar = $('#editbar-' + name);
    if (!bar) return;
    const f = state.forms[name];
    const when = f._savedAt ? new Date(f._savedAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const stato = f._status === 'pdf' ? 'PDF creato' : 'Bozza';
    let html;
    if (f._id) {
      html = `<div class="eb-txt"><strong>Stai modificando rif. ${esc(f.rif)}</strong><span>${esc(stato)}, salvato il ${esc(when)}${f._dirty ? ' - <em>modifiche non salvate</em>' : ''}</span></div>
        <button class="btn small danger" data-act="elimina">Elimina</button>`;
    } else {
      html = `<div class="eb-txt"><strong>${name === 'ordine' ? 'Nuovo ordine' : 'Nuova richiesta'}</strong><span>${f._dirty ? '<em>Non ancora salvato</em>' : 'Modulo vuoto'}</span></div>`;
    }
    bar.innerHTML = html;
    bar.classList.toggle('is-edit', !!f._id);
    bar.classList.toggle('is-dirty', !!f._dirty);
  }

  function archive(name, f, status, keepDate) {
    const list = Store.get(Store.KEYS.archivio, []);
    let tot = null;
    if (name === 'ordine') { tot = 0; f.righe.forEach(r => { const v = PDF.rigaImporto(r); if (v != null) tot += v; }); }
    const data = JSON.parse(JSON.stringify(f));
    delete data._dirty;
    const entry = {
      id: f._id, kind: name, savedAt: keepDate || new Date().toISOString(), status: status || 'bozza',
      rif: f.rif, cliente: f.cliente, tipo: name === 'ordine' ? f.tipo : 'Garanzia', total: tot,
      data
    };
    const i = list.findIndex(x => x.id === entry.id);
    if (i >= 0) list.splice(i, 1);
    list.unshift(entry);
    if (list.length > 150) list.length = 150;
    if (!Store.set(Store.KEYS.archivio, list)) toast('Archivio pieno: elimina qualche documento vecchio', 4000);
  }

  function showPdfDialog() {
    const p = state.lastPdf;
    $('#pdf-name').textContent = p.filename;
    let canShare = false;
    try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([p.blob], p.filename, { type: 'application/pdf' })] })); } catch (e) {}
    $('#pdf-share').hidden = !canShare;
    $('#pdf-mail-hint').hidden = canShare && matchMedia('(pointer:coarse)').matches;
    $('#dlg-pdf').showModal();
  }

  function mailParts() {
    const p = state.lastPdf, f = p.form, s = state.settings;
    const isOrd = p.name === 'ordine';
    const to = (isOrd ? s.emailOrdini : (s.emailGaranzie || s.emailOrdini)) || '';
    const subject = isOrd
      ? `Ordine ${f.tipo || ''} - ${f.cliente} - rif. ${f.rif}${f.riferimento ? ' / ' + f.riferimento : ''}`
      : `Sostituzione in garanzia senza reso - ${f.cliente} - ${f.modello} matr. ${f.matricola}`;
    const lines = [];
    lines.push('Buongiorno,', '', `in allegato ${isOrd ? 'ordine (' + (f.tipo || '').toLowerCase() + ')' : 'richiesta di sostituzione in garanzia senza reso'} per ${f.cliente}.`);
    if (isOrd && f.riferimento) lines.push('Riferimento cliente: ' + f.riferimento);
    lines.push('Ns. rif.: ' + f.rif, '');
    f.righe.filter(r => r.cod || r.desc).slice(0, 15).forEach(r => lines.push(`- ${r.qta} x ${r.cod} ${r.desc}`));
    if (f.note) lines.push('', 'Note: ' + f.note);
    lines.push('', 'Cordiali saluti', s.agente || '');
    return { to, cc: s.emailCC || '', subject, body: lines.join('\n').slice(0, 1600) };
  }

  async function sharePdf() {
    const p = state.lastPdf, m = mailParts();
    const file = new File([p.blob], p.filename, { type: 'application/pdf' });
    try {
      await navigator.share({ files: [file], title: m.subject, text: m.body });
    } catch (e) { if (e.name !== 'AbortError') toast('Condivisione non riuscita: usa "Scarica PDF"'); }
  }
  function downloadPdf() {
    const a = document.createElement('a');
    a.href = state.lastPdf.url; a.download = state.lastPdf.filename;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function openPdf() {
    const w = window.open(state.lastPdf.url, '_blank');
    if (!w) downloadPdf();
  }
  function mailPdf() {
    const m = mailParts();
    if (!m.to) toast('Imposta l\'email ordini nelle Impostazioni', 3500);
    const q = [];
    if (m.cc) q.push('cc=' + encodeURIComponent(m.cc));
    q.push('subject=' + encodeURIComponent(m.subject));
    q.push('body=' + encodeURIComponent(m.body));
    location.href = 'mailto:' + encodeURIComponent(m.to).replace(/%40/g, '@').replace(/%2C/g, ',') + '?' + q.join('&');
  }

  // ---------------- nuovo documento ----------------
  function hasContent(name) {
    const f = state.forms[name];
    return !!(f.cliente || f.righe.some(r => r.cod || r.desc) || f.note);
  }
  function unsavedOk(name, msg) {
    const f = state.forms[name];
    if (!f._dirty || !hasContent(name)) return true;
    return confirm(msg || 'Ci sono modifiche non salvate che andranno perse. Continuare?\n(Annulla e premi "Salva" per tenerle.)');
  }
  function newDoc(name, force) {
    if (!force && !unsavedOk(name)) return;
    const f = name === 'ordine' ? Store.defaultOrdine() : Store.defaultGaranzia();
    f.rif = nextRif(); f._autoRif = true; f._counted = false;
    if (name === 'garanzia') { f.sig = ''; f.preparatoDa = state.settings.agente || ''; }
    state.forms[name] = f;
    state.showErrors[name] = false;
    saveNow(name);
    fillForm(name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------- archivio ----------------
  function renderArchivio() {
    const all = Store.get(Store.KEYS.archivio, []);
    const box = $('#archivio-list');
    $('#arch-tools').hidden = !all.length;
    if (!all.length) {
      box.innerHTML = '<div class="empty">Qui trovi gli ordini e le richieste di garanzia che salvi o di cui crei il PDF.</div>';
      return;
    }
    const q = Listino.norm($('#arch-q').value), kind = $('#arch-kind').value;
    const list = all.filter(x => (!kind || x.kind === kind) && (!q || Listino.norm([x.cliente, x.rif, x.tipo, x.data && x.data.riferimento].join(' ')).includes(q)));
    if (!list.length) { box.innerHTML = '<div class="empty">Nessun documento corrisponde alla ricerca.</div>'; return; }
    const openIds = [state.forms.ordine._id, state.forms.garanzia._id];
    box.innerHTML = list.map(x => `
      <div class="arch${openIds.includes(x.id) ? ' is-open' : ''}" data-id="${esc(x.id)}">
        <div class="info">
          <div class="t"><span class="kind">${esc(x.tipo)}</span>${esc(x.cliente || 'Senza cliente')}</div>
          <div class="m"><span class="st ${x.status === 'bozza' ? 'draft' : 'done'}">${x.status === 'bozza' ? 'Bozza' : 'PDF creato'}</span>Rif. ${esc(x.rif)} - ${esc(new Date(x.savedAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }))}${x.total ? ' - ' + esc(PDF.eur(x.total)) : ''}${openIds.includes(x.id) ? ' - aperto nel modulo' : ''}</div>
        </div>
        <button class="btn small" data-act="arch-pdf">PDF</button>
        <button class="btn small" data-act="arch-open">Modifica</button>
        <button class="btn small" data-act="arch-dup">Duplica</button>
        <button class="btn small ghost" data-act="arch-del">Elimina</button>
      </div>`).join('');
  }
  function archAction(act, id) {
    const list = Store.get(Store.KEYS.archivio, []);
    const x = list.find(e => e.id === id);
    if (!x) return;
    const name = x.kind;
    if (act === 'arch-pdf') { createPdf(name, x); return; }
    if (act === 'arch-del') {
      if (!confirm(`Eliminare definitivamente rif. ${x.rif} (${x.cliente || 'senza cliente'})?`)) return;
      Store.set(Store.KEYS.archivio, list.filter(e => e.id !== id));
      if (state.forms[name]._id === id) newDoc(name, true);
      renderArchivio();
      toast('Documento eliminato');
      return;
    }
    if (act === 'arch-open' && state.forms[name]._id === id && state.forms[name]._dirty) { showView(name); return; }
    if (!unsavedOk(name, `Nel modulo ${name === 'ordine' ? 'Ordine' : 'Garanzia'} ci sono modifiche non salvate che andranno perse. Continuare?`)) return;
    const base = name === 'ordine' ? Store.defaultOrdine() : Store.defaultGaranzia();
    const f = Store.merge(base, JSON.parse(JSON.stringify(x.data)));
    if (act === 'arch-open') { f._id = x.id; f._autoRif = false; f._counted = true; f._status = x.status || 'pdf'; f._savedAt = x.savedAt; f._dirty = false; }
    else { f._id = null; f.rif = nextRif(); f._autoRif = true; f._counted = false; f.data = Store.today(); f._status = null; f._savedAt = null; f._dirty = true; }
    state.forms[name] = f;
    state.showErrors[name] = false;
    saveNow(name);
    fillForm(name);
    showView(name);
    toast(act === 'arch-open' ? 'Documento aperto: "Salva" o "Crea PDF" aggiornano l\'archivio' : 'Copia creata: ricordati di salvarla');
  }

  // ---------------- listino: caricamento e stato ----------------
  function renderListinoStatus() {
    const l = Listino.current();
    const box = $('#listino-status');
    $('[data-act="listino-reset"]').hidden = !l;
    if (!l) {
      box.innerHTML = '<p class="hint" style="margin-top:0">Nessun listino caricato. Puoi compilare a mano, oppure caricare il file Excel per cercare i codici e riempire descrizioni e prezzi.</p>';
    } else {
      const d = new Date(l.loadedAt);
      box.innerHTML = `<div class="lst-card"><strong>${esc(l.name)}</strong><span>${l.items.length} articoli</span><span class="hint" style="margin:0">caricato il ${esc(d.toLocaleDateString('it-IT'))}</span></div>
        ${state.workbook ? '<button class="btn small ghost" data-act="listino-map">Controlla le colonne</button>' : ''}`;
    }
    $$('[data-needs-listino]').forEach(b => { b.hidden = !l; });
  }

  async function onListinoFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      const an = Listino.analyze(wb);
      state.workbook = { name: file.name, an };
      const det = an.pick.det;
      if (det && det.map.cod >= 0 && det.map.desc >= 0 && det.map.prezzo >= 0) {
        commitListino(an.pick, det.row, det.map);
      } else {
        showMapping(an.pick.name, det ? det.row : 0, det ? det.map : { cod: -1, desc: -1, prezzo: -1, fam: -1, cat: -1 });
      }
    } catch (err) {
      console.error(err);
      toast('File non leggibile: usa un Excel (.xlsx) o un CSV', 4000);
    }
  }

  function commitListino(sheet, headerRow, map) {
    const items = Listino.build(sheet, headerRow, map);
    if (!items.length) { toast('Nessun articolo trovato con queste colonne', 4000); showMapping(sheet.name, headerRow, map); return; }
    const saved = Listino.save({ name: state.workbook.name, sheet: sheet.name }, items);
    if (!saved) { toast('Spazio del browser insufficiente per il listino', 5000); return; }
    $('#listino-map').hidden = true;
    renderListinoStatus();
    fillFamilies();
    renderRighe('ordine'); renderRighe('garanzia');
    toast(`Listino caricato: ${items.length} articoli`);
  }

  function showMapping(sheetName, headerRow, map) {
    const an = state.workbook.an;
    const sheet = an.sheets.find(s => s.name === sheetName) || an.sheets[0];
    const hdr = (sheet.txt[headerRow] || []);
    const letters = i => XLSX.utils.encode_col(i);
    const opts = sel => '<option value="-1">—</option>' + hdr.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${letters(i)}: ${esc(String(h).slice(0, 30))}</option>`).join('');
    const box = $('#listino-map');
    box.hidden = false;
    box.className = 'lst-map';
    box.innerHTML = `
      <p class="hint" style="margin-top:0">Indica quali colonne contengono codice, descrizione e prezzo.</p>
      <div class="grid g3">
        <label class="fld"><span>Foglio</span><select id="map-sheet">${an.sheets.map(s => `<option ${s.name === sheet.name ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label class="fld"><span>Riga intestazioni</span><input id="map-row" type="number" min="1" value="${headerRow + 1}"></label>
        <span></span>
        <label class="fld"><span>Codice</span><select id="map-cod">${opts(map.cod)}</select></label>
        <label class="fld"><span>Descrizione</span><select id="map-desc">${opts(map.desc)}</select></label>
        <label class="fld"><span>Prezzo</span><select id="map-prezzo">${opts(map.prezzo)}</select></label>
        <label class="fld"><span>Famiglia (facoltativa)</span><select id="map-fam">${opts(map.fam)}</select></label>
        <label class="fld"><span>Categoria (facoltativa)</span><select id="map-cat">${opts(map.cat)}</select></label>
      </div>
      <div class="righe-actions"><button class="btn primary" id="map-ok">Salva listino</button><button class="btn ghost" id="map-cancel">Annulla</button></div>`;
    $('#map-sheet').onchange = ev => {
      const s = an.sheets.find(x => x.name === ev.target.value);
      showMapping(s.name, s.det ? s.det.row : 0, s.det ? s.det.map : { cod: -1, desc: -1, prezzo: -1, fam: -1, cat: -1 });
    };
    $('#map-row').onchange = ev => showMapping(sheet.name, Math.max(0, (+ev.target.value || 1) - 1), readMap());
    const readMap = () => ({ cod: +$('#map-cod').value, desc: +$('#map-desc').value, prezzo: +$('#map-prezzo').value, fam: +$('#map-fam').value, cat: +$('#map-cat').value });
    $('#map-ok').onclick = () => {
      const m = readMap();
      if (m.cod < 0 || m.desc < 0) { toast('Scegli almeno le colonne codice e descrizione'); return; }
      commitListino(sheet, Math.max(0, (+$('#map-row').value || 1) - 1), m);
    };
    $('#map-cancel').onclick = () => { box.hidden = true; };
  }

  // ---------------- ricerca a listino ----------------
  let pickTarget = null; // { name, index | null }
  function fillFamilies() {
    const sel = $('#lst-fam');
    const fams = Listino.families();
    sel.innerHTML = '<option value="">Tutte le famiglie</option>' + fams.map(f => `<option>${esc(f)}</option>`).join('');
    sel.hidden = !fams.length;
  }
  function openPicker(name, index, q) {
    pickTarget = { name, index };
    $('#lst-q').value = q || '';
    renderResults();
    $('#dlg-listino').showModal();
    setTimeout(() => $('#lst-q').focus(), 50);
  }
  function hl(text, toks) {
    let h = esc(text);
    toks.forEach(t => {
      if (t.length < 2) return;
      const rx = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      h = h.replace(rx, '<mark>$1</mark>');
    });
    return h;
  }
  function renderResults() {
    const q = $('#lst-q').value, fam = $('#lst-fam').value;
    const res = Listino.search(q, fam, 80);
    const toks = q.trim().split(/\s+/).filter(Boolean).map(esc);
    const box = $('#lst-results');
    if (!res.length) { box.innerHTML = '<p class="hint">Nessun articolo trovato. Prova con parte del codice o una parola della descrizione.</p>'; return; }
    box.innerHTML = res.map(it => `
      <button type="button" class="lst-item" data-idx="${it.i}">
        <span class="c">${hl(it.c, toks)}</span><span class="d">${hl(it.d, toks)}</span><span class="p">${it.p != null ? esc(PDF.eur(it.p)) : ''}</span>
        ${it.f || it.k ? `<span class="g">${esc([it.f, it.k].filter(Boolean).join(' / '))}</span>` : ''}
      </button>`).join('');
  }
  function pick(idx) {
    const it = Listino.byIndex(idx);
    if (!it || !pickTarget) return;
    const { name, index } = pickTarget;
    $('#dlg-listino').close();
    if (index != null) {
      const r = state.forms[name].righe[index];
      fillRigaFromItem(name, r, it);
      touch(name); renderRighe(name); refreshReady();
    } else addRiga(name, it);
    toast('Aggiunto ' + it.c);
  }

  // ---------------- impostazioni: logo e configurazione ----------------
  function renderLogo() {
    const b = $('#logo-prev');
    b.innerHTML = state.settings.logo ? `<img src="${state.settings.logo}" alt="Logo">` : 'Nessun logo';
  }
  function onLogoFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const max = 700, r = Math.min(1, max / img.width, 260 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      state.settings.logo = c.toDataURL('image/jpeg', 0.9);
      saveNow('settings'); renderLogo();
      URL.revokeObjectURL(img.src);
      toast('Logo salvato');
    };
    img.onerror = () => toast('Immagine non valida');
    img.src = URL.createObjectURL(file);
  }
  function exportConfig() {
    const s = state.settings;
    const cfg = { app: 'ordine-italia', v: 1, settings: { azienda: s.azienda, logo: s.logo, emailOrdini: s.emailOrdini, emailGaranzie: s.emailGaranzie, emailCC: s.emailCC, footerGaranzia: s.footerGaranzia } };
    const blob = new Blob([JSON.stringify(cfg, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'ordine-italia-config.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function importConfig(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const cfg = JSON.parse(await file.text());
      if (cfg.app !== 'ordine-italia' || !cfg.settings) throw new Error('formato');
      const allowed = ['azienda', 'logo', 'emailOrdini', 'emailGaranzie', 'emailCC', 'footerGaranzia', 'agente', 'sigla', 'agenteTel', 'agenteEmail'];
      const personal = ['agente', 'sigla', 'agenteTel', 'agenteEmail'];
      for (const k of allowed) {
        if (cfg.settings[k] === undefined) continue;
        if (personal.includes(k) && state.settings[k]) continue;
        state.settings[k] = cfg.settings[k];
      }
      saveNow('settings'); fillForm('settings'); renderLogo();
      toast('Configurazione importata');
    } catch (err) { toast('File di configurazione non valido', 3500); }
  }

  // ---------------- avviso scadenza settimanale ----------------
  function cutoffNotice() {
    const n = new Date(), d = n.getDay(), h = n.getHours() + n.getMinutes() / 60;
    const el = $('#cutoff-notice');
    let msg = '';
    if (d === 5 && h < 12) msg = 'Oggi è venerdì: gli ordini ricevuti entro le 12:00 rientrano nella situazione settimanale di questa settimana.';
    else if ((d === 5 && h >= 12) || d === 6 || d === 0) msg = 'Passate le 12:00 di venerdì: gli ordini inviati ora rientrano nella situazione settimanale successiva.';
    el.hidden = !msg; el.textContent = msg;
  }

  // ---------------- installazione PWA ----------------
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); installEvt = e;
    let b = $('#btn-install');
    if (!b) {
      b = document.createElement('button');
      b.id = 'btn-install'; b.className = 'btn primary'; b.textContent = 'Installa l\'app su questo dispositivo';
      b.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; b.remove(); };
      $('#app-version').before(b);
    }
  });

  // ---------------- eventi ----------------
  function bind() {
    $$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
    document.addEventListener('input', e => { if (e.target.dataset.r) onRigaInput(e); else onFieldInput(e); });
    document.addEventListener('change', e => {
      if (e.target.dataset.r) onRigaInput(e);
      else if (e.target.type === 'radio' || e.target.type === 'checkbox' || e.target.tagName === 'SELECT') onFieldInput(e);
    });

    document.addEventListener('click', e => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      const view = a.closest('[data-form]');
      const name = view ? view.dataset.form : state.view;
      const rowEl = a.closest('.riga');
      switch (act) {
        case 'nuovo': newDoc(name); break;
        case 'salva': saveDraft(name); break;
        case 'elimina': deleteCurrent(name); break;
        case 'pdf-nuovo': $('#dlg-pdf').close(); newDoc(state.lastPdf ? state.lastPdf.name : state.view); break;
        case 'add-riga': addRiga(name); break;
        case 'cerca-listino': openPicker(name, null); break;
        case 'cerca-riga': { const i = +rowEl.dataset.i; openPicker(name, i, state.forms[name].righe[i].cod); break; }
        case 'del-riga': {
          const f = state.forms[name];
          f.righe.splice(+rowEl.dataset.i, 1);
          if (!f.righe.length) f.righe.push(name === 'ordine' ? Store.emptyRigaOrdine() : Store.emptyRigaGaranzia());
          touch(name); renderRighe(name); refreshReady(); break;
        }
        case 'use-desc': case 'use-price': {
          const r = state.forms[name].righe[+rowEl.dataset.i];
          const it = Listino.lookup(r.cod);
          if (it) { if (act === 'use-desc') r.desc = it.d; else r.prezzo = String(it.p).replace('.', ','); }
          touch(name); renderRighe(name); refreshReady(); break;
        }
        case 'listino-reset':
          if (confirm('Rimuovere il listino da questo dispositivo?')) { Listino.reset(); state.workbook = null; renderListinoStatus(); renderRighe('ordine'); renderRighe('garanzia'); toast('Listino rimosso'); }
          break;
        case 'listino-map': {
          const l = Listino.current(); const an = state.workbook.an;
          const sh = an.sheets.find(s => s.name === l.sheet) || an.pick;
          showMapping(sh.name, sh.det ? sh.det.row : 0, sh.det ? sh.det.map : { cod: -1, desc: -1, prezzo: -1, fam: -1, cat: -1 });
          break;
        }
        case 'logo-reset': state.settings.logo = ''; saveNow('settings'); renderLogo(); break;
        case 'config-export': exportConfig(); break;
        case 'arch-pdf': case 'arch-open': case 'arch-dup': case 'arch-del': archAction(act, a.closest('.arch').dataset.id); break;
      }
    });

    $('#btn-pdf').addEventListener('click', onPdfClick);
    $('#ready').addEventListener('click', () => { state.showErrors[state.view] = true; refreshReady(); openIssues(state.view, false); });
    $('#btn-pdf-anyway').addEventListener('click', () => { $('#dlg-missing').close(); createPdf(state.view); });
    $('#pdf-share').addEventListener('click', sharePdf);
    $('#pdf-download').addEventListener('click', downloadPdf);
    $('#pdf-open').addEventListener('click', openPdf);
    $('#pdf-mail').addEventListener('click', mailPdf);
    $$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
    $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

    $('#listino-file').addEventListener('change', onListinoFile);
    $('#logo-file').addEventListener('change', onLogoFile);
    $('#config-file').addEventListener('change', importConfig);
    let qT;
    $('#lst-q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(renderResults, 120); });
    $('#lst-q').addEventListener('keydown', e => { if (e.key === 'Enter') { const f = $('#lst-results .lst-item'); if (f) pick(+f.dataset.idx); } });
    $('#lst-fam').addEventListener('change', renderResults);
    $('#lst-results').addEventListener('click', e => { const b = e.target.closest('.lst-item'); if (b) pick(+b.dataset.idx); });

    $('#arch-q').addEventListener('input', renderArchivio);
    $('#arch-kind').addEventListener('change', renderArchivio);
    window.addEventListener('beforeunload', e => {
      if (['ordine', 'garanzia'].some(k => state.forms[k]._dirty && hasContent(k))) { e.preventDefault(); e.returnValue = ''; }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { clearTimeout(saveTimer); saveNow('ordine'); saveNow('garanzia'); saveNow('settings'); }
    });
  }

  // ---------------- avvio ----------------
  function init() {
    for (const k of ['ordine', 'garanzia']) {
      const f = state.forms[k];
      if (!f.rif) { f.rif = nextRif(); f._autoRif = true; f._counted = false; }
      if (k === 'garanzia' && !f.preparatoDa && state.settings.agente) f.preparatoDa = state.settings.agente;
    }
    bind();
    fillForm('settings'); renderLogo();
    fillForm('garanzia'); fillForm('ordine');
    fillFamilies();
    renderListinoStatus();
    cutoffNotice();
    $('#app-version').textContent = 'Versione ' + APP_VERSION + ' - i dati restano su questo dispositivo.';
    const first = !state.settings.agente && !Listino.current() && !hasContent('ordine');
    showView(first ? 'impostazioni' : 'ordine');
    if (first) toast('Inserisci i tuoi dati e, se vuoi, carica il listino', 4000);

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloaded) return;
        reloaded = true;
        saveNow('ordine'); saveNow('garanzia');
        toast('App aggiornata');
        setTimeout(() => location.reload(), 600);
      });
    }
  }
  init();
})();
