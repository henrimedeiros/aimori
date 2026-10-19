// KI-Antworten pruefen und Zwischenablage-Schutz (Design-Review Antwort/Zwischenablage
// 16.10.2026): Hostmuster, Normalisierung, Richtlinien, Quelltext-Waechter, ReDoS.
// Teil Oberflaeche/Content Script: Quelltext-Waechter fuer options.js und content.js, ReDoS-Budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { load, ENGINE_FILES, EXT } from './helpers/load.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/aisites.js', 'common/quellen.js', 'common/policy.js'], { URL });
const Q = DLX.quellen;
// Werte aus dem vm-Kontext: Vergleich ueber JSON (andere Realm-Prototypen).
const deq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
const read = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');

test('storage.session nie fuer Content Scripts geoeffnet; Breitmuster nie angefordert (Auflagen 7, 14)', () => {
  const all = ['background.js', 'content/content.js', 'content/quelle.js', 'content/kopierwache.js', 'common/quellen.js', 'ui/options.js', 'ui/popup.js'].map(read).join('\n');
  assert.ok(!/setAccessLevel/.test(all), 'kein setAccessLevel');
  // https://*/* nur fuer die Kopierwache: eine Konstante im Service Worker, in den Einstellungen
  // Anzeige + Anfrage auf Klick; das Popup zeigt es seit dem schlanken Popup (17.10.2026) nicht mehr (Design-Review Kopierwarnung 16.10.2026).
  const wide = (f) => (read(f).match(/['"]https:\/\/\*\/\*['"]/g) || []).length;
  assert.deepEqual(['background.js', 'content/content.js', 'content/quelle.js', 'content/kopierwache.js', 'common/quellen.js', 'ui/options.js', 'ui/popup.js'].map(wide), [1, 0, 0, 0, 0, 2, 0]);
  assert.match(read('background.js'), /const COPY_ALL = 'https:\/\/\*\/\*';/);
  assert.ok(!/permissions\.request/.test(read('ui/popup.js')), 'Popup fragt nie');
  const opt = read('ui/options.js');
  for (const m of opt.matchAll(/permissions\.request\(\{ origins(?:: ([^}]+))? \}\)/g)) assert.ok(!m[1] || /aiMissing\(\)/.test(m[1]) || m[1] === "['https://*/*']" || m[1] === 'SHARE_ORIGINS' || m[1] === 'csOrigins', m[0]);
  // Bildschirmteilen: nur die festen Meeting-Origins (Design-Review Bildschirmteilen 17.10.2026, Auflage 6).
  const shareList = /const SHARE_ORIGINS = (\[[^\]]+\]);/.exec(opt);
  assert.deepEqual(shareList && JSON.parse(shareList[1].replace(/'/g, '"')), ['https://meet.google.com/*', 'https://teams.microsoft.com/*', 'https://teams.live.com/*',
    'https://teams.cloud.microsoft/*', 'https://zoom.us/*', 'https://*.zoom.us/*']);
  assert.match(opt, /shareGrant\.addEventListener\('click', async \(e\) => \{\r?\n\s+if \(!e\.isTrusted\) return;/);
  // csOrigins = nur die Content-Script-Seiten des Manifests (Design-Review Firefox 17.10.2026, Auflage 9).
  assert.match(opt, /const csOrigins = \[\.\.\.new Set\(\(chrome\.runtime\.getManifest\(\)\.content_scripts \|\| \[\]\)\.flatMap\(\(c\) => c\.matches \|\| \[\]\)\)\];/);
  assert.match(opt, /hostGrant\.addEventListener\('click', async \(e\) => \{\r?\n\s+if \(!e\.isTrusted\) return;\r?\n\s+try \{ await chrome\.permissions\.request\(\{ origins: csOrigins \}\);/);
  assert.match(opt, /copyGrant\.addEventListener\('click', async \(e\) => \{\r?\n\s+if \(!e\.isTrusted\) return;\r?\n\s+try \{ await chrome\.permissions\.request\(\{ origins: \['https:\/\/\*\/\*'\] \}\);/);
  assert.match(opt, /const origins = await srcMissing\(\);/);
  assert.match(opt, /return DLX\.quellen\.originsOf\(srcList\)\.filter/);
});

test('Antwort-Pruefung: Engine-Regeln auf 20 000-Zeichen-Angriffstexten unter dem Antwort-Budget (Auflage 1)', () => {
  const eng = DLX.policy.engineConfig(DLX.policy.defaults('de-CH'));
  const N = 20000;
  const inputs = ['a', '1', '9 ', 'A1', '-', '.', '@', 'a@', 'a.', '1.', '1-', 'x=', '"', '/', '\\', 'AKIA', 'sk-', 'eyJ', '0x', ' ', '\n', 'Herr ', 'CH', 'DE89',
    '+41 ', 'IBAN ', '756.', '{"a":', 'ghp_', '-----BEGIN ', 'Bearer ', 'password=', '%20', 'ä'].map((u) => u.repeat(Math.ceil(N / u.length)).slice(0, N));
  inputs.push(Array.from({ length: N }, (_, i) => 'aZ9-_.@:/ '[i % 10]).join(''));
  let worst = 0;
  for (const text of inputs) {
    const t0 = performance.now();
    DLX.engine.scan(text, eng);
    worst = Math.max(worst, performance.now() - t0);
  }
  // Engine-Budget 150 ms je Lauf; die Antwort-Pruefung bricht schon bei 50 ms ab (verkuerzte Uhr).
  assert.ok(worst < DLX.engine.BUDGET_MS * 2, 'langsamster Lauf ' + Math.round(worst) + ' ms');
  const content = read('content/content.js');
  assert.match(content, /const ANSWER_BUDGET_MS = 50;/);
  assert.match(content, /DLX\.engine\.scan\(text, eng, \(\) => t0 \+ \(performance\.now\(\) - t0\) \* k\)/);
});
