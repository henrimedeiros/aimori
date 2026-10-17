// Regeln je Konto (Design-Review Konto-Regeln 14.10.2026): Validierung von
// accountRules, Stufen-Logik mit harten Sperren, Kontoerkennung nur aus
// sichtbaren Signalen im festen Kontobereich, Quelltext-Waechter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, ENGINE_FILES, EXT } from './helpers/load.mjs';
import { fakeDom } from './helpers/fakedom.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/policy.js']);
const plain = (x) => JSON.parse(JSON.stringify(x));
// Ergebnisse aus dem vm-Realm per JSON vergleichbar machen.
const P = Object.assign({}, DLX.policy, { validate: (...a) => plain(DLX.policy.validate(...a)) });
const NAME = 'Beispiel Treuhand AG';

test('accountRules: gueltiger Eintrag wird normalisiert, Standardstufen normal', () => {
  const r = P.validate({ accountRules: { chatgpt: { workspaces: ['  Beispiel   Treuhand AG '], business: 'hint', personal: 'block' } } });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(plain(r.value.accountRules), { chatgpt: { workspaces: ['beispiel treuhand ag'], markers: [], business: 'hint', personal: 'block', unknown: 'normal' } });
});

test('accountRules: allow nur fuer business und nur mit Workspace-Namen oder host (Auflagen 1-2)', () => {
  const bad = [
    [{ chatgpt: { workspaces: [NAME], personal: 'allow' } }, 'accountRules.chatgpt.personal'],
    [{ chatgpt: { workspaces: [NAME], unknown: 'allow' } }, 'accountRules.chatgpt.unknown'],
    [{ chatgpt: { markers: ['plan'], business: 'allow' } }, 'accountRules.chatgpt.business'],
    [{ copilot: { markers: ['shield'], business: 'allow' } }, 'accountRules.copilot.business'],
  ];
  for (const [v, err] of bad) {
    const r = P.validate({ accountRules: v });
    assert.deepEqual(plain(r.value.accountRules), {}, 'Eintrag verworfen = bisheriges Verhalten');
    assert.ok(r.errors.includes(err), err + ' ' + r.errors);
  }
  assert.deepEqual(P.validate({ accountRules: { chatgpt: { workspaces: [NAME], business: 'allow' } } }).errors, []);
  assert.deepEqual(P.validate({ accountRules: { m365copilot: { markers: ['host'], business: 'allow' } } }).errors, []);
});

test('accountRules: harte Grenzen, Kennzeichen je Seite, Fehler nennen nie Namen oder Werte (Auflage 9)', () => {
  const many = Array.from({ length: 21 }, (_, i) => 'Firma ' + i);
  const cases = [
    { chatgpt: { workspaces: many } },
    { chatgpt: { workspaces: ['x'.repeat(81)] } },
    { chatgpt: { workspaces: [NAME, 5] } },
    { chatgpt: { markers: ['shield'] } },
    { m365copilot: { markers: ['plan'] } },
    { chatgpt: { business: 'egal' } },
    { chatgpt: { workspaces: [NAME], extra: NAME } },
    { chatgpt: 'x' },
    { 'Geheimer Firmenname': { workspaces: [NAME] } },
    { gemini: { workspaces: [NAME] } },
  ];
  for (const v of cases) {
    const r = P.validate({ accountRules: v });
    assert.ok(r.errors.length > 0, JSON.stringify(v));
    assert.deepEqual(plain(r.value.accountRules), {}, JSON.stringify(v));
    const e = r.errors.join(' ');
    assert.ok(!e.includes('Firma') && !e.includes('Treuhand') && !e.includes('Geheim') && !e.includes('egal'), e);
  }
  assert.deepEqual(P.validate({ accountRules: { chatgpt: {}, claude: {}, copilot: {}, m365copilot: {}, gemini: {} } }).errors, ['accountRules']);
  assert.deepEqual(P.validate({ accountRules: [] }).errors, ['accountRules']);
});

test('accountRules: mit irgendeiner Richtlinie wird der lokale Wert nicht gelesen (Auflage 3)', () => {
  const local = { accountRules: { chatgpt: { workspaces: [NAME], business: 'allow' } } };
  assert.deepEqual(plain(P.effective({}, local, 'de-CH').cfg.accountRules.chatgpt.business), 'allow', 'ohne Richtlinie lokal');
  assert.deepEqual(plain(P.effective({ allowUserOverride: false }, local, 'de-CH').cfg.accountRules), {});
  const m = P.effective({ accountRules: { chatgpt: { workspaces: [NAME], personal: 'block' } } }, local, 'de-CH');
  assert.equal(m.cfg.accountRules.chatgpt.business, 'normal');
  assert.equal(m.locked.accountRules, true);
});

test('accountLevel: keine Regel / nur normal = null; unbekannt = strengste Stufe; Kennzeichen hoechstens hint', () => {
  const cfg = (rule) => ({ accountRules: { chatgpt: Object.assign({ workspaces: ['x'], markers: ['plan'], business: 'normal', personal: 'normal', unknown: 'normal' }, rule) } });
  assert.equal(P.accountLevel({ accountRules: {} }, 'chatgpt', { type: 'business', via: 'workspace' }), null);
  assert.equal(P.accountLevel(cfg({}), 'chatgpt', { type: 'personal' }), null);
  assert.equal(P.accountLevel(cfg({ business: 'hint' }), 'claude', { type: 'personal' }), null, 'andere Seite');
  const c = cfg({ business: 'allow', personal: 'block' });
  assert.deepEqual(plain(P.accountLevel(c, 'chatgpt', { type: 'business', via: 'workspace' })), { type: 'business', level: 'allow' });
  assert.deepEqual(plain(P.accountLevel(c, 'chatgpt', { type: 'business', via: 'plan' })), { type: 'business', level: 'hint' });
  assert.deepEqual(plain(P.accountLevel(c, 'chatgpt', { type: 'personal', via: null })), { type: 'personal', level: 'block' });
  assert.deepEqual(plain(P.accountLevel(c, 'chatgpt', { type: 'unknown', via: null })), { type: 'unknown', level: 'block' });
  assert.deepEqual(plain(P.accountLevel(c, 'chatgpt', { type: 'gefaelscht' })), { type: 'unknown', level: 'block' });
  assert.deepEqual(plain(P.accountLevel(c, 'chatgpt', null)), { type: 'unknown', level: 'block' });
  assert.deepEqual(plain(P.accountLevel(cfg({ business: 'hint', personal: 'hint' }), 'chatgpt', null)), { type: 'unknown', level: 'normal' }, 'unknown-Standard normal zaehlt mit');
  assert.deepEqual(plain(P.accountLevel(cfg({ business: 'hint', personal: 'hint', unknown: 'hint' }), 'chatgpt', null)), { type: 'unknown', level: 'hint' });
});

test('accountFindings: harte Sperren bleiben in jeder Stufe block (Auflage 3)', () => {
  const list = [
    { id: 'iban', action: 'warn' }, { id: 'ahv', action: 'redact' }, { id: 'aws_key', action: 'block' },
  ];
  const by = (l) => Object.fromEntries(l.map((f) => [f.id, f.action]));
  assert.deepEqual(by(P.accountFindings(list, 'allow')), { aws_key: 'block' });
  assert.deepEqual(by(P.accountFindings(list, 'hint')), { aws_key: 'block' });
  assert.deepEqual(by(P.accountFindings(list, 'normal')), { iban: 'warn', ahv: 'redact', aws_key: 'block' });
  assert.deepEqual(by(P.accountFindings(list, 'block')), { iban: 'block', ahv: 'block', aws_key: 'block' });
  const un = [{ id: 'unscannable', action: 'warn' }];
  for (const l of P.ACCOUNT_LEVELS) assert.deepEqual(by(P.accountFindings(un, l)), { unscannable: 'warn' }, l);
  // Ueber die Richtlinie: rules iban=block bleibt auch bei allow gesperrt.
  const eng = load(['branding.js', ...ENGINE_FILES, 'common/policy.js']);
  const cfg = eng.policy.effective({ rules: { iban: 'block' } }, {}, 'de-CH').cfg;
  const res = eng.engine.scan('IBAN CH9300762011623852957', eng.policy.engineConfig(cfg));
  const f = Array.from(res.findings);
  assert.equal(f[0].action, 'block');
  for (const l of eng.policy.ACCOUNT_LEVELS) assert.equal(eng.policy.accountFindings(f, l)[0].action, 'block', l);
});

// --- Kontoerkennung im Mini-DOM ------------------------------------------------
function page({ host = 'chatgpt.com', top = true } = {}) {
  const f = fakeDom();
  const win = f.win;
  const ctx = { document: f.doc, location: { hostname: host }, window: win, top: top ? win : {} };
  const D = load(['branding.js', ...ENGINE_FILES, 'common/policy.js', 'content/account.js'], ctx);
  // Sichtbarkeit wie checkVisibility({checkOpacity, checkVisibilityCSS}): hidden/opacity 0 = unsichtbar.
  const vis = (n) => { n.checkVisibility = () => !n.hidden && n.opacity !== 0; for (const c of n.children) vis(c); return n; };
  const el = (tag, attrs, ...kids) => {
    const n = f.el(tag, attrs);
    const text = kids.filter((k) => typeof k === 'string').join('');
    if (text) n.textContent = text;
    n.append(...kids.filter((k) => typeof k !== 'string'));
    return vis(n);
  };
  const rule = (r) => Object.assign({ workspaces: [P.normName(NAME)], markers: [], business: 'hint', personal: 'block', unknown: 'normal' }, r);
  const detect = (r, site = 'chatgpt') => plain(D.account.detect(site, rule(r), 'div.ProseMirror[contenteditable="true"]'));
  return { f, el, detect, body: f.doc.body };
}
// Arbeitsbereich-Wechsler (Quelle fuer Namen/Plan) bzw. Profil-Knopf (nur "angemeldet").
const area = (el, ...kids) => el('nav', {}, el('button', { 'data-testid': 'workspace-switcher-button' }, ...kids));
const profile = (el, ...kids) => el('nav', {}, el('button', { 'data-testid': 'accounts-profile-button' }, ...kids));

test('Erkennung: Anzeigename im Profil-Knopf gleich Workspace-Name oder "Team" ist kein Firmenkonto (Pflicht-Pruefung Auflage 1)', () => {
  const p = page();
  p.body.append(profile(p.el, p.el('span', {}, NAME), p.el('span', {}, 'Team')));
  assert.deepEqual(p.detect({ markers: ['plan'] }), { type: 'personal', via: null });
  const c = page({ host: 'claude.ai' });
  c.body.append(c.el('button', { 'data-testid': 'user-menu-button' }, c.el('span', {}, NAME), c.el('span', {}, 'Team')));
  assert.deepEqual(c.detect({ markers: ['plan'] }, 'claude'), { type: 'personal', via: null });
  c.body.append(c.el('button', { 'data-testid': 'org-switcher-button' }, c.el('span', {}, NAME)));
  assert.deepEqual(c.detect({}, 'claude'), { type: 'business', via: 'workspace' });
});

test('Erkennung: Workspace-Name sichtbar im Kontobereich = Firmenkonto', () => {
  const p = page();
  p.body.append(area(p.el, p.el('span', {}, NAME), p.el('span', {}, 'Team')));
  assert.deepEqual(p.detect({}), { type: 'business', via: 'workspace' });
});

test('Erkennung: Name mit Zero-Width-/Bidi-Zeichen und anderer Schreibung = Treffer (Auflage 7)', () => {
  const p = page();
  p.body.append(area(p.el, p.el('span', {}, 'BEISPIEL​ Treuhand‮ AG')));
  assert.deepEqual(p.detect({}), { type: 'business', via: 'workspace' });
  const q = page();
  q.body.append(area(q.el, q.el('span', {}, NAME + ' GmbH')));
  assert.deepEqual(q.detect({}), { type: 'personal', via: null }, 'nur ganzer Text, kein Teilstring');
});

test('Erkennung: Firmenname nur in der versteckten Auswahlliste/Menue = Privatkonto (Auflagen 4-5)', () => {
  const p = page();
  const list = p.el('div', { role: 'menu' }, p.el('div', { role: 'menuitem' }, NAME));
  p.body.append(area(p.el, p.el('span', {}, 'Max Muster'), list));
  assert.deepEqual(p.detect({}), { type: 'personal', via: null });
  const q = page();
  const hiddenName = q.el('span', {}, NAME);
  hiddenName.hidden = true;
  q.body.append(area(q.el, q.el('span', {}, 'Max Muster'), hiddenName));
  assert.deepEqual(q.detect({}), { type: 'personal', via: null }, 'verstecktes Kind zaehlt nicht');
});

test('Erkennung: aria-hidden, inert, opacity 0 oder ohne checkVisibility = nicht erkannt (Auflage 4)', () => {
  for (const mod of ['aria', 'inert', 'opacity', 'nocheck', 'popover']) {
    const p = page();
    const a = area(p.el, p.el('span', {}, NAME));
    if (mod === 'aria') a.setAttribute('aria-hidden', 'true');
    if (mod === 'inert') a.setAttribute('inert', '');
    if (mod === 'popover') a.setAttribute('popover', 'auto');
    if (mod === 'opacity') { const walk = (n) => { n.opacity = 0; n.children.forEach(walk); }; walk(a); }
    if (mod === 'nocheck') { const walk = (n) => { delete n.checkVisibility; n.children.forEach(walk); }; walk(a); }
    p.body.append(a);
    assert.deepEqual(p.detect({}), { type: 'unknown', via: null }, mod);
  }
});

test('Erkennung: Firmenname nur im Eingabefeld oder Verlauf = kein Treffer (Auflage 6)', () => {
  const p = page();
  p.body.append(p.el('article', {}, p.el('div', { 'data-testid': 'accounts-profile-button' }, p.el('span', {}, NAME))));
  p.body.append(p.el('div', { class: 'ProseMirror', contenteditable: 'true' }, p.el('span', { 'data-testid': 'accounts-profile-button' }, NAME)));
  assert.deepEqual(p.detect({}), { type: 'unknown', via: null });
  const q = page();
  q.body.append(q.el('div', { 'data-message-author-role': 'assistant' }, NAME));
  q.body.append(profile(q.el, q.el('span', {}, 'Max Muster')));
  assert.deepEqual(q.detect({}), { type: 'personal', via: null });
});

test('Erkennung: Plan-Kennzeichen nur mit markers plan, Schild nur mit shield, Host exakt (Auflage 8)', () => {
  const p = page();
  p.body.append(area(p.el, p.el('span', {}, 'Max Muster'), p.el('span', {}, 'Enterprise')));
  assert.deepEqual(p.detect({}), { type: 'personal', via: null });
  assert.deepEqual(p.detect({ markers: ['plan'] }), { type: 'business', via: 'plan' });
  const c = page({ host: 'copilot.com' });
  c.body.append(c.el('div', { 'data-testid': 'edp-shield' }, 'Geschuetzt'));
  assert.deepEqual(c.detect({}, 'copilot'), { type: 'personal', via: null });
  assert.deepEqual(c.detect({ markers: ['shield'] }, 'copilot'), { type: 'business', via: 'shield' });
  const m = page({ host: 'copilot.cloud.microsoft' });
  assert.deepEqual(m.detect({ markers: ['host'] }, 'm365copilot'), { type: 'business', via: 'host' });
  assert.deepEqual(m.detect({}, 'm365copilot'), { type: 'unknown', via: null });
  const fake = page({ host: 'copilot.cloud.microsoft.example.com' });
  assert.deepEqual(fake.detect({ markers: ['host'] }, 'm365copilot'), { type: 'unknown', via: null });
});

test('Erkennung: kein Kontobereich, Unterframe oder fremde Seite = nicht erkannt', () => {
  const p = page();
  assert.deepEqual(p.detect({}), { type: 'unknown', via: null });
  const s = page({ top: false });
  s.body.append(area(s.el, s.el('span', {}, NAME)));
  assert.deepEqual(s.detect({}), { type: 'unknown', via: null });
  const g = page({ host: 'gemini.google.com' });
  assert.deepEqual(g.detect({}, 'gemini'), { type: 'unknown', via: null });
});

test('Quelltext-Waechter Kontoerkennung: kein HTML, Wert, Cookie, Speicher, Netz, keine Mail-Muster (Auflage 13)', () => {
  const src = fs.readFileSync(path.join(EXT, 'content', 'account.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  for (const [name, re] of [['innerHTML', /innerHTML|outerHTML/], ['value', /\.value\b/], ['cookie', /cookie/i], ['Speicher', /localStorage|sessionStorage|indexedDB|chrome\.storage/],
    ['Netz', /fetch|XMLHttpRequest|WebSocket|sendBeacon/], ['Nachricht', /sendMessage|postMessage/], ['Mail-Muster', /@|mailto|aria-label\*=/], ['innerText', /innerText/]]) {
    assert.ok(!re.test(src), name);
  }
  assert.ok(!/gemini/.test(src), 'Gemini bleibt ausgeschlossen');
  // Nur das Enum geht an den Service Worker, nie Workspace-Namen.
  const content = fs.readFileSync(path.join(EXT, 'content', 'content.js'), 'utf8');
  assert.match(content, /account: p\.account \|\| null/);
  assert.ok(!/workspaces/.test(content.replace(/^\s*\/\/.*$/gm, '')), 'content.js reicht keine Namen weiter');
});
