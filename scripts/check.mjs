// Schnellpruefung ohne Testlauf: Manifest-Rechte, Schema-Schluesselwoerter,
// Beispiel-JSON gegen Schema, ADMX/ADML aktuell. Aufruf: npm run check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, unknownKeywords } from './lib/schema.mjs';
import { build } from './build-admx.mjs';
import { manifestFor, renderDoc } from './build-aisites.mjs';
import { verify as verifyOcr, verifyOut as verifyOcrOut } from './build-ocr.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const m = JSON.parse(read('extension/manifest.json'));
const schema = JSON.parse(read('extension/managed_schema.json'));
const problems = [];

if (m.manifest_version !== 3) problems.push('manifest_version != 3');
// Rechte: nur storage und scripting; optionale Host-Rechte genau die Origins aus
// extension/common/aisites.js (Design-Review KI-Seiten 14.10.2026, Auflagen 1, 9).
// offscreen nur fuer die lokale Texterkennung in Bildern (Design-Review Bilder 14.10.2026).
// activeTab und declarativeContent nur fuer die Training-Ampel (Design-Review Training-Ampel 16.10.2026, Auflage 1).
// alarms nur fuer das Ende der Pause per Tastenkuerzel (Design-Review Alltag 14.10.2026, Auflage 8).
if (JSON.stringify(m.permissions) !== '["storage","scripting","offscreen","activeTab","declarativeContent","alarms"]') problems.push('permissions: nur "storage", "scripting", "offscreen", "activeTab", "declarativeContent" und "alarms" erlaubt');
// Tastenkuerzel: genau diese vier Befehle (Schwaerzen, Platzhalter, Pause, Popup), keine weiteren.
if (JSON.stringify(Object.keys(m.commands || {})) !== '["redact-all","placeholder-all","toggle-pause","_execute_action"]') problems.push('commands: nur redact-all, placeholder-all, toggle-pause und _execute_action erlaubt');
for (const k of ['host_permissions', 'optional_permissions', 'externally_connectable']) if (m[k]) problems.push(`${k} nicht erlaubt`);
// https://*/* nur genau einmal als optionales Recht fuer vertrauliche Quellen (Design-Review Antwort/Zwischenablage 16.10.2026, Auflage 23).
// permissions sind oben genau festgelegt; activeTab bleibt sonst ueberall verboten.
const mOhneQuellen = Object.assign({}, m, { permissions: undefined, optional_host_permissions: (m.optional_host_permissions || []).filter((o) => o !== 'https://*/*') });
if ((m.optional_host_permissions || []).filter((o) => o === 'https://*/*').length !== 1) problems.push('optional_host_permissions: https://*/* genau einmal erwartet');
for (const bad of ['<all_urls>', '*://', '://*/', 'activeTab', 'debugger', '"tabs"', 'webRequest', 'declarativeNetRequest']) if (JSON.stringify(mOhneQuellen).includes(bad)) problems.push(`${bad} nicht erlaubt`);
if (JSON.stringify(m) !== JSON.stringify(manifestFor(m))) problems.push('extension/manifest.json passt nicht zu aisites.js (npm run build)');
if (/frame-ancestors[^;]*\*/.test(m.content_security_policy.extension_pages)) problems.push('frame-ancestors mit Platzhalter');
if (read('docs/ki-seiten-liste.md').replace(/\r\n/g, '\n') !== renderDoc()) problems.push('docs/ki-seiten-liste.md veraltet (npm run build)');
if (!/connect-src 'none'/.test(m.content_security_policy.extension_pages)) problems.push("CSP ohne connect-src 'none'");
if (!/^script-src 'self' 'wasm-unsafe-eval';/.test(m.content_security_policy.extension_pages) || /(?<!wasm-)unsafe-eval|unsafe-inline/.test(m.content_security_policy.extension_pages)) problems.push("CSP: script-src nur 'self' 'wasm-unsafe-eval'");
if (/ocr|vendor/.test(JSON.stringify(m.web_accessible_resources))) problems.push('Texterkennung darf nie web_accessible sein');
// Nie Install-Skripte von Paketen (tesseract.js hat ein postinstall; Pflicht-Pruefung Bilder 14.10.2026).
if (!fs.existsSync(path.join(ROOT, '.npmrc')) || !/^ignore-scripts=true$/m.test(fs.readFileSync(path.join(ROOT, '.npmrc'), 'utf8'))) problems.push('.npmrc mit ignore-scripts=true fehlt');
// Texterkennung: aus node_modules neu erzeugen und mit PINS.json vergleichen (Auflage 12).
if (fs.existsSync(path.join(ROOT, 'node_modules', 'tesseract.js'))) {
  problems.push(...verifyOcr().map((p) => 'OCR: ' + p));
  if (fs.existsSync(path.join(ROOT, 'extension', 'vendor', 'ocr', 'worker.min.js'))) problems.push(...verifyOcrOut().map((p) => 'OCR: ' + p));
} else console.log('Hinweis: node_modules fehlt - Texterkennung nicht geprueft (npm ci --ignore-scripts && node scripts/build-ocr.mjs)');
problems.push(...unknownKeywords(schema).map((k) => `Schema: unbekanntes Schluesselwort ${k}`));
problems.push(...validate(schema, JSON.parse(read('enterprise/example-policy.json'))).map((e) => `example-policy.json: ${e}`));
for (const [rel, content] of Object.entries(build().files)) {
  if (read(`enterprise/admx/${rel}`).replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n')) problems.push(`enterprise/admx/${rel} veraltet (npm run build)`);
}

if (problems.length) { console.log('PRUEFUNG FEHLGESCHLAGEN:\n- ' + problems.join('\n- ')); process.exitCode = 1; }
else console.log('Pruefung OK: Manifest, Schema, Beispiel-JSON, ADMX/ADML, KI-Seiten, Texterkennung');
