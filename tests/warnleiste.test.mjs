// Warnleiste anpassbar (Design-Review Warnleiste anpassbar 17.10.2026, Auflagen 1, 2, 7):
// barTheme/barCompact nur feste Strings, Richtlinie sperrt, Schema und ADMX mit genau drei Werten.
// Service Worker und Frame: tests/background.test.mjs, tests/dialog.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, ENGINE_FILES, EXT, ROOT } from './helpers/load.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/aisites.js', 'common/quellen.js', 'common/policy.js'], { URL });
const P = DLX.policy;
const plain = (x) => JSON.parse(JSON.stringify(x));

test('barTheme/barCompact: nur feste Strings, alles andere = auto', () => {
  assert.deepEqual(plain(P.BAR_THEMES), ['auto', 'light', 'dark']);
  assert.deepEqual(plain(P.BAR_COMPACT), ['auto', 'on', 'off']);
  const d = P.effective({}, {}, 'de-CH').cfg;
  assert.deepEqual([d.barTheme, d.barCompact], ['auto', 'auto'], 'Standard');
  for (const [t, c] of [['light', 'on'], ['dark', 'off'], ['auto', 'auto']]) {
    const e = P.effective({}, { barTheme: t, barCompact: c }, 'de-CH');
    assert.deepEqual([e.cfg.barTheme, e.cfg.barCompact], [t, c]);
    assert.ok(!e.locked.barTheme && !e.locked.barCompact, 'lokal nicht gesperrt');
  }
  for (const bad of ['Dark', ' dark', 'dunkel', 'hell', '__proto__', 'constructor', 'toString', '', 1, true, null, {}, ['dark']]) {
    const l = P.effective({}, { barTheme: bad, barCompact: bad }, 'de-CH');
    assert.deepEqual([l.cfg.barTheme, l.cfg.barCompact], ['auto', 'auto'], 'lokal ' + JSON.stringify(bad));
    const m = P.effective({ barTheme: bad, barCompact: bad }, { barTheme: 'dark', barCompact: 'on' }, 'de-CH');
    assert.deepEqual([m.cfg.barTheme, m.cfg.barCompact], ['auto', 'auto'], 'verwaltet ' + JSON.stringify(bad));
    assert.ok(m.locked.barTheme && m.locked.barCompact, 'ungueltige Richtlinie sperrt trotzdem');
    assert.deepEqual(plain(m.errors).filter((k) => k.startsWith('bar')), ['barTheme', 'barCompact']);
  }
});

test('barTheme/barCompact: Richtlinie schlaegt den gespeicherten Wert und sperrt', () => {
  const e = P.effective({ barTheme: 'light', barCompact: 'off' }, { barTheme: 'dark', barCompact: 'on' }, 'de-CH');
  assert.deepEqual([e.cfg.barTheme, e.cfg.barCompact], ['light', 'off']);
  assert.ok(e.locked.barTheme && e.locked.barCompact);
  assert.ok(P.USER_KEYS.includes('barTheme') && P.USER_KEYS.includes('barCompact'));
});

test('Schema und ADMX/ADML: Enum mit genau den drei Werten, gleicher Pfad wie die anderen Richtlinien', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8'));
  assert.deepEqual(schema.properties.barTheme, Object.assign({}, schema.properties.barTheme, { type: 'string', enum: plain(P.BAR_THEMES) }));
  assert.deepEqual(schema.properties.barCompact.enum, plain(P.BAR_COMPACT));
  assert.equal(schema.properties.barCompact.type, 'string');
  for (const f of ['dlx-chrome.admx', 'dlx-edge.admx']) {
    const x = fs.readFileSync(path.join(ROOT, 'enterprise', 'admx', f), 'utf8');
    for (const k of ['barTheme', 'barCompact']) {
      const m = new RegExp(`<policy name="${k}"[^>]*key="([^"]+)"[\\s\\S]*?</policy>`).exec(x);
      assert.ok(m, f + ': ' + k);
      const ref = /<policy name="answerCheck"[^>]*key="([^"]+)"/.exec(x)[1];
      assert.equal(m[1], ref, f + ': gleicher Registry-Pfad wie answerCheck');
      const werte = [...m[0].matchAll(/<string>([^<]+)<\/string>/g)].map((v) => v[1]);
      assert.deepEqual(werte, plain(k === 'barTheme' ? P.BAR_THEMES : P.BAR_COMPACT), f + ': ' + k);
    }
  }
  for (const l of ['de-DE', 'en-US']) for (const f of ['dlx-chrome.adml', 'dlx-edge.adml']) {
    const x = fs.readFileSync(path.join(ROOT, 'enterprise', 'admx', l, f), 'utf8');
    assert.ok(x.includes('<string id="barTheme">') && x.includes('<string id="barCompact">'), l + '/' + f);
  }
});
