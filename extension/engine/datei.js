// Dokumente lokal lesen (Design-Review A-D 16.10.2026, Auflagen 9-16): PDF, DOCX,
// XLSX, TXT, CSV ohne Bibliothek und ohne Netz. Laeuft im Offscreen-Dokument
// (ui/dokument.js) und in den Node-Tests. Nie ausgewertet wird etwas aus der
// Datei (kein JavaScript, keine Funktionen, keine Aktionen). Alle Grenzen gelten
// beim Lesen: entpackte Bytes zaehlt der Stream-Leser mit und bricht sofort ab,
// das Zeitbudget prueft tick() in jeder Schleife, Rekursion hat eine Tiefengrenze.
// Ergebnis { text, partial } oder Fehler mit festem Code (Error.message):
// size | type | encrypted | empty | timeout | fail. Ein leeres Ergebnis gilt nie
// als sauber (Auflage 12), Teile, die nicht gelesen werden koennen (eingebettete
// Objekte, Seiten ohne Text, Schriften ohne Zuordnung), machen es "partial".
// Alle regulaeren Ausdruecke sind linear (keine verschachtelten Quantoren, keine
// Rueckverweise; Auflage 10).
(function (g) {
  'use strict';
  const DLX = g.DLX = g.DLX || {};
  const LIMITS = Object.freeze({ files: 5, bytes: 20 * 1024 * 1024, inflated: 60 * 1024 * 1024, entries: 2000, chars: 500000, ms: 10000, depth: 8, objects: 200000 });

  const fail = (code) => { const e = new Error(code); e.code = code; return e; };

  // Art aus Dateiname und MIME-Typ; null = kein Dokument dieser Pruefung.
  const EXT = { pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', txt: 'text', csv: 'text' };
  const MIME = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'text', 'text/csv': 'text',
  };
  function kindOf(name, type) {
    const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || ''));
    const byExt = m ? EXT[m[1].toLowerCase()] : undefined;
    if (byExt) return byExt;
    return Object.hasOwn(MIME, String(type || '')) ? MIME[type] : null;
  }

  function clock(ms) {
    const deadline = Date.now() + ms;
    let n = 0;
    return () => { if ((++n & 255) === 0 && Date.now() > deadline) throw fail('timeout'); };
  }

  // Entpacken mit Zaehler (Auflage 9): bricht beim Ueberschreiten von max sofort ab.
  async function inflate(bytes, format, budget, max) {
    const ds = new DecompressionStream(format);
    const writer = ds.writable.getWriter();
    writer.write(bytes).catch(() => {});
    writer.close().catch(() => {});
    const reader = ds.readable.getReader();
    const parts = [];
    let total = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        budget.used += value.length;
        if (total > max || budget.used > LIMITS.inflated) { reader.cancel().catch(() => {}); throw fail('size'); }
        if (Date.now() > budget.deadline) { reader.cancel().catch(() => {}); throw fail('timeout'); }
        parts.push(value);
      }
    } catch (e) {
      if (e && e.code) throw e;
      throw fail('fail');
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // --- Text-Hilfen -------------------------------------------------------------
  const utf8 = (b) => new TextDecoder('utf-8', { fatal: false }).decode(b);
  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|lt|gt|amp|quot|apos);/g, (m, e) => {
      if (e[0] !== '#') return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e];
      const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : ' ';
    });
  }
  function textFile(bytes) {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }

  // --- ZIP (DOCX/XLSX, Auflage 11) -------------------------------------------------
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  function zipEntries(b, tick) {
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) throw fail('type');
    const count = u16(b, eocd + 10), size = u32(b, eocd + 12), off = u32(b, eocd + 16);
    if (count === 0xffff || size === 0xffffffff || off === 0xffffffff) throw fail('fail');   // ZIP64: nicht pruefbar
    if (count > LIMITS.entries) throw fail('size');
    if (off + size > b.length) throw fail('fail');
    const out = [];
    let p = off;
    for (let i = 0; i < count; i++) {
      tick();
      if (p + 46 > b.length || u32(b, p) !== 0x02014b50) throw fail('fail');
      const flags = u16(b, p + 8), method = u16(b, p + 10);
      const csize = u32(b, p + 20), usize = u32(b, p + 24);
      const nlen = u16(b, p + 28), xlen = u16(b, p + 30), clen = u16(b, p + 32);
      const local = u32(b, p + 42);
      const name = utf8(b.subarray(p + 46, p + 46 + nlen));
      out.push({ name, flags, method, csize, usize, local });
      p += 46 + nlen + xlen + clen;
    }
    return out;
  }

  async function zipRead(b, e, budget) {
    if (e.flags & 1) throw fail('encrypted');
    if (e.method !== 0 && e.method !== 8) throw fail('fail');
    if (e.csize === 0xffffffff || e.usize === 0xffffffff) throw fail('fail');
    const lp = e.local;
    if (lp + 30 > b.length || u32(b, lp) !== 0x04034b50) throw fail('fail');
    const lflags = u16(b, lp + 6), lmethod = u16(b, lp + 8);
    const lcs = u32(b, lp + 18), lus = u32(b, lp + 22);
    if (lmethod !== e.method || (lflags & 1)) throw fail('fail');
    // Ohne Datendeskriptor muessen die Groessen gleich sein; mit (Bit 3) duerfen sie 0 sein.
    if (!(lflags & 8) && (lcs !== e.csize || lus !== e.usize)) throw fail('fail');
    if ((lflags & 8) && !((lcs === 0 && lus === 0) || (lcs === e.csize && lus === e.usize))) throw fail('fail');
    const start = lp + 30 + u16(b, lp + 26) + u16(b, lp + 28);
    if (start + e.csize > b.length) throw fail('fail');
    const data = b.subarray(start, start + e.csize);
    if (e.usize > LIMITS.inflated) throw fail('size');
    if (e.method === 0) {
      if (e.csize !== e.usize) throw fail('fail');
      budget.used += data.length;
      if (budget.used > LIMITS.inflated) throw fail('size');
      return data;
    }
    const out = await inflate(data, 'deflate-raw', budget, e.usize);
    if (out.length !== e.usize) throw fail('fail');
    return out;
  }

  const DOCX_PART = /^word\/(?:document|footnotes|endnotes|comments)\.xml$|^word\/(?:header|footer)[0-9]{1,3}\.xml$/;
  const XLSX_SHEET = /^xl\/worksheets\/sheet[0-9]{1,4}\.xml$/;
  const EMBEDDED = /^(?:word|xl|ppt)\/embeddings\/|^(?:word|xl)\/activeX\/|\.(?:bin|ole)$/i;

  // WordprocessingML: nur Inhalt von <w:t>, Absatz = Zeile, Tab/Umbruch.
  function docxText(xml, tick) {
    const re = /<(\/?)w:(t|p|tab|br|cr)(?:\s[^>]*)?>/g;
    let out = '', inT = false, from = 0, m;
    while ((m = re.exec(xml))) {
      tick();
      const close = m[1] === '/', tag = m[2], self = m[0].endsWith('/>');
      if (tag === 't') {
        if (!close && !self) { inT = true; from = re.lastIndex; } else if (close && inT) { out += decodeEntities(xml.slice(from, m.index)); inT = false; }
      } else if (tag === 'p' && close) out += '\n';
      else if (tag === 'tab' && !close) out += '\t';
      else if ((tag === 'br' || tag === 'cr') && !close) out += '\n';
    }
    return out;
  }

  // Abschnitte zwischen Start- und End-Marke per indexOf statt [\s\S]*? (linear,
  // Auflage Pflicht-Pruefung 16.10.2026): tick() je Fund; fehlt die End-Marke,
  // endet die Suche. open = "<tag" (Zeichen danach muss Leerraum, > oder / sein).
  const TAG_END = new Set([' ', '>', '/', '\t', '\n', '\r']);
  function sections(s, open, close, tick, each) {
    let i = 0;
    for (;;) {
      tick();
      const a = s.indexOf(open, i);
      if (a < 0) return;
      if (open[0] === '<' && !TAG_END.has(s[a + open.length])) { i = a + open.length; continue; }
      const gt = open[0] === '<' ? s.indexOf('>', a) : a + open.length - 1;
      if (gt < 0) return;
      if (open[0] === '<' && s[gt - 1] === '/') { each(s.slice(a + open.length, gt - 1), ''); i = gt + 1; continue; }
      const b = s.indexOf(close, gt + 1);
      if (b < 0) return;
      each(s.slice(a + open.length, gt), s.slice(gt + 1, b));
      i = b + close.length;
    }
  }

  // Inhalt aller <t>-Elemente eines Abschnitts (Shared String, Inline-String).
  function tTexts(s) {
    let out = '';
    const re = /<t(?:\s[^>]*)?>([^<]*)<\/t>/g;
    let m;
    while ((m = re.exec(s))) out += decodeEntities(m[1]);
    return out;
  }
  function sharedStrings(xml, tick) {
    const list = [];
    sections(xml, '<si', '</si>', tick, (attrs, body) => list.push(body ? tTexts(body) : ''));
    return list;
  }
  // Zeile = Zeile, Zellen per Tab; Shared Strings, Inline-Strings und Zahlenwerte <v>.
  function sheetText(xml, shared, tick) {
    let out = '';
    sections(xml, '<row', '</row>', tick, (rowAttrs, row) => {
      const vals = [];
      sections(row, '<c', '</c>', tick, (attrs, body) => {
        const t = /\bt="([a-zA-Z]{1,9})"/.exec(attrs);
        const v = /<v>([^<]*)<\/v>/.exec(body);
        if (t && t[1] === 's') { const i = v ? parseInt(v[1], 10) : -1; vals.push(i >= 0 && i < shared.length ? shared[i] : ''); }
        else if (t && t[1] === 'inlineStr') vals.push(tTexts(body));
        else if (v) vals.push(decodeEntities(v[1]));
      });
      out += vals.join('\t') + '\n';
    });
    return out;
  }

  async function office(bytes, kind, tick, budget) {
    const entries = zipEntries(bytes, tick);
    let partial = entries.some((e) => EMBEDDED.test(e.name));
    let text = '';
    if (kind === 'docx') {
      const parts = entries.filter((e) => DOCX_PART.test(e.name));
      if (!parts.some((e) => e.name === 'word/document.xml')) throw fail('type');
      parts.sort((a, b) => (a.name === 'word/document.xml' ? -1 : b.name === 'word/document.xml' ? 1 : a.name < b.name ? -1 : 1));
      for (const e of parts) { text += docxText(utf8(await zipRead(bytes, e, budget)), tick) + '\n'; if (text.length > LIMITS.chars) throw fail('size'); }
    } else {
      const ss = entries.find((e) => e.name === 'xl/sharedStrings.xml');
      const shared = ss ? sharedStrings(utf8(await zipRead(bytes, ss, budget)), tick) : [];
      const sheets = entries.filter((e) => XLSX_SHEET.test(e.name));
      if (!sheets.length) throw fail('type');
      sheets.sort((a, b) => parseInt(a.name.slice(19), 10) - parseInt(b.name.slice(19), 10));
      for (const e of sheets) { text += sheetText(utf8(await zipRead(bytes, e, budget)), shared, tick) + '\n'; if (text.length > LIMITS.chars) throw fail('size'); }
    }
    return { text, partial };
  }

  // --- PDF (Auflage 12) ------------------------------------------------------------
  // Mini-Tokenizer fuer PDF-Objekte und Inhaltsstroeme. s = Binaertext (latin1).
  const WS = (c) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
  const DELIM = (c) => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;

  function lexer(s, tick) {
    let i = 0;
    function skip() {
      for (;;) {
        while (i < s.length && WS(s.charCodeAt(i))) i++;
        if (s.charCodeAt(i) === 37) { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
        return;
      }
    }
    function literal() {
      let depth = 1, out = '';
      i++;
      while (i < s.length) {
        tick();
        const c = s[i++];
        if (c === '\\') {
          const n = s[i++];
          if (n === 'n') out += '\n'; else if (n === 'r') out += '\r'; else if (n === 't') out += '\t';
          else if (n === 'b') out += '\b'; else if (n === 'f') out += '\f';
          else if (n === '\r') { if (s[i] === '\n') i++; } else if (n === '\n') { /* Zeilenfortsetzung */ }
          else if (n >= '0' && n <= '7') {
            let o = n;
            for (let k = 0; k < 2 && s[i] >= '0' && s[i] <= '7'; k++) o += s[i++];
            out += String.fromCharCode(parseInt(o, 8) & 255);
          } else if (n !== undefined) out += n;
        } else if (c === '(') { depth++; out += c; } else if (c === ')') { if (--depth === 0) break; out += c; } else out += c;
      }
      return { str: out };
    }
    function hex() {
      i++;
      let h = '';
      while (i < s.length && s[i] !== '>') { tick(); const c = s[i++]; if (/[0-9a-fA-F]/.test(c)) h += c; }
      i++;
      if (h.length % 2) h += '0';
      let out = '';
      for (let k = 0; k < h.length; k += 2) out += String.fromCharCode(parseInt(h.slice(k, k + 2), 16));
      return { str: out, hex: true };
    }
    // Ein Token: Zahl, Name, String, Operator/Schluesselwort, Klammern.
    function next() {
      skip();
      if (i >= s.length) return null;
      const c = s.charCodeAt(i);
      if (c === 40) return literal();
      if (c === 60) { if (s.charCodeAt(i + 1) === 60) { i += 2; return { op: '<<' }; } return hex(); }
      if (c === 62 && s.charCodeAt(i + 1) === 62) { i += 2; return { op: '>>' }; }
      if (c === 91 || c === 93 || c === 123 || c === 125) { i++; return { op: s[i - 1] }; }
      if (c === 47) {
        let j = i + 1;
        while (j < s.length && !WS(s.charCodeAt(j)) && !DELIM(s.charCodeAt(j))) j++;
        const name = s.slice(i + 1, j).replace(/#([0-9a-fA-F]{2})/g, (m, x) => String.fromCharCode(parseInt(x, 16)));
        i = j;
        return { name };
      }
      let j = i;
      while (j < s.length && !WS(s.charCodeAt(j)) && !DELIM(s.charCodeAt(j))) j++;
      if (j === i) { i++; return { op: s[i - 1] }; }
      const w = s.slice(i, j);
      i = j;
      if (/^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)$/.test(w)) return { num: parseFloat(w) };
      return { op: w };
    }
    return { next, get pos() { return i; }, set pos(v) { i = v; } };
  }

  // Ein Objekt lesen (Wert): Dict als Object (Schluessel ohne /), Array, Ref {ref}.
  function parseValue(lx, tick, depth) {
    if (depth > 64) throw fail('fail');
    const t = lx.next();
    return valueOf(t, lx, tick, depth);
  }
  function valueOf(t, lx, tick, depth) {
    if (!t) return null;
    if (t.op === '<<') {
      const d = Object.create(null);
      for (;;) {
        tick();
        const k = lx.next();
        if (!k || k.op === '>>') return d;
        if (k.name === undefined) continue;
        d[k.name] = parseValue(lx, tick, depth + 1);
      }
    }
    if (t.op === '[') {
      const a = [];
      for (;;) {
        tick();
        const save = lx.pos;
        const k = lx.next();
        if (!k || k.op === ']') return a;
        // Verweis "n g R" in Arrays
        if (k.num !== undefined) {
          const p2 = lx.pos;
          const g2 = lx.next(), r = lx.next();
          if (g2 && g2.num !== undefined && r && r.op === 'R') { a.push({ ref: k.num }); continue; }
          lx.pos = p2;
          a.push(k.num);
          continue;
        }
        lx.pos = save;
        a.push(parseValue(lx, tick, depth + 1));
      }
    }
    if (t.num !== undefined) {
      const save = lx.pos;
      const g2 = lx.next(), r = lx.next();
      if (g2 && g2.num !== undefined && r && r.op === 'R') return { ref: t.num };
      lx.pos = save;
      return t.num;
    }
    if (t.name !== undefined) return { n: t.name };
    if (t.str !== undefined) return t;
    return { op: t.op };
  }

  const latin1 = (b) => {
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return s;
  };
  const bytesOfStr = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  const nameOf = (v) => (v && v.n !== undefined ? v.n : null);
  const filters = (d) => { const f = d.Filter; return f === undefined || f === null ? [] : Array.isArray(f) ? f.map(nameOf) : [nameOf(f)]; };

  async function pdf(bytes, tick, budget) {
    const s = latin1(bytes);
    const hp = s.indexOf('%PDF-');
    if (hp < 0 || hp > 1024) throw fail('type');
    if (/\/Encrypt\s*[0-9<]/.test(s)) throw fail('encrypted');
    const objs = new Map();     // Nummer -> { dict|value, raw (Binaertext des Stroms) }
    const re = /([0-9]{1,10})\s+[0-9]{1,5}\s+obj\b/g;
    let m;
    while ((m = re.exec(s))) {
      tick();
      if (objs.size > LIMITS.objects) throw fail('size');
      const lx = lexer(s, tick);
      lx.pos = re.lastIndex;
      let val;
      try { val = parseValue(lx, tick, 0); } catch (e) { if (e && e.code === 'timeout') throw e; continue; }
      const o = { val, raw: null };
      const after = lx.pos;
      const st = /^\s*stream(?:\r\n|\n|\r)/.exec(s.slice(after, after + 20));
      if (st && val && typeof val === 'object' && !Array.isArray(val)) {
        const from = after + st[0].length;
        let len = typeof val.Length === 'number' ? val.Length : -1;
        let end = len >= 0 && from + len <= s.length && /^\s*endstream/.test(s.slice(from + len, from + len + 20)) ? from + len : s.indexOf('endstream', from);
        if (end < 0) end = s.length;
        o.raw = s.slice(from, end);
        re.lastIndex = end;
      } else re.lastIndex = Math.max(re.lastIndex, after);
      objs.set(Number(m[1]), o);
    }
    const resolve = (v, depth) => {
      let d = depth || 0;
      while (v && v.ref !== undefined && d++ < 16) { const o = objs.get(v.ref); v = o ? o.val : null; }
      return v;
    };
    const decoded = new Map();
    let unsupported = false;
    async function streamOf(num) {
      if (decoded.has(num)) return decoded.get(num);
      const o = objs.get(num);
      if (!o || o.raw === null) return null;
      const f = filters(o.val);
      let out = null;
      if (!f.length) out = o.raw;
      else if (f.length === 1 && f[0] === 'FlateDecode') out = latin1(await inflate(bytesOfStr(o.raw), 'deflate', budget, LIMITS.inflated));
      else unsupported = true;
      decoded.set(num, out);
      return out;
    }
    const refNum = (v) => (v && v.ref !== undefined ? v.ref : null);

    // Objektstroeme: enthaltene Objekte (ohne Stroeme) nachtragen.
    for (const [num, o] of [...objs]) {
      tick();
      if (!o.val || nameOf(o.val.Type) !== 'ObjStm') continue;
      const data = await streamOf(num).catch((e) => { if (e && (e.code === 'size' || e.code === 'timeout')) throw e; return null; });
      if (!data) continue;
      const n = typeof o.val.N === 'number' ? o.val.N : 0, first = typeof o.val.First === 'number' ? o.val.First : 0;
      const head = lexer(data.slice(0, first), tick);
      for (let k = 0; k < n && k < 100000; k++) {
        const a = head.next(), b = head.next();
        if (!a || !b || a.num === undefined || b.num === undefined) break;
        if (objs.has(a.num)) continue;
        const lx = lexer(data, tick);
        lx.pos = first + b.num;
        try { objs.set(a.num, { val: parseValue(lx, tick, 0), raw: null }); } catch (e) { if (e && e.code === 'timeout') throw e; }
      }
    }

    // Schriften: ToUnicode-Zuordnung je Schrift-Objekt (Cache je Objektnummer).
    const fontCache = new Map();
    async function fontOf(fv) {
      const key = refNum(fv);
      if (key !== null && fontCache.has(key)) return fontCache.get(key);
      const fd = resolve(fv);
      let font = { map: null, width: 1, cid: false };
      if (fd && typeof fd === 'object') {
        const enc = nameOf(fd.Encoding);
        const sub = nameOf(fd.Subtype);
        font.cid = sub === 'Type0' || enc === 'Identity-H' || enc === 'Identity-V';
        if (font.cid) font.width = 2;
        const tu = refNum(fd.ToUnicode);
        if (tu !== null) {
          const cm = await streamOf(tu);
          if (cm) Object.assign(font, cmap(cm, tick));
        }
      }
      if (key !== null) fontCache.set(key, font);
      return font;
    }

    let text = '';
    let pagesNoText = 0, pages = 0, badFonts = false;
    const visited = new Set();

    async function runContent(data, res, depth) {
      if (depth > LIMITS.depth) { unsupported = true; return; }
      res = resolve(res) || {};
      const fonts = resolve(res.Font) || {};
      const xobj = resolve(res.XObject) || {};
      const lx = lexer(data, tick);
      const stack = [];
      let font = null;
      let out = '';
      for (;;) {
        tick();
        const t = lx.next();
        if (!t) break;
        if (t.op === undefined || t.op === '<<' || t.op === '[') {
          stack.push(t.op === '[' || t.op === '<<' ? valueOf(t, lx, tick, 0) : t.name !== undefined ? { n: t.name } : t);
          if (stack.length > 64) stack.shift();
          continue;
        }
        const op = t.op;
        if (op === 'Tf') { const fn = stack.length >= 2 ? nameOf(stack[stack.length - 2]) : null; font = fn && Object.hasOwn(fonts, fn) ? await fontOf(fonts[fn]) : null; }
        else if (op === 'Tj' || op === "'" || op === '"') { if (op !== 'Tj') out += '\n'; const v = stack[stack.length - 1]; if (v && v.str !== undefined) out += show(v.str, font); }
        else if (op === 'TJ') {
          const arr = stack[stack.length - 1];
          if (Array.isArray(arr)) for (const x of arr) { if (x && x.str !== undefined) out += show(x.str, font); else if (typeof x === 'number' && x < -200) out += ' '; }
        } else if (op === 'T*' || op === 'ET') out += '\n';
        else if (op === 'Td' || op === 'TD') { const ty = stack[stack.length - 1]; out += typeof ty === 'number' && ty !== 0 ? '\n' : ' '; }
        else if (op === 'BI') {
          // Inline-Bild: Binaerdaten bis " EI" ueberspringen.
          const at = data.indexOf('ID', lx.pos);
          const reEI = /\sEI(?:\s|$)/g;
          reEI.lastIndex = at < 0 ? data.length : at + 3;
          const mm = reEI.exec(data);
          lx.pos = mm ? mm.index + 3 : data.length;
        } else if (op === 'Do') {
          const xn = nameOf(stack[stack.length - 1]);
          const xr = xn && Object.hasOwn(xobj, xn) ? xobj[xn] : null;
          const num = refNum(xr);
          if (num !== null && !visited.has(num)) {
            const xo = objs.get(num);
            if (xo && xo.val && nameOf(xo.val.Subtype) === 'Form') {
              visited.add(num);
              const d = await streamOf(num);
              if (d) out += await runContent(d, xo.val.Resources || res, depth + 1);
              visited.delete(num);
            }
          }
        }
        stack.length = 0;
        if (out.length > LIMITS.chars) throw fail('size');
      }
      return out;
    }

    function show(str, font) {
      if (!font) return winAnsi(str);
      if (font.map) {
        let o = '';
        const w = font.width;
        for (let i = 0; i + w <= str.length; i += w) {
          const code = w === 2 ? (str.charCodeAt(i) << 8) | str.charCodeAt(i + 1) : str.charCodeAt(i);
          const u = font.map.get(code);
          if (u !== undefined) o += u; else if (!font.cid) o += winAnsi(str[i]); else { badFonts = true; o += ' '; }
        }
        return o;
      }
      if (font.cid) { badFonts = true; return ' '; }
      return winAnsi(str);
    }

    // Seiten in Dokumentreihenfolge der Objekte (Ressourcen ueber Parent geerbt).
    const pageNums = [...objs.keys()].filter((k) => { const v = objs.get(k).val; return v && typeof v === 'object' && nameOf(v.Type) === 'Page'; }).sort((a, b) => a - b);
    for (const num of pageNums) {
      tick();
      const pv = objs.get(num).val;
      let res = pv.Resources, par = pv.Parent, d = 0;
      while (res === undefined && par && d++ < 32) { const pp = resolve(par); if (!pp) break; res = pp.Resources; par = pp.Parent; }
      const cont = resolve(pv.Contents);
      const refs = Array.isArray(cont) ? cont.map(refNum) : [refNum(pv.Contents)];
      let data = '';
      for (const r of refs) { if (r === null) continue; const st = await streamOf(r); if (st) data += st + '\n'; }
      pages++;
      const t = data ? await runContent(data, res, 0) : '';
      if (!t.trim()) pagesNoText++;
      text += t + '\n';
      if (text.length > LIMITS.chars) throw fail('size');
    }
    const attach = /\/(?:EmbeddedFile|FileAttachment|RichMedia)\b/.test(s);
    if (!pages) throw fail('fail');
    if (!text.trim()) throw fail('empty');
    return { text, partial: attach || unsupported || badFonts || pagesNoText > 0 };
  }

  // CMap (ToUnicode): bfchar/bfrange, Breite aus codespacerange.
  function cmap(s, tick) {
    const map = new Map();
    let width = 1;
    const csA = s.indexOf('begincodespacerange'), csB = csA < 0 ? -1 : s.indexOf('endcodespacerange', csA);
    if (csB > 0) { const h = /<([0-9a-fA-F]{1,8})>/.exec(s.slice(csA + 19, csB)); if (h && h[1].length >= 4) width = 2; }
    const utf16 = (hex) => {
      let o = '';
      for (let i = 0; i + 4 <= hex.length; i += 4) o += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
      if (hex.length === 2) o = String.fromCharCode(parseInt(hex, 16));
      return o;
    };
    sections(s, 'beginbfchar', 'endbfchar', tick, (x, body) => {
      const re = /<([0-9a-fA-F]{1,8})>\s*<([0-9a-fA-F]{1,64})>/g;
      let m;
      while ((m = re.exec(body))) { tick(); map.set(parseInt(m[1], 16), utf16(m[2])); }
    });
    sections(s, 'beginbfrange', 'endbfrange', tick, (x, body) => {
      {
        const re = /<([0-9a-fA-F]{1,8})>\s*<([0-9a-fA-F]{1,8})>\s*(?:<([0-9a-fA-F]{1,64})>|\[([^\]]{0,4096})\])/g;
        let m;
        while ((m = re.exec(body))) {
          const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
          if (hi < lo || hi - lo > 65535) continue;
          if (m[3] !== undefined) {
            const base = utf16(m[3]);
            const last = base.charCodeAt(base.length - 1);
            for (let c = lo; c <= hi; c++) { tick(); map.set(c, base.slice(0, -1) + String.fromCharCode(last + (c - lo))); }
          } else {
            const list = m[4].match(/<[0-9a-fA-F]{1,64}>/g) || [];
            for (let c = lo; c <= hi && c - lo < list.length; c++) { tick(); map.set(c, utf16(list[c - lo].slice(1, -1))); }
          }
        }
      }
    });
    return { map, width };
  }

  // WinAnsi (cp1252) fuer einfache Schriften ohne ToUnicode.
  const CP1252 = { 128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225, 136: 710, 137: 8240, 138: 352, 139: 8249, 140: 338, 142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226, 150: 8211, 151: 8212, 152: 732, 153: 8482, 154: 353, 155: 8250, 156: 339, 158: 382, 159: 376 };
  function winAnsi(str) {
    let o = '';
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); o += String.fromCharCode(CP1252[c] || c); }
    return o;
  }

  // Einstieg: bytes = Uint8Array, kind aus kindOf. Gibt { text, partial } zurueck.
  async function extract(bytes, kind, ms) {
    try {
      return await extractRaw(bytes, kind, ms);
    } catch (e) {
      // Nur feste Codes nach aussen, nie Fehlertexte mit Dateiinhalt.
      throw fail(e && CODES.indexOf(e.code) !== -1 ? e.code : 'fail');
    }
  }
  async function extractRaw(bytes, kind, ms) {
    if (!(bytes instanceof Uint8Array)) throw fail('fail');
    if (bytes.length > LIMITS.bytes) throw fail('size');
    const limit = Math.min(LIMITS.ms, Math.max(500, Number(ms) || LIMITS.ms));
    const tick = clock(limit);
    const budget = { used: 0, deadline: Date.now() + limit };
    let r;
    if (kind === 'text') {
      const text = textFile(bytes);
      if (text.length > LIMITS.chars) throw fail('size');
      r = { text, partial: false };
    } else if (kind === 'docx' || kind === 'xlsx') r = await office(bytes, kind, tick, budget);
    else if (kind === 'pdf') r = await pdf(bytes, tick, budget);
    else throw fail('type');
    if (r.text.length > LIMITS.chars) throw fail('size');
    if (kind !== 'text' && !r.text.trim()) throw fail('empty');
    return r;
  }

  const CODES = ['size', 'type', 'encrypted', 'empty', 'timeout', 'fail'];
  DLX.datei = Object.freeze({ LIMITS, CODES, kindOf, extract });
})(globalThis);
