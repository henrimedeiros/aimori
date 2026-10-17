// KI-Antworten pruefen und Zwischenablage-Schutz (Design-Review Antwort/Zwischenablage
// 16.10.2026): Hostmuster, Normalisierung, Richtlinien, Quelltext-Waechter, ReDoS.
// Service Worker, Content Script und Leiste: tests/background|content|dialog.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { load, ENGINE_FILES, EXT, ROOT } from './helpers/load.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/aisites.js', 'common/quellen.js', 'common/policy.js'], { URL });
const Q = DLX.quellen;
// Werte aus dem vm-Kontext: Vergleich ueber JSON (andere Realm-Prototypen).
const deq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
const read = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');

test('Quellenmuster: nur Host ohne Schema/Pfad/Port, hoechstens ein *., mindestens 2 Labels (Auflage 6)', () => {
  for (const ok of ['bank.example.com', '*.hr.example.com', 'payroll.example.ch', 'BANK.Example.COM', '*.personio.de', 'xn--bcher-kva.example'])
    assert.ok(Q.valid(ok), ok);
  assert.equal(Q.parse('BANK.Example.COM').pattern, 'bank.example.com');
  for (const bad of ['', '*', '*.*', '*.com', 'com', 'localhost', '*.localhost', 'https://bank.example.com', 'bank.example.com/login', 'bank.example.com:443',
    '192.0.2.10', '*.0.2.10', '[2001:db8::1]', '*.co.uk', 'co.uk', '*.com.br', '*.ch.it', 'a.*.example.com', '**.example.com', '-bank.example.com', 'bank..example.com',
    ' ', null, 42, {}, 'x'.repeat(250) + '.example.com'])
    assert.equal(Q.valid(bad), false, String(bad));
});

test('Ausschluesse: KI-Seiten, ihre Oberdomains per Wildcard und *.cloud.microsoft nie als Quelle (Auflage 8)', () => {
  for (const bad of ['chatgpt.com', 'claude.ai', 'gemini.google.com', '*.google.com', 'copilot.microsoft.com', '*.microsoft.com', 'm365.cloud.microsoft',
    '*.cloud.microsoft', 'x.cloud.microsoft', 'github.com', 'www.perplexity.ai', 'sub.chatgpt.com'])
    assert.equal(Q.valid(bad), false, bad);
  assert.ok(Q.valid('docs.microsoft-example.com'));
});

test('originsOf: nur gepruefte Origins, nie das Breitmuster; matches je Host', () => {
  const o = Q.originsOf(['bank.example.com', '*.hr.example.com', '*', '*.com', 'bank.example.com', 'chatgpt.com']);
  deq(o, ['https://bank.example.com/*', 'https://*.hr.example.com/*']);
  assert.ok(!o.includes('https://*/*'));
  deq(Q.originsOf('bank.example.com'), []);
  assert.ok(Q.matches(['*.hr.example.com'], 'hr.example.com') && Q.matches(['*.hr.example.com'], 'a.b.hr.example.com'));
  assert.ok(!Q.matches(['*.hr.example.com'], 'evilhr.example.com') && !Q.matches(['bank.example.com'], 'x.bank.example.com'));
  assert.ok(!Q.matches(['*.com'], 'bank.example.com'), 'ungueltiges Muster passt nie');
});

test('Normalisierung beidseitig gleich; Mindestlaenge 8 Nicht-Leerzeichen (Auflagen 11, 16)', () => {
  const pairs = [['Lohn  Muster\r\nAnna\t5000', 'Lohn Muster Anna 5000'], [' IBAN CH93 0076\n', 'IBAN CH93 0076'], ['ﬁle１２３４５６', 'file123456']];
  for (const [a, b] of pairs) assert.equal(Q.normalize(a), b);
  assert.equal(Q.hashable(Q.normalize('OK ja')), false);
  assert.equal(Q.hashable(Q.normalize('1 2 3 4 5 6 7')), false);
  assert.equal(Q.hashable(Q.normalize('12345678')), true);
  // Gleiche Pruefsumme wie crypto.subtle in quelle.js und DLX.dictionary im Content Script.
  const n = Q.normalize('Lohnliste Muster  2026');
  assert.equal(DLX.dictionary.sha256Hex(n), createHash('sha256').update(n, 'utf8').digest('hex'));
  assert.equal(Q.normalize('x'.repeat(Q.MAX_TEXT + 50)).length, Q.MAX_TEXT);
});

test('Richtlinien answerCheck, sensitiveSources, sensitiveSourceAction (Auflagen 5, 17)', () => {
  const env = { timeZone: 'Europe/Zurich', languages: ['de-CH'] };
  const P = DLX.policy;
  let e = P.effective({}, {}, env);
  deq([e.cfg.answerCheck, e.cfg.sensitiveSources, e.cfg.sensitiveSourceAction], ['hint', [], 'warn'], 'Standard');
  e = P.effective({ answerCheck: 'hint' }, { answerCheck: 'off' }, env);
  assert.equal(e.cfg.answerCheck, 'hint', 'Richtlinie schlaegt lokal');
  assert.ok(e.locked.answerCheck);
  e = P.effective({ answerCheck: 'aus' }, { answerCheck: 'off' }, env);
  assert.equal(e.cfg.answerCheck, 'hint', 'falscher verwalteter Wert = hint');
  e = P.effective({}, { answerCheck: 42 }, env);
  assert.equal(e.cfg.answerCheck, 'hint', 'falscher lokaler Wert = hint');
  e = P.effective({}, { answerCheck: 'off' }, env);
  assert.equal(e.cfg.answerCheck, 'off');
  e = P.effective({ sensitiveSourceAction: 'nope' }, { sensitiveSourceAction: 'warn' }, env);
  assert.equal(e.cfg.sensitiveSourceAction, 'block', 'ungueltig verwaltet = block');
  e = P.effective({}, { sensitiveSourceAction: 'nope' }, env);
  assert.equal(e.cfg.sensitiveSourceAction, 'warn', 'ungueltig lokal = warn');
  e = P.effective({ sensitiveSources: ['bank.example.com', '*.com', 'chatgpt.com', 'bank.example.com'] }, { sensitiveSources: ['hr.example.org'] }, env);
  deq(e.cfg.sensitiveSources, ['bank.example.com'], 'verwaltete Liste ersetzt lokale, Ungueltiges verworfen');
  assert.ok(e.locked.sensitiveSources);
  assert.ok(e.errors.includes('sensitiveSources[]'));
  e = P.effective({ sensitiveSources: 'bank.example.com' }, { sensitiveSources: ['hr.example.org'] }, env);
  deq(e.cfg.sensitiveSources, [], 'kaputte verwaltete Liste: leer und gesperrt, nie die lokale');
  e = P.effective({}, { sensitiveSources: ['hr.example.org', 'https://x.example'] }, env);
  deq(e.cfg.sensitiveSources, ['hr.example.org']);
  assert.equal(P.validate({ sensitiveSources: new Array(101).fill('a.example.com') }).errors[0], 'sensitiveSources');
});

test('Richtlinien-Schluessel im verwalteten Schema, Beispiel wird uebernommen (Pflicht-Pruefung 16.10.2026)', () => {
  const schema = JSON.parse(read('managed_schema.json'));
  // countryMode ist nur ein Benutzerwert (nie aus der Richtlinie).
  for (const k of DLX.policy.USER_KEYS) if (k !== 'countryMode') assert.ok(Object.hasOwn(schema.properties, k), k);
  deq(schema.properties.answerCheck.enum, DLX.policy.ANSWER_MODES);
  deq(schema.properties.sensitiveSourceAction.enum, DLX.policy.SOURCE_ACTIONS);
  // Chromes Richtlinien-Schema kennt kein maxItems (scripts/lib/schema.mjs erlaubt nur dessen Teilmenge):
  // die Grenze 100 setzt policy.js durch (mehr = ganze Liste verworfen, verwaltet dann leer und gesperrt).
  assert.match(schema.properties.sensitiveSources.description, /Max. 100 entries/);
  assert.equal(Q.MAX_SOURCES, 100);
  deq(DLX.policy.effective({ sensitiveSources: new Array(101).fill('bank.example.com') }, { sensitiveSources: ['hr.example.org'] }, 'de-CH').cfg.sensitiveSources, []);
  // ADMX/ADML (generiert aus diesem Schema): tests/admx.test.mjs.
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'enterprise', 'example-policy.json'), 'utf8'));
  const v = DLX.policy.validate({ answerCheck: ex.answerCheck, sensitiveSources: ex.sensitiveSources, sensitiveSourceAction: ex.sensitiveSourceAction });
  deq(v.errors, []);
  deq(v.value, { answerCheck: 'hint', sensitiveSources: ['bank.example.com', '*.hr.example.com'], sensitiveSourceAction: 'warn' });
});

test('quelle.js: kein Netz, kein Speicher, kein Nachrichten-Empfang, kein DOM-Schreiben (Auflage 10)', () => {
  const src = read('content/quelle.js').replace(/^\s*\/\/.*$/gm, '');
  for (const [name, re] of [['fetch', /\bfetch\s*\(/], ['XMLHttpRequest', /XMLHttpRequest/], ['WebSocket', /WebSocket/], ['sendBeacon', /sendBeacon/],
    ['storage', /storage/], ['console', /console/], ['innerHTML', /innerHTML/], ['postMessage', /postMessage/], ['onMessage', /onMessage/],
    ['setData', /setData/], ['preventDefault', /preventDefault/], ['stopPropagation', /stopPropagation/], ['appendChild/append', /\.(appendChild|append|prepend|insertBefore)\(/]])
    assert.ok(!re.test(src), name);
  assert.match(src, /sendMessage\(\{ t: 'srcMark', hash \}\)/, 'nur {t, hash}');
});
