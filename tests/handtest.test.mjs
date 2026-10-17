// Waechter fuer den Handtest auf echten KI-Seiten (Design-Review Handtest 13.10.2026,
// Auflagen 3, 4, 6, 8, 11): nur vier feste Hosts, nie Microsoft-365-Hosts als Ziel,
// DevTools nur ueber die Pipe (Review 14.10.2026), keine Cookie-/Speicher-/Netz-Zugriffe,
// Attrappe nie mit dem dauerhaften Profil, Profil und Ergebnisse nie in Git.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers/load.mjs';
import { SEITEN, MANUELL, TEXTE, PROFIL, ERGEBNIS, EDGE, ERWEITERUNG_ID, edgeArgs, edgeEnv, profilFuer, erweiterungsId, stoppHost } from '../scripts/handtest/seiten.mjs';

const DIR = path.join(ROOT, 'scripts', 'handtest');
const quellen = fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs')).map((f) => [f, fs.readFileSync(path.join(DIR, f), 'utf8')]);

test('Handtest: nur die vier festen Hosts, nie Microsoft 365', () => {
  assert.deepEqual(SEITEN.map((s) => s.host), ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com']);
  for (const s of SEITEN) assert.equal(new URL(s.url).host, s.host);
  assert.ok(Object.isFrozen(SEITEN));
  assert.deepEqual([...MANUELL], ['copilot.cloud.microsoft', 'm365.cloud.microsoft']);
  for (const [f, src] of quellen) {
    const ziele = [...src.matchAll(/https:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]);
    assert.deepEqual(ziele.filter((u) => /cloud\.microsoft|m365/i.test(u)), [], f);
  }
});

test('Handtest: DevTools nur ueber die Pipe, nur im Lauf (Review 14.10.)', () => {
  const mit = edgeArgs({ profil: 'X', pipe: true });
  assert.ok(mit.includes('--remote-debugging-pipe'));
  assert.ok(mit.includes('--disable-sync') && mit.includes('--no-first-run'));
  assert.ok(!mit.some((a) => /disable-features|load-extension/.test(a)), 'ohne Feature-Flag und --load-extension (Auflage 12)');
  assert.ok(!edgeArgs({ profil: 'X' }).some((a) => /remote-debugging/.test(a)), 'start.mjs ohne DevTools');
  assert.equal(EDGE, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
  const alt = process.env.__COMPAT_LAYER;
  process.env.__COMPAT_LAYER = 'X';
  try { assert.ok(!('__COMPAT_LAYER' in edgeEnv()), 'sonst startet Edge neu und verliert die Pipe'); }
  finally { if (alt === undefined) delete process.env.__COMPAT_LAYER; else process.env.__COMPAT_LAYER = alt; }
});

test('Handtest: Erweiterung nur aus EXT mit fester ID, Methoden-Allowlist, Pruefsperre', () => {
  assert.equal(erweiterungsId(), ERWEITERUNG_ID);
  const lauf = quellen.find(([f]) => f === 'lauf.mjs')[1];
  for (const [f, src] of quellen) if (f !== 'lauf.mjs') assert.ok(!/enable-unsafe-extension-debugging/.test(src), f);
  assert.equal([...lauf.matchAll(/'Extensions\.loadUnpacked', \{ path: ([^ }]+) \}/g)].map((m) => m[1]).join(), 'extPfad');
  assert.match(lauf, /const extPfad = fs\.realpathSync\(EXT\);/);
  assert.equal([...lauf.matchAll(/'Extensions\.uninstall', \{ id: ([^ }]+) \}/g)].map((m) => m[1]).join(), 'ERWEITERUNG_ID');
  assert.match(lauf, /if \(!ERLAUBT\.has\(method\)\) throw new Abbruch/);
  const erlaubt = lauf.match(/const ERLAUBT = new Set\(\[([^\]]+)\]\)/)[1];
  assert.ok(!/Fetch|Network|Storage|navigate|Cookie|Extensions\.(?!loadUnpacked|uninstall)/.test(erlaubt));
  assert.match(lauf, /if \(!ATTRAPPE && !gepruefterStand\(\)\) \{/);
  // Gepruefter Stand: Handtest-Skripte UND Erweiterung, nur Security-Freigabe zaehlt.
  assert.equal((lauf.match(/'--', 'scripts\/handtest', 'extension'\)/g) || []).length, 2);
  const freigabe = new RegExp(lauf.match(/const FREIGABE = \/(.+)\/m;/)[1], 'm');
  assert.ok(freigabe.test('x\nSecurity: freigegeben\n') && freigabe.test('Security: freigegeben mit Auflagen'));
  assert.ok(!freigabe.test('Security: abgelehnt') && !freigabe.test('Security: braucht Ja') && !freigabe.test('x Security: freigegeben'));
});

test('Handtest: Microsoft-365- und Login-Hosts stoppen sofort', () => {
  for (const h of ['m365.cloud.microsoft', 'copilot.cloud.microsoft', 'x.cloud.microsoft', 'login.microsoftonline.com', 'login.live.com']) assert.ok(stoppHost(h), h);
  for (const s of SEITEN) assert.ok(!stoppHost(s.host), s.host);
});

test('Handtest: keine verbotenen Zugriffe im Quelltext', () => {
  const VERBOTEN = [/remote-allow-origins/, /remote-debugging-port/, /load-extension/, /DisableLoadExtension/, /\bFetch\./, /\bNetwork\./,
    /\bStorage\./, /Page\.navigate/, /document\.cookie/, /localStorage/, /sessionStorage/, /getCookies/, /insertText/, /\/IM\b/];
  const hits = [];
  for (const [f, src] of quellen) for (const re of VERBOTEN) if (re.test(src)) hits.push(`${f}: ${re}`);
  assert.deepEqual(hits, []);
});

test('Handtest: nur offizielle Testwerte und der harmlose Text', () => {
  assert.deepEqual(Object.values(TEXTE), ['IBAN CH9300762011623852957', 'AHV 756.1234.5678.97 Key ' + 'AKIA' + 'IOSFODNN7EXAMPLE', 'Hallo, nur ein Test.']);
});

test('Handtest: Attrappe nie mit dem dauerhaften Profil', () => {
  assert.equal(profilFuer(false), PROFIL);
  assert.notEqual(profilFuer(true, 'T'), PROFIL);
  assert.throws(() => profilFuer(true));
});

test('Handtest: Profil und Ergebnisse gitignoriert', () => {
  const ign = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/);
  for (const d of [PROFIL, ERGEBNIS]) assert.ok(ign.includes('/' + path.basename(d) + '/'), path.basename(d));
});

test('Handtest: HANDTEST_NUR schraenkt nur auf feste Hosts ein, nie darueber hinaus', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'handtest', 'lauf.mjs'), 'utf8');
  assert.match(src, /HANDTEST_NUR\.split\(','\)\.filter\(\(h\) => SEITEN\.some\(\(s\) => s\.host === h\)\)/);
  assert.match(src, /for \(const s of SEITEN\) if \(!NUR \|\| NUR\.includes\(s\.host\)\) await seite\(s\);/);
});

test('Handtest: Mausklicks nur ueber klickEigen auf Knoepfe der eigenen Leiste (data-k), Punkt im eigenen Frame', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'handtest', 'lauf.mjs'), 'utf8');
  assert.equal((src.match(/Input\.dispatchMouseEvent/g) || []).length, 2, 'nur Allowlist und klickEigen');
  const fn = src.slice(src.indexOf('async function klickEigen'), src.indexOf('// Screenshot nur als Ausschnitt'));
  assert.match(fn, /Input\.dispatchMouseEvent/);
  assert.match(fn, /if \(!\(x > q\[0\] && x < q\[2\] && y > q\[1\] && y < q\[5\]\)\) return false;/);
  assert.match(fn, /await pruefeHost\(\);/);
  assert.doesNotMatch(src, /\.click\(\)/, 'keine unechten Klicks (die Leiste nimmt sie nicht an)');
});
