// Tests: Mandanten-Vorlagen (scripts/mandanten.mjs) und Logo-Pruefung der Erweiterung.
// Design-Review: docs/sicherheit/design-review-mandanten.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { load, ENGINE_FILES, ROOT, EXT } from './helpers/load.mjs';
import { validate as schemaValidate } from '../scripts/lib/schema.mjs';
import { policiesFrom } from '../scripts/build-admx.mjs';
import {
  erzeuge, merge, pruefeKundenId, pruefeUrl, ladeLogo, pruefePng, pruefeSvg, regDatei, xmlAttr,
  omaZeilen, rolloutPs1, extensionSettings, pruefeAusgabe, schreibeAlles,
} from '../scripts/mandanten.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/policy.js'], { URL });
const plain = (v) => JSON.parse(JSON.stringify(v));
const schema = JSON.parse(fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8'));
const BEISPIEL = path.join(ROOT, 'enterprise', 'mandanten', 'beispiel.json');
const ID = 'hfgcdbigpgpdoegkhfbbbnibnkpdjkbb';
const svgUri = (s, enc = 'utf8') => 'data:image/svg+xml;base64,' + Buffer.from(s, enc).toString('base64');
const logoFehler = (uri) => plain(DLX.policy.validate({ branding: { logo: uri } }).errors);

test('Beispiel mit drei erfundenen Kunden ergibt gueltige Richtlinien (Schema und Erweiterung)', () => {
  const { kunden, admx } = erzeuge(BEISPIEL);
  assert.equal(kunden.length, 3);
  const arten = [];
  for (const k of kunden) {
    const p = JSON.parse(k.dateien['richtlinie.json']);
    assert.deepEqual(schemaValidate(schema, p), [], k.id);
    const r = plain(DLX.policy.validate(p));
    assert.deepEqual(r.errors, [], k.id);
    assert.ok(r.value.branding.logo.startsWith('data:image/'), 'Logo wird von der Erweiterung angenommen');
    assert.ok(r.value.branding.companyName, 'Firmenname aus dem Kundennamen');
    arten.push(p.branding.logo.slice(0, 20));
    for (const f of ['intune/edge-extensionsettings.json', 'intune/chrome-extensionsettings.json', 'intune/edge-oma-uri.json',
      'intune/chrome-oma-uri.json', 'gpo/edge-richtlinie.reg', 'gpo/chrome-richtlinie.reg', 'Rollout.ps1', 'ANLEITUNG.md']) {
      assert.ok(k.dateien[f], `${k.id}: ${f}`);
    }
  }
  assert.equal(arten.filter((a) => a.includes('png')).length, 2);
  assert.equal(arten.filter((a) => a.includes('svg')).length, 1);
  assert.ok(admx['edge/dlx-edge.admx'].includes(`extensions\\${ID}\\policy`));
  assert.ok(admx['chrome/de-DE/dlx-chrome.adml']);
});

test('Abweichungen je Kunde: Objekte tief zusammengefuehrt, Listen ersetzt', () => {
  const { kunden } = erzeuge(BEISPIEL);
  const [a, b, c] = kunden.map((k) => JSON.parse(k.dateien['richtlinie.json']));
  assert.equal(a.rules.ch_ahv, 'block');
  assert.equal(a.rules.iban, 'redact', 'Basis-Regel bleibt');
  assert.equal(c.rules.iban, 'block', 'Kunden-Regel ueberschreibt');
  assert.deepEqual(b.allowedAiSites, ['m365copilot'], 'Liste ersetzt, nicht angehaengt');
  assert.equal(b.branding.supportText, 'Fragen zur KI-Nutzung: Ihr IT-Partner hilft weiter.');
  assert.equal(b.allowUserOverride, false);
  assert.deepEqual(merge({ x: { y: [1, 2], z: 1 } }, { x: { y: [3] } }), { x: { y: [3], z: 1 } });
});

test('merge lehnt __proto__, constructor und prototype auf jeder Ebene ab', () => {
  assert.throws(() => merge({}, JSON.parse('{"a":{"__proto__":{"x":1}}}')), /Schluessel nicht erlaubt/);
  assert.throws(() => merge({}, { constructor: 1 }), /Schluessel nicht erlaubt/);
  assert.throws(() => merge({ a: [{ prototype: 1 }] }, {}), /Schluessel nicht erlaubt/);
  assert.equal(({}).x, undefined);
});

test('Kunden-id und Update-URL nur nach festen Mustern', () => {
  for (const id of ['-a', 'A', 'con', 'lpt1', 'a_b', 'a'.repeat(41), '', 'a/b']) assert.throws(() => pruefeKundenId(id, 'id'), /Kunden-id/, id);
  pruefeKundenId('alpen-bau-2', 'id');
  for (const u of ['http://example.com/u.xml', 'https://user:pw@example.com/u.xml', 'https://example.com/u.xml#x', "https://example.com/'a",
    'https://example.com/a;b', 'https://example.com/a b', 'ftp://example.com/']) assert.throws(() => pruefeUrl(u, 'u'), /URL|https/, u);
  pruefeUrl('https://updates.example.com/aimori/edge.xml?v=1', 'u');
});

test('Fehlermeldungen nennen nur Feldpfade, keine Werte', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-mand-'));
  try {
    const salt = 'ab'.repeat(32);
    fs.writeFileSync(path.join(dir, 'm.json'), JSON.stringify({ basis: { customTerms: { salt, hashes: ['zz-geheim'] } }, kunden: [{ id: 'k', name: 'K' }] }));
    assert.throws(() => erzeuge(path.join(dir, 'm.json')), (e) => /customTerms\.hashes\[0\]/.test(e.message) && !e.message.includes('zz-geheim') && !e.message.includes(salt));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Logo-Pfad: nur relativ im Mandanten-Ordner, keine Links, Groesse vor dem Einlesen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-logo-'));
  const aussen = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-aussen-'));
  try {
    fs.copyFileSync(path.join(ROOT, 'enterprise', 'mandanten', 'logos', 'alpenbau.png'), path.join(dir, 'ok.png'));
    fs.copyFileSync(path.join(ROOT, 'enterprise', 'mandanten', 'logos', 'alpenbau.png'), path.join(aussen, 'x.png'));
    assert.ok(ladeLogo(dir, 'ok.png', 'logo').startsWith('data:image/png;base64,iVBORw0KGgo'));
    for (const p of ['../x.png', 'C:x.png', path.join(aussen, 'x.png'), '\\\\server\\share\\x.png', '/x.png', 'ok.png:strom', 'a//ok.png', 'ok.gif']) {
      assert.throws(() => ladeLogo(dir, p, 'logo'), /Logo|png|svg/, p);
    }
    fs.symlinkSync(aussen, path.join(dir, 'link'), 'junction');
    assert.throws(() => ladeLogo(dir, 'link/x.png', 'logo'), /Links/);
    fs.writeFileSync(path.join(dir, 'gross.png'), Buffer.alloc(70 * 1024));
    assert.throws(() => ladeLogo(dir, 'gross.png', 'logo'), /zu gross/);
    // Was die Erweiterung ablehnen wuerde (hier: Kommentar mit Markup), lehnt schon das Werkzeug ab.
    fs.writeFileSync(path.join(dir, 'kommentar.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><!-- <script> --><rect width="1" height="1"/></svg>');
    assert.throws(() => ladeLogo(dir, 'kommentar.svg', 'logo'), /von der Erweiterung abgelehnt/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(aussen, { recursive: true, force: true });
  }
});

test('PNG: Signatur und hoechstens 512x512 Pixel', () => {
  const png = fs.readFileSync(path.join(ROOT, 'enterprise', 'mandanten', 'logos', 'alpenbau.png'));
  pruefePng(png);
  const gross = Buffer.from(png); gross.writeUInt32BE(600, 16);
  assert.throws(() => pruefePng(gross), /512/);
  assert.throws(() => pruefePng(Buffer.from('GIF89a' + 'x'.repeat(40))), /kein gueltiges PNG/);
  assert.deepEqual(logoFehler('data:image/png;base64,' + Buffer.from('GIF89a').toString('base64')), ['branding.logo'], 'Erweiterung: PNG nur mit Signatur');
});

// Gemeinsame Faelle fuer Werkzeug und Erweiterung (Auflage 14).
const S = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">';
const BOESE_SVG = [
  ['script', `${S}<script>alert(1)</script></svg>`],
  ['Ereignis-Attribut', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'],
  ['Ereignis mit Leerraum', `${S}<rect ONclick = "x"/></svg>`],
  ['foreignObject', `${S}<foreignObject><div/></foreignObject></svg>`],
  ['javascript-Link', `${S}<use href="java\tscript:alert(1)"/></svg>`],
  ['externer Verweis', `${S}<use href="https://example.com/a.svg#x"/></svg>`],
  ['externe url()', `${S}<rect fill="url(https://example.com/x)"/></svg>`],
  ['DOCTYPE/ENTITY', `<!DOCTYPE svg [<!ENTITY x "y">]>${S}</svg>`],
  ['xml-stylesheet', `<?xml-stylesheet href="https://example.com/x.css"?>${S}</svg>`],
  ['style', `${S}<style>@import url(https://example.com/x.css);</style></svg>`],
  ['Zeichenreferenz', `${S}<rect fill="&#x23;fff"/></svg>`],
  ['CDATA', `${S}<text><![CDATA[<script>]]></text></svg>`],
  ['image', `${S}<image href="#x"/></svg>`],
  ['Link-Element', `${S}<a href="#x"><rect/></a></svg>`],
  ['animate/set', `${S}<set attributeName="fill" to="red"/></svg>`],
  ['Kodierung', `<?xml version="1.0" encoding="ISO-8859-1"?>${S}</svg>`],
];

test('SVG: Werkzeug und Erweiterung lehnen dieselben gefaehrlichen Logos ab', () => {
  for (const [name, svg] of BOESE_SVG) {
    assert.throws(() => pruefeSvg(Buffer.from(svg)), /SVG/, 'Werkzeug: ' + name);
    assert.deepEqual(logoFehler(svgUri(svg)), ['branding.logo'], 'Erweiterung: ' + name);
  }
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${S}<script>x</script></svg>`, 'utf16le')]);
  assert.throws(() => pruefeSvg(utf16), /BOM|UTF-16/);
  assert.deepEqual(logoFehler('data:image/svg+xml;base64,' + utf16.toString('base64')), ['branding.logo']);
});

test('SVG: harmlose Logos nehmen Werkzeug und Erweiterung an', () => {
  const gut = [
    fs.readFileSync(path.join(ROOT, 'enterprise', 'mandanten', 'logos', 'praxis-lindenhof.svg'), 'utf8'),
    `<?xml version="1.0" encoding="UTF-8"?><!-- Logo -->${S}<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect fill="url(#g)" width="10" height="10"/><use href="#g"/></svg>`,
  ];
  const beispiel = JSON.parse(fs.readFileSync(path.join(ROOT, 'enterprise', 'example-policy.json'), 'utf8')).branding.logo;
  gut.push(Buffer.from(beispiel.split(',')[1], 'base64').toString());
  for (const svg of gut) {
    pruefeSvg(Buffer.from(svg));
    assert.deepEqual(logoFehler(svgUri(svg)), []);
  }
});

test('Erweiterung: Logo nur mit genau zwei data:-Praefixen, sonst Signet', () => {
  for (const v of ['https://example.com/logo.png', 'data:image/svg+xml;utf8,<svg/>', 'data:image/svg+xml;charset=utf-8;base64,PHN2Zy8+',
    'data:image/gif;base64,R0lGODlh', 'data:image/png;base64,%%%', 'data:image/png;base64,' + 'A'.repeat(140001)]) {
    assert.deepEqual(logoFehler(v), ['branding.logo'], v.slice(0, 40));
  }
  // Ohne atob (z. B. fremde Umgebung): fail-closed.
  const ohne = load(['branding.js', ...ENGINE_FILES, 'common/policy.js'], { URL, atob: undefined });
  assert.deepEqual(plain(ohne.policy.validate({ branding: { logo: 'data:image/png;base64,iVBORw0KGgo=' } }).errors), ['branding.logo']);
});

test('.reg: escaped, genau eine Loeschzeile, Zeilenumbruch mit Registry-Pfad bricht ab', () => {
  const buf = regDatei('edge', ID, { branding: { supportText: 'Pfad C:\\IT "intern"' }, allowUserOverride: false, rules: { iban: 'block' }, allowedSites: ['chatgpt'] });
  assert.deepEqual([...buf.subarray(0, 2)], [0xff, 0xfe]);
  const t = buf.subarray(2).toString('utf16le');
  assert.ok(t.startsWith('Windows Registry Editor Version 5.00\r\n'));
  assert.equal(t.split('\r\n').filter((l) => l.startsWith('[-')).length, 1);
  assert.ok(t.includes(`[-HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Edge\\3rdparty\\extensions\\${ID}\\policy]`));
  assert.ok(t.includes('"supportText"="Pfad C:\\\\IT \\"intern\\""'));
  assert.ok(t.includes('"allowUserOverride"=dword:00000000'));
  assert.ok(t.includes('\\policy\\allowedSites]\r\n"1"="chatgpt"'));
  assert.throws(() => regDatei('edge', ID, { branding: { supportText: 'x"\r\n[HKEY_LOCAL_MACHINE\\SOFTWARE\\Evil]' } }), /Steuerzeichen/);
  assert.throws(() => regDatei('edge', ID, { rules: { 'a]\r\n[HKEY_X': 'block' } }), /nicht erlaubt/);
  assert.throws(() => regDatei('edge', 'x', {}), /ungueltige Erweiterung/);
});

test('Rollout.ps1: alles Base64-kodiert, keine Eingabewerte im Skript-Code', () => {
  const policy = { branding: { supportText: "'@\n$(calc)", companyName: 'Geheim AG' } };
  const ps = rolloutPs1({ edge: { id: ID, updateUrl: 'https://updates.example.com/u.xml' } }, policy);
  for (const s of ['$(calc)', "'@", 'Geheim AG', 'updates.example.com']) assert.ok(!ps.includes(s), s);
  const b64 = [...ps.matchAll(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/g)].map((m) => Buffer.from(m[1], 'base64').toString());
  assert.equal(b64[0], fs.readFileSync(path.join(ROOT, 'enterprise', 'Deploy-Policy.ps1'), 'utf8'));
  assert.deepEqual(JSON.parse(b64.find((x) => x.includes('Geheim AG'))), policy);
  assert.ok(b64.includes('https://updates.example.com/u.xml'));
  assert.match(ps, /-PlanOnly:\$PlanOnly -WhatIf:\$WhatIfPreference/);
  if (process.platform === 'win32') {
    // Nur Parser, nie ausfuehren (Auflage 16).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ps-'));
    try {
      fs.writeFileSync(path.join(dir, 'r.ps1'), ps);
      const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `$e=$null;$t=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${path.join(dir, 'r.ps1')}',[ref]$t,[ref]$e);$e.Count`], { encoding: 'utf8', windowsHide: true });
      assert.equal(r.stdout.trim(), '0');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('OMA-URI: ADMX-Ingestion, Werte XML-escaped, Listen mit U+F000, Wahrheitswerte enabled/disabled', () => {
  const z = omaZeilen('chrome', ID, { branding: { companyName: 'A & B <"x">' }, rules: { iban: 'block', email: 'warn' }, allowUserOverride: false, blockWhenInactive: true, allowedSites: ['chatgpt', 'claude'] });
  assert.equal(z[0].omaUri, './Device/Vendor/MSFT/Policy/ConfigOperations/ADMXInstall/DlxChrome/Policy/dlxchrome');
  assert.ok(z[0].value.includes(`Google\\Chrome\\3rdparty\\extensions\\${ID}\\policy`));
  const w = Object.fromEntries(z.slice(1).map((r) => [r.omaUri.split('/').pop(), r.value]));
  assert.equal(w.branding, '<enabled/><data id="branding_companyName" value="A &amp; B &lt;&quot;x&quot;&gt;"/>');
  assert.equal(w.rules, '<enabled/><data id="rules" value="iban&#xF000;block&#xF000;email&#xF000;warn"/>');
  assert.equal(w.allowedSites, '<enabled/><data id="allowedSites" value="chatgpt&#xF000;claude"/>');
  assert.equal(w.allowUserOverride, '<disabled/>');
  assert.equal(w.blockWhenInactive, '<enabled/>');
  assert.ok(z.every((r) => r.dataType === 'String' && r.omaUri.startsWith('./Device/Vendor/MSFT/Policy/')));
  assert.throws(() => xmlAttr('a\u0001b', 'x'), /nicht erlaubt/);
  assert.throws(() => xmlAttr('a\ud800', 'x'), /nicht erlaubt/);
  assert.throws(() => policiesFrom({ properties: { 'bad-name': { type: 'boolean' } } }), /invalid ADMX name/);
});

test('ExtensionSettings erzwingt die Installation mit der Update-URL', () => {
  assert.deepEqual(JSON.parse(extensionSettings(ID, 'https://updates.example.com/u.xml')),
    { [ID]: { installation_mode: 'force_installed', update_url: 'https://updates.example.com/u.xml' } });
});

test('Ausgabe im Repo nur in gitignorierten Ordnern, ohne --force nichts ueberschreiben', () => {
  assert.throws(() => pruefeAusgabe(path.join(ROOT, 'docs', 'mandanten-test')), /gitignoriert/);
  const ziel = path.join(ROOT, '.tmp', 'mandanten-test-' + process.pid);
  try {
    const erg = erzeuge(BEISPIEL);
    const r = schreibeAlles(erg, ziel, false);
    assert.equal(r.dateien, 33);
    assert.throws(() => schreibeAlles(erg, ziel, false), /existiert bereits/);
    fs.writeFileSync(path.join(ziel, 'alpenbau', 'eigene-notiz.txt'), 'x');
    schreibeAlles(erg, ziel, true);
    assert.ok(fs.existsSync(path.join(ziel, 'alpenbau', 'eigene-notiz.txt')), '--force loescht nichts');
    assert.ok(!fs.readdirSync(path.join(ziel, 'alpenbau')).some((f) => f.includes('.tmp-')), 'keine Reste vom atomaren Schreiben');
  } finally { fs.rmSync(ziel, { recursive: true, force: true }); }
});
