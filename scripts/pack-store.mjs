// Store-Paket fuer den Chrome Web Store: baut alles neu, prueft und schreibt
// dist/aimori-<version>-chrome.zip mit manifest.json im ZIP-Wurzelordner.
// Vorher: npm ci --ignore-scripts (nie npm install, nie Install-Skripte).
//   node scripts/pack-store.mjs                      bauen, pruefen, ZIP ohne "key"
//   node scripts/pack-store.mjs --key-pem <datei>    zusaetzlich key.pem in die ZIP-Wurzel
//                                                    (nur fuer den ersten Upload, damit der Store
//                                                    die Entwicklungs-ID uebernimmt; ZIP dann vertraulich)
// Der Store lehnt das Manifest-Feld "key" ab und signiert selbst; ohne key.pem vergibt er
// eine eigene ID (dann erweiterung.chrome.id fuer die Richtlinien setzen, docs/fuer-unternehmen.md).
// Das ZIP ist reproduzierbar: Dateien sortiert, feste Zeitstempel, nach dem Schreiben
// zurueckgelesen und Datei fuer Datei gegen die Quelle verglichen.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const DIST = path.join(ROOT, 'dist');
const MAX_BYTES = 2 * 1024 ** 3; // Chrome Web Store: hoechstens 2 GB (docs/ki-erkennung.md)
const SKIP_FILE = /^(\.|Thumbs\.db$|desktop\.ini$)|\.(pem|crx|key|map|zip)$/i;
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, feste Zeit fuer gleiche Pakete

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// Erweiterungs-ID aus dem oeffentlichen Schluessel (base64 SPKI): erste 16 Bytes SHA-256, Hex 0-f -> a-p.
export const extensionId = (keyB64) => sha256(Buffer.from(keyB64, 'base64')).slice(0, 32).replace(/[0-9a-f]/g, (h) => String.fromCharCode(97 + parseInt(h, 16)));

// Alle Dateien der Erweiterung, relativ mit "/" und sortiert; ohne versteckte Dateien, Schluessel und Pakete.
export function collect(dir = EXT) {
  const out = [];
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (SKIP_FILE.test(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk(dir, '');
  return out.sort();
}

// Manifest fuer den Store: gleich wie im Repo, nur ohne "key".
export function storeManifest(text) {
  const m = JSON.parse(text);
  delete m.key;
  return JSON.stringify(m, null, 2) + '\n';
}

// Prueft, ob alles, worauf das Manifest zeigt, im Paket liegt.
export function manifestProblems(m, files) {
  const have = new Set(files);
  const problems = [];
  if (m.manifest_version !== 3) problems.push('manifest_version ist nicht 3');
  if ('key' in m) problems.push('Feld "key" im Store-Manifest');
  if (!/^\d+(\.\d+){0,3}$/.test(m.version || '')) problems.push(`version "${m.version}" ungueltig (1-4 Zahlen mit Punkt)`);
  const refs = [
    m.background?.service_worker, m.action?.default_popup, m.options_ui?.page, m.storage?.managed_schema,
    ...Object.values(m.icons || {}), ...Object.values(m.action?.default_icon || {}),
    ...(m.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
    ...(m.web_accessible_resources || []).flatMap((w) => w.resources || []),
    m.default_locale && `_locales/${m.default_locale}/messages.json`,
  ].filter(Boolean);
  for (const r of refs) if (!have.has(r)) problems.push(`Manifest verweist auf fehlende Datei ${r}`);
  for (const v of ['vendor/ki/', 'vendor/ocr/']) {
    if (!files.some((f) => f.startsWith(v) && !f.endsWith('PINS.json'))) problems.push(`${v} leer (Build-Skript nicht gelaufen)`);
  }
  return problems;
}

// Schreibt ein ZIP (Deflate, UTF-8-Namen) aus [{ name, data }] in die Datei out.
export function writeZip(out, entries) {
  if (entries.length > 0xffff) throw new Error('zu viele Dateien fuer ZIP ohne ZIP64');
  const fd = fs.openSync(out, 'w');
  const central = [];
  let offset = 0;
  const put = (buf) => { fs.writeSync(fd, buf); offset += buf.length; };
  try {
    for (const { name, data } of entries) {
      const nameBuf = Buffer.from(name, 'utf8');
      const packed = zlib.deflateRawSync(data, { level: 9 });
      const method = packed.length < data.length ? 8 : 0;
      const body = method ? packed : data;
      const crc = crc32(data);
      if (offset + body.length > 0xffffffff) throw new Error('ZIP groesser als 4 GB');
      const head = Buffer.alloc(30);
      head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6);
      head.writeUInt16LE(method, 8); head.writeUInt16LE(0, 10); head.writeUInt16LE(DOS_DATE, 12);
      head.writeUInt32LE(crc, 14); head.writeUInt32LE(body.length, 18); head.writeUInt32LE(data.length, 22);
      head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8);
      cd.writeUInt16LE(method, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(DOS_DATE, 14);
      cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(data.length, 24);
      cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(offset, 42);
      central.push(cd, nameBuf);
      put(head); put(nameBuf); put(body);
    }
    const cdStart = offset;
    for (const b of central) put(b);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(offset - cdStart, 12); end.writeUInt32LE(cdStart, 16);
    put(end);
  } finally { fs.closeSync(fd); }
}

// Liest ein ZIP aus writeZip zurueck: Map name -> Buffer, mit CRC-Pruefung.
export function readZip(buf) {
  const e = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (e < 0) throw new Error('kein ZIP-Ende gefunden');
  const count = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Zentralverzeichnis defekt');
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const body = buf.subarray(start, start + size);
    const data = method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body);
    if (crc32(data) !== crc) throw new Error(`${name}: Pruefsumme falsch`);
    files.set(name, data);
    p += 46 + nameLen + extra + comment;
  }
  return files;
}

// Oeffentlicher Schluessel (base64 SPKI) zu einer privaten PEM-Datei.
export const publicKeyOf = (pem) => crypto.createPublicKey(crypto.createPrivateKey(pem)).export({ type: 'spki', format: 'der' }).toString('base64');

function step(title, args) {
  console.log(`\n== ${title}`);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) { console.log(`\nABGEBROCHEN bei: ${title}`); process.exit(1); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--key-pem');
  const pemPath = i > 0 ? process.argv[i + 1] : null;
  if (i > 0 && !pemPath) { console.log('--key-pem braucht einen Dateipfad'); process.exit(1); }
  if (!fs.existsSync(path.join(ROOT, 'node_modules', 'tesseract.js'))) {
    console.log('node_modules fehlt: zuerst npm ci --ignore-scripts'); process.exit(1);
  }
  const repoManifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  let pem = null;
  if (pemPath) {
    pem = fs.readFileSync(path.resolve(pemPath));
    if (publicKeyOf(pem) !== repoManifest.key) { console.log('key.pem passt nicht zum Feld "key" im Manifest'); process.exit(1); }
  }

  step('ADMX/ADML', ['scripts/build-admx.mjs']);
  step('Datentypen-Doku', ['scripts/build-datatypes-doc.mjs']);
  step('KI-Seiten', ['scripts/build-aisites.mjs']);
  step('Texterkennung', ['scripts/build-ocr.mjs']);
  step('Lokale KI', ['scripts/build-ki.mjs']);
  step('Pruefung (npm run check)', ['scripts/check.mjs']);
  const tests = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `tests/${f}`);
  step(`Tests (${tests.length} Dateien)`, ['--test', '--test-concurrency=8', ...tests]);

  console.log('\n== Paket');
  const names = collect();
  const manifestText = storeManifest(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const problems = manifestProblems(JSON.parse(manifestText), names);
  if (problems.length) { console.log('PAKET ABGELEHNT:\n- ' + problems.join('\n- ')); process.exit(1); }
  // Lizenz des Projekts (AGPL-3.0) liegt als LICENSE.txt in der ZIP-Wurzel.
  if (names.includes('LICENSE.txt')) { console.log('PAKET ABGELEHNT: extension/LICENSE.txt kollidiert mit der Projektlizenz'); process.exit(1); }
  const source = (n) => (n === 'manifest.json' ? Buffer.from(manifestText) : n === 'key.pem' ? pem
    : n === 'LICENSE.txt' ? fs.readFileSync(path.join(ROOT, 'LICENSE')) : fs.readFileSync(path.join(EXT, n)));
  const all = [...names, 'LICENSE.txt', ...(pem ? ['key.pem'] : [])].sort();

  fs.mkdirSync(DIST, { recursive: true });
  const out = path.join(DIST, `aimori-${repoManifest.version}-chrome${pem ? '-mit-schluessel' : ''}.zip`);
  writeZip(out, all.map((name) => ({ name, data: source(name) })));

  const zipBuf = fs.readFileSync(out);
  const back = readZip(zipBuf);
  const bad = all.filter((n) => !back.has(n) || !back.get(n).equals(source(n)));
  if (back.size !== all.length || bad.length) { console.log('ZIP FEHLERHAFT:\n- ' + bad.join('\n- ')); process.exit(1); }
  if ('key' in JSON.parse(back.get('manifest.json'))) { console.log('ZIP FEHLERHAFT: "key" im Manifest'); process.exit(1); }
  if (zipBuf.length > MAX_BYTES) { console.log(`ZIP zu gross fuer den Store: ${(zipBuf.length / 1048576).toFixed(0)} MB`); process.exit(1); }

  const hash = sha256(zipBuf);
  fs.writeFileSync(out + '.sha256', `${hash}  ${path.basename(out)}\n`);
  console.log(`Paket OK: ${path.relative(ROOT, out)}`);
  console.log(`  ${all.length} Dateien, ${(zipBuf.length / 1048576).toFixed(1)} MB, SHA-256 ${hash}`);
  console.log(`  Version ${repoManifest.version}, Entwicklungs-ID ${extensionId(repoManifest.key)}`);
  if (pem) console.log('  ACHTUNG: ZIP enthaelt den privaten Schluessel - nur fuer den ersten Upload, danach loeschen, nie weitergeben.');
  else console.log('  Ohne key.pem vergibt der Store eine eigene ID (Richtlinien: erweiterung.chrome.id).');
}
