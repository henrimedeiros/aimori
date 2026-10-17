// Laedt die klassischen Erweiterungs-Skripte in einen eigenen vm-Kontext,
// so wie der Browser sie als Content Script nacheinander ausfuehrt.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EXT = path.join(ROOT, 'extension');

export const ENGINE_FILES = [
  'engine/core.js', 'engine/muster.js', 'engine/packs-global.js', 'engine/packs-secrets.js', 'engine/packs-marker.js', 'engine/packs-context.js',
  'engine/packs-country.js', 'engine/packs-world.js', 'engine/packs-community.js', 'engine/dictionary.js', 'engine/entschleiern.js', 'engine/tabelle.js', 'engine/engine.js',
];

export function load(files = ENGINE_FILES, extra = {}) {
  const ctx = vm.createContext(Object.assign({ TextEncoder, performance, atob }, extra));
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(EXT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.DLX;
}
