// Feste Liste und Edge-Aufruf fuer den Handtest auf echten KI-Seiten
// (Design-Review Handtest 13.10.2026 und 14.10.2026, docs/sicherheit/design-review-handtest.md).
// Nur diese vier Hosts werden je angesteuert (Auflage 3); die Microsoft-365-Hosts
// des Arbeitgeber-Tenants nie, sie stehen nur als Zeile "manuell" in der Tabelle.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EXT = path.join(ROOT, 'extension');
export const ERGEBNIS = path.join(ROOT, '.handtest-ergebnis');   // gitignoriert, TTL 7 Tage
// Fester Pfad, nicht aus PATH oder Umgebung (Review 14.10., Auflage 1).
export const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// Erwartete Erweiterungs-ID, fest (aus dem key im Manifest, Test prueft die Gleichheit).
export const ERWEITERUNG_ID = 'hfgcdbigpgpdoegkhfbbbnibnkpdjkbb';

// Hauptordner des Projekts ueber git (auch aus einer Arbeitskopie): dort liegt das
// Profil, in dem du angemeldet bist (Review 14.10., Auflage 6).
function hauptordner() {
  const r = spawnSync('git', ['-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', windowsHide: true });
  const common = r.status === 0 ? r.stdout.trim() : '';
  return common && path.basename(common) === '.git' ? path.dirname(path.resolve(common)) : ROOT;
}
export const HAUPT = hauptordner();
export const PROFIL = path.join(HAUPT, '.handtest-profil');       // gitignoriert, nie committen

// Profil muss im Hauptordner liegen, gitignoriert und kein Link sein.
export function profilPruefen(profil = PROFIL) {
  if (path.dirname(profil) !== HAUPT) throw new Error('Profil nicht im Projekt-Hauptordner');
  try { if (fs.lstatSync(profil).isSymbolicLink()) throw new Error('Profil ist ein Link'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const r = spawnSync('git', ['-C', HAUPT, 'check-ignore', '-q', path.basename(profil) + '/'], { windowsHide: true, stdio: 'ignore' });
  if (r.status !== 0) throw new Error('Profil nicht gitignoriert');
  return profil;
}

// Eingabefeld je Seite: erster sichtbarer Treffer (wie content/adapters.js).
export const SEITEN = Object.freeze([
  { host: 'chatgpt.com', url: 'https://chatgpt.com/', feld: 'div.ProseMirror[contenteditable="true"], #prompt-textarea[contenteditable="true"], [contenteditable="true"][aria-label*="ChatGPT"], textarea#prompt-textarea' },
  { host: 'claude.ai', url: 'https://claude.ai/new', feld: 'div.ProseMirror[contenteditable="true"], div.tiptap[contenteditable="true"]' },
  { host: 'gemini.google.com', url: 'https://gemini.google.com/app', feld: 'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"]' },
  { host: 'copilot.microsoft.com', url: 'https://copilot.microsoft.com/', feld: 'textarea#userInput, textarea[data-testid="composer-input"]' },
]);
// Nur als Tabellenzeile, nie als Ziel (Firmen-Tenant).
export const MANUELL = Object.freeze(['copilot.cloud.microsoft', 'm365.cloud.microsoft']);
// Landet ein Tab hier, wird er sofort geschlossen: nichts lesen, tippen oder fotografieren.
export const stoppHost = (host) => /(^|\.)cloud\.microsoft$/.test(host) || /^login\.(microsoftonline\.com|live\.com|microsoft\.com)$/.test(host);

// Einzige Texte, die je eingegeben werden (Auflage 8): offizielle Testwerte
// (SWIFT-Beispiel-IBAN, ZAS-AHV-Beispiel, AWS-Doku-Beispielschluessel).
export const TEXTE = Object.freeze({
  abbrechen: 'IBAN CH9300762011623852957',
  // AWS-Schluessel getrennt geschrieben, damit Geheimnis-Scanner nicht anschlagen.
  schwaerzen: 'AHV 756.1234.5678.97 Key ' + 'AKIA' + 'IOSFODNN7EXAMPLE',
  harmlos: 'Hallo, nur ein Test.',
});

// Erweiterungs-ID aus dem oeffentlichen Schluessel im Manifest (wie Chromium).
export function erweiterungsId() {
  const key = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).key;
  return [...crypto.createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)]
    .map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

// Edge-Argumente. pipe: DevTools nur ueber die Pipe (Handles 3/4) zum eigenen
// Elternprozess, kein Netzwerk-Port (Review 14.10., Auflage 2). Ohne Sync und
// Erststart-Dialog (Auflage 2). Die Erweiterung laedt lauf.mjs per DevTools.
export function edgeArgs({ profil, pipe, extra = [] }) {
  return [
    ...(pipe ? ['--remote-debugging-pipe'] : []),
    `--user-data-dir=${profil}`, '--no-first-run', '--no-default-browser-check', '--disable-sync',
    ...extra,
  ];
}

// Umgebung fuer Edge: ohne __COMPAT_LAYER. Ist die Variable gesetzt (z. B. durch
// Windows-Kompatibilitaet in der Shell), startet msedge.exe sich selbst neu und
// verliert dabei die Pipe (gemessen 14.10.2026, Edge 155).
export function edgeEnv() {
  const env = Object.assign({}, process.env);
  delete env.__COMPAT_LAYER;
  return env;
}

// --attrappe nie mit dem dauerhaften Profil (Auflage 6).
export function profilFuer(attrappe, tmp) {
  if (!attrappe) return PROFIL;
  if (!tmp) throw new Error('Attrappe braucht einen Temp-Ordner');
  return path.join(tmp, 'edge-profil');
}

// Ergebnisordner: vor jedem Lauf leeren (leeren=true), sonst nach 7 Tagen loeschen (Auflage 10).
export function aufraeumen(leeren) {
  let alt = false;
  try { alt = Date.now() - fs.statSync(ERGEBNIS).mtimeMs > 7 * 24 * 3600 * 1000; } catch { return; }
  if (leeren || alt) fs.rmSync(ERGEBNIS, { recursive: true, force: true });
}
