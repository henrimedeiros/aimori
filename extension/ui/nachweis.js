// KI-Kompetenz-Nachweis als druckbare Seite (Drucken/PDF ueber den Browser-
// Druckdialog, kein eigener PDF-Code). Daten nur Monatszahlen je Gruppe vom
// Service Worker; Firmenname/Logo aus dem Branding. Das Namensfeld lebt nur im
// DOM: kein Speichern, keine Nachricht, nicht in URL/Hash (Design-Review 14.10.2026
// Auflagen 8-11).
(async function () {
  'use strict';
  const DLX = globalThis.DLX;
  const { h } = DLX.dom;
  const K = DLX.kompetenz;
  const st = await chrome.runtime.sendMessage({ t: 'kompetenz' });
  const b = st.branding;
  const lang = await DLX.i18n.ready(st.language, navigator.language);
  const T = (k, v) => DLX.i18n.t(lang, k, Object.assign({ product: b.productName, company: b.companyName }, v || {}));
  document.documentElement.lang = lang;
  DLX.dom.applyBranding(b, false);
  document.title = b.productName + ' – ' + T('recTitle');
  const nf = new Intl.NumberFormat(lang);
  const monthName = (m) => new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1));

  const main = h('main', { class: 'dlx-wissen' }, h('h1', null, T('recTitle')), h('p', { class: 'dlx-intro' }, T('recIntro')));
  document.body.append(h('header', { class: 'dlx-opt-kopf' }, h('div', null, DLX.dom.brand(b, b.companyName || ''))), main);
  if (!st.on) {
    main.append(h('p', { class: 'dlx-hinweis', id: 'dlx-rec-aus' }, st.locked ? T('recOffOrg') : T('recOff')));
    return;
  }

  const store = K.clean(st.store);
  const months = st.months.filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m));
  const name = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', class: 'dlx-rec-name', 'aria-label': T('recName') });
  const hide = h('input', { type: 'checkbox', id: 'dlx-rec-hide' });
  // Richtlinie competenceHideSensitive: sensible Gruppen immer aus (Design-Review Kontext, Auflage 5).
  if (st.hideSensitive) { hide.checked = true; hide.disabled = true; }
  const table = h('div', { id: 'dlx-rec-tabelle' });
  const dl = h('dl', { class: 'dlx-rec-kopf' },
    b.companyName ? [h('dt', null, T('recOrg')), h('dd', null, b.companyName)] : null,
    h('dt', null, T('recName')), h('dd', null, name),
    h('dt', null, T('recPeriod')), h('dd', null, months.length ? monthName(months[months.length - 1]) + ' – ' + monthName(months[0]) : ''));
  const created = h('p', { class: 'dlx-muted' }, T('recCreated', { date: new Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(new Date()) }));

  const FIELDS = [['seen', 'recSeen'], ['redacted', 'recRedacted'], ['cancelled', 'recCancelled'], ['sent', 'recSent']];
  function render() {
    const groups = K.GROUPS.filter((g) => !(hide.checked && K.SENSITIVE.includes(g)));
    const sum = (g) => {
      const out = { seen: 0, redacted: 0, cancelled: 0, sent: 0 };
      for (const m of months) { const t = K.totals(store, m, [g]); for (const k of K.FIELDS) out[k] += t[k]; }
      return out;
    };
    const rows = groups.map((g) => ({ g, t: sum(g) })).filter((r) => r.t.seen || r.t.redacted || r.t.cancelled || r.t.sent);
    if (!rows.length) { table.replaceChildren(h('p', { id: 'dlx-rec-leer' }, T('recEmpty'))); return; }
    const total = { seen: 0, redacted: 0, cancelled: 0, sent: 0 };
    for (const r of rows) for (const k of K.FIELDS) total[k] += r.t[k];
    const head = h('tr', null, h('th', null, T('recGroup')), FIELDS.map(([, key]) => h('th', { class: 'dlx-zahl' }, T(key))));
    const line = (label, t, cls) => h('tr', { class: cls || null, 'data-gruppe': cls ? null : label.g }, h('td', null, cls ? label : T('cat_' + label.g)),
      FIELDS.map(([k]) => h('td', { class: 'dlx-zahl' }, nf.format(t[k]))));
    const perMonth = months.map((m) => ({ m, t: K.totals(store, m, groups) })).filter((r) => r.t.seen || r.t.redacted || r.t.cancelled || r.t.sent);
    table.replaceChildren(
      h('table', { class: 'dlx-tabelle dlx-rec' }, head, rows.map((r) => line(r, r.t)), line(T('recTotal'), total, 'dlx-summe')),
      h('table', { class: 'dlx-tabelle dlx-rec' }, h('tr', null, h('th', null, T('recPeriod')), FIELDS.map(([, key]) => h('th', { class: 'dlx-zahl' }, T(key)))),
        perMonth.map((r) => h('tr', null, h('td', null, monthName(r.m)), FIELDS.map(([k]) => h('td', { class: 'dlx-zahl' }, nf.format(r.t[k])))))));
  }
  hide.addEventListener('change', render);
  const print = h('button', { type: 'button', class: 'dlx-knopf dlx-gross dlx-haupt dlx-nicht-drucken', id: 'dlx-rec-drucken' }, T('recPrint'));
  print.addEventListener('click', () => window.print());
  main.append(dl, h('p', { class: 'dlx-nicht-drucken' }, h('label', null, hide, ' ', T('recHide'))), table,
    h('p', { class: 'dlx-muted dlx-rec-hinweis' }, T('recNote')), created, h('div', { class: 'dlx-aktionen dlx-nicht-drucken' }, print));
  render();
})();
