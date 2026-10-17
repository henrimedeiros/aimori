// Service Worker: Konfiguration bereitstellen, Dialog-Anfragen vermitteln,
// Tageszaehler fuehren. Kein Netzwerkzugriff, keine Werte, nur IDs/Zahlen.
importScripts(
  'branding.js', 'engine/core.js', 'engine/muster.js', 'engine/packs-global.js', 'engine/packs-secrets.js', 'engine/packs-marker.js', 'engine/packs-context.js',
  'engine/packs-country.js', 'engine/dictionary.js', 'engine/engine.js', 'engine/ki.js', 'engine/bild.js', 'common/aisites.js', 'common/quellen.js', 'common/policy.js', 'common/stats.js',
  'common/kompetenz.js', 'common/bericht.js',
  'engine/packs-world.js', // Laenderpakete Phase 2/3: registriert nur Pakete, gelesen erst beim Scan
  'engine/packs-community.js', // Gemeinschafts-Katalog (gebuendelt, signaturgeprueft gebaut; laedt nichts nach)
  'common/i18n.js', 'common/signet.js', 'common/training.js', // Training-Ampel (Symbol, Titel)
);

const DLX = globalThis.DLX;
const SETTINGS_KEY = 'dlx.settings';
const STATS_KEY = 'dlx.stats';
const KOMP_KEY = 'dlx.kompetenz';
const PENDING_KEY = 'dlx.pending';
const PENDING_MAX_MS = 120000; // Auflage B2
const IGNORE_KEY = 'dlx.ignore';
const GRANTS_KEY = 'dlx.grants';
const IGNORE_MS = 30 * 86400000;
const IGNORE_MAX = 500;
const GRANT_MS = 60000;
const HEX64 = /^[0-9a-f]{64}$/;
const MODES = ['send', 'paste', 'fileinfo', 'fileblock', 'inactive', 'site', 'live', 'reveal', 'answer', 'image', 'imagewait', 'imagefail', 'doc', 'voice', 'rephrased'];
const LAYOUTS = ['bar', 'full'];
const THEMES = ['hell', 'dunkel'];
// Kontoart nur als Enum, nur vom eigenen Content Script im Top-Frame (fromContent);
// nie in Zaehler, Speicher ausser der offenen Meldung oder Logs (Konto-Regeln Auflage 10).
const ACCOUNTS = ['business', 'personal', 'unknown'];
// Grund einer nicht pruefbaren Bild-Meldung, nur festes Wort (Design-Review Bilder 14.10.2026).
const IMAGE_FAILS = ['size', 'type', 'timeout', 'count', 'busy', 'fail'];
// Erlaubte Entscheidungen je Art; die Art legt nur der Service Worker beim
// Fund fest (Design-Review 14.10.2026 Auflage 10).
const ALLOWED = {
  send: ['cancel', 'redact', 'pseudonym', 'rephrase', 'override', 'notsensitive'], paste: ['cancel', 'redact', 'pseudonym', 'rephrase', 'override', 'notsensitive'],
  live: ['redact', 'pseudonym', 'hide'], reveal: ['show', 'hide'], answer: ['hide'],
  fileinfo: ['ok', 'cancel'], fileblock: ['cancel'], inactive: ['cancel'], site: ['cancel'],
  // Bilder (Design-Review Bilder 14.10.2026): kein Platzhalter, kein "Kein sensibler Wert".
  image: ['cancel', 'redact', 'override'], imagewait: ['cancel'], imagefail: ['cancel', 'override'],
  // Textdokument mit Hinweis auf versteckte Anweisungen (Design-Review KI-Agenten 16.10.2026).
  doc: ['cancel', 'override'],
  // Sprachmodus (Design-Review Diktat und Fingerabdruecke 16.10.2026, Auflage 5).
  voice: ['cancel', 'override'],
  // Sicher umformulieren (Design-Review Tabellen/Verschleierung/Umformen 16.10.2026, Auflage 13):
  // die leise Leiste danach kennt nur Rueckgaengig und Schliessen.
  rephrased: ['undo', 'hide'],
};
// Leisen Hinweise (Tippen, Antwort mit Platzhaltern) verdraengen sich gegenseitig,
// nie eine offene Sende-/Einfuege-Meldung.
const SOFT = ['live', 'reveal', 'answer', 'rephrased'];
// Ansicht "Antwort mit echten Werten" (Design-Review Platzhalter 14.10.2026
// Auflagen 3/4): Nonce je Tab, einmal gueltig, 60 s, gebunden an Tab, Frame und
// Dokument. Der Antworttext liegt nie in storage, nur in der Antwort-Funktion.
const VIEWS_KEY = 'dlx.views';
const VIEW_MS = 60000;
const VIEW_MAX = 200000;
const placeholdersAllowed = (cfg) => cfg.allowPlaceholders === true;
const NUDGE_MS = 250; // hoechstens 4 Anstoesse je Sekunde (Auflage 12)
const SITE_ORIGINS = { 'https://chatgpt.com': 'chatgpt', 'https://claude.ai': 'claude', 'https://gemini.google.com': 'gemini', 'https://copilot.microsoft.com': 'copilot', 'https://copilot.com': 'copilot', 'https://copilot.cloud.microsoft': 'm365copilot', 'https://m365.cloud.microsoft': 'm365copilot' };
const OWN_ORIGIN = 'chrome-extension://' + chrome.runtime.id;
// KI-Seiten-Kontrolle (Design-Review KI-Seiten 14.10.2026): Nonce je Banner,
// einmal gueltig, 60 s bis zum ersten Abruf, gebunden an Tab, Frame und Dokument.
// Gespeichert werden nur Nonce, Tab, Dokument-ID, Art und Seitenname, nie URLs (Auflage 11).
const AI_KEY = 'dlx.ai';
const AI_MS = 60000;
const AI_KEEP_MS = 12 * 3600000;
const AI_MAX = 200;
const AI_PREFIX = 'dlx-ai-';
const KNOWN_IDS = new Set(DLX.engine.allDetectors().map((d) => d.id).concat('dictionary', 'custom_term', 'unscannable', 'clipboard_source', 'hidden_instruction', 'document_match'));
const KNOWN_CATS = new Set(DLX.engine.allDetectors().map((d) => d.cat).concat('unscannable', 'source', 'injection'));
// Ganztext-Funde ohne Wertposition: nicht schwaerzbar (Zwischenablage-Quelle wie unscannable).
const WHOLE = ['unscannable', 'clipboard_source', 'hidden_instruction', 'document_match'];

// --- Konfiguration (B14: Richtlinie vor Benutzerwerten, fail-closed) -----------
async function effective() {
  let managed = {};
  try { managed = await chrome.storage.managed.get(null); } catch (e) { managed = {}; }
  const local = await chrome.storage.local.get(SETTINGS_KEY);
  return DLX.policy.effective(managed, local[SETTINGS_KEY], localEnv());
}

// Ort nur aus lokalen Signalen, bei jeder Abfrage neu (Reise: neue Zeitzone
// wirkt sofort, auch nach SW-Neustart). Wird nie gespeichert oder gesendet.
function localEnv() {
  let timeZone = '';
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { timeZone = ''; }
  const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  return { timeZone, languages: Array.from(langs) };
}

// --- Offene Dialog-Anfragen (nur Speicher + storage.session, B5) ---------------
// storage.session hat standardmaessig die Zugriffsstufe TRUSTED_CONTEXTS:
// Content Scripts koennen es nicht lesen.
async function loadPending() {
  const r = await chrome.storage.session.get(PENDING_KEY);
  return r[PENDING_KEY] || {};
}
async function savePending(all) {
  await chrome.storage.session.set({ [PENDING_KEY]: all });
}
function nonce() {
  const b = new Uint8Array(16); // 128 Bit
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// Absender pruefen.
function fromContent(sender) {
  return sender.id === chrome.runtime.id && sender.tab && sender.frameId === 0 && Object.hasOwn(SITE_ORIGINS, sender.origin);
}
function fromExtPage(sender, page) {
  if (sender.id !== chrome.runtime.id || sender.origin !== OWN_ORIGIN || !sender.url) return false;
  try { return new URL(sender.url).pathname === page; } catch (e) { return false; }
}

// --- Training-Ampel (Design-Review Training-Ampel 16.10.2026) ---------------
// Symbol je KI-Seite per declarativeContent: der Browser vergleicht die Adressen,
// die Erweiterung sieht sie nicht (Auflage 5). Regeln nur aus der mitgelieferten
// Liste, bei jedem Start und jeder Richtlinienaenderung erst entfernt, dann neu.
// Auf den 7 Seiten mit Content Script und accountRules zusaetzlich je Tab die
// gemeldete Kontoart (nur Enum, Auflagen 7-9). Gespeichert nur Tab-ID -> Kontoart
// in storage.session (nur vertrauenswuerdige Kontexte), nie URLs oder Inhalte.
const TRAIN_KEY = 'dlx.training';
const ampelIcons = {};
// Ampel-Symbol je Farbe einmal aus festen Werten erzeugt (Auflage 6).
function ampelIcon(farbe) {
  if (!ampelIcons[farbe]) {
    const o = {};
    for (const s of [16, 32]) o[s] = new ImageData(DLX.signet.rgba(s, farbe), s, s);
    ampelIcons[farbe] = o;
  }
  return ampelIcons[farbe];
}
function ampelTitle(cfg, a) {
  const lang = DLX.i18n.resolveLang(cfg.language, navigator.language);
  return DLX.i18n.t(lang, 'trainTitle_' + a.farbe, { product: cfg.branding.productName });
}
const cb = (fn) => new Promise((resolve) => fn(() => { void chrome.runtime.lastError; resolve(); }));
async function trainLoad() { return (await chrome.storage.session.get(TRAIN_KEY))[TRAIN_KEY] || {}; }
// Lesen-Aendern-Schreiben der Tab-Liste nacheinander (status, cfg und Tab-Schliessen gleichzeitig).
let trainQ = Promise.resolve();
function trainEdit(fn) {
  const run = trainQ.then(async () => { const tabs = await trainLoad(); fn(tabs); await chrome.storage.session.set({ [TRAIN_KEY]: tabs }); });
  trainQ = run.catch(() => {});
  return run;
}
// Tab-genaues Symbol zuruecksetzen (Standardsymbol und -titel).
async function trainReset(tabId) {
  const m = chrome.runtime.getManifest().action;
  await chrome.action.setIcon({ tabId, path: m.default_icon }).catch(() => {});
  await chrome.action.setTitle({ tabId, title: chrome.i18n.getMessage('extName') }).catch(() => {});
}
async function trainingSync(clear) {
  const dc = chrome.declarativeContent;
  try {
    const cfg = (await effective()).cfg;
    const tabs = await trainLoad();
    if (clear) await chrome.storage.session.remove(TRAIN_KEY);
    if (cfg.trainingAmpel === false) {
      for (const t of Object.keys(tabs)) await trainReset(Number(t));
      await chrome.storage.session.remove(TRAIN_KEY);
    }
    if (!dc || !dc.onPageChanged) return;   // ohne API (z. B. Firefox): nur Popup
    await cb((done) => dc.onPageChanged.removeRules(undefined, done));
    if (cfg.trainingAmpel === false) return;
    const now = Date.now();
    const rules = [];
    for (const s of DLX.aisites.LIST) {
      const a = DLX.training.ampel(s.id, DLX.training.typeFor(cfg, s.id, null), now);
      if (!a) continue;
      rules.push({ id: 'dlx-training-' + s.id, conditions: DLX.training.conditions(s).map((pageUrl) => new dc.PageStateMatcher({ pageUrl })),
        actions: [new dc.SetIcon({ imageData: ampelIcon(a.farbe) })] });
    }
    await cb((done) => dc.onPageChanged.addRules(rules, done));
  } catch (e) { /* Standardsymbol bleibt (Auflage 6) */ }
}
// Kontoart eines Tabs setzen (nur von fromContent, Seite aus sender.origin, Auflage 8).
async function trainTab(sender, reported) {
  const cfg = (await effective()).cfg;
  const site = DLX.aisites.find(sender.origin, sender.url);
  if (cfg.trainingAmpel === false || !site || !Object.hasOwn(cfg.accountRules || {}, site.id)) return;
  const type = DLX.training.typeFor(cfg, site.id, ACCOUNTS.includes(reported) ? reported : 'unknown');
  const a = DLX.training.ampel(site.id, type, Date.now());
  if (!a) return;
  await trainEdit((tabs) => { tabs[sender.tab.id] = type; });
  try { await chrome.action.setIcon({ tabId: sender.tab.id, imageData: ampelIcon(a.farbe) }); } catch (e) { /* Standardsymbol */ }
  await chrome.action.setTitle({ tabId: sender.tab.id, title: ampelTitle(cfg, a) }).catch(() => {});
}

// --- KI-Seiten-Kontrolle (Design-Review KI-Seiten 14.10.2026) ---------------
// Absender: eigenes Content Script im Hauptframe einer Seite der Liste (Auflage 7).
function aiSiteOf(sender) {
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0 || typeof sender.documentId !== 'string') return null;
  return DLX.aisites.find(sender.origin, sender.url);
}
async function loadAi() {
  const all = (await chrome.storage.session.get(AI_KEY))[AI_KEY] || {};
  const now = Date.now();
  const keep = Object.entries(all).filter(([, g]) => g && now <= g.until + (g.used ? AI_KEEP_MS : 0));
  return Object.fromEntries(keep.slice(-AI_MAX));
}
async function saveAi(all) { await chrome.storage.session.set({ [AI_KEY]: all }); }
async function aiSiteMsg(sender) {
  const x = aiSiteOf(sender);
  if (!x) return null;
  const cfg = (await effective()).cfg;
  let a = 'none';
  // Fehler bei aktivem Modus: sichtbarer Hinweis, nie "Sperre aufheben" (Auflage 7).
  try { a = DLX.policy.aiDecision(cfg, x.id); } catch (err) { a = cfg.aiSiteMode === 'block' || cfg.aiSiteMode === 'hint' ? 'hint' : 'none'; }
  if (a === 'none') return { a };
  const n = nonce();
  const all = await loadAi();
  all[n] = { tab: sender.tab.id, doc: sender.documentId, a, id: x.id, site: x.name, until: Date.now() + AI_MS };
  await saveAi(all);
  return { a, nonce: n };
}
async function handleAi(msg, sender) {
  const tabId = sender.tab && sender.tab.id;
  if (!Number.isInteger(tabId) || sender.frameId === 0 || typeof msg.nonce !== 'string') return null;
  const all = await loadAi();
  const g = Object.hasOwn(all, msg.nonce) ? all[msg.nonce] : null;
  if (!g || g.tab !== tabId) { await saveAi(all); return null; }
  if (msg.t === 'aiBanner') {
    if (g.used) return null;
    g.used = true;
    g.frameId = sender.frameId;
    await saveAi(all);
    const cfg = (await effective()).cfg;
    const b = cfg.branding;
    // Eigener Link aus dem Branding hat Vorrang, sonst die vorgeschlagene KI (Auflage 11).
    let s = null;
    try { s = b.aiNoticeUrl ? null : DLX.policy.aiSuggestion(cfg, g.id); } catch (e) { s = null; }
    return { a: g.a, site: g.site, text: b.aiNoticeText || '', url: b.aiNoticeUrl || (s ? s.url : ''), linkText: b.aiNoticeLinkText || '', suggest: s ? s.name : '', branding: b, language: cfg.language };
  }
  // Schliessen nur im Hinweis-Modus, nur aus dem gebundenen Frame (Auflage 8).
  if (msg.t === 'aiClose' && g.used && g.a === 'hint' && g.frameId === sender.frameId) {
    delete all[msg.nonce];
    await saveAi(all);
    await chrome.tabs.sendMessage(tabId, { t: 'aiHide', nonce: msg.nonce }, { frameId: 0, documentId: g.doc }).catch(() => {});
    return { ok: true };
  }
  return null;
}
// Waechter nur fuer gewaehrte optionale Origins der Liste mit Entscheid != none
// registrieren; zuerst immer die eigenen IDs abmelden (Auflage 5). Laeufe nacheinander.
// Die 7 unterstuetzten Seiten deckt der statische Content-Script-Eintrag ab: dort
// injiziert der Browser dynamisch registrierte Skripte nicht (nur Content-Script-Recht,
// kein Host-Recht; E2E 14.10.2026).
let aiChain = Promise.resolve();
function aiSync() {
  aiChain = aiChain.then(aiSyncNow).catch(() => {});
  return aiChain;
}
async function aiSyncNow() {
  const own = (await chrome.scripting.getRegisteredContentScripts()).map((x) => x.id).filter((id) => id.startsWith(AI_PREFIX));
  if (own.length) await chrome.scripting.unregisterContentScripts({ ids: own });
  const cfg = (await effective()).cfg;
  if (cfg.aiSiteMode !== 'hint' && cfg.aiSiteMode !== 'block') return;
  const granted = new Set((await chrome.permissions.getAll()).origins || []);
  for (const cs of chrome.runtime.getManifest().content_scripts || []) for (const m of cs.matches || []) granted.delete(m);
  const matches = [];
  for (const x of DLX.aisites.LIST) {
    if (DLX.policy.aiDecision(cfg, x.id) === 'none') continue;
    for (const h of x.hosts) if (granted.has('https://' + h + '/*')) matches.push(DLX.aisites.pattern(x, h));
  }
  if (!matches.length) return;
  await chrome.scripting.registerContentScripts([{ id: AI_PREFIX + 'guard', matches, js: ['content/aiguard.js'], runAt: 'document_start', world: 'ISOLATED', allFrames: false, persistAcrossSessions: true }]);
}

// --- Zwischenablage-Schutz (Design-Review Antwort/Zwischenablage 16.10.2026) ---
// quelle.js nur fuer Origins, die konfiguriert UND erteilt sind (Auflage 9); bei jedem
// Abgleich zuerst abmelden. Nicht mehr konfigurierte, aber erteilte Origins werden
// zurueckgegeben, Merkmale verworfen, sobald eine Quelle wegfaellt.
const SRC_ID = 'dlx-quelle';
const SRC_KEY = 'dlx.srcMarks';     // { v, salt, marks: [{ h, exp }] } nur in storage.session (Auflage 14)
const SRC_ACTIVE = 'dlx.srcActive';
const SRC_MS = 30 * 60000;
const SRC_MAX = 20;
const SRC_RATE = 10;                // Merkmale je Minute (Auflage 12)
const SRC_FILES = ['common/quellen.js', 'content/quelle.js'];
// Formularwache (Design-Review KI-Agenten 16.10.2026, Auflagen 7-13): eigenes Skript nur fuer
// Origins der Richtlinie formGuardSites, die konfiguriert UND erteilt sind; gleicher Riegel.
const FORM_ID = 'dlx-formwache';
const FORM_FILES = ['branding.js', 'engine/core.js', 'engine/muster.js', 'engine/packs-global.js', 'engine/packs-secrets.js', 'engine/packs-marker.js',
  'engine/packs-context.js', 'engine/packs-country.js', 'engine/packs-world.js', 'engine/packs-community.js', 'engine/dictionary.js', 'engine/entschleiern.js', 'engine/tabelle.js', 'engine/engine.js',
  'common/quellen.js', 'common/policy.js', 'content/formwache.js'];
// Kopierwache (Design-Review Kopierwarnung 16.10.2026, docs/sicherheit/design-review-kopierwarnung.md):
// das optionale Breitbandrecht gilt nur als gewollt, solange copySidebarHint effektiv an ist
// (exakter Vergleich, getrennt vom Riegel srcOriginOk, der weiter keinen *-Host zulaesst; Auflage 2).
// Das kleine Skript ohne Engine laeuft auf https-Seiten ausser den statischen KI-Seiten (Auflage 10);
// die Engine kommt erst beim Kopieren per executeScript in genau dieses Dokument (Auflagen 5, 6).
const COPY_ID = 'dlx-kopierwache';
const COPY_ALL = 'https://*/*';
const COPY_GAP_MS = 2000;
const COPY_FILES = FORM_FILES.filter((f) => f !== 'content/formwache.js').concat('common/i18n.js');
const copyDocs = new Set();      // documentIds mit geladener Engine, nur im Speicher
const copyLast = new Map();      // Tab -> letzte Pruefung (Rate)
function copyExclude() {
  const out = [];
  for (const cs of chrome.runtime.getManifest().content_scripts || []) for (const m of cs.matches || []) if (out.indexOf(m) === -1) out.push(m);
  return out;
}
// Eigener fail-closed-Riegel unabhaengig von common/quellen.js (Pflicht-Pruefung 16.10.2026):
// nur https://<host>/* oder https://*.<host>/* mit mindestens zwei Labels, sonst kein '*'.
const SRC_ORIGIN = /^https:\/\/(\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}\/\*$/;
const srcOriginOk = (o) => typeof o === 'string' && o.length <= 270 && SRC_ORIGIN.test(o);
let srcChain = Promise.resolve();
function srcSync() {
  srcChain = srcChain.then(srcSyncNow).catch(() => {});
  return srcChain;
}
function srcFixed() {
  const fixed = new Set(DLX.aisites.origins());
  for (const cs of chrome.runtime.getManifest().content_scripts || []) for (const m of cs.matches || []) fixed.add(m);
  return fixed;
}
async function srcSyncNow() {
  const own = (await chrome.scripting.getRegisteredContentScripts()).map((x) => x.id).filter((id) => id === SRC_ID || id === FORM_ID || id === COPY_ID);
  if (own.length) await chrome.scripting.unregisterContentScripts({ ids: own });
  const cfg = (await effective()).cfg;
  const srcWanted = new Set(DLX.quellen.originsOf(cfg.sensitiveSources).filter(srcOriginOk));
  const formWanted = new Set(DLX.quellen.originsOf(cfg.formGuardSites || []).filter(srcOriginOk));
  const copyOn = cfg.copySidebarHint !== false;
  const wanted = new Set([...srcWanted, ...formWanted]);
  if (copyOn) wanted.add(COPY_ALL);
  const fixed = srcFixed();
  const extra = ((await chrome.permissions.getAll()).origins || []).filter((o) => !fixed.has(o));
  const drop = extra.filter((o) => !wanted.has(o));
  if (drop.length) await chrome.permissions.remove({ origins: drop }).catch(() => {});
  const matches = extra.filter((o) => srcWanted.has(o)).sort();
  const formMatches = extra.filter((o) => formWanted.has(o)).sort();
  if (formMatches.length) {
    await chrome.scripting.registerContentScripts([{ id: FORM_ID, matches: formMatches, js: FORM_FILES, runAt: 'document_start', world: 'ISOLATED', allFrames: false,
      matchOriginAsFallback: false, persistAcrossSessions: false }]);
  }
  if (copyOn && extra.indexOf(COPY_ALL) !== -1) {
    await chrome.scripting.registerContentScripts([{ id: COPY_ID, matches: [COPY_ALL], excludeMatches: copyExclude(), js: ['content/kopierwache.js'], runAt: 'document_idle',
      world: 'ISOLATED', allFrames: false, matchOriginAsFallback: false, persistAcrossSessions: false }]);
  }
  const before = (await chrome.storage.session.get(SRC_ACTIVE))[SRC_ACTIVE] || [];
  if (before.some((o) => matches.indexOf(o) === -1)) await srcClear();
  await chrome.storage.session.set({ [SRC_ACTIVE]: matches });
  if (!matches.length) return;
  await chrome.scripting.registerContentScripts([{ id: SRC_ID, matches, js: SRC_FILES, runAt: 'document_start', world: 'ISOLATED', allFrames: false, persistAcrossSessions: false }]);
}
// Absender genau pruefen (Auflage 6), Nachricht genau {t} (Auflage 14), Einstellung und Recht
// bei jedem Aufruf neu; Engine je Dokument einmal, Fehler still (Auflage 5). Antwort nur das
// fuer die Pruefung Noetige, ohne eigene Begriffe, Woerterbuch und Fingerabdruecke (Auflage 7).
const COPY_CFG_KEYS = ['language', 'countryPacks', 'globalPacks', 'rules', 'massListMin', 'identityMinParts', 'tableScan', 'tableMinRows', 'tableMinColumns',
  'tableRedaction', 'deobfuscation', 'customPatterns', 'labelNames'];
async function copyScan(msg, sender) {
  if (!msg || Object.keys(msg).join() !== 't') return null;
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0 || typeof sender.documentId !== 'string' || sender.documentLifecycle !== 'active') return null;
  let u;
  try { u = new URL(sender.url); } catch (e) { return null; }
  if (u.protocol !== 'https:' || sender.origin !== u.origin) return null;
  if (DLX.aisites.find(u.origin, u.origin + u.pathname)) return null;
  const cfg = (await effective()).cfg;
  if (cfg.copySidebarHint === false || !(await chrome.permissions.contains({ origins: [COPY_ALL] }))) return null;
  const tabId = sender.tab.id;
  const now = Date.now();
  if (now - (copyLast.get(tabId) || 0) < COPY_GAP_MS) return null;
  copyLast.set(tabId, now);
  const target = { tabId, documentIds: [sender.documentId] };
  try {
    if (!copyDocs.has(sender.documentId)) {
      const [r] = await chrome.scripting.executeScript({ target, func: () => !!(globalThis.DLX && globalThis.DLX.engine) });
      if (!r || r.result !== true) await chrome.scripting.executeScript({ target, files: COPY_FILES });
      if (copyDocs.size > 500) copyDocs.clear();
      copyDocs.add(sender.documentId);
    }
  } catch (e) { return null; }
  const out = {};
  for (const k of COPY_CFG_KEYS) if (Object.hasOwn(cfg, k)) out[k] = cfg[k];
  return { cfg: out, product: cfg.branding && typeof cfg.branding.productName === 'string' ? cfg.branding.productName : '' };
}
async function srcClear() {
  const cur = (await chrome.storage.session.get(SRC_KEY))[SRC_KEY];
  await chrome.storage.session.set({ [SRC_KEY]: { v: (cur && Number.isInteger(cur.v) ? cur.v : 0) + 1, salt: null, marks: [] } });
  srcPush();
}
// Abgelaufene Eintraege bei jedem Zugriff entfernen; leere Liste = Salz verwerfen.
async function srcLoad() {
  const raw = (await chrome.storage.session.get(SRC_KEY))[SRC_KEY];
  const now = Date.now();
  const v = raw && Number.isInteger(raw.v) ? raw.v : 0;
  const marks = raw && Array.isArray(raw.marks) ? raw.marks.filter((m) => m && HEX64.test(m.h) && m.exp > now && m.exp <= now + SRC_MS) : [];
  const salt = marks.length && raw && typeof raw.salt === 'string' && HEX64.test(raw.salt) ? raw.salt : null;
  return { v, salt, marks };
}
const srcRate = [];
async function srcMark(msg, sender) {
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0 || sender.documentLifecycle !== 'active') return null;
  if (!msg || Object.keys(msg).sort().join() !== 'hash,t' || typeof msg.hash !== 'string' || !HEX64.test(msg.hash)) return null;
  let host;
  try { const u = new URL(sender.origin); if (u.protocol !== 'https:' || u.port) return null; host = u.hostname; } catch (e) { return null; }
  if (!srcOriginOk('https://' + host + '/*')) return null;
  const cfg = (await effective()).cfg;
  if (!DLX.quellen.matches(cfg.sensitiveSources, host)) return null;
  if (!(await chrome.permissions.contains({ origins: [sender.origin + '/*'] }))) return null;
  const now = Date.now();
  while (srcRate.length && now - srcRate[0] > 60000) srcRate.shift();
  if (srcRate.length >= SRC_RATE) return null;
  srcRate.push(now);
  const st = await srcLoad();
  const salt = st.salt || nonce() + nonce();
  const h = DLX.dictionary.sha256Hex(salt + ':' + msg.hash);
  const marks = st.marks.filter((m) => m.h !== h).concat({ h, exp: now + SRC_MS }).slice(-SRC_MAX);
  await chrome.storage.session.set({ [SRC_KEY]: { v: st.v + 1, salt, marks } });
  srcPush();
  return { ok: true };
}
// Nur an Tabs der KI-Seiten mit eigenem Content Script, Hauptframe (Auflage 15).
async function srcPush() {
  const st = await srcLoad();
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: Object.keys(SITE_ORIGINS).map((o) => o + '/*') }); } catch (e) { tabs = []; }
  for (const t of tabs) chrome.tabs.sendMessage(t.id, Object.assign({ t: 'srcMarks' }, st), { frameId: 0 }).catch(() => {});
}

// --- Liste "Kein sensibler Wert" (Design-Review Fehlalarme, Auflagen 6-10) ----
// Nur HMAC-Werte mit Ablauf; Schluessel 256 Bit je Installation. Beim Lesen
// geprueft (Content Scripts koennen storage.local beschreiben); ist die
// Richtlinie aus, wird die Liste geloescht.
const ignoreAllowed = (cfg) => cfg.allowNotSensitive === true && cfg.allowUserOverride === true;
async function loadIgnore(cfg, create) {
  if (!ignoreAllowed(cfg)) { await chrome.storage.local.remove(IGNORE_KEY); return null; }
  const raw = (await chrome.storage.local.get(IGNORE_KEY))[IGNORE_KEY];
  const now = Date.now();
  let store = raw && typeof raw.key === 'string' && HEX64.test(raw.key) && Array.isArray(raw.entries) ? raw : null;
  if (!store) { if (!create) return null; store = { key: nonce() + nonce(), entries: [] }; }
  const entries = store.entries.filter((x) => x && typeof x.h === 'string' && HEX64.test(x.h) && Number.isFinite(x.exp) && x.exp > now && x.exp <= now + IGNORE_MS).slice(-IGNORE_MAX);
  const clean = { key: store.key, entries };
  if (store !== raw || entries.length !== store.entries.length) await chrome.storage.local.set({ [IGNORE_KEY]: clean });
  return clean;
}
const ignorableCount = (p) => p.items.filter((i) => DLX.engine.ignorable(i.id)).reduce((a, i) => a + i.n, 0);

const validLines = (l) => Array.isArray(l) && l.length >= 1 && l.length <= 5 && l.every((x) => Number.isInteger(x) && x >= 1 && x <= 100000);

function validItems(items, mode) {
  if (!Array.isArray(items) || items.length > 100) return null;
  const out = [];
  for (const it of items) {
    if (!it || !KNOWN_IDS.has(it.id) || !KNOWN_CATS.has(it.cat) || !Number.isInteger(it.n) || it.n < 1 || it.n > 10000) return null;
    // Unsicher (nur Live-Hinweis, grau) als einziges Zusatzfeld, nur der Wert false.
    const o = it.sure === false && mode === 'live' ? { id: it.id, cat: it.cat, n: it.n, sure: false } : { id: it.id, cat: it.cat, n: it.n };
    // Zeilennummern bei eingefuegtem Code: nur 1-5 ganze Zahlen 1..100000, sonst verworfen,
    // der Fund bleibt (Design-Review Code und Bilder 16.10.2026, Auflage 5).
    if (validLines(it.lines)) o.lines = it.lines.slice();
    out.push(o);
  }
  return out;
}

// Zu welchem KI-Tab gehoert ein Dialog? iframe im Tab oder Rueckfall-Popup.
// Das Content Script laeuft nur im Top-Frame (fromContent: frameId 0), daher ein
// Eintrag je Tab; der Meldungs-Frame wird beim ersten hello gebunden (Auflage 11).
async function resolveTab(sender) {
  const all = await loadPending();
  const tabId = sender.tab && sender.tab.id;
  for (const [aiTab, p] of Object.entries(all)) {
    const inTab = Number(aiTab) === tabId && sender.frameId !== 0 && (p.frameId == null || p.frameId === sender.frameId);
    if (inTab || p.popupTabId === tabId) {
      if (Date.now() - p.created > PENDING_MAX_MS) { delete all[aiTab]; await savePending(all); return null; }
      return { aiTab: Number(aiTab), p, all };
    }
  }
  return null;
}

async function count(p, decision) {
  const r = await chrome.storage.local.get(STATS_KEY);
  const stats = DLX.stats.prune(r[STATS_KEY] || {}, new Date());
  // Sprachmodus: nur die Tageszahl (Auflage 6).
  const cats = p.items.length ? p.items : [{ cat: p.mode === 'site' ? 'site' : p.mode === 'inactive' ? 'inactive' : p.mode === 'voice' ? 'voice' : 'file', n: 1 }];
  for (const it of cats) DLX.stats.add(stats, new Date(), p.site, it.cat, decision, it.n);
  await chrome.storage.local.set({ [STATS_KEY]: stats });
}

function decisionAllowed(p, choice, confirmed, cfg) {
  const real = p.items.filter((i) => !WHOLE.includes(i.id));
  if (!(ALLOWED[p.mode] || []).includes(choice)) return false;
  if (choice === 'cancel' || choice === 'ok' || choice === 'hide') return true;
  if (choice === 'redact') return real.length > 0 && (p.action === 'warn' || p.action === 'redact');
  if (choice === 'pseudonym') return real.length > 0 && (p.action === 'warn' || p.action === 'redact') && placeholdersAllowed(cfg);
  // Umformulieren wie Schwaerzen, nie bei Sperre, nur mit Richtlinie allowRephrase (Auflage 13).
  if (choice === 'rephrase') return real.length > 0 && (p.action === 'warn' || p.action === 'redact') && cfg.allowRephrase === true;
  if (choice === 'undo') return p.mode === 'rephrased';
  if (choice === 'show') return placeholdersAllowed(cfg);
  if (choice === 'override') return p.action === 'warn' && cfg.allowUserOverride === true && confirmed === true; // B3
  if (choice === 'notsensitive') return p.action === 'warn' && ignoreAllowed(cfg) && confirmed === true && ignorableCount(p) > 0; // Auflagen 6, 9
  return false;
}

// Datenloser Anstoss an die Meldungs-Frames: holen ihren Stand per hello neu und
// sperren ihre Knoepfe kurz (Nachfuehren, Auflagen 9/12).
let lastNudge = 0;
// Hoehe der Leiste vom gebundenen Frame: hoechstens 10 Meldungen je Sekunde und
// Meldung (Design-Review Leiste/Hoehe 15.10.2026, Auflage 5); nur im Speicher.
const SIZE_MIN = 56, SIZE_MAX = 240, SIZE_PER_S = 10;
const sizeRate = new Map();
function sizeAllowed(nonce) {
  const now = Date.now();
  const s = sizeRate.get(nonce);
  if (!s || now - s.t0 >= 1000) {
    if (sizeRate.size > 50) sizeRate.clear();
    sizeRate.set(nonce, { t0: now, n: 1 });
    return true;
  }
  return ++s.n <= SIZE_PER_S;
}
let nudgeTimer = null;
function nudge() {
  if (nudgeTimer) return;
  const wait = Math.max(0, NUDGE_MS - (Date.now() - lastNudge));
  nudgeTimer = setTimeout(() => {
    nudgeTimer = null;
    lastNudge = Date.now();
    chrome.runtime.sendMessage({ t: 'nudge' }).catch(() => {});
  }, wait);
}

// Ansichts-Eintraege: nur Nonce, Zeiten, Frame und Dokument, nie Text.
async function loadViews() {
  const all = (await chrome.storage.session.get(VIEWS_KEY))[VIEWS_KEY] || {};
  const now = Date.now();
  for (const [k, v] of Object.entries(all)) if (!v || (!v.used && now - v.created > VIEW_MS)) delete all[k];
  return all;
}
async function saveViews(all) {
  if (Object.keys(all).length) await chrome.storage.session.set({ [VIEWS_KEY]: all });
  else await chrome.storage.session.remove(VIEWS_KEY);
}
async function dropView(tabId) {
  const all = await loadViews();
  delete all[tabId];
  await saveViews(all);
}

// Anfrage der Ansicht (ui/view.html im Tab der KI-Seite): Nonce aus der eigenen
// URL, einmal gueltig; den Text liefert das Content Script auf tabs.sendMessage.
async function handleView(msg, sender) {
  const tabId = sender.tab && sender.tab.id;
  if (!Number.isInteger(tabId) || sender.frameId === 0 || typeof msg.nonce !== 'string') return null;
  const all = await loadViews();
  const v = Object.hasOwn(all, tabId) ? all[tabId] : null;
  if (!v || v.nonce !== msg.nonce) { await saveViews(all); return null; }   // Abgelaufene gleich entfernen
  if (msg.t === 'view') {
    const e = await effective();
    if (v.used || !placeholdersAllowed(e.cfg)) return null;
    v.used = true;
    v.frameId = sender.frameId;
    await saveViews(all);
    const opt = v.doc ? { frameId: 0, documentId: v.doc } : { frameId: 0 };
    const res = await chrome.tabs.sendMessage(tabId, { t: 'viewText', nonce: v.nonce }, opt).catch(() => null);
    const text = res && typeof res.text === 'string' ? res.text.slice(0, VIEW_MAX) : null;
    if (text === null) return null;
    return { text, branding: e.cfg.branding, language: e.cfg.language };
  }
  if (msg.t === 'close' && v.used && v.frameId === sender.frameId) {
    delete all[tabId];
    await saveViews(all);
    await chrome.tabs.sendMessage(tabId, { t: 'decision', nonce: v.nonce, choice: 'hide' }, { frameId: 0 }).catch(() => {});
    return { ok: true };
  }
  return null;
}

async function closePopup(p) {
  if (p.popupWindowId) await chrome.windows.remove(p.popupWindowId).catch(() => {});
}

// --- KI-Kompetenz (Design-Review 14.10.2026, docs/sicherheit/design-review-kompetenz.md)
// Gezaehlt nur hier und nur auf hello/decide des Meldungs-Frames, je Eintrag
// hoechstens einmal (Merker kSeen/kDone im Eintrag in storage.session, Auflage 1).
// Schreiben nacheinander, damit sich zwei Zaehlungen nicht ueberschreiben.
const KSHOW = ['send', 'paste', 'live', 'image'];
const kompetenzOn = (cfg) => cfg.competenceRecord !== false;
const plain = (o) => JSON.parse(JSON.stringify(o));
let kChain = Promise.resolve();
function kQueue(job) {
  const run = kChain.then(job);
  kChain = run.catch(() => {});
  return run;
}
function kCount(cfg, groups, field) {
  if (!kompetenzOn(cfg) || !groups.length) return Promise.resolve();
  return kQueue(async () => {
    const raw = (await chrome.storage.local.get(KOMP_KEY))[KOMP_KEY];
    await chrome.storage.local.set({ [KOMP_KEY]: plain(DLX.kompetenz.add(raw, new Date(), groups, field)) });
  });
}
async function kDecided(p, cfg, decision) {
  const field = Object.hasOwn(DLX.kompetenz.DECISION_FIELD, decision) ? DLX.kompetenz.DECISION_FIELD[decision] : null;
  if (!field || !p.kSeen || p.kDone) return;
  p.kDone = true;
  await kCount(cfg, DLX.kompetenz.groupsOf(p.items), field);
}
// Bereinigen (13 Monate, Ungueltiges verworfen) bzw. loeschen, wenn aus (Auflagen 3-5).
function kTidy() {
  return kQueue(async () => {
    if (!kompetenzOn((await effective()).cfg)) { await chrome.storage.local.remove(KOMP_KEY); return null; }
    const raw = (await chrome.storage.local.get(KOMP_KEY))[KOMP_KEY];
    const s = plain(DLX.kompetenz.clean(raw, new Date()));
    if (raw !== undefined && JSON.stringify(s) !== JSON.stringify(raw)) await chrome.storage.local.set({ [KOMP_KEY]: s });
    return s;
  });
}
const sameGroups = (a, b) => DLX.kompetenz.groupsOf(a).sort().join() === DLX.kompetenz.groupsOf(b).sort().join();

// --- Texterkennung in Bildern (Design-Review Bilder 14.10.2026) ---------------
// Bildbytes nur im Speicher vom eigenen Content Script an das Offscreen-Dokument
// und zurueck nur Woerter mit Rahmen; nie storage, nie Logs (Auflagen 2, 3, 11).
const OCR_DOC = 'ui/ocr.html';
const OCR_IDLE_MS = 60000;
const OCR_B64_MAX = Math.ceil(DLX.bild.LIMITS.bytes / 3) * 4;
// Hoechstens eine Pruefung gleichzeitig, ueber alle Tabs (ein Offscreen-Dokument;
// eine Zeitueberschreitung schliesst es, darf also keine fremde Pruefung treffen; Auflage 3).
let ocrRunning = false;
let ocrCreating = null;
let ocrIdle = null;
let ocrLast = 0;
async function ocrDoc() {
  const has = (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL(OCR_DOC)] })).length > 0;
  if (has) return;
  if (!ocrCreating) {
    ocrCreating = chrome.offscreen.createDocument({ url: OCR_DOC, reasons: ['WORKERS'], justification: 'Local text recognition in pasted images and local AI detection of personal data' })
      .finally(() => { ocrCreating = null; });
  }
  await ocrCreating;
}
async function ocrClose() {
  clearTimeout(ocrIdle);
  kiReady = false;
  try { await chrome.offscreen.closeDocument(); } catch (e) { /* schon zu */ }
}
// Ein Bild erkennen; Zeitueberschreitung schliesst das Dokument (beendet den Worker).
async function ocrRun(data, langs, ms) {
  clearTimeout(ocrIdle);
  await ocrDoc();
  let timer = null;
  const late = new Promise((r) => { timer = setTimeout(() => r({ error: 'timeout' }), ms); });
  const res = await Promise.race([chrome.runtime.sendMessage({ target: 'dlx-ocr', t: 'run', data, langs }).catch(() => ({ error: 'fail' })), late]);
  clearTimeout(timer);
  if (res && res.error === 'timeout') await ocrClose();
  else { ocrLast = Date.now(); docIdle(); }
  if (!res || typeof res !== 'object') return { error: 'fail' };
  if (res.error) return { error: ['size', 'type', 'timeout'].includes(res.error) ? res.error : 'fail' };
  if (!DLX.bild.validLines(res.lines) || ![1, 2].includes(res.scale) || !Number.isInteger(res.w) || !Number.isInteger(res.h)) return { error: 'fail' };
  return { lines: res.lines, scale: res.scale, w: res.w, h: res.h, ms: Number.isFinite(res.ms) ? res.ms : 0 };
}
async function handleOcr(msg) {
  if (typeof msg.data !== 'string' || msg.data.length > OCR_B64_MAX || !/^[A-Za-z0-9+/]*={0,2}$/.test(msg.data.slice(-8))) return { error: 'size' };
  if (ocrRunning) return { error: 'busy' };
  const e = await effective();
  if (e.cfg.imageScan === false) return { error: 'off' };
  const ms = Math.min(DLX.bild.LIMITS.ms, Math.max(1000, Number(msg.ms) || 0));
  ocrRunning = true;
  try {
    return await ocrRun(msg.data, DLX.bild.langsFor(String(msg.lang || '')), ms);
  } finally {
    ocrRunning = false;
  }
}

// --- Lokale KI-Erkennung (Design-Review KI 16.10.2026, docs/sicherheit/design-review-ki.md) ---
// Text nur im Speicher vom eigenen Content Script (fromContent) an das
// Offscreen-Dokument und zurueck nur Typ/Start/Ende/Konfidenz; nie storage,
// nie Logs. Je Tab hoechstens eine Anfrage, eine neuere ersetzt die aeltere;
// global hoechstens 4 wartend; Zeitgrenze je Pruefung (Auflagen 12, 14).
// Rueckfall auf "nur Regeln" bei Fehlern, hoechstens ein neuer Versuch je
// Browser-Sitzung; Status ohne Text in storage.session (Auflage 19).
const KI_STATUS_KEY = 'kiStatus';
const KI_RUN_MS = 3000;
const KI_LOAD_MS = 90000;
const KI_IDLE_MS = 600000;
const KI_QUEUE_MAX = 4;
const kiTab = new Map();
let kiActive = 0;
let kiLast = 0;
let kiChain = Promise.resolve();
let kiReady = false;
// WASM als Standard: mit dem INT8-Modell ist WebGPU langsamer (Messung 16.10.2026,
// docs/ki-erkennung.md); der WebGPU-Pfad bleibt fuer ein spaeteres fp16-Modell.
let kiGpu = false;

// Offscreen-Dokument erst schliessen, wenn weder Texterkennung noch KI es brauchen (Auflage 17).
function docIdle() {
  clearTimeout(ocrIdle);
  const due = () => Math.max(ocrLast + OCR_IDLE_MS, kiLast + KI_IDLE_MS);
  ocrIdle = setTimeout(() => {
    if (!ocrRunning && !kiActive && Date.now() >= due()) ocrClose(); else docIdle();
  }, Math.max(1000, due() - Date.now()));
}

// Vorladen und Live-Status (Design-Review KI vorladen 16.10.2026,
// docs/sicherheit/design-review-ki-vorladen.md): laedt = mit Fortschritt p (0-100)
// und Startzeit t0, fehler = mit festem Grund. Die Zugriffsstufe von storage.session
// bleibt unveraendert: kiStatus ist fuer Content Scripts unsichtbar (Auflage 4).
const KI_GRUENDE = ['paket', 'laden', 'start', 'zeit'];
const KI_PRELOAD_DELAY_MS = 3000;
let kiLoading = null;
async function kiStatus(cfg) {
  if (cfg && cfg.detection === 'regeln') return { state: 'aus', ep: null };
  const s = (await chrome.storage.session.get(KI_STATUS_KEY))[KI_STATUS_KEY] || {};
  const v = { state: ['laedt', 'bereit', 'fehler', 'inaktiv'].includes(s.state) ? s.state : 'inaktiv', ep: ['webgpu', 'wasm'].includes(s.ep) ? s.ep : null, fails: Number.isInteger(s.fails) ? s.fails : 0 };
  if (v.state === 'laedt') {
    v.p = Number.isInteger(s.p) && s.p >= 0 && s.p <= 100 ? s.p : 0;
    v.t0 = Number.isFinite(s.t0) ? s.t0 : 0;
    // Der Service Worker kann mitten im Laden beendet werden: Grenze gegen jetzt pruefen (Auflage 6).
    if (Date.now() - v.t0 > KI_LOAD_MS) {
      await kiSetStatus({ state: 'fehler', grund: 'zeit', fails: v.fails + 1 });
      return { state: 'fehler', ep: null, fails: v.fails + 1, grund: 'zeit' };
    }
  }
  if (v.state === 'fehler') v.grund = KI_GRUENDE.includes(s.grund) ? s.grund : 'laden';
  return v;
}
// Einziger Schreibweg: Objekt nur aus Enums und Zahlen neu zusammengesetzt (Auflage 4).
async function kiSetStatus(o) {
  const v = { state: ['laedt', 'bereit', 'fehler', 'inaktiv'].includes(o.state) ? o.state : 'inaktiv', ep: ['webgpu', 'wasm'].includes(o.ep) ? o.ep : null, fails: Number.isInteger(o.fails) ? o.fails : 0 };
  if (v.state === 'laedt') { v.p = Number.isInteger(o.p) && o.p >= 0 && o.p <= 100 ? o.p : 0; v.t0 = Number.isFinite(o.t0) ? o.t0 : Date.now(); }
  if (v.state === 'fehler') v.grund = KI_GRUENDE.includes(o.grund) ? o.grund : 'laden';
  await chrome.storage.session.set({ [KI_STATUS_KEY]: v });
}

// Modell im Hintergrund vorladen (Lade-Worker im Offscreen-Dokument, eigener Thread):
// nie bei ausgeschalteter Erkennung, nur aus "inaktiv" (oder ein vom beendeten Service
// Worker verwaistes "laedt" innert der Grenze), nach 2 Fehlern nie; ein Lauf zugleich (Auflage 5).
function kiPreload() {
  if (kiLoading) return kiLoading;
  const run = (async () => {
    const e = await effective();
    if (e.cfg.detection === 'regeln') return;
    const st = await kiStatus(e.cfg);
    if (st.fails >= 2 || (st.state !== 'inaktiv' && st.state !== 'laedt')) return;
    if (st.state === 'inaktiv') await kiSetStatus({ state: 'laedt', p: 0, t0: Date.now(), fails: st.fails });
    const left = st.state === 'laedt' ? Math.max(1000, KI_LOAD_MS - (Date.now() - st.t0)) : KI_LOAD_MS;
    let timer = null;
    const late = new Promise((r) => { timer = setTimeout(() => r({ error: 'zeit' }), left); });
    const res = await Promise.race([ocrDoc().then(() => chrome.runtime.sendMessage({ target: 'dlx-ki', t: 'load', gpu: kiGpu })).catch(() => ({ error: 'start' })), late]);
    clearTimeout(timer);
    kiLast = Date.now();
    if (res && res.ok === true) {
      kiReady = true;
      await kiSetStatus({ state: 'bereit', ep: res.ep, fails: st.fails });
    } else {
      kiReady = false;
      await chrome.runtime.sendMessage({ target: 'dlx-ki', t: 'stop' }).catch(() => {});
      await kiSetStatus({ state: 'fehler', grund: res && res.error, fails: st.fails + 1 });
    }
    docIdle();
  })();
  const mine = run.catch(() => {}).finally(() => { if (kiLoading === mine) kiLoading = null; });
  kiLoading = mine;
  return mine;
}
// Fortschritt nur vom eigenen Offscreen-Dokument (Absender prueft handle), nur waehrend
// "laedt", nur steigend und hoechstens alle 5 Prozent, vom Service Worker selbst geprueft (Auflage 3).
async function kiProgress(msg) {
  const p = msg.p;
  if (!Number.isInteger(p) || p < 0 || p > 100) return null;
  const st = await kiStatus(null);
  if (st.state !== 'laedt' || p < st.p + 5) return null;
  await kiSetStatus({ state: 'laedt', p, t0: st.t0, fails: st.fails });
  return { ok: true };
}

async function kiRun(text) {
  const st = await kiStatus(null);
  if (st.fails >= 2) return { error: 'off' };
  await ocrDoc();
  let timer = null;
  const ms = kiReady ? KI_RUN_MS : KI_LOAD_MS;
  const late = new Promise((r) => { timer = setTimeout(() => r({ error: 'timeout' }), ms); });
  const res = await Promise.race([chrome.runtime.sendMessage({ target: 'dlx-ki', t: 'run', text, gpu: kiGpu }).catch(() => ({ error: 'fail' })), late]);
  clearTimeout(timer);
  kiLast = Date.now();
  const ents = res && !res.error ? DLX.ki.valid(res, text.length) : null;
  if (!ents) {
    // Worker neu starten; diese Eingabe nur mit den Regeln (Auflage 14).
    kiReady = false;
    await chrome.runtime.sendMessage({ target: 'dlx-ki', t: 'stop' }).catch(() => {});
    await kiSetStatus({ state: 'fehler', grund: res && res.error === 'timeout' ? 'zeit' : 'laden', fails: st.fails + 1 });
    return { error: 'fail' };
  }
  if (!kiReady || st.state !== 'bereit') await kiSetStatus({ state: 'bereit', ep: res.ep, fails: st.fails });
  kiReady = true;
  return { ents, ep: ['webgpu', 'wasm'].includes(res.ep) ? res.ep : null };
}

async function handleKi(msg, sender) {
  if (typeof msg.text !== 'string' || !msg.text || msg.text.length > DLX.ki.MAX_TEXT) return { error: 'size' };
  if (!Number.isInteger(msg.seq)) return { error: 'fail' };
  const e = await effective();
  if (e.cfg.detection === 'regeln') return { error: 'off' };
  const tab = sender.tab.id;
  kiTab.set(tab, msg.seq);
  if (kiActive >= KI_QUEUE_MAX) return { error: 'busy' };
  kiActive++;
  try {
    const job = kiChain.then(() => (kiTab.get(tab) === msg.seq ? kiRun(msg.text) : { error: 'stale' }));
    kiChain = job.catch(() => {});
    const res = await job;
    return kiTab.get(tab) === msg.seq ? res : { error: 'stale' };
  } finally {
    kiActive--;
    docIdle();
  }
}

// --- Formularwache (Design-Review KI-Agenten 16.10.2026, Auflagen 7-13) ------------
// Absender: eigenes Content Script im Hauptframe einer konfigurierten UND erteilten https-Origin.
// Entscheid nur von der eigenen Fensterseite mit genau passender URL und einmaliger Nonce;
// Durchlass nur per tabs.sendMessage an denselben Tab, Frame 0 und dasselbe Dokument.
const FORM_MS = 120000;
const FORM_GAP_MS = 3000;
const FORM_PAGE = 'ui/formwache.html';
const HEX32 = /^[0-9a-f]{32}$/;
const formReq = new Map();    // Nonce -> { tab, doc, host, items, win, until }, nur im Speicher
const formLast = new Map();   // Tab -> letzte Meldung (Auflage 10)
async function fromForm(sender) {
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0 || typeof sender.documentId !== 'string' || sender.documentLifecycle !== 'active') return null;
  let u;
  try { u = new URL(sender.origin); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.port || !srcOriginOk('https://' + u.hostname + '/*')) return null;
  const cfg = (await effective()).cfg;
  if (!DLX.quellen.matches(cfg.formGuardSites || [], u.hostname)) return null;
  if (!(await chrome.permissions.contains({ origins: [sender.origin + '/*'] }))) return null;
  return { cfg, host: u.hostname };
}
function formTidy() {
  const now = Date.now();
  for (const [k, r] of formReq) if (r.until < now) { formReq.delete(k); if (r.win) chrome.windows.remove(r.win).catch(() => {}); }
}
async function formMsg(msg, sender) {
  const f = await fromForm(sender);
  if (!f) return null;
  if (msg.t === 'formCfg') {
    const cfg = Object.assign({}, f.cfg);
    for (const k of DLX.policy.AI_KEYS) delete cfg[k];
    delete cfg.sensitiveSources;
    delete cfg.formGuardSites;
    return { cfg };
  }
  if (Object.keys(msg).sort().join() !== 'items,t' || !Array.isArray(msg.items) || !msg.items.length || msg.items.length > 50) return null;
  const items = [];
  for (const i of msg.items) {
    if (!i || !KNOWN_IDS.has(i.id) || !KNOWN_CATS.has(i.cat) || !Number.isInteger(i.n) || i.n < 1 || i.n > 999) return null;
    items.push({ id: i.id, cat: i.cat, n: i.n });
  }
  formTidy();
  const tab = sender.tab.id, now = Date.now();
  // Hoechstens ein Fenster je Tab und eine Meldung je 3 s; weitere Absendeversuche bleiben gestoppt.
  if ([...formReq.values()].some((r) => r.tab === tab) || now - (formLast.get(tab) || 0) < FORM_GAP_MS) return { busy: true };
  formLast.set(tab, now);
  const n = nonce();
  const req = { tab, doc: sender.documentId, host: f.host, items, win: null, until: now + FORM_MS };
  formReq.set(n, req);
  const w = await chrome.windows.create({ url: chrome.runtime.getURL(FORM_PAGE + '?n=' + n), type: 'popup', width: 480, height: 440, focused: true }).catch(() => null);
  if (!w) { formReq.delete(n); return { busy: true }; }
  req.win = w.id;
  return { nonce: n };
}
async function formPage(msg, sender) {
  if (typeof msg.n !== 'string' || !HEX32.test(msg.n) || sender.url !== chrome.runtime.getURL(FORM_PAGE + '?n=' + msg.n)) return null;
  formTidy();
  const r = formReq.get(msg.n);
  if (!r) return null;
  const cfg = (await effective()).cfg;
  const allowOverride = cfg.allowUserOverride !== false;
  if (msg.t === 'formInfo') return { items: r.items, host: r.host, allowOverride, branding: cfg.branding, language: cfg.language };
  if (msg.t !== 'formDecide' || (msg.choice !== 'cancel' && msg.choice !== 'override')) return null;
  formReq.delete(msg.n);   // einmalig
  if (msg.choice === 'override' && allowOverride) {
    await chrome.tabs.sendMessage(r.tab, { t: 'formPass', n: msg.n }, { frameId: 0, documentId: r.doc }).catch(() => {});
  }
  if (r.win) chrome.windows.remove(r.win).catch(() => {});
  return { ok: true };
}
chrome.windows.onRemoved.addListener((id) => { for (const [k, r] of formReq) if (r.win === id) formReq.delete(k); });

async function handle(msg, sender) {
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return null;
  // Bildbytes nur vom eigenen Content Script im Top-Frame einer KI-Seite (fromContent);
  // jeder andere Absender wird ausdruecklich abgewiesen (Pflicht-Pruefung Bilder 14.10.2026).
  if ((msg.t === 'ocr' || msg.t === 'ki') && !fromContent(sender)) return { error: 'fail' };
  // Lade-Fortschritt nur vom eigenen Offscreen-Dokument, nie aus einem Tab (Auflagen 2, 3).
  if (msg.t === 'kiFortschritt') return fromExtPage(sender, '/' + OCR_DOC) && !sender.tab ? kiProgress(msg) : null;

  if (msg.t === 'aiSite') return aiSiteMsg(sender);
  if (msg.t === 'srcMark') return srcMark(msg, sender);
  if (msg.t === 'copyScan') return copyScan(msg, sender);
  if (msg.t === 'formCfg' || msg.t === 'formFound') return formMsg(msg, sender);
  if ((msg.t === 'formInfo' || msg.t === 'formDecide') && fromExtPage(sender, '/' + FORM_PAGE)) return formPage(msg, sender);
  if ((msg.t === 'aiBanner' || msg.t === 'aiClose') && fromExtPage(sender, '/ui/aibanner.html')) return handleAi(msg, sender);

  if (fromContent(sender)) {
    const tabId = sender.tab.id;
    if (msg.t === 'cfg') {
      const e = await effective();
      const ig = await loadIgnore(e.cfg, true);
      // KI-Seite gesperrt: Pruefung, Leiste und Dialog starten nicht (Auflage 10).
      const site = DLX.aisites.find(sender.origin, sender.url);
      const aiBlocked = !!site && DLX.policy.aiDecision(e.cfg, site.id) === 'block';
      // Listen und Modus bleiben im Service Worker (Auflage 7).
      // Neues Dokument: Kontoart wieder unbekannt, bis das Content Script sie meldet (Auflage 7).
      trainTab(sender, 'unknown').catch(() => {});
      for (const k of DLX.policy.AI_KEYS) delete e.cfg[k];
      delete e.cfg.sensitiveSources;
      delete e.cfg.formGuardSites;
      return { cfg: e.cfg, ignore: ig ? { key: ig.key, hashes: ig.entries.map((x) => x.h) } : null, aiBlocked };
    }
    if (msg.t === 'ignoreAdd') {
      // Nur einmal je Nonce einer soeben im Dialog getroffenen Entscheidung,
      // aus demselben Tab und Dokument (Auflage 6).
      const grants = (await chrome.storage.session.get(GRANTS_KEY))[GRANTS_KEY] || {};
      const g = typeof msg.nonce === 'string' && Object.hasOwn(grants, msg.nonce) ? grants[msg.nonce] : null;
      if (g) { delete grants[msg.nonce]; await chrome.storage.session.set({ [GRANTS_KEY]: grants }); }
      if (!g || g.tab !== tabId || g.doc !== (sender.documentId || null) || Date.now() > g.until) return { ok: false };
      const hashes = msg.hashes;
      if (!Array.isArray(hashes) || hashes.length > g.n || !hashes.every((h) => typeof h === 'string' && HEX64.test(h))) return { ok: false };
      const ig = await loadIgnore((await effective()).cfg, true);
      if (!ig) return { ok: false };
      const exp = Date.now() + IGNORE_MS;
      const entries = ig.entries.filter((x) => hashes.indexOf(x.h) === -1).concat(hashes.map((h) => ({ h, exp })));
      await chrome.storage.local.set({ [IGNORE_KEY]: { key: ig.key, entries: entries.slice(-IGNORE_MAX) } });
      return { ok: true };
    }
    // Merkmale vertraulicher Quellen nur an KI-Content-Scripts im Hauptframe (fromContent, Auflage 13).
    if (msg.t === 'srcMarks') return srcLoad();
    if (msg.t === 'status') {
      const active = msg.active === true;
      await chrome.action.setBadgeText({ tabId, text: active ? '' : '!' });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#b42318' });
      if (Object.hasOwn(msg, 'account')) await trainTab(sender, msg.account);
      return { ok: true };
    }
    if (msg.t === 'found') {
      const items = validItems(msg.items, msg.mode);
      if (!items || MODES.indexOf(msg.mode) === -1 || DLX.policy.ACTIONS.indexOf(msg.action) === -1) return null;
      const layout = LAYOUTS.includes(msg.layout) ? msg.layout : 'full';
      const theme = THEMES.includes(msg.theme) ? msg.theme : 'hell';
      if (SOFT.includes(msg.mode) && (layout !== 'bar' || !items.length)) return null;
      if (msg.mode === 'reveal' && !placeholdersAllowed((await effective()).cfg)) return null;
      if (msg.mode === 'answer' && (await effective()).cfg.answerCheck === 'off') return null;
      if (msg.mode === 'rephrased' && (await effective()).cfg.allowRephrase !== true) return null;
      const all = await loadPending();
      const prev = all[tabId];
      // Ein leiser Hinweis verdraengt nie eine offene Sende-/Einfuege-Meldung.
      if (SOFT.includes(msg.mode) && prev && !SOFT.includes(prev.mode) && Date.now() - prev.created <= PENDING_MAX_MS) return null;
      // Gebundenen Frame nur behalten, wenn das Content Script dieselbe Leiste erneuert
      // (renew); eine neu geladene Seite bindet ihren neuen Frame neu (Auflage 11).
      const keep = msg.mode === 'live' && msg.renew === true && prev && prev.mode === 'live' ? prev.frameId : null;
      const account = ACCOUNTS.includes(msg.account) ? msg.account : null;
      const p = { nonce: nonce(), created: Date.now(), mode: msg.mode, action: SOFT.includes(msg.mode) ? 'warn' : msg.action, layout, theme, items, code: msg.code === true && items.some((i) => i.lines), account, reason: msg.mode === 'imagefail' ? (IMAGE_FAILS.includes(msg.reason) ? msg.reason : 'fail') : msg.mode === 'answer' && msg.reason === 'copy' ? 'copy' : msg.mode === 'rephrased' && msg.reason === 'paste' ? 'paste' : null, site: SITE_ORIGINS[sender.origin], documentId: sender.documentId || null, frameId: keep, popupTabId: null, popupWindowId: null };
      // Erneuerter Live-Hinweis mit denselben Gruppen gilt als schon gesehen (kein Doppelzaehlen).
      if (msg.mode === 'live' && prev && prev.mode === 'live' && prev.kSeen && sameGroups(prev.items, items)) p.kSeen = true;
      all[tabId] = p;
      await savePending(all);
      if (keep != null) nudge();
      return { nonce: p.nonce };
    }
    if (msg.t === 'ocr') return handleOcr(msg);
    if (msg.t === 'ki') return handleKi(msg, sender);
    if (msg.t === 'moved') {
      nudge();
      return { ok: true };
    }
    if (msg.t === 'fallback') {
      const all = await loadPending();
      const p = all[tabId];
      if (!p || p.popupWindowId || SOFT.includes(p.mode)) return null;
      const w = await chrome.windows.create({ url: chrome.runtime.getURL('ui/dialog.html'), type: 'popup', width: 480, height: 600, focused: true });
      p.popupWindowId = w.id;
      p.popupTabId = w.tabs && w.tabs[0] ? w.tabs[0].id : null;
      await savePending(all);
      return { ok: true };
    }
    if (msg.t === 'cancelPending') {
      const all = await loadPending();
      const p = all[tabId];
      if (p) { delete all[tabId]; await savePending(all); if (!SOFT.includes(p.mode) && p.mode !== 'imagewait') await count(p, 'cancel'); await closePopup(p); }
      if (msg.views === true) await dropView(tabId);
      return { ok: true };
    }
    return null;
  }

  if (fromExtPage(sender, '/ui/view.html')) return handleView(msg, sender);

  if (fromExtPage(sender, '/ui/dialog.html')) {
    const r = await resolveTab(sender);
    if (!r) return { gone: true };
    // Nur eine Zahl, nur vom gebundenen Leisten-Frame (genau ui/dialog.html, gleiche
    // frameId und documentId, nie das Popup), Nonce setzt der Service Worker
    // (Design-Review Leiste/Hoehe 15.10.2026, Auflagen 1-4).
    if (msg.t === 'size') {
      const h = msg.h;
      if (sender.url !== OWN_ORIGIN + '/ui/dialog.html' || r.p.layout !== 'bar' || r.p.popupTabId === sender.tab.id
        || r.p.frameId !== sender.frameId || (r.p.frameDoc && r.p.frameDoc !== sender.documentId)) return null;
      if (typeof h !== 'number' || !Number.isInteger(h) || h < SIZE_MIN || h > SIZE_MAX || !sizeAllowed(r.p.nonce)) return null;
      chrome.tabs.sendMessage(r.aiTab, { t: 'dlgSize', nonce: r.p.nonce, h }, r.p.documentId ? { documentId: r.p.documentId } : { frameId: 0 }).catch(() => {});
      return { ok: true };
    }
    const e = await effective();
    if (msg.t === 'hello') {
      if (r.p.frameId == null && r.p.popupTabId !== sender.tab.id) { r.p.frameId = sender.frameId; r.p.frameDoc = sender.documentId || null; await savePending(r.all); }
      chrome.tabs.sendMessage(r.aiTab, { t: 'dlgReady', nonce: r.p.nonce }, { frameId: 0 }).catch(() => {});
      const kGroups = DLX.kompetenz.groupsOf(r.p.items);
      if (KSHOW.includes(r.p.mode) && !r.p.kSeen && kGroups.length && kompetenzOn(e.cfg)) {
        r.p.kSeen = true;
        await savePending(r.all);
        await kCount(e.cfg, kGroups, 'seen');
      }
      const layout = r.p.popupTabId === sender.tab.id ? 'full' : r.p.layout;
      const allowNotSensitive = (r.p.mode === 'send' || r.p.mode === 'paste') && r.p.action === 'warn' && ignoreAllowed(e.cfg) && ignorableCount(r.p) > 0;
      return { mode: r.p.mode, action: r.p.action, items: r.p.items, code: r.p.code === true, account: r.p.account || null, reason: r.p.reason || null, layout, theme: r.p.theme, allowOverride: e.cfg.allowUserOverride, allowNotSensitive,
        allowPlaceholders: placeholdersAllowed(e.cfg), allowRephrase: e.cfg.allowRephrase === true, branding: e.cfg.branding, language: e.cfg.language, managed: e.managed };
    }
    if (msg.t === 'decide') {
      const choice = String(msg.choice);
      if (!decisionAllowed(r.p, choice, msg.confirmed, e.cfg)) return { ok: false };
      delete r.all[r.aiTab];
      await savePending(r.all);
      if (choice === 'show') {
        // Ansicht nur aus dem Hinweis-Frame dieses Tabs (nicht aus dem Popup).
        if (r.p.popupTabId === sender.tab.id) return { ok: false };
        const v = { nonce: nonce(), created: Date.now(), doc: r.p.documentId, frameId: null, used: false };
        await saveViews(Object.assign(await loadViews(), { [r.aiTab]: v }));
        await chrome.tabs.sendMessage(r.aiTab, { t: 'decision', nonce: r.p.nonce, choice, view: v.nonce }, { frameId: 0 }).catch(() => {});
        return { ok: true };
      }
      if (choice === 'notsensitive') {
        const now = Date.now();
        const grants = (await chrome.storage.session.get(GRANTS_KEY))[GRANTS_KEY] || {};
        for (const [k, g] of Object.entries(grants)) if (!(g.until > now)) delete grants[k];
        grants[r.p.nonce] = { tab: r.aiTab, doc: r.p.documentId, n: ignorableCount(r.p), until: now + GRANT_MS };
        await chrome.storage.session.set({ [GRANTS_KEY]: grants });
      }
      await chrome.tabs.sendMessage(r.aiTab, { t: 'decision', nonce: r.p.nonce, choice }, { frameId: 0 }).catch(() => {});
      if (SOFT.includes(r.p.mode)) { if (choice === 'redact' || choice === 'pseudonym') { await count(r.p, choice); await kDecided(r.p, e.cfg, choice); } return { ok: true }; }
      // Umformulieren zaehlt in der Tagesstatistik als Schwaerzen (nur Anzahl je Art, Auflage 20).
      if (choice === 'rephrase') { await count(r.p, 'redact'); await kDecided(r.p, e.cfg, 'redact'); await closePopup(r.p); return { ok: true }; }
      const decision = choice === 'cancel' && r.p.action === 'block' ? (r.p.mode === 'send' || r.p.mode === 'paste' || r.p.mode === 'image' || r.p.mode === 'doc' || r.p.mode === 'voice' ? 'blocked' : r.p.mode === 'fileblock' || r.p.mode === 'imagefail' || r.p.mode === 'imagewait' ? 'file' : r.p.mode) : choice === 'ok' ? 'file' : choice;
      await count(r.p, decision);
      await kDecided(r.p, e.cfg, decision);
      await closePopup(r.p);
      return { ok: true };
    }
    return null;
  }

  // Kompetenz-Zahlen lesen: Popup nur die Monatssummen, Nachweis/Einstellungen
  // die Monatstabelle; zuruecksetzen nur aus den Einstellungen (Auflage 2).
  const kPage = ['/ui/nachweis.html', '/ui/popup.html', '/ui/options.html'].find((pg) => fromExtPage(sender, pg));
  if (msg.t === 'kompetenz' && kPage) {
    const e = await effective();
    const on = kompetenzOn(e.cfg);
    const s = await kTidy(); // aus: loescht und liefert null
    const months = DLX.kompetenz.lastMonths(new Date(), 12);
    if (kPage === '/ui/popup.html') return { on, month: months[0], totals: s ? DLX.kompetenz.totals(s, months[0]) : null };
    // hideSensitive: Richtlinie competenceHideSensitive sperrt im Nachweis das Einblenden von
    // Gesundheit, Personendaten und nationaler ID (Design-Review Kontext 14.10.2026, Auflage 5).
    return { on, locked: e.locked.competenceRecord === true, months, store: s || {}, branding: e.cfg.branding, language: e.cfg.language, managed: e.managed,
      hideSensitive: e.cfg.competenceHideSensitive === true };
  }
  // Nachweis-Bericht (Design-Review Bericht 16.10.2026, Auflage 8): nur an ui/bericht.html,
  // Antwort mit fester Schluesselliste; Zaehler nur als Summen, Richtlinien nur Name + Zustandswort.
  if (msg.t === 'bericht' && fromExtPage(sender, '/ui/bericht.html')) {
    const e = await effective();
    const on = e.cfg.complianceReport !== false;
    const s = await chrome.storage.local.get(STATS_KEY);
    const stats = on ? DLX.stats.prune(s[STATS_KEY] || {}, new Date()) : {};
    const sums = {};
    if (on) for (const d of DLX.bericht.DAYS) sums[d] = DLX.bericht.summarize(stats, new Date(), d);
    return { on, sums, frameworks: e.cfg.complianceFrameworks, days: e.cfg.complianceReportDays,
      lockedFrameworks: e.locked.complianceFrameworks === true, lockedDays: e.locked.complianceReportDays === true,
      policies: on ? DLX.bericht.policies(e.cfg, e.locked) : [], branding: e.cfg.branding, language: e.cfg.language };
  }
  // Erklaerseite: nur Branding und Sprache, keine Zahlen.
  if (msg.t === 'brand' && fromExtPage(sender, '/ui/wissen.html')) {
    const e = await effective();
    return { branding: e.cfg.branding, language: e.cfg.language };
  }
  if (msg.t === 'kompetenzReset') {
    if (kPage !== '/ui/options.html') return null;
    await kQueue(() => chrome.storage.local.remove(KOMP_KEY));
    return { ok: true };
  }

  // Popup: nur die Kontoart des aktiven Tabs (Enum oder null), nie eine Adresse (Auflage 3).
  if (msg.t === 'trainingTab' && fromExtPage(sender, '/ui/popup.html')) {
    if (!Number.isInteger(msg.tabId)) return { type: null };
    const tabs = await trainLoad();
    return { type: Object.hasOwn(tabs, String(msg.tabId)) ? tabs[msg.tabId] : null };
  }
  if (fromExtPage(sender, '/ui/popup.html') || fromExtPage(sender, '/ui/options.html')) {
    if (msg.t === 'state') {
      const e = await effective();
      const s = await chrome.storage.local.get(STATS_KEY);
      const ig = await loadIgnore(e.cfg, false);
      return { cfg: e.cfg, locked: e.locked, managed: e.managed, country: e.country, stats: DLX.stats.prune(s[STATS_KEY] || {}, new Date()),
        ignoreAllowed: ignoreAllowed(e.cfg), ignored: ig ? ig.entries.length : 0, ki: await kiStatus(e.cfg) };
    }
    // Live-Status fuer Popup/Einstellungen; offen = Modell laden, falls noch nicht geschehen (Auflagen 2, 5).
    if (msg.t === 'kiStatus') {
      const e = await effective();
      kiPreload();
      return kiStatus(e.cfg);
    }
    if (msg.t === 'save' && fromExtPage(sender, '/ui/options.html')) {
      // Nur Benutzerschluessel; gesperrte Werte setzt nur die Richtlinie (B14).
      const v = DLX.policy.validate(msg.settings, true).value;
      const userOnly = {};
      for (const k of DLX.policy.USER_KEYS) if (v[k] !== undefined) userOnly[k] = v[k];
      // Eigene Begriffe aendert nur die Nachricht userTerms; hier unveraendert lassen.
      const prev = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
      const keep = DLX.policy.validate({ userTerms: prev && prev.userTerms }, true).value.userTerms;
      if (keep) userOnly.userTerms = keep;
      // Lokale KI-Seiten-Werte haben keine Oberflaeche; beim Speichern behalten.
      const ai = DLX.policy.validate(prev, true).value;
      for (const k of DLX.policy.AI_KEYS) if (ai[k] !== undefined) userOnly[k] = ai[k];
      await chrome.storage.local.set({ [SETTINGS_KEY]: userOnly });
      await kTidy();
      return { ok: true };
    }
    // Eigene Begriffe nur aus der Einstellungsseite: { salt, hashes } oder null
    // = alle loeschen; Klartext kommt hier nie an (Auflagen 6-7).
    if (msg.t === 'userTerms' && sender.url === chrome.runtime.getURL('ui/options.html')) {
      const cur = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
      const next = Object.assign({}, DLX.policy.validate(cur, true).value);
      delete next.userTerms;
      if (msg.terms !== null) {
        const v = DLX.policy.validate({ userTerms: msg.terms }, true).value.userTerms;
        if (!v) return { ok: false };
        next.userTerms = v;
      }
      await chrome.storage.local.set({ [SETTINGS_KEY]: next });
      return { ok: true };
    }
    if (msg.t === 'ignoreReset' && sender.url === chrome.runtime.getURL('ui/options.html')) { // Auflage 7
      await chrome.storage.local.remove(IGNORE_KEY);
      return { ok: true };
    }
    if (msg.t === 'statsReset' && fromExtPage(sender, '/ui/options.html')) {
      await chrome.storage.local.remove(STATS_KEY);
      return { ok: true };
    }
  }
  return null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, () => sendResponse(null));
  return true;
});

// KI-Kompetenz: beim Start und bei jedem Wechsel von Richtlinie oder Einstellungen
// bereinigen bzw. loeschen, sobald der Schalter aus ist (Auflagen 4, 5).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'managed' || (area === 'local' && Object.hasOwn(changes, SETTINGS_KEY))) { kTidy().catch(() => {}); aiSync(); srcSync(); trainingSync(false); kiPreload(); }
});
// Lokale KI kurz nach dem Start vorladen, damit der erste Prompt nicht warten muss.
const kiLater = () => setTimeout(kiPreload, KI_PRELOAD_DELAY_MS);
chrome.runtime.onStartup.addListener(() => { kTidy().catch(() => {}); aiSync(); srcSync(); trainingSync(true); kiLater(); });
chrome.runtime.onInstalled.addListener(() => { kTidy().catch(() => {}); aiSync(); srcSync(); trainingSync(true); kiLater(); });
chrome.permissions.onAdded.addListener(() => { aiSync(); srcSync(); });
chrome.permissions.onRemoved.addListener(() => { aiSync(); srcSync(); });

// Tab geschlossen: offene Eintraege verwerfen (Auflage 11).
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const all = await loadPending();
  if (all[tabId]) { delete all[tabId]; await savePending(all); }
  await dropView(tabId);
  kiTab.delete(tabId);
  copyLast.delete(tabId);
  await trainEdit((tabs) => { delete tabs[tabId]; });
  const ai = await loadAi();
  for (const [n, g] of Object.entries(ai)) if (g.tab === tabId) delete ai[n];
  await saveAi(ai);
});

// Rueckfall-Popup geschlossen ohne Entscheidung -> Abbrechen.
chrome.windows.onRemoved.addListener(async (windowId) => {
  const all = await loadPending();
  for (const [aiTab, p] of Object.entries(all)) {
    if (p.popupWindowId === windowId) {
      delete all[aiTab];
      await savePending(all);
      await chrome.tabs.sendMessage(Number(aiTab), { t: 'decision', nonce: p.nonce, choice: 'cancel' }, { frameId: 0 }).catch(() => {});
      await count(p, 'cancel');
    }
  }
});
