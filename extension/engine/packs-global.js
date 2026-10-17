// Globale Pakete: Finanzen, Kontakt, Reisedokumente (MRZ).
// Muster selbst geschrieben nach den offiziellen Spezifikationen (Quellen je
// Detektor im Kommentar); Regex nur mit begrenzten Quantoren (ReDoS-Test in tests/).
(function (g) {
  'use strict';
  const DLX = g.DLX;
  const A = DLX.algo;

  // IBAN-Laengen je Land (ISO 13616; Tabelle nach ibantools, MIT OR MPL-2.0;
  // verbindlich ist die SWIFT IBAN Registry).
  const IBAN_LEN = {};
  ('AD24 AE23 AL28 AO25 AT20 AX18 AZ28 BA20 BE16 BF28 BG22 BH22 BI27 BJ28 BL27 BR29 BY28 CF27 CG27 CH21 CI28 ' +
    'CM27 CR22 CV25 CY28 CZ24 DE22 DJ27 DK18 DO28 DZ26 EE20 EG29 ES24 FI18 FK18 FO18 FR27 GA27 GB22 GE22 GF27 ' +
    'GI23 GL18 GP27 GQ27 GR27 GT28 GW25 HN28 HR21 HU28 IE22 IL23 IQ23 IR26 IS26 IT27 JO30 KM27 KW30 KZ20 LB28 ' +
    'LC32 LI21 LT20 LU20 LV21 LY25 MA28 MC27 MD24 ME22 MF27 MG27 MK19 ML28 MN20 MQ27 MR27 MT31 MU30 MZ25 NC27 ' +
    'NE28 NI28 NL18 NO15 OM23 PF27 PK24 PL28 PM27 PS29 PT25 QA29 RE27 RO24 RS22 RU33 SA24 SC31 SD18 SE24 SI19 ' +
    'SK24 SM27 SN28 SO23 ST25 SV28 TD27 TF27 TG28 TL23 TN24 TR26 UA29 VA22 VG24 WF27 XK20 YE30 YT27')
    .split(' ').forEach((e) => { IBAN_LEN[e.slice(0, 2)] = Number(e.slice(2)); });
  DLX.IBAN_LEN = IBAN_LEN;

  // Liefert die Anzahl verbrauchter Zeichen (Treffer wird gekuerzt) oder false.
  function ibanValid(v) {
    const up = v.toUpperCase();
    const len = IBAN_LEN[up.slice(0, 2)];
    if (!len) return false;
    let compact = '';
    let i = 0;
    for (; i < up.length && compact.length < len; i++) {
      if (up[i] !== ' ') compact += up[i];
    }
    if (compact.length !== len) return false;
    if (!A.mod97(compact.slice(4) + compact.slice(0, 4))) return false;
    return i;
  }

  // Kartennummern: Laenge + IIN-Praefix (ISO/IEC 7812-1) + Luhn. Ist der Treffer
  // laenger (CVV oder Ablauf als weitere Gruppe), zaehlt die laengste passende
  // Nummer am Anfang, die an einer Gruppengrenze endet (Design-Review
  // Fehlalarme, Auflage 3). Liefert die verbrauchten Zeichen oder false.
  function card(prefixOk, lengths) {
    return function (v) {
      const d = A.digits(v);
      for (let k = lengths.length - 1; k >= 0; k--) {
        const len = lengths[k];
        if (len > d.length) continue;
        let i = 0;
        for (let n = 0; n < len; i++) if (v[i] >= '0' && v[i] <= '9') n++;
        if (i < v.length && v[i] !== ' ' && v[i] !== '-') continue;
        const c = d.slice(0, len);
        if (prefixOk(c) && A.luhn(c)) return i;
      }
      return false;
    };
  }
  const CARD_RE = () => /\b\d(?:[ -]?\d){11,18}\b/g;
  // Ohne Normformat und ohne Kontextwort nur unsicher: IIN-Praefix + Luhn trifft sonst
  // rund 1 % aller zufaelligen 16-stelligen Zahlen (docs/fehlalarme.md).
  const CARD_FMT = /^(?:\d{4}([ -])\d{4}\1\d{4}\1\d{4}(?:\1\d{3})?|\d{4}([ -])\d{6}\2\d{5})$/;  // 4-4-4-4(-3), Amex 4-6-5
  const CARD_CTX = ['Karte', 'card', 'Visa', 'Mastercard', 'Amex', 'American Express', 'carte', 'carta', 'cartão', 'cartao', 'tarjeta', 'CVV', 'CVC', 'PAN:', 'PAN '];
  DLX.cards = { card, CARD_RE, CARD_FMT, CARD_CTX }; // weitere Kartenarten in packs-world.js
  // Telefon: nur Format, sicher nur mit Kontextwort.
  const PHONE_CTX = ['Tel.', 'Tel:', 'Telefon', 'Telephone', 'phone', 'Natel', 'Handy', 'Mobil', 'Fax', 'Rufnummer', 'Ruf an', 'anrufen', 'call ', 'appel', 'téléphone', 'telefono', 'cellulare', 'ligue', 'celular', 'WhatsApp'];
  DLX.PHONE_CTX = PHONE_CTX;

  // E.164: hoechstens 15 Ziffern, mindestens 8 (ohne internationales Praefix).
  function e164Valid(v) {
    let d = A.digits(v);
    if (v.trim().startsWith('00')) d = d.slice(2);
    return d.length >= 8 && d.length <= 15;
  }

  function chTelValid(v) {
    let d = A.digits(v);
    if (d.startsWith('0041')) d = d.slice(4);
    else if (d.startsWith('41') && v.indexOf('+') !== -1) d = d.slice(2);
    else if (d.startsWith('0')) d = d.slice(1);
    else return false;
    return d.length === 9 && d[0] >= '2' && d[0] <= '9';
  }

  function birthValid(v) {
    const m = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(v);
    if (!m) return false;
    let y = Number(m[3]);
    if (m[3].length === 2) y += 1900;
    else if (m[3].length !== 4) return false;
    return A.validDate(Number(m[1]), Number(m[2]), y) || A.validDate(Number(m[2]), Number(m[1]), y);
  }

  // ICAO Doc 9303: Zeile 2 Pass (TD3), 44 Zeichen.
  function mrzTd3Valid(l) {
    if (l.length !== 44) return false;
    if (!A.icaoOk(l.slice(0, 9), l[9])) return false;
    if (!A.icaoOk(l.slice(13, 19), l[19])) return false;
    if (!A.icaoOk(l.slice(21, 27), l[27])) return false;
    const composite = l.slice(0, 10) + l.slice(13, 20) + l.slice(21, 43);
    return A.icaoOk(composite, l[43]);
  }
  // ICAO Doc 9303: Zeile 1 Ausweis (TD1), Dokumentnummer + Pruefziffer.
  function mrzTd1Valid(l) {
    return l.length === 30 && A.icaoOk(l.slice(5, 14), l[14]);
  }

  DLX.registerPack({
    id: 'finance', kind: 'global',
    detectors: [
      { id: 'iban', cat: 'finanz', cls: 'hoch', re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/gi,
        valid: ibanValid, name: { en: 'IBAN (bank account)', de: 'IBAN (Bankkonto)' } },
      { id: 'cc_visa', cat: 'finanz', cls: 'hoch', re: CARD_RE(),
        valid: card((d) => d[0] === '4', [13, 16, 19]), fmt: CARD_FMT, ctx: CARD_CTX, name: { en: 'Visa card number', de: 'Visa-Kartennummer' } },
      { id: 'cc_mc', cat: 'finanz', cls: 'hoch', re: CARD_RE(),
        valid: card((d) => { const p2 = Number(d.slice(0, 2)); const p4 = Number(d.slice(0, 4)); return (p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720); }, [16]), fmt: CARD_FMT, ctx: CARD_CTX,
        name: { en: 'Mastercard number', de: 'Mastercard-Nummer' } },
      { id: 'cc_amex', cat: 'finanz', cls: 'hoch', re: CARD_RE(),
        valid: card((d) => d.startsWith('34') || d.startsWith('37'), [15]), fmt: CARD_FMT, ctx: CARD_CTX, name: { en: 'American Express card number', de: 'American-Express-Nummer' } },
      { id: 'cc_cvv', cat: 'finanz', cls: 'hoch', re: /\b(?:CVV2?|CVC2?|CID|Pr(?:ü|ue)fnummer|Sicherheitscode|security code)\W{0,3}(?<v>\d{3,4})\b/dgi, group: 'v',
        name: { en: 'Card security code (CVV/CVC)', de: 'Karten-Sicherheitscode (CVV/CVC)' } },
    ],
  });

  DLX.registerPack({
    id: 'contact', kind: 'global',
    detectors: [
      { id: 'email', cat: 'kontakt', cls: 'mittel', re: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}\b/g,
        name: { en: 'Email address', de: 'E-Mail-Adresse' } },
      { id: 'phone_e164', cat: 'kontakt', cls: 'mittel', re: /(?:\+|\b00)[1-9]\d{0,2}[ ./-]?(?:\(0\)[ ./-]?)?\d{1,4}(?:[ ./-]?\d{2,4}){2,4}\b/g,
        valid: e164Valid, weak: true, ctx: PHONE_CTX, name: { en: 'International phone number', de: 'Internationale Telefonnummer' } },
      { id: 'birthdate', cat: 'kontakt', cls: 'hoch',
        re: /\b(?:geb\.|geboren(?: am)?|Geburtsdatum|DOB|date of birth|born(?: on)?|n[ée]e? le|nat[oa] il|data di nascita|date de naissance|fecha de nacimiento|data de nascimento) ?:? ?(?<v>\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/dgi, group: 'v',
        valid: birthValid, name: { en: 'Date of birth', de: 'Geburtsdatum' } },
    ],
  });

  DLX.registerPack({
    id: 'travel', kind: 'global',
    detectors: [
      { id: 'mrz_td3', cat: 'reise', cls: 'hoch', re: /[A-Z0-9<]{9}\d[A-Z<]{3}\d{6}\d[MFX<]\d{6}\d[A-Z0-9<]{14}[\d<]\d/g,
        valid: mrzTd3Valid, name: { en: 'Passport machine-readable zone', de: 'Maschinenlesbare Zone (Pass)' } },
      { id: 'mrz_td1', cat: 'reise', cls: 'hoch', re: /[AIC][A-Z<][A-Z<]{3}[A-Z0-9<]{9}\d[A-Z0-9<]{15}/g,
        valid: mrzTd1Valid, name: { en: 'ID card machine-readable zone', de: 'Maschinenlesbare Zone (Ausweis)' } },
    ],
  });

  // chTelValid nutzt das Paket CH.
  DLX.validators = Object.assign(DLX.validators || {}, { ibanValid, mrzTd3Valid, mrzTd1Valid, chTelValid });
})(globalThis);
