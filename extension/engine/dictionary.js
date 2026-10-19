// Firmen-Woerterbuch: Begriffe kommen nur als SHA-256-Pruefsummen aus der
// Richtlinie (hex(SHA-256(salt + normalisierter Begriff))). Die Eingabe wird
// in Fenster aus 1-3 Woertern zerlegt und lokal gehasht. Das ist Schutz vor
// beilaeufigem Lesen, nicht gegen gezieltes Durchprobieren von Namenslisten.
(function (g) {
  'use strict';
  const DLX = g.DLX;

  // SHA-256 (FIPS 180-4), synchron, fuer UTF-8-Text.
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const W = new Uint32Array(64);
  // Ein 64-Byte-Block ab off in den Zustand st (Uint32Array(8)).
  function compress(st, dv, off) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let a = st[0], b = st[1], c = st[2], d = st[3], e = st[4], f = st[5], gg = st[6], h = st[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & gg);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = gg; gg = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    st[0] = (st[0] + a) >>> 0; st[1] = (st[1] + b) >>> 0; st[2] = (st[2] + c) >>> 0; st[3] = (st[3] + d) >>> 0;
    st[4] = (st[4] + e) >>> 0; st[5] = (st[5] + f) >>> 0; st[6] = (st[6] + gg) >>> 0; st[7] = (st[7] + h) >>> 0;
  }
  // Rest ab Zustand st: buf[0..len) sind die Bytes nach den schon verarbeiteten
  // prefix Bytes; buf muss len + 72 Bytes Platz haben (Polsterung in place).
  function finish(st, buf, dv, len, prefix) {
    const total = ((len + 9 + 63) >> 6) << 6;
    buf[len] = 0x80;
    buf.fill(0, len + 1, total);
    const bitLen = (prefix + len) * 8;
    dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
    dv.setUint32(total - 4, bitLen >>> 0);
    for (let off = 0; off < total; off += 64) compress(st, dv, off);
  }
  function sha256Words(bytes) {
    const buf = new Uint8Array(bytes.length + 72);
    buf.set(bytes);
    const st = Uint32Array.from(IV);
    finish(st, buf, new DataView(buf.buffer), bytes.length, 0);
    return Array.from(st);
  }
  // 32-Bit-Woerter -> Bytes (big-endian), z. B. fuer doppeltes SHA-256 (Base58Check).
  const wordsBytes = (w) => { const b = new Uint8Array(w.length * 4); const dv = new DataView(b.buffer); w.forEach((x, i) => dv.setUint32(i * 4, x)); return b; };
  const wordsHex = (w) => w.map((x) => x.toString(16).padStart(8, '0')).join('');
  const sha256Hex = (str) => wordsHex(sha256Words(new TextEncoder().encode(str)));

  // HMAC-SHA-256 (RFC 2104), Schluessel als Bytes (hoechstens 64), Nachricht als UTF-8-Text.
  function hmacHex(k, str) {
    const msg = new TextEncoder().encode(str);
    const inner = new Uint8Array(64 + msg.length);
    const outer = new Uint8Array(64 + 32);
    for (let i = 0; i < 64; i++) { const b = i < k.length ? k[i] : 0; inner[i] = b ^ 0x36; outer[i] = b ^ 0x5c; }
    inner.set(msg, 64);
    const ih = sha256Words(inner);
    for (let i = 0; i < 8; i++) { const x = ih[i]; outer.set([x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255], 64 + i * 4); }
    return wordsHex(sha256Words(outer));
  }

  // Normalisierung: NFKC, Kleinbuchstaben, Leerraum zu einem Leerzeichen.
  const normalize = (s) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

  const WORD = /[\p{L}\p{N}][\p{L}\p{N}&'’.-]{0,63}/gu;

  // Findet Woerterbuch-Treffer. deadline = Zeitpunkt (ms), danach Abbruch.
  function scanDictionary(text, dict, deadline, now) {
    const out = [];
    if (!dict || !dict.hashes || !dict.hashes.size) return { findings: out, timeout: false };
    const words = [];
    WORD.lastIndex = 0;
    let m;
    while ((m = WORD.exec(text)) !== null) {
      // Satzzeichen am Wortende gehoeren nicht zum Begriff.
      const w = m[0].replace(/[.’'-]+$/, '');
      words.push({ w: normalize(w), s: m.index, e: m.index + w.length });
    }
    for (let i = 0; i < words.length; i++) {
      if ((i & 63) === 0 && now() > deadline) return { findings: out, timeout: true };
      let term = '';
      for (let n = 0; n < 3 && i + n < words.length; n++) {
        term = n === 0 ? words[i].w : term + ' ' + words[i + n].w;
        if (dict.hashes.has(sha256Hex(dict.salt + term))) {
          out.push({ id: 'dictionary', cat: 'firma', start: words[i].s, end: words[i + n].e });
        }
      }
    }
    return { findings: out, timeout: false };
  }

  // --- Eigene Begriffe (customTerms/userTerms, Design-Review 14.10.2026) -------
  // Pruefsumme = hex(SHA-256(UTF-8(salz + Begriff))), salz = 64 Hex-Zeichen klein
  // (genau ein Block -> Mittelzustand je Liste vorberechnet, Auflage 1),
  // Begriff = Woerter aus words() mit je einem Leerzeichen verbunden.
  const TERM_MIN = 3, TERM_MAX_WORDS = 5, TERM_MAX_LEN = 100;
  const SALT = /^[0-9a-f]{64}$/;
  const ASCII = /^[\x00-\x7f]*$/;
  const CF = /\p{Cf}/gu;
  const MARK = /\p{M}/gu;
  const UML = /[äöüß]/g;
  const UML_MAP = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
  const TOKEN = /[\p{L}\p{M}\p{N}\p{Cf}]+/gu;
  const PART = /[\p{L}\p{N}]+/gu;

  // Normalisierung (Auflage 2, Reihenfolge fest): Cf entfernen (weiches
  // Trennzeichen, ZWSP, ZWJ trennen nicht), NFKC, toLowerCase, ae/oe/ue/ss,
  // NFKD, Zeichen der Klasse M entfernen.
  function normWord(s) {
    if (ASCII.test(s)) return s.toLowerCase();
    return s.replace(CF, '').normalize('NFKC').toLowerCase().replace(UML, (c) => UML_MAP[c]).normalize('NFKD').replace(MARK, '');
  }

  // Woerter mit Lage im Originaltext: Token = Buchstaben/Zeichen M/Ziffern/Cf
  // am Stueck; alles andere (Leerzeichen, Bindestrich, Punkt, @, _) trennt.
  // Zerfaellt ein Token beim Normalisieren in mehrere Teile, tragen alle die
  // Lage des ganzen Tokens (Auflage 3: Funde immer auf Originalstellen).
  function words(text) {
    const out = [];
    TOKEN.lastIndex = 0;
    let m;
    while ((m = TOKEN.exec(text)) !== null) {
      const n = normWord(m[0]);
      const s = m.index, e = m.index + m[0].length;
      if (ASCII.test(m[0]) && /^[a-z0-9]+$/.test(n)) { out.push({ w: n, s, e }); continue; }
      PART.lastIndex = 0;
      let p;
      while ((p = PART.exec(n)) !== null) out.push({ w: p[0], s, e });
    }
    return out;
  }

  // Begriff aus einer Zeile: { term } oder { error: 'short' | 'long' }
  // (gemeinsam fuer Werkzeug und Einstellungen, Auflage 9).
  function prepareTerm(line) {
    const w = words(String(line)).map((x) => x.w);
    const term = w.join(' ');
    if (term.replace(/ /g, '').length < TERM_MIN) return { error: 'short' };
    if (w.length > TERM_MAX_WORDS || term.length > TERM_MAX_LEN) return { error: 'long' };
    return { term };
  }

  const enc = new TextEncoder();
  const TB = new Uint8Array(4 * TERM_MAX_LEN + 128);
  const TDV = new DataView(TB.buffer);
  const TS = new Uint32Array(8);

  function saltState(salt) {
    const st = Uint32Array.from(IV);
    const b = enc.encode(salt);
    compress(st, new DataView(b.buffer), 0);
    return st;
  }

  // Hex-Pruefsumme eines normalisierten Begriffs (Werkzeug, Einstellungen, Tests).
  function termHash(salt, term) {
    return sha256Hex(salt + term);
  }

  // Liste fuer den Scan: { mid, first: Set(erste 32 Bit), hashes: Set(hex) }.
  function termList(salt, hashes) {
    const s = String(salt).toLowerCase();
    if (!SALT.test(s)) return null;
    const set = new Set();
    const first = new Set();
    for (const h of hashes) { const x = String(h).toLowerCase(); set.add(x); first.add(parseInt(x.slice(0, 8), 16)); }
    return { mid: saltState(s), first, hashes: set };
  }

  // Findet eigene Begriffe aus allen Listen (Wort-n-Gramme 1-5, nur ganze Woerter).
  // Ergebnis wie scanDictionary; Budget gilt gemeinsam mit dem Aufrufer (Auflage 4).
  function scanTerms(text, lists, deadline, now) {
    const out = [];
    const use = (lists || []).filter((l) => l && l.hashes && l.hashes.size);
    if (!use.length) return { findings: out, timeout: false };
    const ws = words(text);
    const bytes = ws.map((x) => enc.encode(x.w));
    for (let i = 0; i < ws.length; i++) {
      if ((i & 31) === 0 && now() > deadline) return { findings: out, timeout: true };
      let len = 0;
      for (let n = 0; n < TERM_MAX_WORDS && i + n < ws.length; n++) {
        const b = bytes[i + n];
        if (len + b.length + 1 > 4 * TERM_MAX_LEN) break;
        if (n) TB[len++] = 0x20;
        TB.set(b, len);
        len += b.length;
        // finish polstert nur hinter len; die Bytes des n-Gramms bleiben stehen.
        for (const l of use) {
          TS.set(l.mid);
          finish(TS, TB, TDV, len, 64);
          if (l.first.has(TS[0]) && l.hashes.has(wordsHex(Array.from(TS)))) {
            out.push({ id: 'custom_term', cat: 'firma', start: ws[i].s, end: ws[i + n].e });
          }
        }
      }
    }
    return { findings: out, timeout: false };
  }

  // Erste 32 Bit von SHA-256(salz + buf[0..len)) ab saltState(salz) (Dokument-Fingerabdruecke,
  // engine/fingerabdruck.js); buf braucht len + 72 Bytes Platz, dv = DataView auf buf.
  const H32 = new Uint32Array(8);
  function after32(mid, buf, dv, len) {
    H32.set(mid);
    finish(H32, buf, dv, len, 64);
    return H32[0];
  }

  // --- Interne Links (Datentyp internal_link, Design-Review interne Links 17.10.2026) ---
  // Nur lokale Zerlegung des Texts: kein fetch, kein DNS, kein <a>/img (Auflage 2).
  const LINK_COUNT = 500;      // mehr Links je Text -> nicht pruefbar (Auflage 1)
  const AUTH_MAX = 512;        // Userinfo + Host + Port; ohne Ende darin -> fail-closed intern
  const HOST_STEPS = 10;       // hoechstens 10 Eltern-Suffixe je Host (Auflage 4)
  const LINK_RE = /(?<![\w+.-])(?:(?:https?|ftp|file):\/\/|(?=[a-z0-9-]{1,63}\.sharepoint\.(?:com|us|de|cn)\/))[^\s<>"'`]*/gi;
  const INVIS = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
  // Reservierte/privat genutzte Endungen; .int, .test, .example, .invalid zaehlen nicht (oeffentlich bzw. Doku).
  const PRIVATE_TLD = new Set(['local', 'localdomain', 'lan', 'internal', 'intranet', 'intra', 'corp', 'home', 'private']);
  const SP_HOST = /^[a-z0-9-]{1,63}\.sharepoint\.(?:com|us|de|cn)$/;

  // Eine Normalisierung fuer Text und Admin-Skript (Auflage 3): unsichtbare/Bidi-Zeichen weg,
  // NFKC, klein, IDN -> Punycode (URL nur zum Parsen), Punkt am Ende weg. Ungueltig -> ''.
  function normHost(h) {
    let s = String(h).replace(INVIS, '').normalize('NFKC').toLowerCase().replace(/\.+$/, '');
    if (!s || s.length > 253 || /[\s/\\@:?#[\]%]/.test(s)) return '';
    if (/[^a-z0-9.-]/.test(s)) {
      try { s = new URL('https://' + s + '/').hostname.replace(/\.+$/, ''); } catch (e) { return ''; }
    }
    return /^[a-z0-9.-]{1,253}$/.test(s) && s.split('.').every((l) => l.length > 0 && l.length <= 63) ? s : '';
  }

  // true = interner Link. lists = termList(...) der Richtlinie internalDomains, cache je Pruefung.
  function linkInternal(link, lists, cache) {
    const sep = link.indexOf('://');
    const scheme = sep === -1 ? '' : link.slice(0, sep).toLowerCase();
    const rest = sep === -1 ? link : link.slice(sep + 3);
    const cut = rest.slice(0, AUTH_MAX + 1).search(/[/?#\\]/);
    if (cut === -1 && rest.length > AUTH_MAX) return true;
    const auth = cut === -1 ? rest : rest.slice(0, cut);
    // file: ohne Host oder mit Laufwerk ist immer lokal/intern (Auflage 6).
    if (scheme === 'file' && (!auth || /^[a-z](?::|\|)?$/i.test(auth) || /^\/?[a-z]:/i.test(rest))) return true;
    let host = auth.slice(auth.lastIndexOf('@') + 1);   // echter Host nach dem letzten @ (Auflage 2)
    if (host.startsWith('[')) return false;             // IPv6-Literal: bestehende Typen
    host = normHost(host.replace(/:[^:]*$/, ''));
    if (!host || /^[\d.]+$/.test(host) || host === 'localhost' || host.endsWith('.localhost')) return false;
    if (cache.has(host)) return cache.get(host);
    const labels = host.split('.');
    const tld = labels[labels.length - 1];
    let hit = labels.length === 1 || PRIVATE_TLD.has(tld) || host.endsWith('.home.arpa') ||
      (SP_HOST.test(host) && labels[0] !== 'www') || labels[0] === 'intranet' || labels[0] === 'intra';
    for (let i = 0; !hit && lists.length && i < labels.length - 1 && i < HOST_STEPS; i++) {
      const dom = labels.slice(i).join('.');
      for (const l of lists) if (l.hashes.has(termHash(l.salt, dom))) { hit = true; break; }
    }
    cache.set(host, hit);
    return hit;
  }

  // Findet interne Links (auch ueber 2048 Zeichen: der Host wird nie gekuerzt gelesen, Fund = ganzer
  // Link, Auflage 1); Fund = ganzer Link samt Query/Fragment/Userinfo (Auflage 5),
  // nur eine ueberzaehlige schliessende Klammer am Ende gehoert nicht dazu.
  // lists: [{ salt, hashes: Set }]. Ergebnis { findings, timeout, tooMany }.
  function scanLinks(text, lists, deadline, now) {
    const out = [];
    const cache = new Map();
    const use = (lists || []).filter((l) => l && l.hashes && l.hashes.size);
    LINK_RE.lastIndex = 0;
    let m, n = 0;
    while ((m = LINK_RE.exec(text)) !== null) {
      if (++n > LINK_COUNT) return { findings: out, timeout: false, tooMany: true };
      if ((n & 15) === 0 && now() > deadline) return { findings: out, timeout: true, tooMany: false };
      let link = m[0];
      // Klammern je Art einmal zaehlen, Ueberzaehlige am Ende in einem Durchlauf ab (linear).
      for (const [o, c] of [['(', ')'], ['[', ']'], ['{', '}']]) {
        let open = 0, close = 0, e = link.length;
        for (let i = 0; i < e; i++) { if (link[i] === o) open++; else if (link[i] === c) close++; }
        while (close > open && e > 0 && link[e - 1] === c) { e--; close--; }
        link = link.slice(0, e);
      }
      if (link.indexOf('://') !== -1 && link.length <= link.indexOf('://') + 3) continue;
      if (linkInternal(link, use, cache)) out.push({ id: 'internal_link', cat: 'technik', start: m.index, end: m.index + link.length });
    }
    return { findings: out, timeout: false, tooMany: false };
  }

  DLX.dictionary = { sha256Hex, sha256Words, wordsBytes, hmacHex, normalize, scanDictionary, normWord, words, prepareTerm, termHash, termList, scanTerms, saltState, after32, TERM_MIN, TERM_MAX_WORDS,
    normHost, linkInternal, scanLinks, LINK_COUNT, HOST_STEPS };
})(globalThis);
