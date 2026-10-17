// Texterkennung fuer Bilder: kopiert genau die benoetigten Dateien der gepinnten
// Pakete aus node_modules nach extension/vendor/ocr/ und prueft sie gegen
// extension/vendor/ocr/PINS.json (Design-Review Bilder 14.10.2026, Auflage 12).
// Vorher: npm ci --ignore-scripts (nie npm install, nie Install-Skripte).
//   node scripts/build-ocr.mjs           erzeugen + gegen PINS.json pruefen (Exit 1 bei Abweichung)
//   node scripts/build-ocr.mjs --pins    PINS.json neu schreiben (nur bei einem gewollten Paket-Update,
//                                        das als Abhaengigkeits-Update eigens geprueft wird)
// Sprachdaten werden als base64-String in je eine JS-Datei gelegt: das
// Offscreen-Dokument laedt sie per <script>, damit connect-src 'none' bleibt.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'extension', 'vendor', 'ocr');
const PINS = path.join(OUT, 'PINS.json');
const NM = path.join(ROOT, 'node_modules');
const LANGS = ['deu', 'eng', 'fra', 'ita', 'por'];
const PACKAGES = ['tesseract.js', 'tesseract.js-core', ...LANGS.map((l) => '@tesseract.js-data/' + l)];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Erzeugt die Dateien im Speicher: relativer Pfad -> Buffer.
export function produce() {
  const files = {
    'worker.min.js': fs.readFileSync(path.join(NM, 'tesseract.js', 'dist', 'worker.min.js')),
    'tesseract-core-simd-lstm.wasm.js': fs.readFileSync(path.join(NM, 'tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js')),
    // Lizenztexte liegen dem ausgelieferten Paket bei (Apache-2.0 Abschnitt 4 a).
    'LICENSE-tesseract.js.txt': fs.readFileSync(path.join(NM, 'tesseract.js', 'LICENSE.md')),
    'LICENSE-tesseract.js-core.txt': fs.readFileSync(path.join(NM, 'tesseract.js-core', 'LICENSE')),
  };
  for (const l of LANGS) {
    const gz = fs.readFileSync(path.join(NM, '@tesseract.js-data', l, '4.0.0_best_int', l + '.traineddata.gz'));
    files[`lang/${l}.js`] = Buffer.from(`// Erzeugt von scripts/build-ocr.mjs aus @tesseract.js-data/${l} (4.0.0_best_int, Apache-2.0) - nicht von Hand aendern.\n` +
      `self.DLX_OCR_LANG = self.DLX_OCR_LANG || {};\nself.DLX_OCR_LANG.${l} = '${gz.toString('base64')}';\n`);
  }
  return files;
}

// Versionen und npm-Integrity aus package-lock.json (dort von npm ci geprueft).
export function packages() {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const out = {};
  for (const p of PACKAGES) {
    const e = lock.packages['node_modules/' + p];
    if (!e) throw new Error('package-lock.json ohne ' + p);
    out[p] = { version: e.version, integrity: e.integrity };
  }
  return out;
}

// Abweichungen gegen PINS.json (leer = alles gleich).
export function verify(files = produce()) {
  const problems = [];
  const pins = JSON.parse(fs.readFileSync(PINS, 'utf8'));
  const pk = packages();
  for (const p of PACKAGES) {
    const inst = JSON.parse(fs.readFileSync(path.join(NM, ...p.split('/'), 'package.json'), 'utf8')).version;
    if (!pins.packages[p] || pins.packages[p].version !== pk[p].version || pins.packages[p].integrity !== pk[p].integrity) problems.push(`${p}: Version/Integrity weicht von PINS.json ab`);
    if (inst !== pk[p].version) problems.push(`${p}: installiert ${inst}, Lockfile ${pk[p].version} (npm ci --ignore-scripts)`);
  }
  if (JSON.stringify(Object.keys(pins.files).sort()) !== JSON.stringify(Object.keys(files).sort())) problems.push('Dateiliste weicht von PINS.json ab');
  for (const [rel, buf] of Object.entries(files)) if (pins.files[rel] !== sha256(buf)) problems.push(`${rel}: Pruefsumme weicht von PINS.json ab`);
  return problems;
}

// Liegen im Vendor-Ordner genau die gepinnten Dateien mit gepinnter Pruefsumme?
export function verifyOut() {
  if (!fs.existsSync(PINS)) return ['PINS.json fehlt'];
  const pins = JSON.parse(fs.readFileSync(PINS, 'utf8'));
  const problems = [];
  const found = [];
  const walk = (dir, pre) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), pre + e.name + '/');
      else if (pre + e.name !== 'PINS.json') found.push(pre + e.name);
    }
  };
  walk(OUT, '');
  for (const f of found) if (!Object.hasOwn(pins.files, f)) problems.push(`vendor/ocr/${f}: nicht gepinnt`);
  for (const [rel, h] of Object.entries(pins.files)) {
    const p = path.join(OUT, rel);
    if (!fs.existsSync(p)) problems.push(`vendor/ocr/${rel}: fehlt (npm ci --ignore-scripts && node scripts/build-ocr.mjs)`);
    else if (sha256(fs.readFileSync(p)) !== h) problems.push(`vendor/ocr/${rel}: Pruefsumme falsch`);
  }
  return problems;
}

function write(files) {
  for (const [rel, buf] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
    fs.writeFileSync(path.join(OUT, rel), buf);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = produce();
  if (process.argv.includes('--pins')) {
    const pins = { hinweis: 'Gepinnte Texterkennung (Design-Review Bilder 14.10.2026, Auflage 12). Jede Aenderung ist ein Abhaengigkeits-Update mit eigener Pruefung.', packages: packages(), files: {} };
    for (const rel of Object.keys(files).sort()) pins.files[rel] = sha256(files[rel]);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(PINS, JSON.stringify(pins, null, 2) + '\n');
  }
  const problems = verify(files);
  if (problems.length) { console.log('OCR-DATEIEN ABGELEHNT:\n- ' + problems.join('\n- ')); process.exitCode = 1; }
  else {
    write(files);
    const left = verifyOut();
    if (left.length) { console.log('OCR-ORDNER FEHLERHAFT:\n- ' + left.join('\n- ')); process.exitCode = 1; }
    else console.log(`OCR-Dateien OK: ${Object.keys(files).length} Dateien, ${(Object.values(files).reduce((a, b) => a + b.length, 0) / 1048576).toFixed(1)} MB`);
  }
}
