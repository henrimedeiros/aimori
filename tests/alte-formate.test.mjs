// RTF und alte Office-Formate (.doc, .xls, .ppt) im Leser engine/datei.js. Nur synthetische
// Dateien und Testwerte; die Behaelter (Compound File Binary) baut der Test selbst.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, ENGINE_FILES } from './helpers/load.mjs';

const DLX = load([...ENGINE_FILES, 'engine/datei.js'], { TextDecoder, DecompressionStream, Uint8Array, DataView, ArrayBuffer });
const D = DLX.datei;
const IBAN = 'CH93 0076 2011 6238 5295 7';
const MAIL = 'max.muster@example.com';
const code = async (p) => { try { await p; return 'ok'; } catch (e) { return e.message; } };
const scanIds = (text) => Array.from(DLX.engine.scan(text, { packs: ['CH', 'finance', 'contact'], rules: {} }).findings, (f) => f.id);
const u8 = (b) => new Uint8Array(b);

test('Art: RTF und alte Office-Formate nach Endung und MIME-Typ', () => {
  for (const [n, k] of [['brief.rtf', 'rtf'], ['alt.DOC', 'doc'], ['liste.xls', 'xls'], ['folien.ppt', 'ppt']]) assert.equal(D.kindOf(n, ''), k, n);
  assert.equal(D.kindOf('x', 'application/msword'), 'doc');
  assert.equal(D.kindOf('x', 'application/vnd.ms-excel'), 'xls');
  assert.equal(D.kindOf('x', 'application/vnd.ms-powerpoint'), 'ppt');
  assert.equal(D.kindOf('x', 'application/rtf'), 'rtf');
});

// --- RTF ----------------------------------------------------------------------
test('RTF: Text, Sonderzeichen, Tabellen; Schrift-, Farb- und Info-Tabellen, Bilder und \\*-Ziele uebersprungen', async () => {
  const rtf = '{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0{\\fonttbl{\\f0\\fswiss Calibri;}{\\f1 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}' +
    '{\\stylesheet{\\s0 Normal;}}{\\info{\\author Erika Musterfrau}{\\title Geheim}}{\\*\\generator Testwerk 1.0;}' +
    '\\pard\\f0 Rechnung f\\\'fcr M\\u252?ller \\endash  30 \\u8364? \\{netto\\}\\par IBAN: ' + IBAN + '\\line Mail\\tab ' + MAIL + '\\par ' +
    '{\\pict\\wmetafile8 0102030405060708}{\\*\\shpinst{\\sp{\\sn x}{\\sv verborgen}}}' +
    '\\trowd Name\\cell Wert\\cell\\row Zeile zwei\\cell 12\\cell\\row \\u-10179?\\u-8704? Ende\\~hier\\par}Nach dem Ende';
  const r = await D.extract(u8(Buffer.from(rtf, 'latin1')), 'rtf');
  assert.equal(r.partial, false);
  assert.deepEqual(r.text.split('\n').filter(Boolean), ['Rechnung für Müller – 30 € {netto}', 'IBAN: ' + IBAN, 'Mail\t' + MAIL, 'Name\tWert\t', 'Zeile zwei\t12\t', '😀 Ende hier']);
  for (const no of ['Calibri', 'Arial', 'Normal', 'Erika', 'Geheim', 'Testwerk', '0102', 'verborgen', 'Nach dem Ende']) assert.ok(!r.text.includes(no), no);
  assert.deepEqual(scanIds(r.text), ['iban', 'email']);
});
test('RTF: \\uc und Ersatzzeichen, \\bin, eingebettetes Objekt = partial, kein RTF = falscher Typ, linear bei tiefer Schachtelung', async () => {
  const r = await D.extract(u8(Buffer.from('{\\rtf1\\uc2 A\\u228 ae B{\\uc0 \\u246 C}\\u252 ue D\\bin4 \\}{\\ E{\\object{\\*\\objdata 0105}{\\result Bild}}\\par}', 'latin1')), 'rtf');
  // Nach \u folgen uc Ersatzzeichen (hier "ae", "ue"), die nicht zum Text gehoeren; \bin4 ueberspringt 4 Bytes.
  assert.equal(r.text.trim(), 'Aä BöCü D EBild');
  assert.equal(r.partial, true);
  assert.equal(await code(D.extract(u8(Buffer.from('Kein RTF {\\rtf1 x}', 'latin1')), 'rtf')), 'type');
  assert.equal(await code(D.extract(u8(Buffer.from('{\\rtf1 }', 'latin1')), 'rtf')), 'empty');
  const deep = '{\\rtf1 ' + '{'.repeat(200000) + 'x' + '}'.repeat(200000) + '}';
  const t0 = Date.now();
  assert.equal((await D.extract(u8(Buffer.from(deep, 'latin1')), 'rtf', 5000)).text, 'x');
  assert.ok(Date.now() - t0 < 3000);
  assert.ok(['empty', 'ok'].includes(await code(D.extract(u8(Buffer.from('{\\rtf1 ' + '\\'.repeat(300000), 'latin1')), 'rtf', 5000))));
});

// --- Compound File Binary: Behaelter fuer die Tests --------------------------------
// streams: [{ name, data }]; Stroeme unter 4096 Bytes liegen im Mini-Strom (64-Byte-Sektoren), groessere in 512-Byte-Sektoren.
function cfbFile(streams, opt = {}) {
  const SS = 512, END = 0xfffffffe, FREE = 0xffffffff;
  const secs = [], fat = [];
  const chain = (buf) => {
    const n = Math.ceil(buf.length / SS);
    const start = n ? secs.length : END;
    for (let i = 0; i < n; i++) { const b = Buffer.alloc(SS); buf.copy(b, 0, i * SS, Math.min(buf.length, (i + 1) * SS)); secs.push(b); fat.push(i === n - 1 ? END : secs.length); }
    return start;
  };
  const mini = [], mfat = [];
  const dir = [{ name: 'Root Entry', type: 5, start: END, size: 0 }];
  for (const s of streams) {
    const data = Buffer.from(s.data);
    if (data.length < 4096) {
      const n = Math.ceil(data.length / 64), start = n ? mfat.length : END;
      for (let i = 0; i < n; i++) { const b = Buffer.alloc(64); data.copy(b, 0, i * 64, Math.min(data.length, (i + 1) * 64)); mini.push(b); mfat.push(i === n - 1 ? END : mfat.length + 1); }
      dir.push({ name: s.name, type: s.type || 2, start, size: data.length });
    } else dir.push({ name: s.name, type: s.type || 2, start: chain(data), size: data.length });
  }
  const miniBuf = Buffer.concat(mini);
  dir[0].start = chain(miniBuf);
  dir[0].size = miniBuf.length;
  const mfBuf = Buffer.alloc(Math.ceil(Math.max(1, mfat.length) / 128) * SS, 0xff);
  mfat.forEach((v, i) => mfBuf.writeUInt32LE(v, i * 4));
  const miniFatStart = chain(mfBuf);
  const dirBuf = Buffer.alloc(Math.ceil(dir.length / 4) * SS);
  dir.forEach((e, i) => {
    const p = i * 128, name = Buffer.from(e.name + '\0', 'utf16le');
    name.copy(dirBuf, p);
    dirBuf.writeUInt16LE(name.length, p + 64);
    dirBuf[p + 66] = e.type;
    dirBuf[p + 67] = 1;
    for (const o of [68, 72, 76]) dirBuf.writeUInt32LE(FREE, p + o);
    dirBuf.writeUInt32LE(e.start, p + 116);
    dirBuf.writeUInt32LE(e.size, p + 120);
  });
  const dirStart = chain(dirBuf);
  let nFat = 1;
  while (nFat * 128 < secs.length + nFat) nFat++;
  const fatStart = secs.length;
  for (let i = 0; i < nFat; i++) fat.push(0xfffffffd);
  if (opt.loop) fat[opt.loop] = opt.loop;   // Kette, die auf sich selbst zeigt
  const fatBuf = Buffer.alloc(nFat * SS, 0xff);
  fat.forEach((v, i) => fatBuf.writeUInt32LE(v, i * 4));
  const head = Buffer.alloc(SS);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(head);
  head.writeUInt16LE(0x3e, 24); head.writeUInt16LE(3, 26); head.writeUInt16LE(0xfffe, 28); head.writeUInt16LE(9, 30); head.writeUInt16LE(6, 32);
  head.writeUInt32LE(nFat, 44); head.writeUInt32LE(dirStart, 48); head.writeUInt32LE(4096, 56); head.writeUInt32LE(miniFatStart, 60); head.writeUInt32LE(mfBuf.length / SS, 64);
  head.writeUInt32LE(END, 68);
  for (let i = 0; i < 109; i++) head.writeUInt32LE(i < nFat ? fatStart + i : FREE, 76 + i * 4);
  return u8(Buffer.concat([head, ...secs, fatBuf]));
}

// --- Word 97-2003 -----------------------------------------------------------------
// Zwei Stuecke: eines als 8-Bit-Text, eines als UTF-16; table = Name des Tabellenstroms.
function docFile(part1, part2, opt = {}) {
  const wd = Buffer.alloc(4096 + part1.length + part2.length * 2);
  wd.writeUInt16LE(0xa5ec, 0);
  wd.writeUInt16LE((opt.table === '0Table' ? 0 : 0x0200) | (opt.encrypted ? 0x0100 : 0), 10);
  const a1 = 2048, a2 = a1 + part1.length + (part1.length % 2);
  Buffer.from(part1, 'latin1').copy(wd, a1);
  Buffer.from(part2, 'utf16le').copy(wd, a2);
  const n = 2, plc = Buffer.alloc((n + 1) * 4 + n * 8);
  plc.writeUInt32LE(0, 0); plc.writeUInt32LE(part1.length, 4); plc.writeUInt32LE(part1.length + part2.length, 8);
  plc.writeUInt32LE(((a1 * 2) | 0x40000000) >>> 0, 12 + 2);
  plc.writeUInt32LE(a2, 12 + 8 + 2);
  const clx = Buffer.concat([Buffer.from([1, 2, 0, 0xaa, 0xbb]), Buffer.from([2]), Buffer.from(Uint32Array.of(plc.length).buffer), plc]);   // erst ein Prc (Laenge 2), dann Pcdt
  const tb = Buffer.concat([Buffer.alloc(100), clx, Buffer.alloc(opt.bigTable ? 5000 : 0)]);
  wd.writeUInt32LE(100, 418);
  wd.writeUInt32LE(clx.length, 422);
  return cfbFile([{ name: 'WordDocument', data: wd }, { name: opt.table || '1Table', data: tb }, ...(opt.extra || [])], opt.cfb);
}
test('DOC: Text aus 8-Bit- und UTF-16-Stuecken, Absatz/Zelle/Feld als Trenner; Tabellenstrom im Mini-Strom und in grossen Sektoren', async () => {
  const p1 = 'Rechnung f\xfcr M\xfcller \x96 ok\rIBAN: ' + IBAN + '\rName\x07Wert\x07\x07', p2 = 'Mail € ' + MAIL + '\x0bZeile\x13 HYPERLINK x \x14Link\x15\rEnde\r';
  for (const opt of [{}, { table: '0Table' }, { bigTable: true }]) {
    const r = await D.extract(docFile(p1, p2, opt), 'doc');
    assert.equal(r.partial, false);
    assert.deepEqual(r.text.split('\n').filter(Boolean), ['Rechnung für Müller – ok', 'IBAN: ' + IBAN, 'Name\tWert\t\tMail € ' + MAIL, 'Zeile  HYPERLINK x  Link ', 'Ende'], JSON.stringify(opt));
    assert.deepEqual(scanIds(r.text), ['iban', 'email']);
  }
});
test('DOC: verschluesselt, eingebettete Objekte, kaputte Dateien enden mit festem Code', async () => {
  assert.equal(await code(D.extract(docFile('Text', 'x', { encrypted: true }), 'doc')), 'encrypted');
  assert.equal((await D.extract(docFile('Text mit Objekt\r', 'x', { extra: [{ name: 'ObjectPool', data: 'x', type: 1 }] }), 'doc')).partial, true);
  assert.equal(await code(D.extract(u8(Buffer.alloc(2048)), 'doc')), 'type', 'kein Behaelter');
  assert.equal(await code(D.extract(cfbFile([{ name: 'Etwas', data: 'x' }]), 'doc')), 'type', 'ohne WordDocument');
  assert.equal(await code(D.extract(cfbFile([{ name: 'WordDocument', data: Buffer.alloc(600) }]), 'doc')), 'type', 'falsche Kennung');
  const cut = docFile('Text', 'x');
  assert.ok(['fail', 'type'].includes(await code(D.extract(cut.subarray(0, cut.length - 700), 'doc'))), 'abgeschnitten');
  // Sektorkette, die auf sich selbst zeigt: das Lesen ist durch die Stromgroesse begrenzt (keine
  // Endlosschleife); heraus kommt ein fester Code, nie ein Text aus dem falschen Sektor als "sauber".
  const t0 = Date.now();
  for (const loop of [1, 2, 5]) assert.equal(await code(D.extract(docFile('Text', 'x', { bigTable: true, cfb: { loop } }), 'doc', 5000)), 'fail', 'Schleife bei Sektor ' + loop);
  assert.ok(Date.now() - t0 < 3000);
});

// --- Excel 97-2003 ------------------------------------------------------------------
const rec = (id, data) => { const h = Buffer.alloc(4); h.writeUInt16LE(id, 0); h.writeUInt16LE(data.length, 2); return Buffer.concat([h, data]); };
const cellHead = (row, col) => { const b = Buffer.alloc(6); b.writeUInt16LE(row, 0); b.writeUInt16LE(col, 2); return b; };
function xlsFile(opt = {}) {
  const str8 = (s) => Buffer.concat([Buffer.from(Uint16Array.of(s.length).buffer), Buffer.from([0]), Buffer.from(s, 'latin1')]);
  const str16 = (s) => Buffer.concat([Buffer.from(Uint16Array.of(s.length).buffer), Buffer.from([1]), Buffer.from(s, 'utf16le')]);
  // SST mit 4 Zeichenketten; die dritte ist formatiert (2 Laeufe), die vierte laeuft in CONTINUE weiter (dort als UTF-16).
  const rich = Buffer.concat([Buffer.from(Uint16Array.of(4).buffer), Buffer.from([8]), Buffer.from(Uint16Array.of(2).buffer), Buffer.from('Fett', 'latin1'), Buffer.alloc(8)]);
  const long = 'Mail ' + MAIL;
  const first = Buffer.concat([Buffer.from(Uint16Array.of(long.length).buffer), Buffer.from([0]), Buffer.from(long.slice(0, 7), 'latin1')]);
  const sst = Buffer.concat([Buffer.from(Uint32Array.of(4, 4).buffer), str8('Name'), str16('IBAN € ' + IBAN), rich, first]);
  const cont = Buffer.concat([Buffer.from([1]), Buffer.from(long.slice(7), 'utf16le')]);
  const lab = (row, col, i) => rec(0x00fd, Buffer.concat([cellHead(row, col), Buffer.from(Uint32Array.of(i).buffer)]));
  const num = (row, col, v) => rec(0x0203, Buffer.concat([cellHead(row, col), Buffer.from(Float64Array.of(v).buffer)]));
  const rk = (row, col, v) => rec(0x027e, Buffer.concat([cellHead(row, col), Buffer.from(Uint32Array.of(v).buffer)]));
  const mul = Buffer.alloc(4 + 12 + 2); mul.writeUInt16LE(2, 0); mul.writeUInt16LE(0, 2); mul.writeUInt32LE((7 << 2) | 2, 6); mul.writeUInt32LE((1250 << 2) | 3, 12); mul.writeUInt16LE(1, 16);
  const formula = Buffer.concat([cellHead(3, 0), Buffer.from(Float64Array.of(0.1 + 0.2).buffer), Buffer.alloc(8)]);
  const bof = rec(0x0809, Buffer.alloc(16));
  const parts = [bof, ...(opt.encrypted ? [rec(0x002f, Buffer.alloc(6))] : []), rec(0x00fc, sst), rec(0x003c, cont), rec(0x000a, Buffer.alloc(0)), bof,
    lab(0, 0, 0), lab(0, 1, 1), lab(0, 2, 2), lab(1, 0, 3), num(1, 1, 4242424242424242), rk(1, 2, (87050 << 2) | 3), rec(0x00bd, mul), rec(0x0006, formula),
    ...(opt.note ? [rec(0x01b6, Buffer.alloc(18))] : []), rec(0x000a, Buffer.alloc(0))];
  return cfbFile([{ name: opt.name || 'Workbook', data: Buffer.concat([...parts, Buffer.alloc(opt.big ? 5000 : 0)]) }]);
}
test('XLS: Zeichenketten (8 Bit, UTF-16, formatiert, ueber CONTINUE), Zahlen (NUMBER, RK, MULRK, Formel), Zeile = Zeile', async () => {
  for (const opt of [{}, { big: true }, { name: 'Book' }]) {
    const r = await D.extract(xlsFile(opt), 'xls');
    assert.equal(r.partial, false);
    assert.deepEqual(r.text.split('\n').filter(Boolean), ['Name\tIBAN € ' + IBAN + '\tFett', 'Mail ' + MAIL + '\t4242424242424242\t870.5', '7\t12.5', '0.3'], JSON.stringify(opt));
    assert.deepEqual(scanIds(r.text).sort(), ['cc_visa', 'email', 'iban']);
  }
});
test('XLS: verschluesselt, Kommentare = partial, kein Workbook-Strom, kein BOF', async () => {
  assert.equal(await code(D.extract(xlsFile({ encrypted: true }), 'xls')), 'encrypted');
  assert.equal((await D.extract(xlsFile({ note: true }), 'xls')).partial, true);
  assert.equal(await code(D.extract(cfbFile([{ name: 'Anderes', data: 'x' }]), 'xls')), 'type');
  assert.equal(await code(D.extract(cfbFile([{ name: 'Workbook', data: Buffer.alloc(64) }]), 'xls')), 'type');
  assert.equal(await code(D.extract(docFile('Text', 'x'), 'xls')), 'type', 'Word-Datei mit falscher Endung');
});

// --- PowerPoint 97-2003 ---------------------------------------------------------------
const atom = (type, data, ver = 0) => { const h = Buffer.alloc(8); h.writeUInt16LE(ver, 0); h.writeUInt16LE(type, 2); h.writeUInt32LE(data.length, 4); return Buffer.concat([h, data]); };
const box = (type, ...kids) => atom(type, Buffer.concat(kids), 15);
test('PPT: Textatome (UTF-16 und 8 Bit) aus verschachtelten Behaeltern, Zeilenwechsel in Texten', async () => {
  const slide = (...texts) => box(1006, box(0xf002, ...texts));
  const pd = Buffer.concat([
    box(1000, atom(0x0fba, Buffer.from('Titel der Datei', 'utf16le'))),
    slide(atom(0x0fa0, Buffer.from('Quartal €\rIBAN ' + IBAN, 'utf16le')), atom(0x0f9f, Buffer.alloc(4)), atom(0x0fa8, Buffer.from('Kontakt ' + MAIL + '\x0bzweite Zeile', 'latin1'))),
    slide(atom(0x0fa8, Buffer.from('Folie zwei', 'latin1'))),
  ]);
  for (const pad of [0, 5000]) {
    const r = await D.extract(cfbFile([{ name: 'PowerPoint Document', data: Buffer.concat([pd, atom(0x0000, Buffer.alloc(pad))]) }, { name: 'Current User', data: 'x' }]), 'ppt');
    assert.equal(r.partial, false);
    assert.deepEqual(r.text.split('\n').filter(Boolean), ['Titel der Datei', 'Quartal €', 'IBAN ' + IBAN, 'Kontakt ' + MAIL, 'zweite Zeile', 'Folie zwei']);
    assert.deepEqual(scanIds(r.text), ['iban', 'email']);
  }
});
test('PPT: verschluesselt, ohne Text = leer, zu tief verschachtelt, falscher Behaelter', async () => {
  const one = (pd, extra = []) => cfbFile([{ name: 'PowerPoint Document', data: pd }, ...extra]);
  assert.equal(await code(D.extract(one(box(1000, atom(0x2f14, Buffer.alloc(8)))), 'ppt')), 'encrypted');
  assert.equal(await code(D.extract(one(atom(0x0fa8, Buffer.from('Text', 'latin1')), [{ name: 'EncryptedSummary', data: 'x' }]), 'ppt')), 'encrypted');
  assert.equal(await code(D.extract(one(box(1000, atom(0x03e9, Buffer.alloc(8)))), 'ppt')), 'empty');
  let deep = atom(0x0fa8, Buffer.from('Text', 'latin1'));
  for (let i = 0; i < 40; i++) deep = box(1000, deep);
  assert.equal(await code(D.extract(one(deep), 'ppt')), 'fail');
  assert.equal(await code(D.extract(xlsFile(), 'ppt')), 'type');
});

test('Quelltext: Service Worker und Hintergrunddokument lassen die neuen Arten zu, sonst nichts', async () => {
  const fs = await import('node:fs');
  const sw = fs.readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  assert.match(sw, /const DOC_KINDS = \['pdf', 'docx', 'pptx', 'odf', 'rtf', 'doc', 'xls', 'ppt'\];/);
  const od = fs.readFileSync(new URL('../extension/ui/dokument.js', import.meta.url), 'utf8');
  assert.match(od, /const KINDS = \['pdf', 'docx', 'xlsx', 'pptx', 'odf', 'rtf', 'doc', 'xls', 'ppt', 'text'\];/);
});
