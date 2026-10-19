// Echte Texterkennung an Beispielbildern (Design-Review Bild-OCR-Test 17.10.2026):
// ein kopfloser Edge zeichnet zwei Screenshots per Canvas auf about:blank
// (scripts/lib/testbilder.mjs, keine Bilddateien im Repo, keine Fremdquellen),
// tesseract.js 7.0.0 liest sie in Node mit denselben Sprachdaten wie die
// Erweiterung, danach Woerter -> DLX.bild.textOf -> Engine wie beim Einfuegen.
// Kein Netz: Sprachdaten nur aus node_modules per absolutem Pfad (fehlen sie,
// wird uebersprungen, nie der CDN-Rueckfall), cacheMethod 'none'.
// Ausgabe nur Zahlen und ja/nein, nie erkannter Text oder Werte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { load, ENGINE_FILES, ROOT } from './helpers/load.mjs';
import { renderBilder, rechnung } from '../scripts/lib/testbilder.mjs';

const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// Obergrenze je Bild inkl. Kaltstart; unter Rechnerlast per Umgebungsvariable hoeher.
const MAX_MS = Number(process.env.OCR_MAX_MS) || 15000;
const NM = path.join(ROOT, 'node_modules');
const LANG = (l) => path.join(NM, '@tesseract.js-data', l, '4.0.0_best_int');

const DLX = load([...ENGINE_FILES, 'engine/bild.js']);
const CFG = { packs: Object.keys(DLX.packs), rules: {} };

function linesOf(blocks) {
  const out = [];
  for (const b of blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    out.push((l.words || []).map((w) => [String(w.text || ''), w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1]));
  }
  return out;
}

function skipGrund() {
  if (!fs.existsSync(path.join(NM, 'tesseract.js'))) return 'node_modules fehlt';
  for (const l of ['deu', 'eng']) if (!fs.statSync(path.join(LANG(l), l + '.traineddata.gz'), { throwIfNoEntry: false })?.isFile()) return 'Sprachdaten fehlen';
  if (!fs.existsSync(EDGE)) return 'Edge fehlt';
  return '';
}

test('Echte Texterkennung: Screenshot mit IBAN erkannt, harmloses Bild ohne sicheren Fund, Laufzeit begrenzt', { timeout: 90000 }, async (t) => {
  const grund = skipGrund();
  if (grund) { t.skip(grund); return; }
  const scenes = [
    rechnung(['IBAN: CH93 0076 2011 6238 5295 7', 'Kontoinhaber: Max Muster'], { format: 'png' }),
    rechnung(['Zahlbar innert 30 Tagen', 'Bei Fragen melden Sie sich gerne'], { format: 'png' }),
  ];
  const bilder = await renderBilder(scenes);
  const { createWorker } = createRequire(import.meta.url)(path.join(NM, 'tesseract.js'));
  let worker = null;
  try {
    // langPath: absoluter lokaler Pfad, kein http/file-Praefix -> fs.readFile, kein fetch.
    // Ein langPath je Worker, die Pakete liegen je Sprache in eigenen Ordnern -> nur deu
    // (reicht fuer IBAN; deu+eng zusammen misst die E2E-Bildmessung in der Erweiterung).
    const t0 = performance.now();
    worker = await createWorker('deu', 1, { langPath: LANG('deu'), cacheMethod: 'none', gzip: true, errorHandler: () => {} });
    const start = Math.round(performance.now() - t0);
    const res = [];
    for (const img of bilder) {
      const t1 = performance.now();
      const r = await worker.recognize(img, {}, { text: false, blocks: true });
      const ms = Math.round(performance.now() - t1);
      const { text } = DLX.bild.textOf(linesOf(r.data.blocks));
      const f = Array.from(DLX.engine.scan(text, CFG).findings, (x) => ({ id: x.id, sure: x.sure }));
      res.push({ ms, iban: f.some((x) => x.id === 'iban'), sicher: f.filter((x) => x.sure).length });
    }
    t.diagnostic(`Start ${start} ms; Bild mit IBAN ${res[0].ms} ms, IBAN erkannt: ${res[0].iban ? 'ja' : 'nein'}; harmlos ${res[1].ms} ms, sichere Funde: ${res[1].sicher}`);
    assert.ok(res[0].iban, 'IBAN im Screenshot nicht erkannt');
    assert.equal(res[1].sicher, 0, 'harmloses Bild mit sicherem Fund');
    for (const r of res) assert.ok(r.ms + start <= MAX_MS, `Laufzeit ${r.ms + start} ms ueber ${MAX_MS} ms`);
  } finally {
    if (worker) await worker.terminate();
  }
});
