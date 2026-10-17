// Verschleierte Daten: Varianten des Textes, in denen
// Umgehungen aufgeloest sind - unsichtbare Zeichen, Vollbreite/Doppelgaenger,
// Trennzeichen zwischen Ziffern, ausgeschriebene Ziffern, rueckwaerts, Base64/
// Hex/%-Kodierung. Jede Variante traegt je Zeichen den Bereich im Original
// (a[i], b[i]), damit Funde auf das Original zeigen und Schwaerzen das
// Verschleierte ersetzt. engine.scan prueft die Varianten im selben Zeitbudget.
// Design-Review Tabellen/Verschleierung/Umformen 16.10.2026, Auflagen 9-12
// (docs/sicherheit/design-review-tabellen-verschleierung-umformen.md).
// Alle Muster linear: Zeichenklassen je Wiederholung disjunkt, keine
// verschachtelten Quantoren. Nichts gespeichert, kein Netz.
(function (g) {
  'use strict';
  const DLX = g.DLX;

  // total deckt die Hoechstlaenge der Engine (200 000 Zeichen) mehrfach ab; tokens = erfolgreich dekodierte
  // Stuecke, cands = gepruefte Kandidaten je Ebene. Wird eine Grenze erreicht, meldet variants()
  // truncated und engine.scan wertet den Text als nicht pruefbar (Pflicht-Pruefung 16.10.2026).
  const LIMITS = Object.freeze({ total: 1000000, tokens: 50, cands: 12000, tokMin: 16, tokMax: 4096, depth: 2, revRun: 64, printable: 0.9 });

  // --- Hilfen ----------------------------------------------------------------
  // Variante aufbauen: push(text, a, b) haengt Zeichen mit Originalbereich an.
  function builder() {
    const out = [], a = [], b = [];
    return {
      push(s, x, y) { for (let i = 0; i < s.length; i++) { out.push(s[i]); a.push(x); b.push(y); } },
      done(kind) { return { kind, s: out.join(''), a, b }; },
      get length() { return out.length; },
    };
  }
  // Bereich eines Funds [start, end) in der Variante -> Bereich im Original.
  function origin(v, start, end) {
    let lo = Infinity, hi = -1;
    for (let i = start; i < end && i < v.a.length; i++) { if (v.a[i] < lo) lo = v.a[i]; if (v.b[i] > hi) hi = v.b[i]; }
    return hi > lo ? [lo, hi] : null;
  }

  // --- 1. Zeichen normalisieren (Auflage 10: je Codepoint, Tabelle fest im Code) --
  const isZw = (k) => k === 0xAD || k === 0x34F || k === 0x180E || (k >= 0x200B && k <= 0x200F) || (k >= 0x202A && k <= 0x202E) ||
    (k >= 0x2060 && k <= 0x2069) || k === 0xFEFF;
  const HOMO = () => (DLX.context && DLX.context.HOMO) || {};
  const NEEDS = /[\u00ad\u00b2\u00b3\u00b9\u034f\u0370-\u052f\u180e\u2000-\u206f\u2100-\u24ff\u3000\ufb00-\ufb06\ufe00-\ufe0f\ufeff-\uffef]|[\ud835\ud83c]/;
  // Feste Bereiche statt NFKC (Auflage 10): Vollbreite, mathematische Buchstaben/Ziffern,
  // eingekreiste/eingerahmte Zeichen, hoch-/tiefgestellte Ziffern, Ligaturen.
  const LIG = { 0xFB00: 'ff', 0xFB01: 'fi', 0xFB02: 'fl', 0xFB03: 'ffi', 0xFB04: 'ffl', 0xFB05: 'st', 0xFB06: 'st' };
  const SUP = { 0xB9: '1', 0xB2: '2', 0xB3: '3', 0x2070: '0' };
  const AZ = (k) => String.fromCharCode(k < 26 ? 65 + k : 71 + k);   // 0-25 A-Z, 26-51 a-z
  function fold(cp) {
    if (cp >= 0xFF01 && cp <= 0xFF5E) return String.fromCharCode(cp - 0xFEE0);
    if (cp === 0x3000) return ' ';
    if (cp >= 0x1D7CE && cp <= 0x1D7FF) return String((cp - 0x1D7CE) % 10);
    if (cp >= 0x1D400 && cp <= 0x1D6A3) return AZ((cp - 0x1D400) % 52);
    if (cp >= 0x2460 && cp <= 0x2468) return String(cp - 0x245F);
    if (cp === 0x24EA) return '0';
    if (cp >= 0x24B6 && cp <= 0x24E9) return AZ(cp - 0x24B6);
    if (cp >= 0x1F130 && cp <= 0x1F149) return AZ(cp - 0x1F130);
    if (cp >= 0x2074 && cp <= 0x2079) return String(cp - 0x2070);
    if (cp >= 0x2080 && cp <= 0x2089) return String(cp - 0x2080);
    return SUP[cp] || LIG[cp] || null;
  }
  function normChars(text, tick) {
    if (!NEEDS.test(text)) return null;
    const v = builder();
    const homo = HOMO();
    let changed = false;
    for (let i = 0; i < text.length;) {
      const cp = text.codePointAt(i);
      const n = cp > 0xFFFF ? 2 : 1;
      const ch = text.slice(i, i + n);
      if ((i & 4095) === 0) tick();
      if (isZw(cp) || (cp >= 0xFE00 && cp <= 0xFE0F)) { changed = true; i += n; continue; }
      let r = ch;
      if (cp < 0x80) r = ch;
      else if (homo[ch]) r = homo[ch];
      else if (cp >= 0x2000 && cp <= 0x200A) r = ' ';
      else r = fold(cp) || ch;
      if (r !== ch) changed = true;
      v.push(r, i, i + n);
      i += n;
    }
    return changed ? v.done('norm') : null;
  }
  // Identitaet als Variante (Grundlage der weiteren Schritte, wenn nichts normalisiert wurde).
  function identity(text) {
    const a = new Array(text.length), b = new Array(text.length);
    for (let i = 0; i < text.length; i++) { a[i] = i; b[i] = i + 1; }
    return { kind: 'id', s: text, a, b };
  }
  // Variante auf einer Variante: Bereiche durchreichen.
  function derive(base, kind, pieces) {
    // pieces: [{ s, from, to }] in base-Koordinaten, nach from sortiert, ueberdecken base ganz oder teilweise
    const v = builder();
    let pos = 0;
    for (const p of pieces) {
      for (let i = pos; i < p.from; i++) v.push(base.s[i], base.a[i], base.b[i]);
      let lo = Infinity, hi = -1;
      for (let i = p.from; i < p.to; i++) { if (base.a[i] < lo) lo = base.a[i]; if (base.b[i] > hi) hi = base.b[i]; }
      if (p.map) for (let i = 0; i < p.s.length; i++) { const [x, y] = p.map(i); v.push(p.s[i], base.a[x], base.b[y - 1]); }
      else v.push(p.s, lo, hi);
      pos = p.to;
    }
    for (let i = pos; i < base.s.length; i++) v.push(base.s[i], base.a[i], base.b[i]);
    return v.done(kind);
  }

  // --- 2. Getrennte Zeichen zusammenziehen ---------------------------------
  // "7 5 6 . 1 2 3 4 ...", "C-H-9-3 ...": mindestens 8 Gruppen aus 1-2 Zeichen;
  // dazu [at]/(at)/[dot]/(punkt) in Mailadressen.
  const SPACED = /(?<![\p{L}\p{N}])[A-Za-z0-9]{1,2}(?:[ \t\n.\-_\/\u00b7\u2022*,]{1,3}[A-Za-z0-9]{1,2}){7,}(?![\p{L}\p{N}])/gu;
  const AT = /[ \t]{0,2}[\[({<][ \t]{0,2}(at|\u00e4t|arobase|chiocciola|arroba|dot|punkt|point|punto|ponto)[ \t]{0,2}[\])}>][ \t]{0,2}/giu;
  // Ohne Stueckzahl-Grenze: Schleifen linear, Laufzeit begrenzt das Zeitbudget (tick -> nicht
  // pruefbar); nichts wird still weggelassen (Pflicht-Pruefung 16.10.2026).
  function joinSpaced(base, tick) {
    const pieces = [];
    let m;
    SPACED.lastIndex = 0;
    while ((m = SPACED.exec(base.s)) !== null) {
      const raw = m[0];
      const keep = [];
      for (let i = 0; i < raw.length; i++) if (/[A-Za-z0-9]/.test(raw[i])) keep.push(i);
      const from = m.index;
      pieces.push({ s: keep.map((i) => raw[i]).join(''), from, to: from + raw.length, map: (k) => [from + keep[k], from + keep[k] + 1] });
      if ((pieces.length & 63) === 0) tick();
    }
    AT.lastIndex = 0;
    const at = [];
    while ((m = AT.exec(base.s)) !== null) {
      if ((at.length & 63) === 63) tick();
      const w = m[1].toLowerCase();
      at.push({ s: /^(at|\u00e4t|arobase|chiocciola|arroba)$/.test(w) ? '@' : '.', from: m.index, to: m.index + m[0].length });
    }
    // Ueberlappungen: zuerst die Mail-Woerter, dann Ziffernfolgen ausserhalb.
    // Beide Listen sind nach from sortiert: ein Durchlauf statt jeder-gegen-jeden.
    const free = [];
    let q = 0;
    for (const p of pieces) {
      while (q < at.length && at[q].to <= p.from) q++;
      if (q >= at.length || p.to <= at[q].from) free.push(p);
    }
    const all = at.concat(free).sort((x, y) => x.from - y.from);
    return all.length ? derive(base, 'join', all) : null;
  }

  // --- 3. Ausgeschriebene Ziffern (de/en/fr/it/pt/es) -------------------------
  const WORDS = {
    0: ['null', 'zero', 'z\u00e9ro', 'cero'],
    1: ['eins', 'one', 'un', 'une', 'uno', 'um', 'uma'],
    2: ['zwei', 'zwo', 'two', 'deux', 'due', 'dois', 'duas', 'dos'],
    3: ['drei', 'three', 'trois', 'tre', 'tr\u00eas', 'tres'],
    4: ['vier', 'four', 'quatre', 'quattro', 'quatro', 'cuatro'],
    5: ['f\u00fcnf', 'fuenf', 'five', 'cinq', 'cinque', 'cinco'],
    6: ['sechs', 'six', 'sei', 'seis'],
    7: ['sieben', 'seven', 'sept', 'sette', 'sete', 'siete'],
    8: ['acht', 'eight', 'huit', 'otto', 'oito', 'ocho'],
    9: ['neun', 'nine', 'neuf', 'nove', 'nueve'],
  };
  const DIGIT_OF = new Map();
  for (const [d, list] of Object.entries(WORDS)) for (const w of list) DIGIT_OF.set(w, d);
  const NUMWORD = new RegExp('(?<![\\p{L}\\p{N}])(?:' + Array.from(DIGIT_OF.keys()).sort((x, y) => y.length - x.length).join('|') + '|\\d)(?![\\p{L}\\p{N}])', 'giu');
  const GAP = /^[ \t\n,;\-\/.]{0,3}$/;
  function spelled(base, tick) {
    if (!/[a-z\u00e0-\u00fc]{2}/i.test(base.s)) return null;
    const pieces = [];
    let run = [], m, n = 0;
    const flush = () => {
      // Mindestens 6 Ziffern, davon mindestens 3 als Wort (sonst ist es keine Umgehung).
      if (run.length >= 6 && run.filter((r) => r.word).length >= 3) {
        const from = run[0].from, to = run[run.length - 1].to, list = run.slice();
        pieces.push({ s: list.map((r) => r.d).join(''), from, to, map: (k) => [list[k].from, list[k].to] });
      }
      run = [];
    };
    NUMWORD.lastIndex = 0;
    while ((m = NUMWORD.exec(base.s)) !== null) {
      if ((++n & 255) === 0) tick();
      const w = m[0].toLowerCase();
      const d = /^\d$/.test(w) ? w : DIGIT_OF.get(w);
      const item = { d, from: m.index, to: m.index + m[0].length, word: !/^\d$/.test(w) };
      if (run.length && !GAP.test(base.s.slice(run[run.length - 1].to, item.from))) flush();
      run.push(item);
    }
    flush();
    return pieces.length ? derive(base, 'words', pieces) : null;
  }

  // --- 4. Rueckwaerts -------------------------------------------------------
  // Rueckwaerts: jede Ziffernfolge (Ziffern mit Leerzeichen, Punkt, Bindestrich, Schraegstrich)
  // mit mindestens 8 Ziffern und hoechstens LIMITS.revRun Zeichen einzeln umgedreht; laengere
  // Folgen sind keine Einzelnummer. Gilt fuer jede Textlaenge, linear (Pflicht-Pruefung 16.10.2026).
  const isDig = (c) => c >= 48 && c <= 57;
  const isSep = (c) => c === 32 || c === 46 || c === 45 || c === 47;
  function reversed(base, tick) {
    const s = base.s, n = s.length, v = builder();
    let i = 0, steps = 0;
    while (i < n) {
      if ((++steps & 4095) === 0) tick();
      if (!isDig(s.charCodeAt(i))) { i++; continue; }
      let j = i, d = 0, e = i;
      for (; j < n; j++) { const c = s.charCodeAt(j); if (isDig(c)) { d++; e = j + 1; } else if (!isSep(c)) break; }
      if (d >= 8 && e - i <= LIMITS.revRun) {
        if (v.length) v.push('\n\n', base.a[e - 1], base.b[e - 1]);
        for (let k = e - 1; k >= i; k--) v.push(s[k], base.a[k], base.b[k]);
      }
      i = j;
    }
    return v.length ? v.done('rev') : null;
  }


  // --- 5. Kodierte Token (Base64/Hex/%) -------------------------------------
  const B64 = /(?<![A-Za-z0-9+\/=_-])[A-Za-z0-9+\/_-]{16,4096}={0,2}(?![A-Za-z0-9+\/=_-])/g;
  const PCT = /(?<![^\s"'<>])(?:[^\s"'<>%]{0,64}%[0-9A-Fa-f]{2}){1,512}[^\s"'<>%]{0,64}/g;
  const printableShare = (s) => {
    if (!s.length) return 0;
    let ok = 0;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127 && !(c >= 0x80 && c < 0xA0) && c !== 0xFFFD)) ok++; }
    return ok / s.length;
  };
  function utf8(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return null; }
  }
  function decodeToken(tok) {
    // Hex zuerst (Hex ist auch gueltiges Base64-Alphabet).
    if (/^[0-9A-Fa-f]+$/.test(tok)) {
      if (tok.length % 2) return null;
      const bytes = new Uint8Array(tok.length / 2);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(tok.substr(i * 2, 2), 16);
      const s = utf8(bytes);
      return s && printableShare(s) >= LIMITS.printable ? s : null;
    }
    // Base64 braucht Gross- und Kleinbuchstaben oder Ziffern gemischt, sonst ist es ein Wort.
    if (!/[A-Z]/.test(tok) || !/[a-z]/.test(tok)) return null;
    let t = tok.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (t.length % 4 === 1) return null;
    t += '==='.slice((t.length + 3) % 4);
    let bin;
    try { bin = g.atob(t); } catch (e) { return null; }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const s = utf8(bytes);
    return s && s.length >= 6 && printableShare(s) >= LIMITS.printable ? s : null;
  }
  function decodePct(tok) {
    try {
      const s = decodeURIComponent(tok);
      return s !== tok && printableShare(s) >= LIMITS.printable ? s : null;
    } catch (e) { return null; }
  }
  // Ein Abschnitt je Token, getrennt durch Leerzeilen; jedes Zeichen zeigt auf das ganze
  // Token (Auflage 10: Schwaerzen ersetzt das ganze Token). Tiefe 2: im Dekodierten erneut.
  function decoded(text, tick, st) {
    if (text.length < LIMITS.tokMin) return null;
    const v = builder();
    let count = 0;
    const seen = new Map();
    const visit = (s, x, y, depth) => {
      if (depth > LIMITS.depth) return;
      const found = [];
      let m;
      B64.lastIndex = 0;
      while ((m = B64.exec(s)) !== null) { if (found.length >= LIMITS.cands) { st.truncated = true; break; } found.push([m.index, m[0], decodeToken]); }
      PCT.lastIndex = 0;
      while ((m = PCT.exec(s)) !== null) { if (found.length >= LIMITS.cands) { st.truncated = true; break; } found.push([m.index, m[0], decodePct]); }
      for (const [at, tok, fn] of found) {
        if (v.length > LIMITS.total) { st.truncated = true; return; }
        tick();
        // Gleiche Stuecke nur einmal dekodieren (Liste nur fuer diesen Aufruf, nichts gespeichert).
        let out = seen.get(tok);
        if (out === undefined) { out = fn(tok); seen.set(tok, out); }
        if (!out) continue;
        // Nur erfolgreich dekodierte Stuecke zaehlen (Hashes, Kennungen fallen vorher weg).
        if (count >= LIMITS.tokens) { st.truncated = true; return; }
        count++;
        const [ox, oy] = depth === 1 ? [at, at + tok.length] : [x, y];
        if (v.length) v.push('\n\n', ox, oy);
        v.push(out.slice(0, LIMITS.tokMax), ox, oy);
        visit(out.slice(0, LIMITS.tokMax), ox, oy, depth + 1);
      }
    };
    visit(text, 0, text.length, 1);
    return v.length ? v.done('dec') : null;
  }

  // --- Alle Varianten, erst bei Bedarf erzeugt (Auflage 9) --------------------
  // tick(): wirft bzw. meldet Zeitueberschreitung (engine.scan). Ergebnis: Liste
  // der Varianten, zusammen hoechstens LIMITS.total Zeichen; was darueber liegt,
  // wird weggelassen und als truncated gemeldet.
  function variants(text, tick) {
    const out = [];
    const st = { truncated: false };
    let total = 0;
    const take = (v) => {
      if (!v) return;
      if (total + v.s.length > LIMITS.total) { st.truncated = true; return; }
      total += v.s.length;
      out.push(v);
    };
    const n = normChars(text, tick);
    take(n);
    tick();
    const base = n || identity(text);
    take(joinSpaced(base, tick));
    tick();
    take(spelled(base, tick));
    tick();
    take(reversed(base, tick));
    tick();
    take(decoded(text, tick, st));
    return { list: out, truncated: st.truncated };
  }

  // Ueber mehrere Nachrichten verteilt (Auflage 12): Ende der zuletzt gesendeten
  // Texte (nur hier uebergeben, nie gespeichert) + aktueller Text. Gemeldet werden nur
  // Funde, die die Grenze ueberschreiten, als Bereich im aktuellen Text.
  const TAIL = 200, PARTS = 5;
  function across(tails, text, scan) {
    // Ohne Trennzeichen aneinander: eine Nummer, die mitten in einer Gruppe geteilt wurde, bleibt ganz.
    const prev = tails.slice(-PARTS).map((t) => String(t).slice(-TAIL)).join('');
    if (!prev || !text) return [];
    const off = prev.length;
    const r = scan(prev + text);
    if (!r || r.unscannable) return [];
    const out = [];
    for (const f of r.findings) {
      if (f.meta || !(f.start < off && f.end > off)) continue;
      out.push(Object.assign({}, f, { start: 0, end: f.end - off, split: true }));
    }
    return out;
  }

  DLX.entschleiern = Object.freeze({ LIMITS, TAIL, PARTS, variants, origin, across, decodeToken });
})(globalThis);
