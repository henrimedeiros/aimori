import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { collect, storeManifest, manifestProblems, writeZip, readZip, crc32, extensionId, publicKeyOf } from '../scripts/pack-store.mjs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('Store-Manifest ohne "key", sonst unveraendert', () => {
  const text = read('extension/manifest.json');
  const m = JSON.parse(storeManifest(text));
  assert.equal(m.key, undefined);
  const orig = JSON.parse(text);
  delete orig.key;
  assert.deepEqual(m, orig);
});

test('Entwicklungs-ID aus dem Manifest-Schluessel, ADMX-Pfade mit der Store-ID', () => {
  const id = extensionId(JSON.parse(read('extension/manifest.json')).key);
  assert.equal(id, 'hfgcdbigpgpdoegkhfbbbnibnkpdjkbb');
  // Seit der Einreichung am 18.10.2026 gelten die Vorlagen fuer die Fassung aus dem Chrome Web Store.
  assert.ok(read('enterprise/admx/dlx-chrome.admx').includes('3rdparty\\extensions\\lefajbhockjgdhaohnacgaggfepianjh\\policy'));
});

test('Paket: keine versteckten Dateien, Schluessel oder Pakete; Manifest-Verweise vorhanden', () => {
  const files = collect();
  assert.ok(files.includes('manifest.json'));
  for (const f of files) assert.doesNotMatch(f, /(^|\/)\.|\.(pem|crx|key|map|zip)$/i, f);
  const problems = manifestProblems(JSON.parse(storeManifest(read('extension/manifest.json'))), files)
    .filter((p) => !/vendor\/(ki|ocr)\/ leer/.test(p)); // erzeugte Dateien fehlen ohne Build
  assert.deepEqual(problems, []);
  assert.ok(manifestProblems({ manifest_version: 3, version: '1.0', key: 'x', icons: { 16: 'fehlt.png' } }, []).some((p) => p.includes('"key"')));
  assert.ok(manifestProblems({ manifest_version: 3, version: '1.0', icons: { 16: 'fehlt.png' } }, []).some((p) => p.includes('fehlt.png')));
});

test('ZIP: Rundweg mit UTF-8-Namen, leerer und unkomprimierbarer Datei, reproduzierbar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-store-'));
  try {
    const entries = [
      { name: 'manifest.json', data: Buffer.from('{"a":1}\n') },
      { name: 'ui/schrift-größe.txt', data: Buffer.from('ä'.repeat(1000)) },
      { name: 'leer.txt', data: Buffer.alloc(0) },
      { name: 'zufall.bin', data: crypto.randomBytes(5000) },
    ];
    writeZip(path.join(dir, 'a.zip'), entries);
    writeZip(path.join(dir, 'b.zip'), entries);
    const a = fs.readFileSync(path.join(dir, 'a.zip'));
    assert.ok(a.equals(fs.readFileSync(path.join(dir, 'b.zip'))), 'gleiche Eingabe -> gleiches ZIP');
    const back = readZip(a);
    assert.deepEqual([...back.keys()], entries.map((e) => e.name));
    for (const e of entries) assert.ok(back.get(e.name).equals(e.data), e.name);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CRC-32 und Schluesselabgleich', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.equal(publicKeyOf(pem), publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
});
