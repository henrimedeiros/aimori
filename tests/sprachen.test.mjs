// Mehrsprachigkeit (de/en/fr/it/es/pt-BR; Design-Review Sprachen 17.10.2026,
// docs/sicherheit/design-review-sprachen.md): alle Sprachen haben alle Schluessel,
// gleiche Platzhalter, keine Chrome-Platzhaltersyntax; Liste = Ordner = Schema = ADML.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, ENGINE_FILES, EXT, ROOT } from './helpers/load.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/policy.js', 'common/i18n.js', 'content/adapters.js'], { URL });
const I = DLX.i18n;
const read = (dir) => JSON.parse(fs.readFileSync(path.join(EXT, '_locales', dir, 'messages.json'), 'utf8'));
const EN = read('en');
const holes = (s) => (s.match(/\{[A-Za-z0-9_]+\}/g) || []).sort().join(' ');

test('Sprachliste = Ordner unter _locales = Richtlinien-Schema = Einstellungen', () => {
  const dirs = fs.readdirSync(path.join(EXT, '_locales')).sort();
  assert.deepEqual([...Object.values(I.LOCALES)].sort(), dirs, 'neue Sprache: Ordner und Kuerzel in LOCALES');
  assert.deepEqual([...DLX.policy.LANGS].slice(1).sort(), [...I.LANGS].sort());
  const schema = JSON.parse(fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8'));
  assert.deepEqual(schema.properties.language.enum, [...DLX.policy.LANGS]);
  assert.equal(I.LOCALES.pt, 'pt_BR', 'Portugiesisch nur brasilianisch (Auflage 1)');
});

test('jede Sprache hat genau alle Schluessel von Englisch, gleiche Platzhalter, kein $', () => {
  const keys = Object.keys(EN);
  const lower = new Set(keys.map((k) => k.toLowerCase()));
  assert.equal(lower.size, keys.length, 'Chrome vergleicht Schluessel ohne Gross/Klein');
  for (const dir of Object.values(I.LOCALES)) {
    const m = read(dir);
    assert.deepEqual(Object.keys(m), keys, dir + ': Schluessel und Reihenfolge wie en');
    for (const k of keys) {
      assert.match(k, /^[A-Za-z0-9_]+$/, k);
      const s = m[k].message;
      assert.equal(typeof s, 'string', dir + ' ' + k);
      assert.ok(s.trim().length > 0, dir + ' leer: ' + k);
      assert.ok(!s.includes('$'), dir + ' $ (Chrome-Platzhalter): ' + k);
      assert.equal(holes(s), holes(EN[k].message), dir + ' Platzhalter: ' + k);
      assert.deepEqual(Object.keys(m[k]), ['message'], dir + ' nur message: ' + k);
    }
  }
});

test('Datentyp-Namen in allen Sprachen; en/de gleich wie in der Engine', () => {
  for (const d of DLX.engine.allDetectors()) {
    for (const l of I.LANGS) assert.ok(I.STRINGS[l]['type_' + d.id], l + ' type_' + d.id);
    assert.equal(I.typeName('de', d.id), d.name.de, d.id);
    assert.equal(I.typeName('en', d.id), d.name.en, d.id);
  }
  assert.equal(I.typeName('fr', 'iban'), I.STRINGS.fr.type_iban);
});

test('Uebersetzungen sind keine Kopien von Englisch (Stichprobe Warn- und Knopftexte)', () => {
  for (const k of ['redact', 'notSensitive', 'introSend', 'optLanguage', 'cat_finanz']) {
    for (const l of ['de', 'fr', 'it', 'es', 'pt']) assert.notEqual(I.t(l, k), I.t('en', k), l + ' ' + k);
  }
  assert.ok(!/ficheiro|ecrã|deteção|definições/i.test(JSON.stringify(read('pt_BR'))), 'pt-BR ohne europaeische Formen');
});

test('Lader: nur Strings, kein __proto__, Groessengrenze, unbekannte Sprache -> en (Auflagen 2, 3, 7)', () => {
  assert.equal(I.resolveLang('xx', 'tlh-KL'), 'en');
  assert.equal(I.resolveLang('auto', 'pt-PT'), 'pt');
  assert.equal(I.resolveLang('auto', 'fr-CH'), 'fr');
  assert.equal(I.add('xx', { a: 'b' }), false);
  const evil = JSON.parse('{"__proto__": {"message": "x"}, "constructor": "y", "ok": {"message": "gut"}, "zahl": 5, "obj": {"message": {}}}');
  const ctx = load(['common/i18n.js']);
  assert.equal(ctx.i18n.add('it', evil), true);
  assert.deepEqual(Object.keys(ctx.i18n.STRINGS.it), ['ok']);
  assert.equal(Object.getPrototypeOf(ctx.i18n.STRINGS.it), null);
  assert.equal(ctx.i18n.add('it', { gross: 'x'.repeat(5000) }), true);
  assert.deepEqual(Object.keys(ctx.i18n.STRINGS.it), []);
  const big = {}; for (let i = 0; i < 100; i++) big['k' + i] = 'x'.repeat(3000);
  assert.equal(ctx.i18n.add('it', big), false, 'gesamt > 256 KB');
});

test('Platzhalter nur per Funktion ersetzt: $& und $1 aus Werten wirken nicht (Auflage 4)', () => {
  assert.equal(I.t('en', 'rowsRemoved', { n: '$&$1$$' }), '$&$1$$ rows removed');
  assert.equal(I.t('de', 'detected', {}).includes('{types}'), I.STRINGS.de.detected.includes('{types}'), 'nicht uebergebene bleiben stehen');
});

test('Content Scripts: nur Content-Texte; ohne Tabelle gilt der englische Mindestsatz (Auflagen 6, 7)', () => {
  const t = I.contentTable('fr');
  assert.ok(Object.keys(t).every((k) => /^(cat_|type_|rowsRemoved$|close$|copyToast|share(Title|Text|TextPlain|MaskedText|Cover|Uncover)$)/.test(k)));
  assert.equal(t.cat_finanz, I.STRINGS.fr.cat_finanz);
  for (const [k, v] of Object.entries(I.MIN)) assert.equal(v, EN[k].message, 'MIN = en: ' + k);
  const bare = load(['common/i18n.js']);
  for (const l of Object.keys(bare.i18n.STRINGS)) delete bare.i18n.STRINGS[l];
  assert.equal(bare.i18n.t('fr', 'cat_finanz'), 'Financial data');
  assert.equal(bare.i18n.t('de', 'rowsRemoved', { n: 3 }), '3 rows removed');
  assert.equal(bare.i18n.add('fr', 'kaputt'), false);
  assert.equal(bare.i18n.t('fr', 'cat_finanz'), 'Financial data');
});

test('Senden-Knopf: exakte aria-labels der 6 Sprachen, keine Teilstrings (Auflage 8)', () => {
  const claude = DLX.adapters.SITES.find((s) => s.id === 'claude');
  for (const label of ['Send message', 'Nachricht senden', 'Envoyer le message', 'Invia messaggio', 'Enviar mensaje', 'Enviar mensagem',
    'Envoyer un message', 'Invia un messaggio', 'Enviar un mensaje', 'Enviar uma mensagem']) {
    assert.ok(claude.send.includes('button[aria-label="' + label + '"]'), label);
  }
  assert.ok(claude.send.every((s) => !/aria-label[*^$~|]=/.test(s)), 'nur exakter Vergleich');
});

test('ADML: jede Sprache hat dieselben String- und Presentation-IDs wie die ADMX (Auflage 9)', () => {
  const dir = path.join(ROOT, 'enterprise', 'admx');
  const langs = fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort();
  assert.deepEqual(langs, ['de-DE', 'en-US', 'es-ES', 'fr-FR', 'it-IT', 'pt-BR']);
  for (const b of ['chrome', 'edge']) {
    const admx = fs.readFileSync(path.join(dir, 'dlx-' + b + '.admx'), 'utf8');
    const strIds = [...new Set([...admx.matchAll(/\$\(string\.([A-Za-z0-9_]+)\)/g)].map((m) => m[1]))].sort();
    const presIds = [...admx.matchAll(/\$\(presentation\.([A-Za-z0-9_]+)\)/g)].map((m) => m[1]).sort();
    for (const l of langs) {
      const adml = fs.readFileSync(path.join(dir, l, 'dlx-' + b + '.adml'), 'utf8');
      assert.match(adml, /^<\?xml version="1\.0" encoding="utf-8"\?>/);
      const s = [...adml.matchAll(/<string id="([A-Za-z0-9_]+)">/g)].map((m) => m[1]);
      for (const id of strIds) assert.ok(s.includes(id), l + ' ' + b + ' string ' + id);
      assert.deepEqual([...adml.matchAll(/<presentation id="([A-Za-z0-9_]+)">/g)].map((m) => m[1]).sort(), presIds, l + ' ' + b);
      assert.ok(!/<string id="[^"]+"><\/string>/.test(adml), l + ' leerer Text');
    }
  }
});
