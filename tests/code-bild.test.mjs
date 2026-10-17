// Code und Geheimnisse, Dokumentart in Bildern (Design-Review Code und Bilder 16.10.2026,
// docs/sicherheit/design-review-code-bilder.md). Nur synthetische Werte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, ENGINE_FILES, EXT } from './helpers/load.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'engine/bild.js', 'common/policy.js'], { URL });
const CFG = { packs: Object.keys(DLX.packs), rules: {} };
const scan = (text, cfg = CFG) => Array.from(DLX.engine.scan(text, cfg).findings, (f) => ({ id: f.id, sure: f.sure, v: text.slice(f.start, f.end) }));
const ids = (text) => scan(text).map((f) => f.id);
const code = (line) => line + '\nconst n = 1;';
const src = (p) => fs.readFileSync(path.join(EXT, p), 'utf8').replace(/\r\n/g, '\n');

test('isCode: Code-Arten ja, Fliesstext und Briefe nein', () => {
  const C = DLX.code;
  for (const t of ['const a = 1;\nlet b = 2;', 'def f(x):\n    return x', 'server:\n  host: db01\n  port: 5432', '{\n  "key": "v",\n  "n": 1\n}',
    'DB_HOST=db01\nDB_PASSWORD=abc', '<div class="a">\n</div>', 'curl -H "X: y" http://a.b/', 'SELECT * FROM t;']) assert.ok(C.isCode(t), t);
  for (const t of ['Hallo Anna,\nwie geht es dir?\nGruss Tom', 'Bitte prüfe den Vertrag bis Freitag.', '', 'Name: Anna\nOrt: Bern\nBemerkung: keine weiteren Angaben vorhanden']) assert.ok(!C.isCode(t), t);
  // Nur die ersten 200 Zeilen bzw. 20k Zeichen zaehlen.
  assert.ok(!C.isCode('Text ohne Code.\n'.repeat(300) + 'const a = 1;\n'.repeat(300)));
});

test('linesOf: hoechstens 5 Zeilennummern je Typ, keine Werte', () => {
  const t = 'a\nb\nc\nd';
  const f = [0, 2, 4, 6, 6, 4].map((s, i) => ({ id: i < 5 ? 'x' : 'y', start: s, end: s + 1 }));
  const m = DLX.code.linesOf(t, f);
  assert.deepEqual(Array.from(m.get('x')), [1, 2, 3, 4]);
  assert.deepEqual(Array.from(m.get('y')), [3]);
  const many = Array.from({ length: 9 }, (_, i) => ({ id: 'x', start: i * 2, end: i * 2 + 1 }));
  assert.equal(DLX.code.linesOf('a\n'.repeat(9), many).get('x').length, 5);
});

test('Auflage 2: internal_host je Endung und Netz, Gegenproben', () => {
  for (const s of ['local', 'lan', 'internal', 'intranet', 'intra', 'corp', 'home.arpa', 'localdomain']) {
    assert.ok(ids(code(`const h = "srv1.${s}";`)).includes('internal_host'), s);
    assert.ok(!ids(code(`const h = "srv1.${s}.example.com";`)).includes('internal_host'), s + ' als Teil einer oeffentlichen Domain');
  }
  for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.254', '192.168.1.10']) {
    assert.ok(ids(code(`const u = "http://${ip}:8080/x";`)).includes('internal_host'), ip);
    assert.ok(ids(code(`host = "${ip}"`)).includes('internal_host'), ip + ' als host-Wert');
    assert.ok(ids(code(`ssh admin@${ip}`)).includes('internal_host'), ip + ' nach @');
  }
  for (const t of ['http://172.15.0.1/', 'http://172.32.0.1/', 'http://110.1.2.3/', 'http://1192.168.1.1/', 'http://192.0.2.10/', 'http://example.com/',
    'http://srv.localhost/', 'const v = "10.0.1";', 'version = 10.1.2.3', 'http://10.1.2/', 'http://10.1.2.3.4/']) {
    assert.ok(!ids(code(`const u = "${t}";`)).includes('internal_host') || false, t);
  }
  // Ohne Code (Fliesstext) laufen die Code-Detektoren nicht.
  assert.ok(!ids('Der Server db01.corp ist heute langsam.').includes('internal_host'));
});

test('Auflage 3: entropy_secret nur unsicher, Ausschluesse', () => {
  const hit = scan(code('const k = "q8Zt3LmX9vR2pK7wN4cY6bH1sJ5dF0gA";')).find((f) => f.id === 'entropy_secret');
  assert.ok(hit, 'Treffer');
  assert.equal(hit.sure, false, 'immer unsicher');
  assert.ok(ids(code('const h = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b";')).includes('entropy_secret'), 'hex ab 32 Zeichen');
  for (const v of ['550e8400-e29b-41d4-a716-446655440000', 'sha512-q8Zt3LmX9vR2pK7wN4cY6bH1sJ5dF0gA', 'sha256-q8Zt3LmX9vR2pK7wN4cY6bH1sJ5dF0gA',
    'xxxxxxxxxxxxxxxxxxxxxxxx', '<YOUR_API_KEY_GOES_HERE_1>', 'changeme', 'YOUR_KEY_HERE_0123456789', 'src/components/button2/index9.js',
    'com.example.app2.MainActivity9', 'someVeryLongFunctionName', 'aaaaaaaaaaaaaaaaaaaaaaaa11', 'XXXX-q8Zt3LmX9vR2pK7wN4cY']) {
    assert.ok(!ids(code(`const k = "${v}";`)).includes('entropy_secret'), v);
  }
  assert.ok(!ids(code('<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk">')).includes('entropy_secret'), 'Bilddaten');
  // Mit Standard-Richtlinie (uncertainFindings hint) filtert das Content Script unsichere Funde heraus.
  assert.equal(DLX.policy.defaults().uncertainFindings, 'hint');
});

test('Auflage 4: bisherige Geheimnis-Funde unabhaengig von isCode', () => {
  const t = 'Mein Schluessel AKIA' + 'QWERTYUIOPASDFGH ist neu.';
  const before = ids(t);
  assert.ok(before.includes('aws_akid'));
  const orig = DLX.code;
  try {
    DLX.code = Object.freeze({ MAX: orig.MAX, isCode: () => false, linesOf: orig.linesOf });
    assert.deepEqual(ids(t), before);
    assert.deepEqual(ids(code('password = "Sommer2026!x"')).filter((i) => i !== 'internal_host' && i !== 'entropy_secret'), ['cfg_password']);
  } finally { DLX.code = orig; }
});

test('Auflage 1: boesartige Eingaben je Code-Detektor < 50 ms', () => {
  const inputs = ['a', '=', '.', '{', '10.10.10.', 'a.', '="', 'http://10.', 'host=10.'].map((u) => u.repeat(Math.ceil(20000 / u.length)).slice(0, 20000));
  inputs.push(('const x = "' + 'Ab1'.repeat(100) + '";\n').repeat(60));
  const dets = DLX.engine.allDetectors().filter((d) => d.code);
  assert.deepEqual(JSON.parse(JSON.stringify(dets.map((d) => d.id).sort())), ['entropy_secret', 'internal_host']);
  for (const d of dets) {
    for (const t of inputs) {
      const t0 = performance.now();
      d.re.lastIndex = 0;
      while (d.re.exec(t.slice(0, DLX.code.MAX)) !== null) { /* nur Laufzeit */ }
      const ms = performance.now() - t0;
      assert.ok(ms < 50, `${d.id}: ${ms.toFixed(1)} ms bei ${JSON.stringify(t.slice(0, 12))}`);
    }
  }
  const t0 = performance.now();
  DLX.code.isCode(inputs[4]);
  assert.ok(performance.now() - t0 < 50);
});

test('docType: Ausweis per gueltiger MRZ oder Titel + Merkmal, schwache MRZ nur ein Merkmal', () => {
  const B = DLX.bild;
  const td3 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10';
  assert.deepEqual(Array.from(B.docType(td3, scan(td3))), ['doc_identity']);
  const bad = td3.replace(/10$/, '11');
  assert.ok(!scan(bad).some((f) => f.id === 'mrz_td3'));
  assert.deepEqual(Array.from(B.docType(bad, scan(bad))), [], 'ungueltige MRZ allein reicht nicht');
  assert.deepEqual(Array.from(B.docType(bad + '\nGeburtsdatum 01.01.1990\nNationalität UTO', [])), ['doc_identity'], 'schwache MRZ + 2 Merkmale');
  assert.deepEqual(Array.from(B.docType('MUSTER SPECIMEN Identitätskarte\nName Muster Vorname Anna', [])), ['doc_identity']);
  assert.deepEqual(Array.from(B.docType('PASSPORT SPECIMEN Date of birth 01 JAN 1990', [])), ['doc_identity']);
  assert.deepEqual(Array.from(B.docType('Identitätskarte verloren? Melden Sie sich beim Schalter.', [])), []);
  assert.deepEqual(Array.from(B.docType('Bitte die Ausweisnummer nicht in Tickets schreiben.', [])), []);
});

test('docType: Rechnung nur mit Rechnungswort und 2 Merkmalen', () => {
  const B = DLX.bild;
  assert.deepEqual(Array.from(B.docType('Rechnung Nr. 4711\nTotal CHF 1\'250.00\nMwSt 8.1 %\nZahlbar bis 30.11.2026', [])), ['doc_invoice']);
  assert.deepEqual(Array.from(B.docType('INVOICE\nInvoice number 12\nAmount due EUR 99.00', [])), ['doc_invoice']);
  assert.deepEqual(Array.from(B.docType('Facture\nMontant total', [{ id: 'iban' }])), ['doc_invoice'], 'IBAN-Fund zaehlt als Merkmal');
  assert.deepEqual(Array.from(B.docType('Die Rechnung kommt morgen.', [])), []);
  assert.deepEqual(Array.from(B.docType('Total 3 Tickets offen, Betrag unbekannt', [])), []);
  assert.deepEqual(Array.from(B.docType('', [])), []);
});

test('Auflage 11: doc_identity standardmaessig block, Richtlinie kann beide Typen setzen', () => {
  assert.equal(DLX.engine.actionFor('doc_identity', CFG), 'block');
  assert.equal(DLX.engine.actionFor('doc_invoice', CFG), 'warn');
  const v = DLX.policy.validate({ rules: { doc_identity: 'block', doc_invoice: 'block', internal_host: 'off', entropy_secret: 'warn' } });
  assert.deepEqual(JSON.parse(JSON.stringify(v.value.rules)), { doc_identity: 'block', doc_invoice: 'block', internal_host: 'off', entropy_secret: 'warn' });
  assert.equal(DLX.engine.actionFor('doc_identity', { rules: { doc_identity: 'warn' } }), 'warn');
});

test('Auflagen 5-8: Content Script schickt nur Zeilennummern, Bild-KI nur ergaenzend, Dialog nur Text', () => {
  const c = src('content/content.js');
  // Bildtext: KI mit Restbudget, danach check() (Regeln zuerst, KI nur per merge), Dokumentart ueber den ganzen Text.
  assert.match(c, /await kiAwait\(text, B\.LIMITS\.ms - \(Date\.now\(\) - t0\) - 500\);/);
  assert.match(c, /for \(const id of B\.docType\(text, r\.findings\)\)/);
  assert.match(c, /const withKi = \(text, list\) => DLX\.ki\.merge\(list, kiFindings\(text\)\);/);
  // KI-Text gekuerzt (Auflage 6).
  assert.match(c, /const part = text\.slice\(0, DLX\.ki\.MAX_TEXT\);/);
  // Fehlende Wortrahmen -> keine Teil-Schwaerzung (Auflage 8).
  assert.match(c, /if \(!rects\) return fail\('fail'\);/);
  const d = src('ui/dialog.js');
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(d), 'Dialog nur per DOM-Knoten');
  // Der Service Worker uebernimmt lines nur geprueft.
  const bg = src('background.js');
  assert.match(bg, /const validLines = \(l\) => Array\.isArray\(l\) && l\.length >= 1 && l\.length <= 5 && l\.every\(\(x\) => Number\.isInteger\(x\) && x >= 1 && x <= 100000\);/);
  // Paket bild und code.js-Funktionen ohne Netz, Speicher, Ausgabe.
  for (const f of ['engine/bild.js', 'engine/packs-secrets.js']) assert.ok(!/console\.|fetch\(|XMLHttpRequest|sendMessage|postMessage|storage\./.test(src(f)), f);
});
