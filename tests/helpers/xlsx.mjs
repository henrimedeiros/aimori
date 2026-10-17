// Testhilfe: synthetische XLSX-/ZIP-Dateien (nur erfundene Werte, example.com).
import zlib from 'node:zlib';

// Minimaler ZIP-Schreiber (Testhilfe): entries = [{ name, data, method?, flags?, size?, localSize? }].
export function zip(entries, opts = {}) {
  const parts = [], central = [];
  let off = 0;
  for (const e of entries) {
    const raw = Buffer.from(e.data);
    const method = e.method === undefined ? 8 : e.method;
    const comp = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(e.flags || 0, 6); lh.writeUInt16LE(e.localMethod === undefined ? method : e.localMethod, 8);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.localSize !== undefined ? e.localSize : e.size === undefined ? raw.length : e.size, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(e.flags || 0, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(e.size === undefined ? raw.length : e.size, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, comp);
    central.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(opts.count || entries.length, 8); eocd.writeUInt16LE(opts.count || entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat(parts.concat([cd, eocd])));
}
export const shared = (list) => '<?xml version="1.0"?><sst>' + list.map((s) => '<si><t>' + s + '</t></si>').join('') + '</sst>';
export const sheet = (rows) => '<?xml version="1.0"?><worksheet><sheetData>' + rows.map((r, i) => '<row r="' + (i + 1) + '">' +
  r.map((v, j) => '<c r="' + String.fromCharCode(65 + j) + (i + 1) + '" t="s"><v>' + v + '</v></c>').join('') + '</row>').join('') + '</sheetData></worksheet>';
export function workbook(n, extra = []) {
  const strings = ['Vorname', 'E-Mail', 'Geburtsdatum'];
  const rows = [[0, 1, 2]];
  for (let i = 0; i < n; i++) { strings.push('Anna' + i, 'anna' + i + '@example.com', '01.02.1980'); rows.push([3 + i * 3, 4 + i * 3, 5 + i * 3]); }
  return zip([{ name: '[Content_Types].xml', data: '<Types/>' }, { name: 'xl/sharedStrings.xml', data: shared(strings) }, { name: 'xl/worksheets/sheet1.xml', data: sheet(rows) }].concat(extra));
}

