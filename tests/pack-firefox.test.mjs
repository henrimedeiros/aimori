// Firefox-Paket (Design-Review Firefox 17.10.2026): abgeleitetes Manifest hoechstens so
// weit wie das Repo-Manifest (Auflage 1), background-Liste nur aus festen Eintraegen
// (Auflage 2), Beispiel-policies.json gueltig mit dem Laufzeit-Code (Auflage 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { collect } from '../scripts/pack-store.mjs';
import { firefoxManifest, firefoxProblems, backgroundScripts, firefoxPolicies, GECKO_ID, FIREFOX_MIN, MAX_JS } from '../scripts/pack-firefox.mjs';
import { load, ENGINE_FILES, ROOT, EXT } from './helpers/load.mjs';
import { validate as schemaValidate } from '../scripts/lib/schema.mjs';

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const repoText = read('extension/manifest.json');
const repo = JSON.parse(repoText);
const bg = read('extension/background.js');
const files = collect();
const fx = JSON.parse(firefoxManifest(repoText, bg, files));
const generated = (p) => !/^vendor\/(ki|ocr)\//.test(p);   // erzeugte Dateien fehlen ohne Build

test('Firefox-Manifest: gleich wie Repo bis auf die bekannten Abweichungen', () => {
  const exp = structuredClone(repo);
  delete exp.key;
  delete exp.minimum_chrome_version;
  exp.permissions = exp.permissions.filter((p) => p !== 'offscreen' && p !== 'declarativeContent');
  exp.background = { scripts: fx.background.scripts };
  for (const w of exp.web_accessible_resources) delete w.use_dynamic_url;
  exp.browser_specific_settings = { gecko: { id: GECKO_ID, strict_min_version: FIREFOX_MIN, data_collection_permissions: { required: ['none'] } } };
  assert.deepEqual(fx, exp);
  assert.equal(JSON.stringify(fx.content_security_policy), JSON.stringify(repo.content_security_policy), 'CSP Byte fuer Byte gleich');
  assert.match(GECKO_ID, /^[a-z0-9._-]+@[a-z0-9._-]+$/i);
});

test('Firefox-Manifest: Pruefung ohne Befund, Ausweitungen werden erkannt (Auflage 1)', () => {
  const sizes = Object.fromEntries(files.map((f) => [f, fs.statSync(path.join(EXT, f)).size]));
  assert.deepEqual(firefoxProblems(fx, repo, files, sizes).filter((p) => !/vendor\/(ki|ocr)\/ leer/.test(p)), []);
  const bad = (fn, re) => { const m = structuredClone(fx); fn(m); assert.ok(firefoxProblems(m, repo, files).some((p) => re.test(p)), re.source); };
  bad((m) => m.permissions.push('tabs'), /mehr Rechte/);
  bad((m) => m.optional_host_permissions.push('<all_urls>'), /optionale Host-Rechte/);
  bad((m) => { m.host_permissions = ['https://*/*']; }, /neues Manifest-Feld host_permissions|Host-Rechte/);
  bad((m) => m.content_scripts[0].matches.push('https://evil.example.com/*'), /content_scripts\.matches/);
  bad((m) => m.web_accessible_resources[0].resources.push('ui/ocr.html'), /web_accessible|ocr\.html/);
  bad((m) => m.web_accessible_resources[0].matches.push('<all_urls>'), /web_accessible_resources breiter/);
  bad((m) => { m.content_security_policy.extension_pages += ' '; }, /content_security_policy/);
  bad((m) => { m.content_security_policy.extension_pages = m.content_security_policy.extension_pages.replace("connect-src 'none'", "connect-src 'self'"); }, /connect-src/);
  bad((m) => { m.externally_connectable = { matches: ['https://*/*'] }; }, /neues Manifest-Feld/);
  bad((m) => { m.background = { service_worker: 'background.js' }; }, /background\.scripts/);
  bad((m) => m.permissions.push('offscreen'), /offscreen/);
  bad((m) => { m.browser_specific_settings.gecko.data_collection_permissions = { required: ['locationInfo'] }; }, /data_collection/);
  assert.ok(firefoxProblems(fx, repo, files, { 'vendor/x.js': MAX_JS + 1 }).some((p) => p.includes('4 MB')), 'JS ueber 4 MB');
  assert.throws(() => firefoxManifest(JSON.stringify({ ...repo, side_panel: {} }), bg, files), /Unbekannte Manifest-Felder/);
});

test('background.scripts = importScripts-Liste + background.js, nur feste relative Dateien (Auflage 2)', () => {
  const list = fx.background.scripts;
  assert.equal(list.at(-1), 'background.js');
  assert.ok(list.includes('engine/core.js') && list.includes('common/training.js') && list.length > 20);
  for (const f of list) assert.ok(files.includes(f) && generated(f), f);
  const fake = (body) => `if (typeof importScripts === 'function') importScripts(\n${body}\n);\n`;
  for (const body of ["  '../geheim.js',", "  'https://evil.example.com/x.js',", "  'engine/' + x,", "  'engine/fehlt.js',", "  `engine/core.js`,", "  '/engine/core.js',"]) {
    assert.throws(() => backgroundScripts(fake(body), files), /ungueltig|fehlt/, body);
  }
  assert.throws(() => backgroundScripts('importScripts(\'engine/core.js\');', files), /nicht gefunden/);
  assert.deepEqual(backgroundScripts(fake("  'engine/core.js', // Kommentar (mit Klammer), und Komma\n  'branding.js',"), files), ['engine/core.js', 'branding.js', 'background.js']);
});

test('Beispiel enterprise/firefox/policies.json: erzeugt aus example-policy.json, gueltig nach Schema und Laufzeit-Code (Auflage 10)', () => {
  const ex = JSON.parse(read('enterprise/example-policy.json'));
  const text = read('enterprise/firefox/policies.json').replace(/\r\n/g, '\n');
  assert.equal(text, firefoxPolicies(ex, 'https://updates.example.com/aimori/aimori-firefox.xpi'), 'node scripts/pack-firefox.mjs --policies enterprise/example-policy.json --install-url ...');
  const p = JSON.parse(text).policies;
  assert.deepEqual(Object.keys(p).sort(), ['3rdparty', 'ExtensionSettings']);
  assert.equal(p.ExtensionSettings[GECKO_ID].installation_mode, 'force_installed');
  assert.match(p.ExtensionSettings[GECKO_ID].install_url, /^https:\/\/[a-z.]*example\.com\//, 'nur Platzhalter-Domain');
  const policy = p['3rdparty'].Extensions[GECKO_ID];
  assert.deepEqual(schemaValidate(JSON.parse(read('extension/managed_schema.json')), policy), []);
  const D = load(['branding.js', ...ENGINE_FILES, 'common/quellen.js', 'common/policy.js'], { URL });
  assert.deepEqual([...D.policy.validate(policy).errors], []);
  assert.throws(() => firefoxPolicies(ex, 'http://updates.example.com/x.xpi'), /https/);
});
