// Manifest-Pruefung: minimale Rechte (A1, B6), Content Scripts nur auf den
// unterstuetzten KI-Seiten, CSP ohne Netz (A2, B8), alle referenzierten Dateien vorhanden.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EXT, load } from './helpers/load.mjs';

const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const ORIGINS = ['https://chatgpt.com/*', 'https://claude.ai/*', 'https://gemini.google.com/*', 'https://copilot.microsoft.com/*', 'https://copilot.com/*',
  'https://copilot.cloud.microsoft/*', 'https://m365.cloud.microsoft/*', 'https://perplexity.ai/*', 'https://www.perplexity.ai/*'];
// Origins der KI-Seiten-Liste (Design-Review KI-Seiten 14.10.2026, Auflagen 1, 9).
const AI_ORIGINS = Array.from(load(['common/aisites.js']).aisites.origins());

test('Manifest V3 mit minimalen Rechten', () => {
  assert.equal(m.manifest_version, 3);
  // activeTab und declarativeContent nur fuer die Training-Ampel (Design-Review Training-Ampel 16.10.2026, Auflage 1).
  assert.deepEqual(m.permissions, ['storage', 'scripting', 'offscreen', 'activeTab', 'declarativeContent', 'alarms']);
  // Tastenkuerzel: Schwaerzen, Platzhalter, Pause, Popup (Chrome erlaubt hoechstens 4 vorgeschlagene);
  // Texte in allen Sprachen (Edge vergibt Alt+Shift+P/X nicht).
  assert.deepEqual(Object.entries(m.commands).map(([k, v]) => k + '=' + v.suggested_key.default), ['redact-all=Alt+Shift+S', 'placeholder-all=Alt+Shift+L', 'toggle-pause=Alt+Shift+O', '_execute_action=Alt+Shift+K']);
  for (const l of fs.readdirSync(path.join(EXT, '_locales'))) {
    const msg = JSON.parse(fs.readFileSync(path.join(EXT, '_locales', l, 'messages.json'), 'utf8'));
    for (const c of ['cmdRedact', 'cmdPlaceholder', 'cmdPause']) assert.ok(msg[c] && msg[c].message.length > 5 && msg[c].message.length <= 80, l + ' ' + c);
  }
  assert.equal(m.host_permissions, undefined, 'keine host_permissions (B6)');
  assert.equal(m.optional_permissions, undefined);
  // KI-Seiten-Liste plus https://*/* fuer vertrauliche Quellen: nur optional, angefordert
  // werden nur die Origins der Quellenliste (Design-Review Antwort/Zwischenablage 16.10.2026, Auflagen 7, 23).
  assert.deepEqual(m.optional_host_permissions, AI_ORIGINS.concat('https://*/*'), 'optionale Host-Rechte: KI-Seiten-Liste und Quellen');
  for (const o of m.optional_host_permissions) assert.match(o, /^https:\/\/([a-z0-9.-]+|\*)\/\*$/, o);
  assert.ok(!JSON.stringify(m.host_permissions || []).includes('*') && !JSON.stringify(m.content_scripts).includes('https://*/'), 'Breitmuster nie fest erteilt');
  assert.equal(m.externally_connectable, undefined, 'kein externally_connectable (A4)');
  assert.ok(!JSON.stringify(m).includes('<all_urls>'));
  assert.equal(m.storage.managed_schema, 'managed_schema.json');
});

test('Content Scripts nur auf den unterstuetzten KI-Seiten (genau diese Origins, keine Wildcards), isoliert, Hauptframe, document_start', () => {
  assert.equal(m.content_scripts.length, 1);
  const cs = m.content_scripts[0];
  assert.deepEqual(cs.matches, ORIGINS);
  assert.equal(cs.world, 'ISOLATED');
  assert.equal(cs.all_frames, false);
  assert.equal(cs.run_at, 'document_start');
  assert.equal(cs.js[cs.js.length - 1], 'content/content.js');
});

test('web_accessible_resources: Dialog und Ansicht nur auf den 7 Seiten, KI-Banner nur auf der Liste, dynamische URL', () => {
  assert.deepEqual(m.web_accessible_resources, [{ resources: ['ui/dialog.html', 'ui/view.html'], matches: ORIGINS, use_dynamic_url: true },
    { resources: ['ui/aibanner.html'], matches: AI_ORIGINS, use_dynamic_url: true }]);
  for (const o of ORIGINS) assert.ok(AI_ORIGINS.includes(o), o);
});

test('CSP der Erweiterungsseiten ohne Netz und ohne eval', () => {
  const csp = m.content_security_policy.extension_pages;
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval';/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /img-src 'self' data:/);
  const anc = csp.match(/frame-ancestors ([^;]+);/)[1].split(' ');
  assert.deepEqual(anc, ["'self'"].concat(AI_ORIGINS.map((o) => o.slice(0, -2))), 'frame-ancestors genau die KI-Seiten der Liste, ohne *');
  // Einzige Ergaenzung: 'wasm-unsafe-eval' fuer die Texterkennung (Design-Review Bilder 14.10.2026).
  assert.ok(!/(?<!wasm-)unsafe-eval|unsafe-inline/.test(csp));
  assert.equal(csp.match(/wasm-unsafe-eval/g).length, 1);
});

test('alle referenzierten Dateien existieren', () => {
  const refs = [m.background.service_worker, m.action.default_popup, m.options_ui.page, m.storage.managed_schema,
    ...Object.values(m.icons), ...Object.values(m.action.default_icon), ...m.content_scripts[0].js, ...m.web_accessible_resources.flatMap((w) => w.resources), 'ui/aibanner.js'];
  for (const r of refs) assert.ok(fs.existsSync(path.join(EXT, r)), r);
  const bg = fs.readFileSync(path.join(EXT, m.background.service_worker), 'utf8');
  for (const s of bg.match(/importScripts\(([\s\S]*?)\)/)[1].match(/'[^']+'/g)) assert.ok(fs.existsSync(path.join(EXT, s.slice(1, -1))), s);
  for (const html of ['ui/dialog.html', 'ui/popup.html', 'ui/options.html']) {
    const src = fs.readFileSync(path.join(EXT, html), 'utf8');
    for (const [, ref] of src.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(EXT, 'ui', ref)), `${html}: ${ref}`);
    assert.ok(!/<script>(?!<)/.test(src) && !/ on[a-z]+=/.test(src), `${html}: kein Inline-Skript`);
  }
});

test('Sprachen en/de/fr/it/pt_BR/es mit allen Manifest-Texten', () => {
  const keys = [...JSON.stringify(m).matchAll(/__MSG_(\w+)__/g)].map((x) => x[1]);
  for (const l of ['en', 'de', 'fr', 'it', 'pt_BR', 'es']) {
    const msgs = JSON.parse(fs.readFileSync(path.join(EXT, '_locales', l, 'messages.json'), 'utf8'));
    for (const k of keys) assert.ok(msgs[k] && msgs[k].message, `${l}: ${k}`);
  }
  assert.equal(m.default_locale, 'en');
});

test('feste Erweiterungs-ID aus dem oeffentlichen Schluessel (fuer ADMX/Registry)', () => {
  const der = Buffer.from(m.key, 'base64');
  const id = crypto.createHash('sha256').update(der).digest('hex').slice(0, 32).replace(/./g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
  assert.match(id, /^[a-p]{32}$/);
  // Der Schluessel ist ein oeffentlicher SPKI-Schluessel, kein privater.
  assert.equal(crypto.createPublicKey({ key: der, format: 'der', type: 'spki' }).asymmetricKeyType, 'rsa');
});

test('Service Worker kennt genau die Manifest-Seiten (SITE_ORIGINS), www.copilot.com bewusst nicht', () => {
  const src = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  const origins = [...src.match(/const SITE_ORIGINS = \{([^}]+)\}/)[1].matchAll(/'(https:\/\/[^']+)'/g)].map((m) => m[1] + '/*');
  assert.deepEqual(origins, ORIGINS);
  assert.ok(!JSON.stringify(m).includes('www.copilot.com'));
});
