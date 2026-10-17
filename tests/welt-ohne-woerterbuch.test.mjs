// Erkennung ohne dictionary.js (wie extension/ui/dialog.html und wissen.html):
// Base58Check braucht SHA-256 aus dictionary.js; fehlt es, darf der Scan nicht
// abbrechen und keine anderen Treffer verlieren (Pflicht-Pruefung 14.10.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers/load.mjs';

const FILES = ['engine/core.js', 'engine/packs-global.js', 'engine/packs-secrets.js', 'engine/packs-marker.js', 'engine/packs-context.js', 'engine/packs-country.js', 'engine/packs-world.js', 'engine/engine.js'];

test('Bitcoin-Adresse ohne dictionary.js: keine Ausnahme, andere Treffer bleiben', () => {
  const DLX = load(FILES);
  assert.equal(DLX.dictionary, undefined);
  const cfg = { packs: Object.keys(DLX.packs), rules: {} };
  const text = 'IBAN CH93 0076 2011 6238 5295 7, Adresse 1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs, Karte 4242 4242 4242 4242';
  const ids = Array.from(DLX.engine.scan(text, cfg).findings, (f) => f.id);
  assert.ok(ids.includes('iban') && ids.includes('cc_visa'), ids.join(','));
  assert.ok(!ids.includes('btc_legacy'), 'ohne Kontextwort und ohne SHA-256 kein Bitcoin-Treffer');
  const withCtx = Array.from(DLX.engine.scan('Bitcoin wallet 1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs', cfg).findings, (f) => f.id);
  assert.ok(withCtx.includes('btc_legacy'), 'mit Kontextwort weiter gemeldet');
});
