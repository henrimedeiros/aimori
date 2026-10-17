// Dokument-Fingerabdruecke (Design-Review Diktat und Fingerabdruecke 16.10.2026, Teil B).
// Gemeinsamer Code fuer die Erweiterung und das Werkzeug scripts/dokumente-fingerabdruck.mjs,
// damit beide Seiten Bit fuer Bit gleich rechnen (Auflage 10):
//   Woerter wie bei den eigenen Begriffen (DLX.dictionary.words: NFKC, klein, ae/oe/ue/ss,
//   ohne Akzente, Satzzeichen trennen), Shingle = k aufeinanderfolgende Woerter mit je einem
//   Leerzeichen, Wert = erste 32 Bit von SHA-256(salz + "\n" + shingle) mit salz = 64 Hex-Zeichen,
//   behalten nur Werte mit wert % sample == 0 (unabhaengig von der Lage im Text).
// Gezaehlt werden nur verschiedene getroffene Werte (Auflage 11). Heraus gehen nur Anzahl und
// Treffer ja/nein, nie Werte, Positionen oder Textteile (Auflage 14).
(function (g) {
  'use strict';
  const DLX = g.DLX;
  const D = DLX.dictionary;

  const LIMITS = Object.freeze({ max: 100000, shingle: [5, 16], sample: [1, 64], minMatches: [2, 50], ms: 150, wordLen: 48 });
  const DEFAULTS = Object.freeze({ shingle: 8, sample: 4, minMatches: 4 });
  const DIGITS = /^[0-9]+$/;
  const enc = new TextEncoder();
  const BUF = new Uint8Array(LIMITS.shingle[1] * (LIMITS.wordLen * 4 + 1) + 80);
  const DV = new DataView(BUF.buffer);

  // Auflage 11: keine Shingles aus Zahlenkolonnen oder Wiederholungen (CSV-Zeilen mit
  // Nullen, Trennlinien): mindestens 4 verschiedene Woerter, hoechstens die Haelfte reine
  // Zahlen, kein Wort ueber 48 Zeichen (Base64-Bloecke, Schluessel).
  function usable(ws, i, k) {
    const seen = new Set();
    let digits = 0;
    for (let j = i; j < i + k; j++) {
      const w = ws[j].w;
      if (w.length > LIMITS.wordLen) return false;
      seen.add(w);
      if (DIGITS.test(w)) digits++;
    }
    return seen.size >= 4 && digits * 2 <= k;
  }

  // Ruft fn(wert) fuer jeden behaltenen Wert auf; true = Zeitbudget ueberschritten.
  function each(text, mid, k, sample, fn, deadline, now) {
    const ws = D.words(String(text));
    const bytes = ws.map((x) => enc.encode(x.w));
    for (let i = 0; i + k <= ws.length; i++) {
      if (deadline && (i & 63) === 0 && now() > deadline) return true;
      if (!usable(ws, i, k)) continue;
      let len = 0;
      BUF[len++] = 0x0a;
      for (let j = i; j < i + k; j++) {
        if (j > i) BUF[len++] = 0x20;
        BUF.set(bytes[j], len);
        len += bytes[j].length;
      }
      const h = D.after32(mid, BUF, DV, len);
      if (h % sample === 0) fn(h);
    }
    return false;
  }

  // Werkzeug und Tests: alle behaltenen Werte eines Textes (ohne Zeitbudget).
  function values(text, salt, k, sample) {
    const out = new Set();
    each(text, D.saltState(salt), k, sample, (h) => out.add(h), 0, null);
    return out;
  }

  // Gepruefte Richtlinie (policy.js) + entschluesselte Werte -> Pruefliste im Speicher.
  function compile(p, list) {
    if (!p || !list || !list.length) return null;
    return { mid: D.saltState(p.salt), k: p.shingle, sample: p.sample, min: p.minMatches, action: p.action, set: new Set(list) };
  }

  // { n: verschiedene Treffer, hit: n >= minMatches, timeout }
  function scan(text, fp, now) {
    if (!fp) return { n: 0, hit: false, timeout: false };
    const t = now || (() => performance.now());
    const hits = new Set();
    const timeout = each(text, fp.mid, fp.k, fp.sample, (h) => { if (fp.set.has(h)) hits.add(h); }, t() + LIMITS.ms, t);
    return { n: hits.size, hit: !timeout && hits.size >= fp.min, timeout };
  }

  DLX.fingerprint = Object.freeze({ LIMITS, DEFAULTS, usable, values, compile, scan });
})(globalThis);
