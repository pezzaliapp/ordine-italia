/* Generazione PDF: ricalca l'impaginazione dei moduli cartacei. */
(function () {
  const M = 12, PW = 210, PH = 297, W = PW - 2 * M;
  const LH = 4.3;          // interlinea valori (mm)
  const LABEL_H = 4.2;

  const clean = s => String(s == null ? '' : s).replace(/[\u00a0\u202f]/g, ' ');
  const eur = n => (n == null || !isFinite(n)) ? '' :
    clean(new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n));
  const num = n => clean(new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(n));
  const dmy = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return d && m && y ? `${d}/${m}/${y}` : iso; };

  function make() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setLineWidth(0.3);
    doc.setDrawColor(0);
    doc.setTextColor(0);
    return doc;
  }

  function ensure(ctx, h) {
    if (ctx.y + h > PH - 16) { ctx.doc.addPage(); ctx.y = M; }
  }

  // --- intestazione (logo | titolo, data, riferimento) ---
  function header(ctx, s, titleLines, sub, leftMeta, rightMeta) {
    const { doc } = ctx;
    const h = 28, lw = 64, y = ctx.y;
    doc.rect(M, y, W, h);
    doc.line(M + lw, y, M + lw, y + h);
    if (s.logo) {
      try {
        const p = doc.getImageProperties(s.logo);
        const maxW = lw - 8, maxH = h - 8;
        const r = Math.min(maxW / p.width, maxH / p.height);
        const iw = p.width * r, ih = p.height * r;
        doc.addImage(s.logo, M + (lw - iw) / 2, y + (h - ih) / 2, iw, ih);
      } catch (e) { s = { ...s, logo: '' }; }
    }
    if (!s.logo && s.azienda) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      const lines = doc.splitTextToSize(clean(s.azienda), lw - 8);
      doc.text(lines, M + lw / 2, y + h / 2 - (lines.length - 1) * 2.6 + 1.5, { align: 'center' });
    }
    const cx = M + lw + (W - lw) / 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text(titleLines, cx, y + 8, { align: 'center' });
    if (sub) {
      doc.setFontSize(10);
      doc.text(clean(sub), cx, y + 8 + titleLines.length * 5.4, { align: 'center' });
    }
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold'); doc.text(leftMeta[0], M + lw + 3, y + h - 3.5);
    doc.setFont('helvetica', 'normal'); doc.text(clean(leftMeta[1]), M + lw + 3 + doc.getTextWidth(leftMeta[0]) + 2, y + h - 3.5);
    const rx = M + lw + (W - lw) / 2 + 4;
    doc.setFont('helvetica', 'bold'); doc.text(rightMeta[0], rx, y + h - 3.5);
    doc.setFont('helvetica', 'normal'); doc.text(clean(rightMeta[1]), rx + doc.getTextWidth(rightMeta[0]) + 2, y + h - 3.5);
    ctx.y += h + 5;
  }

  // --- riga di riquadri etichettati ---
  // cell: { label, value (string | string[]), w, checks: {options, selected, extra}, minH }
  function row(ctx, cells) {
    const { doc } = ctx;
    const totalW = cells.reduce((a, c) => a + (c.w || 0), 0);
    const free = cells.filter(c => !c.w).length;
    cells.forEach(c => { if (!c.w) c.w = (W - totalW) / free; });
    doc.setFontSize(10);
    const heights = cells.map(c => {
      if (c.checks) return LABEL_H + 4 + c.checks.options.length * 5 + 1.5;
      doc.setFont('helvetica', c.bold ? 'bold' : 'normal');
      const v = Array.isArray(c.value) ? c.value.map(clean).join('\n') : clean(c.value);
      c._lines = v ? doc.splitTextToSize(v, c.w - 4) : [];
      return LABEL_H + 2.5 + Math.max(1, c._lines.length) * LH + 1.5;
    });
    const h = Math.max(...heights, ...cells.map(c => c.minH || 0), 11);
    ensure(ctx, h);
    let x = M;
    cells.forEach(c => {
      doc.rect(x, ctx.y, c.w, h);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.text(c.label, x + 2, ctx.y + LABEL_H);
      if (c.checks) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        c.checks.options.forEach((o, i) => {
          const yy = ctx.y + LABEL_H + 5 + i * 5;
          doc.rect(x + 3, yy - 2.6, 3, 3);
          if (o === c.checks.selected) {
            doc.setLineWidth(0.5);
            doc.line(x + 3.4, yy - 2.2, x + 5.6, yy); doc.line(x + 5.6, yy - 2.2, x + 3.4, yy);
            doc.setLineWidth(0.3);
            doc.setFont('helvetica', 'bold');
          }
          doc.text(o, x + 8, yy);
          doc.setFont('helvetica', 'normal');
          if (c.checks.extra && c.checks.extra.on === o) doc.text(clean(c.checks.extra.text), x + c.w - 3, yy, { align: 'right' });
        });
      } else {
        doc.setFont('helvetica', c.bold ? 'bold' : 'normal'); doc.setFontSize(10);
        if (c._lines.length) doc.text(c._lines, x + 2, ctx.y + LABEL_H + 4.8);
      }
      x += c.w;
    });
    ctx.y += h;
  }

  function gap(ctx, g = 4) { ctx.y += g; }

  function footer(doc, text) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90);
      if (text) doc.text(clean(text), M, PH - 7);
      doc.text(`Pag. ${i}/${n}`, PW - M, PH - 7, { align: 'right' });
      doc.setTextColor(0);
    }
  }

  function signature(ctx, left, right) {
    const { doc } = ctx;
    ensure(ctx, 22);
    ctx.y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    if (left) {
      doc.setFont('helvetica', 'bold'); doc.text(left[0], M, ctx.y);
      doc.setFont('helvetica', 'normal');
      doc.text(doc.splitTextToSize(clean(left[1]), 95), M, ctx.y + 4.5);
    }
    doc.setFont('helvetica', 'bold'); doc.text(right, PW - M - 70, ctx.y);
    doc.line(PW - M - 70, ctx.y + 12, PW - M, ctx.y + 12);
    ctx.y += 16;
  }

  function agentLine(s) {
    return [s.agente, s.agenteTel, s.agenteEmail].filter(Boolean).join('  -  ');
  }

  function rigaImporto(r) {
    const q = Listino.parsePrice(r.qta), p = Listino.parsePrice(r.prezzo), sc = Listino.parsePrice(r.sconto) || 0;
    if (q == null || p == null) return null;
    return q * p * (1 - sc / 100);
  }

  // ======================== ORDINE ========================
  function ordine(o, s) {
    const doc = make();
    const ctx = { doc, y: M };
    const sub = [o.tipo ? o.tipo.toUpperCase() : '', o.merce].filter(Boolean).join('  -  ');
    header(ctx, s, ['OFFERTA / ORDINI CLIENTI'], sub, ['Data', dmy(o.data)], ['Ns.rif.', o.rif]);

    row(ctx, [
      { label: 'Cliente', value: o.cliente, bold: true },
      { label: 'P.IVA / cod. cliente', value: o.piva, w: 58 }
    ]);
    row(ctx, [{ label: 'Riferimento Cliente', value: o.riferimento }]);

    let dest;
    if (o.destTipo === 'diversa') {
      const d = o.dest;
      dest = [
        d.indirizzo,
        [d.cap, d.citta, d.prov ? '(' + d.prov.toUpperCase() + ')' : ''].filter(Boolean).join(' '),
        [d.telefono ? 'Tel. ' + d.telefono : '', d.referente ? 'Rif. ' + d.referente : ''].filter(Boolean).join('   ')
      ].filter(Boolean);
    } else {
      dest = ['Sede registrata in anagrafica' + (o.capSede ? '  -  CAP ' + o.capSede : '')];
    }
    row(ctx, [{ label: 'Luogo destinazione se diverso', value: dest, minH: 16 }]);

    let pag = '';
    if (o.pagTipo === 'SOLITO') pag = 'SOLITO (modalità da anagrafica)';
    else pag = [o.pagTipo === 'ALTRO' ? o.pagAltro : o.pagTipo, o.pagScad].filter(Boolean).join('  ');
    row(ctx, [{ label: 'Pagamento', value: pag }]);

    const imp = Listino.parsePrice(o.portoImporto);
    row(ctx, [
      { label: 'Trasporto a cura del', checks: { options: ['Mittente', 'Destinatario', 'Vettore'], selected: o.cura } },
      { label: 'Porto', w: W / 2, checks: {
        options: ['Franco', 'Assegnato', 'Franco c/addebito'], selected: o.porto,
        extra: { on: 'Franco c/addebito', text: o.porto === 'Franco c/addebito' ? (imp != null ? eur(imp) : 'EUR da quotare') : 'EUR' }
      } }
    ]);

    const serv = [];
    if (o.porto === 'Franco' || o.porto === 'Franco c/addebito') {
      if (o.pesante) serv.push('Attrezzatura oltre 1x2 m / 1000 kg: NO sponda' + (o.scaricoPesante ? ' - ' + o.scaricoPesante : ''));
      else if (o.servSponda) serv.push('Scarico con sponda');
      if (o.servPreavviso) serv.push('Preavviso telefonico');
      if (o.servAppuntamento) serv.push('Consegna su appuntamento');
      if (o.servAltro) serv.push(o.servAltro);
    }
    if (serv.length) row(ctx, [{ label: 'Servizi aggiuntivi', value: serv.join('  |  ') }]);

    gap(ctx, 4);
    const righe = o.righe.filter(r => r.cod || r.desc);
    let tot = 0, hasPrice = false;
    const body = righe.map(r => {
      const im = rigaImporto(r);
      if (im != null) { tot += im; hasPrice = true; }
      const p = Listino.parsePrice(r.prezzo), sc = Listino.parsePrice(r.sconto);
      return [clean(r.cod), clean(r.desc), clean(r.qta), p != null ? eur(p) : '', sc ? num(sc) : '', im != null ? eur(im) : '', r.data ? dmy(r.data) : 'prima disp.'];
    });
    while (body.length < 3) body.push(['', '', '', '', '', '', '']);
    doc.autoTable({
      startY: ctx.y, margin: { left: M, right: M, bottom: 16 },
      head: [['Codice', 'Descrizione', 'Q.tà', 'Prezzo Unitario', 'Sconto %', 'Importo', 'Data Spedizione']],
      body,
      foot: hasPrice ? [[{ content: 'Totale imponibile (IVA esclusa)', colSpan: 5, styles: { halign: 'right' } }, { content: eur(tot), styles: { halign: 'right' } }, '']] : undefined,
      showFoot: 'lastPage',
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, textColor: 0, lineColor: 0, lineWidth: 0.25, cellPadding: 1.6, minCellHeight: 7, valign: 'middle' },
      headStyles: { fillColor: [238, 238, 238], textColor: 0, fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 25 }, 2: { cellWidth: 12, halign: 'center' }, 3: { cellWidth: 23, halign: 'right' },
        4: { cellWidth: 15, halign: 'center' }, 5: { cellWidth: 25, halign: 'right' }, 6: { cellWidth: 21, halign: 'center' }
      }
    });
    ctx.y = doc.lastAutoTable.finalY + 5;

    row(ctx, [{ label: 'NOTE', value: o.note, minH: 22 }]);
    signature(ctx, s.agente ? ['Agente', agentLine(s)] : null, 'FIRMA PER ACCETTAZIONE');
    footer(doc, '');
    return doc;
  }

  // ======================== GARANZIA ========================
  function garanzia(g, s) {
    const doc = make();
    const ctx = { doc, y: M };
    header(ctx, s, ['SOSTITUZIONE IN GARANZIA', 'SENZA RESO DEL DIFETTOSO'], '', ['Data', dmy(g.data)], ['Sig.', g.sig]);
    if (g.rif) {
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
      doc.text('Ns.rif. ' + clean(g.rif), PW - M, ctx.y - 1.5, { align: 'right' });
      ctx.y += 2;
    }
    row(ctx, [{ label: 'Cliente', value: g.cliente, bold: true }, { label: 'P.Iva', value: g.piva, w: 58 }]);
    row(ctx, [{ label: 'Indirizzo', value: g.indirizzo }]);
    row(ctx, [{ label: 'Spedizione con', value: g.cura }, { label: 'Porto', value: g.porto, w: W / 2 }]);
    row(ctx, [{ label: 'Luogo di destinazione se diverso', value: g.destinazione }]);
    gap(ctx, 4);

    const body = g.righe.filter(r => r.cod || r.desc).map(r => [clean(r.cod), clean(r.desc), clean(r.qta), r.data ? dmy(r.data) : '']);
    while (body.length < 3) body.push(['', '', '', '']);
    doc.autoTable({
      startY: ctx.y, margin: { left: M, right: M, bottom: 16 },
      head: [['Codice articolo', 'Descrizione', 'Q.tà', 'Data Consegna']],
      body, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9.5, textColor: 0, lineColor: 0, lineWidth: 0.25, cellPadding: 1.8, minCellHeight: 8, valign: 'middle' },
      headStyles: { fillColor: [238, 238, 238], textColor: 0, fontStyle: 'bold', halign: 'center' },
      columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 16, halign: 'center' }, 3: { cellWidth: 30, halign: 'center' } }
    });
    ctx.y = doc.lastAutoTable.finalY + 5;

    row(ctx, [{ label: 'Modello macchina', value: g.modello, bold: true }, { label: 'Matricola', value: g.matricola, bold: true, w: W / 2 }]);
    row(ctx, [{ label: 'Difetto riscontrato', value: g.difetto, minH: 24 }]);
    if (g.note) row(ctx, [{ label: 'Note', value: g.note }]);
    row(ctx, [{ label: 'Approvazione', value: g.approvazione, minH: 14 }, { label: 'Preparato da', value: g.preparatoDa, w: W / 2, minH: 14 }]);
    if (s.agente) {
      ctx.y += 5;
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
      doc.text('Agente: ' + clean(agentLine(s)), M, ctx.y);
    }
    footer(doc, s.footerGaranzia || '');
    return doc;
  }

  window.PDF = { ordine, garanzia, eur, dmy, rigaImporto };
})();
