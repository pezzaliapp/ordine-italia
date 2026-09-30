/* Persistenza locale: tutto resta nel browser dell'agente. */
(function () {
  const P = 'oi.';
  const KEYS = {
    settings: P + 'settings',
    ordine: P + 'draft.ordine',
    garanzia: P + 'draft.garanzia',
    listino: P + 'listino',
    archivio: P + 'archivio',
    counter: P + 'counter'
  };

  function get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.warn('storage', e); return false; }
  }
  function del(key) { try { localStorage.removeItem(key); } catch (e) {} }

  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  function defaultSettings() {
    return {
      agente: '', sigla: '', agenteTel: '', agenteEmail: '',
      emailOrdini: '', emailGaranzie: '', emailCC: '',
      azienda: '', logo: '', footerGaranzia: ''
    };
  }
  function emptyRigaOrdine() { return { cod: '', desc: '', qta: '1', prezzo: '', sconto: '', data: '' }; }
  function emptyRigaGaranzia() { return { cod: '', desc: '', qta: '1', data: '' }; }

  function defaultOrdine() {
    return {
      tipo: 'Vendita', merce: '', data: today(), rif: '',
      cliente: '', piva: '', riferimento: '',
      destTipo: 'sede', capSede: '',
      dest: { indirizzo: '', cap: '', citta: '', prov: '', telefono: '', referente: '' },
      pagTipo: '', pagScad: '', pagAltro: '',
      porto: '', cura: '', portoImporto: '',
      pesante: false, scaricoPesante: '', servSponda: false, servPreavviso: false, servAppuntamento: false, servAltro: '',
      righe: [emptyRigaOrdine()],
      note: ''
    };
  }
  function defaultGaranzia() {
    return {
      data: today(), sig: '', rif: '',
      cliente: '', piva: '', indirizzo: '',
      cura: '', porto: '', destinazione: '',
      righe: [emptyRigaGaranzia()],
      modello: '', matricola: '', difetto: '', approvazione: '', preparatoDa: '',
      note: ''
    };
  }

  // unisce i dati salvati con i default, così i campi nuovi non mancano mai
  function merge(def, saved) {
    if (!saved || typeof saved !== 'object') return def;
    const out = Array.isArray(def) ? [] : {};
    for (const k of Object.keys(def)) {
      const dv = def[k], sv = saved[k];
      if (sv === undefined) out[k] = dv;
      else if (dv && typeof dv === 'object' && !Array.isArray(dv)) out[k] = merge(dv, sv);
      else out[k] = sv;
    }
    return out;
  }

  window.Store = {
    KEYS, get, set, del, today, merge,
    defaultSettings, defaultOrdine, defaultGaranzia, emptyRigaOrdine, emptyRigaGaranzia
  };
})();
