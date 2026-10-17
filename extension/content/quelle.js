// Content Script nur auf vertraulichen Quellen (Richtlinie sensitiveSources, vom
// Service Worker nur fuer erteilte und konfigurierte Origins registriert).
// Beim Kopieren/Ausschneiden geht nur eine SHA-256-Pruefsumme des normalisierten
// Texts an den Service Worker; der Text verlaesst dieses Skript nie, nichts im DOM,
// kein Speicher, kein Nachrichten-Empfang (Design-Review Antwort/Zwischenablage
// 16.10.2026, Auflagen 10, 11).
(function (g) {
  'use strict';
  const Q = g.DLX && g.DLX.quellen;
  if (!Q || g.__dlxQuelleLoaded) return;
  g.__dlxQuelleLoaded = true;

  let texts = null;   // Texte des laufenden Kopiervorgangs (hoechstens 2)

  function selectionText() {
    const a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|url|tel|email|)$/i.test(a.type || ''))) &&
      typeof a.selectionStart === 'number' && a.selectionEnd > a.selectionStart) return a.value.slice(a.selectionStart, a.selectionEnd);
    const s = g.getSelection && g.getSelection();
    return s ? String(s.toString()) : '';
  }

  const hex = (buf) => Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
  async function flush() {
    const list = texts;
    texts = null;
    const seen = new Set();
    for (const t of list || []) {
      const n = Q.normalize(t);
      if (!Q.hashable(n) || seen.has(n)) continue;
      seen.add(n);
      const hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(n)));
      chrome.runtime.sendMessage({ t: 'srcMark', hash }).catch(() => {});
    }
  }

  // Capture: Auswahl lesen, nie clipboardData aendern oder das Ereignis stoppen.
  function before() {
    if (!texts) { texts = []; setTimeout(flush, 0); }
    const t = selectionText();
    if (t && texts.length < 2) texts.push(t);
  }
  // Bubble: Text, den die Seite selbst gesetzt hat (setData), falls abweichend.
  function after(e) {
    if (!texts || !e.clipboardData) return;
    const t = e.clipboardData.getData('text/plain');
    if (t && texts.length < 2 && texts.indexOf(t) === -1) texts.push(t);
  }
  for (const type of ['copy', 'cut']) {
    g.addEventListener(type, before, { capture: true });
    g.addEventListener(type, after, { capture: false });
  }
})(globalThis);
