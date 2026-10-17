// Handtest: prueft die Erweiterung auf den echten KI-Seiten (chatgpt.com, claude.ai,
// gemini.google.com, copilot.microsoft.com) im dauerhaften Handtest-Profil, in dem
// du selbst angemeldet bist (scripts/handtest/start.mjs). Je Seite: Feld leeren,
// Testwert Zeichen fuer Zeichen tippen, Live-Hinweis, Enter -> Dialog -> Abbrechen ->
// nicht gesendet, Schwaerzen, harmlosen Text senden. Design-Review Handtest 13.10.2026
// und 14.10.2026 (docs/sicherheit/design-review-handtest.md): DevTools nur ueber die
// Pipe zum eigenen Edge-Prozess (kein Port); Erweiterung per Extensions.loadUnpacked
// nur aus <repo>/extension mit fester ID; CDP-Methoden nur aus der Liste ERLAUBT;
// Runtime.evaluate nur mit konstanten Ausdruecken; gelesen werden nur Eingabefeld,
// Host, eigener Hinweis und eigener Dialog, nie Antworten, Cookies oder Speicher;
// Microsoft-365- und Login-Hosts: Tab sofort zu. Nur lauf.mjs als Ganzes (Auflage 7).
// Aufruf:
//   node scripts/handtest/lauf.mjs              echte Seiten (Profil muss geschlossen sein)
//   node scripts/handtest/lauf.mjs --attrappe   Attrappen, Wegwerf-Profil, ohne Netz
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, EXT, EDGE, ERGEBNIS, SEITEN, MANUELL, TEXTE, ERWEITERUNG_ID, PROFIL, edgeArgs, edgeEnv, profilFuer, profilPruefen,
  erweiterungsId, stoppHost, aufraeumen } from './seiten.mjs';

const ATTRAPPE = process.argv.includes('--attrappe');
// Nur einzelne der festen Seiten (z. B. HANDTEST_NUR=gemini.google.com): schraenkt nur ein,
// fremde Hosts werden ignoriert; ohne Treffer bricht der Lauf ab.
const NUR = process.env.HANDTEST_NUR ? process.env.HANDTEST_NUR.split(',').filter((h) => SEITEN.some((s) => s.host === h)) : null;
if (NUR && !NUR.length) { console.log('ABBRUCH: HANDTEST_NUR nennt keine der festen Seiten.'); console.log('HANDTEST FEHLER'); process.exit(1); }
const ZEITLIMIT = 5 * 60 * 1000;
const ID = ERWEITERUNG_ID;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WARTEN = ATTRAPPE ? 1 : 2;   // echte Seiten reagieren langsamer
class Abbruch extends Error {}

// Einzige CDP-Methoden, die je gesendet werden (Review 14.10., Auflage 5).
const ERLAUBT = new Set(['Extensions.loadUnpacked', 'Extensions.uninstall', 'Target.createTarget', 'Target.attachToTarget',
  'Target.getTargets', 'Target.closeTarget', 'Browser.close', 'Runtime.enable', 'Runtime.disable', 'Runtime.evaluate', 'DOM.enable',
  'DOM.getDocument', 'DOM.describeNode', 'DOM.getBoxModel', 'Emulation.setFocusEmulationEnabled', 'Input.dispatchKeyEvent', 'Input.dispatchMouseEvent',
  'Page.captureScreenshot']);

const SPALTEN = ['Seite geladen', 'Erweiterung aktiv', 'Live-Hinweis', 'Dialog bei Enter', 'Abbrechen: nicht gesendet', 'Schwaerzen', 'Harmlos gesendet'];
const tabelle = new Map(SEITEN.map((s) => [s.host, {}]));

// Echter Lauf (nicht --attrappe) immer nur mit geprueftem Stand: scripts/handtest
// und extension/ ohne uncommittete Aenderungen, letzter Commit mit Security-Freigabe (Review 14.10., Auflage 1).
const FREIGABE = /^Security: freigegeben/m;
function gepruefterStand() {
  const git = (...a) => spawnSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', windowsHide: true });
  const st = git('status', '--porcelain', '--', 'scripts/handtest', 'extension');
  const log = git('log', '-1', '--format=%B', '--', 'scripts/handtest', 'extension');
  return st.status === 0 && !st.stdout.trim() && log.status === 0 && FREIGABE.test(log.stdout);
}
if (!ATTRAPPE && !gepruefterStand()) {
  console.log('ABBRUCH: scripts/handtest hat ungepruefte Aenderungen (erst committen, Pflicht-Pruefung) – nichts gestartet.');
  console.log('HANDTEST FEHLER');
  process.exit(1);
}
// Erweiterung nur aus <repo>/extension, kein Link nach aussen; ID fest (Auflage 3).
const extPfad = fs.realpathSync(EXT);
if (path.dirname(extPfad) !== fs.realpathSync(ROOT) || erweiterungsId() !== ID) throw new Error('Erweiterungsordner oder -ID unerwartet');

aufraeumen(true);
fs.mkdirSync(ERGEBNIS, { recursive: true });

// Attrappe: Wegwerf-Zertifikat (SPKI-Pin), Attrappe nur 127.0.0.1, alle anderen
// Hosts ~NOTFOUND, Wegwerf-Profil im Temp-Ordner (wie scripts/e2e/e2e.mjs).
let tmp = null, site = null;
const extra = [];
if (ATTRAPPE) {
  const { startFakeSite } = await import('../e2e/fake-site.mjs');
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-handtest-'));
  const keyFile = path.join(tmp, 'fake.key'), crtFile = path.join(tmp, 'fake.crt');
  const hosts = SEITEN.map((s) => s.host);
  const env = Object.assign({}, process.env, { MSYS_NO_PATHCONV: '1', MSYS2_ARG_CONV_EXCL: '*' });
  const ok = [process.env.OPENSSL, 'openssl', 'C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe'].filter(Boolean)
    .some((bin) => spawnSync(bin, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', crtFile, '-days', '1',
      '-subj', '/CN=' + hosts[0], '-addext', 'subjectAltName=' + hosts.map((h) => 'DNS:' + h).join(',')], { env, windowsHide: true, stdio: 'ignore' }).status === 0);
  if (!ok) throw new Error('openssl nicht gefunden (OPENSSL=<Pfad> setzen)');
  const spki = crypto.createHash('sha256')
    .update(new crypto.X509Certificate(fs.readFileSync(crtFile)).publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
  site = await startFakeSite(fs.readFileSync(keyFile), fs.readFileSync(crtFile));
  extra.push('--headless=new', '--no-proxy-server', '--disable-background-networking', '--disable-component-update',
    `--ignore-certificate-errors-spki-list=${spki}`, '--lang=de-CH',
    `--host-resolver-rules=${hosts.map((h) => `MAP ${h}:443 127.0.0.1:${site.port}`).join(', ')}, MAP * ~NOTFOUND`);
}
const profil = profilFuer(ATTRAPPE, tmp);
// Erweiterungs-Debugging nur mit dem Handtest- oder dem Wegwerf-Profil (Review 14.10., Auflage 2).
if (ATTRAPPE ? path.dirname(profil) !== tmp : profilPruefen(profil) !== PROFIL) throw new Error('Profil unerwartet');
// Kanaele 0-2 ignore, nur 3/4 als Pipe zum eigenen Edge-Prozess (Auflage 1).
const edge = spawn(EDGE, [...edgeArgs({ profil, pipe: true, extra }), '--enable-unsafe-extension-debugging', 'about:blank'],
  { env: edgeEnv(), windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

// DevTools-Protokoll ueber die Pipe: JSON-Nachrichten, mit \0 getrennt; flache Sitzungen.
const warten = new Map(), sitzungen = new Map(), eigeneZiele = new Set();
let nr = 0, beendet = false, rest = Buffer.alloc(0);
edge.stdio[3].on('error', () => {});
edge.stdio[4].on('error', () => {});
edge.stdio[4].on('data', (d) => {
  rest = Buffer.concat([rest, d]);
  for (let i = rest.indexOf(0); i >= 0; i = rest.indexOf(0)) {
    const m = JSON.parse(rest.subarray(0, i).toString('utf8'));
    rest = rest.subarray(i + 1);
    if (m.id && warten.has(m.id)) { warten.get(m.id)(m); warten.delete(m.id); }
    else if (m.method === 'Runtime.executionContextCreated' && sitzungen.has(m.sessionId)) sitzungen.get(m.sessionId).push(m.params.context.origin);
  }
});
edge.on('exit', () => { beendet = true; for (const r of warten.values()) r({ error: { message: 'Edge beendet' } }); warten.clear(); });
function cdp(method, params = {}, sessionId) {
  if (!ERLAUBT.has(method)) throw new Abbruch(`DevTools-Methode nicht erlaubt: ${method}`);
  if (beendet) return Promise.resolve({ error: { message: 'Edge beendet' } });
  return new Promise((r) => { const i = ++nr; warten.set(i, r); edge.stdio[3].write(JSON.stringify({ id: i, method, params, sessionId }) + '\0'); });
}
const ziele = async () => ((await cdp('Target.getTargets')).result || {}).targetInfos || [];
async function zielHost(targetId) {
  const t = (await ziele()).find((x) => x.targetId === targetId);
  try { return new URL(t.url).host; } catch { return ''; }
}

// Anhaengen nur an selbst erzeugte Tabs und das exakte Dialog-Target (Auflage 5).
async function verbinde(targetId) {
  if (!eigeneZiele.has(targetId)) throw new Abbruch('fremdes Target');
  const r = await cdp('Target.attachToTarget', { targetId, flatten: true });
  if (!r.result) throw new Error('Tab nicht erreichbar');
  const sid = r.result.sessionId, kontexte = [];
  sitzungen.set(sid, kontexte);
  const call = (method, params = {}) => cdp(method, params, sid);
  const ev = async (expr) => { const x = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return x.result && x.result.result ? x.result.result.value : undefined; };
  return { call, ev, kontexte, close: () => sitzungen.delete(sid) };
}

// Dialog-Target nur mit exakt der erwarteten Erweiterungs-ID (Auflage 5).
async function dialog(tries = 24) {
  for (let i = 0; i < tries; i++) {
    const t = (await ziele()).find((x) => x.url.startsWith(`chrome-extension://${ID}/ui/dialog.html`));
    if (t) { await sleep(500); eigeneZiele.add(t.targetId); const d = await verbinde(t.targetId); await d.call('Runtime.enable'); return d; }
    await sleep(250);
  }
  return null;
}
const DIALOG_TEXT = 'document.body.innerText';
// Knoepfe der Leiste (ui/dialog.js, data-k) nehmen nur echte Klicks an: Lage im Frame lesen,
// dann ein Mausklick genau dort (klickEigen, nur innerhalb des eigenen Frames).
const KNOPF = {
  cancel: `(() => { const b = document.querySelector('[data-k="cancel"]'); return b ? JSON.stringify(b.getBoundingClientRect()) : ''; })()`,
  redact: `(() => { const b = document.querySelector('[data-k="redact"]'); return b ? JSON.stringify(b.getBoundingClientRect()) : ''; })()`,
};

async function seite(s) {
  const row = tabelle.get(s.host);
  const t = await cdp('Target.createTarget', { url: SEITEN.find((x) => x.host === s.host).url });
  if (!t.result) throw new Abbruch('Tab nicht geoeffnet');
  const tid = t.result.targetId;
  eigeneZiele.add(tid);
  const P = await verbinde(tid);
  try {
    await P.call('DOM.enable');
    await P.call('Emulation.setFocusEmulationEnabled', { enabled: true });
    // Ausdruecke nur aus Konstanten der festen Seitenliste (Auflage 5).
    const FELD = `[...document.querySelectorAll(${JSON.stringify(s.feld)})].find((e) => e.getClientRects().length)`;
    const wert = () => P.ev(`(() => { const e = ${FELD}; return e ? ('value' in e ? e.value : e.innerText) : null; })()`);
    const pfad = () => P.ev('location.pathname');
    const hostOk = async () => (await P.ev('location.host')) === s.host;
    const key = (type, p) => P.call('Input.dispatchKeyEvent', Object.assign({ type }, p));
    async function press(k, vk, text, p = {}) {
      await key('rawKeyDown', Object.assign({ key: k, code: k, windowsVirtualKeyCode: vk }, p));
      if (text) await key('char', { key: k, text });
      await key('keyUp', { key: k, code: k, windowsVirtualKeyCode: vk });
    }
    async function pruefeHost() { if (!(await hostOk())) throw new Error('Host gewechselt, nichts getippt'); }
    async function leeren() {
      await pruefeHost();
      await P.ev(`${FELD}.focus()`);
      await press('a', 65, null, { code: 'KeyA', modifiers: 2, commands: ['selectAll'] });
      await press('Backspace', 8);
      await sleep(300);
    }
    // Echtes Tippen je Zeichen (rawKeyDown, char, keyUp), kein Einfuegen per Protokoll.
    async function tippe(text) {
      await pruefeHost();
      await P.ev(`${FELD}.focus()`);
      for (const ch of text) {
        const vk = /[a-z0-9]/i.test(ch) ? ch.toUpperCase().charCodeAt(0) : (ch === ' ' ? 32 : 0);
        await key('rawKeyDown', { key: ch, windowsVirtualKeyCode: vk });
        await key('char', { key: ch, text: ch, unmodifiedText: ch });
        await key('keyUp', { key: ch, windowsVirtualKeyCode: vk });
      }
    }
    async function enter() { await pruefeHost(); await press('Enter', 13, '\r'); }
    // Eigene Hosts direkt an html (Leiste/Dialog, z-index 2147483647 mit iframe) oder
    // im body (frueherer Hinweis mit Knopf); nur deren Schatten-Teilbaum wird gelesen.
    async function eigene() {
      const doc = (await P.call('DOM.getDocument', { depth: 3, pierce: false })).result.root;
      const html = (doc.children || []).find((n) => n.nodeName === 'HTML');
      const body = html && (html.children || []).find((n) => n.nodeName === 'BODY');
      const out = { hinweis: null, frame: null };
      for (const c of [...((html && html.children) || []), ...((body && body.children) || [])]) {
        const style = (c.attributes || [])[(c.attributes || []).indexOf('style') + 1] || '';
        if (!/z-index: 214748364[67]/.test(style)) continue;
        const n = (await P.call('DOM.describeNode', { backendNodeId: c.backendNodeId, depth: -1, pierce: true })).result.node;
        const acc = { texts: [], button: false, frame: null };
        const walk = (x) => {
          if (x.nodeType === 3) acc.texts.push(x.nodeValue);
          if (x.nodeName === 'BUTTON') acc.button = true;
          if (x.nodeName === 'IFRAME') acc.frame = x.backendNodeId;
          for (const k of x.children || []) walk(k);
        };
        for (const sr of n.shadowRoots || []) walk(sr);
        if (acc.frame) out.frame = acc.frame;
        else if (acc.button) out.hinweis = acc.texts.join(' ');
      }
      return out;
    }
    // Hinweistext: frueher im Shadow-Host, jetzt im eigenen Leisten-Frame.
    async function hinweisText() {
      const e = await eigene();
      if (e.hinweis) return e.hinweis;
      if (!e.frame) return null;
      const d = await dialog(8);
      if (!d) return null;
      const t = await d.ev(DIALOG_TEXT);
      d.close();
      return t;
    }
    // Echter Mausklick auf einen Knopf der eigenen Leiste; nur wenn der Punkt im
    // eigenen Frame liegt und der Host stimmt, sonst kein Klick.
    async function klickEigen(d, k) {
      const e = await eigene();
      const j = e.frame ? await d.ev(KNOPF[k]) : '';
      if (!j) return false;
      const q = (await P.call('DOM.getBoxModel', { backendNodeId: e.frame })).result.model.content;
      const r = JSON.parse(j);
      const x = q[0] + r.x + r.width / 2, y = q[1] + r.y + r.height / 2;
      if (!(x > q[0] && x < q[2] && y > q[1] && y < q[5])) return false;
      await pruefeHost();
      for (const type of ['mousePressed', 'mouseReleased']) await P.call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      return true;
    }
    // Screenshot nur als Ausschnitt um Eingabefeld bzw. Dialog; ohne Feld die feste
    // Flaeche 900x320 unten Mitte, wo das Eingabefeld sitzt (Auflage 10, Review 14.10. Nr. 9).
    // Nur auf dem erwarteten Host.
    async function ausschnitt(name, frame) {
      if (!(await hostOk())) return;
      let r;
      if (frame) {
        const q = (await P.call('DOM.getBoxModel', { backendNodeId: frame })).result.model.border;
        r = { x: q[0], y: q[1], width: q[4] - q[0], height: q[5] - q[1] };
      } else {
        const b = await P.ev(`(() => { const e = ${FELD}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
        if (b) r = { x: Math.max(0, b.x - 20), y: Math.max(0, b.y - 90), width: b.width + 40, height: b.height + 110 };
        else {
          const v = await P.ev('({ w: innerWidth, h: innerHeight })');
          r = { x: Math.max(0, (v.w - 900) / 2), y: Math.max(0, v.h - 320), width: Math.min(900, v.w), height: Math.min(320, v.h) };
        }
      }
      const shot = await P.call('Page.captureScreenshot', { format: 'png', clip: Object.assign(r, { scale: 1 }) });
      if (shot.result) fs.writeFileSync(path.join(ERGEBNIS, `${s.host}-${name}.png`), Buffer.from(shot.result.data, 'base64'));
    }

    // 1) Seite geladen, Feld da, Host unveraendert (keine Umleitung). Host aus der
    // Target-Liste; Microsoft-365-/Login-Host: Tab sofort zu, nichts lesen (Review 14.10. Nr. 8).
    let feld = false, host = s.host;
    for (let i = 0; i < 60 && !feld; i++) {
      await sleep(500);
      host = await zielHost(tid);
      if (stoppHost(host)) { await cdp('Target.closeTarget', { targetId: tid }); row['Seite geladen'] = `STOPP (${host})`; return; }
      if (host === s.host) feld = await P.ev(`!!(${FELD})`);
    }
    if (host !== s.host) { row['Seite geladen'] = `FEHLER (umgeleitet auf ${host})`; return; }
    if (!feld) { row['Seite geladen'] = 'FEHLER (kein Eingabefeld, angemeldet?)'; await ausschnitt('kein-feld'); return; }
    row['Seite geladen'] = 'OK';
    // Kontexte nur kurz lesen: dauerhaft aktives Runtime erkennt die Bot-Abwehr der
    // Seiten (Cloudflare-Pruefseite auf claude.ai nach dem Tippen, gemessen 14.10.2026).
    await P.call('Runtime.enable');
    await sleep(300);
    await P.call('Runtime.disable');
    // 2) Content Script der Erweiterung laeuft (isolierte Welt der Erweiterungs-ID).
    // Fehlt es, wird nichts getippt. Edge ab 150 laesst auf copilot.microsoft.com
    // und *.cloud.microsoft keine Erweiterungen laufen (fest eingebaut, per Richtlinie
    // nicht aufhebbar) -> GESPERRT, die Seite ist in Edge ungeschuetzt.
    if (!P.kontexte.includes(`chrome-extension://${ID}`)) {
      row['Erweiterung aktiv'] = 'GESPERRT';
      row.Fehler = 'Erweiterung laeuft hier nicht (Browser-Sperre?), nichts getippt';
      await ausschnitt('gesperrt');
      return;
    }
    row['Erweiterung aktiv'] = 'OK';

    // 3) Live-Hinweis; ohne Hinweis kein Enter (nichts riskieren).
    await leeren();
    await tippe(TEXTE.abbrechen);
    await sleep(1500 * WARTEN);
    const h = await hinweisText();
    const hinweisOk = !!h && /IBAN/.test(h) && !/CH93|2957/.test(h);
    row['Live-Hinweis'] = hinweisOk ? 'OK' : 'FEHLER';
    await ausschnitt('hinweis');
    if (!hinweisOk) return;

    // 4) Enter -> Dialog (ohne Wert) -> Abbrechen -> nicht gesendet.
    const vorher = await pfad();
    await enter();
    await sleep(1000 * WARTEN);
    let d = await dialog();
    let txt = d ? await d.ev(DIALOG_TEXT) : '';
    row['Dialog bei Enter'] = d && /IBAN/.test(txt) && !txt.includes('CH93') ? 'OK' : 'FEHLER';
    if (d) { const e = await eigene(); if (e.frame) await ausschnitt('dialog', e.frame); await klickEigen(d, 'cancel'); d.close(); }
    else await ausschnitt('kein-dialog');
    await sleep(1500 * WARTEN);
    const nichtGesendet = async (teil) => (await hostOk()) && (await pfad()) === vorher && String(await wert()).includes(teil);
    if (!(await nichtGesendet('CH9300762011623852957'))) {
      row['Abbrechen: nicht gesendet'] = 'FEHLER';
      throw new Abbruch(`${s.host}: Testwert evtl. gesendet – Lauf abgebrochen`);
    }
    row['Abbrechen: nicht gesendet'] = 'OK';

    // 5) Schwaerzen: AHV + AWS-Beispielschluessel, im Dialog schwaerzen, nicht senden.
    await leeren();
    await tippe(TEXTE.schwaerzen);
    await sleep(1000 * WARTEN);
    await enter();
    await sleep(1000 * WARTEN);
    d = await dialog();
    txt = d ? await d.ev(DIALOG_TEXT) : '';
    if (d) { await klickEigen(d, 'redact'); d.close(); }
    await sleep(1500 * WARTEN);
    const v = String(await wert());
    if (!(await hostOk()) || (await pfad()) !== vorher || !v.trim()) {
      row['Schwaerzen'] = 'FEHLER';
      throw new Abbruch(`${s.host}: Schwaerzen-Text evtl. gesendet – Lauf abgebrochen`);
    }
    row['Schwaerzen'] = d && /AHV/.test(txt) && !/756\.1234|AKIA/.test(txt) && !/756\.1234|AKIA/.test(v) && v.includes('[') ? 'OK' : 'FEHLER';
    if (row['Schwaerzen'] !== 'OK') await ausschnitt('schwaerzen');

    // 6) Harmloser Text wird gesendet (Pfadwechsel oder geleertes Feld), ohne Dialog.
    await leeren();
    await tippe(TEXTE.harmlos);
    await sleep(500 * WARTEN);
    await enter();
    let gesendet = false;
    for (let i = 0; i < 20 && !gesendet; i++) { await sleep(500); gesendet = (await pfad()) !== vorher || !String(await wert()).trim(); }
    const ohneDialog = !(await dialog(4));
    row['Harmlos gesendet'] = gesendet && ohneDialog ? 'OK' : 'FEHLER';
    if (!gesendet) await ausschnitt('harmlos');
  } catch (e) {
    if (e instanceof Abbruch) throw e;
    row.Fehler = e.message;
  } finally {
    P.close();
    await cdp('Target.closeTarget', { targetId: tid });
  }
}

async function run() {
  // Alten Eintrag (per Kommandozeile, von Edge deaktiviert) entfernen, dann genau
  // einmal entpackt laden; nur mit der festen ID (Review 14.10., Auflagen 3 und 4).
  await cdp('Extensions.uninstall', { id: ERWEITERUNG_ID });
  const geladen = await cdp('Extensions.loadUnpacked', { path: extPfad });
  if (beendet) throw new Abbruch('Edge sofort beendet – ist das Handtest-Profil noch offen? Edge schliessen und erneut starten.');
  if (!geladen.result || geladen.result.id !== ERWEITERUNG_ID) throw new Abbruch('Erweiterung nicht geladen oder ID weicht ab');
  await sleep(2000);   // Service Worker der Erweiterung starten lassen
  for (const s of SEITEN) if (!NUR || NUR.includes(s.host)) await seite(s);
}

let abbruch = null;
let timer;
try {
  await Promise.race([run(), new Promise((_, j) => { timer = setTimeout(() => j(new Abbruch('Zeitlimit 5 Min. erreicht')), ZEITLIMIT); })]);
} catch (e) {
  abbruch = e.message;
} finally {
  clearTimeout(timer);
  // Browser ueber die Pipe schliessen, dann nur den selbst gestarteten Prozessbaum (Auflage 4).
  await Promise.race([cdp('Browser.close'), sleep(3000)]);
  await sleep(1000);
  if (edge.exitCode === null) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  if (site) site.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

// Tabelle Seite x Pruefung (nur OK/FEHLER/GESPERRT/STOPP und Host, keine Seiteninhalte).
console.log(`| Seite | ${SPALTEN.join(' | ')} |`);
console.log(`|${'---|'.repeat(SPALTEN.length + 1)}`);
let alleOk = true;
const gesperrt = [];
for (const [host, row] of tabelle) {
  const zellen = SPALTEN.map((k) => row[k] || '–');
  if (row['Erweiterung aktiv'] === 'GESPERRT') gesperrt.push(host);
  else if (zellen.some((z) => z !== 'OK')) alleOk = false;
  console.log(`| ${host} | ${zellen.join(' | ')} |` + (row.Fehler ? ` ${row.Fehler}` : ''));
}
for (const host of MANUELL) console.log(`| ${host} | manuell, nicht automatisiert${' | –'.repeat(SPALTEN.length - 1)} |`);
if (abbruch) console.log('ABBRUCH: ' + abbruch);
console.log(`Screenshots (Ausschnitte): ${ERGEBNIS}`);
// Laeuft die Erweiterung auf keiner Seite, ist sie nicht geladen: FEHLER.
if (gesperrt.length === SEITEN.length) { alleOk = false; console.log('Erweiterung nirgends aktiv.'); }
if (gesperrt.length) console.log(`WARNUNG: Erweiterung laeuft nicht auf ${gesperrt.join(', ')} – dort ungeschuetzt.`);
const ok = alleOk && !abbruch;
console.log(ok ? 'HANDTEST OK' : 'HANDTEST FEHLER');
process.exitCode = ok ? 0 : 1;
