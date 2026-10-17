// KI-Seiten-Kontrolle (Design-Review KI-Seiten 14.10.2026): Liste, Richtlinien,
// Entscheid, Quelltext-Waechter. Service-Worker-Teil in tests/background.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, ENGINE_FILES, EXT } from './helpers/load.mjs';

const DLX = load(['branding.js', ...ENGINE_FILES, 'common/aisites.js', 'common/policy.js'], { URL });
const A = DLX.aisites;
const P = DLX.policy;
const plain = (v) => JSON.parse(JSON.stringify(v));
const eff = (managed, local) => plain(P.effective(managed, local, { timeZone: 'Europe/Zurich', languages: ['de-CH'] }));

test('Liste: mind. 40 Seiten, Stand-Datum, eindeutige IDs, Hosts klein/ASCII ohne Port, Pfad oder * und je einmal (Auflage 2)', () => {
  assert.ok(A.LIST.length >= 40, String(A.LIST.length));
  assert.match(A.STAND, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Set(A.IDS).size, A.IDS.length);
  const hosts = A.LIST.flatMap((x) => x.hosts);
  assert.equal(new Set(hosts).size, hosts.length, 'Host doppelt');
  const kat = ['chat', 'suche', 'code', 'bild', 'video', 'audio', 'begleiter', 'sammler', 'schreiben', 'uebersetzung', 'praesentation'];
  for (const x of A.LIST) {
    assert.match(x.id, /^[a-z0-9]{1,30}$/, x.id);
    assert.match(x.anbieterSitz, /^[A-Z]{2}$/, x.id);
    assert.ok(kat.includes(x.kategorie), x.id);
    assert.ok(x.name && x.name.length <= 40, x.id);
    assert.ok(x.pfad === '' || /^\/[a-z0-9-]+$/.test(x.pfad), x.id);
    for (const h of x.hosts) assert.match(h, /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/, h);
  }
  for (const id of ['chatgpt', 'claude', 'gemini', 'copilot', 'm365copilot', 'perplexity', 'mistral', 'deepseek', 'grok', 'poe', 'characterai', 'you', 'huggingchat', 'metaai', 'qwen', 'kimi']) assert.ok(A.IDS.includes(id), id);
  for (const id of P.SITES) assert.ok(A.IDS.includes(id), 'unterstuetzte Seite fehlt: ' + id);
  assert.ok(!('speicherort' in A.LIST[0]), 'Feld heisst anbieterSitz (Auflage 2)');
});

test('Freigegebene KI vorschlagen: nur Richtlinie, ID nur ueber die Liste, Sperre vor Vorschlag, feste https-Startadresse (Design-Review 16.10.2026)', () => {
  // Validierung: nur bekannte IDs, nie Prototyp-Namen (Auflage 1)
  assert.deepEqual(plain(P.validate({ suggestedAiSite: 'm365copilot' })).value, { suggestedAiSite: 'm365copilot' });
  for (const v of ['constructor', '__proto__', 'tostring', 'valueof', 'hasownproperty', 'gibtsnicht']) {
    const r = plain(P.validate({ suggestedAiSite: v }));
    assert.deepEqual(r.value, {}, v);
    assert.equal(A.byId(v), null, v);
  }
  for (const v of ['M365copilot', 'https://evil.example/', '', 7, ['claude'], 'x'.repeat(31)]) assert.deepEqual(plain(P.validate({ suggestedAiSite: v })).errors, ['suggestedAiSite'], String(v));
  // Benutzerwert nie (Auflage 2)
  assert.deepEqual(plain(P.validate({ suggestedAiSite: 'claude' }, true)).errors, ['unknown:suggestedAiSite']);
  assert.equal(eff({}, { aiSiteMode: 'hint', suggestedAiSite: 'claude' }).cfg.suggestedAiSite, '');
  assert.equal(eff({ suggestedAiSite: '' }, { suggestedAiSite: 'claude' }).cfg.suggestedAiSite, '');
  assert.equal(eff({}, {}).cfg.suggestedAiSite, '', 'ohne Richtlinie keine Funktion');
  const m = eff({ suggestedAiSite: 'm365copilot' }, { aiSiteMode: 'block' });
  assert.equal(m.cfg.suggestedAiSite, 'm365copilot');
  assert.equal(m.cfg.aiSiteMode, 'off', 'Richtlinie setzt ein KI-Feld -> lokaler Block gilt nicht');
  assert.ok(m.locked.suggestedAiSite && m.locked.aiSiteMode);
  // Entscheid: Vorschlag gilt als freigegeben, Sperre schlaegt ihn (Auflage 5)
  const cfg = (x) => Object.assign({ aiSiteMode: 'hint', allowedAiSites: [], blockedAiSites: [], suggestedAiSite: 'm365copilot' }, x);
  assert.equal(P.aiDecision(cfg(), 'm365copilot'), 'none');
  assert.equal(P.aiDecision(cfg(), 'chatgpt'), 'hint');
  assert.equal(P.aiDecision(cfg({ aiSiteMode: 'block' }), 'chatgpt'), 'block');
  assert.equal(P.aiDecision(cfg({ blockedAiSites: ['m365copilot'] }), 'm365copilot'), 'block');
  assert.equal(P.aiDecision(cfg({ suggestedAiSite: 'constructor' }), 'constructor'), 'hint');
  // Freigabe nur ueber exakte Hosts der Liste (Auflage 4)
  for (const o of ['https://m365copilot.evil.example', 'https://evil-copilot.cloud.microsoft', 'https://copilot.cloud.microsoft.evil.example', 'https://evil.copilot.cloud.microsoft']) assert.equal(A.find(o, o + '/'), null, o);
  // Knopf (Auflagen 5, 6)
  assert.deepEqual(plain(P.aiSuggestion(cfg(), 'chatgpt')), { id: 'm365copilot', name: 'Microsoft 365 Copilot', url: 'https://copilot.cloud.microsoft/' });
  assert.equal(P.aiSuggestion(cfg(), 'm365copilot'), null, 'schon dort');
  assert.equal(P.aiSuggestion(cfg({ blockedAiSites: ['m365copilot'] }), 'chatgpt'), null, 'gesperrt');
  assert.equal(P.aiSuggestion(cfg({ suggestedAiSite: '' }), 'chatgpt'), null);
  assert.equal(P.aiSuggestion(cfg({ suggestedAiSite: '__proto__' }), 'chatgpt'), null);
  assert.equal(P.aiSuggestion(cfg({ suggestedAiSite: 'huggingchat' }), 'chatgpt').url, 'https://huggingface.co/chat');
  for (const x of A.LIST) {
    const u = new URL(A.start(x));
    assert.ok(u.protocol === 'https:' && u.hostname === x.hosts[0] && u.pathname.startsWith('/'), x.id);
  }
});

test('Paket enthaelt keinen Test-Hook fuer die Richtlinie (Design-Review Freigegebene KI 16.10.2026, Auflage 7)', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'vendor' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
  for (const f of walk(EXT).filter((x) => /\.(m?js|html|json)$/.test(x))) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!t.includes('__e2e') && !/managed\s*\.\s*get\s*=/.test(t), path.relative(EXT, f));
  }
});

test('find: nur exakter https-Origin, Pfad-Eintraege nur mit passendem Pfad', () => {
  assert.equal(A.find('https://chat.deepseek.com', 'https://chat.deepseek.com/a').id, 'deepseek');
  assert.equal(A.find('https://www.perplexity.ai').id, 'perplexity');
  for (const o of ['http://chat.deepseek.com', 'https://chat.deepseek.com:8443', 'https://evil.chat.deepseek.com', 'https://deepseek.com', 'https://example.com', '', null, 'https://__proto__']) assert.equal(A.find(o, 'https://x/'), null, String(o));
  assert.equal(A.find('https://huggingface.co', 'https://huggingface.co/chat/').id, 'huggingchat');
  assert.equal(A.find('https://huggingface.co', 'https://huggingface.co/chat').id, 'huggingchat');
  assert.equal(A.find('https://huggingface.co', 'https://huggingface.co/models'), null);
  assert.equal(A.find('https://huggingface.co', 'https://huggingface.co/chatty'), null);
  assert.equal(A.find('https://github.com', 'https://github.com/copilot/c/1').id, 'githubcopilot');
  assert.equal(A.find('https://github.com', 'https://github.com/example/repo'), null);
  assert.equal(A.pattern(A.LIST.find((x) => x.id === 'huggingchat'), 'huggingface.co'), 'https://huggingface.co/chat*');
  assert.ok(A.origins().every((o) => /^https:\/\/[a-z0-9.-]+\/\*$/.test(o)));
});

test('Richtlinie: Modus, Listen, unbekannte IDs still ignoriert, Ueberlaenge abgewiesen (Auflage 3)', () => {
  const v = plain(P.validate({ aiSiteMode: 'block', allowedAiSites: ['chatgpt', 'gibtsnicht', 'chatgpt', 7], blockedAiSites: ['deepseek'] }));
  assert.deepEqual(v.value, { aiSiteMode: 'block', allowedAiSites: ['chatgpt'], blockedAiSites: ['deepseek'] });
  assert.deepEqual(v.errors, []);
  assert.deepEqual(plain(P.validate({ aiSiteMode: 'sperren' })).errors, ['aiSiteMode']);
  assert.deepEqual(plain(P.validate({ allowedAiSites: Array(501).fill('chatgpt') })).errors, ['allowedAiSites']);
  assert.deepEqual(plain(P.validate({ blockedAiSites: 'deepseek' })).errors, ['blockedAiSites']);
  const d = eff({}, {}).cfg;
  assert.equal(d.aiSiteMode, 'off');
  assert.deepEqual([d.allowedAiSites, d.blockedAiSites], [[], []]);
});

test('Banner-Texte: nur Text mit Laengengrenze, Link nur https ohne Benutzer/Passwort', () => {
  const ok = plain(P.validate({ branding: { aiNoticeText: 'Bitte nutzen Sie unseren Firmen-Copilot.', aiNoticeUrl: 'https://copilot.example.com/', aiNoticeLinkText: 'Zum Copilot' } }));
  assert.deepEqual(ok.errors, []);
  const bad = plain(P.validate({ branding: { aiNoticeText: 'x'.repeat(201), aiNoticeUrl: 'https://user:pw@copilot.example.com/', aiNoticeLinkText: 'y'.repeat(61) } }));
  assert.deepEqual(bad.errors.sort(), ['branding.aiNoticeLinkText', 'branding.aiNoticeText', 'branding.aiNoticeUrl']);
  for (const u of ['http://copilot.example.com/', 'javascript:alert(1)', 'https://a b.example.com/', 'https://' + 'a'.repeat(2050) + '.example.com/', 'https://user@copilot.example.com/']) {
    assert.deepEqual(plain(P.validate({ branding: { aiNoticeUrl: u } })).errors, ['branding.aiNoticeUrl'], u);
  }
});

test('Richtlinie schlaegt lokale Einstellung: ein aiSite*-Feld in der Richtlinie -> ganzer lokaler Block ignoriert (Auflage 4)', () => {
  const local = { aiSiteMode: 'block', blockedAiSites: ['claude'] };
  const l = eff({}, local);
  assert.equal(l.cfg.aiSiteMode, 'block');
  assert.ok(!l.locked.aiSiteMode);
  const m = eff({ allowedAiSites: ['chatgpt'] }, local);
  assert.equal(m.cfg.aiSiteMode, 'off', 'lokaler Modus gilt nicht, sobald die Richtlinie ein Feld setzt');
  assert.deepEqual(m.cfg.blockedAiSites, []);
  assert.deepEqual(m.cfg.allowedAiSites, ['chatgpt']);
  assert.ok(m.locked.aiSiteMode && m.locked.allowedAiSites && m.locked.blockedAiSites);
  const inv = eff({ aiSiteMode: 'ungueltig' }, local);
  assert.equal(inv.cfg.aiSiteMode, 'off', 'ungueltiger Richtlinienwert -> Standard, lokal bleibt aussen vor');
  assert.deepEqual(eff({ aiSiteMode: 'hint' }, { aiSiteMode: 'off' }).cfg.aiSiteMode, 'hint');
});

test('Entscheid: off -> none, Sperren schlaegt Erlauben, blockedAiSites auch im Hinweis-Modus', () => {
  const D = (cfg, id) => P.aiDecision(Object.assign({ aiSiteMode: 'hint', allowedAiSites: [], blockedAiSites: [] }, cfg), id);
  assert.equal(D({ aiSiteMode: 'off', blockedAiSites: ['claude'] }, 'claude'), 'none');
  assert.equal(D({}, 'claude'), 'hint');
  assert.equal(D({ aiSiteMode: 'block' }, 'claude'), 'block');
  assert.equal(D({ allowedAiSites: ['claude'] }, 'claude'), 'none');
  assert.equal(D({ allowedAiSites: ['claude'], blockedAiSites: ['claude'] }, 'claude'), 'block');
  assert.equal(D({ blockedAiSites: ['deepseek'] }, 'deepseek'), 'block');
  assert.equal(P.aiDecision(null, 'claude'), 'none');
  assert.equal(D({ aiSiteMode: 'x' }, 'claude'), 'none');
});

test('Quelltext-Waechter: Waechter und Banner ohne Netz, postMessage, innerHTML, console (Auflagen 8, 11)', () => {
  for (const f of ['content/aiguard.js', 'ui/aibanner.js', 'common/aisites.js']) {
    const src = fs.readFileSync(path.join(EXT, f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'postMessage', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'console.', 'localStorage', 'chrome.storage', 'permissions.request', 'eval(']) {
      assert.ok(!src.includes(bad), f + ': ' + bad);
    }
  }
  const guard = fs.readFileSync(path.join(EXT, 'content/aiguard.js'), 'utf8');
  assert.match(guard, /attachShadow\(\{ mode: 'closed' \}\)/);
  assert.match(guard, /window\.top !== window/);
  assert.ok(!/\.value\b|textContent|innerText|getSelection|addEventListener\('(input|keydown|paste)/.test(guard), 'Waechter liest keine Eingaben');
  const opts = fs.readFileSync(path.join(EXT, 'ui/options.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(opts, /aiGrant\.addEventListener\('click', async \(e\) => \{\n\s*if \(!e\.isTrusted\) return;\n\s*try \{ await chrome\.permissions\.request\(\{ origins: await aiMissing\(\) \}\)/, 'Zugriff nur auf echten Klick, nur Origins der Liste (Auflage 6)');
  for (const f of ['background.js', 'content/content.js', 'ui/popup.js']) assert.ok(!fs.readFileSync(path.join(EXT, f), 'utf8').includes('permissions.request'), f);
});
