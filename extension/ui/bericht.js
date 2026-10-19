// Nachweis-Bericht fuer Gesetze und Normen (Design-Review Bericht 16.10.2026,
// docs/sicherheit/design-review-bericht.md): nur Summen vom Service Worker,
// Vorlagen aus common/bericht.js. Export als Druck/PDF (Browser-Druckdialog)
// oder als eigenstaendige HTML-Datei per Blob-Link (kein downloads-Recht, kein
// Netz); Dateiname und Inhalt ohne Personen- oder Geraetebezug, neue Zufalls-Id
// je Export (Auflagen 1, 2, 9).
(async function () {
  'use strict';
  const DLX = globalThis.DLX;
  const { h } = DLX.dom;
  const B = DLX.bericht;
  const st = await chrome.runtime.sendMessage({ t: 'bericht' });
  const b = st.branding;
  const lang = await DLX.i18n.ready(st.language, navigator.language);
  const product = DLX.dom.productName(b);
  const T = (k, v) => B.t(lang, k, Object.assign({ product }, v || {}));
  document.documentElement.lang = lang;
  DLX.dom.applyBranding(b, false);
  document.title = product + ' – ' + T('title');

  const main = h('main', { class: 'dlx-wissen' }, h('h1', null, T('title')), h('p', { class: 'dlx-intro' }, T('intro')));
  document.body.append(h('header', { class: 'dlx-opt-kopf' }, h('div', null, DLX.dom.brand(b, b.companyName || ''))), main);
  if (!st.on) {
    main.append(h('p', { class: 'dlx-hinweis', id: 'dlx-ber-aus' }, T('off')));
    return;
  }

  const catName = (c) => DLX.i18n.t(lang, (c === 'file' || c === 'site' || c === 'inactive' || c === 'voice' ? 'dec_' : 'cat_') + c);
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const created = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());

  const days = h('select', { id: 'dlx-ber-tage', disabled: st.lockedDays }, B.DAYS.map((d) => h('option', { value: String(d), selected: d === st.days }, T('days', { n: d }))));
  const fwBoxes = B.FRAMEWORKS.map((f) => {
    const box = h('input', { type: 'checkbox', 'data-fw': f, checked: st.frameworks.indexOf(f) !== -1, disabled: st.lockedFrameworks });
    return { f, box, label: h('label', { class: 'dlx-chip dlx-ber-fw' }, box, B.t(lang, 'fw_' + f)) };
  });
  const out = h('div', { id: 'dlx-ber-inhalt' });
  const kopf = h('dl', { class: 'dlx-rec-kopf' });

  function current() {
    const d = Number(days.value);
    const sum = st.sums[d] || st.sums[B.DEFAULT_DAYS];
    const fws = fwBoxes.filter((x) => x.box.checked).map((x) => x.f);
    return { sum, fws };
  }
  function render() {
    const { sum, fws } = current();
    const d = B.data(sum, fws, st.policies, created, '0'.repeat(32));
    kopf.replaceChildren(
      ...(b.companyName ? [h('dt', null, T('org')), h('dd', null, b.companyName)] : []),
      h('dt', null, T('period')), h('dd', null, sum.from + ' – ' + sum.to),
      h('dt', null, T('created')), h('dd', null, created));
    out.replaceChildren(...B.model(d, lang, { catName }).map(block));
  }
  // Zahlenspalten rechtsbuendig, Textspalten (Anforderung, Massnahme, Beleg) links. Eine Zeile nur aus
  // Zahlen (Treffer nach Aktion) als Kennzahl-Kacheln; die letzte Spalte ist dort die Summe.
  const NUM = /^[\d\s.,'’  ]+$/;
  function block(x) {
    if (x.k !== 'table') return h(x.k, null, x.text);
    const num = x.head.map((_, i) => x.rows.length > 0 && x.rows.every((r) => NUM.test(String(r[i]))));
    if (x.rows.length === 1 && num.every(Boolean)) {
      return h('dl', { class: 'dlx-kennzahlen dlx-rec' }, x.head.map((c, i) => h('div', { class: 'dlx-kennzahl' + (i === x.head.length - 1 ? ' dlx-summe' : '') },
        h('dt', null, c), h('dd', null, x.rows[0][i]))));
    }
    const cls = (i) => (num[i] ? 'dlx-zahl' : null);
    return h('table', { class: 'dlx-tabelle dlx-rec' + (num.some(Boolean) ? '' : ' dlx-rec-text') }, h('tr', null, x.head.map((c, i) => h('th', { class: cls(i) }, c))),
      x.rows.map((r) => h('tr', null, r.map((c, i) => h('td', { class: cls(i) }, c)))));
  }
  days.addEventListener('change', render);
  for (const x of fwBoxes) x.box.addEventListener('change', render);

  const print = h('button', { type: 'button', class: 'dlx-knopf dlx-gross dlx-haupt', id: 'dlx-ber-drucken' }, T('print'));
  print.addEventListener('click', () => window.print());
  const dl = h('button', { type: 'button', class: 'dlx-knopf dlx-gross', id: 'dlx-ber-html' }, T('download'));
  dl.addEventListener('click', () => {
    const { sum, fws } = current();
    const d = B.data(sum, fws, st.policies, created, B.exportId((a) => crypto.getRandomValues(a)));
    const html = B.exportHtml(d, lang, { catName, product, company: b.companyName || '', logo: b.logo });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = B.fileName(product, lang, created);
    a.click();
    URL.revokeObjectURL(url);
  });

  main.append(kopf,
    h('section', { class: 'dlx-abschnitt dlx-rec-wahl dlx-nicht-drucken' },
      h('div', { class: 'dlx-feld' }, h('label', null, T('period'), days), st.lockedDays ? h('span', { class: 'dlx-muted' }, T('locked')) : null),
      h('fieldset', null, h('legend', null, T('framework')), fwBoxes.map((x) => x.label),
        st.lockedFrameworks ? h('p', { class: 'dlx-muted' }, T('locked')) : null)),
    out, h('p', { class: 'dlx-muted dlx-rec-hinweis', id: 'dlx-ber-hinweis' }, T('note')),
    h('div', { class: 'dlx-aktionen dlx-nicht-drucken' }, print, dl));
  render();
})();
