// Synthetische Beispieldateien fuer Datei-Uploads (Design-Review Datei-Uploads 17.10.2026,
// Auflage 10): TXT, CSV, PDF, DOCX, XLSX je einmal mit Test-IBAN und Muster-AHV und einmal
// sauber. Nur erfundene Werte; genutzt von tests/datei-upload.test.mjs und scripts/e2e/e2e.mjs.
import { docx, xlsx, pdf } from './dokumente.mjs';

export const IBAN = 'CH93 0076 2011 6238 5295 7';
export const AHV = '756.1234.5678.97';
const HEIKEL = 'Bitte ueberweisen an ' + IBAN + ', AHV-Nummer ' + AHV + '.';
const SAUBER = 'Protokoll der Sitzung: Termine, Ziele und naechste Schritte fuer das Projekt.';

const MIME = {
  txt: 'text/plain', csv: 'text/csv', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const bytes = (b) => new Uint8Array(b.buffer ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b);

function make(ext, text) {
  if (ext === 'txt') return bytes(Buffer.from(text + '\n', 'utf8'));
  if (ext === 'csv') return bytes(Buffer.from('Thema;Notiz\nZahlung;' + text + '\n', 'utf8'));
  if (ext === 'pdf') return bytes(pdf([text]));
  if (ext === 'docx') return bytes(docx(['Notiz', text]));
  return bytes(xlsx([['Thema', 'Notiz'], ['Zahlung', text]]));
}

// [{ name, type, ext, heikel, bytes }]
export function beispieldateien() {
  const out = [];
  for (const ext of Object.keys(MIME)) {
    out.push({ name: 'beispiel-heikel.' + ext, type: MIME[ext], ext, heikel: true, bytes: make(ext, HEIKEL) });
    out.push({ name: 'beispiel-sauber.' + ext, type: MIME[ext], ext, heikel: false, bytes: make(ext, SAUBER) });
  }
  return out;
}
