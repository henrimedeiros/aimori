// Detektor-Nachschlagen je Pruefung (Design-Review Datei-Pruefung schneller 19.10.2026, Auflagen 4, 5):
// gleiche Aktionen wie das bisherige find() ueber alle Detektoren, nie veraltet, erster Eintrag gewinnt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers/load.mjs';
import { CASES, CEP_CASE } from './helpers/testwerte.mjs';
import { WORLD_CASES } from './helpers/testwerte-welt.mjs';

const DLX = load();
const det = (id, act, re = /QQX\d{3}/g) => ({ id, cat: 'test', cls: 'hoch', re, act, name: { en: id, de: id } });
const actionOf = (text, cfg) => Array.from(DLX.engine.scan(text, cfg).findings, (f) => f.id + ':' + f.action);

test('Funde tragen dieselbe Aktion wie actionFor ohne Zwischenspeicher', () => {
  const cfgs = [{ packs: Object.keys(DLX.packs) }, { packs: Object.keys(DLX.packs), rules: { iban: 'block', ch_tel: 'off', br_cep: 'warn' } }];
  let n = 0;
  for (const cfg of cfgs) {
    for (const [, pos] of CASES.concat([CEP_CASE], WORLD_CASES)) {
      for (const f of DLX.engine.scan(pos, cfg).findings) {
        if (f.meta || DLX.engine.findDetector(f.id) === null) continue;
        assert.equal(f.action, DLX.engine.actionFor(f.id, cfg), f.id);
        n++;
      }
    }
  }
  assert.ok(n > 150, 'genug Funde verglichen: ' + n);
});

test('Paket mit gleicher Detektorzahl, aber geaenderter Aktion: neue Aktion gilt sofort', () => {
  DLX.registerPack({ id: 'tempo1', detectors: [det('tempo_x', 'warn')] });
  const cfg = { packs: ['tempo1'] };
  assert.deepEqual(actionOf('Wert QQX123 hier', cfg), ['tempo_x:warn']);
  DLX.registerPack({ id: 'tempo1', detectors: [det('tempo_x', 'block')] });
  assert.deepEqual(actionOf('Wert QQX123 hier', cfg), ['tempo_x:block']);
  delete DLX.packs.tempo1;
});

test('Doppelte ID: wie bisher gilt die Aktion des ersten Eintrags', () => {
  DLX.registerPack({ id: 'tempo2a', detectors: [det('tempo_dup', 'block')] });
  DLX.registerPack({ id: 'tempo2b', detectors: [det('tempo_dup', 'warn')] });
  assert.equal(DLX.engine.actionFor('tempo_dup', {}), 'block');
  assert.deepEqual(actionOf('Wert QQX123 hier', { packs: ['tempo2b'] }), ['tempo_dup:block']);
  delete DLX.packs.tempo2a;
  delete DLX.packs.tempo2b;
});
