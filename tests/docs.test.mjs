// Doku: Datentypen-Liste aktuell, alle Richtlinien-Schluessel dokumentiert,
// relative Links aufloesbar.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, EXT } from './helpers/load.mjs';
import { render } from '../scripts/build-datatypes-doc.mjs';

test('docs/datentypen.md ist aktuell (npm run build)', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'docs', 'datentypen.md'), 'utf8').replace(/\r\n/g, '\n'), render());
});

test('jeder Richtlinien-Schluessel ist in docs/einstellungen.md beschrieben', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8'));
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'einstellungen.md'), 'utf8');
  for (const k of Object.keys(schema.properties)) assert.ok(doc.includes('`' + k + '`'), k);
  const branding = fs.readFileSync(path.join(ROOT, 'docs', 'branding.md'), 'utf8');
  for (const k of Object.keys(schema.properties.branding.properties)) assert.ok(branding.includes('`' + k + '`'), k);
});

test('relative Links in Doku und LIESMICH zeigen auf vorhandene Dateien', () => {
  const mds = ['LIESMICH.md', 'README.md', 'scripts/e2e/README.md'];
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.md') && mds.push(path.join(d, e.name))));
  walk('docs');
  for (const md of mds) {
    const src = fs.readFileSync(path.join(ROOT, md), 'utf8');
    for (const [, link] of src.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^https?:/.test(link)) continue;
      assert.ok(fs.existsSync(path.join(ROOT, path.dirname(md), link)), `${md}: ${link}`);
    }
  }
});
