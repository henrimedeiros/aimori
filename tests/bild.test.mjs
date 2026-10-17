// Bilder pruefen (Design-Review Bilder 14.10.2026): Kopfpruefung vor dem
// Dekodieren, Woerter -> Text -> Rahmen, Grenzen, Offscreen-Dokument ohne Netz
// und Cache, Manifest/CSP, gepinnte OCR-Dateien.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import path from 'node:path';
import { load, ENGINE_FILES, EXT, ROOT } from './helpers/load.mjs';
import { verify, verifyOut } from '../scripts/build-ocr.mjs';

const DLX = load([...ENGINE_FILES, 'engine/bild.js']);
const B = DLX.bild;
const CFG = { packs: Object.keys(DLX.packs), rules: {} };
const src = (p) => fs.readFileSync(path.join(EXT, p), 'utf8').replace(/\r\n/g, '\n');
// Objekte aus dem vm-Kontext per JSON vergleichen (anderer Realm).
const same = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);

function png(w, h) {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}
function jpeg(w, h) {
  // SOI, APP0 (16 Byte), SOF0 mit Hoehe/Breite
  const b = new Uint8Array(64);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  const i = 2 + 2 + 16;
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255], i);
  return b;
}
function webp(kind, w, h) {
  const b = new Uint8Array(40);
  const put = (s, at) => { for (let k = 0; k < s.length; k++) b[at + k] = s.charCodeAt(k); };
  put('RIFF', 0); put('WEBP', 8); put(kind, 12);
  if (kind === 'VP8X') { const W = w - 1, H = h - 1; b.set([W & 255, (W >> 8) & 255, W >> 16, H & 255, (H >> 8) & 255, H >> 16], 24); }
  if (kind === 'VP8L') { b[20] = 0x2f; const bits = (w - 1) | ((h - 1) << 14); b.set([bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255], 21); }
  if (kind === 'VP8 ') { b.set([0x9d, 0x01, 0x2a, w & 255, w >> 8, h & 255, h >> 8], 23); }
  return b;
}

test('Bildart nur aus den Magic Bytes; Abmessungen aus dem Dateikopf (PNG, JPEG, WebP VP8/VP8L/VP8X)', () => {
  assert.equal(B.sniff(png(10, 10)), 'png');
  assert.equal(B.sniff(jpeg(10, 10)), 'jpeg');
  assert.equal(B.sniff(webp('VP8X', 10, 10)), 'webp');
  assert.equal(B.sniff(new TextEncoder().encode('%PDF-1.7 ............')), null);
  assert.equal(B.sniff(new Uint8Array(4)), null);
  same(B.dims(png(1920, 1080)), { w: 1920, h: 1080 });
  same(B.dims(jpeg(1280, 720)), { w: 1280, h: 720 });
  same(B.dims(webp('VP8X', 3000, 2000)), { w: 3000, h: 2000 });
  same(B.dims(webp('VP8L', 800, 600)), { w: 800, h: 600 });
  same(B.dims(webp('VP8 ', 640, 480)), { w: 640, h: 480 });
  const broken = jpeg(10, 10); broken[20] = 0x00;   // kein Marker
  assert.equal(B.dims(broken), null);
  assert.equal(B.dims(png(0, 10)), null);
});

test('Vorpruefung vor dem Dekodieren: Groesse, Art, 25 Megapixel (Auflage 9)', () => {
  same(B.precheck(png(5000, 5000)), { ok: true, w: 5000, h: 5000 });
  same(B.precheck(png(6000, 5000)), { ok: false, reason: 'size' }, 'Dekomprimierungsbombe laut Kopf');
  same(B.precheck(new TextEncoder().encode('GIF89a..........')), { ok: false, reason: 'type' });
  const noDims = png(10, 10); noDims[12] = 0;   // IHDR fehlt
  same(B.precheck(noDims), { ok: false, reason: 'size' });
  same(B.precheck(new Uint8Array(B.LIMITS.bytes + 1)), { ok: false, reason: 'size' });
  assert.equal(B.scaleFor(1920, 1080), 2);
  assert.equal(B.scaleFor(2560, 1440), 1, 'gross: nicht vergroessern');
  assert.equal(B.scaleFor(2001, 100), 1, 'ab 2001 px Kante nicht vergroessern (2x bleibt so unter 25 MP)');
  assert.deepEqual([B.LIMITS.images, B.LIMITS.bytes, B.LIMITS.pixels, B.LIMITS.ms], [4, 10485760, 25000000, 20000]);
});

test('Sprachdaten: deu+eng fest, fra/ita/por nur nach Oberflaechensprache (Auflage 10)', () => {
  assert.deepEqual(Array.from(B.langsFor('de')), ['deu', 'eng']);
  assert.deepEqual(Array.from(B.langsFor('en')), ['deu', 'eng']);
  assert.deepEqual(Array.from(B.langsFor('fr')), ['deu', 'eng', 'fra']);
  assert.deepEqual(Array.from(B.langsFor('pt')), ['deu', 'eng', 'por']);
  assert.deepEqual(Array.from(B.langsFor('__proto__')), ['deu', 'eng']);
});

const LINES = [
  [['Rechnung', 10, 10, 90, 30]],
  [['IBAN:', 10, 50, 60, 70], ['CH93', 70, 50, 110, 70], ['0076', 120, 50, 160, 70], ['2011', 170, 50, 210, 70], ['6238', 220, 50, 260, 70], ['5295', 270, 50, 310, 70], ['7', 320, 50, 330, 70]],
  [['Danke', 10, 90, 60, 110]],
];

test('Woerter -> Text wie beim Einfuegen; gleiche Erkennung wie Text', () => {
  const { text, spans } = B.textOf(LINES);
  assert.equal(text, 'Rechnung\nIBAN: CH93 0076 2011 6238 5295 7\nDanke');
  assert.equal(spans.length, 9);
  assert.equal(text.slice(spans[3].s, spans[3].e), '0076');
  const ids = Array.from(DLX.engine.scan(text, CFG).findings, (f) => f.id);
  assert.ok(ids.includes('iban'), ids.join());
});

test('Schwaerzen: alle Woerter eines Fundes, auch ueber Zeilen; 2x-Rahmen aufs Original zurueckgerechnet (Auflage 8)', () => {
  const { text, spans } = B.textOf(LINES);
  const f = Array.from(DLX.engine.scan(text, CFG).findings).find((x) => x.id === 'iban');
  const rects = B.rectsFor([f], spans, 2, 1000, 1000);
  assert.equal(rects.length, 6, 'CH93 … 7, nicht "IBAN:"');
  same(rects[0], [35 - B.PAD, 25 - B.PAD, 55 - 35 + 2 * B.PAD, 35 - 25 + 2 * B.PAD]);
  // Fund ueber zwei Zeilen
  const two = B.rectsFor([{ start: text.indexOf('5295'), end: text.indexOf('Danke') + 5 }], spans, 1, 1000, 1000);
  assert.equal(two.length, 3);
  // Rand bleibt im Bild
  const edge = B.rectsFor([{ start: 0, end: 3 }], [{ s: 0, e: 8, box: [0, 0, 20, 10] }], 1, 18, 8);
  same(edge, [[0, 0, 18, 8]]);
  assert.equal(B.rectsFor([{ start: 50, end: 60 }], spans, 1, 100, 100), null, 'Fund ohne Wort -> keine Kopie');
});

test('Antwort des Offscreen-Dokuments nur Woerter mit Zahlenrahmen, begrenzt', () => {
  assert.ok(B.validLines(LINES));
  assert.ok(!B.validLines('text'));
  assert.ok(!B.validLines([[['a', 1, 2, 3]]]));
  assert.ok(!B.validLines([[['a', 1, 2, 3, NaN]]]));
  assert.ok(!B.validLines([[[{}, 1, 2, 3, 4]]]));
  assert.ok(!B.validLines([[['x'.repeat(201), 1, 2, 3, 4]]]));
  assert.ok(!B.validLines([Array.from({ length: B.LIMITS.words + 1 }, () => ['a', 1, 1, 2, 2])]));
});

test('Offscreen-Dokument: nur feste Zielmarke vom eigenen SW, kein Netz, kein Cache, keine Konsole (Auflagen 2, 4, 11)', () => {
  const o = src('ui/ocr.js');
  assert.match(o, /msg\.target !== TARGET \|\| sender\.id !== chrome\.runtime\.id \|\| sender\.tab \|\| sender\.url !== SW_URL/);
  assert.match(o, /cacheMethod: 'none'/);
  assert.match(o, /logging: false/);
  assert.match(o, /output: \{ text: false, blocks: true, hocr: false, tsv: false \}/);
  assert.match(o, /queue\.then/, 'nacheinander');
  for (const bad of [/\bfetch\s*\(/, /indexedDB/i, /chrome\.storage/, /console\./, /localStorage/, /https?:\/\//]) assert.ok(!bad.test(o), String(bad));
  const html = src('ui/ocr.html');
  assert.match(html, /script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'/);
  assert.ok(!/connect-src/.test(html) || /connect-src 'none'/.test(html));
});

test('Content Script: Datei-Feld sofort geleert, eigene Weitergabe nur fuer genau ein Ereignis (Auflagen 5, 7)', () => {
  const c = src('content/content.js');
  assert.match(c, /stop\(e\);\n {4}n\.value = '';/);
  assert.match(c, /own\.add\(ev\);\n {4}try \{ target\.dispatchEvent\(ev\); \} finally \{ own\.delete\(ev\); \}/);
  assert.ok(!/isTrusted[^\n]*image|data-dlx/i.test(c), 'keine Ausnahme ueber isTrusted oder DOM-Merker');
  for (const t of ['paste', 'drop']) assert.match(c, new RegExp(`addEventListener\\('${t}', \\(e\\) => \\{ if \\(!own\\.has\\(e\\)\\)`));
  assert.match(c, /'bild-geschwaerzt\.png'/);
  assert.match(c, /ctx\.fillStyle = '#000';/);
});

test('Manifest: offscreen-Recht, CSP nur um wasm-unsafe-eval erweitert, OCR nie web_accessible (Auflagen 1, 4)', () => {
  const m = JSON.parse(src('manifest.json'));
  assert.ok(m.permissions.includes('offscreen'));
  const csp = m.content_security_policy.extension_pages;
  assert.match(csp, /^script-src 'self' 'wasm-unsafe-eval';/);
  assert.match(csp, /connect-src 'none'/);
  const war = JSON.stringify(m.web_accessible_resources);
  assert.ok(!/ocr|vendor/.test(war), war);
  assert.ok(m.content_scripts[0].js.includes('engine/bild.js'));
});

test('OCR-Dateien: Pakete und Pruefsummen gepinnt, Ordner enthaelt nichts Zusaetzliches (Auflage 12)', (t) => {
  const pins = JSON.parse(fs.readFileSync(path.join(EXT, 'vendor', 'ocr', 'PINS.json'), 'utf8'));
  assert.deepEqual(Object.keys(pins.files).sort(), ['LICENSE-tesseract.js-core.txt', 'LICENSE-tesseract.js.txt', 'lang/deu.js', 'lang/eng.js', 'lang/fra.js', 'lang/ita.js', 'lang/por.js', 'tesseract-core-simd-lstm.wasm.js', 'worker.min.js']);
  for (const [p, v] of Object.entries(pins.packages)) assert.match(v.integrity, /^sha512-/, p);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const [p, v] of Object.entries(pkg.devDependencies)) assert.match(v, /^\d+\.\d+\.\d+$/, 'exakt gepinnt: ' + p);
  assert.equal(pkg.dependencies, undefined);
  if (!fs.existsSync(path.join(ROOT, 'node_modules', 'tesseract.js'))) { t.skip('node_modules fehlt (npm ci --ignore-scripts)'); return; }
  assert.deepEqual(verify(), []);
  if (fs.existsSync(path.join(EXT, 'vendor', 'ocr', 'worker.min.js'))) assert.deepEqual(verifyOut(), []);
});

test('OCR-Verwechslungen: Laenge bleibt gleich, nur Ziffer-/Praefix-Kontext, Pruefziffern entscheiden weiter', () => {
  const cases = [
    ['IBAN CH93 OO76 2011 6238 5295 7', 'IBAN CH93 OO76 2011 6238 5295 7'],   // O am Gruppenanfang ohne Ziffer davor bleibt
    ['Karte 4111 1l11 1111 1111', 'Karte 4111 1111 1111 1111'],
    ['756.1234.5678.9O7', '756.1234.5678.907'],
    ['key Alza' + 'x'.repeat(35), 'key AIza' + 'x'.repeat(35)],
    ['„type”: ‘a’', '"type": \'a\''],
    ['Olaf Ilona 10 Ol', 'Olaf Ilona 10 Ol'],
  ];
  for (const [inp, out] of cases) {
    assert.equal(B.repair(inp), out, inp);
    assert.equal(B.repair(inp).length, inp.length);
  }
  const { text } = B.textOf([[['Karte', 0, 0, 1, 1], ['4111', 0, 0, 1, 1], ['1l11', 0, 0, 1, 1], ['1111', 0, 0, 1, 1], ['1111', 0, 0, 1, 1]]]);
  assert.equal(text, 'Karte 4111 1111 1111 1111');
});

// Service Worker in kleiner chrome-Attrappe: Bildbytes nur vom eigenen Content Script.
function sw() {
  let listener = null;
  const ocr = [];
  const area = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {} });
  const on = () => ({ addListener() {} });
  const chrome = {
    runtime: { id: 'testid', onMessage: { addListener: (f) => { listener = f; } }, onStartup: on(), onInstalled: on(), getURL: (p) => 'chrome-extension://testid/' + p,
      getManifest: () => JSON.parse(src('manifest.json')), getContexts: async () => [{}],
      sendMessage: async (m) => { if (m && m.target === 'dlx-ocr') { ocr.push(m); return { lines: [], scale: 1, w: 1, h: 1 }; } } },
    offscreen: { createDocument: async () => {}, closeDocument: async () => {} },
    storage: { local: area(), session: area(), managed: area(), onChanged: on() },
    permissions: { getAll: async () => ({ origins: [] }), onAdded: on(), onRemoved: on() },
    scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {}, unregisterContentScripts: async () => {} },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: { sendMessage: async () => {}, onRemoved: on() }, windows: { create: async () => ({}), remove: async () => {}, onRemoved: on() },
  };
  const ctx = vm.createContext({ chrome, crypto: webcrypto, navigator: { language: 'de-CH' }, TextEncoder, performance, URL, Date, clearTimeout,
    setTimeout: (f, ms) => { const x = setTimeout(f, ms); x.unref(); return x; } });
  ctx.importScripts = (...f) => { for (const x of f) vm.runInContext(fs.readFileSync(path.join(EXT, x), 'utf8'), ctx, { filename: x }); };
  vm.runInContext(fs.readFileSync(path.join(EXT, 'background.js'), 'utf8'), ctx, { filename: 'background.js' });
  const send = (msg, sender) => new Promise((res) => listener(msg, sender, (r) => res(r === undefined ? r : JSON.parse(JSON.stringify(r)))));
  return { send, ocr };
}

test('SW: Bildbytes nur vom eigenen Content Script im Top-Frame einer KI-Seite, sonst {error:"fail"}', async () => {
  const s = sw();
  const data = Buffer.from('bild').toString('base64');
  const own = { id: 'testid', tab: { id: 5 }, frameId: 0, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/c/1' };
  const others = [
    { id: 'testid', tab: { id: 5 }, frameId: 3, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/x' },      // Unterframe
    { id: 'testid', tab: { id: 5 }, frameId: 0, origin: 'https://evil.example.com', url: 'https://evil.example.com/' }, // fremde Seite
    { id: 'andere', tab: { id: 5 }, frameId: 0, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/c/1' },     // fremde Erweiterung
    { id: 'testid', tab: { id: 5 }, frameId: 7, origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/dialog.html' },
    { id: 'testid', origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/options.html' },
  ];
  for (const who of others) assert.deepEqual(await s.send({ t: 'ocr', data, lang: 'de' }, who), { error: 'fail' }, who.url);
  assert.equal(s.ocr.length, 0, 'nichts erreicht das Offscreen-Dokument');
  assert.deepEqual(await s.send({ t: 'ocr', data, lang: 'de' }, own), { lines: [], scale: 1, w: 1, h: 1, ms: 0 });
  assert.equal(s.ocr.length, 1);
});
