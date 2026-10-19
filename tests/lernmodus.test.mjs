// Lernmodus: fester Erklaersatz je Datentyp (why_<typ> in _locales), Schalter
// learningMode als Einstellung und Richtlinie. Die Saetze nennen nie einen Wert.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, ENGINE_FILES, EXT } from './helpers/load.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/aisites.js', 'common/policy.js', 'common/i18n.js', 'common/kompetenz.js']);
const P = DLX.policy;
const read = (dir) => JSON.parse(fs.readFileSync(path.join(EXT, '_locales', dir, 'messages.json'), 'utf8'));
const ids = new Set(Array.from(DLX.engine.allDetectors(), (d) => d.id).concat('custom_term', 'internal_link'));
// why_<x> ohne Datentyp: Gruppen, Gruend der Laendererkennung, versteckte Anweisungen.
const OTHER = new Set([...DLX.kompetenz.GROUPS.map((g) => g.replace(/-/g, '_')), 'timezone', 'region', 'language', 'injection']);

test('Saetze je Datentyp: nur bekannte Typ-IDs, alle Sprachen, kurz, Satzende, ohne Wertbeispiel', () => {
  const en = read('en');
  const typed = Object.keys(en).filter((k) => k.startsWith('why_') && !OTHER.has(k.slice(4)));
  assert.ok(typed.length >= 25, 'Saetze je Datentyp vorhanden');
  for (const k of typed) assert.ok(ids.has(k.slice(4)), 'unbekannte Typ-ID: ' + k);
  for (const dir of Object.values(DLX.i18n.LOCALES)) {
    const m = read(dir);
    for (const k of typed) {
      const s = m[k].message;
      assert.ok(s.length <= 150 && /[.]$/.test(s), dir + ' ' + k);
      assert.doesNotMatch(s, /[0-9]{3,}|@|\{|<|[A-Z]{2}[0-9]{2}/, dir + ' ' + k + ' ohne Wertbeispiel');
      if (dir !== 'en' && k !== 'why_ch_tel' && k !== 'why_phone_e164') assert.notEqual(s, en[k].message, dir + ' ' + k + ' uebersetzt');
    }
  }
});

test('Richtlinie learningMode: boolesch, Benutzer darf schalten, Richtlinie sperrt, Standard an', () => {
  assert.deepEqual(Array.from(P.validate({ learningMode: false }).errors), []);
  assert.deepEqual(Array.from(P.validate({ learningMode: 'nein' }).errors), ['learningMode']);
  assert.deepEqual(Array.from(P.validate({ learningMode: false }, true).errors), [], 'als Benutzerwert erlaubt');
  assert.equal(P.effective({}, {}, 'de-CH').cfg.learningMode, true);
  assert.equal(P.effective({}, { learningMode: false }, 'de-CH').cfg.learningMode, false);
  const m = P.effective({ learningMode: true }, { learningMode: false }, 'de-CH');
  assert.equal(m.cfg.learningMode, true);
  assert.equal(m.locked.learningMode, true);
  const schema = JSON.parse(fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8'));
  assert.equal(schema.properties.learningMode.type, 'boolean');
});
