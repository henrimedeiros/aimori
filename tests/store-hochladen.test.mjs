// Tests: Store-Upload per API (Zugangsdaten, Paketpruefung, API-Ablauf mit Attrappe, keine Token in Ausgaben).
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './helpers/load.mjs';
import { writeZip } from '../scripts/pack-store.mjs';
import { ladeZugang, pruefePaket, vergleicheVersion, storeApi, statusText, StoreFehler,
  leseClientDatei, anmeldeAnfrage, tauscheCode, schreibeZugang, pruefeSitzung, bestaetige, nurTerminal, DPAPI } from '../scripts/store-hochladen.mjs';

const ZUGANG = { clientId: 'client-test', clientSecret: 'geheim-test-123', refreshToken: 'refresh-test-456', publisherId: '00000000-0000-4000-8000-000000000000' };
// Klartext-Datei (ohne Verschluesselung) bzw. Attrappe der Verschluesselung fuer die Logik-Tests.
const KLAR = { root: ROOT, schutz: null };
const TEST_SCHUTZ = { verschluesseln: (t) => 'x' + Buffer.from(t).toString('hex'), entschluesseln: (s) => Buffer.from(s.slice(1), 'hex').toString() };
const MIT_SCHUTZ = { root: ROOT, schutz: TEST_SCHUTZ };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'store-hochladen-'));

function zugangDatei(inhalt) {
  const f = path.join(tmp(), 'zugang.json');
  fs.writeFileSync(f, typeof inhalt === 'string' ? inhalt : JSON.stringify(inhalt));
  return f;
}

function paket(dir, name, manifest, extra = []) {
  const zip = path.join(dir, name);
  writeZip(zip, [{ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest)) }, ...extra]);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  fs.writeFileSync(zip + '.sha256', `${hash}  ${name}\n`);
  return zip;
}

const wirft = (fn, re) => assert.throws(fn, (e) => e instanceof StoreFehler && re.test(e.message));

test('Zugangsdaten: vollstaendig, ausserhalb des Repos; Fehler nennen nie Werte', () => {
  assert.deepEqual(ladeZugang(zugangDatei(ZUGANG), KLAR), ZUGANG);
  wirft(() => ladeZugang(path.join(tmp(), 'fehlt.json'), KLAR), /Zugangsdaten fehlen/);
  wirft(() => ladeZugang(zugangDatei('{kaputt'), KLAR), /kein gueltiges JSON/);
  wirft(() => ladeZugang(zugangDatei({ ...ZUGANG, refreshToken: '' }), KLAR), /refreshToken fehlt/);
  wirft(() => ladeZugang(zugangDatei({ ...ZUGANG, extra: 'x' }), KLAR), /unbekanntes Feld extra/);
  wirft(() => ladeZugang(zugangDatei({ ...ZUGANG, publisherId: '../x' }), KLAR), /publisherId ungueltig/);
  assert.throws(() => ladeZugang(zugangDatei({ ...ZUGANG, clientId: 5 }), KLAR), (e) => !/geheim-test|refresh-test/.test(e.message));
  // Im Repository (gleich ob gitignoriert) wird nichts gelesen.
  const d = tmp();
  const imRepo = path.join(d, 'zugang.json');
  fs.writeFileSync(imRepo, JSON.stringify(ZUGANG));
  wirft(() => ladeZugang(imRepo, { root: d, schutz: null }), /im Repository/);
});

test('Versionen nach Chrome-Regel vergleichen', () => {
  assert.ok(vergleicheVersion('0.2.1', '0.2.0') > 0);
  assert.ok(vergleicheVersion('0.10', '0.9.9') > 0);
  assert.equal(vergleicheVersion('1.0', '1.0.0.0'), 0);
  assert.ok(vergleicheVersion('0.2.0', '0.2.1') < 0);
});

test('Paket: Pruefsumme, Version, kein Schluessel', () => {
  const d = tmp();
  const ok = paket(d, 'aimori-0.2.1-chrome.zip', { manifest_version: 3, version: '0.2.1' });
  assert.equal(pruefePaket(ok, '0.2.1').version, '0.2.1');
  wirft(() => pruefePaket(ok, '0.2.2'), /Version 0\.2\.1, Repository 0\.2\.2/);
  wirft(() => pruefePaket(path.join(d, 'fehlt.zip'), '0.2.1'), /Paket fehlt/);
  wirft(() => pruefePaket(paket(d, 'a-chrome-mit-schluessel.zip', { version: '0.2.1' }), '0.2.1'), /privatem Schluessel/);
  wirft(() => pruefePaket(paket(d, 'b.zip', { version: '0.2.1' }, [{ name: 'key.pem', data: Buffer.from('x') }]), '0.2.1'), /key\.pem/);
  wirft(() => pruefePaket(paket(d, 'c.zip', { version: '0.2.1', key: 'abc' }), '0.2.1'), /"key"/);
  const falsch = paket(d, 'd.zip', { version: '0.2.1' });
  fs.writeFileSync(falsch + '.sha256', '0'.repeat(64) + '  d.zip\n');
  wirft(() => pruefePaket(falsch, '0.2.1'), /Pruefsumme stimmt nicht/);
  const ohne = paket(d, 'e.zip', { version: '0.2.1' });
  fs.rmSync(ohne + '.sha256');
  wirft(() => pruefePaket(ohne, '0.2.1'), /Pruefsumme fehlt/);
});

// Attrappe der Store-API: zeichnet Aufrufe auf, antwortet nach Reihenfolge der Endpunkte.
function attrappe(antworten) {
  const aufrufe = [];
  const fetchFn = async (url, opt = {}) => {
    aufrufe.push({ url, opt });
    const key = Object.keys(antworten).find((k) => url.endsWith(k));
    const liste = antworten[key];
    const a = Array.isArray(liste) ? (liste.length > 1 ? liste.shift() : liste[0]) : liste;
    return new Response(JSON.stringify(a.body), { status: a.status || 200 });
  };
  return { fetchFn, aufrufe };
}
const TOKEN = { status: 200, body: { access_token: 'zugriff-test-789', expires_in: 3600 } };

test('Hochladen: Token einmal holen, Paket senden, asynchrone Verarbeitung abwarten', async () => {
  const { fetchFn, aufrufe } = attrappe({
    '/token': TOKEN,
    ':upload': { body: { uploadState: 'IN_PROGRESS', crxVersion: '0.2.1' } },
    ':fetchStatus': [{ body: { lastAsyncUploadState: 'IN_PROGRESS' } }, { body: { lastAsyncUploadState: 'SUCCEEDED' } }],
  });
  const api = storeApi(ZUGANG, { fetchFn, itemId: 'abcdefghijklmnopabcdefghijklmnop', schlafen: async () => {} });
  const buf = Buffer.from('PK-Inhalt');
  assert.deepEqual(await api.hochladen(buf), { crxVersion: '0.2.1' });
  assert.equal(aufrufe.filter((a) => a.url.endsWith('/token')).length, 1, 'Token nur einmal');
  const tok = new URLSearchParams(aufrufe[0].opt.body.toString());
  assert.equal(tok.get('grant_type'), 'refresh_token');
  assert.equal(tok.get('refresh_token'), ZUGANG.refreshToken);
  const up = aufrufe.find((a) => a.url.endsWith(':upload'));
  assert.equal(up.url, `https://chromewebstore.googleapis.com/upload/v2/publishers/${ZUGANG.publisherId}/items/abcdefghijklmnopabcdefghijklmnop:upload`);
  assert.equal(up.opt.method, 'POST');
  assert.equal(up.opt.headers.Authorization, 'Bearer zugriff-test-789');
  assert.equal(up.opt.body, buf);
  assert.equal(aufrufe.filter((a) => a.url.endsWith(':fetchStatus')).length, 2);
});

test('Hochladen: FAILED und API-Fehler brechen ab, ohne Token oder Geheimnis zu nennen', async () => {
  const failed = attrappe({ '/token': TOKEN, ':upload': { body: { uploadState: 'FAILED' } } });
  await assert.rejects(storeApi(ZUGANG, { fetchFn: failed.fetchFn }).hochladen(Buffer.from('x')), /Store meldet FAILED/);
  const abgelehnt = attrappe({ '/token': TOKEN, ':upload': { status: 400, body: { error: { message: 'Version must be greater' } } } });
  await assert.rejects(storeApi(ZUGANG, { fetchFn: abgelehnt.fetchFn }).hochladen(Buffer.from('x')), (e) => {
    assert.match(e.message, /HTTP 400 Version must be greater/);
    assert.doesNotMatch(e.message, /zugriff-test|geheim-test|refresh-test/);
    return true;
  });
  const anmeldung = attrappe({ '/token': { status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } } });
  await assert.rejects(storeApi(ZUGANG, { fetchFn: anmeldung.fetchFn }).status(), (e) => {
    assert.match(e.message, /^Anmeldung: HTTP 400/);
    assert.doesNotMatch(e.message, /geheim-test|refresh-test/);
    return true;
  });
});

test('Einreichen: sofort oder gestaffelt veroeffentlichen', async () => {
  for (const [gestaffelt, typ] of [[false, 'DEFAULT_PUBLISH'], [true, 'STAGED_PUBLISH']]) {
    const { fetchFn, aufrufe } = attrappe({ '/token': TOKEN, ':publish': { body: { state: 'PENDING_REVIEW' } } });
    const r = await storeApi(ZUGANG, { fetchFn }).einreichen(gestaffelt);
    assert.equal(r.state, 'PENDING_REVIEW');
    const p = aufrufe.find((a) => a.url.endsWith(':publish'));
    assert.deepEqual(JSON.parse(p.opt.body), { publishType: typ });
  }
});

test('Statustext nennt Stand und Versionen', () => {
  const t = statusText({
    publishedItemRevisionStatus: { state: 'PUBLISHED', distributionChannels: [{ crxVersion: '0.2.0', deployPercentage: 100 }] },
    submittedItemRevisionStatus: { state: 'PENDING_REVIEW', distributionChannels: [{ crxVersion: '0.2.1', deployPercentage: 100 }] },
    lastAsyncUploadState: 'SUCCEEDED',
  });
  assert.match(t, /Veroeffentlicht: PUBLISHED, Version 0\.2\.0/);
  assert.match(t, /Eingereicht: PENDING_REVIEW, Version 0\.2\.1/);
  assert.match(statusText({}), /Veroeffentlicht: -/);
});

test('Anmelden: Client-Datei lesen, Anfrage mit state und PKCE', () => {
  const web = zugangDatei({ web: { client_id: 'client-test', client_secret: 'geheim-test-123', redirect_uris: [] } });
  assert.deepEqual(leseClientDatei(web), { clientId: 'client-test', clientSecret: 'geheim-test-123' });
  const desktop = zugangDatei({ installed: { client_id: 'c', client_secret: 's' } });
  assert.deepEqual(leseClientDatei(desktop), { clientId: 'c', clientSecret: 's' });
  wirft(() => leseClientDatei(zugangDatei({ web: { client_id: 'c' } })), /client_secret fehlt/);
  const a = anmeldeAnfrage('client-test', 'http://localhost:8765');
  const q = new URL(a.url).searchParams;
  assert.equal(q.get('client_id'), 'client-test');
  assert.equal(q.get('redirect_uri'), 'http://localhost:8765');
  assert.equal(q.get('scope'), 'https://www.googleapis.com/auth/chromewebstore');
  assert.equal(q.get('access_type'), 'offline');
  assert.equal(q.get('state'), a.state);
  assert.equal(q.get('code_challenge'), crypto.createHash('sha256').update(a.verifier).digest('base64url'));
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.doesNotMatch(a.url, /geheim/);
  assert.notEqual(anmeldeAnfrage('c', 'x').state, a.state);
});

test('Anmelden: Code tauschen und Zugangsdatei ausserhalb des Repos schreiben', async () => {
  const { fetchFn, aufrufe } = attrappe({ '/token': { body: { access_token: 'a', refresh_token: 'refresh-neu' } } });
  const eingabe = { clientId: 'client-test', clientSecret: 'geheim-test-123', code: 'code-1', verifier: 'v-1', redirectUri: 'http://localhost:8765' };
  assert.equal(await tauscheCode(eingabe, fetchFn), 'refresh-neu');
  const p = new URLSearchParams(aufrufe[0].opt.body.toString());
  assert.equal(p.get('grant_type'), 'authorization_code');
  assert.equal(p.get('code_verifier'), 'v-1');
  const ohne = attrappe({ '/token': { body: { access_token: 'a' } } });
  await assert.rejects(tauscheCode(eingabe, ohne.fetchFn), /kein Refresh-Token/);

  const d = tmp();
  const ziel = path.join(d, 'zugang.json');
  schreibeZugang(ziel, ZUGANG, { root: ROOT, schutz: TEST_SCHUTZ });
  assert.deepEqual(ladeZugang(ziel, MIT_SCHUTZ), ZUGANG);
  wirft(() => schreibeZugang(ziel, ZUGANG, { root: ROOT, schutz: TEST_SCHUTZ }), /gibt es schon/);
  schreibeZugang(ziel, { ...ZUGANG, refreshToken: 'r2' }, { root: ROOT, schutz: TEST_SCHUTZ, ersetzen: true });
  assert.equal(ladeZugang(ziel, MIT_SCHUTZ).refreshToken, 'r2');
  wirft(() => schreibeZugang(path.join(d, 'x.json'), ZUGANG, { root: d, schutz: TEST_SCHUTZ }), /im Repository/);
});

test('Zugangsdatei: Geheimnisse nie im Klartext, Klartext wird mit Schutz abgelehnt', () => {
  const ziel = path.join(tmp(), 'zugang.json');
  schreibeZugang(ziel, ZUGANG, { root: ROOT, schutz: TEST_SCHUTZ });
  const text = fs.readFileSync(ziel, 'utf8');
  assert.doesNotMatch(text, /geheim-test|refresh-test|clientSecret|refreshToken/);
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['clientId', 'geschuetzt', 'publisherId']);
  wirft(() => ladeZugang(zugangDatei(ZUGANG), MIT_SCHUTZ), /im Klartext/);
  wirft(() => ladeZugang(ziel, KLAR), /verschluesselt und hier nicht lesbar/);
  const kaputt = zugangDatei({ clientId: 'c', publisherId: 'p', geschuetzt: 'x00' });
  wirft(() => ladeZugang(kaputt, MIT_SCHUTZ), /Entschluesseln fehlgeschlagen/);
});

test('Zugangsdatei unter Windows mit DPAPI: lesbar nur fuer dieses Konto, ohne Klartext', { skip: process.platform !== 'win32' }, () => {
  const ziel = path.join(tmp(), 'zugang.json');
  schreibeZugang(ziel, ZUGANG, { root: ROOT, schutz: DPAPI });
  assert.doesNotMatch(fs.readFileSync(ziel, 'utf8'), /geheim-test|refresh-test/);
  assert.deepEqual(ladeZugang(ziel, { root: ROOT, schutz: DPAPI }), ZUGANG);
});

test('Automatisierte Sitzung: Abbruch, wenn eine Variable aus der lokalen Sperrliste gesetzt ist', () => {
  const liste = path.join(tmp(), 'store-sperre');
  fs.writeFileSync(liste, '# Kennzeichen automatisierter Sitzungen\nSITZUNG_A\n\nSITZUNG_B\n');
  wirft(() => pruefeSitzung({ SITZUNG_A: '1' }, liste), /automatisierte Sitzung \(SITZUNG_A gesetzt\)/);
  wirft(() => pruefeSitzung({ SITZUNG_B: 'x' }, liste), /SITZUNG_B/);
  wirft(() => pruefeSitzung({ CI: 'true' }, path.join(tmp(), 'fehlt')), /CI gesetzt/);
  pruefeSitzung({ PATH: 'x', SITZUNG_A: '' }, liste);
  pruefeSitzung({}, path.join(tmp(), 'fehlt'));
});

test('Bestaetigung: nur im Terminal und nur mit eingetippter Version', async () => {
  const eingabe = (text, tty = true) => { const s = new PassThrough(); s.isTTY = tty; s.end(text); return s; };
  const output = new PassThrough();
  await assert.rejects(bestaetige('?', '0.2.1', { input: eingabe('0.2.1\n', false), output }), /nur im eigenen Terminal moeglich/);
  await assert.rejects(bestaetige('?', '0.2.1', { input: eingabe('ja\n'), output }), /Eingabe stimmt nicht/);
  await bestaetige('?', '0.2.1', { input: eingabe(' 0.2.1 \n'), output });
});

test('Automatisierte Sitzung: fest eingebaute Sperren greifen auch ohne Sperrliste', () => {
  const ohneListe = path.join(tmp(), 'fehlt');
  // Namen der fest gesperrten Variablen (im Code nur als SHA-256 hinterlegt).
  for (const name of ['Q0xBVURFQ09ERQ==', 'SkFSVklTX0pPQl9JRA=='].map((b) => Buffer.from(b, 'base64').toString())) {
    wirft(() => pruefeSitzung({ [name]: '1' }, ohneListe), new RegExp(`\(${name} gesetzt\)`));
    pruefeSitzung({ [name]: '' }, ohneListe);
  }
  // Die lokale Liste erweitert nur: eine leere Liste hebt die feste Sperre nicht auf.
  const leer = path.join(tmp(), 'store-sperre');
  fs.writeFileSync(leer, '');
  wirft(() => pruefeSitzung({ CI: '1' }, leer), /CI gesetzt/);
});

test('Nur im Terminal: ohne Eingabe-Konsole Abbruch', () => {
  wirft(() => nurTerminal({ isTTY: false }), /nur im eigenen Terminal/);
  wirft(() => nurTerminal({}), /nur im eigenen Terminal/);
  nurTerminal({ isTTY: true });
});
