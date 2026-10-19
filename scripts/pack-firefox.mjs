// Firefox-Paket (AMO-Format): baut alles neu wie scripts/pack-store.mjs, prueft und
// schreibt dist/aimori-<version>-firefox.zip; danach prueft addons-linter (Engine von
// web-ext lint) das ZIP offline. Nichts wird eingereicht oder signiert (Design-Review
// Firefox 17.10.2026, docs/sicherheit/design-review-firefox-17-10.md).
// Vorher: npm ci --ignore-scripts und npm ci --ignore-scripts --prefix tools/firefox-lint
//   node scripts/pack-firefox.mjs
// Gleicher Code wie fuer Chrome; nur das Manifest wird abgeleitet (firefoxManifest):
// ohne "key"/minimum_chrome_version, ohne die Rechte offscreen/declarativeContent
// (Firefox kennt sie nicht; background.js weicht aus), ohne use_dynamic_url,
// background.scripts statt service_worker, dazu browser_specific_settings.gecko.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect, manifestProblems, writeZip, readZip, step } from './pack-store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const DIST = path.join(ROOT, 'dist');
const LINTER = path.join(ROOT, 'tools', 'firefox-lint', 'node_modules', 'addons-linter', 'bin', 'addons-linter');
// Feste Kennung fuer Firefox; nach der ersten Signatur durch Mozilla nicht mehr aenderbar (docs/firefox.md).
export const GECKO_ID = 'dlx-extension@aimori';
// Firefox 140 (ESR): data_collection_permissions, storage.session, optional_host_permissions, sender.origin.
export const FIREFOX_MIN = '140.0';
export const MAX_BYTES = 200 * 1024 ** 2; // AMO: hoechstens 200 MB je Paket
export const MAX_JS = 4 * 1024 ** 2;      // AMO-Pruefung parst keine JS-Datei ueber 4 MB
const DROP_PERMISSIONS = ['offscreen', 'declarativeContent'];
// Bekannte Felder des Repo-Manifests; ein neues Feld bricht ab, bis es hier bewusst bewertet ist (Auflage 1).
const KNOWN = ['manifest_version', 'name', 'short_name', 'description', 'default_locale', 'version', 'minimum_chrome_version', 'key', 'permissions',
  'background', 'action', 'options_ui', 'icons', 'storage', 'content_scripts', 'web_accessible_resources', 'content_security_policy', 'optional_host_permissions',
  'commands'];   // Tastenkuerzel: Firefox kennt commands und _execute_action gleich (Alt+Shift+<Buchstabe>)

// Dateien aus dem importScripts-Aufruf in background.js (fester Aufbau, nur relative
// .js-Dateien des Pakets; alles andere bricht ab, Auflage 2) und zuletzt background.js.
export function backgroundScripts(bgSource, files) {
  const m = /^if \(typeof importScripts === 'function'\) importScripts\(\r?\n([\s\S]*?)\r?\n\);/m.exec(bgSource);
  if (!m) throw new Error('background.js: importScripts-Liste nicht gefunden');
  const items = m[1].split(/\r?\n/).map((l) => l.replace(/\s*\/\/.*$/, '')).join('').split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const it of items) {
    const q = /^'([a-z0-9][a-z0-9_-]*(?:\/[a-z0-9_-]+)*\.js)'$/i.exec(it);
    if (!q) throw new Error(`background.js: ungueltiger Eintrag ${it}`);
    if (!files.includes(q[1])) throw new Error(`background.js: Datei fehlt im Paket: ${q[1]}`);
    out.push(q[1]);
  }
  if (!out.length) throw new Error('background.js: importScripts-Liste leer');
  return [...out, 'background.js'];
}

// Firefox-Manifest aus dem Repo-Manifest (Text) und background.js (Text).
export function firefoxManifest(text, bgSource, files) {
  const src = JSON.parse(text);
  const unknown = Object.keys(src).filter((k) => !KNOWN.includes(k));
  if (unknown.length) throw new Error('Unbekannte Manifest-Felder (in scripts/pack-firefox.mjs bewerten): ' + unknown.join(', '));
  const m = structuredClone(src);
  delete m.key;
  delete m.minimum_chrome_version;
  m.permissions = (m.permissions || []).filter((p) => !DROP_PERMISSIONS.includes(p));
  m.background = { scripts: backgroundScripts(bgSource, files) };
  for (const w of m.web_accessible_resources || []) delete w.use_dynamic_url;
  m.browser_specific_settings = { gecko: { id: GECKO_ID, strict_min_version: FIREFOX_MIN, data_collection_permissions: { required: ['none'] } } };
  return JSON.stringify(m, null, 2) + '\n';
}

const subset = (a = [], b = []) => a.every((x) => b.includes(x));

// Firefox-Manifest hoechstens so weit wie das Repo-Manifest (Auflage 1) und Paket-Grenzen von AMO.
export function firefoxProblems(fx, repo, files, sizes = {}) {
  const problems = manifestProblems(fx, files);
  for (const k of Object.keys(fx)) if (k !== 'browser_specific_settings' && !(k in repo)) problems.push(`neues Manifest-Feld ${k}`);
  if (!subset(fx.permissions, repo.permissions)) problems.push('mehr Rechte als im Repo-Manifest');
  if (!subset(fx.optional_host_permissions, repo.optional_host_permissions)) problems.push('mehr optionale Host-Rechte als im Repo-Manifest');
  if (!subset(fx.host_permissions, repo.host_permissions)) problems.push('mehr Host-Rechte als im Repo-Manifest');
  const cs = (m) => (m.content_scripts || []).flatMap((c) => c.matches || []);
  if (!subset(cs(fx), cs(repo))) problems.push('content_scripts.matches breiter als im Repo-Manifest');
  const war = (m, f) => (m.web_accessible_resources || []).flatMap((w) => w[f] || []);
  if (!subset(war(fx, 'resources'), war(repo, 'resources')) || !subset(war(fx, 'matches'), war(repo, 'matches'))) problems.push('web_accessible_resources breiter als im Repo-Manifest');
  if (war(fx, 'resources').includes('ui/ocr.html')) problems.push('ui/ocr.html darf nie web_accessible sein');
  if (JSON.stringify(fx.content_security_policy) !== JSON.stringify(repo.content_security_policy)) problems.push('content_security_policy weicht vom Repo-Manifest ab');
  if (fx.background?.service_worker || !Array.isArray(fx.background?.scripts) || fx.background.scripts.at(-1) !== 'background.js') problems.push('background.scripts fehlt oder endet nicht mit background.js');
  for (const s of fx.background?.scripts || []) if (!files.includes(s)) problems.push(`background.scripts verweist auf fehlende Datei ${s}`);
  for (const p of DROP_PERMISSIONS) if ((fx.permissions || []).includes(p)) problems.push(`Recht ${p} gibt es in Firefox nicht`);
  const g = fx.browser_specific_settings?.gecko || {};
  if (g.id !== GECKO_ID || g.strict_min_version !== FIREFOX_MIN) problems.push('browser_specific_settings.gecko id/strict_min_version falsch');
  if (JSON.stringify(g.data_collection_permissions) !== JSON.stringify({ required: ['none'] })) problems.push('data_collection_permissions muss {required:["none"]} sein (connect-src none)');
  if (!/connect-src 'none'/.test(fx.content_security_policy?.extension_pages || '')) problems.push("data_collection_permissions none nur mit connect-src 'none'");
  for (const [f, n] of Object.entries(sizes)) if (/\.m?js$/.test(f) && n > MAX_JS) problems.push(`${f}: ${(n / 1048576).toFixed(1)} MB > 4 MB (AMO prueft groessere JS-Dateien nicht)`);
  return problems;
}

// Firmen-Rollout: policies.json fuer Firefox aus einer Richtlinie (gleiches Format wie
// managed_schema.json / enterprise/example-policy.json). Firefox reicht 3rdparty.Extensions[ID]
// als storage.managed an die Erweiterung durch; ExtensionSettings installiert sie fest
// (braucht eine von Mozilla signierte XPI; docs/deployment/firefox.md).
export function firefoxPolicies(policy, installUrl) {
  const u = new URL(installUrl);
  if (u.protocol !== 'https:') throw new Error('install_url muss https sein');
  return JSON.stringify({ policies: {
    ExtensionSettings: { [GECKO_ID]: { installation_mode: 'force_installed', install_url: u.href } },
    '3rdparty': { Extensions: { [GECKO_ID]: policy } },
  } }, null, 2) + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--policies') {
  //   node scripts/pack-firefox.mjs --policies <policy.json> --install-url <https-URL der XPI>   -> policies.json auf stdout
  const i = process.argv.indexOf('--install-url');
  if (!process.argv[3] || i < 0 || !process.argv[i + 1]) { console.log('Aufruf: --policies <policy.json> --install-url <https-URL>'); process.exit(1); }
  process.stdout.write(firefoxPolicies(JSON.parse(fs.readFileSync(path.resolve(process.argv[3]), 'utf8')), process.argv[i + 1]));
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!fs.existsSync(path.join(ROOT, 'node_modules', 'tesseract.js'))) { console.log('node_modules fehlt: zuerst npm ci --ignore-scripts'); process.exit(1); }
  if (!fs.existsSync(LINTER)) { console.log('Linter fehlt: zuerst npm ci --ignore-scripts --prefix tools/firefox-lint'); process.exit(1); }
  step('ADMX/ADML', ['scripts/build-admx.mjs']);
  step('Datentypen-Doku', ['scripts/build-datatypes-doc.mjs']);
  step('KI-Seiten', ['scripts/build-aisites.mjs']);
  step('Texterkennung', ['scripts/build-ocr.mjs']);
  step('Lokale KI', ['scripts/build-ki.mjs']);
  step('Pruefung (npm run check)', ['scripts/check.mjs']);
  const tests = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `tests/${f}`);
  step(`Tests (${tests.length} Dateien)`, ['--test', '--test-concurrency=8', ...tests]);

  console.log('\n== Paket (Firefox)');
  const repoText = fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8');
  const repo = JSON.parse(repoText);
  const names = collect();
  let manifestText;
  try { manifestText = firefoxManifest(repoText, fs.readFileSync(path.join(EXT, 'background.js'), 'utf8'), names); }
  catch (e) { console.log('PAKET ABGELEHNT: ' + e.message); process.exit(1); }
  const source = (n) => (n === 'manifest.json' ? Buffer.from(manifestText) : fs.readFileSync(path.join(EXT, n)));
  const sizes = Object.fromEntries(names.map((n) => [n, n === 'manifest.json' ? manifestText.length : fs.statSync(path.join(EXT, n)).size]));
  const problems = firefoxProblems(JSON.parse(manifestText), repo, names, sizes);
  if (problems.length) { console.log('PAKET ABGELEHNT:\n- ' + problems.join('\n- ')); process.exit(1); }

  fs.mkdirSync(DIST, { recursive: true });
  const out = path.join(DIST, `aimori-${repo.version}-firefox.zip`);
  writeZip(out, names.map((name) => ({ name, data: source(name) })));
  const zipBuf = fs.readFileSync(out);
  const back = readZip(zipBuf);
  const bad = names.filter((n) => !back.has(n) || !back.get(n).equals(source(n)));
  if (back.size !== names.length || bad.length) { console.log('ZIP FEHLERHAFT:\n- ' + bad.join('\n- ')); process.exit(1); }
  if (zipBuf.length > MAX_BYTES) { console.log(`ZIP zu gross fuer AMO: ${(zipBuf.length / 1048576).toFixed(0)} MB`); process.exit(1); }

  // addons-linter nur gegen das gebaute ZIP, offline, ohne Ziel-Code auszufuehren (Auflage 7).
  console.log('\n== addons-linter (web-ext lint)');
  const lint = spawnSync(process.execPath, [LINTER, '--output', 'json', '--boring', out], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1048576, windowsHide: true });
  let report;
  try { report = JSON.parse(lint.stdout); } catch (e) { console.log('Linter-Ausgabe unlesbar:\n' + (lint.stdout || '').slice(0, 2000) + (lint.stderr || '').slice(0, 2000)); process.exit(1); }
  const fmt = (x) => `${x.code}: ${x.message}${x.file ? ` (${x.file}${x.line ? ':' + x.line : ''})` : ''}`;
  for (const x of report.warnings || []) console.log('  Warnung ' + fmt(x));
  for (const x of report.notices || []) console.log('  Hinweis ' + fmt(x));
  if ((report.errors || []).length) { console.log('LINT-FEHLER:\n- ' + report.errors.map(fmt).join('\n- ')); process.exit(1); }
  console.log(`  0 Fehler, ${report.count?.warnings ?? (report.warnings || []).length} Warnungen, ${(report.notices || []).length} Hinweise`);

  const hash = crypto.createHash('sha256').update(zipBuf).digest('hex');
  fs.writeFileSync(out + '.sha256', `${hash}  ${path.basename(out)}\n`);
  console.log(`Paket OK: ${path.relative(ROOT, out)}`);
  console.log(`  ${names.length} Dateien, ${(zipBuf.length / 1048576).toFixed(1)} MB, SHA-256 ${hash}`);
  console.log(`  Version ${repo.version}, Firefox-ID ${GECKO_ID}, ab Firefox ${FIREFOX_MIN}; nicht signiert, nicht eingereicht.`);
}
