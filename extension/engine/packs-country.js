// Laenderpakete Phase 1: CH, DE, AT, FR, IT, BE, NL, US, BR und Region EU.
// Pruefverfahren nach den amtlichen Spezifikationen (Quellen in
// docs/datentypen.md); Typen ohne verlaessliche Pruefziffer oder mit hohem
// Fehlalarm-Risiko melden nur mit Kontextwort (needsCtx).
(function (g) {
  'use strict';
  const DLX = g.DLX;
  const A = DLX.algo;
  const V = DLX.validators;

  // --- CH -------------------------------------------------------------------
  // UID (BFS): Gewichte 5,4,3,2,7,6,5,4, Pruefziffer = 11 - (Summe mod 11).
  function chUid(v) {
    const d = A.digits(v);
    if (d.length !== 9) return false;
    let c = 11 - (A.weightedSum(d, [5, 4, 3, 2, 7, 6, 5, 4]) % 11);
    if (c === 11) c = 0;
    return c !== 10 && c === d.charCodeAt(8) - 48;
  }

  // --- DE -------------------------------------------------------------------
  // Steuer-ID: ISO 7064 MOD 11,10; in den ersten 10 Ziffern kommt genau eine
  // Ziffer zwei- oder dreimal vor, alle anderen hoechstens einmal.
  function deIdnr(v) {
    const d = A.digits(v);
    if (d.length !== 11 || d[0] === '0') return false;
    const counts = {};
    for (const ch of d.slice(0, 10)) counts[ch] = (counts[ch] || 0) + 1;
    const multi = Object.values(counts).filter((n) => n > 1);
    if (multi.length !== 1 || multi[0] > 3) return false;
    return A.iso7064_11_10(d);
  }
  const deUst = (v) => { const d = A.digits(v); return d.length === 9 && A.iso7064_11_10(d); };
  // Rentenversicherungsnummer: Buchstabe -> zweistellige Zahl (A=01),
  // Gewichte 2,1,2,5,7,1,2,1,2,1,2,1, Quersummen addieren, mod 10.
  function deRvnr(v) {
    const s = v.replace(/ /g, '').toUpperCase();
    if (!/^\d{8}[A-Z]\d{3}$/.test(s)) return false;
    const dd = Number(s.slice(2, 4)); const mm = Number(s.slice(4, 6));
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return false;
    const letter = String(s.charCodeAt(8) - 64).padStart(2, '0');
    const n = s.slice(0, 8) + letter + s.slice(9, 11);
    const w = [2, 1, 2, 5, 7, 1, 2, 1, 2, 1, 2, 1];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += A.crossSum((n.charCodeAt(i) - 48) * w[i]);
    return sum % 10 === s.charCodeAt(11) - 48;
  }
  // Krankenversichertennummer: Buchstabe -> zweistellige Zahl, Gewichte 1-2,
  // Quersummen, mod 10 (GKV-Spitzenverband nach Par. 290 SGB V).
  function deKvnr(v) {
    const s = v.toUpperCase();
    if (!/^[A-Z]\d{9}$/.test(s)) return false;
    const n = String(s.charCodeAt(0) - 64).padStart(2, '0') + s.slice(1, 9);
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += A.crossSum((n.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 2));
    return sum % 10 === s.charCodeAt(9) - 48;
  }
  const dePa = (v) => v.length === 10 && A.icaoOk(v.slice(0, 9), v[9]);

  // --- AT -------------------------------------------------------------------
  function atSvnr(v) {
    const d = A.digits(v);
    if (d.length !== 10) return false;
    const sum = A.weightedSum(d, [3, 7, 9, 0, 5, 8, 4, 2, 1, 6]) % 11;
    return sum !== 10 && sum === d.charCodeAt(3) - 48;
  }
  // Luhn-Pruefsumme (Rest) einer Zahl ohne angehaengte Pruefziffer.
  function luhnRest(s) {
    let sum = 0;
    for (let i = 0; i < s.length; i++) {
      let d = s.charCodeAt(s.length - 1 - i) - 48;
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return sum % 10;
  }
  // UID: Pruefziffer = (6 - Luhn-Rest der ersten 7 Ziffern) mod 10.
  const atUid = (v) => { const d = A.digits(v); return d.length === 8 && (6 - luhnRest(d.slice(0, 7)) + 10) % 10 === d.charCodeAt(7) - 48; };

  // --- FR -------------------------------------------------------------------
  function frNir(v) {
    let s = v.replace(/ /g, '').toUpperCase();
    if (s.length !== 15) return false;
    if (s.slice(5, 7) === '2A') s = s.slice(0, 5) + '19' + s.slice(7);
    else if (s.slice(5, 7) === '2B') s = s.slice(0, 5) + '18' + s.slice(7);
    if (!/^\d{15}$/.test(s)) return false;
    return 97 - A.modStr(s.slice(0, 13), 97) === Number(s.slice(13));
  }
  function frTva(v) {
    const s = v.replace(/ /g, '').toUpperCase().slice(2);
    const key = s.slice(0, 2); const siren = s.slice(2);
    if (!/^\d{9}$/.test(siren)) return false;
    if (/^\d\d$/.test(key)) return (12 + 3 * A.modStr(siren, 97)) % 97 === Number(key);
    return A.luhn(siren); // neues alphanumerisches Schluesselformat: nur SIREN pruefen
  }

  // --- IT -------------------------------------------------------------------
  const CF_ODD = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
  function itCf(v) {
    const s = v.toUpperCase();
    if (s.length !== 16) return false;
    let sum = 0;
    for (let i = 0; i < 15; i++) {
      const c = s.charCodeAt(i);
      const val = c <= 57 ? c - 48 : c - 65; // Ziffer 0-9 bzw. A=0..Z=25
      sum += i % 2 === 0 ? CF_ODD[val] : val;
    }
    return String.fromCharCode(65 + (sum % 26)) === s[15];
  }
  function itIva(v) {
    const d = A.digits(v);
    if (d.length !== 11 || /^0{7}/.test(d)) return false;
    const office = Number(d.slice(7, 10));
    if (!((office >= 1 && office <= 100) || office === 120 || office === 121 || office === 888 || office === 999)) return false;
    return A.luhn(d);
  }

  // --- BE -------------------------------------------------------------------
  function beNn(v) {
    const d = A.digits(v);
    if (d.length !== 11) return false;
    const check = Number(d.slice(9));
    return 97 - A.modStr(d.slice(0, 9), 97) === check || 97 - A.modStr('2' + d.slice(0, 9), 97) === check;
  }
  const beVat = (v) => { const d = A.digits(v); return d.length === 10 && 97 - A.modStr(d.slice(0, 8), 97) === Number(d.slice(8)); };

  // --- NL -------------------------------------------------------------------
  // 11-Proef: Gewichte 9..2 und -1, Summe mod 11 = 0.
  function elfProef(d) {
    if (d.length !== 9 || /^0+$/.test(d)) return false;
    const sum = A.weightedSum(d, [9, 8, 7, 6, 5, 4, 3, 2, -1]);
    return sum % 11 === 0;
  }
  const nlBsn = (v) => elfProef(A.digits(v));
  function nlBtw(v) {
    const s = v.replace(/ /g, '').toUpperCase();
    if (!/^NL\d{9}B\d{2}$/.test(s)) return false;
    return elfProef(s.slice(2, 11)) || A.mod97(s); // seit 2020 MOD 97-10 auf dem ganzen Wert
  }

  // --- EU (Dispatcher fuer USt-Nummern) --------------------------------------
  const EU_DISPATCH = { AT: (r) => r[0] === 'U' && atUid(r.slice(1)), BE: (r) => beVat(r), DE: deUst, FR: (r) => frTva('FR' + r), IT: itIva, NL: (r) => nlBtw('NL' + r) };
  function euVat(v) {
    const s = v.replace(/ /g, '').toUpperCase();
    const cc = s.slice(0, 2); const rest = s.slice(2);
    if (EU_DISPATCH[cc]) return EU_DISPATCH[cc](rest);
    return (rest.match(/\d/g) || []).length >= 7 ? 'ctx' : false; // Land ohne eigenen Validator: nur mit Kontextwort
  }

  // --- US -------------------------------------------------------------------
  // SSN: keine Pruefziffer; Formatregeln stecken im Muster, Meldung nur mit Kontext.

  // --- BR -------------------------------------------------------------------
  // Mod-11-Pruefziffer der Receita Federal (CPF und CNPJ): Rest < 2 -> 0.
  // Zeichenwert = ASCII - 48 (Ziffern 0-9, Buchstaben des alphanumerischen
  // CNPJ ab Juli 2026: A=17 ... Z=42, IN RFB 2.229/2024).
  function brDv(s, w) {
    let sum = 0;
    for (let i = 0; i < w.length; i++) sum += (s.charCodeAt(i) - 48) * w[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  }
  // CPF: 11 Ziffern, Gewichte 10..2 bzw. 11..2; gleiche Ziffern sind ungueltig.
  function brCpf(v) {
    const d = A.digits(v);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    return brDv(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]) === d.charCodeAt(9) - 48 &&
      brDv(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === d.charCodeAt(10) - 48;
  }
  // CNPJ: 12 Stellen [0-9A-Z] + 2 Pruefziffern, Gewichte 5..2,9..2 bzw. 6..2,9..2.
  function brCnpj(v) {
    const s = v.replace(/[./-]/g, '');
    if (!/^[0-9A-Z]{12}\d{2}$/.test(s) || /^(.)\1{13}$/.test(s)) return false;
    return brDv(s, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === s.charCodeAt(12) - 48 &&
      brDv(s, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === s.charCodeAt(13) - 48;
  }
  // Telefon: Vorwahl (DDD) aus der Anatel-Liste, mobil 9 Stellen mit 9,
  // Festnetz 8 Stellen mit 2-5; nur mit +55/0055 oder (DDD) im Muster.
  const BR_DDD = ('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 ' +
    '61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99').split(' ');
  function brTelValid(v) {
    let d = A.digits(v);
    if (d.startsWith('0055')) d = d.slice(4);
    else if (v.indexOf('+') !== -1) d = d.slice(2);
    if (BR_DDD.indexOf(d.slice(0, 2)) === -1) return false;
    return (d.length === 11 && d[2] === '9') || (d.length === 10 && d[2] >= '2' && d[2] <= '5');
  }

  const D = (id, cat, cls, re, name, extra) => Object.assign({ id, cat, cls, re, name }, extra || {});

  DLX.registerPack({ id: 'CH', kind: 'country', detectors: [
    D('ch_ahv', 'sozial', 'hoch', /\b756[. ]?\d{4}[. ]?\d{4}[. ]?\d{2}\b/g, { en: 'Swiss social security number (AHV/AVS)', de: 'AHV-Nummer' },
      { valid: A.ean13, fmt: /^756([. ])\d{4}\1\d{4}\1\d{2}$/, ctx: ['AHV', 'AVS', 'Sozialversicherung', 'Versichertennummer', 'Versicherungsnummer', 'SV-Nr', 'assurance sociale', 'social security'] }),
    D('ch_vvk', 'gesundheit', 'hoch', /\b80756\d{15}\b/g, { en: 'Swiss health insurance card number', de: 'Versichertenkarten-Nummer' }, { valid: A.luhn }),
    D('ch_uid', 'firma', 'mittel', /\bCHE[- ]?\d{3}\.?\d{3}\.?\d{3}\b/g, { en: 'Swiss business ID (UID)', de: 'Unternehmens-Identifikationsnummer (UID)' }, { valid: chUid }),
    D('ch_mwst', 'firma', 'mittel', /\bCHE[- ]?\d{3}\.?\d{3}\.?\d{3} ?(?:MWST|TVA|IVA)\b/g, { en: 'Swiss VAT number', de: 'MWST-Nummer' }, { valid: chUid }),
    D('ch_tel', 'kontakt', 'mittel', /(?:\+41|\b0041|\b0) ?\d{2} ?\d{3} ?\d{2} ?\d{2}\b/g, { en: 'Swiss phone number', de: 'Schweizer Telefonnummer' }, { valid: V.chTelValid, weak: true, ctx: DLX.PHONE_CTX }),
  ] });

  DLX.registerPack({ id: 'DE', kind: 'country', detectors: [
    D('de_idnr', 'steuer', 'hoch', /\b[1-9](?: ?\d){10}\b/g, { en: 'German tax ID', de: 'Steuer-Identifikationsnummer' },
      { valid: deIdnr, needsCtx: true, ctx: ['Steuer-ID', 'Steuer ID', 'Steueridentifikationsnummer', 'IdNr', 'TIN', 'Identifikationsnummer'] }),
    D('de_ust', 'firma', 'mittel', /\bDE ?\d{9}\b/g, { en: 'German VAT ID', de: 'USt-IdNr.' }, { valid: deUst }),
    D('de_rvnr', 'sozial', 'hoch', /\b\d{2} ?[0-3]\d[01]\d{3} ?[A-Z] ?\d{2} ?\d\b/g, { en: 'German social insurance number', de: 'Sozialversicherungsnummer (DE)' }, { valid: deRvnr }),
    D('de_kvnr', 'gesundheit', 'hoch', /\b[A-Z]\d{9}\b/g, { en: 'German health insurance number', de: 'Krankenversichertennummer' },
      { valid: deKvnr, needsCtx: true, ctx: ['KVNR', 'Versichertennummer', 'Krankenkasse', 'eGK', 'Gesundheitskarte', 'Versicherten-Nr'] }),
    D('de_pa', 'reise', 'hoch', /\b[CFGHJKLMNPRTVWXYZ][CFGHJKLMNPRTVWXYZ0-9]{8}\d\b/g, { en: 'German ID card / passport number', de: 'Ausweis-/Passnummer (DE)' },
      { valid: dePa, needsCtx: true, ctx: ['Personalausweis', 'Ausweisnummer', 'Ausweis', 'Reisepass', 'Passnummer', 'Seriennummer'] }),
  ] });

  DLX.registerPack({ id: 'AT', kind: 'country', detectors: [
    D('at_svnr', 'sozial', 'hoch', /\b\d{4} ?[0-3]\d[01]\d{3}\b/g, { en: 'Austrian social security number', de: 'Sozialversicherungsnummer (AT)' },
      { valid: atSvnr, needsCtx: true, ctx: ['SVNR', 'SV-Nr', 'Versicherungsnummer', 'e-card', 'Sozialversicherung'] }),
    D('at_uid', 'firma', 'mittel', /\bATU ?\d{8}\b/g, { en: 'Austrian VAT ID', de: 'UID-Nummer (AT)' }, { valid: (v) => atUid(v) }),
  ] });

  DLX.registerPack({ id: 'FR', kind: 'country', detectors: [
    D('fr_nir', 'sozial', 'hoch', /\b[12] ?\d{2} ?(?:0[1-9]|1[0-2]|[2-9]\d) ?(?:\d{2}|2[AB]) ?\d{3} ?\d{3} ?\d{2}\b/g, { en: 'French social security number (NIR)', de: 'Sozialversicherungsnummer (FR)' },
      { valid: frNir, fmt: /^[12] \d{2} \d{2} (?:\d{2}|2[AB]) \d{3} \d{3} \d{2}$/i, ctx: ['NIR', 'sécurité sociale', 'securite sociale', 'sécu', 'INSEE', 'carte vitale', 'social security', 'Sozialversicherung'] }),
    D('fr_tva', 'firma', 'mittel', /\bFR ?[0-9A-HJ-NP-Z]{2} ?\d{3} ?\d{3} ?\d{3}\b/g, { en: 'French VAT number', de: 'USt-Nummer (FR)' }, { valid: frTva }),
  ] });

  DLX.registerPack({ id: 'IT', kind: 'country', detectors: [
    D('it_cf', 'steuer', 'hoch', /\b[A-Z]{6}[\dLMNP-V]{2}[A-EHLMPR-T][\dLMNP-V]{2}[A-Z][\dLMNP-V]{3}[A-Z]\b/gi, { en: 'Italian tax code (codice fiscale)', de: 'Codice fiscale (IT)' }, { valid: itCf }),
    D('it_iva', 'firma', 'mittel', /\b(?:IT ?)?\d{11}\b/g, { en: 'Italian VAT number', de: 'Partita IVA (IT)' },
      { valid: itIva, needsCtx: true, ctxUnless: /^IT/, ctx: ['partita IVA', 'P.IVA', 'P. IVA', 'VAT', 'IVA'] }),
  ] });

  DLX.registerPack({ id: 'BE', kind: 'country', detectors: [
    D('be_nn', 'id-national', 'hoch', /\b\d{2}\.?[01]\d\.?[0-3]\d[- ]?\d{3}\.?\d{2}\b/g, { en: 'Belgian national number', de: 'Nationalregisternummer (BE)' },
      { valid: beNn, fmt: /^\d{2}\.[01]\d\.[0-3]\d-\d{3}\.\d{2}$/, ctx: ['INSZ', 'NISS', 'rijksregister', 'registre national', 'Nationalregister', 'national number', 'numéro national', 'identificatienummer'] }),
    D('be_vat', 'firma', 'mittel', /\bBE ?[01]\d{3}\.?\d{3}\.?\d{3}\b/g, { en: 'Belgian VAT / enterprise number', de: 'USt-/Unternehmensnummer (BE)' }, { valid: beVat }),
  ] });

  DLX.registerPack({ id: 'NL', kind: 'country', detectors: [
    D('nl_bsn', 'id-national', 'hoch', /\b\d{4}\.?\d{2}\.?\d{3}\b/g, { en: 'Dutch citizen service number (BSN)', de: 'Bürgerservicenummer (NL)' },
      { valid: nlBsn, needsCtx: true, ctx: ['BSN', 'burgerservicenummer', 'sofinummer', 'citizen service number'] }),
    D('nl_btw', 'firma', 'mittel', /\bNL ?\d{9} ?B ?\d{2}\b/gi, { en: 'Dutch VAT ID', de: 'USt-Nummer (NL)' }, { valid: nlBtw }),
  ] });

  DLX.registerPack({ id: 'US', kind: 'country', detectors: [
    D('us_ssn', 'sozial', 'hoch', /\b(?!000|666|9\d\d)\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/g, { en: 'US Social Security Number', de: 'US-Sozialversicherungsnummer' },
      { needsCtx: true, ctx: ['SSN', 'social security', 'SS#', 'Social Sec'] }),
  ] });

  // Formatierte CPF/CNPJ gelten ohne Kontextwort; unformatiert (auch
  // alphanumerischer CNPJ) nur mit Kontext (Design-Review 14.10.2026 Auflage 8).
  DLX.registerPack({ id: 'BR', kind: 'country', detectors: [
    D('br_cpf', 'steuer', 'hoch', /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, { en: 'Brazilian taxpayer ID (CPF)', de: 'CPF-Nummer (BR)' },
      { valid: brCpf, needsCtx: true, ctxUnless: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/, ctx: ['CPF', 'Cadastro de Pessoas'] }),
    D('br_cnpj', 'firma', 'mittel', /\b[0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/?[0-9A-Z]{4}-?\d{2}\b/g, { en: 'Brazilian company ID (CNPJ)', de: 'CNPJ-Nummer (BR)' },
      { valid: brCnpj, needsCtx: true, ctxUnless: /^[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}$/, ctx: ['CNPJ', 'Cadastro Nacional da Pessoa'] }),
    D('br_tel', 'kontakt', 'mittel', /(?:(?:\+55|\b0055) ?\(?\d{2}\)?|\(\d{2}\)) ?\d{4,5}[- ]?\d{4}\b/g, { en: 'Brazilian phone number', de: 'Brasilianische Telefonnummer' },
      { valid: brTelValid, weak: true, ctx: DLX.PHONE_CTX }),
    // CEP: acht Ziffern ohne Pruefziffer -> nur mit Kontextwort, Standard aus.
    D('br_cep', 'kontakt', 'tief', /\b\d{5}-\d{3}\b/g, { en: 'Brazilian postal code (CEP)', de: 'Postleitzahl CEP (BR)' },
      { needsCtx: true, ctx: ['CEP ', 'CEP:', 'CEP.', 'código postal', 'codigo postal', 'endereçamento postal'] }),
  ] });

  DLX.registerPack({ id: 'EU', kind: 'region', detectors: [
    D('eu_vat_generic', 'firma', 'mittel', /\b(?:AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI) ?[A-Z0-9+*]{8,12}\b/g,
      { en: 'EU VAT number', de: 'EU-USt-Nummer' },
      { valid: euVat, generic: true, ctx: ['VAT', 'USt', 'UID', 'TVA', 'IVA', 'BTW', 'MOMS', 'MWST', 'NIF', 'CIF', 'DIČ', 'NIP'] }),
  ] });

  DLX.EU_VAT_DISPATCH = EU_DISPATCH; // packs-world.js ergaenzt weitere Laender
  DLX.validators = Object.assign(V, { chUid, deIdnr, deUst, deRvnr, deKvnr, dePa, atSvnr, atUid, frNir, frTva, itCf, itIva, beNn, beVat, nlBsn, nlBtw, euVat, brCpf, brCnpj, brTelValid });
})(globalThis);
