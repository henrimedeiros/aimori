// Zeitscheibe in engine/stuecke.js (Design-Review Flash 19.10.2026, Auflagen 2 und 3): Treffer an
// Stueck- und Scheibengrenzen genau einmal, Frist nach jedem Stueck, kein Block deutlich ueber 40 ms.
// Nur synthetische Werte (offizielle Beispiel-IBAN). Laeuft erst, wenn engine/stuecke.js da ist
// (Datei-Upload-Zweig); bis dahin uebersprungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, ENGINE_FILES, EXT } from './helpers/load.mjs';

const HAS = fs.existsSync(path.join(EXT, 'engine/stuecke.js'));
const opts = { skip: !HAS && 'engine/stuecke.js fehlt (Datei-Upload noch nicht in diesem Stand)' };
const FILES = [...ENGINE_FILES, 'engine/stuecke.js', 'common/quellen.js', 'common/policy.js'];
const IBAN = 'CH93 0076 2011 6238 5295 7';      // offizielle Beispiel-IBAN
const FALSCH = 'CH94 0076 2011 6238 5295 7';    // Pruefziffer falsch

// Uhr unter Kontrolle des Tests: jedes Stueck kostet `je` ms, Pausen werden mitgezaehlt.
function stand(je, frist = Infinity) {
  const s = { clock: 0, chunk: 0, pausen: [] };
  const DLX = load(FILES, {
    performance: { now: () => s.clock },
    Date: { now: () => s.clock },
    setTimeout: (f, ms) => { s.pausen.push(s.chunk); return setTimeout(f, ms); },
  });
  const eng = DLX.policy.engineConfig(DLX.policy.defaults('de-CH'));
  s.S = DLX.stuecke;
  s.detect = (part) => {
    const r = DLX.engine.scan(part, eng);
    s.chunk++; s.clock += je;
    return { findings: Array.from(r.findings), unscannable: r.unscannable };
  };
  s.scan = (text) => s.S.scan(text, s.detect, frist);
  return s;
}
const fill = (n) => 'x '.repeat(n / 2) + (n % 2 ? ' ' : '');

test('Scheibengrenze: IBAN ueber der Grenze, an der pausiert wird, zaehlt genau einmal; falsche nie', opts, async () => {
  const S = stand(20).S;   // 20 ms je Stueck -> Pause nach jedem zweiten Stueck (>= 40 ms)
  const step = S.CHUNK - S.OVERLAP;
  // Stueck 1 endet bei step + CHUNK, Stueck 2 beginnt bei 2 * step: Werte rund um diese Grenze.
  for (const at of [2 * step - 5, step + S.CHUNK - 10, step + S.CHUNK, 2 * step]) {
    for (const [wert, soll] of [[IBAN, 1], [FALSCH, 0]]) {
      const s = stand(20);
      const text = fill(at) + wert + ' Ende ' + fill(3 * S.CHUNK);
      assert.equal(text.indexOf(wert), at);
      const r = await s.scan(text);
      assert.equal(s.pausen[0], 2, 'erste Pause nach dem zweiten Stueck');
      assert.equal(r.unscannable, false);
      const hits = r.findings.filter((f) => f.id === 'iban');
      assert.equal(hits.length, soll, wert.slice(0, 4) + ' bei ' + at);
      if (soll) assert.equal(hits[0].start, at);
    }
  }
});

test('Scheibengrenze: gleiche Funde bei Pause nach jedem Stueck, jeder Scheibe und nie', opts, async () => {
  const S = stand(0).S;
  const text = Array.from({ length: 60 }, (_, i) => fill(S.CHUNK / 3 + i * 37) + IBAN).join(' ');
  const runs = await Promise.all([100, 15, 0].map(async (je) => { const s = stand(je); return { r: await s.scan(text), n: s.pausen.length }; }));
  assert.ok(runs[0].n > runs[1].n && runs[1].n > runs[2].n && runs[2].n === 0, runs.map((x) => x.n).join());
  const key = (r) => r.findings.map((f) => f.id + ':' + f.start).join();
  assert.equal(runs[0].r.findings.filter((f) => f.id === 'iban').length, 60);
  assert.equal(key(runs[0].r), key(runs[1].r));
  assert.equal(key(runs[0].r), key(runs[2].r));
});

test('Frist wird nach jedem Stueck geprueft, nicht erst an der Scheibengrenze: unscannable, Funde bleiben', opts, async () => {
  const s = stand(10, 25);   // Frist nach 25 ms, Scheibe erst nach 40 ms
  const r = await s.scan(IBAN + ' ' + fill(5 * s.S.CHUNK));
  assert.equal(r.unscannable, true);
  assert.equal(s.chunk, 3, 'nach dem dritten Stueck (30 ms) abgebrochen');
  assert.equal(s.pausen.length, 0);
  assert.equal(r.findings.map((f) => f.id).join(), 'iban');
});

test('Kein Block deutlich ueber der Scheibe: hoechstens SLICE_MS + ein Stueck (<= 60 ms bei 15 ms je Stueck)', opts, async () => {
  const s = stand(15);
  const r = await s.scan(fill(20 * s.S.CHUNK));
  assert.equal(r.unscannable, false);
  // Pausen nach Stueck k liegen bei k * 15 Test-ms; Abstaende zwischen Start, Pausen und Ende.
  const marks = [0, ...s.pausen.map((k) => k * 15), s.chunk * 15];
  const longest = Math.max(...marks.slice(1).map((m, i) => m - marks[i]));
  assert.ok(longest >= s.S.SLICE_MS && longest <= 60, 'laengster Block ' + longest + ' ms');
});

test('Messwert: echter laengster Block bei 2 MB Text bleibt unter 100 ms (Spielraum gegen Last)', opts, async () => {
  const DLX = load(FILES, { setTimeout: (f, ms) => { block.max = Math.max(block.max, performance.now() - block.from); return setTimeout(() => { block.from = performance.now(); f(); }, ms); } });
  const block = { from: 0, max: 0 };
  const eng = DLX.policy.engineConfig(DLX.policy.defaults('de-CH'));
  const detect = (part) => { const r = DLX.engine.scan(part, eng); return { findings: Array.from(r.findings), unscannable: r.unscannable }; };
  const text = ('Protokoll Sitzung Termine Budget 1234567890 ' + IBAN + '\n').repeat(28000);
  block.from = performance.now();
  const r = await DLX.stuecke.scan(text, detect);
  block.max = Math.max(block.max, performance.now() - block.from);
  assert.equal(r.unscannable, false);
  assert.ok(block.max < 100, 'laengster Block ' + block.max.toFixed(1) + ' ms (Ziel ~40-60 ms)');
});
