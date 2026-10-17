// Gemeinschafts-Muster und Richtlinie customPatterns (Design-Review Muster 16.10.2026,
// docs/sicherheit/design-review-muster.md): Katalog, Signatur, Bundle, safeRegex,
// Fenster-Scan, Richtlinie, CI-Workflow.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { load, ROOT, ENGINE_FILES } from './helpers/load.mjs';
import { KATALOG, SIGNATUR, BUNDLE, VERTRAUT, katalogBytes, pruefeSignatur, pruefeKatalog, bundleText, signiere, loadMitKatalog, verschluessele, entschluessele } from '../scripts/muster.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/aisites.js', 'common/i18n.js', 'common/policy.js'], { URL });
// Werte aus dem vm-Kontext haben andere Prototypen: fuer deepEqual in normale Objekte wandeln.
const plain = (x) => JSON.parse(JSON.stringify(x));
const katalog = JSON.parse(fs.readFileSync(KATALOG, 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dlx-muster-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// --- Katalog, Signatur, Bundle -------------------------------------------------
test('Katalog ist mit einem vertrauten Schluessel signiert, Bundle entspricht dem Katalog', () => {
  const s = pruefeSignatur();
  assert.equal(s.ok, true, s.err);
  assert.equal(fs.readFileSync(BUNDLE, 'utf8').replace(/\r\n/g, '\n'), bundleText(katalog, katalogBytes(), s), 'node scripts/muster.mjs bauen');
  assert.equal(DLX.packs.community.detectors.length, katalog.muster.length);
  assert.equal(DLX.packs.community.version, katalog.version);
});

test('Release-Build braucht einen Release-Schluessel; der Entwicklungsschluessel gilt dafuer nicht (Auflage 2)', () => {
  assert.ok(VERTRAUT.every((v) => /^[0-9a-f]{64}$/.test(v.fp) && ['dev', 'release'].includes(v.art)));
  if (!VERTRAUT.some((v) => v.art === 'release')) assert.equal(pruefeSignatur({ release: true }).err, 'kein_release_schluessel');
});

test('veraenderter Katalog, fremder Schluessel und kaputte Signatur werden abgelehnt (Auflage 1)', () => {
  const k2 = path.join(tmp, 'katalog.json');
  fs.writeFileSync(k2, fs.readFileSync(KATALOG, 'utf8').replace('"2026.', '"2027.'));
  assert.equal(pruefeSignatur({ katalog: k2 }).err, 'signatur_ungueltig');
  // Selbst signiert mit eigenem Schluessel: Fingerabdruck steht nicht in VERTRAUT.
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const sig2 = path.join(tmp, 'fremd.sig');
  fs.writeFileSync(sig2, signiere(privateKey, k2));
  assert.equal(pruefeSignatur({ katalog: k2, signatur: sig2 }).err, 'schluessel_nicht_vertraut');
  fs.writeFileSync(sig2, '{"format":1}');
  assert.equal(pruefeSignatur({ signatur: sig2 }).err, 'signatur_format');
  // CRLF beim Auschecken aendert die Signatur nicht.
  fs.writeFileSync(k2, fs.readFileSync(KATALOG, 'utf8').replace(/\r?\n/g, '\r\n'));
  assert.equal(pruefeSignatur({ katalog: k2 }).ok, true);
});

test('Bundle enthaelt nur Laufzeitfelder, keine Testwerte, Lizenz oder Quelle (Auflage 7)', () => {
  const b = fs.readFileSync(BUNDLE, 'utf8');
  for (const k of ['"tests"', '"lizenz"', '"quelle"', '"positiv"', '"negativ"']) assert.ok(!b.includes(k), k);
  for (const e of katalog.muster) for (const x of e.tests.positiv) assert.ok(!b.includes(x));
});

test('Pruefpipeline: Katalog besteht Schema, Treffer/Nicht-Treffer und Lasttest', () => {
  const r = pruefeKatalog(katalog, { fehlalarm: false });
  assert.deepEqual(r.fehler, []);
  assert.ok(r.zahlen.positiv >= 3 * katalog.muster.length && r.zahlen.negativ >= 3 * katalog.muster.length);
});

test('Pruefpipeline lehnt schlechte Beitraege mit festen Codes ab, ohne Testwerte auszugeben', () => {
  const base = katalog.muster[0];
  const e = (over) => Object.assign(JSON.parse(JSON.stringify(base)), over);
  const k = { format: 1, version: '2026.10.16-9', muster: [
    e({ id: 'cm_stern', regex: 'npm_[A-Za-z0-9]+' }),                              // unbeschraenkt
    e({ id: 'cm_stern' }),                                                          // doppelte Id
    e({ id: 'cm_echt', tests: { positiv: base.tests.positiv.concat(['mail an kunde@firma-ag.ch']), negativ: base.tests.negativ } }),
    e({ id: 'cm_ip', tests: { positiv: base.tests.positiv, negativ: base.tests.negativ.concat(['host 8.8.4.4']) } }),
    e({ id: 'cm_wenig', tests: { positiv: base.tests.positiv.slice(0, 2), negativ: base.tests.negativ } }),
    e({ id: 'cm_falsch', tests: { positiv: base.tests.positiv, negativ: base.tests.positiv } }),
    e({ id: 'cm_name', name: { de: 'Name\u202Eumgedreht', en: 'x' } }),             // Bidi-Zeichen (Auflage 8)
    e({ id: 'cm_doppelt', regex: '\\bhf_[A-Za-z]{34}\\b' }),                        // gleiche Regex wie eingebauter Typ
  ] };
  const { fehler } = pruefeKatalog(k, { fehlalarm: false });
  const has = (s) => assert.ok(fehler.some((f) => f.startsWith(s)), s + ' in ' + fehler.join(' | '));
  has('cm_stern: id_kollision');
  has('cm_stern: regex_unbounded');
  has('cm_echt: test_4_nicht_synthetisch');
  has('cm_ip: test_8_nicht_synthetisch');
  has('cm_wenig: tests_anzahl');
  has('cm_falsch: negativ_1_erkannt');
  has('cm_name: name');
  has('cm_doppelt: doppelt_zu_hf_token');
  for (const f of fehler) assert.match(f, /^[a-z0-9_#]+: [a-z0-9_]+$/);
  // Schema zuerst: fremde Lizenz oder Laufzeit-Flags scheitern schon dort (nur Pfad, kein Wert).
  for (const [over, want] of [[{ lizenz: 'GPL-3.0' }, 'schema $.muster[0].lizenz'], [{ flags: 'g' }, 'schema $.muster[0].flags'], [{ extra: 1 }, 'schema $.muster[0]']]) {
    const r = pruefeKatalog({ format: 1, version: '2026.10.16-9', muster: [e(Object.assign({ id: 'cm_schema' }, over))] }, { fehlalarm: false });
    assert.ok(r.fehler.some((x) => x.startsWith(want)), want + ' in ' + r.fehler.join(' | '));
  }
});

test('Pruefpipeline erkennt Fehlalarme ueber den bestehenden Korpus (scripts/fehlalarm.mjs)', { timeout: 300000 }, () => {
  const e = JSON.parse(JSON.stringify(katalog.muster[0]));
  Object.assign(e, { id: 'cm_zehn_ziffern', regex: '\\b\\d{10}\\b', tests: { positiv: ['0123456789', 'a 9876543210 b', 'Nr 1111111111'], negativ: ['123', 'abc', '12345'] } });
  const f = path.join(tmp, 'fehlalarm.json');
  fs.writeFileSync(f, JSON.stringify({ format: 1, version: '2026.10.16-9', muster: [e] }));
  const { fehler, zahlen } = pruefeKatalog(JSON.parse(fs.readFileSync(f, 'utf8')), { katalogDatei: f });
  assert.ok(fehler.some((x) => /^cm_zehn_ziffern: fehlalarm_\d+$/.test(x)), fehler.join(' | '));
  assert.ok(zahlen.fehlalarm_proben > 100000);
});

// --- safeRegex (Auflage 5) ------------------------------------------------------
test('safeRegex: erlaubt begrenzte, einfache Muster', () => {
  for (const [src, flags] of [['\\bnpm_[A-Za-z0-9]{36}\\b', ''], ['[A-Z]{2}\\d{2}(?: ?[A-Z0-9]{4}){2,7}', ''], ['(?:Kunde|Client)-\\d{6}', 'i'],
    ['https://discord\\.com/api/webhooks/\\d{17,20}/[A-Za-z0-9_-]{60,64}', ''], ['\\u00e4bc\\x41', 'u']]) {
    const r = DLX.muster.safeRegex(src, flags);
    assert.equal(r.ok, true, src + ' ' + r.err);
  }
});

test('safeRegex: lehnt ReDoS-Bauformen, Rueckverweise, Lookarounds und fremde Flags ab', () => {
  const bad = {
    'a+bc': 'unbounded', 'a*bc': 'unbounded', 'a{2,}bc': 'unbounded', '(?:a{1,9}){1,9}': 'nested', '(?:a|b){2}c': 'alternation',
    '(a)\\1bc': 'escape', '(?=a)abc': 'group', '(?<!a)abc': 'group', '(?<n>abc)': 'group', 'a{1,65}': 'bound', '\\d{64}\\d{64}\\d{64}\\d{64}\\d{64}': 'maxlen',
    '\\d{1,64}\\d{1,64}': 'cost', 'ab': 'minlen', '\\b': 'minlen', '[abc': 'class', 'abc)': 'paren', '\\p{L}{3}': 'escape', '(?: ?\\d{1,4}){3}': 'nested',
    '(?: ?a){11}': 'nested', 'a??{2}': 'quant', '[]abc': 'class', ['x'.repeat(301)]: 'length',
  };
  for (const [src, err] of Object.entries(bad)) assert.deepEqual(plain(DLX.muster.safeRegex(src, '')), { ok: false, err }, src);
  for (const f of ['g', 'm', 's', 'y', 'ig', 'd']) assert.equal(DLX.muster.safeRegex('abc', f).err, 'flags', f);
  assert.equal(DLX.muster.safeRegex('abc', 'iu').ok, true);
});

test('Lasttest: zulaessige Muster bleiben auf 150k boesartigen Zeichen im Zeitbudget (Fenster, Auflage 6)', () => {
  const org = DLX.muster.orgDetectors([{ id: 'org_last', regex: '[a-z]{1,30}[a-z]{1,30}x' }, { id: 'org_last2', regex: '(?: ?a){8}\\d{3}' }]);
  assert.ok(org);
  for (const text of ['a'.repeat(150000), ' a'.repeat(75000)]) {
    const t0 = performance.now();
    DLX.engine.scan(text, { packs: [], rules: {}, org });
    assert.ok(performance.now() - t0 < 600, 'Zeit ' + Math.round(performance.now() - t0));
  }
});

test('Fenster-Scan liefert dieselben Treffer wie die Regex auf dem ganzen Text (auch ueber Fenstergrenzen)', () => {
  const org = DLX.muster.orgDetectors([{ id: 'org_fenster', regex: '\\bab[0-9]{3,40}\\b', action: 'warn' }, { id: 'org_anfang', regex: '^xyz' }]);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let run = 0; run < 5; run++) {
    let text = 'xyz';
    while (text.length < 12000) { const r = rnd(); text += r < 0.1 ? ' ab' : r < 0.2 ? ' ' : r < 0.25 ? 'b' : String(Math.floor(rnd() * 10)); }
    const got = plain(DLX.engine.scan(text, { packs: [], rules: {}, org }).findings.map((f) => [f.id, f.start, f.end]));
    const want = [...text.matchAll(/\bab[0-9]{3,40}\b/g)].map((m) => ['org_fenster', m.index, m.index + m[0].length]).concat([['org_anfang', 0, 3]])
      .sort((a, b) => a[1] - b[1]);
    assert.deepEqual(got, want);
    assert.ok(want.some((w) => Math.floor(w[1] / 2048) !== Math.floor((w[2] - 1) / 2048)) || run, 'mindestens ein Treffer ueber einer Grenze');
  }
});

// --- Richtlinie customPatterns (Auflage 10) -----------------------------------------
const ORG = [{ id: 'org_projekt', regex: 'PRJ-\\d{5}', flags: 'i', category: 'firma', context: ['Projekt'], requireContext: false, action: 'block' },
  { id: 'org_kunde', regex: 'KD\\d{6}', requireContext: true, context: ['Kunde', 'Kundennummer'] }];

test('customPatterns aus der verwalteten Richtlinie: Treffer mit fester Aktion, nur generischer Name', () => {
  const e = DLX.policy.effective({ customPatterns: ORG }, {}, 'de-CH');
  assert.deepEqual(plain(e.errors), []);
  const cfg = DLX.policy.engineConfig(e.cfg);
  const r = DLX.engine.scan('KD123456 ' + 'Lorem ipsum dolor sit amet. '.repeat(10) + 'Bitte prj-12345 ansehen. Kundennummer KD654321.', cfg);
  const f = plain(r.findings.filter((x) => x.id.startsWith('org_')).map((x) => [x.id, x.action]));
  assert.deepEqual(f, [['org_projekt', 'block'], ['org_kunde', 'warn']]);
  assert.equal(DLX.i18n.typeName('de', 'org_projekt'), 'Eigenes Muster (Organisation)');
  assert.equal(DLX.i18n.typeName('en', 'cm_rubygems_key'), 'RubyGems API key');
});

test('customPatterns als Benutzerwert wird ignoriert (storage.local/sync)', () => {
  const e = DLX.policy.effective({}, { customPatterns: ORG }, 'de-CH');
  assert.equal(e.cfg.customPatterns, null);
  assert.equal(DLX.policy.engineConfig(e.cfg).org, null);
  assert.ok(DLX.policy.validate({ customPatterns: ORG }, true).errors.includes('unknown:customPatterns'));
});

test('ein ungueltiger Eintrag verwirft das ganze Feld; Fehler nennen nur den Schluessel', () => {
  const bad = [
    [{ id: 'org_a', regex: 'a+bc' }], [{ id: 'org_a', regex: 'abc', action: 'off' }], [{ id: 'kunde_a', regex: 'abc' }],
    [{ id: 'org_a', regex: 'abc', extra: 1 }], [{ id: 'org_a', regex: 'abc', context: ['x\u200Fy'] }], [{ id: 'org_a', regex: 'abc', flags: 'u' }],
    [{ id: 'org_a', regex: 'abc', requireContext: true }], [{ id: 'org_a', regex: 'abc', category: 'geheim' }],
    [{ id: 'org_a', regex: 'abc' }, { id: 'org_a', regex: 'abd' }], Array.from({ length: 51 }, (_, i) => ({ id: 'org_n' + i, regex: 'abc' })), 'abc', {},
  ];
  for (const v of bad) {
    const e = DLX.policy.effective({ customPatterns: v, globalPacks: ['finance'] }, {}, 'de-CH');
    assert.deepEqual(plain(e.errors), ['customPatterns'], JSON.stringify(v).slice(0, 60));
    assert.equal(e.cfg.customPatterns, null);
    assert.deepEqual(plain(e.cfg.globalPacks), ['finance'], 'uebrige Richtlinie gilt weiter');
  }
});

test('Gemeinschafts-Paket ist Standard an und abwaehlbar', () => {
  const on = DLX.policy.engineConfig(DLX.policy.effective({}, {}, 'de-CH').cfg);
  assert.ok(on.packs.includes('community'));
  const text = 'Schluessel tskey-auth-kAbCdEf1CNTRL-0123456789abcdefghijABCDEFGHIJ';
  assert.ok(DLX.engine.scan(text, on).findings.some((f) => f.id === 'cm_tailscale_key' && f.sure));
  const off = DLX.policy.engineConfig(DLX.policy.effective({ globalPacks: ['finance'] }, {}, 'de-CH').cfg);
  assert.ok(!DLX.engine.scan(text, off).findings.some((f) => f.id === 'cm_tailscale_key'));
});

// --- Schluesseldatei (Auflage 3) ----------------------------------------------------
test('Schluesseldatei: PKCS#8 mit scrypt + AES-256-GCM, falsche Passphrase scheitert', () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const text = verschluessele(privateKey, 'richtige-passphrase-123');
  const j = JSON.parse(text);
  assert.equal(j.kdf.name, 'scrypt');
  assert.equal(j.cipher, 'aes-256-gcm');
  assert.ok(!text.includes('PRIVATE'));
  const k = entschluessele(text, 'richtige-passphrase-123');
  assert.equal(crypto.createPublicKey(k).export({ format: 'der', type: 'spki' }).toString('hex'), crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('hex'));
  assert.throws(() => entschluessele(text, 'falsche-passphrase-123'));
});

// --- CI und Beitragsweg (Auflagen 1, 4, 9, 12) ------------------------------------------
test('CI-Workflow: Pruefer aus dem Basis-Commit, nur Katalog aus dem PR, keine Fremd-Actions/Secrets/Token', () => {
  const w = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'muster.yml'), 'utf8');
  assert.ok(!/^\s*-?\s*uses:/m.test(w), 'keine Fremd-Actions');
  assert.ok(!/^\s*pull_request_target\s*:/m.test(w));
  assert.ok(!/secrets\.|github\.token|GITHUB_TOKEN|extraheader|actions\/cache|upload-artifact/i.test(w));
  assert.match(w, /permissions:\s*\n\s*contents: read/);
  assert.match(w, /timeout-minutes:/);
  assert.match(w, /concurrency:/);
  assert.match(w, /pull_request\.base\.sha/);
  assert.match(w, /git show "\$HEAD_SHA:muster\/katalog\.json"/);
  for (const p of ['muster/schluessel/', 'muster/katalog.sig', '.github/', 'scripts/', 'CODEOWNERS']) assert.ok(w.includes(p), p);
  const owners = fs.readFileSync(path.join(ROOT, '.github', 'CODEOWNERS'), 'utf8');
  for (const p of ['/muster/schluessel/', '/muster/katalog.sig', '/scripts/', '/.github/']) assert.ok(owners.includes(p), p);
  const pr = fs.readFileSync(path.join(ROOT, '.github', 'PULL_REQUEST_TEMPLATE.md'), 'utf8');
  assert.match(pr, /- \[ \] .*synthetisch/i);
  const c = fs.readFileSync(path.join(ROOT, 'CONTRIBUTING.md'), 'utf8');
  for (const s of ['scripts/muster.mjs pruefen', 'synthetisch', 'Apache-2.0']) assert.ok(c.includes(s), s);
});

test('loadMitKatalog: PR-Katalog ersetzt das gebuendelte Paket', () => {
  const D = loadMitKatalog({ version: 'x', muster: [katalog.muster[0]] });
  assert.equal(D.packs.community.detectors.length, 1);
});
