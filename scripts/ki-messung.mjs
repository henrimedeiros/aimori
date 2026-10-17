// Messung der lokalen KI-Erkennung in Node (onnxruntime-web, WASM, 1 Thread):
// Latenz und Trefferquote auf dem synthetischen Korpus (tests/helpers/ki-korpus.mjs,
// DE/EN/FR/PT), verglichen mit "nur Regeln". Ausgabe nur Zahlen (Auflage 23).
// Vorher: npm ci --ignore-scripts && node scripts/build-ki.mjs (fuellt .tmp/ki-cache).
// Aufruf: node scripts/ki-messung.mjs [--json] [--original]
//   Standard: das gebaute Modell mit gekuerztem Vokabular (PINS.json modell.erzeugt);
//   --original: das gepinnte Ausgangsmodell zum Vergleich (Auflage 6 Design-Review Vokabular).
import fs from 'node:fs';
import path from 'node:path';
import * as ort from 'onnxruntime-web';
import { Tokenizer } from '@huggingface/tokenizers';
import { load, ENGINE_FILES, ROOT } from '../tests/helpers/load.mjs';
import { KORPUS, parse } from '../tests/helpers/ki-korpus.mjs';
import { createRunner } from '../extension/ui/ki-lauf.mjs';

const DLX = load(ENGINE_FILES.concat(['engine/ki.js']));
const CFG = { packs: Object.keys(DLX.packs), rules: {} };
const pins = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'vendor', 'ki', 'PINS.json'), 'utf8'));
const ORIGINAL = process.argv.includes('--original');
const cache = (rel) => path.join(ROOT, '.tmp', 'ki-cache', ORIGINAL ? pins.modell.dateien[rel].sha256 : pins.modell.erzeugt[rel === 'tokenizer.json' ? 'tokenizer' : 'onnx'].sha256);
let rssMax = 0;
const rssTick = setInterval(() => { rssMax = Math.max(rssMax, process.memoryUsage().rss); }, 20);

const t0 = performance.now();
const runner = await createRunner({
  ort, Tokenizer, labels: pins.modell.labels, executionProviders: ['wasm'],
  model: new Uint8Array(fs.readFileSync(cache(pins.modell.onnx))),
  tokenizerJson: JSON.parse(fs.readFileSync(cache('tokenizer.json'), 'utf8')),
});
const initMs = performance.now() - t0;
rssMax = Math.max(rssMax, process.memoryUsage().rss);
const modellMb = Math.round(fs.statSync(cache(pins.modell.onnx)).size / 104857.6) / 10;

const overlap = (a, b) => a.start < b.end && b.start < a.end;
const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : null);
const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]); };
const res = { modell: ORIGINAL ? 'original' : 'gekuerzt', modellMb, initMs: Math.round(initMs), sprachen: {} };
const all = [];

for (const [lang, list] of Object.entries(KORPUS)) {
  const r = { saetze: list.length, gold: 0, kiSicher: 0, kiAlle: 0, regeln: 0, fundeSicher: 0, richtigSicher: 0, neg: 0, negFehlSicher: 0, negFehlAlle: 0, negRoh: 0, ms: [], jeTyp: {} };
  for (const line of list) {
    const { text, gold } = parse(line);
    const t = performance.now();
    const ents = DLX.ki.valid({ ents: await runner.run(text) }, text.length) || [];
    const ms = performance.now() - t;
    r.ms.push(ms); all.push(ms);
    const rules = Array.from(DLX.engine.scan(text, CFG, () => 0).findings);
    const ki = DLX.ki.findings(text, ents, CFG);
    const sure = ki.filter((f) => f.sure);
    if (!gold.length) {
      r.neg++;
      if (sure.length) r.negFehlSicher++;
      if (ki.length) r.negFehlAlle++;
      if (ents.some((e) => DLX.ki.TYPES[e.type] && e.score >= 0.5)) r.negRoh++;   // ohne Kontext-/Konfidenz-Filter
    }
    for (const gd of gold) {
      const ty = r.jeTyp[gd.id] || (r.jeTyp[gd.id] = { gold: 0, kiSicher: 0, kiAlle: 0, regeln: 0 });
      r.gold++; ty.gold++;
      const hitAll = ki.some((f) => f.id === gd.id && overlap(f, gd));
      const hitSure = sure.some((f) => f.id === gd.id && overlap(f, gd));
      const hitRule = rules.some((f) => overlap(f, gd));
      if (hitAll) { r.kiAlle++; ty.kiAlle++; }
      if (hitSure) { r.kiSicher++; ty.kiSicher++; }
      if (hitRule) { r.regeln++; ty.regeln++; }
    }
    r.fundeSicher += sure.length;
    r.richtigSicher += sure.filter((f) => gold.some((gd) => gd.id === f.id && overlap(f, gd))).length;
  }
  res.sprachen[lang] = {
    saetze: r.saetze, soll: r.gold,
    trefferRegeln: pct(r.regeln, r.gold), trefferKiSicher: pct(r.kiSicher, r.gold), trefferKiAlle: pct(r.kiAlle, r.gold),
    praezisionSicher: pct(r.richtigSicher, r.fundeSicher),
    fehlalarmSicher: `${r.negFehlSicher}/${r.neg}`, fehlalarmAlle: `${r.negFehlAlle}/${r.neg}`, fehlalarmRoh: `${r.negRoh}/${r.neg}`,
    p50: q(r.ms, 0.5), p95: q(r.ms, 0.95),
    jeTyp: Object.fromEntries(Object.entries(r.jeTyp).map(([k, v]) => [k, `${v.kiSicher}/${v.kiAlle}/${v.regeln} von ${v.gold}`])),
  };
}

// Langer Text nahe der Grenze (4000 Zeichen, mehrere Fenster).
const lang = Array.from({ length: 40 }, (_, i) => parse(KORPUS.de[i % 12]).text).join(' ').slice(0, DLX.ki.MAX_TEXT);
const tl = performance.now();
await runner.run(lang);
res.lang4000Ms = Math.round(performance.now() - tl);
res.p50 = q(all, 0.5);
res.p95 = q(all, 0.95);
clearInterval(rssTick);
res.speicherMb = Math.round(Math.max(rssMax, process.memoryUsage().rss) / 1048576);

if (process.argv.includes('--json')) console.log(JSON.stringify(res, null, 2));
else {
  console.log(`Modell ${res.modell} ${res.modellMb} MB · Speicher-Spitze ${res.speicherMb} MB · Init ${res.initMs} ms · Satz P50 ${res.p50} ms / P95 ${res.p95} ms · 4000 Zeichen ${res.lang4000Ms} ms (Node, WASM, 1 Thread)`);
  console.log('| Sprache | Soll | Regeln | KI sicher | KI inkl. dezent | Präzision sicher | Fehlalarm sicher | Fehlalarm inkl. dezent | Fehlalarm ohne Filter | P50 ms | P95 ms |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [l, v] of Object.entries(res.sprachen)) console.log(`| ${l} | ${v.soll} | ${v.trefferRegeln} % | ${v.trefferKiSicher} % | ${v.trefferKiAlle} % | ${v.praezisionSicher} % | ${v.fehlalarmSicher} | ${v.fehlalarmAlle} | ${v.fehlalarmRoh} | ${v.p50} | ${v.p95} |`);
  console.log('Je Typ (KI sicher / KI inkl. dezent / Regeln von Soll):');
  for (const [l, v] of Object.entries(res.sprachen)) console.log(`- ${l}: ` + Object.entries(v.jeTyp).map(([k, x]) => `${k} ${x}`).join(', '));
}
runner.release();
