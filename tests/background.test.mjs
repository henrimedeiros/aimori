// Service Worker in einer Attrappe der chrome-API: Absenderpruefung,
// Nonce, Entscheidungen nur vom Dialog (B2, B3, B5), Zaehler nur Zahlen (B16).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { EXT } from './helpers/load.mjs';

// where = { timeZone, languages }: Ort der Attrappe, timeZone darf sich aendern (Reise).
function setup(managed = {}, where = null) {
  const store = { local: {}, session: {}, managed: structuredClone(managed) };
  const area = (name) => ({
    get: async (k) => (k === null ? structuredClone(store[name]) : Object.hasOwn(store[name], k) ? { [k]: structuredClone(store[name][k]) } : {}),
    set: async (o) => { Object.assign(store[name], structuredClone(o)); },
    remove: async (k) => { delete store[name][k]; },
  });
  const sent = [];
  const broadcast = [];
  const replies = { fn: null, ocr: null, ki: null };   // Antwort des Content Scripts auf tabs.sendMessage bzw. des Offscreen-Dokuments
  const docs = { open: false, created: [], closed: 0 };
  let listener = null;
  let onRemoved = null;
  // KI-Seiten: gewaehrte optionale Origins, registrierte Skripte, Ereignisse.
  const perm = { origins: [], removed: [] };
  const inject = { calls: [], loaded: false, fail: false };
  const tabsOpen = [];   // tabs.query liefert diese Tabs, protokolliert die Abfrage
  const queries = [];
  const scripts = [];
  const events = {};
  const on = (name) => ({ addListener: (fn) => { events[name] = fn; } });
  const chrome = {
    runtime: { id: 'testid', onMessage: { addListener: (f) => { listener = f; } }, onStartup: on('startup'), onInstalled: on('installed'), getManifest: () => JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')), getURL: (p) => 'chrome-extension://testid/' + p, sendMessage: async (m) => { broadcast.push(m); if (m && m.target === 'dlx-ki') return replies.ki ? replies.ki(m) : undefined; return m && m.target === 'dlx-ocr' && replies.ocr ? replies.ocr(m) : undefined; },
      getContexts: async () => (docs.open ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : []) },
    offscreen: { createDocument: async (o) => { docs.open = true; docs.created.push(o); }, closeDocument: async () => { if (!docs.open) throw new Error('kein Dokument'); docs.open = false; docs.closed++; } },
    storage: { local: area('local'), session: area('session'), managed: area('managed'), onChanged: on('changed') },
    permissions: { getAll: async () => ({ origins: perm.origins.slice() }), onAdded: on('added'), onRemoved: on('permRemoved'),
      // Vertrauliche Quellen: contains mit Wildcard-Origins wie der Browser, remove gibt Rechte zurueck.
      contains: async ({ origins }) => origins.every((o) => perm.origins.some((g) => g === o || (g.startsWith('https://*.') && (o === 'https://' + g.slice(10) || o.endsWith('.' + g.slice(10, -2) + '/*'))))),
      remove: async ({ origins }) => { perm.removed.push(...origins); for (const o of origins) perm.origins.splice(perm.origins.indexOf(o), 1); return true; } },
    scripting: {
      getRegisteredContentScripts: async () => structuredClone(scripts),
      registerContentScripts: async (list) => { scripts.push(...structuredClone(list)); },
      unregisterContentScripts: async ({ ids }) => { for (let i = scripts.length - 1; i >= 0; i--) if (ids.includes(scripts[i].id)) scripts.splice(i, 1); },
      // Kopierwache: Aufrufe protokollieren; inject.loaded = Engine schon im Dokument, inject.fail = Fehler.
      executeScript: async (o) => { inject.calls.push({ target: structuredClone(o.target), func: !!o.func, files: o.files ? o.files.slice() : undefined }); if (inject.fail) throw new Error('weg'); return [{ result: o.func ? inject.loaded : undefined }]; },
    },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: { query: async (q) => { queries.push(q); return tabsOpen.slice(); }, sendMessage: async (tab, msg, opt) => { sent.push(JSON.parse(JSON.stringify({ tab, msg, opt }))); return replies.fn ? replies.fn(msg, opt) : undefined; }, onRemoved: { addListener: (f) => { onRemoved = f; } } },
    windows: { create: async () => ({ id: 9, tabs: [{ id: 99 }] }), remove: async () => {}, onRemoved: { addListener() {} } },
  };
  const extra = where ? { Intl: { Locale: Intl.Locale, DateTimeFormat: function () { return { resolvedOptions: () => ({ timeZone: where.timeZone }) }; } } } : {};
  const nav = where ? { language: where.languages[0], languages: where.languages } : { language: 'de-CH' };
  const ctx = vm.createContext(Object.assign({ chrome, crypto: webcrypto, navigator: nav, TextEncoder, performance, URL, clearTimeout, Date,
    // Leerlauf-Timer der Texterkennung (60 s) halten den Testlauf nicht auf.
    setTimeout: (f, ms) => { const t = setTimeout(f, ms); t.unref(); return t; } }, extra));
  ctx.importScripts = (...f) => { for (const x of f) vm.runInContext(fs.readFileSync(path.join(EXT, x), 'utf8'), ctx, { filename: x }); };
  vm.runInContext(fs.readFileSync(path.join(EXT, 'background.js'), 'utf8'), ctx, { filename: 'background.js' });
  const send = (msg, sender) => new Promise((res) => listener(msg, sender, (r) => res(r === undefined ? r : JSON.parse(JSON.stringify(r)))));
  return { store, sent, send, broadcast, replies, removed: (id) => onRemoved(id), perm, scripts, events, docs, tabsOpen, queries, inject };
}

const content = { id: 'testid', tab: { id: 5 }, frameId: 0, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/c/1' };
const dialog = { id: 'testid', tab: { id: 5 }, frameId: 7, origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/dialog.html' };
const options = { id: 'testid', origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/options.html' };
const evil = { id: 'testid', tab: { id: 5 }, frameId: 0, origin: 'https://evil.example.com', url: 'https://evil.example.com/' };
const ITEMS = [{ id: 'iban', cat: 'finanz', n: 2 }];

test('Konfiguration nur fuer Content Scripts der 4 Seiten, Richtlinie gewinnt', async () => {
  const { send } = setup({ allowUserOverride: false });
  const r = await send({ t: 'cfg' }, content);
  assert.equal(r.cfg.allowUserOverride, false);
  assert.deepEqual(r.cfg.countryPacks, ['CH', 'EU']);
  assert.equal(await send({ t: 'cfg' }, evil), null);
  assert.equal(await send({ t: 'cfg' }, { ...content, frameId: 3 }), null, 'nur Hauptframe');
});

test('Fund -> 128-Bit-Nonce, in storage.session nur IDs und Anzahlen', async () => {
  const { send, store } = setup();
  const r = await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  assert.match(r.nonce, /^[0-9a-f]{32}$/);
  const p = store.session['dlx.pending']['5'];
  assert.deepEqual(p.items, ITEMS);
  assert.deepEqual(Object.keys(p).sort(), ['account', 'action', 'code', 'created', 'frameId', 'items', 'layout', 'mode', 'nonce', 'popupTabId', 'popupWindowId', 'reason', 'site', 'theme', 'documentId'].sort());
  assert.equal(await send({ t: 'found', mode: 'send', action: 'warn', items: [{ id: 'iban', cat: 'finanz', n: 1, value: 'x' }, { id: 'nope', cat: 'finanz', n: 1 }] }, content), null, 'unbekannte ID');
  assert.equal(await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, evil), null);
});

test('Dialog meldet sich, Content Script erhaelt dlgReady; Content Script kann nicht entscheiden', async () => {
  const { send, sent } = setup();
  const { nonce } = await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  const hello = await send({ t: 'hello' }, dialog);
  assert.equal(hello.mode, 'send');
  assert.deepEqual(hello.items, ITEMS);
  assert.deepEqual(sent.pop(), { tab: 5, msg: { t: 'dlgReady', nonce }, opt: { frameId: 0 } });
  assert.equal(await send({ t: 'decide', choice: 'override', confirmed: true }, content), null);
  assert.equal(await send({ t: 'decide', choice: 'override', confirmed: true }, { ...dialog, url: 'chrome-extension://testid/ui/options.html' }), null);
});

test('"Trotzdem senden" nur mit Haken, auch im Service Worker geprueft (B3)', async () => {
  const { send, sent, store } = setup();
  const { nonce } = await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  assert.deepEqual(await send({ t: 'decide', choice: 'override' }, dialog), { ok: false });
  assert.deepEqual(await send({ t: 'decide', choice: 'override', confirmed: true }, dialog), { ok: true });
  assert.deepEqual(sent.pop().msg, { t: 'decision', nonce, choice: 'override' });
  const day = Object.values(store.local['dlx.stats'])[0];
  assert.deepEqual(day, { chatgpt: { finanz: { override: 2 } } });
  assert.deepEqual(await send({ t: 'hello' }, dialog), { gone: true }, 'Anfrage ist verbraucht');
});

test('Richtlinie allowUserOverride=false und Aktion block verbieten "trotzdem"', async () => {
  const a = setup({ allowUserOverride: false });
  await a.send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  assert.deepEqual(await a.send({ t: 'decide', choice: 'override', confirmed: true }, dialog), { ok: false });
  assert.deepEqual(await a.send({ t: 'decide', choice: 'redact' }, dialog), { ok: true });
  const b = setup();
  await b.send({ t: 'found', mode: 'send', action: 'block', items: ITEMS }, content);
  assert.deepEqual(await b.send({ t: 'decide', choice: 'override', confirmed: true }, dialog), { ok: false });
  assert.deepEqual(await b.send({ t: 'decide', choice: 'redact' }, dialog), { ok: false });
  assert.deepEqual(await b.send({ t: 'decide', choice: 'cancel' }, dialog), { ok: true });
  assert.deepEqual(Object.values(b.store.local['dlx.stats'])[0], { chatgpt: { finanz: { blocked: 2 } } });
});

test('abgelaufene Anfrage (> 120 s) gilt als weg', async () => {
  const { send, store } = setup();
  await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  store.session['dlx.pending']['5'].created -= 121000;
  assert.deepEqual(await send({ t: 'hello' }, dialog), { gone: true });
});

test('Rueckfall-Popup wird dem KI-Tab zugeordnet', async () => {
  const { send } = setup();
  await send({ t: 'found', mode: 'paste', action: 'warn', items: ITEMS }, content);
  assert.deepEqual(await send({ t: 'fallback' }, content), { ok: true });
  const popup = { id: 'testid', tab: { id: 99 }, frameId: 0, origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/dialog.html' };
  assert.equal((await send({ t: 'hello' }, popup)).mode, 'paste');
});

test('Optionen speichern nur Benutzerschluessel, Admin-Schluessel nie', async () => {
  const { send, store } = setup();
  await send({ t: 'save', settings: { language: 'it', allowedSites: ['claude'], blockWhenInactive: false, rules: { email: 'off' } } }, options);
  assert.deepEqual(store.local['dlx.settings'], { language: 'it', rules: { email: 'off' } });
  assert.equal(await send({ t: 'save', settings: { language: 'fr' } }, content), null);
});

test('Eigene Begriffe: nur aus options.html, nur Salz und Pruefsummen, save behaelt sie', async () => {
  const { send, store } = setup();
  const terms = { salt: 'ab'.repeat(32), hashes: ['cd'.repeat(32)] };
  assert.equal(await send({ t: 'userTerms', terms }, content), null);
  assert.equal(await send({ t: 'userTerms', terms }, { ...options, url: 'chrome-extension://testid/ui/popup.html' }), null);
  assert.equal(await send({ t: 'userTerms', terms }, { ...options, url: 'chrome-extension://testid/ui/options.html?x' }), null);
  assert.equal(store.local['dlx.settings'], undefined);
  assert.deepEqual(await send({ t: 'userTerms', terms: { salt: 'kurz', hashes: [] } }, options), { ok: false });
  assert.deepEqual(await send({ t: 'userTerms', terms }, options), { ok: true });
  assert.deepEqual(store.local['dlx.settings'], { userTerms: terms });
  // Speichern der uebrigen Einstellungen laesst die Liste stehen und setzt sie nie selbst.
  await send({ t: 'save', settings: { language: 'it', userTerms: { salt: 'ef'.repeat(32), hashes: [] } } }, options);
  assert.deepEqual(store.local['dlx.settings'], { language: 'it', userTerms: terms });
  const c = await send({ t: 'cfg' }, content);
  assert.deepEqual(c.cfg.userTerms, terms);
  assert.deepEqual(await send({ t: 'userTerms', terms: null }, options), { ok: true });
  assert.deepEqual(store.local['dlx.settings'], { language: 'it' });
});

test('Laenderpakete automatisch: Reise wird nachgefuehrt, Ort wird nie gespeichert', async () => {
  const where = { timeZone: 'Europe/Zurich', languages: ['th-TH', 'de'] }; // th-TH: Region ohne Laenderpaket
  const { send, store } = setup({}, where);
  const a = await send({ t: 'cfg' }, content);
  assert.deepEqual(a.cfg.countryPacks, ['CH', 'EU']);
  assert.deepEqual(Object.keys(a).sort(), ['aiBlocked', 'cfg', 'ignore'], 'Content Script: nur cfg und Liste "Kein sensibler Wert"');
  assert.deepEqual(Object.keys(a.cfg).filter((k) => k !== 'imageScan').sort(), ['accountRules', 'allowNotSensitive', 'allowPlaceholders', 'allowRephrase', 'allowUserOverride', 'allowedSites', 'answerCheck', 'blockUncheckedFiles', 'blockWhenInactive',
    'branding', 'competenceHideSensitive', 'competenceRecord', 'complianceFrameworks', 'complianceReport', 'complianceReportDays', 'copySidebarHint', 'countryPacks', 'customPatterns', 'customTerms',
    'deobfuscation', 'detection', 'dictionary', 'documentFingerprints', 'globalPacks', 'hiddenInstructionAction', 'hiddenInstructionScan', 'identityMinParts', 'labelNames',
    'language', 'massListMin', 'rules', 'sensitiveSourceAction', 'tableMinColumns', 'tableMinRows', 'tableRedaction', 'tableScan', 'trainingAmpel', 'uncertainFindings', 'userTerms',
    'voiceMode']);
  assert.ok(!JSON.stringify(a).includes('Europe') && !JSON.stringify(a).includes('th-TH'));
  const st = await send({ t: 'state' }, options);
  assert.deepEqual(st.country, { mode: 'auto', countries: ['CH', 'EU'], reasons: { CH: 'timezone', EU: 'eu' } });
  where.timeZone = 'America/Chicago';
  assert.deepEqual((await send({ t: 'cfg' }, content)).cfg.countryPacks, ['US'], 'neue Zeitzone wirkt sofort');
  where.timeZone = 'Etc/UTC';
  assert.deepEqual((await send({ t: 'cfg' }, content)).cfg.countryPacks, [], 'keine Zone, Region ohne Paket, erste Sprache ja: wie bisher');
  // Nur der Schluessel der Liste "Kein sensibler Wert" (ohne Ortsbezug).
  assert.deepEqual(Object.keys(store.local), ['dlx.ignore'], 'nichts zum Ort gespeichert');
  assert.deepEqual(store.local['dlx.ignore'].entries, []);
  assert.deepEqual(store.session, {});
});

test('Laenderpakete: selbst waehlen und zurueck auf Automatisch; Richtlinie sperrt', async () => {
  const where = { timeZone: 'Europe/Berlin', languages: ['de-DE'] };
  const { send, store } = setup({}, where);
  await send({ t: 'save', settings: { countryMode: 'manual', countryPacks: ['IT'] } }, options);
  assert.deepEqual(store.local['dlx.settings'], { countryMode: 'manual', countryPacks: ['IT'] });
  where.timeZone = 'Europe/Paris';
  assert.deepEqual((await send({ t: 'cfg' }, content)).cfg.countryPacks, ['IT'], 'manuell: keine Nachfuehrung');
  await send({ t: 'save', settings: { countryMode: 'auto' } }, options);
  assert.deepEqual(store.local['dlx.settings'], { countryMode: 'auto' });
  assert.deepEqual((await send({ t: 'cfg' }, content)).cfg.countryPacks, ['FR', 'DE', 'EU']);
  await send({ t: 'save', settings: { countryMode: 'evil', timeZone: 'Europe/Paris' } }, options);
  assert.deepEqual(store.local['dlx.settings'], {}, 'ungueltiger Modus und fremde Schluessel verworfen');
  const m = setup({ countryPacks: ['NL'], autoCountryPacks: true }, where);
  await m.send({ t: 'save', settings: { countryMode: 'manual', countryPacks: ['IT'] } }, options);
  const st = await m.send({ t: 'state' }, options);
  assert.deepEqual(st.cfg.countryPacks, ['NL']);
  assert.equal(st.country.mode, 'managed');
  assert.equal(st.locked.countryMode, true);
});

// --- "Kein sensibler Wert" (Design-Review Fehlalarme, Auflagen 6-10) ---------
const docA = { ...content, documentId: 'doc-a' };
const IBAN_ITEM = [{ id: 'iban', cat: 'finanz', n: 1 }];
const H1 = 'ab'.repeat(32);
const H2 = 'cd'.repeat(32);

async function grant(s, sender = docA, items = IBAN_ITEM) {
  const { nonce } = await s.send({ t: 'found', mode: 'send', action: 'warn', items }, sender);
  assert.equal((await s.send({ t: 'hello' }, dialog)).allowNotSensitive, true);
  assert.deepEqual(await s.send({ t: 'decide', choice: 'notsensitive' }, dialog), { ok: false }, 'ohne Haken');
  assert.deepEqual(await s.send({ t: 'decide', choice: 'notsensitive', confirmed: true }, dialog), { ok: true });
  assert.deepEqual(s.sent.pop().msg, { t: 'decision', nonce, choice: 'notsensitive' });
  return nonce;
}

test('Kein sensibler Wert: Haken, Nonce nur einmal, nur dasselbe Dokument, Liste nur HMAC mit Ablauf', async () => {
  const s = setup();
  const c = await s.send({ t: 'cfg' }, docA);
  assert.match(c.ignore.key, /^[0-9a-f]{64}$/);
  assert.deepEqual(c.ignore.hashes, []);
  const nonce = await grant(s);
  assert.notDeepEqual(await s.send({ t: 'ignoreAdd', nonce, hashes: [H1] }, dialog), { ok: true }, 'nicht aus dem Dialog');
  assert.equal(await s.send({ t: 'ignoreAdd', nonce, hashes: [H1] }, evil), null, 'fremde Herkunft');
  assert.deepEqual(await s.send({ t: 'ignoreAdd', nonce, hashes: [H1] }, docA), { ok: true });
  assert.deepEqual(await s.send({ t: 'ignoreAdd', nonce, hashes: [H2] }, docA), { ok: false }, 'Nonce verbraucht');
  const e = s.store.local['dlx.ignore'].entries;
  assert.deepEqual(e.map((x) => x.h), [H1]);
  assert.ok(e[0].exp > Date.now() + 29 * 86400000 && e[0].exp <= Date.now() + 30 * 86400000);
  assert.deepEqual((await s.send({ t: 'cfg' }, docA)).ignore.hashes, [H1]);
  const day = Object.values(s.store.local['dlx.stats'])[0];
  assert.deepEqual(day, { chatgpt: { finanz: { notsensitive: 1 } } }, 'Zaehler nur Zahl');
  const st = await s.send({ t: 'state' }, options);
  assert.equal(st.ignored, 1);
  assert.ok(!JSON.stringify(st).includes(H1) && !JSON.stringify(st).includes(c.ignore.key), 'Einstellungen ohne Pruefsummen/Schluessel');
});

test('Kein sensibler Wert: anderes Dokument, zu viele oder falsche Pruefsummen werden abgelehnt', async () => {
  const s = setup();
  await s.send({ t: 'cfg' }, docA);
  let nonce = await grant(s);
  assert.deepEqual(await s.send({ t: 'ignoreAdd', nonce, hashes: [H1] }, { ...docA, documentId: 'doc-b' }), { ok: false });
  assert.deepEqual(await s.send({ t: 'ignoreAdd', nonce, hashes: [H1] }, docA), { ok: false }, 'Versuch verbraucht die Nonce');
  nonce = await grant(s);
  assert.deepEqual(await s.send({ t: 'ignoreAdd', nonce, hashes: [H1, H2] }, docA), { ok: false }, 'mehr als Funde');
  nonce = await grant(s);
  assert.deepEqual(await s.send({ t: 'ignoreAdd', nonce, hashes: ['4242424242424242'] }, docA), { ok: false }, 'kein Hash');
  assert.deepEqual(s.store.local['dlx.ignore'].entries, []);
});

test('Kein sensibler Wert: nur bei warn, Richtlinie und allowUserOverride; aus = Liste geloescht', async () => {
  const a = setup();
  await a.send({ t: 'found', mode: 'send', action: 'warn', items: [{ id: 'ch_tel', cat: 'kontakt', n: 1 }] }, docA);
  assert.equal((await a.send({ t: 'hello' }, dialog)).allowNotSensitive, false, 'Telefon nie');
  assert.deepEqual(await a.send({ t: 'decide', choice: 'notsensitive', confirmed: true }, dialog), { ok: false });
  const b = setup();
  await b.send({ t: 'found', mode: 'send', action: 'block', items: IBAN_ITEM }, docA);
  assert.deepEqual(await b.send({ t: 'decide', choice: 'notsensitive', confirmed: true }, dialog), { ok: false }, 'block');
  for (const managed of [{ allowNotSensitive: false }, { allowUserOverride: false }]) {
    const m = setup(managed);
    m.store.local['dlx.ignore'] = { key: H1, entries: [{ h: H2, exp: Date.now() + 1000 }] };
    assert.equal((await m.send({ t: 'cfg' }, docA)).ignore, null);
    assert.equal(m.store.local['dlx.ignore'], undefined, 'Liste geloescht');
    await m.send({ t: 'found', mode: 'send', action: 'warn', items: IBAN_ITEM }, docA);
    assert.equal((await m.send({ t: 'hello' }, dialog)).allowNotSensitive, false);
    assert.deepEqual(await m.send({ t: 'decide', choice: 'notsensitive', confirmed: true }, dialog), { ok: false });
    assert.equal((await m.send({ t: 'state' }, options)).ignoreAllowed, false);
  }
});

test('Kein sensibler Wert: Pruefung beim Lesen, Loeschen nur aus options.html', async () => {
  const s = setup();
  const now = Date.now();
  s.store.local['dlx.ignore'] = { key: H1, entries: [{ h: 'zz', exp: now + 1000 }, { h: H1, exp: now + 40 * 86400000 }, { h: H2, exp: now - 1 }, { h: H2, exp: now + 1000 }] };
  assert.deepEqual((await s.send({ t: 'cfg' }, docA)).ignore.hashes, [H2]);
  assert.equal(await s.send({ t: 'ignoreReset' }, { ...options, url: 'chrome-extension://testid/ui/options.html?x' }), null);
  assert.equal(await s.send({ t: 'ignoreReset' }, { ...dialog, url: 'chrome-extension://testid/ui/popup.html' }), null);
  assert.ok(s.store.local['dlx.ignore']);
  assert.deepEqual(await s.send({ t: 'ignoreReset' }, options), { ok: true });
  assert.equal(s.store.local['dlx.ignore'], undefined);
  s.store.local['dlx.ignore'] = { key: 'kaputt', entries: [{ h: H2, exp: now + 1000 }] };
  const c = await s.send({ t: 'cfg' }, docA);
  assert.notEqual(c.ignore.key, 'kaputt', 'ungueltiger Schluessel wird ersetzt');
  assert.deepEqual(c.ignore.hashes, []);
});

// --- Leiste oberhalb des Eingabefelds (Design-Review 14.10.2026) -------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('Layout und Thema nur aus festen Listen, hello liefert sie zurueck', async () => {
  const { send } = setup();
  await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS, layout: 'bar', theme: 'dunkel' }, content);
  const h = await send({ t: 'hello' }, dialog);
  assert.equal(h.layout, 'bar');
  assert.equal(h.theme, 'dunkel');
  const b = setup();
  await b.send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS, layout: '<x>', theme: 'url(x)' }, content);
  const h2 = await b.send({ t: 'hello' }, dialog);
  assert.equal(h2.layout, 'full', 'unbekanntes Layout -> Vollbild');
  assert.equal(h2.theme, 'hell');
});

test('Frame wird beim ersten hello gebunden; anderer Frame im Tab gilt als weg (Auflage 11)', async () => {
  const { send } = setup();
  await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS, layout: 'bar' }, content);
  assert.equal((await send({ t: 'hello' }, dialog)).mode, 'send');
  assert.deepEqual(await send({ t: 'hello' }, { ...dialog, frameId: 8 }), { gone: true });
  assert.deepEqual(await send({ t: 'decide', choice: 'cancel' }, { ...dialog, frameId: 8 }), { gone: true });
  assert.deepEqual(await send({ t: 'decide', choice: 'cancel' }, dialog), { ok: true });
});

test('Live-Nonce: nur Schwaerzen/Ausblenden, nie Trotzdem/Abbrechen; verdraengt keine Sende-Meldung (Auflagen 10, 17)', async () => {
  const { send, sent, store } = setup();
  const { nonce } = await send({ t: 'found', mode: 'live', action: 'block', items: ITEMS, layout: 'bar' }, content);
  assert.equal(store.session['dlx.pending']['5'].action, 'warn', 'Art/Aktion legt der Service Worker fest');
  assert.deepEqual(await send({ t: 'decide', choice: 'override', confirmed: true }, dialog), { ok: false });
  assert.deepEqual(await send({ t: 'decide', choice: 'cancel' }, dialog), { ok: false });
  assert.deepEqual(await send({ t: 'decide', choice: 'ok' }, dialog), { ok: false });
  assert.deepEqual(await send({ t: 'decide', choice: 'redact' }, dialog), { ok: true });
  assert.deepEqual(sent.pop().msg, { t: 'decision', nonce, choice: 'redact' });
  assert.equal(await send({ t: 'found', mode: 'live', action: 'warn', items: ITEMS, layout: 'full' }, content), null, 'Live nur als Leiste');
  // Offene Sende-Meldung bleibt, ein Live-Fund wird abgewiesen.
  const s = await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS, layout: 'bar' }, content);
  assert.equal(await send({ t: 'found', mode: 'live', action: 'warn', items: ITEMS, layout: 'bar' }, content), null);
  assert.equal(store.session['dlx.pending']['5'].nonce, s.nonce);
  // Fallback-Popup nie fuer Live.
  const l = setup();
  await l.send({ t: 'found', mode: 'live', action: 'warn', items: ITEMS, layout: 'bar' }, content);
  assert.equal(await l.send({ t: 'fallback' }, content), null);
});

test('hide gilt nur fuer Live; Sende-Meldung kennt kein hide', async () => {
  const { send } = setup();
  await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS, layout: 'bar' }, content);
  assert.deepEqual(await send({ t: 'decide', choice: 'hide' }, dialog), { ok: false });
  const l = setup();
  await l.send({ t: 'found', mode: 'live', action: 'warn', items: ITEMS, layout: 'bar' }, content);
  assert.deepEqual(await l.send({ t: 'decide', choice: 'hide' }, dialog), { ok: true });
  assert.equal(l.store.local['dlx.stats'], undefined, 'Ausblenden wird nicht gezaehlt');
});

test('moved/neuer Live-Fund: datenloser, gedrosselter Anstoss an die Frames (Auflage 12)', async () => {
  const { send, broadcast } = setup();
  await send({ t: 'found', mode: 'live', action: 'warn', items: ITEMS, layout: 'bar' }, content);
  await send({ t: 'hello' }, dialog);
  for (let i = 0; i < 10; i++) await send({ t: 'moved' }, content);
  await send({ t: 'found', mode: 'live', action: 'warn', items: [{ id: 'iban', cat: 'finanz', n: 3 }], layout: 'bar', renew: true }, content);
  await sleep(300);
  assert.ok(broadcast.length >= 1 && broadcast.length <= 2, String(broadcast.length));
  assert.equal(JSON.stringify(broadcast[0]), '{"t":"nudge"}');
  assert.equal((await send({ t: 'hello' }, dialog)).items[0].n, 3, 'gebundener Frame bleibt beim neuen Live-Fund');
});

test('Tab geschlossen: Eintrag weg', async () => {
  const { send, store, removed } = setup();
  await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  await removed(5);
  assert.equal(store.session['dlx.pending']['5'], undefined);
});

// Platzhalter (Design-Review Platzhalter 14.10.2026, Auflagen 2-4, 8).
const view = (frameId = 8) => ({ id: 'testid', tab: { id: 5 }, frameId, origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/view.html#x' });
const SECRET = 'CH9300762011623852957';

async function openReveal(s) {
  const f = await s.send({ t: 'found', mode: 'reveal', action: 'warn', items: ITEMS, layout: 'bar' }, { ...content, documentId: 'doc1' });
  assert.ok(f && f.nonce);
  const hello = await s.send({ t: 'hello' }, dialog);
  assert.equal(hello.allowPlaceholders, true);
  assert.deepEqual(await s.send({ t: 'decide', choice: 'show' }, dialog), { ok: true });
  const d = s.sent.filter((x) => x.msg.t === 'decision').pop();
  assert.equal(d.msg.choice, 'show');
  assert.match(d.msg.view, /^[0-9a-f]{32}$/);
  return d.msg.view;
}

test('Platzhalter: Entscheidung pseudonym wie Schwaerzen, nur mit Richtlinie; Art reveal nur show/hide', async () => {
  const a = setup();
  await a.send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  assert.deepEqual(await a.send({ t: 'decide', choice: 'pseudonym' }, dialog), { ok: true });
  await a.send({ t: 'found', mode: 'reveal', action: 'warn', items: ITEMS, layout: 'bar' }, content);
  assert.deepEqual(await a.send({ t: 'decide', choice: 'redact' }, dialog), { ok: false }, 'reveal kennt kein Schwaerzen');
  const b = setup({ allowPlaceholders: false });
  await b.send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  assert.equal((await b.send({ t: 'hello' }, dialog)).allowPlaceholders, false);
  assert.deepEqual(await b.send({ t: 'decide', choice: 'pseudonym' }, dialog), { ok: false });
  assert.equal(await b.send({ t: 'found', mode: 'reveal', action: 'warn', items: ITEMS, layout: 'bar' }, content), null, 'Richtlinie aus: keine Antwort-Leiste');
  const blk = setup();
  await blk.send({ t: 'found', mode: 'send', action: 'block', items: ITEMS }, content);
  assert.deepEqual(await blk.send({ t: 'decide', choice: 'pseudonym' }, dialog), { ok: false }, 'block: kein Platzhalter');
});

test('Platzhalter: Antwort-Leiste verdraengt nie eine offene Sende-Meldung', async () => {
  const s = setup();
  await s.send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  assert.equal(await s.send({ t: 'found', mode: 'reveal', action: 'warn', items: ITEMS, layout: 'bar' }, content), null);
});

test('Ansicht: Text nur gegen die einmal gueltige Nonce, nie in storage, Ablauf 60 s, Schliessen raeumt auf', async () => {
  const s = setup();
  s.replies.fn = (msg, opt) => (msg.t === 'viewText' ? { text: 'Antwort ' + SECRET } : undefined);
  const nonce = await openReveal(s);
  assert.ok(!JSON.stringify(s.store).includes(SECRET));
  assert.equal(await s.send({ t: 'view' }, view()), null, 'ohne Nonce nichts');
  assert.equal(await s.send({ t: 'view', nonce: 'f'.repeat(32) }, view()), null, 'fremde Nonce nichts');
  assert.equal((await s.send({ t: 'view', nonce }, { ...view(), url: 'chrome-extension://testid/ui/dialog.html' })).text, undefined, 'nur die Ansichtsseite');
  assert.equal(await s.send({ t: 'view', nonce }, { ...content }), null, 'nie die KI-Seite');
  assert.equal(await s.send({ t: 'view', nonce }, view(0)), null, 'nie der Top-Frame');
  assert.equal(await s.send({ t: 'view', nonce }, { ...view(), tab: { id: 6 } }), null, 'nur dieser Tab');
  const r = await s.send({ t: 'view', nonce }, view());
  assert.equal(r.text, 'Antwort ' + SECRET);
  const ask = s.sent.filter((x) => x.msg.t === 'viewText').pop();
  assert.deepEqual(ask.opt, { frameId: 0, documentId: 'doc1' }, 'nur das Dokument, das die Ansicht geoeffnet hat');
  assert.ok(!JSON.stringify(s.store).includes(SECRET), 'Text nie in storage');
  assert.equal(await s.send({ t: 'view', nonce }, view()), null, 'Nonce nur einmal');
  assert.equal(await s.send({ t: 'close', nonce }, view(9)), null, 'Schliessen nur aus dem gebundenen Frame');
  assert.deepEqual(await s.send({ t: 'close', nonce }, view()), { ok: true });
  assert.equal(s.sent.pop().msg.choice, 'hide');
  assert.equal(s.store.session['dlx.views'], undefined, 'storage.session nach Ablauf leer');
  // Abgelaufene Nonce (> 60 s) bekommt nichts.
  const n2 = await openReveal(s);
  s.store.session['dlx.views']['5'].created -= 61000;
  assert.equal(await s.send({ t: 'view', nonce: n2 }, view()), null);
  assert.equal(s.store.session['dlx.views'], undefined);
});

test('Ansicht: Richtlinie aus oder Tab geschlossen -> kein Text', async () => {
  const s = setup();
  s.replies.fn = () => ({ text: SECRET });
  const nonce = await openReveal(s);
  s.store.managed.allowPlaceholders = false;
  assert.equal(await s.send({ t: 'view', nonce }, view()), null);
  s.store.managed.allowPlaceholders = true;
  const n2 = await openReveal(s);
  await s.removed(5);
  assert.equal(await s.send({ t: 'view', nonce: n2 }, view()), null);
});

// --- KI-Seiten-Kontrolle (Design-Review KI-Seiten 14.10.2026, Auflagen 5, 7, 8, 10, 13) ---
const aiTab = (origin, url, extra) => Object.assign({ id: 'testid', tab: { id: 6 }, frameId: 0, origin, url: url || origin + '/', documentId: 'doc-6' }, extra || {});
const banner = (extra) => Object.assign({ id: 'testid', tab: { id: 6 }, frameId: 11, origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/aibanner.html#x', documentId: 'doc-b' }, extra || {});
const tick = () => new Promise((r) => setTimeout(r, 20));

test('KI-Seiten: Entscheid nur fuer eigenes Content Script im Hauptframe einer Seite der Liste', async () => {
  const { send } = setup({ aiSiteMode: 'hint', allowedAiSites: ['m365copilot'] });
  const ds = aiTab('https://chat.deepseek.com');
  const r = await send({ t: 'aiSite' }, ds);
  assert.equal(r.a, 'hint');
  assert.match(r.nonce, /^[0-9a-f]{32}$/);
  assert.deepEqual(Object.keys(r).sort(), ['a', 'nonce'], 'nur Modus und Nonce, nie Listen oder Richtlinie');
  assert.equal(await send({ t: 'aiSite' }, aiTab('https://evil.example.com')), null);
  assert.equal(await send({ t: 'aiSite' }, aiTab('https://chat.deepseek.com:8443')), null);
  assert.equal(await send({ t: 'aiSite' }, { ...ds, frameId: 3 }), null, 'Subframe');
  assert.equal(await send({ t: 'aiSite' }, { ...ds, documentId: undefined }), null, 'ohne documentId');
  assert.equal(await send({ t: 'aiSite' }, { ...ds, id: 'fremd' }), null, 'fremde Erweiterung');
  assert.deepEqual(await send({ t: 'aiSite' }, aiTab('https://copilot.cloud.microsoft')), { a: 'none' }, 'freigegeben');
  assert.deepEqual(await send({ t: 'aiSite' }, aiTab('https://huggingface.co', 'https://huggingface.co/models')), null, 'Pfad ausserhalb');
  const { send: off } = setup({});
  assert.deepEqual(await off({ t: 'aiSite' }, ds), { a: 'none' }, 'Standard off');
});

test('KI-Seiten: Banner-Nonce einmal, an Tab gebunden, 60 s, Antwort nur Texte; Schliessen nur im Hinweis-Modus (Auflage 8)', async () => {
  const { send, sent, store } = setup({ aiSiteMode: 'hint', blockedAiSites: ['grok'], branding: { aiNoticeText: 'Bitte nutzen Sie den Firmen-Copilot.', aiNoticeUrl: 'https://copilot.example.com/' } });
  const { nonce } = await send({ t: 'aiSite' }, aiTab('https://poe.com'));
  assert.equal(await send({ t: 'aiBanner', nonce }, banner({ tab: { id: 7 } })), null, 'anderer Tab');
  assert.ok(!((await send({ t: 'aiBanner', nonce }, { ...banner(), url: 'chrome-extension://testid/ui/dialog.html' })) || {}).a, 'andere Seite');
  assert.equal(await send({ t: 'aiBanner', nonce }, { ...banner(), frameId: 0 }), null, 'Hauptframe');
  const info = await send({ t: 'aiBanner', nonce }, banner());
  assert.deepEqual([info.a, info.site, info.text, info.url, info.linkText], ['hint', 'Poe', 'Bitte nutzen Sie den Firmen-Copilot.', 'https://copilot.example.com/', '']);
  assert.ok(!JSON.stringify(info).includes('blockedAiSites') && !JSON.stringify(info).includes('grok'));
  assert.equal(await send({ t: 'aiBanner', nonce }, banner()), null, 'nur einmal');
  assert.equal(await send({ t: 'aiClose', nonce }, banner({ frameId: 12 })), null, 'anderer Frame');
  assert.deepEqual(await send({ t: 'aiClose', nonce }, banner()), { ok: true });
  assert.deepEqual(sent.pop(), { tab: 6, msg: { t: 'aiHide', nonce }, opt: { frameId: 0, documentId: 'doc-6' } });
  assert.equal(await send({ t: 'aiClose', nonce }, banner()), null, 'danach weg');
  // Sperre: kein Schliessen-Weg
  const b = await send({ t: 'aiSite' }, aiTab('https://grok.com'));
  assert.equal(b.a, 'block');
  assert.equal((await send({ t: 'aiBanner', nonce: b.nonce }, banner())).a, 'block');
  assert.equal(await send({ t: 'aiClose', nonce: b.nonce }, banner()), null);
  // Ablauf 60 s bis zum ersten Abruf; gespeichert nur Nonce-Daten ohne URL
  const old = await send({ t: 'aiSite' }, aiTab('https://poe.com'));
  const rec = store.session['dlx.ai'][old.nonce];
  assert.deepEqual(Object.keys(rec).sort(), ['a', 'doc', 'id', 'site', 'tab', 'until']);
  assert.ok(!JSON.stringify(store.session['dlx.ai']).includes('https://'));
  rec.until = Date.now() - 1;
  assert.equal(await send({ t: 'aiBanner', nonce: old.nonce }, banner()), null, 'abgelaufen');
});

test('Freigegebene KI vorschlagen: Knopf zur Startseite aus der Liste, Branding-Link hat Vorrang, nur Richtlinie (Design-Review 16.10.2026)', async () => {
  const { send } = setup({ aiSiteMode: 'block', suggestedAiSite: 'm365copilot' });
  // vorgeschlagene Seite selbst: freigegeben, kein Hinweis (Auflage 5)
  assert.deepEqual(await send({ t: 'aiSite' }, aiTab('https://copilot.cloud.microsoft')), { a: 'none' });
  assert.deepEqual(await send({ t: 'aiSite' }, aiTab('https://m365.cloud.microsoft')), { a: 'none' });
  const { nonce } = await send({ t: 'aiSite' }, aiTab('https://poe.com'));
  const info = await send({ t: 'aiBanner', nonce }, banner());
  assert.deepEqual([info.a, info.url, info.suggest, info.linkText], ['block', 'https://copilot.cloud.microsoft/', 'Microsoft 365 Copilot', '']);
  // eigener Link aus dem Branding: kein zweiter Knopf (Auflage 11)
  const { send: own } = setup({ aiSiteMode: 'hint', suggestedAiSite: 'm365copilot', branding: { aiNoticeUrl: 'https://copilot.example.com/' } });
  const o = await own({ t: 'aiSite' }, aiTab('https://poe.com'));
  const oi = await own({ t: 'aiBanner', nonce: o.nonce }, banner());
  assert.deepEqual([oi.url, oi.suggest], ['https://copilot.example.com/', '']);
  // gesperrt schlaegt Vorschlag: kein Knopf, Seite gesperrt (Auflage 5)
  const { send: blk } = setup({ aiSiteMode: 'hint', suggestedAiSite: 'claude', blockedAiSites: ['claude'] });
  assert.equal((await blk({ t: 'aiSite' }, aiTab('https://claude.ai'))).a, 'block');
  const bn = await blk({ t: 'aiSite' }, aiTab('https://poe.com'));
  const bi = await blk({ t: 'aiBanner', nonce: bn.nonce }, banner());
  assert.deepEqual([bi.url, bi.suggest], ['', '']);
  // lokal gesetzt (ohne Richtlinie): keine Wirkung (Auflage 2)
  const { send: loc, store } = setup({});
  store.local['dlx.settings'] = { aiSiteMode: 'hint', suggestedAiSite: 'claude' };
  const ln = await loc({ t: 'aiSite' }, aiTab('https://poe.com'));
  const li = await loc({ t: 'aiBanner', nonce: ln.nonce }, banner());
  assert.deepEqual([li.a, li.url, li.suggest], ['hint', '', '']);
  assert.equal((await loc({ t: 'aiSite' }, aiTab('https://claude.ai'))).a, 'hint', 'lokaler Vorschlag gibt nichts frei');
  // Content Scripts erhalten den Schluessel nicht (Auflage 7 KI-Seiten)
  const { send: cs } = setup({ aiSiteMode: 'hint', suggestedAiSite: 'm365copilot' });
  assert.equal((await cs({ t: 'cfg' }, { ...content, documentId: 'd' })).cfg.suggestedAiSite, undefined);
});

test('KI-Seiten: gesperrte unterstuetzte Seite -> cfg.aiBlocked, Listen bleiben im Service Worker (Auflagen 7, 10)', async () => {
  const { send } = setup({ aiSiteMode: 'hint', blockedAiSites: ['chatgpt'], allowedAiSites: ['claude'] });
  const r = await send({ t: 'cfg' }, { ...content, documentId: 'd' });
  assert.equal(r.aiBlocked, true);
  for (const k of ['aiSiteMode', 'allowedAiSites', 'blockedAiSites']) assert.equal(r.cfg[k], undefined, k);
  const c = await send({ t: 'cfg' }, { ...content, origin: 'https://claude.ai', url: 'https://claude.ai/new' });
  assert.equal(c.aiBlocked, false);
});

test('KI-Seiten: Registrierung nur gewaehrte Origins der Liste, zuerst abmelden, entzogenes Recht meldet ab (Auflagen 5, 13)', async () => {
  const { store, perm, scripts, events } = setup({}, null);
  store.local['dlx.settings'] = { aiSiteMode: 'hint', allowedAiSites: ['claude'] };
  perm.origins.push('https://claude.ai/*', 'https://chat.openai.com/*');
  events.installed(); await tick();
  assert.equal(scripts.length, 1);
  const s = scripts[0];
  assert.deepEqual([s.id, s.js, s.runAt, s.world, s.allFrames, s.persistAcrossSessions], ['dlx-ai-guard', ['content/aiguard.js'], 'document_start', 'ISOLATED', false, true]);
  assert.deepEqual(s.matches, ['https://chat.openai.com/*'], 'statische Seiten nie dynamisch, freigegebene nie, ohne gewaehrtes Recht nichts');
  perm.origins.push('https://poe.com/*', 'https://huggingface.co/*', 'https://evil.example.com/*', 'https://chatgpt.com/*');
  events.added(); await tick();
  assert.equal(scripts.length, 1, 'alte Registrierung vorher abgemeldet');
  const allowed = new Set(JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).optional_host_permissions);
  assert.ok(scripts[0].matches.includes('https://poe.com/*') && scripts[0].matches.includes('https://huggingface.co/chat*'));
  assert.ok(!scripts[0].matches.includes('https://chatgpt.com/*') && !scripts[0].matches.includes('https://evil.example.com/*'));
  for (const m of scripts[0].matches) assert.ok(allowed.has(m.replace(/\/chat\*$|\/copilot\*$/, '/*')), 'nie ausserhalb der Liste: ' + m);
  perm.origins.splice(0);
  events.permRemoved(); await tick();
  assert.deepEqual(scripts, [], 'entzogen -> abgemeldet');
  perm.origins.push('https://poe.com/*');
  events.added(); await tick();
  assert.equal(scripts.length, 1);
  store.local['dlx.settings'] = { aiSiteMode: 'off' };
  events.changed({}, 'managed'); await tick();
  assert.deepEqual(scripts, [], 'Modus off -> nichts registriert');
});

test('Regeln je Konto: Kontoart nur als Enum vom Content Script, Dialog erhaelt sie (Auflage 10)', async () => {
  const { send, store } = setup();
  await send({ t: 'found', mode: 'send', action: 'block', items: ITEMS, account: 'personal' }, content);
  assert.equal(store.session['dlx.pending']['5'].account, 'personal');
  assert.equal((await send({ t: 'hello' }, dialog)).account, 'personal');
  await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS, account: 'Beispiel AG' }, content);
  assert.equal(store.session['dlx.pending']['5'].account, null, 'ausserhalb des Enums verworfen');
  assert.ok(!JSON.stringify(store).includes('Beispiel'));
  assert.equal(await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS, account: 'business' }, { ...content, frameId: 2 }), null, 'nur Hauptframe');
});

// --- Bilder pruefen (Design-Review Bilder 14.10.2026) ---------------------------
const B64 = Buffer.from('bild').toString('base64');
const WORDS = [[['IBAN:', 1, 1, 9, 9], ['CH93', 10, 1, 19, 9]]];

// --- Lokale KI-Erkennung (Design-Review KI 16.10.2026, Auflagen 12, 14, 17, 19) ---
test('KI: Text nur vom eigenen Content Script, Laengengrenze, Antwort geprueft, Status ohne Text', async () => {
  const s = setup();
  const TEXT = 'Mail an Thomas Brunnhuber';
  s.replies.ki = async (m) => (m.t === 'run' ? { ents: [{ type: 'PERSON_NAME', start: 8, end: 25, score: 0.99 }], ep: 'wasm', ms: 40 } : { ok: true });
  for (const bad of [{ ...content, origin: 'https://evil.example' }, { ...content, frameId: 3 }, { ...content, id: 'fremd' }, { id: 'testid', origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/popup.html' }]) {
    assert.deepEqual(await s.send({ t: 'ki', text: TEXT, seq: 1 }, bad), { error: 'fail' });
  }
  assert.equal(s.broadcast.filter((x) => x.target === 'dlx-ki').length, 0, 'fremde Absender erreichen das Offscreen-Dokument nie');
  assert.deepEqual(await s.send({ t: 'ki', text: 'x'.repeat(4001), seq: 1 }, content), { error: 'size' });
  assert.deepEqual(await s.send({ t: 'ki', text: TEXT, seq: 'a' }, content), { error: 'fail' });
  const r = await s.send({ t: 'ki', text: TEXT, seq: 2 }, content);
  assert.deepEqual(r, { ents: [{ type: 'PERSON_NAME', start: 8, end: 25, score: 0.99 }], ep: 'wasm' });
  const m = s.broadcast.find((x) => x.target === 'dlx-ki');
  assert.deepEqual(Object.keys(m).sort(), ['gpu', 't', 'target', 'text']);
  assert.equal(m.gpu, false, 'Standard WASM');
  assert.equal(JSON.stringify(s.docs.created[0].reasons), '["WORKERS"]');
  assert.ok(!JSON.stringify(s.store.local).includes('Brunnhuber') && !JSON.stringify(s.store.session).includes('Brunnhuber'), 'Text nie im Speicher');
  assert.deepEqual(s.store.session.kiStatus, { state: 'bereit', ep: 'wasm', fails: 0 });
  const st = await s.send({ t: 'state' }, { id: 'testid', origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/popup.html' });
  assert.deepEqual(st.ki, { state: 'bereit', ep: 'wasm', fails: 0 });
});

test('KI: ungueltige Antwort = nur Regeln, Worker neu gestartet; hoechstens ein neuer Versuch je Sitzung; regeln = aus', async () => {
  const s = setup();
  s.replies.ki = async (m) => (m.t === 'run' ? { ents: [{ type: 'EVIL', start: 0, end: 3, score: 1 }] } : { ok: true });
  assert.deepEqual(await s.send({ t: 'ki', text: 'Hallo Welt', seq: 1 }, content), { error: 'fail' });
  assert.ok(s.broadcast.some((x) => x.target === 'dlx-ki' && x.t === 'stop'), 'Worker neu gestartet');
  assert.equal(s.store.session.kiStatus.state, 'fehler');
  s.replies.ki = async (m) => (m.t === 'run' ? { error: 'fail' } : { ok: true });
  assert.deepEqual(await s.send({ t: 'ki', text: 'Hallo Welt', seq: 2 }, content), { error: 'fail' });
  const before = s.broadcast.filter((x) => x.t === 'run').length;
  assert.deepEqual(await s.send({ t: 'ki', text: 'Hallo Welt', seq: 3 }, content), { error: 'off' }, 'nach dem zweiten Fehler kein Laden mehr');
  assert.equal(s.broadcast.filter((x) => x.t === 'run').length, before);
  const p = setup();
  p.store.local['dlx.settings'] = { detection: 'regeln' };
  assert.deepEqual(await p.send({ t: 'ki', text: 'Hallo Welt', seq: 1 }, content), { error: 'off' });
  assert.equal(p.broadcast.filter((x) => x.target === 'dlx-ki').length, 0);
  const st = await p.send({ t: 'state' }, { id: 'testid', origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/popup.html' });
  assert.equal(st.ki.state, 'aus');
});

test('KI: je Tab gilt nur die neueste Anfrage, aeltere verfallen (Auflage 14)', async () => {
  const s = setup();
  let release = null;
  s.replies.ki = (m) => (m.t === 'run' && !release ? new Promise((r) => { release = () => r({ ents: [], ep: 'wasm' }); }) : Promise.resolve({ ents: [], ep: 'wasm' }));
  const first = s.send({ t: 'ki', text: 'erster Text', seq: 1 }, content);
  await new Promise((r) => setTimeout(r, 5));
  const second = s.send({ t: 'ki', text: 'zweiter Text', seq: 2 }, content);
  release();
  assert.deepEqual(await first, { error: 'stale' });
  assert.deepEqual(await second, { ents: [], ep: 'wasm' });
});

test('Bilder: OCR nur vom eigenen Content Script, Offscreen-Dokument mit Zielmarke, Sprachen nach Oberflaeche', async () => {
  const s = setup();
  s.replies.ocr = async () => ({ lines: WORDS, scale: 2, w: 100, h: 50, ms: 12 });
  const r = await s.send({ t: 'ocr', data: B64, lang: 'fr', ms: 5000 }, content);
  assert.deepEqual(r, { lines: WORDS, scale: 2, w: 100, h: 50, ms: 12 });
  assert.deepEqual(JSON.parse(JSON.stringify(s.docs.created)), [{ url: 'ui/ocr.html', reasons: ['WORKERS'], justification: 'Local text recognition in pasted images and local AI detection of personal data' }]);
  const m = s.broadcast.find((x) => x.target === 'dlx-ocr');
  assert.deepEqual(JSON.parse(JSON.stringify(m)), { target: 'dlx-ocr', t: 'run', data: B64, langs: ['deu', 'eng', 'fra'] });
  for (const who of [evil, options, dialog]) assert.deepEqual(await s.send({ t: 'ocr', data: B64, lang: 'de' }, who), { error: 'fail' }, who.url);
  assert.equal(s.broadcast.filter((x) => x.target === 'dlx-ocr').length, 1, 'fremde Absender erreichen das Offscreen-Dokument nie');
  assert.ok(!JSON.stringify(s.store).includes(B64), 'Bildbytes nie in storage (Auflage 11)');
});

test('Bilder: Groesse vor dem Weiterreichen, ungueltige Antwort = fail, eine Pruefung gleichzeitig ueber alle Tabs (Auflage 3)', async () => {
  const s = setup();
  assert.deepEqual(await s.send({ t: 'ocr', data: 'A'.repeat(14 * 1024 * 1024), lang: 'de' }, content), { error: 'size' });
  s.replies.ocr = async () => ({ lines: [[['x', 1, 2, 3]]], scale: 1, w: 1, h: 1 });
  assert.deepEqual(await s.send({ t: 'ocr', data: B64, lang: 'de' }, content), { error: 'fail' });
  s.replies.ocr = async () => ({ error: 'size' });
  assert.deepEqual(await s.send({ t: 'ocr', data: B64, lang: 'de' }, content), { error: 'size' });
  let release;
  s.replies.ocr = () => new Promise((r) => { release = r; });
  const first = s.send({ t: 'ocr', data: B64, lang: 'de', ms: 5000 }, content);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(await s.send({ t: 'ocr', data: B64, lang: 'de' }, content), { error: 'busy' });
  assert.deepEqual(await s.send({ t: 'ocr', data: B64, lang: 'de' }, Object.assign({}, content, { tab: { id: 6 } })), { error: 'busy' }, 'auch ein anderer Tab wartet nicht');
  release({ lines: [], scale: 1, w: 1, h: 1 });
  assert.deepEqual(await first, { lines: [], scale: 1, w: 1, h: 1, ms: 0 });
});

test('Bilder: Zeitueberschreitung -> Meldung "timeout" und Offscreen-Dokument geschlossen (beendet den Worker)', async () => {
  const s = setup();
  s.replies.ocr = () => new Promise(() => {});
  const t0 = Date.now();
  assert.deepEqual(await s.send({ t: 'ocr', data: B64, lang: 'de', ms: 1000 }, content), { error: 'timeout' });
  assert.ok(Date.now() - t0 < 3000);
  assert.equal(s.docs.closed, 1);
  assert.equal(s.docs.open, false);
});

test('Bilder: imageScan per Richtlinie aus -> keine Texterkennung; Richtlinie true schlaegt Benutzer false (Auflage 13)', async () => {
  const off = setup({ imageScan: false });
  off.replies.ocr = async () => ({ lines: [], scale: 1, w: 1, h: 1 });
  assert.deepEqual(await off.send({ t: 'ocr', data: B64, lang: 'de' }, content), { error: 'off' });
  assert.equal(off.docs.created.length, 0);
  const on = setup({ imageScan: true });
  on.store.local['dlx.settings'] = { imageScan: false };
  assert.equal((await on.send({ t: 'cfg' }, content)).cfg.imageScan, true);
  assert.deepEqual(await on.send({ t: 'save', settings: { imageScan: false } }, options), { ok: true });
  assert.equal((await on.send({ t: 'cfg' }, content)).cfg.imageScan, true);
  assert.equal((await on.send({ t: 'state' }, options)).locked.imageScan, true);
  const user = setup();
  user.store.local['dlx.settings'] = { imageScan: false };
  assert.equal((await user.send({ t: 'cfg' }, content)).cfg.imageScan, false);
});

test('Bilder: Arten image/imagefail nur mit festen Entscheidungen; kein Platzhalter, kein "Kein sensibler Wert"', async () => {
  const s = setup();
  const { nonce } = await s.send({ t: 'found', mode: 'image', action: 'warn', items: ITEMS }, content);
  assert.ok(nonce);
  await s.send({ t: 'hello' }, dialog);
  for (const bad of ['pseudonym', 'notsensitive', 'ok', 'show']) assert.deepEqual(await s.send({ t: 'decide', choice: bad, confirmed: true }, dialog), { ok: false }, bad);
  assert.deepEqual(await s.send({ t: 'decide', choice: 'override' }, dialog), { ok: false }, 'Trotzdem nur bestaetigt');
  assert.deepEqual(await s.send({ t: 'decide', choice: 'redact' }, dialog), { ok: true });
  assert.deepEqual(s.sent.pop().msg, { t: 'decision', nonce, choice: 'redact' });

  await s.send({ t: 'found', mode: 'imagefail', action: 'warn', items: [], reason: '<b>x' }, content);
  const h = await s.send({ t: 'hello' }, dialog);
  assert.equal(h.reason, 'fail', 'unbekannter Grund -> fail');
  assert.deepEqual(await s.send({ t: 'decide', choice: 'redact' }, dialog), { ok: false });
  assert.deepEqual(await s.send({ t: 'decide', choice: 'override', confirmed: true }, dialog), { ok: true });

  await s.send({ t: 'found', mode: 'imagefail', action: 'warn', items: [], reason: 'timeout' }, content);
  assert.equal((await s.send({ t: 'hello' }, dialog)).reason, 'timeout');
  await s.send({ t: 'decide', choice: 'cancel' }, dialog);

  // Pruefleiste ohne Entscheidung zu: nicht als "Abbrechen" gezaehlt
  const before = JSON.stringify(s.store.local['dlx.stats']);
  await s.send({ t: 'found', mode: 'imagewait', action: 'warn', items: [] }, content);
  await s.send({ t: 'cancelPending' }, content);
  assert.equal(JSON.stringify(s.store.local['dlx.stats']), before);
});

// Design-Review Leiste/Hoehe 15.10.2026, Auflagen 1-5 und 10
test('Hoehe der Leiste: nur Ganzzahl 56..240 vom gebundenen Leisten-Frame, Nonce vom Service Worker, hoechstens 10 je Sekunde', async () => {
  const { send, sent } = setup();
  const { nonce } = await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS, layout: 'bar' }, { ...content, documentId: 'DOC-KI' });
  assert.equal(await send({ t: 'size', h: 100 }, dialog), null, 'vor dem ersten hello ist kein Frame gebunden');
  await send({ t: 'hello' }, { ...dialog, documentId: 'DOC-F' });
  sent.length = 0;
  for (const h of [55, 241, 1.5, '80', null, NaN]) assert.equal(await send({ t: 'size', h }, { ...dialog, documentId: 'DOC-F' }), null, String(h));
  assert.deepEqual(await send({ t: 'size', h: 120 }, { ...dialog, frameId: 8, documentId: 'DOC-F' }), { gone: true }, 'anderer Frame');
  assert.equal(await send({ t: 'size', h: 120 }, { ...dialog, documentId: 'DOC-X' }), null, 'anderes Dokument');
  assert.equal(await send({ t: 'size', h: 120 }, { ...dialog, documentId: 'DOC-F', url: 'chrome-extension://testid/ui/dialog.html?x=1' }), null, 'URL mit Query');
  assert.equal(await send({ t: 'size', h: 120 }, { ...content, documentId: 'DOC-KI' }), null, 'Content Script');
  assert.equal(sent.length, 0);
  assert.deepEqual(await send({ t: 'size', h: 144, nonce: 'fremd' }, { ...dialog, documentId: 'DOC-F' }), { ok: true });
  assert.deepEqual(sent.pop(), { tab: 5, msg: { t: 'dlgSize', nonce, h: 144 }, opt: { documentId: 'DOC-KI' } }, 'Nonce der gebundenen Meldung, nur an das KI-Dokument');
  for (let i = 0; i < 12; i++) await send({ t: 'size', h: 56 + i }, { ...dialog, documentId: 'DOC-F' });
  assert.equal(sent.length, 9, 'hoechstens 10 je Sekunde und Meldung');
});

test('Hoehe der Leiste: nie vom Rueckfall-Popup und nie bei Vollbild', async () => {
  const { send, sent } = setup();
  await send({ t: 'found', mode: 'paste', action: 'warn', items: ITEMS, layout: 'bar' }, content);
  await send({ t: 'fallback' }, content);
  const popup = { id: 'testid', tab: { id: 99 }, frameId: 0, origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/dialog.html' };
  await send({ t: 'hello' }, popup);
  sent.length = 0;
  assert.equal(await send({ t: 'size', h: 100 }, popup), null);
  const full = setup();
  await full.send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS, layout: 'full' }, content);
  await full.send({ t: 'hello' }, dialog);
  full.sent.length = 0;
  assert.equal(await full.send({ t: 'size', h: 100 }, dialog), null);
  assert.equal(sent.length + full.sent.length, 0);
});

test('Hoehe der Leiste: Absender-URL gegen die feste Herkunft, nie gegen getURL (use_dynamic_url liefert im Service Worker eine andere Adresse)', () => {
  const src = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  const block = src.slice(src.indexOf("if (msg.t === 'size')"), src.indexOf("chrome.tabs.sendMessage(r.aiTab, { t: 'dlgSize'"));
  assert.match(block, /sender\.url !== OWN_ORIGIN \+ '\/ui\/dialog\.html'/);
  assert.doesNotMatch(block, /getURL/);
});

// Design-Review Code und Bilder 16.10.2026, Auflage 5: Zeilennummern nur geprueft, sonst
// verworfen (der Fund bleibt); keine weiteren Felder, kein Wert.
test('Code-Zeilennummern: nur 1-5 ganze Zahlen 1..100000, sonst verworfen', async () => {
  const { send, store } = setup();
  const items = [
    { id: 'aws_akid', cat: 'technik', n: 1, lines: [3, 12] },
    { id: 'internal_host', cat: 'technik', n: 1, lines: [1, 2, 3, 4, 5, 6], value: 'srv1.corp' },
    { id: 'iban', cat: 'finanz', n: 1, lines: ['3'] },
    { id: 'jwt', cat: 'technik', n: 1, lines: [0] },
    { id: 'pem_private', cat: 'technik', n: 1, lines: [100001] },
    { id: 'email', cat: 'kontakt', n: 1, lines: [1.5] },
  ];
  await send({ t: 'found', mode: 'paste', action: 'warn', items, code: true }, content);
  const p = store.session['dlx.pending']['5'];
  assert.deepEqual(p.items, [{ id: 'aws_akid', cat: 'technik', n: 1, lines: [3, 12] }, { id: 'internal_host', cat: 'technik', n: 1 },
    { id: 'iban', cat: 'finanz', n: 1 }, { id: 'jwt', cat: 'technik', n: 1 }, { id: 'pem_private', cat: 'technik', n: 1 }, { id: 'email', cat: 'kontakt', n: 1 }]);
  assert.equal(p.code, true);
  const hello = await send({ t: 'hello' }, dialog);
  assert.equal(hello.code, true);
  assert.deepEqual(hello.items[0].lines, [3, 12]);
  assert.ok(!JSON.stringify(store.session).includes('srv1.corp'));
  // Ohne gueltige Zeilen kein Code-Hinweis.
  const b = setup();
  await b.send({ t: 'found', mode: 'paste', action: 'warn', items: [{ id: 'iban', cat: 'finanz', n: 1 }], code: true }, content);
  assert.equal(b.store.session['dlx.pending']['5'].code, false);
});

// --- KI-Antworten pruefen und Zwischenablage-Schutz (Design-Review Antwort/Zwischenablage 16.10.2026) ---
const bank = { id: 'testid', tab: { id: 8 }, frameId: 0, origin: 'https://bank.example.com', url: 'https://bank.example.com/konto', documentLifecycle: 'active' };
const SH1 = 'a'.repeat(64), SH2 = 'b'.repeat(64);

test('Quellen: quelle.js nur fuer konfigurierte UND erteilte Origins, zuerst abmelden, Rest-Rechte zurueckgegeben (Auflage 9)', async () => {
  const { store, perm, scripts, events } = setup({ sensitiveSources: ['bank.example.com', '*.hr.example.com'] });
  perm.origins.push('https://bank.example.com/*', 'https://alt.example.org/*', 'https://claude.ai/*', 'https://chatgpt.com/*');
  events.installed(); await tick();
  assert.equal(scripts.filter((x) => x.id === 'dlx-quelle').length, 1);
  const s = scripts.find((x) => x.id === 'dlx-quelle');
  assert.deepEqual([s.js, s.runAt, s.world, s.allFrames], [['common/quellen.js', 'content/quelle.js'], 'document_start', 'ISOLATED', false]);
  assert.deepEqual(s.matches, ['https://bank.example.com/*'], 'nur erteilt und konfiguriert');
  assert.deepEqual(perm.removed, ['https://alt.example.org/*'], 'nicht konfiguriert -> zurueckgegeben, KI-Seiten-Rechte bleiben');
  perm.origins.push('https://*.hr.example.com/*');
  events.added(); await tick();
  assert.equal(scripts.filter((x) => x.id === 'dlx-quelle').length, 1, 'alte Registrierung vorher abgemeldet');
  assert.deepEqual(scripts.find((x) => x.id === 'dlx-quelle').matches, ['https://*.hr.example.com/*', 'https://bank.example.com/*']);
  store.managed = { sensitiveSources: [] };
  events.changed({}, 'managed'); await tick();
  assert.equal(scripts.filter((x) => x.id === 'dlx-quelle').length, 0, 'Liste leer -> abgemeldet');
  assert.ok(perm.removed.includes('https://bank.example.com/*') && perm.removed.includes('https://*.hr.example.com/*'));
});

test('Quellen: Merkmal nur von gepruefter Quelle, nur {t, hash}, Ratenbegrenzung, nur gesalzen in storage.session (Auflagen 12, 14)', async () => {
  const { store, perm, send, events } = setup({ sensitiveSources: ['bank.example.com'] });
  perm.origins.push('https://bank.example.com/*');
  events.installed(); await tick();
  assert.deepEqual(await send({ t: 'srcMark', hash: SH1 }, bank), { ok: true });
  const st = store.session['dlx.srcMarks'];
  assert.match(st.salt, /^[0-9a-f]{64}$/);
  assert.equal(st.marks.length, 1);
  assert.notEqual(st.marks[0].h, SH1, 'nie die rohe Pruefsumme');
  assert.ok(Math.abs(st.marks[0].exp - Date.now() - 30 * 60000) < 5000, '30 min');
  assert.ok(!JSON.stringify(store.local).includes(SH1) && !JSON.stringify(store.local).includes('srcMarks'), 'nie storage.local');
  const bad = [
    [{ t: 'srcMark', hash: SH2, x: 1 }, bank], [{ t: 'srcMark', hash: 'A'.repeat(64) }, bank], [{ t: 'srcMark', hash: SH2 }, { ...bank, frameId: 3 }],
    [{ t: 'srcMark', hash: SH2 }, { ...bank, documentLifecycle: 'prerender' }], [{ t: 'srcMark', hash: SH2 }, { ...bank, documentLifecycle: undefined }],
    [{ t: 'srcMark', hash: SH2 }, { ...bank, tab: undefined }], [{ t: 'srcMark', hash: SH2 }, { ...bank, id: 'fremd' }],
    [{ t: 'srcMark', hash: SH2 }, { ...bank, origin: 'https://evil.example.com', url: 'https://evil.example.com/' }],
    [{ t: 'srcMark', hash: SH2 }, { ...bank, origin: 'http://bank.example.com' }], [{ t: 'srcMark', hash: SH2 }, { ...bank, origin: 'https://bank.example.com:8443' }],
    [{ t: 'srcMark', hash: SH2 }, { ...content, documentLifecycle: 'active' }],
  ];
  for (const [m, s] of bad) assert.equal(await send(m, s), null, JSON.stringify(m) + ' ' + s.origin);
  perm.origins.splice(0);
  assert.equal(await send({ t: 'srcMark', hash: SH2 }, bank), null, 'ohne erteiltes Recht');
  perm.origins.push('https://bank.example.com/*');
  for (let i = 0; i < 12; i++) await send({ t: 'srcMark', hash: i.toString(16).padStart(64, 'c') }, bank);
  assert.equal(store.session['dlx.srcMarks'].marks.length, 10, 'hoechstens 10 je Minute');
});

test('Quellen: Abruf nur vom KI-Content-Script im Hauptframe, Push nur an KI-Tabs, Ablauf nach 30 min (Auflagen 13, 15, 25)', async () => {
  const { store, perm, send, events, sent, tabsOpen, queries } = setup({ sensitiveSources: ['bank.example.com'] });
  perm.origins.push('https://bank.example.com/*');
  events.installed(); await tick();
  tabsOpen.push({ id: 5 }, { id: 6 });
  await send({ t: 'srcMark', hash: SH1 }, bank);
  await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(queries[queries.length - 1].url)).sort(), ['https://chatgpt.com/*', 'https://claude.ai/*', 'https://copilot.cloud.microsoft/*', 'https://copilot.com/*', 'https://copilot.microsoft.com/*', 'https://gemini.google.com/*', 'https://m365.cloud.microsoft/*']);
  const push = sent.filter((x) => x.msg.t === 'srcMarks');
  assert.deepEqual(push.map((x) => [x.tab, x.opt.frameId]), [[5, 0], [6, 0]]);
  const got = await send({ t: 'srcMarks' }, content);
  assert.equal(got.salt, store.session['dlx.srcMarks'].salt);
  assert.equal(got.marks.length, 1);
  assert.ok(got.v >= 1 && got.v === push[0].msg.v, 'Versionszaehler');
  assert.equal(await send({ t: 'srcMarks' }, bank), null, 'Quellseite bekommt nichts');
  assert.equal(await send({ t: 'srcMarks' }, { ...content, frameId: 2 }), null, 'kein Unterframe');
  // Fake-Uhr: 31 Minuten spaeter ist das Merkmal weg, das Salz verworfen.
  const now = Date.now;
  Date.now = () => now() + 31 * 60000;
  try {
    const late = await send({ t: 'srcMarks' }, content);
    assert.deepEqual([late.salt, late.marks], [null, []]);
  } finally { Date.now = now; }
});

test('Quellen: Recht entzogen -> abgemeldet und Merkmale verworfen (Auflagen 9, 25)', async () => {
  const { store, perm, scripts, send, events } = setup({ sensitiveSources: ['bank.example.com'] });
  perm.origins.push('https://bank.example.com/*');
  events.installed(); await tick();
  await send({ t: 'srcMark', hash: SH1 }, bank);
  assert.equal(store.session['dlx.srcMarks'].marks.length, 1);
  perm.origins.splice(0);
  events.permRemoved(); await tick();
  assert.equal(scripts.filter((x) => x.id === 'dlx-quelle').length, 0);
  assert.deepEqual(store.session['dlx.srcMarks'].marks, []);
  assert.equal(store.session['dlx.srcMarks'].salt, null);
});

test('Einfuegen aus Quelle: Ganztext-Fund nicht schwaerzbar, Trotzdem nur bei warn + allowUserOverride; Zaehlung nur Kategorie (Auflagen 16, 19)', async () => {
  const SRC = [{ id: 'clipboard_source', cat: 'source', n: 1 }];
  const { send, store } = setup();
  await send({ t: 'found', mode: 'paste', action: 'warn', items: SRC }, content);
  assert.deepEqual((await send({ t: 'hello' }, dialog)).items, SRC);
  assert.deepEqual(await send({ t: 'decide', choice: 'redact' }, dialog), { ok: false }, 'nicht schwaerzbar');
  assert.deepEqual(await send({ t: 'decide', choice: 'override' }, dialog), { ok: false }, 'ohne Bestaetigung');
  assert.deepEqual(await send({ t: 'decide', choice: 'override', confirmed: true }, dialog), { ok: true });
  const stats = JSON.stringify(store.local['dlx.stats']);
  assert.ok(stats.includes('"source"') && !stats.includes('bank'), stats);
  await send({ t: 'found', mode: 'paste', action: 'block', items: SRC }, content);
  assert.deepEqual(await send({ t: 'decide', choice: 'override', confirmed: true }, dialog), { ok: false }, 'block: nur OK');
  assert.deepEqual(await send({ t: 'decide', choice: 'cancel' }, dialog), { ok: true });
  const b = setup({ allowUserOverride: false });
  await b.send({ t: 'found', mode: 'paste', action: 'warn', items: SRC }, content);
  assert.deepEqual(await b.send({ t: 'decide', choice: 'override', confirmed: true }, dialog), { ok: false }, 'ohne allowUserOverride');
});

test('Antwort-Hinweis: nur Leiste, nur Ausblenden, Grund nur "copy", Richtlinie off = keiner, keine Zaehlung (Auflagen 3, 5)', async () => {
  const { send, store } = setup();
  assert.equal(await send({ t: 'found', mode: 'answer', action: 'warn', items: ITEMS, layout: 'full' }, content), null, 'nur Leiste');
  await send({ t: 'found', mode: 'answer', action: 'block', items: ITEMS, layout: 'bar', reason: 'copy' }, content);
  const h = await send({ t: 'hello' }, dialog);
  assert.deepEqual([h.mode, h.action, h.reason], ['answer', 'warn', 'copy']);
  for (const c of ['redact', 'cancel', 'override', 'show']) assert.deepEqual(await send({ t: 'decide', choice: c, confirmed: true }, dialog), { ok: false }, c);
  assert.deepEqual(await send({ t: 'decide', choice: 'hide' }, dialog), { ok: true });
  assert.equal(store.local['dlx.stats'], undefined, 'nicht gezaehlt');
  await send({ t: 'found', mode: 'answer', action: 'warn', items: ITEMS, layout: 'bar', reason: '<b>x</b>' }, content);
  assert.equal((await send({ t: 'hello' }, dialog)).reason, null);
  await send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  assert.equal(await send({ t: 'found', mode: 'answer', action: 'warn', items: ITEMS, layout: 'bar' }, content), null, 'verdraengt nie eine Sende-Meldung');
  const off = setup({ answerCheck: 'off' });
  assert.equal(await off.send({ t: 'found', mode: 'answer', action: 'warn', items: ITEMS, layout: 'bar' }, content), null);
  const c = (await send({ t: 'cfg' }, content)).cfg;
  assert.ok(!('sensitiveSources' in c) && c.answerCheck === 'hint', 'Quellenliste nie an Content Scripts');
});

test('Quellen: Breitmuster nie registriert oder behalten, Merkmal von solchen Hosts abgewiesen (Pflicht-Pruefung 16.10.2026)', async () => {
  const { store, perm, scripts, send, events } = setup({});
  store.local['dlx.settings'] = { sensitiveSources: ['*', '*.com', 'https://*/*', 'localhost', '*.co.uk'], copySidebarHint: false };
  perm.origins.push('https://*/*', 'https://*.com/*', 'https://localhost/*', 'https://*.co.uk/*');
  events.installed(); await tick();
  assert.equal(scripts.filter((x) => x.id === 'dlx-quelle').length, 0, 'kein Skript');
  assert.deepEqual(perm.removed.slice().sort(), ['https://*.co.uk/*', 'https://*.com/*', 'https://*/*', 'https://localhost/*'], 'alle Breitrechte zurueckgegeben');
  for (const origin of ['https://localhost', 'https://com', 'https://x.com', 'https://a.co.uk'])
    assert.equal(await send({ t: 'srcMark', hash: 'e'.repeat(64) }, { ...bank, origin, url: origin + '/' }), null, origin);
  assert.equal(store.session['dlx.srcMarks'], undefined, 'kein Merkmal');
  // Riegel im Service Worker selbst, unabhaengig von common/quellen.js.
  const src = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  assert.match(src, /DLX\.quellen\.originsOf\(cfg\.sensitiveSources\)\.filter\(srcOriginOk\)/);
  assert.match(src, /DLX\.quellen\.originsOf\(cfg\.formGuardSites \|\| \[\]\)\.filter\(srcOriginOk\)/, 'Formularwache: gleicher Riegel (Auflage 12)');
  const re = new RegExp(/const SRC_ORIGIN = (\/.+\/);/.exec(src)[1].slice(1, -1));
  for (const bad of ['https://*/*', 'https://*.com/*', 'https://localhost/*', 'https://*.*.example.com/*', 'http://bank.example.com/*', 'https://bank.example.com:8443/*', 'https://192.0.2.1/*'])
    assert.equal(re.test(bad), false, bad);
  for (const ok of ['https://bank.example.com/*', 'https://*.hr.example.com/*', 'https://bank.example/*']) assert.ok(re.test(ok), ok);
});

// --- Formularwache (Design-Review KI-Agenten 16.10.2026, Auflagen 7-13) ----------
test('Formularwache: Skript nur fuer konfigurierte UND erteilte Seiten, Hauptframe, abgemeldet bei Entzug (Auflage 12)', async () => {
  const { store, perm, scripts, events } = setup({});
  store.local['dlx.settings'] = { formGuardSites: ['portal.example.com', 'shop.example.org'] };
  perm.origins.push('https://portal.example.com/*');
  events.installed(); await tick();
  const f = scripts.filter((x) => x.id === 'dlx-formwache');
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].matches, f[0].allFrames, f[0].matchOriginAsFallback, f[0].world, f[0].js.at(-1)],
    [['https://portal.example.com/*'], false, false, 'ISOLATED', 'content/formwache.js']);
  assert.equal(perm.removed.length, 0, 'Recht der Formularseite bleibt');
  perm.origins.splice(0);
  events.permRemoved(); await tick();
  assert.equal(scripts.filter((x) => x.id === 'dlx-formwache').length, 0, 'Entzug -> abgemeldet');
  store.local['dlx.settings'] = { formGuardSites: ['*', '*.com', 'localhost'] };
  perm.origins.push('https://*/*', 'https://*.com/*');
  events.installed(); await tick();
  assert.equal(scripts.filter((x) => x.id === 'dlx-formwache').length, 0, 'Breitmuster nie');
});

test('Formularwache: ein Fenster je Tab, Rate, Entscheid nur von der eigenen Seite mit Nonce, Durchlass nur an Tab/Frame 0/Dokument (Auflagen 7, 8, 10)', async () => {
  const { store, perm, send, sent } = setup({});
  store.local['dlx.settings'] = { formGuardSites: ['portal.example.com'] };
  perm.origins.push('https://portal.example.com/*');
  const page = { id: 'testid', tab: { id: 5 }, frameId: 0, documentId: 'D1', documentLifecycle: 'active', origin: 'https://portal.example.com', url: 'https://portal.example.com/f' };
  const c = (await send({ t: 'formCfg' }, page)).cfg;
  assert.ok(c && !('formGuardSites' in c) && !('sensitiveSources' in c), 'Konfiguration ohne Listen');
  assert.equal(await send({ t: 'formCfg' }, { ...page, origin: 'https://other.example.com' }), null, 'nicht konfiguriert');
  assert.equal(await send({ t: 'formFound', items: ITEMS }, { ...page, frameId: 1 }), null, 'nur Hauptframe');
  assert.equal(await send({ t: 'formFound', items: [{ id: 'x', cat: 'y', n: 1 }] }, page), null, 'nur bekannte Typen');
  assert.equal(await send({ t: 'formFound', items: ITEMS, text: 'Wert' }, page), null, 'keine Zusatzfelder');
  const r = await send({ t: 'formFound', items: ITEMS }, page);
  assert.match(r.nonce, /^[0-9a-f]{32}$/);
  assert.deepEqual(await send({ t: 'formFound', items: ITEMS }, { ...page, documentId: 'D2' }), { busy: true }, 'hoechstens ein Fenster je Tab');
  const popup = { id: 'testid', origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/formwache.html?n=' + r.nonce };
  const info = await send({ t: 'formInfo', n: r.nonce }, popup);
  assert.deepEqual([info.host, info.items, info.allowOverride], ['portal.example.com', ITEMS, true]);
  const other = 'a'.repeat(32);
  assert.equal(await send({ t: 'formDecide', n: r.nonce, choice: 'override' }, page), null, 'Content Script (gleiche sender.id) nie');
  assert.equal(await send({ t: 'formDecide', n: r.nonce, choice: 'override' }, { ...popup, url: popup.url.replace(r.nonce, other) }), null, 'URL passt nicht zur Nonce');
  assert.equal(await send({ t: 'formDecide', n: other, choice: 'override' }, { ...popup, url: popup.url.replace(r.nonce, other) }), null, 'unbekannte Nonce');
  assert.equal(sent.filter((x) => x.msg.t === 'formPass').length, 0);
  assert.deepEqual(await send({ t: 'formDecide', n: r.nonce, choice: 'override' }, popup), { ok: true });
  assert.deepEqual(sent.filter((x) => x.msg.t === 'formPass'), [{ tab: 5, msg: { t: 'formPass', n: r.nonce }, opt: { frameId: 0, documentId: 'D1' } }]);
  assert.equal(await send({ t: 'formDecide', n: r.nonce, choice: 'override' }, popup), null, 'einmalig');
  assert.deepEqual(await send({ t: 'formFound', items: ITEMS }, page), { busy: true }, 'hoechstens alle 3 s');
  const m = setup({ allowUserOverride: false, formGuardSites: ['portal.example.com'] });
  m.perm.origins.push('https://portal.example.com/*');
  const r2 = await m.send({ t: 'formFound', items: ITEMS }, page);
  const pop2 = { ...popup, url: popup.url.replace(r.nonce, r2.nonce) };
  assert.equal((await m.send({ t: 'formInfo', n: r2.nonce }, pop2)).allowOverride, false);
  await m.send({ t: 'formDecide', n: r2.nonce, choice: 'override' }, pop2);
  assert.equal(m.sent.filter((x) => x.msg.t === 'formPass').length, 0, 'allowUserOverride=false: nie Durchlass');
});

// Sicher umformulieren (Design-Review Tabellen/Verschleierung/Umformen 16.10.2026, Auflage 13).
test('Umformulieren: rephrase nur bei send/paste, nicht bei Sperre, nur mit allowRephrase; Leiste rephrased nur undo/hide', async () => {
  const a = setup();
  await a.send({ t: 'found', mode: 'send', action: 'warn', items: ITEMS }, content);
  assert.equal((await a.send({ t: 'hello' }, dialog)).allowRephrase, true);
  assert.deepEqual(await a.send({ t: 'decide', choice: 'rephrase' }, dialog), { ok: true });
  await a.send({ t: 'found', mode: 'rephrased', action: 'warn', items: ITEMS, layout: 'bar', reason: 'paste' }, content);
  assert.equal((await a.send({ t: 'hello' }, dialog)).reason, 'paste');
  for (const bad of ['redact', 'pseudonym', 'override', 'rephrase']) assert.deepEqual(await a.send({ t: 'decide', choice: bad, confirmed: true }, dialog), { ok: false }, bad);
  assert.deepEqual(await a.send({ t: 'decide', choice: 'undo' }, dialog), { ok: true });
  const off = setup({ allowRephrase: false });
  await off.send({ t: 'found', mode: 'paste', action: 'warn', items: ITEMS }, content);
  assert.equal((await off.send({ t: 'hello' }, dialog)).allowRephrase, false);
  assert.deepEqual(await off.send({ t: 'decide', choice: 'rephrase' }, dialog), { ok: false }, 'Richtlinie aus');
  assert.equal(await off.send({ t: 'found', mode: 'rephrased', action: 'warn', items: ITEMS, layout: 'bar' }, content), null, 'Richtlinie aus: keine Leiste');
  const blk = setup();
  await blk.send({ t: 'found', mode: 'send', action: 'block', items: ITEMS }, content);
  assert.deepEqual(await blk.send({ t: 'decide', choice: 'rephrase' }, dialog), { ok: false }, 'block: nie umformulieren');
  const img = setup();
  await img.send({ t: 'found', mode: 'image', action: 'warn', items: ITEMS }, content);
  assert.deepEqual(await img.send({ t: 'decide', choice: 'rephrase' }, dialog), { ok: false }, 'nur send/paste');
});

// --- Kopierwache (Design-Review Kopierwarnung 16.10.2026, docs/sicherheit/design-review-kopierwarnung.md) ---
const notes = { id: 'testid', tab: { id: 5 }, frameId: 0, documentId: 'd1', documentLifecycle: 'active', origin: 'https://notes.example.com', url: 'https://notes.example.com/a' };
const ALL = 'https://*/*';

test('Kopierwache: nur mit Einstellung UND erteiltem https://*/*, ohne die statischen KI-Seiten, Hauptframe (Auflagen 2, 10)', async () => {
  const { perm, scripts, events } = setup({});
  events.installed(); await tick();
  assert.equal(scripts.filter((x) => x.id === 'dlx-kopierwache').length, 0, 'ohne Recht kein Skript');
  perm.origins.push(ALL);
  events.added(); await tick();
  const k = scripts.filter((x) => x.id === 'dlx-kopierwache');
  assert.equal(k.length, 1);
  const fixed = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).content_scripts.flatMap((c) => c.matches);
  assert.deepEqual([k[0].matches, k[0].allFrames, k[0].matchOriginAsFallback, k[0].world, k[0].js, k[0].persistAcrossSessions], [[ALL], false, false, 'ISOLATED', ['content/kopierwache.js'], false]);
  assert.deepEqual(k[0].excludeMatches, [...new Set(fixed)], 'genau die Muster des statischen Content Scripts');
  assert.equal(perm.removed.length, 0, 'Recht bleibt, solange die Einstellung an ist');
  perm.origins.splice(0);
  events.permRemoved(); await tick();
  assert.equal(scripts.filter((x) => x.id === 'dlx-kopierwache').length, 0, 'Entzug -> abgemeldet');
});

test('Kopierwache: ausgeschaltet (Benutzer oder Richtlinie) -> Recht zurueck, Skript abgemeldet, auch bei onAdded (Auflagen 2, 14)', async () => {
  const a = setup({});
  a.perm.origins.push(ALL);
  a.events.installed(); await tick();
  assert.equal(a.scripts.filter((x) => x.id === 'dlx-kopierwache').length, 1);
  a.store.local['dlx.settings'] = { copySidebarHint: false };
  a.events.changed({ 'dlx.settings': {} }, 'local'); await tick();
  assert.deepEqual(a.perm.removed, [ALL]);
  assert.equal(a.scripts.filter((x) => x.id === 'dlx-kopierwache').length, 0);
  a.perm.origins.push(ALL);
  a.events.added(); await tick();
  assert.deepEqual(a.perm.removed, [ALL, ALL], 'bei ausgeschalteter Einstellung sofort zurueck');
  const m = setup({ copySidebarHint: false });
  m.store.local['dlx.settings'] = { copySidebarHint: true };
  m.perm.origins.push(ALL);
  m.events.startup(); await tick();
  assert.deepEqual(m.perm.removed, [ALL], 'Richtlinie geht vor');
  assert.equal(m.scripts.filter((x) => x.id === 'dlx-kopierwache').length, 0);
  assert.equal(await m.send({ t: 'copyScan' }, notes), null);
});

test('Kopierwache: Breitbandrecht erteilt -> Formularwache und Quellen bleiben auf den konfigurierten Seiten (Auflage 1)', async () => {
  const { store, perm, scripts, events, send } = setup({});
  store.local['dlx.settings'] = { formGuardSites: ['portal.example.com'], sensitiveSources: ['bank.example.com'] };
  perm.origins.push(ALL);
  events.installed(); await tick();
  assert.equal(scripts.filter((x) => x.id === 'dlx-formwache' || x.id === 'dlx-quelle').length, 0, 'ohne eigenes Recht der Seite nie aktiv');
  perm.origins.push('https://portal.example.com/*');
  events.added(); await tick();
  assert.deepEqual(scripts.filter((x) => x.id === 'dlx-formwache').map((x) => x.matches), [['https://portal.example.com/*']]);
  assert.equal(await send({ t: 'formCfg' }, { ...notes, origin: 'https://other.example.com', url: 'https://other.example.com/' }), null, 'Formularwache nicht auf fremder Seite');
  assert.equal(await send({ t: 'srcMark', hash: 'e'.repeat(64) }, { ...notes, origin: 'https://other.example.com', url: 'https://other.example.com/' }), null, 'kein Merkmal von fremder Seite');
});

test('Kopierwache: copyScan nur genau {t} vom Hauptframe einer https-Seite, Engine einmal je Dokument, Rate, nur Noetiges (Auflagen 5, 6, 7, 14)', async () => {
  const { store, perm, send, inject } = setup({ customTerms: { salt: 's'.repeat(16), hashes: ['a'.repeat(64)] } });
  store.local['dlx.settings'] = { formGuardSites: ['portal.example.com'] };
  assert.equal(await send({ t: 'copyScan' }, notes), null, 'ohne Recht nichts');
  perm.origins.push(ALL);
  for (const [bad, why] of [[{ ...notes, frameId: 2 }, 'iframe'], [{ ...notes, origin: 'http://notes.example.com', url: 'http://notes.example.com/a' }, 'http'],
    [{ ...notes, origin: 'https://evil.example.com' }, 'Origin passt nicht zur URL'], [{ ...notes, documentLifecycle: 'prerender' }, 'nicht aktiv'],
    [{ ...notes, documentId: undefined }, 'ohne Dokument'], [{ ...notes, id: 'fremd' }, 'fremde Erweiterung'], [{ ...notes, tab: undefined }, 'ohne Tab'],
    [{ ...notes, origin: 'https://www.perplexity.ai', url: 'https://www.perplexity.ai/' }, 'KI-Seite']]) assert.equal(await send({ t: 'copyScan' }, bad), null, why);
  assert.equal(await send({ t: 'copyScan', text: 'x' }, notes), null, 'nur der Schluessel t');
  assert.equal(inject.calls.length, 0);
  const r = await send({ t: 'copyScan' }, notes);
  assert.ok(r && r.cfg && r.product === 'AImori');
  for (const k of ['customTerms', 'userTerms', 'dictionary', 'documentFingerprints', 'formGuardSites', 'sensitiveSources', 'aiSiteMode', 'branding']) assert.ok(!(k in r.cfg), k);
  assert.deepEqual(inject.calls.map((c) => [c.target, !!c.func, c.files ? c.files.at(-1) : null]),
    [[{ tabId: 5, documentIds: ['d1'] }, true, null], [{ tabId: 5, documentIds: ['d1'] }, false, 'common/i18n.js']]);
  assert.ok(!inject.calls[1].files.includes('content/formwache.js'));
  assert.equal(await send({ t: 'copyScan' }, notes), null, 'Rate: hoechstens 1 je 2 s je Tab');
  const again = await send({ t: 'copyScan' }, { ...notes, tab: { id: 6 } });
  assert.ok(again && again.cfg);
  assert.equal(inject.calls.length, 2, 'Engine je Dokument nur einmal');
  inject.fail = true;
  assert.equal(await send({ t: 'copyScan' }, { ...notes, tab: { id: 7 }, documentId: 'd2' }), null, 'Fehler beim Laden: still');
});

test('Kopierwache: Quelltext liest nur die Auswahl, kein Netz/Speicher/postMessage, neutrales Element (Auflagen 8, 9)', () => {
  const src = fs.readFileSync(path.join(EXT, 'content', 'kopierwache.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  for (const bad of [/clipboardData/, /navigator\.clipboard/, /postMessage/, /fetch\(/, /XMLHttpRequest/, /chrome\.storage/, /localStorage/, /innerHTML/, /setAttribute\('style'/, /\.id = /, /className/, /aimori|dlx-/i, /preventDefault|stopPropagation/, /<a\b|createElement\('a'\)|createElement\('input'\)/])
    assert.ok(!bad.test(src), String(bad));
  assert.deepEqual(src.match(/sendMessage\([^)]*\)/g), ["sendMessage({ t: 'copyScan' })"]);
  assert.match(src, /attachShadow\(\{ mode: 'closed' \}\)/);
  assert.match(src, /setTimeout\(\(\) => \{ text = null; \}, WAIT_MS\)/);
});

// --- Lokale KI vorladen, Live-Status (Design-Review KI vorladen 16.10.2026, docs/sicherheit/design-review-ki-vorladen.md) ---
const popupPage = { id: 'testid', origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/popup.html' };
const offscreenDoc = { id: 'testid', origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/ocr.html' };
const until = async (f) => { for (let i = 0; i < 400; i++) { if (f()) return true; await new Promise((r) => setTimeout(r, 5)); } return false; };

test('KI vorladen: Abfrage aus Popup/Einstellungen laedt ohne Text, laedt -> bereit, ein Lauf zugleich (Auflagen 1, 2, 5)', async () => {
  const s = setup();
  let release = null;
  s.replies.ki = (m) => (m.t === 'load' ? new Promise((r) => { release = () => r({ ok: true, ep: 'wasm' }); }) : Promise.resolve({ ok: true }));
  // Content Scripts loesen nie ein Laden aus.
  assert.equal(await s.send({ t: 'kiStatus' }, content), null);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(s.broadcast.filter((x) => x.target === 'dlx-ki').length, 0);
  await s.send({ t: 'kiStatus' }, popupPage);
  assert.ok(await until(() => release), 'Laden gestartet');
  const st = await s.send({ t: 'kiStatus' }, options);
  assert.equal(st.state, 'laedt');
  assert.equal(st.p, 0);
  assert.equal(s.broadcast.filter((x) => x.t === 'load').length, 1, 'ein Lauf zugleich');
  const m = s.broadcast.find((x) => x.t === 'load');
  assert.deepEqual(Object.keys(m).sort(), ['gpu', 't', 'target'], 'kein Text beim Vorladen');
  assert.equal(m.gpu, false);
  release();
  assert.ok(await until(() => s.store.session.kiStatus.state === 'bereit'));
  assert.deepEqual(s.store.session.kiStatus, { state: 'bereit', ep: 'wasm', fails: 0 });
  await s.send({ t: 'kiStatus' }, popupPage);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(s.broadcast.filter((x) => x.t === 'load').length, 1, 'bereit = kein neues Laden');
});

test('KI vorladen: Fortschritt nur vom eigenen Offscreen-Dokument, nur steigend in 5-%-Schritten, nur waehrend laedt (Auflage 3)', async () => {
  const s = setup();
  let release = null;
  s.replies.ki = (m) => (m.t === 'load' ? new Promise((r) => { release = () => r({ ok: true, ep: 'wasm' }); }) : Promise.resolve({ ok: true }));
  assert.equal(await s.send({ t: 'kiFortschritt', p: 30 }, offscreenDoc), null, 'vor dem Laden verworfen');
  await s.send({ t: 'kiStatus' }, popupPage);
  assert.ok(await until(() => release));
  assert.deepEqual(await s.send({ t: 'kiFortschritt', p: 30 }, offscreenDoc), { ok: true });
  assert.equal(s.store.session.kiStatus.p, 30);
  for (const [p, who] of [[32, offscreenDoc], [20, offscreenDoc], ['50', offscreenDoc], [101, offscreenDoc], [1.5, offscreenDoc], [60, content], [60, popupPage], [60, { ...offscreenDoc, tab: { id: 5 } }], [60, { ...offscreenDoc, id: 'fremd' }], [60, { ...offscreenDoc, origin: 'https://chatgpt.com' }]]) {
    assert.equal(await s.send({ t: 'kiFortschritt', p }, who), null, JSON.stringify([p, who.url]));
  }
  assert.equal(s.store.session.kiStatus.p, 30);
  release();
  assert.ok(await until(() => s.store.session.kiStatus.state === 'bereit'));
  assert.equal(await s.send({ t: 'kiFortschritt', p: 90 }, offscreenDoc), null, 'nach dem Laden verworfen');
  assert.ok(!('p' in s.store.session.kiStatus));
});

test('KI vorladen: Fehler mit festem Grund, danach kein Laden; aus = nie; 2 Fehler = nie; abgelaufene Ladezeit = fehler/zeit (Auflagen 4-6)', async () => {
  const s = setup();
  s.replies.ki = async (m) => (m.t === 'load' ? { error: 'paket' } : { ok: true });
  await s.send({ t: 'kiStatus' }, popupPage);
  assert.ok(await until(() => s.store.session.kiStatus && s.store.session.kiStatus.state === 'fehler'));
  assert.deepEqual(s.store.session.kiStatus, { state: 'fehler', ep: null, fails: 1, grund: 'paket' });
  assert.ok(s.broadcast.some((x) => x.t === 'stop'), 'Worker beendet');
  assert.deepEqual(await s.send({ t: 'kiStatus' }, popupPage), { state: 'fehler', ep: null, fails: 1, grund: 'paket' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(s.broadcast.filter((x) => x.t === 'load').length, 1, 'fehler = kein weiteres Vorladen');
  // Fremde Gruende werden nie uebernommen.
  const f = setup();
  f.replies.ki = async (m) => (m.t === 'load' ? { error: '<b>x</b>' } : { ok: true });
  await f.send({ t: 'kiStatus' }, popupPage);
  assert.ok(await until(() => f.store.session.kiStatus && f.store.session.kiStatus.state === 'fehler'));
  assert.equal(f.store.session.kiStatus.grund, 'laden');
  // Erkennung aus: nie laden.
  const a = setup();
  a.store.local['dlx.settings'] = { detection: 'regeln' };
  a.replies.ki = async () => ({ ok: true, ep: 'wasm' });
  assert.equal((await a.send({ t: 'kiStatus' }, popupPage)).state, 'aus');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(a.broadcast.filter((x) => x.target === 'dlx-ki').length, 0);
  // Nach 2 Fehlern nie.
  const z = setup();
  z.store.session.kiStatus = { state: 'fehler', ep: null, fails: 2, grund: 'laden' };
  z.replies.ki = async () => ({ ok: true, ep: 'wasm' });
  await z.send({ t: 'kiStatus' }, popupPage);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(z.broadcast.filter((x) => x.target === 'dlx-ki').length, 0);
  // Service Worker mitten im Laden beendet: abgelaufene Grenze gegen jetzt geprueft.
  const t = setup();
  t.store.session.kiStatus = { state: 'laedt', ep: null, fails: 0, p: 40, t0: Date.now() - 120000 };
  t.replies.ki = async () => ({ ok: true, ep: 'wasm' });
  assert.deepEqual(await t.send({ t: 'kiStatus' }, popupPage), { state: 'fehler', ep: null, fails: 1, grund: 'zeit' });
});

test('KI vorladen: beim Start und Installieren eingeplant, Status nur ueber kiSetStatus, Zugriffsstufe nie geoeffnet (Auflagen 4, 5)', () => {
  const bg = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  assert.match(bg, /chrome\.runtime\.onStartup\.addListener\(\(\) => \{[^\n]*kiLater\(\); \}\);/);
  assert.match(bg, /chrome\.runtime\.onInstalled\.addListener\(\(\) => \{[^\n]*kiLater\(\); \}\);/);
  assert.equal((bg.match(/chrome\.storage\.session\.set\(\{ \[KI_STATUS_KEY\]/g) || []).length, 1, 'ein Schreibweg');
  assert.ok(!/setAccessLevel/.test(bg));
  assert.match(bg, /if \(msg\.t === 'kiFortschritt'\) return fromExtPage\(sender, '\/' \+ OCR_DOC\) && !sender\.tab \? kiProgress\(msg\) : null;/);
});
