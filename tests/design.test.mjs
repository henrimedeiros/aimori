// Design: ui/tokens.css traegt die Marken-Tokens AImori mit eigenem SHA im Kopf
// (Design-Review Marke 16.10.2026, Auflage 7), ohne Nachladen von aussen
// (Design-Review 14.10.2026 Auflage 15); ui.css nimmt Farben nur aus den Tokens.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, EXT } from './helpers/load.mjs';

const tokens = fs.readFileSync(path.join(EXT, 'ui', 'tokens.css'), 'utf8').replace(/\r\n/g, '\n');
const end = tokens.indexOf('*/\n') + 3;
const head = tokens.slice(0, end);
const body = tokens.slice(end);

test('tokens.css: Kopf nennt Herkunft und Stand, SHA-256 passt zum Inhalt', () => {
  assert.match(head, /Herkunft: Markenvorgabe Helm-Schild, Stand \d{4}-\d{2}-\d{2} \(Commit [0-9a-f]{7,}\)/);
  const sha = /SHA-256 des Inhalts \(LF\): ([0-9a-f]{64})/.exec(head);
  assert.ok(sha, 'SHA im Kopf');
  assert.equal(crypto.createHash('sha256').update(body).digest('hex'), sha[1], 'Inhalt unveraendert');
});

// BEDINGT bis zum Folgeschritt Website (neue Marke): verglichen wird erst, wenn die
// Website-Tokens die Marke tragen (--marke-1); sonst ausdruecklich uebersprungen
// (Design-Review Marke 16.10.2026, Auflage 7).
test('tokens.css gleich der Website-Datei (wenn die Website-Arbeitskopie daneben liegt)', (t) => {
  const candidates = [process.env.WEBSITE_REPO].filter(Boolean);
  const web = candidates.map((d) => path.join(d, 'design', 'tokens.css')).find((f) => fs.existsSync(f));
  if (!web) { t.skip('Website-Arbeitskopie nicht gefunden (WEBSITE_REPO setzen)'); return; }
  if (!/--marke-1:/.test(fs.readFileSync(web, 'utf8'))) { t.skip('BEDINGT: Website traegt die Marken-Tokens noch nicht (Folgeschritt Website)'); return; }
  assert.equal(body, fs.readFileSync(web, 'utf8').replace(/\r\n/g, '\n'), 'tokens.css neu von der Website kopieren');
});

// Design-Review Token-Abgleich 17.10.2026: tokens-erweiterung.css traegt nur erweiterungseigene
// Variablen (Auflagen 3, 7), --flaeche deckt (Auflage 4), Warn-/OK-Farben und Warnleiste bleiben AA (Auflage 6).
const plain = (css) => css.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const blocks = (css) => [...plain(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(),
  decl: m[2].split(';').map((d) => d.trim()).filter(Boolean) }));
const extCss = fs.readFileSync(path.join(EXT, 'ui', 'tokens-erweiterung.css'), 'utf8');
const SEL = { hell: ':root', system: ':root:not([data-theme="hell"])', dunkel: ':root[data-theme="dunkel"]' };

test('tokens-erweiterung.css: nur eigene Variablen in den Selektoren von tokens.css', () => {
  assert.doesNotMatch(plain(extCss).replace(/@media \(prefers-color-scheme: dark\)/g, ''), /@/);
  const webNames = new Set([...plain(body).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const bs = blocks(extCss);
  assert.deepEqual([...new Set(bs.map((b) => b.sel))].sort(), Object.values(SEL).sort());
  const of = (s) => bs.filter((b) => b.sel === s).flatMap((b) => b.decl);
  assert.deepEqual(of(SEL.system), of(SEL.dunkel), 'Dunkel per System gleich Dunkel per Schalter');
  for (const b of bs) for (const d of b.decl) {
    const name = /^(--[a-z0-9-]+)\s*:/.exec(d);
    assert.ok(name, b.sel + ': nur Variablen, nicht ' + d);
    assert.ok(!name[1].startsWith('--dlx-'), name[1] + ': --dlx-* setzt nur Whitelabel');
    assert.ok(!webNames.has(name[1]), name[1] + ': ueberschreibt ein Website-Token');
  }
});

function themeVars(thema) {
  const vars = {};
  for (const css of [body, extCss]) for (const b of blocks(css)) {
    if (b.sel !== SEL.hell && !(thema === 'dunkel' && b.sel === SEL.dunkel)) continue;
    for (const d of b.decl) { const i = d.indexOf(':'); vars[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
  }
  const get = (n) => { let v = vars[n]; for (let i = 0; i < 9 && /var\(/.test(v); i++) v = v.replace(/var\((--[a-z0-9-]+)\)/g, (_, x) => vars[x]); return v; };
  return get;
}
function rgba(v) {
  let m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(m[2] ? parseInt(m[2], 16) / 255 : 1);
  m = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(v);
  assert.ok(m, 'Farbe lesbar: ' + v);
  return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
}
const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lum = (c) => c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; })
  .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
const kontrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const thema of ['hell', 'dunkel']) {
  test(`Tokens ${thema}: --flaeche deckend, Warnung/OK/Warnleiste mit Kontrast AA`, () => {
    const get = themeVars(thema);
    assert.match(get('--flaeche'), /^#[0-9a-f]{6}$/i, '--flaeche deckend');
    const bg = rgba(get('--bg')), flaeche = rgba(get('--flaeche')), leiste = over(rgba(get('--leiste')), bg);
    for (const [fg, grund, name] of [['--warn', bg, 'bg'], ['--warn', flaeche, 'flaeche'], ['--warn', leiste, 'leiste'],
      ['--ok', bg, 'bg'], ['--ok', flaeche, 'flaeche'], ['--ink', leiste, 'leiste'], ['--muted', leiste, 'leiste']]) {
      const k = kontrast(over(rgba(get(fg)), grund), grund);
      assert.ok(k >= 4.5, `${fg} auf ${name}: ${k.toFixed(2)}`);
    }
  });
}

test('Stylesheets laden nichts nach (kein @import, url(), externe Schriften)', () => {
  for (const f of ['tokens.css', 'tokens-erweiterung.css', 'ui.css']) {
    const css = fs.readFileSync(path.join(EXT, 'ui', f), 'utf8');
    assert.ok(!/@import|url\(|image-set\(|@font-face|expression\(|\bsrc\s*:|https?:/i.test(css), f);
    // content: nur feste Texte, nie Werte aus Attributen (Design-System-Review 14.10. Auflage 1)
    assert.ok(!/attr\(/i.test(css), f + ': attr()');
  }
});

// Design-System-Review 14.10.2026 (docs/sicherheit/design-review-design-system-14-10.md)
const rules = () => [...fs.readFileSync(path.join(EXT, 'ui', 'ui.css'), 'utf8').replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

test('"Trotzdem" nur im Zweit-Stil: nie Haupt-/Marken-/Schwaerzfarbe, nie eigene Groesse (Auflage 4)', () => {
  const t = rules().filter((r) => /dlx-trotzdem/.test(r.sel));
  assert.ok(t.length >= 2);
  for (const r of t) {
    assert.doesNotMatch(r.body, /--redact|--dlx-brand|--cta|--accent\b|--dlx-signet/, r.sel);
    assert.doesNotMatch(r.body, /(^|;)\s*(height|font-size|padding|width)\s*:/, r.sel);
  }
});

test('Leiste und Dialog werden von ui.css nie versteckt oder nach hinten geschoben (Auflage 3)', () => {
  for (const r of rules().filter((x) => /dlx-(bar|karte|aktionen|liste|frame|voll-seite)/.test(x.sel) && !/::after|:disabled/.test(x.sel))) {
    assert.doesNotMatch(r.body, /visibility\s*:|display\s*:\s*none|pointer-events\s*:\s*none|z-index|clip|opacity\s*:\s*0?\.\d/, r.sel);
  }
});

test('ui.css setzt keine Token- oder Fokusfarben neu (Whitelabel nur ueber dom.js, Auflagen 2/5/6)', () => {
  const css = fs.readFileSync(path.join(EXT, 'ui', 'ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const defined = [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
  assert.deepEqual(defined.filter((v) => !v.startsWith('--dlx-')), []);
  assert.doesNotMatch(css, /var\(--[a-z0-9-]+\s*,/, 'kein Rueckfallwert in var()');
  assert.doesNotMatch(css, /outline\s*:\s*(none|0)/, 'Fokus nie entfernen');
});

test('ui.css nimmt Farben nur aus den Tokens', () => {
  const css = fs.readFileSync(path.join(EXT, 'ui', 'ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepEqual(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g) || [], []);
});

test('alle Erweiterungsseiten binden tokens.css vor ui.css ein', () => {
  for (const f of ['dialog.html', 'popup.html', 'options.html']) {
    const html = fs.readFileSync(path.join(EXT, 'ui', f), 'utf8');
    const a = html.indexOf('href="tokens.css"'), b = html.indexOf('href="ui.css"');
    assert.ok(a > 0 && b > a, f);
  }
  // Design-Review Token-Abgleich 17.10.2026: tokens-erweiterung.css zwischen tokens.css und ui.css, in jeder Seite mit ui.css
  for (const f of fs.readdirSync(path.join(EXT, 'ui')).filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(EXT, 'ui', f), 'utf8');
    if (!html.includes('href="ui.css"')) continue;
    const a = html.indexOf('href="tokens.css"'), e = html.indexOf('href="tokens-erweiterung.css"'), b = html.indexOf('href="ui.css"');
    assert.ok(a > 0 && e > a && b > e, f);
  }
});

test('UI-Skripte rufen nur vorhandene DLX.dom-Funktionen auf (kein entferntes header)', () => {
  const dom = fs.readFileSync(path.join(EXT, 'common', 'dom.js'), 'utf8');
  const exported = new Set(dom.match(/DLX\.dom = \{([^}]*)\}/)[1].split(',').map((s) => s.trim()));
  for (const f of ['dialog.js', 'options.js', 'popup.js']) {
    const src = fs.readFileSync(path.join(EXT, 'ui', f), 'utf8');
    for (const m of src.matchAll(/DLX\.dom\.([a-zA-Z]+)/g)) assert.ok(exported.has(m[1]), f + ': DLX.dom.' + m[1]);
    assert.doesNotMatch(src, /dlx-primary|dlx-danger|dlx-list\b/, f + ': alte Klassen');
  }
});

// Hauptknopf hell/dunkel (17.10.2026, Design-Review Hauptknopf 17.10.2026 Auflagen 3, 4, 6, 7): auf Hell satter
// Verlauf ohne Glow, Schrift an jedem Verlaufsstopp AA; auf Dunkel heller Verlauf mit Glow; Whitelabel hat Vorrang.
for (const thema of ['hell', 'dunkel']) {
  test(`Hauptknopf ${thema}: Schrift an jedem Verlaufsstopp >= 4,5:1, Knopf hebt sich vom Grund ab, Fokusring sichtbar`, () => {
    const get = themeVars(thema);
    const stopps = [...get('--haupt-verlauf').matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => rgba(m[0]));
    assert.ok(stopps.length >= 2, 'Verlauf mit mindestens zwei Stopps');
    const ink = rgba(get('--haupt-ink')), bg = rgba(get('--bg'));
    for (const s of stopps) assert.ok(kontrast(ink, s) >= 4.5, `Schrift auf ${s}: ${kontrast(ink, s).toFixed(2)}`);
    if (thema === 'hell') {
      for (const s of stopps) assert.ok(kontrast(s, bg) >= 3, `Knopf gegen Grund: ${kontrast(s, bg).toFixed(2)} (Kante nicht einzige Grenze)`);
      for (const n of ['--haupt-schatten', '--haupt-schatten-hover', '--haupt-glow']) {
        assert.doesNotMatch(get(n), /--dlx-brand|--marke|undefined/, n + ': kein farbiger Glow auf Hell');
        for (const m of get(n).matchAll(/(\d+)px/g)) assert.ok(+m[1] <= 8, n + ': Schatten hoechstens 8 px (kein weicher Glow)');
      }
      assert.match(get('--haupt-schatten'), /inset 0 0 0 1px/, 'feine Innenkante');
    } else {
      assert.match(extCss, /--haupt-schatten: 0 0 28px -8px var\(--dlx-brand\)/, 'Dunkel behaelt den Glow in der Whitelabel-Farbe');
    }
    assert.ok(kontrast(rgba(get('--accent')), bg) >= 3, 'Fokusring (--accent) >= 3:1');
  });
}

test('Hauptknopf: Farben nur ueber --dlx-* (Whitelabel), ohne !important; Trotzdem ohne Schatten und Hauptfarbe', () => {
  const haupt = rules().filter((r) => /\.dlx-haupt\b/.test(r.sel) && /^\.dlx-knopf\.dlx-haupt/.test(r.sel));
  assert.ok(haupt.length >= 3, 'Grund, Hover, gedrueckt');
  for (const r of haupt) {
    assert.doesNotMatch(r.body, /!important/, r.sel);
    for (const m of r.body.matchAll(/(?:^|;)\s*(background|color)\s*:\s*([^;]+)/g)) {
      assert.match(m[2].trim(), m[1] === 'color' ? /^var\(--dlx-brand-ink\)$/ : /^var\(--dlx-haupt-grund\)$/, r.sel + ' ' + m[1]);
    }
  }
  const tr = rules().find((r) => r.sel === '.dlx-knopf.dlx-trotzdem');
  assert.match(tr.body, /box-shadow:\s*none/, 'Trotzdem ohne Schatten (Zweit-Stil)');
  const root = rules().find((r) => r.sel === ':root').body;
  assert.match(root, /--dlx-haupt-grund:\s*var\(--haupt-verlauf\)/);
  assert.match(root, /--dlx-brand-ink:\s*var\(--haupt-ink\)/);
});
