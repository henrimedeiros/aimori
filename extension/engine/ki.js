// Lokale KI-Erkennung, Teil im Content Script: Antwort pruefen, Modell-Typen
// auf eigene Datentypen abbilden, Kontext und Konfidenz bewerten, mit den
// Regel-Funden zusammenfuehren. Das Modell selbst laeuft im Offscreen-Dokument
// (ui/ki.js, ui/ki-worker.mjs); hierher kommen nur Typ, Start, Ende, Konfidenz.
// Regeln bleiben fuer feste Formate zustaendig und haben Vorrang: ein KI-Fund
// entschaerft nie einen Regel-Fund (Design-Review KI 16.10.2026, Auflagen 16, 18).
(function (g) {
  'use strict';
  const DLX = g.DLX;
  const MAX_TEXT = 4000;     // Laengengrenze je Anfrage (Auflage 12)
  const SECTION = 2000;      // Abschnitt je Anfrage: rechnet rund 1 s, das Zeitlimit je Anfrage bleibt 3 s
  const OVERLAP = 200;       // Ueberlappung der Abschnitte, damit kein Name an der Grenze zerfaellt
  const MAX_TOTAL = 40000;   // Gesamtgrenze je Text; was dahinter liegt = "KI nur teilweise" (Auflage 15)
  const MAX_ENTS = 500;
  const HIGH = 0.9;          // ab hier sicher ohne Kontextwort
  const LOW = 0.6;           // darunter verworfen; dazwischen nur mit Kontextwort sicher, sonst dezent

  // Modell-Typen (bardsai/eu-pii-anonimization-multilang) -> eigene Typen.
  // Feste Formate (IBAN, Mail, Telefon, Karten ...) erkennen die Regeln.
  const TYPES = {
    PERSON_NAME: 'person', ORGANIZATION_NAME: 'company', POSTAL_ADDRESS: 'address', LOCATION: 'address', HEALTH_DATA: 'health',
    ETHNIC_ORIGIN: 'special_category', POLITICAL_OPINION: 'special_category', RELIGION_OR_BELIEF: 'special_category',
    SEXUAL_ORIENTATION: 'special_category', TRADE_UNION_MEMBERSHIP: 'special_category', BIOMETRIC_DATA: 'special_category',
    CRIMINAL_OFFENCE_DATA: 'special_category',
  };
  const ALLOWED = Object.keys(TYPES).concat(['ACCOUNT_IDENTIFIER', 'AUTH_SECRET', 'BANK_ACCOUNT_IDENTIFIER', 'CONTACT_HANDLE', 'DATE_OF_BIRTH',
    'DEVICE_IDENTIFIER', 'DOCUMENT_IDENTIFIER', 'DOCUMENT_REFERENCE', 'EMAIL_ADDRESS', 'FINANCIAL_AMOUNT', 'GEO_LOCATION', 'IDENTIFYING_LINK',
    'IP_ADDRESS', 'ORGANIZATION_IDENTIFIER', 'PAYMENT_CARD', 'PAYMENT_CARD_SECURITY', 'PERSON_ALIAS', 'PERSON_ATTRIBUTE', 'PERSON_IDENTIFIER',
    'PERSON_ROLE_OR_TITLE', 'PHONE_NUMBER', 'PROPER_NAME', 'VEHICLE_IDENTIFIER']);
  const CAT = { person: 'person', company: 'firma', address: 'kontakt', health: 'gesundheit', special_category: 'person' };

  // Kontextwoerter vor dem Fund (DE/EN/FR/IT/PT/ES): machen einen mittleren Fund sicher.
  const words = (list) => new RegExp('(?:^|[^\\p{L}])(?:' + list.join('|') + ')(?!\\p{L})[\\s:.,]*(?:\\p{L}+[\\s.]+){0,3}$', 'iu');
  const CTX = {
    person: words(['herr', 'frau', 'hr', 'fr', 'dr', 'prof', 'mr', 'mrs', 'ms', 'miss', 'monsieur', 'madame', 'mme', 'mlle', 'signor', 'signora', 'sig',
      'senhor', 'senhora', 'sr', 'sra', 'dona', 'don', 'doña', 'kunde', 'kundin', 'patient', 'patientin', 'mitarbeiter', 'mitarbeiterin', 'kollege', 'kollegin',
      'customer', 'client', 'cliente', 'employee', 'colleague', 'collègue', 'paciente', 'colaborador', 'colaboradora', 'funcionário', 'funcionária',
      'name', 'namens', 'nom', 'nome', 'nombre', 'an', 'von', 'mit', 'for', 'with', 'from', 'pour', 'avec', 'de', 'da', 'do', 'com', 'para', 'à']),
    // Ohne blosse Praepositionen (bei, at, chez ...): "Preise bei Migros" ist kein Firmengeheimnis.
    company: words(['firma', 'unternehmen', 'kunde', 'kundin', 'arbeitgeber', 'company', 'customer', 'client', 'employer', 'entreprise', 'société',
      'empresa', 'cliente', 'azienda']),
    address: words(['adresse', 'anschrift', 'wohnt', 'wohnhaft', 'address', 'lives', 'domicile', 'habite', 'morada', 'endereço', 'mora', 'reside', 'dirección', 'indirizzo']),
    health: words(['diagnose', 'diagnostiziert', 'leidet', 'krank', 'behandlung', 'therapie', 'diagnosed', 'suffers', 'treatment', 'diagnostic', 'souffre',
      'traitement', 'diagnóstico', 'sofre', 'tratamento', 'patient', 'patientin', 'paciente', 'hat', 'has', 'a', 'tem']),
  };
  // Rechtsform nur direkt hinter einem Namen, nie allein (Design-Review Fehlalarme KI 23.10.2026, Auflage 3).
  const LEGAL = /\S\s+(?:AG|GmbH|SA|Sàrl|Sarl|Sagl|Ltd|plc|Inc|LLC|KG|SE|Lda|Ltda|S\.A\.|S\.r\.l\.|Srl|SpA|S\.p\.A\.|SL|S\.L\.|SAS|BV|NV|Corp|Co)\.?$/u;
  // Nur Postleitzahl und Ort, ohne Strasse: keine Postadresse, hoechstens dezent.
  const ONLY_TOWN = /^\d{4,5}\s+\p{L}[\p{L}\s.-]*$/u;
  // Haeufige Fehlalarme: Namen von KI-Diensten und Tech-Firmen, ueber die man mit
  // der KI spricht, sind keine vertraulichen Firmendaten.
  const PUBLIC = new Set(['chatgpt', 'openai', 'claude', 'anthropic', 'gemini', 'google', 'microsoft', 'copilot', 'meta', 'mistral', 'deepseek',
    'perplexity', 'apple', 'amazon', 'aws', 'azure', 'github', 'linkedin', 'excel', 'word', 'outlook', 'teams', 'windows', 'python', 'javascript']);

  // Auflage 16: nur bekannte Typen, ganzzahlige Grenzen im Text, Konfidenz 0..1.
  function valid(resp, len) {
    if (!resp || !Array.isArray(resp.ents) || resp.ents.length > MAX_ENTS) return null;
    const out = [];
    for (const e of resp.ents) {
      if (!e || ALLOWED.indexOf(e.type) === -1) return null;
      if (!Number.isInteger(e.start) || !Number.isInteger(e.end) || e.start < 0 || e.start >= e.end || e.end > len) return null;
      if (typeof e.score !== 'number' || !(e.score >= 0 && e.score <= 1)) return null;
      out.push({ type: e.type, start: e.start, end: e.end, score: e.score });
    }
    return out;
  }

  // Langer Text -> Abschnitte, je hoechstens SECTION Zeichen, bis MAX_TOTAL. Schnitt am letzten
  // Leerraum vor dem Ende, die Grenzen haengen nur vom Text davor ab: gleicher Anfang = gleiche
  // Abschnitte. from/to: Stellen, fuer die dieser Abschnitt zustaendig ist (Mitte der Ueberlappung).
  function sections(text) {
    const n = Math.min(text.length, MAX_TOTAL);
    const out = [];
    for (let start = 0; start < n;) {
      let end = Math.min(n, start + SECTION);
      if (end < n) {
        let cut = end;
        while (cut > end - OVERLAP && !/\s/.test(text[cut - 1])) cut--;
        if (cut > end - OVERLAP) end = cut;
        else if (/[\uDC00-\uDFFF]/.test(text[end])) end--;   // kein Schnitt mitten im Zeichen
      }
      out.push({ start, end, from: out.length ? out[out.length - 1].to : 0, to: end < n ? end - OVERLAP / 2 : Infinity, text: text.slice(start, end) });
      if (end >= n) break;
      start = end - OVERLAP;
    }
    return out;
  }

  // Modell-Spannen je Abschnitt (lookup: Abschnitt -> Spannen oder nichts) -> Positionen im ganzen Text.
  function combine(parts, lookup) {
    const out = [];
    for (const p of parts) {
      for (const e of lookup(p) || []) {
        const start = p.start + e.start;
        if (start >= p.from && start < p.to) out.push({ type: e.type, start, end: p.start + e.end, score: e.score });
      }
    }
    return out;
  }

  // Spanne ohne Satzzeichen am Rand; null, wenn nichts Wortartiges uebrig bleibt.
  function trim(text, s, e) {
    const v = text.slice(s, e);
    const m = /^[\s"'«»„“”‘’()[\]{}<>.,;:!?*_-]*/u.exec(v)[0].length;
    let r = v.slice(m);
    // Punkt am Ende nur bei Rechtsform-Abkuerzungen behalten (Muster AG., S.A.)
    r = r.replace(/[\s"'«»„“”‘’()[\]{}<>,;:!?*_-]+$/u, '');
    if (r.endsWith('.') && !/\b(?:S\.A|S\.r\.l|Co|Inc|Corp|Ltd)\.$/u.test(r)) r = r.slice(0, -1);
    if (!/\p{L}/u.test(r)) return null;
    return { start: s + m, end: s + m + r.length };
  }

  // Fund im Code/URL/Mail-Umfeld? Dann ist der Treffer fast immer kein Name.
  function technical(text, s, e) {
    const a = text.lastIndexOf(' ', s - 1) + 1;
    let b = text.indexOf(' ', e);
    if (b === -1) b = text.length;
    const tok = text.slice(a, b);
    if (/[@/\\=<>{}]|:\/\/|\.\w{2,4}$/.test(tok) && !/^[\p{L}.'-]+[,.]?$/u.test(tok)) return true;
    const before = text.slice(0, s);
    return (before.split('`').length - 1) % 2 === 1;
  }

  // Eigene Ausgabe: das Modell nimmt [Kategorie] und [TYP_n] gelegentlich fuer einen Fund, auch
  // zusammen mit dem Wort dahinter (Messung 30.10.2026). Nur genau diese Bezeichnungen fallen weg:
  // die Kategorien aus den Sprachtabellen und das Muster aus engine/pseudonym.js. Ein Name in Klammern
  // bleibt ein Fund, ebenso ein Wert neben der Bezeichnung.
  const OWN_PH = /^[A-Z0-9]+(?:_[A-Z0-9]+)*_\d{1,4}$/;
  const OWN_MAX = 80;
  function ownLabel(s) {
    if (OWN_PH.test(s)) return true;
    const I = DLX.i18n;
    if (!I) return false;
    const low = s.toLowerCase();
    return [I.MIN].concat(Object.values(I.STRINGS)).some((t) => Object.keys(t).some((k) => k.startsWith('cat_') && t[k].toLowerCase() === low));
  }
  // Spanne ohne eigene Bezeichnung; null, wenn nur sie getroffen ist. Liegt auf beiden Seiten
  // der Klammer etwas, bleibt die ganze Spanne: lieber zu viel schwaerzen als einen Wert verlieren.
  function withoutOwn(text, span) {
    let t = span;
    for (let n = 0; n < 4; n++) {
      const open = text.lastIndexOf('[', t.end - 1);
      if (open === -1) return t;
      const close = text.indexOf(']', open);
      if (close === -1 || close < t.start || close - open > OWN_MAX || !ownLabel(text.slice(open + 1, close))) return t;
      const left = t.start < open, right = close + 1 < t.end;
      if (!left && !right) return null;
      if (left && right) return t;
      t = left ? trim(text, t.start, open) : trim(text, close + 1, t.end);
      if (!t) return null;
    }
    return t;
  }

  // ents: geprueft (valid), text: der gepruefte Text. Ergebnis: Funde im Engine-Format.
  function findings(text, ents, cfg) {
    const out = [];
    for (const x of ents) {
      let id = TYPES[x.type];
      if (!id) continue;
      const raw = trim(text, x.start, x.end);
      if (!raw) continue;
      const t = withoutOwn(text, raw);
      if (!t) continue;
      const cut = t.start !== raw.start || t.end !== raw.end;
      const value = text.slice(t.start, t.end);
      // Ort ohne Hausnummer/PLZ (nur "Zuerich") ist keine Postadresse.
      if (x.type === 'LOCATION' && !/\d/.test(value)) continue;
      if (technical(text, t.start, t.end)) continue;
      if (id === 'company' && PUBLIC.has(value.toLowerCase().replace(/\s+/g, ''))) continue;
      if ((id === 'person' || id === 'company') && !/\p{Lu}/u.test(value)) continue;   // klein geschriebene Woerter sind selten Namen
      if (id === 'person' && value.length < 3) continue;
      if (x.score < LOW) continue;
      const before = text.slice(Math.max(0, t.start - 40), t.start);
      const ctx = (CTX[id] && CTX[id].test(before)) || (id === 'company' && LEGAL.test(value)) ||
        (id === 'person' && /\s/.test(value)) || (id === 'address' && /\d/.test(value) && /\p{L}{3}/u.test(value));
      // Firmennamen (oeffentliche Marken, Banken, Software) nur mit Kontextwort oder Rechtsform sicher,
      // sonst dezent; Personen wie bisher (Messung 23.10.2026: Alltagstexte 14/96 -> 0/96 mit Fehlalarm).
      // Gekuerzte Spanne: das Modell meinte die Bezeichnung mit, sicher also nur mit Kontext.
      const sure = id === 'address' && ONLY_TOWN.test(value) ? false
        : x.score >= HIGH ? (ctx || (!cut && ((id !== 'person' && id !== 'company') || (id === 'person' && (/\s/.test(value) || x.score >= 0.98))))) : ctx;
      const action = DLX.engine ? DLX.engine.actionFor(id, cfg) : 'warn';
      if (action === 'off') continue;
      out.push({ id, cat: CAT[id], start: t.start, end: t.end, action, sure, ki: true });
    }
    return out;
  }

  // Regeln zuerst: KI-Funde, die einen Regel-Fund ueberlappen, fallen weg (Auflage 18).
  function merge(rules, ki) {
    const hard = rules.filter((f) => !f.meta);
    const add = [];
    for (const k of ki) {
      if (hard.some((f) => f.start < k.end && k.start < f.end)) continue;
      if (add.some((f) => f.start < k.end && k.start < f.end)) continue;
      add.push(k);
    }
    return add.length ? rules.concat(add) : rules;
  }

  const NEVER = /(?!)/g;
  const D = (id, cat, en, de) => ({ id, cat, cls: 'hoch', re: NEVER, derived: true, name: { en, de } });
  DLX.registerPack({
    id: 'ki', kind: 'ki',
    detectors: [
      D('person', 'person', 'Name of a person (local AI)', 'Name einer Person (lokale KI)'),
      D('company', 'firma', 'Company or organisation name (local AI)', 'Firmen- oder Organisationsname (lokale KI)'),
      D('address', 'kontakt', 'Postal address (local AI)', 'Postadresse (lokale KI)'),
      D('health', 'gesundheit', 'Health information (local AI)', 'Gesundheitsangabe (lokale KI)'),
      D('special_category', 'person', 'Origin, beliefs, orientation, union or criminal record (local AI)', 'Herkunft, Weltanschauung, Orientierung, Gewerkschaft oder Strafsache (lokale KI)'),
      // Kein Fund, nur Hinweis in der Leiste (ui/dialog.js): nie schwaerzbar, nie "moeglicherweise".
      D('ki_partial', 'unscannable', 'Very long text: local AI checked only the first part, the rules checked all of it', 'Sehr langer Text: Die lokale KI hat nur den ersten Teil geprüft, die Regeln den ganzen Text'),
    ],
  });

  DLX.ki = Object.freeze({ MAX_TEXT, MAX_TOTAL, HIGH, LOW, TYPES, ALLOWED, valid, sections, combine, trim, technical, findings, merge });
})(globalThis);
