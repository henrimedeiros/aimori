// KI-Kompetenz-Zaehler (Design-Review 14.10.2026, docs/sicherheit/design-review-kompetenz.md):
// Validierung, Monate, report() nur Zahlen; im Service Worker nur ueber den
// Meldungs-Frame, je Meldung einmal, Schalter loescht, Lesen/Zuruecksetzen nur
// von den eigenen Seiten.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { load, EXT, ROOT } from './helpers/load.mjs';

const K = load(['common/kompetenz.js']).kompetenz;
const NOW = new Date(2026, 9, 14, 10, 0, 0);
const J = (o) => JSON.parse(JSON.stringify(o));

test('clean: gueltiger Speicher bleibt, fehlende Felder = 0, null-Prototyp', () => {
  const s = K.clean({ '2026-10': { finanz: { seen: 3, redacted: 1 } } }, NOW);
  assert.deepEqual(J(s), { '2026-10': { finanz: { seen: 3, redacted: 1, cancelled: 0, sent: 0 } } });
  assert.equal(Object.getPrototypeOf(s), null);
  assert.equal(Object.getPrototypeOf(s['2026-10'].finanz), null);
});

test('clean: jede Abweichung verwirft den ganzen Speicher (Auflage 3)', () => {
  const ok = { finanz: { seen: 1 } };
  for (const top of ['x', [], 7, true]) assert.deepEqual(J(K.clean(top, NOW)), {}, JSON.stringify(top));
  const bad = [
    { '2026-13': ok }, { '2026-10-01': ok }, { '2026-10': [] },
    { '2026-10': { finanz: { seen: '1' } } }, { '2026-10': { finanz: { seen: -1 } } }, { '2026-10': { finanz: { seen: NaN } } },
    { '2026-10': { finanz: { seen: 1.5 } } }, { '2026-10': { finanz: { seen: K.MAX + 1 } } }, { '2026-10': { finanz: { leak: 1 } } },
    { '2026-10': { iban: { seen: 1 } } }, { '2026-10': { unscannable: { seen: 1 } } },
    JSON.parse('{"__proto__": {"finanz": {"seen": 1}}}'), JSON.parse('{"2026-10": {"__proto__": {"seen": 1}}}'),
    JSON.parse('{"2026-10": {"finanz": {"constructor": 1}}}'),
  ];
  for (const b of bad) assert.deepEqual(J(K.clean({ '2026-09': ok, ...b }, NOW)), {}, JSON.stringify(b));
  assert.deepEqual(J(K.clean(undefined, NOW)), {});
});

test('clean: nur die letzten 13 Monate, Zukunft faellt weg', () => {
  const raw = {};
  for (let i = -1; i < 16; i++) raw[K.month(new Date(2026, 9 - i, 1))] = { technik: { seen: i + 2 } };
  const keys = Object.keys(K.clean(raw, NOW)).sort();
  assert.equal(keys.length, 13);
  assert.equal(keys[0], '2025-10');
  assert.equal(keys[12], '2026-10');
  assert.ok(!keys.includes('2026-11'));
});

test('add: +1 je Gruppe, am Rand gekappt, unbekannte Gruppen/Felder ignoriert', () => {
  let s = K.add(undefined, NOW, ['finanz', 'kontakt', 'evil'], 'seen');
  s = K.add(s, NOW, ['finanz'], 'redacted');
  s = K.add(s, NOW, ['finanz'], 'leak');
  assert.deepEqual(J(s), { '2026-10': { finanz: { seen: 1, redacted: 1, cancelled: 0, sent: 0 }, kontakt: { seen: 1, redacted: 0, cancelled: 0, sent: 0 } } });
  const full = K.add({ '2026-10': { technik: { sent: K.MAX } } }, NOW, ['technik'], 'sent');
  assert.equal(full['2026-10'].technik.sent, K.MAX);
});

test('groupsOf: nur sichere, pruefbare Funde, jede Gruppe einmal', () => {
  assert.deepEqual(J(K.groupsOf([{ id: 'iban', cat: 'finanz', n: 2 }, { id: 'cc_visa', cat: 'finanz', n: 1 }, { id: 'unscannable', cat: 'unscannable', n: 1 },
    { id: 'ch_tel', cat: 'kontakt', n: 1, sure: false }, { id: 'ch_ahv', cat: 'sozial', n: 1 }])), ['finanz', 'sozial']);
});

test('report: feste Form, nur Zahlen, Fremdes faellt heraus (Auflage 12)', () => {
  const r = K.report({ '2026-10': { finanz: { seen: 2, sent: 1 } } }, '2026-10');
  assert.equal(r.schema, 'dlx-kompetenz/2');
  assert.equal(r.month, '2026-10');
  assert.deepEqual(Object.keys(r).sort(), ['groups', 'month', 'schema', 'sensitive']);
  // Sensible Gruppen nur zusammengefasst (Design-Review Kontext, Auflage 5).
  assert.deepEqual(Object.keys(r.groups), J(K.GROUPS.filter((g) => !K.SENSITIVE.includes(g))));
  assert.deepEqual(Object.keys(r.sensitive), J(K.FIELDS));
  const rs = K.report({ '2026-10': { gesundheit: { seen: 2 }, person: { seen: 3, sent: 1 }, finanz: { seen: 1 } } }, '2026-10');
  assert.deepEqual(J(rs.sensitive), { seen: 5, redacted: 0, cancelled: 0, sent: 1 });
  assert.ok(!('gesundheit' in rs.groups) && !('person' in rs.groups) && !('id-national' in rs.groups));
  for (const g of Object.values(r.groups)) {
    assert.deepEqual(Object.keys(g), J(K.FIELDS));
    for (const v of Object.values(g)) assert.ok(Number.isSafeInteger(v) && v >= 0);
  }
  assert.deepEqual(J(r.groups.finanz), { seen: 2, redacted: 0, cancelled: 0, sent: 1 });
  for (const junk of [{ '2026-10': { finanz: { seen: '2' } } }, JSON.parse('{"__proto__": {"x": 1}}'), { '2026-10': { finanz: { seen: NaN } } }, { '2026-10': { finanz: { seen: -3 } } }, { '2026-10': { evil: { seen: 1 } } }]) {
    const x = K.report(junk, '2026-10');
    assert.ok(Object.values(x.groups).every((g) => Object.values(g).every((v) => v === 0)), JSON.stringify(junk));
  }
  assert.equal(K.report({}, '__proto__').month, '');
  const before = JSON.stringify({ '2026-10': { finanz: { seen: 2 } } });
  const input = JSON.parse(before);
  K.report(input, '2026-10');
  assert.equal(JSON.stringify(input), before, 'rein, ohne Seiteneffekt');
});

test('report hat keinen Aufrufer im Erweiterungscode; kompetenz.js ohne Netz und Browser-APIs', () => {
  const list = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(path.join(d, e.name)) : [path.join(d, e.name)]));
  const code = list(EXT).filter((f) => /\.js$/.test(f));
  const callers = code.filter((f) => /\.report\s*\(/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(callers.map((f) => path.relative(ROOT, f)), []);
  const src = fs.readFileSync(path.join(EXT, 'common/kompetenz.js'), 'utf8');
  assert.ok(!/fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|https?:\/\/|innerHTML/.test(src));
  assert.ok(!/chrome\.|localStorage|sessionStorage|indexedDB/.test(src), 'reine Funktionen ohne Browser-APIs');
});

// --- Service Worker ----------------------------------------------------------
function sw(managed = {}) {
  const store = { local: {}, session: {}, managed: structuredClone(managed) };
  const changed = [];
  const area = (name) => ({
    get: async (k) => (k === null ? structuredClone(store[name]) : Object.hasOwn(store[name], k) ? { [k]: structuredClone(store[name][k]) } : {}),
    set: async (o) => { Object.assign(store[name], structuredClone(o)); },
    remove: async (k) => { delete store[name][k]; },
  });
  let listener = null;
  const chrome = {
    runtime: { id: 'testid', onMessage: { addListener: (f) => { listener = f; } }, onStartup: { addListener() {} }, onInstalled: { addListener() {} },
      getManifest: () => ({ content_scripts: [] }), getURL: (p) => 'chrome-extension://testid/' + p, sendMessage: async () => {} },
    storage: { local: area('local'), session: area('session'), managed: area('managed'), onChanged: { addListener: (f) => changed.push(f) } },
    alarms: { create: async () => {}, clear: async () => true, onAlarm: { addListener() {} } }, commands: { onCommand: { addListener() {} } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    permissions: { getAll: async () => ({ origins: [] }), onAdded: { addListener() {} }, onRemoved: { addListener() {} } },
    scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {}, unregisterContentScripts: async () => {} },
    tabs: { sendMessage: async () => {}, onRemoved: { addListener() {} }, onUpdated: { addListener() {} } },
    windows: { create: async () => ({ id: 9, tabs: [{ id: 99 }] }), remove: async () => {}, onRemoved: { addListener() {} } },
  };
  const ctx = vm.createContext({ chrome, crypto: webcrypto, navigator: { language: 'de-CH' }, TextEncoder, performance, URL, setTimeout, Date });
  ctx.importScripts = (...f) => { for (const x of f) vm.runInContext(fs.readFileSync(path.join(EXT, x), 'utf8'), ctx, { filename: x }); };
  vm.runInContext(fs.readFileSync(path.join(EXT, 'background.js'), 'utf8'), ctx, { filename: 'background.js' });
  const send = (msg, sender) => new Promise((res) => listener(msg, sender, (r) => res(r === undefined ? r : J(r))));
  const komp = () => store.local['dlx.kompetenz'];
  return { store, send, komp, changed: (c, a) => Promise.all(changed.map((f) => f(c, a))) };
}
const page = (p) => ({ id: 'testid', origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/' + p });
const content = { id: 'testid', tab: { id: 5 }, frameId: 0, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/c/1' };
const dialog = { id: 'testid', tab: { id: 5 }, frameId: 7, origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/dialog.html' };
const ITEMS = [{ id: 'iban', cat: 'finanz', n: 2 }, { id: 'email', cat: 'kontakt', n: 1 }];
const month = K.month(new Date());
const settle = () => new Promise((r) => setTimeout(r, 5));

test('SW: gesehen beim ersten hello, Entscheidung einmal; doppelte Nachrichten zaehlen nicht (Auflage 1)', async () => {
  const s = sw();
  await s.send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  assert.equal(s.komp(), undefined, 'found aus dem Content Script zaehlt nicht');
  await s.send({ t: 'hello' }, dialog);
  await s.send({ t: 'hello' }, dialog);
  assert.deepEqual(s.komp()[month].finanz, { seen: 1, redacted: 0, cancelled: 0, sent: 0 });
  assert.deepEqual(await s.send({ t: 'decide', choice: 'redact' }, content), null, 'Content Script entscheidet nicht');
  assert.deepEqual(await s.send({ t: 'decide', choice: 'redact' }, dialog), { ok: true });
  assert.deepEqual(await s.send({ t: 'decide', choice: 'redact' }, dialog), { gone: true });
  assert.deepEqual(s.komp()[month], { finanz: { seen: 1, redacted: 1, cancelled: 0, sent: 0 }, kontakt: { seen: 1, redacted: 1, cancelled: 0, sent: 0 } });
  // Trotzdem senden und Bearbeiten
  await s.send({ t: 'found', mode: 'send', action: 'warn', items: [ITEMS[0]] }, content);
  await s.send({ t: 'hello' }, dialog);
  await s.send({ t: 'decide', choice: 'override', confirmed: true }, dialog);
  await s.send({ t: 'found', mode: 'paste', action: 'warn', items: [ITEMS[0]] }, content);
  await s.send({ t: 'hello' }, dialog);
  await s.send({ t: 'decide', choice: 'cancel' }, dialog);
  assert.deepEqual(s.komp()[month].finanz, { seen: 3, redacted: 1, cancelled: 1, sent: 1 });
  // Abbruch aus dem Content Script (cancelPending) zaehlt nicht fuer die Kompetenz.
  await s.send({ t: 'found', mode: 'send', action: 'warn', items: [ITEMS[0]] }, content);
  await s.send({ t: 'hello' }, dialog);
  await s.send({ t: 'cancelPending' }, content);
  assert.equal(s.komp()[month].finanz.cancelled, 1);
});

test('SW: Kein sensibler Wert zaehlt nicht; Live-Hinweis einmal je Gruppen-Satz, Schwaerzen zaehlt', async () => {
  const s = sw();
  await s.send({ t: 'found', mode: 'send', action: 'warn', items: [ITEMS[0]] }, content);
  await s.send({ t: 'hello' }, dialog);
  await s.send({ t: 'decide', choice: 'notsensitive', confirmed: true }, dialog);
  assert.deepEqual(s.komp()[month].finanz, { seen: 1, redacted: 0, cancelled: 0, sent: 0 });
  await s.send({ t: 'found', mode: 'live', action: 'warn', layout: 'bar', items: [ITEMS[0]] }, content);
  await s.send({ t: 'hello' }, dialog);
  await s.send({ t: 'found', mode: 'live', action: 'warn', layout: 'bar', items: [{ id: 'iban', cat: 'finanz', n: 3 }], renew: true }, content);
  await s.send({ t: 'hello' }, dialog);
  assert.equal(s.komp()[month].finanz.seen, 2, 'Erneuerung mit gleicher Gruppe zaehlt nicht');
  await s.send({ t: 'found', mode: 'live', action: 'warn', layout: 'bar', items: ITEMS, renew: true }, content);
  await s.send({ t: 'hello' }, dialog);
  assert.equal(s.komp()[month].kontakt.seen, 1, 'neue Gruppe zaehlt');
  await s.send({ t: 'decide', choice: 'redact' }, dialog);
  assert.equal(s.komp()[month].finanz.redacted, 1);
  // Unsichere Funde allein zaehlen nicht.
  await s.send({ t: 'found', mode: 'live', action: 'warn', layout: 'bar', items: [{ id: 'ch_tel', cat: 'kontakt', n: 1, sure: false }] }, content);
  await s.send({ t: 'hello' }, dialog);
  assert.equal(s.komp()[month].kontakt.seen, 1);
});

test('SW: Lesen nur eigene Seiten, Popup nur Summen, Zuruecksetzen nur Einstellungen (Auflage 2)', async () => {
  const s = sw();
  s.store.local['dlx.kompetenz'] = { [month]: { finanz: { seen: 4, redacted: 2, cancelled: 1, sent: 0 } } };
  assert.equal(await s.send({ t: 'kompetenz' }, content), null);
  assert.deepEqual(await s.send({ t: 'kompetenz' }, dialog), { gone: true }, 'Meldungs-Frame bekommt keine Zahlen');
  assert.equal(await s.send({ t: 'kompetenz' }, page('wissen.html')), null);
  const p = await s.send({ t: 'kompetenz' }, page('popup.html'));
  assert.deepEqual(p, { on: true, month, totals: { seen: 4, redacted: 2, cancelled: 1, sent: 0 } });
  const n = await s.send({ t: 'kompetenz' }, page('nachweis.html'));
  assert.equal(n.on, true);
  assert.equal(n.months.length, 12);
  assert.deepEqual(n.store[month].finanz.seen, 4);
  for (const who of [content, dialog, page('popup.html'), page('nachweis.html'), page('wissen.html')]) {
    const r = await s.send({ t: 'kompetenzReset' }, who);
    assert.ok(r === null || r.gone === true, who.url || who.origin);
  }
  assert.ok(s.komp());
  assert.deepEqual(await s.send({ t: 'kompetenzReset' }, page('options.html')), { ok: true });
  assert.equal(s.komp(), undefined);
  assert.equal(await s.send({ t: 'brand' }, page('popup.html')), null);
  assert.deepEqual(Object.keys(await s.send({ t: 'brand' }, page('wissen.html'))).sort(), ['branding', 'language']);
});

test('SW: gefaelschter Speicher wird verworfen und nicht angezeigt', async () => {
  const s = sw();
  s.store.local['dlx.kompetenz'] = { [month]: { finanz: { seen: 4, value: 'DE89…' } } };
  const n = await s.send({ t: 'kompetenz' }, page('nachweis.html'));
  assert.deepEqual(n.store, {});
  assert.deepEqual(s.komp(), {});
});

test('SW: Richtlinie competenceRecord=false -> nichts gezaehlt, Speicher leer, gesperrt (Auflage 5)', async () => {
  const s = sw({ competenceRecord: false });
  s.store.local['dlx.kompetenz'] = { [month]: { finanz: { seen: 4 } } };
  await s.send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  await s.send({ t: 'hello' }, dialog);
  await s.send({ t: 'decide', choice: 'redact' }, dialog);
  const n = await s.send({ t: 'kompetenz' }, page('nachweis.html'));
  assert.equal(n.on, false);
  assert.equal(n.locked, true);
  assert.equal(s.komp(), undefined);
  assert.deepEqual(await s.send({ t: 'kompetenz' }, page('popup.html')), { on: false, month, totals: null });
});

test('SW: Wechsel zur Laufzeit (Richtlinie oder Benutzer) loescht sofort', async () => {
  const s = sw();
  s.store.local['dlx.kompetenz'] = { [month]: { finanz: { seen: 4 } } };
  s.store.managed.competenceRecord = false;
  await s.changed({ competenceRecord: { newValue: false } }, 'managed');
  await settle();
  assert.equal(s.komp(), undefined);
  const u = sw();
  u.store.local['dlx.kompetenz'] = { [month]: { finanz: { seen: 4 } } };
  assert.deepEqual(await u.send({ t: 'save', settings: { competenceRecord: false } }, page('options.html')), { ok: true });
  assert.equal(u.komp(), undefined);
  assert.equal(u.store.local['dlx.settings'].competenceRecord, false);
  await u.send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  await u.send({ t: 'hello' }, dialog);
  assert.equal(u.komp(), undefined, 'aus = kein Zaehlen');
});
