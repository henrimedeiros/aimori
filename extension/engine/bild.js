// Bildpruefung per lokaler Texterkennung (Design-Review Bilder 14.10.2026):
// reine Hilfsfunktionen ohne Browser-Zugriff, gemeinsam fuer Content Script,
// Offscreen-Dokument, Service Worker und Node-Tests. Bildbytes und erkannter
// Text verlassen den Browser nie; hier wird nichts gespeichert.
(function (g) {
  'use strict';
  const DLX = g.DLX || (g.DLX = {});

  // Grenzen (Auflagen 3, 9, 10): je Ereignis, je Bild, Gesamtzeit.
  const LIMITS = Object.freeze({ images: 4, bytes: 10 * 1024 * 1024, pixels: 25000000, ms: 20000, words: 20000 });
  // Sprachdaten: deu+eng fest, weitere nur nach Oberflaechensprache (Auflage 10).
  const LANGS = Object.freeze(['deu', 'eng', 'fra', 'ita', 'por']);
  const EXTRA = Object.freeze({ fr: 'fra', it: 'ita', pt: 'por' });
  const langsFor = (uiLang) => (Object.hasOwn(EXTRA, uiLang) ? ['deu', 'eng', EXTRA[uiLang]] : ['deu', 'eng']);
  const PAD = 3;              // Rand um geschwaerzte Woerter (Bildpunkte im Original)

  const u16be = (b, i) => (b[i] << 8) | b[i + 1];
  const u32be = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const ascii = (b, i, n) => String.fromCharCode.apply(null, Array.from(b.subarray(i, i + n)));

  // Bildart nur aus den Magic Bytes, nie aus MIME-Typ oder Dateiname.
  function sniff(b) {
    if (!b || b.length < 16) return null;
    if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
    return null;
  }

  // Abmessungen aus dem Dateikopf, vor jedem Dekodieren (Auflage 9). null = unbekannt.
  function dims(b) {
    const type = sniff(b);
    if (type === 'png') {
      if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
      return ok(u32be(b, 16), u32be(b, 20));
    }
    if (type === 'jpeg') {
      for (let i = 2; i + 9 < b.length;) {
        if (b[i] !== 0xff) return null;
        const m = b[i + 1];
        if (m === 0xff) { i++; continue; }
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        if (m === 0xd9 || m === 0xda) return null;   // Bildende/Bilddaten vor SOF
        const len = u16be(b, i + 2);
        if (len < 2) return null;
        // SOF0-SOF15 ausser DHT (C4), JPG (C8), DAC (CC)
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return ok(u16be(b, i + 7), u16be(b, i + 5));
        i += 2 + len;
      }
      return null;
    }
    if (type === 'webp') {
      if (b.length < 30) return null;
      const chunk = ascii(b, 12, 4);
      if (chunk === 'VP8X') return ok(u24le(b, 24) + 1, u24le(b, 27) + 1);
      if (chunk === 'VP8L') {
        if (b[20] !== 0x2f) return null;
        const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
        return ok((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      }
      if (chunk === 'VP8 ') {
        if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
        return ok((b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff);
      }
    }
    return null;
  }
  function ok(w, h) { return w > 0 && h > 0 ? { w, h } : null; }

  // Pruefbar? Grund als festes Wort, nie Inhalt.
  function precheck(b) {
    if (!b || b.length > LIMITS.bytes) return { ok: false, reason: 'size' };
    if (!sniff(b)) return { ok: false, reason: 'type' };
    const d = dims(b);
    if (!d || d.w * d.h > LIMITS.pixels) return { ok: false, reason: 'size' };
    return { ok: true, w: d.w, h: d.h };
  }

  // Kleine Bilder doppelt so gross erkennen (Bildschirmschrift ist oft nur 12-16 px
  // hoch), die Megapixel-Grenze gilt auch danach (Auflage 9).
  function scaleFor(w, h) {
    return Math.max(w, h) <= 2000 && w * h * 4 <= LIMITS.pixels ? 2 : 1;
  }

  // Woerter der Texterkennung -> Text mit Lage je Wort. lines: [[[text, x0, y0, x1, y1], ...], ...]
  // Woerter einer Zeile mit Leerzeichen, Zeilen mit Zeilenumbruch verbunden.
  function textOf(lines) {
    let text = '';
    const spans = [];
    for (const line of lines) {
      const words = line.filter((w) => typeof w[0] === 'string' && w[0].trim());
      if (!words.length) continue;
      if (text) text += '\n';
      words.forEach((w, i) => {
        if (i) text += ' ';
        const s = text.length;
        text += w[0].trim();
        spans.push({ s, e: text.length, box: [w[1], w[2], w[3], w[4]] });
      });
    }
    return { text: repair(text), spans };
  }

  // Typische Verwechslungen der Texterkennung zurueckbiegen, Zeichen fuer Zeichen
  // (Laenge bleibt gleich, die Rahmen der Woerter stimmen weiter): typografische
  // Anfuehrungszeichen und Striche, O/l zwischen Ziffern, "Alza" statt "AIza", "eyl"
  // statt "eyJ" (JWT), "-" statt "~" im Azure-Geheimnis. Gemeldet wird weiter nur,
  // was Format und Pruefziffern bestehen.
  function repair(text) {
    return text
      .replace(/[“”„‟″]/g, '"').replace(/[‘’‚‛′]/g, "'").replace(/[–—−]/g, '-')
      .replace(/(?<=\d)[Oo](?=\d)/g, '0').replace(/(?<=\d)[lI|](?=\d)/g, '1')
      .replace(/\bA[l1|]za(?=[0-9A-Za-z_-]{35})/g, 'AIza').replace(/(?<=^|[\s.:="'])ey[lI1|](?=[A-Za-z0-9_-]{10})/gm, 'eyJ')
      .replace(/(?<=\b[0-9A-Za-z_.]{3}\dQ)-(?=[0-9A-Za-z_.~-]{31})/g, '~');
  }

  // Gueltige Antwort des Offscreen-Dokuments? Nur Woerter mit Zahlenrahmen.
  function validLines(lines) {
    if (!Array.isArray(lines)) return false;
    let n = 0;
    for (const line of lines) {
      if (!Array.isArray(line)) return false;
      for (const w of line) {
        if (!Array.isArray(w) || w.length !== 5 || typeof w[0] !== 'string' || w[0].length > 200) return false;
        for (let i = 1; i < 5; i++) if (!Number.isFinite(w[i]) || w[i] < 0 || w[i] > 100000) return false;
        if (++n > LIMITS.words) return false;
      }
    }
    return true;
  }

  // Rechtecke zum Schwaerzen: alle Woerter, die ein Fund beruehrt, auch ueber
  // mehrere Woerter oder Zeilen (Auflage 8). Koordinaten der Erkennung (ggf. 2x)
  // werden auf das Original zurueckgerechnet. null = ein Fund liegt in keinem
  // Wort -> keine geschwaerzte Kopie anbieten.
  function rectsFor(findings, spans, scale, w, h) {
    const out = [];
    for (const f of findings) {
      if (f.meta) continue;   // Listen-Hinweis: Einzelfunde werden geschwaerzt
      const hit = spans.filter((sp) => sp.s < f.end && sp.e > f.start);
      if (!hit.length) return null;
      for (const sp of hit) {
        const x0 = Math.max(0, Math.floor(sp.box[0] / scale) - PAD), y0 = Math.max(0, Math.floor(sp.box[1] / scale) - PAD);
        const x1 = Math.min(w, Math.ceil(sp.box[2] / scale) + PAD), y1 = Math.min(h, Math.ceil(sp.box[3] / scale) + PAD);
        if (x1 > x0 && y1 > y0) out.push([x0, y0, x1 - x0, y1 - y0]);
      }
    }
    return out;
  }

  // Dokumentart aus dem erkannten Text (Design-Review Code und Bilder 16.10.2026, Auflage 9):
  // Ausweis = gueltige MRZ (Pruefziffern ICAO 9303, Regel-Funde mrz_td1/td3) oder Ausweis-Titel
  // plus Merkmal; MRZ-artige Zeile ohne gueltige Pruefziffern zaehlt nur als ein Merkmal.
  // Rechnung = Rechnungswort plus mindestens 2 Merkmale. Ergebnis: Liste der Typ-IDs.
  const ID_TITLE = /(?:identit(?:ä|ae)tskarte|personalausweis|reisepass|passport|passeport|passaporto|passaporte|carte d.identit[ée]|carta d.identit[àa]|cart(?:ã|a)o de cidad(?:ã|a)o|bilhete de identidade|identity card|\bid card\b|residence permit|aufenthaltstitel|ausl(?:ä|ae)nderausweis|f(?:ü|ue)hrerausweis|f(?:ü|ue)hrerschein|driving licen[cs]e|driver.s license|permis de conduire|licenza di condurre|carta de condução)/i;
  const ID_FIELDS = [
    /geburtsdatum|date of birth|date de naissance|data di nascita|data de nascimento|fecha de nacimiento/i,
    /nationalit(?:ä|ae)t|staatsangeh(?:ö|oe)rigkeit|nationality|nationalit[ée]|nazionalit[àa]|nacionalidade/i,
    /g(?:ü|ue)ltig bis|ablaufdatum|date of expiry|expiry date|date d.expiration|valable jusqu|scadenza|validade|valid until/i,
    /\b(?:geschlecht|sex|sexe|sesso|sexo)\b/i,
    /\b(?:vornamen?|given names?|pr[ée]noms?|prenome|nomi)\b/i,
  ];
  const MRZ_LIKE = /[A-Z0-9<]{5,44}<<[A-Z0-9<]{3,44}/;
  const INV_TITLE = /\b(?:rechnung|faktura|invoice|facture|fattura|fatura|nota fiscal|qr-rechnung|zahlteil)\b/i;
  const INV_FIELDS = [
    /\b(?:total|gesamtbetrag|rechnungsbetrag|betrag|summe|amount due|montant|importo|valor total)\b/i,
    /\b(?:mwst|mwst\.|ust|mehrwertsteuer|vat|tva|iva)\b/i,
    /zahlbar bis|f(?:ä|ae)llig|due date|payable|(?:é|e)ch(?:é|e)ance|scadenza|vencimento|zahlungsfrist/i,
    /rechnungs-?(?:nr|nummer)|invoice (?:no|number|#)|n° de facture|numero (?:di )?fattura|n(?:ú|u)mero da fatura/i,
    /\b(?:CHF|EUR|USD|GBP)\s?\d{1,3}(?:['’ .,]?\d{3}){0,4}[.,]\d{2}\b|€\s?\d{1,3}(?:[ .,]?\d{3}){0,4}[.,]\d{2}\b/,
  ];
  function docType(text, findings) {
    const out = [];
    if (typeof text !== 'string' || !text) return out;
    const t = text.slice(0, 20000);
    const ids = new Set((findings || []).map((f) => f.id));
    const idFields = ID_FIELDS.filter((re) => re.test(t)).length;
    const mrzValid = ids.has('mrz_td1') || ids.has('mrz_td3');
    const mrzWeak = !mrzValid && MRZ_LIKE.test(t) ? 1 : 0;
    if (mrzValid || (ID_TITLE.test(t) && idFields + mrzWeak >= 1) || (mrzWeak && idFields >= 2)) out.push('doc_identity');
    const invFields = INV_FIELDS.filter((re) => re.test(t)).length + (ids.has('iban') || ids.has('ch_esr') ? 1 : 0);
    if (INV_TITLE.test(t) && invFields >= 2) out.push('doc_invoice');
    return out;
  }

  // Dokumentart in Bildern (docType unten, Design-Review Code und Bilder 16.10.2026):
  // abgeleitete Typen ohne eigenes Muster; Ausweis standardmaessig block, Rechnung warn.
  // Per Richtlinie rules wie jeder andere Typ einstellbar (Auflage 11).
  const NEVER = /(?!)/g;
  // Das Offscreen-Dokument (ui/ocr.html) laedt bild.js ohne Engine: dort keine Registrierung.
  if (DLX.registerPack) DLX.registerPack({
    id: 'bild', kind: 'bild',
    detectors: [
      { id: 'doc_identity', cat: 'reise', cls: 'hoch', re: NEVER, derived: true, act: 'block',
        name: { en: 'Identity document in image (ID card, passport, licence)', de: 'Ausweisdokument im Bild (Identitätskarte, Pass, Führerausweis)' } },
      { id: 'doc_invoice', cat: 'finanz', cls: 'mittel', re: NEVER, derived: true,
        name: { en: 'Invoice in image', de: 'Rechnung im Bild' } },
    ],
  });

  DLX.bild = Object.freeze({ LIMITS, LANGS, PAD, langsFor, sniff, dims, precheck, scaleFor, repair, textOf, validLines, rectsFor, docType });
})(globalThis);
