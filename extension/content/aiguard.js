// Waechter fuer KI-Seiten der Liste (Design-Review KI-Seiten 14.10.2026).
// Wird nur dynamisch registriert (gewaehrte Origins, Modus hint/block). Liest
// weder Eingaben noch Seiteninhalte; fragt den Service Worker nur, ob diese
// Seite erlaubt ist. Hinweis bzw. Sperre erscheinen als erweiterungseigenes
// iframe (ui/aibanner.html#<nonce>) in closed Shadow Root an documentElement.
// Kein postMessage, kein Netz, keine Speicherung (Auflagen 8, 11).
(function (g) {
  'use strict';
  if (g.__dlxAiGuard || window.top !== window) return;
  g.__dlxAiGuard = true;

  const BASE = {
    position: 'fixed', 'z-index': '2147483647', display: 'block', visibility: 'visible', opacity: '1',
    'pointer-events': 'auto', transform: 'none', filter: 'none', 'clip-path': 'none', margin: '0', padding: '0',
    border: '0', 'box-sizing': 'border-box', background: 'transparent',
  };
  const HINT = { top: '8px', left: '8px', right: '8px', width: 'auto', height: '52px' };
  const BLOCK = { inset: '0', width: 'auto', height: 'auto', background: '#ffffff' };

  let host = null;
  let frame = null;
  let mode = null;
  let nonce = null;
  let want = '';
  let watcher = null;

  function place() {
    for (const [k, v] of Object.entries(Object.assign({}, BASE, mode === 'block' ? BLOCK : HINT))) host.style.setProperty(k, v, 'important');
    want = host.getAttribute('style');
  }

  // Neue Nonce holen: ein wieder eingesetztes iframe laedt neu, die alte Nonce
  // ist dann verbraucht. Die Sperre selbst bleibt dabei bestehen.
  function renew() {
    chrome.runtime.sendMessage({ t: 'aiSite' }).then((r) => {
      if (!r || r.a !== mode || typeof r.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(r.nonce) || !frame) return;
      nonce = r.nonce;
      frame.src = chrome.runtime.getURL('ui/aibanner.html') + '#' + nonce;
    }).catch(() => {});
  }

  // Host an documentElement halten; im Sperr-Modus alles andere entfernen.
  function keep() {
    const root = document.documentElement;
    if (!host || !root) return;
    if (mode === 'block') for (const n of Array.from(root.childNodes)) if (n !== host) n.remove();
    if (host.parentNode !== root) { root.append(host); renew(); }
    if (host.getAttribute('style') !== want) place();
  }

  function show() {
    host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'closed' });
    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('ui/aibanner.html') + '#' + nonce;
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:transparent;color-scheme:normal;';
    shadow.append(frame);
    place();
    document.documentElement.append(host);
    keep();
    // Seite entfernt oder verstellt den Host: sofort neu setzen (Auflage 8).
    watcher = new MutationObserver(keep);
    watcher.observe(document, { childList: true, subtree: true });
    watcher.observe(host, { attributes: true });
  }

  function whenRoot(cb) {
    if (document.documentElement) { cb(); return; }
    const o = new MutationObserver(() => { if (document.documentElement) { o.disconnect(); cb(); } });
    o.observe(document, { childList: true });
  }

  // Schliessen kommt nur vom Service Worker und nur im Hinweis-Modus.
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== chrome.runtime.id || sender.tab || !msg || msg.t !== 'aiHide' || msg.nonce !== nonce || mode !== 'hint') return;
    if (watcher) watcher.disconnect();
    if (host) host.remove();
    host = null;
  });

  chrome.runtime.sendMessage({ t: 'aiSite' }).then((r) => {
    if (!r || (r.a !== 'hint' && r.a !== 'block') || typeof r.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(r.nonce)) return;
    mode = r.a;
    nonce = r.nonce;
    if (mode === 'block') window.stop();
    whenRoot(show);
  }).catch(() => { /* Service Worker nicht erreichbar: nichts anzeigen */ });
})(globalThis);
