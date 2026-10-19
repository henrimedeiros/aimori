// Hinweis bzw. Sperrseite fuer nicht freigegebene KI-Seiten (erweiterungseigene
// Herkunft, im Tab der KI-Seite in closed Shadow Root). Ohne gueltige, einmal
// gueltige Nonce aus der eigenen URL wird nichts angezeigt; Texte nur per
// textContent, Link nur https (Design-Review KI-Seiten 14.10.2026, Auflagen 3, 8).
(async function () {
  'use strict';
  const DLX = globalThis.DLX;
  const { h } = DLX.dom;
  const nonce = location.hash.slice(1);
  if (!/^[0-9a-f]{32}$/.test(nonce)) return;
  const info = await chrome.runtime.sendMessage({ t: 'aiBanner', nonce }).catch(() => null);
  if (!info || (info.a !== 'hint' && info.a !== 'block')) return;
  const b = info.branding || DLX.branding;
  const lang = await DLX.i18n.ready(info.language, navigator.language);
  const site = typeof info.site === 'string' ? info.site : '';
  const T = (k) => DLX.i18n.t(lang, k, { product: b.productName, company: b.companyName, site });
  document.documentElement.lang = lang;
  DLX.dom.applyBranding(b, matchMedia('(prefers-color-scheme: dark)').matches);

  const text = typeof info.text === 'string' && info.text ? info.text : '';
  const url = typeof info.url === 'string' && /^https:\/\//.test(info.url) ? info.url : '';
  const suggest = typeof info.suggest === 'string' ? info.suggest : '';
  const linkText = typeof info.linkText === 'string' && info.linkText ? info.linkText
    : suggest ? DLX.i18n.t(lang, 'aiSuggest', { site: suggest }) : T('aiLink');
  // rel ohne opener/Referrer (setzt DLX.dom.h fuer jedes <a> ohnehin, hier ausdruecklich).
  const link = url ? h('a', { class: 'dlx-knopf dlx-haupt', href: url, target: '_blank', rel: 'noopener noreferrer', 'data-k': 'link' }, linkText) : null;

  if (info.a === 'hint') {
    const x = h('button', { type: 'button', class: 'dlx-knopf dlx-zu', 'data-k': 'close', title: T('close'), 'aria-label': T('close') }, DLX.dom.icon('close'));
    x.addEventListener('click', (e) => { if (e.isTrusted) chrome.runtime.sendMessage({ t: 'aiClose', nonce }).catch(() => {}); });
    document.body.className = 'dlx-frame dlx-bar-seite';
    document.body.append(h('div', { class: 'dlx-bar', role: 'status', 'aria-label': b.productName },
      DLX.dom.mark(b, 20),
      h('p', { class: 'dlx-bar-text', title: text || null }, h('span', { class: 'dlx-bar-lead' }, T('aiHint')), text ? ' ' + text : ''),
      h('div', { class: 'dlx-bar-aktionen' }, link, x)));
    return;
  }
  // Sperre: kein Schliessen-Weg (Auflage 8).
  document.body.className = 'dlx-frame dlx-voll-seite';
  document.body.append(h('main', { class: 'dlx-karte', role: 'alert', 'aria-label': b.productName },
    DLX.dom.brand(b, b.companyName || ''),
    h('h1', null, T('aiBlockTitle')),
    h('p', { class: 'dlx-intro' }, text || T('aiBlockText')),
    link ? h('div', { class: 'dlx-aktionen' }, link) : null));
})();
