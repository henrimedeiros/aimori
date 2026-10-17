// Paket context: Richtlinie (massListMin, identityMinParts, competenceHideSensitive) und
// KI-Kompetenz-Nachweis. Design-Review Kontext 14.10.2026, Auflagen 5 und 6 in
// docs/sicherheit/design-review-kontext.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, EXT, ENGINE_FILES } from './helpers/load.mjs';

import { DECIMAL_DEFAULT } from '../scripts/build-admx.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/policy.js'], { URL });
const P = DLX.policy;

test('ADMX-Vorgabe der Schwellen = Standard der Erweiterung (Auflage Pflicht-Pruefung)', () => {
  const d = P.defaults('de-CH');
  assert.deepEqual(DECIMAL_DEFAULT, { massListMin: d.massListMin, identityMinParts: d.identityMinParts, complianceReportDays: d.complianceReportDays,
    tableMinRows: d.tableMinRows, tableMinColumns: d.tableMinColumns });
  const adml = fs.readFileSync(path.join(EXT, '..', 'enterprise', 'admx', 'de-DE', 'dlx-edge.adml'), 'utf8');
  assert.ok(adml.includes('<decimalTextBox refId="massListMin" defaultValue="10">'));
  assert.ok(adml.includes('<decimalTextBox refId="identityMinParts" defaultValue="3">'));
  assert.ok(adml.includes('<decimalTextBox refId="tableMinRows" defaultValue="10">'));
  assert.ok(adml.includes('<decimalTextBox refId="tableMinColumns" defaultValue="2">'));
});
// --- Auflagen 5 und 6: Richtlinie ------------------------------------------------
test('Auflage 6: Schwellen nur verwaltet, Grenzen und Typen; verwaltete Regeln/Pakete schlagen Benutzer', () => {
  const eff = (m, l) => P.effective(m, l || {}, 'de-CH');
  assert.equal(eff({}).cfg.massListMin, 10);
  assert.equal(eff({}).cfg.identityMinParts, 3);
  for (const bad of [2, 1001, '10', 10.5, null, true]) {
    const e = eff({ massListMin: bad });
    assert.equal(e.cfg.massListMin, 10, String(bad));
    assert.ok(e.errors.includes('massListMin'), String(bad));
  }
  for (const bad of [1, 5, '3']) assert.equal(eff({ identityMinParts: bad }).cfg.identityMinParts, 3);
  assert.equal(eff({ massListMin: 3, identityMinParts: 4 }).cfg.massListMin, 3);
  assert.equal(eff({}, { massListMin: 3 }).cfg.massListMin, 10, 'Benutzer kann die Schwelle nicht setzen');
  assert.equal(eff({}, { competenceHideSensitive: true }).cfg.competenceHideSensitive, false);
  assert.equal(eff({ competenceHideSensitive: true }).cfg.competenceHideSensitive, true);
  const r = eff({ rules: { art9_health: 'block' } }, { rules: { art9_health: 'off' } });
  assert.equal(r.cfg.rules.art9_health, 'block');
  assert.equal(r.locked.rules.art9_health, true);
  const g = eff({ globalPacks: ['finance', 'context'] }, { globalPacks: ['finance'] });
  assert.deepEqual(Array.from(g.cfg.globalPacks), ['finance', 'context']);
  const ec = P.engineConfig(eff({ massListMin: 25, identityMinParts: 2 }).cfg);
  assert.equal(ec.massMin, 25);
  assert.equal(ec.idParts, 2);
});

test('Auflage 5: Nachweis blendet sensible Gruppen per Richtlinie zwingend aus; person ist sensibel', () => {
  const K = load(['common/kompetenz.js']).kompetenz;
  assert.ok(K.SENSITIVE.includes('person') && K.SENSITIVE.includes('gesundheit') && K.GROUPS.includes('person'));
  const src = fs.readFileSync(path.join(EXT, 'ui', 'nachweis.js'), 'utf8');
  assert.ok(src.includes('if (st.hideSensitive) { hide.checked = true; hide.disabled = true; }'));
  const bg = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  assert.ok(bg.includes('hideSensitive: e.cfg.competenceHideSensitive === true'));
});
