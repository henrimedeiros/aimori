// Marke AImori (Name seit 17.10.2026, Signet seit 16.10.2026), Design-Review Marke 16.10.2026
// (docs/sicherheit/design-review-aimori-16-10.md): Master-SVGs ohne aktive Inhalte,
// Signet aus festen Pfaden, Whitelabel ueberschreibt Name, Logo und Farben, technische
// Kennungen bleiben (Schriften: tests/schriften.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, EXT, load } from './helpers/load.mjs';

const read = (...p) => fs.readFileSync(path.join(EXT, ...p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

const svgs = ['signet.svg', 'signet-kraeftig.svg', 'signet-mono.svg'];
const pfade = (svg) => [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);

test('Master-SVGs ohne aktive Inhalte (Auflage 3)', () => {
  for (const f of svgs) {
    const s = read('icons', f);
    assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 200 200"/, f);
    assert.doesNotMatch(s, /<script|foreignObject|\shref=|xlink:|\son[a-z]+=|<style|<!ENTITY|<!DOCTYPE|<\?xml-stylesheet/i, f);
    for (const m of s.matchAll(/url\(([^)]*)\)/g)) assert.match(m[1], /^#[a-z-]+$/, f);
    assert.match(s, /aria-label="AImori"/, f);
  }
});

test('Signet: Pixel-Rechnung und Inline-SVG nutzen genau die Pfade der Master-SVGs (Auflagen 4, 5)', () => {
  const S = load(['common/signet.js']).signet;
  const voll = pfade(read('icons', 'signet.svg')), kraeftig = pfade(read('icons', 'signet-kraeftig.svg'));
  assert.deepEqual([...S.PFADE.signet], voll);
  assert.deepEqual([...S.PFADE.kraeftig], kraeftig);
  // Mono = Standard ohne Raute
  assert.deepEqual(pfade(read('icons', 'signet-mono.svg')), voll.filter((d, i) => i !== 3));
  const dom = read('common', 'dom.js');
  const form = /const SIGNET_FORM = \[([\s\S]*?)\];/.exec(dom)[1];
  assert.deepEqual([...form.matchAll(/\['([^']+)'/g)].map((m) => m[1]), kraeftig);
});

test('Signet-Rasterer: Groessen nur aus der Positivliste, Ampel nur mit bekannten Farben (Auflage 5)', () => {
  const S = load(['common/signet.js']).signet;
  assert.deepEqual([...S.SIZES], [16, 32, 48, 128]);
  for (const s of [0, 1, 17, 64, 4096, -16, 16.5, '16', NaN]) assert.equal(S.rgba(s, '').length, 0, String(s));
  const px = S.rgba(16, '');
  assert.equal(px.length, 16 * 16 * 4);
  // Ecken der Kachel transparent, Mitte deckend
  assert.equal(px[3], 0);
  assert.equal(px[(8 * 16 + 8) * 4 + 3], 255);
  // Ampelpunkt unten rechts in der Farbe des Zustands
  for (const [f, rgb] of Object.entries(S.DOTS)) {
    const d = S.rgba(32, f), o = (24 * 32 + 24) * 4;
    assert.deepEqual([d[o], d[o + 1], d[o + 2], d[o + 3]], [...rgb, 255], f);
  }
});

// Kleine DOM-Attrappe fuer common/dom.js
class Node {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = {}; this.children = []; this.text = ''; this.props = {}; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.hasOwn(this.attrs, k) ? this.attrs[k] : null; }
  append(...c) { this.children.push(...c); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
}
function dom() {
  const root = new Node('html');
  root.style = { setProperty(k, v) { root.props[k] = v; } };
  const document = { documentElement: root, createElement: (t) => new Node(t), createElementNS: (ns, t) => new Node(t), createTextNode: (s) => Object.assign(new Node('#text'), { text: s }) };
  const DLX = load(['branding.js', 'common/dom.js'], { document });
  return { DLX, root };
}
const farben = (svg) => svg.all((n) => n.tagName === 'PATH').map((p) => p.getAttribute('fill') === 'none' ? p.getAttribute('stroke') : p.getAttribute('fill'));

test('Standard: Name AImori mit abgesetztem AI, Signet mit eigenen Verlaeufen (dlx-Praefix, Zaehler)', () => {
  const { DLX, root } = dom();
  assert.equal(DLX.branding.productName, 'AImori');
  DLX.dom.applyBranding({}, false);
  assert.deepEqual(root.props, {});
  const b = DLX.dom.brand({});
  assert.equal(b.textContent, 'AImori');
  assert.equal(b.all((n) => n.getAttribute('class') === 'dlx-ai')[0].textContent, 'AI');
  const wm = b.all((n) => n.getAttribute('class') === 'dlx-product')[0];
  assert.deepEqual(wm.children.map((c) => c.textContent), ['AI', 'mori'], 'AI vorn abgesetzt, mori als Text');
  // Serifen-I (17.10.2026): I in eigenem Span, Text bleibt AImori, keine ARIA-Attribute an den Teil-Spans (Auflage 3)
  const ii = b.all((n) => n.getAttribute('class') === 'dlx-ai-i');
  assert.equal(ii.length, 1);
  assert.equal(ii[0].textContent, 'I');
  assert.equal(wm.textContent, 'AImori');
  assert.equal(DLX.dom.brand({ productName: 'AImori' }).all((n) => n.getAttribute('class') === 'dlx-ai-i').length, 1, 'gemischte Konfiguration mit Standardname');
  for (const n of wm.all(() => true)) assert.ok(!Object.keys(n.attrs).some((k) => /^aria-|^role$|^style$/.test(k)), 'Teil-Spans ohne aria/role/style');
  const a = DLX.dom.signet(), c = DLX.dom.signet();
  const ids = (s) => s.all((n) => n.tagName === 'LINEARGRADIENT').map((n) => n.getAttribute('id'));
  assert.deepEqual(ids(a).map((i) => i.replace(/\d+/, 'N')), ['dlx-sgN-gold', 'dlx-sgN-body', 'dlx-sgN-ring']);
  assert.notDeepEqual(ids(a), ids(c), 'eindeutige IDs je Signet');
  for (const f of farben(a)) assert.match(f, /^url\(#dlx-sg\d+-(gold|body|ring)\)$/);
});

test('Whitelabel: Name, Logo und Farbe ueberschreiben alles (Auflage 6)', () => {
  const { DLX, root } = dom();
  DLX.dom.applyBranding({ primaryColor: '#1f5c88', accentColor: '#9a4a06' }, false);
  assert.equal(root.props['--dlx-brand'], '#1f5c88');
  assert.equal(root.props['--dlx-haupt-grund'], '#1f5c88', 'Haupt-Knopf statt Verlauf');
  assert.equal(root.props['--dlx-signet'], '#1f5c88');
  assert.equal(root.props['--dlx-mark'], '#9a4a06');
  const s = DLX.dom.signet();
  assert.equal(s.all((n) => n.tagName === 'LINEARGRADIENT').length, 0);
  assert.deepEqual([...new Set(farben(s))], ['#1f5c88'], 'Signet einfarbig in der Whitelabel-Farbe');
  const b = DLX.dom.brand({ productName: 'Acme Guard AI' });
  assert.equal(b.textContent, 'Acme Guard AI');
  assert.equal(b.all((n) => n.getAttribute('class') === 'dlx-ai').length, 0, 'Whitelabel-Name bleibt reiner Text');
  for (const n of ['AI Guard', 'AImori Pro', 'aimori']) {
    const x = DLX.dom.brand({ productName: n });
    assert.equal(x.textContent, n);
    assert.equal(x.all((k) => /^dlx-ai/.test(k.getAttribute('class') || '')).length, 0, 'Whitelabel-Name mit AI vorn ohne Serifen-Logik (Design-Review Serifen-I 17.10.2026, Auflage 2)');
  }
  const x = DLX.dom.brand({ productName: 'AI<img src=x onerror=alert(1)>' });
  assert.equal(x.textContent, 'AI<img src=x onerror=alert(1)>');
  assert.equal(x.all((n) => n.tagName === 'IMG' || n.getAttribute('class') === 'dlx-ai').length, 0, 'Whitelabel-Name nur als Text (Design-Review 17.10.2026, Auflage 4)');
  const logo = 'data:image/png;base64,iVBORw0KGgo=';
  const m = DLX.dom.mark({ logo }, 28);
  assert.equal(m.tagName, 'IMG');
  assert.equal(m.getAttribute('src'), logo);
});

test('Whitelabel: ungueltige Werte fallen auf die Marke zurueck (Auflage 6)', () => {
  for (const primaryColor of ['red', '#fff', '#12345g', 'url(#x)', '#ffffff;fill:red', '#fefefe' /* Kontrast < 3:1 auf Weiss */]) {
    const { DLX, root } = dom();
    DLX.dom.applyBranding({ primaryColor }, false);
    assert.equal(root.props['--dlx-brand'], undefined, primaryColor);
    assert.ok(farben(DLX.dom.signet()).every((f) => f.startsWith('url(#dlx-sg')), primaryColor);
  }
  {
    const { DLX, root } = dom();
    DLX.dom.applyBranding({ primaryColor: '#202020' }, true); // dunkel: Kontrast zu Graphit < 3:1
    assert.equal(root.props['--dlx-brand'], undefined);
  }
  const { DLX } = dom();
  for (const productName of ['\u0007', '   ', 42, '‮⁦']) assert.equal(DLX.dom.productName({ productName }), 'AImori', String(productName));
  assert.equal(DLX.dom.productName({ productName: 'x'.repeat(60) }).length, 40);
  for (const logo of ['data:image/svg+xml,<svg onload=alert(1)>', 'https://example.com/logo.png', 'http://example.com/l.png', 'javascript:alert(1)']) {
    const m = DLX.dom.mark({ logo }, 28);
    assert.equal(m.tagName, 'SVG', logo);
  }
});

test('Technische Kennungen bleiben (Auflage 8)', () => {
  const der = Buffer.from(manifest.key, 'base64');
  const id = crypto.createHash('sha256').update(der).digest('hex').slice(0, 32).replace(/./g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
  assert.equal(id, 'hfgcdbigpgpdoegkhfbbbnibnkpdjkbb');
  const admx = fs.readdirSync(path.join(ROOT, 'enterprise', 'admx')).filter((f) => f.endsWith('.admx')).sort();
  assert.deepEqual(admx, ['dlx-chrome.admx', 'dlx-edge.admx']);
  for (const f of admx) assert.ok(!/aimori/i.test(fs.readFileSync(path.join(ROOT, 'enterprise', 'admx', f), 'utf8')), f);
  for (const l of ['de-DE', 'en-US']) {
    for (const b of ['chrome', 'edge']) {
      const adml = fs.readFileSync(path.join(ROOT, 'enterprise', 'admx', l, `dlx-${b}.adml`), 'utf8');
      assert.match(adml, /<displayName>AImori<\/displayName>/);
    }
  }
});
