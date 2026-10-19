// Bildschirmteilen erkennen, Teil 2 (Design-Review Bildschirmteilen 17.10.2026, Auflage 3): isolierte
// Welt auf denselben Meeting-Seiten. Nimmt vom Seitenskript nur Texte nach festem Muster an und meldet
// dem Service Worker nur {t, on, surface}; hoechstens 2 Meldungen je Sekunde. Ladebeginn und pagehide
// melden "aus". Der Service Worker schickt nie etwas zurueck (Auflage 4). Kein Speicher, kein Netz.
(function (g) {
  'use strict';
  if (g.__dlxShareLoaded || window.top !== window) return;
  g.__dlxShareLoaded = true;
  const SIGNAL = /^(an:(browser|window|monitor)|aus)$/;
  const sent = [];
  let later = 0, latest = null;   // gedrosselt: nur das letzte Signal nach Ablauf der Sekunde

  function report(s) {
    const now = Date.now();
    while (sent.length && now - sent[0] >= 1000) sent.shift();
    if (sent.length >= 2) {
      latest = s;
      if (!later) later = setTimeout(() => { later = 0; const x = latest; latest = null; if (x) report(x); }, 1000 - (now - sent[0]) + 5);
      return;
    }
    sent.push(now);
    const msg = s === 'aus' ? { t: 'shareSignal', on: false } : { t: 'shareSignal', on: true, surface: s.slice(3) };
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
  document.addEventListener('dlx-teilen', (e) => {
    const s = e.detail;
    if (typeof s === 'string' && SIGNAL.test(s)) report(s);
  }, true);
  g.addEventListener('pagehide', () => report('aus'));
  report('aus');
})(globalThis);
