// Eigene Begriffe (customTerms/userTerms, Design-Review 14.10.2026): Hash-Format,
// Normalisierung, Mehrwort, keine Teilwort-Treffer, Lage im Originaltext,
// Richtlinie, Admin-Werkzeug, Leistung. Nur erfundene Begriffe.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { load, ENGINE_FILES, ROOT } from './helpers/load.mjs';
import { hashTerms } from '../scripts/begriffe-hashen.mjs';

const DLX = load([...ENGINE_FILES, 'common/policy.js']);
const D = DLX.dictionary;
const SALT = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const node = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const list = (terms, salt = SALT) => D.termList(salt, terms.map((t) => D.termHash(salt, D.prepareTerm(t).term)));
// Werte aus dem vm-Kontext haben eigene Prototypen: vor dem Vergleich in einfache Objekte.
const deq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);
const hits = (text, lists) => D.scanTerms(text, lists, Infinity, () => 0).findings.map((f) => text.slice(f.start, f.end));

// Feste Pruefwerte (Auflage 1): gleich fuer Werkzeug, Einstellungsseite und Content Script.
const VECTORS = [
  ['Projekt Zeder', 'projekt zeder'],
  ['MÜLLER-Bau AG', 'mueller bau ag'],
  ['intern.firma.example', 'intern firma example'],
];

test('Hash: eigene SHA-256 gleich Node crypto (leer, Mehrbyte, lang)', () => {
  for (const s of ['', 'abc', 'ü'.repeat(40), 'x'.repeat(200), '漢字かな', SALT + 'projekt zeder']) assert.equal(D.sha256Hex(s), node(s));
  for (const [raw, norm] of VECTORS) {
    assert.equal(D.prepareTerm(raw).term, norm);
    assert.equal(D.termHash(SALT, norm), node(SALT + norm), raw);
  }
});

test('Hash: Scan mit Mittelzustand findet auch Begriffe ueber zwei Bloecke', () => {
  const long = 'Alphaprojekt Betasystem Gammaplattform Deltamodul Epsilonbereich';   // > 55 Bytes
  assert.ok(new TextEncoder().encode(D.prepareTerm(long).term).length > 55);
  const l = list([long, 'Ostwind Süd']);
  deq(hits(`Bitte ${long} und ostwind sued pruefen`, [l]), [long, 'ostwind sued']);
});

test('Normalisierung: Reihenfolge NFKC, klein, Umlaute, Akzente, Cf entfernt', () => {
  assert.equal(D.normWord('MÜLLER'), 'mueller');
  assert.equal(D.normWord('Straße'), 'strasse');
  assert.equal(D.normWord('Café'), 'cafe');
  assert.equal(D.normWord('Ｚｅｄｅｒ'), 'zeder');           // Vollbreite
  assert.equal(D.normWord('ﬁrma'), 'firma');              // Ligatur
  assert.equal(D.normWord('İzmir'), 'izmir');             // ohne Locale (Auflage 2)
  assert.equal(D.normWord('Ze­der'), 'zeder');       // weiches Trennzeichen
  assert.equal(D.normWord('Ze​der'), 'zeder');       // ZWSP
  assert.equal(D.normWord('über'), 'ueber');        // zerlegtes ue
});

test('Normalisierung: Leerzeichen, Bindestriche, Punkte trennen gleich', () => {
  for (const v of ['projekt zeder', 'Projekt-Zeder', '  PROJEKT   zeder ', 'projekt_zeder', 'Projekt–Zeder']) assert.equal(D.prepareTerm(v).term, 'projekt zeder', v);
  deq(D.prepareTerm('ab'), { error: 'short' });
  deq(D.prepareTerm('a b'), { error: 'short' });
  deq(D.prepareTerm('eins zwei drei vier fuenf sechs'), { error: 'long' });
  assert.equal(D.prepareTerm('eins zwei drei vier fuenf').term, 'eins zwei drei vier fuenf');
  deq(D.prepareTerm('x'.repeat(101)), { error: 'long' });
});

test('Mehrwort: n-Gramme 1-5, Schreibvarianten und Lage im Originaltext', () => {
  const l = list(['Projekt Zeder', 'Müller Bau AG', 'intern.firma.example', 'XKB', 'Nord Ost Süd West Mitte']);
  const text = 'Hallo projekt-zeder, MUELLER  bau ag und mail@intern.firma.example; Kuerzel xkb. nord-ost-sued west mitte';
  deq(hits(text, [l]), ['projekt-zeder', 'MUELLER  bau ag', 'intern.firma.example', 'xkb', 'nord-ost-sued west mitte']);
});

test('Lage: Umlaut, Ligatur, Vollbreite, weiches Trennzeichen mitten im Treffer (Auflage 3)', () => {
  const l = list(['Projekt Zeder', 'Firma Süd']);
  for (const v of ['Projekt Ze­der', 'Ｐｒｏｊｅｋｔ Ｚｅｄｅｒ', 'ﬁrma süd', 'FIRMA SÜD']) {
    const text = 'Vorher ' + v + ' nachher';
    const f = D.scanTerms(text, [l], Infinity, () => 0).findings;
    assert.equal(f.length, 1, v);
    assert.equal(text.slice(f[0].start, f[0].end), v);
    // Schwaerzen ersetzt genau die Originalstelle.
    assert.equal(DLX.engine.redact(text, f, () => 'X'), 'Vorher [X] nachher');
  }
});

test('keine Fehltreffer bei Teilwoertern', () => {
  const l = list(['Zeder', 'XKB', 'Projekt Zeder']);
  deq(hits('Zederholz, Zedern, Lebenszeder, XKBX, axkb, Projektzeder, Projekt Zederholz', [l]), []);
  deq(hits('Zeder.', [l]), ['Zeder']);
});

test('Salz trennt Listen; falsches Salz trifft nie; zwei Listen gleichzeitig', () => {
  const other = 'ff'.repeat(32);
  const a = list(['Projekt Zeder']);
  const b = list(['Ostwind'], other);
  deq(hits('projekt zeder und ostwind', [a, b]), ['projekt zeder', 'ostwind']);
  const wrong = D.termList(other, [D.termHash(SALT, 'projekt zeder')]);
  deq(hits('projekt zeder', [wrong]), []);
  assert.equal(D.termList('kurz', []), null);
  assert.ok(D.termList(SALT.toUpperCase(), [D.termHash(SALT, 'ostwind').toUpperCase()]).hashes.has(D.termHash(SALT, 'ostwind')));
});

test('Engine: Datentyp custom_term, Aktion aus Regeln, Ueberlappung, Budget -> nicht pruefbar', () => {
  const terms = [list(['Projekt Zeder', 'Zeder'])];
  const r = DLX.engine.scan('Projekt Zeder', { packs: [], terms });
  deq(r.findings, [{ id: 'custom_term', cat: 'firma', start: 0, end: 13, action: 'warn', sure: true }]);
  assert.equal(DLX.engine.scan('Zeder', { packs: [], terms, rules: { custom_term: 'redact' } }).findings[0].action, 'redact');
  assert.equal(DLX.engine.scan('Zeder', { packs: [], terms, rules: { custom_term: 'off' } }).findings.length, 0);
  let t = 0;
  const slow = DLX.engine.scan('wort '.repeat(500), { packs: [], terms }, () => (t += 10));
  assert.equal(slow.unscannable, true);
  assert.equal(slow.reason, 'timeout');
});

test('Richtlinie: customTerms nur gueltig, userTerms nie aus der Richtlinie, beide wirken', () => {
  const h = D.termHash(SALT, 'projekt zeder');
  const ok = DLX.policy.validate({ customTerms: { salt: SALT.toUpperCase(), hashes: [h.toUpperCase()] } });
  deq(ok, { value: { customTerms: { salt: SALT, hashes: [h] } }, errors: [] });
  for (const bad of [{ salt: 'kurz', hashes: [h] }, { salt: SALT, hashes: ['xyz'] }, { salt: SALT }, { salt: SALT, hashes: new Array(20001).fill(h) }, []]) {
    deq(DLX.policy.validate({ customTerms: bad }).errors, ['customTerms']);
  }
  deq(DLX.policy.validate({ userTerms: { salt: SALT, hashes: [h] } }).errors, ['unknown:userTerms']);
  deq(DLX.policy.validate({ userTerms: { salt: SALT, hashes: new Array(1001).fill(h) } }, true).errors, ['userTerms']);
  assert.ok(DLX.policy.validate({ rules: { custom_term: 'block' } }).errors.length === 0);
  const userSalt = 'ab'.repeat(32);
  const e = DLX.policy.effective({ customTerms: { salt: SALT, hashes: [h] } }, { userTerms: { salt: userSalt, hashes: [D.termHash(userSalt, 'ostwind')] } }, 'de-CH');
  assert.equal(e.locked.customTerms, true);
  const eng = DLX.policy.engineConfig(e.cfg);
  assert.equal(eng.terms.length, 2);
  deq(DLX.engine.scan('Projekt Zeder und Ostwind', Object.assign(eng, { packs: [] })).findings.map((f) => f.id), ['custom_term', 'custom_term']);
});

test('Werkzeug: nur Pruefsummen, Warnungen nur mit Zeilennummer, Salz pruefen', () => {
  const r = hashTerms('# Kommentar\nProjekt Zeder\nprojekt-zeder\nab\n\neins zwei drei vier fuenf sechs\nMüller Bau AG\n', SALT);
  assert.equal(r.salt, SALT);
  deq(r.hashes, [D.termHash(SALT, 'projekt zeder'), D.termHash(SALT, 'mueller bau ag')].sort());
  deq(r.rejected, [{ line: 4, error: 'short' }, { line: 6, error: 'long' }]);
  assert.equal(r.duplicates, 1);
  assert.match(hashTerms('Ostwind').salt, /^[0-9a-f]{64}$/);
  assert.notEqual(hashTerms('Ostwind').salt, hashTerms('Ostwind').salt);
  assert.throws(() => hashTerms('Ostwind', 'xyz'), /64 Hex/);
});

test('Werkzeug (Aufruf): stdin, kein Klartext in Ausgabe, --out nur mit --force ueberschreiben', () => {
  const script = path.join(ROOT, 'scripts', 'begriffe-hashen.mjs');
  const r = spawnSync(process.execPath, [script, '-', '--salt', SALT], { input: 'Projekt Zeder\nab\n', encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  deq(out, { customTerms: { salt: SALT, hashes: [D.termHash(SALT, 'projekt zeder')] } });
  assert.ok(!/zeder/i.test(r.stdout + r.stderr));
  assert.match(r.stderr, /Zeile 2/);
  deq(DLX.policy.validate(out).errors, []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-begriffe-'));
  try {
    const f = path.join(dir, 'p.json');
    fs.writeFileSync(f, '{}');
    const again = spawnSync(process.execPath, [script, '-', '--out', f], { input: 'Ostwind\n', encoding: 'utf8', windowsHide: true });
    assert.equal(again.status, 1);
    assert.equal(fs.readFileSync(f, 'utf8'), '{}');
    const forced = spawnSync(process.execPath, [script, '-', '--out', f, '--force'], { input: 'Ostwind\n', encoding: 'utf8', windowsHide: true });
    assert.equal(forced.status, 0);
    assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).customTerms.hashes.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Leistung: 50k Zeichen mit Richtlinie (20 000) und Nutzerliste (1 000), n-Gramme 1-5', (t) => {
  const words = 'Der Kunde hat gestern mit dem Projektteam über die neue Lösung gesprochen und offene Fragen zur Planung gestellt'.split(' ');
  const make = (n) => { let s = ''; let i = 0; while (s.length < n) s += words[(i++ * 7) % words.length] + (i % 13 ? ' ' : '. '); return s; };
  const rand = (n) => Array.from({ length: n }, () => crypto.randomBytes(32).toString('hex'));
  const cfg = { packs: Object.keys(DLX.packs), terms: [D.termList(SALT, rand(20000)), D.termList('ab'.repeat(32), rand(1000))] };
  const run = (text) => { const t0 = performance.now(); const r = DLX.engine.scan(text, cfg); return { ms: performance.now() - t0, r }; };
  run(make(5000));   // Aufwaermen
  const mid = run(make(50000));
  const big = run(make(190000));
  t.diagnostic(`50k: ${mid.ms.toFixed(0)} ms, 190k: ${big.ms.toFixed(0)} ms${big.r.unscannable ? ' (nicht pruefbar)' : ''}`);
  assert.equal(mid.r.unscannable, false);
  assert.ok(mid.ms < DLX.engine.BUDGET_MS, `${mid.ms} ms`);
});
