// Erfundene Testdokumente fuer die Dokument-Fingerabdruecke (nur synthetisch, Auflage 16):
// keine echten Firmen, Personen oder Kunden.
import { load } from './load.mjs';

const FP = load(['engine/core.js', 'engine/dictionary.js', 'engine/fingerabdruck.js']).fingerprint;

export const DOKUMENT = [
  'Strategiepapier Projekt Zeder, Entwurf fuer die Geschaeftsleitung der Beispiel Holding.',
  'Im kommenden Geschaeftsjahr wollen wir die Wartungsvertraege im Raum Mittelland neu ordnen und die Preise fuer Bestandskunden schrittweise anheben.',
  'Die Abteilung Vertrieb prueft dazu bis Ende des dritten Quartals, welche Vertraege ohne Kuendigungsfrist umgestellt werden koennen.',
  'Parallel verhandelt die Einkaufsleitung mit zwei Lieferanten ueber guenstigere Rahmenvertraege fuer Ersatzteile und Messgeraete.',
  'Falls die Verhandlungen scheitern, ziehen wir den Standort Seeblick zusammen mit dem Lager Ostwind an einen gemeinsamen Ort und bauen dort ein zentrales Ersatzteillager auf.',
  'Die Mitarbeitenden werden erst nach dem Entscheid des Verwaltungsrats informiert; bis dahin bleibt dieses Papier streng intern und darf nicht weitergegeben werden.',
  'Offene Punkte sind die Finanzierung der neuen Lagerhalle, die Uebernahme der Fahrzeugflotte und die Frage, ob der Kundendienst kuenftig rund um die Uhr erreichbar sein soll.',
].join('\n\n');

// Gleiches Thema, eigene Saetze: darf nicht als Dokument gelten.
export const FREMD = 'Koennen Sie mir helfen, eine freundliche Mail an unsere Kunden zu schreiben? Wir moechten ankuendigen, dass der Kundendienst ab naechstem Monat laenger erreichbar ist und dass sich an den Vertraegen fuer die Wartung nichts aendert. Bitte kurz und hoeflich formulieren.';

// Auszug: drei Saetze am Stueck aus DOKUMENT, mit anderer Schreibweise (Gross/Klein, Umlaute).
export const AUSZUG = 'Bitte fasse zusammen: Parallel verhandelt die Einkaufsleitung mit zwei Lieferanten über günstigere Rahmenverträge für Ersatzteile und Messgeräte. '
  + 'FALLS DIE VERHANDLUNGEN SCHEITERN, ziehen wir den Standort Seeblick zusammen mit dem Lager Ostwind an einen gemeinsamen Ort und bauen dort ein zentrales Ersatzteillager auf.';

export const SALZ = 'a1'.repeat(32);

// Richtlinie documentFingerprints fuer DOKUMENT (gleiches Format wie scripts/dokumente-fingerabdruck.mjs).
export function richtlinie(opt = {}) {
  const p = Object.assign({ shingle: FP.DEFAULTS.shingle, sample: FP.DEFAULTS.sample, minMatches: FP.DEFAULTS.minMatches, action: 'warn' }, opt);
  const vals = Uint32Array.from(FP.values(DOKUMENT, SALZ, p.shingle, p.sample)).sort();
  const buf = Buffer.alloc(vals.length * 4);
  vals.forEach((v, i) => buf.writeUInt32BE(v, i * 4));
  return { salt: SALZ, shingle: p.shingle, sample: p.sample, minMatches: p.minMatches, action: p.action, data: [buf.toString('base64')] };
}
