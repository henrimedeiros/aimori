// Nachweis-Bericht fuer Gesetze und Normen (Design-Review Bericht 16.10.2026,
// docs/sicherheit/design-review-bericht.md): nur Zahlen aus den lokalen
// Tageszaehlern (dlx.stats) und Namen aktiver Richtlinien mit festen
// Zustandswoertern; nie Werte, Texte, Personen- oder Geraetebezug. Die Vorlagen
// ordnen die Massnahmen Gesetzen/Normen zu - Selbstauskunft, keine Rechtsberatung.
// Wird von ui/bericht.js, dem Service Worker und scripts/bericht-sammeln.mjs genutzt.
(function (g) {
  'use strict';
  const DLX = g.DLX || (g.DLX = {});

  const SCHEMA = 'dlx-bericht/1';
  const FRAMEWORKS = ['revdsg', 'dsgvo', 'hipaa', 'euaiact', 'iso27001'];
  const DAYS = [7, 30, 90];
  const DEFAULT_DAYS = 30;
  const SITES = ['chatgpt', 'claude', 'gemini', 'copilot', 'm365copilot', 'perplexity'];
  const SITE_NAMES = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', copilot: 'Copilot', m365copilot: 'Microsoft 365 Copilot', perplexity: 'Perplexity' };
  const CATS = ['finanz', 'sozial', 'gesundheit', 'firma', 'kontakt', 'steuer', 'technik', 'reise', 'id-national', 'person', 'unscannable', 'file', 'site', 'inactive', 'voice'];
  const ACTIONS = ['redacted', 'stopped', 'allowed'];
  // Entscheidung der Tageszaehler -> Aktion im Bericht.
  const ACTION_OF = { redact: 'redacted', pseudonym: 'redacted', cancel: 'stopped', blocked: 'stopped', site: 'stopped', inactive: 'stopped', file: 'stopped',
    override: 'allowed', notsensitive: 'allowed' };
  const MAX_N = 1e9;
  const MAX_LOGO = 140000;
  const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

  // Richtlinien im Bericht: nur Schluessel dieser Liste, Zustand nur als festes Wort
  // (bool: on/off, Aufzaehlung: der erlaubte Wert, Liste: Anzahl, sonst "set").
  const POLICY_KIND = {
    allowUserOverride: 'bool', allowNotSensitive: 'bool', allowPlaceholders: 'bool', blockWhenInactive: 'bool', blockUncheckedFiles: 'bool',
    autoCountryPacks: 'bool', competenceRecord: 'bool', competenceHideSensitive: 'bool', imageScan: 'bool', complianceReport: 'bool', trainingAmpel: 'bool',
    tableScan: 'bool', deobfuscation: 'bool', allowRephrase: 'bool', tableRedaction: ['columns', 'rows'], tableMinRows: 'set', tableMinColumns: 'set',
    detection: ['ki', 'regeln'], uncertainFindings: ['hint', 'warn', 'enforce'], aiSiteMode: ['off', 'hint', 'block'], language: ['auto', 'en', 'de', 'fr', 'it', 'pt', 'es'],
    allowedSites: 'list', countryPacks: 'list', globalPacks: 'list', allowedAiSites: 'list', blockedAiSites: 'list', complianceFrameworks: 'list',
    rules: 'list', accountRules: 'list', labelNames: 'list', voiceMode: ['allow', 'warn', 'block'], screenShareGuard: ['off', 'warn', 'mask'], documentFingerprints: 'set',
    dictionary: 'set', customTerms: 'set', internalDomains: 'set', branding: 'set', massListMin: 'set', identityMinParts: 'set', complianceReportDays: 'set',
  };
  const STATES = /^(on|off|set|[a-z]{2,7}|[0-9]{1,4})$/;

  // Kein Prototyp-Vergleich: Daten kommen auch aus anderen Realms (Tests, Sammel-Skript); gelesen wird nur per Object.entries/hasOwn.
  const plainObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const count = (v) => Number.isSafeInteger(v) && v >= 0 && v <= MAX_N;
  const zero = () => { const o = Object.create(null); for (const a of ACTIONS) o[a] = 0; return o; };
  const day = (d) => d.toISOString().slice(0, 10);

  // Tageszaehler -> Summen je Aktion, Kategorie und Seite fuer die letzten `days` Tage
  // (heute eingeschlossen). Unbekannte Schluessel oder Zahlen werden ignoriert.
  function summarize(stats, now, days) {
    const d = DAYS.indexOf(days) !== -1 ? days : DEFAULT_DAYS;
    const from = day(new Date(now.getTime() - (d - 1) * 86400000));
    const to = day(now);
    const out = { days: d, from, to, totals: zero(), byCat: Object.create(null), bySite: Object.create(null) };
    if (!plainObj(stats)) return out;
    for (const [k, sites] of Object.entries(stats)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k < from || k > to || !plainObj(sites)) continue;
      for (const [site, cats] of Object.entries(sites)) {
        if (SITES.indexOf(site) === -1 || !plainObj(cats)) continue;
        for (const [cat, decs] of Object.entries(cats)) {
          if (CATS.indexOf(cat) === -1 || !plainObj(decs)) continue;
          for (const [dec, n] of Object.entries(decs)) {
            if (!Object.hasOwn(ACTION_OF, dec) || !count(n) || n === 0) continue;
            const a = ACTION_OF[dec];
            out.totals[a] += n;
            (out.byCat[cat] || (out.byCat[cat] = zero()))[a] += n;
            (out.bySite[site] || (out.bySite[site] = zero()))[a] += n;
          }
        }
      }
    }
    return out;
  }

  // Aktive Richtlinien (nur gesperrte Schluessel aus der verwalteten Richtlinie).
  function policies(cfg, locked) {
    const out = [];
    for (const [k, kind] of Object.entries(POLICY_KIND)) {
      const isLocked = k === 'rules' ? locked && plainObj(locked.rules) && Object.keys(locked.rules).length > 0 : locked && locked[k] === true;
      if (!isLocked) continue;
      const v = cfg[k];
      let st = 'set';
      if (kind === 'bool') st = v === true ? 'on' : 'off';
      else if (Array.isArray(kind)) st = kind.indexOf(v) !== -1 ? v : 'set';
      else if (kind === 'list') st = String(Math.min(9999, k === 'rules' ? Object.keys(locked.rules).length : Array.isArray(v) ? v.length : plainObj(v) ? Object.keys(v).length : v && Array.isArray(v.hashes) ? v.hashes.length : 0));
      out.push([k, st]);
    }
    return out;
  }

  function exportId(rnd) {
    const b = new Uint8Array(16);
    rnd(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  // Daten des Exports: feste Schluessel, nur Zahlen und Woerter aus Positivlisten.
  function data(sum, frameworks, pols, created, id) {
    const cleanMap = (m, keys) => { const o = {}; for (const k of keys) if (m[k]) o[k] = Object.assign({}, m[k]); return o; };
    return {
      schema: SCHEMA, exportId: id, created, days: sum.days, from: sum.from, to: sum.to,
      frameworks: FRAMEWORKS.filter((f) => frameworks.indexOf(f) !== -1),
      totals: Object.assign({}, sum.totals), byCat: cleanMap(sum.byCat, CATS), bySite: cleanMap(sum.bySite, SITES),
      policies: pols.map((p) => p.slice()),
    };
  }

  // Strenge Pruefung eines eingelesenen Exports (Sammel-Skript, Auflage 6):
  // unbekannte Schluessel, __proto__, falsche Typen oder Zahlen -> null.
  function validate(x) {
    const keysOk = (o, allowed) => plainObj(o) && Object.keys(o).every((k) => allowed.indexOf(k) !== -1);
    const actions = (o) => keysOk(o, ACTIONS) && ACTIONS.every((a) => count(o[a]));
    const map = (o, keys) => keysOk(o, keys) && Object.values(o).every(actions);
    const date = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s);
    const top = ['schema', 'exportId', 'created', 'days', 'from', 'to', 'frameworks', 'totals', 'byCat', 'bySite', 'policies'];
    if (!keysOk(x, top) || Object.keys(x).length !== top.length) return null;
    if (x.schema !== SCHEMA || typeof x.exportId !== 'string' || !/^[0-9a-f]{32}$/.test(x.exportId)) return null;
    if (!date(x.created) || !date(x.from) || !date(x.to) || DAYS.indexOf(x.days) === -1) return null;
    if (!Array.isArray(x.frameworks) || !x.frameworks.every((f) => FRAMEWORKS.indexOf(f) !== -1)) return null;
    if (!actions(x.totals) || !map(x.byCat, CATS) || !map(x.bySite, SITES)) return null;
    if (!Array.isArray(x.policies) || x.policies.length > 64 || !x.policies.every((p) => Array.isArray(p) && p.length === 2 &&
      Object.hasOwn(POLICY_KIND, p[0]) && typeof p[1] === 'string' && STATES.test(p[1]))) return null;
    return x;
  }

  // Summe mehrerer gepruefter Exporte (gleiche exportId nur einmal).
  function merge(list) {
    const seen = new Set();
    const out = { files: 0, from: '', to: '', totals: zero(), byCat: Object.create(null), bySite: Object.create(null), policies: Object.create(null) };
    for (const x of list) {
      if (seen.has(x.exportId)) continue;
      seen.add(x.exportId);
      out.files++;
      if (!out.from || x.from < out.from) out.from = x.from;
      if (!out.to || x.to > out.to) out.to = x.to;
      for (const a of ACTIONS) out.totals[a] += x.totals[a];
      for (const [field, keys] of [['byCat', CATS], ['bySite', SITES]]) {
        for (const k of keys) if (Object.hasOwn(x[field], k)) for (const a of ACTIONS) (out[field][k] || (out[field][k] = zero()))[a] += x[field][k][a];
      }
      for (const [k, st] of x.policies) out.policies[k + ' = ' + st] = (out.policies[k + ' = ' + st] || 0) + 1;
    }
    return out;
  }

  // --- Texte: rep_* in _locales/<sprache>/messages.json (DLX.i18n, Design-Review Sprachen 17.10.2026).
  // Nie "konform", "erfuellt", "compliant", "certified" (Auflage 10; Test bericht.test.mjs).
  // Vorlagen: je Gesetz/Norm Anforderungen mit Beleg; Name rep_fw_<id>, Massnahme rep_fw_<id>_<nr>.
  // Ausfuehrlich mit Quellen in docs/compliance/<id>.md.
  const FW = {
    revdsg: { ctl: [
      ['Art. 7 revDSG', ['pol']],
      ['Art. 8 revDSG, Art. 1–3 DSV', ['tot', 'cat']],
      ['Art. 9 revDSG', ['site', 'tot']],
      ['Art. 16–17 revDSG', ['site', 'pol']],
      ['Art. 5 Bst. c revDSG', ['cat']],
    ] },
    dsgvo: { ctl: [
      ['Art. 5 Abs. 1 lit. c und f', ['tot', 'cat']],
      ['Art. 24', ['tot', 'pol']],
      ['Art. 25', ['pol']],
      ['Art. 32', ['tot', 'site']],
      ['Art. 9, Art. 44 ff.', ['cat', 'pol']],
    ] },
    hipaa: { ctl: [
      ['45 CFR 164.308(a)(1)(ii)(D)', ['tot', 'site']],
      ['45 CFR 164.308(a)(5)', ['tot']],
      ['45 CFR 164.312(e)(1)', ['cat']],
      ['45 CFR 164.502(b), 164.530(c)', ['tot', 'pol']],
    ] },
    euaiact: { ctl: [
      ['Art. 4', ['tot', 'cat']],
      ['Art. 4', ['pol', 'site']],
    ] },
    iso27001: { ctl: [
      ['A.5.10', ['pol']],
      ['A.5.12', ['cat']],
      ['A.5.14', ['site', 'tot']],
      ['A.5.34', ['cat']],
      ['A.6.3', ['tot']],
      ['A.8.12', ['tot', 'cat', 'site']],
    ] },
  };

  const L = (lang) => DLX.i18n.resolveLang(lang, 'en');
  const t = (lang, key, vars) => DLX.i18n.t(L(lang), 'rep_' + key, vars);

  // Neutrales Modell des Berichts (Bloecke), gerendert von der Seite (DOM) und vom Export (HTML-String).
  // catName(id) liefert den Anzeigenamen einer Kategorie (aus DLX.i18n).
  function model(d, lang, opt) {
    const l = L(lang);
    const nf = new Intl.NumberFormat(lang);
    const n = (v) => nf.format(v);
    const blocks = [];
    const tbl = (head, rows) => blocks.push({ k: 'table', head, rows });
    const actHead = ACTIONS.map((a) => t(l, 'a_' + a));
    const row = (label, o) => [label].concat(ACTIONS.map((a) => n(o[a])), [n(ACTIONS.reduce((s, a) => s + o[a], 0))]);
    blocks.push({ k: 'h2', text: t(l, 'totalsTitle') });
    const all = ACTIONS.reduce((s, a) => s + d.totals[a], 0);
    if (!all) blocks.push({ k: 'p', text: t(l, 'empty') });
    else {
      tbl(actHead.concat([t(l, 'total')]), [ACTIONS.map((a) => n(d.totals[a])).concat([n(all)])]);
      blocks.push({ k: 'h2', text: t(l, 'catTitle') });
      tbl([t(l, 'type')].concat(actHead, [t(l, 'total')]), CATS.filter((c) => d.byCat[c]).map((c) => row(opt.catName(c), d.byCat[c])));
      blocks.push({ k: 'h2', text: t(l, 'siteTitle') });
      tbl([t(l, 'site')].concat(actHead, [t(l, 'total')]), SITES.filter((s) => d.bySite[s]).map((s) => row(SITE_NAMES[s], d.bySite[s])));
    }
    blocks.push({ k: 'h2', text: t(l, 'polTitle') });
    if (!d.policies.length) blocks.push({ k: 'p', text: t(l, 'polNone') });
    else tbl([t(l, 'rule'), t(l, 'state')], d.policies.map(([k, st]) => [k, /^\d+$/.test(st) ? t(l, 's_count', { n: st }) : DLX.i18n.has(l, 'rep_s_' + st) ? t(l, 's_' + st) : st]));
    for (const f of d.frameworks) {
      blocks.push({ k: 'h2', text: t(l, 'fw_' + f) });
      tbl([t(l, 'ctlRef'), t(l, 'ctlMeasure'), t(l, 'ctlEvidence')], FW[f].ctl.map(([ref, ev], i) => [ref, t(l, 'fw_' + f + '_' + i), ev.map((e) => t(l, 'ev_' + e)).join(', ')]));
    }
    return blocks;
  }

  // HTML-Escaping fuer Text und Attribute; JSON fuer den inerten Datenblock mit
  // \u-Escapes fuer < > & U+2028 U+2029 (Auflage 9).
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const jsonSafe = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const logoOk = (v) => typeof v === 'string' && v.length <= MAX_LOGO && LOGO.test(v);

  // Eigenstaendige HTML-Datei ohne ausfuehrbares Script, mit strenger Meta-CSP.
  function exportHtml(d, lang, opt) {
    const l = L(lang);
    const cell = (tag, v) => '<' + tag + '>' + esc(v) + '</' + tag + '>';
    const body = model(d, lang, opt).map((b) => (b.k === 'table'
      ? '<table><thead><tr>' + b.head.map((x) => cell('th', x)).join('') + '</tr></thead><tbody>' + b.rows.map((r) => '<tr>' + r.map((x) => cell('td', x)).join('') + '</tr>').join('') + '</tbody></table>'
      : cell(b.k, b.text))).join('\n');
    const head = [
      opt.company ? cell('dt', t(l, 'org')) + cell('dd', opt.company) : '',
      cell('dt', t(l, 'period')) + cell('dd', d.from + ' – ' + d.to + ' (' + t(l, 'days', { n: d.days }) + ')'),
      cell('dt', t(l, 'created')) + cell('dd', d.created),
    ].join('');
    const logo = logoOk(opt.logo) ? '<img alt="" width="40" height="40" src="' + esc(opt.logo) + '">' : '';
    return '<!doctype html>\n<html lang="' + l + '"><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">' +
      '<title>' + esc(opt.product + ' – ' + t(l, 'title')) + '</title><style>' +
      'body{font:14px/1.5 system-ui,sans-serif;color:#15181c;max-width:900px;margin:24px auto;padding:0 16px}h1{font-size:22px}h2{font-size:16px;margin-top:24px}' +
      'table{border-collapse:collapse;width:100%}th,td{border:1px solid #c9ced6;padding:4px 8px;text-align:left;font-variant-numeric:tabular-nums}dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px}dd{margin:0}.hinweis{color:#4a525e}' +
      '</style></head><body>\n' + logo + '<p>' + esc(opt.product) + '</p>' + cell('h1', t(l, 'title')) + '<p>' + esc(t(l, 'intro', { product: opt.product })) + '</p><dl>' + head + '</dl>\n' + body +
      '\n<p class="hinweis">' + esc(t(l, 'note')) + '</p>\n<script type="application/json" id="dlx-bericht-daten">' + jsonSafe(d) + '</script>\n</body></html>\n';
  }

  // Dateiname ohne Personen- oder Geraetebezug (Auflage 1).
  function fileName(product, lang, created) {
    const slug = String(product).normalize('NFKD').replace(/[^\x20-\x7e]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'dlx';
    return slug + '-' + t(lang, 'file') + '-' + created + '.html';
  }

  // Datenblock aus einer exportierten Datei lesen (nur der eine JSON-Block, kein HTML-Parser).
  function extract(html) {
    const m = /<script type="application\/json" id="dlx-bericht-daten">([^<]*)<\/script>/.exec(html);
    if (!m || html.split('id="dlx-bericht-daten"').length !== 2) return null;
    try { return validate(JSON.parse(m[1])); } catch (e) { return null; }
  }

  DLX.bericht = { SCHEMA, FRAMEWORKS, DAYS, DEFAULT_DAYS, SITES, CATS, ACTIONS, ACTION_OF, POLICY_KIND, FW,
    summarize, policies, exportId, data, validate, merge, t, model, exportHtml, fileName, extract, esc, jsonSafe, logoOk };
})(globalThis);
