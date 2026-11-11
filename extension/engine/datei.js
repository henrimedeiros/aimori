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
  const LIMITS = Object.freeze({ files: 5, bytes: 20 * 1024 * 1024, inflated: 60 * 1024 * 1024, entries: 2000, chars: 5000000, ms: 30000, depth: 8, objects: 200000 });

  const fail = (code) => { const e = new Error(code); e.code = code; return e; };

  // Art aus Dateiname und MIME-Typ; null = kein Dokument dieser Pruefung.
  const EXT = { pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', pptx: 'pptx', odt: 'odf', ods: 'odf', odp: 'odf', rtf: 'rtf', doc: 'doc', xls: 'xls', ppt: 'ppt', txt: 'text', csv: 'text' };
  const MIME = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.oasis.opendocument.text': 'odf',
    'application/vnd.oasis.opendocument.spreadsheet': 'odf',
    'application/vnd.oasis.opendocument.presentation': 'odf',
    'application/rtf': 'rtf', 'application/msword': 'doc', 'application/vnd.ms-excel': 'xls', 'application/vnd.ms-powerpoint': 'ppt',
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
  const EMBEDDED = /^(?:word|xl|ppt)\/embeddings\/|^(?:word|xl|ppt)\/activeX\/|^Object [0-9]{1,4}\/|\.(?:bin|ole)$/i;
  // PowerPoint: Folien, Notizen, Kommentare und SmartArt-Texte (diagrams/data); Reihenfolge Folien,
  // dann Notizen, dann der Rest. Diagramme (ppt/charts) tragen ihre Werte nicht in a:t: "partial".
  const PPTX_PART = /^ppt\/(?:slides\/slide|notesSlides\/notesSlide|diagrams\/data)[0-9]{1,4}\.xml$|^ppt\/comments\/[A-Za-z0-9_]{1,60}\.xml$/;
  const PPTX_UNREAD = /^ppt\/charts\//;

  // WordprocessingML (ns "w") und DrawingML (ns "a", PowerPoint): nur Inhalt von <x:t>,
  // Absatz = Zeile, Tab/Umbruch. Auch die Kurzform <w:br/> und <w:tab/> zaehlt als Trenner.
  const W_TAGS = /<(\/?)w:(t|p|tab|br|cr)(?:\s[^>]*)?\/?>/g;
  const A_TAGS = /<(\/?)a:(t|p|tab|br|cr)(?:\s[^>]*)?\/?>/g;
  function docxText(xml, tick, tags) {
    const re = tags || W_TAGS;
    re.lastIndex = 0;
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

  // OpenDocument (ODT/ODS/ODP): Zeichendaten ab der Start-Marke; Absatz, Ueberschrift und
  // Tabellenzeile = Zeile, Zelle und <text:tab/> = Tab, <text:s/> = Leerzeichen. Eingebettete
  // Binaerdaten (office:binary-data) werden uebersprungen. Linear per indexOf.
  function odfText(xml, from, tick) {
    let out = '', i = from, skip = false, cells = 0;
    for (;;) {
      tick();
      const lt = xml.indexOf('<', i);
      if (lt < 0) break;
      if (!skip && lt > i) out += decodeEntities(xml.slice(i, lt));
      const gt = xml.indexOf('>', lt + 1);
      if (gt < 0) break;
      const close = xml.charCodeAt(lt + 1) === 47;
      const a = lt + (close ? 2 : 1);
      let e = a;
      while (e < gt && !TAG_END.has(xml[e])) e++;
      const name = xml.slice(a, e);
      if (name === 'office:binary-data') skip = !close && xml[gt - 1] !== '/';
      else if (name === 'table:table-cell') { if (close) { if (cells > 0) cells--; out += '\t'; } else if (xml[gt - 1] !== '/') cells++; else out += '\t'; }
      else if (close && (name === 'text:p' || name === 'text:h')) out += cells > 0 ? ' ' : '\n';
      else if (close && name === 'table:table-row') out += '\n';
      else if (!close && name === 'text:tab') out += '\t';
      else if (!close && name === 'text:s') out += ' ';
      else if (!close && name === 'text:line-break') out += '\n';
      i = gt + 1;
      if (out.length > LIMITS.chars) throw fail('size');
    }
    return out;
  }

  async function office(bytes, kind, tick, budget) {
    const entries = zipEntries(bytes, tick);
    let partial = entries.some((e) => EMBEDDED.test(e.name));
    let text = '';
    if (kind === 'pptx') {
      const num = (n) => parseInt((/([0-9]{1,4})\.xml$/.exec(n) || [0, '0'])[1], 10);
      const rank = (n) => (n.startsWith('ppt/slides/') ? 0 : n.startsWith('ppt/notesSlides/') ? 1 : 2);
      const parts = entries.filter((e) => PPTX_PART.test(e.name));
      if (!parts.some((e) => rank(e.name) === 0)) throw fail('type');
      if (entries.some((e) => PPTX_UNREAD.test(e.name))) partial = true;
      parts.sort((a, b) => rank(a.name) - rank(b.name) || num(a.name) - num(b.name) || (a.name < b.name ? -1 : 1));
      for (const e of parts) { text += docxText(utf8(await zipRead(bytes, e, budget)), tick, A_TAGS) + '\n'; if (text.length > LIMITS.chars) throw fail('size'); }
    } else if (kind === 'odf') {
      const main = entries.find((e) => e.name === 'content.xml');
      if (!main) throw fail('type');
      const mf = entries.find((e) => e.name === 'META-INF/manifest.xml');
      if (mf && utf8(await zipRead(bytes, mf, budget)).indexOf('encryption-data') !== -1) throw fail('encrypted');
      const xml = utf8(await zipRead(bytes, main, budget));
      const body = xml.indexOf('<office:body');
      if (body < 0) throw fail('type');
      text = odfText(xml, body, tick) + '\n';
      // Kopf- und Fusszeilen stehen in styles.xml unter office:master-styles.
      const st = entries.find((e) => e.name === 'styles.xml');
      if (st) {
        const sx = utf8(await zipRead(bytes, st, budget));
        const ms = sx.indexOf('<office:master-styles');
        if (ms >= 0) text += odfText(sx, ms, tick) + '\n';
      }
    } else if (kind === 'docx') {
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

  // --- RTF und alte Office-Formate (Design-Review Dateiformate 11.11.2026, Nachtrag) -----
  // RTF: nur Text; Steuerwoerter werden gelesen, nie ausgefuehrt. Tabellen fuer Schriften, Farben,
  // Formatvorlagen, Bilder und alle "\*"-Ziele werden uebersprungen. s = Binaertext (latin1).
  const RTF_SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'listtable',
    'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'filetbl', 'revtbl', 'objdata', 'fldinst', 'bkmkstart', 'bkmkend', 'template', 'operator', 'author']);
  const RTF_CHAR = { par: '\n', line: '\n', sect: '\n', page: '\n', row: '\n', tab: '\t', cell: '\t', emdash: '—', endash: '–', lquote: '‘', rquote: '’',
    ldblquote: '“', rdblquote: '”', bullet: '•', emspace: ' ', enspace: ' ' };
  function rtfText(s, tick) {
    if (!/^\s{0,8}\{\\rtf/.test(s.slice(0, 32))) throw fail('type');
    let out = '', i = 0, depth = 0, skipAt = -1, star = false, uc = 1, pend = 0, partial = false;
    const ucs = [];
    const put = (t) => { if (skipAt < 0) { out += t; if (out.length > LIMITS.chars) throw fail('size'); } };
    while (i < s.length) {
      tick();
      const c = s[i];
      if (c === '{') { depth++; ucs.push(uc); star = false; pend = 0; i++; continue; }
      if (c === '}') { depth--; if (ucs.length) uc = ucs.pop(); if (skipAt >= 0 && depth < skipAt) skipAt = -1; star = false; pend = 0; i++; if (depth <= 0) break; continue; }
      if (c !== '\\') {
        i++;
        if (c === '\r' || c === '\n') continue;
        if (pend > 0) { pend--; continue; }
        put(winAnsi(c));
        continue;
      }
      const n = s[i + 1];
      if (n === undefined) break;
      if (n === "'") {
        const h = parseInt(s.slice(i + 2, i + 4), 16);
        i += 4;
        if (pend > 0) { pend--; continue; }
        if (h >= 0) put(winAnsi(String.fromCharCode(h)));
        continue;
      }
      if (!((n >= 'a' && n <= 'z') || (n >= 'A' && n <= 'Z'))) {
        i += 2;
        if (n === '*') { star = true; continue; }
        if (n === '\\' || n === '{' || n === '}') put(n);
        else if (n === '~') put(' ');
        else if (n === '_') put('-');
        else if (n === '\r' || n === '\n') put('\n');
        continue;
      }
      let j = i + 1;
      while (j < s.length && j - i <= 33 && ((s[j] >= 'a' && s[j] <= 'z') || (s[j] >= 'A' && s[j] <= 'Z'))) j++;
      const word = s.slice(i + 1, j);
      let k = j;
      if (s[k] === '-') k++;
      while (k < s.length && k - j <= 11 && s[k] >= '0' && s[k] <= '9') k++;
      const hasNum = k > j && !(k === j + 1 && s[j] === '-');
      const num = hasNum ? parseInt(s.slice(j, k), 10) : null;
      i = hasNum ? k : j;
      if (s[i] === ' ') i++;
      // Ziel mit "\*" oder aus der festen Liste: ganze Gruppe ueberspringen.
      if (skipAt < 0 && (star || RTF_SKIP.has(word))) { skipAt = depth; star = false; continue; }
      star = false;
      if (word === 'bin' && num > 0) { i += num; continue; }
      if (word === 'uc' && num !== null) { uc = Math.max(0, Math.min(num, 8)); continue; }
      if (word === 'u' && num !== null) { put(String.fromCharCode(num < 0 ? num + 65536 : num)); pend = uc; continue; }
      if (word === 'object') partial = true;
      if (Object.hasOwn(RTF_CHAR, word)) put(RTF_CHAR[word]);
    }
    return { text: out, partial };
  }

  // Compound File Binary (.doc, .xls, .ppt): Sektoren, FAT, Verzeichnis, Mini-Strom. Alle Ketten
  // haben eine Laengengrenze (keine Schleifen), Groessen zaehlen gegen das Entpack-Budget.
  const CFB_END = 0xfffffffe;
  function cfb(b, tick, budget) {
    const MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    if (b.length < 1536 || MAGIC.some((x, i) => b[i] !== x)) throw fail('type');
    const shift = u16(b, 30), mshift = u16(b, 32);
    if ((shift !== 9 && shift !== 12) || mshift !== 6) throw fail('fail');
    const ssz = 1 << shift, total = Math.floor(b.length / ssz);
    const off = (n) => (n + 1) * ssz;
    const ok = (n) => n < total - 1 + 1 && off(n) + ssz <= b.length;
    // FAT-Sektoren: 109 im Kopf, weitere ueber die DIFAT-Kette.
    const fatSecs = [];
    for (let i = 0; i < 109; i++) { const v = u32(b, 76 + i * 4); if (v < CFB_END - 1) fatSecs.push(v); }
    let dif = u32(b, 68), guard = 0;
    while (dif < CFB_END - 1 && guard++ < total) {
      tick();
      if (!ok(dif)) throw fail('fail');
      for (let i = 0; i < ssz / 4 - 1; i++) { const v = u32(b, off(dif) + i * 4); if (v < CFB_END - 1) fatSecs.push(v); }
      dif = u32(b, off(dif) + ssz - 4);
    }
    if (fatSecs.length > total) throw fail('fail');
    const fat = new Uint32Array(fatSecs.length * (ssz / 4));
    fatSecs.forEach((sec, k) => { if (!ok(sec)) throw fail('fail'); for (let i = 0; i < ssz / 4; i++) fat[k * (ssz / 4) + i] = u32(b, off(sec) + i * 4); });
    const read = (start, size) => {
      if (size > LIMITS.inflated || size > b.length) throw fail('size');
      budget.used += size;
      if (budget.used > LIMITS.inflated) throw fail('size');
      const out = new Uint8Array(size);
      const seen = new Uint8Array(total + 1);   // ein Sektor zweimal in derselben Kette = Schleife
      let sec = start, at = 0;
      while (at < size) {
        tick();
        if (sec >= fat.length || !ok(sec) || seen[sec]) throw fail('fail');
        seen[sec] = 1;
        const take = Math.min(ssz, size - at);
        out.set(b.subarray(off(sec), off(sec) + take), at);
        at += take;
        sec = fat[sec];
      }
      return out;
    };
    const chainLen = (start) => { let sec = start, n = 0; while (sec < CFB_END - 1 && sec < fat.length && n <= total) { n++; sec = fat[sec]; } if (n > total) throw fail('fail'); return n; };
    const dirBytes = read(u32(b, 48), chainLen(u32(b, 48)) * ssz);
    const entries = [];
    for (let p = 0; p + 128 <= dirBytes.length && entries.length < LIMITS.entries; p += 128) {
      const type = dirBytes[p + 66], nlen = u16(dirBytes, p + 64);
      if ((type !== 1 && type !== 2 && type !== 5) || nlen < 2 || nlen > 64) continue;
      let name = '';
      for (let i = 0; i + 2 < nlen; i += 2) name += String.fromCharCode(u16(dirBytes, p + i));
      entries.push({ name, type, start: u32(dirBytes, p + 116), size: u32(dirBytes, p + 120) });
    }
    const root = entries.find((e) => e.type === 5);
    if (!root) throw fail('fail');
    const cutoff = u32(b, 56);
    let mini = null, mfat = null;
    const stream = (name) => {
      const e = entries.find((x) => x.type === 2 && x.name.toLowerCase() === name.toLowerCase());
      if (!e) return null;
      if (e.size >= cutoff) return read(e.start, e.size);
      if (!mini) {
        mini = read(root.start, Math.min(root.size, chainLen(root.start) * ssz));
        const mf = read(u32(b, 60), chainLen(u32(b, 60)) * ssz);
        mfat = new Uint32Array(mf.length >> 2);
        for (let i = 0; i < mfat.length; i++) mfat[i] = u32(mf, i * 4);
      }
      budget.used += e.size;
      if (budget.used > LIMITS.inflated) throw fail('size');
      const out = new Uint8Array(e.size);
      const seen = new Uint8Array(mfat.length);
      let sec = e.start, at = 0;
      while (at < e.size) {
        tick();
        if (sec >= mfat.length || (sec + 1) * 64 > mini.length || seen[sec]) throw fail('fail');
        seen[sec] = 1;
        const take = Math.min(64, e.size - at);
        out.set(mini.subarray(sec * 64, sec * 64 + take), at);
        at += take;
        sec = mfat[sec];
      }
      return out;
    };
    return { stream, has: (name) => entries.some((x) => x.name.toLowerCase() === name.toLowerCase()) };
  }
  const utf16le = (b, from, chars) => { let o = ''; for (let i = 0; i < chars; i++) o += String.fromCharCode(u16(b, from + i * 2)); return o; };

  // Word 97-2003: Text ueber die Stuecktabelle (Clx) im Tabellenstrom; Steuerzeichen -> Trenner.
  function docText(c, tick) {
    const wd = c.stream('WordDocument');
    if (!wd || wd.length < 430 || u16(wd, 0) !== 0xa5ec) throw fail('type');
    const flags = u16(wd, 10);
    if (flags & 0x0100) throw fail('encrypted');
    const tb = c.stream(flags & 0x0200 ? '1Table' : '0Table');
    const fcClx = u32(wd, 418), lcbClx = u32(wd, 422);
    if (!tb || !lcbClx || fcClx + lcbClx > tb.length) throw fail('fail');
    let p = fcClx;
    const end = fcClx + lcbClx;
    while (p < end && tb[p] === 1) { tick(); p += 3 + u16(tb, p + 1); }
    if (p + 5 > end || tb[p] !== 2) throw fail('fail');
    const lcb = u32(tb, p + 1);
    p += 5;
    const n = Math.floor((lcb - 4) / 12);
    if (n < 1 || p + lcb > tb.length) throw fail('fail');
    let out = '';
    for (let k = 0; k < n; k++) {
      tick();
      const count = u32(tb, p + (k + 1) * 4) - u32(tb, p + k * 4);
      const fc = u32(tb, p + (n + 1) * 4 + k * 8 + 2);
      if (count <= 0 || count > LIMITS.chars) throw fail('fail');
      if (fc & 0x40000000) {
        const at = (fc & 0x3fffffff) >>> 1;
        if (at + count > wd.length) throw fail('fail');
        out += winAnsi(latin1(wd.subarray(at, at + count)));
      } else {
        if (fc + count * 2 > wd.length) throw fail('fail');
        out += utf16le(wd, fc, count);
      }
      if (out.length > LIMITS.chars) throw fail('size');
    }
    // 13 Absatz, 11 Zeile, 12 Seite, 7 Zelle; 19/20/21 Feldgrenzen; 1/8 Grafik; 30/31 Trennstriche.
    out = out.replace(/[\x00-\x1f]/g, (ch) => { const v = ch.charCodeAt(0); return v === 13 || v === 11 || v === 12 || v === 10 ? '\n' : v === 7 || v === 9 ? '\t' : v === 30 ? '-' : v === 19 || v === 20 || v === 21 ? ' ' : ''; });
    return { text: out, partial: c.has('ObjectPool') };
  }

  // Excel 97-2003 (BIFF8): gemeinsame Zeichenketten (SST, auch ueber CONTINUE) und Zellwerte.
  function xlsText(c, tick) {
    const wb = c.stream('Workbook') || c.stream('Book');
    if (!wb) throw fail('type');
    const recs = [];
    for (let p = 0; p + 4 <= wb.length;) { tick(); const id = u16(wb, p), len = u16(wb, p + 2); if (p + 4 + len > wb.length) break; recs.push([id, p + 4, len]); p += 4 + len; }
    if (!recs.length || recs[0][0] !== 0x0809) throw fail('type');
    if (recs.some((r) => r[0] === 0x002f)) throw fail('encrypted');
    const sst = [];
    for (let r = 0; r < recs.length; r++) {
      if (recs[r][0] !== 0x00fc) continue;
      // Abschnitte: SST und die folgenden CONTINUE; in Zeichendaten beginnt jeder neue Abschnitt mit einem Kennbyte.
      const segs = [[recs[r][1] + 8, recs[r][1] + recs[r][2]]];
      for (let q = r + 1; q < recs.length && recs[q][0] === 0x003c; q++) segs.push([recs[q][1], recs[q][1] + recs[q][2]]);
      let si = 0, pos = segs[0][0];
      const more = () => { while (si < segs.length && pos >= segs[si][1]) { si++; if (si < segs.length) pos = segs[si][0]; } return si < segs.length; };
      const byte = () => (more() ? wb[pos++] : -1);
      const word = () => { const a = byte(), b2 = byte(); return a < 0 || b2 < 0 ? -1 : a | (b2 << 8); };
      const skip = (n) => { while (n > 0 && more()) { const t = Math.min(n, segs[si][1] - pos); pos += t; n -= t; } };
      const total = u32(wb, recs[r][1] + 4);
      for (let k = 0; k < total && k < 1000000 && more(); k++) {
        tick();
        const cch = word();
        let fl = byte();
        if (cch < 0 || fl < 0) break;
        const runs = fl & 8 ? word() : 0;
        let ext = 0;
        if (fl & 4) { const a = word(), b2 = word(); ext = a < 0 || b2 < 0 ? 0 : (a | (b2 << 16)) >>> 0; }
        let str = '', left = cch;
        while (left > 0 && more()) {
          if (pos === segs[si][0] && si > 0 && str.length + left === cch && str.length > 0) fl = byte();   // Fortsetzung mitten in der Zeichenkette
          const wide = fl & 1, can = Math.min(left, Math.floor((segs[si][1] - pos) / (wide ? 2 : 1)));
          if (can <= 0) { pos = segs[si][1]; if (!more()) break; fl = byte(); continue; }
          str += wide ? utf16le(wb, pos, can) : latin1(wb.subarray(pos, pos + can));
          pos += can * (wide ? 2 : 1);
          left -= can;
          if (left > 0) { if (!more()) break; fl = byte(); }
        }
        skip(runs * 4 + ext);
        sst.push(str);
      }
      break;
    }
    const numText = (v) => (Number.isFinite(v) ? (Number.isInteger(v) && Math.abs(v) < 1e21 ? v.toFixed(0) : String(+v.toPrecision(15))) : '');
    const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
    const rk = (v) => { const x = v & 2 ? v >> 2 : (() => { const t = new DataView(new ArrayBuffer(8)); t.setUint32(4, v & 0xfffffffc, true); return t.getFloat64(0, true); })(); return v & 1 ? x / 100 : x; };
    let out = '', row = -1, line = [];
    const flush = () => { if (line.length) { out += line.join('\t') + '\n'; line = []; if (out.length > LIMITS.chars) throw fail('size'); } };
    const cell = (r, text) => { if (r !== row) { flush(); row = r; } line.push(text); };
    for (const [id, p, len] of recs) {
      tick();
      if (id === 0x0809) { flush(); row = -1; }
      else if (id === 0x00fd && len >= 10) { const i = u32(wb, p + 6); cell(u16(wb, p), i < sst.length ? sst[i] : ''); }
      else if (id === 0x0203 && len >= 14) cell(u16(wb, p), numText(dv.getFloat64(p + 6, true)));
      else if (id === 0x027e && len >= 10) cell(u16(wb, p), numText(rk(u32(wb, p + 6) | 0)));
      else if (id === 0x00bd && len >= 6) { for (let q = p + 4; q + 6 <= p + len - 2; q += 6) cell(u16(wb, p), numText(rk(u32(wb, q + 2) | 0))); }
      else if (id === 0x0006 && len >= 14 && u16(wb, p + 12) !== 0xffff) cell(u16(wb, p), numText(dv.getFloat64(p + 6, true)));
      else if ((id === 0x0207 || id === 0x0204) && len >= 3) {
        // Ergebnis einer Formel als Text bzw. Zelle mit eigenem Text: Laenge, Kennbyte, Zeichen.
        const base = id === 0x0204 ? p + 6 : p, cch = u16(wb, base), wide = wb[base + 2] & 1;
        if (base + 3 + cch * (wide ? 2 : 1) <= p + len) cell(id === 0x0204 ? u16(wb, p) : row, wide ? utf16le(wb, base + 3, cch) : latin1(wb.subarray(base + 3, base + 3 + cch)));
      }
    }
    flush();
    // Kommentare, Textfelder und Diagramme stehen in eigenen Saetzen, die hier nicht gelesen werden.
    return { text: out, partial: recs.some((r) => r[0] === 0x01b6 || r[0] === 0x1002) || c.has('ObjectPool') };
  }

  // PowerPoint 97-2003: Textatome im Strom "PowerPoint Document" (Behaelter rekursiv, begrenzte Tiefe).
  function pptText(c, tick) {
    const pd = c.stream('PowerPoint Document');
    if (!pd) throw fail('type');
    if (c.has('EncryptedSummary')) throw fail('encrypted');
    let out = '';
    const walk = (from, to, depth) => {
      if (depth > 32) throw fail('fail');
      for (let p = from; p + 8 <= to;) {
        tick();
        const ver = u16(pd, p) & 15, type = u16(pd, p + 2), len = u32(pd, p + 4);
        const a = p + 8, b2 = a + len;
        if (b2 > to) break;
        if (type === 0x2f14) throw fail('encrypted');
        if (ver === 15) walk(a, b2, depth + 1);
        else if (type === 0x0fa0 || type === 0x0fba) out += utf16le(pd, a, len >> 1) + '\n';
        else if (type === 0x0fa8) out += latin1(pd.subarray(a, b2)) + '\n';
        if (out.length > LIMITS.chars) throw fail('size');
        p = b2;
      }
    };
    walk(0, pd.length, 0);
    out = out.replace(/[\x00-\x08\x0b-\x1f]/g, (ch) => (ch === '\r' || ch === '\x0b' ? '\n' : ''));
    return { text: out, partial: c.has('ObjectPool') };
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
    // at/end: Lage des ganzen Tokens im Text (fuer das Ueberdecken von Werten, pdfMask).
    function literal() {
      let depth = 1, out = '';
      const at = i;
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
      return { str: out, at, end: i };
    }
    function hex() {
      const at = i;
      i++;
      let h = '';
      while (i < s.length && s[i] !== '>') { tick(); const c = s[i++]; if (/[0-9a-fA-F]/.test(c)) h += c; }
      i++;
      if (h.length % 2) h += '0';
      let out = '';
      for (let k = 0; k < h.length; k += 2) out += String.fromCharCode(parseInt(h.slice(k, k + 2), 16));
      return { str: out, hex: true, at, end: i };
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

  // opt (nur fuer pdfMask): { rec: [] } merkt je gezeigter Zeichenkette Lage im Text, Token, Schrift
  // und Quelle; { rest: [] } sammelt alles, was nicht Seitentext ist (Restpruefung); ctx bekommt
  // die Objekte und Helfer zum Neuschreiben.
  async function pdf(bytes, tick, budget, opt) {
    const s = latin1(bytes);
    const hp = s.indexOf('%PDF-');
    if (hp < 0 || hp > 1024) throw fail('type');
    if (/\/Encrypt\s*[0-9<]/.test(s)) throw fail('encrypted');
    const rec = opt && opt.rec ? opt.rec : null;
    const rest = opt && opt.rest ? opt.rest : null;
    let dup = false;
    const objs = new Map();     // Nummer -> { dict|value, raw (Binaertext des Stroms) }
    const re = /([0-9]{1,10})\s+[0-9]{1,5}\s+obj\b/g;
    let m;
    while ((m = re.exec(s))) {
      tick();
      if (objs.size > LIMITS.objects) throw fail('size');
      const lx = lexer(s, tick);
      lx.pos = re.lastIndex;
      let val;
      // Beim Ueberdecken (opt) darf kein Objekt uebersprungen werden: sein Inhalt bliebe ungeprueft in der Datei.
      try { val = parseValue(lx, tick, 0); } catch (e) { if (opt || (e && e.code === 'timeout')) throw e; continue; }
      const o = { val, raw: null, at: m.index, head: m[0] };
      if (objs.has(Number(m[1]))) dup = true;   // aeltere Fassung desselben Objekts bleibt in der Datei
      const after = lx.pos;
      let bodyEnd = after;
      const st = /^\s*stream(?:\r\n|\n|\r)/.exec(s.slice(after, after + 20));
      if (st && val && typeof val === 'object' && !Array.isArray(val)) {
        const from = after + st[0].length;
        let len = typeof val.Length === 'number' ? val.Length : -1;
        let end = len >= 0 && from + len <= s.length && /^\s*endstream/.test(s.slice(from + len, from + len + 20)) ? from + len : s.indexOf('endstream', from);
        if (end < 0) end = s.length;
        o.raw = s.slice(from, end);
        bodyEnd = end;
        re.lastIndex = end;
      } else re.lastIndex = Math.max(re.lastIndex, after);
      if (opt) {
        const e = s.indexOf('endobj', re.lastIndex);
        o.to = e < 0 ? -1 : e + 6;
        // Zwischen dem Wert bzw. Strom und endobj darf nichts stehen: es bliebe ungeprueft in der Datei.
        if (e >= 0 && !(o.raw !== null ? /^\s*endstream\s*$/ : /^\s*$/).test(s.slice(bodyEnd, e))) throw fail('fail');
      }
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
      // Filter der Reihe nach (auch Ketten wie ASCII85 + Flate); unbekannte Filter (Bilder,
      // Verschluesselung) und LZW mit Praediktor = nicht lesbar, die Datei gilt dann als "partial".
      const f = filters(o.val);
      const dp = o.val.DecodeParms === undefined ? o.val.DP : o.val.DecodeParms;
      const parm = (k) => { const p = resolve(Array.isArray(dp) ? dp[k] : k === 0 ? dp : null); return p && typeof p === 'object' ? p : {}; };
      const count = (s) => { budget.used += s.length; if (budget.used > LIMITS.inflated) throw fail('size'); return s; };
      let out = o.raw;
      for (let k = 0; k < f.length && out !== null; k++) {
        const name = f[k];
        if (name === 'FlateDecode' || name === 'Fl') out = latin1(await inflate(bytesOfStr(out), 'deflate', budget, LIMITS.inflated));
        else if (name === 'ASCIIHexDecode' || name === 'AHx') out = count(asciiHex(out, tick));
        else if (name === 'ASCII85Decode' || name === 'A85') out = count(ascii85(out, tick));
        else if (name === 'RunLengthDecode' || name === 'RL') out = count(runLength(out, tick));
        else if ((name === 'LZWDecode' || name === 'LZW') && !(parm(k).Predictor > 1)) out = count(lzw(out, parm(k).EarlyChange !== 0, tick));
        else { unsupported = true; out = null; }
      }
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
        if (objs.has(a.num)) { dup = true; continue; }   // verdeckte Fassung bleibt im Objektstrom
        const lx = lexer(data, tick);
        lx.pos = first + b.num;
        // Beim Ueberdecken (opt) bricht ein unlesbares Objekt ab, wie auf der obersten Ebene.
        try { objs.set(a.num, { val: parseValue(lx, tick, 0), raw: null, stm: [num, k] }); } catch (e) { if (opt || (e && e.code === 'timeout')) throw e; }
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
        // Zeichenbreiten (1/1000 Schriftgrad) fuer die Frage "Luecke oder Fortsetzung" zwischen
        // zwei Textstuecken derselben Zeile; ohne Angabe bleibt adv leer (dann wie bisher Leerzeichen).
        if (sub === 'Type0') {
          const df = resolve(fd.DescendantFonts);
          const d0 = resolve(Array.isArray(df) ? df[0] : df);
          if (d0 && typeof d0 === 'object' && (enc === 'Identity-H' || enc === 'Identity-V')) {
            const dw = typeof d0.DW === 'number' ? d0.DW : 1000, W = resolve(d0.W), by = new Map();
            if (Array.isArray(W)) {
              for (let i = 0; i + 1 < W.length;) {
                tick();
                const c = W[i], nx = resolve(W[i + 1]);
                if (typeof c !== 'number') break;
                if (Array.isArray(nx)) { for (let j = 0; j < nx.length && j < 65536; j++) if (typeof nx[j] === 'number') by.set(c + j, nx[j]); i += 2; }
                else if (typeof nx === 'number' && typeof W[i + 2] === 'number') { for (let j = c; j <= nx && j - c < 65536; j++) by.set(j, W[i + 2]); i += 3; }
                else break;
              }
            }
            font.adv = (c) => (by.has(c) ? by.get(c) : dw);
          }
        } else {
          const fw = resolve(fd.Widths), fc = fd.FirstChar;
          if (Array.isArray(fw) && typeof fc === 'number') font.adv = (c) => { const w = fw[c - fc]; return typeof w === 'number' ? w : null; };
        }
      }
      if (key !== null) fontCache.set(key, font);
      return font;
    }
    // Vorschub einer Zeichenkette: Summe der Breiten (in Schriftgraden), Anzahl Codes und
    // Leerzeichen; null = Breiten unbekannt.
    function advance(str, font) {
      if (!font || !font.adv) return null;
      const w = font.width;
      let sum = 0, n = 0, sp = 0;
      for (let i = 0; i + w <= str.length; i += w) {
        const c = w === 2 ? (str.charCodeAt(i) << 8) | str.charCodeAt(i + 1) : str.charCodeAt(i);
        const a = font.adv(c);
        if (a === null) return null;
        sum += a;
        n++;
        if (w === 1 && c === 32) sp++;
      }
      return { w: sum / 1000, n, sp };
    }
    const numOf = (v) => (typeof v === 'number' ? v : v && typeof v.num === 'number' ? v.num : null);

    let text = '';
    let pagesNoText = 0, pages = 0, badFonts = false;
    const visited = new Set();

    // src: Quellen von data ([{ num, start, len }]), nur beim Mitschreiben (rec).
    const note = (out, v, font, src, arr) => { if (rec) rec.push({ o: out.length, tok: v, font, src, arr }); };
    async function runContent(data, res, depth, src) {
      if (depth > LIMITS.depth) { unsupported = true; return ''; }
      res = resolve(res) || {};
      const fonts = resolve(res.Font) || {};
      const xobj = resolve(res.XObject) || {};
      const lx = lexer(data, tick);
      const stack = [];
      let font = null;
      let out = '';
      // Lage in der Zeile (Texteinheiten): lineX = Zeilenanfang, pen = Ende des zuletzt gezeigten
      // Stuecks (null = unbekannt), tm = Textmatrix der Zeile, size/tc/tw = Schriftgrad und Abstaende.
      let size = 0, lineX = 0, pen = 0, tm = null, tc = 0, tw = 0;
      const moved = (v) => { if (pen === null) return; const a = advance(v.str, font); pen = a === null ? null : pen + a.w * size + a.n * tc + a.sp * tw; };
      // Luecke zwischen Stuecken derselben Zeile: ab einem Fuenftel Schriftgrad (oder klar zurueck) ein Leerzeichen.
      const gapChar = (nx, from) => { const p = from === undefined ? pen : from; if (p === null || nx === null) return ' '; const g = nx - p, em = Math.abs(size) || 1; return g > 0.2 * em || g < -0.5 * em ? ' ' : ''; };
      const newline = () => { if (out && !out.endsWith('\n')) out += '\n'; };
      // Textbloecke (BT ... ET): Viele Programme schreiben jedes Stueck einer Zeile in einen eigenen
      // Block. Ob ein neuer Block die Zeile fortsetzt, entscheidet seine Textmatrix; prev merkt den
      // letzten Block, gen aendert sich mit jedem "cm" (dann sind die Lagen nicht vergleichbar),
      // fresh = im Block wurde noch nichts positioniert.
      let prev = null, gen = 0, genNext = 1, fresh = false;
      const gens = [];
      const sameLine = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[0] !== 0 && a[1] === 0 && Math.abs(a[5] - b[5]) < 0.3 * (Math.abs(size * a[3]) || 1);
      const begin = () => { if (fresh) { fresh = false; if (prev) newline(); } prev = null; };
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
        if (op === 'Tf') { const fn = stack.length >= 2 ? nameOf(stack[stack.length - 2]) : null; font = fn && Object.hasOwn(fonts, fn) ? await fontOf(fonts[fn]) : null; size = numOf(stack[stack.length - 1]) || 0; }
        else if (op === 'Tj' || op === "'" || op === '"') {
          if (op !== 'Tj') { out += '\n'; pen = lineX; fresh = false; prev = null; } else begin();
          const v = stack[stack.length - 1];
          if (v && v.str !== undefined) { note(out, v, font, src); out += show(v.str, font); moved(v); }
        } else if (op === 'TJ') {
          const arr = stack[stack.length - 1];
          begin();
          if (Array.isArray(arr)) for (const x of arr) {
            if (x && x.str !== undefined) { note(out, x, font, src, true); out += show(x.str, font); moved(x); } else if (typeof x === 'number') { if (x < -200) out += ' '; if (pen !== null) pen -= (x / 1000) * size; }
            else if (rest) throw fail('fail');   // Selbstkontrolle: im Feld von TJ stehen nur Zeichenketten und Zahlen
          }
        } else if (op === 'T*') { out += '\n'; pen = lineX; fresh = false; prev = null; }
        else if (op === 'ET') { prev = { tm, pen, gen }; tm = null; }
        else if (op === 'BT') { lineX = 0; pen = 0; tm = null; fresh = true; if (prev && prev.gen !== gen) { newline(); prev = null; } }
        else if (op === 'q') { if (gens.length < 64) gens.push(gen); }
        else if (op === 'Q') { if (gens.length) gen = gens.pop(); }
        else if (op === 'cm') gen = genNext++;
        else if (op === 'Tc') tc = numOf(stack[stack.length - 1]) || 0;
        else if (op === 'Tw') tw = numOf(stack[stack.length - 1]) || 0;
        else if (op === 'Td' || op === 'TD') {
          // Neue Zeile bei senkrechtem Versatz; waagrecht entscheidet die Luecke zum letzten Stueck.
          const tx = stack.length >= 2 ? numOf(stack[stack.length - 2]) : null, ty = numOf(stack[stack.length - 1]);
          if (ty !== 0) { newline(); lineX += tx || 0; pen = lineX; } else { const nx = tx === null ? null : lineX + tx; out += gapChar(nx); if (nx !== null) lineX = nx; pen = nx; }
          fresh = false;
          prev = null;
        } else if (op === 'Tm') {
          // Gleiche Grundlinie und gleiche Matrix wie zuvor: Luecke pruefen; sonst neue Zeile.
          const q = stack.length >= 6 ? stack.slice(-6).map(numOf) : null;
          if (q && q.every((x) => x !== null)) {
            // Vergleich mit der Zeile davor: im selben Block, oder mit dem letzten Block bei gleichem Koordinatensystem.
            const base = tm ? { tm, pen } : fresh && prev && prev.tm && prev.gen === gen ? prev : null;
            if (base && sameLine(q, base.tm)) out += gapChar(base.pen === null ? null : (q[4] - base.tm[4]) / q[0], base.pen);
            else if (tm || prev) newline();
            tm = q;
          } else { if (tm || prev) newline(); tm = null; }
          fresh = false;
          prev = null;
          lineX = 0;
          pen = 0;
        }
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
              if (d) {
                newline();
                prev = null;
                const mark = rec ? rec.length : 0;
                const sub = await runContent(d, xo.val.Resources || res, depth + 1, [{ num, start: 0, len: d.length }]);
                if (rec) for (let k = mark; k < rec.length; k++) rec[k].o += out.length;
                out += sub;
              }
              visited.delete(num);
            }
          }
        }
        // Zeichenketten, die nicht gezeigt werden (z. B. /ActualText in markiertem Inhalt): Restpruefung.
        if (rest && stack.length && op !== 'Tj' && op !== 'TJ' && op !== "'" && op !== '"') strings(stack, rest, 0);
        stack.length = 0;
        if (out.length > LIMITS.chars) throw fail('size');
      }
      newline();
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

    // Wurzel und Info aus dem letzten "trailer" bzw. einem XRef-Strom; ohne Angabe der Katalog.
    let root = null;
    const infos = [];
    const lead = (v) => { if (v && typeof v === 'object' && refNum(v.Root) !== null) { root = refNum(v.Root); if (refNum(v.Info) !== null) infos.push(refNum(v.Info)); } };
    for (const o of objs.values()) if (o.val && typeof o.val === 'object' && nameOf(o.val.Type) === 'XRef') lead(o.val);
    const tr = s.lastIndexOf('trailer');
    if (tr >= 0) { const lx = lexer(s, tick); lx.pos = tr + 7; try { lead(parseValue(lx, tick, 0)); } catch (e) { if (e && e.code === 'timeout') throw e; } }
    const isPage = (k) => { const v = objs.get(k).val; return !!v && typeof v === 'object' && nameOf(v.Type) === 'Page'; };
    if (root === null || !objs.has(root)) for (const [k, o] of objs) if (o.val && typeof o.val === 'object' && nameOf(o.val.Type) === 'Catalog') root = k;

    // Seiten in der Reihenfolge des Seitenbaums (Katalog -> Pages -> Kids), damit Werte ueber einen
    // Seitenwechsel zusammenbleiben; Seiten, die der Baum nicht nennt, folgen nach Objektnummer
    // (nie weniger gelesen als vorher). Ressourcen werden ueber Parent geerbt.
    const pageNums = [], seen = new Set();
    const walk = (ref, depth) => {
      const n = refNum(ref);
      if (n === null || seen.has(n) || depth > 64 || !objs.has(n)) return;
      seen.add(n);
      tick();
      if (isPage(n)) { pageNums.push(n); return; }
      const v = objs.get(n).val;
      const kids = v && typeof v === 'object' ? resolve(v.Kids) : null;
      if (Array.isArray(kids)) for (const k of kids) walk(k, depth + 1);
    };
    if (root !== null && objs.has(root) && objs.get(root).val && typeof objs.get(root).val === 'object') walk(objs.get(root).val.Pages, 0);
    for (const k of [...objs.keys()].filter(isPage).sort((a, b) => a - b)) if (!seen.has(k)) pageNums.push(k);
    for (const num of pageNums) {
      tick();
      const pv = objs.get(num).val;
      let res = pv.Resources, par = pv.Parent, d = 0;
      while (res === undefined && par && d++ < 32) { const pp = resolve(par); if (!pp) break; res = pp.Resources; par = pp.Parent; }
      const cont = resolve(pv.Contents);
      const refs = Array.isArray(cont) ? cont.map(refNum) : [refNum(pv.Contents)];
      let data = '';
      const src = [];
      for (const r of refs) { if (r === null) continue; const st = await streamOf(r); if (st) { src.push({ num: r, start: data.length, len: st.length }); data += st + '\n'; } }
      pages++;
      const mark = rec ? rec.length : 0;
      const t = data ? await runContent(data, res, 0, src) : '';
      if (rec) for (let k = mark; k < rec.length; k++) rec[k].o += text.length;
      if (!t.trim()) pagesNoText++;
      text += t + '\n';
      if (text.length > LIMITS.chars) throw fail('size');
    }
    const attach = /\/(?:EmbeddedFile|FileAttachment|RichMedia)\b/.test(s);
    if (!pages) throw fail('fail');
    if (!text.trim()) throw fail('empty');
    const partial = attach || unsupported || badFonts || pagesNoText > 0;
    // Restpruefung: Zeichenketten aller Objekte und alle Stroeme, die kein Seitentext waren
    // (Erscheinungsbilder von Anmerkungen, Metadaten, verwaiste Inhalte); Bilder und Binaeres nicht.
    // Binaer sein duerfen nur Bilder, Querverweise und Stroeme, die als Schriftprogramm oder Farbprofil
    // eingebunden sind; jeder andere Strom muss lesbar sein, sonst Fehler (nichts bleibt ungeprueft).
    if (rest) {
      const binary = new Set();
      const icc = (v, depth) => {
        if (!v || typeof v !== 'object' || depth > 32) return;
        if (Array.isArray(v)) { if (nameOf(v[0]) === 'ICCBased' && refNum(v[1]) !== null) binary.add(refNum(v[1])); for (const x of v) icc(x, depth + 1); return; }
        if (Object.getPrototypeOf(v) === null) for (const k in v) icc(v[k], depth + 1);
      };
      for (const o of objs.values()) {
        tick();
        if (!o.val || typeof o.val !== 'object') continue;
        for (const k of ['FontFile', 'FontFile2', 'FontFile3', 'CIDSet', 'CIDToGIDMap']) if (refNum(o.val[k]) !== null) binary.add(refNum(o.val[k]));
        icc(o.val, 0);
      }
      for (const [num, o] of objs) {
        tick();
        strings(o.val, rest, 0);
        // Objektstroeme bleiben unveraendert in der Datei: auch ihr Rohtext wird geprueft.
        if (o.raw !== null && o.val && typeof o.val === 'object' && nameOf(o.val.Type) === 'ObjStm') {
          const d = decoded.get(num);
          if (typeof d !== 'string' || (d && printable(d) < 0.9)) throw fail('fail');
          rest.push(winAnsi(d));
          continue;
        }
        if (o.raw === null || decoded.has(num)) continue;
        if (!o.val || typeof o.val !== 'object') throw fail('fail');
        const sub = nameOf(o.val.Subtype);
        if (nameOf(o.val.Type) === 'XRef' || sub === 'Image' || binary.has(num)) continue;
        const d = await streamOf(num);
        if (d === null) throw fail('fail');   // unbekannter Filter
        if (!d) continue;
        if (sub === 'Form') rest.push(await runContent(d, o.val.Resources, 0, null));
        else if (printable(d) >= 0.9) rest.push(winAnsi(d));
        else throw fail('fail');
      }
    }
    if (opt && opt.ctx) Object.assign(opt.ctx, { s, objs, streamOf, dup, root, infos });
    return { text, partial };
  }

  // Zeichenketten in einem geparsten Wert (Dict, Feld), dekodiert: UTF-16BE mit BOM, sonst WinAnsi.
  function strings(v, out, depth) {
    if (!v || typeof v !== 'object' || depth > 32) return;
    if (Array.isArray(v)) { for (const x of v) strings(x, out, depth + 1); return; }
    if (Object.getPrototypeOf(v) !== null) {
      if (typeof v.str !== 'string' || !v.str) return;
      if (v.str.charCodeAt(0) === 0xfe && v.str.charCodeAt(1) === 0xff) {
        let u = '';
        for (let i = 2; i + 1 < v.str.length; i += 2) u += String.fromCharCode((v.str.charCodeAt(i) << 8) | v.str.charCodeAt(i + 1));
        out.push(u);
      } else out.push(winAnsi(v.str));
      return;
    }
    for (const k in v) strings(v[k], out, depth + 1);
  }
  function printable(s) {
    if (!s.length) return 0;
    let ok = 0;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c >= 160) ok++; }
    return ok / s.length;
  }

  // --- Werte in der Original-PDF ueberdecken (Design-Review PDF-Layout 11.11.2026) --------
  // Statt einer reinen Textfassung bleibt die Datei, wie sie ist: nur die Zeichen der Fundstellen
  // werden in den Textstroemen durch ein Deckzeichen derselben Schrift ersetzt (X, sonst ein
  // anderes vorhandenes Zeichen). Leerraum bleibt. Die betroffenen Stroeme werden unkomprimiert
  // neu geschrieben, Info und XMP-Metadaten geleert, die Querverweise neu aufgebaut. Danach liest
  // der normale Leser die neue Datei: Der Text muss genau dem erwarteten entsprechen, und in allem,
  // was nicht Seitentext ist, darf kein Fund stehen (Restpruefung). Jeder Zweifel = Fehler, der
  // Aufrufer faellt dann auf die Textfassung zurueck.
  const MASKS = ['X', 'x', '*', '•', '#', '-', '_', '.'];
  // Codes je Zeichenkette wie show(): [Lage, Breite, Text]; null = Schrift ohne Zuordnung.
  function pieces(str, font) {
    const out = [];
    if (!font || (!font.map && !font.cid)) { for (let i = 0; i < str.length; i++) out.push([i, 1, winAnsi(str[i])]); return out; }
    if (!font.map) return null;
    const w = font.width;
    for (let i = 0; i + w <= str.length; i += w) {
      const code = w === 2 ? (str.charCodeAt(i) << 8) | str.charCodeAt(i + 1) : str.charCodeAt(i);
      const u = font.map.get(code);
      out.push([i, w, u !== undefined ? u : font.cid ? ' ' : winAnsi(str[i])]);
    }
    return out;
  }
  function maskOf(font) {
    if (font && font.mask !== undefined) return font.mask;
    let m = null;
    // Einfache Schrift: bei Teilschriften hat ein nicht eingebettetes Zeichen die Breite 0 und wuerde
    // unsichtbar bleiben; mit Breitenangabe zaehlt deshalb nur ein Deckzeichen mit Breite ueber 0.
    const drawn = (c) => !font || !font.adv || font.width !== 1 || font.adv(c) > 0;
    if (!font || (!font.map && !font.cid)) {
      for (const u of MASKS) if (u.charCodeAt(0) < 128 && drawn(u.charCodeAt(0))) { m = { b: u, u }; break; }
    } else if (font.map) {
      const w = font.width, by = new Map();
      for (const [c, u] of font.map) if (!by.has(u) && c >= 0 && c < (w === 2 ? 65536 : 256)) by.set(u, c);
      for (const u of MASKS) if (by.has(u)) { const c = by.get(u); m = { b: w === 2 ? String.fromCharCode(c >> 8, c & 255) : String.fromCharCode(c), u }; break; }
      if (!m && !font.cid && w === 1 && !font.map.has(88) && drawn(88)) m = { b: 'X', u: 'X' };
    }
    if (font) font.mask = m;
    return m;
  }
  const hexOf = (str) => { let h = ''; for (let i = 0; i < str.length; i++) h += (str.charCodeAt(i) & 255).toString(16).padStart(2, '0'); return h; };
  const pdfName = (k) => '/' + String(k).replace(/[^A-Za-z0-9_.+-]/g, (c) => '#' + (c.charCodeAt(0) & 255).toString(16).padStart(2, '0'));
  // Geparsten Wert wieder schreiben (nur fuer die Dicts neu geschriebener Stroeme).
  function ser(v, depth) {
    if (depth > 64) throw fail('fail');
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(6));
    if (Array.isArray(v)) return '[' + v.map((x) => ser(x, depth + 1)).join(' ') + ']';
    if (typeof v !== 'object') throw fail('fail');
    if (Object.getPrototypeOf(v) === null) return '<<' + Object.keys(v).map((k) => pdfName(k) + ' ' + ser(v[k], depth + 1)).join(' ') + '>>';
    if (v.ref !== undefined) return v.ref + ' 0 R';
    if (v.n !== undefined) return pdfName(v.n);
    if (v.str !== undefined) return '<' + hexOf(v.str) + '>';
    if (v.op === 'true' || v.op === 'false' || v.op === 'null') return v.op;
    throw fail('fail');
  }
  const NO_COPY = new Set(['Filter', 'DecodeParms', 'DP', 'Length']);
  function streamObj(o, data) {
    if (o.val.F !== undefined || o.to < 0) throw fail('fail');   // externer Strom bzw. Objekt ohne Ende
    const d = Object.create(null);
    for (const k in o.val) if (!NO_COPY.has(k)) d[k] = o.val[k];
    d.Length = data.length;
    return o.head + '\n' + ser(d, 0) + '\nstream\n' + data + '\nendstream\nendobj';
  }

  // bytes: Original; orig: der zuvor gelesene Text (muss genau stimmen); ranges: [[start, end], ...]
  // im Text; find(text) -> Funde (async, wirft bei "nicht pruefbar"). Ergebnis { bytes, text }
  // (text = erwarteter Text der neuen Datei) oder Fehler mit festem Code.
  async function pdfMask(bytes, orig, ranges, find, ms) {
    try {
      return await maskRaw(bytes, orig, ranges, find, ms);
    } catch (e) {
      throw fail(e && CODES.indexOf(e.code) !== -1 ? e.code : 'fail');
    }
  }
  async function maskRaw(bytes, orig, ranges, find, ms) {
    if (!(bytes instanceof Uint8Array) || typeof orig !== 'string' || typeof find !== 'function') throw fail('fail');
    if (bytes.length > LIMITS.bytes) throw fail('size');
    const R = Array.from(ranges || [], (r) => [r[0], r[1]]).filter((r) => Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] >= 0 && r[1] > r[0] && r[1] <= orig.length).sort((a, b) => a[0] - b[0]);
    if (!R.length) throw fail('fail');
    const limit = Math.min(LIMITS.ms, Math.max(500, Number(ms) || LIMITS.ms));
    const tick = clock(limit);
    const deadline = Date.now() + limit;
    const rec = [], ctx = {};
    const first = await pdf(bytes, tick, { used: 0, deadline }, { rec, ctx });
    // Nur ganz gelesene Dateien, derselbe Text wie bei der Pruefung, keine aelteren Objektfassungen.
    if (first.partial || first.text !== orig || ctx.dup) throw fail('fail');
    const { s, objs, streamOf, root, infos } = ctx;
    if (root === null) throw fail('fail');
    for (const o of objs.values()) if (o.head && !/\s0\s+obj$/.test(o.head)) throw fail('fail');   // nur Generation 0

    // 1. Zeichen der Fundstellen -> Codes in den Stroemen.
    const edits = new Map();     // Strom-Nummer -> Map(Lage des Tokens -> { end, b: Bytes })
    const parts = [];            // [von, bis, Ersatz] im Text
    const hit = new Uint8Array(R.length);
    let r = 0;
    for (let k = 0; k < rec.length && r < R.length; k++) {
      tick();
      const c = rec[k];
      if (k + 1 < rec.length && rec[k + 1].o <= R[r][0]) continue;
      const ps = pieces(c.tok.str, c.font);
      if (!ps) throw fail('fail');
      let pos = c.o;
      for (const [i, w, t] of ps) {
        const p0 = pos, p1 = pos + t.length;
        pos = p1;
        if (p1 === p0) continue;
        while (r < R.length && R[r][1] <= p0) r++;
        if (r >= R.length) break;
        if (R[r][0] >= p1 || !/\S/.test(t)) continue;
        const mk = maskOf(c.font);
        const src = c.src && typeof c.tok.at === 'number' ? c.src.find((x) => c.tok.at >= x.start && c.tok.end <= x.start + x.len) : null;
        if (!mk || !src) throw fail('fail');
        for (let q = r; q < R.length && R[q][0] < p1; q++) hit[q] = 1;
        let toks = edits.get(src.num);
        if (!toks) edits.set(src.num, toks = new Map());
        const at = c.tok.at - src.start;
        let e = toks.get(at);
        if (!e) toks.set(at, e = { end: c.tok.end - src.start, b: Array.from(c.tok.str, (ch) => ch.charCodeAt(0) & 255), w, arr: !!c.arr, d: new Map(), comp: !!(c.font && c.font.adv) });
        // Breite ausgleichen: Unterschied zwischen Deckzeichen und Original (1/1000 Schriftgrad).
        if (e.comp) {
          const code = (str, k) => (w === 2 ? (str.charCodeAt(k) << 8) | str.charCodeAt(k + 1) : str.charCodeAt(k));
          const a0 = c.font.adv(code(c.tok.str, i)), a1 = c.font.adv(code(mk.b, 0));
          if (a0 === null || a1 === null) e.comp = false; else e.d.set(i, a1 - a0);
        }
        for (let q = 0; q < w; q++) e.b[i + q] = mk.b.charCodeAt(q);
        parts.push([p0, p1, mk.u]);
      }
    }
    for (let q = 0; q < R.length; q++) if (!hit[q] && /\S/.test(orig.slice(R[q][0], R[q][1]))) throw fail('fail');
    if (!parts.length) throw fail('fail');
    let want = '', last = 0;
    for (const [a, b, u] of parts) { if (a < last) throw fail('fail'); want += orig.slice(last, a) + u; last = b; }
    want += orig.slice(last);

    // 2. Neue Objekte: geaenderte Stroeme, geleerte Info- und Metadaten.
    const reps = new Map();      // Objektnummer -> neuer Text des ganzen Objekts
    for (const [num, toks] of edits) {
      tick();
      const o = objs.get(num);
      let d = await streamOf(num);
      if (!o || typeof d !== 'string') throw fail('fail');
      for (const at of [...toks.keys()].sort((a, b) => b - a)) {
        const e = toks.get(at);
        if (at < 0 || e.end > d.length || (d[at] !== '(' && d[at] !== '<')) throw fail('fail');
        const str = String.fromCharCode.apply(null, e.b);
        // Ausgleich nur dort, wo eine Zahl stehen darf: im Feld von TJ, oder aus "Tj" wird ein Feld mit TJ.
        const tj = e.comp && !e.arr ? /^\s*Tj(?![A-Za-z*'"])/.exec(d.slice(e.end, e.end + 16)) : null;
        let txt = '<' + hexOf(str) + '>', end = e.end;
        if (e.comp && (e.arr || tj)) {
          let cur = '', sum = 0, list = '';
          for (let k = 0; k + e.w <= str.length; k += e.w) {
            const dk = e.d.get(k);
            if (dk === undefined && sum !== 0) { list += '<' + hexOf(cur) + '> ' + String(+sum.toFixed(3)) + ' '; cur = ''; sum = 0; }
            cur += str.slice(k, k + e.w);
            if (dk !== undefined) sum += dk;
          }
          list += '<' + hexOf(cur) + '>' + (sum !== 0 ? ' ' + String(+sum.toFixed(3)) : '');
          // Im bestehenden Feld folgt oft direkt eine Zahl: Leerzeichen, damit zwei Zahlen getrennt bleiben.
          if (e.arr) txt = list + ' '; else { txt = '[' + list + '] TJ'; end = e.end + tj[0].length; }
        }
        d = d.slice(0, at) + txt + d.slice(end);
      }
      reps.set(num, streamObj(o, d));
    }
    for (const [num, o] of objs) {
      if (reps.has(num) || o.at === undefined || !o.val || typeof o.val !== 'object') continue;
      if (o.raw !== null && (nameOf(o.val.Type) === 'Metadata' || nameOf(o.val.Subtype) === 'XML')) reps.set(num, streamObj(o, ''));
      else if (o.raw === null && infos.indexOf(num) !== -1 && o.to > 0) reps.set(num, o.head + '\n<<>>\nendobj');
    }

    // 3. Datei zusammensetzen, Lagen der Objekte nachfuehren, Querverweis-Strom ans Ende.
    const top = [...objs].filter(([, o]) => o.at !== undefined).sort((a, b) => a[1].at - b[1].at);
    const out = [];
    const offs = new Map();
    // gaps: alles zwischen den Objekten und nach dem letzten (Kommentare, alte Querverweise, Anhaengsel).
    // Es bleibt unveraendert in der Datei und geht deshalb unten in die Restpruefung.
    const gaps = [];
    let pos = 0, len = 0, prevTo = 0;
    for (const [num, o] of top) {
      tick();
      if (o.at < pos || o.at < prevTo || o.to < 0) throw fail('fail');
      gaps.push(s.slice(prevTo, o.at));
      prevTo = o.to;
      const gap = s.slice(pos, o.at);
      out.push(gap);
      len += gap.length;
      offs.set(num, len);
      if (reps.has(num)) { const t = reps.get(num); out.push(t); len += t.length; pos = o.to; }
      else pos = o.at;
    }
    gaps.push(s.slice(prevTo));
    const tail = s.slice(pos);
    out.push(tail, '\n');
    len += tail.length + 1;
    let max = 0;
    for (const k of objs.keys()) if (k > max) max = k;
    const xnum = max + 1, size = xnum + 1;
    if (size > LIMITS.objects * 4) throw fail('size');
    const rows = new Uint8Array(size * 7);
    const put = (n, type, a, b) => { const p = n * 7; rows[p] = type; rows[p + 1] = (a >>> 24) & 255; rows[p + 2] = (a >>> 16) & 255; rows[p + 3] = (a >>> 8) & 255; rows[p + 4] = a & 255; rows[p + 5] = (b >>> 8) & 255; rows[p + 6] = b & 255; };
    put(0, 0, 0, 65535);
    for (const [num, o] of objs) {
      if (num <= 0 || num > max) continue;
      if (offs.has(num)) put(num, 1, offs.get(num), 0);
      else if (o.stm) put(num, 2, o.stm[0], o.stm[1]);
    }
    put(xnum, 1, len, 0);
    out.push(xnum + ' 0 obj\n<</Type /XRef /Size ' + size + ' /W [1 4 2] /Root ' + root + ' 0 R /Length ' + rows.length + '>>\nstream\n', latin1(rows), '\nendstream\nendobj\nstartxref\n' + len + '\n%%EOF\n');
    const res = bytesOfStr(out.join(''));
    if (res.length > LIMITS.bytes) throw fail('size');

    // 4. Selbstkontrolle mit dem normalen Leser: genau der erwartete Text, nichts Unlesbares,
    // und kein Fund in allem, was nicht Seitentext ist.
    const restList = [];
    const again = await pdf(res, tick, { used: 0, deadline }, { rest: restList });
    // Leerraum darf abweichen (der Leser setzt Leerzeichen nach den Abstaenden), alles andere nicht.
    const solid = (x) => x.replace(/\s+/g, '');
    if (again.partial || solid(again.text) !== solid(want)) throw fail('fail');
    for (const g of gaps) {
      if (!g.trim()) continue;
      if (printable(g) < 0.9) throw fail('fail');   // Binaeres ausserhalb der Objekte laesst sich nicht pruefen
      restList.push(winAnsi(g));
    }
    let restText = '';
    for (const x of restList) { if (!x) continue; restText += x + '\n'; if (restText.length > LIMITS.chars) throw fail('size'); }
    if (restText.trim()) { const f = await find(restText); if (!f || f.length) throw fail('fail'); }
    return { bytes: res, text: again.text };
  }

  // --- PDF-Stromfilter ohne Kompression der Plattform (ISO 32000-1, 7.4) -----------
  // Alle arbeiten auf Binaertext (latin1), linear, mit tick() und der Groessengrenze.
  const grow = (parts, s, st) => { parts.push(s); st.n += s.length; if (st.n > LIMITS.inflated) throw fail('size'); };
  function asciiHex(s, tick) {
    let out = '', hi = -1;
    for (let i = 0; i < s.length; i++) {
      tick();
      const c = s.charCodeAt(i);
      if (c === 62) break;   // ">"
      if (WS(c)) continue;
      const v = c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1;
      if (v < 0) throw fail('fail');
      if (hi < 0) hi = v; else { out += String.fromCharCode(hi * 16 + v); hi = -1; }
    }
    if (hi >= 0) out += String.fromCharCode(hi * 16);
    return out;
  }
  function ascii85(s, tick) {
    const parts = [], st = { n: 0 };
    let acc = 0, n = 0;
    const emit = (v, k) => grow(parts, String.fromCharCode(Math.floor(v / 16777216) & 255, Math.floor(v / 65536) & 255, Math.floor(v / 256) & 255, v & 255).slice(0, k), st);
    let i = 0;
    if (s.charCodeAt(0) === 60 && s.charCodeAt(1) === 126) i = 2;   // "<~" am Anfang erlaubt
    for (; i < s.length; i++) {
      tick();
      const c = s.charCodeAt(i);
      if (c === 126) break;   // "~>"
      if (WS(c)) continue;
      if (c === 122 && n === 0) { grow(parts, '\0\0\0\0', st); continue; }
      if (c < 33 || c > 117) throw fail('fail');
      acc = acc * 85 + (c - 33);
      if (++n === 5) { if (acc > 4294967295) throw fail('fail'); emit(acc, 4); acc = 0; n = 0; }
    }
    if (n === 1) throw fail('fail');
    if (n > 1) { for (let k = n; k < 5; k++) acc = acc * 85 + 84; emit(acc, n - 1); }
    return parts.join('');
  }
  function runLength(s, tick) {
    const parts = [], st = { n: 0 };
    for (let i = 0; i < s.length;) {
      tick();
      const l = s.charCodeAt(i++);
      if (l === 128) break;
      if (l < 128) { grow(parts, s.slice(i, i + l + 1), st); i += l + 1; } else { grow(parts, s[i] === undefined ? '' : s[i].repeat(257 - l), st); i++; }
    }
    return parts.join('');
  }
  // LZW (wie TIFF): Codes 9-12 Bit, hoechstwertiges Bit zuerst, 256 = Tabelle leeren, 257 = Ende.
  function lzw(s, early, tick) {
    const parts = [], st = { n: 0 }, dict = [];
    let bits = 9, buf = 0, nb = 0, prev = null, i = 0;
    for (;;) {
      tick();
      while (nb < bits && i < s.length) { buf = (buf << 8) | (s.charCodeAt(i++) & 255); nb += 8; }
      if (nb < bits) break;
      const code = (buf >>> (nb - bits)) & ((1 << bits) - 1);
      nb -= bits;
      buf &= (1 << nb) - 1;
      if (code === 257) break;
      if (code === 256) { dict.length = 0; bits = 9; prev = null; continue; }
      let cur;
      if (code < 256) cur = String.fromCharCode(code);
      else if (code - 258 < dict.length) cur = dict[code - 258];
      else if (code - 258 === dict.length && prev !== null) cur = prev + prev[0];
      else throw fail('fail');
      grow(parts, cur, st);
      if (prev !== null && dict.length < 4096 - 258) dict.push(prev + cur[0]);
      prev = cur;
      const size = 258 + dict.length + (early ? 1 : 0);
      bits = size >= 2048 ? 12 : size >= 1024 ? 11 : size >= 512 ? 10 : 9;
    }
    return parts.join('');
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
    } else if (kind === 'docx' || kind === 'xlsx' || kind === 'pptx' || kind === 'odf') r = await office(bytes, kind, tick, budget);
    else if (kind === 'rtf') r = rtfText(latin1(bytes), tick);
    else if (kind === 'doc' || kind === 'xls' || kind === 'ppt') {
      const c = cfb(bytes, tick, budget);
      r = kind === 'doc' ? docText(c, tick) : kind === 'xls' ? xlsText(c, tick) : pptText(c, tick);
    } else if (kind === 'pdf') r = await pdf(bytes, tick, budget);
    else throw fail('type');
    if (r.text.length > LIMITS.chars) throw fail('size');
    if (kind !== 'text' && !r.text.trim()) throw fail('empty');
    return r;
  }

  const CODES = ['size', 'type', 'encrypted', 'empty', 'timeout', 'fail'];
  DLX.datei = Object.freeze({ LIMITS, CODES, kindOf, extract, pdfMask });
})(globalThis);
