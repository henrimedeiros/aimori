// KI-Kompetenz (EU AI Act Art. 4, Design-Review 14.10.2026, docs/sicherheit/
// design-review-kompetenz.md): lokale Monatszahlen je Datentyp-Gruppe, nie
// Werte, Texte, Typ-IDs, Seiten oder Zeitpunkte feiner als der Monat.
// Form: { 'YYYY-MM': { gruppe: { seen, redacted, cancelled, sent } } }, 13 Monate.
// Gelesenes wird streng geprueft (Content Scripts koennen storage.local
// schreiben, Auflage 3); Ungueltiges verwirft den ganzen Speicher.
(function (g) {
  'use strict';
  const DLX = g.DLX || (g.DLX = {});

  const GROUPS = ['finanz', 'sozial', 'gesundheit', 'firma', 'kontakt', 'steuer', 'technik', 'reise', 'id-national', 'person'];
  const FIELDS = ['seen', 'redacted', 'cancelled', 'sent'];
  // Gruppen mit besonders schuetzenswerten Daten: im Nachweis ausblendbar (Auflage 11).
  const SENSITIVE = ['gesundheit', 'id-national', 'person'];
  const KEEP_MONTHS = 13;
  const MAX = 1000000;
  const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
  // Entscheidung im Service Worker -> Zaehlfeld; nicht aufgefuehrt = zaehlt nicht.
  const DECISION_FIELD = { redact: 'redacted', pseudonym: 'redacted', cancel: 'cancelled', blocked: 'cancelled', override: 'sent' };
  const SCHEMA = 'dlx-kompetenz/2';

  const pad = (n) => (n < 10 ? '0' : '') + n;
  const month = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
  // Die letzten n Monatsschluessel bis einschliesslich zum Monat von now, neuester zuerst.
  function lastMonths(now, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(month(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    return out;
  }
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const count = (v) => Number.isSafeInteger(v) && v >= 0 && v <= MAX;

  // Gepruefte Kopie aus null-Prototyp-Objekten. now gesetzt: nur die letzten 13
  // Monate (Zukunft und Aelteres fallen still weg). Jede andere Abweichung -> leer.
  function clean(raw, now) {
    const out = Object.create(null);
    if (raw === undefined || raw === null) return out;
    if (!isObj(raw)) return Object.create(null);
    const keep = now ? lastMonths(now, KEEP_MONTHS) : null;
    for (const m of Object.keys(raw)) {
      const groups = raw[m];
      if (!MONTH.test(m) || !isObj(groups)) return Object.create(null);
      const gm = Object.create(null);
      for (const gr of Object.keys(groups)) {
        const f = groups[gr];
        if (GROUPS.indexOf(gr) === -1 || !isObj(f)) return Object.create(null);
        const row = Object.create(null);
        for (const k of FIELDS) row[k] = 0;
        for (const k of Object.keys(f)) {
          if (FIELDS.indexOf(k) === -1 || !count(f[k])) return Object.create(null);
          row[k] = f[k];
        }
        gm[gr] = row;
      }
      if (!keep || keep.indexOf(m) !== -1) out[m] = gm;
    }
    return out;
  }

  // Gruppen der Funde einer Meldung: nur sichere, pruefbare Funde, jede Gruppe einmal.
  function groupsOf(items) {
    const out = [];
    for (const it of items || []) {
      if (!it || it.id === 'unscannable' || it.sure === false) continue;
      if (GROUPS.indexOf(it.cat) !== -1 && out.indexOf(it.cat) === -1) out.push(it.cat);
    }
    return out;
  }

  // Neuer, gepruefter Speicher mit +1 je Gruppe im Feld (am Rand gekappt).
  function add(raw, now, groups, field) {
    const s = clean(raw, now);
    if (FIELDS.indexOf(field) === -1) return s;
    const m = month(now);
    for (const gr of groups) {
      if (GROUPS.indexOf(gr) === -1) continue;
      if (!s[m]) s[m] = Object.create(null);
      if (!s[m][gr]) { s[m][gr] = Object.create(null); for (const k of FIELDS) s[m][gr][k] = 0; }
      s[m][gr][field] = Math.min(MAX, s[m][gr][field] + 1);
    }
    return s;
  }

  // Summen eines Monats ueber alle (oder die genannten) Gruppen.
  function totals(store, m, groups) {
    const out = { seen: 0, redacted: 0, cancelled: 0, sent: 0 };
    const gm = store[m];
    if (!gm) return out;
    for (const gr of Object.keys(gm)) {
      if (groups && groups.indexOf(gr) === -1) continue;
      for (const k of FIELDS) out[k] += gm[gr][k];
    }
    return out;
  }

  // Vorbereitung fuer eine spaetere Meldung (z. B. CIPP), ohne Aufrufer und ohne
  // Netz (Auflagen 12, 14): feste Form, nur Zahlen, Gruppen mit 4 Feldern. Sensible
  // Gruppen (Gesundheit, Personendaten, nationale ID) nur zusammengefasst als
  // sensitive, nie einzeln (Design-Review Kontext 14.10.2026, Auflage 5).
  function report(raw, m) {
    const s = clean(raw);
    const ok = MONTH.test(String(m));
    const groups = {}, sensitive = {};
    for (const k of FIELDS) sensitive[k] = 0;
    for (const gr of GROUPS) {
      const src = ok && s[m] && s[m][gr] ? s[m][gr] : null;
      if (SENSITIVE.indexOf(gr) !== -1) { for (const k of FIELDS) sensitive[k] += src ? src[k] : 0; continue; }
      groups[gr] = {};
      for (const k of FIELDS) groups[gr][k] = src ? src[k] : 0;
    }
    return { schema: SCHEMA, month: ok ? m : '', groups, sensitive };
  }

  DLX.kompetenz = { GROUPS, FIELDS, SENSITIVE, KEEP_MONTHS, MAX, DECISION_FIELD, SCHEMA, month, lastMonths, clean, groupsOf, add, totals, report };
})(globalThis);
