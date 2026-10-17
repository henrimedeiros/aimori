// Tests der Laenderpakete Phase 2/3 (extension/engine/packs-world.js): Treffer und
// Nicht-Treffer je Datentyp, Katalog-Abdeckung, Kontext (NFKC), Lasttest,
// keine Werte in Konsole/Ergebnis, Hilfsalgorithmen (Design-Review Weltweit).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, EXT } from './helpers/load.mjs';
import { WORLD_CASES, WORLD_EXTRA } from './helpers/testwerte-welt.mjs';

const calls = [];
const spy = new Proxy({}, { get: () => (...a) => calls.push(a) });
const DLX = load(undefined, { console: spy });
const det = Array.from(DLX.engine.allDetectors()).filter((d) => d.pack !== 'community');   // Katalog: tests/muster.test.mjs
const byId = new Map(det.map((d) => [d.id, d]));
// Klasse tief ist standardmaessig aus: im Test einschalten; nur das eigene Paket aktiv.
const cfgFor = (id) => ({ packs: [byId.get(id).pack], rules: { [id]: 'warn' } });
const ids = (text, cfg) => Array.from(DLX.engine.scan(text, cfg).findings, (f) => f.id);

// Katalog der Datentypen weltweit (206 Typen): nicht als
// eigener Detektor umgesetzt, mit Grund (docs/datentypen-quellen.md).
const NICHT_EIGEN = {
  it_vat: 'abgedeckt durch it_iva (Praefix IT gilt ohne Kontextwort)',
  crypto_seed: 'braucht die BIP-39-Wortliste als gepinnte Datei (Auflage 6/10) -> Folgeschritt',
  person_name: 'Namens-Heuristik gehoert zum Folgeschritt Kombi-Risiko', address_heur: 'Adress-Heuristik gehoert zum Folgeschritt Kombi-Risiko',
  ch_plz_ort: 'nur Verstaerker der Adress-Heuristik (Folgeschritt Kombi-Risiko)',
  art9_gesundheit: 'Art.-9-Folgeschritt', art9_icd: 'Art.-9-Folgeschritt', art9_religion: 'Art.-9-Folgeschritt', art9_politik: 'Art.-9-Folgeschritt', art9_ethnie: 'Art.-9-Folgeschritt',
  art9_sex: 'Art.-9-Folgeschritt', art9_biometrie: 'Art.-9-Folgeschritt', art9_straf: 'Art.-9-Folgeschritt', art9_sozialhilfe: 'Art.-9-Folgeschritt',
};

test('jeder neue Datentyp hat einen Testfall und jeder Testfall einen Datentyp', () => {
  const src = fs.readFileSync(path.join(EXT, 'engine', 'packs-world.js'), 'utf8');
  const world = Array.from(src.matchAll(/\bD\('([a-z0-9_]+)'/g), (m) => m[1]).sort();
  assert.deepEqual(WORLD_CASES.map((c) => c[0]).sort(), world);
  for (const id of world) assert.ok(byId.has(id), id);
  assert.equal(world.length, 133);
  for (const id of Object.keys(NICHT_EIGEN)) assert.ok(!byId.has(id), id);
  assert.equal(det.length, 99 + 133 + 7);   // + 7 Typen im Paket context (tests/kontext.test.mjs, mit mass_table); 99 = 97 + 2 Code-Typen
});

for (const [id, pos, neg] of WORLD_CASES) {
  test(`${id}: Treffer und Nicht-Treffer`, () => {
    assert.ok(ids(pos, cfgFor(id)).includes(id), `${id} erwartet in: ${pos}`);
    assert.ok(!ids(neg, cfgFor(id)).includes(id), `${id} nicht erwartet in: ${neg}`);
  });
}

test('weitere Testvektoren (Bech32m, altes IE-Format, 12-stellige Personnummer, SIRET)', () => {
  for (const [id, text] of WORLD_EXTRA) assert.ok(ids(text, cfgFor(id)).includes(id), id + ': ' + text);
});

test('Typen ohne Pruefziffer melden ohne Kontextwort nichts', () => {
  for (const id of ['li_peid', 'us_itin', 'us_pass', 'us_dl', 'ar_dni', 'co_cc', 'ng_nin', 'ng_bvn', 'mt_id', 'eu_dl', 'gb_pass', 'ch_pass']) {
    const d = byId.get(id);
    assert.equal(d.needsCtx, true, id);
    assert.ok(!d.valid || d.valid.length === 1, id);
  }
  // Ohne Kontextwort melden nur Typen mit Laenderpraefix bzw. eindeutiger Struktur und
  // Pruefziffer (Krypto, Token, USt mit Praefix, HETU, CURP/RFC, PAN, GSTIN, CN, SG).
  const SICHER = 'btc_legacy btc_bech32 twilio hf_token npm_token es_dni es_nie es_vat pt_vat lu_tva se_vat dk_vat ' +
    'fi_hetu fi_vat ie_vat gb_vat pl_vat cz_dic sk_dph hu_vat ro_vat bg_vat hr_vat si_ddv mt_vat ee_kmkr lt_pvm lv_pvn mx_curp mx_rfc in_pan in_gstin sg_nric';
  const world = new Set(WORLD_CASES.map((c) => c[0]));
  assert.deepEqual(det.filter((d) => world.has(d.id) && !d.needsCtx && d.cls !== 'tief').map((d) => d.id).sort(), SICHER.split(' ').sort());
});

test('Kontextwort nach NFKC und ohne Gross-/Kleinschreibung (Auflage 8)', () => {
  assert.ok(ids('ＰＥＳＥＬ 44051401359', cfgFor('pl_pesel')).includes('pl_pesel'), 'Vollbreite');
  assert.ok(ids('pesel: 44051401359', cfgFor('pl_pesel')).includes('pl_pesel'), 'klein');
  assert.ok(ids('個人番号 1234 5678 9018', cfgFor('jp_mynum')).includes('jp_mynum'), 'CJK-Kontext');
});

test('Klasse tief ist standardmaessig aus (Auflage 8)', () => {
  for (const id of ['ipv6', 'mac', 'hostname_int', 'duns', 'gb_sort', 'bic', 'lei', 'ch_esr', 'de_hrb', 'fr_siren']) {
    assert.equal(byId.get(id).cls, 'tief', id);
    assert.equal(DLX.engine.actionFor(id, {}), 'off', id);
    const [, pos] = WORLD_CASES.find((c) => c[0] === id);
    assert.ok(!ids(pos, { packs: [byId.get(id).pack] }).includes(id), id + ' ohne Regel aus');
  }
});

test('Ergebnis enthaelt keine Werte, nichts landet in der Konsole (Auflage 4)', () => {
  calls.length = 0;
  const seen = new Set();
  for (const [id, pos] of WORLD_CASES) {
    const pack = byId.get(id).pack;
    if (seen.has(pack)) continue;
    seen.add(pack);
    const r = DLX.engine.scan(pos, cfgFor(id));
    for (const f of r.findings) assert.deepEqual(Object.keys(f).sort(), ['action', 'cat', 'end', 'id', 'start', 'sure']);
    const sum = JSON.stringify(Array.from(DLX.engine.summarize(r.findings)));
    assert.ok(!/\d{5}/.test(sum), pack + ': Zusammenfassung ohne Werte');
  }
  assert.ok(seen.size >= 45, 'mindestens ein Typ je neuem Paket: ' + seen.size);
  assert.equal(calls.length, 0);
});

test('Lasttest: 1 MB-Eingaben enden fail-safe, 200 KB je Art im Zeitbudget oder als nicht pruefbar (Auflage 3)', () => {
  const ALL = { packs: Object.keys(DLX.packs), rules: Object.fromEntries(det.map((d) => [d.id, 'warn'])) };
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const make = (abc, n) => { let s = ''; for (let i = 0; i < n; i++) s += abc[Math.floor(rnd() * abc.length)]; return s; };
  const words = 'abandon ability able about above absent absorb abstract absurd abuse access accident'.split(' ');
  const seedText = (n) => { let s = ''; while (s.length < n) s += words[Math.floor(rnd() * words.length)] + ' '; return s.slice(0, n); };
  const kinds = {
    zufall: (n) => make('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,-/:', n),
    ziffern: (n) => make('0123456789', n),
    hex: (n) => make('0123456789abcdefABCDEF:', n),
    seed: seedText,
  };
  for (const [name, gen] of Object.entries(kinds)) {
    const big = DLX.engine.scan(gen(1000000), ALL);
    assert.equal(big.unscannable, true, name + ' 1 MB');
    const t0 = performance.now();
    const r = DLX.engine.scan(gen(DLX.engine.MAX_LEN), ALL);
    const ms = performance.now() - t0;
    assert.ok(ms < 1500, `${name}: ${Math.round(ms)} ms`);
    // Zeitbudget ueberschritten -> nie still "sauber", sondern nicht pruefbar.
    if (ms > DLX.engine.BUDGET_MS * 1.5) assert.equal(r.unscannable, true, name);
  }
});

test('Hilfsalgorithmen: SHA-256 (FIPS 180-4), Verhoeff, ISO 7064 MOD 11-2, Base58Check, Bech32', () => {
  const D = DLX.dictionary;
  const hexOf = (w) => Array.from(w, (x) => x.toString(16).padStart(8, '0')).join('');
  const enc = (s) => new TextEncoder().encode(s);
  assert.equal(hexOf(D.sha256Words(enc(''))), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(hexOf(D.sha256Words(enc('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hexOf(D.sha256Words(enc('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  assert.equal(hexOf(D.sha256Words(D.wordsBytes(D.sha256Words(enc('abc'))))), '4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358');
  const V = DLX.validators;
  assert.ok(V.verhoeff('2363') && !V.verhoeff('2364'));
  assert.ok(V.iso7064_11_2('11010519491231002X'));
  assert.ok(!V.base58check('1PMycacnJaSqwwJqjawXBErnLsZ7RkXUA0'));
  assert.ok(V.bech32('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4') && !V.bech32('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5'));
  assert.ok(!V.bech32('bc1qW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'), 'gemischte Schreibweise ungueltig');
  assert.ok(V.ipv6('2a00:1450:4001:82a::200e') && !V.ipv6('2001:db8::1') && !V.ipv6('fe80::1') && !V.ipv6('2a00::1::2'));
});

test('EU-USt-Dispatcher prueft jetzt alle EU-Laender', () => {
  const EU = { packs: ['EU'] };
  for (const v of ['ESX2482300W', 'PT501964843', 'DK13585628', 'FI20774740', 'PL8567346215', 'CZ25123891', 'SK2022749619', 'HU12892312', 'RO18547290',
    'BG175074752', 'HR33392005961', 'SI50223054', 'EL123456783', 'CY10259033P', 'MT11679112', 'EE100931558', 'LT119511515', 'LV40003521600', 'LU15027442', 'IE6433435F', 'SE123456789701']) {
    assert.ok(ids('VAT ' + v, EU).includes('eu_vat_generic'), v);
    assert.ok(!ids('Teil ' + v.slice(0, -1) + (v.endsWith('1') ? '2' : '1'), EU).includes('eu_vat_generic') || /^(?:ES|IE|CY)/.test(v), 'ohne Kontext ungueltig: ' + v);
  }
});
