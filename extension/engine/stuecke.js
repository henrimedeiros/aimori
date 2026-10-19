// Lange Dokumenttexte in Stuecken pruefen (Design-Review Datei-Uploads 17.10.2026,
// Auflagen 2, 3, 7): je Stueck 10000 Zeichen (gemessen unter 50 ms) mit 400 Zeichen Ueberlappung (laenger
// als jeder Einzelwert). Zeitscheibe (Design-Review Bereinigen 19.10.2026, Auflage 1): Stuecke
// hintereinander, den Thread erst nach >= 40 ms Rechenzeit per setTimeout(0) freigeben (jede Pause
// kostet 4-16 ms); die Frist gilt weiter nach jedem Stueck, Ueberschreiten = unscannable.
// Funde aus der Ueberlappung werden nach Typ und Position zusammengefuehrt, damit die
// Anzahl stimmt; Ganztext-Funde (start === end) je Typ nur einmal. Ueberschrittene
// Frist oder ein nicht pruefbares Stueck: unscannable, bisherige Funde bleiben.
(function (g) {
  'use strict';
  const DLX = g.DLX = g.DLX || {};
  const CHUNK = 10000, OVERLAP = 400, SLICE_MS = 40;
  const now = () => (g.performance ? g.performance.now() : Date.now());
  const pause = () => new Promise((r) => setTimeout(r, 0));

  // check(stueck) -> { findings, unscannable }; deadline = Zeitpunkt in ms (Date.now()).
  async function scan(text, check, deadline) {
    const findings = [], seen = new Set();
    let since = now();
    for (let i = 0; ; i += CHUNK - OVERLAP) {
      if (deadline && Date.now() > deadline) return { findings, unscannable: true };
      const r = check(text.slice(i, i + CHUNK));
      for (const f of r.findings) {
        const whole = f.start === f.end;
        const k = whole ? f.id : f.id + ':' + (f.start + i);
        if (seen.has(k)) continue;
        seen.add(k);
        findings.push(whole ? f : Object.assign({}, f, { start: f.start + i, end: f.end + i }));
      }
      if (r.unscannable) return { findings, unscannable: true };
      if (i + CHUNK >= text.length) break;
      if (now() - since >= SLICE_MS) { await pause(); since = now(); }
    }
    return { findings, unscannable: false };
  }

  DLX.stuecke = Object.freeze({ CHUNK, OVERLAP, SLICE_MS, scan });
})(globalThis);
