// Fasst exportierte Nachweis-Berichte (HTML-Dateien aus der Erweiterung) zu einem
// Firmenbericht zusammen - lokal, ohne Netz, ohne Abhaengigkeit (Design-Review
// Bericht 16.10.2026, Auflagen 2-6):
//   node scripts/bericht-sammeln.mjs [--min 5] [--out <neue-datei.md>] <datei|ordner> ...
// Liest je Datei nur den einen JSON-Block (hoechstens 1 MB, kein HTML-Parser, kein eval),
// prueft ihn streng (common/bericht.js validate) und verwirft Ungueltiges ganz. Jede
// exportId zaehlt einmal, leere Exporte zaehlen nicht. Unter der Mindestanzahl (>= 5)
// bricht das Skript ohne Teilsummen ab. Ausgabe nie je Datei; --out schreibt nur eine
// neue Datei (nie ueberschreiben). Danach die einzelnen Dateien loeschen.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MIN = 5;
const MAX_BYTES = 1024 * 1024;

export function loadBericht() {
  const ctx = vm.createContext({ Intl });
  // Texte des Berichts (rep_*) aus _locales wie in der Erweiterung.
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'extension', 'common', 'i18n.js'), 'utf8'), ctx, { filename: 'i18n.js' });
  for (const l of ['de', 'en']) ctx.DLX.i18n.add(l, JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', '_locales', l, 'messages.json'), 'utf8')));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'extension', 'common', 'bericht.js'), 'utf8'), ctx, { filename: 'bericht.js' });
  return ctx.DLX.bericht;
}

// Dateien (oder .html-Dateien eines Ordners) -> { merged, valid, rejected }.
export function collect(inputs, B = loadBericht()) {
  const files = [];
  for (const p of inputs) {
    const s = fs.statSync(p);
    if (s.isDirectory()) for (const e of fs.readdirSync(p)) { if (/\.html?$/i.test(e)) files.push(path.join(p, e)); } else files.push(p);
  }
  const ok = [];
  let rejected = 0;
  for (const f of files) {
    const st = fs.statSync(f);
    const x = st.isFile() && st.size <= MAX_BYTES ? B.extract(fs.readFileSync(f, 'utf8')) : null;
    if (x) ok.push(x); else rejected++;
  }
  // Nur eindeutige, nicht leere Exporte zaehlen (Auflage 2).
  const ids = new Set();
  const valid = ok.filter((x) => !ids.has(x.exportId) && ids.add(x.exportId) && B.ACTIONS.some((a) => x.totals[a] > 0));
  return { merged: B.merge(valid), valid: valid.length, rejected, files: files.length };
}

export function render(r, B) {
  const L = [];
  const row = (label, o) => `| ${label} | ${B.ACTIONS.map((a) => o[a]).join(' | ')} |`;
  const head = `| | ${B.ACTIONS.map((a) => B.t('de', 'a_' + a)).join(' | ')} |\n|---|${B.ACTIONS.map(() => '---:').join('|')}|`;
  L.push('# Nachweis-Bericht (zusammengefasst)', '', `Exporte: ${r.valid} · Zeitraum: ${r.merged.from} – ${r.merged.to}`, '');
  L.push('## Treffer nach Aktion', '', head, row('Summe', r.merged.totals), '');
  L.push('## Treffer nach Datentyp', '', head, ...B.CATS.filter((c) => r.merged.byCat[c]).map((c) => row(c, r.merged.byCat[c])), '');
  L.push('## Treffer nach KI-Seite', '', head, ...B.SITES.filter((s) => r.merged.bySite[s]).map((s) => row(s, r.merged.bySite[s])), '');
  L.push('## Aktive Regeln (Anzahl Exporte)', '', ...Object.entries(r.merged.policies).sort().map(([k, n]) => `- ${k}: ${n}`), '');
  L.push(B.t('de', 'note'), '');
  return L.join('\n');
}

function main(argv) {
  let min = MIN, out = null;
  const inputs = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--min') min = Number(argv[++i]);
    else if (argv[i] === '--out') out = argv[++i];
    else inputs.push(argv[i]);
  }
  if (!Number.isInteger(min) || min < MIN) { process.stderr.write(`--min muss eine ganze Zahl >= ${MIN} sein.\n`); return 2; }
  if (!inputs.length) { process.stderr.write('Aufruf: node scripts/bericht-sammeln.mjs [--min 5] [--out <neue-datei.md>] <datei|ordner> ...\n'); return 2; }
  const B = loadBericht();
  const r = collect(inputs, B);
  process.stderr.write(`Gelesen: ${r.files} Dateien, gueltig und eindeutig: ${r.valid}, verworfen: ${r.rejected}\n`);
  if (r.valid < min) { process.stderr.write(`Abbruch: weniger als ${min} gueltige, eindeutige und nicht leere Exporte - keine Summen ausgegeben.\n`); return 1; }
  const text = render(r, B);
  if (out) {
    const abs = path.resolve(out);
    if (inputs.some((p) => path.resolve(p) === abs)) { process.stderr.write('--out darf keine Eingabedatei sein.\n'); return 2; }
    fs.writeFileSync(abs, text, { flag: 'wx' });
  } else process.stdout.write(text);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
export { main };
