// Bilder fuer den Chrome-Web-Store-Eintrag (docs/store/bilder): vorgegebene Groessen,
// 24-Bit-PNG ohne Alphakanal, keine Text- oder Zeit-Metadaten, alle in der Doku verlinkt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers/load.mjs';

const DIR = path.join(ROOT, 'docs', 'store', 'bilder');
const GROESSE = { 'kachel-klein-440x280.png': [440, 280], 'kachel-gross-1400x560.png': [1400, 560] };
const SPRACHEN = ['en', 'de'];
const SCREENS = ['1-senden', '2-tippen', '3-popup', '4-einstellungen'];
for (const l of SPRACHEN) for (const s of SCREENS) GROESSE[`screenshot-${l}-${s}.png`] = [1280, 800];

function chunks(buf) {
  const out = [];
  for (let o = 8; o < buf.length;) {
    const n = buf.readUInt32BE(o);
    out.push(buf.toString('latin1', o + 4, o + 8));
    o += 12 + n;
  }
  return out;
}

test('Store-Bilder: Groesse, 24-Bit-PNG, keine Metadaten', () => {
  for (const [f, [w, h]] of Object.entries(GROESSE)) {
    const buf = fs.readFileSync(path.join(DIR, f));
    assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], f);
    assert.deepEqual([buf.readUInt32BE(16), buf.readUInt32BE(20)], [w, h], f);
    assert.deepEqual([buf[24], buf[25]], [8, 2], `${f}: 8 Bit RGB ohne Alpha`);
    const c = chunks(buf);
    for (const bad of ['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']) assert.ok(!c.includes(bad), `${f}: ${bad}`);
  }
});

test('Store-Bilder: genau die erwarteten Dateien, alle in der Store-Anleitung verlinkt', () => {
  assert.deepEqual(fs.readdirSync(DIR).sort(), Object.keys(GROESSE).sort());
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'store', 'chrome-web-store.md'), 'utf8');
  for (const f of Object.keys(GROESSE)) assert.ok(doc.includes(`(bilder/${f})`), f);
});
