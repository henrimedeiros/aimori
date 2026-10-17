// Platzhalter statt Schwaerzen (Design-Review Platzhalter 14.10.2026):
// gleicher Wert -> gleicher Platzhalter [TYP_n] je Dokument. Die Zuordnung lebt
// nur in dieser Instanz (Variable im Content Script dieses Tabs): nie
// chrome.storage, nie Platte, verworfen bei pagehide oder Richtlinie aus.
// Platzhalter sind lesbar und fortlaufend je Typ, nie aus dem Wert abgeleitet.
// Ruecktausch in einem Durchgang mit festem Muster, nicht rekursiv (Auflage 1).
(function (g) {
  'use strict';
  const DLX = g.DLX;
  const MAX = 500;            // danach normales Schwaerzen (Auflage 7)
  const PATTERN = /\[[A-Z0-9]+(?:_[A-Z0-9]+)*_\d{1,4}\]/g;

  const labelOf = (id) => String(id).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'WERT';
  const keyOf = (id, value) => id + '\u0000' + value.normalize('NFKC').replace(/\s+/g, ' ').trim();

  function create() {
    let byKey = new Map();    // id + normalisierter Wert -> Platzhalter
    let byPh = new Map();     // Platzhalter -> { value, id, cat }
    let counters = new Map(); // Label -> letzter Zaehler

    // Zaehler in Leserichtung vergeben, dann ersetzen; ueber der Grenze faellt
    // der Fund auf fallback(f) zurueck (normales Schwaerzen).
    function pseudonymize(text, findings, fallback) {
      const labels = new Map();
      for (const f of findings.filter((x) => !x.meta).sort((a, b) => a.start - b.start)) labels.set(f, assign(text, f, fallback));
      return DLX.engine.redact(text, findings, (f) => labels.get(f));
    }

    // Label ohne Klammern (engine.redact setzt sie).
    function assign(text, f, fallback) {
      const value = text.slice(f.start, f.end);
      const key = keyOf(f.id, value);
      const known = byKey.get(key);
      if (known) return known.slice(1, -1);
      if (byPh.size >= MAX) return fallback(f);
      const label = labelOf(f.id);
      const n = (counters.get(label) || 0) + 1;
      counters.set(label, n);
      const ph = '[' + label + '_' + n + ']';
      byKey.set(key, ph);
      byPh.set(ph, { value, id: f.id, cat: f.cat });
      return ph.slice(1, -1);
    }

    // Echte Werte nur fuer die erweiterungseigene Ansicht.
    function restore(text) {
      return String(text).replace(PATTERN, (m) => (byPh.has(m) ? byPh.get(m).value : m));
    }

    // Bekannte Platzhalter im Text als wertfreie Liste [{id, cat, n}].
    function summary(text) {
      const map = new Map();
      for (const m of String(text).match(PATTERN) || []) {
        const e = byPh.get(m);
        if (!e) continue;
        const s = map.get(e.id) || { id: e.id, cat: e.cat, n: 0 };
        s.n++;
        map.set(e.id, s);
      }
      return [...map.values()];
    }

    function clear() { byKey = new Map(); byPh = new Map(); counters = new Map(); }

    return { pseudonymize, restore, summary, clear, get size() { return byPh.size; } };
  }

  DLX.pseudonym = Object.freeze({ MAX, PATTERN, labelOf, create });
})(globalThis);
