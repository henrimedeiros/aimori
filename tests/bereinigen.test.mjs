// Bereinigte Version hochladen (Design-Review Bereinigen 19.10.2026,
// docs/sicherheit/design-review-datei-bereinigen-19-10.md): Zeitscheibe, DOCX-Rueckbildung,
// Restpruefung, ZIP-Strenge, Metadaten, PDF-Textfassung, Service-Worker-Regeln.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { load, ENGINE_FILES, EXT } from './helpers/load.mjs';
import { zip, pdf } from './helpers/dokumente.mjs';
import { IBAN, AHV } from './helpers/beispieldateien.mjs';

const FILES = [...ENGINE_FILES, 'engine/datei.js', 'engine/stuecke.js', 'engine/bereinigen.js', 'common/quellen.js', 'common/policy.js', 'common/i18n.js'];
const CTX = { TextDecoder, DecompressionStream, Uint8Array, DataView, setTimeout, URL };
const DLX = load(FILES, CTX);
const eng = DLX.policy.engineConfig(DLX.policy.defaults('de-CH'));
const detect = (part) => { const r = DLX.engine.scan(part, eng); return { findings: Array.from(r.findings), unscannable: r.unscannable }; };
const find = async (t) => { const d = await DLX.stuecke.scan(t, detect); if (d.unscannable) throw new Error('fail'); return d.findings; };
const label = (f) => DLX.i18n.t('de', 'cat_' + f.cat);
const B = DLX.bereinigen;
const u8 = (b) => new Uint8Array(b.buffer ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b);
const readText = async (bytes, kind) => (await DLX.datei.extract(bytes, kind)).text;
const ids = async (text) => [...(await find(text))].map((f) => f.id);   // Feld aus dem vm-Kontext in diesen holen
const codeOf = async (p) => { try { await p; return 'ok'; } catch (e) { return e.code || e.message; } };
const DOC = (body) => '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>' + body + '</w:body></w:document>';
const P = (...runs) => '<w:p>' + runs.map((r) => '<w:r><w:t xml:space="preserve">' + r + '</w:t></w:r>').join('') + '</w:p>';

test('Zeitscheibe: gleiche Funde mit Pause je Stueck und ohne Pause; Frist = unscannable (Auflage 1)', async () => {
  let t = 0;
  const always = load(FILES, Object.assign({}, CTX, { performance: { now: () => (t += 100) } }));
  const never = load(FILES, Object.assign({}, CTX, { performance: { now: () => 0 } }));
  const text = Array.from({ length: 300 }, (_, i) => 'Zeile ' + i + ' Konto ' + IBAN + ' AHV ' + AHV + ' ' + 'x'.repeat(i % 97)).join('\n');
  const a = await always.stuecke.scan(text, detect);
  const b = await never.stuecke.scan(text, detect);
  assert.ok(text.length > 3 * always.stuecke.CHUNK);
  assert.equal(a.unscannable, false);
  assert.deepEqual([...a.findings].map((f) => f.id + ':' + f.start), [...b.findings].map((f) => f.id + ':' + f.start));
  assert.equal(a.findings.filter((f) => f.id === 'iban').length, 300);
  const late = await never.stuecke.scan(text, detect, Date.now() - 1);
  assert.equal(late.unscannable, true);
});

test('DOCX: Wert ueber mehrere w:t-Stuecke wird ersetzt, Leser findet nichts mehr, Rest byte-gleich', async () => {
  const half = IBAN.length >> 1;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const src = u8(zip([
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: 'word/document.xml', data: DOC(P('Konto ', IBAN.slice(0, half), IBAN.slice(half) + ' bitte') + P('A &amp; B, AHV ' + AHV) + '<w:p><w:r><w:tab /><w:t>Ende</w:t></w:r></w:p>') },
    { name: 'word/media/bild.png', data: png },
  ]));
  assert.deepEqual((await ids(await readText(src, 'docx'))).sort(), ['ch_ahv', 'iban']);
  const out = await B.docx(src, find, label);
  const text = await readText(out, 'docx');
  assert.deepEqual(await ids(text), []);
  assert.ok(text.includes('Konto [' + label({ cat: 'finanz' }) + '] bitte'), text);
  assert.ok(text.includes('A & B, AHV ['), text);
  assert.ok(text.includes('\tEnde'));
  const before = B.zipList(src), after = B.zipList(out);
  assert.deepEqual(after.map((e) => e.name), before.map((e) => e.name));
  const img = (l) => l.find((e) => e.name === 'word/media/bild.png');
  assert.deepEqual(Buffer.from(img(after).data), Buffer.from(img(before).data));
  assert.equal(img(after).crc, img(before).crc);
  assert.equal(after.find((e) => e.name === 'word/document.xml').method, 0);
});

test('DOCX: Fund ueber eine Absatzgrenze leert alle betroffenen Stuecke (Auflage 6)', () => {
  const xml = DOC(P('ab', 'cd') + P('ef'));
  const sg = B.segments(xml);
  assert.equal(sg.text, 'abcd\nef\n');
  const out = B.rewrite(xml, sg.segs, [{ id: 'x', cat: 'finanz', start: 3, end: 6 }], () => 'X');
  assert.equal(B.segments(out).text, 'abc[X]\nf\n');
  // Stuecke ohne Fund bleiben byte-gleich (auch Entities).
  const amp = DOC(P('A &amp; B'));
  assert.equal(B.rewrite(amp, B.segments(amp).segs, [], () => 'X'), amp);
});

test('DOCX: Fund ausserhalb der w:t-Stuecke = keine bereinigte Fassung (Auflagen 3, 10)', async () => {
  const withDel = u8(zip([{ name: 'word/document.xml', data: DOC(P('Notiz') + '<w:p><w:del><w:r><w:delText>' + IBAN + '</w:delText></w:r></w:del></w:p>') }]));
  assert.equal(await codeOf(B.docx(withDel, find, label)), 'rest');
  const withLink = u8(zip([
    { name: 'word/document.xml', data: DOC(P('Notiz ' + IBAN)) },
    { name: 'word/_rels/document.xml.rels', data: '<Relationships><Relationship Id="rId1" Type="h" Target="mailto:max.muster@example.com" TargetMode="External"/></Relationships>' },
  ]));
  assert.equal(await codeOf(B.docx(withLink, find, label)), 'rest');
  const withProps = u8(zip([{ name: 'word/document.xml', data: DOC(P('Notiz')) }, { name: 'customXml/item1.xml', data: '<a>' + AHV + '</a>' }]));
  assert.equal(await codeOf(B.docx(withProps, find, label)), 'rest');
  const field = u8(zip([{ name: 'word/document.xml', data: DOC('<w:p><w:r><w:instrText> HYPERLINK "x" ' + IBAN + '</w:instrText></w:r></w:p>' + P('Text')) }]));
  assert.equal(await codeOf(B.docx(field, find, label)), 'rest');
  const alt = u8(zip([{ name: 'word/document.xml', data: DOC(P('Text') + '<w:altChunk r:id="rId9"/>') }]));
  assert.equal(await codeOf(B.docx(alt, find, label)), 'partial');
  const macro = u8(zip([{ name: 'word/document.xml', data: DOC(P(IBAN)) }, { name: 'word/vbaProject.bin', data: 'x' }]));
  assert.equal(await codeOf(B.docx(macro, find, label)), 'partial');
});

test('DOCX: Autor-Metadaten werden geleert (Auflage 4)', async () => {
  const src = u8(zip([
    { name: 'word/document.xml', data: DOC(P('Konto ' + IBAN)) },
    { name: 'word/comments.xml', data: '<w:comments xmlns:w="x"><w:comment w:id="0" w:author="Erika Beispiel" w:initials="EB"><w:p><w:r><w:t>ok</w:t></w:r></w:p></w:comment></w:comments>' },
    { name: 'docProps/core.xml', data: '<cp:coreProperties><dc:creator>Erika Beispiel</dc:creator><cp:lastModifiedBy>Max Muster</cp:lastModifiedBy><dc:title>Plan</dc:title></cp:coreProperties>' },
    { name: 'docProps/app.xml', data: '<Properties><Company>Beispiel AG</Company><Pages>1</Pages></Properties>' },
  ]));
  const out = await B.docx(src, find, label);
  const all = await Promise.all(B.zipList(out).map(async (e) => e.name + ':' + (e.method === 0 ? Buffer.from(e.data).toString('utf8') : zlib.inflateRawSync(Buffer.from(e.data)).toString('utf8'))));
  const s = all.join('\n');
  assert.ok(!s.includes('Erika') && !s.includes('Max Muster') && !s.includes('Beispiel AG') && !s.includes('"EB"'), s);
  assert.ok(s.includes('<dc:title>Plan</dc:title>') && s.includes('w:author=""'));
});

test('ZIP-Strenge: doppelte Namen, Daten davor, Methode, Verschluesselung, CDATA/DOCTYPE/Entities (Auflagen 5, 6)', async () => {
  const doc = { name: 'word/document.xml', data: DOC(P('Text ' + IBAN)) };
  assert.equal(await codeOf(B.docx(u8(zip([doc, { name: 'word/document.xml', data: DOC(P('x')) }])), find, label)), 'fail');
  const z = Buffer.from(zip([doc]));
  // Daten vor dem ersten Eintrag: Offsets verschoben, Zentralverzeichnis passt nicht mehr.
  assert.equal(await codeOf(B.docx(u8(Buffer.concat([Buffer.from('XXXX'), z])), find, label)), 'fail');
  assert.equal(await codeOf(B.docx(u8(zip([Object.assign({}, doc, { method: 12 })])), find, label)), 'fail');
  assert.equal(await codeOf(B.docx(u8(zip([Object.assign({}, doc, { encrypt: true })])), find, label)), 'encrypted');
  for (const bad of ['<![CDATA[x]]>', '<!DOCTYPE x>', '&nbsp;']) {
    const f = u8(zip([{ name: 'word/document.xml', data: DOC(P('Text ' + IBAN) + bad) }]));
    assert.equal(await codeOf(B.docx(f, find, label)), 'fail', bad);
  }
  // Zwei End-Eintraege
  const eocd = z.subarray(z.length - 22);
  assert.equal(await codeOf(B.docx(u8(Buffer.concat([z, eocd])), find, label)), 'fail');
});

test('PDF-Textfassung: lesbar mit engine/datei.js, ohne Fund, ohne Metadaten, Sonderzeichen (Auflage 7)', async () => {
  const src = u8(pdf(['Titel (Entwurf) \\ Pfad', 'Zahlung an ' + IBAN + ' fuer Müller – ok']));
  const text = await readText(src, 'pdf');
  const goal = DLX.engine.redact(text, await find(text), label);
  // Die Test-PDF-Hilfe schreibt latin1; Zeichen nur aus CP1252 bzw. ausserhalb hier direkt.
  const extra = '\n5 € und ‹Ж›\n' + 'lang '.repeat(200);
  const out = B.pdf(goal + extra);
  const s = Buffer.from(out).toString('latin1');
  assert.ok(!/\/Info|<x:xmpmeta|\/JavaScript|\/OpenAction|\/URI|\/AA/.test(s));
  assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(s), 'nur ASCII');
  const back = await readText(out, 'pdf');
  assert.deepEqual(await ids(back), []);
  for (const w of ['(Entwurf)', '\\ Pfad', 'Müller', '5 € und ‹?›', '[' + label({ cat: 'finanz' }) + ']']) assert.ok(back.includes(w), w + ' in ' + back.slice(0, 300));
  assert.ok(back.replace(/\s+/g, '').length >= 0.9 * (goal + extra).replace(/\s+/g, '').length);
  // Viele Zeilen: mehrere Seiten
  assert.ok((Buffer.from(B.pdf('x\n'.repeat(200))).toString('latin1').match(/\/Type \/Page /g) || []).length >= 3);
});

test('Platzhalter loesen in keiner Sprache einen Erkenner aus (Auflage 2)', async () => {
  for (const lang of Object.keys(DLX.i18n.STRINGS)) {
    const cats = Object.keys(DLX.i18n.STRINGS[lang]).filter((k) => k.startsWith('cat_'));
    const text = cats.map((k) => 'Wert [' + DLX.i18n.t(lang, k) + '] Ende').join('\n');
    assert.deepEqual(await ids(text), [], lang);
  }
});

test('Grosse Dokumente: 5 MB Text unter 1 s geprueft (Zeitscheibe)', async () => {
  const line = 'Protokoll Sitzung Termine Ziele naechste Schritte Projekt Budget Planung ' + 'abc '.repeat(10) + '\n';
  const text = line.repeat(Math.ceil(5 * 1024 * 1024 / line.length) / 10 | 0);   // 0,5 MB je Durchlauf, 10 Durchlaeufe
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) await DLX.stuecke.scan(text, detect);
  const ms = Date.now() - t0;
  assert.ok(ms < 5000, ms + ' ms fuer 5 MB');   // Node ohne Last ~0,3-1 s; Grenze grosszuegig gegen Last
});

test('Quelltext: Knopf und Nachpruefung fail-closed (Auflagen 2, 8, 9)', () => {
  const sw = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  assert.match(sw, /doc: \['cancel', 'redact', 'override'\]/);
  assert.match(sw, /if \(choice === 'redact'\) return real\.length > 0 && \(p\.action === 'warn' \|\| p\.action === 'redact'\) && \(p\.mode !== 'doc' \|\| p\.fix === true\);/);
  assert.match(sw, /if \(msg\.mode === 'doc' && msg\.fix === true && p\.action !== 'block'\) \{ p\.fix = true; p\.loss = msg\.loss === true; \}/);
  const cs = fs.readFileSync(path.join(EXT, 'content/content.js'), 'utf8');
  assert.match(cs, /msg\.choice === 'redact' && p\.kind === 'doc' && p\.fix && !reading\) checkDocs\(p\.fix\.files, p\.deliver, p\.fix\.expect\)/);
  assert.match(cs, /const tooShort = \(text, goal\) => !String\(text\)\.trim\(\) \|\| solid\(String\(text\)\) < 0\.9 \* solid\(goal\);/);
  assert.match(cs, /const fixable = !again && action !== 'block' && !findings\.some\(WHOLE\)/);
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  assert.ok(m.content_scripts[0].js.includes('engine/bereinigen.js'));
  const src = fs.readFileSync(path.join(EXT, 'engine/bereinigen.js'), 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|console\.|chrome\.storage|https?:\/\//.test(src));
});
