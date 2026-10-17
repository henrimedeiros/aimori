// Kopierwache (Design-Review Kopierwarnung 16.10.2026, docs/sicherheit/design-review-kopierwarnung.md):
// laeuft nur, wenn der Benutzer das optionale Recht https://*/* erteilt hat und die Einstellung
// copySidebarHint an ist (Service Worker registriert es, Hauptframe, isoliert, ohne KI-Seiten).
// Beim Kopieren/Ausschneiden wird nur die Auswahl gelesen (nie clipboardData, nie das Ereignis
// stoppen, nie Passwortfelder). Der Text bleibt in dieser Closure, geht nie an den Service Worker
// ({t:'copyScan'} ohne Inhalt); der laedt die Engine bei Bedarf in genau dieses Dokument. Nach der
// Pruefung, spaetestens nach 5 s, ist der Text verworfen (Auflage 8). Bei Fund: dezenter Hinweis
// in closed Shadow Root, nur Typnamen, keine Werte, keine Links (Auflage 9). Kein Speicher, kein Netz.
(function (g) {
  'use strict';
  if (g.__dlxCopyLoaded || window.top !== window) return;
  g.__dlxCopyLoaded = true;

  const MAX = 20000;          // geprueft werden hoechstens die ersten 20000 Zeichen
  const WAIT_MS = 5000;
  const SHOW_MS = 8000;
  const TEXT_INPUT = /^(text|search|url|tel|email|)$/i;
  let epoch = 0;              // erhoeht beim Verlassen der Seite: offene Antworten verfallen
  let host = null;
  let hideTimer = 0;

  function selectionText() {
    const a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && TEXT_INPUT.test(a.type || ''))) &&
      typeof a.selectionStart === 'number' && a.selectionEnd > a.selectionStart) return a.value.slice(a.selectionStart, a.selectionEnd);
    if (a && a.tagName === 'INPUT') return '';    // Passwort- und andere Felder nie lesen
    const s = g.getSelection && g.getSelection();
    return s ? String(s.toString()) : '';
  }

  function onCopy() {
    const gen = epoch;
    let text = selectionText().slice(0, MAX);
    if (!text.trim()) return;
    const timer = setTimeout(() => { text = null; }, WAIT_MS);
    chrome.runtime.sendMessage({ t: 'copyScan' }).then((r) => {
      const t = text;
      text = null;
      clearTimeout(timer);
      if (!t || gen !== epoch || !r || !r.cfg || !g.DLX || !g.DLX.engine) return;
      const DLX = g.DLX;
      const res = DLX.engine.scan(t, DLX.policy.engineConfig(r.cfg));
      if (res.unscannable) return;
      const found = Array.from(res.findings).filter((f) => f.action !== 'off');
      if (!found.length) return;
      const lang = DLX.i18n.resolveLang(r.cfg.language, navigator.language);
      const types = Array.from(DLX.engine.summarize(found), (s) => DLX.i18n.typeName(lang, s.id)).filter((x, i, a) => a.indexOf(x) === i);
      show(lang, types, r.product || '');
    }).catch(() => { text = null; clearTimeout(timer); });
  }

  // Meldung nur per DOM-API und CSSOM (Seiten-CSP bleibt unberuehrt); neutrales Host-Element.
  function css(el, rules) { for (const [k, v] of Object.entries(rules)) el.style.setProperty(k, v, 'important'); }
  function show(lang, types, product) {
    const T = (k, v) => g.DLX.i18n.t(lang, k, Object.assign({ product }, v || {}));
    hide();
    host = document.createElement('div');
    css(host, { position: 'fixed', 'z-index': '2147483647', right: '16px', bottom: '16px', width: 'min(380px, calc(100vw - 32px))', display: 'block',
      margin: '0', padding: '0', border: '0', background: 'transparent', opacity: '1', visibility: 'visible', transform: 'none', filter: 'none' });
    const root = host.attachShadow({ mode: 'closed' });
    const box = document.createElement('div');
    box.setAttribute('role', 'status');
    box.lang = lang;
    css(box, { display: 'flex', gap: '10px', 'align-items': 'flex-start', 'box-sizing': 'border-box', padding: '12px 12px 12px 14px', 'border-radius': '12px',
      background: '#1c1c20', color: '#f5f3f0', 'border-left': '4px solid #ff7a3d', 'box-shadow': '0 18px 40px -18px rgb(0 0 0 / 0.55)',
      font: '13px/1.4 Geist, system-ui, -apple-system, "Segoe UI", sans-serif', 'text-align': 'left', 'letter-spacing': 'normal' });
    const body = document.createElement('div');
    css(body, { flex: '1 1 auto', 'min-width': '0' });
    const title = document.createElement('p');
    css(title, { margin: '0 0 4px', 'font-weight': '600', color: '#f5f3f0' });
    title.textContent = T('copyToastTitle', { types: types.join(', ') });
    const text = document.createElement('p');
    css(text, { margin: '0', color: 'rgb(245 243 240 / 0.72)' });
    text.textContent = T('copyToastText');
    body.append(title, text);
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', T('close'));
    css(close, { flex: '0 0 auto', cursor: 'pointer', border: '0', background: 'transparent', color: '#f5f3f0', font: '18px/1 system-ui, sans-serif', padding: '0 2px', margin: '0' });
    close.addEventListener('click', hide);
    box.append(body, close);
    root.append(box);
    document.documentElement.append(host);
    hideTimer = setTimeout(hide, SHOW_MS);
  }
  function hide() {
    clearTimeout(hideTimer);
    if (host) host.remove();
    host = null;
  }

  for (const type of ['copy', 'cut']) g.addEventListener(type, onCopy, { capture: true, passive: true });
  g.addEventListener('pagehide', () => { epoch++; hide(); });
})(globalThis);
