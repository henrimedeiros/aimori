// Dokumente lokal lesen (Design-Review A-D 16.10.2026, Auflagen 9-16): Text aus
// PDF/DOCX/XLSX/TXT/CSV, Grenzen beim Streamen, kaputte und bombenartige Dateien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { load, ENGINE_FILES } from './helpers/load.mjs';
import { zip, docx, xlsx, pdf } from './helpers/dokumente.mjs';

const DLX = load([...ENGINE_FILES, 'engine/datei.js'], { TextDecoder, DecompressionStream, Uint8Array });
const D = DLX.datei;
const IBAN = 'CH93 0076 2011 6238 5295 7';
const MAIL = 'max.muster@example.com';
const code = async (p) => { try { await p; return 'ok'; } catch (e) { return e.message; } };
const scanIds = (text) => Array.from(DLX.engine.scan(text, { packs: ['CH', 'finance', 'contact', 'secrets'], rules: {} }).findings, (f) => f.id);

test('Art: Endung vor MIME-Typ, nur die fuenf Formate', () => {
  assert.equal(D.kindOf('Bericht.PDF', ''), 'pdf');
  assert.equal(D.kindOf('a.docx', 'application/octet-stream'), 'docx');
  assert.equal(D.kindOf('a.xlsx', ''), 'xlsx');
  assert.equal(D.kindOf('liste.csv', ''), 'text');
  assert.equal(D.kindOf('notiz', 'text/plain'), 'text');
  assert.equal(D.kindOf('bild.png', 'image/png'), null);
  assert.equal(D.kindOf('alt.doc', 'application/msword'), null);
});

test('TXT/CSV: UTF-8, UTF-16 mit BOM und Windows-1252', async () => {
  const r = await D.extract(new Uint8Array(Buffer.from('Name;IBAN\nMax;' + IBAN + '\n')), 'text');
  assert.ok(r.text.includes(IBAN));
  assert.deepEqual(scanIds(r.text), ['iban']);
  const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Mail ' + MAIL, 'utf16le')]);
  assert.ok((await D.extract(new Uint8Array(u16), 'text')).text.includes(MAIL));
  assert.equal((await D.extract(new Uint8Array([0x47, 0x72, 0xfc, 0x65, 0x7a, 0x69]), 'text')).text, 'Grüezi');
});

test('DOCX: Absaetze, Kopfzeile, Entities; eingebettetes Objekt = teilweise', async () => {
  const b = docx(['Rechnung an Kunde', 'IBAN ' + IBAN + ' &amp; Mail ' + MAIL], [
    { name: 'word/header1.xml', data: '<w:hdr><w:p><w:r><w:t>Kopf &#252;ber</w:t></w:r></w:p></w:hdr>' },
  ]);
  const r = await D.extract(b, 'docx');
  assert.ok(r.text.includes(IBAN) && r.text.includes(MAIL) && r.text.includes('Kopf über'), r.text);
  assert.equal(r.partial, false);
  assert.deepEqual(scanIds(r.text).sort(), ['email', 'iban']);
  const emb = await D.extract(docx(['Text'], [{ name: 'word/embeddings/oleObject1.bin', data: 'x' }]), 'docx');
  assert.equal(emb.partial, true);
});

test('XLSX: Shared Strings, Inline-Strings und Zahlenwerte', async () => {
  const r = await D.extract(xlsx([['Name', 'IBAN', 'Nummer'], ['Max', IBAN, 4242424242424242], [{ inline: MAIL }]]), 'xlsx');
  assert.ok(r.text.includes(IBAN) && r.text.includes(MAIL) && r.text.includes('4242424242424242'), r.text);
  assert.ok(scanIds(r.text).includes('iban') && scanIds(r.text).includes('email'));
});

test('ZIP: verschluesselt, ZIP64-Marke, fremde Methode, Groessen-Widerspruch, kaputt -> Fehlercode', async () => {
  assert.equal(await code(D.extract(zip([{ name: 'word/document.xml', data: '<w:t>x</w:t>', encrypt: true }]), 'docx')), 'encrypted');
  assert.equal(await code(D.extract(zip([{ name: 'word/document.xml', data: '<w:t>x</w:t>', method: 12 }]), 'docx')), 'fail');
  assert.equal(await code(D.extract(zip([{ name: 'word/document.xml', data: '<w:p><w:t>x</w:t></w:p>', usize: 999 }]), 'docx')), 'fail');
  const z64 = docx(['x']);
  const eocd = Buffer.from(z64).lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  z64[eocd + 10] = 0xff; z64[eocd + 11] = 0xff;
  assert.equal(await code(D.extract(z64, 'docx')), 'fail');
  assert.equal(await code(D.extract(new Uint8Array(Buffer.from('kein zip')), 'docx')), 'type');
  assert.equal(await code(D.extract(zip([{ name: 'xl/workbook.xml', data: '<x/>' }]), 'xlsx')), 'type');
  const cut = docx(['IBAN ' + IBAN]).slice(0, 60);
  assert.notEqual(await code(D.extract(cut, 'docx')), 'ok');
});

test('ZIP-Bombe: Abbruch beim Entpacken ueber 60 MB, nicht erst danach (Auflage 9)', async () => {
  const big = Buffer.alloc(70 * 1024 * 1024, 0x41);
  const comp = zlib.deflateRawSync(big);
  // Echte Groesse im Verzeichnis: verworfen vor dem Entpacken; gelogene Groesse: Abbruch im Strom.
  const honest = zip([{ name: 'word/document.xml', data: big }]);
  assert.equal(await code(D.extract(honest, 'docx')), 'size');
  const lying = zip([{ name: 'word/document.xml', data: big, usize: 1000 }]);
  const t0 = Date.now();
  assert.equal(await code(D.extract(lying, 'docx')), 'size');
  assert.ok(Date.now() - t0 < 5000);
  assert.ok(comp.length < 200000);
  assert.equal(await code(D.extract(new Uint8Array(21 * 1024 * 1024), 'pdf')), 'size');
});

test('Zu viele ZIP-Eintraege -> size', async () => {
  const files = Array.from({ length: 2001 }, (_, i) => ({ name: 'f' + i, data: '', store: true }));
  assert.equal(await code(D.extract(zip(files), 'docx')), 'size');
});

test('PDF: einfache Schrift, mehrere Seiten, Zeilen', async () => {
  const r = await D.extract(pdf(['Rechnung', 'IBAN ' + IBAN + '\nMail ' + MAIL]), 'pdf');
  assert.ok(r.text.includes(IBAN) && r.text.includes(MAIL), r.text);
  assert.equal(r.partial, false);
  assert.deepEqual(scanIds(r.text).sort(), ['email', 'iban']);
});

test('PDF: Identity-H mit ToUnicode, Objektstrom, Form-XObject, unkomprimiert', async () => {
  for (const opts of [{ cid: true }, { cid: true, objstm: true }, { form: true }, { flate: false }, { cid: true, objstm: true, form: true }]) {
    const r = await D.extract(pdf(['IBAN ' + IBAN], opts), 'pdf');
    assert.ok(r.text.includes(IBAN), JSON.stringify(opts) + ': ' + r.text);
    assert.equal(r.partial, false, JSON.stringify(opts));
  }
});

test('PDF: verschluesselt, ohne Text, CID ohne ToUnicode, kein PDF (Auflage 12: leer ist nie sauber)', async () => {
  assert.equal(await code(D.extract(pdf(['IBAN ' + IBAN], { encrypt: true }), 'pdf')), 'encrypted');
  assert.equal(await code(D.extract(pdf(['']), 'pdf')), 'empty');
  assert.equal(await code(D.extract(pdf(['Text'], { cid: true, noToUnicode: true }), 'pdf')), 'empty');
  const mixed = await D.extract(pdf(['IBAN ' + IBAN, '']), 'pdf');
  assert.equal(mixed.partial, true, 'Seite ohne Text = teilweise');
  assert.equal(await code(D.extract(new Uint8Array(Buffer.from('hallo')), 'pdf')), 'type');
});

test('PDF: Anhang = teilweise; Zyklus in Form-XObjects endet', async () => {
  const b = Buffer.from(pdf(['IBAN ' + IBAN]));
  const withAttach = Buffer.concat([b.subarray(0, b.length - 6), Buffer.from('99 0 obj\n<< /Type /EmbeddedFile >>\nendobj\n%%EOF\n', 'latin1')]);
  assert.equal((await D.extract(new Uint8Array(withAttach), 'pdf')).partial, true);
  const loop = '%PDF-1.4\n1 0 obj << /Type /Page /Resources << /XObject << /X 2 0 R >> >> /Contents 3 0 R >> endobj\n'
    + '2 0 obj << /Subtype /Form /Resources << /XObject << /X 2 0 R >> >> /Length 6 >>\nstream\n/X Do\nendstream endobj\n'
    + '3 0 obj << /Length 22 >>\nstream\nBT (Hallo) Tj ET /X Do\nendstream endobj\n';
  const r = await D.extract(new Uint8Array(Buffer.from(loop, 'latin1')), 'pdf');
  assert.ok(r.text.includes('Hallo'));
});

test('Pathologische Eingaben bleiben schnell (Auflage 10)', async () => {
  const cases = [
    Buffer.from('%PDF-1.4\n' + '1 0 obj << '.repeat(20000), 'latin1'),
    Buffer.from('%PDF-1.4\n1 0 obj << /Length 9 >>\nstream\n' + '('.repeat(300000) + '\nendstream endobj', 'latin1'),
    Buffer.from('%PDF-1.4\n' + '[['.repeat(100000), 'latin1'),
    Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page /Contents 2 0 R >>\nendobj\n2 0 obj << /Length 1 >>\nstream\n' + '<'.repeat(200000) + '\nendstream endobj', 'latin1'),
  ];
  for (const c of cases) {
    const t0 = Date.now();
    await code(D.extract(new Uint8Array(c), 'pdf'));
    assert.ok(Date.now() - t0 < 3000, 'zu langsam: ' + (Date.now() - t0));
  }
  // Nicht geschlossene Abschnitte in XLSX und CMap (Auflage Pflicht-Pruefung 16.10.2026).
  const opens = [
    zip([{ name: 'xl/sharedStrings.xml', data: '<sst>' + '<si>'.repeat(200000) }, { name: 'xl/worksheets/sheet1.xml', data: '<row><c r="A1"><v>1</v></c></row>' }]),
    zip([{ name: 'xl/worksheets/sheet1.xml', data: '<sheetData>' + '<row>'.repeat(200000) }]),
    zip([{ name: 'xl/worksheets/sheet1.xml', data: '<sheetData><row>' + '<c r="A1">'.repeat(200000) + '</row>' }]),
  ];
  for (const z of opens) {
    const t1 = Date.now();
    await code(D.extract(z, 'xlsx'));
    assert.ok(Date.now() - t1 < 3000, 'xlsx zu langsam: ' + (Date.now() - t1));
  }
  const cm = '%PDF-1.4\n1 0 obj << /Type /Page /Resources << /Font << /F1 2 0 R >> >> /Contents 4 0 R >> endobj\n'
    + '2 0 obj << /Type /Font /Subtype /Type0 /Encoding /Identity-H /ToUnicode 3 0 R >> endobj\n'
    + '3 0 obj << >>\nstream\n' + 'beginbfchar <0001> <0041>\n'.repeat(100000) + '\nendstream endobj\n'
    + '4 0 obj << >>\nstream\nBT /F1 12 Tf <0001> Tj ET\nendstream endobj\n';
  const t2 = Date.now();
  await code(D.extract(new Uint8Array(Buffer.from(cm, 'latin1')), 'pdf'));
  assert.ok(Date.now() - t2 < 3000, 'cmap zu langsam: ' + (Date.now() - t2));
  const xml = '<w:p>' + '<w:t>'.repeat(100000);
  const t0 = Date.now();
  await code(D.extract(docx([xml.slice(0, 10)], [{ name: 'word/footnotes.xml', data: xml }]), 'docx'));
  assert.ok(Date.now() - t0 < 3000);
});

test('Zufalls-Korpus: kaputte und abgeschnittene Dateien werfen nur feste Codes', async () => {
  const seeds = [docx(['IBAN ' + IBAN]), xlsx([['IBAN', IBAN]]), pdf(['IBAN ' + IBAN], { cid: true, objstm: true })];
  let x = 12345;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x; };
  for (let i = 0; i < 90; i++) {
    const s = seeds[i % 3];
    const b = new Uint8Array(s);
    for (let k = 0; k < 1 + (i % 7); k++) b[rnd() % b.length] = rnd() & 255;
    const cut = i % 2 ? b.slice(0, rnd() % b.length) : b;
    const kind = ['docx', 'xlsx', 'pdf'][i % 3];
    try { const r = await D.extract(cut, kind); assert.equal(typeof r.text, 'string'); } catch (e) { assert.ok(D.CODES.includes(e.message), e.message); }
  }
});
