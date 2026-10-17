// Ansicht "Antwort mit echten Werten" (erweiterungseigene Herkunft, im Tab der
// KI-Seite in closed Shadow Root). Den Text gibt der Service Worker nur gegen
// die einmal gueltige Nonce aus der eigenen URL heraus; Anzeige nur als Text,
// Kopieren nur auf echten Klick (Design-Review Platzhalter 14.10.2026 Auflagen 3, 5).
(async function () {
  'use strict';
  const DLX = globalThis.DLX;
  const { h } = DLX.dom;
  const nonce = location.hash.slice(1);
  const valid = /^[0-9a-f]{32}$/.test(nonce);
  const info = valid ? await chrome.runtime.sendMessage({ t: 'view', nonce }).catch(() => null) : null;
  const text = info && typeof info.text === 'string' ? info.text : null;
  const b = info && info.branding ? info.branding : DLX.branding;
  const lang = DLX.i18n.resolveLang(info ? info.language : 'auto', navigator.language);
  const T = (k) => DLX.i18n.t(lang, k, { product: b.productName, company: b.companyName });
  document.documentElement.lang = lang;
  DLX.dom.applyBranding(b, matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.className = 'dlx-frame dlx-voll-seite';

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    if (valid) chrome.runtime.sendMessage({ t: 'close', nonce }).catch(() => {});
  }

  // Zwischenablage: Clipboard-API (iframe allow="clipboard-write"), sonst
  // execCommand aus einem kurzlebigen textarea, das sofort geleert wird.
  async function copy(btn) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = false; }
    if (!ok) {
      const ta = h('textarea', { class: 'dlx-kopie', 'aria-hidden': 'true' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.value = '';
      ta.remove();
    }
    if (ok) btn.textContent = T('copied');
  }

  const actions = [];
  if (text !== null) {
    const c = h('button', { type: 'button', class: 'dlx-knopf dlx-haupt', 'data-k': 'copy' }, T('copy'));
    c.addEventListener('click', (e) => { if (e.isTrusted) copy(c); });
    actions.push(c);
  }
  const x = h('button', { type: 'button', class: 'dlx-knopf', 'data-k': 'close' }, T('close'));
  x.addEventListener('click', (e) => { if (e.isTrusted) close(); });
  actions.push(x);

  const body = h('pre', { class: 'dlx-antwort' });
  body.textContent = text !== null ? text : T('viewGone');
  document.body.append(h('main', { class: 'dlx-karte', role: 'dialog', 'aria-label': b.productName },
    DLX.dom.brand(b, b.companyName || ''),
    h('h1', null, T('viewTitle')),
    text !== null ? h('p', { class: 'dlx-sperre' }, T('viewNote')) : null,
    body,
    h('div', { class: 'dlx-aktionen' }, actions)));
  (actions[0]).focus();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();
