// Fehlalarme in Alltags- und Geschaeftstexten (23.10.2026) und "nie ein eigenes Fenster".
// Messung mit dem lokalen Modell (feste Ausgaben in helpers/alltag-ki-ausgaben.json, damit
// der Test ohne Modell laeuft): vorher 14 von 96 Texten mit sicherem Fund (28 oeffentliche
// Firmennamen, 1 "PLZ Ort"), nachher 0 von 96; Regel-Engine 0 von 96, echte Treffer unveraendert.
// Design-Review Fehlalarme KI / kein Fenster 23.10.2026 (docs/sicherheit/design-review-kein-fenster-23-10.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, ENGINE_FILES, EXT } from './helpers/load.mjs';
import { ALLTAG, TREFFER } from './helpers/alltag-korpus.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'engine/ki.js', 'common/aisites.js', 'common/policy.js'], { URL });
const K = DLX.ki;
const AUSGABEN = JSON.parse(fs.readFileSync(new URL('./helpers/alltag-ki-ausgaben.json', import.meta.url), 'utf8'));
const engFor = (env) => DLX.policy.engineConfig(DLX.policy.defaults(env));
const CFG = engFor('de-CH');
const sure = (list) => Array.from(list).filter((f) => f.sure !== false && f.action !== 'off');
const ent = (text, value, type, score = 0.99) => ({ type, start: text.indexOf(value), end: text.indexOf(value) + value.length, score });
const kiOne = (text, value, type, score) => K.findings(text, [ent(text, value, type, score)], CFG)[0] || null;

test('Alltagskorpus: Regel-Engine meldet nichts sicher, echte Treffer bleiben sicher (Passwort, IBAN, Karte, Schluessel, AHV)', () => {
  for (const env of ['de-CH', 'en-US']) {
    const eng = engFor(env);
    const fa = ALLTAG.filter((t) => sure(DLX.engine.scan(t, eng).findings).length);
    assert.deepEqual(fa, [], env);
  }
  const eng = engFor('de-CH');
  for (const r of TREFFER) {
    const hit = sure(DLX.engine.scan(r.text, eng).findings).some((f) => (r.id ? f.id === r.id : f.cat === 'technik'));
    assert.ok(hit, r.id || r.cat);
  }
});

test('Alltagskorpus: lokale KI meldet keinen sicheren Fund mehr (vorher 14/96), oeffentliche Firmennamen nur dezent', () => {
  assert.equal(AUSGABEN.length, ALLTAG.length);
  let dezentFirma = 0;
  ALLTAG.forEach((t, i) => {
    const ents = K.valid({ ents: AUSGABEN[i].map(([type, start, end, score]) => ({ type, start, end, score })) }, t.length);
    assert.ok(ents, 'gueltige Modell-Ausgabe ' + i);
    const f = K.findings(t, ents, CFG);
    assert.equal(f.filter((x) => x.sure).map((x) => x.id + ':' + t.slice(x.start, x.end)).join(), '', t);
    dezentFirma += f.filter((x) => x.id === 'company' && !x.sure).length;
  });
  // Bekannte Luecke (Auflage 5): Firmennamen ohne Kontextwort und ohne Rechtsform bleiben als
  // dezenter Hinweis sichtbar, loesen aber keine Meldung mehr aus.
  assert.equal(dezentFirma, 29);
});

test('Firmen: sicher nur mit Kontextwort oder Rechtsform direkt hinter dem Namen; Praeposition allein reicht nicht', () => {
  const t1 = 'Vertrag mit der Zeltwerk Bau AG pruefen.';
  assert.equal(kiOne(t1, 'Zeltwerk Bau AG', 'ORGANIZATION_NAME', 0.95).sure, true);
  for (const [t, v] of [['Offerte von Westbrook Cables plc anfragen.', 'Westbrook Cables plc'], ['Contratto con Ferroni Metalli Srl.', 'Ferroni Metalli Srl'],
    ['Factura a Asesoría Monteclaro SL enviar.', 'Asesoría Monteclaro SL'], ['Offre de Lagoverde Logistica Sagl.', 'Lagoverde Logistica Sagl']]) {
    assert.equal(kiOne(t, v, 'ORGANIZATION_NAME', 0.95).sure, true, v);
  }
  const t2 = 'Kurz SL notieren.';
  assert.equal(kiOne(t2, 'SL', 'ORGANIZATION_NAME', 0.95).sure, false, 'Rechtsform allein ist kein Name');
  const t3 = 'Ich habe bei Migros die Preise verglichen.';
  assert.equal(kiOne(t3, 'Migros', 'ORGANIZATION_NAME', 0.99).sure, false, 'bei + Marke = dezent');
  const t4 = 'Unser Kunde Brunnfeld Logistik hat angerufen.';
  assert.equal(kiOne(t4, 'Brunnfeld Logistik', 'ORGANIZATION_NAME', 0.8).sure, true, 'Kontextwort Kunde macht sicher');
});

test('Personen und Adressen: Personen unveraendert, nur "PLZ Ort" ohne Strasse ist keine sichere Postadresse', () => {
  const t = 'Mail an Thomas Brunnhuber, Lindenweg 14, 5610 Wohlenbach.';
  assert.equal(kiOne(t, 'Thomas Brunnhuber', 'PERSON_NAME', 0.95).sure, true);
  assert.equal(kiOne(t, 'Lindenweg 14, 5610 Wohlenbach', 'POSTAL_ADDRESS', 0.95).sure, true);
  const m = 'Bitte frag Monika noch einmal.';
  assert.equal(kiOne(m, 'Monika', 'PERSON_NAME', 0.99).sure, true);
  assert.equal(kiOne(m, 'Monika', 'PERSON_NAME', 0.95).sure, false);
  const o = 'Gebiet: 8000 Zuerich und 3000 Bern.';
  assert.equal(kiOne(o, '3000 Bern', 'LOCATION', 0.99).sure, false);
  assert.equal(kiOne(o, '3000 Bern', 'POSTAL_ADDRESS', 0.99).sure, false);
});

test('Eigene geschuetzte Begriffe bleiben sicher, auch wenn die KI denselben Namen nur dezent meldet (Auflage 2)', () => {
  const D = DLX.dictionary;
  const SALT = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
  const terms = [D.termList(SALT, [D.termHash(SALT, D.prepareTerm('Ostwind').term)])];
  const t = 'Ich habe bei Ostwind angefragt.';
  const rules = Array.from(DLX.engine.scan(t, { packs: [], terms }).findings);
  const ki = K.findings(t, [ent(t, 'Ostwind', 'ORGANIZATION_NAME', 0.99)], CFG);
  assert.equal(ki[0].sure, false);
  const merged = K.merge(rules, ki);
  assert.equal(JSON.stringify(merged.map((f) => [f.id, f.sure])), '[["custom_term",true]]');
});

test('Schwellen sind feste Konstanten im Code (Auflage 4)', () => {
  const src = fs.readFileSync(path.join(EXT, 'engine', 'ki.js'), 'utf8');
  assert.match(src, /const HIGH = 0\.9;/);
  assert.match(src, /const LOW = 0\.6;/);
  assert.ok(Object.isFrozen(K));
});

// Edge zeigte das Rueckfall-Popupfenster ui/dialog.html als ERR_BLOCKED_BY_CLIENT (23.10.2026).
test('Quelltext: kein windows.create/tabs.create auf eine eigene Seite ausser der Formular-Wache, dialog.html nur eingebettet (Auflagen 5, 6)', () => {
  const files = [];
  const walk = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, n.name); if (n.isDirectory()) { if (n.name !== 'vendor') walk(p); } else if (n.name.endsWith('.js')) files.push(p); } };
  walk(EXT);
  const opens = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/chrome\.(windows|tabs)\.create\(([^\n]*)/g)) if (/getURL/.test(m[2])) opens.push(path.relative(EXT, f) + ': ' + m[2].slice(0, 40));
  }
  assert.deepEqual(opens, ['background.js: { url: chrome.runtime.getURL(FORM_PAGE +']);
  const bg = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  assert.doesNotMatch(bg, /'fallback'|popupWindowId|popupTabId/);
  assert.match(bg, /const FORM_PAGE = 'ui\/formwache\.html';/);
  const dlg = fs.readFileSync(path.join(EXT, 'ui', 'dialog.js'), 'utf8');
  assert.match(dlg, /if \(window\.top === window\) return;/);
  assert.doesNotMatch(fs.readFileSync(path.join(EXT, 'content', 'content.js'), 'utf8'), /t: 'fallback'/);
});
