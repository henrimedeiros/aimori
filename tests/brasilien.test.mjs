// Tests: Laenderpaket Brasilien (CPF, CNPJ inkl. alphanumerisch, Telefon, CEP),
// Fehlalarm-Gegenproben, Lasttest, Richtlinie/ADMX (Design-Review 14.10.2026
// Auflagen 7-13). Testwerte: allgemein dokumentierte Beispielwerte (CPF
// 111.444.777-35, CNPJ 11.222.333/0001-81, Receita-Beispiel 12.ABC.345/01DE-35),
// Telefonnummern synthetisch mit gueltiger Vorwahl.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, EXT } from './helpers/load.mjs';
import { build } from '../scripts/build-admx.mjs';

const DLX = load(['branding.js', 'engine/core.js', 'engine/packs-global.js', 'engine/packs-secrets.js', 'engine/packs-marker.js', 'engine/packs-context.js', 'engine/packs-country.js',
  'engine/dictionary.js', 'engine/engine.js', 'common/policy.js']);
const V = DLX.validators;
const BR = { packs: ['BR'], rules: { br_cep: 'warn' } };
const ids = (text, cfg = BR) => Array.from(DLX.engine.scan(text, cfg).findings, (f) => f.id);

test('CPF: Pruefziffern, Format, Kontext', () => {
  assert.equal(V.brCpf('111.444.777-35'), true);
  assert.equal(V.brCpf('11144477735'), true);
  for (const bad of ['111.444.777-36', '111.444.777-45', '111.111.111-11', '000.000.000-00', '999.999.999-99', '1114447773']) assert.equal(V.brCpf(bad), false, bad);
  assert.deepEqual(ids('Mein CPF ist 111.444.777-35'), ['br_cpf']);
  assert.deepEqual(ids('Referenz 111.444.777-35'), ['br_cpf'], 'formatiert ohne Kontext');
  assert.deepEqual(ids('CPF 11144477735'), ['br_cpf'], 'unformatiert mit Kontext');
  assert.deepEqual(ids('Bestellung 11144477735'), [], 'unformatiert ohne Kontext');
});

test('CNPJ: numerisch und alphanumerisch (ab Juli 2026), Kontext', () => {
  for (const ok of ['11.222.333/0001-81', '11222333000181', '12.ABC.345/01DE-35', '12ABC34501DE35']) assert.equal(V.brCnpj(ok), true, ok);
  for (const bad of ['11.222.333/0001-82', '12.ABC.345/01DE-36', '12.abc.345/01de-35', '00.000.000/0000-00', '11111111111111', 'AAAAAAAAAAAA00', '12ABC34501DEX5']) {
    assert.equal(V.brCnpj(bad), false, bad);
  }
  assert.deepEqual(ids('Firma 11.222.333/0001-81'), ['br_cnpj'], 'formatiert ohne Kontext');
  assert.deepEqual(ids('Firma 12.ABC.345/01DE-35'), ['br_cnpj'], 'alphanumerisch formatiert');
  assert.deepEqual(ids('CNPJ 11222333000181'), ['br_cnpj']);
  assert.deepEqual(ids('CNPJ 12ABC34501DE35'), ['br_cnpj']);
  assert.deepEqual(ids('Artikel 11222333000181'), [], '14 Ziffern ohne Kontext');
  assert.deepEqual(ids('Artikel 12ABC34501DE35'), [], 'alphanumerisch unformatiert ohne Kontext');
  assert.deepEqual(ids('cnpj 12.abc.345/01de-35'), [], 'Kleinbuchstaben nie');
});

test('Telefon: Vorwahl-Positivliste, mobil 9 Stellen mit 9, Festnetz 8 Stellen mit 2-5', () => {
  for (const ok of ['+55 11 91234-5678', '+55 (21) 2345-6789', '0055 11 912345678', '(11) 91234-5678', '(61) 3123-4567']) assert.equal(V.brTelValid(ok), true, ok);
  for (const bad of ['+55 10 91234-5678', '(20) 2345-6789', '(11) 81234-5678', '(11) 6123-4567', '(11) 1234-5678', '+55 11 1234-567']) assert.equal(V.brTelValid(bad), false, bad);
  assert.deepEqual(ids('Ligue (21) 2345-6789'), ['br_tel']);
  assert.ok(DLX.engine.scan('Ligue +55 11 91234-5678', { packs: ['BR', 'contact'] }).findings.length === 1, '+55 wird erkannt (BR oder international)');
  assert.deepEqual(ids('Preis 2345-6789'), [], 'ohne Vorwahl kein Treffer');
});

test('CEP: nur mit Kontextwort, standardmaessig aus', () => {
  assert.deepEqual(ids('CEP: 01310-100'), ['br_cep']);
  assert.deepEqual(ids('CEP 01310-100'), ['br_cep']);
  assert.deepEqual(ids('Teil 01310-100'), [], 'ohne Kontext');
  assert.deepEqual(ids('Konzept 01310-100'), [], 'Wortteil "cep" zaehlt nicht');
  assert.deepEqual(ids('CEP: 01310-100', { packs: ['BR'] }), [], 'Klasse tief: ohne Regel aus');
});

test('Gegenproben: Hex/Base36, Wiederholungen, andere Laender bleiben still', () => {
  const quiet = ['hash DEADBEEF12345678 ok', 'id 0123456789ABCD', 'ID 9F86D081884C7D', 'build 1A2B3C4D5E6F78', 'Kontonummer 11111111111',
    'AHV 756.1234.5678.97', 'IBAN CH9300762011623852957', 'Version 1.2.3', 'Datum 2026-10-14', 'Zeit 12:34-56:78'];
  for (const t of quiet) assert.deepEqual(ids(t), [], t);
  assert.deepEqual(ids('CPF 111.444.777-35', { packs: ['CH', 'DE', 'US', 'EU'] }), [], 'Paket nicht aktiv -> nichts');
});

test('Lasttest: lange boesartige Eingaben bleiben schnell (ReDoS)', () => {
  const evil = ['1.'.repeat(75000), '(11) '.repeat(30000), '+55 '.repeat(37000), 'A.'.repeat(75000), '12345-'.repeat(25000), 'AB/'.repeat(50000), '9'.repeat(150000)];
  for (const e of evil) {
    const t0 = performance.now();
    DLX.engine.scan(e, BR);
    const ms = performance.now() - t0;
    assert.ok(ms < 300, `zu langsam (${Math.round(ms)} ms): ${e.slice(0, 12)}...`);
  }
});

test('Richtlinie: BR in COUNTRY, managed_schema und ADMX-Erklaerung; alte Werte bleiben gueltig', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8'));
  assert.deepEqual(schema.properties.countryPacks.items.enum, Array.from(DLX.policy.COUNTRY));
  const { files } = build();
  for (const [name, text] of Object.entries(files)) {
    if (!name.endsWith('.adml') || !name.startsWith('de-DE')) continue;
    for (const c of DLX.policy.COUNTRY) assert.ok(text.includes(c), name + ' ' + c);
  }
  const v = DLX.policy.validate({ countryPacks: ['CH', 'DE', 'AT', 'FR', 'IT', 'BE', 'NL', 'US', 'EU'] });
  assert.deepEqual(Array.from(v.errors), [], 'bisherige Liste gueltig');
  assert.deepEqual(Array.from(DLX.policy.validate({ countryPacks: ['BR'] }).value.countryPacks), ['BR']);
});
