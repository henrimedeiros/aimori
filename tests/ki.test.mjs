// Lokale KI-Erkennung (Design-Review KI 16.10.2026, docs/sicherheit/design-review-ki.md):
// Antwortpruefung, Abbildung, Kontext/Konfidenz, Vorrang der Regeln, Platzhalter,
// Richtlinie, Fenster/BIO-Logik mit Attrappen-Modell, Quelltext ohne Netz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, ENGINE_FILES, EXT, ROOT } from './helpers/load.mjs';
import { createRunner } from '../extension/ui/ki-lauf.mjs';

const DLX = load(ENGINE_FILES.concat(['engine/ki.js', 'engine/pseudonym.js', 'common/policy.js']), { Intl });
const K = DLX.ki;
const CFG = { packs: Object.keys(DLX.packs), rules: {} };
const plain = (x) => JSON.parse(JSON.stringify(x));
const ent = (text, value, type, score = 0.99) => ({ type, start: text.indexOf(value), end: text.indexOf(value) + value.length, score });

test('KI-Antwort: nur bekannte Typen, ganzzahlige Grenzen im Text, Konfidenz 0..1 (Auflage 16)', () => {
  const ok = { ents: [{ type: 'PERSON_NAME', start: 0, end: 4, score: 0.9 }] };
  assert.deepEqual(plain(K.valid(ok, 10)), ok.ents);
  for (const bad of [
    null, {}, { ents: 'x' },
    { ents: [{ type: 'EVIL', start: 0, end: 4, score: 0.9 }] },
    { ents: [{ type: 'PERSON_NAME', start: 0, end: 11, score: 0.9 }] },
    { ents: [{ type: 'PERSON_NAME', start: 4, end: 4, score: 0.9 }] },
    { ents: [{ type: 'PERSON_NAME', start: -1, end: 4, score: 0.9 }] },
    { ents: [{ type: 'PERSON_NAME', start: 0.5, end: 4, score: 0.9 }] },
    { ents: [{ type: 'PERSON_NAME', start: 0, end: 4, score: 1.5 }] },
    { ents: [{ type: 'PERSON_NAME', start: 0, end: 4, score: NaN }] },
    { ents: Array.from({ length: 501 }, () => ok.ents[0]) },
  ]) assert.equal(K.valid(bad, 10), null, JSON.stringify(bad && bad.ents && bad.ents[0]));
  // Zusatzfelder (z. B. Text) fallen weg.
  assert.deepEqual(Object.keys(K.valid({ ents: [Object.assign({ text: 'x' }, ok.ents[0])] }, 10)[0]).sort(), ['end', 'score', 'start', 'type']);
});

test('KI-Funde: Typen, Satzzeichen am Rand, Ort ohne Nummer, KI-Dienste, klein geschrieben, Code-Umfeld', () => {
  const t = 'Mail an Thomas Brunnhuber von der Zeltwerk Bau AG, Lindenweg 14, 5610 Wohlenbach. Er hat Diabetes.';
  const f = K.findings(t, [ent(t, 'Thomas Brunnhuber', 'PERSON_NAME'), ent(t, 'Zeltwerk Bau AG,', 'ORGANIZATION_NAME'), ent(t, 'Lindenweg 14,', 'LOCATION'),
    ent(t, '5610 Wohlenbach.', 'LOCATION'), ent(t, 'Diabetes.', 'HEALTH_DATA'), ent(t, 'Mail', 'EMAIL_ADDRESS')], CFG);
  assert.deepEqual(plain(f).map((x) => [x.id, x.cat, t.slice(x.start, x.end), x.sure, x.ki]), [
    ['person', 'person', 'Thomas Brunnhuber', true, true], ['company', 'firma', 'Zeltwerk Bau AG', true, true],
    ['address', 'kontakt', 'Lindenweg 14', true, true], ['address', 'kontakt', '5610 Wohlenbach', true, true], ['health', 'gesundheit', 'Diabetes', true, true]]);
  const u = 'Wie nutze ich ChatGPT mit Excel in Zürich? Datei unter /home/thomas/berichte und `Thomas` im Code, dann ein test.';
  assert.deepEqual(plain(K.findings(u, [ent(u, 'ChatGPT', 'ORGANIZATION_NAME'), ent(u, 'Excel', 'ORGANIZATION_NAME'), ent(u, 'Zürich', 'LOCATION'),
    ent(u, '/home/thomas/berichte', 'PERSON_NAME'), ent(u, 'Thomas', 'PERSON_NAME'), ent(u, "test", "PERSON_NAME")], CFG)), []);
});

test('KI-Funde: Konfidenz und Kontext - unsicher nur dezent, Kontextwort macht sicher, zu tief verworfen', () => {
  const t = 'Bitte frag Monika noch einmal.';
  const mid = (s) => K.findings(t, [ent(t, 'Monika', 'PERSON_NAME', s)], CFG);
  assert.equal(mid(0.5).length, 0, 'unter der unteren Schwelle verworfen');
  assert.equal(mid(0.7)[0].sure, false, 'mittlere Konfidenz ohne Kontext = dezent');
  assert.equal(mid(0.95)[0].sure, false, 'einzelner Vorname ohne Kontext bleibt dezent');
  assert.equal(mid(0.99)[0].sure, true);
  const c = 'Kundin Monika hat angerufen.';
  assert.equal(K.findings(c, [ent(c, 'Monika', 'PERSON_NAME', 0.7)], CFG)[0].sure, true, 'Kontextwort macht sicher');
  const off = { packs: CFG.packs, rules: { person: 'off' } };
  assert.equal(K.findings(c, [ent(c, 'Monika', 'PERSON_NAME', 0.99)], off).length, 0, 'Regel off schaltet den Typ ab');
  assert.equal(K.findings(c, [ent(c, 'Monika', 'PERSON_NAME', 0.99)], { packs: CFG.packs, rules: { person: 'block' } })[0].action, 'block');
});

test('Regeln haben Vorrang: ueberlappende KI-Funde fallen weg, Regel-Funde bleiben unveraendert (Auflage 18)', () => {
  const rules = [{ id: 'iban', cat: 'finanz', start: 10, end: 30, action: 'block', sure: true }, { id: 'mass_list', cat: 'person', start: 0, end: 100, meta: true }];
  const ki = [{ id: 'person', start: 25, end: 35 }, { id: 'company', start: 40, end: 50 }, { id: 'person', start: 45, end: 55 }];
  const m = K.merge(rules, ki);
  assert.deepEqual(m.slice(0, 2), rules);
  assert.deepEqual(m.slice(2).map((x) => x.id), ['company']);
  assert.equal(K.merge(rules, []), rules);
});

test('Platzhalter auch fuer Namen und Firmen: [PERSON_1], [COMPANY_1], gleicher Name = gleicher Platzhalter', () => {
  const t = 'Thomas Brunnhuber und Laura Kessler von der Zeltwerk AG; Thomas Brunnhuber kommt.';
  const ents = [ent(t, 'Thomas Brunnhuber', 'PERSON_NAME'), ent(t, 'Laura Kessler', 'PERSON_NAME'), ent(t, 'Zeltwerk AG', 'ORGANIZATION_NAME'),
    { type: 'PERSON_NAME', start: t.lastIndexOf('Thomas'), end: t.lastIndexOf('Thomas') + 17, score: 0.99 }];
  const p = DLX.pseudonym.create();
  const out = p.pseudonymize(t, K.findings(t, ents, CFG), (f) => f.id);
  assert.equal(out, '[PERSON_1] und [PERSON_2] von der [COMPANY_1]; [PERSON_1] kommt.');
  assert.equal(p.restore(out), t);
});

test('Richtlinie detection: Standard ki, nur ki/regeln, Richtlinie sperrt, ungueltig = Standard (Auflage 20)', () => {
  const P = DLX.policy;
  assert.equal(P.defaults().detection, 'ki');
  assert.deepEqual(plain(P.DETECTION), ['ki', 'regeln']);
  assert.equal(P.effective({}, { detection: 'regeln' }, 'de').cfg.detection, 'regeln', 'Benutzer darf auf nur Regeln');
  const m = P.effective({ detection: 'ki' }, { detection: 'regeln' }, 'de');
  assert.equal(m.cfg.detection, 'ki', 'Richtlinie hat Vorrang');
  assert.equal(m.locked.detection, true);
  for (const bad of ['off', 'none', '', true, 1, null]) {
    assert.equal(P.effective({ detection: bad }, {}, 'de').cfg.detection, 'ki', String(bad));
    assert.ok(P.validate({ detection: bad }).errors.includes('detection'));
  }
});

// Attrappen-Laufzeit: jedes Wort ein Token, Grossbuchstabe = Person (B/I), sonst O.
function fakeOrt(calls) {
  class Tensor { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } }
  const session = {
    inputNames: ['input_ids', 'attention_mask'], outputNames: ['logits'],
    async run(feeds) {
      const ids = Array.from(feeds.input_ids.data, Number);
      calls.push(ids.length);
      const k = 3, out = new Float32Array(ids.length * k);
      for (let i = 0; i < ids.length; i++) out[i * k + (ids[i] >= 1000 ? (ids[i - 1] >= 1000 ? 2 : 1) : 0)] = 9;
      return { logits: new Tensor('float32', out, [1, ids.length, k]) };
    },
    release() {},
  };
  return { env: { wasm: {} }, Tensor, InferenceSession: { create: async () => session } };
}
class FakeTok {
  encode(word) {
    const cap = /^[A-ZÄÖÜ]/.test(word);
    if (word.length > 6 && cap) return { ids: [1000 + word.length, 1000], tokens: ['▁' + word.slice(0, 3), word.slice(3)] };
    return { ids: [cap ? 1000 + word.length : 5], tokens: ['▁' + word] };
  }
}

test('Modell-Lauf: Teilstuecke gehoeren zum Wort, lange Texte in ueberlappenden Fenstern bis 512 Token (Auflage 15)', async () => {
  const calls = [];
  const r = await createRunner({ ort: fakeOrt(calls), Tokenizer: FakeTok, model: new Uint8Array(1), tokenizerJson: {}, labels: ['O', 'B-PERSON_NAME', 'I-PERSON_NAME'], executionProviders: ['wasm'] });
  const t = 'an Thomas Brunnhuber und Eva';
  assert.deepEqual((await r.run(t)).map((e) => [e.type, t.slice(e.start, e.end), e.score]), [['PERSON_NAME', 'Thomas Brunnhuber', 1], ['PERSON_NAME', 'Eva', 1]]);
  calls.length = 0;
  const words = Array.from({ length: 1200 }, (_, i) => (i % 100 === 50 ? 'Name' : 'wort'));
  const long = words.join(' ');
  const ents = await r.run(long);
  assert.ok(calls.length >= 3 && calls.every((n) => n <= 512), JSON.stringify(calls));
  assert.equal(ents.length, 12, 'auch Namen in spaeteren Fenstern');
  assert.ok(ents.every((e) => long.slice(e.start, e.end) === 'Name'));
});

test('Quelltext: KI-Dateien ohne Netz, ohne import(), ohne Konsole; CSP unveraendert; PINS ohne URL (Auflagen 8, 11, 21, 22)', () => {
  const own = ['engine/ki.js', 'ui/ki.js', 'ui/ki-worker.mjs', 'ui/ki-lauf.mjs', 'ui/ki-lader.js'];
  for (const f of own) {
    // Einzige Ladestelle: der Lade-Worker liest nur Paket-Dateien unter vendor/ki.
    let src = fs.readFileSync(path.join(EXT, f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    if (f === 'ui/ki-lader.js') src = src.replace(/importScripts\('\.\.\/vendor\/ki\/(inhalt\.js|daten\/' \+ name \+ '-' \+ String\(i\)\.padStart\(2, '0'\) \+ '\.js)'\)/g, '');
    for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bimport\s*\(/, /https?:\/\//, /importScripts/, /console\./, /indexedDB|localStorage|caches\.|chrome\.storage/, /wasmPaths/]) {
      assert.ok(!bad.test(src), `${f}: ${bad}`);
    }
  }
  const worker = fs.readFileSync(path.join(EXT, 'ui', 'ki-worker.mjs'), 'utf8');
  assert.match(worker, /from '\.\.\/vendor\/ki\/ort\.webgpu\.bundle\.min\.mjs'/);
  const lauf = fs.readFileSync(path.join(EXT, 'ui', 'ki-lauf.mjs'), 'utf8');
  assert.match(lauf, /numThreads = 1/);
  assert.match(lauf, /proxy = false/);
  assert.match(lauf, /logLevel = 'error'/);
  const csp = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).content_security_policy.extension_pages;
  assert.match(csp, /connect-src 'none'/);
  assert.equal(csp.match(/wasm-unsafe-eval/g).length, 1);
  const off = fs.readFileSync(path.join(EXT, 'ui', 'ocr.html'), 'utf8');
  assert.match(off, /default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'/);
  const pins = fs.readFileSync(path.join(EXT, 'vendor', 'ki', 'PINS.json'), 'utf8');
  assert.ok(!/https?:|\/\//.test(pins), 'PINS.json ohne URL');
  const p = JSON.parse(pins);
  assert.match(p.modell.revision, /^[0-9a-f]{40}$/);
  assert.deepEqual(Object.keys(p.modell.dateien).sort(), ['onnx/model_quantized.onnx', 'tokenizer.json'], 'nur ONNX und tokenizer.json (Auflage 3)');
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build-ki.mjs'), 'utf8');
  assert.match(build, /const BUILD_HOST = 'huggingface\.co';/);
  assert.match(build, /u\.protocol !== 'https:' \|\| !okHost\(u\.hostname\)/);
  assert.ok(!/\.(bin|pt|pkl)\b'/.test(build), 'keine Pickle-Dateien');
  const ig = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(ig, /^\/extension\/vendor\/ki\/\*$/m);
  assert.match(ig, /^!\/extension\/vendor\/ki\/PINS\.json$/m);
  const bg = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  assert.match(bg, /if \(\(msg\.t === 'ocr' \|\| msg\.t === 'ki' \|\| msg\.t === 'doc'\) && !fromContent\(sender\)\) return \{ error: 'fail' \};/);
  assert.ok(!/externally_connectable/.test(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')) && !/onMessageExternal/.test(bg));
});
