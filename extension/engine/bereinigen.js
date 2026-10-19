// Bereinigte Fassung von Dokumenten (Design-Review Bereinigen 19.10.2026, Auflagen 2-7):
// DOCX: nur die Inhalte der w:t-Stuecke werden umgeschrieben (Platzhalter wie beim
// Text-Schwaerzen), Autor-Metadaten geleert, alle anderen Eintraege byte-gleich kopiert.
// Bleibt in irgendeinem Text- oder Attributwert einer .xml/.rels-Datei ein Fund
// (geloeschte Aenderungen, Feldcodes, Link-Ziele, docProps, customXml ...), gibt es
// keine bereinigte Fassung (Fehler 'rest'). PDF: neue, minimale PDF nur aus dem schon
// geschwaerzten Text (Layout und Bilder gehen verloren). Kein Netz, kein Speicher,
// keine Konsole; jeder Fehler ist ein fester Code.
(function (g) {
  'use strict';
  const DLX = g.DLX = g.DLX || {};
  const LIMITS = Object.freeze({ entries: 2000, inflated: 60 * 1024 * 1024, bytes: 60 * 1024 * 1024 });
  const fail = (code) => { const e = new Error(code); e.code = code; return e; };
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const enc = new TextEncoder();
  const utf8 = (b) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { throw fail('fail'); } };

  let TABLE = null;
  function crc32(b) {
    if (!TABLE) {
      TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; }
    }
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // --- ZIP streng lesen (Auflage 5) --------------------------------------------------
  function zipList(b) {
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (u32(b, i) !== 0x06054b50) continue;
      if (eocd >= 0) throw fail('fail');   // mehrere End-Eintraege
      eocd = i;
    }
    if (eocd < 0) throw fail('type');
    if (eocd + 22 + u16(b, eocd + 20) !== b.length || u16(b, eocd + 4) || u16(b, eocd + 6)) throw fail('fail');
    const count = u16(b, eocd + 10), size = u32(b, eocd + 12), off = u32(b, eocd + 16);
    if (count !== u16(b, eocd + 8) || count === 0xffff || size === 0xffffffff || off === 0xffffffff) throw fail('fail');
    if (count > LIMITS.entries) throw fail('size');
    if (off + size !== eocd) throw fail('fail');
    const out = [], names = new Set();
    let p = off;
    for (let i = 0; i < count; i++) {
      if (p + 46 > eocd || u32(b, p) !== 0x02014b50) throw fail('fail');
      const flags = u16(b, p + 8), method = u16(b, p + 10), crc = u32(b, p + 16);
      const csize = u32(b, p + 20), usize = u32(b, p + 24);
      const nlen = u16(b, p + 28), xlen = u16(b, p + 30), clen = u16(b, p + 32), local = u32(b, p + 42);
      const name = utf8(b.subarray(p + 46, p + 46 + nlen));
      if (names.has(name)) throw fail('fail');
      names.add(name);
      if (flags & 1) throw fail('encrypted');
      if (method !== 0 && method !== 8) throw fail('fail');
      if (csize === 0xffffffff || usize === 0xffffffff || (method === 0 && csize !== usize)) throw fail('fail');
      if (local + 30 > off || u32(b, local) !== 0x04034b50) throw fail('fail');
      const lflags = u16(b, local + 6), lnlen = u16(b, local + 26), lxlen = u16(b, local + 28);
      const lcrc = u32(b, local + 14), lcs = u32(b, local + 18), lus = u32(b, local + 22);
      if (u16(b, local + 8) !== method || (lflags & 1) || utf8(b.subarray(local + 30, local + 30 + lnlen)) !== name) throw fail('fail');
      if (!(lflags & 8) && (lcs !== csize || lus !== usize || lcrc !== crc)) throw fail('fail');
      if ((lflags & 8) && !((lcs === 0 && lus === 0) || (lcs === csize && lus === usize))) throw fail('fail');
      const start = local + 30 + lnlen + lxlen, end = start + csize;
      if (end > off) throw fail('fail');
      out.push({ name, method, crc, csize, usize, local, end, data: b.subarray(start, end) });
      p += 46 + nlen + xlen + clen;
    }
    if (p !== eocd) throw fail('fail');
    // Keine Daten vor dem ersten Eintrag, keine ueberlappenden Eintraege.
    const byPos = out.slice().sort((x, y) => x.local - y.local);
    if (byPos.length && byPos[0].local !== 0) throw fail('fail');
    for (let i = 1; i < byPos.length; i++) if (byPos[i].local < byPos[i - 1].end) throw fail('fail');
    return out;
  }

  async function inflate(e, budget) {
    if (e.method === 0) {
      budget.used += e.usize;
      if (budget.used > LIMITS.inflated) throw fail('size');
      if (crc32(e.data) !== e.crc) throw fail('fail');
      return e.data;
    }
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter();
    w.write(e.data).catch(() => {});
    w.close().catch(() => {});
    const r = ds.readable.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      total += value.length;
      if (total > e.usize || budget.used + total > LIMITS.inflated) { r.cancel().catch(() => {}); throw fail('size'); }
      chunks.push(value);
    }
    if (total !== e.usize) throw fail('fail');
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    if (crc32(out) !== e.crc) throw fail('fail');
    budget.used += total;
    return out;
  }

  // Neue ZIP: geaenderte Teile unkomprimiert mit neuer CRC, alle anderen roh kopiert.
  function zipWrite(list) {
    const parts = [], central = [];
    let off = 0;
    for (const e of list) {
      const nb = enc.encode(e.name);
      const flags = /[^\x20-\x7e]/.test(e.name) ? 0x0800 : 0;
      const lh = new Uint8Array(30 + nb.length), ch = new Uint8Array(46 + nb.length);
      const lv = new DataView(lh.buffer), cv = new DataView(ch.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, flags, true); lv.setUint16(8, e.method, true);
      lv.setUint16(12, 0x21, true); lv.setUint32(14, e.crc, true); lv.setUint32(18, e.csize, true); lv.setUint32(22, e.usize, true); lv.setUint16(26, nb.length, true);
      lh.set(nb, 30);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, flags, true); cv.setUint16(10, e.method, true);
      cv.setUint16(14, 0x21, true); cv.setUint32(16, e.crc, true); cv.setUint32(20, e.csize, true); cv.setUint32(24, e.usize, true); cv.setUint16(28, nb.length, true);
      cv.setUint32(42, off, true);
      ch.set(nb, 46);
      parts.push(lh, e.data);
      central.push(ch);
      off += lh.length + e.data.length;
    }
    const csize = central.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, list.length, true); ev.setUint16(10, list.length, true);
    ev.setUint32(12, csize, true); ev.setUint32(16, off, true);
    const total = off + csize + 22;
    if (total > LIMITS.bytes) throw fail('size');
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of parts.concat(central, [end])) { out.set(c, o); o += c.length; }
    return out;
  }

  // --- XML (Auflage 6) ------------------------------------------------------------------
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const ENTITY = /&(amp|lt|gt|quot|apos|#[0-9]{1,7}|#x[0-9a-fA-F]{1,6});/g;
  const BAD_ENTITY = /&(?!(?:amp|lt|gt|quot|apos|#[0-9]{1,7}|#x[0-9a-fA-F]{1,6});)/;
  function xmlOk(xml) {
    if (xml.includes('<![CDATA[') || /<!DOCTYPE/i.test(xml) || BAD_ENTITY.test(xml)) throw fail('fail');
  }
  const decode = (s) => s.replace(ENTITY, (m, k) => (k[0] === '#' ? String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)) : NAMED[k]));
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

  // Text wie der Leser (engine/datei.js docxText): w:t-Inhalte, Absatz/Umbruch = \n, Tab = \t.
  // segs: Lage jedes w:t-Inhalts im XML (a..b) und im Text (t). Trenner gehoeren zu keinem Stueck.
  function segments(xml) {
    const re = /<(\/?)w:(t|p|tab|br|cr)(?:\s[^>]*)?>/g;
    const segs = [];
    let text = '', inT = false, from = 0, m;
    while ((m = re.exec(xml))) {
      const close = m[1] === '/', tag = m[2], self = m[0].endsWith('/>');
      if (tag === 't') {
        if (!close && !self) { inT = true; from = re.lastIndex; } else if (close && inT) {
          const str = decode(xml.slice(from, m.index));
          segs.push({ a: from, b: m.index, t: text.length, str });
          text += str;
          inT = false;
        }
      } else if (tag === 'p' && close) text += '\n';
      else if (tag === 'tab' && !close) text += '\t';
      else if ((tag === 'br' || tag === 'cr') && !close) text += '\n';
    }
    return { text, segs };
  }

  // Fundbereiche auf die Stuecke zurueckbilden: Platzhalter ins erste betroffene Stueck,
  // alle uebrigen Zeichen im Bereich (auch ueber Absatzgrenzen) geleert.
  function rewrite(xml, segs, findings, label) {
    const ranges = [];
    for (const f of findings.filter((x) => !x.meta && x.end > x.start).sort((x, y) => x.start - y.start)) {
      const last = ranges[ranges.length - 1];
      if (last && f.start < last.end) { last.end = Math.max(last.end, f.end); continue; }
      ranges.push({ start: f.start, end: f.end, ph: '[' + label(f) + ']', done: false });
    }
    if (!ranges.length) return xml;
    let out = '', pos = 0, ri = 0;
    for (const sg of segs) {
      let s = '';
      for (let k = 0; k < sg.str.length; k++) {
        const tp = sg.t + k;
        while (ri < ranges.length && ranges[ri].end <= tp) ri++;
        const r = ranges[ri];
        if (r && tp >= r.start) { if (!r.done) { s += r.ph; r.done = true; } continue; }
        s += sg.str[k];
      }
      out += xml.slice(pos, sg.a) + (s === sg.str ? xml.slice(sg.a, sg.b) : esc(s));
      pos = sg.b;
    }
    return out + xml.slice(pos);
  }

  // Alle Text- und Attributwerte (ohne Namensraum-Angaben), fuer die Restpruefung (Auflage 3).
  function allValues(xml) {
    const out = [];
    const re = /<[^>]*>|[^<]+/g;
    const attr = /\s([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(xml))) {
      const s = m[0];
      if (s[0] !== '<') { if (s.trim()) out.push(decode(s)); continue; }
      attr.lastIndex = 0;
      let a;
      while ((a = attr.exec(s))) if (a[1] !== 'xmlns' && !a[1].startsWith('xmlns:')) out.push(decode(a[2] !== undefined ? a[2] : a[3]));
    }
    return out.join('\n\n');
  }

  const DOCX_PART = /^word\/(?:document|footnotes|endnotes|comments)\.xml$|^word\/(?:header|footer)[0-9]{1,3}\.xml$/;
  const EMBEDDED = /^(?:word|xl|ppt)\/embeddings\/|^(?:word|xl)\/activeX\/|\.(?:bin|ole)$/i;
  // Metadaten (Auflage 4): Autoren in Kommentaren/Aenderungen, Ersteller, Firma.
  const AUTHOR = /(\s(?:w|w15):(?:author|initials)=)(?:"[^"]*"|'[^']*')/g;
  const blankTag = (xml, tag) => xml.split('<' + tag + '>').map((part, i) => {
    if (!i) return part;
    const k = part.indexOf('</' + tag + '>');
    return '<' + tag + '>' + (k < 0 ? part : part.slice(k));
  }).join('');

  // find(text) -> Promise<findings> mit den normalen Erkennern (wirft bei nicht pruefbar);
  // label(f) = Platzhaltertext. Ergebnis: Bytes der neuen DOCX.
  async function docx(bytes, find, label) {
    const entries = zipList(bytes);
    if (!entries.some((e) => e.name === 'word/document.xml')) throw fail('type');
    if (entries.some((e) => EMBEDDED.test(e.name))) throw fail('partial');
    const budget = { used: 0 };
    const out = [];
    for (const e of entries) {
      if (!/\.(?:xml|rels)$/i.test(e.name)) { out.push(e); continue; }
      const xml = utf8(await inflate(e, budget));
      xmlOk(xml);
      let next = xml;
      if (DOCX_PART.test(e.name)) {
        if (xml.includes('<w:altChunk')) throw fail('partial');
        const sg = segments(xml);
        next = rewrite(xml, sg.segs, await find(sg.text), label);
      }
      if (/^word\/[^/]+\.xml$/.test(e.name)) next = next.replace(AUTHOR, '$1""');
      if (e.name === 'docProps/core.xml') next = blankTag(blankTag(next, 'dc:creator'), 'cp:lastModifiedBy');
      if (e.name === 'docProps/app.xml') next = blankTag(blankTag(next, 'Company'), 'Manager');
      if ((await find(allValues(next))).some((f) => !f.meta)) throw fail('rest');
      if (next === xml) { out.push(e); continue; }
      const data = enc.encode(next);
      out.push({ name: e.name, method: 0, crc: crc32(data), csize: data.length, usize: data.length, data });
    }
    return zipWrite(out);
  }

  // --- PDF (Auflage 7): erst geschwaerzter Text, dann CP1252, keine Metadaten ---------------
  const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
    0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
  const COLS = 95, ROWS = 64;
  function pdfString(line) {
    let s = '(';
    for (const ch of line) {
      const u = ch.codePointAt(0);
      const c = u < 0x20 ? 0x20 : u < 0x80 || (u >= 0xa0 && u <= 0xff) ? u : CP1252[u] || 0x3f;
      if (c === 0x28 || c === 0x29 || c === 0x5c) s += '\\' + String.fromCharCode(c);
      else if (c >= 0x80) s += '\\' + c.toString(8);
      else s += String.fromCharCode(c);
    }
    return s + ')';
  }
  function wrap(text) {
    const lines = [];
    for (let raw of text.replace(/\r\n?/g, '\n').split('\n')) {
      raw = raw.replace(/\t/g, '    ');
      while (Array.from(raw).length > COLS) {
        const chars = Array.from(raw);
        const head = chars.slice(0, COLS).join('');
        const cut = head.lastIndexOf(' ') > 20 ? head.lastIndexOf(' ') : head.length;
        lines.push(raw.slice(0, cut));
        raw = raw.slice(cut).replace(/^ /, '');
      }
      lines.push(raw);
    }
    return lines;
  }
  function pdf(text) {
    const lines = wrap(text);
    const pages = [];
    for (let i = 0; i < Math.max(1, lines.length); i += ROWS) pages.push(lines.slice(i, i + ROWS));
    const objs = [];
    const kids = pages.map((_, i) => (4 + 2 * i) + ' 0 R').join(' ');
    objs.push('<< /Type /Catalog /Pages 2 0 R >>');
    objs.push('<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    pages.forEach((pg, i) => {
      const body = 'BT\n/F1 10 Tf\n12 TL\n50 800 Td\n' + pg.map((l) => pdfString(l) + ' Tj T*').join('\n') + '\nET';
      objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (5 + 2 * i) + ' 0 R >>');
      objs.push('<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream');
    });
    let s = '%PDF-1.4\n';
    const offs = [];
    objs.forEach((o, i) => { offs.push(s.length); s += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const xref = s.length;
    s += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    s += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    const out = enc.encode(s);
    if (out.length > LIMITS.bytes) throw fail('size');
    return out;
  }

  DLX.bereinigen = Object.freeze({ LIMITS, crc32, zipList, zipWrite, segments, rewrite, allValues, docx, pdf });
})(globalThis);
