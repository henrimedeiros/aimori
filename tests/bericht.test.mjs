// Nachweis-Bericht (Design-Review Bericht 16.10.2026, docs/sicherheit/design-review-bericht.md):
// Summen nur aus Zahlen, Richtlinien nur Name + Zustandswort, Export ohne Script mit
// Meta-CSP und sicherem JSON-Block, strenge Pruefung und Mindestanzahl im Sammel-Skript,
// Richtlinie nur verwaltet, Lese-Nachricht nur fuer ui/bericht.html, ehrliche Texte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { load, EXT, ROOT, ENGINE_FILES } from './helpers/load.mjs';
import { collect, loadBericht, main as sammeln } from '../scripts/bericht-sammeln.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/aisites.js', 'common/policy.js', 'common/i18n.js', 'common/bericht.js'], { Intl });
const B = DLX.bericht;
const J = (x) => JSON.parse(JSON.stringify(x));
const NOW = new Date('2026-10-16T10:00:00Z');
const catName = (c) => DLX.i18n.t('de', 'cat_' + c);

const STATS = {
  '2026-10-16': { chatgpt: { finanz: { redact: 3, override: 1 }, gesundheit: { cancel: 2 } }, claude: { technik: { blocked: 1, pseudonym: 2, notsensitive: 1 } } },
  '2026-10-01': { gemini: { kontakt: { redact: 5 } } },
  '2026-08-01': { gemini: { kontakt: { redact: 7 } } },
  '2026-10-15': { evil: { finanz: { redact: 9 } }, chatgpt: { __proto__: { redact: 1 }, finanz: { leak: 4, redact: -1, cancel: 'x' } } },
};

test('Zusammenfassung: Aktionen geschwaerzt/gestoppt/erlaubt, Zeitraum, Unbekanntes ignoriert', () => {
  const s7 = J(B.summarize(STATS, NOW, 7));
  assert.deepEqual(s7.totals, { redacted: 5, stopped: 3, allowed: 2 });
  assert.equal(s7.from, '2026-10-10');
  assert.equal(s7.to, '2026-10-16');
  assert.deepEqual(s7.byCat.finanz, { redacted: 3, stopped: 0, allowed: 1 });
  assert.deepEqual(Object.keys(s7.bySite).sort(), ['chatgpt', 'claude']);
  assert.deepEqual(J(B.summarize(STATS, NOW, 30)).totals, { redacted: 10, stopped: 3, allowed: 2 });
  assert.deepEqual(J(B.summarize(STATS, NOW, 90)).totals, { redacted: 17, stopped: 3, allowed: 2 });
  assert.equal(B.summarize(STATS, NOW, 12).days, 30, 'unbekannter Zeitraum -> Standard');
  assert.deepEqual(J(B.summarize(null, NOW, 7)).totals, { redacted: 0, stopped: 0, allowed: 0 });
});

test('Richtlinien im Bericht: nur gesperrte Schluessel, nur Zustandswort, nie Werte', () => {
  const managed = { allowUserOverride: false, labelNames: ['Streng geheim Projekt Adler'], customTerms: { salt: 'c'.repeat(64), hashes: ['a'.repeat(64)] },
    aiSiteMode: 'block', blockedAiSites: ['perplexity'], rules: { iban: 'block', email: 'warn' }, branding: { companyName: 'Muster AG' }, complianceReportDays: 90 };
  const e = DLX.policy.effective(managed, {}, { timeZone: 'Europe/Zurich', languages: ['de-CH'] });
  const p = B.policies(e.cfg, e.locked);
  assert.deepEqual(Object.fromEntries(p), { allowUserOverride: 'off', aiSiteMode: 'block', allowedAiSites: '0', blockedAiSites: '1', rules: '2', labelNames: '1', customTerms: 'set', branding: 'set', complianceReportDays: 'set' });
  const txt = JSON.stringify(p);
  for (const bad of ['Adler', 'aaaa', 'cccc', 'Muster', 'perplexity', 'iban']) assert.ok(!txt.includes(bad), bad);
  assert.deepEqual(J(B.policies(DLX.policy.effective({}, {}, 'de').cfg, DLX.policy.effective({}, {}, 'de').locked)), []);
});

test('Richtlinie complianceReport*: nur verwaltet, feste Auswahl, Ungueltiges -> Standard', () => {
  assert.deepEqual(DLX.policy.FRAMEWORKS, B.FRAMEWORKS);
  assert.deepEqual(DLX.policy.REPORT_DAYS, B.DAYS);
  const env = 'de';
  const d = DLX.policy.effective({}, {}, env).cfg;
  assert.equal(d.complianceReport, true);
  assert.deepEqual(d.complianceFrameworks, B.FRAMEWORKS);
  assert.equal(d.complianceReportDays, 30);
  const m = DLX.policy.effective({ complianceReport: false, complianceFrameworks: ['revdsg', 'iso27001'], complianceReportDays: 7 }, {}, env);
  assert.equal(m.cfg.complianceReport, false);
  assert.deepEqual(m.cfg.complianceFrameworks, ['revdsg', 'iso27001']);
  assert.equal(m.cfg.complianceReportDays, 7);
  assert.equal(m.locked.complianceFrameworks, true);
  const bad = DLX.policy.effective({ complianceReport: 'no', complianceFrameworks: ['revdsg', 'sox'], complianceReportDays: 31 }, {}, env);
  assert.equal(bad.cfg.complianceReport, true);
  assert.deepEqual(bad.cfg.complianceFrameworks, B.FRAMEWORKS);
  assert.equal(bad.cfg.complianceReportDays, 30);
  assert.deepEqual(J(bad.errors).sort(), ['complianceFrameworks', 'complianceReport', 'complianceReportDays']);
  const user = DLX.policy.effective({}, { complianceReport: false, complianceFrameworks: ['hipaa'], complianceReportDays: 7 }, env);
  assert.equal(user.cfg.complianceReport, true, 'Benutzer kann den Bericht nicht per Speicher abschalten oder festlegen');
  assert.equal(user.cfg.complianceReportDays, 30);
  const schema = JSON.parse(fs.readFileSync(path.join(EXT, 'managed_schema.json'), 'utf8'));
  assert.deepEqual(schema.properties.complianceFrameworks.items.enum, J(B.FRAMEWORKS));
  assert.deepEqual(schema.properties.complianceReportDays.enum, J(B.DAYS));
});

function exportOf(company, logo, days = 30) {
  const d = B.data(B.summarize(STATS, NOW, days), ['revdsg', 'hipaa'], [['allowUserOverride', 'off']], '2026-10-16', B.exportId((a) => webcrypto.getRandomValues(a)));
  return { d, html: B.exportHtml(d, 'de', { catName, product: 'Example', company, logo }) };
}

test('Export: nur ein inerter JSON-Block, Meta-CSP, Escaping von Firmenname und Daten, Logo nur PNG/JPEG/WebP', () => {
  const evil = 'Muster</script><img src=x onerror=alert(1)>"\u2028\u2029&';
  const { d, html } = exportOf(evil, 'data:image/svg+xml;base64,PHN2Zz4=');
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">/);
  assert.equal(html.match(/<script/g).length, 1, 'nur der JSON-Block');
  assert.match(html, /<script type="application\/json" id="dlx-bericht-daten">/);
  assert.ok(!html.includes('<img src=x'), 'Firmenname escaped');
  assert.ok(html.includes('Muster&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;&quot;'));
  assert.ok(!/<img/.test(html), 'SVG-Logo faellt weg');
  assert.ok(!/\son[a-z]+=/i.test(html.replace(/onerror=alert/g, '')), 'keine Event-Attribute');
  assert.deepEqual(J(B.extract(html)), J(d), 'Datenblock unveraendert lesbar');
  assert.match(html, /Selbstauskunft, keine Rechtsberatung/);
  assert.match(html, /Art\. 7 revDSG/);
  assert.match(html, /45 CFR 164\.312\(e\)\(1\)/);
  assert.ok(!/DSGVO/.test(html), 'nicht gewaehlte Vorlage fehlt');
  const json = B.jsonSafe({ x: '</script>\u2028&' });
  assert.ok(!/[<>&\u2028\u2029]/.test(json));
  assert.deepEqual(JSON.parse(json), { x: '</script>\u2028&' });
  const png = exportOf('', 'data:image/png;base64,iVBORw0KGgo=').html;
  assert.equal(png.match(/<img/g).length, 1);
  assert.ok(B.fileName('Ai Mori', 'de', '2026-10-16') === 'ai-mori-bericht-2026-10-16.html');
  assert.ok(B.fileName('', 'en', '2026-10-16') === 'dlx-report-2026-10-16.html');
});

test('Pruefung eines Exports: unbekannte Schluessel, __proto__, Strings, negative Zahlen -> verworfen', () => {
  const { d } = exportOf('');
  const ok = J(d);
  assert.ok(B.validate(ok));
  const bad = [
    Object.assign(J(d), { name: 'Max' }),
    Object.assign(J(d), { schema: 'dlx-bericht/2' }),
    Object.assign(J(d), { exportId: 'abc' }),
    Object.assign(J(d), { days: 14 }),
    Object.assign(J(d), { totals: { redacted: -1, stopped: 0, allowed: 0 } }),
    Object.assign(J(d), { totals: { redacted: '1', stopped: 0, allowed: 0 } }),
    Object.assign(J(d), { byCat: { evil: { redacted: 1, stopped: 0, allowed: 0 } } }),
    Object.assign(J(d), { policies: [['allowUserOverride', 'Projekt Adler']] }),
    Object.assign(J(d), { policies: [['secret', 'on']] }),
    JSON.parse(JSON.stringify(d).replace('"byCat":{', '"byCat":{"__proto__":{"redacted":1,"stopped":0,"allowed":0},')),
  ];
  for (const x of bad) assert.equal(B.validate(x), null, JSON.stringify(x).slice(0, 80));
  assert.equal(B.extract('<script type="application/json" id="dlx-bericht-daten">{"schema":</script>'), null);
});

test('Sammel-Skript: Duplikate einmal, leere und ungueltige verworfen, unter 5 Abbruch, --min >= 5, --out ueberschreibt nie', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlx-sammeln-'));
  try {
    const write = (n, html) => fs.writeFileSync(path.join(dir, n), html);
    for (let i = 0; i < 4; i++) write(`r${i}.html`, exportOf('').html);
    const dup = exportOf('').html;
    write('dup1.html', dup);
    write('dup2.html', dup);
    write('leer.html', B.exportHtml(B.data(B.summarize({}, NOW, 30), [], [], '2026-10-16', 'b'.repeat(32)), 'de', { catName, product: 'X' }));
    write('kaputt.html', '<script type="application/json" id="dlx-bericht-daten">{"__proto__":{}}</script>');
    write('gross.html', 'x'.repeat(1024 * 1024 + 1));
    const r = collect([dir]);
    assert.equal(r.files, 9);
    assert.equal(r.valid, 5, '4 + 1 Duplikat-Paar; leer zaehlt nicht');
    assert.equal(r.rejected, 2);
    assert.equal(r.merged.totals.redacted, 5 * 10);
    const err = [];
    const orig = process.stderr.write;
    process.stderr.write = (s) => { err.push(String(s)); return true; };
    try {
      assert.equal(sammeln(['--min', '4', dir]), 2, '--min unter 5');
      assert.equal(sammeln(['--min', '6', dir]), 1, 'zu wenige -> Abbruch');
      const out = path.join(dir, 'firma.md');
      assert.equal(sammeln(['--out', out, dir]), 0);
      assert.match(fs.readFileSync(out, 'utf8'), /Exporte: 5/);
      assert.throws(() => sammeln(['--out', out, dir]), /EEXIST/, 'bestehende Datei wird nie ueberschrieben');
      assert.equal(sammeln(['--out', path.join(dir, 'r0.html'), path.join(dir, 'r0.html'), dir]), 2);
      fs.rmSync(path.join(dir, 'r0.html'));
      fs.rmSync(path.join(dir, 'firma.md'));
      assert.equal(sammeln([dir]), 1, '4 eindeutige -> keine Teilsummen');
    } finally { process.stderr.write = orig; }
    assert.ok(err.some((s) => /Abbruch/.test(s)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Texte: Selbstauskunft, keine Rechtsberatung, nie konform/erfuellt/compliant/certified', () => {
  const all = JSON.stringify([B.TEXT, B.FW]);
  assert.ok(!/konform|erfüllt|erfuellt|compliant|certified|zertifiziert|garant/i.test(all));
  assert.match(B.TEXT.de.note, /Selbstauskunft, keine Rechtsberatung/);
  assert.match(B.TEXT.en.note, /not legal advice/);
  assert.match(B.FW.hipaa.name.de, /nur Zuordnung/);
  for (const f of B.FRAMEWORKS) assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'compliance', f + '.md')), f);
  for (const s of Object.values(DLX.i18n.STRINGS)) assert.ok(!/conformit|konform/i.test(s.reportOpen));
});

// --- Service Worker ----------------------------------------------------------
function sw(managed = {}) {
  const store = { local: {}, session: {}, managed: structuredClone(managed) };
  const area = (name) => ({
    get: async (k) => (k === null ? structuredClone(store[name]) : Object.hasOwn(store[name], k) ? { [k]: structuredClone(store[name][k]) } : {}),
    set: async (o) => { Object.assign(store[name], structuredClone(o)); },
    remove: async (k) => { delete store[name][k]; },
  });
  let listener = null;
  const chrome = {
    runtime: { id: 'testid', onMessage: { addListener: (f) => { listener = f; } }, onStartup: { addListener() {} }, onInstalled: { addListener() {} },
      getManifest: () => ({ content_scripts: [] }), getURL: (p) => 'chrome-extension://testid/' + p, sendMessage: async () => {} },
    storage: { local: area('local'), session: area('session'), managed: area('managed'), onChanged: { addListener() {} } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    permissions: { getAll: async () => ({ origins: [] }), onAdded: { addListener() {} }, onRemoved: { addListener() {} } },
    scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {}, unregisterContentScripts: async () => {} },
    tabs: { sendMessage: async () => {}, onRemoved: { addListener() {} } },
    windows: { create: async () => ({ id: 9, tabs: [{ id: 99 }] }), remove: async () => {}, onRemoved: { addListener() {} } },
  };
  const ctx = vm.createContext({ chrome, crypto: webcrypto, navigator: { language: 'de-CH' }, TextEncoder, performance, URL, setTimeout, Date, Intl });
  ctx.importScripts = (...f) => { for (const x of f) vm.runInContext(fs.readFileSync(path.join(EXT, x), 'utf8'), ctx, { filename: x }); };
  vm.runInContext(fs.readFileSync(path.join(EXT, 'background.js'), 'utf8'), ctx, { filename: 'background.js' });
  const send = (msg, sender) => new Promise((res) => listener(msg, sender, (r) => res(r === undefined ? r : J(r))));
  return { store, send };
}
const page = (p) => ({ id: 'testid', origin: 'chrome-extension://testid', url: 'chrome-extension://testid/ui/' + p });
const content = { id: 'testid', tab: { id: 5 }, frameId: 0, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/c/1' };

test('SW: Bericht nur an ui/bericht.html, feste Schluessel, nur Summen; Richtlinie aus -> keine Zahlen', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const s = sw({ blockWhenInactive: true, labelNames: ['Projekt Adler'] });
  s.store.local['dlx.stats'] = { [today]: { chatgpt: { finanz: { redact: 2, override: 1 } } } };
  for (const who of [content, page('popup.html'), page('options.html'), page('nachweis.html'), { id: 'fremd', origin: 'chrome-extension://fremd', url: 'chrome-extension://fremd/ui/bericht.html' }]) {
    const r = await s.send({ t: 'bericht' }, who);
    assert.ok(r == null || r.gone === true || !Object.hasOwn(r, 'sums'), who.url);
  }
  const r = await s.send({ t: 'bericht' }, page('bericht.html'));
  assert.deepEqual(Object.keys(r).sort(), ['branding', 'days', 'frameworks', 'language', 'lockedDays', 'lockedFrameworks', 'on', 'policies', 'sums']);
  assert.deepEqual(Object.keys(r.sums), ['7', '30', '90']);
  assert.deepEqual(r.sums['30'].totals, { redacted: 2, stopped: 0, allowed: 1 });
  assert.deepEqual(r.policies, [['blockWhenInactive', 'on'], ['labelNames', '1']]);
  assert.ok(!JSON.stringify(r).includes('Adler'));
  const off = sw({ complianceReport: false });
  off.store.local['dlx.stats'] = s.store.local['dlx.stats'];
  const o = await off.send({ t: 'bericht' }, page('bericht.html'));
  assert.equal(o.on, false);
  assert.deepEqual(o.sums, {});
  assert.deepEqual(o.policies, []);
});

// --- Seite (Mini-DOM) ---------------------------------------------------------
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.text = ''; this.style = {}; this.checked = false; this.value = ''; this.disabled = false; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'checked') this.checked = true; if (k === 'disabled') this.disabled = true; if (k === 'value') this.value = String(v); }
  getAttribute(k) { return Object.hasOwn(this.attrs, k) ? this.attrs[k] : null; }
  append(...n) { for (const c of n) this.children.push(c); }
  replaceChildren(...n) { this.children = []; this.append(...n.flat()); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  addEventListener(t, f) { (this.listeners[t] || (this.listeners[t] = [])).push(f); }
  fire(t) { for (const f of this.listeners[t] || []) f({ isTrusted: true, target: this }); }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
}

async function openPage(reply) {
  const doc = { body: new Node('body'), documentElement: new Node('html'), title: '' };
  doc.documentElement.style.setProperty = () => {};
  doc.createElement = (t) => new Node(t);
  doc.createElementNS = (ns, t) => new Node(t);
  doc.createTextNode = (s) => Object.assign(new Node('#text'), { text: s });
  const sent = [], blobs = [], clicks = [], revoked = [];
  let printed = 0;
  const win = { print: () => { printed++; } };
  const chrome = { runtime: { id: 'x', getURL: (p) => 'chrome-extension://x/' + p, sendMessage: (m) => { sent.push(m); return Promise.resolve(J(reply)); } } };
  class Blob { constructor(parts, o) { this.text = parts.join(''); this.type = o.type; blobs.push(this); } }
  const URL = { createObjectURL: () => 'blob:chrome-extension://x/1', revokeObjectURL: (u) => revoked.push(u) };
  const proto = Node.prototype.click;
  Node.prototype.click = function () { clicks.push({ href: this.href, download: this.download }); };
  const ctx = { document: doc, window: win, chrome, navigator: { language: 'de-CH' }, Intl, Date, Blob, URL, crypto: webcrypto };
  load(['branding.js', 'common/i18n.js', 'common/dom.js', 'common/bericht.js', 'ui/bericht.js'], ctx);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const restore = () => { Node.prototype.click = proto; };
  return { doc, sent, blobs, clicks, revoked, printed: () => printed, find: (p) => doc.body.all(p), restore };
}

test('Seite: Tabellen, Vorlagen, Zeitraum, Drucken und HTML-Export ohne Personenbezug', async () => {
  const sums = {};
  for (const d of B.DAYS) sums[d] = J(B.summarize(STATS, NOW, d));
  const reply = { on: true, sums, frameworks: ['revdsg', 'euaiact'], days: 30, lockedFrameworks: true, lockedDays: false, policies: [['aiSiteMode', 'block']],
    branding: { productName: 'Example', companyName: 'Muster AG', logo: '' }, language: 'de' };
  const s = await openPage(reply);
  try {
    assert.deepEqual(J(s.sent), [{ t: 'bericht' }]);
    const text = s.doc.body.textContent;
    assert.match(text, /Datenschutz-Massnahmen bei KI-Nutzung – Selbstauskunft/);
    assert.match(text, /Muster AG/);
    assert.match(text, /Art\. 7 revDSG/);
    assert.match(text, /Art\. 4/);
    assert.ok(!/ISO\/IEC 27001:2022 Anhang A\s*A\.5\.10/.test(text) && !text.includes('A.8.12'), 'nicht gewaehlte Vorlage fehlt');
    assert.match(text, /aiSiteMode/);
    assert.match(text, /Finanzdaten/);
    const boxes = s.find((n) => n.attrs['data-fw']);
    assert.equal(boxes.length, 5);
    assert.ok(boxes.every((b) => b.disabled), 'Vorlagen per Richtlinie gesperrt');
    const sel = s.find((n) => n.attrs.id === 'dlx-ber-tage')[0];
    sel.value = '90';
    sel.fire('change');
    assert.match(s.doc.body.textContent, /2026-07-19 – 2026-10-16/);
    s.find((n) => n.attrs.id === 'dlx-ber-drucken')[0].fire('click');
    assert.equal(s.printed(), 1);
    s.find((n) => n.attrs.id === 'dlx-ber-html')[0].fire('click');
    assert.equal(s.blobs.length, 1);
    assert.equal(s.clicks.length, 1);
    assert.match(s.clicks[0].download, /^example-bericht-\d{4}-\d{2}-\d{2}\.html$/);
    assert.deepEqual(s.revoked, ['blob:chrome-extension://x/1'], 'Blob-URL sofort freigegeben');
    const d = B.extract(s.blobs[0].text);
    assert.ok(d);
    assert.equal(d.days, 90);
    assert.deepEqual(J(d.frameworks), ['revdsg', 'euaiact']);
    assert.equal(s.blobs[0].type, 'text/html');
  } finally { s.restore(); }
});

test('Seite: Richtlinie aus -> nur Hinweis, keine Knoepfe', async () => {
  const s = await openPage({ on: false, sums: {}, frameworks: B.FRAMEWORKS, days: 30, lockedFrameworks: false, lockedDays: false, policies: [], branding: { productName: 'Example' }, language: 'en' });
  try {
    assert.match(s.doc.body.textContent, /turned off this report/);
    assert.equal(s.find((n) => n.tagName === 'BUTTON').length, 0);
  } finally { s.restore(); }
});

test('Seite ist nicht web_accessible, ohne Inline-Skript, Sammel-Skript laedt dasselbe Modul', () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  assert.ok(!m.web_accessible_resources.some((w) => w.resources.some((r) => /bericht/.test(r))));
  const src = fs.readFileSync(path.join(EXT, 'ui', 'bericht.html'), 'utf8');
  assert.ok(!/<script>(?!<)/.test(src) && !/ on[a-z]+=/.test(src));
  for (const [, ref] of src.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(EXT, 'ui', ref)), ref);
  assert.equal(loadBericht().SCHEMA, 'dlx-bericht/1');
});
