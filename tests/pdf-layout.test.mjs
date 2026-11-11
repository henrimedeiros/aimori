// PDF: Werte in der Original-Datei ueberdecken (Layout bleibt), Selbstkontrolle und Restpruefung,
// dazu der Leser: Luecke oder Fortsetzung zwischen Textstuecken nach Zeichenbreiten, Seiten in der
// Reihenfolge des Seitenbaums. Nur synthetische Dateien und Testwerte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { load, ENGINE_FILES } from './helpers/load.mjs';
import { pdf } from './helpers/dokumente.mjs';

const DLX = load([...ENGINE_FILES, 'engine/datei.js'], { TextDecoder, DecompressionStream, Uint8Array });
const D = DLX.datei;
const IBAN = 'CH93 0076 2011 6238 5295 7';
const MAIL = 'max.muster@example.com';
const CFG = { packs: ['CH', 'finance', 'contact'], rules: {} };
const find = async (t) => Array.from(DLX.engine.scan(t, CFG).findings).filter((f) => !f.meta);
const code = async (p) => { try { await p; return 'ok'; } catch (e) { return e.message; } };
const solid = (s) => s.replace(/\s+/g, '');
// Alle Stroeme entpackt + Rohbytes: darin darf ein ueberdeckter Wert nirgends mehr stehen.
const everything = (bytes) => {
  const b = Buffer.from(bytes);
  let all = b.toString('latin1');
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(all.slice(0, b.length)))) {
    const end = b.indexOf('endstream', m.index);
    if (end < 0) break;
    try { all += '\n' + zlib.inflateSync(b.subarray(m.index + m[0].length, end)).toString('latin1'); } catch (e) { /* nicht komprimiert */ }
  }
  return all;
};
async function mask(file, extra) {
  const r = await D.extract(file, 'pdf');
  const f = await find(r.text);
  const m = await D.pdfMask(file, r.text, f.map((x) => [x.start, x.end]).concat(extra || []), find, 10000);
  return { before: r, f, m, after: await D.extract(m.bytes, 'pdf') };
}

// Eigene kleine PDF: objs = Texte der Objekte 1..n ('' = auslassen), Stroeme als { dict, data }.
function build(objs, trailer = '<< /Root 1 0 R >>') {
  const parts = [Buffer.from('%PDF-1.7\n', 'latin1')];
  objs.forEach((o, i) => {
    if (!o) return;
    if (typeof o === 'string') parts.push(Buffer.from((i + 1) + ' 0 obj\n' + o + '\nendobj\n', 'latin1'));
    else {
      const data = Buffer.from(o.data, 'latin1');
      parts.push(Buffer.from((i + 1) + ' 0 obj\n' + o.dict.replace('>>', ' /Length ' + data.length + ' >>') + '\nstream\n', 'latin1'), data, Buffer.from('\nendstream\nendobj\n', 'latin1'));
    }
  });
  parts.push(Buffer.from('trailer\n' + trailer + '\n%%EOF\n', 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}
const FONT = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
// Schrift mit Breiten: jedes Zeichen 500 (ein halber Schriftgrad).
const FONT_W = '<< /Type /Font /Subtype /TrueType /BaseFont /Mono /FirstChar 32 /LastChar 126 /Widths [' + Array(95).fill(500).join(' ') + '] /Encoding /WinAnsiEncoding >>';
const page = (content, kids = '[3 0 R]', font = FONT) => [
  '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids ' + kids + ' /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', { dict: '<< >>', data: content }, font,
];

// --- Ueberdecken --------------------------------------------------------------
const PAGES = ['Rechnung an Frau Muster\nIBAN ' + IBAN + ' bitte\nMail ' + MAIL + '.', 'Seite zwei ohne Daten'];
for (const [name, opts] of [['einfache Schrift', {}], ['ohne Kompression', { flate: false }], ['CID-Schrift mit ToUnicode', { cid: true }], ['Text in Form-XObject', { form: true }], ['Schrift im Objektstrom', { objstm: true }]]) {
  test('Ueberdecken: ' + name + ' - Werte weg, uebriger Text und Aufbau bleiben', async () => {
    const file = pdf(PAGES, opts);
    const { before, f, m, after } = await mask(file);
    assert.deepEqual(f.map((x) => x.id).sort(), ['email', 'iban']);
    assert.equal(after.partial, false);
    assert.equal(after.text, m.text, 'der Leser liest genau den gemeldeten Text');
    assert.deepEqual(await find(after.text), [], 'kein Fund mehr');
    assert.equal(after.text.length, before.text.length, 'gleiche Laenge: Zeichen fuer Zeichen ueberdeckt');
    for (const line of ['Rechnung an Frau Muster', 'Seite zwei ohne Daten', 'bitte']) assert.ok(after.text.includes(line), line);
    const cover = /[Xx*#._-]{4} [Xx*#._-]{4} [Xx*#._-]{4}/;
    assert.match(after.text, cover, 'Gruppen der IBAN bleiben als Gruppen sichtbar (Leerraum bleibt)');
    const all = everything(m.bytes);
    for (const v of [IBAN, MAIL, '0076 2011', 'max.muster']) assert.ok(!all.includes(v), 'Wert nirgends mehr in der Datei: ' + v);
    assert.match(Buffer.from(m.bytes).toString('latin1'), /startxref\n\d+\n%%EOF\n$/);
  });
}

test('Ueberdecken: nur die genannten Bereiche, zweimal anwendbar, Zusatzbereich ohne Fund', async () => {
  const file = pdf(['Name Anna Beispiel\nMail ' + MAIL]);
  const r = await D.extract(file, 'pdf');
  const at = r.text.indexOf('Anna');
  const m = await D.pdfMask(file, r.text, [[at, at + 4]], find, 10000);
  assert.ok(solid(m.text).includes('NameXXXXBeispiel'), m.text);
  assert.ok(m.text.includes(MAIL), 'nicht genannter Wert bleibt');
  const m2 = await D.pdfMask(m.bytes, m.text, (await find(m.text)).map((x) => [x.start, x.end]), find, 10000);
  assert.deepEqual(await find((await D.extract(m2.bytes, 'pdf')).text), []);
});

test('Ueberdecken: Info und XMP-Metadaten werden geleert', async () => {
  const objs = page('BT /F1 12 Tf 72 720 Td (IBAN ' + IBAN + ') Tj ET');
  objs[0] = '<< /Type /Catalog /Pages 2 0 R /Metadata 7 0 R >>';
  objs.push('<< /Author (Erika Musterfrau) /Title (Vertraulich) >>', { dict: '<< /Type /Metadata /Subtype /XML >>', data: '<x:xmpmeta><dc:creator>Erika Musterfrau</dc:creator></x:xmpmeta>' });
  const { m } = await mask(build(objs, '<< /Root 1 0 R /Info 6 0 R >>'));
  const raw = Buffer.from(m.bytes).toString('latin1');
  assert.ok(!raw.includes('Erika') && !raw.includes('Vertraulich'), 'Autor und Titel sind weg');
  assert.ok(!raw.includes(IBAN));
});

test('Ueberdecken: Breite ausgeglichen - Text nach dem Wert bleibt an seiner Stelle (Zahl im TJ-Feld)', async () => {
  // i ist schmal (200), X breit (700): ohne Ausgleich rueckte "Ende" nach rechts.
  const widths = Array.from({ length: 95 }, (_, k) => (k + 32 === 105 ? 200 : k + 32 === 88 ? 700 : 500));
  const font = '<< /Type /Font /Subtype /TrueType /BaseFont /F /FirstChar 32 /LastChar 126 /Widths [' + widths.join(' ') + '] /Encoding /WinAnsiEncoding >>';
  const file = build(page('BT /F1 10 Tf 72 720 Td (Mail iii@example.com Ende) Tj T* [(Tel ) -50 (iiii)] TJ ET', '[3 0 R]', font));
  const r = await D.extract(file, 'pdf');
  const a = r.text.indexOf('iii@'), b = r.text.indexOf('iiii');
  const m = await D.pdfMask(file, r.text, [[a, a + 3], [b, b + 4]], find, 10000);
  const raw = Buffer.from(m.bytes).toString('latin1');
  assert.match(raw, /\[<4d61696c20585858> 1500 <406578616d706c652e636f6d20456e6465>\] TJ/, 'aus Tj wird TJ mit Ausgleich 3 x (700 - 200)');
  assert.match(raw, /\[\(Tel \) -50 <58585858> 2000 \] TJ/, 'im bestehenden Feld steht die Zahl hinter dem Wert, mit Leerzeichen danach');
  assert.ok(solid(m.text).includes('MailXXX@example.comEnde'));
});

test('Ueberdecken: im Zweifel Fehler statt halber Arbeit (Aufrufer nimmt dann die Textfassung)', async () => {
  const base = 'BT /F1 12 Tf 72 720 Td (IBAN ' + IBAN + ') Tj ET';
  const run = async (file, textOf) => { const r = await D.extract(file, 'pdf'); const f = await find(r.text); return code(D.pdfMask(file, textOf ? textOf(r.text) : r.text, f.map((x) => [x.start, x.end]), find, 10000)); };
  assert.equal(await run(build(page(base))), 'ok');
  // Anderer Text als bei der Pruefung, keine Bereiche, Bereich ausserhalb.
  assert.equal(await run(build(page(base)), (t) => t + ' '), 'fail');
  const ok = build(page(base));
  const text = (await D.extract(ok, 'pdf')).text;
  assert.equal(await code(D.pdfMask(ok, text, [], find, 10000)), 'fail');
  assert.equal(await code(D.pdfMask(ok, text, [[5, 99999]], find, 10000)), 'fail');
  // Wert steht auch in einer Anmerkung (kein Seitentext): Restpruefung schlaegt an.
  const annot = page(base);
  annot[2] = '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /Annots [6 0 R] >>';
  annot.push('<< /Type /Annot /Subtype /Text /Contents (Bitte an ' + MAIL + ' senden) >>');
  assert.equal(await run(build(annot)), 'fail');
  // Wert als /ActualText in markiertem Inhalt.
  assert.equal(await run(build(page('/Span << /ActualText (' + MAIL + ') >> BDC ET ' + base + ' EMC'))), 'fail');
  // Wert im Erscheinungsbild einer Anmerkung (Form-XObject, von keiner Seite gezeichnet).
  const ap = page(base);
  ap.push({ dict: '<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] /Resources << /Font << /F1 5 0 R >> >> >>', data: 'BT /F1 8 Tf (' + MAIL + ') Tj ET' });
  assert.equal(await run(build(ap)), 'fail');
  // Aeltere Fassung desselben Objekts in der Datei (nachtraeglich gespeichert): der alte Text bliebe lesbar.
  const twice = Buffer.concat([Buffer.from(build(page('BT /F1 12 Tf 72 720 Td (alt: ' + MAIL + ') Tj ET'))), Buffer.from('4 0 obj\n<< /Length ' + base.length + ' >>\nstream\n' + base + '\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1')]);
  assert.equal(await run(new Uint8Array(twice)), 'fail');
  // Wert in einem Kommentar zwischen zwei Objekten bzw. nach dem Dateiende: bliebe unveraendert in der Datei.
  const plain = Buffer.from(build(page(base))).toString('latin1');
  const between = plain.replace('\n5 0 obj', '\n% Kontakt ' + MAIL + '\n5 0 obj');
  assert.notEqual(between, plain);
  assert.equal(await run(new Uint8Array(Buffer.from(between, 'latin1'))), 'fail', 'Kommentar zwischen Objekten');
  assert.equal(await run(new Uint8Array(Buffer.from(plain + '% ' + MAIL + '\n', 'latin1'))), 'fail', 'Kommentar nach %%EOF');
  assert.equal(await run(new Uint8Array(Buffer.concat([Buffer.from(plain, 'latin1'), Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 14, 15, 16])]))), 'fail', 'Binaeres nach dem Dateiende ist nicht pruefbar');
  // Unlesbares Objekt (Dict zu tief verschachtelt) mit dem Wert in einem Flate-Strom: darf nicht uebersprungen werden.
  const z = zlib.deflateSync(Buffer.from('BT (' + MAIL + ') Tj ET', 'latin1'));
  const broken = Buffer.concat([
    Buffer.from(plain.slice(0, plain.indexOf('trailer')) + '9 0 obj\n<< /Filter /FlateDecode /Length ' + z.length + ' /X ' + '['.repeat(80) + ']'.repeat(80) + ' >>\nstream\n', 'latin1'),
    z, Buffer.from('\nendstream\nendobj\n' + plain.slice(plain.indexOf('trailer')), 'latin1'),
  ]);
  assert.equal((await D.extract(new Uint8Array(broken), 'pdf')).text.includes('IBAN'), true, 'der Leser liest die Datei weiter');
  assert.equal(await run(new Uint8Array(broken)), 'fail', 'unlesbares Objekt');
  // Wert als Zeichenkette zwischen dem Ende eines Objektwerts und endobj.
  const tailStr = plain.replace(FONT + '\nendobj', FONT + '\n(' + MAIL + ')\nendobj');
  assert.notEqual(tailStr, plain);
  assert.equal(await run(new Uint8Array(Buffer.from(tailStr, 'latin1'))), 'fail', 'Text hinter dem Objektwert');
  // Strom mit unbekanntem Filter bzw. binaerem Inhalt, der kein Bild, Schriftprogramm oder Farbprofil ist.
  const odd = page(base);
  odd.push({ dict: '<< /Filter /JBIG2Decode >>', data: 'verborgen ' + MAIL });
  assert.equal(await run(build(odd)), 'fail', 'unbekannter Filter');
  const bin = page(base);
  bin.push({ dict: '<< >>', data: String.fromCharCode(...Array.from({ length: 64 }, (_, i) => i % 9)) + MAIL });
  assert.equal(await run(build(bin)), 'fail', 'binaerer Strom ohne bekannte Rolle');
  // Dieselben Bytes als eingebundenes Schriftprogramm sind zulaessig (Schriften sind binaer).
  const fontFile = page(base);
  fontFile.push('<< /Type /FontDescriptor /FontName /F /FontFile2 7 0 R >>', { dict: '<< /Length1 64 >>', data: String.fromCharCode(...Array.from({ length: 64 }, (_, i) => i % 9)) });
  assert.equal(await run(build(fontFile)), 'ok', 'Schriftprogramm bleibt erlaubt');
  // Objektstrom mit einem unlesbaren Objekt (zu tief verschachtelt), das den Wert als Zeichenkette traegt;
  // ebenso ein Objektstrom, dessen Objekt von einem gleich nummerierten Objekt verdeckt wird.
  const stm = (body, n) => { const head = n + ' 0 '; return { dict: '<< /Type /ObjStm /N 1 /First ' + head.length + ' >>', data: head + body }; };
  const deep = page(base);
  deep.push(stm('<< /K ' + '['.repeat(80) + '(' + MAIL + ')' + ']'.repeat(80) + ' >>', 9));
  assert.equal((await D.extract(build(deep), 'pdf')).text.includes('IBAN'), true, 'der Leser liest die Datei weiter');
  assert.equal(await run(build(deep)), 'fail', 'unlesbares Objekt im Objektstrom');
  const shadow = page(base);
  shadow.push(stm('<< /Alt <' + Buffer.from(MAIL, 'latin1').toString('hex') + '> >>', 5));
  assert.equal(await run(build(shadow)), 'fail', 'verdecktes Objekt im Objektstrom');
  const fine = page(base);
  fine.push(stm('<< /Note (ohne Daten) >>', 9));
  assert.equal(await run(build(fine)), 'ok', 'gewoehnlicher Objektstrom bleibt erlaubt');
  // Schrift ohne ein Deckzeichen (CID, Zuordnung nur fuer die benutzten Zeichen ohne X x * # - _ .).
  const cmap = '1 begincodespacerange <0000> <FFFF> endcodespacerange\n3 beginbfchar\n<0001> <0041>\n<0002> <0040>\n<0003> <0042>\nendbfchar';
  const cid = page('BT /F1 12 Tf 72 720 Td <00010002000300010003> Tj ET', '[3 0 R]', '<< /Type /Font /Subtype /Type0 /BaseFont /F /Encoding /Identity-H /ToUnicode 6 0 R >>');
  cid.push({ dict: '<< >>', data: cmap });
  const cf = build(cid);
  const ct = (await D.extract(cf, 'pdf')).text;
  assert.equal(solid(ct), 'A@BAB');
  assert.equal(await code(D.pdfMask(cf, ct, [[ct.indexOf('A'), ct.indexOf('A') + 3]], find, 10000)), 'fail');
  // Nicht ganz lesbare Datei (Anhang) und verschluesselte Datei.
  const att = page(base);
  att.push('<< /Type /Filespec /EF << /F 7 0 R >> >>', { dict: '<< /Type /EmbeddedFile >>', data: 'x' });
  assert.equal(await run(build(att)), 'fail');
  assert.equal(await code(D.pdfMask(new Uint8Array(4), 'x', [[0, 1]], find, 1000)), 'type');
});

// --- Leser: Luecke oder Fortsetzung, Zeilen, Seitenfolge ----------------------------
test('Leser: Fortsetzung ohne Luecke bleibt ein Wert, Luecke wird ein Leerzeichen (mit Zeichenbreiten)', async () => {
  // Jedes Zeichen 5 Einheiten breit (Schriftgrad 10): "CH93 0076 201" endet bei 65, das naechste Stueck beginnt dort.
  const c = 'BT /F1 10 Tf 100 700 Td (IBAN CH93 0076 201) Tj 90 0 Td (1 6238 5295 7) Tj 200 0 Td (weiter) Tj 0 -14 Td (neue Zeile) Tj ET';
  const r = await D.extract(build(page(c, '[3 0 R]', FONT_W)), 'pdf');
  assert.deepEqual(r.text.split('\n').filter(Boolean), ['IBAN ' + IBAN + ' weiter', 'neue Zeile']);
  assert.deepEqual((await find(r.text)).map((f) => f.id), ['iban'], 'IBAN ueber zwei Stuecke erkannt');
  // Ohne Breiten wie bisher: waagrechter Versatz = Leerzeichen.
  const o = await D.extract(build(page('BT /F1 10 Tf 100 700 Td (eins) Tj 40 0 Td (zwei) Tj ET')), 'pdf');
  assert.equal(o.text.trim(), 'eins zwei');
});
test('Leser: Tm auf derselben Grundlinie = Luecke pruefen, andere Grundlinie = neue Zeile; TJ-Abstaende zaehlen mit', async () => {
  const c = 'BT /F1 10 Tf 1 0 0 1 100 700 Tm (Wort) Tj 1 0 0 1 120 700 Tm (teil) Tj 1 0 0 1 160 700 Tm (zwei) Tj 1 0 0 1 100 680 Tm [(unten) -1000 (rechts)] TJ 1 0 0 1 165 680 Tm (ende) Tj ET';   // unten 25 + Abstand 10 + rechts 30 = 65
  const r = await D.extract(build(page(c, '[3 0 R]', FONT_W)), 'pdf');
  assert.deepEqual(r.text.split('\n').filter(Boolean), ['Wortteil zwei', 'unten rechtsende']);
});
test('Leser: Seiten in der Reihenfolge des Seitenbaums, nicht der Objektnummern; nicht genannte Seiten folgen', async () => {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [6 0 R 3 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', { dict: '<< >>', data: 'BT /F1 12 Tf 72 720 Td (0076 2011 6238 5295 7) Tj ET' }, FONT,
    '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>', { dict: '<< >>', data: 'BT /F1 12 Tf 72 720 Td (Erste Seite IBAN CH93) Tj ET' },
    '<< /Type /Page /Resources << /Font << /F1 5 0 R >> >> /Contents 9 0 R >>', { dict: '<< >>', data: 'BT /F1 12 Tf 72 720 Td (verwaiste Seite) Tj ET' },
  ];
  const r = await D.extract(build(objs), 'pdf');
  assert.deepEqual(r.text.split('\n').filter(Boolean), ['Erste Seite IBAN CH93', '0076 2011 6238 5295 7', 'verwaiste Seite']);
});

test('Quelltext: Meldung nimmt zuerst das Ueberdecken, die Textfassung nur als Rueckfall mit Hinweis (loss)', async () => {
  const fs = await import('node:fs');
  const cs = fs.readFileSync(new URL('../extension/content/content.js', import.meta.url), 'utf8');
  assert.ok(cs.includes('const r = await D.pdfMask(new Uint8Array(await x.f.arrayBuffer()), x.text, ranges, find,'));
  assert.ok(cs.includes('body = DLX.bereinigen.pdf(goal);') && cs.includes('loss = true;'));
  assert.ok(cs.includes('loss: !!fix && fix.loss === true'));
  assert.ok(cs.includes('return { files, expect, loss };'));
});

// Aus der Pruefung mit echten Word-PDF: jedes Stueck einer Zeile steht in einem eigenen Textblock,
// Schriften sind Teilschriften (nicht benutzte Zeichen haben Breite 0), im TJ-Feld folgen Zahlen direkt.
test('Leser: Textbloecke derselben Grundlinie setzen die Zeile fort (Word), andere Grundlinie oder cm = neue Zeile', async () => {
  const blk = (x, y, t) => 'q 0 0 600 800 re W* n BT /F1 10 Tf 1 0 0 1 ' + x + ' ' + y + ' Tm [(' + t + ')] TJ ET Q ';
  const c = blk(100, 700, 'Nr. 2026') + blk(140, 700, '-') + blk(145, 700, '0417') + blk(175, 700, 'Ende') + blk(100, 680, 'zweite Zeile') +
    'q 1 0 0 1 0 -40 cm BT /F1 10 Tf 1 0 0 1 160 680 Tm (versetzt) Tj ET Q BT /F1 10 Tf (ohne Lage) Tj ET';
  const r = await D.extract(build(page(c, '[3 0 R]', FONT_W)), 'pdf');
  assert.deepEqual(r.text.split('\n').filter(Boolean), ['Nr. 2026-0417 Ende', 'zweite Zeile', 'versetzt', 'ohne Lage']);
});
test('Ueberdecken: Zahl direkt nach der Zeichenkette im TJ-Feld bleibt getrennt; Deckzeichen muss in der Teilschrift vorhanden sein', async () => {
  // Teilschrift: nur a-z, Ziffern, Leerzeichen, Punkt, @ haben eine Breite; X (88) fehlt -> Deckzeichen x.
  const widths = Array.from({ length: 95 }, (_, k) => { const c = k + 32; return c === 32 || c === 46 || c === 64 || (c >= 48 && c <= 57) || (c >= 97 && c <= 122) ? 500 : 0; });
  const font = '<< /Type /Font /Subtype /TrueType /BaseFont /ABCDEF+Teil /FirstChar 32 /LastChar 126 /Widths [' + widths.join(' ') + '] /Encoding /WinAnsiEncoding >>';
  const file = build(page('BT /F1 10 Tf 1 0 0 1 72 720 Tm [(mail )5(max.muster)-3(@example.com)7( ende)] TJ ET', '[3 0 R]', font));
  const { m, after } = await mask(file);
  const raw = Buffer.from(m.bytes).toString('latin1');
  assert.ok(solid(after.text).includes('mailxxxxxxxxxxxxxxxxxxxxxxende'), after.text);
  assert.ok(!/\d-\d|[0-9]-[0-9]/.test(raw.slice(raw.indexOf('[(mail )'), raw.indexOf('] TJ'))), 'keine zusammengeklebten Zahlen');
  assert.match(raw, /\[\(mail \)5<78787878787878787878> ?-3<787878787878787878787878> ?7\( ende\)\] TJ/, 'gleich breite Zeichen: kein Ausgleich noetig, Zahlen des Originals bleiben');
  // Ohne ein vorhandenes Deckzeichen (nur Ziffern eingebettet) lieber Fehler als unsichtbare Zeichen.
  const digits = Array.from({ length: 95 }, (_, k) => (k + 32 === 32 || (k + 32 >= 48 && k + 32 <= 57) ? 500 : 0));
  const f2 = build(page('BT /F1 10 Tf 72 720 Td (4242 4242 4242 4242) Tj ET', '[3 0 R]', '<< /Type /Font /Subtype /TrueType /BaseFont /ABCDEF+Zahl /FirstChar 32 /LastChar 126 /Widths [' + digits.join(' ') + '] /Encoding /WinAnsiEncoding >>'));
  const t2 = (await D.extract(f2, 'pdf')).text;
  assert.equal(await code(D.pdfMask(f2, t2, [[t2.indexOf('4242'), t2.indexOf('4242') + 19]], find, 10000)), 'fail');
});
