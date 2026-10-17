// Dokument-Fingerabdruecke (Design-Review Diktat und Fingerabdruecke 16.10.2026, Teil B):
// Werkzeug und Erweiterung rechnen gleich, Ausgabe ohne Klartext, strenge Richtlinien-
// Pruefung, ZIP-/HTML-Leser, Schwelle und Zeitbudget.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { load, ENGINE_FILES, ROOT, EXT } from './helpers/load.mjs';
import { buildPolicy, docxDocumentXml, docxXmlText, htmlText, encode, loadEngine } from '../scripts/dokumente-fingerabdruck.mjs';
import { DOKUMENT, FREMD, AUSZUG, SALZ, richtlinie } from './helpers/firmendokument.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'engine/fingerabdruck.js', 'common/policy.js']);
const FP = DLX.fingerprint;
const P = DLX.policy;
const plain = (x) => JSON.parse(JSON.stringify(x));
const compile = (p) => FP.compile(p, P.fpValues(p.data));

test('Testvektor: Erweiterung und Werkzeug rechnen Bit fuer Bit wie SHA-256(salz + "\\n" + shingle) (Auflage 10)', () => {
  const words = 'eins zwei drei vier fuenf sechs sieben acht';
  const want = crypto.createHash('sha256').update(SALZ + '\n' + words).digest().readUInt32BE(0);
  assert.equal(want, 0x71514179, 'fester Testvektor');
  assert.deepEqual(Array.from(FP.values(words, SALZ, 8, 1)), [want]);
  assert.deepEqual(Array.from(loadEngine().values(words, SALZ, 8, 1)), [want], 'Werkzeug-Kontext');
  // Normalisierung wie eigene Begriffe: Gross/Klein, Umlaute, Akzente, Satzzeichen, Zeilenumbruch.
  assert.deepEqual(Array.from(FP.values('Eins, ZWEI – drei\nvier: fünf? sechs! sieben… acht.', SALZ, 8, 1)), [want]);
  assert.deepEqual(Array.from(FP.values('eins zwei drei vier fuenf sechs sieben acht', SALZ, 8, 1)), Array.from(FP.values('ÉINS zwei drei vier fünf sechs sieben acht', SALZ, 8, 1)));
  // Ausduennung haengt nur am Wert, nicht an der Lage.
  const all = FP.values(DOKUMENT, SALZ, 8, 1);
  const kept = FP.values(DOKUMENT, SALZ, 8, 4);
  assert.deepEqual(Array.from(kept).sort(), Array.from(all).filter((h) => h % 4 === 0).sort());
});

test('Fester Testvektor (Regression gegen geaenderte Normalisierung)', () => {
  const v = Array.from(FP.values('Projekt Zeder: Wartungsvertraege im Raum Mittelland neu ordnen', SALZ, 8, 1));
  const ref = Array.from(new Set(['projekt zeder wartungsvertraege im raum mittelland neu ordnen'].flatMap((s) => {
    const w = s.split(' ');
    return [0].map((i) => crypto.createHash('sha256').update(SALZ + '\n' + w.slice(i, i + 8).join(' ')).digest().readUInt32BE(0));
  })));
  assert.deepEqual(v.sort(), ref.sort());
});

test('Erkennung: Auszug in anderer Schreibweise trifft, eigene Saetze zum gleichen Thema nicht', () => {
  const fp = compile(richtlinie());
  const hit = FP.scan(AUSZUG, fp);
  assert.equal(hit.hit, true, 'Auszug erkannt');
  assert.ok(hit.n >= 4);
  assert.deepEqual([FP.scan(FREMD, fp).hit, FP.scan(FREMD, fp).n], [false, 0]);
  assert.equal(FP.scan('', fp).hit, false);
  // Ein einzelner Satz (unter der Schwelle) gilt nicht als grosser Teil.
  const kurz = 'Die Abteilung Vertrieb prueft dazu bis Ende des dritten Quartals.';
  assert.equal(FP.scan(kurz, fp).hit, false);
});

test('Nur verschiedene Treffer zaehlen: wiederholter kurzer Auszug ueberschreitet minMatches nicht (Auflage 11)', () => {
  const fp = compile(richtlinie({ sample: 1, minMatches: 4 }));
  const zwei = 'Parallel verhandelt die Einkaufsleitung mit zwei Lieferanten ueber';   // 9 Woerter = 2 Shingles
  const r = FP.scan(Array(50).fill(zwei).join(' . '), fp);
  assert.ok(r.n <= 3, 'nur verschiedene Werte, n=' + r.n);
  assert.equal(r.hit, false);
});

test('Zahlenkolonnen und Wiederholungen ergeben keine Fingerabdruecke (Auflage 11)', () => {
  assert.equal(FP.values('0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0', SALZ, 8, 1).size, 0);
  assert.equal(FP.values('1;2;3;4;5;6;7;8;9;10;11;12', SALZ, 8, 1).size, 0);
  assert.equal(FP.values('ja nein ja nein ja nein ja nein ja nein', SALZ, 8, 1).size, 0, 'weniger als 4 verschiedene Woerter');
  assert.equal(FP.values('Rechnung 2026 Betrag 100 Konto 200 Rest 300', SALZ, 8, 1).size, 1, 'halb Zahlen geht noch');
  assert.throws(() => buildPolicy(['0;0;0;0;0;0;0;0;0;0;0;0'], { salt: SALZ }), /Keine Fingerabdruecke/);
});

test('Ausschluss-Liste entfernt Standardtexte (Auflage 11)', () => {
  const disclaimer = 'Diese Nachricht ist vertraulich und nur fuer den angegebenen Empfaenger bestimmt. Wenn Sie nicht der richtige Empfaenger sind, loeschen Sie sie bitte.';
  const mit = buildPolicy([DOKUMENT + '\n\n' + disclaimer], { salt: SALZ, sample: 1 });
  const ohne = buildPolicy([DOKUMENT + '\n\n' + disclaimer], { salt: SALZ, sample: 1, exclude: [disclaimer] });
  assert.ok(ohne.removed > 0 && ohne.count === mit.count - ohne.removed);
  const fp = compile(ohne.policy.documentFingerprints);
  assert.equal(FP.scan(disclaimer, fp).n, 0, 'Disclaimer allein trifft nicht mehr');
});

test('Ausgabe enthaelt keinen Klartext: nur Salz, Zahlen, Aktion und Base64 von uint32 (Auflage 14, Testweise)', () => {
  const r = buildPolicy([DOKUMENT, FREMD], { salt: SALZ });
  const json = JSON.stringify(r.policy);
  const p = r.policy.documentFingerprints;
  assert.deepEqual(Object.keys(r.policy), ['documentFingerprints']);
  assert.deepEqual(Object.keys(p).sort(), ['action', 'data', 'minMatches', 'salt', 'sample', 'shingle']);
  assert.match(p.salt, /^[0-9a-f]{64}$/);
  for (const part of p.data) assert.match(part, /^[A-Za-z0-9+/]+={0,2}$/);
  const words = new Set((DOKUMENT + ' ' + FREMD).toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 5));
  for (const w of words) assert.ok(!json.toLowerCase().includes(w), 'Wort im JSON: ' + w);
  // Die Daten sind genau die sortierten Werte, 4 Byte je Wert: Platz fuer Text gibt es nicht.
  const vals = P.fpValues(p.data);
  assert.equal(vals.length, r.count);
  assert.equal(Buffer.concat(p.data.map((x) => Buffer.from(x, 'base64'))).length, r.count * 4);
  assert.deepEqual(vals, vals.slice().sort((a, b) => a - b));
  // Neues Salz ohne --salt: Zufall, je Lauf anders.
  assert.notEqual(buildPolicy([DOKUMENT]).policy.documentFingerprints.salt, buildPolicy([DOKUMENT]).policy.documentFingerprints.salt);
});

test('Werkzeug auf der Kommandozeile: Ausgabe ohne Klartext und ohne Dateinamen, Meldungen nur auf stderr', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-'));
  try {
    fs.writeFileSync(path.join(dir, 'strategie-geheim.txt'), DOKUMENT);
    fs.writeFileSync(path.join(dir, 'seite.html'), '<html><style>.x{}</style><script>var geheimskript=1</script><p>' + FREMD + '</p></html>');
    fs.writeFileSync(path.join(dir, 'bild.png'), 'kein Text');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'dokumente-fingerabdruck.mjs'), dir, '--salt', SALZ], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.ok(!r.stdout.includes('strategie') && !r.stdout.includes('seite') && !r.stdout.toLowerCase().includes('zeder'));
    assert.match(r.stderr, /2 Dokumente, \d+ Fingerabdruecke/);
    assert.equal(P.validate(out).errors.length, 0);
    const out2 = path.join(dir, 'policy.json');
    assert.equal(spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'dokumente-fingerabdruck.mjs'), dir, '--out', out2], { encoding: 'utf8' }).status, 0);
    const again = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'dokumente-fingerabdruck.mjs'), dir, '--out', out2], { encoding: 'utf8' });
    assert.equal(again.status, 1, 'ueberschreibt nur mit --force');
    const bad = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'dokumente-fingerabdruck.mjs'), dir, '--sample', '99'], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('HTML: script, style und Kommentare werden verworfen, nur die fuenf Entitaeten (Auflage 9)', () => {
  const t = htmlText('<p>A &amp; B &lt;x&gt; &quot;q&quot; &apos;a&apos;&nbsp;C &eacute;</p><script>geheim()</script><style>p{}</style><!-- kommentar -->');
  assert.ok(!t.includes('geheim') && !t.includes('kommentar') && !t.includes('p{}'));
  assert.ok(t.includes('A & B <x> "q" \'a\' C &eacute;'));
});

// Minimales ZIP fuer Tests: Eintraege { name, data, method, flags }.
function zip(entries) {
  const locals = [], central = [];
  let off = 0;
  for (const e of entries) {
    const raw = Buffer.from(e.data);
    const method = e.method ?? 8;
    const body = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(e.flags || 0, 6); l.writeUInt16LE(method, 8);
    l.writeUInt32LE(body.length, 18); l.writeUInt32LE(e.usize ?? raw.length, 22); l.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(e.flags || 0, 8); c.writeUInt16LE(method, 10);
    c.writeUInt32LE(body.length, 20); c.writeUInt32LE(e.usize ?? raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    locals.push(l, name, body);
    central.push(c, name);
    off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
const XML = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY boom "BOOM">]><w:document><w:body><w:p><w:r><w:t>Hallo &amp; </w:t></w:r><w:r><w:t xml:space="preserve">Welt&boom;</w:t></w:r></w:p><w:p><w:r><w:t>Zweiter</w:t><w:tab/><w:t>Absatz</w:t></w:r></w:p></w:body></w:document>';

test('docx: nur word/document.xml, nur <w:t>, keine DTD-Entitaeten (Auflagen 8, 9)', () => {
  const buf = zip([{ name: '[Content_Types].xml', data: '<x/>' }, { name: 'word/document.xml', data: XML }]);
  const t = docxXmlText(docxDocumentXml(buf));
  assert.equal(t, 'Hallo & Welt&boom; Zweiter Absatz ');
  assert.equal(docxXmlText(docxDocumentXml(zip([{ name: 'word/document.xml', data: XML, method: 0 }]))), t, 'Methode 0');
});

test('docx: Abwehr von Zip-Bomben und Sonderfaellen (Auflage 8)', () => {
  const ok = { name: 'word/document.xml', data: XML };
  assert.throws(() => docxDocumentXml(zip([ok, ok])), /mehrfach/);
  assert.throws(() => docxDocumentXml(zip([{ ...ok, flags: 1 }])), /verschluesselt/);
  assert.throws(() => docxDocumentXml(zip([{ ...ok, method: 12 }])), /Kompression/);
  assert.throws(() => docxDocumentXml(zip([{ name: 'word/other.xml', data: XML }])), /kein word\/document.xml/);
  assert.throws(() => docxDocumentXml(Buffer.from('kein zip')), /kein ZIP/);
  // Hohes Verhaeltnis: 5 MB Nullen packen auf wenige KB.
  assert.throws(() => docxDocumentXml(zip([{ name: 'word/document.xml', data: Buffer.alloc(5 * 1024 * 1024) }])), /verhaeltnis/i);
  // Angegebene Groesse ueber der Grenze, auch wenn die Daten klein sind.
  assert.throws(() => docxDocumentXml(zip([{ ...ok, usize: 30 * 1024 * 1024 }])), /zu gross/);
  // Falsche Groessenangabe: inflate liefert anderes als angegeben.
  assert.throws(() => docxDocumentXml(zip([{ ...ok, usize: XML.length + 5 }])), /Groesse/);
  // Zu viele Eintraege.
  assert.throws(() => docxDocumentXml(zip(Array.from({ length: 5001 }, (_, i) => ({ name: 'f' + i, data: 'x', method: 0 })))), /zu viele/);
});

test('Richtlinie: strenge Pruefung, nur verwaltet, ganzer Block oder nichts (Auflage 12)', () => {
  const good = richtlinie();
  const v = (fp, user) => P.validate({ documentFingerprints: fp }, user);
  assert.deepEqual(plain(v(good).errors), []);
  assert.equal(v(good).value.documentFingerprints.count, P.fpValues(good.data).length);
  const bad = [
    { ...good, salt: 'A1'.repeat(32) }, { ...good, salt: 'a1' }, { ...good, shingle: 4 }, { ...good, shingle: 17 }, { ...good, sample: 0 }, { ...good, sample: 65 },
    { ...good, minMatches: 1 }, { ...good, minMatches: 51 }, { ...good, action: 'redact' }, { ...good, data: [] }, { ...good, data: 'abc' },
    { ...good, data: ['AAAA'] }, { ...good, data: ['AAAAAAA='] }, { ...good, data: ['!!!!'] }, { ...good, data: [good.data[0] + 'A'] },
    { ...good, data: [Buffer.from([0, 0, 0, 5, 0, 0, 0, 3]).toString('base64')] }, { ...good, data: [Buffer.from([0, 0, 0, 5, 0, 0, 0, 5]).toString('base64')] }, { ...good, extra: 1 },
    { ...good, shingle: '8' }, { ...good, data: Array(201).fill('AAAAAQ==') }, 'x', null,
  ];
  for (const b of bad) {
    const r = v(b);
    assert.equal(r.value.documentFingerprints, undefined, JSON.stringify(b).slice(0, 80));
    assert.deepEqual(plain(r.errors), ['documentFingerprints']);
  }
  assert.ok(v({ ...good, data: ['AAAAAQ=='] }).value.documentFingerprints, 'genau ein Wert (1) ist gueltig');
  assert.deepEqual(plain(v(good, true).errors), ['unknown:documentFingerprints'], 'nie als Benutzerwert');
  // Obergrenze 100000 Werte.
  const many = encode(Array.from({ length: 100001 }, (_, i) => i + 1));
  assert.deepEqual(plain(v({ ...good, data: many }).errors), ['documentFingerprints']);
  assert.deepEqual(plain(v({ ...good, data: encode(Array.from({ length: 100000 }, (_, i) => i + 1)) }).errors), []);
  // Wirkung: effective() uebernimmt nur die verwaltete Richtlinie.
  assert.equal(P.effective({}, { documentFingerprints: good }, 'de-CH').cfg.documentFingerprints, null);
  assert.equal(P.effective({ documentFingerprints: good }, {}, 'de-CH').cfg.documentFingerprints.salt, good.salt);
});

test('voiceMode: allow|warn|block, nur verwaltet, ungueltig = block (Auflage 5)', () => {
  assert.equal(P.defaults('de-CH').voiceMode, 'warn');
  for (const m of ['allow', 'warn', 'block']) assert.equal(P.validate({ voiceMode: m }).value.voiceMode, m);
  assert.deepEqual(plain([P.validate({ voiceMode: 'aus' }).value.voiceMode, P.validate({ voiceMode: 'aus' }).errors]), ['block', ['voiceMode']]);
  assert.deepEqual(plain(P.validate({ voiceMode: 'allow' }, true).errors), ['unknown:voiceMode']);
  assert.equal(P.effective({}, { voiceMode: 'allow' }, 'de-CH').cfg.voiceMode, 'warn', 'lokal nicht lockerbar');
});

test('Zeitbudget: Ueberschreitung meldet timeout statt "kein Treffer" (Auflage 13); grosse Eingabe im Budget', () => {
  const fp = compile(richtlinie());
  let t = 0;
  const r = FP.scan(DOKUMENT.repeat(50), fp, () => (t += 1000));
  assert.deepEqual([r.timeout, r.hit], [true, false]);
  const big = (FREMD + ' ').repeat(800);   // etwa 190 000 Zeichen
  const t0 = performance.now();
  const r2 = FP.scan(big, fp);
  const ms = performance.now() - t0;
  assert.equal(r2.hit, false);
  assert.ok(r2.timeout || ms < 1000, 'linear: ' + Math.round(ms) + ' ms');
});

test('Engine-Konfiguration: Content Script bekommt die Pruefliste, Service Worker ohne fingerabdruck.js nicht', () => {
  const cfg = Object.assign(P.defaults('de-CH'), { documentFingerprints: P.validate({ documentFingerprints: richtlinie() }).value.documentFingerprints });
  const eng = P.engineConfig(cfg);
  assert.ok(eng.fp && eng.fp.set.size > 0 && eng.fp.min === 4 && eng.fp.action === 'warn');
  const sw = load(['branding.js', ...ENGINE_FILES, 'common/policy.js']);
  assert.equal(sw.policy.engineConfig(cfg).fp, null);
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const js = manifest.content_scripts[0].js;
  assert.ok(js.indexOf('engine/fingerabdruck.js') > js.indexOf('engine/dictionary.js') && js.indexOf('engine/fingerabdruck.js') < js.indexOf('common/policy.js'));
});

test('Quelltext: Fingerabdruck-Code und Werkzeug ohne Netz', () => {
  const ext = fs.readFileSync(path.join(EXT, 'engine', 'fingerabdruck.js'), 'utf8');
  const tool = fs.readFileSync(path.join(ROOT, 'scripts', 'dokumente-fingerabdruck.mjs'), 'utf8');
  for (const src of [ext, tool]) assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|node:(https?|net|tls|dgram|dns)|require\(/.test(src.replace(/^\s*\/\/.*$/gm, '')));
  const imports = [...tool.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['node:crypto', 'node:fs', 'node:path', 'node:url', 'node:vm', 'node:zlib']);
});
