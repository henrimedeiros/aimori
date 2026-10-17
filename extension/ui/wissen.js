// "Mehr erfahren": warum Daten einer Gruppe heikel sind und was man tun kann.
// Nur feste Texte aus i18n.js, lokal, kein Netz; der Hash waehlt nur aus der
// Gruppen-Positivliste, Unbekanntes zeigt die Uebersicht (Design-Review 14.10.2026 Auflage 6).
(async function () {
  'use strict';
  const DLX = globalThis.DLX;
  const { h } = DLX.dom;
  const K = DLX.kompetenz;
  const st = (await chrome.runtime.sendMessage({ t: 'brand' }).catch(() => null)) || { branding: DLX.branding, language: 'auto' };
  const b = st.branding;
  const lang = DLX.i18n.resolveLang(st.language, navigator.language);
  const T = (k, v) => DLX.i18n.t(lang, k, Object.assign({ product: b.productName, company: b.companyName }, v || {}));
  document.documentElement.lang = lang;
  DLX.dom.applyBranding(b, matchMedia('(prefers-color-scheme: dark)').matches);
  document.title = b.productName + ' – ' + T('learnTitle');

  const own = (id) => DLX.i18n.typeName(lang, id);
  function types(group) {
    const ids = DLX.engine.allDetectors().filter((d) => d.cat === group).map((d) => d.id);
    if (group === 'firma') ids.push('custom_term');
    return Array.from(new Set(ids.map(own)));
  }
  const link = (group) => h('a', { href: chrome.runtime.getURL('ui/wissen.html#' + group) }, T('cat_' + group));

  function render() {
    const want = location.hash.slice(1);
    const group = K.GROUPS.indexOf(want) !== -1 ? want : null;
    const main = h('main', { class: 'dlx-wissen' }, h('h1', null, T('learnTitle')), h('p', { class: 'dlx-intro' }, T('learnIntro')));
    if (group) {
      main.append(h('section', { class: 'dlx-abschnitt' },
        h('h2', null, T('cat_' + group)),
        h('p', null, h('strong', null, T('why_' + group))),
        h('p', null, T('learn_' + group)),
        h('h3', { class: 'dlx-unter' }, T('learnTypes')),
        h('p', { class: 'dlx-muted' }, types(group).join(', ')),
        h('h3', { class: 'dlx-unter' }, T('learnWhat')),
        h('p', null, T('learnWhatText'))));
      main.append(h('p', null, h('a', { href: chrome.runtime.getURL('ui/wissen.html') }, T('learnAll'))));
    } else {
      for (const g of K.GROUPS) main.append(h('section', { class: 'dlx-abschnitt' }, h('h2', null, link(g)), h('p', null, T('why_' + g))));
      main.append(h('section', { class: 'dlx-abschnitt' }, h('h2', null, T('learnWhat')), h('p', null, T('learnWhatText'))));
    }
    main.append(h('p', { class: 'dlx-muted' }, T('learnNoLegal')));
    document.body.replaceChildren(h('header', { class: 'dlx-opt-kopf' }, h('div', null, DLX.dom.brand(b, b.companyName || ''))), main);
  }
  render();
  window.addEventListener('hashchange', render);
})();
