// Store-Paket per Chrome-Web-Store-API (v2) hochladen und zur Ueberpruefung einreichen,
// ohne Entwickler-Dashboard. Paket vorher mit scripts/pack-store.mjs bauen.
//   node scripts/store-hochladen.mjs status                     Stand im Store (Versionen, Pruefung)
//   node scripts/store-hochladen.mjs hochladen [--zip <datei>]  Paket hochladen (noch nicht einreichen)
//   node scripts/store-hochladen.mjs einreichen [--gestaffelt]  hochgeladene Version zur Ueberpruefung
//                                                               einreichen; --gestaffelt: nach der Freigabe
//                                                               erst auf Klick im Dashboard veroeffentlichen
//   node scripts/store-hochladen.mjs anmelden --client <client_secret.json> --publisher <ID> [--ersetzen]
//                                                               Refresh-Token ueber localhost holen und die
//                                                               Zugangsdatei schreiben (einmalig)
//   node scripts/store-hochladen.mjs schuetzen                  Klartext-Zugangsdatei verschluesseln
// Zugangsdaten (docs/store/chrome-web-store.md, Abschnitt API): clientId, clientSecret, refreshToken
// und publisherId, Standard ~/.aimori-store.json, sonst --zugang <datei> oder Umgebungsvariable
// AIMORI_STORE_ZUGANG. Die Datei darf nicht im Repository liegen. Unter Windows sind clientSecret und
// refreshToken per DPAPI an das Benutzerkonto gebunden verschluesselt; Klartext wird dort abgelehnt.
// Tokens werden nie ausgegeben, auch nicht in Fehlermeldungen.
// hochladen, einreichen und anmelden laufen nur im eigenen Terminal: Abbruch ohne Eingabe-Konsole
// und in automatisierten Sitzungen; vor hochladen und einreichen muss die Version eingetippt werden.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readZip } from './pack-store.mjs';
import { STORE_ID } from './build-admx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://chromewebstore.googleapis.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ZUGANG_FELDER = ['clientId', 'clientSecret', 'refreshToken', 'publisherId'];
const WARTEN_MS = 5000;
const WARTEN_MAX = 120; // hoechstens 10 Minuten auf die Verarbeitung im Store warten

export class StoreFehler extends Error {}
const fehler = (msg) => { throw new StoreFehler(msg); };

export const standardZugang = () => process.env.AIMORI_STORE_ZUGANG || path.join(os.homedir(), '.aimori-store.json');

// Liegt datei innerhalb von ordner (auch ueber Links)?
function innerhalb(datei, ordner) {
  const echt = (p) => { try { return fs.realpathSync.native(p); } catch (e) { return path.resolve(p); } };
  const rel = path.relative(echt(ordner), echt(datei));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// DPAPI (Windows, Bereich CurrentUser): nur dieses Benutzerkonto auf diesem Rechner kann entschluesseln.
// PowerShell per execFile ohne Shell; Klartext geht nur ueber stdin, nie als Argument.
const DPAPI_SKRIPT = (art) => 'Add-Type -AssemblyName System.Security; '
  + '$e = [Text.Encoding]::UTF8.GetBytes("aimori-store"); '
  + '$d = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); '
  + `$r = [Security.Cryptography.ProtectedData]::${art}($d, $e, [Security.Cryptography.DataProtectionScope]::CurrentUser); `
  + '[Console]::Out.Write([Convert]::ToBase64String($r))';
function dpapi(art, b64) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', DPAPI_SKRIPT(art)],
    { input: b64, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
}
export const DPAPI = {
  verschluesseln: (text) => dpapi('Protect', Buffer.from(text, 'utf8').toString('base64')),
  entschluesseln: (b64) => Buffer.from(dpapi('Unprotect', b64), 'base64').toString('utf8'),
};
export const standardSchutz = () => (process.platform === 'win32' ? DPAPI : null);

const GESCHUETZT_FELDER = ['clientId', 'publisherId', 'geschuetzt'];
const GEHEIM_FELDER = ['clientSecret', 'refreshToken'];

// Zugangsdaten lesen und pruefen; Fehler nennen nur das Feld, nie den Wert.
// schutz: { verschluesseln, entschluesseln } oder null (Klartext, nur ausserhalb von Windows).
export function ladeZugang(datei, { root = ROOT, schutz = standardSchutz() } = {}) {
  if (!fs.existsSync(datei)) fehler(`Zugangsdaten fehlen: ${datei} (Einrichtung: docs/store/chrome-web-store.md)`);
  if (innerhalb(datei, root)) fehler('Zugangsdaten liegen im Repository - ausserhalb ablegen');
  let z;
  try { z = JSON.parse(fs.readFileSync(datei, 'utf8').replace(/^﻿/, '')); } catch (e) { fehler('Zugangsdaten: kein gueltiges JSON'); }
  if (!z || typeof z !== 'object' || Array.isArray(z)) fehler('Zugangsdaten: Objekt erwartet');
  const erlaubt = 'geschuetzt' in z ? GESCHUETZT_FELDER : ZUGANG_FELDER;
  for (const k of Object.keys(z)) if (!erlaubt.includes(k)) fehler(`Zugangsdaten: unbekanntes Feld ${k}`);
  if ('geschuetzt' in z) {
    if (!schutz) fehler('Zugangsdaten sind verschluesselt und hier nicht lesbar');
    let g;
    try { g = JSON.parse(schutz.entschluesseln(String(z.geschuetzt))); } catch (e) { fehler('Zugangsdaten: Entschluesseln fehlgeschlagen (anderes Benutzerkonto oder anderer Rechner?)'); }
    if (!g || typeof g !== 'object' || Object.keys(g).some((k) => !GEHEIM_FELDER.includes(k))) fehler('Zugangsdaten: verschluesselter Teil ungueltig');
    z = { clientId: z.clientId, clientSecret: g.clientSecret, refreshToken: g.refreshToken, publisherId: z.publisherId };
  } else if (schutz) {
    fehler('Zugangsdaten liegen im Klartext - verschluesseln mit: node scripts/store-hochladen.mjs schuetzen');
  }
  for (const k of ZUGANG_FELDER) if (typeof z[k] !== 'string' || !z[k].trim()) fehler(`Zugangsdaten: ${k} fehlt`);
  if (!/^[A-Za-z0-9-]{1,64}$/.test(z.publisherId)) fehler('Zugangsdaten: publisherId ungueltig');
  return z;
}

// Automatisierte Sitzungen duerfen nicht hochladen, einreichen oder anmelden. Fest gesperrt sind CI
// und die Umgebungsvariablen, deren Name (SHA-256) in FESTE_SPERREN steht. Die lokale, nicht
// versionierte Liste <git-dir>/info/store-sperre (ein Name pro Zeile, # fuer Kommentare) kann die
// Sperre nur erweitern.
const FESTE_SPERREN = new Set([
  '7e2a893e02f19a39d31f4d7e3e5a53ab892e9222f704050120149776db1b7820',
  '5361d3c826d189091ca5a2a19de1998efd2517758411a65b2ec696cea9295db7',
]);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export function sperrDatei(root = ROOT) {
  try {
    const dir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return path.join(path.resolve(root, dir), 'info', 'store-sperre');
  } catch (e) {
    return path.join(root, '.git', 'info', 'store-sperre');
  }
}
export function pruefeSitzung(env = process.env, datei = sperrDatei()) {
  const namen = ['CI'];
  try {
    namen.push(...fs.readFileSync(datei, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#')));
  } catch (e) { /* keine lokale Liste */ }
  const gesetzt = namen.find((n) => env[n]) || Object.keys(env).find((n) => env[n] && FESTE_SPERREN.has(sha256(n)));
  if (gesetzt) fehler(`Abbruch: automatisierte Sitzung (${gesetzt} gesetzt) - nur im eigenen Terminal ausfuehren`);
}

// Ohne Eingabe-Konsole (Pipe, Hintergrund) laeuft nichts, was den Store-Eintrag veraendern kann.
export function nurTerminal(input = process.stdin) {
  if (!input.isTTY) fehler('Abbruch: nur im eigenen Terminal moeglich');
}

// Bestaetigung im eigenen Terminal: ohne Eingabe-Konsole Abbruch, sonst muss erwartet eingetippt werden.
export async function bestaetige(frage, erwartet, { input = process.stdin, output = process.stdout } = {}) {
  nurTerminal(input);
  const rl = readline.createInterface({ input, output });
  let antwortText;
  try { antwortText = await rl.question(`${frage} `); } finally { rl.close(); }
  if (antwortText.trim() !== erwartet) fehler('Abgebrochen: Eingabe stimmt nicht');
}

// Versionen nach Chrome-Regel (1-4 Zahlen mit Punkt) vergleichen: >0, wenn a hoeher ist.
export function vergleicheVersion(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 4; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}

// Paket pruefen, bevor es den Rechner verlaesst: Pruefsumme von pack-store, Version wie im
// Repo, kein Feld "key" und kein privater Schluessel im ZIP. Liefert { buf, version }.
export function pruefePaket(zip, repoVersion) {
  if (!fs.existsSync(zip)) fehler(`Paket fehlt: ${path.basename(zip)} (zuerst node scripts/pack-store.mjs)`);
  if (/-mit-schluessel\.zip$/i.test(zip)) fehler('Paket mit privatem Schluessel wird nicht hochgeladen');
  const buf = fs.readFileSync(zip);
  const sumDatei = zip + '.sha256';
  if (!fs.existsSync(sumDatei)) fehler('Pruefsumme fehlt (.sha256 von pack-store)');
  const soll = fs.readFileSync(sumDatei, 'utf8').trim().split(/\s+/)[0];
  if (crypto.createHash('sha256').update(buf).digest('hex') !== soll) fehler('Pruefsumme stimmt nicht - Paket neu bauen');
  let dateien;
  try { dateien = readZip(buf); } catch (e) { fehler('Paket ist kein lesbares ZIP'); }
  if (dateien.has('key.pem')) fehler('Paket enthaelt key.pem - wird nicht hochgeladen');
  if (!dateien.has('manifest.json')) fehler('Paket ohne manifest.json');
  const m = JSON.parse(dateien.get('manifest.json').toString('utf8'));
  if ('key' in m) fehler('Paket-Manifest enthaelt "key"');
  if (m.version !== repoVersion) fehler(`Paket hat Version ${m.version}, Repository ${repoVersion}`);
  return { buf, version: m.version };
}

// Fehlertext der API kuerzen; nie Header oder Token wiedergeben.
async function antwort(res, was) {
  const text = await res.text();
  let j = null;
  try { j = JSON.parse(text); } catch (e) { /* kein JSON */ }
  if (!res.ok) {
    const msg = (j && j.error && (j.error.message || j.error_description || j.error)) || text;
    fehler(`${was}: HTTP ${res.status} ${String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 300)}`);
  }
  return j || {};
}

// API-Zugriff; fetchFn und schlafen sind fuer Tests austauschbar.
export function storeApi(zugang, { fetchFn = fetch, itemId = STORE_ID, schlafen = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const item = `${API}/v2/publishers/${encodeURIComponent(zugang.publisherId)}/items/${itemId}`;
  let token = null;
  async function auth() {
    if (token) return token;
    const body = new URLSearchParams({ client_id: zugang.clientId, client_secret: zugang.clientSecret, refresh_token: zugang.refreshToken, grant_type: 'refresh_token' });
    const j = await antwort(await fetchFn(TOKEN_URL, { method: 'POST', body }), 'Anmeldung');
    if (typeof j.access_token !== 'string' || !j.access_token) fehler('Anmeldung: kein Zugriffstoken erhalten');
    token = j.access_token;
    return token;
  }
  const kopf = async (extra) => Object.assign({ Authorization: `Bearer ${await auth()}` }, extra);

  async function status() {
    return antwort(await fetchFn(`${item}:fetchStatus`, { headers: await kopf() }), 'Status');
  }

  async function hochladen(buf) {
    const url = `${API}/upload/v2/publishers/${encodeURIComponent(zugang.publisherId)}/items/${itemId}:upload`;
    let j = await antwort(await fetchFn(url, { method: 'POST', headers: await kopf({ 'Content-Type': 'application/zip' }), body: buf }), 'Hochladen');
    let state = j.uploadState;
    // Grosse Pakete verarbeitet der Store asynchron: Stand per fetchStatus abfragen.
    for (let i = 0; state === 'IN_PROGRESS' && i < WARTEN_MAX; i++) {
      await schlafen(WARTEN_MS);
      state = (await status()).lastAsyncUploadState;
    }
    if (state === 'IN_PROGRESS') fehler('Hochladen: Store verarbeitet das Paket noch - spaeter mit "status" pruefen');
    if (state !== 'SUCCEEDED') fehler(`Hochladen: Store meldet ${state || 'keinen Stand'}`);
    return { crxVersion: j.crxVersion };
  }

  async function einreichen(gestaffelt) {
    const body = JSON.stringify({ publishType: gestaffelt ? 'STAGED_PUBLISH' : 'DEFAULT_PUBLISH' });
    return antwort(await fetchFn(`${item}:publish`, { method: 'POST', headers: await kopf({ 'Content-Type': 'application/json' }), body }), 'Einreichen');
  }

  return { status, hochladen, einreichen };
}

// Kurzfassung von fetchStatus fuer die Ausgabe.
export function statusText(s) {
  const zeile = (name, r) => {
    if (!r) return `  ${name}: -`;
    const v = (r.distributionChannels || []).map((d) => d.crxVersion + (d.deployPercentage < 100 ? ` (${d.deployPercentage} %)` : '')).join(', ');
    return `  ${name}: ${r.state || '?'}${v ? ', Version ' + v : ''}`;
  };
  return [zeile('Veroeffentlicht', s.publishedItemRevisionStatus), zeile('Eingereicht', s.submittedItemRevisionStatus),
    `  Letzter Upload: ${s.lastAsyncUploadState || '-'}`, ...(s.takenDown ? ['  ACHTUNG: im Store entfernt'] : []), ...(s.warned ? ['  ACHTUNG: Warnung im Store'] : [])].join('\n');
}

// --- Einmalige Anmeldung: OAuth-Code ueber localhost empfangen, gegen Refresh-Token tauschen ---

export const ANMELDE_PORT = 8765;
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// Client-Datei aus der Cloud Console ("Download JSON", Typ Webanwendung oder Desktop).
export function leseClientDatei(datei) {
  if (!fs.existsSync(datei)) fehler(`Client-Datei fehlt: ${datei}`);
  let j;
  try { j = JSON.parse(fs.readFileSync(datei, 'utf8').replace(/^﻿/, '')); } catch (e) { fehler('Client-Datei: kein gueltiges JSON'); }
  const c = j && (j.web || j.installed);
  if (!c || typeof c.client_id !== 'string' || typeof c.client_secret !== 'string' || !c.client_id || !c.client_secret) {
    fehler('Client-Datei: client_id oder client_secret fehlt');
  }
  return { clientId: c.client_id, clientSecret: c.client_secret };
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Anmelde-Adresse mit state und PKCE; access_type=offline + prompt=consent liefern sicher ein Refresh-Token.
export function anmeldeAnfrage(clientId, redirectUri) {
  const state = b64url(crypto.randomBytes(16));
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  return { url: `${AUTH_URL}?${q}`, state, verifier };
}

// Code gegen Refresh-Token tauschen; Fehler nennen nie Werte.
export async function tauscheCode({ clientId, clientSecret, code, verifier, redirectUri }, fetchFn = fetch) {
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: 'authorization_code' });
  const j = await antwort(await fetchFn(TOKEN_URL, { method: 'POST', body }), 'Anmeldung');
  if (typeof j.refresh_token !== 'string' || !j.refresh_token) fehler('Anmeldung: kein Refresh-Token erhalten - Zugriff unter myaccount.google.com/permissions entfernen und neu anmelden');
  return j.refresh_token;
}

// Zugangsdatei schreiben (nie im Repository); mit schutz sind clientSecret und refreshToken verschluesselt.
export function schreibeZugang(datei, zugang, { ersetzen = false, root = ROOT, schutz = standardSchutz() } = {}) {
  if (innerhalb(datei, root)) fehler('Zugangsdaten liegen im Repository - ausserhalb ablegen');
  if (fs.existsSync(datei) && !ersetzen) fehler(`${datei} gibt es schon (--ersetzen zum Ueberschreiben)`);
  const inhalt = schutz
    ? { clientId: zugang.clientId, publisherId: zugang.publisherId, geschuetzt: schutz.verschluesseln(JSON.stringify({ clientSecret: zugang.clientSecret, refreshToken: zugang.refreshToken })) }
    : zugang;
  fs.writeFileSync(datei, JSON.stringify(inhalt, null, 2) + '\n', { mode: 0o600 });
  ladeZugang(datei, { root, schutz });
}

// Wartet auf die Weiterleitung von Google an http://localhost:<port>/ und liefert den Code.
// Lauscht nur auf der Loopback-Adresse (IPv4 und IPv6), hoechstens fuenf Minuten.
async function warteAufCode(port, state) {
  const http = await import('node:http');
  return new Promise((resolve, reject) => {
    const server = [];
    const ende = (fn, wert) => { clearTimeout(uhr); server.forEach((s) => s.close()); fn(wert); };
    const uhr = setTimeout(() => ende(reject, new StoreFehler('Anmeldung: keine Antwort innerhalb von 5 Minuten')), 300000);
    const behandle = (req, res) => {
      const u = new URL(req.url, `http://localhost:${port}`);
      if (u.pathname !== '/') { res.writeHead(404).end(); return; }
      const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end(ok ? 'Anmeldung erhalten. Dieses Fenster kann geschlossen werden.' : 'Anmeldung fehlgeschlagen.');
      if (ok) ende(resolve, u.searchParams.get('code'));
      else ende(reject, new StoreFehler(`Anmeldung: ${u.searchParams.get('error') || 'ungueltige Antwort'}`));
    };
    let offen = 0;
    for (const host of ['127.0.0.1', '::1']) {
      const s = http.createServer(behandle);
      s.on('error', () => { if (--offen === 0 && !server.some((x) => x.listening)) ende(reject, new StoreFehler(`Anmeldung: Port ${port} belegt`)); });
      offen++;
      s.listen(port, host);
      server.push(s);
    }
  });
}

const hoechsteVersion = (s) => [s.publishedItemRevisionStatus, s.submittedItemRevisionStatus]
  .flatMap((r) => (r && r.distributionChannels) || []).map((d) => d.crxVersion).filter(Boolean)
  .reduce((a, b) => (!a || vergleicheVersion(b, a) > 0 ? b : a), '');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const wert = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const befehl = args[0];
  try {
    if (!['status', 'hochladen', 'einreichen', 'anmelden', 'schuetzen'].includes(befehl)) {
      fehler('Befehl: status | hochladen [--zip <datei>] | einreichen [--gestaffelt] | anmelden --client <datei> --publisher <ID> | schuetzen');
    }
    if (['hochladen', 'einreichen', 'anmelden'].includes(befehl)) { pruefeSitzung(); nurTerminal(); }
    const zugangDatei = path.resolve(wert('--zugang') || standardZugang());
    // Store-Zugriff nur fuer status/hochladen/einreichen; anmelden und schuetzen schreiben die Zugangsdatei.
    const api = ['anmelden', 'schuetzen'].includes(befehl) ? null : storeApi(ladeZugang(zugangDatei));
    const repoVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8')).version;
    if (befehl === 'schuetzen') {
      const schutz = standardSchutz() || fehler('Verschluesseln gibt es nur unter Windows (DPAPI)');
      const z = ladeZugang(zugangDatei, { schutz: null });
      schreibeZugang(zugangDatei, z, { ersetzen: true, schutz });
      console.log(`Zugangsdaten verschluesselt: ${zugangDatei}`);
    } else if (befehl === 'anmelden') {
      const { clientId, clientSecret } = leseClientDatei(path.resolve(wert('--client') || fehler('--client <client_secret.json> fehlt')));
      const publisherId = wert('--publisher') || fehler('--publisher <ID> fehlt (Entwickler-Dashboard, Konto)');
      const ziel = path.resolve(wert('--zugang') || standardZugang());
      if (fs.existsSync(ziel) && !args.includes('--ersetzen')) fehler(`${ziel} gibt es schon (--ersetzen zum Ueberschreiben)`);
      const redirectUri = `http://localhost:${ANMELDE_PORT}`;
      const a = anmeldeAnfrage(clientId, redirectUri);
      console.log(`Im Browser oeffnen und mit dem Konto des Entwickler-Dashboards zulassen:\n${a.url}\n\nWarte auf die Weiterleitung an ${redirectUri} ...`);
      const code = await warteAufCode(ANMELDE_PORT, a.state);
      const refreshToken = await tauscheCode({ clientId, clientSecret, code, verifier: a.verifier, redirectUri });
      schreibeZugang(ziel, { clientId, clientSecret, refreshToken, publisherId }, { ersetzen: args.includes('--ersetzen') });
      console.log(`Zugangsdaten gespeichert: ${ziel}\nDie heruntergeladene Client-Datei wird nicht mehr gebraucht und kann geloescht werden.`);
    } else if (befehl === 'status') {
      console.log(`Erweiterung ${STORE_ID}\n${statusText(await api.status())}`);
    } else if (befehl === 'hochladen') {
      const zip = path.resolve(wert('--zip') || path.join(ROOT, 'dist', `aimori-${repoVersion}-chrome.zip`));
      const { buf, version } = pruefePaket(zip, repoVersion);
      const vorher = hoechsteVersion(await api.status());
      if (vorher && vergleicheVersion(version, vorher) <= 0) fehler(`Version ${version} ist nicht hoeher als ${vorher} im Store`);
      await bestaetige(`${path.basename(zip)} (Version ${version}) in den Store hochladen? Zur Bestaetigung die Version eintippen:`, version);
      console.log(`Lade ${path.basename(zip)} hoch (${(buf.length / 1048576).toFixed(1)} MB, Version ${version}) ...`);
      const r = await api.hochladen(buf);
      console.log(`Hochgeladen: Version ${r.crxVersion || version}. Noch nicht eingereicht - zum Einreichen: node scripts/store-hochladen.mjs einreichen`);
    } else {
      const art = args.includes('--gestaffelt') ? 'gestaffelt (nach der Freigabe im Dashboard veroeffentlichen)' : 'nach der Freigabe sofort veroeffentlichen';
      await bestaetige(`Version ${repoVersion} zur Ueberpruefung einreichen, ${art}? Zur Bestaetigung die Version eintippen:`, repoVersion);
      const r = await api.einreichen(args.includes('--gestaffelt'));
      console.log(`Eingereicht: ${r.state || '?'}${args.includes('--gestaffelt') ? ' (nach der Freigabe im Dashboard veroeffentlichen)' : ''}`);
    }
  } catch (e) {
    console.log(e instanceof StoreFehler ? e.message : `Fehler: ${e.message}`);
    // exitCode statt process.exit: sofortiges Beenden nach fetch bricht unter Windows ab (libuv-Assertion).
    process.exitCode = 1;
  }
}
