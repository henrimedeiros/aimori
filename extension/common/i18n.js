// Oberflaechentexte. Einzige Quelle: _locales/<ordner>/messages.json (Chrome-Format,
// Design-Review Sprachen 17.10.2026, docs/sicherheit/design-review-sprachen.md).
// {product} und {company} werden aus dem Branding eingesetzt; der Produktname
// steht in den Texten nie im Klartext. Neue Sprache: Ordner mit messages.json und
// Kuerzel in LOCALES (Test tests/sprachen.test.mjs prueft Schluessel, Schema und ADMX).
(function (g) {
  'use strict';
  const DLX = g.DLX || (g.DLX = {});

  // Kuerzel der Einstellung -> Ordner unter _locales (Auflage 1: pt = pt_BR, nur brasilianisch).
  // Feste Liste (Auflage 2): Unbekanntes faellt still auf en zurueck.
  const LOCALES = Object.freeze({ en: 'en', de: 'de', fr: 'fr', it: 'it', pt: 'pt_BR', es: 'es' });
  const LANGS = Object.freeze(Object.keys(LOCALES));
  const MAX_FILE = 262144;   // Auflage 7: je Datei bzw. Antwort
  const MAX_STR = 4000;
  const KEY = /^[A-Za-z0-9_]{1,80}$/;
  const BAD = ['__proto__', 'constructor', 'prototype'];   // Auflage 3
  const S = Object.create(null);   // Sprache -> Tabelle (ohne Prototyp)
  const loading = Object.create(null);

  // Englischer Mindestsatz fuer Content Scripts (Auflage 6): Schwaerzen und Kopier-Hinweis
  // warten nie auf Texte. Gleich wie _locales/en (Test sprachen.test.mjs).
  const MIN = {"cat_voice":"Voice mode","rowsRemoved":"{n} rows removed","cat_person":"Personal data","cat_finanz":"Financial data","cat_sozial":"Social security","cat_gesundheit":"Health","cat_firma":"Company data","cat_kontakt":"Contact data","cat_steuer":"Tax ID","cat_technik":"Credentials","cat_reise":"ID document","cat_id_national":"National ID","cat_unscannable":"Not checkable","close":"Close","cat_injection":"Hidden instructions","copyToastTitle":"Sensitive data copied: {types}","copyToastText":"{product} does not check AI side panels and AI extensions. If you paste it there, check it yourself.","cat_source":"Confidential source"};
  // Schluessel, die Content Scripts brauchen (SW schickt nur diese, Auflage 7); share* = Hinweis beim Bildschirmteilen.
  const CONTENT = /^(cat_|type_|rowsRemoved$|close$|copyToast|share(Title|Text|TextPlain|MaskedText|Cover|Uncover)$)/;

  // Chrome erlaubt in Schluesseln nur [A-Za-z0-9_]: id-national -> id_national.
  const norm = (key) => String(key).replace(/-/g, '_');

  // messages.json ({k: {message}}) oder flache Tabelle ({k: text}) -> Tabelle ohne Prototyp.
  // Nur Strings, nur gueltige Schluessel, Grenzen je String und gesamt (Auflagen 3, 7).
  function parse(obj) {
    const out = Object.create(null);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    let size = 0;
    for (const k of Object.keys(obj)) {
      if (!KEY.test(k) || BAD.indexOf(k) !== -1) continue;
      const v = obj[k];
      const s = typeof v === 'string' ? v : v && typeof v === 'object' && typeof v.message === 'string' ? v.message : null;
      if (s === null || s.length > MAX_STR) continue;
      size += k.length + s.length;
      if (size > MAX_FILE) return null;
      out[k] = s;
    }
    return out;
  }

  function add(lang, obj) {
    if (LANGS.indexOf(lang) === -1) return false;
    const t = parse(obj);
    if (!t) return false;
    S[lang] = t;
    return true;
  }

  // Texte aus dem eigenen Paket laden (nur chrome.runtime.getURL, feste Ordnerliste).
  function load(lang) {
    if (LANGS.indexOf(lang) === -1 || S[lang]) return Promise.resolve();
    if (!loading[lang]) {
      loading[lang] = (async () => {
        try {
          const r = await fetch(chrome.runtime.getURL('_locales/' + LOCALES[lang] + '/messages.json'));
          const txt = await r.text();
          if (txt.length <= MAX_FILE) add(lang, JSON.parse(txt));
        } catch (e) { /* Rueckfall Englisch bzw. Mindestsatz */ }
        delete loading[lang];
      })();
    }
    return loading[lang];
  }

  function resolveLang(setting, browserLang) {
    const l = setting && setting !== 'auto' ? setting : String(browserLang || 'en').slice(0, 2).toLowerCase();
    return LANGS.indexOf(l) !== -1 ? l : 'en';
  }

  // Sprache aufloesen und Texte laden; liefert das Sprachkuerzel.
  async function ready(setting, browserLang) {
    const l = resolveLang(setting, browserLang);
    await Promise.all([load('en'), load(l)]);
    return l;
  }

  function lookup(lang, key) {
    const k = norm(key);
    const own = S[lang];
    if (own && own[k] !== undefined) return own[k];
    if (S.en && S.en[k] !== undefined) return S.en[k];
    return Object.hasOwn(MIN, k) ? MIN[k] : undefined;
  }
  const has = (lang, key) => lookup(lang, key) !== undefined;

  // Text holen und Platzhalter {name} ersetzen - nur per Ersetzungsfunktion (Auflage 4).
  // Nicht uebergebene Platzhalter bleiben stehen (dialog.js teilt an {types}).
  function t(lang, key, vars) {
    const s = lookup(lang, key);
    if (s === undefined) return key;
    if (!vars) return s;
    return s.replace(/\{([A-Za-z0-9_]+)\}/g, (m, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : m));
  }

  // Texte fuer Content Scripts: nur die noetigen Schluessel der aufgeloesten Sprache.
  function contentTable(lang) {
    const out = {};
    for (const l of ['en', lang]) {
      const tb = S[l];
      if (tb) for (const k of Object.keys(tb)) if (CONTENT.test(k)) out[k] = tb[k];
    }
    return out;
  }

  // Anzeigename eines Datentyps: type_<id> aus _locales, sonst Engine-Name (de/en).
  function typeName(lang, id) {
    if (id === 'dictionary') return t(lang, 'dictionary');
    if (id === 'custom_term') return t(lang, 'custom_term');
    if (id === 'internal_link') return t(lang, 'internal_link');
    if (id === 'unscannable') return t(lang, 'unscannable');
    if (id === 'clipboard_source') return t(lang, 'clipboard_source');
    if (id === 'hidden_instruction') return t(lang, 'hidden_instruction');
    if (id === 'document_match') return t(lang, 'document_match');
    if (/^org_[a-z0-9_]{2,40}$/.test(id)) return t(lang, 'org_pattern');   // Richtlinie customPatterns: nie Admin-Text anzeigen
    const d = DLX.engine && DLX.engine.findDetector(id);
    if (!d) return id;
    const own = S[lang] && S[lang]['type_' + norm(id)];
    if (own !== undefined) return own;
    return lang === 'de' ? d.name.de : d.name.en;
  }

  // Laenderliste fuer Popup/Einstellungen: Namen nur aus der festen Tabelle,
  // Grund in Klammern (Zeitzone/Sprachregion/Sprache), EU ohne Grund.
  function countryList(lang, codes, reasons) {
    const list = (codes || []).filter((c) => /^[A-Z]{2}$/.test(c) && has('en', 'cn_' + c)).map((c) => {
      const why = reasons && Object.hasOwn(reasons, c) && has('en', 'why_' + reasons[c]) ? ' (' + t(lang, 'why_' + reasons[c]) + ')' : '';
      return t(lang, 'cn_' + c) + why;
    });
    return list.length ? list.join(', ') : t(lang, 'countryNone');
  }

  DLX.i18n = { STRINGS: S, LANGS, LOCALES, MIN, resolveLang, ready, load, add, has, t, typeName, countryList, contentTable };
})(globalThis);
