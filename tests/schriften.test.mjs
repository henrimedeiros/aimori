// Schriften der Marke (Design-Review Marke 16.10.2026, docs/sicherheit/design-review-aimori-16-10.md,
// Auflagen 1 und 2): nur lokal und gepinnt, CSP font-src 'self', fonts.css nur in
// Erweiterungs-HTML, nie in Inhaltsskripten oder fuer Webseiten freigegeben.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, EXT } from './helpers/load.mjs';

const read = (...p) => fs.readFileSync(path.join(EXT, ...p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pins = JSON.parse(read('fonts', 'PINS.json'));

test('Schriften: nur gepinnte Dateien, SHA-256 passt, woff2 beginnt mit wOF2 (Auflage 1)', () => {
  const files = fs.readdirSync(path.join(EXT, 'fonts')).filter((f) => f !== 'PINS.json').sort();
  assert.deepEqual(files, Object.keys(pins.dateien).sort());
  for (const [f, p] of Object.entries(pins.dateien)) {
    const buf = fs.readFileSync(path.join(EXT, 'fonts', f));
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), p.sha256, f);
    if (f.endsWith('.woff2')) assert.equal(buf.subarray(0, 4).toString('latin1'), 'wOF2', f);
    else assert.match(buf.toString('utf8'), /SIL Open Font License, Version 1\.1/, f);
    assert.ok(Object.hasOwn(pins.pakete, p.paket), f);
  }
  assert.deepEqual(Object.keys(pins.pakete).sort(), ['@fontsource-variable/geist', '@fontsource-variable/space-grotesk']);
  for (const p of Object.values(pins.pakete)) {
    assert.equal(p.version, '5.3.0');
    assert.equal(p.lizenz, 'OFL-1.1');
    assert.match(p.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
  }
  const pkg = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8') + fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');
  assert.ok(!/fontsource/.test(pkg), 'keine Abhaengigkeit');
  const notices = fs.readFileSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  assert.match(notices, /Space Grotesk/);
  assert.match(notices, /Geist/);
});

test('fonts.css: nur @font-face mit lokalen, gepinnten woff2 (Auflage 2)', () => {
  const css = read('ui', 'fonts.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 4);
  for (const u of urls) {
    const m = /^\.\.\/fonts\/([a-z-]+\.woff2)$/.exec(u);
    assert.ok(m && Object.hasOwn(pins.dateien, m[1]), u);
  }
  assert.doesNotMatch(css, /@import|https?:|data:|attr\(/i);
  assert.deepEqual([...new Set(css.match(/@[a-z-]+/g))], ['@font-face']);
});

test('CSP: font-src nur self, sonst unveraendert streng; Schriften nie fuer Webseiten freigegeben (Auflage 2)', () => {
  const csp = manifest.content_security_policy.extension_pages;
  const dir = Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ')]));
  assert.equal(dir['font-src'], "'self'");
  assert.equal(dir['script-src'], "'self' 'wasm-unsafe-eval'");
  assert.equal(dir['object-src'], "'none'");
  assert.equal(dir['connect-src'], "'none'");
  assert.equal(dir['style-src'], "'self'");
  assert.equal(dir['img-src'], "'self' data:");
  const war = JSON.stringify(manifest.web_accessible_resources);
  assert.ok(!/fonts|\.woff2|\.svg|icons/.test(war), war);
  for (const cs of manifest.content_scripts) assert.ok(!cs.css, 'kein CSS in Inhaltsskripten');
  for (const f of manifest.content_scripts.flatMap((c) => c.js)) assert.ok(!/@font-face|fonts\/|\.woff2/.test(read(f)), f);
});

test('fonts.css nur in Erweiterungs-HTML, vor tokens.css', () => {
  const html = fs.readdirSync(path.join(EXT, 'ui')).filter((f) => f.endsWith('.html'));
  for (const f of html) {
    const s = read('ui', f);
    if (!s.includes('href="tokens.css"')) continue;
    const a = s.indexOf('href="fonts.css"'), b = s.indexOf('href="tokens.css"');
    assert.ok(a > 0 && a < b, f);
  }
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'vendor' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
  const users = walk(EXT).filter((f) => /\.(js|html|css|json)$/.test(f) && fs.readFileSync(f, 'utf8').includes('fonts.css'));
  for (const f of users) assert.match(path.relative(EXT, f).replace(/\\/g, '/'), /^ui\/[a-z]+\.html$/);
});
