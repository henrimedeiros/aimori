// Quelltext-Waechter (Auflagen B7, B17, A13, Namensregel):
// kein Netzwerk-, Eval- oder HTML-Injektionscode und kein console.* im
// Erweiterungscode; kein privater Schluessel im Repo; Produktname nur in
// branding.js und _locales.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, EXT } from './helpers/load.mjs';

// Feste Liste uebersprungener Ordner; dazu lokale Arbeitskopien nur im Hauptordner
// (Muster wie in .gitignore: /.*-arbeitskopien/, eigenstaendige Kopien des Repos).
const SKIP = new Set(['node_modules', '.git', '.handtest-profil', '.handtest-ergebnis']);
const ARBEITSKOPIEN = /^\.[a-z0-9]+-arbeitskopien$/;
const skip = (dir, name) => SKIP.has(name) || (dir === ROOT && ARBEITSKOPIEN.test(name));

function files(dir, filter) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'tmp' || skip(dir, e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

// Ausnahme nur extension/vendor/ocr: gepinnte Fremd-Dateien der Texterkennung, per
// Pruefsumme gesichert (tests/bild.test.mjs, Design-Review Bilder 14.10.2026).
const VENDOR = path.join(EXT, 'vendor', 'ocr');
const extCode = files(EXT, (p) => /\.(js|html)$/.test(p) && !p.startsWith(VENDOR + path.sep));

const FORBIDDEN = [
  ['fetch', /\bfetch\s*\(/], ['XMLHttpRequest', /XMLHttpRequest/], ['WebSocket', /WebSocket/], ['sendBeacon', /sendBeacon/],
  ['EventSource', /EventSource/], ['dynamischer import', /\bimport\s*\(/], ['eval', /\beval\s*\(/], ['new Function', /new\s+Function\s*\(/],
  ['innerHTML', /innerHTML/], ['outerHTML', /outerHTML/], ['insertAdjacentHTML', /insertAdjacentHTML/], ['document.write', /document\.write/],
  ['console', /\bconsole\./], ['externe Skripte', /<script[^>]+src=["']https?:/i], ['http-URL im Code', /["'`]http:\/\/(?!www\.w3\.org\/2000\/svg["'`])/],
  ['setTimeout mit String', /setTimeout\(\s*["'`]/], ['postMessage-Empfang', /addEventListener\(\s*["']message["']/],
  ['Standort-API', /geolocation/i],
  // Kein Mikrofon, keine Aufnahme (Design-Review Diktat und Fingerabdruecke 16.10.2026, Auflage 17).
  ['Mikrofon', /getUserMedia|getDisplayMedia/], ['Aufnahme', /MediaRecorder|SpeechRecognition|AudioContext/], ['WebRTC', /RTCPeerConnection/],
  // Nur feste Dateinamen nachladen (Design-Review Muster, Auflage 11): kein importScripts mit Variable.
  ['importScripts dynamisch', /importScripts\((?!\s*['"])/],
];

test('Erweiterungscode enthaelt keine verbotenen APIs', () => {
  assert.ok(extCode.length > 10);
  const hits = [];
  // Einzige Ausnahme: i18n.js laedt Texte aus dem eigenen Paket (Design-Review Sprachen 17.10.2026).
  const OWN = "fetch(chrome.runtime.getURL('_locales/' + LOCALES[lang] + '/messages.json'))";
  for (const f of extCode) {
    let src = fs.readFileSync(f, 'utf8');
    if (f === path.join(EXT, 'common', 'i18n.js')) { assert.equal(src.split(OWN).length, 2, 'i18n.js: genau ein fetch aufs eigene Paket'); src = src.replace(OWN, ''); }
    for (const [name, re] of FORBIDDEN) if (re.test(src) && !(name === 'Mikrofon' && f === SHARE_PAGE)) hits.push(`${path.relative(ROOT, f)}: ${name}`);
  }
  assert.deepEqual(hits, []);
});

// Alle Dateien ausser node_modules/ und .git/ (auch tmp-Ordner); .handtest-* (Edge-Profil, gitignoriert) und
// lokale Arbeitskopien im Hauptordner (.<name>-arbeitskopien/, gitignoriert) werden uebersprungen.
// Jeder andere versteckte Ordner wird mitgeprueft.
// Einzige Ausnahme von "Mikrofon": die Huelle um getDisplayMedia auf den Meeting-Seiten (Design-Review
// Bildschirmteilen 17.10.2026, Auflage 1). Sie ruft nie getUserMedia, liest keine Medien und gibt das
// Promise der Seite unveraendert zurueck; gemeldet werden nur die festen Texte "an:<Flaeche>" und "aus".
const SHARE_PAGE = path.join(EXT, 'content', 'teilen-seite.js');
test('Bildschirmteilen: Huelle ohne Medienzugriff, gleiches Promise, nur feste Signale', () => {
  const src = fs.readFileSync(SHARE_PAGE, 'utf8');
  assert.ok(!/getUserMedia|MediaRecorder|ImageCapture|captureStream|requestFrame|createElement|canvas|chrome\.|localStorage|indexedDB|postMessage/.test(src));
  const code = src.replace(/^\s*\/\/.*$/gm, '');
  assert.equal(code.match(/getDisplayMedia/g).length, 3, 'nur Original sichern, ersetzen, Name');
  assert.match(src, /const p = apply\(orig, this, args\);\r?\n\s+try \{ p\.then\(onStream, \(\) => \{\}\); \} catch \(e\) \{ \/\* still \*\/ \}\r?\n\s+return p;/);
  assert.deepEqual([...src.matchAll(/fire\(([^)]*)\)/g)].map((m) => m[1]).sort(), ["'an:' + surface", "'aus'", 's']);
  assert.ok(!/^\s*(var|let|const)\s/m.test(src.split('(function () {')[0]), 'keine globalen Variablen');
  // Die isolierte Weiterleitung nimmt nur Texte nach festem Muster an.
  const relay = fs.readFileSync(path.join(EXT, 'content', 'teilen.js'), 'utf8');
  assert.match(relay, /const SIGNAL = \/\^\(an:\(browser\|window\|monitor\)\|aus\)\$\/;/);
  assert.match(relay, /typeof s === 'string' && SIGNAL\.test\(s\)/);
  assert.ok(!/onMessage|storage|innerHTML/.test(relay));
});

// Alle Dateien ausser node_modules/ und .git/ (auch tmp-Ordner); .handtest-* (Edge-Profil, gitignoriert) und
// lokale Arbeitskopien im Hauptordner (.<name>-arbeitskopien/, gitignoriert) werden uebersprungen.
function allFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip(dir, e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...allFiles(p)); else out.push(p);
  }
  return out;
}
// Einzige Ausnahme: selbst signiertes Testzertifikat der E2E-Pruefung (gitignoriert).
const E2E_KEY = path.join('scripts', 'e2e', 'tmp', 'fake.key');

test('kein privater Schluessel im Repo (B17)', () => {
  const all = allFiles(ROOT).filter((f) => path.relative(ROOT, f) !== E2E_KEY);
  const re = new RegExp('-----BEGIN [A-Z ]*' + 'PRI' + 'VATE KEY-----');
  const hits = all.filter((f) => !/\.png$/.test(f) && re.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits.map((f) => path.relative(ROOT, f)), []);
  const keyFiles = all.filter((f) => /\.(pem|crx|key)$/i.test(f));
  assert.deepEqual(keyFiles.map((f) => path.relative(ROOT, f)), []);
  for (const ig of [path.join(ROOT, '.gitignore'), path.join(EXT, '.gitignore')]) {
    const ign = fs.readFileSync(ig, 'utf8');
    for (const p of ['*.pem', '*.crx', '*.key']) assert.ok(ign.split(/\r?\n/).includes(p), `${path.relative(ROOT, ig)}: ${p}`);
  }
});

test('Produktname nur in branding.js und _locales (Namenswechsel an einer Stelle)', () => {
  const name = /aimori/i;
  const hits = files(EXT, (p) => /\.(js|html|json|css)$/.test(p))
    .filter((f) => !f.endsWith(path.join('extension', 'branding.js')) && !f.includes(path.join('extension', '_locales')))
    .filter((f) => name.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits.map((f) => path.relative(ROOT, f)), []);
});

test('Speicher- und Richtlinien-Schluessel ohne Produktnamen', () => {
  const schema = fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8');
  assert.ok(!/aimori/i.test(schema));
  const bg = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  for (const m of bg.matchAll(/'dlx\.[a-z]+'/g)) assert.ok(!/aimori/i.test(m[0]));
});
