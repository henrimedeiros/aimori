// Kern der Erkennung: Namensraum, Pakete und Pruefziffer-Algorithmen.
// Klassisches Skript (kein Modul), damit es ohne Build in Content Scripts,
// im Service Worker (importScripts) und in Node-Tests (vm) laeuft.
(function (g) {
  'use strict';
  const DLX = g.DLX || (g.DLX = {});

  // --- Paket-Register -------------------------------------------------------
  // Ein Paket = { id, kind: 'country'|'global'|'region', detectors: [...] }
  // Detektor = { id, cat, cls: 'hoch'|'mittel'|'tief', re: RegExp(g),
  //              group?: Name der Gruppe mit dem Wert, valid?: fn(wert) -> bool,
  //              ctx?: [Kontextwoerter], needsCtx?: bool, name: {en, de} }
  DLX.packs = DLX.packs || {};
  DLX.registerPack = function (pack) {
    for (const d of pack.detectors) {
      if (!d.re.global) throw new Error('detector regex needs g flag: ' + d.id);
      d.pack = pack.id;
    }
    DLX.packs[pack.id] = pack;
  };

  // --- Hilfen ---------------------------------------------------------------
  const A = {};
  A.digits = (s) => String(s).replace(/\D/g, '');
  A.compact = (s) => String(s).replace(/[\s.\-/]/g, '').toUpperCase();

  // Luhn (ISO/IEC 7812-1 Anhang B): letzte Ziffer ist Pruefziffer.
  A.luhn = function (num) {
    const s = A.digits(num);
    if (s.length < 2) return false;
    let sum = 0;
    for (let i = 0; i < s.length; i++) {
      let d = s.charCodeAt(s.length - 1 - i) - 48;
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return sum % 10 === 0;
  };

  // Rest einer langen Dezimalzahl (als Text) modulo m.
  A.modStr = function (numStr, m) {
    let r = 0;
    for (let i = 0; i < numStr.length; i++) r = (r * 10 + (numStr.charCodeAt(i) - 48)) % m;
    return r;
  };

  // Buchstaben -> Zahlen (A=10 ... Z=35) wie bei IBAN/ISO 7064 MOD 97-10.
  A.alphaToNum = function (s) {
    let out = '';
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      if (c >= 48 && c <= 57) out += ch;
      else if (c >= 65 && c <= 90) out += String(c - 55);
      else return null;
    }
    return out;
  };

  // ISO 7064 MOD 97-10: Zahl mod 97 == 1.
  A.mod97 = function (s) {
    const n = A.alphaToNum(s);
    return n !== null && n.length > 0 && A.modStr(n, 97) === 1;
  };

  // EAN-13 Modulo 10 mit Gewichten 1/3 (von links), letzte Ziffer = Pruefziffer.
  A.ean13 = function (num) {
    const s = A.digits(num);
    if (s.length !== 13) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += (s.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10 === s.charCodeAt(12) - 48;
  };

  // ISO 7064 MOD 11,10: letzte Ziffer = Pruefziffer.
  A.iso7064_11_10 = function (num) {
    const s = A.digits(num);
    if (s.length < 2) return false;
    let p = 10;
    for (let i = 0; i < s.length - 1; i++) {
      let t = (s.charCodeAt(i) - 48 + p) % 10;
      if (t === 0) t = 10;
      p = (t * 2) % 11;
    }
    return (11 - p) % 10 === s.charCodeAt(s.length - 1) - 48;
  };

  // Gewichtete Summe ueber Ziffern.
  A.weightedSum = function (s, weights) {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += (s.charCodeAt(i) - 48) * weights[i];
    return sum;
  };

  // Quersumme einer Zahl.
  A.crossSum = function (n) {
    let s = 0;
    while (n > 0) { s += n % 10; n = Math.floor(n / 10); }
    return s;
  };

  // ICAO Doc 9303 Teil 3: Gewichte 7-3-1, Modulo 10; '<' = 0, A=10..Z=35.
  A.icaoCheck = function (field) {
    const w = [7, 3, 1];
    let sum = 0;
    for (let i = 0; i < field.length; i++) {
      const ch = field[i];
      let v;
      if (ch === '<') v = 0;
      else if (ch >= '0' && ch <= '9') v = ch.charCodeAt(0) - 48;
      else if (ch >= 'A' && ch <= 'Z') v = ch.charCodeAt(0) - 55;
      else return -1;
      sum += v * w[i % 3];
    }
    return sum % 10;
  };
  A.icaoOk = (field, check) => check !== '<' && A.icaoCheck(field) === check.charCodeAt(0) - 48;

  // Gueltiges Datum (Tag, Monat, Jahr vierstellig).
  A.validDate = function (d, m, y) {
    if (m < 1 || m > 12 || d < 1) return false;
    const days = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= days[m - 1];
  };

  // Kontextwort im Fenster +-50 Zeichen um den Treffer (ohne Gross/Klein).
  A.hasContext = function (text, start, end, words) {
    if (!words || !words.length) return true;
    // NFKC: Vollbreite/Ligaturen wie Normalform vergleichen (Design-Review Weltweit, Auflage 8).
    const win = text.slice(Math.max(0, start - 50), Math.min(text.length, end + 50)).normalize('NFKC').toLowerCase();
    for (const w of words) if (win.indexOf(w.normalize('NFKC').toLowerCase()) !== -1) return true;
    return false;
  };

  DLX.algo = A;
})(globalThis);
