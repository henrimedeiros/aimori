// Tabellen-Erkennung, verschleierte Daten und "Sicher umformulieren".
// Design-Review Tabellen/Verschleierung/Umformen 16.10.2026, Auflagen 1-20
// (docs/sicherheit/design-review-tabellen-verschleierung-umformen.md).
// Nur synthetische Testwerte: offizielle Beispielnummern (ZAS, SWIFT), example.com.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, ENGINE_FILES } from './helpers/load.mjs';
import { zip, shared, sheet, workbook } from './helpers/xlsx.mjs';

const DLX = load(ENGINE_FILES.concat(['engine/umformen.js']), { TextDecoder, DecompressionStream });
const ALL = { packs: Object.keys(DLX.packs) };
const AHV = '756.1234.5678.97';            // Beispiel der ZAS
const IBAN = 'CH9300762011623852957';      // SWIFT-Beispiel
const ch = (...c) => String.fromCharCode(...c);
const scan = (t, cfg = ALL) => DLX.engine.scan(t, cfg);
// Ergebnisse stammen aus dem vm-Kontext (anderer Realm): fuer deepEqual in einfache Werte wandeln.
const plain = (x) => JSON.parse(JSON.stringify(x));
const ids = (t, cfg) => Array.from(scan(t, cfg).findings, (f) => f.id);
const label = (f) => (f.rows ? f.rows + ' Zeilen entfernt' : f.cat);

// --- Tabellen ------------------------------------------------------------------
const people = (n, sep = '\t') => ['Name', 'E-Mail', 'Telefon', 'Abteilung'].join(sep) + '\n' +
  Array.from({ length: n }, (_, i) => ['Anna Muster' + i, 'anna' + i + '@example.com', '+41 79 000 00 ' + String(i).padStart(2, '0'), 'Verkauf'].join(sep)).join('\n');

test('TSV aus Excel mit Name/E-Mail/Telefon: Massenleck, Schwaerzen ersetzt nur die heiklen Spalten', () => {
  const t = people(12);
  const r = scan(t);
  const meta = r.findings.find((f) => f.id === 'mass_list');
  assert.ok(meta && meta.meta, 'Kundenliste als Bereich');
  assert.equal(meta.n, 12, 'Anzahl Datenzeilen');
  assert.ok(r.findings.some((f) => f.id === 'mass_table'), 'Zellen der heiklen Spalten');
  const out = DLX.engine.redact(t, r.findings, label);
  assert.ok(!/Anna Muster/.test(out) && !/@example\.com/.test(out), 'Namen und Mails weg');
  assert.equal(out.split('Verkauf').length - 1, 12, 'harmlose Spalte bleibt');
  assert.ok(out.startsWith('Name\tE-Mail\tTelefon\tAbteilung'), 'Kopf bleibt');
});

test('Mischtypen ohne einzelne Nummern: Kunde, Geburtsdatum, Lohn (Semikolon, CSV mit Anfuehrungszeichen, Markdown)', () => {
  const rows = (sep, q = '') => ['Kunde', 'Geburtsdatum', 'Lohn'].join(sep) + '\n' +
    Array.from({ length: 10 }, (_, i) => [q + 'Muster, Anna ' + i + q, '0' + (i % 9 + 1) + '.04.1975', '7' + i + '00'].join(sep)).join('\n');
  assert.ok(ids(rows(';')).includes('mass_list'), 'Semikolon');
  assert.ok(ids(rows(',', '"')).includes('mass_list'), 'CSV, Komma im Feld in Anfuehrungszeichen');
  const md = '| Kunde | Geburtsdatum | Lohn |\n|---|:---:|---|\n' + Array.from({ length: 10 }, (_, i) => '| Kunde ' + i + ' | 0' + (i % 9 + 1) + '.04.1975 | 5000 |').join('\n');
  assert.ok(ids(md).includes('mass_list'), 'Markdown');
  // Feld mit Zeilenumbruch in Anfuehrungszeichen (Auflage 5): Zeilen bleiben ganz.
  const multi = 'Name,E-Mail,Notiz\n' + Array.from({ length: 10 }, (_, i) => 'Max Muster' + i + ',m' + i + '@example.com,"Zeile 1\nZeile 2"').join('\n');
  const tabs = DLX.tabelle.inText(multi);
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0].rows.length, 11);
});

test('Ohne Kopf: Wertformen (Mail + Telefon) reichen; Schwellen per Richtlinie', () => {
  const t = Array.from({ length: 10 }, (_, i) => 'x' + i + '@example.com;+41 79 111 22 ' + String(i).padStart(2, '0') + ';ok').join('\n');
  assert.ok(ids(t).includes('mass_list'), 'Zellen sind schon Mail-/Telefon-Funde, die Tabelle meldet die Liste');
  const few = people(6);
  assert.ok(!ids(few).includes('mass_table'), '6 Zeilen < Standard 10');
  assert.ok(ids(few, Object.assign({}, ALL, { tableMinRows: 5 })).includes('mass_table'), 'tableMinRows 5');
  assert.ok(!ids(people(12), Object.assign({}, ALL, { tableMinColumns: 4 })).includes('mass_table'), 'tableMinColumns 4: nur 3 heikle Spalten');
  assert.ok(!ids(people(12), Object.assign({}, ALL, { tableScan: false })).includes('mass_table'), 'tableScan aus');
});

test('Zeilen-Modus: Kopf + 3 Zeilen, heikle Zellen dort geschwaerzt, Rest nur mit Zahl (Auflage 7)', () => {
  const t = people(12);
  const r = scan(t, Object.assign({}, ALL, { tableRedaction: 'rows' }));
  const rest = r.findings.filter((f) => f.rows);
  assert.equal(rest.length, 1);
  assert.equal(rest[0].rows, 9);
  const out = DLX.engine.redact(t, r.findings, label);
  assert.ok(out.includes('[9 Zeilen entfernt]'));
  assert.ok(!/Anna Muster|@example\.com/.test(out), 'auch in den behaltenen Zeilen keine Namen/Mails');
  assert.equal(out.split('Verkauf').length - 1, 3, 'drei Zeilen bleiben');
});

test('Grosse Tabelle: hoechstens 2000 Zellen-Funde, darueber zusammengefasst (Auflage 8); Laufzeit im Budget', () => {
  const t = people(1500);
  const t0 = performance.now();
  const r = scan(t);
  const ms = performance.now() - t0;
  assert.ok(!r.unscannable, 'pruefbar');
  assert.ok(r.findings.filter((f) => f.id === 'mass_table').length <= 2000);
  assert.ok(r.findings.some((f) => f.rows), 'Rest als ein Fund');
  assert.ok(ms < 1000, 'Laufzeit ' + ms.toFixed(0) + ' ms');
});

test('Fehlalarme: harmlose Tabellen loesen nichts aus', () => {
  const cases = [
    ['Produkt;Preis;Lager'].concat(Array.from({ length: 30 }, (_, i) => 'Artikel ' + i + ';' + (i * 3) + '.50;' + i * 7)),
    ['Monat\tUmsatz\tKosten'].concat(Array.from({ length: 24 }, (_, i) => 'M' + (i + 1) + '\t' + (1000 + i) + '\t' + (500 + i))),
    ['Hostname,Betriebssystem,CPU,RAM'].concat(Array.from({ length: 20 }, (_, i) => 'srv-' + i + ',Linux,8,32')),
    ['Datum;Raum;Thema'].concat(Array.from({ length: 15 }, (_, i) => (i % 28 + 1) + '.10.2026;Raum ' + i + ';Planung')),
    ['| Name | Preis | Ort |', '|---|---|---|'].concat(Array.from({ length: 12 }, (_, i) => '| Restaurant ' + i + ' | 25 | Zuerich |')),
    ['Bestellung,Datum,Betrag'].concat(Array.from({ length: 20 }, (_, i) => 'B-' + (1000 + i) + ',2026-0' + (i % 9 + 1) + '-15,' + (i * 10))),
    ['Projekt\tStunden\tStatus'].concat(Array.from({ length: 12 }, (_, i) => 'Projekt ' + i + '\t' + i + '\toffen')),
  ];
  for (const rows of cases) {
    const t = rows.join('\n');
    const got = ids(t).filter((x) => x === 'mass_table' || x === 'mass_list');
    assert.deepEqual(plain(got), [], rows[0]);
  }
});

test('HTML-Tabellen: Tokenizer mit Kommentar, CDATA, script/style, > in Attributen, verstecktem Inhalt (Auflage 4)', () => {
  const row = (i) => '<tr style="display:none" data-x="a>b"><td>Anna ' + i + '</td><td>a' + i + '@example.com</td><td>+41 79 000 00 ' + String(i).padStart(2, '0') + '</td></tr>';
  const html = '<!DOCTYPE html><html><head><style>td>b{}</style><script>var s="<tr><td>x</td></tr>";</script></head><body><!-- <table> -->' +
    '<table><tr><th>Name</th><th>E-Mail</th><th>Telefon</th></tr>' + Array.from({ length: 10 }, (_, i) => row(i)).join('') + '<![CDATA[x]]></table></body></html>';
  const t = DLX.tabelle.htmlTables(html);
  assert.equal(t.length, 1);
  assert.equal(t[0].length, 11, 'Kopf + 10 versteckte Zeilen zaehlen mit');
  assert.deepEqual(Array.from(t[0][0]), ['Name', 'E-Mail', 'Telefon']);
  const v = DLX.tabelle.checkText({ name: 'liste.html' }, html, {});
  assert.deepEqual([v.leak, v.rows, v.unscannable], [true, 10, false]);
  assert.equal(DLX.tabelle.checkText({ name: 'x.html' }, '<!DOCTYPE x [<!ENTITY a "b">]><table></table>', {}).unscannable, true, 'DOCTYPE mit internem Teil');
  assert.equal(DLX.tabelle.htmlTables('<table><tr><td>&amp;&lt;&#65;&#x42;&nbsp;</td></tr></table>')[0][0][0], '&<AB&nbsp;', 'nur 5 Entities + numerisch');
});

test('JSON: Liste von Objekten = Tabelle; kaputtes oder zu tiefes JSON = nicht pruefbar (Auflage 5)', () => {
  const json = JSON.stringify({ daten: Array.from({ length: 10 }, (_, i) => ({ first_name: 'Anna' + i, email: 'a' + i + '@example.com', id: i })) });
  assert.deepEqual(DLX.tabelle.checkText({ name: 'export.json' }, json, {}).leak, true);
  assert.equal(DLX.tabelle.checkText({ name: 'x.json' }, '{"a": [1, 2', {}).unscannable, true);
  const deep = '['.repeat(200000) + ']'.repeat(200000);
  assert.equal(DLX.tabelle.checkText({ name: 'tief.json' }, deep, {}).unscannable, true, 'zu tief: vor JSON.parse linear abgewiesen');
  const ok64 = '['.repeat(64) + ']'.repeat(64), over = '['.repeat(65) + ']'.repeat(65);
  assert.equal(DLX.tabelle.checkText({ name: 'a.json' }, ok64, {}).unscannable, false, '64 Ebenen gehen');
  assert.equal(DLX.tabelle.checkText({ name: 'b.json' }, over, {}).unscannable, true, '65 Ebenen nicht');
  assert.equal(DLX.tabelle.checkText({ name: 'c.json' }, JSON.stringify({ s: '['.repeat(100) }), {}).unscannable, false, 'Klammern in Zeichenketten zaehlen nicht');
});

test('Review-Ergaenzungen: Entity-Bombe, lange Kommentare, Obergrenzen = nicht pruefbar, Zellen begrenzt, Ausnahmen (Auflagen 3-5, 8)', () => {
  const bomb = '<!DOCTYPE t [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><table><tr><td>&b;</td></tr></table>';
  assert.equal(DLX.tabelle.checkText({ name: 'b.html' }, bomb, {}).unscannable, true, 'Entity-Bombe');
  const longComment = '<table><!--' + 'x'.repeat(DLX.tabelle.LIMITS.markup + 10) + '--></table>';
  assert.equal(DLX.tabelle.checkText({ name: 'k.html' }, longComment, {}).unscannable, true, 'Kommentar ueber der Grenze');
  // Harmlose Tabelle ueber der Zeilengrenze: nicht pruefbar statt still abgeschnitten.
  const products = 'Artikel\tPreis\tLager\n' + Array.from({ length: 1200 }, (_, i) => 'Schraube M' + i + '\t' + (i % 90 + 1) + '.50\t' + i).join('\n');
  assert.deepEqual(plain(DLX.tabelle.checkText({ name: 'p.tsv' }, products, {})), { rows: 0, leak: false, unscannable: true });
  // Personen-Tabelle ueber der Grenze: Leck mit voller Zeilenzahl.
  const v = DLX.tabelle.checkText({ name: 'l.csv' }, people(1500, ','), {});
  assert.deepEqual([v.leak, v.rows, v.unscannable], [true, 1500, false]);
  // Zu viele Spalten ohne Leck: nicht pruefbar.
  const wide = Array.from({ length: 12 }, (_, r) => Array.from({ length: 60 }, (_, c) => 'w' + r + c).join('\t')).join('\n');
  assert.equal(DLX.tabelle.checkText({ name: 'w.tsv' }, wide, {}).unscannable, true, 'Spalten ueber der Grenze');
  assert.equal(DLX.tabelle.checkText({ name: 'g.txt' }, 'a'.repeat(DLX.tabelle.LIMITS.textChars + 1), {}).unscannable, true, 'Text ueber der Grenze');
  assert.equal(DLX.tabelle.checkText({ name: 'n.txt' }, null, {}).unscannable, true, 'kein Text = nicht pruefbar');
  // Riesige Zelle: Laufzeit bleibt klein.
  const t0 = performance.now();
  DLX.tabelle.checkText({ name: 'z.csv' }, 'Name,Notiz\n' + Array.from({ length: 12 }, () => 'Anna,' + 'x'.repeat(100000)).join('\n'), {});
  assert.ok(performance.now() - t0 < 1500, 'grosse Zellen begrenzt');
});

// --- XLSX ----------------------------------------------------------------------
test('XLSX: Blaetter mit Personendaten = Massenleck, Text fuer die bestehenden Pruefungen; harmlos bleibt still', async () => {
  const r = await DLX.tabelle.xlsx(workbook(12), {});
  assert.deepEqual([r.leak, r.rows, r.unscannable], [true, 12, false]);
  assert.ok(r.text.includes('anna3@example.com'), 'Zellen als Text');
  const harmless = zip([{ name: 'xl/sharedStrings.xml', data: shared(['Produkt', 'Preis', 'A', 'B']) },
    { name: 'xl/worksheets/sheet1.xml', data: sheet([[0, 1]].concat(Array.from({ length: 20 }, () => [2, 3]))) }]);
  assert.deepEqual((await DLX.tabelle.xlsx(harmless, {})).leak, false);
  const comments = await DLX.tabelle.xlsx(workbook(2, [{ name: 'xl/comments1.xml', data: '<comments><comment><text><r><t>Notiz zur Kundin</t></r></text></comment></comments>' }]), {});
  assert.ok(comments.text.includes('Notiz zur Kundin'), 'Kommentare werden als Text geprueft (Auflage 3)');
});

test('XLSX: ungewoehnliche ZIPs und Zip-Bomben sind nicht pruefbar (Auflagen 1-4)', async () => {
  const un = async (bytes, why) => assert.equal((await DLX.tabelle.xlsx(bytes, {})).unscannable, true, why);
  const ok = [{ name: 'xl/worksheets/sheet1.xml', data: sheet([[0]]) }];
  await un(zip([{ name: 'xl/worksheets/sheet1.xml', data: sheet([[0]]), flags: 1 }]), 'verschluesselt');
  await un(zip([{ name: 'xl/worksheets/sheet1.xml', data: sheet([[0]]), method: 12 }]), 'andere Kompression');
  await un(zip(ok.concat(ok)), 'doppelter Name');
  await un(zip([{ name: 'xl/worksheets/sheet1.xml', data: sheet([[0]]), localMethod: 0 }]), 'Kopf widerspricht Verzeichnis');
  await un(zip(ok, { count: 0xFFFF }), 'ZIP64-Kennzeichen');
  await un(zip([1, 2, 3, 4].map((i) => ({ name: 'xl/worksheets/sheet' + i + '.xml', data: sheet([[0]]) }))), 'mehr als 3 Blaetter');
  await un(zip(ok.concat([{ name: 'xl/charts/chart1.xml', data: '<c/>' }])), 'Diagramm = teilweise');
  await un(zip([{ name: 'xl/worksheets/sheet1.xml', data: '<!DOCTYPE x><worksheet/>' }]), 'DOCTYPE in XML');
  // 6 MB Nullen: Verhaeltnis weit ueber 100:1, Groessenangabe im ZIP gelogen (echte Bytes zaehlen).
  await un(zip([{ name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(6 * 1024 * 1024, 32), size: 100 }]), 'Zip-Bombe');
  await un(new Uint8Array([1, 2, 3]), 'kein ZIP');
  // Review-Ergaenzungen Auflage 1: Pfade, Groessen im lokalen Kopf, Zahl der Eintraege.
  await un(zip(ok.concat([{ name: '../evil.xml', data: '<x/>' }])), 'Pfad mit ..');
  await un(zip(ok.concat([{ name: '/abs.xml', data: '<x/>' }])), 'absoluter Pfad');
  await un(zip([{ name: 'xl/worksheets/sheet1.xml', data: sheet([[0]]), localSize: 7 }]), 'Groesse im lokalen Kopf widerspricht');
  await un(zip(ok.concat(Array.from({ length: 500 }, (_, i) => ({ name: 'docProps/x' + i + '.xml', data: '<x/>' })))), 'mehr als 500 Eintraege');
  await un(null, 'keine Bytes: Ausnahme = nicht pruefbar');
  const bytes = workbook(3);
  await un(bytes.slice(0, bytes.length - 40), 'abgeschnitten');
});

test('XLSX: ohne DecompressionStream nicht pruefbar (Auflage 2)', async () => {
  const D2 = load(ENGINE_FILES, { TextDecoder });
  assert.equal((await D2.tabelle.xlsx(workbook(12), {})).unscannable, true);
});

// --- Verschleierte Daten ---------------------------------------------------------
const OBF = [
  ['norm', 'AHV 7' + ch(0x200b) + '56.1234.5678.97'],
  ['norm', 'AHV ' + Array.from(AHV, (c) => (/\d/.test(c) ? ch(0xFF10 + Number(c)) : c)).join('')],
  ['norm', 'IBAN ' + IBAN.replace('C', ch(0x0421))],
  ['join', 'AHV 7 5 6 1 2 3 4 5 6 7 8 9 7'],
  ['join', 'IBAN C-H-9-3-0-0-7-6-2-0-1-1-6-2-3-8-5-2-9-5-7'],
  ['words', 'AHV sieben fuenf sechs eins zwei drei vier fuenf sechs sieben acht neun sieben'],
  ['words', 'AVS seven five six one two three four five six seven eight nine seven'],
  ['rev', 'Nummer: ' + Array.from(AHV).reverse().join('')],
  ['dec', 'code ' + Buffer.from('Meine AHV ist ' + AHV).toString('base64')],
  ['dec', 'hex ' + Buffer.from('IBAN ' + IBAN).toString('hex')],
  ['dec', 'url ' + encodeURIComponent('max.muster@example.com')],
  ['dec', 'doppelt ' + Buffer.from(Buffer.from('AHV ' + AHV).toString('base64')).toString('base64')],
];

test('Verschleierte Werte: jede Variante findet, Fund liegt im Original, Schwaerzen entfernt ihn (Auflagen 10, 11)', () => {
  for (const [kind, t] of OBF) {
    const r = scan(t);
    const f = r.findings.find((x) => x.obf === kind);
    assert.ok(f, kind + ': ' + JSON.stringify(t).slice(0, 40));
    assert.ok(f.start >= 0 && f.end <= t.length && f.end > f.start, 'Bereich im Original');
    const out = DLX.engine.redact(t, r.findings, label);
    const again = scan(out).findings.filter((x) => !x.meta);
    assert.deepEqual(plain(again.map((x) => x.id)), [], kind + ': nach dem Schwaerzen kein starker Fund mehr');
  }
});

test('Review-Ergaenzungen: feste Zeichentabelle statt NFKC, Bidi/Zero-Width, Surrogates, Fehler = nicht pruefbar (Auflagen 9-11)', () => {
  const cp = (s, base) => Array.from(s, (c) => (/\d/.test(c) ? String.fromCodePoint(base + Number(c)) : c)).join('');
  const cases = [
    cp(AHV, 0x1D7CE),                                   // mathematische Ziffern (Surrogate-Paare)
    cp(AHV, 0x1D7F6),                                   // mathematische Monospace-Ziffern
    Array.from(AHV, (c) => (c === '0' ? ch(0x24EA) : /\d/.test(c) ? ch(0x245F + Number(c)) : c)).join(''),   // eingekreist
    Array.from(AHV, (c, i) => c + (i % 3 ? ch(0x202E) : ch(0x2066))).join(''),   // Bidi-Steuerzeichen
    Array.from(AHV, (c) => c + ch(0xFEFF)).join(''),   // BOM als Zero-Width
  ];
  for (const t of cases) {
    const r = scan('AHV ' + t);
    assert.equal(r.unscannable, false);
    assert.ok(r.findings.some((f) => f.obf === 'norm' && f.cat !== 'meta'), JSON.stringify(t));
  }
  assert.equal(DLX.entschleiern.variants('ＡＢ ﬁ', () => {}).list.find((v) => v.kind === 'norm').s, 'AB fi', 'Vollbreite + Ligatur');
  // Varianten fuegen nur hinzu: Grundfunde bleiben gleich.
  const t = 'Mail anna@example.com, AHV 7' + ch(0x200b) + '56.1234.5678.97';
  const base = DLX.engine.scan(t, Object.assign({}, ALL, { deobfuscation: false })).findings.map((f) => f.id + f.start);
  const all = scan(t).findings.map((f) => f.id + f.start);
  assert.ok(base.every((x) => all.includes(x)), 'kein Grundfund verloren');
  // Jeder Fehler in den Varianten -> nicht pruefbar (kein Teilergebnis als sauber).
  const L = load(ENGINE_FILES, { TextDecoder, DecompressionStream });
  const E = L.entschleiern;
  L.entschleiern = Object.assign({}, E, { variants: () => { throw new Error('kaputt'); } });
  assert.equal(L.engine.scan('AHV 7' + ch(0x200b) + '56.1234.5678.97', { packs: Object.keys(L.packs) }).unscannable, true);
});

test('Verschleierung aus per Richtlinie deobfuscation: false', () => {
  assert.deepEqual(ids('AHV 7 5 6 1 2 3 4 5 6 7 8 9 7', Object.assign({}, ALL, { deobfuscation: false })), []);
});

test('Fehlalarme Verschleierung: normale Texte, Hashes, Bilddaten, Listen, rueckwaerts gelesene Mails', () => {
  const ok = [
    'Kontakt max.muster@localhost bitte morgen',
    'Version 1 2 3 4 5 6 7 8 9 der Liste',
    'sha256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'Siehe https://example.com/suche?q=hallo%20welt&lang=de',
    'eins zwei drei, los gehts: one two three',
    'getElementByIdAndSomethingElse und camelCaseVariableNames',
    'Ich bin so da um es zu tun wo es ja geht',
  ];
  for (const t of ok) assert.deepEqual(plain(scan(t).findings.filter((f) => f.obf).map((f) => f.id + '/' + f.obf)), [], t);
});

test('Ueber mehrere Nachrichten verteilt: nur starke Funde ueber die Grenze (Auflage 12)', () => {
  const sc = (t) => scan(t, Object.assign({}, ALL, { strongOnly: 1 }));
  const a = DLX.entschleiern.across(['Meine AHV beginnt mit 756.1234.'], '5678.97 und Rest', sc);
  assert.equal(a.length, 1);
  assert.equal(a[0].id, 'ch_ahv');
  assert.deepEqual([a[0].start, a[0].end], [0, 7], 'Bereich im aktuellen Text');
  assert.equal(DLX.entschleiern.across(['IBAN CH93 0076 2011'], '6238 5295 7 bitte', sc)[0].id, 'iban', 'Teil ohne Trennzeichen am Ende');
  assert.deepEqual(plain(DLX.entschleiern.across(['Hallo'], 'AHV ' + AHV, sc)), [], 'Fund ganz im aktuellen Text: normale Pruefung');
  assert.deepEqual(plain(DLX.entschleiern.across(['Telefon 079'], '123 45 67', sc)), [], 'reine Format-Typen zaehlen nicht');
  assert.deepEqual(plain(DLX.entschleiern.across([], 'x', sc)), []);
});

// --- ReDoS und Laufzeit (Auflagen 9, 11) ------------------------------------------
function linear(name, make) {
  const time = (n) => { const s = make(n); const t0 = performance.now(); for (let k = 0; k < 2; k++) DLX.engine.scan(s, ALL); return (performance.now() - t0) / 2; };
  time(2000);
  const a = time(20000), b = time(40000);
  assert.ok(b < Math.max(30, a * 3.5), name + ': ' + a.toFixed(1) + ' ms -> ' + b.toFixed(1) + ' ms');
}
test('ReDoS: boesartige Eingaben laufen linear', () => {
  const rep = (u, n) => u.repeat(Math.ceil(n / u.length)).slice(0, n);
  linear('getrennte Zeichen', (n) => rep('a ', n) + '!!');
  linear('Gruppen 1-2 Zeichen', (n) => rep('ab-', n) + 'abc');
  linear('Base64-Lauf', (n) => rep('Ab0+', n) + '%');
  linear('Prozent-Kodierung', (n) => rep('%4', n));
  linear('Zahlwoerter', (n) => rep('eins zwei ', n) + 'x');
  linear('Hex', (n) => rep('0f', n) + 'g');
  linear('Tabellen-Trenner', (n) => rep('"a;', n));
  linear('Markdown-Pipes', (n) => rep('|-', n));
  for (const s of [rep('<a b="', 100000), rep('<!--', 100000), rep('<x ', 100000), rep('&#', 100000)]) {
    const t0 = performance.now();
    DLX.tabelle.htmlTables(s);
    assert.ok(performance.now() - t0 < 500, 'Tokenizer linear');
  }
  for (const s of [rep('Herr Meier, ', 50000), rep('45 Jahre ', 50000), rep('Diabetes ', 50000)]) {
    const t0 = performance.now();
    DLX.umformen.rephrase(s, [], 'de');
    assert.ok(performance.now() - t0 < 1500, 'Umformen ' + (performance.now() - t0).toFixed(0) + ' ms');
  }
});

test('Laufzeit: normale Prompts bleiben pruefbar, Zeiten mit und ohne Varianten (Auflage 9)', () => {
  const prompts = [
    'Kannst du mir helfen, eine E-Mail an das Team zu formulieren? Es geht um das Quartalsmeeting am 12.11.2026 um 14:00 Uhr.',
    'Erklaere mir den Unterschied zwischen TCP und UDP mit Beispielen. Version 3.2.1 unserer App nutzt Port 8443.',
    'Schreibe eine Python-Funktion, die eine Liste sortiert: def sort_list(items): return sorted(items)',
    'Wie viel sind 1500 Franken in Euro? Und was kostet 1 kg Kaffee in Zuerich im Schnitt?',
  ];
  const long = prompts.join('\n').repeat(220).slice(0, 100000);
  const off = Object.assign({}, ALL, { deobfuscation: false });
  for (const p of prompts.concat([long])) {
    const t0 = performance.now(); const r1 = DLX.engine.scan(p, off); const t1 = performance.now(); const r2 = DLX.engine.scan(p, ALL); const t2 = performance.now();
    assert.equal(r2.unscannable, r1.unscannable, 'Varianten machen normale Prompts nicht unpruefbar (' + p.length + ' Zeichen, ' + (t1 - t0).toFixed(1) + ' / ' + (t2 - t1).toFixed(1) + ' ms)');
  }
});

// --- Sicher umformulieren -------------------------------------------------------
const reph = (t, lang = 'de') => DLX.umformen.rephrase(t, Array.from(scan(t).findings), lang).text;

test('Umformulieren: Beispiel aus der Anforderung, Frage bleibt gleich', () => {
  assert.equal(reph('Herr Meier, 45, Diabetes: welche Ernaehrung empfehlen Sie?'), 'Ein Patient mittleren Alters mit chronischer Erkrankung: welche Ernaehrung empfehlen Sie?');
  assert.equal(reph('Frau Huber, 72, Depression: was hilft?'), 'Eine Patientin im höheren Alter mit psychischer Erkrankung: was hilft?');
  assert.equal(reph('Mr Smith, 52, has asthma. What sport is fine?', 'en'), 'A patient of middle age with a chronic condition. What sport is fine?');
  assert.equal(reph('Madame Dupont, 30 ans, diabète : quel régime ?', 'fr'), 'Une patiente d\'âge moyen avec une maladie chronique : quel régime ?');
});

test('Umformulieren: Werte durch allgemeine Beschreibungen, ohne Teile des Originals (Auflage 14)', () => {
  const t = 'Bitte pruefe: Anna Muster, Mail anna.muster@example.com, IBAN ' + IBAN + ', AHV ' + AHV + '. Ist das korrekt?';
  const out = reph(t);
  for (const part of ['Anna', 'Muster', 'example.com', '9300', '756', 'A.']) assert.ok(!out.includes(part), part + ' in ' + out);
  assert.ok(out.endsWith('Ist das korrekt?'), out);
  assert.ok(out.includes('eine E-Mail-Adresse') && out.includes('eine Bankverbindung'), out);
  assert.deepEqual(plain(scan(out).findings.filter((f) => !f.meta).map((f) => f.id)), [], 'danach kein Fund mehr');
});

test('Umformulieren: Funde der lokalen KI (Person, Firma) werden mit ersetzt', () => {
  const t = 'Was schreibe ich Bruno Keller von Musterfirma wegen der Offerte?';
  const out = DLX.umformen.rephrase(t, [{ id: 'person', cat: 'person', start: 17, end: 29 }, { id: 'company', cat: 'firma', start: 34, end: 45 }], 'de').text;
  assert.equal(out, 'Was schreibe ich eine Person von eine Firma wegen der Offerte?');
});
