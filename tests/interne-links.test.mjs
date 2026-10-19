// Interne Links (Datentyp internal_link, Design-Review interne Links 17.10.2026): SharePoint/OneDrive-
// Firmenlinks, Intranet-Hosts, Hosts ohne oeffentliche Endung, Richtlinie internalDomains (nur
// gesalzene Pruefsummen), Fehlalarm-Korpus oeffentlicher Beispiel-Links. Nur erfundene Namen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, ENGINE_FILES } from './helpers/load.mjs';
import { hashDomains } from '../scripts/begriffe-hashen.mjs';

const DLX = load([...ENGINE_FILES, 'engine/pseudonym.js', 'common/policy.js', 'common/i18n.js'], { URL });
const D = DLX.dictionary;
const SALT = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const SALT2 = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';
// Werte aus dem vm-Kontext haben eigene Prototypen: vor dem Vergleich in einfache Arrays.
const links = (text, lists) => Array.from(D.scanLinks(text, lists, Infinity, () => 0).findings, (f) => text.slice(f.start, f.end));
const domList = (domains, salt = SALT) => [{ salt, hashes: new Set(domains.map((d) => D.termHash(salt, D.normHost(d)))) }];

const INTERN = [
  'https://contoso.sharepoint.com/sites/Projekt/Shared%20Documents/Plan.docx',
  'https://contoso-my.sharepoint.com/personal/anna_contoso_example/Documents/x.xlsx?web=1',
  'https://fabrikam.sharepoint.de/:w:/s/team/EabcDEF123',
  'https://tailspin.sharepoint.us/sites/x',
  'contoso.sharepoint.com/sites/Finanzen',
  'https://intranet.example.com/hr/lohn',
  'https://intra.example.org/',
  'http://wiki/Projekt_Zeder',
  'http://srv-file01:8080/freigabe',
  'https://fs.corp/abteilung/',
  'https://nas.home.arpa/share',
  'https://printer.local/status',
  'https://git.internal/team/repo',
  'https://app.lan:8443/',
  'file:///D:/Projekte/vertrag.pdf',
  'file://server/freigabe/datei.txt',
  'https://example.com@intranet.example.org/a',
  'https://intra\u200Bnet.example.org/x',
  'HTTPS://CONTOSO.SHAREPOINT.COM/sites/x',
];

// Oeffentliche Beispiel-Links: nie ein Fund (Abnahme "0 Fehlalarme").
const PUBLIC = [
  'https://www.example.com/path?q=1#top', 'https://example.org', 'http://example.net:8080/a', 'https://sub.example.co.uk/x',
  'https://www.sharepoint.com/', 'https://sharepoint.com/', 'https://contoso.sharepoint.com.evil.example/sites/x',
  'https://intranet@example.com/', 'https://user:pw@www.example.com/', 'http://localhost:3000/api', 'http://app.localhost/',
  'http://127.0.0.1:8080/', 'http://192.0.2.10/', 'http://[2001:db8::1]/', 'https://en.wikipedia.org/wiki/Intranet',
  'https://github.com/example/repo/blob/main/README.md', 'https://www.admin.ch/gov/de/start.html', 'https://nato.int/',
  'https://example.test/', 'https://docs.example/', 'https://www.microsoft.com/de-ch/microsoft-365/sharepoint/collaboration',
  'https://onedrive.live.com/?id=ABC', 'https://1drv.ms/w/s!AbCdEf', 'https://learn.microsoft.com/en-us/sharepoint/',
  'https://www.google.com/search?q=intranet+corp+local', 'ftp://ftp.example.org/pub/', 'https://xn--bcher-kva.example/',
  'https://example.swiss/', 'https://shop.example.de/warenkorb?id=5', 'https://www.youtube.com/watch?v=abc',
  'https://intranet-software.example.com/', 'https://company.corp.example.com/', 'https://www.local.ch/de',
  'https://home.example.com/', 'https://lan.example.net/',
];
const PROSE = [
  'Das Intranet ist heute langsam.', 'Wir nutzen SharePoint und OneDrive.', 'sharepoint.com ist ein Produkt von Microsoft.',
  'Version 1.2.3 auf server.local ohne Link', 'Die Datei liegt unter C:\\Temp.', 'Siehe https:// leer',
];

test('Erkennung: interne Links werden gefunden, ganzer Link', () => {
  for (const u of INTERN) assert.deepEqual(links('Bitte ansehen: ' + u + ' danke'), [u], u);
});

test('Fehlalarme: 0 Treffer auf oeffentlichen Beispiel-Links und Fliesstext', () => {
  const hits = [];
  for (const u of PUBLIC.concat(PROSE)) if (links('Link: ' + u + ' ende').length) hits.push(u);
  assert.deepEqual(hits, []);
  assert.equal(links(PUBLIC.join('\n')).length, 0);
});

test('Spanne: Query/Fragment/Userinfo mit, ueberzaehlige Klammer nicht, ausgeglichene mit', () => {
  assert.deepEqual(links('(siehe https://intranet.example.com/a?b=1#c)'), ['https://intranet.example.com/a?b=1#c']);
  assert.deepEqual(links('siehe https://intranet.example.com/wiki/A_(B).'), ['https://intranet.example.com/wiki/A_(B).']);
  assert.deepEqual(links('x https://anna:geheim@fs.corp/x y'), ['https://anna:geheim@fs.corp/x']);
  const long = 'https://contoso.sharepoint.com/sites/x?' + 'a'.repeat(3000);
  assert.deepEqual(links(long + ' ende'), [long], 'ueber 2048 Zeichen: ganzer Link');
});

test('Spanne: 200000 schliessende Klammern am Ende bleiben linear (unter 1 s)', () => {
  const t0 = performance.now();
  assert.deepEqual(links('https://intranet.example.com/a' + ')'.repeat(200000)), ['https://intranet.example.com/a']);
  assert.deepEqual(links('https://intranet.example.com/(a' + ')'.repeat(200000)), ['https://intranet.example.com/(a)']);
  assert.ok(performance.now() - t0 < 1000);
});

test('Normalisierung: Host gleich fuer Text und Werkzeug (IDN, Grossschreibung, Punkt am Ende, unsichtbare Zeichen)', () => {
  assert.equal(D.normHost('BÜCHER.Example.'), 'xn--bcher-kva.example');
  assert.equal(D.normHost('bu\u200Bcher.example'), 'bucher.example');
  assert.equal(D.normHost('ｉｎｔｒａｎｅｔ．example．org'), 'intranet.example.org');
  assert.equal(D.normHost('a/b'), '');
  const tool = hashDomains('BÜCHER.example.\nintern-example.net\n', SALT);
  assert.deepEqual(tool.hashes.slice().sort(), [D.termHash(SALT, 'xn--bcher-kva.example'), D.termHash(SALT, 'intern-example.net')].sort());
});

test('Richtlinie internalDomains: Host und Eltern-Domains, nur gesalzene Pruefsummen', () => {
  const l = domList(['intern-example.net', 'bücher.example']);
  assert.deepEqual(links('a https://wiki.team.intern-example.net/x b', l), ['https://wiki.team.intern-example.net/x']);
  assert.deepEqual(links('a https://INTERN-EXAMPLE.NET./ b', l), ['https://INTERN-EXAMPLE.NET./']);
  assert.deepEqual(links('a https://www.BÜCHER.example/ b', l), ['https://www.BÜCHER.example/']);
  assert.deepEqual(links('a https://intern-example.net.example.com/ b https://example.net/ c', l), []);
  assert.deepEqual(links('a https://intern-example.net/ b', domList(['intern-example.net'], SALT2).map((x) => ({ salt: SALT, hashes: x.hashes }))), [], 'anderes Salz');
});

test('Werkzeug --domains: einlabelig, oeffentliche Endung und Ungueltiges verworfen, Duplikate zusammengefasst', () => {
  const r = hashDomains('# Kommentar\nserver\nco.uk\n192.0.2.1\nintern-example.net\nINTERN-example.NET.\n', SALT);
  assert.deepEqual(r.rejected.map((x) => x.line + ':' + x.error), ['2:single', '3:public', '4:invalid']);
  assert.equal(r.hashes.length, 1);
  assert.equal(r.duplicates, 1);
});

test('Grenzen: mehr als 500 Links oder Zeitbudget -> nicht pruefbar', () => {
  const many = Array.from({ length: 501 }, (_, i) => 'https://example.com/' + i).join(' ');
  const r = DLX.engine.scan(many, null);
  assert.equal(r.unscannable, true);
  assert.equal(r.reason, 'too_long');
  let n = 0;
  const t = DLX.engine.scan(Array.from({ length: 40 }, () => 'https://example.com/a').join(' '), { packs: [] }, () => (n++ > 2 ? 1e9 : 0));
  assert.equal(t.unscannable, true);
  assert.equal(D.scanLinks('https://a.example/ '.repeat(40), [], 0, () => 1).timeout, true);
});

test('Engine: Fund sicher, Standard warn, Regel off schaltet ab, Platzhalter [INTERNAL_LINK_n]', () => {
  const text = 'Plan liegt auf https://contoso.sharepoint.com/sites/x und https://intranet.example.com/y.';
  const r = DLX.engine.scan(text, { packs: [] });
  const f = r.findings.filter((x) => x.id === 'internal_link');
  assert.equal(f.length, 2);
  assert.ok(f.every((x) => x.sure && x.action === 'warn' && x.cat === 'technik'));
  assert.equal(DLX.engine.scan(text, { packs: [], rules: { internal_link: 'off' } }).findings.length, 0);
  const m = DLX.pseudonym.create();
  assert.equal(m.pseudonymize(text, r.findings, (t) => t), 'Plan liegt auf [INTERNAL_LINK_1] und [INTERNAL_LINK_2]');
  // Mit allen Paketen: der ganze Link gewinnt gegen kuerzere Funde darin (keine Reste).
  const all = DLX.engine.scan('Zugang: https://anna@fs.corp/x?mail=anna@example.com', null);
  assert.deepEqual(Array.from(all.findings, (x) => x.id), ['internal_link']);
});

test('Richtlinie: nur verwaltet, streng, eigenes Salz, engineConfig', () => {
  const P = DLX.policy;
  const ok = { salt: SALT, hashes: [D.termHash(SALT, 'intern-example.net'), D.termHash(SALT, 'intern-example.net')] };
  const v = P.validate({ internalDomains: ok });
  assert.deepEqual(Array.from(v.errors), []);
  assert.equal(v.value.internalDomains.hashes.length, 1, 'Duplikate entfernt');
  assert.deepEqual(Array.from(P.validate({ internalDomains: ok }, true).errors), ['unknown:internalDomains']);
  for (const bad of [{ salt: SALT.toUpperCase(), hashes: [] }, { salt: SALT, hashes: ['ABC'] }, { salt: SALT, hashes: Array(5001).fill(ok.hashes[0]) }, { salt: SALT, hashes: [], x: 1 }, []]) {
    const r = P.validate({ internalDomains: bad });
    assert.equal(r.value.internalDomains, undefined);
    assert.deepEqual(Array.from(r.errors), ['internalDomains']);
  }
  const same = P.validate({ internalDomains: ok, customTerms: { salt: SALT, hashes: [] } });
  assert.equal(same.value.internalDomains, undefined);
  assert.ok(same.errors.includes('internalDomains'));
  const eff = P.effective({ internalDomains: ok }, { internalDomains: ok }, 'de-CH');
  assert.equal(eff.locked.internalDomains, true);
  const ec = P.engineConfig(eff.cfg);
  assert.deepEqual(links('x https://a.intern-example.net/ y', ec.domains), ['https://a.intern-example.net/']);
  assert.equal(P.engineConfig(P.effective({}, {}, 'de-CH').cfg).domains, null);
});

test('Texte: Name und eigene Erklaerung in allen 6 UI-Sprachen, nie leer', () => {
  const I = DLX.i18n;
  for (const l of ['en', 'de', 'fr', 'it', 'pt', 'es']) {
    for (const k of ['internal_link', 'why_internal_link']) assert.ok(Object.hasOwn(I.STRINGS[l], k) && I.STRINGS[l][k].trim().length > 5, l + ' ' + k);
    assert.ok(I.STRINGS[l].why_internal_link.length <= 140 && /[.]$/.test(I.STRINGS[l].why_internal_link), l);
    assert.equal(I.typeName(l, 'internal_link'), I.STRINGS[l].internal_link);
  }
  assert.equal(I.typeName('de', 'internal_link'), 'Interner Link');
});
