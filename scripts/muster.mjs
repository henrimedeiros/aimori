// Gemeinschafts-Muster: Pruefpipeline, Signatur und Bau des Bundles.
// Katalog muster/katalog.json -> (Pruefung, Ed25519-Signatur muster/katalog.sig) ->
// extension/engine/packs-community.js. Kein Netz, keine Abhaengigkeiten; Ausgaben nur
// Ids, Zahlen und feste Fehlercodes (nie Testwerte). Doku: docs/muster-mitmachen.md.
//
//   node scripts/muster.mjs pruefen [--katalog <datei>] [--signatur] [--release] [--ohne-fehlalarm]
//   node scripts/muster.mjs bauen [--release]        nur mit gueltiger Signatur eines vertrauten Schluessels
//   node scripts/muster.mjs signieren --schluessel <datei.key>   NUR Maintainer im eigenen Terminal
//   node scripts/muster.mjs schluessel <ordner ausserhalb aller Repos> [--name <name>]
//   node scripts/muster.mjs fingerabdruck <datei.pub>
//
// Design-Review Muster 16.10.2026 (docs/sicherheit/design-review-muster.md), Auflagen 1-12.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, EXT, ENGINE_FILES, load } from '../tests/helpers/load.mjs';
import { validate as schemaValidate } from './lib/schema.mjs';

export const KATALOG = path.join(ROOT, 'muster', 'katalog.json');
export const SIGNATUR = path.join(ROOT, 'muster', 'katalog.sig');
export const SCHEMA = path.join(ROOT, 'muster', 'katalog.schema.json');
export const SCHLUESSEL = path.join(ROOT, 'muster', 'schluessel');
export const BUNDLE = path.join(EXT, 'engine', 'packs-community.js');

// Vertrauensanker (Auflage 1): nur diese Fingerabdruecke (SHA-256 des SPKI-DER) gelten,
// egal welche .pub-Dateien im Ordner liegen. Aenderung nur per Erweiterungs-Update;
// die CI bricht ab, sobald ein PR scripts/ aendert.
// art 'dev': Einweg-Entwicklungsschluessel (privater Teil nie gespeichert, 16.10.2026) -
// gilt fuer npm test und Entwicklungs-Builds, nie fuer bauen --release (Auflage 2).
export const VERTRAUT = [
  { fp: '8ce769d5caa436c5b23c26edce22219a4feff928ca87247fb6e07185676ed959', art: 'dev', name: 'entwicklung-2026-10' },
];

export const LIZENZEN = ['Apache-2.0', 'MIT', 'BSD-2-Clause', 'BSD-3-Clause'];
const MAX_MUSTER = 200;
const MIN_TESTS = 3;
const MAX_TESTS = 30;
const LAST_LEN = 100000;    // Zeichen je boesartiger Eingabe (Auflage 6)
const LAST_MS = 100;        // hoechstens so lange je Eingabe und Muster

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
// Signiert und gehasht wird der Katalog mit LF-Zeilenenden (autocrlf auf Windows).
export const katalogBytes = (file = KATALOG) => Buffer.from(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), 'utf8');

// --- Laden --------------------------------------------------------------------
// Engine ohne das gebuendelte Paket, dafuer mit dem uebergebenen Katalog (PR-Stand).
export function loadMitKatalog(katalog) {
  const DLX = load(ENGINE_FILES.filter((f) => f !== 'engine/packs-community.js'));
  DLX.muster.register(katalog || { muster: [] });
  return DLX;
}

// --- Signatur -----------------------------------------------------------------
export function fingerprint(pub) {
  const key = typeof pub === 'string' ? crypto.createPublicKey(pub) : pub;
  return sha256(key.export({ type: 'spki', format: 'der' }));
}

// Liefert { ok, fp, art } oder { ok: false, err }.
export function pruefeSignatur({ release = false, katalog = KATALOG, signatur = SIGNATUR } = {}) {
  let sig;
  try { sig = JSON.parse(fs.readFileSync(signatur, 'utf8')); } catch { return { ok: false, err: 'signatur_fehlt' }; }
  if (!sig || sig.format !== 1 || typeof sig.schluessel !== 'string' || typeof sig.signatur !== 'string') return { ok: false, err: 'signatur_format' };
  const anker = VERTRAUT.find((v) => v.fp === sig.schluessel);
  if (!anker) return { ok: false, err: 'schluessel_nicht_vertraut' };
  if (release && anker.art !== 'release') return { ok: false, err: 'kein_release_schluessel' };
  let pub = null;
  for (const f of fs.existsSync(SCHLUESSEL) ? fs.readdirSync(SCHLUESSEL) : []) {
    if (!f.endsWith('.pub')) continue;
    try {
      const k = crypto.createPublicKey(fs.readFileSync(path.join(SCHLUESSEL, f), 'utf8'));
      if (k.asymmetricKeyType === 'ed25519' && fingerprint(k) === anker.fp) pub = k;
    } catch { /* ungueltige Datei zaehlt nicht */ }
  }
  if (!pub) return { ok: false, err: 'schluessel_fehlt' };
  const ok = crypto.verify(null, katalogBytes(katalog), pub, Buffer.from(sig.signatur, 'base64'));
  return ok ? { ok: true, fp: anker.fp, art: anker.art } : { ok: false, err: 'signatur_ungueltig' };
}

export function signiere(privKey, katalog = KATALOG) {
  const pub = crypto.createPublicKey(privKey);
  if (pub.asymmetricKeyType !== 'ed25519') throw new Error('kein Ed25519-Schluessel');
  const signatur = crypto.sign(null, katalogBytes(katalog), privKey).toString('base64');
  return JSON.stringify({ format: 1, schluessel: fingerprint(pub), signatur }, null, 2) + '\n';
}

// --- Bundle (Auflage 7: nur Laufzeitfelder, keine Tests/Lizenz/Quelle) -----------
const LAUFZEIT = ['id', 'name', 'cat', 'cls', 'regex', 'flags', 'validator', 'ctx', 'needsCtx', 'ohneKontextSicher'];
export function bundleText(katalog, bytes, sig) {
  const muster = katalog.muster.map((e) => Object.fromEntries(LAUFZEIT.filter((k) => e[k] !== undefined).map((k) => [k, e[k]])));
  const data = JSON.stringify({ version: katalog.version, muster }, null, 1);
  return [
    '// Automatisch erzeugt aus muster/katalog.json mit `node scripts/muster.mjs bauen` - nicht von Hand aendern.',
    `// Katalog ${katalog.version}, SHA-256 ${sha256(bytes)}, signiert mit Schluessel ${sig.fp} (${sig.art}).`,
    '// Nur Daten: Regex-Quellen werden in engine/muster.js statisch geprueft (safeRegex), nichts wird nachgeladen.',
    '(function (g) {',
    "  'use strict';",
    '  g.DLX.muster.register(' + data.replace(/\n/g, '\n  ') + ');',
    '})(globalThis);',
    '',
  ].join('\n');
}

// --- Pruefung -------------------------------------------------------------------
const DOMAIN_RE = /\b(?:[a-z0-9-]{1,63}\.){1,8}[a-z]{2,24}\b/gi;
const IPV4_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const SYNTH_DOMAIN = /(?:^|\.)(?:example\.(?:com|org|net)|example|test|invalid|localhost)$/i;
const DOC_IP = /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/;
// Testwerte nur synthetisch (Auflage 9): Domains nur example.*/.test/.invalid oder wenn sie
// woertlich im Muster stehen (Dienst-Hosts wie bei Webhook-URLs), IPv4 nur Doku-Bereiche.
function synthetischOk(text, regex) {
  for (const m of text.matchAll(DOMAIN_RE)) {
    const d = m[0].toLowerCase();
    if (/^\d+(?:\.\d+)+$/.test(d)) continue;
    if (!SYNTH_DOMAIN.test(d) && regex.indexOf(d.replace(/\./g, '\\.')) === -1) return false;
  }
  for (const m of text.matchAll(IPV4_RE)) if (!DOC_IP.test(m[0])) return false;
  return true;
}

// Boesartige Eingaben aus den eigenen Zeichen des Musters (Auflage 6): Testwert, Testwert
// ohne letztes Zeichen, erste Haelfte und jedes einzelne Zeichen, je auf LAST_LEN wiederholt.
function lastEingaben(e) {
  const out = new Set();
  const fill = (s) => (s ? s.repeat(Math.ceil(LAST_LEN / s.length)).slice(0, LAST_LEN) : '');
  for (const p of e.tests.positiv) {
    out.add(fill(p));
    out.add(fill(p.slice(0, -1)));
    out.add(fill(p.slice(0, Math.max(1, p.length >> 1))));
    for (const c of new Set(p)) out.add(fill(c));
  }
  out.delete('');
  return [...out];
}

// Liefert { fehler: ['<id>: <code>'], zahlen } - nie Testwerte oder Regex-Teile.
export function pruefeKatalog(katalog, { fehlalarm = true, katalogDatei = null } = {}) {
  const fehler = [];
  const zahlen = { muster: 0, positiv: 0, negativ: 0, last: 0 };
  const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
  const sErr = schemaValidate(schema, katalog);
  if (sErr.length) return { fehler: sErr.map((x) => 'schema ' + x.replace(/:.*$/, '')), zahlen };
  if (katalog.format !== 1 || typeof katalog.version !== 'string' || !Array.isArray(katalog.muster)) return { fehler: ['katalog: format'], zahlen };
  if (katalog.muster.length > MAX_MUSTER) fehler.push('katalog: zu_viele_muster');
  const DLX = loadMitKatalog({ muster: [] });
  const builtin = new Set(DLX.engine.allDetectors().map((d) => d.id).concat(['dictionary', 'custom_term', 'internal_link', 'unscannable']));
  const quellen = new Map(DLX.engine.allDetectors().map((d) => [d.re.source, d.id]));   // gleiche Regex wie ein eingebauter Typ
  const ids = new Set();
  const ok = [];
  for (const [i, e] of katalog.muster.entries()) {
    const id = e && typeof e.id === 'string' && /^cm_[a-z0-9_]{2,40}$/.test(e.id) ? e.id : '#' + i;
    zahlen.muster++;
    if (builtin.has(e.id) || ids.has(e.id)) { fehler.push(`${id}: id_kollision`); continue; }
    ids.add(e.id);
    const r = DLX.muster.compileCatalog(e);
    if (r.err) { fehler.push(`${id}: ${r.err}`); continue; }
    if (quellen.has(e.regex)) fehler.push(`${id}: doppelt_zu_${quellen.get(e.regex)}`);
    if (LIZENZEN.indexOf(e.lizenz) === -1) fehler.push(`${id}: lizenz`);
    if (!DLX.muster.textOk(e.quelle, 200)) fehler.push(`${id}: quelle`);
    const t = e.tests || {};
    const listeOk = (l) => Array.isArray(l) && l.length >= MIN_TESTS && l.length <= MAX_TESTS && l.every((x) => typeof x === 'string' && x.length >= 1 && x.length <= 300);
    if (!listeOk(t.positiv) || !listeOk(t.negativ)) { fehler.push(`${id}: tests_anzahl`); continue; }
    t.positiv.concat(t.negativ).forEach((x, k) => { if (!synthetischOk(x, e.regex)) fehler.push(`${id}: test_${k + 1}_nicht_synthetisch`); });
    ok.push(e);
  }
  // Treffer, Nicht-Treffer und Lasttest je Muster einzeln (alle anderen aus).
  const DLX2 = loadMitKatalog({ version: katalog.version, muster: ok });
  const alleAus = Object.fromEntries(ok.map((e) => [e.id, 'off']));
  // Doppelt: deckt derselbe eingebaute Datentyp mindestens die Haelfte der Positiv-Testwerte
  // an derselben Stelle ab, bringt das Muster nichts Neues (eingebaute Typen haben Vorrang).
  const eingebaut = { packs: Object.keys(DLX.packs).filter((p) => p !== 'community'), rules: Object.fromEntries([...builtin].map((id) => [id, 'warn'])) };
  for (const e of ok) {
    const cfg = { packs: ['community'], rules: Object.assign({}, alleAus, { [e.id]: 'warn' }) };
    e.tests.positiv.forEach((x, k) => {
      zahlen.positiv++;
      if (!DLX2.engine.scan(x, cfg).findings.some((f) => f.id === e.id)) fehler.push(`${e.id}: positiv_${k + 1}_nicht_erkannt`);
    });
    const doppelt = {};
    for (const x of e.tests.positiv) {
      const c = DLX2.engine.scan(x, cfg).findings.find((f) => f.id === e.id);
      const d = c && DLX.engine.scan(x, eingebaut).findings.find((f) => f.start <= c.start && f.end >= c.end);
      if (d) doppelt[d.id] = (doppelt[d.id] || 0) + 1;
    }
    for (const [b, n] of Object.entries(doppelt)) if (2 * n >= e.tests.positiv.length) fehler.push(`${e.id}: doppelt_zu_${b}`);
    e.tests.negativ.forEach((x, k) => {
      zahlen.negativ++;
      if (DLX2.engine.scan(x, cfg).findings.some((f) => f.id === e.id)) fehler.push(`${e.id}: negativ_${k + 1}_erkannt`);
    });
    let max = 0;
    for (const x of lastEingaben(e)) {
      zahlen.last++;
      const t0 = performance.now();
      const r = DLX2.engine.scan(x, cfg);
      const ms = performance.now() - t0;
      max = Math.max(max, ms);
      if (r.unscannable || ms > LAST_MS) { fehler.push(`${e.id}: lasttest_${Math.round(ms)}ms`); break; }
    }
    zahlen['last_ms_' + e.id] = Math.round(max * 10) / 10;
  }
  // Fehlalarmrate ueber den bestehenden Korpus (scripts/fehlalarm.mjs, gleiche Zielwerte):
  // kein Gemeinschafts-Muster darf dort sicher melden.
  if (fehlalarm && ok.length) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'fehlalarm.mjs'), '--schnell', '--json', '--katalog', katalogDatei || KATALOG],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    let j = null;
    try { j = JSON.parse(r.stdout); } catch { fehler.push('fehlalarm: messung_fehlgeschlagen'); }
    if (j) {
      const sicher = {};
      const add = (types) => { for (const [id, c] of Object.entries(types)) if (/^cm_/.test(id)) sicher[id] = (sicher[id] || 0) + c.sicher; };
      for (const g of ['zufall', 'arten', 'kontext']) for (const x of Object.values(j.result[g] || {})) add(x.types);
      zahlen.fehlalarm_proben = Object.values(j.result.zufall).concat(Object.values(j.result.arten), Object.values(j.result.kontext || {})).reduce((a, x) => a + x.n, 0);
      for (const [id, n] of Object.entries(sicher)) if (n > 0) fehler.push(`${id}: fehlalarm_${n}`);
      zahlen.fehlalarm_sicher = Object.values(sicher).reduce((a, n) => a + n, 0);
    }
  }
  return { fehler, zahlen };
}

// --- Schluessel (nur Maintainer, eigenes Terminal; Auflage 3) ---------------------
const KDF = { N: 2 ** 17, r: 8, p: 1, maxmem: 512 * 1024 * 1024 };
function liesGeheimnis(frage) {
  // Ohne Echo von der Konsole bzw. erste Zeile von stdin; nie Argument oder Umgebung.
  process.stderr.write(frage);
  if (!process.stdin.isTTY) return fs.readFileSync(0, 'utf8').split(/\r?\n/)[0];
  process.stdin.setRawMode(true);
  let s = '';
  const buf = Buffer.alloc(1);
  for (;;) {
    let n = 0;
    try { n = fs.readSync(0, buf, 0, 1, null); } catch (e) { if (e.code === 'EAGAIN') continue; throw e; }
    if (!n) break;
    const c = buf.toString('utf8');
    if (c === '\r' || c === '\n') break;
    if (c === '\u0003') { process.stdin.setRawMode(false); process.exit(130); }
    if (c === '\u007f' || c === '\b') s = s.slice(0, -1); else s += c;
  }
  process.stdin.setRawMode(false);
  process.stderr.write('\n');
  return s;
}
// Zusaetzlich gesperrte Ablageorte je Arbeitsplatz, nur lokal in .git/config (nie veroeffentlicht):
//   git config --add muster.sperrordner <ordner>
function gesperrteOrdner() {
  const r = spawnSync('git', ['-C', ROOT, 'config', '--get-all', 'muster.sperrordner'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.split(/\r?\n/).filter(Boolean).map(normPfad) : [];
}
function normPfad(p) {
  const s = path.resolve(p).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? s.toLowerCase() : s;
}
function ausserhalbRepos(dir) {
  const abs = path.resolve(dir);
  const n = normPfad(dir);
  if (gesperrteOrdner().some((g) => n === g || n.startsWith(g + path.sep))) return false;
  for (let d = abs; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return false;
    if (path.dirname(d) === d) return true;
  }
}
export function verschluessele(privKey, pass) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const k = crypto.scryptSync(pass, salt, 32, KDF);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const data = Buffer.concat([c.update(privKey.export({ type: 'pkcs8', format: 'der' })), c.final()]);
  return JSON.stringify({ format: 'dlx-signierschluessel-1', kdf: { name: 'scrypt', N: KDF.N, r: KDF.r, p: KDF.p, salt: salt.toString('base64') },
    cipher: 'aes-256-gcm', iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), pkcs8: data.toString('base64') }) + '\n';
}
export function entschluessele(text, pass) {
  const j = JSON.parse(text);
  if (j.format !== 'dlx-signierschluessel-1' || j.kdf.name !== 'scrypt' || j.cipher !== 'aes-256-gcm') throw new Error('unbekanntes Schluesselformat');
  const k = crypto.scryptSync(pass, Buffer.from(j.kdf.salt, 'base64'), 32, { N: j.kdf.N, r: j.kdf.r, p: j.kdf.p, maxmem: KDF.maxmem });
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(j.iv, 'base64'));
  d.setAuthTag(Buffer.from(j.tag, 'base64'));
  const der = Buffer.concat([d.update(Buffer.from(j.pkcs8, 'base64')), d.final()]);
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

// --- Befehle --------------------------------------------------------------------
function arg(name) { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1]; }
const flag = (name) => process.argv.includes(name);

function main() {
  const cmd = process.argv[2];
  if (cmd === 'pruefen') {
    const datei = arg('--katalog') ? path.resolve(arg('--katalog')) : KATALOG;
    let katalog;
    try { katalog = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { console.log('FEHLER katalog: json'); process.exitCode = 1; return; }
    const { fehler, zahlen } = pruefeKatalog(katalog, { fehlalarm: !flag('--ohne-fehlalarm'), katalogDatei: datei });
    if (flag('--signatur') || flag('--release')) {
      const s = pruefeSignatur({ release: flag('--release'), katalog: datei });
      if (!s.ok) fehler.push('signatur: ' + s.err);
    }
    console.log(Object.entries(zahlen).map(([k, v]) => `${k}=${v}`).join(' '));
    if (fehler.length) { console.log('FEHLER\n- ' + fehler.join('\n- ')); process.exitCode = 1; } else console.log('OK');
    return;
  }
  if (cmd === 'bauen') {
    const s = pruefeSignatur({ release: flag('--release') });
    if (!s.ok) { console.log('FEHLER signatur: ' + s.err); process.exitCode = 1; return; }
    const bytes = katalogBytes();
    const katalog = JSON.parse(bytes.toString('utf8'));
    const { fehler } = pruefeKatalog(katalog, { fehlalarm: false });
    if (fehler.length) { console.log('FEHLER\n- ' + fehler.join('\n- ')); process.exitCode = 1; return; }
    fs.writeFileSync(BUNDLE, bundleText(katalog, bytes, s));
    console.log(`OK ${path.relative(ROOT, BUNDLE)} (${katalog.muster.length} Muster, Schluessel ${s.art})`);
    return;
  }
  if (cmd === 'signieren') {
    const datei = arg('--schluessel');
    if (!datei) { console.log('Aufruf: signieren --schluessel <datei.key>'); process.exitCode = 1; return; }
    const priv = entschluessele(fs.readFileSync(datei, 'utf8'), liesGeheimnis('Passphrase: '));
    const text = signiere(priv);
    const fp = JSON.parse(text).schluessel;
    if (!VERTRAUT.some((v) => v.fp === fp)) console.log('Hinweis: Schluessel steht nicht in VERTRAUT (scripts/muster.mjs) - Fingerabdruck ' + fp);
    fs.writeFileSync(SIGNATUR, text);
    console.log('OK muster/katalog.sig');
    return;
  }
  if (cmd === 'schluessel') {
    const dir = process.argv[3];
    const name = arg('--name') || 'release';
    if (!dir || !/^[a-z0-9-]{3,40}$/.test(name)) { console.log('Aufruf: schluessel <ordner> [--name <name>]'); process.exitCode = 1; return; }
    if (!ausserhalbRepos(dir)) { console.log('FEHLER: Ordner liegt in einem Repo oder in einem gesperrten Ordner (git config muster.sperrordner)'); process.exitCode = 1; return; }
    const p1 = liesGeheimnis('Neue Passphrase (mind. 12 Zeichen): ');
    const p2 = process.stdin.isTTY ? liesGeheimnis('Wiederholen: ') : p1;
    if (p1.length < 12 || p1 !== p2) { console.log('FEHLER: Passphrase zu kurz oder ungleich'); process.exitCode = 1; return; }
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    fs.mkdirSync(dir, { recursive: true });
    const keyFile = path.join(dir, name + '.key');
    if (fs.existsSync(keyFile)) { console.log('FEHLER: Datei existiert schon'); process.exitCode = 1; return; }
    fs.writeFileSync(keyFile, verschluessele(privateKey, p1), { mode: 0o600 });
    fs.writeFileSync(path.join(dir, name + '.pub'), publicKey.export({ type: 'spki', format: 'pem' }));
    console.log(`OK ${name}.key und ${name}.pub, Fingerabdruck ${fingerprint(publicKey)}`);
    return;
  }
  if (cmd === 'fingerabdruck') {
    console.log(fingerprint(fs.readFileSync(process.argv[3], 'utf8')));
    return;
  }
  console.log('Befehle: pruefen | bauen | signieren | schluessel | fingerabdruck (Kopfkommentar)');
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
