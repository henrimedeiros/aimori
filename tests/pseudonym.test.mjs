// Zuordnung Wert <-> Platzhalter (engine/pseudonym.js): gleicher Wert gleicher
// Platzhalter, Zaehler je Typ, Ruecktausch in einem Durchgang und nicht rekursiv,
// Grenze 500 -> normales Schwaerzen (Design-Review Platzhalter 14.10.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, ENGINE_FILES } from './helpers/load.mjs';

const DLX = load([...ENGINE_FILES, 'engine/pseudonym.js', 'common/policy.js']);
const P = DLX.pseudonym;
const IBAN = 'CH9300762011623852957';      // SWIFT-Beispiel
const IBAN2 = 'CH5604835012345678009';
const at = (text, value, id, cat) => { const start = text.indexOf(value); return { id, cat, start, end: start + value.length }; };
const red = (f) => 'GESCHWAERZT';

test('gleicher Wert -> gleicher Platzhalter, Zaehler je Typ, Leerraum egal', () => {
  const m = P.create();
  const t1 = 'IBAN ' + IBAN + ', Mail a@example.com, IBAN ' + IBAN2;
  const out = m.pseudonymize(t1, [at(t1, IBAN, 'iban', 'finanz'), at(t1, 'a@example.com', 'email', 'kontakt'), at(t1, IBAN2, 'iban', 'finanz')], red);
  assert.equal(out, 'IBAN [IBAN_1], Mail [EMAIL_1], IBAN [IBAN_2]');
  const spaced = 'CH93 0076 2011 6238 5295 7';
  const t2 = 'nochmals ' + IBAN + ' und ' + spaced;
  const f2 = [at(t2, IBAN, 'iban', 'finanz'), at(t2, spaced, 'iban', 'finanz')];
  assert.equal(m.pseudonymize(t2, f2, red), 'nochmals [IBAN_1] und [IBAN_3]', 'anders geschrieben = eigener Platzhalter');
  const t3 = 'x ' + IBAN;
  assert.equal(m.pseudonymize(t3, [at(t3, IBAN, 'iban', 'finanz')], red), 'x [IBAN_1]');
  assert.equal(m.size, 4);
  assert.equal(P.labelOf('cfg_password'), 'CFG_PASSWORD');
  assert.equal(P.labelOf('ch_ahv'), 'CH_AHV');
});

test('Ruecktausch: ein Durchgang, nicht rekursiv, unbekannte Platzhalter bleiben', () => {
  const m = P.create();
  const tricky = 'pw[IBAN_1]x';
  const t = 'Passwort ' + tricky + ' und ' + IBAN;
  // Der erste Wert enthaelt selbst ein Platzhalter-Muster; nach dem Ruecktausch darf es nicht erneut ersetzt werden.
  const out = m.pseudonymize(t, [at(t, tricky, 'cfg_password', 'technik'), at(t, IBAN, 'iban', 'finanz')], red);
  assert.equal(out, 'Passwort [CFG_PASSWORD_1] und [IBAN_1]');
  assert.equal(m.restore('A [CFG_PASSWORD_1] B [IBAN_1] C [IBAN_7] D [iban_1]'), 'A ' + tricky + ' B ' + IBAN + ' C [IBAN_7] D [iban_1]');
  assert.deepEqual(JSON.parse(JSON.stringify(m.summary('[IBAN_1] [IBAN_1] [IBAN_7] [CFG_PASSWORD_1]'))),
    [{ id: 'iban', cat: 'finanz', n: 2 }, { id: 'cfg_password', cat: 'technik', n: 1 }]);
});

test('Grenze 500 Zuordnungen: danach normales Schwaerzen; clear verwirft alles', () => {
  const m = P.create();
  for (let i = 0; i < P.MAX; i++) {
    const v = 'w' + i + '@example.com';
    m.pseudonymize(v, [{ id: 'email', cat: 'kontakt', start: 0, end: v.length }], red);
  }
  assert.equal(m.size, 500);
  const known = 'w3@example.com';
  assert.equal(m.pseudonymize(known, [{ id: 'email', cat: 'kontakt', start: 0, end: known.length }], red), '[EMAIL_4]', 'bekannter Wert bleibt');
  const fresh = 'neu@example.com';
  assert.equal(m.pseudonymize(fresh, [{ id: 'email', cat: 'kontakt', start: 0, end: fresh.length }], red), '[GESCHWAERZT]');
  m.clear();
  assert.equal(m.size, 0);
  assert.equal(m.restore('[EMAIL_4]'), '[EMAIL_4]');
});

test('eigene Platzhalter loesen keinen Fund aus', () => {
  const eng = DLX.policy.engineConfig(DLX.policy.defaults({ timeZone: 'Europe/Zurich', languages: ['de-CH'] }));
  const text = '[IBAN_1] [EMAIL_2] [CH_AHV_3] [PHONE_E164_12] [CC_VISA_1] [CFG_PASSWORD_1] [IPV4_1] [BIRTHDATE_1]';
  assert.deepEqual(Array.from(DLX.engine.scan(text, eng).findings), []);
});
