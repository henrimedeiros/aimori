// Training-Ampel (Design-Review Training-Ampel 16.10.2026), Teil Daten: Angaben je
// KI-Seite mit Quelle, Ampel-Regeln, Links, declarativeContent-Bedingungen wie
// aisites.find, Signet-Pixel, erzeugte Liste. Service Worker/Popup: tests/training.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, ENGINE_FILES, EXT, ROOT } from './helpers/load.mjs';
import { png } from '../scripts/make-icons.mjs';
import { renderTrainingDoc } from '../scripts/build-aisites.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/aisites.js', 'common/policy.js', 'common/training.js'], { URL });
const A = DLX.aisites;
const TR = DLX.training;
const plain = (v) => JSON.parse(JSON.stringify(v));
const NOW = Date.parse(TR.STAND + 'T12:00:00Z');

test('Daten: jede KI-Seite der Liste hat genau einen Eintrag mit Quelle, Stand und gueltigen Werten (Auflagen 10, 11)', () => {
  assert.deepEqual(TR.LIST.map((x) => x.id).sort(), A.IDS.slice().sort());
  for (const x of TR.LIST) {
    assert.ok(TR.WERTE.includes(x.personal), x.id);
    assert.ok(x.business === null || TR.WERTE.includes(x.business), x.id);
    assert.match(x.stand, /^\d{4}-\d{2}-\d{2}$/, x.id);
    assert.ok(x.quelle && TR.safeLink(x, x.quelle) === new URL(x.quelle).href, 'Quelle fehlt oder fremder Host: ' + x.id);
    assert.ok(x.optOut === '' || TR.safeLink(x, x.optOut) === new URL(x.optOut).href, 'Opt-out fremder Host: ' + x.id);
    for (const h of x.anbieter) assert.match(h, /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/, x.id + ' ' + h);
    assert.ok(x.notiz && x.notiz.length <= 80, x.id);
  }
});

test('Ampel: rot = Standard an, gruen nur bei "nein" fuer genau diese Kontoart, sonst gelb (Auflage 11)', () => {
  assert.equal(TR.ampel('chatgpt', 'personal', NOW).farbe, 'rot');
  assert.equal(TR.ampel('chatgpt', 'business', NOW).farbe, 'gruen');
  assert.equal(TR.ampel('chatgpt', 'unknown', NOW).farbe, 'rot', 'unbekannt = strengster Wert');
  assert.equal(TR.ampel('m365copilot', 'unknown', NOW).farbe, 'gelb', 'strengster aus unbekannt/nein');
  assert.equal(TR.ampel('huggingchat', 'personal', NOW).farbe, 'gruen');
  assert.equal(TR.ampel('huggingchat', 'business', NOW).farbe, 'gelb', 'keine Firmenvariante -> unklar');
  assert.equal(TR.ampel('huggingchat', 'unknown', NOW).farbe, 'gruen', 'ohne Firmenvariante zaehlt nur privat');
  assert.equal(TR.ampel('poe', 'personal', NOW).farbe, 'gelb');
  assert.equal(TR.ampel('qwen', 'personal', NOW).farbe, 'gelb');
  assert.equal(TR.ampel('chatgpt', 'admin@example.com', NOW).typ, 'unknown', 'fremde Kontoart -> unknown');
  assert.equal(TR.ampel('constructor', 'personal', NOW), null);
  assert.equal(TR.ampel('__proto__', 'personal', NOW), null);
  // Veraltet (> 12 Monate) -> nie gruen, rot bleibt rot
  const spaet = NOW + 400 * 86400000;
  assert.equal(TR.ampel('huggingchat', 'personal', spaet).farbe, 'gelb');
  assert.equal(TR.ampel('huggingchat', 'personal', spaet).alt, true);
  assert.equal(TR.ampel('chatgpt', 'personal', spaet).farbe, 'rot');
  assert.equal(TR.ampel('huggingchat', 'personal', NaN).farbe, 'gelb', 'ohne gueltiges Datum nie gruen');
  const a = plain(TR.ampel('claude', 'personal', NOW));
  assert.deepEqual(Object.keys(a).sort(), ['alt', 'farbe', 'id', 'optOut', 'quelle', 'stand', 'typ', 'wert']);
  assert.equal(a.optOut, 'https://claude.ai/settings/data-privacy-controls');
  // Kontoart: ohne accountRules immer privat, mit Regel nur Enum, sonst unknown
  assert.equal(TR.typeFor({ accountRules: {} }, 'chatgpt', 'business'), 'personal');
  assert.equal(TR.typeFor({ accountRules: { chatgpt: {} } }, 'chatgpt', 'business'), 'business');
  assert.equal(TR.typeFor({ accountRules: { chatgpt: {} } }, 'chatgpt', null), 'unknown');
  assert.equal(TR.typeFor({ accountRules: { chatgpt: {} } }, 'chatgpt', 'Beispiel AG'), 'unknown');
});

test('Links: nur https, Host exakt aus der Liste, ohne Benutzer/Passwort/Port (Auflage 10)', () => {
  const x = TR.byId('chatgpt');
  for (const bad of ['http://chatgpt.com/', 'javascript:alert(1)', 'https://user:pw@chatgpt.com/', 'https://chatgpt.com:8443/', 'https://chatgpt.com.evil.example/',
    'https://evil.example/?chatgpt.com', 'https://xchatgpt.com/', 'https://help.openai.com.evil.example/', '//chatgpt.com/', '', 7, null]) assert.equal(TR.safeLink(x, bad), '', String(bad));
  assert.equal(TR.safeLink(x, 'https://help.openai.com/en/x'), 'https://help.openai.com/en/x');
  assert.equal(TR.safeLink(TR.byId('claude'), 'https://help.openai.com/en/x'), '', 'Anbieter-Host eines anderen Eintrags');
});

// PageStateMatcher wie im Browser: Host exakt, Schema, pathEquals/pathPrefix.
const matches = (c, url) => {
  const u = new URL(url);
  return u.hostname === c.hostEquals && c.schemes.includes(u.protocol.slice(0, -1)) && (c.pathEquals === undefined || u.pathname === c.pathEquals) && (c.pathPrefix === undefined || u.pathname.startsWith(c.pathPrefix));
};
test('declarativeContent-Bedingungen entscheiden wie aisites.find (Auflagen 4, 5)', () => {
  let n = 0;
  for (const s of A.LIST) {
    const conds = TR.conditions(s);
    for (const c of conds) {
      assert.deepEqual(Object.keys(c).filter((k) => !['hostEquals', 'schemes', 'pathEquals', 'pathPrefix'].includes(k)), [], 'nur pageUrl-Felder');
      assert.deepEqual(plain(c.schemes), ['https']);
      if (c.pathPrefix) assert.ok(c.pathPrefix.endsWith('/'), 'Segmentgrenze');
    }
    for (const h of s.hosts) {
      const urls = ['https://' + h + '/', 'https://' + h + '/x/y?q=1', 'http://' + h + '/', 'https://' + h + '.evil.example/', 'https://x' + h + '/', 'https://sub.' + h + '/'];
      if (s.pfad) urls.push('https://' + h + s.pfad, 'https://' + h + s.pfad + '/', 'https://' + h + s.pfad + '/a', 'https://' + h + s.pfad + 'foo', 'https://' + h + '/x' + s.pfad);
      for (const url of urls) {
        const u = new URL(url);
        const viaFind = A.find(u.origin, url);
        const viaRule = conds.some((c) => matches(c, url));
        assert.equal(viaRule, !!viaFind && viaFind.id === s.id, url);
        n++;
      }
    }
  }
  assert.ok(n > 400, String(n));
});

test('Symbol: Signet aus common/signet.js ergibt die ausgelieferten Icons, Ampel nur mit Farbpunkt (Auflage 6)', () => {
  for (const s of [16, 32, 48, 128]) assert.ok(png(s).equals(fs.readFileSync(path.join(EXT, 'icons', `icon${s}.png`))), 'icon' + s);
  const S = load(['common/signet.js']).signet;
  const plainIcon = S.rgba(32, '');
  for (const f of TR.FARBEN) {
    const px = S.rgba(32, f);
    assert.equal(px.length, 32 * 32 * 4);
    assert.notDeepEqual(px, plainIcon, f);
    assert.deepEqual(px.slice(0, 4 * 32 * 8), plainIcon.slice(0, 4 * 32 * 8), 'obere Haelfte unveraendert');
  }
  assert.deepEqual(S.rgba(16, 'lila'), S.rgba(16, ''), 'unbekannte Farbe = Standard');
  assert.equal(fs.readFileSync(path.join(ROOT, 'scripts', 'make-icons.mjs'), 'utf8').includes("common/signet.js"), true, 'gleiche Funktion, kein Kopieren');
});

test('docs/ki-training-liste.md ist aktuell (npm run build, Auflage 15)', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'docs', 'ki-training-liste.md'), 'utf8').replace(/\r\n/g, '\n'), renderTrainingDoc());
});
