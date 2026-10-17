// Tabellen-Erkennung: eingefuegte oder hochgeladene
// Tabellen (TSV/CSV/Semikolon/Markdown, HTML, JSON, XLSX) mit vielen Personen-,
// Kunden- oder Mitarbeiterzeilen als Massenleck erkennen - auch ohne einzelne
// Nummern, ueber Spaltenkoepfe und Wertformen je Spalte.
// Design-Review Tabellen/Verschleierung/Umformen 16.10.2026, Auflagen 1-8
// (docs/sicherheit/design-review-tabellen-verschleierung-umformen.md).
// Nur lesen, nie ausfuehren; kein DOMParser, kein HTML-Einsetzen, kein Netz, nichts
// gespeichert. Jede Schleife hat eine feste Obergrenze.
(function (g) {
  'use strict';
  const DLX = g.DLX;

  const LIMITS = Object.freeze({
    rows: 1000, cols: 50, cells: 2000, keep: 3, quoted: 10000, tables: 20,
    zipEntries: 500, entry: 4 * 1024 * 1024, total: 8 * 1024 * 1024, ratio: 100, ratioSlack: 65536, sheets: 3, fileMs: 2000,
    jsonDepth: 6, jsonNest: 64, textChars: 2000000, cell: 10000, markup: 1000000,
  });
  const MIN_ROWS = 10, MIN_COLS = 2;
  class Unscannable extends Error {}
  const now = () => (g.performance && g.performance.now ? g.performance.now() : Date.now());

  // --- Spaltenkoepfe ----------------------------------------------------------
  // Art je Kopf; id = identifizierend (Name, Mail, Telefon, Nummern, Rolle).
  const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])';
  const words = (list) => new RegExp(B + '(?:' + list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ _-]?')).join('|') + ')' + E, 'iu');
  const KINDS = [
    ['name', true, words(['name', 'vorname', 'nachname', 'familienname', 'full name', 'first name', 'last name', 'firstname', 'lastname', 'surname', 'given name',
      'family name', 'pr\u00e9nom', 'prenom', 'nom', 'nom de famille', 'cognome', 'nome', 'apellido', 'apellidos', 'nombre', 'sobrenome', 'naam', 'voornaam',
      'achternaam', 'kontaktperson', 'ansprechpartner', 'ansprechperson', 'contact name', 'kundenname', 'customer name', 'mitarbeitername', 'employee name'])],
    ['email', true, words(['e-mail', 'email', 'mail', 'e-mail-adresse', 'emailadresse', 'mailadresse', 'email address', 'courriel', 'correo', 'correo electr\u00f3nico'])],
    ['phone', true, words(['telefon', 'tel', 'tel.', 'telefonnummer', 'phone', 'phone number', 'mobile', 'mobil', 'mobilnummer', 'handy', 'natel', 't\u00e9l\u00e9phone',
      'telephone', 'telefono', 'tel\u00e9fono', 'celular', 'cellulare', 'portable'])],
    ['idnr', true, words(['ahv', 'ahv-nr', 'ahv-nummer', 'ahvn13', 'svnr', 'sv-nummer', 'sozialversicherungsnummer', 'versicherungsnummer', 'ssn', 'social security number',
      'personalnummer', 'personal-nr', 'mitarbeiternummer', 'employee id', 'employee number', 'kundennummer', 'kunden-nr', 'customer id', 'customer number',
      'patientennummer', 'patienten-nr', 'patient id', 'versichertennummer', 'passnummer', 'passport', 'passport number', 'ausweisnummer', 'steuer-id',
      'steuernummer', 'tax id', 'iban', 'kontonummer', 'account number', 'kreditkarte', 'credit card', 'cpf', 'nss', 'codice fiscale'])],
    ['role', true, words(['kunde', 'kundin', 'kunden', 'customer', 'client', 'klient', 'mitarbeiter', 'mitarbeiterin', 'mitarbeitende', 'employee', 'angestellte',
      'patient', 'patientin', 'bewerber', 'bewerberin', 'applicant', 'mitglied', 'member', 'sch\u00fcler', 'student', 'teilnehmer', 'teilnehmerin', 'participant',
      'versicherte', 'versicherter', 'mieter', 'tenant', 'paziente', 'cliente', 'paciente', 'dipendente', 'salari\u00e9', 'empleado', 'funcion\u00e1rio'])],
    ['birth', false, words(['geburtsdatum', 'geb.', 'geboren', 'geburtstag', 'jahrgang', 'birthday', 'birth date', 'birthdate', 'date of birth', 'dob', 'alter', 'age',
      'date de naissance', 'data di nascita', 'fecha de nacimiento', 'data de nascimento'])],
    // Nur Strassen-/Wohnadressen: Ort, PLZ oder Stadt allein stehen auch in Firmen- und Produktlisten.
    ['address', false, words(['adresse', 'address', 'anschrift', 'strasse', 'stra\u00dfe', 'street', 'street address', 'wohnort', 'wohnadresse', 'privatadresse',
      'home address', 'domicile', 'adresse postale', 'indirizzo', 'direcci\u00f3n', 'endere\u00e7o'])],
    ['money', false, words(['lohn', 'gehalt', 'sal\u00e4r', 'salaer', 'salary', 'wage', 'bonus', 'einkommen', 'income', 'bruttolohn', 'nettolohn', 'salaire', 'stipendio', 'salario', 'sal\u00e1rio'])],
    ['health', false, words(['diagnose', 'diagnosis', 'krankheit', 'erkrankung', 'medikament', 'medikation', 'medication', 'befund', 'icd', 'icd-10', 'behinderung',
      'disability', 'krankheitstage', 'sick days', 'allergie', 'allergy', 'diagnostic', 'diagnosi', 'diagn\u00f3stico'])],
    ['special', false, words(['geschlecht', 'gender', 'sex', 'religion', 'konfession', 'nationalit\u00e4t', 'nationality', 'staatsangeh\u00f6rigkeit', 'zivilstand',
      'familienstand', 'marital status', 'ethnie', 'ethnicity', 'gewerkschaft', 'union', 'sexe', 'sesso', 'sexo'])],
  ];
  const ID_KINDS = new Set(KINDS.filter((k) => k[1]).map((k) => k[0]));
  function headerKind(cell) {
    const v = String(cell).trim().replace(/^["'*_#\s]+|["'*_:\s]+$/g, '');
    if (!v || v.length > 60) return null;
    for (const [kind, , re] of KINDS) if (re.test(v)) return kind;
    return null;
  }

  // --- Wertformen (Spalten ohne passenden Kopf) -------------------------------
  const RE_MAIL = /^[^\s@,;<>"]{1,64}@[^\s@,;<>"]{1,255}\.[A-Za-z]{2,24}$/;
  const RE_PHONE = /^\+?[0-9 ()./-]{9,22}$/;
  const RE_IBAN = /^[A-Z]{2}[0-9]{2}[A-Z0-9 ]{10,38}$/;
  const RE_AHV = /^756[. ]?[0-9]{4}[. ]?[0-9]{4}[. ]?[0-9]{2}$/;
  const RE_DATE = /^(?:([0-3]?[0-9])[./]([01]?[0-9])[./]((?:19|20)[0-9]{2})|((?:19|20)[0-9]{2})-([01][0-9])-([0-3][0-9]))$/;
  function valueKind(v, year) {
    if (RE_MAIL.test(v)) return 'email';
    if (RE_AHV.test(v)) return 'idnr';
    const c = v.replace(/ /g, '');
    if (RE_IBAN.test(v) && DLX.algo && DLX.algo.mod97(c.slice(4) + c.slice(0, 4))) return 'idnr';
    if (RE_PHONE.test(v)) {
      const d = v.replace(/[^0-9]/g, '');
      if (d.length >= 9 && d.length <= 15 && /^(?:\+|00|0[1-9])/.test(v.trim())) return 'phone';
    }
    const m = RE_DATE.exec(v);
    if (m) {
      const y = Number(m[3] || m[4]);
      // Geburtsdaten: mindestens 14 Jahre zurueck (Bestell-/Rechnungsdaten sind juenger).
      if (y >= 1920 && y <= year - 14) return 'birth';
    }
    return null;
  }

  // --- Spalten bewerten -------------------------------------------------------
  // rows: Array von Zeilen aus Zelltexten (erste Zeile evtl. Kopf). Ergebnis:
  // { header, data (Anzahl Datenzeilen), kinds: [art|null je Spalte], sensitive: [Spalten], leak }.
  function analyze(rows, opts, total) {
    const minRows = opts && Number.isInteger(opts.minRows) ? opts.minRows : MIN_ROWS;
    const minCols = opts && Number.isInteger(opts.minCols) ? opts.minCols : MIN_COLS;
    const cols = Math.min(LIMITS.cols, rows.reduce((m, r) => Math.max(m, r.length), 0));
    const kinds = new Array(cols).fill(null);
    let header = false;
    if (rows.length) {
      const hk = rows[0].slice(0, cols).map((x) => headerKind(String(x).slice(0, LIMITS.cell)));
      const named = hk.filter(Boolean).length;
      if (named && named * 2 >= Math.min(cols, 4)) { header = true; hk.forEach((k, i) => { kinds[i] = k; }); }
    }
    const data = rows.slice(header ? 1 : 0, (header ? 1 : 0) + LIMITS.rows);
    const year = new Date().getFullYear();
    for (let c = 0; c < cols; c++) {
      if (kinds[c]) continue;
      const count = new Map();
      let filled = 0;
      for (const r of data) {
        const v = r[c] === undefined ? '' : String(r[c]).slice(0, LIMITS.cell).trim();   // Zelle begrenzt (Auflage 5)
        if (!v) continue;
        filled++;
        const k = valueKind(v, year);
        if (k) count.set(k, (count.get(k) || 0) + 1);
      }
      for (const [k, n] of count) if (filled >= 3 && n >= 0.6 * filled) kinds[c] = k;
    }
    const sensitive = [];
    let ident = 0;
    for (let c = 0; c < cols; c++) if (kinds[c]) { sensitive.push(c); if (ID_KINDS.has(kinds[c])) ident++; }
    const n = typeof total === 'number' ? total - (header ? 1 : 0) : data.length;
    return { header, data: n, kinds, sensitive, leak: n >= minRows && sensitive.length >= minCols && ident >= 1 };
  }

  // --- Getrennte Werte im Text (mit Positionen) --------------------------------
  // Linearer Parser je Trennzeichen; Felder in Anfuehrungszeichen duerfen Zeilenumbrueche
  // enthalten (Auflage 5), ohne schliessendes Zeichen innerhalb LIMITS.quoted gilt es als Text.
  // Zeile: { start, end, cells: [{ s, e }] } (Positionen im Text, ohne Anfuehrungszeichen).
  function parse(text, sep, tick) {
    const rows = [];
    let i = 0;
    const n = text.length;
    let row = { start: 0, end: 0, cells: [] };
    let steps = 0;
    while (i <= n) {
      if ((++steps & 4095) === 0 && tick) tick();
      // Feld beginnt bei i
      let s = i, e, next;
      if (text[i] === '"') {
        let j = i + 1, close = -1;
        while (j < n && j - i <= LIMITS.quoted) {
          const q = text.indexOf('"', j);
          if (q === -1 || q - i > LIMITS.quoted) break;
          if (text[q + 1] === '"') { j = q + 2; continue; }
          close = q;
          break;
        }
        if (close !== -1 && (close + 1 === n || text[close + 1] === sep || text[close + 1] === '\n' || text[close + 1] === '\r')) {
          s = i + 1; e = close; next = close + 1;
        }
      }
      if (next === undefined) {
        let j = i;
        while (j < n && text[j] !== sep && text[j] !== '\n') j++;
        e = j; next = j;
        if (e > s && text[e - 1] === '\r') e--;
      }
      row.cells.push({ s, e });
      if (next >= n) { row.end = e; rows.push(row); break; }
      if (text[next] === sep) { i = next + 1; continue; }
      // Zeilenende (\n, ggf. nach \r)
      let k = next;
      if (text[k] === '\r') k++;
      row.end = e;
      rows.push(row);
      if (rows.length > 200000) break;
      i = k + 1;
      row = { start: i, end: i, cells: [] };
      if (i > n) break;
    }
    return rows;
  }
  // Markdown: Rand-Pipes entfernen, Trennzeile (|---|:--:|) ueberspringen.
  const MD_RULE = /^[\s|:\-]+$/;
  function tidyPipe(text, row) {
    const c = row.cells.slice();
    const blank = (x) => !text.slice(x.s, x.e).trim();
    if (c.length > 1 && blank(c[0])) c.shift();
    if (c.length > 1 && blank(c[c.length - 1])) c.pop();
    return c;
  }
  // Bloecke aufeinanderfolgender Zeilen mit gleicher Spaltenzahl >= 2.
  function blocks(text, sep, tick) {
    const rows = parse(text, sep, tick);
    const out = [];
    let cur = null;
    for (const r of rows) {
      const line = text.slice(r.start, r.end);
      if (sep === '|' && MD_RULE.test(line) && line.indexOf('-') !== -1) continue;
      const cells = sep === '|' ? tidyPipe(text, r) : r.cells;
      const width = line.trim() ? cells.length : 0;
      if (cur && width === cur.width) { cur.rows.push(Object.assign({}, r, { cells })); continue; }
      if (cur && cur.rows.length >= 2) out.push(cur);
      cur = width >= 2 ? { sep, width, rows: [Object.assign({}, r, { cells })] } : null;
    }
    if (cur && cur.rows.length >= 2) out.push(cur);
    return out;
  }
  // Alle Tabellen im Text; ueberlappende Kandidaten verschiedener Trennzeichen: groessere Flaeche gewinnt.
  function inText(text, tick) {
    if (typeof text !== 'string' || !text || text.length > LIMITS.textChars) return [];
    const cand = [];
    for (const sep of ['\t', '|', ';', ',']) {
      if (text.indexOf(sep) === -1) continue;
      for (const b of blocks(text, sep, tick)) cand.push(b);
      if (tick) tick();
    }
    cand.sort((a, b) => b.rows.length * b.width - a.rows.length * a.width);
    const kept = [];
    for (const c of cand) {
      const s = c.rows[0].start, e = c.rows[c.rows.length - 1].end;
      if (kept.every((k) => e <= k.start || s >= k.end)) kept.push(Object.assign(c, { start: s, end: e }));
      if (kept.length >= LIMITS.tables) break;
    }
    return kept.sort((a, b) => a.start - b.start);
  }

  // Funde fuer eingefuegten Text: { rows, start, end, cells: [{ start, end, rows? }] }.
  // Spalten-Modus: je Zelle der heiklen Spalten ein Fund; Zeilen-Modus (und ab LIMITS.cells
  // Zellen, Auflage 8): Kopf + LIMITS.keep Zeilen behalten (heikle Zellen geschwaerzt, Auflage 7),
  // Rest ein Fund mit der Zahl der entfernten Zeilen.
  function findings(text, opts, tick) {
    const res = { rows: 0, start: Infinity, end: -1, cells: [] };
    for (const t of inText(text, tick)) {
      const strs = t.rows.slice(0, LIMITS.rows + 1).map((r) => r.cells.map((c) => text.slice(c.s, c.e)));
      const a = analyze(strs, opts, t.rows.length);
      if (!a.leak) continue;
      res.rows = Math.max(res.rows, a.data);
      res.start = Math.min(res.start, t.start);
      res.end = Math.max(res.end, t.end);
      const data = t.rows.slice(a.header ? 1 : 0);
      const cellsIn = (list) => {
        const out = [];
        for (const r of list) for (const c of a.sensitive) { const x = r.cells[c]; if (x && text.slice(x.s, x.e).trim()) out.push({ start: x.s, end: x.e }); }
        return out;
      };
      const rowsMode = (opts && opts.mode === 'rows') || data.length * a.sensitive.length > LIMITS.cells;
      if (!rowsMode) { res.cells.push(...cellsIn(data)); continue; }
      res.cells.push(...cellsIn(data.slice(0, LIMITS.keep)));
      if (data.length > LIMITS.keep) {
        const rest = data.slice(LIMITS.keep);
        res.cells.push({ start: rest[0].start, end: rest[rest.length - 1].end, rows: rest.length });
      }
      if (res.cells.length > LIMITS.cells + LIMITS.tables * (LIMITS.keep * LIMITS.cols + 1)) break;
    }
    return res;
  }

  // --- XML/HTML-Tokenizer (Auflage 4) ------------------------------------------
  // Linear; Kommentare, CDATA, <?..?>, script/style-Inhalt; Anfuehrungszeichen in
  // Attributen. Nur die 5 Standard-Entities und numerische Zeichenreferenzen.
  // DOCTYPE mit internem Teil ([...]) bzw. in XML jedes DOCTYPE -> nicht pruefbar.
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function decodeEnt(s) {
    if (s.indexOf('&') === -1) return s;
    return s.replace(/&(?:#([0-9]{1,7})|#x([0-9A-Fa-f]{1,6})|(amp|lt|gt|quot|apos));/g, (m, d, h, n) => {
      if (n) return ENT[n];
      const cp = d ? Number(d) : parseInt(h, 16);
      return cp > 0 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF) ? String.fromCodePoint(cp) : '';
    });
  }
  function tokenize(src, xml, on, tick) {
    const n = src.length;
    let i = 0, steps = 0;
    while (i < n) {
      if ((++steps & 1023) === 0 && tick) tick();
      const lt = src.indexOf('<', i);
      if (lt === -1) { on('text', null, null, decodeEnt(src.slice(i))); break; }
      if (lt > i) on('text', null, null, decodeEnt(src.slice(i, lt)));
      // Kommentare und CDATA laenger als LIMITS.markup -> nicht pruefbar (Auflage 4).
      if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); if ((e === -1 ? n : e) - lt > LIMITS.markup) throw new Unscannable('markup'); i = e === -1 ? n : e + 3; continue; }
      if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt + 9); if ((e === -1 ? n : e) - lt > LIMITS.markup) throw new Unscannable('markup'); on('text', null, null, src.slice(lt + 9, e === -1 ? n : e)); i = e === -1 ? n : e + 3; continue; }
      if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt + 2); i = e === -1 ? n : e + 2; continue; }
      if (src[lt + 1] === '!') {
        const e = src.indexOf('>', lt + 2);
        const decl = src.slice(lt, e === -1 ? n : e + 1);
        if (/^<!doctype/i.test(decl) && (xml || decl.indexOf('[') !== -1)) throw new Unscannable('doctype');
        i = e === -1 ? n : e + 1;
        continue;
      }
      // Tag: Name, Attribute mit Anfuehrungszeichen, Ende '>'.
      let j = lt + 1;
      const close = src[j] === '/';
      if (close) j++;
      const ns = j;
      while (j < n && /[A-Za-z0-9:_.-]/.test(src[j])) j++;
      const name = src.slice(ns, j).toLowerCase();
      if (!name) { on('text', null, null, '<'); i = lt + 1; continue; }
      const attrs = {};
      let selfClose = false;
      while (j < n && src[j] !== '>') {
        if ((++steps & 1023) === 0 && tick) tick();
        const c = src[j];
        if (c === '/' && src[j + 1] === '>') { selfClose = true; j++; continue; }
        if (/\s/.test(c)) { j++; continue; }
        const as = j;
        while (j < n && !/[\s=>\/]/.test(src[j])) j++;
        const an = src.slice(as, j).toLowerCase();
        if (src[j] === '=') {
          j++;
          const q = src[j];
          if (q === '"' || q === "'") { const e = src.indexOf(q, j + 1); const v = src.slice(j + 1, e === -1 ? n : e); if (an) attrs[an] = decodeEnt(v); j = e === -1 ? n : e + 1; }
          else { const vs = j; while (j < n && !/[\s>]/.test(src[j])) j++; if (an) attrs[an] = decodeEnt(src.slice(vs, j)); }
        } else if (an) attrs[an] = '';
        if (j === as) j++;
      }
      i = j + 1;
      on(close ? 'close' : 'open', name, attrs, null);
      if (!close && selfClose) on('close', name, attrs, null);
      // script/style: Inhalt als Text ueberspringen bis zum schliessenden Tag (kein Markup darin).
      if (!xml && !close && !selfClose && (name === 'script' || name === 'style')) {
        const re = new RegExp('</' + name + '\\s*>', 'ig');
        re.lastIndex = i;
        const m = re.exec(src);
        i = m ? m.index : n;
      }
    }
  }

  // HTML-Tabellen -> Zeilen aus Zelltexten (versteckter Inhalt zaehlt mit).
  function htmlTables(html, tick) {
    const tables = [], stack = [];
    let cell = null;
    tokenize(String(html), false, (type, name, attrs, text) => {
      const t = stack[stack.length - 1];
      if (type === 'text') { if (cell !== null) cell.push(text); return; }
      if (name === 'table') {
        if (type === 'open') { if (stack.length < 32) stack.push({ rows: [], row: null }); }
        else if (stack.length) { const x = stack.pop(); if (x.row) x.rows.push(x.row); tables.push(x.rows); }
        cell = null;
        return;
      }
      if (!t) return;
      if (name === 'tr') {
        if (t.row) t.rows.push(t.row);
        t.row = type === 'open' ? [] : null;
        cell = null;
      } else if (name === 'td' || name === 'th') {
        if (type === 'open') { if (!t.row) t.row = []; if (t.rows.length <= LIMITS.rows + 1 || !t.row.length) { cell = []; t.row.push(cell); } else cell = null; }
        else cell = null;
      } else if (name === 'br' && cell !== null) cell.push(' ');
    }, tick);
    while (stack.length) { const x = stack.pop(); if (x.row) x.rows.push(x.row); tables.push(x.rows); }
    return tables.map((rows) => rows.map((r) => r.map((c) => (Array.isArray(c) ? c.join('') : String(c)).replace(/\s+/g, ' ').trim())));
  }

  // Verschachtelung linear zaehlen (Zeichenketten uebersprungen); ueber LIMITS.jsonNest -> nicht
  // pruefbar, bevor JSON.parse einen Stapelueberlauf riskiert (Auflage 5).
  function nesting(text) {
    let d = 0, str = false;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (str) { if (c === 92) i++; else if (c === 34) str = false; continue; }
      if (c === 34) str = true;
      else if (c === 91 || c === 123) { if (++d > LIMITS.jsonNest) throw new Unscannable('json_depth'); }
      else if (c === 93 || c === 125) d--;
    }
  }
  // JSON: Listen von Objekten (Schluessel = Kopf) bis zur Tiefe LIMITS.jsonDepth.
  function jsonTables(text) {
    let v;
    nesting(text);   // Tiefe linear vor JSON.parse (Auflage 5)
    try { v = JSON.parse(text); } catch (e) { throw new Unscannable('json'); }   // auch Stapelueberlauf (Auflage 5)
    const out = [];
    let visited = 0;
    const walk = (x, d) => {
      if (d > LIMITS.jsonDepth || out.length >= LIMITS.tables || ++visited > 100000) return;
      if (Array.isArray(x)) {
        const objs = x.filter((o) => o && typeof o === 'object' && !Array.isArray(o));
        if (objs.length >= 2) {
          const keys = [];
          for (const o of objs.slice(0, 50)) for (const k of Object.keys(o)) if (keys.indexOf(k) === -1 && keys.length < LIMITS.cols) keys.push(k);
          const rows = [keys].concat(objs.slice(0, LIMITS.rows).map((o) => keys.map((k) => (o[k] === null || typeof o[k] === 'object' ? '' : String(o[k])))));
          out.push({ rows, total: objs.length + 1 });
        }
        for (const y of x.slice(0, 50)) if (y && typeof y === 'object') walk(y, d + 1);
      } else if (x && typeof x === 'object') {
        for (const k of Object.keys(x).slice(0, 200)) if (x[k] && typeof x[k] === 'object') walk(x[k], d + 1);
      }
    };
    walk(v, 0);
    return out;
  }

  // --- Datei-Upload (ohne XLSX): { rows, leak, unscannable } ---------------------
  const HTML_FILE = (f) => /\.html?$/i.test((f && f.name) || '') || /html/i.test((f && f.type) || '');
  const JSON_FILE = (f) => /\.json$/i.test((f && f.name) || '') || /json/i.test((f && f.type) || '');
  function checkText(file, text, opts) {
    const deadline = now() + LIMITS.fileMs;
    const tick = () => { if (now() > deadline) throw new Unscannable('timeout'); };
    try {
      if (typeof text !== 'string' || text.length > LIMITS.textChars) throw new Unscannable('size');
      const tables = HTML_FILE(file) ? htmlTables(text, tick).map((rows) => ({ rows, total: rows.length }))
        : JSON_FILE(file) ? jsonTables(text)
          : inText(text, tick).map((t) => ({ rows: t.rows.slice(0, LIMITS.rows + 1).map((r) => r.cells.map((c) => text.slice(c.s, c.e))), total: t.rows.length }));
      return verdict(tables, opts);
    } catch (e) {
      // Jede Ausnahme = nicht pruefbar, nie still durchlassen (Auflage 3).
      return { rows: 0, leak: false, unscannable: true };
    }
  }
  // Ueber einer Obergrenze (Zeilen, Spalten, Text) ohne Leck -> nicht pruefbar statt still
  // abgeschnitten und "sauber" (Auflage 8).
  function verdict(tables, opts, cut) {
    let rows = 0, leak = false, over = !!cut;
    for (const t of tables) {
      if (t.over || t.total > t.rows.length || t.rows.length > LIMITS.rows + 1 || t.rows.some((r) => r.length > LIMITS.cols)) over = true;
      const a = analyze(t.rows, opts, t.total);
      if (a.leak) { leak = true; rows = Math.max(rows, a.data); }
    }
    return { rows, leak, unscannable: !leak && over };
  }

  // --- XLSX (Auflagen 1-3) ------------------------------------------------------
  const u16 = (b, p) => b[p] | (b[p + 1] << 8);
  const u32 = (b, p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
  const latin = (b) => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };
  // Zentralverzeichnis lesen; jede Abweichung -> Unscannable.
  function zipEntries(b) {
    const min = Math.max(0, b.length - 22 - 65535);
    let eocd = -1;
    for (let p = b.length - 22; p >= min; p--) if (u32(b, p) === 0x06054b50) { eocd = p; break; }
    if (eocd < 0) throw new Unscannable('zip');
    const count = u16(b, eocd + 10), cdSize = u32(b, eocd + 12), cdOff = u32(b, eocd + 16);
    if (u16(b, eocd + 4) !== 0 || u16(b, eocd + 6) !== 0 || count === 0xFFFF || cdSize === 0xFFFFFFFF || cdOff === 0xFFFFFFFF) throw new Unscannable('zip64');
    if (count > LIMITS.zipEntries || cdOff + cdSize > eocd) throw new Unscannable('zip');
    const out = new Map();
    let p = cdOff;
    for (let k = 0; k < count; k++) {
      if (p + 46 > eocd || u32(b, p) !== 0x02014b50) throw new Unscannable('zip');
      const flags = u16(b, p + 8), method = u16(b, p + 10), comp = u32(b, p + 20), size = u32(b, p + 24);
      const nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), off = u32(b, p + 42);
      if (comp === 0xFFFFFFFF || size === 0xFFFFFFFF || off === 0xFFFFFFFF) throw new Unscannable('zip64');
      if (flags & 0x41) throw new Unscannable('encrypted');
      if (method !== 0 && method !== 8) throw new Unscannable('method');
      const name = latin(b.subarray(p + 46, p + 46 + nl));
      if (out.has(name)) throw new Unscannable('duplicate');
      if (/^[\/\\]/.test(name) || /(?:^|[\/\\])\.\.(?:[\/\\]|$)/.test(name)) throw new Unscannable('path');
      // Eintragskopf muss zum Verzeichnis passen und innerhalb der Datei vor dem Verzeichnis liegen.
      if (off + 30 > cdOff || u32(b, off) !== 0x04034b50) throw new Unscannable('zip');
      const lnl = u16(b, off + 26), lxl = u16(b, off + 28);
      // Ohne Datendeskriptor (Bit 3) muessen die Groessen im lokalen Kopf zum Verzeichnis passen.
      if (!(flags & 8) && (u32(b, off + 18) !== comp || u32(b, off + 22) !== size)) throw new Unscannable('mismatch');
      if (u16(b, off + 8) !== method || lnl !== nl || latin(b.subarray(off + 30, off + 30 + lnl)) !== name) throw new Unscannable('mismatch');
      const start = off + 30 + lnl + lxl;
      if (start + comp > cdOff) throw new Unscannable('bounds');
      out.set(name, { method, comp, start });
      p += 46 + nl + xl + cl;
    }
    return out;
  }
  // Entpacken mit Zaehlung der echten Bytes (Groessenangaben im ZIP sind nur Hinweise).
  async function inflate(b, e, budget, deadline) {
    const data = b.subarray(e.start, e.start + e.comp);
    const max = Math.min(LIMITS.entry, budget.left, LIMITS.ratio * e.comp + LIMITS.ratioSlack);
    if (e.method === 0) {
      if (data.length > max) throw new Unscannable('size');
      budget.left -= data.length;
      return data;
    }
    if (typeof g.DecompressionStream !== 'function') throw new Unscannable('no_inflate');
    const ds = new g.DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter();
    w.write(data).catch(() => {});
    w.close().catch(() => {});
    const r = ds.readable.getReader();
    const chunks = [];
    let n = 0;
    try {
      for (let k = 0; k < 100000; k++) {
        const { done, value } = await r.read();
        if (done) break;
        n += value.length;
        if (n > max) throw new Unscannable('size');
        if (now() > deadline) throw new Unscannable('timeout');
        chunks.push(value);
      }
    } catch (err) {
      r.cancel().catch(() => {});
      if (err instanceof Unscannable) throw err;
      throw new Unscannable('inflate');
    }
    budget.left -= n;
    const out = new Uint8Array(n);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
  const utf8 = (bytes) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { throw new Unscannable('utf8'); } };
  const colIndex = (ref) => {
    const m = /^([A-Z]{1,3})/.exec(ref || '');
    if (!m) return -1;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };
  function sharedStrings(xml, tick) {
    const out = [];
    let cur = null, inT = false;
    tokenize(xml, true, (type, name, attrs, text) => {
      if (type === 'text') { if (cur !== null && inT) cur.push(text); return; }
      if (name === 'si') { if (type === 'open') cur = []; else { if (cur) out.push(cur.join('')); cur = null; } }
      else if (name === 't') inT = type === 'open';
      else if (name === 'rph') inT = false;
    }, tick);
    return out;
  }
  function sheetRows(xml, shared, tick) {
    const rows = [];
    let row = null, col = -1, type = null, val = null, inV = false, total = 0, wide = false;
    tokenize(xml, true, (kind, name, attrs, text) => {
      if (kind === 'text') { if (inV && val !== null) val.push(text); return; }
      if (name === 'row') {
        if (kind === 'open') { row = []; total++; }
        else { if (row && rows.length <= LIMITS.rows && row.some((x) => x)) rows.push(row); row = null; }
      } else if (name === 'c' && row) {
        if (kind === 'open') { col = colIndex(attrs.r); if (col < 0) col = row.length; type = attrs.t || null; val = []; }
        else {
          if (col >= LIMITS.cols) wide = true;
          if (col >= 0 && col < LIMITS.cols && val) {
            let v = val.join('');
            if (type === 's') v = shared[Number(v)] !== undefined ? shared[Number(v)] : '';
            while (row.length < col) row.push('');
            row[col] = v;
          }
          val = null;
        }
      } else if (name === 'v' || name === 't') inV = kind === 'open';
    }, tick);
    return { rows, total: Math.max(total, rows.length), over: wide };
  }
  const TEXT_PARTS = /^xl\/(?:comments[0-9]*\.xml|threadedComments\/[^/]+\.xml|tables\/[^/]+\.xml)$/i;
  const UNREAD_PARTS = /^xl\/(?:pivotCache\/pivotCacheRecords|externalLinks\/|charts\/|richData\/|embeddings\/)/i;
  // Ergebnis: { rows, leak, unscannable, text } - text (Zellen + Kommentare) fuer die
  // bestehenden Text-Pruefungen (versteckte Anweisungen, Fingerabdruecke).
  async function xlsx(bytes, opts) {
    const deadline = now() + LIMITS.fileMs;
    const tick = () => { if (now() > deadline) throw new Unscannable('timeout'); };
    try {
      const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const entries = zipEntries(b);
      const names = Array.from(entries.keys());
      const sheets = names.filter((n) => /^xl\/worksheets\/sheet[0-9]+\.xml$/i.test(n));
      if (!sheets.length || sheets.length > LIMITS.sheets || names.some((n) => UNREAD_PARTS.test(n))) throw new Unscannable('partial');
      const budget = { left: LIMITS.total };
      const read = async (n) => utf8(await inflate(b, entries.get(n), budget, deadline));
      const shared = entries.has('xl/sharedStrings.xml') ? sharedStrings(await read('xl/sharedStrings.xml'), tick) : [];
      const tables = [];
      const text = [];
      let chars = 0;
      const addText = (s) => { if (chars < LIMITS.textChars) { text.push(s); chars += s.length + 1; } };
      for (const s of sheets) {
        const t = sheetRows(await read(s), shared, tick);
        tables.push(t);
        for (const r of t.rows) addText(r.join('\t'));
        tick();
      }
      for (const n of names.filter((x) => TEXT_PARTS.test(x))) {
        const parts = [];
        tokenize(await read(n), true, (type, name, attrs, tx) => {
          if (type === 'text' && tx.trim()) parts.push(tx);
          else if (type === 'open' && attrs && attrs.name) parts.push(attrs.name);
        }, tick);
        addText(parts.join(' '));
      }
      return Object.assign(verdict(tables, opts, chars > LIMITS.textChars), { text: text.join('\n').slice(0, LIMITS.textChars) });
    } catch (e) {
      // Jede Ausnahme = nicht pruefbar, nie still durchlassen (Auflage 3).
      return { rows: 0, leak: false, unscannable: true, text: '' };
    }
  }
  const XLSX_FILE = (f) => !!f && (/\.xlsx$/i.test(f.name || '') || f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  DLX.tabelle = Object.freeze({ LIMITS, MIN_ROWS, MIN_COLS, headerKind, valueKind, analyze, parse, inText, findings, tokenize, htmlTables, jsonTables, checkText, zipEntries, xlsx, XLSX_FILE, Unscannable });
})(globalThis);
