// Synthetische Testdokumente (nur erfundene Werte): ZIP (DOCX/XLSX) und PDF,
// erzeugt mit node:zlib. Wird von den Unit-Tests und vom E2E-Upload benutzt.
import zlib from 'node:zlib';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// files: [{ name, data (string|Buffer), store?: true, encrypt?: true, method?: n }]
export function zip(files) {
  const locals = [], centrals = [];
  let off = 0;
  for (const f of files) {
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const method = f.method !== undefined ? f.method : f.store ? 0 : 8;
    const comp = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const name = Buffer.from(f.name, 'utf8');
    const flags = (f.encrypt ? 1 : 0) | 0x800;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc32(raw), 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.usize !== undefined ? f.usize : raw.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(flags, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc32(raw), 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(f.usize !== undefined ? f.usize : raw.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, comp);
    centrals.push(ch, name);
    off += lh.length + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
export function docx(paragraphs, extra = []) {
  const body = paragraphs.map((p) => '<w:p><w:r><w:t xml:space="preserve">' + esc(p) + '</w:t></w:r></w:p>').join('');
  return zip([
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: 'word/document.xml', data: '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>' + body + '</w:body></w:document>' },
    ...extra,
  ]);
}
// rows: Arrays von Zellen; Zeichenketten als Shared String, Zahlen als <v>, {inline} als inlineStr.
export function xlsx(rows, extra = []) {
  const shared = [];
  const xmlRows = rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((c, ci) => {
    const ref = String.fromCharCode(65 + ci) + (ri + 1);
    if (typeof c === 'number') return '<c r="' + ref + '"><v>' + c + '</v></c>';
    if (c && c.inline) return '<c r="' + ref + '" t="inlineStr"><is><t>' + esc(c.inline) + '</t></is></c>';
    shared.push(c);
    return '<c r="' + ref + '" t="s"><v>' + (shared.length - 1) + '</v></c>';
  }).join('') + '</row>').join('');
  return zip([
    { name: 'xl/workbook.xml', data: '<workbook/>' },
    { name: 'xl/sharedStrings.xml', data: '<sst>' + shared.map((s) => '<si><t>' + esc(s) + '</t></si>').join('') + '</sst>' },
    { name: 'xl/worksheets/sheet1.xml', data: '<worksheet><sheetData>' + xmlRows + '</sheetData></worksheet>' },
    ...extra,
  ]);
}

// PDF mit einer Seite je Eintrag. opts: { cid: true (Identity-H + ToUnicode),
// objstm: true (Schrift im Objektstrom), form: true (Text in Form-XObject),
// encrypt: true, noToUnicode: true, flate: false }.
export function pdf(pages, opts = {}) {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const stream = (dict, data) => {
    const raw = Buffer.from(data, 'latin1');
    const z = opts.flate === false ? raw : zlib.deflateSync(raw);
    return { dict: dict + (opts.flate === false ? '' : ' /Filter /FlateDecode') + ' /Length ' + z.length, data: z };
  };
  const catalog = add(null), pagesObj = add(null);
  let fontRef;
  const cidOf = (s) => [...s].map((ch) => (ch.charCodeAt(0) + 3).toString(16).padStart(4, '0')).join('');
  if (opts.cid) {
    const chars = [...new Set(pages.join(''))];
    const bf = chars.map((ch) => '<' + (ch.charCodeAt(0) + 3).toString(16).padStart(4, '0') + '> <' + ch.charCodeAt(0).toString(16).padStart(4, '0') + '>').join('\n');
    const cmap = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n' + chars.length + ' beginbfchar\n' + bf + '\nendbfchar\nendcmap end end';
    const tu = opts.noToUnicode ? null : add(stream('<<', cmap));
    fontRef = add('<< /Type /Font /Subtype /Type0 /BaseFont /Fake /Encoding /Identity-H' + (tu ? ' /ToUnicode ' + tu + ' 0 R' : '') + ' >>');
  } else fontRef = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const text of pages) {
    const lines = text.split('\n');
    const shown = lines.map((l, i) => (i ? 'T* ' : '') + (opts.cid ? '<' + cidOf(l) + '> Tj' : '(' + l.replace(/[\\()]/g, (m) => '\\' + m) + ') Tj')).join('\n');
    const content = 'BT /F1 12 Tf 14 TL 72 720 Td\n' + shown + '\nET';
    let res, contents;
    if (opts.form) {
      const form = add(stream('<< /Type /XObject /Subtype /Form /BBox [0 0 600 800] /Resources << /Font << /F1 ' + fontRef + ' 0 R >> >>', content));
      contents = add(stream('<<', 'q /Fm1 Do Q'));
      res = '<< /XObject << /Fm1 ' + form + ' 0 R >> >>';
    } else {
      contents = add(stream('<<', content));
      res = '<< /Font << /F1 ' + fontRef + ' 0 R >> >>';
    }
    kids.push(add('<< /Type /Page /Parent ' + pagesObj + ' 0 R /MediaBox [0 0 612 792] /Resources ' + res + ' /Contents ' + contents + ' 0 R >>'));
  }
  objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesObj + ' 0 R >>';
  objs[pagesObj - 1] = '<< /Type /Pages /Kids [' + kids.map((k) => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
  // Objektstrom: die Schrift in einen komprimierten Objektstrom verschieben.
  let objstm = null;
  if (opts.objstm) {
    const body = objs[fontRef - 1];
    const head = fontRef + ' 0 ';
    objs[fontRef - 1] = undefined;
    const data = head + body;
    objstm = add(stream('<< /Type /ObjStm /N 1 /First ' + head.length, data));
  }
  const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let len = parts[0].length;
  objs.forEach((o, i) => {
    if (o === undefined) return;
    const headB = Buffer.from((i + 1) + ' 0 obj\n', 'latin1');
    const chunk = typeof o === 'string' ? Buffer.concat([headB, Buffer.from(o + '\nendobj\n', 'latin1')])
      : Buffer.concat([headB, Buffer.from(o.dict + ' >>\nstream\n', 'latin1'), o.data, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    parts.push(chunk);
    len += chunk.length;
  });
  void objstm;
  parts.push(Buffer.from('trailer\n<< /Root ' + catalog + ' 0 R' + (opts.encrypt ? ' /Encrypt 99 0 R' : '') + ' >>\n%%EOF\n', 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}
