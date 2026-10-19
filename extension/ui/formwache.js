// Fenster der Formularwache (Design-Review KI-Agenten 16.10.2026, Auflagen 7, 10): eigene
// Erweiterungsseite ausserhalb der Webseite. Zeigt nur Seite, Datentypen und Anzahl, nie Werte.
// Knoepfe nur mit echtem Klick (isTrusted). Ein KI-Agent mit Browser-Steuerung kann echte
// Klicks erzeugen: das Fenster bremst, es ist keine Sperre (docs/ki-agenten.md).
(function () {
  'use strict';
  const h = DLX.dom.h;
  const n = new URLSearchParams(location.search).get('n') || '';
  const send = (msg) => chrome.runtime.sendMessage(Object.assign({ n }, msg));

  send({ t: 'formInfo' }).then(async (info) => {
    if (!info || !Array.isArray(info.items)) { window.close(); return; }
    const b = Object.assign({}, DLX.branding, info.branding || {});
    DLX.dom.applyBranding(b, matchMedia('(prefers-color-scheme: dark)').matches);
    const lang = await DLX.i18n.ready(info.language, navigator.language);
    const T = (k, v) => DLX.i18n.t(lang, k, Object.assign({ product: DLX.dom.productName(b), company: b.companyName }, v || {}));
    document.title = T('formTitle');
    let done = false;
    const decide = (choice) => { if (done) return; done = true; send({ t: 'formDecide', choice }).finally(() => window.close()); };
    const button = (label, cls, k, fn) => {
      const el = h('button', { type: 'button', class: cls, 'data-k': k }, label);
      el.addEventListener('click', (e) => { if (e.isTrusted) fn(); });
      return el;
    };
    const actions = [button(T('formCancel'), 'dlx-knopf dlx-haupt', 'cancel', () => decide('cancel'))];
    if (info.allowOverride === true) actions.push(button(T('formOverride'), 'dlx-knopf dlx-trotzdem', 'override', () => decide('override')));
    document.body.replaceChildren(h('main', { class: 'dlx-karte', role: 'alertdialog', 'aria-label': T('formTitle') },
      DLX.dom.brand(b, b.companyName || ''),
      h('h1', null, T('formTitle')),
      h('p', null, T('formIntro', { host: info.host })),
      h('ul', { class: 'dlx-liste' }, info.items.map((it) => h('li', null, h('mark', { class: 'dlx-fund' }, DLX.i18n.typeName(lang, it.id)), ' ', h('span', { class: 'dlx-zahl' }, '\u00D7 ' + it.n)))),
      h('p', { class: 'dlx-muted' }, T('formNote')),
      h('div', { class: 'dlx-aktionen' }, actions)));
    actions[0].focus();
  }, () => window.close());
})();
