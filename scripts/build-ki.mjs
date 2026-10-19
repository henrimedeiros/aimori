// Lokale KI-Erkennung: legt Modell, Tokenizer und ONNX-Laufzeit in
// extension/vendor/ki/ ab und prueft alles gegen extension/vendor/ki/PINS.json
// (Design-Review KI-Erkennung 16.10.2026, Auflagen 1-7; docs/sicherheit/design-review-ki.md).
// Vorher: npm ci --ignore-scripts (nie npm install, nie Install-Skripte).
//   node scripts/build-ki.mjs          erzeugen + pruefen (Exit 1 bei Abweichung)
//   node scripts/build-ki.mjs --pins   Paket-/Datei-Pruefsummen in PINS.json neu schreiben
//                                      (nur bei gewolltem Update; Modell-Pins aendern sich nie von selbst)
// Modell: genau zwei Dateien (.onnx und tokenizer.json, Auflage 3) am gepinnten
// Commit, nur HTTPS, Weiterleitungen nur auf Hugging-Face-Hosts, Groessengrenze
// (Auflage 5), Pruefsumme vor jeder Weiterverarbeitung (Auflage 6). Geladen wird
// nur hier beim Bauen; die Erweiterung selbst hat kein Netz (connect-src 'none')
// und liest die Bytes aus base64-Stuecken (Skript-Dateien), die nach dem
// Schreiben zurueckdekodiert und erneut geprueft werden.
// Vokabular kuerzen (Design-Review Vokabular 16.10.2026, Auflagen 1-10): ins Paket
// kommt nicht das Original, sondern ein daraus erzeugtes Modell, dessen
// Einbettungs-Matrix nur noch die Teilwoerter der Schriften in
// PINS.json modell.vokabular enthaelt (scripts/lib/ki-konvert.mjs). Konfiguration,
// erzeugtes Modell und Tokenizer sind in modell.erzeugt gepinnt.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { selectVocab, shrinkModel, shrinkTokenizer, configHash } from './lib/ki-konvert.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'extension', 'vendor', 'ki');
const PINS = path.join(OUT, 'PINS.json');
const CACHE = path.join(ROOT, '.tmp', 'ki-cache');
const NM = path.join(ROOT, 'node_modules');
const PACKAGES = ['onnxruntime-web', 'onnxruntime-common', '@huggingface/tokenizers'];
const BUILD_HOST = 'huggingface.co';
const MAX_BYTES = 350 * 1048576;
// Rohbytes je Stueck: 2,5 MiB ergeben ~3,5 MB base64-Skript; Firefox-Add-ons (AMO)
// pruefen keine JS-Datei ueber 4 MB (Design-Review Firefox 17.10.2026, Auflage 6).
export const CHUNK = 2.5 * 1048576;
const okHost = (h) => h === 'huggingface.co' || h.endsWith('.huggingface.co') || h === 'hf.co' || h.endsWith('.hf.co');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const pins = () => JSON.parse(fs.readFileSync(PINS, 'utf8'));
const stripMap = (buf) => Buffer.from(buf.toString('utf8').replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n'));

// Laedt eine Datei des gepinnten Commits in den Cache (nur wenn noch nicht dort).
function download(rel, want) {
  const dest = path.join(CACHE, want.sha256);
  if (fs.existsSync(dest)) return Promise.resolve(dest);
  fs.mkdirSync(CACHE, { recursive: true });
  const m = pins().modell;
  const start = `https://${BUILD_HOST}/${m.repo}/resolve/${m.revision}/${rel}`;
  return new Promise((resolve, reject) => {
    const get = (url, hops) => {
      const u = new URL(url);
      if (u.protocol !== 'https:' || !okHost(u.hostname)) return reject(new Error(`${rel}: Ziel ausserhalb Hugging Face abgelehnt`));
      https.get(u, { headers: { 'user-agent': 'build-ki' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (hops > 5) return reject(new Error(`${rel}: zu viele Weiterleitungen`));
          return get(new URL(res.headers.location, u).href, hops + 1);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${rel}: HTTP ${res.statusCode}`)); }
        if (Number(res.headers['content-length'] || 0) > MAX_BYTES) { res.destroy(); return reject(new Error(`${rel}: zu gross`)); }
        const part = dest + '.part';
        const out = fs.createWriteStream(part);
        const h = crypto.createHash('sha256');
        let n = 0;
        res.on('data', (d) => {
          n += d.length;
          if (n > MAX_BYTES) { res.destroy(new Error(`${rel}: zu gross`)); return; }
          h.update(d);
        });
        res.on('error', (e) => { out.destroy(); fs.rmSync(part, { force: true }); reject(e); });
        res.pipe(out);
        out.on('finish', () => {
          const got = h.digest('hex');
          if (got !== want.sha256 || n !== want.bytes) { fs.rmSync(part, { force: true }); return reject(new Error(`${rel}: Pruefsumme/Groesse weicht von PINS.json ab`)); }
          fs.renameSync(part, dest);
          resolve(dest);
        });
      }).on('error', reject);
    };
    get(start, 0);
  });
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

function chunks(name, buf) {
  const out = {};
  const n = Math.ceil(buf.length / CHUNK);
  for (let i = 0; i < n; i++) {
    const b64 = buf.subarray(i * CHUNK, (i + 1) * CHUNK).toString('base64');
    out[`daten/${name}-${String(i).padStart(2, '0')}.js`] = Buffer.from(`self.DLX_KI_STUECK(${JSON.stringify(name)},${i},'${b64}');\n`);
  }
  return out;
}

// Zurueckdekodieren wie im Browser (Auflage 6): gleiche Bytes, gleicher Hash?
function decodeBack(files, name, n) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const s = files[`daten/${name}-${String(i).padStart(2, '0')}.js`].toString('latin1');
    parts.push(Buffer.from(s.slice(s.indexOf(",'") + 2, s.lastIndexOf("'")), 'base64'));
  }
  return sha256(Buffer.concat(parts));
}

const MIT_ORT = 'MIT License\n\nCopyright (c) Microsoft Corporation\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n';

// Saetze aus haeufigen Woertern: ihre Teilwoerter muessen alle behalten sein und
// im gekuerzten Tokenizer dieselben Ids (ueber die Abbildung) ergeben (Auflage 5).
const SELBSTTEST = [
  'Bitte schreib eine freundliche Mail an den Kunden wegen der Offerte.',
  'Please write a short note about the meeting with the new customer.',
  'Merci de préparer la facture pour le client avant vendredi.',
  'Por favor, escreva um resumo da reunião com o cliente.',
  'Scrivi una mail cortese al cliente riguardo all\'offerta.',
  'Por favor, escribe un correo al cliente sobre la oferta.',
];

// Gekuerztes Modell + Tokenizer aus den gepinnten Originalen (Auflagen 1-5).
async function shrink(model, tok, v) {
  const { Tokenizer } = await import('@huggingface/tokenizers');
  const tj = JSON.parse(tok.toString('utf8'));
  const keep = selectVocab(tj, v);
  const small = shrinkModel(model, v.matrix, keep);
  const { json, map } = shrinkTokenizer(tj, keep, keep.length);
  const smallTok = Buffer.from(JSON.stringify(json));
  const alt = new Tokenizer(tj, {}), neu = new Tokenizer(JSON.parse(smallTok.toString('utf8')), {});
  for (const s of SELBSTTEST) {
    const a = alt.encode(s, { add_special_tokens: false }).ids, b = neu.encode(s, { add_special_tokens: false }).ids;
    if (a.some((id) => !map.has(id)) || a.length !== b.length || a.some((id, i) => map.get(id) !== b[i])) throw new Error('Selbsttest Tokenizer: Ids weichen ab');
  }
  return { small, smallTok, erzeugt: { konfig: configHash(v), onnx: { sha256: sha256(small), bytes: small.length }, tokenizer: { sha256: sha256(smallTok), bytes: smallTok.length } } };
}

let lastErzeugt = null;

// Erzeugt alle Dateien im Speicher: relativer Pfad -> Buffer.
export async function produce() {
  const p = pins();
  const m = p.modell;
  const original = fs.readFileSync(await download(m.onnx, m.dateien[m.onnx]));
  const origTok = fs.readFileSync(await download('tokenizer.json', m.dateien['tokenizer.json']));
  if (sha256(original) !== m.dateien[m.onnx].sha256 || sha256(origTok) !== m.dateien['tokenizer.json'].sha256) throw new Error('Modell im Cache weicht von PINS.json ab');
  const { small: model, smallTok: tok, erzeugt } = await shrink(original, origTok, m.vokabular);
  lastErzeugt = erzeugt;
  // Fuer scripts/ki-messung.mjs (nur lokal, .tmp ist gitignored und nicht im Paket).
  for (const [buf, e] of [[model, erzeugt.onnx], [tok, erzeugt.tokenizer]]) {
    const dest = path.join(CACHE, e.sha256);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
  }
  const wasm = fs.readFileSync(path.join(NM, 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.asyncify.wasm'));
  const apache = fs.readFileSync(path.join(NM, '@huggingface', 'tokenizers', 'LICENSE'));
  const files = {
    'ort.webgpu.bundle.min.mjs': stripMap(fs.readFileSync(path.join(NM, 'onnxruntime-web', 'dist', 'ort.webgpu.bundle.min.mjs'))),
    'tokenizers.min.mjs': stripMap(fs.readFileSync(path.join(NM, '@huggingface', 'tokenizers', 'dist', 'tokenizers.min.mjs'))),
    'LICENSE-onnxruntime-web.txt': Buffer.from(MIT_ORT),
    'LICENSE-tokenizers.txt': apache,
    'LICENSE-modell.txt': Buffer.from(`Modell ${m.repo} (Commit ${m.revision}), Lizenz Apache-2.0; Basis XLM-RoBERTa (MIT).\nBearbeitet (Apache-2.0 Abschnitt 4 b): aus ${m.onnx} und tokenizer.json wurde das Vokabular auf ${m.vokabular.groesse} Teilwoerter gekuerzt (Zeilen der Einbettungs-Matrix entfernt, Tokenizer umnummeriert); alle uebrigen Gewichte unveraendert.\n\n` + apache.toString('utf8')),
    ...chunks('model', model),
    ...chunks('wasm', wasm),
    ...chunks('tokenizer', tok),
  };
  const teile = {};
  for (const [name, buf] of [['model', model], ['wasm', wasm], ['tokenizer', tok]]) {
    const n = Math.ceil(buf.length / CHUNK);
    teile[name] = { bytes: buf.length, n, sha256: sha256(buf) };
    if (decodeBack(files, name, n) !== teile[name].sha256) throw new Error(`${name}: Stuecke ergeben andere Bytes`);
  }
  files['inhalt.js'] = Buffer.from('// Erzeugt von scripts/build-ki.mjs - nicht von Hand aendern.\nself.DLX_KI_INHALT = ' +
    JSON.stringify({ revision: m.revision, labels: m.labels, teile }) + ';\n');
  return files;
}

// Abweichungen gegen PINS.json (leer = alles gleich).
export function verify(files) {
  const problems = [];
  const p = pins();
  const pk = packages();
  for (const name of PACKAGES) {
    const inst = JSON.parse(fs.readFileSync(path.join(NM, ...name.split('/'), 'package.json'), 'utf8')).version;
    if (!p.packages[name] || p.packages[name].version !== pk[name].version || p.packages[name].integrity !== pk[name].integrity) problems.push(`${name}: Version/Integrity weicht von PINS.json ab`);
    if (inst !== pk[name].version) problems.push(`${name}: installiert ${inst}, Lockfile ${pk[name].version} (npm ci --ignore-scripts)`);
  }
  // Auflage 4: Auswahl-Konfiguration und erzeugte Dateien gepinnt.
  if (!p.modell.erzeugt || p.modell.erzeugt.konfig !== configHash(p.modell.vokabular)) problems.push('Vokabular-Konfiguration ohne neue Pins geaendert (node scripts/build-ki.mjs --pins nach Review)');
  else if (lastErzeugt && JSON.stringify(p.modell.erzeugt) !== JSON.stringify(lastErzeugt)) problems.push('erzeugtes Modell/Tokenizer weicht von PINS.json ab');
  if (JSON.stringify(Object.keys(p.files).sort()) !== JSON.stringify(Object.keys(files).sort())) problems.push('Dateiliste weicht von PINS.json ab');
  for (const [rel, buf] of Object.entries(files)) if (p.files[rel] !== sha256(buf)) problems.push(`${rel}: Pruefsumme weicht von PINS.json ab`);
  return problems;
}

// Liegen im Vendor-Ordner genau die gepinnten Dateien mit gepinnter Pruefsumme?
export function verifyOut() {
  if (!fs.existsSync(PINS)) return ['PINS.json fehlt'];
  const p = pins();
  const problems = [];
  const found = [];
  const walk = (dir, pre) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), pre + e.name + '/');
      else if (pre + e.name !== 'PINS.json') found.push(pre + e.name);
    }
  };
  walk(OUT, '');
  for (const f of found) if (!Object.hasOwn(p.files, f)) problems.push(`vendor/ki/${f}: nicht gepinnt`);
  for (const [rel, h] of Object.entries(p.files)) {
    const fp = path.join(OUT, rel);
    if (!fs.existsSync(fp)) problems.push(`vendor/ki/${rel}: fehlt (npm ci --ignore-scripts && node scripts/build-ki.mjs)`);
    else if (sha256(fs.readFileSync(fp)) !== h) problems.push(`vendor/ki/${rel}: Pruefsumme falsch`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const files = await produce();
    if (process.argv.includes('--pins')) {
      const p = pins();
      // Nur Datei-Pruefsummen neu (z. B. andere Stueckgroesse): das erzeugte Modell muss den
      // Pins entsprechen; gewollter Modellwechsel = modell.erzeugt vorher entfernen (Auflage 6).
      if (p.modell.erzeugt && JSON.stringify(p.modell.erzeugt) !== JSON.stringify(lastErzeugt)) throw new Error('--pins: erzeugtes Modell weicht von PINS.json ab (modell.erzeugt nur nach Review entfernen)');
      p.packages = packages();
      p.modell.erzeugt = lastErzeugt;
      p.files = {};
      for (const rel of Object.keys(files).sort()) p.files[rel] = sha256(files[rel]);
      fs.writeFileSync(PINS, JSON.stringify(p, null, 2) + '\n');
    }
    const problems = verify(files);
    if (problems.length) { console.log('KI-DATEIEN ABGELEHNT:\n- ' + problems.join('\n- ')); process.exitCode = 1; }
    else {
      fs.rmSync(path.join(OUT, 'daten'), { recursive: true, force: true });
      for (const [rel, buf] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
        fs.writeFileSync(path.join(OUT, rel), buf);
      }
      const left = verifyOut();
      if (left.length) { console.log('KI-ORDNER FEHLERHAFT:\n- ' + left.join('\n- ')); process.exitCode = 1; }
      else console.log(`KI-Dateien OK: ${Object.keys(files).length} Dateien, ${(Object.values(files).reduce((a, b) => a + b.length, 0) / 1048576).toFixed(1)} MB`);
    }
  } catch (e) {
    console.log('KI-BUILD FEHLGESCHLAGEN: ' + e.message);
    process.exitCode = 1;
  }
}
