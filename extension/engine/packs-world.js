// Laenderpakete Phase 2/3 (Katalog weltweit, 14.10.2026): uebrige
// EU/EFTA-Staaten, UK, Nord- und Lateinamerika, Asien-Pazifik, Afrika/Nahost
// sowie Ergaenzungen der Phase-1-Pakete und der globalen Pakete.
// Pruefverfahren selbst implementiert nach den amtlichen Spezifikationen
// (Quelle je Algorithmus im Kommentar, Liste in docs/datentypen-quellen.md);
// python-stdnum/stdnum-js nur als Beschreibung und Testwert-Quelle, kein Code
// und keine Tabellen uebernommen (Design-Review Weltweit, Auflage 6).
// Fehlalarm-Schutz: reine Ziffernfolgen und Typen ohne Pruefziffer melden nur
// mit Kontextwort (needsCtx); Schutzklasse tief ist standardmaessig aus.
// Regex ohne Rueckverweise und ohne verschachtelte Quantoren (Auflage 3).
(function (g) {
  'use strict';
  const DLX = g.DLX;
  const A = DLX.algo;
  const dig = A.digits;
  const at = (s, i) => s.charCodeAt(i) - 48;
  const wsum = (s, w, from) => { let t = 0; for (let i = 0; i < w.length; i++) t += at(s, (from || 0) + i) * w[i]; return t; };
  const up = (v) => v.replace(/[\s./-]/g, '').toUpperCase();
  // Datum aus JJ/MM/TT mit Jahrhundert; Monat/Tag duerfen schon korrigiert sein.
  const date = (y, m, d) => A.validDate(d, m, y);
  // Luhn-Pruefziffer fuer einen Ziffernrumpf (ISO/IEC 7812-1 Anhang B).
  const luhnDigit = (body) => { for (let c = 0; c < 10; c++) if (A.luhn(body + c)) return c; return -1; };
  // Mod 11 mit Gewichten: Pruefziffer = 11 - Rest, 11 -> 0, 10 ungueltig.
  function m11(s, w, pos) {
    let c = 11 - (wsum(s, w) % 11);
    if (c === 11) c = 0;
    return c !== 10 && c === at(s, pos);
  }

  // Verhoeff (Diedergruppe D5; Verhoeff 1969, UIDAI-Spezifikation Aadhaar).
  const VD = ['0123456789', '1234067895', '2340178956', '3401289567', '4012395678', '5987604321', '6598710432', '7659821043', '8765932104', '9876543210'];
  const VP = ['0123456789', '1576283094', '5803796142', '8916043527', '9453126870', '4286573901', '2793806415', '7046913258'];
  function verhoeff(s) {
    let c = 0;
    for (let i = 0; i < s.length; i++) c = at(VD[c], at(VP[i % 8], at(s, s.length - 1 - i)));
    return c === 0;
  }

  // ISO 7064 MOD 11-2 (GB 11643-1999, chinesische Buergernummer): X = 10.
  function iso7064_11_2(s) {
    let p = 0;
    for (let i = 0; i < s.length - 1; i++) p = ((p + at(s, i)) * 2) % 11;
    const c = (12 - (p % 11)) % 11;
    return (c === 10 ? 'X' : String(c)) === s[s.length - 1];
  }

  // Zweistufiges Mod 11 (Estland/Litauen, EVS 585:2007): Gewichte 1..9,1,
  // bei Rest 10 Gewichte 3..9,1,2,3, bei erneut 10 -> 0.
  function balticMod11(s) {
    const n = s.length - 1;
    const w1 = [], w2 = [];
    for (let i = 0; i < n; i++) { w1.push((i % 9) + 1); w2.push(((i + 2) % 9) + 1); }
    let c = wsum(s, w1) % 11;
    if (c === 10) { c = wsum(s, w2) % 11; if (c === 10) c = 0; }
    return c === at(s, n);
  }

  // ========================= Ergaenzungen Phase 1 =============================
  const D = (id, cat, cls, re, en, de, extra) => Object.assign({ id, cat, cls, re, name: { en, de } }, extra || {});
  function extend(packId, detectors) {
    const pack = DLX.packs[packId];
    for (const d of detectors) {
      if (!d.re.global) throw new Error('detector regex needs g flag: ' + d.id);
      d.pack = packId;
      pack.detectors.push(d);
    }
  }
  const PASS_CTX = ['passport', 'Reisepass', 'Passnummer', 'passeport', 'passaporto', 'pasaporte', 'passaporte', 'paspoort', 'pass no', 'pass nr'];

  // CH: QR-Referenz (SIX Implementation Guidelines QR-Rechnung, Modulo 10 rekursiv).
  const ESR_T = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  function chEsr(v) {
    const d = dig(v);
    if (d.length !== 27) return false;
    let carry = 0;
    for (let i = 0; i < 26; i++) carry = ESR_T[(carry + at(d, i)) % 10];
    return (10 - carry) % 10 === at(d, 26);
  }
  extend('CH', [
    D('ch_pass', 'reise', 'hoch', /\b[A-Z]\d{7}\b/g, 'Swiss passport / ID card number', 'Pass-/ID-Nummer (CH)',
      { needsCtx: true, ctx: ['Reisepass', 'Pass-Nr', 'Pass Nr', 'Passnummer', 'Identitätskarte', 'Identitaetskarte', 'ID-Karte', 'passeport', "carte d'identité", "carta d'identità", 'passaporto', 'passport'] }),
    D('ch_esr', 'finanz', 'tief', /\b\d{2}(?: ?\d{5}){5}\b/g, 'Swiss QR-bill reference', 'QR-/ESR-Referenz (CH)',
      { valid: chEsr, needsCtx: true, ctx: ['QR-Referenz', 'ESR', 'Einzahlungsschein', 'Referenznummer', 'référence QR', 'riferimento QR'] }),
  ]);
  DLX.registerPack({ id: 'LI', kind: 'country', detectors: [
    D('li_peid', 'id-national', 'mittel', /\b\d{4,12}\b/g, 'Liechtenstein person ID (PEID)', 'Personenidentifikationsnummer (LI)',
      { needsCtx: true, ctx: ['PEID', 'Personenidentifikationsnummer', 'Personen-ID'] }),
  ] });

  extend('DE', [
    D('de_stnr', 'steuer', 'mittel', /\b\d{2,3}\/\d{3,4}\/\d{4,5}\b|\b\d{13}\b/g, 'German tax number', 'Steuernummer (DE)',
      { needsCtx: true, ctx: ['Steuernummer', 'StNr', 'St.-Nr', 'Finanzamt'] }),
    D('de_hrb', 'firma', 'tief', /\bHR[AB] ?\d{1,6}(?: ?[A-Z]{1,2})?\b/g, 'German commercial register number', 'Handelsregisternummer (DE)',
      { ctx: ['Handelsregister', 'Amtsgericht', 'Registergericht'] }),
  ]);

  // AT: Steuernummer = Finanzamt (2) + 7 Ziffern, letzte = Luhn-Pruefziffer (BMF).
  const atTin = (v) => { const d = dig(v); return d.length === 9 && A.luhn(d); };
  extend('AT', [
    D('at_tin', 'steuer', 'mittel', /\b\d{2}[- ]?\d{3}\/\d{4}\b/g, 'Austrian tax number', 'Steuernummer (AT)',
      { valid: atTin, needsCtx: true, ctx: ['Steuernummer', 'Finanzamt', 'Abgabenkonto', 'St.Nr'] }),
  ]);

  // FR: numero fiscal (SPI): 13 Ziffern, letzte 3 = erste 10 mod 511 (DGFiP).
  const frNif = (v) => { const d = dig(v); return d.length === 13 && /^[0-3]/.test(d) && A.modStr(d.slice(0, 10), 511) === Number(d.slice(10)); };
  // SIREN 9 / SIRET 14 Ziffern: Luhn (INSEE).
  const frSiren = (v) => { const d = dig(v); return (d.length === 9 || d.length === 14) && A.luhn(d); };
  extend('FR', [
    D('fr_nif', 'steuer', 'hoch', /\b[0-3]\d(?: ?\d){11}\b/g, 'French tax ID (SPI)', 'Steuernummer SPI (FR)',
      { valid: frNif, needsCtx: true, ctx: ['numéro fiscal', 'numero fiscal', 'SPI ', 'SPI:', 'impôts', 'impots', 'fiscal'] }),
    D('fr_siren', 'firma', 'tief', /\b\d{3} ?\d{3} ?\d{3}(?: ?\d{5})?\b/g, 'French company ID (SIREN/SIRET)', 'SIREN/SIRET (FR)',
      { valid: frSiren, needsCtx: true, ctx: ['SIREN', 'SIRET', 'RCS'] }),
  ]);

  // ================================ Europa ===================================
  // ES: DNI/NIE Kontrollbuchstabe = Tabelle[Zahl mod 23] (Real Decreto 1553/2005).
  const ES_L = 'TRWAGMYFPDXBNJZSQVHLCKE';
  const esDni = (v) => { const s = up(v); return /^\d{8}[A-Z]$/.test(s) && ES_L[Number(s.slice(0, 8)) % 23] === s[8]; };
  const esNie = (v) => { const s = up(v); return /^[XYZ]\d{7}[A-Z]$/.test(s) && esDni('XYZ'.indexOf(s[0]) + s.slice(1)); };
  // CIF: Luhn-Pruefziffer der 7 Ziffern, als Ziffer oder Buchstabe JABCDEFGHI (Orden EHA/451/2008).
  function esCif(v) {
    const s = up(v);
    if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s)) return false;
    const c = luhnDigit(s.slice(1, 8));
    return s[8] === String(c) || s[8] === 'JABCDEFGHI'[c];
  }
  // NSS: Provinz (2) + Nummer (8) + Kontrolle = Zahl mod 97; Nummer < 10^7 ohne fuehrende Null (TGSS).
  function esNss(v) {
    const d = dig(v);
    if (d.length !== 12) return false;
    const pp = d.slice(0, 2); const n = Number(d.slice(2, 10));
    const base = n < 1e7 ? pp + String(n) : pp + d.slice(2, 10);
    return A.modStr(base, 97) === Number(d.slice(10));
  }
  const esVat = (v) => { const s = up(v).slice(2); return esDni(s) || esNie(s) || esCif(s); };
  DLX.registerPack({ id: 'ES', kind: 'country', detectors: [
    D('es_dni', 'id-national', 'hoch', /\b\d{8}[- ]?[A-Z]\b/g, 'Spanish national ID (DNI)', 'DNI (ES)', { valid: esDni, ctx: ['DNI', 'NIF', 'documento nacional'] }),
    D('es_nie', 'id-national', 'hoch', /\b[XYZ][- ]?\d{7}[- ]?[A-Z]\b/g, 'Spanish foreigner ID (NIE)', 'NIE (ES)', { valid: esNie, ctx: ['NIE', 'extranjero'] }),
    D('es_cif', 'firma', 'mittel', /\b[ABCDEFGHJNPQRSUVW]-?\d{7}-?[0-9A-J]\b/g, 'Spanish company tax ID (CIF)', 'CIF (ES)',
      { valid: esCif, needsCtx: true, ctx: ['CIF ', 'CIF:', 'NIF ', 'NIF:', 'sociedad', 'empresa'] }),
    D('es_nss', 'sozial', 'hoch', /\b\d{2}[/ ]?\d{8}[/ ]?\d{2}\b/g, 'Spanish social security number', 'Sozialversicherungsnummer (ES)',
      { valid: esNss, needsCtx: true, ctx: ['seguridad social', 'NAF ', 'NAF:', 'afiliación', 'afiliacion'] }),
    D('es_vat', 'firma', 'mittel', /\bES ?[A-Z0-9]\d{7}[A-Z0-9]\b/g, 'Spanish VAT number', 'USt-Nummer (ES)', { valid: esVat }),
  ] });

  // PT: NIF Gewichte 9..2, Pruefziffer 11 - Rest, >= 10 -> 0 (AT Portugal).
  function ptNif(v) {
    const d = dig(v);
    if (d.length !== 9) return false;
    let c = 11 - (wsum(d, [9, 8, 7, 6, 5, 4, 3, 2]) % 11);
    if (c >= 10) c = 0;
    return c === at(d, 8);
  }
  // Cartao de Cidadao: A=10..Z=35, jede zweite Stelle von rechts verdoppelt
  // (>= 10 -> -9), Summe mod 10 = 0 (AMA, Validacao do Numero de Documento).
  function ptCc(v) {
    const s = up(v);
    if (!/^\d{9}[A-Z0-9]{2}\d$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const ch = s.charCodeAt(11 - i);
      let x = ch <= 57 ? ch - 48 : ch - 55;
      if (i % 2 === 1) { x *= 2; if (x >= 10) x -= 9; }
      sum += x;
    }
    return sum % 10 === 0;
  }
  // NISS: Gewichte 29,23,19,17,13,11,7,5,3,2, Pruefziffer 9 - (Summe mod 10) (Seguranca Social).
  const ptNiss = (v) => { const d = dig(v); return d.length === 11 && 9 - (wsum(d, [29, 23, 19, 17, 13, 11, 7, 5, 3, 2]) % 10) === at(d, 10); };
  DLX.registerPack({ id: 'PT', kind: 'country', detectors: [
    D('pt_nif', 'steuer', 'hoch', /\b[1-35-9]\d{2} ?\d{3} ?\d{3}\b/g, 'Portuguese tax ID (NIF)', 'NIF (PT)',
      { valid: ptNif, needsCtx: true, ctx: ['NIF ', 'NIF:', 'contribuinte', 'número fiscal', 'numero fiscal', 'NIPC'] }),
    D('pt_cc', 'id-national', 'hoch', /\b\d{8} ?\d ?[A-Z0-9]{2}\d\b/g, 'Portuguese citizen card number', 'Cartão de Cidadão (PT)',
      { valid: ptCc, needsCtx: true, ctx: ['cartão de cidadão', 'cartao de cidadao', 'cartão do cidadão', 'citizen card', 'documento'] }),
    D('pt_niss', 'sozial', 'hoch', /\b[12]\d{10}\b/g, 'Portuguese social security number (NISS)', 'NISS (PT)',
      { valid: ptNiss, needsCtx: true, ctx: ['NISS', 'segurança social', 'seguranca social'] }),
    D('pt_vat', 'firma', 'mittel', /\bPT ?\d{9}\b/g, 'Portuguese VAT number', 'USt-Nummer (PT)', { valid: (v) => ptNif(v.slice(2)) }),
  ] });

  // LU: Matricule 13 Ziffern = JJJJMMTT + 3 + Luhn + Verhoeff (CNS/RNPP).
  function luMat(v) {
    const d = dig(v);
    if (d.length !== 13 || !date(Number(d.slice(0, 4)), Number(d.slice(4, 6)), Number(d.slice(6, 8)))) return false;
    return A.luhn(d.slice(0, 12)) && verhoeff(d.slice(0, 11) + d[12]);
  }
  // TVA: letzte 2 Ziffern = erste 6 mod 89 (AED).
  const luTva = (v) => { const d = dig(v); return d.length === 8 && Number(d.slice(0, 6)) % 89 === Number(d.slice(6)); };
  DLX.registerPack({ id: 'LU', kind: 'country', detectors: [
    D('lu_matricule', 'id-national', 'hoch', /\b(?:19|20)\d{2}[01]\d[0-3]\d ?\d{5}\b/g, 'Luxembourg national ID (matricule)', 'Matricule (LU)',
      { valid: luMat, needsCtx: true, ctx: ['matricule', "numéro d'identification", 'numero d identification', 'CNS', 'Sozialversicherung', 'sécurité sociale'] }),
    D('lu_tva', 'firma', 'mittel', /\bLU ?\d{8}\b/g, 'Luxembourg VAT number', 'USt-Nummer (LU)', { valid: luTva }),
  ] });

  // Nordische Laender ---------------------------------------------------------
  // SE: Personnummer JJMMTT-NNNC, Luhn ueber 10 Ziffern; Samordningsnummer Tag + 60 (Skatteverket SKV 704).
  function sePnr(v) {
    const d = dig(v);
    if (d.length !== 10 && d.length !== 12) return false;
    const t = d.slice(-10);
    let day = Number(t.slice(4, 6));
    if (day > 60) day -= 60;
    const y = d.length === 12 ? Number(d.slice(0, 4)) : 2000;
    return date(y, Number(t.slice(2, 4)), day) && A.luhn(t);
  }
  // Organisationsnummer: dritte Ziffer >= 2, Luhn (Bolagsverket).
  const seOrg = (v) => { const d = dig(v); return d.length === 10 && d[2] >= '2' && A.luhn(d); };
  const seVat = (v) => { const d = dig(v); return d.length === 12 && d.slice(10) === '01' && A.luhn(d.slice(0, 10)); };
  DLX.registerPack({ id: 'SE', kind: 'country', detectors: [
    D('se_pnr', 'id-national', 'hoch', /\b(?:19|20)?\d{2}[01]\d[0-9]\d[-+]?\d{4}\b/g, 'Swedish personal identity number', 'Personnummer (SE)',
      { valid: sePnr, needsCtx: true, ctx: ['personnummer', 'samordningsnummer', 'personnr', 'person number'] }),
    D('se_org', 'firma', 'mittel', /\b\d{6}-?\d{4}\b/g, 'Swedish organisation number', 'Organisationsnummer (SE)',
      { valid: seOrg, needsCtx: true, ctx: ['organisationsnummer', 'org.nr', 'orgnr', 'org nr'] }),
    D('se_vat', 'firma', 'mittel', /\bSE ?\d{10} ?01\b/g, 'Swedish VAT number', 'USt-Nummer (SE)', { valid: seVat }),
  ] });

  // DK: CPR nur Datum (Mod 11 seit 2007 nicht garantiert, CPR-Kontoret); CVR Gewichte 2,7,6,5,4,3,2,1 mod 11 = 0.
  const dkCpr = (v) => { const d = dig(v); return d.length === 10 && date(2000, Number(d.slice(2, 4)), Number(d.slice(0, 2))); };
  const dkCvr = (v) => { const d = dig(v); return d.length === 8 && d[0] !== '0' && wsum(d, [2, 7, 6, 5, 4, 3, 2, 1]) % 11 === 0; };
  DLX.registerPack({ id: 'DK', kind: 'country', detectors: [
    D('dk_cpr', 'id-national', 'hoch', /\b[0-3]\d[01]\d{3}-?\d{4}\b/g, 'Danish CPR number', 'CPR-Nummer (DK)',
      { valid: dkCpr, needsCtx: true, ctx: ['CPR', 'personnummer', 'sundhedskort', 'cpr-nr'] }),
    D('dk_cvr', 'firma', 'mittel', /\b\d{8}\b/g, 'Danish company number (CVR)', 'CVR-Nummer (DK)',
      { valid: dkCvr, needsCtx: true, ctx: ['CVR', 'SE-nummer', 'virksomhed'] }),
    D('dk_vat', 'firma', 'mittel', /\bDK ?\d{2} ?\d{2} ?\d{2} ?\d{2}\b/g, 'Danish VAT number', 'USt-Nummer (DK)', { valid: dkCvr }),
  ] });

  // NO: Foedselsnummer, zwei Mod-11-Ziffern; D-Nummer Tag + 40, H-Nummer Monat + 40,
  // synthetisch Monat + 80 (Skatteetaten). Orgnr Gewichte 3,2,7,6,5,4,3,2 (Broennoeysund).
  function noFnr(v) {
    const d = dig(v);
    if (d.length !== 11) return false;
    let day = Number(d.slice(0, 2)); let mon = Number(d.slice(2, 4));
    if (day > 40) day -= 40;
    if (mon > 80) mon -= 80; else if (mon > 40) mon -= 40;
    return date(2000, mon, day) && m11(d, [3, 7, 6, 1, 8, 9, 4, 5, 2], 9) && m11(d, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2], 10);
  }
  const noOrg = (v) => { const d = dig(v); return d.length === 9 && /^[89]/.test(d) && m11(d, [3, 2, 7, 6, 5, 4, 3, 2], 8); };
  DLX.registerPack({ id: 'NO', kind: 'country', detectors: [
    D('no_fnr', 'id-national', 'hoch', /\b[0-7]\d[0-9]\d{3} ?\d{5}\b/g, 'Norwegian national ID number', 'Fødselsnummer (NO)',
      { valid: noFnr, needsCtx: true, ctx: ['fødselsnummer', 'fodselsnummer', 'personnummer', 'D-nummer', 'fnr'] }),
    D('no_orgnr', 'firma', 'mittel', /\b(?:NO ?)?\d{3} ?\d{3} ?\d{3}(?: ?MVA)?\b/g, 'Norwegian organisation / VAT number', 'Organisasjonsnummer (NO)',
      { valid: noOrg, needsCtx: true, ctxUnless: /^NO|MVA$/, ctx: ['organisasjonsnummer', 'org.nr', 'orgnr', 'foretaksregisteret', 'MVA'] }),
  ] });

  // FI: HETU Kontrollzeichen = Tabelle[Zahl mod 31] (DVV); Trennzeichen + - Y X W V U A B C D E F.
  const FI_C = '0123456789ABCDEFHJKLMNPRSTUVWXY';
  const FI_SEP = { '+': 1800, '-': 1900, Y: 1900, X: 1900, W: 1900, V: 1900, U: 1900, A: 2000, B: 2000, C: 2000, D: 2000, E: 2000, F: 2000 };
  function fiHetu(v) {
    const s = v.toUpperCase();
    if (!/^\d{6}[-+A-FU-Y]\d{3}[0-9A-Y]$/.test(s)) return false;
    if (!date(FI_SEP[s[6]] + Number(s.slice(4, 6)), Number(s.slice(2, 4)), Number(s.slice(0, 2)))) return false;
    return FI_C[Number(s.slice(0, 6) + s.slice(7, 10)) % 31] === s[10];
  }
  // Y-tunnus: Gewichte 7,9,10,5,8,4,2, Rest 0 -> 0, Rest 1 ungueltig, sonst 11 - Rest (PRH).
  function fiYt(v) {
    const d = dig(v);
    if (d.length !== 8) return false;
    const r = wsum(d, [7, 9, 10, 5, 8, 4, 2]) % 11;
    return r !== 1 && (r === 0 ? 0 : 11 - r) === at(d, 7);
  }
  DLX.registerPack({ id: 'FI', kind: 'country', detectors: [
    D('fi_hetu', 'id-national', 'hoch', /\b[0-3]\d[01]\d{3}[-+A-FU-Y]\d{3}[0-9A-Y]\b/g, 'Finnish personal identity code (HETU)', 'Henkilötunnus (FI)',
      { valid: fiHetu, ctx: ['henkilötunnus', 'henkilotunnus', 'HETU', 'sotu', 'personbeteckning'] }),
    D('fi_alv', 'firma', 'mittel', /\b\d{7}-\d\b/g, 'Finnish business ID (Y-tunnus)', 'Y-tunnus (FI)',
      { valid: fiYt, needsCtx: true, ctx: ['Y-tunnus', 'ytunnus', 'FO-nummer', 'business ID', 'ALV ', 'ALV:'] }),
    D('fi_vat', 'firma', 'mittel', /\bFI ?\d{8}\b/g, 'Finnish VAT number', 'USt-Nummer (FI)', { valid: fiYt }),
  ] });

  // IS: Kennitala Gewichte 3,2,7,6,5,4,3,2 mod 11, Stelle 9 Pruefziffer, Stelle 10 Jahrhundert; Firmen Tag + 40 (Thjodskra).
  function isKt(v) {
    const d = dig(v);
    if (d.length !== 10 || '890'.indexOf(d[9]) === -1) return false;
    let day = Number(d.slice(0, 2));
    if (day > 40) day -= 40;
    return date(2000, Number(d.slice(2, 4)), day) && m11(d, [3, 2, 7, 6, 5, 4, 3, 2], 8);
  }
  DLX.registerPack({ id: 'IS', kind: 'country', detectors: [
    D('is_kt', 'id-national', 'hoch', /\b[0-7]\d[01]\d{3}-?\d{4}\b/g, 'Icelandic ID number (kennitala)', 'Kennitala (IS)',
      { valid: isKt, needsCtx: true, ctx: ['kennitala', 'kennitölu'] }),
  ] });

  // IE: PPS Gewichte 8..2 (+ zweiter Buchstabe x 9, A=1, W=0), Buchstabe = W,A..V[Summe mod 23] (Revenue).
  const IE_L = 'WABCDEFGHIJKLMNOPQRSTUV';
  function iePps(v) {
    const s = up(v);
    if (!/^\d{7}[A-W][A-IW]?$/.test(s)) return false;
    let sum = wsum(s, [8, 7, 6, 5, 4, 3, 2]);
    if (s.length === 9) sum += IE_L.indexOf(s[8]) * 9;
    return IE_L[sum % 23] === s[7];
  }
  // USt: neues Format = PPS-Struktur, altes Format Ziffer, Buchstabe/+/*, 5 Ziffern, Buchstabe.
  function ieVat(v) {
    const s = up(v).slice(2);
    if (/^\d[A-Z+*]\d{5}[A-W]$/.test(s)) return iePps('0' + s.slice(2, 7) + s[0] + s[7]);
    return iePps(s);
  }
  DLX.registerPack({ id: 'IE', kind: 'country', detectors: [
    D('ie_pps', 'sozial', 'hoch', /\b\d{7}[A-W][A-IW]?\b/g, 'Irish personal public service number (PPSN)', 'PPS-Nummer (IE)',
      { valid: iePps, needsCtx: true, ctx: ['PPS no', 'PPS number', 'PPS:', 'PPSN', 'social security', 'public service number'] }),
    D('ie_vat', 'firma', 'mittel', /\bIE ?\d[A-Z0-9+*]\d{5}[A-W][A-IW]?\b/g, 'Irish VAT number', 'USt-Nummer (IE)', { valid: ieVat }),
  ] });

  // GB --------------------------------------------------------------------------
  // NHS: Gewichte 10..2, 11 - Rest, 11 -> 0, 10 ungueltig (NHS Data Dictionary).
  const gbNhs = (v) => { const d = dig(v); return d.length === 10 && m11(d, [10, 9, 8, 7, 6, 5, 4, 3, 2], 9); };
  // UTR: Pruefziffer vorne, Gewichte 6,7,8,9,10,5,4,3,2 auf Stellen 2-10, Tabelle 2,1,9..1 (HMRC).
  const gbUtr = (v) => { const d = dig(v); return d.length === 10 && '21987654321'[wsum(d, [6, 7, 8, 9, 10, 5, 4, 3, 2], 1) % 11] === d[0]; };
  // VAT: Gewichte 8..2 + letzte zwei Ziffern; Summe mod 97 = 0 oder (+55) mod 97 = 0 (HMRC VAT Notice).
  function gbVat(v) {
    const s = up(v).slice(2);
    if (/^GD\d{3}$/.test(s)) return Number(s.slice(2)) < 500;
    if (/^HA\d{3}$/.test(s)) return Number(s.slice(2)) >= 500;
    if (!/^\d{9}(?:\d{3})?$/.test(s)) return false;
    const t = wsum(s, [8, 7, 6, 5, 4, 3, 2]) + Number(s.slice(7, 9));
    return t % 97 === 0 || (t + 55) % 97 === 0;
  }
  DLX.registerPack({ id: 'GB', kind: 'country', detectors: [
    D('gb_nino', 'sozial', 'hoch', /\b(?!BG|GB|KN|NK|NT|TN|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z] ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/g, 'UK National Insurance number', 'National Insurance Number (UK)',
      { needsCtx: true, ctxUnless: /^[A-Z]{2} \d{2} \d{2} \d{2} [A-D]$/, ctx: ['National Insurance', 'NI number', 'NINO', 'NI no'] }),
    D('gb_nhs', 'gesundheit', 'hoch', /\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/g, 'UK NHS number', 'NHS-Nummer (UK)',
      { valid: gbNhs, needsCtx: true, ctx: ['NHS', 'patient', 'CHI number'] }),
    D('gb_utr', 'steuer', 'hoch', /\b\d{5} ?\d{5}\b/g, 'UK unique taxpayer reference (UTR)', 'Steuerreferenz UTR (UK)',
      { valid: gbUtr, needsCtx: true, ctx: ['UTR ', 'UTR:', 'self assessment', 'HMRC', 'taxpayer reference'] }),
    D('gb_vat', 'firma', 'mittel', /\bGB ?(?:\d{3} ?\d{4} ?\d{2}(?: ?\d{3})?|GD\d{3}|HA\d{3})\b/g, 'UK VAT number', 'USt-Nummer (UK)', { valid: gbVat }),
    D('gb_crn', 'firma', 'tief', /\b(?:\d{8}|(?:SC|NI|OC|SO|NC|R0|LP|SL|SE|IP)\d{6})\b/g, 'UK company number', 'Company Number (UK)',
      { needsCtx: true, ctx: ['Companies House', 'company number', 'company no', 'CRN', 'registered number'] }),
    // Sortcode-Pruefung nach Vocalink braucht lizenzierte Tabellen -> nur Format, Klasse tief (Auflage 8).
    D('gb_sort', 'finanz', 'tief', /\b\d{2}-\d{2}-\d{2} ?\d{8}\b/g, 'UK sort code and account number', 'Sortcode + Kontonummer (UK)',
      { ctx: ['sort code', 'account number', 'bank details'] }),
    D('gb_dl', 'reise', 'hoch', /\b[A-Z9]{5}\d[0156]\d[0-3]\d\d[A-Z9]{2}\d[A-Z]{2}\b/g, 'UK driving licence number', 'Führerscheinnummer (UK)',
      { needsCtx: true, ctx: ['driving licence', 'driver licence', 'driving license', 'DVLA', 'licence number', 'Führerschein'] }),
    D('gb_pass', 'reise', 'hoch', /\b\d{9}\b/g, 'UK passport number', 'Passnummer (UK)', { needsCtx: true, ctx: PASS_CTX.concat(['HMPO']) }),
  ] });

  // PL: PESEL Gewichte 1,3,7,9..., Monat + 20/40/60/80 fuer Jahrhundert (MSWiA).
  function plPesel(v) {
    const d = dig(v);
    if (d.length !== 11) return false;
    let m = Number(d.slice(2, 4)); const c = Math.floor(m / 20); m %= 20;
    const y = [1900, 2000, 2100, 2200, 1800][c] + Number(d.slice(0, 2));
    return date(y, m, Number(d.slice(4, 6))) && (10 - (wsum(d, [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]) % 10)) % 10 === at(d, 10);
  }
  // NIP: Gewichte 6,5,7,2,3,4,5,6,7, Summe mod 11 = Pruefziffer (10 ungueltig).
  const plNip = (v) => { const d = dig(v); return d.length === 10 && wsum(d, [6, 5, 7, 2, 3, 4, 5, 6, 7]) % 11 === at(d, 9); };
  // REGON 9 bzw. 14 Ziffern, Mod 11, 10 -> 0 (GUS).
  function plRegon(v) {
    const d = dig(v);
    if (d.length === 9) return wsum(d, [8, 9, 2, 3, 4, 5, 6, 7]) % 11 % 10 === at(d, 8);
    return d.length === 14 && wsum(d, [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8]) % 11 % 10 === at(d, 13);
  }
  DLX.registerPack({ id: 'PL', kind: 'country', detectors: [
    D('pl_pesel', 'id-national', 'hoch', /\b\d{2}[0-9]\d[0-3]\d{6}\b/g, 'Polish national ID (PESEL)', 'PESEL (PL)',
      { valid: plPesel, needsCtx: true, ctx: ['PESEL'] }),
    D('pl_nip', 'steuer', 'mittel', /\b\d{3}-?\d{3}-?\d{2}-?\d{2}\b/g, 'Polish tax ID (NIP)', 'NIP (PL)', { valid: plNip, needsCtx: true, ctx: ['NIP ', 'NIP:', 'numer identyfikacji'] }),
    D('pl_vat', 'firma', 'mittel', /\bPL ?\d{10}\b/g, 'Polish VAT number', 'USt-Nummer (PL)', { valid: (v) => plNip(v.slice(2)) }),
    D('pl_regon', 'firma', 'tief', /\b\d{9}(?:\d{5})?\b/g, 'Polish business ID (REGON)', 'REGON (PL)', { valid: plRegon, needsCtx: true, ctx: ['REGON:', 'nr REGON', 'numer REGON'] }),
  ] });

  // CZ/SK: Rodne cislo JJMMTT/NNN(C); Monat + 50 (Frau), + 20/+ 70 seit 2004;
  // 10-stellig: erste 9 mod 11 (10 -> 0) = letzte (Zakon 133/2000 Sb.).
  function rodne(v) {
    const d = dig(v);
    if (d.length !== 9 && d.length !== 10) return false;
    let y = Number(d.slice(0, 2)); let m = Number(d.slice(2, 4));
    if (m > 70) m -= 70; else if (m > 50) m -= 50; else if (m > 20) m -= 20;
    y += d.length === 9 ? 1900 : (y < 54 ? 2000 : 1900);
    if (!date(y, m, Number(d.slice(4, 6)))) return false;
    return d.length === 9 || Number(BigInt(d.slice(0, 9)) % 11n) % 10 === at(d, 9);
  }
  // DIC: 8 Ziffern Gewichte 8..2, (11 - Summe) mod 11, 0 -> 1, mod 10; 9-10 Ziffern = Rodne cislo.
  function czDic(v) {
    const d = dig(v);
    if (d.length === 8) { const c = (11 - (wsum(d, [8, 7, 6, 5, 4, 3, 2]) % 11)) % 11; return d[0] !== '9' && (c === 0 ? 1 : c) % 10 === at(d, 7); }
    return rodne(d) || (d.length === 9 && d[0] === '6' ? 'ctx' : false);
  }
  // SK IC DPH: 10 Ziffern, Zahl mod 11 = 0, dritte Ziffer 2,3,4,7,8,9.
  const skDph = (v) => { const d = dig(v); return d.length === 10 && d[0] !== '0' && '234789'.indexOf(d[2]) !== -1 && Number(BigInt(d) % 11n) === 0; };
  const RC_CTX = ['rodné číslo', 'rodne cislo', 'rodného čísla', 'birth number'];
  DLX.registerPack({ id: 'CZ', kind: 'country', detectors: [
    D('cz_rc', 'id-national', 'hoch', /\b\d{2}[0-35-8]\d[0-3]\d\/?\d{3,4}\b/g, 'Czech birth number (rodné číslo)', 'Rodné číslo (CZ)', { valid: rodne, needsCtx: true, ctx: RC_CTX }),
    D('cz_dic', 'firma', 'mittel', /\bCZ ?\d{8,10}\b/g, 'Czech VAT ID (DIČ)', 'USt-Nummer DIČ (CZ)', { valid: czDic }),
  ] });
  DLX.registerPack({ id: 'SK', kind: 'country', detectors: [
    D('sk_rc', 'id-national', 'hoch', /\b\d{2}[0-35-8]\d[0-3]\d\/?\d{3,4}\b/g, 'Slovak birth number (rodné číslo)', 'Rodné číslo (SK)', { valid: rodne, needsCtx: true, ctx: RC_CTX }),
    D('sk_dph', 'firma', 'mittel', /\bSK ?\d{10}\b/g, 'Slovak VAT ID (IČ DPH)', 'USt-Nummer IČ DPH (SK)', { valid: skDph }),
  ] });

  // HU: Adoazonosito jel 8 + 9 Ziffern, Gewichte 1..9 mod 11 (NAV); TAJ Gewichte 3,7 mod 10 (NEAK);
  // Adoszam 8 Ziffern Gewichte 9,7,3,1 mod 10 = 0.
  const huTax = (v) => { const d = dig(v); return d.length === 10 && d[0] === '8' && wsum(d, [1, 2, 3, 4, 5, 6, 7, 8, 9]) % 11 === at(d, 9); };
  const huTaj = (v) => { const d = dig(v); return d.length === 9 && wsum(d, [3, 7, 3, 7, 3, 7, 3, 7]) % 10 === at(d, 8); };
  const huVat = (v) => { const d = dig(v); return d.length === 8 && wsum(d, [9, 7, 3, 1, 9, 7, 3, 1]) % 10 === 0; };
  DLX.registerPack({ id: 'HU', kind: 'country', detectors: [
    D('hu_tax', 'steuer', 'hoch', /\b8\d{9}\b/g, 'Hungarian personal tax ID', 'Adóazonosító jel (HU)', { valid: huTax, needsCtx: true, ctx: ['adóazonosító', 'adoazonosito', 'adószám', 'adoszam', 'tax ID'] }),
    D('hu_taj', 'gesundheit', 'hoch', /\b\d{3} ?\d{3} ?\d{3}\b/g, 'Hungarian social insurance number (TAJ)', 'TAJ-Nummer (HU)',
      { valid: huTaj, needsCtx: true, ctx: ['TAJ:', 'TAJ szám', 'TAJ-szám', 'társadalombiztosítási', 'tarsadalombiztositasi'] }),
    D('hu_vat', 'firma', 'mittel', /\bHU ?\d{8}\b/g, 'Hungarian VAT number', 'USt-Nummer (HU)', { valid: huVat }),
  ] });

  // RO: CNP Gewichte 2,7,9,1,4,6,3,5,8,2,7,9, Rest 10 -> 1; erste Ziffer = Jahrhundert/Geschlecht (DEPABD).
  const RO_CENT = { 1: 1900, 2: 1900, 3: 1800, 4: 1800, 5: 2000, 6: 2000, 7: 1900, 8: 1900, 9: 1900 };
  function roCnp(v) {
    const d = dig(v);
    if (d.length !== 13 || d[0] === '0') return false;
    if (!date(RO_CENT[d[0]] + Number(d.slice(1, 3)), Number(d.slice(3, 5)), Number(d.slice(5, 7)))) return false;
    const c = wsum(d, [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9]) % 11;
    return (c === 10 ? 1 : c) === at(d, 12);
  }
  // CUI/CIF: 2-10 Ziffern, Gewichte 7,5,3,2,1,7,5,3,2 rechtsbuendig, (Summe x 10) mod 11 mod 10 (ANAF).
  function roCui(v) {
    const d = dig(v);
    if (d.length < 2 || d.length > 10) return false;
    const body = d.slice(0, -1).padStart(9, '0');
    return (wsum(body, [7, 5, 3, 2, 1, 7, 5, 3, 2]) * 10) % 11 % 10 === at(d, d.length - 1);
  }
  DLX.registerPack({ id: 'RO', kind: 'country', detectors: [
    D('ro_cnp', 'id-national', 'hoch', /\b[1-9]\d{2}[01]\d[0-3]\d{7}\b/g, 'Romanian personal numeric code (CNP)', 'CNP (RO)', { valid: roCnp, needsCtx: true, ctx: ['CNP', 'cod numeric personal'] }),
    D('ro_cui', 'firma', 'mittel', /\b\d{2,10}\b/g, 'Romanian company ID (CUI/CIF)', 'CUI/CIF (RO)', { valid: roCui, needsCtx: true, ctx: ['CUI ', 'CUI:', 'cod fiscal', 'cod unic de înregistrare', 'cod unic de inregistrare'] }),
    D('ro_vat', 'firma', 'mittel', /\bRO ?\d{6,10}\b/g, 'Romanian VAT number', 'USt-Nummer (RO)', { valid: roCui }),
  ] });

  // BG: EGN Gewichte 2,4,8,5,10,9,7,3,6 mod 11 mod 10; Monat + 20 (1800er) / + 40 (2000er) (GRAO).
  function bgEgn(v) {
    const d = dig(v);
    if (d.length !== 10) return false;
    let y = 1900 + Number(d.slice(0, 2)); let m = Number(d.slice(2, 4));
    if (m > 40) { m -= 40; y += 100; } else if (m > 20) { m -= 20; y -= 100; }
    return date(y, m, Number(d.slice(4, 6))) && wsum(d, [2, 4, 8, 5, 10, 9, 7, 3, 6]) % 11 % 10 === at(d, 9);
  }
  // DDS: 9 Ziffern Gewichte 1..8 (bei 10: 3..10) mod 11 mod 10; 10 Ziffern = EGN, Auslaender
  // (Gewichte 21,19,17,13,11,9,7,3,1 mod 10) oder Sonstige (4,3,2,7,6,5,4,3,2; 11 - Rest) (NRA).
  function bgVat(v) {
    const d = dig(v);
    if (d.length === 9) {
      let c = wsum(d, [1, 2, 3, 4, 5, 6, 7, 8]) % 11;
      if (c === 10) c = wsum(d, [3, 4, 5, 6, 7, 8, 9, 10]) % 11 % 10;
      return c === at(d, 8);
    }
    if (d.length !== 10) return false;
    return bgEgn(d) || wsum(d, [21, 19, 17, 13, 11, 9, 7, 3, 1]) % 10 === at(d, 9) || m11(d, [4, 3, 2, 7, 6, 5, 4, 3, 2], 9);
  }
  DLX.registerPack({ id: 'BG', kind: 'country', detectors: [
    D('bg_egn', 'id-national', 'hoch', /\b\d{2}[0-5]\d[0-3]\d{5}\b/g, 'Bulgarian uniform civil number (EGN)', 'EGN (BG)', { valid: bgEgn, needsCtx: true, ctx: ['ЕГН', 'EGN ', 'EGN:', 'единен граждански номер'] }),
    D('bg_vat', 'firma', 'mittel', /\bBG ?\d{9,10}\b/g, 'Bulgarian VAT number', 'USt-Nummer (BG)', { valid: bgVat }),
  ] });

  // HR: OIB ISO 7064 MOD 11,10 (Porezna uprava); mit HR = USt-Nummer.
  const hrOib = (v) => { const d = dig(v); return d.length === 11 && A.iso7064_11_10(d); };
  DLX.registerPack({ id: 'HR', kind: 'country', detectors: [
    D('hr_oib', 'id-national', 'hoch', /\b\d{11}\b/g, 'Croatian personal identification number (OIB)', 'OIB (HR)', { valid: hrOib, needsCtx: true, ctx: ['OIB', 'osobni identifikacijski broj'] }),
    D('hr_vat', 'firma', 'mittel', /\bHR ?\d{11}\b/g, 'Croatian VAT number', 'USt-Nummer (HR)', { valid: hrOib }),
  ] });

  // SI: EMSO TTMMJJJ RR SSS C, Gewichte 7,6,5,4,3,2,7,6,5,4,3,2 (Zakon o CRP); DDV 8 Ziffern Gewichte 8..2, 10 -> 0.
  function siEmso(v) {
    const d = dig(v);
    if (d.length !== 13) return false;
    const yy = Number(d.slice(4, 7));
    return date(yy < 800 ? 2000 + yy : 1000 + yy, Number(d.slice(2, 4)), Number(d.slice(0, 2))) && m11(d, [7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2], 12);
  }
  function siDdv(v) {
    const d = dig(v);
    if (d.length !== 8 || d[0] === '0') return false;
    let c = 11 - (wsum(d, [8, 7, 6, 5, 4, 3, 2]) % 11);
    if (c === 11) return false;
    if (c === 10) c = 0;
    return c === at(d, 7);
  }
  DLX.registerPack({ id: 'SI', kind: 'country', detectors: [
    D('si_emso', 'id-national', 'hoch', /\b[0-3]\d[01]\d{4}50\d{4}\b/g, 'Slovenian personal number (EMŠO)', 'EMŠO (SI)', { valid: siEmso, needsCtx: true, ctx: ['EMŠO', 'EMSO', 'matična številka', 'maticna stevilka'] }),
    D('si_ddv', 'firma', 'mittel', /\bSI ?\d{8}\b/g, 'Slovenian VAT number', 'USt-Nummer (SI)', { valid: siDdv }),
  ] });

  // GR: AMKA TTMMJJ + 5, Luhn (IDIKA); AFM Gewichte 2^8..2^1, Summe mod 11 mod 10.
  const grAmka = (v) => { const d = dig(v); return d.length === 11 && date(2000, Number(d.slice(2, 4)), Number(d.slice(0, 2))) && A.luhn(d); };
  const grAfm = (v) => { const d = dig(v); return d.length === 9 && wsum(d, [256, 128, 64, 32, 16, 8, 4, 2]) % 11 % 10 === at(d, 8); };
  DLX.registerPack({ id: 'GR', kind: 'country', detectors: [
    D('gr_amka', 'sozial', 'hoch', /\b[0-3]\d[01]\d{8}\b/g, 'Greek social security number (AMKA)', 'AMKA (GR)', { valid: grAmka, needsCtx: true, ctx: ['AMKA', 'ΑΜΚΑ'] }),
    D('gr_afm', 'steuer', 'mittel', /\b(?:(?:EL|GR) ?)?\d{9}\b/g, 'Greek tax / VAT number (AFM)', 'AFM (GR)',
      { valid: grAfm, needsCtx: true, ctxUnless: /^(?:EL|GR)/, ctx: ['AFM ', 'AFM:', 'ΑΦΜ', 'ΦΠΑ', 'VAT ', 'VAT:'] }),
  ] });

  // CY: 8 Ziffern + Buchstabe; ungerade Stellen ueber Tabelle, Buchstabe = A + Summe mod 26 (Tax Department).
  const CY_T = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21];
  function cyVat(v) {
    const s = up(v).replace(/^CY/, '');
    if (!/^[0-59]\d{7}[A-Z]$/.test(s) || s.slice(0, 2) === '12') return false;
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += i % 2 === 0 ? CY_T[at(s, i)] : at(s, i);
    return String.fromCharCode(65 + (sum % 26)) === s[8];
  }
  DLX.registerPack({ id: 'CY', kind: 'country', detectors: [
    D('cy_vat', 'firma', 'mittel', /\b(?:CY ?-?)?[0-59]\d{7}[A-Z]\b/g, 'Cyprus VAT / tax ID', 'USt-/Steuernummer (CY)',
      { valid: cyVat, needsCtx: true, ctxUnless: /^CY/, ctx: ['tax identification', 'ΑΦΤ', 'ΦΠΑ', 'VAT ', 'VAT:'] }),
  ] });

  // MT: ID-Karte ohne Pruefziffer; USt Gewichte 3,4,6,7,8,9,10,1 mod 37 = 0 (CFR).
  const mtVat = (v) => { const d = dig(v); return d.length === 8 && d[0] !== '0' && wsum(d, [3, 4, 6, 7, 8, 9, 10, 1]) % 37 === 0; };
  DLX.registerPack({ id: 'MT', kind: 'country', detectors: [
    D('mt_id', 'id-national', 'hoch', /\b\d{1,7}[MGAPLHBZ]\b/g, 'Maltese ID card number', 'ID-Karte (MT)',
      { needsCtx: true, ctx: ['ID card', 'karta tal-identità', 'karta tal-identita', 'identity card'] }),
    D('mt_vat', 'firma', 'mittel', /\bMT ?\d{4}-?\d{4}\b/g, 'Maltese VAT number', 'USt-Nummer (MT)', { valid: mtVat }),
  ] });

  // Baltikum: Personencode GJJMMTTNNNC, erste Ziffer Jahrhundert/Geschlecht, zweistufig Mod 11.
  function balticId(v) {
    const d = dig(v);
    if (d.length !== 11 || d[0] < '1' || d[0] > '6') return false;
    const y = [1800, 1900, 2000][Math.floor((at(d, 0) - 1) / 2)] + Number(d.slice(1, 3));
    return date(y, Number(d.slice(3, 5)), Number(d.slice(5, 7))) && balticMod11(d);
  }
  // EE KMKR: Gewichte 3,7,1 mod 10 = 0 (EMTA). LT PVM: 9 Ziffern (8. = 1) oder 12 Ziffern (11. = 1), Mod 11 zweistufig (VMI).
  const eeKmkr = (v) => { const d = dig(v); return d.length === 9 && wsum(d, [3, 7, 1, 3, 7, 1, 3, 7, 1]) % 10 === 0; };
  const ltPvm = (v) => { const d = dig(v); return ((d.length === 9 && d[7] === '1') || (d.length === 12 && d[10] === '1')) && balticMod11(d); };
  DLX.registerPack({ id: 'EE', kind: 'country', detectors: [
    D('ee_ik', 'id-national', 'hoch', /\b[1-6]\d{2}[01]\d[0-3]\d{5}\b/g, 'Estonian personal ID code (isikukood)', 'Isikukood (EE)', { valid: balticId, needsCtx: true, ctx: ['isikukood', 'ID-kood', 'personal code'] }),
    D('ee_kmkr', 'firma', 'mittel', /\bEE ?\d{9}\b/g, 'Estonian VAT number (KMKR)', 'USt-Nummer (EE)', { valid: eeKmkr }),
  ] });
  DLX.registerPack({ id: 'LT', kind: 'country', detectors: [
    D('lt_ak', 'id-national', 'hoch', /\b[1-6]\d{2}[01]\d[0-3]\d{5}\b/g, 'Lithuanian personal code (asmens kodas)', 'Asmens kodas (LT)', { valid: balticId, needsCtx: true, ctx: ['asmens kodas', 'personal code'] }),
    D('lt_pvm', 'firma', 'mittel', /\bLT ?(?:\d{9}|\d{12})\b/g, 'Lithuanian VAT number (PVM)', 'USt-Nummer (LT)', { valid: ltPvm }),
  ] });

  // LV: Personas kods TTMMJJ-CNNNN: (1101 - Summe Gewichte 1,6,3,7,9,10,5,8,4,2) mod 11 (PMLP);
  // Codes ab 2017 beginnen mit 32 und tragen kein Datum. PVN juristisch: Gewichte 9,1,4,8,3,10,2,5,7,6,1 mod 11 = 3 (VID).
  function lvPk(v) {
    const d = dig(v);
    if (d.length !== 11) return false;
    if (d.slice(0, 2) === '32') return true;
    const y = [1800, 1900, 2000][Number(d[6])] + Number(d.slice(4, 6));
    if (!(d[6] <= '2') || !date(y, Number(d.slice(2, 4)), Number(d.slice(0, 2)))) return false;
    return (1101 - wsum(d, [1, 6, 3, 7, 9, 10, 5, 8, 4, 2])) % 11 % 10 === at(d, 10);
  }
  const lvPvn = (v) => { const d = dig(v); return d.length === 11 && (d[0] > '3' ? wsum(d, [9, 1, 4, 8, 3, 10, 2, 5, 7, 6, 1]) % 11 === 3 : lvPk(d)); };
  DLX.registerPack({ id: 'LV', kind: 'country', detectors: [
    D('lv_pk', 'id-national', 'hoch', /\b[0-3]\d[01]\d{3}-?[0-2]\d{4}\b|\b32\d{4}-?\d{5}\b/g, 'Latvian personal code (personas kods)', 'Personas kods (LV)',
      { valid: lvPk, needsCtx: true, ctx: ['personas kods', 'personal code'] }),
    D('lv_pvn', 'firma', 'mittel', /\bLV ?\d{11}\b/g, 'Latvian VAT number (PVN)', 'USt-Nummer (LV)', { valid: lvPvn }),
  ] });

  // =============================== Amerika ===================================
  // US: ITIN/EIN ohne Pruefziffer (IRS); EIN nur gueltige Praefixe (IRS-Liste der Campus-Praefixe).
  const EIN_PRE = ('01 02 03 04 05 06 10 11 12 13 14 15 16 20 21 22 23 24 25 26 27 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 ' +
    '50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 71 72 73 74 75 76 77 80 81 82 83 84 85 86 87 88 90 91 92 93 94 95 98 99').split(' ');
  // ABA-Routing: Gewichte 3,7,1 mod 10 = 0, Praefix 00-12, 21-32, 61-72, 80 (ABA/Federal Reserve).
  function usAba(v) {
    const d = dig(v);
    if (d.length !== 9) return false;
    const p = Number(d.slice(0, 2));
    return (p <= 12 || (p >= 21 && p <= 32) || (p >= 61 && p <= 72) || p === 80) && wsum(d, [3, 7, 1, 3, 7, 1, 3, 7, 1]) % 10 === 0;
  }
  const MBI_L = '[AC-HJKMNP-RT-Y]';
  const MBI_LD = '[AC-HJKMNP-RT-Y0-9]';
  extend('US', [
    D('us_itin', 'steuer', 'hoch', /\b9\d{2}[- ]?(?:5\d|6[0-5]|7\d|8[0-8]|9[0-24-9])[- ]?\d{4}\b/g, 'US individual taxpayer ID (ITIN)', 'ITIN (US)',
      { needsCtx: true, ctx: ['ITIN ', 'ITIN:', 'ITIN#', 'taxpayer', 'tax ID'] }),
    D('us_ein', 'firma', 'mittel', /\b\d{2}-\d{7}\b/g, 'US employer identification number (EIN)', 'EIN (US)',
      { valid: (v) => EIN_PRE.indexOf(v.slice(0, 2)) !== -1, needsCtx: true, ctx: ['EIN:', 'EIN#', 'EIN no', 'employer identification', 'FEIN', 'tax ID'] }),
    D('us_aba', 'finanz', 'mittel', /\b[0-3]\d{8}\b/g, 'US bank routing number (ABA)', 'Bankleitzahl ABA (US)',
      { valid: usAba, needsCtx: true, ctx: ['routing', 'ABA ', 'ABA:', 'RTN', 'transit number'] }),
    D('us_mbi', 'gesundheit', 'hoch', new RegExp('\\b[1-9]' + MBI_L + MBI_LD + '\\d-?' + MBI_L + MBI_LD + '\\d-?' + MBI_L + '{2}\\d{2}\\b', 'g'), 'US Medicare beneficiary identifier (MBI)', 'Medicare-Nummer MBI (US)',
      { needsCtx: true, ctxUnless: /-.*-/, ctx: ['Medicare', 'MBI ', 'MBI:', 'beneficiary'] }),
    D('us_pass', 'reise', 'hoch', /\b[A-Z]?\d{8,9}\b/g, 'US passport number', 'Passnummer (US)', { needsCtx: true, ctx: PASS_CTX }),
    D('us_dl', 'reise', 'hoch', /\b[A-Z]\d{7,12}\b/g, 'US driver license number', 'Führerscheinnummer (US)',
      { needsCtx: true, ctx: ["driver's license", 'drivers license', 'driver license', 'driving license', 'DL number', 'DL#', 'DMV'] }),
  ]);

  // CA: SIN/BN Luhn (ESDC/CRA); OHIP 10 Ziffern Luhn (Ontario MOH).
  const caSin = (v) => { const d = dig(v); return d.length === 9 && d[0] !== '8' && A.luhn(d); };
  const caBn = (v) => { const d = dig(v.slice(0, 11)); return d.length === 9 && A.luhn(d); };
  const ca10 = (v) => { const d = dig(v); return d.length === 10 && A.luhn(d); };
  DLX.registerPack({ id: 'CA', kind: 'country', detectors: [
    D('ca_sin', 'sozial', 'hoch', /\b[0-79]\d{2}[- ]?\d{3}[- ]?\d{3}\b/g, 'Canadian social insurance number (SIN)', 'SIN (CA)',
      { valid: caSin, needsCtx: true, ctx: ['SIN ', 'SIN:', 'SIN#', 'NAS:', 'social insurance', 'assurance sociale'] }),
    D('ca_bn', 'firma', 'mittel', /\b\d{5} ?\d{4}(?: ?(?:RT|RP|RC|RM|RR|RZ)\d{4})?\b/g, 'Canadian business number (BN)', 'Business Number (CA)',
      { valid: caBn, needsCtx: true, ctx: ['business number', 'numéro d’entreprise', "numéro d'entreprise", 'GST/HST'] }),
    D('ca_ohip', 'gesundheit', 'hoch', /\b\d{4}[- ]?\d{3}[- ]?\d{3}(?:[- ]?[A-Z]{2})?\b/g, 'Ontario health card number (OHIP)', 'Gesundheitskarte OHIP (CA)',
      { valid: (v) => ca10(v.replace(/[A-Z]+$/, '')), needsCtx: true, ctx: ['OHIP', 'health card', 'carte santé', 'health number'] }),
  ] });

  // BR: CNS 15 Ziffern, Summe Gewichte 15..1 mod 11 = 0 (Ministerio da Saude, DATASUS).
  function brCns(v) {
    const d = dig(v);
    if (d.length !== 15 || '12789'.indexOf(d[0]) === -1) return false;
    return wsum(d, [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) % 11 === 0;
  }
  extend('BR', [
    D('br_cns', 'gesundheit', 'hoch', /\b[1-2789]\d{2} ?\d{4} ?\d{4} ?\d{4}\b/g, 'Brazilian health card number (CNS)', 'Cartão Nacional de Saúde (BR)',
      { valid: brCns, needsCtx: true, ctx: ['CNS', 'cartão SUS', 'cartao SUS', 'Cartão Nacional de Saúde', 'cartao nacional de saude'] }),
  ]);

  // MX: CURP Gewichte 18..2 ueber Alphabet 0-9A-NÑ..Z, (10 - Summe mod 10) mod 10 (RENAPO);
  // RFC Gewichte 13..2, Alphabet mit & und Leerzeichen, Rest 10 -> A (SAT). Alte RFC ohne gueltige Ziffer -> nur mit Kontext.
  const CURP_A = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
  function mxCurp(v) {
    const s = v.toUpperCase();
    if (!date(1900 + Number(s.slice(4, 6)) + (/\d/.test(s[16]) ? 0 : 100), Number(s.slice(6, 8)), Number(s.slice(8, 10)))) return false;
    let sum = 0;
    for (let i = 0; i < 17; i++) sum += CURP_A.indexOf(s[i]) * (18 - i);
    return (10 - (sum % 10)) % 10 === at(s, 17);
  }
  const RFC_A = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ';
  function mxRfc(v) {
    const s = v.toUpperCase();
    const o = s.length - 9;
    if (!date(2000, Number(s.slice(o + 2, o + 4)), Number(s.slice(o + 4, o + 6)))) return false;
    const b = s.slice(0, -1).padStart(12, ' ');
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += RFC_A.indexOf(b[i]) * (13 - i);
    return RFC_A[(11 - (sum % 11)) % 11] === s[s.length - 1] ? true : 'ctx';
  }
  DLX.registerPack({ id: 'MX', kind: 'country', detectors: [
    D('mx_curp', 'id-national', 'hoch', /\b[A-Z][AEIOUX][A-Z]{2}\d{2}[01]\d[0-3]\d[HMX](?:AS|BC|BS|CC|CS|CH|CL|CM|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d\b/g,
      'Mexican population registry code (CURP)', 'CURP (MX)', { valid: mxCurp, ctx: ['CURP'] }),
    D('mx_rfc', 'steuer', 'hoch', /\b[A-Z&Ñ]{3,4}\d{2}[01]\d[0-3]\d[A-Z0-9]{2}[0-9A]\b/g, 'Mexican taxpayer ID (RFC)', 'RFC (MX)', { valid: mxRfc, ctx: ['RFC', 'registro federal'] }),
  ] });

  // AR: CUIT/CUIL Gewichte 5,4,3,2,7,6,5,4,3,2, 11 - Rest, 11 -> 0, 10 ungueltig (AFIP); DNI ohne Pruefziffer.
  const arCuit = (v) => { const d = dig(v); return d.length === 11 && ['20', '23', '24', '27', '30', '33', '34'].indexOf(d.slice(0, 2)) !== -1 && m11(d, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2], 10); };
  DLX.registerPack({ id: 'AR', kind: 'country', detectors: [
    D('ar_dni', 'id-national', 'hoch', /\b\d{1,2}\.?\d{3}\.?\d{3}\b/g, 'Argentine national ID (DNI)', 'DNI (AR)', { needsCtx: true, ctx: ['DNI', 'documento nacional', 'documento de identidad'] }),
    D('ar_cuit', 'steuer', 'hoch', /\b(?:20|23|24|27|30|33|34)-?\d{8}-?\d\b/g, 'Argentine tax ID (CUIT/CUIL)', 'CUIT/CUIL (AR)',
      { valid: arCuit, needsCtx: true, ctxUnless: /^\d{2}-\d{8}-\d$/, ctx: ['CUIT ', 'CUIT:', 'C.U.I.T', 'CUIL', 'AFIP'] }),
  ] });

  // CL: RUT/RUN Gewichte 2..7 von rechts, 11 - Rest, 11 -> 0, 10 -> K (SII).
  function clRut(v) {
    const s = up(v);
    if (!/^\d{7,8}[0-9K]$/.test(s)) return false;
    let sum = 0;
    for (let i = s.length - 2, k = 0; i >= 0; i--, k++) sum += at(s, i) * (2 + (k % 6));
    const c = 11 - (sum % 11);
    return (c === 11 ? '0' : c === 10 ? 'K' : String(c)) === s[s.length - 1];
  }
  DLX.registerPack({ id: 'CL', kind: 'country', detectors: [
    D('cl_rut', 'id-national', 'hoch', /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/g, 'Chilean tax / national ID (RUT/RUN)', 'RUT/RUN (CL)',
      { valid: clRut, needsCtx: true, ctxUnless: /^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/, ctx: ['RUT ', 'RUT:', 'R.U.T', 'RUN:', 'rol único', 'rol unico', 'cédula', 'cedula'] }),
  ] });

  // CO: NIT Primzahl-Gewichte 3,7,13,17,19,23,29,37,41,43,47,53,59,67,71 von rechts (DIAN); Cedula ohne Pruefziffer.
  const CO_W = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  function coNit(v) {
    const d = dig(v);
    if (d.length < 8 || d.length > 16) return false;
    let sum = 0;
    for (let i = d.length - 2, k = 0; i >= 0; i--, k++) sum += at(d, i) * CO_W[k];
    const r = sum % 11;
    return (r < 2 ? r : 11 - r) === at(d, d.length - 1);
  }
  DLX.registerPack({ id: 'CO', kind: 'country', detectors: [
    D('co_nit', 'steuer', 'mittel', /\b\d{3}\.?\d{3}\.?\d{3}-?\d\b/g, 'Colombian tax ID (NIT)', 'NIT (CO)', { valid: coNit, needsCtx: true, ctx: ['NIT ', 'NIT:', 'N.I.T', 'DIAN', 'identificación tributaria'] }),
    D('co_cc', 'id-national', 'hoch', /\b\d{1,3}(?:\.\d{3}){1,3}\b|\b\d{6,10}\b/g, 'Colombian citizen ID (cédula)', 'Cédula (CO)',
      { needsCtx: true, ctx: ['cédula', 'cedula', 'C.C.', 'ciudadanía', 'ciudadania'] }),
  ] });

  // ============================== Asien-Pazifik ==============================
  // IN: Aadhaar 12 Ziffern, erste 2-9, Verhoeff, kein Palindrom (UIDAI); PAN ohne Pruefziffer
  // (4. Zeichen = Inhaberart); GSTIN Luhn mod 36 (CBIC).
  function inAadhaar(v) {
    const d = dig(v);
    return d.length === 12 && d[0] >= '2' && d !== d.split('').reverse().join('') && verhoeff(d);
  }
  const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function inGstin(v) {
    const s = v.toUpperCase();
    let sum = 0;
    for (let i = 0; i < 14; i++) { const p = B36.indexOf(s[i]) * (i % 2 === 0 ? 1 : 2); sum += Math.floor(p / 36) + (p % 36); }
    return B36[(36 - (sum % 36)) % 36] === s[14];
  }
  DLX.registerPack({ id: 'IN', kind: 'country', detectors: [
    D('in_aadhaar', 'id-national', 'hoch', /\b[2-9]\d{3} ?\d{4} ?\d{4}\b/g, 'Indian Aadhaar number', 'Aadhaar-Nummer (IN)',
      { valid: inAadhaar, needsCtx: true, ctx: ['Aadhaar', 'Aadhar', 'UIDAI', 'आधार'] }),
    D('in_pan', 'steuer', 'hoch', /\b[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z]\b/g, 'Indian permanent account number (PAN)', 'PAN (IN)', { ctx: ['PAN', 'income tax', 'पैन'] }),
    D('in_gstin', 'firma', 'mittel', /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g, 'Indian GST number (GSTIN)', 'GSTIN (IN)', { valid: inGstin, ctx: ['GSTIN', 'GST'] }),
  ] });

  // CN: Buergernummer 18 Stellen, ISO 7064 MOD 11-2 (GB 11643-1999); USCC 18 Stellen, Mod 31 (GB 32100-2015).
  const cnRic = (v) => { const s = v.toUpperCase(); return date(Number(s.slice(6, 10)), Number(s.slice(10, 12)), Number(s.slice(12, 14))) && iso7064_11_2(s); };
  const USCC_A = '0123456789ABCDEFGHJKLMNPQRTUWXY';
  const USCC_W = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];
  function cnUscc(v) {
    const s = v.toUpperCase();
    let sum = 0;
    for (let i = 0; i < 17; i++) sum += USCC_A.indexOf(s[i]) * USCC_W[i];
    return USCC_A[(31 - (sum % 31)) % 31] === s[17];
  }
  DLX.registerPack({ id: 'CN', kind: 'country', detectors: [
    D('cn_ric', 'id-national', 'hoch', /\b[1-8]\d{5}(?:18|19|20)\d{2}[01]\d[0-3]\d{4}[\dXx](?![\dA-Za-z])/g, 'Chinese resident identity card number', 'Personalausweisnummer (CN)',
      { valid: cnRic, needsCtx: true, ctx: ['身份证', '身份证号', '公民身份号码', 'shenfenzheng', 'ID card'] }),
    D('cn_uscc', 'firma', 'mittel', /\b[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}\b/g, 'Chinese unified social credit code (USCC)', 'Sozialkreditcode USCC (CN)',
      { valid: cnUscc, needsCtx: true, ctx: ['统一社会信用代码', '信用代码', 'USCC', 'credit code'] }),
  ] });

  // JP: My Number 12 Ziffern, Gewichte von rechts n+1 (n<=6) bzw. n-5, Rest <= 1 -> 0 (Kabinettsverordnung);
  // Firmennummer 13 Ziffern, Pruefziffer vorne = 9 - (Summe Gewichte 1,2 von rechts) mod 9 (NTA).
  function jpMynum(v) {
    const d = dig(v);
    if (d.length !== 12) return false;
    let sum = 0;
    for (let n = 1; n <= 11; n++) sum += at(d, 11 - n) * (n <= 6 ? n + 1 : n - 5);
    const r = sum % 11;
    return (r <= 1 ? 0 : 11 - r) === at(d, 11);
  }
  function jpCn(v) {
    const d = dig(v);
    if (d.length !== 13) return false;
    let sum = 0;
    for (let n = 1; n <= 12; n++) sum += at(d, 13 - n) * (n % 2 === 1 ? 1 : 2);
    return 9 - (sum % 9) === at(d, 0);
  }
  DLX.registerPack({ id: 'JP', kind: 'country', detectors: [
    D('jp_mynum', 'id-national', 'hoch', /\b\d{4} ?\d{4} ?\d{4}\b/g, 'Japanese individual number (My Number)', 'My Number (JP)',
      { valid: jpMynum, needsCtx: true, ctx: ['マイナンバー', '個人番号', 'My Number', 'kojin bango'] }),
    D('jp_cn', 'firma', 'tief', /\b\d-?\d{4}-?\d{4}-?\d{4}\b/g, 'Japanese corporate number', 'Firmennummer (JP)',
      { valid: jpCn, needsCtx: true, ctx: ['法人番号', 'corporate number', 'hojin bango'] }),
  ] });

  // KR: RRN Gewichte 2..9,2..5, (11 - Rest) mod 10; seit Okt. 2020 ohne garantierte Pruefziffer -> nur Datum + Kontext.
  // BRN Gewichte 1,3,7,1,3,7,1,3,5 + floor(9. Ziffer x 5 / 10) (NTS).
  function krRrn(v) {
    const d = dig(v);
    if (d.length !== 13 || d[6] < '1' || d[6] > '8') return false;
    const y = (d[6] <= '2' || d[6] === '5' || d[6] === '6' ? 1900 : 2000) + Number(d.slice(0, 2));
    if (!date(y, Number(d.slice(2, 4)), Number(d.slice(4, 6)))) return false;
    return (11 - (wsum(d, [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]) % 11)) % 10 === at(d, 12) ? true : 'ctx';
  }
  function krBrn(v) {
    const d = dig(v);
    if (d.length !== 10) return false;
    const sum = wsum(d, [1, 3, 7, 1, 3, 7, 1, 3, 5]) + Math.floor(at(d, 8) * 5 / 10);
    return (10 - (sum % 10)) % 10 === at(d, 9);
  }
  DLX.registerPack({ id: 'KR', kind: 'country', detectors: [
    D('kr_rrn', 'id-national', 'hoch', /\b\d{2}[01]\d[0-3]\d-?[1-8]\d{6}\b/g, 'South Korean resident registration number', 'Resident Registration Number (KR)',
      { valid: krRrn, needsCtx: true, ctxUnless: /^\d{6}-\d{7}$/, ctx: ['주민등록번호', '주민번호', 'RRN', 'resident registration'] }),
    D('kr_brn', 'firma', 'tief', /\b\d{3}-?\d{2}-?\d{5}\b/g, 'South Korean business registration number', 'Geschäftsnummer (KR)',
      { valid: krBrn, needsCtx: true, ctx: ['사업자등록번호', '사업자번호', 'BRN', 'business registration'] }),
  ] });

  // SG: NRIC/FIN Gewichte 2,7,6,5,4,3,2, Offset T/G +4, M +3, Buchstabentabellen (ICA, oeffentlich dokumentiert);
  // M-Serie ohne gesicherte Tabelle -> nur mit Kontext. UEN: Unternehmen 8 Ziffern + Buchstabe, Firmen 9 Ziffern + Buchstabe (ACRA).
  function sgNric(v) {
    const s = v.toUpperCase();
    if (s[0] === 'M') return 'ctx';
    const r = (wsum(s, [2, 7, 6, 5, 4, 3, 2], 1) + (s[0] === 'T' || s[0] === 'G' ? 4 : 0)) % 11;
    return (s[0] === 'S' || s[0] === 'T' ? 'JZIHGFEDCBA' : 'XWUTRQPNMLK')[r] === s[8];
  }
  function sgUen(v) {
    const s = v.toUpperCase();
    if (/^\d{8}[A-Z]$/.test(s)) return 'XMKECAWLJDB'[wsum(s, [10, 4, 9, 3, 8, 2, 7, 1]) % 11] === s[8];
    if (/^\d{9}[A-Z]$/.test(s)) return 'ZKCMDNERGWH'[wsum(s, [10, 8, 6, 4, 9, 7, 5, 3, 1]) % 11] === s[9];
    return 'ctx';
  }
  DLX.registerPack({ id: 'SG', kind: 'country', detectors: [
    D('sg_nric', 'id-national', 'hoch', /\b[STFGM]\d{7}[A-Z]\b/g, 'Singapore NRIC / FIN', 'NRIC/FIN (SG)', { valid: sgNric, ctx: ['NRIC', 'FIN ', 'FIN:', 'IC number', 'identity card'] }),
    D('sg_uen', 'firma', 'tief', /\b(?:\d{8}[A-Z]|\d{9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])\b/g, 'Singapore unique entity number (UEN)', 'UEN (SG)',
      { valid: sgUen, needsCtx: true, ctx: ['UEN ', 'UEN:', 'ACRA', 'entity number'] }),
  ] });

  // AU: TFN Gewichte 1,4,3,7,5,8,6,9,10 (8-stellig 10,7,8,4,6,3,5,1) mod 11 = 0 (ATO);
  // Medicare Gewichte 1,3,7,9,1,3,7,9 mod 10 = 9. Ziffer (Services Australia, oeffentlich dokumentiert);
  // ABN erste Ziffer - 1, Gewichte 10,1,3,...,19 mod 89 = 0 (ABR).
  function auTfn(v) {
    const d = dig(v);
    if (d.length === 9) return wsum(d, [1, 4, 3, 7, 5, 8, 6, 9, 10]) % 11 === 0;
    return d.length === 8 && wsum(d, [10, 7, 8, 4, 6, 3, 5, 1]) % 11 === 0;
  }
  const auMedicare = (v) => { const d = dig(v); return (d.length === 10 || d.length === 11) && d[0] >= '2' && d[0] <= '6' && wsum(d, [1, 3, 7, 9, 1, 3, 7, 9]) % 10 === at(d, 8); };
  const auAbn = (v) => { const d = dig(v); return d.length === 11 && (wsum(d, [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]) - 10) % 89 === 0; };
  DLX.registerPack({ id: 'AU', kind: 'country', detectors: [
    D('au_tfn', 'steuer', 'hoch', /\b\d{3} ?\d{3} ?\d{2,3}\b/g, 'Australian tax file number (TFN)', 'Tax File Number (AU)', { valid: auTfn, needsCtx: true, ctx: ['TFN', 'tax file number', 'Australian Taxation Office'] }),
    D('au_medicare', 'gesundheit', 'hoch', /\b[2-6]\d{3} ?\d{5} ?\d(?:[- ]?\d)?\b/g, 'Australian Medicare number', 'Medicare-Nummer (AU)',
      { valid: auMedicare, needsCtx: true, ctx: ['Medicare', 'medicare card'] }),
    D('au_abn', 'firma', 'tief', /\b\d{2} ?\d{3} ?\d{3} ?\d{3}\b/g, 'Australian business number (ABN)', 'ABN (AU)', { valid: auAbn, needsCtx: true, ctx: ['ABN ', 'ABN:', 'business number'] }),
  ] });

  // NZ: IRD 8-9 Ziffern, Bereich 10-150 Mio., Gewichte 3,2,7,6,5,4,3,2 bzw. 7,4,3,2,5,2,7,6 (IRD);
  // NHI altes Format AAANNNN Mod 11 (Te Whatu Ora, HISO 10046); neues Format AAANNAA nur mit Kontext.
  function nzIrd(v) {
    const d = dig(v).padStart(9, '0');
    if (d.length !== 9 || Number(d) < 10000000 || Number(d) > 150000000) return false;
    for (const w of [[3, 2, 7, 6, 5, 4, 3, 2], [7, 4, 3, 2, 5, 2, 7, 6]]) {
      const r = wsum(d, w) % 11;
      const c = r === 0 ? 0 : 11 - r;
      if (c !== 10) return c === at(d, 8);
    }
    return false;
  }
  const NHI_A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  function nzNhi(v) {
    const s = v.toUpperCase();
    if (!/^[A-Z]{3}\d{4}$/.test(s)) return 'ctx';
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += (i < 3 ? NHI_A.indexOf(s[i]) + 1 : at(s, i)) * (7 - i);
    const c = 11 - (sum % 11);
    return c !== 11 && c % 10 === at(s, 6);
  }
  DLX.registerPack({ id: 'NZ', kind: 'country', detectors: [
    D('nz_ird', 'steuer', 'hoch', /\b\d{2,3}-?\d{3}-?\d{3}\b/g, 'New Zealand IRD number', 'IRD-Nummer (NZ)', { valid: nzIrd, needsCtx: true, ctx: ['IRD number', 'IRD no', 'IRD:', 'tax number', 'Inland Revenue'] }),
    D('nz_nhi', 'gesundheit', 'hoch', /\b[A-HJ-NP-Z]{3}\d{2}(?:\d{2}|[A-HJ-NP-Z]{2})\b/g, 'New Zealand national health index (NHI)', 'NHI-Nummer (NZ)',
      { valid: nzNhi, needsCtx: true, ctx: ['NHI', 'health index'] }),
  ] });

  // ============================ Afrika und Nahost =============================
  // ZA: ID JJMMTT SSSS C A Z, Luhn (Home Affairs); Steuernummer 10 Ziffern Luhn (SARS).
  const zaId = (v) => { const d = dig(v); return d.length === 13 && date(2000, Number(d.slice(2, 4)), Number(d.slice(4, 6))) && A.luhn(d); };
  const zaTin = (v) => { const d = dig(v); return d.length === 10 && A.luhn(d); };
  DLX.registerPack({ id: 'ZA', kind: 'country', detectors: [
    D('za_id', 'id-national', 'hoch', /\b\d{2}[01]\d[0-3]\d ?\d{4} ?[01][89]\d\b/g, 'South African ID number', 'ID-Nummer (ZA)',
      { valid: zaId, needsCtx: true, ctx: ['ID number', 'identity number', 'ID no', 'Home Affairs'] }),
    D('za_tin', 'steuer', 'hoch', /\b[01239]\d{9}\b/g, 'South African tax reference number', 'Steuernummer (ZA)', { valid: zaTin, needsCtx: true, ctx: ['tax reference', 'SARS', 'income tax number'] }),
  ] });

  // TR: TCKN zwei Pruefziffern (Nufus): d10 = (7 x ungerade - gerade) mod 10, d11 = Summe mod 10;
  // VKN 10 Ziffern (GIB): (Ziffer + 9 - i) mod 10, x 2^(9-i) mod 9 (0 -> 9), Summe -> (10 - mod 10) mod 10.
  function trTckn(v) {
    const d = dig(v);
    if (d.length !== 11 || d[0] === '0') return false;
    const odd = at(d, 0) + at(d, 2) + at(d, 4) + at(d, 6) + at(d, 8);
    const even = at(d, 1) + at(d, 3) + at(d, 5) + at(d, 7);
    if ((((odd * 7 - even) % 10) + 10) % 10 !== at(d, 9)) return false;
    return (odd + even + at(d, 9)) % 10 === at(d, 10);
  }
  function trVkn(v) {
    const d = dig(v);
    if (d.length !== 10) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      const c1 = (at(d, i) + 9 - i) % 10;
      let c2 = (c1 * Math.pow(2, 9 - i)) % 9;
      if (c1 !== 0 && c2 === 0) c2 = 9;
      sum += c2;
    }
    return (10 - (sum % 10)) % 10 === at(d, 9);
  }
  DLX.registerPack({ id: 'TR', kind: 'country', detectors: [
    D('tr_tckn', 'id-national', 'hoch', /\b[1-9]\d{10}\b/g, 'Turkish ID number (TCKN)', 'T.C. Kimlik No (TR)',
      { valid: trTckn, needsCtx: true, ctx: ['TC kimlik', 'T.C. kimlik', 'kimlik no', 'kimlik numarası', 'TCKN'] }),
    D('tr_vkn', 'steuer', 'mittel', /\b\d{10}\b/g, 'Turkish tax number (VKN)', 'Vergi Kimlik No (TR)', { valid: trVkn, needsCtx: true, ctx: ['vergi numarası', 'vergi numarasi', 'vergi kimlik', 'VKN'] }),
  ] });

  // IL: Teudat Zehut 9 Ziffern (links mit 0 aufgefuellt), Luhn (Rashut HaOchlusin).
  const ilTz = (v) => { const d = dig(v); return d.length >= 5 && d.length <= 9 && A.luhn(d.padStart(9, '0')); };
  DLX.registerPack({ id: 'IL', kind: 'country', detectors: [
    D('il_tz', 'id-national', 'hoch', /\b\d{9}\b/g, 'Israeli ID number (Teudat Zehut)', 'Teudat Zehut (IL)',
      { valid: ilTz, needsCtx: true, ctx: ['תעודת זהות', 'ת.ז', 'teudat zehut', 'mispar zehut', 'ID number'] }),
  ] });

  // AE: Emirates ID 784-JJJJ-NNNNNNN-C, Luhn (ICP); SA: 10 Ziffern, 1 Buerger / 2 Ansaessige, Luhn
  // (oeffentlich dokumentiert); NG: NIN/BVN ohne Pruefziffer.
  const ae = (v) => { const d = dig(v); return d.length === 15 && A.luhn(d); };
  DLX.registerPack({ id: 'AE', kind: 'country', detectors: [
    D('ae_eid', 'id-national', 'hoch', /\b784-?(?:19|20)\d{2}-?\d{7}-?\d\b/g, 'UAE Emirates ID number', 'Emirates ID (AE)',
      { valid: ae, needsCtx: true, ctxUnless: /^784-\d{4}-\d{7}-\d$/, ctx: ['Emirates ID', 'EID:', 'EID no', 'هوية', 'identity card'] }),
  ] });
  DLX.registerPack({ id: 'SA', kind: 'country', detectors: [
    D('sa_nid', 'id-national', 'hoch', /\b[12]\d{9}\b/g, 'Saudi national ID / Iqama number', 'National ID / Iqama (SA)',
      { valid: (v) => A.luhn(v), needsCtx: true, ctx: ['national ID', 'Iqama', 'إقامة', 'هوية', 'الهوية الوطنية', 'السجل المدني'] }),
  ] });
  DLX.registerPack({ id: 'NG', kind: 'country', detectors: [
    D('ng_nin', 'id-national', 'hoch', /\b\d{11}\b/g, 'Nigerian national identification number (NIN)', 'NIN (NG)', { needsCtx: true, ctx: ['NIN ', 'NIN:', 'NIMC', 'national identification number'] }),
    D('ng_bvn', 'finanz', 'hoch', /\b22\d{9}\b/g, 'Nigerian bank verification number (BVN)', 'BVN (NG)', { needsCtx: true, ctx: ['BVN', 'bank verification'] }),
  ] });

  // ================================ EU-weit ===================================
  // EHIC: 20 Ziffern, ISO/IEC 7812 Praefix 80 + Laendercode, Luhn (Beschluss S2 der Verwaltungskommission).
  extend('EU', [
    D('ehic', 'gesundheit', 'hoch', /\b80\d{18}\b/g, 'European health insurance card number (EHIC)', 'Europäische Krankenversicherungskarte (EKVK)',
      { valid: (v) => A.luhn(v), needsCtx: true, ctx: ['EHIC', 'EKVK', 'CEAM', 'Krankenversicherungskarte', 'health insurance card', 'tessera sanitaria', 'carte européenne'] }),
    D('eu_dl', 'reise', 'hoch', /\b(?=[A-Z]{0,15}\d)[A-Z0-9]{5,16}\b/g, 'Driving licence number', 'Führerscheinnummer',
      { needsCtx: true, ctx: ['Führerschein', 'Fuehrerschein', 'Fahrausweis', 'permis de conduire', 'patente di guida', 'licenza di guida', 'permiso de conducir', 'carta de condução', 'rijbewijs', 'körkort', 'kørekort', 'førerkort', 'prawo jazdy', 'řidičský průkaz', 'driving licence', 'driving license', "driver's license"] }),
  ]);

  // EU-USt-Dispatcher: Laender mit eigenem Validator pruefen statt nur Kontext.
  const vatOf = (fn) => (rest) => fn('XX' + rest);
  Object.assign(DLX.EU_VAT_DISPATCH, {
    BG: (r) => bgVat(r), CY: (r) => cyVat(r), CZ: (r) => czDic(r), DK: (r) => dkCvr(r), EE: (r) => eeKmkr(r), EL: (r) => grAfm(r),
    ES: vatOf(esVat), FI: (r) => fiYt(r), HR: (r) => hrOib(r), HU: (r) => huVat(r), IE: vatOf(ieVat), LT: (r) => ltPvm(r), LU: (r) => luTva(r),
    LV: (r) => lvPvn(r), MT: (r) => mtVat(r), PL: (r) => plNip(r), PT: (r) => ptNif(r), RO: (r) => roCui(r), SE: (r) => seVat(r), SI: (r) => siDdv(r), SK: (r) => skDph(r),
  });

  // =========================== Globale Ergaenzungen ===========================
  const C = DLX.cards;
  // Weitere Kartenarten melden nur mit dem Markennamen als Kontextwort: ihre IIN-Bereiche treffen
  // sonst zu viele zufaellige Zahlen, auch neben "Karte"/"card" (Fehlalarm-Messung 14.10.2026).
  // Base58Check (Bitcoin-Adresse P2PKH/P2SH): 25 Byte, Pruefsumme = erste 4 Byte von
  // SHA-256(SHA-256(Nutzlast)). SHA-256 nur als Pruefsumme, nicht fuer Sicherheitszwecke.
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function base58check(v) {
    const bytes = new Uint8Array(25);
    for (const ch of v) {
      let c = B58.indexOf(ch);
      if (c < 0) return false;
      for (let i = 24; i >= 0; i--) { c += bytes[i] * 58; bytes[i] = c & 255; c >>= 8; }
      if (c) return false;
    }
    if (bytes[0] !== 0 && bytes[0] !== 5) return false;
    // dialog.html/wissen.html laden dictionary.js nicht: dann nur mit Kontextwort, nie abbrechen.
    if (!DLX.dictionary || !DLX.dictionary.sha256Words || !DLX.dictionary.wordsBytes) return 'ctx';
    const h =DLX.dictionary.sha256Words(DLX.dictionary.wordsBytes(DLX.dictionary.sha256Words(bytes.subarray(0, 21))));
    return h[0] === ((bytes[21] << 24) | (bytes[22] << 16) | (bytes[23] << 8) | bytes[24]) >>> 0;
  }
  // Bech32/Bech32m (BIP-173, BIP-350): Polymod ueber hrp + Daten, Konstante 1 bzw. 0x2bc830a3.
  const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  function bech32(v) {
    const s = v.toLowerCase();
    if (s !== v && v.toUpperCase() !== v) return false;
    const vals = [3, 3, 0, 2, 3];   // hrp "bc" erweitert: [b>>5, c>>5, 0, b&31, c&31]
    for (const ch of s.slice(3)) { const x = B32.indexOf(ch); if (x < 0) return false; vals.push(x); }
    let chk = 1;
    for (const x of vals) {
      const b = chk >>> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ x;
      for (let i = 0; i < 5; i++) if ((b >>> i) & 1) chk ^= GEN[i];
    }
    chk >>>= 0;
    return chk === 1 || chk === 0x2bc830a3;
  }
  // LEI: ISO 17442, ISO 7064 MOD 97-10 ueber alle 20 Zeichen.
  const lei = (v) => A.mod97(v.toUpperCase());
  extend('finance', [
    D('cc_disc', 'finanz', 'hoch', C.CARD_RE(), 'Discover card number', 'Discover-Kartennummer',
      { valid: C.card((d) => /^(?:6011|65|64[4-9])/.test(d), [16, 19]), needsCtx: true, ctx: ['Discover'] }),
    D('cc_diners', 'finanz', 'hoch', C.CARD_RE(), 'Diners Club card number', 'Diners-Club-Kartennummer',
      { valid: C.card((d) => /^(?:30[0-5]|3095|36|38|39)/.test(d), [14, 16, 19]), needsCtx: true, ctx: ['Diners'] }),
    D('cc_jcb', 'finanz', 'hoch', C.CARD_RE(), 'JCB card number', 'JCB-Kartennummer',
      { valid: C.card((d) => { const p = Number(d.slice(0, 4)); return p >= 3528 && p <= 3589; }, [16, 19]), needsCtx: true, ctx: ['JCB'] }),
    D('cc_cup', 'finanz', 'hoch', C.CARD_RE(), 'UnionPay card number', 'UnionPay-Kartennummer',
      { valid: C.card((d) => d.startsWith('62'), [16, 17, 18, 19]), needsCtx: true, ctx: ['UnionPay', '银联'] }),
    D('cc_maestro', 'finanz', 'hoch', C.CARD_RE(), 'Maestro debit card number', 'Maestro-Kartennummer',
      { valid: C.card((d) => /^(?:5018|5020|5038|5893|6304|6759|676[1-3])/.test(d), [12, 13, 14, 15, 16, 17, 18, 19]), needsCtx: true, ctx: ['Maestro', 'Debitkarte', 'EC-Karte'] }),
    D('bic', 'finanz', 'tief', /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g, 'Bank identifier code (BIC/SWIFT)', 'BIC/SWIFT-Code',
      { needsCtx: true, ctx: ['BIC ', 'BIC:', 'SWIFT'] }),
    D('lei', 'firma', 'tief', /\b[A-Z0-9]{18}\d{2}\b/g, 'Legal entity identifier (LEI)', 'LEI', { valid: lei, needsCtx: true, ctxUnless: /[A-Z]/, ctx: ['LEI ', 'LEI:', 'legal entity identifier'] }),
    D('duns', 'firma', 'tief', /\b\d{2}-?\d{3}-?\d{4}\b/g, 'DUNS number', 'DUNS-Nummer', { needsCtx: true, ctx: ['DUNS ', 'DUNS:', 'D-U-N-S', 'Dun & Bradstreet', 'Dun and Bradstreet'] }),
    D('btc_legacy', 'finanz', 'mittel', /\b[13][1-9A-HJ-NP-Za-km-z]{25,34}\b/g, 'Bitcoin address (legacy)', 'Bitcoin-Adresse (Legacy)', { valid: base58check, ctx: ['Bitcoin', 'BTC', 'wallet'] }),
    D('btc_bech32', 'finanz', 'mittel', /\b(?:bc1|BC1)[ac-hj-np-zAC-HJ-NP-Z02-9]{11,71}\b/g, 'Bitcoin address (bech32)', 'Bitcoin-Adresse (bech32)', { valid: bech32, ctx: ['Bitcoin', 'BTC', 'wallet'] }),
    // EIP-55 braucht Keccak-256 -> keine Pruefung der Gross-/Kleinschreibung, nur mit Kontext.
    D('eth_addr', 'finanz', 'mittel', /\b0x[a-fA-F0-9]{40}\b/g, 'Ethereum address', 'Ethereum-Adresse',
      { needsCtx: true, ctx: ['Ethereum', 'ETH ', 'ETH:', 'wallet', 'ERC-20', 'ERC20', 'MetaMask'] }),
  ]);

  // IPv6: nur globale Unicast-Adressen 2000::/3 ausser Dokumentation 2001:db8::/32 (RFC 4291, RFC 3849).
  function ipv6(v) {
    const parts = v.split('::');
    if (parts.length > 2) return false;
    const groups = (x) => (x ? x.split(':') : []);
    const a = groups(parts[0]); const b = parts.length === 2 ? groups(parts[1]) : [];
    const n = a.length + b.length;
    if (parts.length === 2 ? n > 7 : n !== 8) return false;
    if (n < 3 || !a.concat(b).every((x) => /^[0-9A-Fa-f]{1,4}$/.test(x))) return false;
    const first = parseInt(a[0], 16);
    if (a[0].length !== 4 || first < 0x2000 || first > 0x3fff) return false;
    return !(first === 0x2001 && a.length > 1 && parseInt(a[1], 16) === 0xdb8);
  }
  // MAC (IEEE 802 EUI-48): gleiches Trennzeichen durchgehend.
  const mac = (v) => v.indexOf(':') === -1 || v.indexOf('-') === -1;
  extend('secrets', [
    D('twilio', 'technik', 'hoch', /\b(?:SK|AC)[0-9a-f]{32}\b/g, 'Twilio API key / account SID', 'Twilio-Schlüssel'),
    D('hf_token', 'technik', 'hoch', /\bhf_[A-Za-z]{34}\b/g, 'Hugging Face token', 'Hugging-Face-Token'),
    D('npm_token', 'technik', 'hoch', /\bnpm_[A-Za-z0-9]{36}\b/g, 'npm access token', 'npm-Token'),
    D('ipv6', 'technik', 'tief', /(?<![0-9A-Fa-f:.])[23][0-9A-Fa-f]{3}:[0-9A-Fa-f:]{2,35}(?![0-9A-Fa-f:.])/g, 'Public IPv6 address', 'Öffentliche IPv6-Adresse',
      { valid: ipv6, fmtOnly: true, ctx: ['IPv6', 'IP ', 'IP:', 'Server', 'Host'] }),
    D('mac', 'technik', 'tief', /\b[0-9A-Fa-f]{2}[:-][0-9A-Fa-f]{2}[:-][0-9A-Fa-f]{2}[:-][0-9A-Fa-f]{2}[:-][0-9A-Fa-f]{2}[:-][0-9A-Fa-f]{2}\b/g, 'MAC address', 'MAC-Adresse',
      { valid: mac, fmtOnly: true, ctx: ['MAC', 'Hardware-Adresse', 'physical address', 'adresse physique'] }),
    D('hostname_int', 'technik', 'tief', /\\\\[A-Za-z0-9._-]{1,63}\\[^\s\\"'<>]{1,200}|\b[a-z0-9-]{1,63}\.(?:local|lan|corp|internal|intra|intranet)\b/g, 'Internal host name / UNC path', 'Interner Hostname / UNC-Pfad',
      { ctx: ['Server', 'Share', 'Freigabe', 'Laufwerk', 'host'] }),
  ]);

  // --- Weitere Geheimnisse und Kennungen ------------------------------------------
  // Fuellwerte fallen wie bei den Anbieter-Schluesseln heraus (Platzhalter, Entropie unter 3 Bit).
  const V = DLX.validators;
  const random = (v) => !V.isPlaceholder(v) && V.entropy(v) >= 3;
  // Bearer-Token: zufaellig wirkender Wert mit Ziffer und Buchstabe (kein Wort nach "Bearer").
  // Werte in JWT-Form prueft allein der Detektor jwt (Struktur), sonst meldete ein Beispiel-JWT hier.
  const bearer = (v) => !/^eyJ/.test(v) && random(v) && /\d/.test(v) && /[A-Za-z]/.test(v);
  // Passwort im Fliesstext ("Passwort ist ..."): Satzzeichen am Ende gehoeren nicht zum Wert.
  // Ein Wert zaehlt mit drei von vier Zeichenarten (klein, gross, Ziffer, Sonderzeichen) oder
  // mit Ziffer und Buchstabe ab 8 Zeichen; Angaben wie "12-stellig" oder "8 characters" nicht.
  const PW_UNIT = /^\d{1,3}[-. ]?(?:stellig|zeichen|digits?|characters?|chars?|caract[eè]res?|caratteri|caracteres|bit|bytes?)\b/i;
  function prosePassword(v) {
    if (V.isPlaceholder(v)) return false;   // auch die eigene Ausgabe [Kategorie] bzw. [TYP_n]
    const s = v.replace(/[.,;:!?)\]]+$/, '');
    if (s.length < 6 || V.isPlaceholder(s) || PW_UNIT.test(s) || new Set(s).size < 4) return false;
    const digit = /\d/.test(s), letter = /\p{L}/u.test(s);
    const kinds = (/\p{Ll}/u.test(s) ? 1 : 0) + (/\p{Lu}/u.test(s) ? 1 : 0) + (digit ? 1 : 0) + (/[^\p{L}\p{N}]/u.test(s) ? 1 : 0);
    if (!(kinds >= 3 || (digit && letter && s.length >= 8))) return false;
    return s.length;
  }
  // Fahrzeug-Identifizierungsnummer (ISO 3779): 17 Zeichen ohne I, O, Q; Buchstaben und Ziffern
  // gemischt. Die Pruefziffer an Stelle 9 gilt nur in Nordamerika, deshalb nur mit Kontextwort.
  const vin = (v) => /[A-Z]/.test(v) && /\d/.test(v);
  // Zahlungsreferenz RF (ISO 11649): ISO 7064 MOD 97-10 mit "RFnn" am Ende.
  function rfRef(v) {
    const c = A.compact(v);
    return c.length >= 5 && c.length <= 25 && A.mod97(c.slice(4) + c.slice(0, 4));
  }
  extend('secrets', [
    D('bearer_token', 'technik', 'hoch', /(?<![A-Za-z0-9_-])Bearer[ \t]{1,3}(?<v>[A-Za-z0-9._~+/-]{20,2000}={0,2})(?![A-Za-z0-9._~+/=-])/dgi, 'Bearer token (Authorization header)', 'Bearer-Token (Authorization-Kopfzeile)',
      { group: 'v', valid: bearer, pre: /bearer/i }),
    D('prose_password', 'technik', 'hoch',
      /(?<![\p{L}\p{N}_])(?:passwor[dt]|kennwort|passcode|mot de passe|contrase(?:ñ|n)a|senha|password)[ \t]{1,3}(?:ist|lautet|war|is|was|est|era|es|[èé])[ \t]{1,3}(?:(?:jetzt|neu|nun|now|maintenant|ahora|agora|ora)[ \t]{1,3})?["'„“«]?(?<v>[^\s"'“”»]{6,100})/dgiu,
      'Password in a sentence', 'Passwort im Fliesstext', { group: 'v', valid: prosePassword, pre: /passwor|kennwort|passcode|mot de passe|contrase|senha/i }),
    D('openrouter_key', 'technik', 'hoch', /\bsk-or-v1-[a-f0-9]{64}\b/g, 'OpenRouter API key', 'OpenRouter-API-Schlüssel', { valid: random, pre: /sk-or-v1-/ }),
    D('replicate_token', 'technik', 'hoch', /\br8_[A-Za-z0-9]{37}\b/g, 'Replicate API token', 'Replicate-API-Token', { valid: random, pre: /r8_/ }),
    D('azdo_pat', 'technik', 'hoch', /\b[A-Za-z0-9]{76}AZDO[A-Za-z0-9]{4}\b/g, 'Azure DevOps personal access token', 'Azure-DevOps-Zugriffstoken', { valid: random, pre: /AZDO/ }),
    D('crypto_privkey', 'finanz', 'hoch',
      /(?<![A-Za-z0-9])(?:private[ _-]?key|privkey|secret[ _-]?key|privater[ _-]schl(?:ü|ue)ssel)["']?[ \t]{0,3}[:=]?[ \t]{0,3}["']?(?:0x)?(?<v>[0-9a-fA-F]{64})(?![0-9a-fA-F])/dgi,
      'Private key (hex, e.g. crypto wallet)', 'Privater Schlüssel (Hex, z. B. Krypto-Wallet)', { group: 'v', valid: random, pre: /key|schl/i }),
  ]);
  extend('finance', [
    D('rf_ref', 'finanz', 'tief', /\bRF\d{2}(?: ?[A-Z0-9]{4}){0,5}(?: ?[A-Z0-9]{1,4})\b/g, 'Creditor reference (RF)', 'Zahlungsreferenz (RF)', { valid: rfRef }),
  ]);
  extend('travel', [
    D('vin', 'reise', 'mittel', /\b[A-HJ-NPR-Z0-9]{17}\b/g, 'Vehicle identification number (VIN)', 'Fahrzeug-Identifizierungsnummer (FIN)',
      { valid: vin, needsCtx: true, ctx: ['VIN', 'FIN ', 'FIN:', 'FIN-', 'Fahrgestell', 'Fahrzeug-Ident', 'Fahrzeugident', 'chassis', 'châssis', 'telaio', 'bastidor', 'vehicle identification'] }),
  ]);

  // --- Wallet-Wiederherstellungsphrase (BIP-39) -----------------------------------
  // Englische Wortliste aus BIP-39 (2048 Woerter, unveraendert; Pruefsumme der Liste im Test).
  // Ein Fund braucht 12, 15, 18, 21 oder 24 Listenwoerter in Folge mit gueltiger Pruefsumme
  // (die letzten Bits sind der Anfang von SHA-256 ueber die Entropie): zufaellige Wortfolgen
  // bestehen das hoechstens in 1 von 16 Faellen, und gewoehnlicher Text enthaelt nie zwoelf
  // Listenwoerter in Folge (the, and, of, to fehlen in der Liste).
  const BIP39 = (
    'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual ' +
    'adapt add addict address adjust admit adult advance advice aerobic affair afford afraid again age agent agree ahead aim air airport aisle alarm album ' +
    'alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount amused analyst anchor ancient anger angle angry ' +
    'animal ankle announce annual another answer antenna antique anxiety any apart apology appear apple approve april arch arctic area arena argue arm armed armor ' +
    'army around arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete atom attack attend attitude attract auction ' +
    'audit august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward axis baby bachelor bacon badge bag balance balcony ball ' +
    'bamboo banana banner bar barely bargain barrel base basic basket battle beach bean beauty because become beef before begin behave behind believe below belt ' +
    'bench benefit best betray better between beyond bicycle bid bike bind biology bird birth bitter black blade blame blanket blast bleak bless blind blood ' +
    'blossom blouse blue blur blush board boat body boil bomb bone bonus book boost border boring borrow boss bottom bounce box boy bracket brain ' +
    'brand brass brave bread breeze brick bridge brief bright bring brisk broccoli broken bronze broom brother brown brush bubble buddy budget buffalo build bulb ' +
    'bulk bullet bundle bunker burden burger burst bus business busy butter buyer buzz cabbage cabin cable cactus cage cake call calm camera camp can ' +
    'canal cancel candy cannon canoe canvas canyon capable capital captain car carbon card cargo carpet carry cart case cash casino castle casual cat catalog ' +
    'catch category cattle caught cause caution cave ceiling celery cement census century cereal certain chair chalk champion change chaos chapter charge chase chat cheap ' +
    'check cheese chef cherry chest chicken chief child chimney choice choose chronic chuckle chunk churn cigar cinnamon circle citizen city civil claim clap clarify ' +
    'claw clay clean clerk clever click client cliff climb clinic clip clock clog close cloth cloud clown club clump cluster clutch coach coast coconut ' +
    'code coffee coil coin collect color column combine come comfort comic common company concert conduct confirm congress connect consider control convince cook cool copper ' +
    'copy coral core corn correct cost cotton couch country couple course cousin cover coyote crack cradle craft cram crane crash crater crawl crazy cream ' +
    'credit creek crew cricket crime crisp critic crop cross crouch crowd crucial cruel cruise crumble crunch crush cry crystal cube culture cup cupboard curious ' +
    'current curtain curve cushion custom cute cycle dad damage damp dance danger daring dash daughter dawn day deal debate debris decade december decide decline ' +
    'decorate decrease deer defense define defy degree delay deliver demand demise denial dentist deny depart depend deposit depth deputy derive describe desert design desk ' +
    'despair destroy detail detect develop device devote diagram dial diamond diary dice diesel diet differ digital dignity dilemma dinner dinosaur direct dirt disagree discover ' +
    'disease dish dismiss disorder display distance divert divide divorce dizzy doctor document dog doll dolphin domain donate donkey donor door dose double dove draft ' +
    'dragon drama drastic draw dream dress drift drill drink drip drive drop drum dry duck dumb dune during dust dutch duty dwarf dynamic eager ' +
    'eagle early earn earth easily east easy echo ecology economy edge edit educate effort egg eight either elbow elder electric elegant element elephant elevator ' +
    'elite else embark embody embrace emerge emotion employ empower empty enable enact end endless endorse enemy energy enforce engage engine enhance enjoy enlist enough ' +
    'enrich enroll ensure enter entire entry envelope episode equal equip era erase erode erosion error erupt escape essay essence estate eternal ethics evidence evil ' +
    'evoke evolve exact example excess exchange excite exclude excuse execute exercise exhaust exhibit exile exist exit exotic expand expect expire explain expose express extend ' +
    'extra eye eyebrow fabric face faculty fade faint faith fall false fame family famous fan fancy fantasy farm fashion fat fatal father fatigue fault ' +
    'favorite feature february federal fee feed feel female fence festival fetch fever few fiber fiction field figure file film filter final find fine finger ' +
    'finish fire firm first fiscal fish fit fitness fix flag flame flash flat flavor flee flight flip float flock floor flower fluid flush fly ' +
    'foam focus fog foil fold follow food foot force forest forget fork fortune forum forward fossil foster found fox fragile frame frequent fresh friend ' +
    'fringe frog front frost frown frozen fruit fuel fun funny furnace fury future gadget gain galaxy gallery game gap garage garbage garden garlic garment ' +
    'gas gasp gate gather gauge gaze general genius genre gentle genuine gesture ghost giant gift giggle ginger giraffe girl give glad glance glare glass ' +
    'glide glimpse globe gloom glory glove glow glue goat goddess gold good goose gorilla gospel gossip govern gown grab grace grain grant grape grass ' +
    'gravity great green grid grief grit grocery group grow grunt guard guess guide guilt guitar gun gym habit hair half hammer hamster hand happy ' +
    'harbor hard harsh harvest hat have hawk hazard head health heart heavy hedgehog height hello helmet help hen hero hidden high hill hint hip ' +
    'hire history hobby hockey hold hole holiday hollow home honey hood hope horn horror horse hospital host hotel hour hover hub huge human humble ' +
    'humor hundred hungry hunt hurdle hurry hurt husband hybrid ice icon idea identify idle ignore ill illegal illness image imitate immense immune impact impose ' +
    'improve impulse inch include income increase index indicate indoor industry infant inflict inform inhale inherit initial inject injury inmate inner innocent input inquiry insane ' +
    'insect inside inspire install intact interest into invest invite involve iron island isolate issue item ivory jacket jaguar jar jazz jealous jeans jelly jewel ' +
    'job join joke journey joy judge juice jump jungle junior junk just kangaroo keen keep ketchup key kick kid kidney kind kingdom kiss kit ' +
    'kitchen kite kitten kiwi knee knife knock know lab label labor ladder lady lake lamp language laptop large later latin laugh laundry lava law ' +
    'lawn lawsuit layer lazy leader leaf learn leave lecture left leg legal legend leisure lemon lend length lens leopard lesson letter level liar liberty ' +
    'library license life lift light like limb limit link lion liquid list little live lizard load loan lobster local lock logic lonely long loop ' +
    'lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics machine mad magic magnet maid mail main major make mammal man manage ' +
    'mandate mango mansion manual maple marble march margin marine market marriage mask mass master match material math matrix matter maximum maze meadow mean measure ' +
    'meat mechanic medal media melody melt member memory mention menu mercy merge merit merry mesh message metal method middle midnight milk million mimic mind ' +
    'minimum minor minute miracle mirror misery miss mistake mix mixed mixture mobile model modify mom moment monitor monkey monster month moon moral more morning ' +
    'mosquito mother motion motor mountain mouse move movie much muffin mule multiply muscle museum mushroom music must mutual myself mystery myth naive name napkin ' +
    'narrow nasty nation nature near neck need negative neglect neither nephew nerve nest net network neutral never news next nice night noble noise nominee ' +
    'noodle normal north nose notable note nothing notice novel now nuclear number nurse nut oak obey object oblige obscure observe obtain obvious occur ocean ' +
    'october odor off offer office often oil okay old olive olympic omit once one onion online only open opera opinion oppose option orange orbit ' +
    'orchard order ordinary organ orient original orphan ostrich other outdoor outer output outside oval oven over own owner oxygen oyster ozone pact paddle page ' +
    'pair palace palm panda panel panic panther paper parade parent park parrot party pass patch path patient patrol pattern pause pave payment peace peanut ' +
    'pear peasant pelican pen penalty pencil people pepper perfect permit person pet phone photo phrase physical piano picnic picture piece pig pigeon pill pilot ' +
    'pink pioneer pipe pistol pitch pizza place planet plastic plate play please pledge pluck plug plunge poem poet point polar pole police pond pony ' +
    'pool popular portion position possible post potato pottery poverty powder power practice praise predict prefer prepare present pretty prevent price pride primary print priority ' +
    'prison private prize problem process produce profit program project promote proof property prosper protect proud provide public pudding pull pulp pulse pumpkin punch pupil ' +
    'puppy purchase purity purpose purse push put puzzle pyramid quality quantum quarter question quick quit quiz quote rabbit raccoon race rack radar radio rail ' +
    'rain raise rally ramp ranch random range rapid rare rate rather raven raw razor ready real reason rebel rebuild recall receive recipe record recycle ' +
    'reduce reflect reform refuse region regret regular reject relax release relief rely remain remember remind remove render renew rent reopen repair repeat replace report ' +
    'require rescue resemble resist resource response result retire retreat return reunion reveal review reward rhythm rib ribbon rice rich ride ridge rifle right rigid ' +
    'ring riot ripple risk ritual rival river road roast robot robust rocket romance roof rookie room rose rotate rough round route royal rubber rude ' +
    'rug rule run runway rural sad saddle sadness safe sail salad salmon salon salt salute same sample sand satisfy satoshi sauce sausage save say ' +
    'scale scan scare scatter scene scheme school science scissors scorpion scout scrap screen script scrub sea search season seat second secret section security seed ' +
    'seek segment select sell seminar senior sense sentence series service session settle setup seven shadow shaft shallow share shed shell sheriff shield shift shine ' +
    'ship shiver shock shoe shoot shop short shoulder shove shrimp shrug shuffle shy sibling sick side siege sight sign silent silk silly silver similar ' +
    'simple since sing siren sister situate six size skate sketch ski skill skin skirt skull slab slam sleep slender slice slide slight slim slogan ' +
    'slot slow slush small smart smile smoke smooth snack snake snap sniff snow soap soccer social sock soda soft solar soldier solid solution solve ' +
    'someone song soon sorry sort soul sound soup source south space spare spatial spawn speak special speed spell spend sphere spice spider spike spin ' +
    'spirit split spoil sponsor spoon sport spot spray spread spring spy square squeeze squirrel stable stadium staff stage stairs stamp stand start state stay ' +
    'steak steel stem step stereo stick still sting stock stomach stone stool story stove strategy street strike strong struggle student stuff stumble style subject ' +
    'submit subway success such sudden suffer sugar suggest suit summer sun sunny sunset super supply supreme sure surface surge surprise surround survey suspect sustain ' +
    'swallow swamp swap swarm swear sweet swift swim swing switch sword symbol symptom syrup system table tackle tag tail talent talk tank tape target ' +
    'task taste tattoo taxi teach team tell ten tenant tennis tent term test text thank that theme then theory there they thing this thought ' +
    'three thrive throw thumb thunder ticket tide tiger tilt timber time tiny tip tired tissue title toast tobacco today toddler toe together toilet token ' +
    'tomato tomorrow tone tongue tonight tool tooth top topic topple torch tornado tortoise toss total tourist toward tower town toy track trade traffic tragic ' +
    'train transfer trap trash travel tray treat tree trend trial tribe trick trigger trim trip trophy trouble truck true truly trumpet trust truth try ' +
    'tube tuition tumble tuna tunnel turkey turn turtle twelve twenty twice twin twist two type typical ugly umbrella unable unaware uncle uncover under undo ' +
    'unfair unfold unhappy uniform unique unit universe unknown unlock until unusual unveil update upgrade uphold upon upper upset urban urge usage use used useful ' +
    'useless usual utility vacant vacuum vague valid valley valve van vanish vapor various vast vault vehicle velvet vendor venture venue verb verify version very ' +
    'vessel veteran viable vibrant vicious victory video view village vintage violin virtual virus visa visit visual vital vivid vocal voice void volcano volume vote ' +
    'voyage wage wagon wait walk wall walnut want warfare warm warrior wash wasp waste water wave way wealth weapon wear weasel weather web wedding ' +
    'weekend weird welcome west wet whale what wheat wheel when where whip whisper wide width wife wild will win window wine wing wink winner ' +
    'winter wire wisdom wise wish witness wolf woman wonder wood wool word work world worry worth wrap wreck wrestle wrist write wrong yard year ' +
    'yellow you young youth zebra zero zone zoo'
  ).split(' ');
  const BIP39_AT = new Map(BIP39.map((w, i) => [w, i]));
  DLX.bip39 = Object.freeze(BIP39);
  function seedOk(idx) {
    const cs = idx.length / 3, eb = (idx.length * 11 - cs) / 8;
    const bytes = new Uint8Array(eb);
    let acc = 0, nb = 0, p = 0;
    for (const v of idx) {
      acc = (acc << 11) | v;
      nb += 11;
      while (nb >= 8 && p < eb) { bytes[p++] = (acc >>> (nb - 8)) & 255; nb -= 8; }
      acc &= (1 << nb) - 1;
    }
    return nb === cs && (DLX.dictionary.sha256Words(bytes)[0] >>> (32 - cs)) === acc;
  }
  // Sucht im Treffer (Folge kurzer Woerter, auch nummeriert) eine gueltige Phrase. Stehen davor oder
  // danach weitere Listenwoerter ("seed phrase ... wallet"), besteht oft auch ein verschobenes Fenster
  // die Pruefsumme: der Fund ist deshalb die ganze Folge von Listenwoertern, damit die echte Phrase
  // sicher ganz darin liegt. Liefert { from, len } im Treffer oder false. Ohne SHA-256 kein Fund.
  function seedPhrase(v) {
    if (!DLX.dictionary || !DLX.dictionary.sha256Words) return false;
    const re = /[A-Za-z]{3,8}/g, ws = [];
    let m;
    while ((m = re.exec(v)) !== null) ws.push([m.index, m.index + m[0].length, BIP39_AT.get(m[0].toLowerCase())]);
    for (let i = 0; i + 12 <= ws.length;) {
      if (ws[i][2] === undefined) { i++; continue; }
      let run = 0;
      while (i + run < ws.length && ws[i + run][2] !== undefined) run++;
      for (let j = i; j + 12 <= i + run; j++) {
        for (const n of [24, 21, 18, 15, 12]) {
          if (j + n <= i + run && seedOk(ws.slice(j, j + n).map((x) => x[2]))) return { from: ws[i][0], len: ws[i + run - 1][1] - ws[i][0] };
        }
      }
      i += run;
    }
    return false;
  }
  extend('finance', [
    D('crypto_seed', 'finanz', 'hoch', /(?<![A-Za-z0-9])(?:\d{1,2}[.):]?[ \t]{0,2})?[a-z]{3,8}(?:[ \t\r\n,;]{1,4}(?:\d{1,2}[.):]?[ \t]{0,2})?[a-z]{3,8}){11,95}(?![A-Za-z])/gi,
      'Wallet recovery phrase (BIP-39)', 'Wallet-Wiederherstellungsphrase (BIP-39)', { valid: seedPhrase }),
  ]);

  DLX.validators = Object.assign(DLX.validators || {}, {
    verhoeff, iso7064_11_2, chEsr, atTin, frNif, frSiren, esDni, esNie, esCif, esNss, ptNif, ptCc, ptNiss, luMat, luTva, sePnr, seOrg, seVat, dkCpr, dkCvr, noFnr, noOrg,
    fiHetu, fiYt, isKt, iePps, ieVat, gbNhs, gbUtr, gbVat, plPesel, plNip, plRegon, rodne, czDic, skDph, huTax, huTaj, huVat, roCnp, roCui, bgEgn, bgVat, hrOib, siEmso, siDdv,
    grAmka, grAfm, cyVat, mtVat, balticId, eeKmkr, ltPvm, lvPk, lvPvn, usAba, caSin, brCns, mxCurp, mxRfc, arCuit, clRut, coNit, inAadhaar, inGstin, cnRic, cnUscc, jpMynum, jpCn,
    krRrn, krBrn, sgNric, sgUen, auTfn, auMedicare, auAbn, nzIrd, nzNhi, zaId, zaTin, trTckn, trVkn, ilTz, base58check, bech32, lei, ipv6,
  });
})(globalThis);
