// Training-Ampel (Design-Review Training-Ampel 16.10.2026), Teil Verhalten: Richtlinie,
// Quelltext-Waechter (Einschleusen, Popup-Adresse, Netz), Service Worker (Regeln,
// Kontoart je Tab). Daten und Regeln: tests/training-daten.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { load, ENGINE_FILES, EXT, ROOT } from './helpers/load.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/aisites.js', 'common/policy.js', 'common/training.js'], { URL });
const A = DLX.aisites;
const TR = DLX.training;
const plain = (v) => JSON.parse(JSON.stringify(v));

test('Richtlinie trainingAmpel: nur verwaltet, Standard an, falscher Typ -> Standard (Auflage 12)', () => {
  const env = { timeZone: 'Europe/Zurich', languages: ['de-CH'] };
  assert.equal(DLX.policy.defaults('de').trainingAmpel, true);
  assert.equal(DLX.policy.effective({ trainingAmpel: false }, {}, env).cfg.trainingAmpel, false);
  const bad = DLX.policy.effective({ trainingAmpel: 'false' }, {}, env);
  assert.equal(bad.cfg.trainingAmpel, true);
  assert.ok(plain(bad.errors).includes('trainingAmpel'));
  assert.equal(DLX.policy.effective({}, { trainingAmpel: false }, env).cfg.trainingAmpel, true, 'Benutzer kann sie nicht abschalten');
  const schema = JSON.parse(fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8'));
  assert.equal(schema.properties.trainingAmpel.type, 'boolean');
  for (const f of ['dlx-edge.admx', 'dlx-chrome.admx']) assert.ok(fs.readFileSync(path.join(ROOT, 'enterprise', 'admx', f), 'utf8').includes('trainingAmpel'), f);
});

test('Quelltext: kein Einschleusen, Popup liest den Tab einmal und behaelt keine Adresse, kein Netz (Auflagen 2, 3, 13)', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'vendor' ? [] : walk(path.join(d, e.name))) : /\.(js|mjs|html)$/.test(e.name) ? [path.join(d, e.name)] : []));
  for (const f of walk(EXT)) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/captureVisibleTab|insertCSS/.test(src), 'Abfotografieren/Stile: ' + f);
    // executeScript nur im Service Worker fuer die Kopierwache (Design-Review Kopierwarnung 16.10.2026, Auflagen 5, 6).
    if (f !== path.join(EXT, 'background.js')) assert.ok(!/executeScript/.test(src), 'Einschleusen: ' + f);
    if (path.basename(f) !== 'background.js') assert.ok(!/chrome\.scripting/.test(src), 'chrome.scripting ausserhalb background.js: ' + f);
  }
  const bg = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  assert.deepEqual([...new Set(bg.match(/chrome\.scripting\.\w+/g))].sort(), ['chrome.scripting.executeScript', 'chrome.scripting.getRegisteredContentScripts', 'chrome.scripting.registerContentScripts', 'chrome.scripting.unregisterContentScripts']);
  // Nur zwei Aufrufe, beide mit genau diesem Dokument als Ziel (ohne frameIds) und nur eigene Dateien bzw. eine feste Pruef-Funktion.
  assert.equal((bg.match(/chrome\.scripting\.executeScript\(/g) || []).length, 2);
  assert.equal((bg.match(/const target = \{ tabId, documentIds: \[sender\.documentId\] \};/g) || []).length, 1);
  assert.match(bg, /executeScript\(\{ target, func: \(\) => !!\(globalThis\.DLX && globalThis\.DLX\.engine\) \}\)/);
  assert.match(bg, /executeScript\(\{ target, files: COPY_FILES \}\)/);
  assert.ok(!/frameIds/.test(bg), 'keine frameIds');
  const popup = fs.readFileSync(path.join(EXT, 'ui', 'popup.js'), 'utf8');
  assert.equal((popup.match(/tabs\.query/g) || []).length, 1, 'genau eine Tab-Abfrage');
  assert.ok(!/storage\.(local|session|sync)|console\./.test(popup), 'kein Speicher, kein Log');
  assert.deepEqual(popup.match(/.*\.url\b.*/g).map((l) => l.trim()), ['const u = new URL(t.url);'], 'Adresse nur in new URL(t.url)');
  assert.ok(!/window\.open|innerHTML/.test(popup));
  assert.equal((popup.match(/chrome\.tabs\.create\(\{ url \}\)/g) || []).length, 1, 'Links nur per tabs.create mit der gepruefften Adresse');
  const tr = fs.readFileSync(path.join(EXT, 'common', 'training.js'), 'utf8');
  assert.ok(!/\bfetch\s*\(|\bimport\s*\(|importScripts|XMLHttpRequest|WebSocket/.test(tr));
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  assert.ok(!m.permissions.includes('tabs') && m.host_permissions === undefined, 'kein tabs, keine host_permissions (Auflage 1)');
  assert.match(m.content_security_policy.extension_pages, /connect-src 'none'/);
});

// --- Service Worker in einer Attrappe der chrome-API --------------------------
function sw(managed = {}) {
  const store = { local: {}, session: {}, managed: structuredClone(managed) };
  const area = (name) => ({
    get: async (k) => (k === null ? structuredClone(store[name]) : Object.hasOwn(store[name], k) ? { [k]: structuredClone(store[name][k]) } : {}),
    set: async (o) => { Object.assign(store[name], structuredClone(o)); },
    remove: async (k) => { delete store[name][k]; },
  });
  const events = {};
  const on = (name) => ({ addListener: (fn) => { events[name] = fn; } });
  const log = [];   // Aufrufe an declarativeContent und action
  let rules = [];
  class PageStateMatcher { constructor(o) { this.o = o; } }
  class SetIcon { constructor(o) { this.o = o; } }
  const chrome = {
    runtime: { id: 'testid', lastError: undefined, onMessage: on('message'), onStartup: on('startup'), onInstalled: on('installed'), getManifest: () => JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')), getURL: (p) => 'chrome-extension://testid/' + p, sendMessage: async () => undefined, getContexts: async () => [] },
    i18n: { getMessage: () => 'Erweiterung' },
    storage: { local: area('local'), session: area('session'), managed: area('managed'), onChanged: on('changed') },
    permissions: { getAll: async () => ({ origins: [] }), contains: async () => false, onAdded: on('added'), onRemoved: on('permRemoved') },
    scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {}, unregisterContentScripts: async () => {} },
    declarativeContent: { PageStateMatcher, SetIcon, onPageChanged: {
      removeRules: (ids, cb) => { log.push('removeRules'); rules = []; cb(); },
      addRules: (r, cb) => { log.push('addRules'); rules = r; cb(); } } },
    alarms: { create: async () => {}, clear: async () => true, onAlarm: { addListener() {} } }, commands: { onCommand: { addListener() {} } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {},
      setIcon: async (o) => { log.push({ setIcon: o.tabId, data: !!o.imageData, path: !!o.path }); }, setTitle: async (o) => { log.push({ setTitle: o.tabId, title: o.title }); } },
    tabs: { query: async () => [], sendMessage: async () => undefined, onRemoved: on('tabRemoved'), onUpdated: on('tabUpdated') },
    windows: { create: async () => ({ id: 9, tabs: [] }), remove: async () => {}, onRemoved: on('winRemoved') },
  };
  class ImageData { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } }
  // fetch nur fuer Paketdateien (DLX.i18n laedt _locales).
  chrome.runtime.getURL = (p) => 'chrome-extension://testid/' + p;
  const fetch = async (u) => { const t = fs.readFileSync(path.join(EXT, String(u).slice(26)), 'utf8'); return { text: async () => t }; };
  const ctx = vm.createContext({ fetch, chrome, crypto: webcrypto, navigator: { language: 'de-CH', languages: ['de-CH'] }, TextEncoder, performance, URL, clearTimeout, Date, ImageData, Intl,
    setTimeout: (f, ms) => { const t = setTimeout(f, ms); t.unref(); return t; } });
  ctx.importScripts = (...f) => { for (const x of f) vm.runInContext(fs.readFileSync(path.join(EXT, x), 'utf8'), ctx, { filename: x }); };
  vm.runInContext(fs.readFileSync(path.join(EXT, 'background.js'), 'utf8'), ctx, { filename: 'background.js' });
  const send = (msg, sender) => new Promise((res) => events.message(msg, sender, (r) => res(r === undefined ? r : JSON.parse(JSON.stringify(r)))));
  const settle = () => new Promise((r) => setTimeout(r, 30));
  return { store, events, log, rules: () => rules, send, settle };
}
const chatgpt = { id: 'testid', tab: { id: 5 }, frameId: 0, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/c/1', documentId: 'd1' };
const popupPage = { id: 'testid', origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/popup.html' };
const RULES = { chatgpt: { workspaces: ['Beispiel AG'], business: 'allow', personal: 'hint', unknown: 'hint' } };

test('Service Worker: Regeln bei Installation erst entfernt, dann je KI-Seite ein Symbol; aus per Richtlinie = keine Regeln (Auflagen 5, 6, 12)', async () => {
  const s = sw();
  s.events.installed();
  await s.settle();
  assert.deepEqual(s.log.filter((x) => typeof x === 'string'), ['removeRules', 'addRules']);
  const rules = s.rules();
  assert.equal(rules.length, A.LIST.length);
  for (const r of rules) {
    assert.match(r.id, /^dlx-training-[a-z0-9]+$/);
    assert.ok(r.conditions.length >= 1 && r.conditions.every((c) => c.o.pageUrl && Object.keys(c.o).join() === 'pageUrl'), 'nur pageUrl, kein css');
    assert.equal(r.actions.length, 1);
    const img = r.actions[0].o.imageData;
    assert.deepEqual(Object.keys(img).sort(), ['16', '32']);
    assert.equal(img[16].width, 16);
  }
  // gleiches Symbol je Farbe (zwischengespeichert)
  const rot = rules.find((r) => r.id === 'dlx-training-chatgpt').actions[0].o.imageData;
  assert.equal(rules.find((r) => r.id === 'dlx-training-claude').actions[0].o.imageData, rot);
  assert.notEqual(rules.find((r) => r.id === 'dlx-training-huggingchat').actions[0].o.imageData, rot);

  const off = sw({ trainingAmpel: false });
  off.events.installed();
  await off.settle();
  assert.deepEqual(off.log.filter((x) => typeof x === 'string'), ['removeRules']);
  assert.equal(off.rules().length, 0);
});

test('Service Worker: Kontoart je Tab nur als Enum vom eigenen Content Script, Reset bei neuem Dokument, Tab zu = weg (Auflagen 7-9)', async () => {
  const s = sw({ accountRules: RULES });
  s.events.installed();
  await s.settle();
  // Mit accountRules gilt die Regel fuer chatgpt dem strengsten Wert (unknown -> rot)
  assert.ok(s.rules().find((r) => r.id === 'dlx-training-chatgpt'));
  await s.send({ t: 'status', active: true, account: 'business', name: 'Beispiel AG', mail: 'a@example.com' }, chatgpt);
  assert.deepEqual(s.store.session['dlx.training'], { 5: 'business' });
  assert.ok(s.log.some((x) => x.setIcon === 5 && x.data));
  assert.ok(s.log.some((x) => x.setTitle === 5 && /laut Anbieter aus/.test(x.title)), 'Firmenkonto ChatGPT -> gruen');
  assert.ok(!JSON.stringify(s.store.session).includes('Beispiel') && !JSON.stringify(s.store.session).includes('example'));
  // Popup fragt nur die Kontoart ab
  assert.deepEqual(await s.send({ t: 'trainingTab', tabId: 5 }, popupPage), { type: 'business' });
  assert.deepEqual(await s.send({ t: 'trainingTab', tabId: 6 }, popupPage), { type: null });
  assert.deepEqual(await s.send({ t: 'trainingTab', tabId: '5' }, popupPage), { type: null });
  assert.notDeepEqual(await s.send({ t: 'trainingTab', tabId: 5 }, { ...popupPage, url: 'chrome-extension://testid/ui/options.html' }), { type: 'business' });
  // Fremde Kontoart -> unknown, fremder Absender -> nichts
  await s.send({ t: 'status', active: true, account: 'admin' }, chatgpt);
  assert.deepEqual(s.store.session['dlx.training'], { 5: 'unknown' });
  await s.send({ t: 'status', active: true, account: 'business' }, { ...chatgpt, origin: 'https://evil.example', url: 'https://evil.example/' });
  await s.send({ t: 'status', active: true, account: 'business' }, { ...chatgpt, frameId: 2 });
  await s.send({ t: 'status', active: true, account: 'business' }, { ...chatgpt, id: 'fremd' });
  assert.deepEqual(s.store.session['dlx.training'], { 5: 'unknown' });
  // Neues Dokument: zurueck auf unknown, bis eine neue Meldung kommt
  await s.send({ t: 'status', active: true, account: 'business' }, chatgpt);
  await s.send({ t: 'cfg' }, chatgpt);
  await s.settle();
  assert.deepEqual(s.store.session['dlx.training'], { 5: 'unknown' });
  // Tab geschlossen -> Eintrag weg; Start leert alles
  s.events.tabRemoved(5);
  await s.settle();
  assert.deepEqual(s.store.session['dlx.training'], {});
  await s.send({ t: 'status', active: true, account: 'personal' }, chatgpt);
  s.events.startup();
  await s.settle();
  assert.equal(s.store.session['dlx.training'], undefined);
});

test('Service Worker: ohne accountRules kein Tab-Eintrag; Richtlinie aus setzt Tab-Symbole zurueck (Auflagen 5, 9)', async () => {
  const s = sw();
  await s.send({ t: 'status', active: true, account: 'business' }, chatgpt);
  assert.equal(s.store.session['dlx.training'], undefined);
  assert.ok(!s.log.some((x) => x.setIcon === 5));
  const t = sw({ accountRules: RULES });
  await t.send({ t: 'status', active: true, account: 'personal' }, chatgpt);
  t.store.managed.trainingAmpel = false;
  t.events.changed({}, 'managed');
  await t.settle();
  assert.equal(t.store.session['dlx.training'], undefined);
  assert.ok(t.log.some((x) => x.setIcon === 5 && x.path), 'Standardsymbol zurueck');
  assert.equal(t.rules().length, 0);
});
