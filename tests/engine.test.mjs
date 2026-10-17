// Unit-Tests der Erkenner: Treffer, Nicht-Treffer, Pruefziffern.
// Testwerte: offizielle Beispiele (ZAS, SWIFT IBAN Registry, Stripe-Testkarten,
// ICAO Doc 9303 Musterdokumente, AWS-Doku-Beispielschluessel, Ofcom-Drama-Nummer)
// bzw. oeffentliche Beispielwerte aus der python-stdnum-Dokumentation;
// Schluessel-Formate werden zur Laufzeit synthetisch zusammengesetzt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers/load.mjs';
import { CASES, CEP_CASE } from './helpers/testwerte.mjs';
import { WORLD_CASES } from './helpers/testwerte-welt.mjs';
// Geheimnisse/Vermerke (Design-Review 14.10.2026): im selben Prozess, damit die Testlast
// die Zeitmessung in tests/fehlalarme.test.mjs nicht kippt.
import './helpers/geheimnisse-faelle.mjs';

const DLX = load();
const ALL = { packs: Object.keys(DLX.packs), rules: { br_cep: 'warn' } };

// Array.from: Ergebnisse stammen aus dem vm-Kontext (anderer Realm).
const ids = (text, cfg = ALL) => Array.from(DLX.engine.scan(text, cfg).findings, (f) => f.id);
const vals = (text, cfg = ALL) => Array.from(DLX.engine.scan(text, cfg).findings, (f) => text.slice(f.start, f.end));

test('jeder Phase-1-Datentyp hat einen Testfall', () => {
  // Gemeinschafts-Muster: Testfaelle stehen im Katalog selbst (tests/muster.test.mjs).
  const all = Array.from(DLX.engine.allDetectors()).filter((d) => d.pack !== 'community').map((d) => d.id).sort();
  // Laenderpakete Phase 2/3: Testfaelle in tests/welt.test.mjs.
  const covered = CASES.concat([CEP_CASE], WORLD_CASES).map((c) => c[0]).sort();
  assert.deepEqual(covered, all);
  assert.equal(CASES.length + 1, 106);   // 97 + 7 Typen im Paket context (mit mass_table) + 2 Code-Typen (internal_host, entropy_secret)
});

for (const [id, pos, neg] of CASES.concat([CEP_CASE])) {
  test(`${id}: Treffer und Nicht-Treffer`, () => {
    assert.ok(ids(pos).includes(id), `${id} erwartet in: ${pos}`);
    assert.ok(!ids(neg).includes(id), `${id} nicht erwartet in: ${neg}`);
  });
}

test('alle IBAN-Beispiele der SWIFT IBAN Registry', () => {
  for (const iban of ['CH9300762011623852957', 'DE89370400440532013000', 'GB29NWBK60161331926819', 'FR1420041010050500013M02606',
    'AT611904300234573201', 'NL91ABNA0417164300', 'BE68539007547034', 'LI21088100002324013AA']) {
    assert.deepEqual(vals(`Konto ${iban}.`), [iban]);
    assert.equal(DLX.validators.ibanValid(iban), iban.length);
  }
  assert.equal(DLX.validators.ibanValid('XX9300762011623852957'), false, 'unbekanntes Land');
  assert.equal(DLX.validators.ibanValid('CH930076201162385295'), false, 'falsche Laenge');
});

test('IBAN mit Leerzeichen wird auf Laenge gekuerzt, folgendes Wort bleibt', () => {
  assert.deepEqual(vals('IBAN CH93 0076 2011 6238 5295 7 und Rest'), ['CH93 0076 2011 6238 5295 7']);
});

test('Pruefziffer-Algorithmen mit offiziellen Testwerten', () => {
  const A = DLX.algo;
  assert.ok(A.ean13('7561234567897'));
  for (const n of ['4242424242424242', '5555555555554444', '378282246310005', '6011111111111117', '3056930009020004', '3566002020360505', '6200000000000005']) {
    assert.ok(A.luhn(n), n);
  }
  assert.ok(!A.luhn('4242424242424241'));
  assert.ok(A.mod97('506700GE1G29325QX363'), 'LEI der GLEIF (ISO 17442)');
  assert.ok(A.icaoOk('L898902C3', '6'));
  assert.ok(A.icaoOk('740812', '2'));
  assert.ok(A.icaoOk('120415', '9'));
  assert.ok(DLX.validators.mrzTd3Valid('L898902C36UTO7408122F1204159ZE184226B<<<<<10'));
});

test('Kontext-Pflicht: ohne Kontextwort keine Meldung', () => {
  assert.ok(!ids('36 574 261 809').includes('de_idnr'));
  assert.ok(ids('Meine Steuer-ID lautet 36574261809').includes('de_idnr'));
  assert.ok(!ids('Rechnung 123-45-6789').includes('us_ssn'));
  assert.ok(ids('IT00743110157').includes('it_iva'), 'Praefix IT ersetzt Kontext');
});

test('spezifischer Typ schlaegt generischen (USt DE vs. EU)', () => {
  assert.deepEqual(ids('USt-IdNr. DE136695976'), ['de_ust']);
  assert.deepEqual(ids('USt-IdNr. DE136695976', { packs: ['EU'] }), ['eu_vat_generic']);
  assert.deepEqual(ids('CHE-100.155.212 MWST'), ['ch_mwst']);
});

test('Pakete: nicht aktive Laender melden nichts', () => {
  assert.deepEqual(ids('AHV 756.1234.5678.97', { packs: ['DE', 'finance'] }), []);
  assert.deepEqual(ids('AHV 756.1234.5678.97', { packs: ['CH'] }), ['ch_ahv']);
});

test('Regeln: off schaltet ab, Aktion wird uebernommen, strengste gewinnt', () => {
  const cfg = { packs: ALL.packs, rules: { iban: 'block', ch_ahv: 'off' } };
  const r = DLX.engine.scan('AHV 756.1234.5678.97 IBAN CH9300762011623852957 Karte 4242424242424242', cfg);
  assert.deepEqual(Array.from(r.findings, (f) => [f.id, f.action]), [['iban', 'block'], ['cc_visa', 'warn']]);
  assert.equal(DLX.engine.strictest(r.findings), 'block');
  assert.deepEqual(Array.from(DLX.engine.summarize(r.findings), (s) => s.n), [1, 1]);
});

test('Schwaerzen ersetzt Fundstellen, danach kein Fund mehr', () => {
  const text = 'IBAN CH9300762011623852957 und AHV 756.1234.5678.97.';
  const r = DLX.engine.scan(text, ALL);
  const red = DLX.engine.redact(text, r.findings, (f) => f.cat.toUpperCase());
  assert.equal(red, 'IBAN [FINANZ] und AHV [SOZIAL].');
  assert.equal(DLX.engine.scan(red, ALL).findings.length, 0);
});

test('Zusammenfassung enthaelt keine Werte', () => {
  const r = DLX.engine.scan('Karte 4242424242424242', ALL);
  const s = JSON.stringify(DLX.engine.summarize(r.findings));
  assert.ok(!s.includes('4242'));
});

test('zu lange Eingabe gilt als nicht pruefbar', () => {
  const r = DLX.engine.scan('a'.repeat(DLX.engine.MAX_LEN + 1), ALL);
  assert.equal(r.unscannable, true);
  assert.equal(r.reason, 'too_long');
});

test('Zeitbudget: Ueberschreitung meldet nicht pruefbar statt durchzulassen', () => {
  let t = 0;
  const clock = () => (t += 100); // jede Abfrage 100 ms spaeter
  const r = DLX.engine.scan('Text 4242424242424242', ALL, clock);
  assert.equal(r.unscannable, true);
  assert.equal(r.reason, 'timeout');
});

test('ReDoS: boesartige lange Eingaben bleiben schnell', () => {
  const evil = [
    'a'.repeat(150000), '1 '.repeat(75000), '1.'.repeat(75000), 'aws'.repeat(40000) + 'secret',
    'x@'.repeat(60000), 'CH93 '.repeat(30000), 'sk-proj-' + 'T3Blbk'.repeat(20000), 'eyJ' + 'a'.repeat(100000) + '.',
    'Server=' + ';'.repeat(100000), 'https://' + 'a:'.repeat(60000), '-'.repeat(150000), '<'.repeat(150000),
  ];
  for (const e of evil) {
    const t0 = performance.now();
    const r = DLX.engine.scan(e, ALL);
    const ms = performance.now() - t0;
    assert.ok(ms < 300, `zu langsam (${Math.round(ms)} ms): ${e.slice(0, 20)}...`);
    assert.ok(Array.isArray(r.findings));
  }
});

test('SHA-256 Testvektoren (FIPS 180-4)', () => {
  const h = DLX.dictionary.sha256Hex;
  assert.equal(h('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(h(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(h('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
});

test('Firmen-Woerterbuch: Treffer ueber Pruefsumme (1-3 Woerter), Gross/Klein egal', () => {
  const salt = 'salz-example';
  const hashes = new Set([DLX.dictionary.sha256Hex(salt + 'muster ag'), DLX.dictionary.sha256Hex(salt + 'projekt zeder')]);
  const cfg = { packs: [], dictionary: { salt, hashes } };
  assert.deepEqual(vals('Offerte fuer MUSTER   AG, Projekt Zeder.', cfg), ['MUSTER   AG', 'Projekt Zeder']);
  assert.deepEqual(vals('Muster allein', cfg), []);
  assert.deepEqual(vals('muster ag', { packs: [], dictionary: { salt: 'anderes', hashes } }), []);
});
