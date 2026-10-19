// Messung Datei-Pruefung alt (Pause je Stueck) gegen neu (Zeitscheibe, engine/stuecke.js):
// node scripts/mess-stuecke.mjs [runden=10]
// Nachbau von checkDocs (content/content.js) ohne Browser: extract + Stuecke-Scan. Synthetische
// Dateien (erfundene Werte), alt und neu abwechselnd; Ausgabe nur Zeiten, Groessen und Fundzahlen.
// Verschachteltes setTimeout(0) wartet im Browser mindestens 4 ms (unter Windows bis 15,6 ms) –
// hier auf 4 ms geklemmt. Nicht Teil des Erweiterungspakets.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const RUNS = Number(process.argv[2] || 10);
const { docx, pdf } = await import(pathToFileURL(path.join(ROOT, 'tests', 'helpers', 'dokumente.mjs')));
const { ENGINE_FILES } = await import(pathToFileURL(path.join(ROOT, 'tests', 'helpers', 'load.mjs')));
const FILES = [...ENGINE_FILES, 'engine/datei.js', 'engine/stuecke.js', 'common/quellen.js', 'common/policy.js'];

// Laengster Block ohne Freigabe: Zeit von einer Rueckkehr aus der Pause bis zur naechsten Pause.
const block = { from: 0, max: 0 };
const timeout = (fn, ms) => {
  block.max = Math.max(block.max, performance.now() - block.from);
  return setTimeout(() => { block.from = performance.now(); fn(); }, Math.max(4, ms || 0));
};
// alt: SLICE_MS = 0 (nur im Speicher) -> Pause nach jedem Stueck wie vor der Zeitscheibe.
function engine(alt) {
  const ctx = vm.createContext({ TextEncoder, TextDecoder, atob, DecompressionStream, Uint8Array, DataView, URL, performance, setTimeout: timeout, clearTimeout });
  for (const f of FILES) {
    let src = fs.readFileSync(path.join(EXT, f), 'utf8');
    if (alt && f === 'engine/stuecke.js') src = src.replace('SLICE_MS = 40', 'SLICE_MS = 0');
    vm.runInContext(src, ctx, { filename: f });
  }
  if (alt && ctx.DLX.stuecke.SLICE_MS !== 0) throw new Error('alt-Arm nicht gesetzt');
  const DLX = ctx.DLX;
  const eng = DLX.policy.engineConfig(DLX.policy.defaults('de-CH'));
  const detect = (part) => { const r = DLX.engine.scan(part, eng); return { findings: Array.from(r.findings), unscannable: r.unscannable }; };
  return { DLX, detect };
}

const WORDS = 'Protokoll der Sitzung zum Projekt mit Terminen Zielen und naechsten Schritten fuer das Team im Herbst wir besprechen Budget Planung Risiken und offene Fragen'.split(' ');
const SENS = ['CH93 0076 2011 6238 5295 7', '756.1234.5678.97', 'max.muster@example.com', '+41 79 123 45 67'];
function text(chars) {
  let s = '', w = 0, k = 0;
  while (s.length < chars) {
    s += WORDS[(w++ * 7) % WORDS.length] + (w % 12 ? ' ' : '.\n');
    if (s.length > (k + 1) * 4000) s += ' ' + SENS[k++ % SENS.length] + ' ';
  }
  return s;
}
// PDF/DOCX: Text ~ Dateigroesse/12 (unter der Grenze von 500k Zeichen), Rest Bilddaten.
function make(kind, bytes) {
  if (kind === 'txt') return new Uint8Array(Buffer.from(text(bytes), 'utf8'));
  const parts = text(Math.min(450000, Math.round(bytes / 12))).match(/[\s\S]{1,3000}/g);
  let seed = 7;
  const rnd = (n) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) >>> 0; b[i] = seed >>> 24; } return b; };
  if (kind === 'docx') return docx(parts, [{ name: 'word/media/image1.png', data: rnd(Math.max(0, bytes - docx(parts).length)), store: true }]);
  const base = Buffer.from(pdf(parts));
  const pad = Math.max(0, bytes - base.length), at = base.lastIndexOf('trailer');
  const img = Buffer.concat([Buffer.from('9999 0 obj\n<< /Type /XObject /Subtype /Image /Width 100 /Height 100 /Length ' + pad + ' >>\nstream\n', 'latin1'), rnd(pad), Buffer.from('\nendstream\nendobj\n', 'latin1')]);
  return new Uint8Array(Buffer.concat([base.subarray(0, at), img, base.subarray(at)]));
}

async function check(e, kind, bytes) {
  const t0 = performance.now();
  const txt = kind === 'txt' ? new TextDecoder().decode(bytes) : (await e.DLX.datei.extract(bytes, kind, 20000)).text;
  // Block nur fuer den Scan: PDF/DOCX liest im Browser das Offscreen-Dokument, nicht die Seite.
  block.from = performance.now(); block.max = 0;
  const d = await e.DLX.stuecke.scan(txt, e.detect, Date.now() + 20000);
  block.max = Math.max(block.max, performance.now() - block.from);
  return { ms: performance.now() - t0, block: block.max, n: d.findings.length, unscannable: d.unscannable };
}

const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const p90 = (a) => { const s = [...a].sort((p, q) => p - q); return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)]; };
const r1 = (x) => Math.round(x);
const E = { alt: engine(true), neu: engine(false) };
console.log('Datei | KB | alt Median/P90 ms | neu Median/P90 ms | neu laengster Block ms | Funde alt=neu');
for (const [kind, size] of [['txt', 2000000], ['pdf', 5000000], ['docx', 5000000]]) {
  const bytes = make(kind, size);
  const m = { alt: [], neu: [] }, b = [], n = { alt: new Set(), neu: new Set() };
  await check(E.neu, kind, bytes);   // Aufwaermen
  for (let i = 0; i < RUNS; i++) for (const k of (i % 2 ? ['neu', 'alt'] : ['alt', 'neu'])) {
    const r = await check(E[k], kind, bytes);
    m[k].push(r.ms); n[k].add(r.n + (r.unscannable ? '!' : ''));
    if (k === 'neu') b.push(r.block);
  }
  const same = n.alt.size === 1 && n.neu.size === 1 && [...n.alt][0] === [...n.neu][0];
  console.log([kind, r1(bytes.length / 1024), r1(med(m.alt)) + '/' + r1(p90(m.alt)), r1(med(m.neu)) + '/' + r1(p90(m.neu)), r1(Math.max(...b)), (same ? 'ja ' : 'NEIN ') + [...n.neu].join()].join(' | '));
}
