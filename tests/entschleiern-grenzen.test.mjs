// Verschleierte Daten: Grenzen der Varianten (engine/entschleiern.js). Pflicht-Pruefung 16.10.2026:
// ueber einer Grenze weggelassene Varianten machen den Text nicht pruefbar, nie still sauber.
// Nur synthetische Testwerte (Beispielnummer der ZAS).
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, ENGINE_FILES } from './helpers/load.mjs';

const DLX = load(ENGINE_FILES, { TextDecoder });   // TextDecoder wie im Browser
const ALL = { packs: Object.keys(DLX.packs) };
const AHV = '756.1234.5678.97';            // Beispiel der ZAS
const ch = (...c) => String.fromCharCode(...c);
const scan = (t, cfg = ALL) => DLX.engine.scan(t, cfg);

test('Pflicht-Pruefung 16.10.2026: Varianten nie still weggelassen - langer Text mit Doppelgaenger und Base64 am Ende', () => {
  const secret = 'AHV ' + AHV;
  const filler = 'Der Bericht zeigt steigende Zahlen im Verkauf, bitte bis Freitag prüfen. '.repeat(2400);   // ~170 000 Zeichen
  const t = filler + 'Konto ' + ch(0x0421) + 'H ok. ' + Buffer.from(secret).toString('base64');
  assert.ok(t.length > 150000 && t.length <= DLX.engine.MAX_LEN);
  const r = scan(t);
  assert.ok(r.unscannable || r.findings.some((f) => f.obf === 'dec'), 'Base64 am Ende gefunden oder nicht pruefbar, nie still sauber');
  // Mehr als LIMITS.tokens erfolgreich dekodierbare Stuecke: nicht pruefbar (too_long).
  const many = Array.from({ length: DLX.entschleiern.LIMITS.tokens + 5 }, (_, i) => Buffer.from('harmloser Satz Nummer ' + i).toString('base64')).join(' ');
  assert.equal(DLX.entschleiern.variants(many, () => {}).truncated, true);
  const r2 = scan(many);
  assert.deepEqual([r2.unscannable, r2.reason], [true, 'too_long']);
  // Viele Hashes (nicht dekodierbar) zaehlen nicht: bleibt pruefbar.
  const hashes = Array.from({ length: 300 }, (_, i) => (i.toString(16).padStart(4, '0') + 'a3f9c0de7b1145e2').repeat(3)).join(' ');
  assert.equal(scan('Logauszug: ' + hashes).unscannable, false);
});

// Pflicht-Pruefung 16.10.2026 (Runde 2): keine Stueckzahl-Grenzen mehr in joinSpaced/spelled, Grenze der
// neuen Variantenfunde in engine.deobf = nicht pruefbar. Erwartet: Fund mit obf oder nicht pruefbar.
const caught = (r, kind) => r.unscannable || r.findings.some((f) => f.obf === kind);
test('Pflicht-Pruefung Runde 2: ueber 2000 getrennt geschriebene Lockgruppen vor dem Geheimnis', () => {
  const lure = Array.from({ length: 2100 }, (_, i) => 'a b c d e f g ' + (i % 10)).join(', ');
  const t = lure + '. AHV ' + Array.from(AHV.replace(/\./g, '')).join(' ');
  assert.ok(t.length <= DLX.engine.MAX_LEN);
  assert.ok(caught(scan(t), 'join'));
});
test('Pflicht-Pruefung Runde 2: ueber 20000 Ziffernwoerter vor dem Geheimnis', () => {
  const lure = 'eins zwei drei, '.repeat(7000);   // 21 000 Ziffernwoerter, ohne Ziffernfolge
  const words = ['null', 'eins', 'zwei', 'drei', 'vier', 'fuenf', 'sechs', 'sieben', 'acht', 'neun'];
  const t = lure + 'AHV ' + Array.from(AHV.replace(/\./g, ''), (d) => words[Number(d)]).join(' ');
  assert.ok(t.length <= DLX.engine.MAX_LEN);
  assert.ok(caught(scan(t), 'words'));
});
test('Pflicht-Pruefung Runde 2: mehr als 500 neue Variantenfunde = nicht pruefbar, Grundfunde zaehlen nicht', () => {
  const zw = ch(0x200b);
  const many = Array.from({ length: 520 }, () => 'AHV 7' + zw + '56.1234.5678.97').join('\n');
  assert.ok(caught(scan(many), 'norm'));
  const r = scan(many);
  if (r.unscannable) assert.equal(r.reason, 'too_long');
  // 600 gewoehnliche Mailadressen + ein unsichtbares Zeichen: Grundfunde, keine neuen Variantenfunde.
  const mails = Array.from({ length: 600 }, (_, i) => 'p' + i + '@example.com').join(' ') + zw;
  assert.equal(scan(mails).reason === 'too_long', false);
});

// Pflicht-Pruefung 16.10.2026 (Runde 3): ein Tabellenfund ersetzt Grundfunde nur mit der strengsten
// Aktion - die Richtlinie ergibt mit Tabellen-Erkennung nie eine mildere Aktion als ohne.
test('Pflicht-Pruefung Runde 3: mass_table warn, Grundfund block in gekuerzter Zeile bzw. unsicher in Zelle - bleibt block', () => {
  const P = Object.keys(DLX.packs);
  // Zeilen-Modus: einziger blockierender Fund (AHV) liegt in den entfernten Zeilen.
  const t1 = 'Name;E-Mail;AHV\n' + Array.from({ length: 12 }, (_, i) => 'Anna Muster' + i + ';anna' + i + '@example.com;' + (i === 11 ? AHV : '-')).join('\n');
  const c1 = { packs: P, rules: { mass_table: 'warn', ch_ahv: 'block' }, tableRedaction: 'rows' };
  const r1 = scan(t1, c1);
  assert.ok(r1.findings.some((f) => f.id === 'mass_table' && f.rows), 'gekuerzte Zeilen');
  assert.ok(!r1.findings.some((f) => f.id === 'ch_ahv'), 'AHV durch den Tabellenfund ersetzt');
  assert.equal(DLX.engine.strictest(r1.findings), 'block');
  assert.equal(DLX.engine.strictest(scan(t1, Object.assign({}, c1, { tableScan: false })).findings), 'block', 'ohne Tabellen-Erkennung ebenso');
  // Spalten-Modus: unsichere Telefonnummern in Zellen (ch_tel unsicher) auf block.
  const t2 = 'Name;E-Mail;Telefon\n' + Array.from({ length: 12 }, (_, i) => 'Anna Muster' + i + ';anna' + i + '@example.com;079 000 00 ' + String(i).padStart(2, '0')).join('\n');
  const r2 = scan(t2, { packs: P, rules: { mass_table: 'warn', ch_tel: 'block' } });
  const phoneCells = r2.findings.filter((f) => f.id === 'mass_table' && /^079/.test(t2.slice(f.start, f.end)));
  assert.ok(phoneCells.length >= 10, 'Telefon-Zellen als Tabellenfunde');
  assert.ok(phoneCells.every((f) => f.action === 'block'), 'Zellen mit ersetztem block-Fund sind block');
});

// Pflicht-Pruefung 16.10.2026 (Runde 4): ein Variantenfund, der einen Grund- oder Tabellenfund
// ueberlappt, hebt dessen Aktion an statt still zu entfallen.
test('Pflicht-Pruefung Runde 4: verschleierte AHV (block) in gekuerzter Zeile und in Tabellenzelle - bleibt block', () => {
  const P = Object.keys(DLX.packs);
  const hidden = '7' + ch(0x200b) + '56.1234.5678.97';
  const rules = { mass_table: 'warn', ch_ahv: 'block' };
  const t = 'Name;E-Mail;Versichertennummer\n' + Array.from({ length: 12 }, (_, i) => 'Anna Muster' + i + ';anna' + i + '@example.com;' + (i === 11 || i === 0 ? hidden : '-')).join('\n');
  for (const tableRedaction of ['rows', 'columns']) {
    const r = scan(t, { packs: P, rules, tableRedaction });
    assert.equal(r.unscannable, false);
    assert.ok(r.findings.some((f) => f.id === 'mass_table'), tableRedaction + ': Tabellenfund');
    assert.equal(DLX.engine.strictest(r.findings), 'block', tableRedaction);
  }
  // Ohne Tabelle: verschleierte AHV ueberlappt keinen Grundfund und kommt selbst als block.
  assert.equal(DLX.engine.strictest(scan('AHV ' + hidden, { packs: P, rules }).findings), 'block');
});
