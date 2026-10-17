// KI-Seite automatisch erkennen, eigenes Auswahlfeld, Live-Status der lokalen KI
// (Design-Review KI vorladen 16.10.2026, docs/sicherheit/design-review-ki-vorladen.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, ENGINE_FILES } from './helpers/load.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const read = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const ohneKommentare = (s) => s.replace(/^\s*\/\/.*$/gm, '');

test('Auswahlfeld: nur DOM ueber h(), kein HTML aus Text, keine Stil-Strings, keine URLs, keine Bilder (Auflage 8)', () => {
  const src = ohneKommentare(read('ui/auswahl.js'));
  for (const bad of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\.style\b/, /setAttribute\('style'/, /https?:\/\//, /<img|'img'/, /\bsrc\b/, /\bhref\b/, /chrome\./, /fetch\s*\(/, /console\./]) {
    assert.ok(!bad.test(src), String(bad));
  }
  assert.match(src, /'aria-haspopup': 'listbox'/);
  assert.match(src, /role: 'listbox'/);
  assert.match(src, /role: 'option'/);
  // Kategorie-Klasse nur aus der festen Liste.
  assert.match(src, /dlx-mono-' \+ \(KATEGORIEN\.includes\(it\.kat\) \? it\.kat : 'chat'\)/);
  for (const k of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape', 'Tab']) assert.ok(src.includes(`'${k}'`), k);
});

test('Auswahlfeld nur im Popup per <script src>, CSP unveraendert (Auflage 10)', () => {
  for (const f of fs.readdirSync(path.join(EXT, 'ui')).filter((x) => x.endsWith('.html'))) {
    const html = read('ui/' + f);
    assert.equal(html.includes('auswahl.js'), f === 'popup.html', f);
  }
  assert.equal((read('ui/popup.html').match(/<script src="auswahl\.js"><\/script>/g) || []).length, 1);
  assert.ok(!/<script>/.test(read('ui/popup.html')), 'kein Inline-Script');
  assert.ok(!/<select|h\('select'/.test(read('ui/popup.js')), 'kein natives select mehr im Popup');
});

test('Popup: erkannte Seite zeigt die Ampel ohne Auswahl, Auswahl nur ohne Erkennung oder auf Wunsch', () => {
  const src = read('ui/popup.js');
  assert.match(src, /const x = DLX\.aisites\.find\(u\.origin, u\.origin \+ u\.pathname\);/);
  assert.match(src, /if \(siteId && DLX\.training\.byId\(siteId\)\) \{\s*show\(siteId, type, true\);/);
  assert.match(src, /other\.addEventListener\('click', \(\) => \{ other\.replaceWith\(pick\.el\); pick\.oeffne\(\); \}\);/);
});

test('Seitenerkennung nur ueber den exakten Host (Auflage 9)', () => {
  const DLX = load(['common/aisites.js'], { URL });
  const id = (u) => { const x = new URL(u); const s = DLX.aisites.find(x.origin, x.origin + x.pathname); return s ? s.id : null; };
  assert.equal(id('https://chatgpt.com/c/123'), 'chatgpt');
  assert.equal(id('https://claude.ai/new'), 'claude');
  assert.equal(id('https://gemini.google.com/app'), 'gemini');
  assert.equal(id('https://copilot.microsoft.com/'), 'copilot');
  assert.equal(id('https://www.perplexity.ai/search'), 'perplexity');
  for (const u of ['https://chatgpt.com.boese.example/', 'https://boese.example/chatgpt.com', 'http://chatgpt.com/', 'https://xchatgpt.com/', 'https://chatgpt.com:8443/', 'https://github.com/foo']) assert.equal(id(u), null, u);
  assert.equal(id('https://github.com/copilot'), 'githubcopilot');
});

test('Live-Status: Seiten fragen nur den Service Worker, kein Speicherzugriff, nur feste Zustaende und Gruende', () => {
  for (const f of ['ui/popup.js', 'ui/options.js']) {
    const src = read(f);
    assert.ok(!/chrome\.storage/.test(src), f);
    assert.match(src, /chrome\.runtime\.sendMessage\(\{ t: 'kiStatus' \}\)/, f);
    assert.match(src, /const KI_GRUENDE = \['paket', 'laden', 'start', 'zeit'\];/, f);
    assert.match(src, /KI_GRUENDE\.includes\(ki\.grund\)/, f);
    assert.match(src, /Number\.isInteger\(ki\.p\) && ki\.p >= 0 && ki\.p <= 100 \? ki\.p : 0/, f);
    assert.match(src, /for \(let i = 0; i < 120; i\+\+\)/, f);
  }
});

test('Offscreen: load, run und stop nur vom eigenen Service Worker, gpu nur === true (Auflage 1)', () => {
  const src = read('ui/ki.js');
  assert.match(src, /const fromSw = \(sender\) => sender\.id === chrome\.runtime\.id && !sender\.tab && sender\.url === SW_URL;/);
  assert.match(src, /if \(!msg \|\| msg\.target !== TARGET \|\| !fromSw\(sender\)\) return;/);
  assert.match(src, /if \(msg\.t === 'load'\) \{ load\(msg\.gpu === true\)\.then\(sendResponse\); return true; \}/);
  // Fortschritt nur als Ganzzahl an den eigenen Service Worker.
  assert.match(src, /if \(Number\.isInteger\(d\.p\)\) \{ chrome\.runtime\.sendMessage\(\{ t: 'kiFortschritt', p: d\.p \}\)/);
  assert.equal((src.match(/chrome\.runtime\.sendMessage\(/g) || []).length, 1);
});

test('Texte: neue KI- und Auswahl-Schluessel in allen Sprachen, ohne HTML', () => {
  const DLX = load([...ENGINE_FILES, 'common/i18n.js']);
  const S = DLX.i18n.STRINGS;
  const keys = ['kiLaedt', 'kiGrund_paket', 'kiGrund_laden', 'kiGrund_start', 'kiGrund_zeit', 'kiWhy_laedt', 'kiDo_laedt', 'trainAuto', 'trainNoSite'];
  for (const l of Object.keys(S)) {
    for (const k of keys) {
      assert.equal(typeof S[l][k], 'string', l + ' ' + k);
      assert.ok(S[l][k].length > 2 && !/[<>]/.test(S[l][k]), l + ' ' + k);
    }
    assert.ok(S[l].kiLaedt.includes('{p}'), l);
    assert.ok(!/(first time|erste|première|primo|primeira|primera)/i.test(S[l].kiWhy_inaktiv), l + ': kein faules Laden mehr');
  }
});
