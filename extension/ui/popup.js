// Popup (schlank, 17.10.2026: möglichst wenig drauf): Kopf mit Marke und
// Zahnrad zu den Einstellungen, eine Status-Karte mit den Zaehlern (heute / 30 Tage) und die
// Training-Ampel nur, wenn im Tab eine KI-Seite erkannt ist. Alles Weitere (Laenderpakete,
// Kompetenz-Nachweis, Bericht, Kopierhinweis, Abdeckung) steht in den Einstellungen.
// Status der aktuellen Seite aus dem Badge ("!" = Eingabefeld nicht erkannt), ohne zusaetzliche
// Rechte. Training-Ampel der aktiven KI-Seite (activeTab, Design-Review Training-Ampel 16.10.2026);
// gewaehlt wird nur auf Wunsch im eigenen Auswahlfeld ui/auswahl.js; KI-Status live, sichtbar nur
// beim Laden und im Rueckfall (Design-Review KI vorladen 16.10.2026, KI Auflage 19).
(async function () {
  'use strict';
  const DLX = globalThis.DLX;
  const { h } = DLX.dom;
  const st = await chrome.runtime.sendMessage({ t: 'state' });
  const b = st.cfg.branding;
  const lang = DLX.i18n.resolveLang(st.cfg.language, navigator.language);
  const T = (k, v) => DLX.i18n.t(lang, k, Object.assign({ product: b.productName, company: b.companyName }, v || {}));
  document.documentElement.lang = lang;
  DLX.dom.applyBranding(b, matchMedia('(prefers-color-scheme: dark)').matches);

  // Aktiver Tab genau einmal abfragen; von der Adresse bleibt nur die erkannte
  // Seiten-ID (Origin + Pfad gegen die Liste), nie gespeichert oder gesendet (Auflage 3).
  async function activeTab() {
    try {
      const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!t) return { id: undefined, site: null };
      let site = null;
      try {
        const u = new URL(t.url);
        const x = DLX.aisites.find(u.origin, u.origin + u.pathname);
        site = x ? x.id : null;
      } catch (e) { site = null; }
      return { id: t.id, site };
    } catch (e) { return { id: undefined, site: null }; }
  }
  const tab = await activeTab();
  let off = false;
  try {
    if (tab.id !== undefined) off = (await chrome.action.getBadgeText({ tabId: tab.id })) === '!';
  } catch (e) { /* ohne Tab-Bezug: allgemeiner Status */ }
  // Nicht freigegebene grosse KI-Seite im aktiven Tab: Status ehrlich als Warnung statt "Geschuetzt".
  const excluded = ['chatgpt', 'claude', 'gemini', 'copilot', 'm365copilot'].filter((s) => st.cfg.allowedSites.indexOf(s) === -1);
  const blocked = !!tab.site && excluded.includes(tab.site);
  const warn = off || blocked;

  const today = DLX.stats.day(new Date());
  const from30 = DLX.stats.day(new Date(Date.now() - 29 * 86400000));
  const nf = new Intl.NumberFormat(lang);
  function counter(key, totals) {
    const sum = Object.values(totals).reduce((a, n) => a + n, 0);
    return h('div', { class: 'dlx-zaehler-feld' }, h('span', { class: 'dlx-zaehler-wert' }, nf.format(sum)), h('span', { class: 'dlx-zaehler-name' }, T(key)));
  }

  // Lokale KI: Status ohne Text, Rueckfall sichtbar (Design-Review KI 16.10.2026, Auflage 19).
  // Live, nur ueber die Positivliste; im Popup nur beim Laden und im Rueckfall eingeblendet.
  const KI_GRUENDE = ['paket', 'laden', 'start', 'zeit'];
  function kiZeile(raw) {
    const ki = raw && typeof raw === 'object' ? raw : {};
    const state = ki.state;
    const kiKey = { bereit: 'kiBereit', laedt: 'kiLaedt', fehler: 'kiFehler', aus: 'kiAus' }[state] || 'kiInaktiv';
    let text = T(kiKey, { ep: ki.ep === 'webgpu' ? 'WebGPU' : 'WASM', p: Number.isInteger(ki.p) && ki.p >= 0 && ki.p <= 100 ? ki.p : 0 });
    if (state === 'fehler' && KI_GRUENDE.includes(ki.grund)) text += ' (' + T('kiGrund_' + ki.grund) + ')';
    return T('kiStatus', { state: text });
  }
  const kiP = h('p', { class: 'dlx-status-ki', id: 'dlx-ki-status', role: 'status' });
  function kiZeige(ki) {
    const state = ki && typeof ki === 'object' ? ki.state : undefined;
    kiP.textContent = kiZeile(ki);
    kiP.hidden = state === 'bereit' || state === 'aus';
    kiP.classList.toggle('dlx-ki-fehler', state === 'fehler');
  }
  kiZeige(st.ki);

  const status = h('section', { class: 'dlx-status' + (warn ? ' dlx-aus' : '') },
    h('div', { class: 'dlx-status-zeile' },
      h('span', { class: 'dlx-status-symbol' }, DLX.dom.icon(warn ? 'alert' : 'check')),
      h('div', null, h('p', { class: 'dlx-status-titel' }, off ? T('statusOff') : blocked ? T('excluded', { list: DLX.aisites.byId(tab.site).name }) : T('statusOn')),
        h('p', { class: 'dlx-status-text' }, off ? T('statusOffSub') : T('statusOnSub')))),
    kiP,
    h('div', { class: 'dlx-zaehler' }, counter('foundToday', DLX.stats.totals(st.stats, today)), counter('found30', DLX.stats.totals(st.stats, from30))));
  const main = h('main', null, status);

  // KI-Seiten-Kontrolle: fehlender Zugriff nur als kurzer Hinweis; erbeten wird er in den Einstellungen.
  if (st.cfg.aiSiteMode === 'hint' || st.cfg.aiSiteMode === 'block') {
    const have = new Set(((await chrome.permissions.getAll()).origins) || []);
    for (const cs of chrome.runtime.getManifest().content_scripts || []) for (const m of cs.matches || []) have.add(m);
    if (DLX.aisites.origins().some((o) => !have.has(o))) {
      const go = h('button', { type: 'button', class: 'dlx-popup-hinweis', id: 'dlx-ki' }, DLX.dom.icon('alert'), h('span', null, T('popAiMissing')));
      go.addEventListener('click', () => chrome.runtime.openOptionsPage());
      main.append(go);
    }
  }
  // Training-Ampel (Auflagen 3, 10, 11): Ampel der erkannten KI-Seite, sonst nur ein leiser Knopf.
  if (st.cfg.trainingAmpel !== false) {
    let reported = null;
    if (tab.site && tab.id !== undefined) reported = ((await chrome.runtime.sendMessage({ t: 'trainingTab', tabId: tab.id }).catch(() => null)) || {}).type || null;
    main.append(trainingSection(tab.site, DLX.training.typeFor(st.cfg, tab.site, reported)));
  }
  // Verwaltet: eine kurze Zeile, der volle Satz (keine Speicherung, kein Netz) als Tooltip.
  if (st.managed || b.supportUrl) {
    main.append(h('p', { class: 'dlx-popup-fuss' },
      st.managed ? h('span', { class: 'dlx-verwaltet-kurz', title: b.companyName ? T('managed') : T('managedNoName') }, b.companyName ? T('popManaged') : T('popManagedNoName')) : null,
      st.managed && b.supportUrl ? ' · ' : null,
      b.supportUrl ? h('a', { href: b.supportUrl, target: '_blank' }, T('support')) : null));
  }

  const opt = h('button', { type: 'button', class: 'dlx-knopf dlx-zu', id: 'dlx-einstellungen', 'aria-label': T('settings'), title: T('settings') }, DLX.dom.icon('gear'));
  opt.addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.body.append(h('header', { class: 'dlx-popup-kopf' }, DLX.dom.brand(b, b.companyName || ''), opt), main);

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
  kiFolgen(kiZeige);

  // Link nur aus DLX.training.ampel (bereits per safeLink geprueft: https, Host aus der
  // Liste); href als Eigenschaft, Text nur als Textknoten (Auflage 10). Geoeffnet wird
  // nur per chrome.tabs.create (Auflage Pflicht-Pruefung 16.10.2026).
  function link(url, text, cls) {
    const a = h('a', { target: '_blank', class: cls || null });
    a.href = url;
    a.textContent = text;
    a.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url }).catch(() => {}); });
    return a;
  }
  function trainingSection(siteId, type) {
    const box = h('section', { class: 'dlx-training', id: 'dlx-training' });
    const items = DLX.training.LIST.map((x) => { const s = DLX.aisites.byId(x.id) || { name: x.id, kategorie: '' }; return { value: x.id, name: s.name, kat: s.kategorie }; })
      .sort((p, q) => p.name.localeCompare(q.name, lang));
    const view = h('div', { class: 'dlx-training-inhalt' });
    function show(id, typ, auto) {
      const a = DLX.training.ampel(id, typ, Date.now());
      const s = DLX.aisites.byId(id);
      if (!a || !s) { view.replaceChildren(); return; }
      box.classList.remove('dlx-training-leer');
      const df = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(a.stand + 'T00:00:00Z'));
      // Punktfarbe aus derselben Quelle wie das Symbol (common/signet.js), per CSSOM (CSP ohne Inline-Stil).
      const dot = h('span', { class: 'dlx-ampel', 'data-farbe': a.farbe, 'aria-hidden': 'true' });
      dot.style.backgroundColor = 'rgb(' + DLX.signet.DOTS[a.farbe].join(' ') + ')';
      // Nur Farbe, Aussage und Opt-out (Quelle, Stand und Details nicht im Popup);
      // "laut Herstellerangabe, Stand …, ohne Gewaehr" (Auflage 11) bleibt als Tooltip am Text.
      view.replaceChildren(...[
        h('div', { class: 'dlx-training-kopf' }, h('span', { class: 'dlx-training-label' }, T('trainHead')),
          auto ? h('span', { class: 'dlx-pill dlx-erkannt', id: 'dlx-training-auto' }, T('trainAuto')) : null),
        h('p', { class: 'dlx-training-titel' }, dot, s.name),
        h('p', { class: 'dlx-training-text', title: T('trainNote', { date: df }) }, T('train_' + a.farbe, { site: s.name })),
        a.optOut ? link(a.optOut, T('trainOptOut'), 'dlx-knopf dlx-training-optout') : null,
      ].filter(Boolean));
    }
    const pick = DLX.auswahl.auswahl({ id: 'dlx-training-wahl', label: T('trainPickNone'), placeholder: T('trainPickNone'), items,
      onChange: (id) => show(id, DLX.training.typeFor(st.cfg, id, null), false) });
    // Erkannte Seite: Ampel sofort, Auswahl nur auf Wunsch hinter "Andere KI-Seite pruefen";
    // ohne Erkennung nur ein leiser Knopf, der das Auswahlfeld oeffnet.
    const known = !!(siteId && DLX.training.byId(siteId));
    const other = h('button', { type: 'button', class: 'dlx-knopf-leise', id: known ? 'dlx-training-andere' : 'dlx-training-keine' }, known ? T('trainPick') : T('popTrainCheck'));
    other.addEventListener('click', () => { other.replaceWith(pick.el); pick.oeffne(); });
    if (siteId && DLX.training.byId(siteId)) {
      show(siteId, type, true);
      box.append(view, other);
    } else {
      box.classList.add('dlx-training-leer');
      box.append(other, view);
    }
    return box;
  }
})();
