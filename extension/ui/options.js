// Einstellungen mit Seitenmenue (Uebersicht, Erkennung, Seiten und Ausnahmen,
// Bilder und Dateien, Datenschutz, Ueber); Aenderungen werden sofort gespeichert.
// Per Richtlinie gesetzte Werte sind gesperrt (nur Anzeige, Auflage B14).
// Design-Review Einstellungen 16.10.2026 (docs/sicherheit/design-review-einstellungen-16-10.md).
(async function () {
  'use strict';
  const DLX = globalThis.DLX;
  const { h } = DLX.dom;

  // Darstellung (Auflage 4): ein localStorage-Schluessel, nur feste Werte, nur data-theme am Root.
  const THEMA_KEY = 'dlx.optionsThema';
  const THEMEN = ['system', 'hell', 'dunkel'];
  const thema = () => { const v = localStorage.getItem(THEMA_KEY); return THEMEN.includes(v) ? v : 'system'; };
  const dunkel = () => (thema() === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : thema() === 'dunkel');
  function setzeThema(v) {
    if (!THEMEN.includes(v)) v = 'system';
    if (v === 'system') { localStorage.removeItem(THEMA_KEY); document.documentElement.removeAttribute('data-theme'); }
    else { localStorage.setItem(THEMA_KEY, v); document.documentElement.setAttribute('data-theme', v); }
  }
  setzeThema(thema());

  const st = await chrome.runtime.sendMessage({ t: 'state' }).catch(() => null);
  // Ungueltige Antwort: nur "Status unbekannt", nie "Schutz aktiv" (Auflage 5, fail-closed).
  if (!st || typeof st.cfg !== 'object' || !st.cfg || typeof st.locked !== 'object' || !st.locked || !st.cfg.branding) {
    const l = DLX.i18n.resolveLang('auto', navigator.language);
    document.documentElement.lang = l;
    document.body.append(h('main', { class: 'dlx-opt-leer' }, h('section', { class: 'dlx-status-karte dlx-status-warn', 'data-k': 'status-schutz' },
      h('h2', null, DLX.i18n.t(l, 'protUnknown')), h('p', { class: 'dlx-muted' }, DLX.i18n.t(l, 'protUnknownNote')))));
    return;
  }
  const cfg = st.cfg;
  const locked = st.locked;
  const b = cfg.branding;
  const lang = DLX.i18n.resolveLang(cfg.language, navigator.language);
  const T = (k, v) => DLX.i18n.t(lang, k, Object.assign({ product: b.productName, company: b.companyName }, v || {}));
  document.documentElement.lang = lang;
  DLX.dom.applyBranding(b, dunkel());
  // Zwei-Klick-Loeschen: halb bestaetigt wird beim Bereichswechsel zurueckgesetzt (Auflage 8).
  const entschaerfen = [];
  const lockNote = (on) => (on ? h('span', { class: 'dlx-lock' }, '\u{1F512} ' + T('locked')) : null);
  let regions = null;
  try { regions = new Intl.DisplayNames([lang], { type: 'region' }); } catch (e) { /* Kuerzel bleiben */ }
  const region = (c) => (c === 'EU' || !regions ? c : regions.of(c) || c);
  const section = (title, note, ...body) => h('section', { class: 'dlx-abschnitt dlx-eintrag' }, h('h2', null, title), note ? h('p', { class: 'dlx-muted' }, note) : null, body);

  // Speichern bei jeder Aenderung; Status oben rechts.
  const saved = h('span', { class: 'dlx-opt-status', role: 'status' }, T('autoSaved'));
  async function save() {
    const rules = {};
    for (const [id, sel] of Object.entries(ruleSel)) if (!locked.rules[id]) rules[id] = sel.value;
    const settings = { rules };
    if (!locked.language) settings.language = langSel.value;
    if (!locked.countryMode) settings.countryMode = modeSel.value;
    if (!locked.countryPacks && modeSel.value === 'manual') settings.countryPacks = checked(countryBoxes);
    if (!locked.globalPacks) settings.globalPacks = checked(globalBoxes);
    if (!locked.competenceRecord) settings.competenceRecord = kompBox.checked;
    if (!locked.imageScan) settings.imageScan = imgBox.checked;
    if (!locked.hiddenInstructionScan) settings.hiddenInstructionScan = hidBox.checked;
    if (!locked.hiddenInstructionAction) settings.hiddenInstructionAction = hidAction.value;
    if (!locked.detection) settings.detection = kiBox.checked ? 'ki' : 'regeln';
    if (!locked.answerCheck) settings.answerCheck = answerBox.checked ? 'hint' : 'off';
    if (!locked.sensitiveSources) settings.sensitiveSources = srcList.slice();
    if (!locked.sensitiveSourceAction) settings.sensitiveSourceAction = srcAction.value;
    if (!locked.formGuardSites) settings.formGuardSites = formList.slice();
    if (!locked.copySidebarHint) settings.copySidebarHint = copyBox.checked;
    await chrome.runtime.sendMessage({ t: 'save', settings });
    saved.textContent = T('saved');
  }

  // 1. Allgemein
  const langSel = h('select', { disabled: !!locked.language, 'aria-label': T('optLanguage') },
    DLX.policy.LANGS.map((l) => h('option', { value: l, selected: cfg.language === l }, l === 'auto' ? T('langAuto') : l.toUpperCase())));
  langSel.addEventListener('change', async () => { await save(); location.reload(); });

  // 2. Was erkannt wird
  const checked = (boxes) => boxes.filter((x) => x.checked).map((x) => x.value);
  function chips(key, all, label) {
    const boxes = all.map((p) => h('input', { type: 'checkbox', value: p, checked: cfg[key].indexOf(p) !== -1, disabled: !!locked[key] }));
    boxes.forEach((x) => x.addEventListener('change', save));
    const group = h('div', { class: 'dlx-gruppe' }, h('h3', null, T(key === 'countryPacks' ? 'optCountry' : 'optGlobal'), ' ', lockNote(locked[key])),
      h('div', { class: 'dlx-chips' }, boxes.map((x) => h('label', { class: 'dlx-chip' }, x, label(x.value)))));
    return { boxes, group };
  }
  const globals = chips('globalPacks', DLX.policy.GLOBAL, (p) => T('pack_' + p));
  const countries = chips('countryPacks', DLX.policy.COUNTRY, region);
  const globalBoxes = globals.boxes, countryBoxes = countries.boxes;
  // Laenderpakete: automatisch (Zeitzone/Sprache) oder selbst gewaehlt; die
  // Richtlinien countryPacks und autoCountryPacks sperren die Wahl.
  const country = st.country;
  const managedCountry = country.mode === 'managed';
  const modeSel = h('select', { disabled: !!locked.countryMode, 'aria-label': T('optCountry') },
    ['auto', 'manual'].map((m) => h('option', { value: m, selected: country.mode === m }, T(m === 'auto' ? 'modeAuto' : 'modeManual'))));
  const autoInfo = h('p', { class: 'dlx-muted' }, T('countryAuto', { list: DLX.i18n.countryList(lang, country.countries, country.reasons) }));
  if (!managedCountry) countries.group.insertBefore(h('div', { class: 'dlx-feld' }, modeSel, lockNote(locked.countryMode), autoInfo), countries.group.children[1]);
  function syncMode() {
    if (managedCountry) return;
    const auto = modeSel.value === 'auto';
    autoInfo.hidden = !auto;
    for (const x of countryBoxes) {
      x.disabled = auto || !!locked.countryPacks;
      if (auto) x.checked = country.countries.indexOf(x.value) !== -1;
    }
  }
  modeSel.addEventListener('change', () => { syncMode(); showActive(); save(); });
  syncMode();

  // 3. Aktion je Datentyp
  const ruleSel = {};
  const groups = new Map();   // Paket -> Zeilen
  for (const id of DLX.engine.allDetectors().map((d) => d.id).concat('dictionary', 'custom_term')) {
    const isLocked = !!locked.rules[id];
    const sel = h('select', { disabled: isLocked, 'aria-label': DLX.i18n.typeName(lang, id) },
      DLX.policy.ACTIONS.map((a) => h('option', { value: a, selected: a === DLX.engine.actionFor(id, cfg) }, T('act_' + a))));
    sel.addEventListener('change', () => { save(); summarize(); });
    ruleSel[id] = sel;
    const d = DLX.engine.findDetector(id);
    const pack = d ? (DLX.policy.COUNTRY.includes(d.pack) ? region(d.pack) : T('pack_' + d.pack)) : T(id === 'custom_term' ? 'termGroup' : 'dictGroup');
    if (!groups.has(pack)) groups.set(pack, []);
    sel.dataset.pack = pack;
    groups.get(pack).push(h('tr', null, h('td', null, DLX.i18n.typeName(lang, id)), h('td', null, lockNote(isLocked), ' ', sel)));
  }
  // Reihenfolge wie die Chips oben: globale Pakete, lokale KI und Bilder, Laender, zuletzt Firmen- und eigene Begriffe.
  const order = DLX.policy.GLOBAL.map((p) => T('pack_' + p)).concat(T('pack_ki'), T('pack_bild'), DLX.policy.COUNTRY.map(region), T('dictGroup'), T('termGroup'));
  const sorted = Array.from(groups).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  // Alle Gruppen zu; die Marke zeigt den Stand ("5 Warnen", "3 Warnen · 2 Blockieren").
  const ruleGroups = sorted.map(([pack, rows]) => h('details', { class: 'dlx-gruppe-auf', 'data-pack': pack },
    h('summary', null, h('span', null, pack), h('span', { class: 'dlx-anzahl' }, String(rows.length))),
    h('table', { class: 'dlx-tabelle' }, rows)));
  function summarize() {
    for (const d of ruleGroups) {
      const n = {};
      for (const s of Object.values(ruleSel)) if (s.dataset.pack === d.getAttribute('data-pack')) n[s.value] = (n[s.value] || 0) + 1;
      d.querySelector('.dlx-anzahl').textContent = DLX.policy.ACTIONS.filter((a) => n[a]).map((a) => n[a] + ' ' + T('act_' + a)).join(' · ');
    }
  }
  summarize();
  // Nur Regeln aktiver Laenderpakete zeigen; die Chips schalten sie mit.
  const showActive = () => {
    const off = countryBoxes.filter((x) => !x.checked).map((x) => region(x.value));
    for (const d of ruleGroups) d.hidden = off.includes(d.getAttribute('data-pack'));
  };
  countryBoxes.forEach((x) => x.addEventListener('change', showActive));
  showActive();

  // 4. Statistik (nur Zahlen)
  const from30 = DLX.stats.day(new Date(Date.now() - 29 * 86400000));
  const perCat = {};
  for (const [k, sites] of Object.entries(st.stats)) {
    if (k < from30) continue;
    for (const cats of Object.values(sites)) for (const [cat, decs] of Object.entries(cats)) {
      const row = perCat[cat] || (perCat[cat] = {});
      for (const [dec, n] of Object.entries(decs)) row[dec] = (row[dec] || 0) + n;
    }
  }
  const nf = new Intl.NumberFormat(lang);
  const cats = Object.keys(perCat);
  const statBody = cats.length
    ? h('table', { class: 'dlx-tabelle' }, cats.map((c) => h('tr', null, h('td', null, T('cat_' + c)),
      h('td', { class: 'dlx-zahl' }, Object.entries(perCat[c]).map(([d, n]) => `${nf.format(n)} ${T('dec_' + d)}`).join(' · ')))))
    : h('p', null, T('none'));
  // Loeschen nur mit zweitem Klick innerhalb von 4 s.
  const reset = h('button', { type: 'button', class: 'dlx-knopf dlx-gross dlx-trotzdem' }, T('statsReset'));
  let armed = 0;
  reset.addEventListener('click', async () => {
    if (!armed || Date.now() - armed > 4000) { armed = Date.now(); reset.textContent = T('reallyReset'); reset.classList.add('dlx-armed'); return; }
    await chrome.runtime.sendMessage({ t: 'statsReset' });
    location.reload();
  });
  entschaerfen.push(() => { armed = 0; reset.textContent = T('statsReset'); reset.classList.remove('dlx-armed'); });

  // KI-Kompetenz-Nachweis (Design-Review 14.10.2026, Auflagen 2, 5): Schalter,
  // gesperrt per Richtlinie; Zuruecksetzen nur von hier, mit zweitem Klick.
  // Bilder pruefen (Design-Review Bilder 14.10.2026): Richtlinie sperrt den Schalter (Auflage 13).
  const kiBox = h('input', { type: 'checkbox', id: 'dlx-ki-an', checked: cfg.detection !== 'regeln', disabled: !!locked.detection });
  const imgBox = h('input', { type: 'checkbox', id: 'dlx-bild-an', checked: cfg.imageScan !== false, disabled: !!locked.imageScan });
  // Versteckte Anweisungen (Design-Review KI-Agenten 16.10.2026): Richtlinie sperrt beide Felder (Auflage 6).
  const hidBox = h('input', { type: 'checkbox', id: 'dlx-versteckt-an', checked: cfg.hiddenInstructionScan !== false, disabled: !!locked.hiddenInstructionScan });
  const hidAction = h('select', { disabled: !!locked.hiddenInstructionAction, 'aria-label': T('optHidden'), 'data-k': 'hidden-action' },
    DLX.policy.HIDDEN_ACTIONS.map((a) => h('option', { value: a, selected: cfg.hiddenInstructionAction === a }, T('hiddenAction_' + a))));
  imgBox.addEventListener('change', save);
  const kompBox = h('input', { type: 'checkbox', id: 'dlx-komp-an', checked: cfg.competenceRecord !== false, disabled: !!locked.competenceRecord });
  kompBox.addEventListener('change', async () => { await save(); location.reload(); });
  const kompReset = h('button', { type: 'button', class: 'dlx-knopf dlx-gross dlx-trotzdem', disabled: cfg.competenceRecord === false }, T('kompReset'));
  let kompArmed = 0;
  kompReset.addEventListener('click', async () => {
    if (!kompArmed || Date.now() - kompArmed > 4000) { kompArmed = Date.now(); kompReset.textContent = T('reallyReset'); kompReset.classList.add('dlx-armed'); return; }
    await chrome.runtime.sendMessage({ t: 'kompetenzReset' });
    location.reload();
  });
  entschaerfen.push(() => { kompArmed = 0; kompReset.textContent = T('kompReset'); kompReset.classList.remove('dlx-armed'); });
  const kompOpen = h('a', { class: 'dlx-knopf dlx-gross', href: chrome.runtime.getURL('ui/nachweis.html'), target: '_blank' }, T('kompOpenRec'));

  // KI-Seiten-Kontrolle (Design-Review KI-Seiten 14.10.2026, Auflage 6): Modus nur
  // anzeigen; Zugriff auf die Seiten der Liste nur auf Klick hier erbitten, nur
  // Origins aus extension/common/aisites.js, nie automatisch.
  const aiOrigins = Array.from(DLX.aisites.origins());
  const aiInfo = h('p', { class: 'dlx-muted', role: 'status' });
  const aiGrant = h('button', { type: 'button', class: 'dlx-knopf dlx-gross dlx-haupt', 'data-k': 'ai-grant' }, T('aiGrant'));
  async function aiMissing() {
    const have = new Set(((await chrome.permissions.getAll()).origins) || []);
    for (const cs of chrome.runtime.getManifest().content_scripts || []) for (const m of cs.matches || []) have.add(m);
    return aiOrigins.filter((o) => !have.has(o));
  }
  async function showAi() {
    const missing = await aiMissing();
    aiInfo.textContent = T('aiAccess', { n: nf.format(aiOrigins.length - missing.length), total: nf.format(aiOrigins.length) });
    aiGrant.hidden = !missing.length;
  }
  aiGrant.addEventListener('click', async (e) => {
    if (!e.isTrusted) return;
    try { await chrome.permissions.request({ origins: await aiMissing() }); } catch (err) { /* abgelehnt */ }
    showAi();
  });
  const aiOn = cfg.aiSiteMode === 'hint' || cfg.aiSiteMode === 'block';
  if (aiOn) showAi();

  // Hinweis beim Kopieren (Design-Review Kopierwarnung 16.10.2026, Auflagen 3, 11): Zugriff auf
  // https://*/* nur auf Klick mit erklaerendem Text vorher, nie automatisch, kein Draengen.
  const copyBox = h('input', { type: 'checkbox', id: 'dlx-kopier-an', checked: cfg.copySidebarHint !== false, disabled: !!locked.copySidebarHint });
  const copyInfo = h('p', { class: 'dlx-muted', role: 'status', 'data-k': 'copy-info' });
  const copyGrant = h('button', { type: 'button', class: 'dlx-knopf dlx-gross dlx-haupt', 'data-k': 'copy-grant' }, T('copyGrant'));
  async function showCopy() {
    const on = (((await chrome.permissions.getAll()).origins) || []).indexOf('https://*/*') !== -1;
    copyInfo.textContent = copyBox.checked ? T(on ? 'copyActive' : 'copyInactive') : '';
    copyGrant.hidden = !copyBox.checked || on;
  }
  copyBox.addEventListener('change', async () => { await save(); showCopy(); });
  copyGrant.addEventListener('click', async (e) => {
    if (!e.isTrusted) return;
    try { await chrome.permissions.request({ origins: ['https://*/*'] }); } catch (err) { /* abgelehnt */ }
    showCopy();
  });
  showCopy();

  // KI-Antworten pruefen (Design-Review Antwort/Zwischenablage 16.10.2026).
  const answerBox = h('input', { type: 'checkbox', checked: cfg.answerCheck !== 'off', disabled: !!locked.answerCheck });
  answerBox.addEventListener('change', save);

  // Vertrauliche Quellen: Hostmuster wie im Service Worker pruefen (common/quellen.js,
  // Auflage 6); Vorschlaege fuegen nur hinzu (Auflage 18); Zugriff nur auf Klick und
  // nur fuer genau die geprueften Origins der Liste, nie https://*/* (Auflage 7).
  // Eine verwaltete Liste ist gesperrt (Auflage 17).
  const srcList = (cfg.sensitiveSources || []).slice();
  const srcLocked = !!locked.sensitiveSources;
  const srcUl = h('ul', { class: 'dlx-quellen', 'data-k': 'src-list' });
  const srcInput = h('input', { type: 'text', class: 'dlx-quelle-feld', spellcheck: 'false', autocomplete: 'off', 'aria-label': T('sourcesInput'), placeholder: T('sourcesInput'), disabled: srcLocked });
  const srcAdd = h('button', { type: 'button', class: 'dlx-knopf dlx-gross', 'data-k': 'src-add', disabled: srcLocked }, T('sourcesAdd'));
  const srcMsg = h('p', { class: 'dlx-muted', role: 'status' });
  const srcInfo = h('p', { class: 'dlx-muted', role: 'status', 'data-k': 'src-info' });
  const srcGrant = h('button', { type: 'button', class: 'dlx-knopf dlx-gross dlx-haupt', 'data-k': 'src-grant' }, T('sourcesGrant'));
  const srcAction = h('select', { disabled: !!locked.sensitiveSourceAction, 'aria-label': T('optSources'), 'data-k': 'src-action' },
    DLX.policy.SOURCE_ACTIONS.map((a) => h('option', { value: a, selected: cfg.sensitiveSourceAction === a }, T('srcAction_' + a))));
  srcAction.addEventListener('change', save);
  async function srcMissing() {
    const have = new Set(((await chrome.permissions.getAll()).origins) || []);
    return DLX.quellen.originsOf(srcList).filter((o) => !have.has(o));
  }
  async function showSrc() {
    srcUl.replaceChildren(...(srcList.length ? srcList.map((p) => {
      const del = h('button', { type: 'button', class: 'dlx-knopf', disabled: srcLocked, 'data-k': 'src-del' }, T('sourceRemove'));
      del.addEventListener('click', async () => { const i = srcList.indexOf(p); if (i === -1) return; srcList.splice(i, 1); await save(); showSrc(); });
      return h('li', null, h('code', null, p), ' ', del);
    }) : [h('li', { class: 'dlx-muted' }, T('sourcesNone'))]));
    const missing = await srcMissing();
    const total = DLX.quellen.originsOf(srcList).length;
    srcInfo.textContent = total ? T('sourcesAccess', { n: nf.format(total - missing.length), total: nf.format(total) }) : '';
    srcGrant.hidden = !missing.length;
  }
  async function addSource(v) {
    const p = DLX.quellen.parse(v);
    if (!p) { srcMsg.textContent = T('sourcesInvalid'); return; }
    srcMsg.textContent = '';
    if (srcList.indexOf(p.pattern) === -1 && srcList.length < DLX.quellen.MAX_SOURCES) srcList.push(p.pattern);
    await save();
    showSrc();
  }
  srcAdd.addEventListener('click', () => { addSource(srcInput.value); srcInput.value = ''; });
  srcInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { addSource(srcInput.value); srcInput.value = ''; } });
  const srcSuggest = srcLocked ? null : h('p', { class: 'dlx-chips' }, T('sourcesSuggest'), ' ', DLX.quellen.SUGGESTIONS.map((x) => {
    const b2 = h('button', { type: 'button', class: 'dlx-knopf', 'data-k': 'src-suggest' }, x);
    b2.addEventListener('click', () => addSource(x));
    return b2;
  }));
  srcGrant.addEventListener('click', async (e) => {
    if (!e.isTrusted) return;
    const origins = await srcMissing();
    if (origins.length) try { await chrome.permissions.request({ origins }); } catch (err) { /* abgelehnt */ }
    showSrc();
  });
  showSrc();

  // Formularwache (Design-Review KI-Agenten 16.10.2026, Auflage 12): gleicher Parser wie die
  // Quellen, Zugriff nur auf Klick fuer genau die geprueften Origins; fehlender Zugriff wird genannt.
  const formList = (cfg.formGuardSites || []).slice();
  const formLocked = !!locked.formGuardSites;
  const formUl = h('ul', { class: 'dlx-quellen', 'data-k': 'form-list' });
  const formInput = h('input', { type: 'text', class: 'dlx-quelle-feld', spellcheck: 'false', autocomplete: 'off', 'aria-label': T('formsInput'), placeholder: T('formsInput'), disabled: formLocked });
  const formAdd = h('button', { type: 'button', class: 'dlx-knopf dlx-gross', 'data-k': 'form-add', disabled: formLocked }, T('formsAdd'));
  const formMsg = h('p', { class: 'dlx-muted', role: 'status' });
  const formInfo = h('p', { class: 'dlx-muted', role: 'status', 'data-k': 'form-info' });
  const formGrant = h('button', { type: 'button', class: 'dlx-knopf dlx-gross dlx-haupt', 'data-k': 'form-grant' }, T('formsGrant'));
  async function formMissing() {
    const have = new Set(((await chrome.permissions.getAll()).origins) || []);
    return DLX.quellen.originsOf(formList).filter((o) => !have.has(o));
  }
  async function showForms() {
    formUl.replaceChildren(...(formList.length ? formList.map((p) => {
      const del = h('button', { type: 'button', class: 'dlx-knopf', disabled: formLocked, 'data-k': 'form-del' }, T('sourceRemove'));
      del.addEventListener('click', async () => { const i = formList.indexOf(p); if (i === -1) return; formList.splice(i, 1); await save(); showForms(); });
      return h('li', null, h('code', null, p), ' ', del);
    }) : [h('li', { class: 'dlx-muted' }, T('formsNone'))]));
    const missing = await formMissing();
    const total = DLX.quellen.originsOf(formList).length;
    formInfo.textContent = total ? T('formsAccess', { n: nf.format(total - missing.length), total: nf.format(total) }) + (missing.length ? ' ' + T('formsMissing') : '') : '';
    formGrant.hidden = !missing.length;
  }
  async function addForm(v) {
    const p = DLX.quellen.parse(v);
    if (!p) { formMsg.textContent = T('sourcesInvalid'); return; }
    formMsg.textContent = '';
    if (formList.indexOf(p.pattern) === -1 && formList.length < DLX.policy.MAX_FORM_SITES) formList.push(p.pattern);
    await save();
    showForms();
  }
  formAdd.addEventListener('click', () => { addForm(formInput.value); formInput.value = ''; });
  formInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { addForm(formInput.value); formInput.value = ''; } });
  formGrant.addEventListener('click', async (e) => {
    if (!e.isTrusted) return;
    const origins = await formMissing();
    if (origins.length) try { await chrome.permissions.request({ origins }); } catch (err) { /* abgelehnt */ }
    showForms();
  });
  showForms();

  // 5. Eigene Begriffe (Design-Review 14.10.2026, Auflagen 6-7, 9): Klartext nur in
  // diesem Feld, gehasht hier in der Seite; an den Service Worker gehen nur Salz
  // und Pruefsummen. Abgewiesenes nur mit Zeilennummer, nie mit Text.
  let own = cfg.userTerms;
  const hex = (bytes) => Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
  const termsBox = h('textarea', { class: 'dlx-begriffe', rows: '4', spellcheck: 'false', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off',
    'aria-label': T('termsInput'), placeholder: T('termsInput') });
  const termsInfo = h('p', { class: 'dlx-muted', role: 'status' });
  const addTerms = h('button', { type: 'button', class: 'dlx-knopf dlx-gross' }, T('termsAdd'));
  const delTerms = h('button', { type: 'button', class: 'dlx-knopf dlx-gross dlx-trotzdem' }, T('termsDelete'));
  function showTerms(extra) {
    const org = cfg.customTerms ? T('termsOrg', { n: nf.format(cfg.customTerms.hashes.length) }) : '';
    termsInfo.textContent = [T('termsCount', { n: nf.format(own ? own.hashes.length : 0) }), org].concat(extra || []).filter(Boolean).join(' ');
    delTerms.disabled = !own;
  }
  addTerms.addEventListener('click', async () => {
    const salt = own ? own.salt : hex(crypto.getRandomValues(new Uint8Array(32)));
    const hashes = new Set(own ? own.hashes : []);
    const bad = [];
    let added = 0, full = false;
    termsBox.value.split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return;
      const p = DLX.dictionary.prepareTerm(line);
      if (p.error) { bad.push(i + 1); return; }
      const x = DLX.dictionary.termHash(salt, p.term);
      if (hashes.has(x)) return;
      if (hashes.size >= DLX.policy.MAX_USER_TERMS) { full = true; return; }
      hashes.add(x);
      added++;
    });
    termsBox.value = '';
    if (added) {
      const next = { salt, hashes: Array.from(hashes) };
      const r = await chrome.runtime.sendMessage({ t: 'userTerms', terms: next });
      if (r && r.ok) own = next; else added = 0;
    }
    showTerms([T('termsAdded', { n: nf.format(added) }), bad.length ? T('termsRejected', { lines: bad.join(', ') }) : '',
      full ? T('termsFull', { n: nf.format(DLX.policy.MAX_USER_TERMS) }) : '']);
  });
  let termsArmed = 0;
  delTerms.addEventListener('click', async () => {
    if (!termsArmed || Date.now() - termsArmed > 4000) { termsArmed = Date.now(); delTerms.textContent = T('termsReallyDelete'); delTerms.classList.add('dlx-armed'); return; }
    const r = await chrome.runtime.sendMessage({ t: 'userTerms', terms: null });
    if (r && r.ok) own = null;
    termsArmed = 0; delTerms.textContent = T('termsDelete'); delTerms.classList.remove('dlx-armed');
    showTerms();
  });
  entschaerfen.push(() => { termsArmed = 0; delTerms.textContent = T('termsDelete'); delTerms.classList.remove('dlx-armed'); });
  showTerms();

  // Liste "Kein sensibler Wert": nur die Anzahl, nie Werte oder Pruefsummen.
  let ignored;
  if (!st.ignoreAllowed) ignored = section(T('ignoredTitle'), T('ignoredOff'));
  else {
    const del = h('button', { type: 'button', class: 'dlx-knopf dlx-gross dlx-trotzdem', disabled: !st.ignored }, T('ignoredReset'));
    del.addEventListener('click', async () => { await chrome.runtime.sendMessage({ t: 'ignoreReset' }); location.reload(); });
    ignored = section(T('ignoredTitle'), T('ignoredCount', { n: String(st.ignored) }), h('div', { class: 'dlx-aktionen' }, del));
  }

  // Darstellung: System, Hell oder Dunkel (nur diese Seite, Auflage 4).
  const themaSel = h('select', { 'aria-label': T('optTheme'), 'data-k': 'thema' },
    THEMEN.map((v) => h('option', { value: v, selected: thema() === v }, T('theme_' + v))));
  themaSel.addEventListener('change', () => { setzeThema(themaSel.value); location.reload(); });

  // Statuskarte (Auflage 5): nur feste Schluessel; unbekannter KI-Zustand -> "unbekannt".
  // Live: Laden mit Fortschritt, Fehler mit festem Grund (Design-Review KI vorladen 16.10.2026).
  const KI_ZUSTAENDE = ['bereit', 'laedt', 'inaktiv', 'fehler', 'aus'];
  const KI_GRUENDE = ['paket', 'laden', 'start', 'zeit'];
  const kiSicht = (raw) => {
    const ki = raw && typeof raw === 'object' ? raw : {};
    const kiZ = KI_ZUSTAENDE.includes(ki.state) ? ki.state : 'unbekannt';
    let text = kiZ === 'unbekannt' ? T('kiUnbekannt') : T({ bereit: 'kiBereit', laedt: 'kiLaedt', fehler: 'kiFehler', aus: 'kiAus', inaktiv: 'kiInaktiv' }[kiZ],
      { ep: ki.ep === 'webgpu' ? 'WebGPU' : 'WASM', p: Number.isInteger(ki.p) && ki.p >= 0 && ki.p <= 100 ? ki.p : 0 });
    if (kiZ === 'fehler' && KI_GRUENDE.includes(ki.grund)) text += ' (' + T('kiGrund_' + ki.grund) + ')';
    return { z: kiZ, text, tun: kiZ === 'bereit' ? null : (kiZ === 'aus' && locked.detection) ? T('locked') : T('kiDo_' + kiZ) };
  };
  const kiStart = kiSicht(st.ki);
  const c = st.country;
  const cKey = c.mode === 'managed' ? 'countryOrg' : c.mode === 'manual' ? 'countryManual' : 'countryAuto';
  const cList = DLX.i18n.countryList(lang, c.mode === 'auto' ? c.countries : cfg.countryPacks, c.mode === 'auto' ? c.reasons : null);
  let funde = 0;
  for (const decs of Object.values(perCat)) for (const n of Object.values(decs)) funde += n;
  const zuErkennung = h('button', { type: 'button', class: 'dlx-pfeil', 'data-k': 'zu-erkennung' }, T('goDetect'));
  zuErkennung.addEventListener('click', () => zeige('erkennung'));
  const karte = (cls, k, ico, titel, ...body) => h('div', { class: 'dlx-status-karte ' + cls, 'data-k': k },
    h('div', { class: 'dlx-status-kopf' }, h('span', { class: 'dlx-status-icon' }, DLX.dom.icon(ico)), h('h3', null, titel)), body);
  const neueKiKarte = (v) => karte(v.z === 'bereit' ? 'dlx-status-ok' : v.z === 'inaktiv' || v.z === 'laedt' ? 'dlx-status-neutral' : 'dlx-status-warn', 'status-ki', v.z === 'bereit' ? 'check' : 'alert',
    T('kiStatus', { state: v.text }), h('p', { class: 'dlx-muted' }, T('kiWhy_' + v.z)),
    v.tun ? h('p', { class: 'dlx-status-tun' }, h('b', null, T('kiDoLabel')), ' ', v.tun) : null,
    v.z === 'aus' && !locked.detection ? zuErkennung : null);
  let kiKarte = neueKiKarte(kiStart);
  const status = h('section', { class: 'dlx-abschnitt dlx-eintrag dlx-statusblock' }, h('h2', null, T('statusTitle')),
    h('div', { class: 'dlx-status-raster' },
      karte('dlx-status-ok', 'status-schutz', 'check', T('protOk'), h('p', { class: 'dlx-muted' }, T('protOkNote'))),
      kiKarte,
      karte('dlx-status-neutral', 'status-funde', 'gear', T('found30'), h('p', { class: 'dlx-gross-zahl' }, nf.format(funde)),
        h('p', { class: 'dlx-muted', id: 'dlx-country' }, T('optCountry') + ': ' + T(cKey, { list: cList })))));

  const kiZeile = h('p', { class: 'dlx-muted', 'data-k': 'ki-zustand' }, T('kiStatus', { state: kiStart.text }));
  // Live-Status per Abfrage beim eigenen Service Worker (kein Speicherzugriff auf dieser
  // Seite), sekuendlich solange geladen wird, hoechstens 2 Minuten.
  async function kiFolgen(zeige) {
    for (let i = 0; i < 120; i++) {
      const ki = await chrome.runtime.sendMessage({ t: 'kiStatus' }).catch(() => null);
      if (!ki || typeof ki !== 'object') return;
      zeige(ki);
      if (ki.state !== 'laedt' && ki.state !== 'inaktiv') return;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  kiFolgen((raw) => {
    const v = kiSicht(raw);
    kiZeile.textContent = T('kiStatus', { state: v.text });
    const neu = neueKiKarte(v);
    kiKarte.replaceWith(neu);
    kiKarte = neu;
  });

  // Bereiche des Seitenmenues. Navigation ohne Hash: die Adresse der Seite bleibt exakt
  // options.html, weil der Service Worker userTerms und ignoreReset nur von genau dieser
  // Adresse annimmt; zeige() nimmt nur Werte aus der festen Liste (Auflage 1).
  const BEREICHE = [
    ['uebersicht', 'navOverview', [
      status,
      st.managed ? h('p', { class: 'dlx-verwaltet dlx-eintrag' }, b.companyName ? T('managed') : T('managedNoName')) : null,
      section(T('secGeneral'), T('secGeneralNote'),
        h('div', { class: 'dlx-feld' }, h('span', { class: 'dlx-feld-name' }, T('optLanguage')), langSel, lockNote(locked.language)),
        h('div', { class: 'dlx-feld' }, h('span', { class: 'dlx-feld-name' }, T('optTheme')), themaSel))]],
    ['erkennung', 'navDetect', [
      section(T('optKi'), T('optKiNote'), h('div', { class: 'dlx-feld' }, h('label', null, kiBox, ' ', T('kiOn')), lockNote(locked.detection)),
        kiZeile),
      section(T('secDetect'), T('secDetectNote'), globals.group, countries.group),
      section(T('optRules'), null, h('ul', { class: 'dlx-erklaerung' }, T('secRulesNote').split(/(?<=\.)\s+/).map((line) => {
        const i = line.indexOf(':');
        return h('li', null, i > 0 ? h('b', null, line.slice(0, i)) : null, i > 0 ? line.slice(i) : line);
      })), ...ruleGroups),
      section(T('secTerms'), T('secTermsNote'), termsBox, h('div', { class: 'dlx-aktionen' }, addTerms, delTerms), termsInfo),
      section(T('optAnswer'), T('optAnswerNote'), h('div', { class: 'dlx-feld' }, h('label', null, answerBox, ' ', T('answerOn')), lockNote(locked.answerCheck)))]],
    ['seiten', 'navSites', [
      aiOn ? section(T('optAi'), T('aiMissing'), h('div', { class: 'dlx-feld' }, h('span', { 'data-k': 'ai-mode' }, T('aiMode_' + cfg.aiSiteMode)), lockNote(locked.aiSiteMode)),
        aiInfo, h('div', { class: 'dlx-aktionen' }, aiGrant)) : null,
      section(T('optSources'), T('optSourcesNote'), h('div', { class: 'dlx-feld' }, srcAction, lockNote(locked.sensitiveSourceAction)),
        lockNote(srcLocked), srcUl, srcLocked ? null : h('div', { class: 'dlx-aktionen' }, srcInput, srcAdd), srcSuggest, srcMsg,
        srcInfo, h('p', { class: 'dlx-muted' }, T('sourcesMissing')), h('div', { class: 'dlx-aktionen' }, srcGrant)),
      section(T('optForms'), T('optFormsNote'), lockNote(formLocked), formUl, formLocked ? null : h('div', { class: 'dlx-aktionen' }, formInput, formAdd), formMsg,
        formInfo, h('div', { class: 'dlx-aktionen' }, formGrant)),
      section(T('optCopy'), T('optCopyNote'), h('div', { class: 'dlx-feld' }, h('label', null, copyBox, ' ', T('copyOn')), lockNote(locked.copySidebarHint)),
        copyInfo, h('div', { class: 'dlx-aktionen' }, copyGrant)),
      section(T('notCovered'), T('notCoveredText')),
      ignored]],
    ['dateien', 'navFiles', [
      section(T('optImage'), T('optImageNote'), h('div', { class: 'dlx-feld' }, h('label', null, imgBox, ' ', T('imageOn')), lockNote(locked.imageScan))),
      section(T('optHidden'), T('optHiddenNote'), h('div', { class: 'dlx-feld' }, h('label', null, hidBox, ' ', T('hiddenOn')), lockNote(locked.hiddenInstructionScan)),
        h('div', { class: 'dlx-feld' }, hidAction, lockNote(locked.hiddenInstructionAction)))]],
    ['datenschutz', 'navPrivacy', [
      section(T('privTitle'), T('privNote')),
      section(T('stats'), T('statsNote'), h('h3', { class: 'dlx-unter' }, T('statsShown')), statBody, h('div', { class: 'dlx-aktionen' },
        cfg.complianceReport !== false ? h('a', { class: 'dlx-knopf dlx-gross', id: 'dlx-bericht-link', href: chrome.runtime.getURL('ui/bericht.html'), target: '_blank' }, T('reportOpen')) : null, reset)),
      section(T('optKomp'), T('optKompNote'), h('div', { class: 'dlx-feld' }, h('label', null, kompBox, ' ', T('kompOn')), lockNote(locked.competenceRecord)),
        h('div', { class: 'dlx-aktionen' }, cfg.competenceRecord !== false ? kompOpen : null, kompReset))]],
    ['ueber', 'navAbout', [
      h('section', { class: 'dlx-abschnitt dlx-eintrag dlx-ueber' }, h('div', { class: 'dlx-ueber-marke' }, DLX.dom.mark(b, 72), h('div', { class: 'dlx-product dlx-gross-name' }, DLX.dom.wordmark(b))),
        h('p', { class: 'dlx-muted', 'data-k': 'version' }, T('aboutVersion', { v: chrome.runtime.getManifest().version })),
        h('p', null, T('aboutLocal')),
        st.managed ? h('p', { class: 'dlx-muted' }, b.companyName ? T('managed') : T('managedNoName')) : null)]]];
  const IDS = BEREICHE.map((x) => x[0]);

  const panels = new Map();
  const links = new Map();
  const main = h('main', { class: 'dlx-opt-inhalt' });
  for (const [id, key, body] of BEREICHE) {
    const p = h('div', { class: 'dlx-bereich', id: 'bereich-' + id, 'data-bereich': id },
      h('h1', null, T(key)), h('p', { class: 'dlx-muted dlx-bereich-text' }, T(key + 'Note')), body);
    panels.set(id, p);
    main.append(p);
    const a = h('button', { type: 'button', class: 'dlx-nav-link', 'data-k': 'nav-' + id }, T(key));
    a.addEventListener('click', () => zeige(id));
    links.set(id, a);
  }
  const keine = h('p', { class: 'dlx-muted dlx-keine-treffer', role: 'status', hidden: true }, T('searchNone'));
  main.append(keine);

  // Suche (Auflagen 2, 3): nur textContent klein + includes; blendet nur ein und aus,
  // die Eingabe wird nirgends gespeichert; Sperren (disabled) bleiben unberuehrt.
  const such = h('input', { type: 'search', class: 'dlx-suche', maxlength: '100', spellcheck: 'false', autocomplete: 'off',
    'aria-label': T('searchLabel'), placeholder: T('searchLabel'), 'data-k': 'suche' });
  let aktuell = 'uebersicht';
  const eintraege = (p) => Array.from(p.querySelectorAll('.dlx-eintrag'));
  function suche() {
    const q = such.value.slice(0, 100).trim().toLowerCase();
    if (!q) { for (const p of panels.values()) for (const e of eintraege(p)) e.hidden = false; keine.hidden = true; zeige(aktuell, true); return; }
    let treffer = 0;
    for (const p of panels.values()) {
      let n = 0;
      for (const e of eintraege(p)) { e.hidden = !e.textContent.toLowerCase().includes(q); if (!e.hidden) n++; }
      p.hidden = !n;
      treffer += n;
    }
    for (const a of links.values()) a.removeAttribute('aria-current');
    keine.hidden = treffer > 0;
  }
  such.addEventListener('input', suche);
  such.addEventListener('keydown', (e) => { if (e.key === 'Escape') { such.value = ''; suche(); } });

  function zeige(id, ausSuche) {
    if (!IDS.includes(id)) id = 'uebersicht';
    aktuell = id;
    for (const f of entschaerfen) f();
    if (!ausSuche && such.value) { such.value = ''; for (const p of panels.values()) for (const e of eintraege(p)) e.hidden = false; keine.hidden = true; }
    for (const [k, p] of panels) p.hidden = k !== id;
    for (const [k, a] of links) { if (k === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
    if (!ausSuche) window.scrollTo(0, 0);
  }

  const nav = h('nav', { class: 'dlx-opt-nav', 'aria-label': T('settings') }, such, h('ul', null, IDS.map((id) => h('li', null, links.get(id)))));
  document.title = b.productName + ' – ' + T('settings');
  document.body.append(h('header', { class: 'dlx-opt-kopf' }, h('div', null, DLX.dom.brand(b, T('settings')), saved)),
    h('div', { class: 'dlx-opt-rahmen' }, nav, main));
  zeige('uebersicht');
})();
