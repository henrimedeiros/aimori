// Eigene Begriffe fuer die Richtlinie customTerms: Klartextliste rein (eine
// Zeile je Begriff, # = Kommentar), Pruefsummen raus. Laeuft nur lokal, kein Netz.
// Gleiche Normalisierung und Regeln wie die Erweiterung (extension/engine/dictionary.js,
// Design-Review 14.10.2026 Auflagen 1, 9). Der Klartext erscheint nie in Ausgabe
// oder Meldungen; Warnungen nennen nur Zeilennummern.
// Aufruf:
//   node scripts/begriffe-hashen.mjs <begriffe.txt | -> [--salt <64 hex>] [--out <datei.json> [--force]]
//   Begriffe nur aus Datei oder stdin (-), nie als Argument (Shell-Verlauf).
//   --salt: bestehendes Salz weiterverwenden (Liste ergaenzen); ohne = neues Zufallssalz.
// Ausgabe (stdout oder --out): { "customTerms": { "salt": "...", "hashes": [...] } }
//   --domains: interne Domains (eine je Zeile) fuer die Richtlinie internalDomains; gleiche
//   Normalisierung wie die Erweiterung (normHost), einlabelige Eintraege und oeffentliche
//   Endungen werden verworfen (Design-Review interne Links 17.10.2026, Auflagen 3, 4).
//   Ausgabe { "internalDomains": { "salt": "...", "hashes": [...] } }; eigenes Salz verwenden.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const MAX = 20000;
const MAX_DOMAINS = 5000;
// Kleine feste Liste oeffentlicher Endungen (keine Public-Suffix-Liste als Abhaengigkeit).
const PUBLIC_SUFFIX = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.br', 'net.br', 'org.br', 'gov.br', 'com.au', 'co.at', 'or.at', 'gv.at',
  'co.jp', 'co.nz', 'co.za', 'com.mx', 'com.ar', 'com.tr', 'com.cn', 'gouv.fr', 'admin.ch', 'co.com', 'github.io', 'blogspot.com']);

export function loadDictionary() {
  const ctx = vm.createContext({ TextEncoder, performance, URL });
  for (const f of ['engine/core.js', 'engine/dictionary.js']) vm.runInContext(fs.readFileSync(path.join(EXT, f), 'utf8'), ctx, { filename: f });
  return ctx.DLX.dictionary;
}

// text = Klartextliste, salt = 64 Hex oder leer. Liefert { salt, hashes, rejected: [{line, error}], duplicates }.
export function hashTerms(text, salt) {
  const D = loadDictionary();
  const s = salt ? salt.toLowerCase() : crypto.randomBytes(32).toString('hex');
  if (!/^[0-9a-f]{64}$/.test(s)) throw new Error('--salt: genau 64 Hex-Zeichen erwartet');
  const hashes = new Set();
  const rejected = [];
  let duplicates = 0;
  String(text).replace(/^﻿/, '').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const p = D.prepareTerm(line);
    if (p.error) { rejected.push({ line: i + 1, error: p.error }); return; }
    const h = D.termHash(s, p.term);
    if (hashes.has(h)) duplicates++; else hashes.add(h);
  });
  return { salt: s, hashes: Array.from(hashes).sort(), rejected, duplicates };
}

// text = Domainliste, salt = 64 Hex oder leer. Liefert { salt, hashes, rejected: [{line, error}], duplicates }.
export function hashDomains(text, salt) {
  const D = loadDictionary();
  const s = salt ? salt.toLowerCase() : crypto.randomBytes(32).toString('hex');
  if (!/^[0-9a-f]{64}$/.test(s)) throw new Error('--salt: genau 64 Hex-Zeichen erwartet');
  const hashes = new Set();
  const rejected = [];
  let duplicates = 0;
  String(text).replace(/^﻿/, '').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const d = D.normHost(line.trim());
    if (!d || /^[\d.]+$/.test(d)) { rejected.push({ line: i + 1, error: 'invalid' }); return; }
    if (d.indexOf('.') === -1) { rejected.push({ line: i + 1, error: 'single' }); return; }
    if (PUBLIC_SUFFIX.has(d)) { rejected.push({ line: i + 1, error: 'public' }); return; }
    const h = D.termHash(s, d);
    if (hashes.has(h)) duplicates++; else hashes.add(h);
  });
  return { salt: s, hashes: Array.from(hashes).sort(), rejected, duplicates };
}

const WHY = { short: 'kuerzer als 3 Zeichen', long: 'mehr als 5 Woerter oder zu lang', invalid: 'keine gueltige Domain', single: 'nur ein Label', public: 'oeffentliche Endung' };

function main(argv) {
  const args = argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); if (i === -1) return null; const v = args[i + 1]; args.splice(i, 2); return v === undefined ? '' : v; };
  const salt = opt('--salt');
  const out = opt('--out');
  const force = args.includes('--force');
  const domains = args.includes('--domains');
  const files = args.filter((a) => a !== '--force' && a !== '--domains');
  if (files.length !== 1) {
    console.error('Aufruf: node scripts/begriffe-hashen.mjs <begriffe.txt | -> [--domains] [--salt <64 hex>] [--out <datei.json> [--force]]');
    return 2;
  }
  if (salt === '') { console.error('--salt ohne Wert'); return 2; }
  if (out === '') { console.error('--out ohne Wert'); return 2; }
  const text = files[0] === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(files[0], 'utf8');
  let r;
  try { r = domains ? hashDomains(text, salt) : hashTerms(text, salt); } catch (e) { console.error(e.message); return 2; }
  for (const x of r.rejected) console.error(`Zeile ${x.line}: verworfen (${WHY[x.error] || WHY.long})`);
  const what = domains ? 'Domains' : 'Begriffe';
  const max = domains ? MAX_DOMAINS : MAX;
  if (r.duplicates) console.error(`${r.duplicates} doppelte ${what} zusammengefasst`);
  if (!r.hashes.length) { console.error(`Keine gueltigen ${what}.`); return 1; }
  if (r.hashes.length > max) { console.error(`Mehr als ${max} ${what} – Liste aufteilen oder kuerzen.`); return 1; }
  const json = JSON.stringify({ [domains ? 'internalDomains' : 'customTerms']: { salt: r.salt, hashes: r.hashes } }, null, 2) + '\n';
  if (out) {
    if (fs.existsSync(out) && !force) { console.error(`${out} existiert schon (ueberschreiben nur mit --force)`); return 1; }
    fs.writeFileSync(out, json);
    console.error(`${r.hashes.length} Pruefsummen nach ${out} geschrieben.`);
  } else process.stdout.write(json);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv);
