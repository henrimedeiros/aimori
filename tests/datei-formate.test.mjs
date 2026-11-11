// Weitere Dateiformate im Leser (engine/datei.js): PowerPoint (PPTX), OpenDocument
// (ODT/ODS/ODP), PDF-Stroeme mit ASCIIHex, ASCII85, RunLength, LZW und Filterketten,
// Zeilenumbruch und Tab in Word in der Kurzform. Nur synthetische Dateien und Testwerte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { load, ENGINE_FILES } from './helpers/load.mjs';
import { zip } from './helpers/dokumente.mjs';

const DLX = load([...ENGINE_FILES, 'engine/datei.js', 'engine/bereinigen.js'], { TextDecoder, DecompressionStream, CompressionStream, Uint8Array });
const D = DLX.datei;
const IBAN = 'CH93 0076 2011 6238 5295 7';
const MAIL = 'max.muster@example.com';
const code = async (p) => { try { await p; return 'ok'; } catch (e) { return e.message; } };
const scanIds = (text) => Array.from(DLX.engine.scan(text, { packs: ['CH', 'finance', 'contact'], rules: {} }).findings, (f) => f.id);

test('Art: PowerPoint und OpenDocument nach Endung und MIME-Typ', () => {
  assert.equal(D.kindOf('Folien.PPTX', ''), 'pptx');
  assert.equal(D.kindOf('x', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'), 'pptx');
  for (const n of ['brief.odt', 'liste.ods', 'folien.odp']) assert.equal(D.kindOf(n, ''), 'odf', n);
  assert.equal(D.kindOf('x', 'application/vnd.oasis.opendocument.text'), 'odf');
  assert.equal(D.kindOf('alt.ppt', 'application/vnd.ms-powerpoint'), 'ppt', 'altes Binaerformat: eigener Leser (tests/alte-formate.test.mjs)');
  assert.equal(D.kindOf('vorlage.pot', 'application/octet-stream'), null, 'unbekannte Endung bleibt aussen vor');
});

// --- Word: Kurzform <w:br/> und <w:tab/> ------------------------------------
test('DOCX: Zeilenumbruch und Tab in der Kurzform trennen Werte (kein Verkleben mit dem naechsten Wort)', async () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>IBAN ' + IBAN + '</w:t><w:br/><w:t>Telefon</w:t><w:tab/><w:t>079</w:t><w:br w:type="page"/><w:t>Ende</w:t><w:cr/><w:t>X</w:t></w:r></w:p></w:body></w:document>';
  const r = await D.extract(zip([{ name: 'word/document.xml', data: xml }]), 'docx');
  assert.equal(r.text.trimEnd(), 'IBAN ' + IBAN + '\nTelefon\t079\nEnde\nX');
  assert.deepEqual(scanIds(r.text), ['iban']);
  // Bereinigen liest denselben Text (gleiche Lage der Stuecke).
  assert.equal(DLX.bereinigen.segments(xml).text.trimEnd(), r.text.trimEnd());
});

// --- PowerPoint -------------------------------------------------------------
const slide = (...paras) => '<p:sld><p:cSld><p:spTree><p:sp><p:txBody>' + paras.map((p) => '<a:p><a:r><a:rPr lang="de-CH"/><a:t>' + p + '</a:t></a:r></a:p>').join('') + '</p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
test('PPTX: Text aus Folien in Reihenfolge, dann Notizen und Kommentare', async () => {
  const file = zip([
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: 'ppt/presentation.xml', data: '<p:presentation/>' },
    { name: 'ppt/slides/slide10.xml', data: slide('Folie zehn') },
    { name: 'ppt/slides/slide2.xml', data: slide('Kontakt ' + MAIL, 'Zeile A</a:t></a:r><a:br/><a:r><a:t>Zeile B') },
    { name: 'ppt/slides/slide1.xml', data: slide('Titel &amp; Zahlen', 'IBAN ' + IBAN) },
    { name: 'ppt/notesSlides/notesSlide1.xml', data: slide('Notiz: AHV 756.1234.5678.97') },
    { name: 'ppt/comments/modernComment_1_0.xml', data: '<p188:cmLst><p188:cm><p188:txBody><a:p><a:r><a:t>Kommentar hier</a:t></a:r></a:p></p188:txBody></p188:cm></p188:cmLst>' },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: slide('Vorlagentext zaehlt nicht') },
  ]);
  const r = await D.extract(file, 'pptx');
  assert.equal(r.partial, false);
  const lines = r.text.split('\n').filter(Boolean);
  assert.deepEqual(lines, ['Titel & Zahlen', 'IBAN ' + IBAN, 'Kontakt ' + MAIL, 'Zeile A', 'Zeile B', 'Folie zehn', 'Notiz: AHV 756.1234.5678.97', 'Kommentar hier']);
  assert.deepEqual(scanIds(r.text).sort(), ['ch_ahv', 'email', 'iban']);
});
test('PPTX: ohne Folien = falscher Typ, nur leere Folien = leer, eingebettete Objekte = partial, verschluesselt', async () => {
  assert.equal(await code(D.extract(zip([{ name: 'ppt/presentation.xml', data: '<p/>' }]), 'pptx')), 'type');
  assert.equal(await code(D.extract(zip([{ name: 'ppt/slides/slide1.xml', data: '<p:sld/>' }]), 'pptx')), 'empty');
  const emb = await D.extract(zip([{ name: 'ppt/slides/slide1.xml', data: slide('Text') }, { name: 'ppt/embeddings/oleObject1.bin', data: 'x' }]), 'pptx');
  assert.equal(emb.partial, true);
  assert.equal(await code(D.extract(zip([{ name: 'ppt/slides/slide1.xml', data: slide('Text'), encrypt: true }]), 'pptx')), 'encrypted');
  assert.equal(await code(D.extract(zip([{ name: 'word/document.xml', data: '<w:document/>' }]), 'pptx')), 'type', 'Word-Datei mit falscher Endung');
  // SmartArt-Text wird gelesen; ein Diagramm (Werte nicht als a:t) macht die Datei "partial", nie still sauber.
  const art = await D.extract(zip([{ name: 'ppt/slides/slide1.xml', data: slide('Text') }, { name: 'ppt/diagrams/data1.xml', data: '<dgm:dataModel><a:p><a:r><a:t>IBAN ' + IBAN + '</a:t></a:r></a:p></dgm:dataModel>' }]), 'pptx');
  assert.deepEqual([art.partial, scanIds(art.text)], [false, ['iban']]);
  const chart = await D.extract(zip([{ name: 'ppt/slides/slide1.xml', data: slide('Text') }, { name: 'ppt/charts/chart1.xml', data: '<c:chartSpace><c:v>Max Muster</c:v></c:chartSpace>' }]), 'pptx');
  assert.equal(chart.partial, true);
});

// --- OpenDocument -----------------------------------------------------------
const odf = (body, extra = []) => zip([
  { name: 'mimetype', data: 'application/vnd.oasis.opendocument.text', store: true },
  { name: 'content.xml', data: '<?xml version="1.0"?><office:document-content><office:automatic-styles><style:style style:name="P1"/></office:automatic-styles><office:body>' + body + '</office:body></office:document-content>' },
  ...extra,
]);
test('ODT: Absaetze, Tab, Leerzeichen, Zeilenumbruch, Entities; Kopfzeile aus styles.xml', async () => {
  const body = '<office:text><text:h text:outline-level="1">Titel &amp; mehr</text:h><text:p text:style-name="P1">IBAN<text:s/>' + IBAN + '<text:line-break/>Mail<text:tab/>' + MAIL + '</text:p>' +
    '<text:p>Bild<draw:image><office:binary-data>QUJDREVGR0g=</office:binary-data></draw:image>danach</text:p></office:text>';
  const styles = '<office:document-styles><office:styles><style:style style:name="Standard"/></office:styles><office:master-styles><style:master-page><style:header><text:p>Kopf AHV 756.1234.5678.97</text:p></style:header></style:master-page></office:master-styles></office:document-styles>';
  const r = await D.extract(odf(body, [{ name: 'styles.xml', data: styles }]), 'odf');
  assert.equal(r.partial, false);
  assert.deepEqual(r.text.split('\n').filter(Boolean), ['Titel & mehr', 'IBAN ' + IBAN, 'Mail\t' + MAIL, 'Bilddanach', 'Kopf AHV 756.1234.5678.97']);
  assert.ok(!r.text.includes('QUJD'), 'eingebettete Binaerdaten sind kein Text');
  assert.deepEqual(scanIds(r.text).sort(), ['ch_ahv', 'email', 'iban']);
});
test('ODS: Zeile = Zeile, Zelle = Tab', async () => {
  const cell = (v) => '<table:table-cell office:value-type="string"><text:p>' + v + '</text:p></table:table-cell>';
  const body = '<office:spreadsheet><table:table table:name="Blatt1"><table:table-row>' + cell('Name') + cell('IBAN') + '</table:table-row><table:table-row>' + cell('Max') + cell(IBAN) + '</table:table-row></table:table></office:spreadsheet>';
  const r = await D.extract(odf(body), 'odf');
  assert.ok(r.text.includes('Name\n\tIBAN') || r.text.includes('Name'), 'Kopfzeile gelesen');
  assert.ok(new RegExp('Max\\s+' + IBAN.replace(/ /g, ' ')).test(r.text), 'Zellen getrennt');
  assert.deepEqual(scanIds(r.text), ['iban']);
});
test('ODF: verschluesselt, ohne content.xml, ohne Text, eingebettetes Objekt', async () => {
  const enc = odf('<office:text><text:p>x</text:p></office:text>', [{ name: 'META-INF/manifest.xml', data: '<manifest:manifest><manifest:file-entry manifest:full-path="content.xml"><manifest:encryption-data/></manifest:file-entry></manifest:manifest>' }]);
  assert.equal(await code(D.extract(enc, 'odf')), 'encrypted');
  assert.equal(await code(D.extract(zip([{ name: 'mimetype', data: 'x' }]), 'odf')), 'type');
  assert.equal(await code(D.extract(odf('<office:text><text:p/></office:text>'), 'odf')), 'empty');
  const emb = await D.extract(odf('<office:text><text:p>Text</text:p></office:text>', [{ name: 'Object 1/content.xml', data: '<x/>' }]), 'odf');
  assert.equal(emb.partial, true);
  // Viele offene Tags ohne Ende bleiben linear und enden mit einem festen Code.
  assert.ok(['empty', 'ok'].includes(await code(D.extract(odf('<office:text>' + '<text:p'.repeat(200000)), 'odf', 5000))));
});

// --- PDF-Stromfilter --------------------------------------------------------
const a85 = (buf) => {
  let out = '';
  for (let i = 0; i < buf.length; i += 4) {
    const n = Math.min(4, buf.length - i);
    let v = 0;
    for (let k = 0; k < 4; k++) v = v * 256 + (k < n ? buf[i + k] : 0);
    if (n === 4 && v === 0) { out += 'z'; continue; }
    let s = '';
    for (let k = 0; k < 5; k++) { s = String.fromCharCode(33 + (v % 85)) + s; v = Math.floor(v / 85); }
    out += s.slice(0, n + 1);
    if (i % 60 === 56) out += '\n';
  }
  return Buffer.from(out + '~>', 'latin1');
};
const rle = (buf) => {
  const out = [];
  for (let i = 0; i < buf.length;) {
    let run = 1;
    while (i + run < buf.length && buf[i + run] === buf[i] && run < 128) run++;
    if (run > 2) { out.push(257 - run, buf[i]); i += run; continue; }
    const n = Math.min(128, buf.length - i);
    out.push(n - 1, ...buf.subarray(i, i + n));
    i += n;
  }
  out.push(128);
  return Buffer.from(out);
};
// LZW-Kodierer nach ISO 32000-1 (7.4.4): 9-12 Bit, EarlyChange 1 (Standard) oder 0.
const lzwEnc = (buf, early = 1) => {
  const out = [];
  let acc = 0, nb = 0, bits = 9, next = 258, dict = new Map(), w = '';
  const put = (c) => { acc = (acc << bits) | c; nb += bits; while (nb >= 8) { out.push((acc >>> (nb - 8)) & 255); nb -= 8; } acc &= (1 << nb) - 1; };
  const codeOf = (s) => (s.length === 1 ? s.charCodeAt(0) : dict.get(s));
  put(256);
  for (const b of buf) {
    const c = String.fromCharCode(b);
    if (!w || dict.has(w + c)) { w += c; continue; }
    put(codeOf(w));
    dict.set(w + c, next++);
    if (next + early > 4094) { put(256); dict = new Map(); next = 258; bits = 9; } else if (next + early === (1 << bits) + 1 && bits < 12) bits++;
    w = c;
  }
  if (w) put(codeOf(w));
  put(257);
  if (nb) out.push((acc << (8 - nb)) & 255);
  return Buffer.from(out);
};
const pdfWith = (filter, data, parms) => {
  const head = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n' +
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n' +
    '4 0 obj\n<< /Filter ' + filter + (parms ? ' /DecodeParms ' + parms : '') + ' /Length ' + data.length + ' >>\nstream\n';
  return new Uint8Array(Buffer.concat([Buffer.from(head, 'latin1'), data, Buffer.from('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1')]));
};
// Inhalt lang genug, dass LZW die Codebreiten 10, 11 und 12 Bit erreicht und die Tabelle leert.
const LINES = Array.from({ length: 900 }, (_, i) => 'Zeile ' + i + ' Wert ' + ((i * 7919) % 100003) + ' Text ' + 'abcdefghij'.slice(i % 7) + (i === 450 ? ' IBAN ' + IBAN : ''));
const CONTENT = Buffer.from('BT /F1 12 Tf 14 TL 72 720 Td\n' + LINES.map((l, i) => (i ? 'T* ' : '') + '(' + l + ') Tj').join('\n') + '\nET', 'latin1');
const expectText = async (file, how) => {
  const r = await D.extract(file, 'pdf');
  assert.equal(r.partial, false, how);
  assert.deepEqual(r.text.split('\n').map((l) => l.trim()).filter(Boolean), LINES, how);
  assert.deepEqual(scanIds(r.text), ['iban'], how);
};
test('PDF: ASCIIHex, ASCII85, RunLength und LZW (EarlyChange 1 und 0) ergeben denselben Text', async () => {
  await expectText(pdfWith('/ASCIIHexDecode', Buffer.from(CONTENT.toString('hex').replace(/(.{64})/g, '$1\n') + '>', 'latin1')), 'ASCIIHex');
  await expectText(pdfWith('/ASCII85Decode', a85(CONTENT)), 'ASCII85');
  await expectText(pdfWith('/RunLengthDecode', rle(CONTENT)), 'RunLength');
  await expectText(pdfWith('/LZWDecode', lzwEnc(CONTENT)), 'LZW');
  await expectText(pdfWith('/LZWDecode', lzwEnc(CONTENT, 0), '<< /EarlyChange 0 >>'), 'LZW EarlyChange 0');
  await expectText(pdfWith('[/LZWDecode]', lzwEnc(CONTENT, 0), '[<< /EarlyChange 0 >>]'), 'DecodeParms als Feld');
});
test('PDF: Filterketten (ASCII85 + Flate, ASCIIHex + LZW) und Kurznamen', async () => {
  await expectText(pdfWith('[/ASCII85Decode /FlateDecode]', a85(zlib.deflateSync(CONTENT))), 'ASCII85 + Flate');
  await expectText(pdfWith('[/ASCIIHexDecode /LZWDecode]', Buffer.from(lzwEnc(CONTENT).toString('hex') + '>', 'latin1')), 'ASCIIHex + LZW');
  await expectText(pdfWith('[/A85 /Fl]', a85(zlib.deflateSync(CONTENT))), 'Kurznamen');
});
test('PDF: LZW-Beispiel aus ISO 32000-1 (7.4.4.2)', async () => {
  // Codes 256 45 258 258 65 259 66 257 zu je 9 Bit = Bytes 80 0B 60 50 22 0C 0C 85 01; Ergebnis "-----A---B".
  const data = Buffer.from([0x80, 0x0b, 0x60, 0x50, 0x22, 0x0c, 0x0c, 0x85, 0x01]);
  const want = Buffer.from('BT (-----A---B) Tj ET', 'latin1');
  const r = await D.extract(pdfWith('/LZWDecode', lzwEnc(want)), 'pdf');
  assert.equal(r.text.trim(), '-----A---B');
  assert.deepEqual([...lzwEnc(Buffer.from('-----A---B', 'latin1'))], [...data], 'Kodierer der Tests trifft das Normbeispiel');
});
test('PDF: kaputte und unbekannte Filter enden mit festem Code bzw. partial, nie mit falschem "sauber"', async () => {
  assert.equal(await code(D.extract(pdfWith('/ASCIIHexDecode', Buffer.from('zz>', 'latin1')), 'pdf')), 'fail');
  assert.equal(await code(D.extract(pdfWith('/ASCII85Decode', Buffer.from('abc{~>', 'latin1')), 'pdf')), 'fail');
  assert.equal(await code(D.extract(pdfWith('/LZWDecode', Buffer.from([0x80, 0x7f, 0xc0])), 'pdf')), 'fail', 'Code 511 direkt nach dem Leeren der Tabelle');
  // Unbekannter Filter bzw. LZW mit Praediktor: Seite ohne Text -> leer (kein Text) statt sauber.
  assert.equal(await code(D.extract(pdfWith('/JBIG2Decode', CONTENT), 'pdf')), 'empty');
  assert.equal(await code(D.extract(pdfWith('/LZWDecode', lzwEnc(CONTENT), '<< /Predictor 12 /Columns 4 >>'), 'pdf')), 'empty');
  // RunLength-Bombe: 1 MB Eingabe -> ueber der Entpack-Grenze (60 MB) = size.
  const bomb = Buffer.alloc(1024 * 1024);
  for (let i = 0; i < bomb.length; i += 2) { bomb[i] = 129; bomb[i + 1] = 65; }
  assert.equal(await code(D.extract(pdfWith('/RunLengthDecode', bomb), 'pdf')), 'size');
});
