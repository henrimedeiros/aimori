// Tests: verwaltete Richtlinie lesen, validieren, sperren; Schema und Beispiel-JSON.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, ENGINE_FILES, ROOT, EXT } from './helpers/load.mjs';
import { validate as schemaValidate, unknownKeywords } from '../scripts/lib/schema.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/quellen.js', 'common/policy.js'], { URL });
const P = DLX.policy;
const plain = (v) => JSON.parse(JSON.stringify(v)); // aus dem vm-Realm loesen
const schema = JSON.parse(fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8'));
const example = JSON.parse(fs.readFileSync(path.join(ROOT, 'enterprise', 'example-policy.json'), 'utf8'));

test('Beispiel KI-Lenkung: gueltig nach Schema und Erweiterung, Vorschlag aktiv', () => {
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'enterprise', 'example-ki-lenkung.json'), 'utf8'));
  const schema = JSON.parse(fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8'));
  assert.deepEqual(schemaValidate(schema, ex), []);
  const D = load(['branding.js', ...ENGINE_FILES, 'common/aisites.js', 'common/policy.js'], { URL });
  assert.deepEqual([...D.policy.validate(ex).errors], []);
  const cfg = D.policy.effective(ex, {}, { timeZone: 'Europe/Zurich', languages: ['de-CH'] }).cfg;
  assert.equal(D.policy.aiSuggestion(cfg, 'chatgpt').url, 'https://copilot.cloud.microsoft/');
});

test('managed_schema.json nutzt nur von Chrome unterstuetzte Schluesselwoerter', () => {
  assert.deepEqual(unknownKeywords(schema), []);
});

test('Beispiel-Whitelabel-JSON passt zum Schema', () => {
  assert.deepEqual(schemaValidate(schema, example), []);
});

test('Beispiel-JSON ist auch fuer die Erweiterung gueltig (keine verworfenen Felder)', () => {
  const r = plain(P.validate(example));
  assert.deepEqual(r.errors, []);
  assert.equal(r.value.branding.productName, 'Example KI-Schutz');
  assert.equal(r.value.rules.ch_ahv, 'block');
});

test('Schema und Richtlinien-Lader kennen dieselben Schluessel', () => {
  for (const key of Object.keys(schema.properties)) {
    const r = plain(P.validate({ [key]: 12345 }));
    assert.ok(!r.errors.includes('unknown:' + key), `Lader kennt ${key} nicht`);
  }
  assert.deepEqual(plain(P.validate({ foo: 1 })).errors, ['unknown:foo']);
  assert.deepEqual(Object.keys(schema.properties.branding.properties).sort(), Object.keys(plain(P.defaults('de-CH')).branding).sort());
});

test('Regel-IDs im Schema-Beispiel sind bekannte Datentypen', () => {
  const known = new Set(Array.from(DLX.engine.allDetectors(), (d) => d.id).concat('dictionary', 'custom_term'));
  for (const id of Object.keys(example.rules)) assert.ok(known.has(id), id);
});

test('ungueltige Werte werden verworfen, nicht uebernommen', () => {
  const r = plain(P.validate({
    branding: { productName: '', primaryColor: 'red', supportUrl: 'http://example.com', logo: 'https://example.com/logo.png', companyName: 'Example AG' },
    language: 'xx', countryPacks: 'CH', globalPacks: ['finance', 'nope'], rules: { iban: 'delete', unknown_type: 'block', email: 'off' },
    allowUserOverride: 'false', allowedSites: ['chatgpt', 'example'], dictionary: { salt: 's', hashes: ['abc'] },
    reportingUrl: 'http://example.com/report',
  }));
  assert.deepEqual(r.value, { branding: { companyName: 'Example AG' }, globalPacks: ['finance'], rules: { email: 'off' }, allowedSites: ['chatgpt'] });
  for (const e of ['branding.productName', 'branding.primaryColor', 'branding.supportUrl', 'branding.logo', 'language', 'countryPacks',
    'globalPacks[]', 'rules.iban', 'rules.unknown_type', 'allowUserOverride', 'allowedSites[]', 'dictionary', 'reportingUrl']) {
    assert.ok(r.errors.includes(e), e);
  }
});

test('geerbte Schluessel (__proto__, constructor, toString) werden verworfen, nie uebernommen', () => {
  const r = plain(P.validate(JSON.parse('{"branding":{"__proto__":{},"toString":"x","constructor":1},"rules":{"__proto__":"off"}}')));
  assert.equal(r.value.branding, undefined);
  for (const e of ['branding.__proto__', 'branding.toString', 'branding.constructor', 'rules.__proto__']) assert.ok(r.errors.includes(e), e);
  assert.deepEqual(plain(P.countriesForLocale('constructor')), []);
  assert.deepEqual(plain(P.countriesForLocale('__proto__-xx')), []);
});

test('kaputte Richtlinie -> sichere Standardwerte (Schutz bleibt an)', () => {
  for (const raw of ['kaputt', 42, [1, 2], null, undefined]) {
    const e = plain(P.effective(raw, {}, 'de-CH'));
    assert.equal(e.managed, false);
    assert.deepEqual(e.cfg.allowedSites, ['chatgpt', 'claude', 'gemini', 'copilot', 'm365copilot']);
    assert.deepEqual(e.cfg.globalPacks, ['finance', 'secrets', 'contact', 'travel', 'marker', 'context', 'community']);
    assert.equal(e.cfg.allowUserOverride, true);
  }
});

test('Richtlinienwerte sind gesperrt und schlagen Benutzerwerte', () => {
  const managed = { language: 'fr', rules: { iban: 'block' }, countryPacks: ['CH'] };
  const local = { language: 'it', rules: { iban: 'off', email: 'off' }, countryPacks: ['US'], allowedSites: ['claude'], blockWhenInactive: false };
  const e = plain(P.effective(managed, local, 'de-CH'));
  assert.equal(e.cfg.language, 'fr');
  assert.deepEqual(e.cfg.countryPacks, ['CH']);
  assert.equal(e.cfg.rules.iban, 'block');
  assert.equal(e.cfg.rules.email, 'off', 'nicht verwaltete Regel bleibt Benutzerwahl');
  assert.deepEqual(e.cfg.allowedSites, ['chatgpt', 'claude', 'gemini', 'copilot', 'm365copilot'], 'Benutzer setzt keine Admin-Schluessel');
  assert.deepEqual(e.locked, { rules: { iban: true }, language: true, countryPacks: true, countryMode: true });
  assert.equal(e.managed, true);
});

test('allowedSites: unbekannte Site-ID wird nur einzeln ignoriert, nie alles offen (Auflage 2)', () => {
  const a = plain(P.effective({ allowedSites: ['chatgpt', 'neue-seite'] }, {}, 'de-CH'));
  assert.deepEqual(a.cfg.allowedSites, ['chatgpt']);
  assert.ok(a.errors.includes('allowedSites[]'));
  const b = plain(P.effective({ allowedSites: ['neue-seite'] }, {}, 'de-CH'));
  assert.deepEqual(b.cfg.allowedSites, [], 'nur Unbekanntes: alle Seiten gesperrt, nicht alle offen');
  assert.equal(b.locked.allowedSites, true);
  const c = plain(P.effective({ allowedSites: ['m365copilot'], language: 'fr' }, {}, 'de-CH'));
  assert.deepEqual(c.cfg.allowedSites, ['m365copilot']);
  assert.equal(c.cfg.language, 'fr', 'restliche Richtlinie bleibt gueltig');
});

test('reportingUrl ist nur reserviert und landet nie in der Konfiguration', () => {
  const e = plain(P.effective({ reportingUrl: 'https://cipp.example.com/api' }, {}, 'de'));
  assert.equal(JSON.stringify(e).includes('cipp.example.com'), false);
});

test('Standard-Laenderpakete aus der Browsersprache', () => {
  assert.deepEqual(plain(P.countriesForLocale('de-CH')), ['CH', 'EU']);
  assert.deepEqual(plain(P.countriesForLocale('de')), ['DE', 'AT', 'CH', 'EU']);
  assert.deepEqual(plain(P.countriesForLocale('fr-BE')), ['BE', 'EU']);
  assert.deepEqual(plain(P.countriesForLocale('en-US')), ['US']);
  assert.deepEqual(plain(P.countriesForLocale('pt-BR')), ['BR']);
  assert.deepEqual(plain(P.countriesForLocale('ja-JP')), ['JP']);
  assert.deepEqual(plain(P.countriesForLocale('ar-EG')), []);
});

test('Engine-Konfiguration: Pakete, Regeln, Woerterbuch als Set', () => {
  const e = P.effective(example, {}, 'en-US');
  const ec = P.engineConfig(e.cfg);
  assert.deepEqual(Array.from(ec.packs), ['CH', 'DE', 'AT', 'EU', 'finance', 'secrets', 'contact', 'travel', 'marker', 'context']);
  assert.equal(ec.dictionary.hashes.size, 2);
  const r = DLX.engine.scan('Offerte Projekt Zeder, AHV 756.1234.5678.97', ec);
  assert.deepEqual(Array.from(r.findings, (f) => [f.id, f.action]), [['dictionary', 'redact'], ['ch_ahv', 'block']]);
});

test('Woerterbuch: hoechstens 20000 Pruefsummen', () => {
  const many = Array.from({ length: P.MAX_HASHES + 1 }, () => 'a'.repeat(64));
  assert.ok(plain(P.validate({ dictionary: { salt: 's', hashes: many } })).errors.includes('dictionary'));
});

// Design-Review Fehlalarme 14.10.2026: Liste "Kein sensibler Wert", unsichere Funde.
test('engineConfig: Liste nur mit gueltigem Schluessel', () => {
  const cfg = P.defaults('de-CH');
  assert.equal(P.engineConfig(cfg, null).ignore, null);
  assert.equal(P.engineConfig(cfg, { key: 'zz', hashes: [] }).ignore, null);
  const e = P.engineConfig(cfg, { key: 'ab'.repeat(32), hashes: ['cd'.repeat(32)] });
  assert.equal(e.ignore.key.length, 32);
  assert.ok(e.ignore.hashes.has('cd'.repeat(32)));
});

test('Richtlinie: uncertainFindings und allowNotSensitive', () => {
  const v = P.validate({ uncertainFindings: 'enforce', allowNotSensitive: false });
  assert.equal(v.value.uncertainFindings, 'enforce');
  assert.equal(v.value.allowNotSensitive, false);
  const bad = P.validate({ uncertainFindings: 'aus', allowNotSensitive: 'false' });
  assert.deepEqual(Array.from(bad.errors).sort(), ['allowNotSensitive', 'uncertainFindings']);
  const d = P.defaults('de-CH');
  assert.equal(d.uncertainFindings, 'hint');
  assert.equal(d.allowNotSensitive, true);
});
