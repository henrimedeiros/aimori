// Dokument-Fingerabdruecke fuer die Richtlinie documentFingerprints: vertrauliche Dokumente
// rein, nur gesalzene, gekuerzte Pruefwerte raus. Laeuft nur lokal, kein Netz, keine
// Abhaengigkeit (Design-Review Diktat und Fingerabdruecke 16.10.2026, Teil B).
// Rechnet mit demselben Code wie die Erweiterung (extension/engine/dictionary.js words(),
// extension/engine/fingerabdruck.js), Bit fuer Bit gleich (Auflage 10).
// Liest .txt .md .csv .tsv .log .html .htm .docx (Ordner: alle solchen Dateien darin, rekursiv).
// .docx: eigener ZIP-Leser nur fuer word/document.xml, nichts wird entpackt oder ausgefuehrt
// (Auflagen 8, 9). PDF und andere Formate vorher als Text oder .docx speichern.
// In die Ausgabe kommen nur Zahlen (Salz, Parameter, Werte); Dateinamen und Warnungen nur auf
// stderr (Auflage 14). Kein Klartext, keine Reihenfolge, keine Zuordnung Wert -> Datei.
// Aufruf:
//   node scripts/dokumente-fingerabdruck.mjs <datei|ordner> [...] [--salt <64 hex>] [--ausschluss <datei|ordner>]
//     [--shingle 8] [--sample 4] [--min 4] [--aktion warn|block] [--max 50000] [--out <datei.json> [--force]]
//   --salt: bestehendes Salz weiterverwenden (sonst neues Zufallssalz, alle alten Werte ungueltig)
//   --ausschluss: oeffentliche Standardtexte (Disclaimer, Signaturen, AGB), deren Werte entfernt werden (Auflage 11)
//   --max: Obergrenze der Werte, Standard 50000, hoechstens 100000 (Auflage 15)
// Ausgabe (stdout oder --out): { "documentFingerprints": { salt, shingle, sample, minMatches, action, data: [Base64...] } }
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const TEXT_EXT = /\.(txt|md|csv|tsv|log)$/i;
const HTML_EXT = /\.html?$/i;
const DOCX_EXT = /\.docx$/i;
const MAX_FILE = 50 * 1024 * 1024;      // Eingabedatei
const MAX_XML = 20 * 1024 * 1024;       // entpacktes document.xml (Auflage 8)
const MAX_RATIO = 100;                  // entpackt / gepackt (Auflage 8)
const MAX_ENTRIES = 5000;               // Eintraege im ZIP (Auflage 8)
const MAX_FILES = 10000;
const PART_CHARS = 8000;                // Base64 je Stueck (6000 Byte = 1500 Werte)
const DEFAULT_MAX = 50000, HARD_MAX = 100000;

export function loadEngine() {
  const ctx = vm.createContext({ TextEncoder, performance });
  for (const f of ['engine/core.js', 'engine/dictionary.js', 'engine/fingerabdruck.js']) vm.runInContext(fs.readFileSync(path.join(EXT, f), 'utf8'), ctx, { filename: f });
  return ctx.DLX.fingerprint;
}

// Fuenf Standard-Entitaeten, dazu &nbsp; als Leerzeichen; keine DTD, keine weiteren (Auflage 9).
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const entities = (s) => s.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (m, n) => ENT[n]);

// HTML: script/style/Kommentare verwerfen, Tags trennen Woerter, nur Textknoten bleiben.
export function htmlText(html) {
  return entities(String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' '));
}

// document.xml: nur Inhalt von <w:t>; Absatz und Tabulator trennen Woerter.
export function docxXmlText(xml) {
  const out = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t(?:\s[^>]*)?\/>|<\/w:p>|<w:tab\/>|<w:br\/>/g;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1] !== undefined ? entities(m[1]) : /^<w:t[\s/]/.test(m[0]) ? '' : ' ');
  return out.join('');
}

// Minimaler ZIP-Leser (Auflage 8): Zentralverzeichnis, genau ein word/document.xml,
// nur Methode 0/8, kein ZIP64, keine Verschluesselung, Groessen- und Verhaeltnisgrenzen.
export function docxDocumentXml(buf) {
  const fail = (why) => { throw new Error('docx: ' + why); };
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) fail('kein ZIP');
  const entries = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOff = buf.readUInt32LE(eocd + 16);
  if (entries === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) fail('ZIP64 nicht unterstuetzt');
  if (entries > MAX_ENTRIES) fail('zu viele Eintraege');
  if (cdOff + cdSize > eocd) fail('Verzeichnis beschaedigt');
  let p = cdOff, found = null;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > eocd || buf.readUInt32LE(p) !== 0x02014b50) fail('Verzeichnis beschaedigt');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    if (name === 'word/document.xml') {
      if (found) fail('word/document.xml mehrfach');
      if (flags & 1) fail('verschluesselt');
      if (method !== 0 && method !== 8) fail('Kompression nicht unterstuetzt');
      if (csize === 0xffffffff || usize === 0xffffffff || local === 0xffffffff) fail('ZIP64 nicht unterstuetzt');
      found = { method, csize, usize, local };
    }
    p += 46 + nlen + xlen + clen;
  }
  if (!found) fail('kein word/document.xml');
  const { method, csize, usize, local } = found;
  if (usize > MAX_XML) fail('Dokument zu gross');
  if (method === 8 && usize > Math.max(csize, 1) * MAX_RATIO) fail('Kompressionsverhaeltnis zu hoch');
  if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) fail('Eintrag beschaedigt');
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  if (start + csize > buf.length) fail('Eintrag beschaedigt');
  const data = buf.subarray(start, start + csize);
  const xml = method === 0 ? data : zlib.inflateRawSync(data, { maxOutputLength: MAX_XML });
  if (xml.length !== usize) fail('Groesse stimmt nicht');
  return xml.toString('utf8');
}

export function readDocument(file) {
  const st = fs.statSync(file);
  if (st.size > MAX_FILE) throw new Error('Datei zu gross');
  if (DOCX_EXT.test(file)) return docxXmlText(docxDocumentXml(fs.readFileSync(file)));
  const t = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  return HTML_EXT.test(file) ? htmlText(t) : t;
}

const supported = (f) => TEXT_EXT.test(f) || HTML_EXT.test(f) || DOCX_EXT.test(f);
export function listFiles(inputs) {
  const out = [];
  const walk = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) { for (const n of fs.readdirSync(p).sort()) walk(path.join(p, n)); return; }
    if (supported(p)) out.push(p);
    if (out.length > MAX_FILES) throw new Error('mehr als ' + MAX_FILES + ' Dateien');
  };
  for (const i of inputs) walk(i);
  return out;
}

// Werte -> Base64-Stuecke (sortiert, big endian, je Stueck hoechstens PART_CHARS Zeichen).
export function encode(values) {
  const sorted = Uint32Array.from(values).sort();
  const buf = Buffer.alloc(sorted.length * 4);
  sorted.forEach((v, i) => buf.writeUInt32BE(v, i * 4));
  const parts = [];
  const step = (PART_CHARS / 4) * 3;
  for (let o = 0; o < buf.length; o += step) parts.push(buf.subarray(o, o + step).toString('base64'));
  return parts;
}

// texts: Liste von Klartexten (bleiben im Speicher); exclude: Klartexte zum Abziehen.
// Liefert { policy, count, perText: [Anzahl je Text] } – nie Klartext.
export function buildPolicy(texts, opt = {}) {
  const FP = loadEngine();
  const salt = opt.salt ? String(opt.salt).toLowerCase() : crypto.randomBytes(32).toString('hex');
  if (!/^[0-9a-f]{64}$/.test(salt)) throw new Error('--salt: genau 64 Hex-Zeichen erwartet');
  const p = {
    shingle: opt.shingle ?? FP.DEFAULTS.shingle, sample: opt.sample ?? FP.DEFAULTS.sample,
    minMatches: opt.minMatches ?? FP.DEFAULTS.minMatches, action: opt.action ?? 'warn',
  };
  const inRange = (v, [lo, hi]) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!inRange(p.shingle, FP.LIMITS.shingle)) throw new Error('--shingle: 5 bis 16');
  if (!inRange(p.sample, FP.LIMITS.sample)) throw new Error('--sample: 1 bis 64');
  if (!inRange(p.minMatches, FP.LIMITS.minMatches)) throw new Error('--min: 2 bis 50');
  if (p.action !== 'warn' && p.action !== 'block') throw new Error('--aktion: warn oder block');
  const max = opt.max ?? DEFAULT_MAX;
  if (!inRange(max, [1, HARD_MAX])) throw new Error('--max: 1 bis ' + HARD_MAX);
  const all = new Set();
  const perText = texts.map((t) => { const v = FP.values(t, salt, p.shingle, p.sample); for (const h of v) all.add(h); return v.size; });
  let removed = 0;
  for (const t of opt.exclude || []) for (const h of FP.values(t, salt, p.shingle, p.sample)) if (all.delete(h)) removed++;
  if (!all.size) throw new Error('Keine Fingerabdruecke (Texte zu kurz oder nur Zahlen/Standardtext).');
  if (all.size > max) throw new Error(`${all.size} Fingerabdruecke, erlaubt ${max}: --sample erhoehen (z. B. ${Math.min(64, Math.ceil(p.sample * all.size / max))}) oder weniger Dokumente.`);
  const policy = { documentFingerprints: { salt, shingle: p.shingle, sample: p.sample, minMatches: p.minMatches, action: p.action, data: encode(all) } };
  return { policy, count: all.size, removed, perText };
}

function main(argv) {
  const args = argv.slice(2);
  const opts = {};
  const multi = { '--ausschluss': [] };
  const files = [];
  let force = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--force') { force = true; continue; }
    if (a.startsWith('--')) {
      const v = args[++i];
      if (v === undefined || v.startsWith('--')) { console.error(a + ' ohne Wert'); return 2; }
      if (a === '--ausschluss') multi[a].push(v); else opts[a] = v;
      continue;
    }
    files.push(a);
  }
  const known = ['--salt', '--shingle', '--sample', '--min', '--aktion', '--max', '--out'];
  const bad = Object.keys(opts).find((k) => !known.includes(k));
  if (bad || !files.length) {
    console.error(bad ? 'Unbekannte Option ' + bad : 'Aufruf: node scripts/dokumente-fingerabdruck.mjs <datei|ordner> [...] [--salt <64 hex>] [--ausschluss <datei|ordner>] [--shingle 8] [--sample 4] [--min 4] [--aktion warn|block] [--max 50000] [--out <datei.json> [--force]]');
    return 2;
  }
  const num = (k) => (opts[k] === undefined ? undefined : /^\d+$/.test(opts[k]) ? Number(opts[k]) : NaN);
  const out = opts['--out'];
  if (out && fs.existsSync(out) && !force) { console.error(`${out} existiert schon (ueberschreiben nur mit --force)`); return 1; }
  const read = (list, label) => {
    const texts = [];
    for (const f of listFiles(list)) {
      try { texts.push({ f, t: readDocument(f) }); } catch (e) { console.error(`${label}${f}: uebersprungen (${e.message})`); }
    }
    return texts;
  };
  let r, docs;
  try {
    docs = read(files, '');
    const excl = read(multi['--ausschluss'], 'Ausschluss ');
    if (!docs.length) { console.error('Keine lesbaren Dokumente.'); return 1; }
    r = buildPolicy(docs.map((d) => d.t), {
      salt: opts['--salt'], shingle: num('--shingle'), sample: num('--sample'), minMatches: num('--min'), action: opts['--aktion'], max: num('--max'),
      exclude: excl.map((d) => d.t),
    });
  } catch (e) { console.error(e.message); return 1; }
  docs.forEach((d, i) => { if (!r.perText[i]) console.error(`${d.f}: keine Fingerabdruecke (zu kurz)`); });
  const json = JSON.stringify(r.policy, null, 2) + '\n';
  const kb = Math.round(Buffer.byteLength(json) / 1024);
  console.error(`${docs.length} Dokumente, ${r.count} Fingerabdruecke (${kb} KB)${r.removed ? `, ${r.removed} aus Ausschluss entfernt` : ''}.`);
  if (r.count > DEFAULT_MAX) console.error('Hinweis: ueber 50000 Werte ist der Weg ueber GPO/Intune nicht gemessen – zuerst auf einem Testgeraet pruefen (edge://policy).');
  if (out) { fs.writeFileSync(out, json); console.error(`Geschrieben: ${out}`); } else process.stdout.write(json);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv);
