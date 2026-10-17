// Einstellungsseite mit Menue (Design-Review Einstellungen 16.10.2026,
// docs/sicherheit/design-review-einstellungen-16-10.md): Quelltext-Waechter fuer
// Hash, Suche, Thema, Statuskarte und Texte; Bedienung prueft E2E-Schritt "einstellungen".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EXT, load, ENGINE_FILES } from './helpers/load.mjs';

const read = (f) => fs.readFileSync(path.join(EXT, f), 'utf8').replace(/\r\n/g, '\n');
const opt = read('ui/options.js');

test('Einstellungen: kein HTML-Einsetzen, kein eval, keine Inline-Skripte oder on*-Attribute (Auflage 9)', () => {
  assert.doesNotMatch(opt, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|new RegExp|console\./);
  const html = read('ui/options.html');
  for (const m of html.matchAll(/<script\b([^>]*)>/g)) assert.match(m[1], /\bsrc="/, 'nur Skripte mit src');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /https?:\/\//);
});

test('Einstellungen: Bereiche nur aus fester Liste, Adresse bleibt exakt options.html (Auflage 1)', () => {
  assert.match(opt, /const IDS = BEREICHE\.map\(\(x\) => x\[0\]\);/);
  assert.match(opt, /function zeige\(id, ausSuche\) \{\n\s*if \(!IDS\.includes\(id\)\) id = 'uebersicht';/);
  const ids = [...opt.matchAll(/^ {4}\['([a-z]+)', 'nav[A-Z][a-z]+', \[/gm)].map((m) => m[1]);
  assert.deepEqual(ids, ['uebersicht', 'erkennung', 'seiten', 'dateien', 'datenschutz', 'ueber']);
  // Der Service Worker nimmt userTerms/ignoreReset nur von genau dieser Adresse an: kein Hash, keine Verlaufseintraege.
  assert.doesNotMatch(opt, /location\.hash|hashchange|pushState|replaceState|href: '#/);
});

test('Einstellungen: Suche nur textContent + includes, begrenzt, nirgends gespeichert; nur hidden (Auflagen 2, 3)', () => {
  assert.match(opt, /maxlength: '100'/);
  assert.match(opt, /const q = such\.value\.slice\(0, 100\)\.trim\(\)\.toLowerCase\(\);/);
  assert.match(opt, /e\.hidden = !e\.textContent\.toLowerCase\(\)\.includes\(q\);/);
  const body = opt.slice(opt.indexOf('function suche()'), opt.indexOf("such.addEventListener('input'"));
  assert.doesNotMatch(body, /disabled|localStorage|location|sessionStorage|chrome\./);
  for (const m of opt.matchAll(/such\.value[^;\n]*/g)) assert.doesNotMatch(m[0], /localStorage|location|history|sendMessage/, m[0]);
});

test('Einstellungen: Thema nur system/hell/dunkel in einem localStorage-Schluessel, nur data-theme (Auflage 4)', () => {
  assert.match(opt, /const THEMEN = \['system', 'hell', 'dunkel'\];/);
  assert.match(opt, /return THEMEN\.includes\(v\) \? v : 'system';/);
  const keys = [...opt.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(([^,)]+)/g)].map((m) => m[1]);
  assert.ok(keys.length >= 3 && keys.every((k) => k === 'THEMA_KEY'), keys.join());
  assert.doesNotMatch(opt, /chrome\.storage/);
  assert.doesNotMatch(opt, /setAttribute\('(?!data-theme|aria-current)/);
});

test('Einstellungen: Statuskarte fail-closed und nur feste Zustaende (Auflage 5)', () => {
  assert.match(opt, /if \(!st \|\| typeof st\.cfg !== 'object'/);
  assert.match(opt, /DLX\.i18n\.t\(l, 'protUnknown'\)/);
  assert.match(opt, /const kiZ = KI_ZUSTAENDE\.includes\(ki\.state\) \? ki\.state : 'unbekannt';/);
  assert.match(opt, /ep: ki\.ep === 'webgpu' \? 'WebGPU' : 'WASM'/);
});

test('Einstellungen: Zwei-Klick-Loeschen wird beim Bereichswechsel entschaerft (Auflage 8)', () => {
  assert.equal((opt.match(/entschaerfen\.push\(/g) || []).length, 3);
  assert.match(opt, /for \(const f of entschaerfen\) f\(\);/);
});

test('Einstellungen: alle Texte in allen Sprachen, ohne HTML (Auflage 6)', () => {
  const DLX = load([...ENGINE_FILES, 'common/i18n.js']);
  const S = DLX.i18n.STRINGS;
  const need = ['statusTitle', 'protOk', 'protOkNote', 'protUnknown', 'protUnknownNote', 'kiUnbekannt', 'kiDoLabel', 'goDetect', 'optTheme',
    'searchLabel', 'searchNone', 'privTitle', 'privNote', 'aboutVersion', 'aboutLocal']
    .concat(['Overview', 'Detect', 'Sites', 'Files', 'Privacy', 'About'].flatMap((x) => ['nav' + x, 'nav' + x + 'Note']))
    .concat(['bereit', 'inaktiv', 'fehler', 'aus', 'unbekannt'].map((z) => 'kiWhy_' + z), ['inaktiv', 'fehler', 'aus', 'unbekannt'].map((z) => 'kiDo_' + z))
    .concat(['system', 'hell', 'dunkel'].map((v) => 'theme_' + v));
  for (const [l, table] of Object.entries(S)) {
    for (const k of need) assert.ok(Object.hasOwn(table, k) && table[k].trim(), l + ' ' + k);
    for (const [k, v] of Object.entries(table)) assert.ok(!v.includes('<'), l + ' ' + k);
  }
  for (const k of need) assert.ok(opt.includes("'" + k + "'") || /^(nav|kiWhy_|kiDo_|theme_)/.test(k), 'genutzt: ' + k);
});
