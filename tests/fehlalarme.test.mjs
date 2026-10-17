// Fehlalarme: Stufen sicher/unsicher, offensichtlicher Nicht-Kontext, Liste
// "Kein sensibler Wert" (HMAC, Ablauf, Nonce-Bindung). Design-Review Fehlalarme
// 14.10.2026, Auflagen in docs/sicherheit/design-review-fehlalarme.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers/load.mjs';

const DLX = load();
const ALL = { packs: Object.keys(DLX.packs), rules: {} };
const IBAN = 'CH9300762011623852957';
const scan = (text, cfg = ALL) => Array.from(DLX.engine.scan(text, cfg).findings, (f) => ({ id: f.id, v: text.slice(f.start, f.end), sure: f.sure }));
const one = (text, id) => scan(text).find((f) => f.id === id) || null;

test('Karten: unformatiert ohne Kontextwort unsicher, mit Kontext oder Normformat sicher', () => {
  assert.equal(one('x 4242424242424242 y', 'cc_visa').sure, false);
  assert.equal(one('Kreditkarte 4242424242424242', 'cc_visa').sure, true);
  assert.equal(one('4242 4242 4242 4242', 'cc_visa').sure, true);
  assert.equal(one('4242-4242-4242-4242', 'cc_visa').sure, true);
  assert.equal(one('EAN 4012345678901', 'cc_visa'), null, '13-stellig ohne Luhn');
});

test('Auflage 3: Karte mit CVV oder MM/YY bleibt sicher, Gruppe inmitten weiterer Gruppen nur unsicher', () => {
  assert.equal(one('4242 4242 4242 4242 123', 'cc_visa').sure, true, 'CVV');
  assert.equal(one('4242 4242 4242 4242 1234', 'cc_visa').sure, true, 'CVV 4');
  assert.equal(one('4242 4242 4242 4242 12/27', 'cc_visa').sure, true, 'Ablauf');
  assert.equal(one('4242 4242 4242 4242 1234 5678', 'cc_visa').sure, false, 'zwei Gruppen danach');
});

test('Auflage 2: Pruefziffer-Typen im Nicht-Kontext werden unsicher, nie verworfen', () => {
  assert.equal(one('x = 0.4242424242424242;', 'cc_visa').sure, false, 'Dezimalzahl');
  assert.equal(one('a716-4242424242424242', 'cc_visa').sure, false, 'Teil einer Folge');
  assert.equal(one('https://example.com/u/756.1234.5678.97', 'ch_ahv').sure, false, 'Pfad');
  assert.equal(one('Version 756.1234.5678.97', 'ch_ahv').sure, false, 'Version');
  // Ziffern ohne Pruefziffer (Telefon, IPv4) duerfen ganz wegfallen.
  assert.equal(one('Fax 3.0791234567', 'ch_tel'), null);
  assert.equal(one('https://example.com/tel/0791234567', 'ch_tel'), null);
  assert.deepEqual(scan('v8.8.8.8 und Version 8.8.8.8 und build 8.8.8.8'), []);
});

test('Auflage 4: Werte in Query/Fragment werden hoechstens unsicher', () => {
  assert.equal(one('https://example.com/a?ahv=756.1234.5678.97', 'ch_ahv').sure, false);
  assert.equal(one('https://example.com/a#tel=0791234567', 'ch_tel').sure, false);
  assert.equal(one('https://example.com/a?iban=' + IBAN, 'iban').sure, false);
});

test('Hex-Hash und UUID: Funde darin unsicher bzw. verworfen', () => {
  const hex = 'A3F0' + 'I<UTOD231458907<<<<<<<<<<<<<<<'.replace(/[^0-9A-F]/g, '') + 'B2C4D5E6F7A8B9C0D1E2';
  assert.ok(!scan('sha ' + hex.toLowerCase()).some((f) => f.sure));
  assert.ok(!scan('550e8400-e29b-41d4-a716-446655440000').some((f) => f.sure));
});

test('Telefon und IPv4: sicher nur mit Kontextwort', () => {
  assert.equal(one('Nummer 079 123 45 67', 'ch_tel').sure, false);
  assert.equal(one('Tel. 079 123 45 67', 'ch_tel').sure, true);
  assert.equal(one('Antwort von 8.8.8.8', 'ipv4').sure, false);
  assert.equal(one('Server 8.8.8.8', 'ipv4').sure, true);
});

test('AHV, NIR, BE: unformatiert nur mit Kontext sicher', () => {
  assert.equal(one('Nr 7561234567897', 'ch_ahv').sure, false);
  assert.equal(one('AHV 7561234567897', 'ch_ahv').sure, true);
  assert.equal(one('Nr 756.1234.5678.97', 'ch_ahv').sure, true);
  assert.equal(one('Nr 295109912611193', 'fr_nir').sure, false);
  assert.equal(one('Nr 85073003328', 'be_nn').sure, false);
});

test('HMAC-SHA-256 (RFC 4231, Testfall 2)', () => {
  const key = new TextEncoder().encode('Jefe');
  assert.equal(DLX.dictionary.hmacHex(key, 'what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
});

test('Liste "Kein sensibler Wert": markierter Wert faellt weg, andere bleiben; Telefon/IPv4 nie', () => {
  const key = new Uint8Array(32).fill(7);
  const h = DLX.engine.ignoreHash(key, 'iban', 'CH93 0076 2011 6238 5295 7');
  assert.equal(h, DLX.engine.ignoreHash(key, 'iban', IBAN), 'normalisiert');
  assert.notEqual(h, DLX.engine.ignoreHash(key, 'cc_visa', IBAN), 'Typ gehoert dazu');
  const cfg = { packs: ALL.packs, rules: {}, ignore: { key, hashes: new Set([h]) } };
  assert.deepEqual(scan('IBAN ' + IBAN, cfg), []);
  assert.deepEqual(scan('IBAN DE89370400440532013000', cfg).map((f) => f.id), ['iban']);
  assert.deepEqual(scan('IBAN ' + IBAN, { packs: ALL.packs, rules: {}, ignore: { key: new Uint8Array(32), hashes: new Set([h]) } }).map((f) => f.id), ['iban'], 'anderer Schluessel');
  assert.equal(DLX.engine.ignorable('ch_tel'), false);
  assert.equal(DLX.engine.ignorable('phone_e164'), false);
  assert.equal(DLX.engine.ignorable('ipv4'), false);
  assert.equal(DLX.engine.ignorable('iban'), true);
  assert.equal(DLX.engine.ignorable('dictionary'), false);
});

test('Auflage 5: Nachbarpruefung bleibt linear (1 MB in Bloecken der Scan-Grenze)', () => {
  let s = 0x1234;
  const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s; };
  const digits = Array.from({ length: 12500 }, () => String(r()).padStart(10, '0') + String(r() % 1000000).padStart(6, '0')).join('-');
  const hex = Array.from({ length: 6000 }, () => r().toString(16).padStart(8, '0') + '-' + (r() % 9999).toString().padStart(4, '0')).join(' ');
  // Aufwaermen (JIT/Regex-Kompilierung) und bis zu 3 Versuche je Block: gemessen wird die
  // lineare Laufzeit, nicht der Kaltstart oder fremde Last. Im parallelen Volllauf kippte der
  // Test am 14.10.2026 auch auf dem Stand vor dem Paket context (1 von 2 Laeufen); quadratisches
  // Verhalten faellt weiterhin bei jedem Versuch durch. Im Produkt ist Zeitueberschreitung
  // fail-closed (nicht pruefbar).
  for (const t of [digits, hex]) DLX.engine.scan(t.slice(0, 5000), ALL);
  for (const t of [digits, hex]) {
    for (let i = 0; i < t.length; i += DLX.engine.MAX_LEN) {
      let ok = false;
      for (let k = 0; k < 3 && !ok; k++) ok = !DLX.engine.scan(t.slice(i, i + DLX.engine.MAX_LEN), ALL).unscannable;
      assert.ok(ok, 'innerhalb des Zeitbudgets');
    }
  }
});
