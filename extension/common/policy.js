// Richtlinie lesen und validieren (chrome.storage.managed) und mit den
// Benutzereinstellungen (chrome.storage.local) zusammenfuehren.
// Regeln (Auflage B14): ungueltige Werte -> sichere Standardwerte, nie "aus";
// gesetzte Richtlinienwerte sind gesperrt und werden von Benutzerwerten nie
// ueberschrieben. reportingUrl ist nur reserviert und wird nie verwendet.
(function (g) {
  'use strict';
  const DLX = g.DLX;

  const SITES = ['chatgpt', 'claude', 'gemini', 'copilot', 'm365copilot'];
  const COUNTRY = ['CH', 'DE', 'AT', 'FR', 'IT', 'BE', 'NL', 'US', 'BR', 'LI', 'ES', 'PT', 'LU', 'SE', 'DK', 'NO', 'FI', 'IS', 'IE', 'GB', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'HR', 'SI', 'GR', 'CY', 'MT', 'EE', 'LT', 'LV', 'CA', 'MX', 'AR', 'CL', 'CO', 'IN', 'CN', 'JP', 'KR', 'SG', 'AU', 'NZ', 'ZA', 'TR', 'IL', 'AE', 'SA', 'NG', 'EU'];
  const GLOBAL = ['finance', 'secrets', 'contact', 'travel', 'marker', 'context', 'community'];
  const LANGS = ['auto', 'en', 'de', 'fr', 'it', 'pt', 'es'];
  const TABLE_REDACTION = ['columns', 'rows'];
  const ACTIONS = ['off', 'warn', 'redact', 'block'];
  const UNCERTAIN = ['hint', 'warn', 'enforce'];
  // Erkennung: 'ki' = Regeln plus lokale KI (Standard), 'regeln' = nur Regeln.
  // Nur diese Werte; ungueltig = Standard, nie "keine Erkennung" (Design-Review KI 16.10.2026, Auflagen 18, 20).
  const DETECTION = ['ki', 'regeln'];
  // KI-Seiten-Kontrolle (Design-Review KI-Seiten 14.10.2026, Auflagen 3/4).
  const AI_MODES = ['off', 'hint', 'block'];
  // suggestedAiSite = vorgeschlagene freigegebene KI, nur aus der Richtlinie
  // (Design-Review Freigegebene KI 16.10.2026, Auflage 2).
  const AI_KEYS = ['aiSiteMode', 'allowedAiSites', 'blockedAiSites', 'suggestedAiSite'];
  const MAX_AI_IDS = 500;
  const aiIds = () => (DLX.aisites && DLX.aisites.IDS) || [];
  // Regeln je Konto (Design-Review Konto-Regeln 14.10.2026): Stufe je Seite und
  // Kontotyp; Kennzeichen je Seite aus fester Liste (Auflage 9).
  const ACCOUNT_LEVELS = ['allow', 'hint', 'normal', 'block'];
  const ACCOUNT_TYPES = ['business', 'personal', 'unknown'];
  const ACCOUNT_MARKERS = { chatgpt: ['plan'], claude: ['plan'], copilot: ['shield'], m365copilot: ['host', 'shield'] };
  const MAX_WORKSPACES = 20;
  // Nachweis-Bericht: Vorlagen und Zeitraeume wie in common/bericht.js (Test bericht.test.mjs).
  const FRAMEWORKS = ['revdsg', 'dsgvo', 'hipaa', 'euaiact', 'iso27001'];
  const REPORT_DAYS = [7, 30, 90];
  // KI-Antworten pruefen und Zwischenablage-Schutz (Design-Review Antwort/Zwischenablage 16.10.2026).
  const ANSWER_MODES = ['off', 'hint'];
  const SOURCE_ACTIONS = ['warn', 'block'];
  // Versteckte Anweisungen (Design-Review KI-Agenten 16.10.2026, Auflage 6).
  const HIDDEN_ACTIONS = ['warn', 'block'];
  const USER_KEYS = ['language', 'countryMode', 'countryPacks', 'globalPacks', 'rules', 'competenceRecord', 'imageScan', 'detection', 'answerCheck', 'sensitiveSources', 'sensitiveSourceAction', 'hiddenInstructionScan', 'hiddenInstructionAction', 'formGuardSites', 'copySidebarHint'];
  // Formularwache: hoechstens 20 Seiten (Design-Review KI-Agenten 16.10.2026, Auflage 12).
  const MAX_FORM_SITES = 20;
  // Sprachmodus und Dokument-Fingerabdruecke (Design-Review Diktat und Fingerabdruecke 16.10.2026):
  // beide nur aus der verwalteten Richtlinie. Fingerabdruecke: hoechstens 100000 Werte in
  // hoechstens 200 Base64-Stuecken zu je hoechstens 8192 Zeichen (Auflagen 12, 15).
  const VOICE_MODES = ['allow', 'warn', 'block'];
  const FP_ACTIONS = ['warn', 'block'];
  const MAX_FP = 100000, MAX_FP_PARTS = 200, MAX_FP_PART = 8192;
  const FP_KEYS = ['salt', 'shingle', 'sample', 'minMatches', 'action', 'data'];
  const MAX_HASHES = 20000;
  const MAX_USER_TERMS = 1000;
  // Eigene Label-Namen (Design-Review Geheimnisse/Vermerke, Auflagen 1 und 4; Grenzen 50 x 64
  // nach Auflage der Pflicht-Pruefung 14.10.2026). Keine Regex-Syntax: nur Buchstaben, Ziffern, . - _ ( ) & \ /.
  const MAX_LABELS = 50;
  const LABEL_RE = /^[\p{L}\p{N}][\p{L}\p{N} .\-_()&\\/]{1,63}$/u;
  const MAX_LOGO = 140000; // Zeichen der data:-URI, entspricht etwa 100 KB Bild
  // EU-/EWR-Staaten und CH: dazu kommt das Zusatzpaket EU (EU-USt-Nummern, EKVK, Fuehrerschein).
  const EU_LIKE = ['DE', 'AT', 'FR', 'IT', 'BE', 'NL', 'CH', 'LI', 'ES', 'PT', 'LU', 'SE', 'DK', 'NO', 'FI', 'IS', 'IE', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'HR', 'SI', 'GR', 'CY', 'MT', 'EE', 'LT', 'LV'];
  // Sprache allein (Rueckfall ohne Zeitzone/Region): Hauptlaender der Sprache; en/ar sind zu weit verbreitet.
  const LANG_COUNTRIES = { de: ['DE', 'AT', 'CH'], fr: ['FR', 'BE', 'CH'], it: ['IT', 'CH'], nl: ['NL', 'BE'], es: ['ES'], pt: ['PT', 'BR'], sv: ['SE'], da: ['DK'],
    nb: ['NO'], nn: ['NO'], no: ['NO'], fi: ['FI'], is: ['IS'], pl: ['PL'], cs: ['CZ'], sk: ['SK'], hu: ['HU'], ro: ['RO'], bg: ['BG'], hr: ['HR'], sl: ['SI'],
    el: ['GR'], mt: ['MT'], et: ['EE'], lt: ['LT'], lv: ['LV'], ja: ['JP'], ko: ['KR'], zh: ['CN'], tr: ['TR'], he: ['IL'], hi: ['IN'] };

  // Automatische Laenderpakete (14.10.2026): nur lokale Signale
  // (Zeitzone, Regionsteil der Sprachen), kein Netz, keine Standort-API.
  // Zeitzone -> Paketland (alle Katalog-Laender, Ausbau weltweit 14.10.2026). Mehrere Kuerzel
  // = mehrdeutige Zone, erstes = Hauptland (Aufloesung in detectCountries).
  const TZ_TABLE = {
    CH: 'Europe/Zurich',
    DE: 'Europe/Berlin',
    'DE CH': 'Europe/Busingen', // Buesingen: deutsche Exklave mit Schweizer Zeitzone
    AT: 'Europe/Vienna',
    FR: 'Europe/Paris America/Cayenne America/Guadeloupe America/Martinique Indian/Reunion Indian/Mayotte',
    IT: 'Europe/Rome',
    'BE NL': 'Europe/Brussels', // neuere tzdb fuehren Amsterdam als Verweis auf Brussels
    NL: 'Europe/Amsterdam',
    US: 'America/New_York America/Detroit America/Kentucky/Louisville America/Kentucky/Monticello America/Indiana/Indianapolis ' +
      'America/Indiana/Vincennes America/Indiana/Winamac America/Indiana/Marengo America/Indiana/Petersburg America/Indiana/Vevay ' +
      'America/Chicago America/Indiana/Tell_City America/Indiana/Knox America/Menominee America/North_Dakota/Center ' +
      'America/North_Dakota/New_Salem America/North_Dakota/Beulah America/Denver America/Boise America/Phoenix America/Los_Angeles ' +
      'America/Anchorage America/Juneau America/Sitka America/Metlakatla America/Yakutat America/Nome America/Adak Pacific/Honolulu ' +
      'America/Puerto_Rico America/St_Thomas America/Virgin Pacific/Guam Pacific/Saipan Pacific/Pago_Pago Pacific/Samoa Pacific/Midway ' +
      'Pacific/Wake America/Indianapolis America/Fort_Wayne America/Knox_IN America/Louisville America/Atka America/Shiprock Navajo ' +
      'US/Eastern US/Central US/Mountain US/Pacific US/Alaska US/Hawaii US/Arizona US/Michigan US/East-Indiana US/Indiana-Starke US/Aleutian US/Samoa',
    LI: 'Europe/Vaduz',
    ES: 'Europe/Madrid Africa/Ceuta Atlantic/Canary',
    PT: 'Europe/Lisbon Atlantic/Madeira Atlantic/Azores Portugal',
    LU: 'Europe/Luxembourg',
    SE: 'Europe/Stockholm',
    DK: 'Europe/Copenhagen Atlantic/Faroe Atlantic/Faeroe',
    NO: 'Europe/Oslo Arctic/Longyearbyen Atlantic/Jan_Mayen',
    FI: 'Europe/Helsinki Europe/Mariehamn',
    IS: 'Atlantic/Reykjavik Iceland',
    IE: 'Europe/Dublin Eire',
    GB: 'Europe/London Europe/Belfast Europe/Guernsey Europe/Isle_of_Man Europe/Jersey GB GB-Eire',
    PL: 'Europe/Warsaw Poland',
    CZ: 'Europe/Prague',
    SK: 'Europe/Bratislava',
    HU: 'Europe/Budapest',
    RO: 'Europe/Bucharest',
    BG: 'Europe/Sofia',
    HR: 'Europe/Zagreb',
    SI: 'Europe/Ljubljana',
    GR: 'Europe/Athens',
    CY: 'Asia/Nicosia Europe/Nicosia Asia/Famagusta',
    MT: 'Europe/Malta',
    EE: 'Europe/Tallinn',
    LT: 'Europe/Vilnius',
    LV: 'Europe/Riga',
    CA: 'America/Toronto America/Montreal America/Vancouver America/Edmonton America/Winnipeg America/Halifax America/St_Johns America/Regina ' +
      'America/Moncton America/Glace_Bay America/Goose_Bay America/Iqaluit America/Rankin_Inlet America/Resolute America/Cambridge_Bay ' +
      'America/Yellowknife America/Inuvik America/Whitehorse America/Dawson America/Dawson_Creek America/Fort_Nelson America/Creston ' +
      'America/Swift_Current America/Atikokan America/Blanc-Sablon America/Thunder_Bay America/Nipigon America/Rainy_River America/Pangnirtung ' +
      'Canada/Atlantic Canada/Central Canada/Eastern Canada/Mountain Canada/Newfoundland Canada/Pacific Canada/Saskatchewan Canada/Yukon',
    MX: 'America/Mexico_City America/Cancun America/Merida America/Monterrey America/Matamoros America/Chihuahua America/Ciudad_Juarez ' +
      'America/Ojinaga America/Mazatlan America/Bahia_Banderas America/Hermosillo America/Tijuana America/Ensenada America/Santa_Isabel ' +
      'Mexico/BajaNorte Mexico/BajaSur Mexico/General',
    AR: 'America/Argentina/Buenos_Aires America/Argentina/Cordoba America/Argentina/Salta America/Argentina/Jujuy America/Argentina/Tucuman ' +
      'America/Argentina/Catamarca America/Argentina/La_Rioja America/Argentina/San_Juan America/Argentina/Mendoza America/Argentina/San_Luis ' +
      'America/Argentina/Rio_Gallegos America/Argentina/Ushuaia America/Argentina/ComodRivadavia America/Buenos_Aires America/Cordoba ' +
      'America/Catamarca America/Jujuy America/Mendoza America/Rosario',
    CL: 'America/Santiago America/Punta_Arenas Pacific/Easter Chile/Continental Chile/EasterIsland',
    CO: 'America/Bogota',
    IN: 'Asia/Kolkata Asia/Calcutta',
    CN: 'Asia/Shanghai Asia/Urumqi Asia/Chongqing Asia/Chungking Asia/Harbin Asia/Kashgar PRC',
    JP: 'Asia/Tokyo Japan',
    KR: 'Asia/Seoul ROK',
    SG: 'Asia/Singapore Singapore',
    AU: 'Australia/Sydney Australia/Melbourne Australia/Brisbane Australia/Perth Australia/Adelaide Australia/Darwin Australia/Hobart ' +
      'Australia/Lord_Howe Australia/Broken_Hill Australia/Lindeman Australia/Eucla Australia/Currie Australia/ACT Australia/Canberra Australia/NSW ' +
      'Australia/North Australia/Queensland Australia/South Australia/Tasmania Australia/Victoria Australia/West Australia/LHI Australia/Yancowinna ' +
      'Antarctica/Macquarie',
    NZ: 'Pacific/Auckland Pacific/Chatham NZ NZ-CHAT Antarctica/McMurdo Antarctica/South_Pole',
    ZA: 'Africa/Johannesburg',
    TR: 'Europe/Istanbul Asia/Istanbul Turkey',
    IL: 'Asia/Jerusalem Asia/Tel_Aviv Israel',
    AE: 'Asia/Dubai',
    SA: 'Asia/Riyadh',
    NG: 'Africa/Lagos',
    BR: 'America/Sao_Paulo America/Araguaina America/Bahia America/Belem America/Boa_Vista America/Campo_Grande America/Cuiaba ' +
      'America/Eirunepe America/Fortaleza America/Maceio America/Manaus America/Noronha America/Porto_Velho America/Recife ' +
      'America/Rio_Branco America/Santarem America/Porto_Acre Brazil/East Brazil/West Brazil/Acre Brazil/DeNoronha',
  };
  const TZ = new Map();
  for (const [codes, zones] of Object.entries(TZ_TABLE)) for (const z of zones.split(' ')) TZ.set(z, codes.split(' '));
  const EU_MEMBERS = 'AT BE BG HR CY CZ DK EE FI FR DE GR IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ');
  // Regionen, die rechtlich zu einem Paketland gehoeren (Ueberseegebiete).
  const REGION_ALIAS = new Map([['GP', 'FR'], ['MQ', 'FR'], ['GF', 'FR'], ['RE', 'FR'], ['YT', 'FR'], ['PR', 'US'], ['GU', 'US'], ['VI', 'US'], ['AS', 'US'], ['MP', 'US']]);
  const MAX_LANGS = 20;
  // Chrome/Edge fuehren en-US oft ungefragt als Folgesprache: US aus einer
  // Folgesprache zaehlt nie (Design-Review 14.10.2026 Auflage 3).
  const FOLLOW_SKIP = ['US'];

  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max;
  // Workspace-Namen und Kontotexte: NFKC, Format-Zeichen (Zero-Width, Bidi) weg,
  // Leerraum zusammengefasst, Kleinschreibung; verglichen nur als Ganzes (Auflage 7).
  const normName = (s) => String(s).normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

  function httpsUrl(v) {
    if (!str(v, 9, 2000) || !/^https:\/\/[^\s<>"'`]+$/.test(v)) return false;
    try { return new URL(v).protocol === 'https:'; } catch (e) { return false; }
  }

  // Banner-Link: nur https, ohne Benutzer/Passwort in der URL (Auflage 3).
  function noticeUrl(v) {
    if (!httpsUrl(v)) return false;
    try { const u = new URL(v); return !u.username && !u.password; } catch (e) { return false; }
  }

  function knownRuleIds() {
    const ids = new Set(['dictionary', 'custom_term']);
    if (DLX.engine) for (const d of DLX.engine.allDetectors()) ids.add(d.id);
    return ids;
  }

  function enumList(v, allowed) {
    if (!Array.isArray(v)) return null;
    const out = [];
    for (const x of v) if (allowed.indexOf(x) !== -1 && out.indexOf(x) === -1) out.push(x);
    return out.length || v.length === 0 ? out : null;
  }

  // Logo (Design-Review Mandanten, Auflagen 12/13): nur genau diese zwei data:-Praefixe,
  // Laenge vor atob, danach Inhalt pruefen; im Zweifel kein Logo (Signet). Angezeigt wird
  // es nur als <img> (dort laufen keine Skripte, nichts wird nachgeladen) - das hier ist
  // zusaetzliche Absicherung, gleiche Testfaelle wie scripts/mandanten.mjs (Auflage 14).
  const LOGO_PNG = 'data:image/png;base64,';
  const LOGO_SVG = 'data:image/svg+xml;base64,';
  const SVG_BAD = [/<\s*script/, /foreignobject/, /\bon[a-z]*\s*=/, /j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/, /<!\s*(doctype|entity)/,
    /<!\[cdata\[/, /<\?\s*xml-stylesheet/, /@import/, /<\s*style/, /&#/, /<\s*(iframe|embed|object|image|feimage|animate|set|a)\b/,
    /\bhref\s*=\s*["']\s*(?!#)/, /url\s*\(\s*["']?\s*(?!#)/, /encoding\s*=\s*["'](?!utf-8["'])/];
  function logoOk(v) {
    if (!str(v, 0, MAX_LOGO) || !/^data:image\/(png|svg\+xml);base64,[A-Za-z0-9+/]+=*$/.test(v)) return false;
    if (typeof g.atob !== 'function') return false;
    let bin;
    try { bin = g.atob(v.slice(v.startsWith(LOGO_PNG) ? LOGO_PNG.length : LOGO_SVG.length)); } catch (e) { return false; }
    if (v.startsWith(LOGO_PNG)) return bin.slice(0, 8) === '\x89PNG\r\n\x1a\n';
    // Kein UTF-16/BOM (wuerde ASCII-Muster verstecken), keine NUL-Zeichen.
    if (/^(\xef\xbb\xbf|\xfe\xff|\xff\xfe)/.test(bin) || bin.indexOf('\x00') !== -1) return false;
    const t = bin.toLowerCase();
    return /<\s*svg\b/.test(t) && !SVG_BAD.some((re) => re.test(t));
  }

  const BRANDING = {
    productName: (v) => str(v, 1, 40),
    companyName: (v) => str(v, 0, 80),
    logo: logoOk,
    primaryColor: (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v),
    accentColor: (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v),
    supportUrl: httpsUrl,
    supportText: (v) => str(v, 0, 200),
    aiNoticeText: (v) => str(v, 0, 200),
    aiNoticeUrl: noticeUrl,
    aiNoticeLinkText: (v) => str(v, 0, 60),
  };

  // Eigene Begriffe: { salt: 64 Hex, hashes: [64 Hex] }, beides klein (Auflage 1);
  // Laenge je Eintrag fest, Gesamtgroesse damit hoechstens max * 64 Zeichen (Auflage 5).
  // Base64-Stuecke -> aufsteigend sortierte, eindeutige uint32 (big endian) oder null.
  // Strikt (Auflage 12): nur Base64-Alphabet, Laenge Vielfaches von 4 Zeichen und 4 Byte,
  // ein Fehler verwirft alles (kein Teil-Import).
  function fpValues(data) {
    if (!Array.isArray(data) || !data.length || data.length > MAX_FP_PARTS) return null;
    const out = [];
    let prev = -1;
    for (const part of data) {
      if (typeof part !== 'string' || !part || part.length > MAX_FP_PART || part.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(part)) return null;
      let bin;
      try { bin = atob(part); } catch (e) { return null; }
      if (bin.length % 4) return null;
      for (let i = 0; i < bin.length; i += 4) {
        const v = ((bin.charCodeAt(i) << 24) | (bin.charCodeAt(i + 1) << 16) | (bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3)) >>> 0;
        if (v <= prev || out.length >= MAX_FP) return null;
        out.push(v);
        prev = v;
      }
    }
    return out;
  }
  const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  function fpPolicy(v) {
    if (!isObj(v) || !Object.keys(v).every((k) => FP_KEYS.indexOf(k) !== -1)) return null;
    const p = {
      salt: v.salt, shingle: v.shingle === undefined ? 8 : v.shingle, sample: v.sample === undefined ? 4 : v.sample,
      minMatches: v.minMatches === undefined ? 4 : v.minMatches, action: v.action === undefined ? 'warn' : v.action,
    };
    if (typeof p.salt !== 'string' || !/^[0-9a-f]{64}$/.test(p.salt) || !intIn(p.shingle, 5, 16) || !intIn(p.sample, 1, 64)
      || !intIn(p.minMatches, 2, 50) || FP_ACTIONS.indexOf(p.action) === -1) return null;
    const list = fpValues(v.data);
    if (!list) return null;
    p.data = v.data.slice();
    p.count = list.length;
    return p;
  }

  function termSet(v, max) {
    const hex = (x) => typeof x === 'string' && /^[0-9a-fA-F]{64}$/.test(x);
    if (!isObj(v) || !hex(v.salt) || !Array.isArray(v.hashes) || v.hashes.length > max || !v.hashes.every(hex)) return null;
    return { salt: v.salt.toLowerCase(), hashes: v.hashes.map((x) => x.toLowerCase()) };
  }

  // Ein Seiteneintrag von accountRules; ungueltig -> null, dann gilt fuer die
  // Seite das bisherige Verhalten (normal). Fehler nennen nur Seite, Feld und
  // Index, nie Namen oder Werte (Auflage 9). allow nur bei business und nur mit
  // Workspace-Namen oder host-Kennzeichen (Auflagen 1-2).
  function accountRule(site, v, errors) {
    const at = 'accountRules.' + site + '.';
    if (!isObj(v)) { errors.push(at.slice(0, -1)); return null; }
    let ok = true;
    const out = { workspaces: [], markers: [], business: 'normal', personal: 'normal', unknown: 'normal' };
    for (const [k, x] of Object.entries(v)) {
      if (k === 'workspaces') {
        if (!Array.isArray(x) || x.length > MAX_WORKSPACES) { errors.push(at + k); ok = false; continue; }
        x.forEach((n, i) => {
          if (typeof n === 'string' && normName(n).length >= 1 && n.length <= 80) { if (out.workspaces.indexOf(normName(n)) === -1) out.workspaces.push(normName(n)); }
          else { errors.push(at + k + '[' + i + ']'); ok = false; }
        });
      } else if (k === 'markers') {
        if (!Array.isArray(x) || x.length > 4) { errors.push(at + k); ok = false; continue; }
        x.forEach((m, i) => {
          if (ACCOUNT_MARKERS[site].indexOf(m) !== -1) { if (out.markers.indexOf(m) === -1) out.markers.push(m); }
          else { errors.push(at + k + '[' + i + ']'); ok = false; }
        });
      } else if (ACCOUNT_TYPES.indexOf(k) !== -1) {
        if (ACCOUNT_LEVELS.indexOf(x) !== -1) out[k] = x; else { errors.push(at + k); ok = false; }
      } else { errors.push(at + k); ok = false; }
    }
    if (out.personal === 'allow' || out.unknown === 'allow') { errors.push(at + (out.personal === 'allow' ? 'personal' : 'unknown')); ok = false; }
    if (out.business === 'allow' && !out.workspaces.length && out.markers.indexOf('host') === -1) { errors.push(at + 'business'); ok = false; }
    return ok ? out : null;
  }

  // Liefert { value: nur gueltige Schluessel, errors: [schluessel] }.
  // user = true: Benutzerwerte (erlaubt zusaetzlich countryMode).
  function validate(raw, user) {
    const value = {};
    const errors = [];
    if (!isObj(raw)) return { value, errors: raw === undefined || raw === null ? [] : ['root'] };
    for (const [key, v] of Object.entries(raw)) {
      switch (key) {
        case 'branding': {
          if (!isObj(v)) { errors.push(key); break; }
          const b = {};
          for (const [bk, bv] of Object.entries(v)) {
            if (Object.hasOwn(BRANDING, bk) && BRANDING[bk](bv)) b[bk] = bv; else errors.push('branding.' + bk);
          }
          if (Object.keys(b).length) value.branding = b;
          break;
        }
        case 'language':
          if (LANGS.indexOf(v) !== -1) value.language = v; else errors.push(key);
          break;
        case 'countryPacks': case 'globalPacks': case 'allowedSites': {
          const allowed = key === 'countryPacks' ? COUNTRY : key === 'globalPacks' ? GLOBAL : SITES;
          // Unbekannte Site-IDs (z. B. neuere ADMX, aeltere Erweiterung) werden nur
          // einzeln verworfen; bleibt keine bekannte uebrig, sind alle Seiten
          // gesperrt statt alle offen (Design-Review 13.10.2026 Auflage 2).
          const list = enumList(v, allowed) || (key === 'allowedSites' && Array.isArray(v) ? [] : null);
          if (list) value[key] = list; else errors.push(key);
          if (list && Array.isArray(v) && list.length !== v.length) errors.push(key + '[]');
          break;
        }
        case 'rules': {
          if (!isObj(v)) { errors.push(key); break; }
          const known = knownRuleIds();
          const r = {};
          for (const [id, a] of Object.entries(v)) {
            if (known.has(id) && ACTIONS.indexOf(a) !== -1) r[id] = a; else errors.push('rules.' + id);
          }
          value.rules = r;
          break;
        }
        case 'countryMode':
          // Nur Benutzerwert (chrome.storage.local), nie aus der Richtlinie.
          if (!user) errors.push('unknown:' + key);
          else if (v === 'auto' || v === 'manual') value.countryMode = v; else errors.push(key);
          break;
        case 'aiSiteMode':
          if (AI_MODES.indexOf(v) !== -1) value.aiSiteMode = v; else errors.push(key);
          break;
        case 'allowedAiSites': case 'blockedAiSites': {
          // Unbekannte IDs (neuere Liste in der Richtlinie) still ignorieren (Auflage 3).
          if (!Array.isArray(v) || v.length > MAX_AI_IDS) { errors.push(key); break; }
          const known = aiIds();
          value[key] = v.filter((x, i) => known.indexOf(x) !== -1 && v.indexOf(x) === i);
          break;
        }
        case 'suggestedAiSite':
          // Nie aus Benutzerwerten; unbekannte ID still ignorieren (Auflagen 1, 2).
          if (user) errors.push('unknown:' + key);
          else if (typeof v !== 'string' || !/^[a-z0-9]{1,30}$/.test(v)) errors.push(key);
          else if (DLX.aisites && DLX.aisites.byId(v)) value.suggestedAiSite = v;
          break;
        case 'accountRules': {
          if (!isObj(v) || Object.keys(v).length > Object.keys(ACCOUNT_MARKERS).length) { errors.push(key); break; }
          const r = {};
          for (const [site, x] of Object.entries(v)) {
            if (!Object.hasOwn(ACCOUNT_MARKERS, site)) { errors.push(key + '.' + (SITES.indexOf(site) !== -1 ? site : '?')); continue; }
            const rule = accountRule(site, x, errors);
            if (rule) r[site] = rule;
          }
          value.accountRules = r;
          break;
        }
        case 'answerCheck':
          // Falscher Wert in der Richtlinie = hint, nie stillschweigend aus (Auflage 5).
          if (ANSWER_MODES.indexOf(v) !== -1) value.answerCheck = v;
          else { errors.push(key); if (!user) value.answerCheck = 'hint'; }
          break;
        case 'sensitiveSources': {
          // Nur gueltige Hostmuster (common/quellen.js); die verwaltete Liste ersetzt die lokale ganz (Auflage 17).
          const Q = DLX.quellen;
          if (!Q || !Array.isArray(v) || v.length > Q.MAX_SOURCES) { errors.push(key); if (!user) value.sensitiveSources = []; break; }
          const list = [];
          for (const x of v) { const p = Q.parse(x); if (!p) errors.push(key + '[]'); else if (list.indexOf(p.pattern) === -1) list.push(p.pattern); }
          value.sensitiveSources = list;
          break;
        }
        case 'formGuardSites': {
          // Gleicher Parser wie sensitiveSources (nur https-Host, ein fuehrendes *., keine IPs, keine KI-Seiten).
          const Q = DLX.quellen;
          if (!Q || !Array.isArray(v) || v.length > MAX_FORM_SITES) { errors.push(key); if (!user) value.formGuardSites = []; break; }
          const list = [];
          for (const x of v) { const p = Q.parse(x); if (!p) errors.push(key + '[]'); else if (list.indexOf(p.pattern) === -1) list.push(p.pattern); }
          value.formGuardSites = list;
          break;
        }
        case 'sensitiveSourceAction':
          // Ungueltig in der Richtlinie = block (fail-closed), lokal = Standard warn (Auflage 17).
          if (SOURCE_ACTIONS.indexOf(v) !== -1) value.sensitiveSourceAction = v;
          else { errors.push(key); if (!user) value.sensitiveSourceAction = 'block'; }
          break;
        case 'hiddenInstructionAction':
          // Ungueltig in der Richtlinie = block (fail-closed), lokal = Standard warn (Auflage 6).
          if (HIDDEN_ACTIONS.indexOf(v) !== -1) value.hiddenInstructionAction = v;
          else { errors.push(key); if (!user) value.hiddenInstructionAction = 'block'; }
          break;
        case 'voiceMode':
          // Nur verwaltet; ungueltig = block (fail-closed, Auflage 5).
          if (user) { errors.push('unknown:' + key); break; }
          if (VOICE_MODES.indexOf(v) !== -1) value.voiceMode = v;
          else { errors.push(key); value.voiceMode = 'block'; }
          break;
        case 'documentFingerprints': {
          // Nur verwaltet; ungueltig = ganzer Block verworfen, Fehler nennt nur den Schluessel (Auflage 12).
          if (user) { errors.push('unknown:' + key); break; }
          const fp = fpPolicy(v);
          if (fp) value.documentFingerprints = fp; else errors.push(key);
          break;
        }
        case 'detection':
          if (DETECTION.indexOf(v) !== -1) value.detection = v; else errors.push(key);
          break;
        case 'uncertainFindings':
          if (UNCERTAIN.indexOf(v) !== -1) value.uncertainFindings = v; else errors.push(key);
          break;
        case 'allowUserOverride': case 'allowNotSensitive': case 'allowPlaceholders': case 'blockWhenInactive': case 'blockUncheckedFiles': case 'autoCountryPacks': case 'competenceRecord': case 'imageScan': case 'hiddenInstructionScan':
        // Hinweis beim Kopieren (Design-Review Kopierwarnung 16.10.2026, Auflage 2).
        case 'copySidebarHint':
        // Tabellen, Verschleierung, Umformulieren (Design-Review 16.10.2026): nur verwaltet (nicht in USER_KEYS).
        case 'tableScan': case 'deobfuscation': case 'allowRephrase':
          if (typeof v === 'boolean') value[key] = v; else errors.push(key);
          break;
        case 'dictionary': {
          const ok = isObj(v) && (v.salt === undefined || str(v.salt, 0, 128)) && Array.isArray(v.hashes) &&
            v.hashes.length <= MAX_HASHES && v.hashes.every((h) => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h));
          if (ok) value.dictionary = { salt: v.salt || '', hashes: v.hashes.slice() }; else errors.push(key);
          break;
        }
        case 'customTerms': case 'userTerms': {
          // userTerms nur als Benutzerwert (Einstellungsseite), nie aus der Richtlinie (Auflage 6).
          if (key === 'userTerms' && !user) { errors.push('unknown:' + key); break; }
          const t = termSet(v, key === 'userTerms' ? MAX_USER_TERMS : MAX_HASHES);
          if (t) value[key] = t; else errors.push(key);
          break;
        }
        case 'labelNames': {
          // Nur aus der verwalteten Richtlinie, nie als Benutzerwert (Auflage 1); ein
          // ungueltiger Eintrag verwirft das ganze Feld (Auflage 4). Fehler nennen nur den Schluessel.
          if (user) { errors.push('unknown:' + key); break; }
          const list = Array.isArray(v) && v.length <= MAX_LABELS && v.every((x) => typeof x === 'string')
            ? v.map((x) => x.normalize('NFC').trim()) : null;
          if (list && list.every((x) => LABEL_RE.test(x))) value.labelNames = list.filter((x, i) => list.indexOf(x) === i);
          else errors.push(key);
          break;
        }
        case 'customPatterns': {
          // Eigene Muster der Organisation: nur aus der verwalteten Richtlinie, nie als
          // Benutzerwert; gleiche statische ReDoS-Pruefung wie der Katalog, ein ungueltiger
          // Eintrag verwirft das ganze Feld (Design-Review Muster, Auflage 10).
          if (user) { errors.push('unknown:' + key); break; }
          const list = DLX.muster ? DLX.muster.orgList(v) : null;
          if (list) value.customPatterns = list; else errors.push(key);
          break;
        }
        case 'tableMinRows': case 'tableMinColumns': {
          // Schwellen Tabellen-Erkennung, nur verwaltet; ausserhalb der Grenzen bleibt der Standard (Auflage 18).
          if (user) { errors.push('unknown:' + key); break; }
          const [lo, hi] = key === 'tableMinRows' ? [3, 1000] : [1, 10];
          if (Number.isInteger(v) && v >= lo && v <= hi) value[key] = v; else errors.push(key);
          break;
        }
        case 'tableRedaction':
          if (user) { errors.push('unknown:' + key); break; }
          if (TABLE_REDACTION.indexOf(v) !== -1) value[key] = v; else errors.push(key);
          break;
        case 'massListMin': case 'identityMinParts': {
          // Schwellen Paket context, nur verwaltet; ausserhalb der Grenzen bleibt der
          // Standard (Design-Review Kontext, Auflage 6).
          if (user) { errors.push('unknown:' + key); break; }
          const [lo, hi] = key === 'massListMin' ? [3, 1000] : [2, 4];
          if (Number.isInteger(v) && v >= lo && v <= hi) value[key] = v; else errors.push(key);
          break;
        }
        case 'competenceHideSensitive':
          // Nachweis: Gesundheit/Personendaten/nationale ID immer ausgeblendet (Auflage 5), nur verwaltet.
          if (user) { errors.push('unknown:' + key); break; }
          if (typeof v === 'boolean') value[key] = v; else errors.push(key);
          break;
        // Nachweis-Bericht (Design-Review Bericht 16.10.2026, Auflage 7): nur verwaltet, feste
        // Auswahl; unbekannte Werte -> Standard (ganzes Feld verworfen).
        case 'complianceReport':
          if (user) { errors.push('unknown:' + key); break; }
          if (typeof v === 'boolean') value[key] = v; else errors.push(key);
          break;
        case 'complianceFrameworks': {
          if (user) { errors.push('unknown:' + key); break; }
          const ok = Array.isArray(v) && v.length > 0 && v.every((x, i) => FRAMEWORKS.indexOf(x) !== -1 && v.indexOf(x) === i);
          if (ok) value[key] = v.slice(); else errors.push(key);
          break;
        }
        // Training-Ampel (Design-Review Training-Ampel 16.10.2026, Auflage 12): nur Richtlinie,
        // falscher Typ -> verworfen, es bleibt der Standard true.
        case 'trainingAmpel':
          if (user) { errors.push('unknown:' + key); break; }
          if (typeof v === 'boolean') value[key] = v; else errors.push(key);
          break;
        case 'complianceReportDays':
          if (user) { errors.push('unknown:' + key); break; }
          if (REPORT_DAYS.indexOf(v) !== -1) value[key] = v; else errors.push(key);
          break;
        case 'reportingUrl':
          // Reserviert fuer spaeter (eigenes Design-Review noetig); nie uebernommen.
          if (!httpsUrl(v)) errors.push(key);
          break;
        default:
          errors.push('unknown:' + key);
      }
    }
    return { value, errors };
  }

  // Sprachkuerzel per Intl.Locale zerlegen; Ungueltiges = kein Signal.
  function parseLocale(s) {
    if (typeof s !== 'string' || s.length === 0 || s.length > 35) return null;
    try {
      const loc = new Intl.Locale(s.replace(/_/g, '-'));
      return { lang: String(loc.language || '').toLowerCase(), region: String(loc.region || '').toUpperCase() };
    } catch (e) { return null; }
  }

  // Region (ISO 3166) -> Paketland, 'EU' oder null (kein Paket, z. B. JP).
  function packForRegion(reg) {
    if (!/^[A-Z]{2}$/.test(reg)) return null;
    if (REGION_ALIAS.has(reg)) return REGION_ALIAS.get(reg);
    if (reg !== 'EU' && COUNTRY.indexOf(reg) !== -1) return reg;
    return EU_MEMBERS.indexOf(reg) !== -1 ? 'EU' : null;
  }

  const langCountries = (lang) => (Object.hasOwn(LANG_COUNTRIES, lang) ? LANG_COUNTRIES[lang] : []);

  function withEu(list) {
    if (list.some((c) => EU_LIKE.indexOf(c) !== -1) && list.indexOf('EU') === -1) list.push('EU');
    return list;
  }

  // Bisheriges Verhalten: nur die erste Browsersprache.
  function countriesForLocale(locale) {
    const p = parseLocale(locale);
    if (!p) return [];
    const reg = packForRegion(p.region);
    return withEu(reg && reg !== 'EU' ? [reg] : langCountries(p.lang).slice());
  }

  // env: { timeZone, languages } oder (wie bisher) ein Sprachkuerzel.
  // Liefert { countries, reasons } mit reasons[land] = timezone|region|language|eu.
  // Voll zaehlen Zeitzone und die Region der ersten gueltigen Sprache (erster
  // parsbarer Eintrag; hat er keine Region, gibt es keine). Regionen von
  // Folgesprachen zaehlen nur, wenn die Zeitzone kein Land liefert, US daraus
  // nie (Design-Review Länderpakete 14.10.2026, Auflagen 2-3). Sprache allein zaehlt
  // nur, wenn alles andere nichts liefert (dann genau das bisherige Verhalten).
  function byLanguage(first) {
    const countries = countriesForLocale(first);
    const reasons = {};
    for (const c of countries) reasons[c] = c === 'EU' ? 'eu' : 'language';
    return { countries, reasons };
  }

  function detectCountries(env) {
    let first = '';
    try {
      const e = typeof env === 'string' ? { languages: [env] } : (isObj(env) ? env : {});
      const langs = Array.isArray(e.languages) ? e.languages.slice(0, MAX_LANGS) : [];
      first = typeof langs[0] === 'string' ? langs[0] : '';
      const tz = typeof e.timeZone === 'string' && e.timeZone.length <= 64 ? e.timeZone : '';
      const parsed = langs.map(parseLocale).filter(Boolean);
      const regions = parsed.map((p) => packForRegion(p.region)).filter(Boolean);
      const countries = [];
      const reasons = {};
      const add = (c, why) => { if (countries.indexOf(c) === -1) { countries.push(c); reasons[c] = why; } };
      const cand = TZ.get(tz);
      if (cand) {
        // Mehrdeutige Zone: zuerst Sprachregion, dann Sprache, sonst Hauptland.
        let pick = cand.filter((c) => regions.indexOf(c) !== -1);
        if (!pick.length) pick = cand.filter((c) => parsed.some((p) => langCountries(p.lang).indexOf(c) !== -1));
        for (const c of cand.length > 1 && pick.length ? pick : cand.slice(0, 1)) add(c, 'timezone');
      }
      const firstRegion = parsed.length ? packForRegion(parsed[0].region) : null;
      if (firstRegion) add(firstRegion, 'region');
      if (!cand) for (const p of parsed.slice(1)) { const c = packForRegion(p.region); if (c && FOLLOW_SKIP.indexOf(c) === -1) add(c, 'region'); }
      if (!countries.length) return byLanguage(first);
      if (withEu(countries.slice()).length > countries.length) add('EU', 'eu');
      return { countries, reasons };
    } catch (err) {
      return byLanguage(first); // Fehler -> bisheriges Verhalten, nie "keine Pakete"
    }
  }

  function defaults(env) {
    return {
      branding: Object.assign({}, DLX.branding),
      language: 'auto',
      countryPacks: detectCountries(env).countries,
      globalPacks: GLOBAL.slice(),
      rules: {},
      allowUserOverride: true,
      allowNotSensitive: true,
      allowPlaceholders: true,
      competenceRecord: true,
      imageScan: true,
      detection: 'ki',
      uncertainFindings: 'hint',
      allowedSites: SITES.slice(),
      blockWhenInactive: false,
      blockUncheckedFiles: false,
      aiSiteMode: 'off',
      allowedAiSites: [],
      blockedAiSites: [],
      suggestedAiSite: '',
      accountRules: {},
      dictionary: null,
      customTerms: null,
      userTerms: null,
      labelNames: null,
      customPatterns: null,
      massListMin: 10,
      identityMinParts: 3,
      tableScan: true,
      tableMinRows: 10,
      tableMinColumns: 2,
      tableRedaction: 'columns',
      deobfuscation: true,
      allowRephrase: true,
      competenceHideSensitive: false,
      complianceReport: true,
      complianceFrameworks: FRAMEWORKS.slice(),
      complianceReportDays: 30,
      trainingAmpel: true,
      answerCheck: 'hint',
      sensitiveSources: [],
      sensitiveSourceAction: 'warn',
      hiddenInstructionScan: true,
      hiddenInstructionAction: 'warn',
      formGuardSites: [],
      copySidebarHint: true,
      voiceMode: 'warn',
      documentFingerprints: null,
    };
  }

  // managedRaw = chrome.storage.managed, localRaw = gespeicherte Benutzerwerte,
  // env = { timeZone, languages } (oder Sprachkuerzel). Laendermodus:
  // auto (Standard, bei jedem Aufruf neu erkannt, nichts gespeichert) |
  // manual (gespeicherte countryPacks, ohne Wahl die Erkennung als Vorbelegung) |
  // managed (Richtlinie countryPacks, hat immer Vorrang). autoCountryPacks
  // (Richtlinie) sperrt den Modus auf auto bzw. manual.
  function effective(managedRaw, localRaw, env) {
    const m = validate(managedRaw);
    // Konto-Regeln: mit irgendeiner Richtlinie wird der lokale Wert gar nicht
    // gelesen (Auflage 3); lokal nur ohne Richtlinie (Eigengebrauch, E2E).
    const hasPolicy = isObj(managedRaw) && Object.keys(managedRaw).length > 0;
    if (hasPolicy && isObj(localRaw) && Object.hasOwn(localRaw, 'accountRules')) {
      localRaw = Object.assign({}, localRaw);
      delete localRaw.accountRules;
    }
    const l = validate(localRaw, true);
    const det = detectCountries(env);
    const cfg = defaults(env);
    const locked = { rules: {} };
    let mode = l.value.countryMode === 'manual' ? 'manual' : 'auto';
    if (m.value.autoCountryPacks !== undefined) { mode = m.value.autoCountryPacks ? 'auto' : 'manual'; locked.countryMode = true; }
    for (const k of USER_KEYS) {
      if (k === 'rules' || k === 'countryMode' || (k === 'countryPacks' && mode !== 'manual')) continue;
      if (l.value[k] !== undefined) cfg[k] = l.value[k];
    }
    // Lokale Liste wirkt zusaetzlich zur Richtlinie, nie an ihrer Stelle.
    if (l.value.userTerms) cfg.userTerms = l.value.userTerms;
    if (l.value.accountRules) cfg.accountRules = l.value.accountRules;
    cfg.rules = Object.assign({}, l.value.rules || {});
    // KI-Seiten: steht irgendein aiSite*-Feld in der Richtlinie, gilt der ganze
    // lokale Block nicht (nie zusammengefuehrt oder gelockert, Auflage 4).
    const aiManaged = isObj(managedRaw) && AI_KEYS.some((k) => Object.hasOwn(managedRaw, k));
    if (aiManaged) for (const k of AI_KEYS) locked[k] = true;
    else for (const k of AI_KEYS) if (l.value[k] !== undefined) cfg[k] = l.value[k];
    for (const [k, v] of Object.entries(m.value)) {
      if (k === 'branding') { cfg.branding = Object.assign(cfg.branding, v); locked.branding = true; continue; }
      if (k === 'autoCountryPacks') continue;
      if (k === 'countryPacks') { mode = 'managed'; locked.countryMode = true; }
      if (k === 'rules') {
        for (const [id, a] of Object.entries(v)) { cfg.rules[id] = a; locked.rules[id] = true; }
        continue;
      }
      cfg[k] = v;
      locked[k] = true;
    }
    // country nur fuer die eigenen Erweiterungsseiten, nie fuer Content Scripts.
    return { cfg, locked, managed: Object.keys(m.value).length > 0, errors: m.errors, country: { mode, countries: det.countries, reasons: det.reasons } };
  }

  // Entscheid fuer eine KI-Seite der Liste: none | hint | block. Sperren schlaegt
  // Erlauben; blockedAiSites wirkt in jedem Modus ausser off.
  // Die vorgeschlagene KI gilt als freigegeben, ausser sie ist gesperrt (Auflage 5);
  // die Eingabepruefung laeuft dort weiter (Auflage 3).
  function aiDecision(cfg, id) {
    if (!cfg || AI_MODES.indexOf(cfg.aiSiteMode) < 1) return 'none';
    if ((cfg.blockedAiSites || []).indexOf(id) !== -1) return 'block';
    if ((cfg.allowedAiSites || []).indexOf(id) !== -1) return 'none';
    if (suggestedId(cfg) === id) return 'none';
    return cfg.aiSiteMode;
  }
  function suggestedId(cfg) {
    const id = cfg && cfg.suggestedAiSite;
    if (!DLX.aisites || !DLX.aisites.byId(id) || (cfg.blockedAiSites || []).indexOf(id) !== -1) return '';
    return id;
  }

  // Knopf "Zu <Name> wechseln" auf der KI-Seite currentId: { id, name, url } oder
  // null (kein Vorschlag, gesperrt, schon dort oder Ziel ungueltig, Auflagen 5, 6).
  function aiSuggestion(cfg, currentId) {
    const id = suggestedId(cfg);
    if (!id || id === currentId) return null;
    const x = DLX.aisites.byId(id);
    let u;
    try { u = new URL(DLX.aisites.start(x)); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.hostname !== x.hosts[0] || !u.pathname.startsWith('/')) return null;
    return { id, name: x.name, url: u.href };
  }

  // Stufe fuer die erkannte Kontoart einer Seite: null = keine Konto-Regel
  // (oder alle Stufen normal), sonst { type, level }. det = { type, via } aus
  // dem Seitenadapter. unknown nimmt die strengste der drei Stufen; allow nur
  // ueber Workspace-Namen oder Host, sonst hoechstens hint (Auflage 2).
  const LEVEL_RANK = { allow: 0, hint: 1, normal: 2, block: 3 };
  function accountLevel(cfg, siteId, det) {
    const rules = cfg && isObj(cfg.accountRules) ? cfg.accountRules : {};
    const rule = Object.hasOwn(rules, siteId) ? rules[siteId] : null;
    if (!rule || ACCOUNT_TYPES.every((t) => rule[t] === 'normal')) return null;
    const type = det && ACCOUNT_TYPES.indexOf(det.type) !== -1 ? det.type : 'unknown';
    let level = rule[type];
    if (type === 'unknown') for (const t of ACCOUNT_TYPES) if (LEVEL_RANK[rule[t]] > LEVEL_RANK[level]) level = rule[t];
    if (type === 'business' && level === 'allow' && !(det.via === 'workspace' || det.via === 'host')) level = 'hint';
    return { type, level };
  }

  // Funde nach Konto-Stufe: block = jeder Fund blockiert; allow/hint = nur Funde,
  // die ohnehin block sind (harte Sperren, Auflage 3), halten das Senden an.
  // Unpruefbares bleibt in jeder Stufe wie es ist.
  function accountFindings(list, level) {
    if (level === 'block') return list.map((f) => (f.id === 'unscannable' ? f : Object.assign({}, f, { action: 'block' })));
    if (level === 'allow' || level === 'hint') return list.filter((f) => f.action === 'block' || f.id === 'unscannable');
    return list;
  }

  // Konfiguration fuer DLX.engine.scan. ignore = { key: hex, hashes: [hex] } vom
  // Service Worker (Liste "Kein sensibler Wert"); der Schluessel bleibt im Speicher.
  function engineConfig(cfg, ignore) {
    const packs = [];
    for (const p of cfg.countryPacks.concat(cfg.globalPacks)) if (packs.indexOf(p) === -1) packs.push(p);
    const dictionary = cfg.dictionary && cfg.dictionary.hashes.length
      ? { salt: cfg.dictionary.salt, hashes: new Set(cfg.dictionary.hashes) } : null;
    const ign = ignore && typeof ignore.key === 'string' && /^[0-9a-f]{64}$/.test(ignore.key) && Array.isArray(ignore.hashes)
      ? { key: Uint8Array.from(ignore.key.match(/../g), (x) => parseInt(x, 16)), hashes: new Set(ignore.hashes) } : null;
    // Jede Liste mit eigenem Salz, nie vermischt (Auflage 6).
    const terms = [cfg.customTerms, cfg.userTerms].filter((x) => x && x.hashes.length)
      .map((x) => DLX.dictionary.termList(x.salt, x.hashes)).filter(Boolean);
    // Eigene Label-Namen: Muster hier einmal je Richtlinien-Aenderung bauen (Auflage 4).
    const labels = cfg.labelNames && DLX.markers ? DLX.markers.compile(cfg.labelNames) : null;
    // Eigene Muster (Richtlinie customPatterns): einmal je Richtlinien-Aenderung bauen.
    const org = cfg.customPatterns && DLX.muster ? DLX.muster.orgDetectors(cfg.customPatterns) : null;
    // Dokument-Fingerabdruecke: nur wo engine/fingerabdruck.js geladen ist (Content Script).
    const fp = cfg.documentFingerprints && DLX.fingerprint ? DLX.fingerprint.compile(cfg.documentFingerprints, fpValues(cfg.documentFingerprints.data)) : null;
    return { packs, rules: cfg.rules, dictionary, terms, labels, org, fp, ignore: ign, massMin: cfg.massListMin, idParts: cfg.identityMinParts,
      tableScan: cfg.tableScan, tableMinRows: cfg.tableMinRows, tableMinColumns: cfg.tableMinColumns, tableRedaction: cfg.tableRedaction, deobfuscation: cfg.deobfuscation };
  }

  DLX.policy = { TABLE_REDACTION, VOICE_MODES, FP_ACTIONS, MAX_FP, fpValues, ANSWER_MODES, SOURCE_ACTIONS, HIDDEN_ACTIONS, MAX_FORM_SITES, FRAMEWORKS, REPORT_DAYS, SITES, COUNTRY, GLOBAL, LANGS, ACTIONS, UNCERTAIN, DETECTION, AI_MODES, AI_KEYS, USER_KEYS, MAX_HASHES, MAX_USER_TERMS, MAX_LABELS, validate, defaults, effective, engineConfig, aiDecision, aiSuggestion, countriesForLocale, detectCountries,
    ACCOUNT_LEVELS, ACCOUNT_TYPES, ACCOUNT_MARKERS, normName, accountLevel, accountFindings };
})(globalThis);
