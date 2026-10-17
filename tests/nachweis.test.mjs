// Export (ui/nachweis.js) und Erklaerseite (ui/wissen.js) in einem Mini-DOM:
// Tabelle nur aus Zahlen, Firmenname/Logo aus dem Branding, Ausblenden
// besonders schuetzenswerter Gruppen, Drucken ueber den Browser, Namensfeld
// ohne Nachricht; Hash nur aus der Gruppen-Positivliste (Design-Review 14.10.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, ENGINE_FILES, EXT } from './helpers/load.mjs';

class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.text = ''; this.style = {}; this.checked = false; this.value = ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'checked') this.checked = true; }
  getAttribute(k) { return Object.hasOwn(this.attrs, k) ? this.attrs[k] : null; }
  hasAttribute(k) { return Object.hasOwn(this.attrs, k); }
  append(...n) { for (const c of n) this.children.push(c); }
  replaceChildren(...n) { this.children = []; this.append(...n); }
  set textContent(v) { this.children = []; this.text = String(v); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  addEventListener(t, f) { (this.listeners[t] || (this.listeners[t] = [])).push(f); }
  fire(t) { for (const f of this.listeners[t] || []) f({ isTrusted: true, target: this }); }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
}

const BRAND = { productName: 'Example', companyName: 'Muster AG', logo: 'data:image/png;base64,iVBORw0KGgo=' };
const MONTHS = ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12', '2025-11'];

async function open(file, reply, hash = '') {
  const doc = { body: new Node('body'), documentElement: new Node('html'), title: '' };
  doc.documentElement.style.setProperty = () => {};
  doc.createElement = (t) => new Node(t);
  doc.createElementNS = (ns, t) => new Node(t);
  doc.createTextNode = (s) => Object.assign(new Node('#text'), { text: s });
  const sent = [];
  let printed = 0;
  const win = { listeners: {}, print: () => { printed++; }, addEventListener: (t, f) => { win.listeners[t] = f; } };
  const chrome = { runtime: { id: 'x', getURL: (p) => 'chrome-extension://x/' + p, sendMessage: (m) => { sent.push(m); return Promise.resolve(JSON.parse(JSON.stringify(reply))); } } };
  const ctx = { document: doc, window: win, chrome, navigator: { language: 'de-CH' }, matchMedia: () => ({ matches: false }), location: { hash }, Intl, Date };
  const files = file === 'nachweis' ? ['branding.js', 'common/i18n.js', 'common/dom.js', 'common/kompetenz.js', 'ui/nachweis.js']
    : ['branding.js', ...ENGINE_FILES, 'common/i18n.js', 'common/dom.js', 'common/kompetenz.js', 'ui/wissen.js'];
  load(files, ctx);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const find = (pred) => doc.body.all(pred);
  return { doc, sent, find, printed: () => printed, ctx, win };
}

const STORE = {
  '2026-10': { finanz: { seen: 5, redacted: 3, cancelled: 1, sent: 1 }, gesundheit: { seen: 2, redacted: 2, cancelled: 0, sent: 0 } },
  '2026-08': { technik: { seen: 1, redacted: 0, cancelled: 1, sent: 0 } },
};
const REPLY = { on: true, locked: false, months: MONTHS, store: STORE, branding: BRAND, language: 'de', managed: true };

test('Nachweis: Kopf mit Firma und Logo, Tabelle je Gruppe und Monat, Summe, Hinweis Selbstauskunft', async () => {
  const s = await open('nachweis', REPLY);
  const text = s.doc.body.textContent;
  assert.deepEqual(JSON.parse(JSON.stringify(s.sent)), [{ t: 'kompetenz' }]);
  assert.match(text, /KI-Kompetenz – Selbstauskunft/);
  assert.match(text, /Muster AG/);
  const img = s.find((n) => n.tagName === 'IMG');
  assert.equal(img.length, 1);
  assert.equal(img[0].getAttribute('src'), BRAND.logo);
  assert.equal(s.find((n) => ['OBJECT', 'EMBED', 'IFRAME'].includes(n.tagName)).length, 0);
  const rows = s.find((n) => n.getAttribute('data-gruppe'));
  assert.deepEqual(rows.map((r) => r.getAttribute('data-gruppe')), ['finanz', 'gesundheit', 'technik']);
  assert.deepEqual(rows[0].children.slice(1).map((c) => c.textContent), ['5', '3', '1', '1']);
  const sum = s.find((n) => n.getAttribute('class') === 'dlx-summe')[0];
  assert.deepEqual(sum.children.slice(1).map((c) => c.textContent), ['8', '5', '2', '1']);
  assert.match(text, /Oktober 2026/);
  assert.match(text, /August 2026/);
  assert.match(text, /Selbstauskunft, lokal gezählt/);
  assert.match(text, /2024\/1689/);
  assert.ok(!/konform|erfüllt/i.test(text));
});

test('Nachweis: Gesundheit/nationale ID ausblendbar, Drucken nur ueber den Browser, Name ohne Nachricht', async () => {
  const s = await open('nachweis', REPLY);
  const box = s.find((n) => n.getAttribute('id') === 'dlx-rec-hide')[0];
  box.checked = true;
  box.fire('change');
  assert.deepEqual(s.find((n) => n.getAttribute('data-gruppe')).map((r) => r.getAttribute('data-gruppe')), ['finanz', 'technik']);
  assert.ok(!/Gesundheit/.test(s.find((n) => n.getAttribute('id') === 'dlx-rec-tabelle')[0].textContent));
  const name = s.find((n) => n.tagName === 'INPUT' && n.getAttribute('type') === 'text')[0];
  assert.equal(name.getAttribute('autocomplete'), 'off');
  name.value = 'Erika Muster';
  name.fire('input');
  s.find((n) => n.getAttribute('id') === 'dlx-rec-drucken')[0].fire('click');
  assert.equal(s.printed(), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(s.sent)), [{ t: 'kompetenz' }], 'keine weitere Nachricht');
  assert.equal(s.ctx.location.hash, '');
});

test('Nachweis: aus bzw. von der Organisation ausgeschaltet, leer, gefaelschte Zahlen', async () => {
  const off = await open('nachweis', { on: false, locked: true, months: MONTHS, store: {}, branding: BRAND, language: 'de' });
  assert.match(off.doc.body.textContent, /Ihre Organisation hat den Nachweis ausgeschaltet/);
  assert.equal(off.find((n) => n.tagName === 'TABLE').length, 0);
  const empty = await open('nachweis', Object.assign({}, REPLY, { store: {} }));
  assert.match(empty.doc.body.textContent, /Noch keine Erklärungen gezählt/);
  const forged = await open('nachweis', Object.assign({}, REPLY, { store: { '2026-10': { finanz: { seen: '9<b>' } } } }));
  assert.match(forged.doc.body.textContent, /Noch keine Erklärungen gezählt/);
  assert.equal(forged.find((n) => n.tagName === 'B').length, 0);
  const en = await open('nachweis', Object.assign({}, REPLY, { language: 'en' }));
  assert.match(en.doc.body.textContent, /self-declared record/);
});

test('Erklaerseite: Gruppe aus dem Hash nur per Positivliste, sonst Uebersicht; nur Branding-Nachricht', async () => {
  const brand = { branding: BRAND, language: 'de' };
  const g = await open('wissen', brand, '#finanz');
  assert.deepEqual(JSON.parse(JSON.stringify(g.sent)), [{ t: 'brand' }]);
  const t = g.doc.body.textContent;
  assert.match(t, /Konto- und Kartennummern genügen/);
  assert.match(t, /IBAN/);
  assert.match(t, /Was Sie tun können/);
  assert.match(t, /keine Rechtsberatung/);
  const evil = await open('wissen', brand, '#__proto__');
  const links = evil.find((n) => n.tagName === 'A').map((a) => a.getAttribute('href'));
  assert.equal(links.length, 10, 'Uebersicht mit allen Gruppen');
  assert.ok(links.every((x) => /^chrome-extension:\/\/x\/ui\/wissen\.html#[a-z-]+$/.test(x)));
  const firma = await open('wissen', brand, '#firma');
  assert.match(firma.doc.body.textContent, /Eigener Begriff/);
});

test('Neue Seiten: ohne Netz, Speicher, externe URLs, Inline-Script; Nachweis sendet nur die Lese-Nachricht (Auflagen 6, 9, 12)', () => {
  for (const f of ['common/kompetenz.js', 'ui/nachweis.js', 'ui/wissen.js']) {
    const src = fs.readFileSync(path.join(EXT, f), 'utf8');
    assert.ok(!/fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|https?:\/\/|innerHTML/.test(src), f);
    assert.ok(!/chrome\.storage|localStorage|sessionStorage|indexedDB|location\.(hash|search)\s*=|history\./.test(src), f + ': kein Speicher, nichts in URL/Hash');
  }
  const n = fs.readFileSync(path.join(EXT, 'ui/nachweis.js'), 'utf8');
  assert.deepEqual([...n.matchAll(/sendMessage\(([^)]*)\)/g)].map((m) => m[1]), ["{ t: 'kompetenz' }"], 'Nachweis sendet nur die Lese-Nachricht');
  assert.match(n, /autocomplete: 'off'/);
  for (const page of ['ui/wissen.html', 'ui/nachweis.html']) {
    const html = fs.readFileSync(path.join(EXT, page), 'utf8');
    assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), page + ': kein Inline-Script');
    assert.ok(!/<script[^>]+src=["']https?:/.test(html), page);
  }
});
