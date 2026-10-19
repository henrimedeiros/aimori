// Datei-Uploads (Design-Review Datei-Uploads 17.10.2026, docs/sicherheit/design-review-datei-uploads-17-10.md):
// Beispieldateien mit IBAN/AHV loesen dieselben Erkenner wie beim Tippen aus, saubere nicht;
// Stueckgrenzen, Zeitbudget, Service-Worker-Weg ins Offscreen-Dokument.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto, { webcrypto } from 'node:crypto';
import { load, ENGINE_FILES, EXT } from './helpers/load.mjs';
import { beispieldateien, IBAN, AHV } from './helpers/beispieldateien.mjs';

const DLX = load([...ENGINE_FILES, 'engine/datei.js', 'engine/stuecke.js', 'common/quellen.js', 'common/policy.js'],
  { TextDecoder, DecompressionStream, Uint8Array, setTimeout, URL });
const eng = DLX.policy.engineConfig(DLX.policy.defaults('de-CH'));
// Wie detect() in content/content.js: Regel-Erkenner je Stueck.
const detect = (part) => { const r = DLX.engine.scan(part, eng); return { findings: Array.from(r.findings), unscannable: r.unscannable }; };

// Text holen wie im Content Script: TXT/CSV als Text, XLSX ueber engine/tabelle.js, PDF/DOCX ueber engine/datei.js.
async function textOf(f) {
  if (f.ext === 'txt' || f.ext === 'csv') return Buffer.from(f.bytes).toString('utf8');
  if (f.ext === 'xlsx') return (await DLX.tabelle.xlsx(f.bytes.buffer, {})).text;
  return (await DLX.datei.extract(f.bytes, DLX.datei.kindOf(f.name, f.type))).text;
}

test('Beispieldateien: TXT, CSV, PDF, DOCX, XLSX mit IBAN/AHV loesen aus, saubere nicht', async () => {
  const files = beispieldateien();
  assert.equal(files.length, 10);
  for (const f of files) {
    const text = await textOf(f);
    const r = await DLX.stuecke.scan(text, detect);
    const ids = new Set(r.findings.map((x) => x.id));
    assert.equal(r.unscannable, false, f.name);
    if (f.heikel) {
      assert.ok(ids.has('iban'), f.name + ': IBAN');
      assert.ok(ids.has('ch_ahv'), f.name + ': AHV');
    } else assert.deepEqual([...ids], [], f.name);
  }
});

test('Art: PDF und DOCX per Endung oder MIME-Typ, alte Formate nicht', () => {
  for (const f of beispieldateien()) assert.equal(DLX.datei.kindOf(f.name, ''), f.ext === 'txt' || f.ext === 'csv' ? 'text' : f.ext, f.name);
  assert.equal(DLX.datei.kindOf('x', 'application/pdf'), 'pdf');
  assert.equal(DLX.datei.kindOf('alt.doc', 'application/msword'), null);
});

test('Stuecke: IBAN genau auf der Stueckgrenze zaehlt einmal, Ueberlappung doppelt nichts (Auflage 7)', async () => {
  const S = DLX.stuecke;
  for (const at of [S.CHUNK - 10, S.CHUNK - S.OVERLAP - 5, S.CHUNK, 2 * (S.CHUNK - S.OVERLAP) - 3]) {
    const text = 'x '.repeat(at / 2) + (at % 2 ? ' ' : '') + IBAN + ' Ende ' + 'y '.repeat(S.CHUNK);
    assert.equal(text.indexOf(IBAN), at);
    const r = await S.scan(text, detect);
    const hits = r.findings.filter((f) => f.id === 'iban');
    assert.equal(hits.length, 1, 'bei ' + at);
    assert.equal(hits[0].start, at);
  }
  // Zehnmal derselbe Wert ueber mehrere Stuecke: Anzahl 10.
  const many = Array.from({ length: 10 }, () => 'z '.repeat(1800) + AHV).join(' ');
  assert.equal((await S.scan(many, detect)).findings.filter((f) => f.id === 'ch_ahv').length, 10);
});

test('Stuecke: Frist ueberschritten oder Stueck nicht pruefbar = unscannable, bisherige Funde bleiben (Auflage 6)', async () => {
  const S = DLX.stuecke;
  const text = IBAN + ' ' + 'a '.repeat(S.CHUNK * 2);
  let n = 0;
  const r = await S.scan(text, (part) => (++n === 1 ? detect(part) : { findings: [], unscannable: true }));
  assert.equal(r.unscannable, true);
  assert.equal(r.findings.map((f) => f.id).join(), 'iban');
  assert.equal((await S.scan(text, detect, Date.now() - 1)).unscannable, true);
});

test('Stuecke: geben den Thread frei, kein Stueck blockiert ueber 100 ms (Auflage 2)', async () => {
  const S = DLX.stuecke;
  // Ungünstigster Fall aus der Laufzeitmessung: langer Ziffernblock.
  const text = '1234567890'.repeat(20000);
  let longest = 0, yields = 0, last = 0;
  const timer = setInterval(() => { yields++; }, 0);
  await S.scan(text, (part) => { const t = performance.now(); const r = detect(part); longest = Math.max(longest, performance.now() - t); last = yields; return r; });
  assert.ok(longest < 100, 'laengstes Stueck ' + longest.toFixed(1) + ' ms');
  // Zeitscheibe (Design-Review Bereinigen 19.10.2026): freigegeben wird erst nach >= SLICE_MS
  // Rechenzeit; mit 15 ms je Stueck also spaetestens nach 3 Stuecken.
  yields = 0; last = 0;
  const slow = (part) => { const t = performance.now(); while (performance.now() - t < 15); return detect(part); };
  await S.scan(text, (part) => { last = yields; return slow(part); });
  clearInterval(timer);
  assert.ok(last > 0, 'zwischen den Stuecken laufen andere Aufgaben');
});

// --- Service Worker: PDF/DOCX nur vom eigenen Content Script, Lesen im Offscreen-Dokument ---
function sw() {
  let listener = null, updated = null, removed = null;
  const docs = [];
  const state = { open: false, closed: 0, reply: null };
  const area = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {} });
  const on = () => ({ addListener() {} });
  const chrome = {
    runtime: { id: 'testid', onMessage: { addListener: (f) => { listener = f; } }, onStartup: on(), onInstalled: on(), getURL: (p) => 'chrome-extension://testid/' + p,
      getManifest: () => JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')), getContexts: async () => (state.open ? [{}] : []),
      sendMessage: async (m) => { if (m && m.target === 'dlx-doc') { docs.push(m); return state.reply ? state.reply(m) : { id: m.id, text: 'Text ' + IBAN, partial: false }; } } },
    offscreen: { createDocument: async () => { state.open = true; }, closeDocument: async () => { state.open = false; state.closed++; } },
    storage: { local: area(), session: area(), managed: area(), onChanged: on() },
    permissions: { getAll: async () => ({ origins: [] }), onAdded: on(), onRemoved: on() },
    scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {}, unregisterContentScripts: async () => {} },
    alarms: { create: async () => {}, clear: async () => true, onAlarm: on() },
    commands: { onCommand: on() },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: { sendMessage: async () => {}, onRemoved: { addListener: (f) => { removed = f; } }, onUpdated: { addListener: (f) => { updated = f; } } },
    windows: { create: async () => ({}), remove: async () => {}, onRemoved: on() },
  };
  // fetch nur fuer Paketdateien (DLX.i18n laedt _locales).
  const fetch = async (u) => { if (!String(u).startsWith('chrome-extension://testid/')) throw new Error('kein Netz'); const t = fs.readFileSync(path.join(EXT, String(u).slice(26)), 'utf8'); return { text: async () => t }; };
  const ctx = vm.createContext({ chrome, crypto: webcrypto, navigator: { language: 'de-CH' }, TextEncoder, TextDecoder, performance, URL, Date, clearTimeout, fetch,
    setTimeout: (f, ms) => { const x = setTimeout(f, ms); x.unref(); return x; } });
  ctx.importScripts = (...f) => { for (const x of f) vm.runInContext(fs.readFileSync(path.join(EXT, x), 'utf8'), ctx, { filename: x }); };
  vm.runInContext(fs.readFileSync(path.join(EXT, 'background.js'), 'utf8'), ctx, { filename: 'background.js' });
  const send = (msg, sender) => new Promise((res) => listener(msg, sender, (r) => res(r === undefined ? r : JSON.parse(JSON.stringify(r)))));
  return { send, docs, state, updated: (id, info) => updated(id, info), removed: (id) => removed(id) };
}
const own = { id: 'testid', tab: { id: 5 }, frameId: 0, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/c/1' };
const b64 = (n) => Buffer.alloc(n, 65).toString('base64');

test('SW: Dokumente nur vom eigenen Content Script im Top-Frame, nur PDF/DOCX, Antwort nur mit eigener ID', async () => {
  const s = sw();
  const data = b64(30);
  const others = [
    { id: 'testid', tab: { id: 5 }, frameId: 3, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/x' },
    { id: 'testid', tab: { id: 5 }, frameId: 0, origin: 'https://evil.example.com', url: 'https://evil.example.com/' },
    { id: 'andere', tab: { id: 5 }, frameId: 0, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/c/1' },
    { id: 'testid', origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/options.html' },
  ];
  for (const who of others) assert.deepEqual(await s.send({ t: 'doc', data, kind: 'pdf' }, who), { error: 'fail' }, who.url);
  assert.equal(s.docs.length, 0, 'nichts erreicht das Offscreen-Dokument');
  assert.deepEqual(await s.send({ t: 'doc', data, kind: 'text' }, own), { error: 'type' });
  assert.deepEqual(await s.send({ t: 'doc', data, kind: 'pdf' }, own), { text: 'Text ' + IBAN, partial: false });
  assert.equal(s.docs.length, 1);
  assert.match(s.docs[0].id, /^[0-9a-f]{32}$/);
  // Antwort mit fremder oder fehlender ID gilt nicht (Auflage 13).
  s.state.reply = (m) => ({ id: 'falsch', text: 'x', partial: false });
  assert.deepEqual(await s.send({ t: 'doc', data, kind: 'docx' }, own), { error: 'fail' });
  s.state.reply = (m) => ({ id: m.id, error: 'encrypted' });
  assert.deepEqual(await s.send({ t: 'doc', data, kind: 'pdf' }, own), { error: 'encrypted' });
  s.state.reply = (m) => ({ id: m.id, error: 'Datei geheim.pdf kaputt' });
  assert.deepEqual(await s.send({ t: 'doc', data, kind: 'pdf' }, own), { error: 'fail' }, 'nur feste Codes');
});

test('SW: 20 MB Rohbytes, kaputtes Base64, ein Auftrag gleichzeitig (Auflage 12)', async () => {
  const s = sw();
  const max = 20 * 1024 * 1024;
  assert.deepEqual(await s.send({ t: 'doc', data: b64(max + 1), kind: 'pdf' }, own), { error: 'size' });
  assert.deepEqual(await s.send({ t: 'doc', data: 'abc', kind: 'pdf' }, own), { error: 'fail' });
  assert.deepEqual(await s.send({ t: 'doc', data: 12, kind: 'pdf' }, own), { error: 'fail' });
  let release;
  s.state.reply = (m) => new Promise((r) => { release = () => r({ id: m.id, text: 'ok', partial: true }); });
  const first = s.send({ t: 'doc', data: b64(3), kind: 'pdf' }, own);
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(await s.send({ t: 'doc', data: b64(3), kind: 'pdf' }, own), { error: 'busy' });
  assert.deepEqual(await s.send({ t: 'ocr', data: b64(3), lang: 'de' }, own), { error: 'busy' }, 'auch die Texterkennung wartet');
  release();
  assert.deepEqual(await first, { text: 'ok', partial: true });
});

test('SW: Tab verlassen oder geschlossen bricht ab und schliesst das Offscreen-Dokument (Auflage 18)', async () => {
  for (const how of ['updated', 'removed']) {
    const s = sw();
    s.state.reply = () => new Promise(() => {});
    const job = s.send({ t: 'doc', data: b64(3), kind: 'pdf' }, own);
    await new Promise((r) => setTimeout(r, 5));
    if (how === 'updated') { s.updated(9, { status: 'loading' }); assert.equal(s.state.closed, 0, 'anderer Tab'); s.updated(5, { status: 'loading' }); } else s.removed(5);
    assert.equal(s.state.closed, 1, how);
    assert.equal(s.state.open, false);
    // Danach ist der SW wieder frei.
    s.state.reply = null;
    assert.deepEqual(await s.send({ t: 'doc', data: b64(3), kind: 'pdf' }, own), { text: 'Text ' + IBAN, partial: false }, how);
    void job;
  }
});

test('Quelltext: Leser byte-gleich dem geprueften Stand, keine neuen Rechte, kein Netz (Auflagen 1, 10, 16, 19)', () => {
  const sha = crypto.createHash('sha1').update('blob ' + fs.statSync(path.join(EXT, 'engine/datei.js')).size + '\0').update(fs.readFileSync(path.join(EXT, 'engine/datei.js'))).digest('hex');
  assert.equal(sha, 'cc713456ccaed75ef7e2df1ac8995783fa4f7733', 'engine/datei.js = Stand des Zweigs vom 16.10.2026 (git-Blob)');
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const js = m.content_scripts.flatMap((c) => c.js);
  assert.ok(js.includes('engine/datei.js') && js.includes('engine/stuecke.js'));
  for (const f of ['engine/datei.js', 'engine/stuecke.js', 'ui/dokument.js']) {
    const src = fs.readFileSync(path.join(EXT, f), 'utf8');
    assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|importScripts|eval|Function\(|console\.|chrome\.storage|innerHTML)\b/.test(src.replace(/^\s*\/\/.*$/gm, '')), f);
  }
  const html = fs.readFileSync(path.join(EXT, 'ui/ocr.html'), 'utf8');
  assert.match(html, /default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; base-uri 'none'; form-action 'none'/);
});
