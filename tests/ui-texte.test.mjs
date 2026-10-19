// Oberflaechentexte und Zaehler: alle 6 Sprachen vollstaendig, Platzhalter,
// Kategorien abgedeckt; Tageszaehler nur Zahlen, 90 Tage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, ENGINE_FILES } from './helpers/load.mjs';

const DLX = load([...ENGINE_FILES, 'common/i18n.js', 'common/stats.js']);
const I = DLX.i18n;

// Seit 17.10.2026 alle Sprachen vollstaendig (auch Erklaerungen und KI-Kompetenz-Nachweis).
const EN_DE_ONLY = /^(why_(?!timezone$|region$|language$)|learn|komp|rec[A-Z]|optKomp)/;
test('alle Sprachen haben dieselben Schluessel wie Englisch', () => {
  const en = Object.keys(I.STRINGS.en).sort();
  for (const l of I.LANGS) assert.deepEqual(Object.keys(I.STRINGS[l]).sort(), en, l);
});

test('Erklaerung und laengerer Text je Datentyp-Gruppe in DE und EN, kurz und ohne Rechtszusagen', () => {
  const K = load(['common/kompetenz.js']).kompetenz;
  const cats = new Set(Array.from(DLX.engine.allDetectors(), (d) => d.cat));
  for (const c of cats) assert.ok(K.GROUPS.includes(c), 'Gruppe fehlt in kompetenz.js: ' + c);
  for (const g of K.GROUPS) for (const l of ['de', 'en']) {
    const why = I.t(l, 'why_' + g);
    const learn = I.t(l, 'learn_' + g);
    assert.ok(why && why.length <= 130 && /[.]$/.test(why), l + ' why_' + g);
    assert.ok(learn && learn.length > why.length, l + ' learn_' + g);
  }
  for (const l of ['de', 'en']) for (const [k, s] of Object.entries(I.STRINGS[l])) {
    if (EN_DE_ONLY.test(k)) assert.ok(!/konform|erfüllt|compliant|fulfil|garant/i.test(s), l + ' ' + k);
  }
  assert.match(I.STRINGS.de.recNote, /2024\/1689/);
  assert.match(I.STRINGS.de.recNote, /2\. Februar 2025/);
  assert.match(I.STRINGS.de.recNote, /Selbstauskunft/);
  assert.match(I.STRINGS.de.recNote, /EU-Bezug/);
  assert.notEqual(I.t('fr', 'why_finanz'), I.t('en', 'why_finanz'), 'eigene Uebersetzung statt Englisch');
});

test('jede Kategorie und jede Aktion hat einen Text', () => {
  const cats = new Set(Array.from(DLX.engine.allDetectors(), (d) => d.cat));
  for (const c of cats) assert.ok(I.has('en', 'cat_' + c), c);
  for (const a of ['off', 'warn', 'redact', 'block']) assert.ok(Object.hasOwn(I.STRINGS.en, 'act_' + a), a);
  for (const d of DLX.stats.DECISIONS) assert.ok(Object.hasOwn(I.STRINGS.en, 'dec_' + d), d);
});

test('Texte enthalten keinen Produktnamen, nur Platzhalter', () => {
  // ext* = Manifest-Name/-Beschreibung (chrome.i18n), dort steht der Produktname.
  for (const table of Object.values(I.STRINGS)) for (const [k, s] of Object.entries(table)) if (!k.startsWith('ext')) assert.ok(!/aimori/i.test(s), k);
  assert.equal(I.t('de', 'introSend', { product: 'Example' }).startsWith('Example hat'), true);
});

test('Sprachwahl: Richtlinie vor Browser, Rueckfall Englisch', () => {
  assert.equal(I.resolveLang('auto', 'fr-CH'), 'fr');
  assert.equal(I.resolveLang('it', 'de-CH'), 'it');
  assert.equal(I.resolveLang('auto', 'ja-JP'), 'en');
  assert.equal(I.t('xx', 'cancel'), 'Cancel');
  assert.equal(I.t('de', 'toString'), 'toString', 'geerbte Schluessel werden nicht gelesen');
});

test('Zaehler: nur bekannte Seiten/Entscheidungen, Ablauf 90 Tage', () => {
  const s = {};
  const now = new Date('2026-10-13T10:00:00Z');
  DLX.stats.add(s, now, 'chatgpt', 'finanz', 'redact', 2);
  DLX.stats.add(s, now, 'evil', 'finanz', 'redact', 1);
  DLX.stats.add(s, now, 'claude', '__proto__', 'redact', 1);
  DLX.stats.add(s, now, 'claude', 'finanz', 'leak', 1);
  DLX.stats.add(s, new Date('2026-06-01T10:00:00Z'), 'claude', 'technik', 'cancel', 1);
  assert.deepEqual(JSON.parse(JSON.stringify(DLX.stats.prune(s, now))), { '2026-10-13': { chatgpt: { finanz: { redact: 2 } } } });
  assert.deepEqual(JSON.parse(JSON.stringify(DLX.stats.totals(s, '2026-10-01'))), { redact: 2 });
});
