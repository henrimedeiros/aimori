// Meldung (erweiterungseigene Herkunft): als schmale Leiste oberhalb des
// Eingabefelds, als Vollbild-Dialog (Rueckfall) oder im Rueckfall-Popup.
// Kennt nur Datentyp-IDs und Anzahlen, nie die Werte. Entscheidungen gehen
// an den Service Worker, der sie prueft (Auflage B3, Design-Review 14.10.2026).
(async function () {
  'use strict';
  const DLX = globalThis.DLX;
  const { h } = DLX.dom;
  const inPopup = window.top === window;
  const ARM_MIN_MS = 400, ARM_MAX_MS = 4000, VISIBLE_MS = 400, LOCK_MS = 400, FIRST_SEEN_MS = 2000;

  const hello = () => chrome.runtime.sendMessage({ t: 'hello' }).catch(() => null);
  let info = await hello();
  if (!info || info.gone) {
    if (inPopup) window.close();
    return;
  }
  await DLX.i18n.ready(info.language, navigator.language);

  let lockedUntil = 0;          // nach dem Nachfuehren 400 ms keine Klicks (Auflage 9)
  let done = false;
  const vis = { since: 0, ever: false, supported: false };

  async function decide(choice, confirmed) {
    if (done) return;
    done = true;
    for (const btn of document.querySelectorAll('button')) btn.disabled = true;
    await chrome.runtime.sendMessage({ t: 'decide', choice, confirmed: confirmed === true }).catch(() => null);
    if (inPopup) window.close();
  }
  const locked = () => performance.now() < lockedUntil;

  // Sichtbarkeit (IntersectionObserver v2, Auflage 7): "Trotzdem" nur, wenn die
  // Meldung seit >= 400 ms unverdeckt sichtbar ist; Verlust nach erstem Sehen
  // = Abbrechen (Senden/Einfuegen) bzw. Ausblenden (Live-Hinweis).
  const visibleLongEnough = () => vis.supported && vis.since > 0 && performance.now() - vis.since >= VISIBLE_MS;
  // Leise Hinweise (Tippen, Platzhalter, KI-Antwort): nur Ausblenden.
  const soft = (m) => m === 'live' || m === 'reveal' || m === 'answer' || m === 'rephrased';
  function lost() {
    if (document.hidden || done) return;
    if (info.mode === 'send' || info.mode === 'paste') decide('cancel');
    else if (soft(info.mode)) decide('hide');
  }
  // Nur das aktuell angezeigte Element zaehlt: vor jedem Neuzeichnen alten
  // Beobachter und Zeitgeber beenden (Pflicht-Pruefung 14.10.2026).
  let io = null, seenTimer = null, watched = null;
  function watchVisibility(target) {
    if (io) io.disconnect();
    clearTimeout(seenTimer);
    watched = target;
    try {
      io = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (en.target !== watched || typeof en.isVisible !== 'boolean') continue;
          vis.supported = true;
          if (en.isVisible) { if (!vis.since) vis.since = performance.now(); vis.ever = true; } else { vis.since = 0; if (vis.ever) lost(); }
        }
      }, { trackVisibility: true, delay: 100, threshold: [0, 1] });
      io.observe(target);
    } catch (e) { io = null; return; }  // ohne v2: kein "Trotzdem", Schwaerzen/Bearbeiten bleiben
    if (!inPopup) seenTimer = setTimeout(() => { if (watched === target && vis.supported && !vis.ever) lost(); }, FIRST_SEEN_MS);
  }

  // "Trotzdem": zwei echte Klicks auf denselben Knopf, 400 ms bis 4 s Abstand,
  // Breite fest (Knopf verschiebt sich nicht), Tastenwiederholung zaehlt nicht (Auflage 5).
  // Gleiche Bestaetigung fuer "Kein sensibler Wert" (wirkt 30 Tage auf allen Seiten, Fehlalarme Auflage 9).
  function armOverride(btn, labelArmed, choice) {
    const label = btn.textContent;
    let armedAt = 0, timer = null;
    const reset = () => { armedAt = 0; btn.textContent = label; btn.classList.remove('dlx-armed'); };
    btn.addEventListener('keydown', (e) => { if (e.repeat) e.preventDefault(); });
    btn.addEventListener('click', (e) => {
      if (!e.isTrusted || e.target !== btn || locked() || !visibleLongEnough()) return;
      const now = performance.now();
      if (!armedAt) { armedAt = now; btn.textContent = labelArmed; btn.classList.add('dlx-armed'); timer = setTimeout(reset, ARM_MAX_MS); return; }
      if (now - armedAt < ARM_MIN_MS) return;
      clearTimeout(timer);
      decide(choice || 'override', true);
    });
    // Feste Breite fuer beide Beschriftungen; versteckt (hinter "Weitere Optionen") erst beim Aufklappen.
    const measure = () => {
      const w1 = btn.getBoundingClientRect().width;
      // Nie im scharfen Zustand messen: das wuerde die Rueckfrage-Beschriftung ueberschreiben.
      if (!w1 || armedAt) return;
      btn.textContent = labelArmed;
      const w2 = btn.getBoundingClientRect().width;
      btn.textContent = label;
      btn.style.width = Math.ceil(Math.max(w1, w2)) + 'px';
    };
    measures.push(measure);
    // Zuklappen entschaerft: Zustand, Zeitgeber und Beschriftung laufen nie auseinander (Security-Pruefung 17.10.2026).
    disarms.push(() => { clearTimeout(timer); reset(); });
    requestAnimationFrame(measure);
  }
  let measures = [];
  let disarms = [];
  let extraOpen = false;

  function button(label, cls, onClick, k) {
    const b = h('button', { type: 'button', class: cls || 'dlx-knopf', 'data-k': k }, label);
    b.addEventListener('click', (e) => { if (e.isTrusted && !locked()) onClick(); });
    return b;
  }

  function render() {
    const b = info.branding;
    const lang = DLX.i18n.resolveLang(info.language, navigator.language);
    const T = (k, v) => DLX.i18n.t(lang, k, Object.assign({ product: b.productName, company: b.companyName }, v || {}));
    const bar = info.layout === 'bar' && !inPopup;
    const root = document.documentElement;
    root.lang = lang;
    if (!inPopup && (info.theme === 'hell' || info.theme === 'dunkel')) root.setAttribute('data-theme', info.theme);
    const dark = root.getAttribute('data-theme') === 'dunkel' || (!root.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    DLX.dom.applyBranding(b, dark);
    document.body.className = bar ? 'dlx-frame dlx-bar-seite' : 'dlx-frame dlx-voll-seite';

    // Ganztext-Funde (nicht pruefbar, vertrauliche Quelle) lassen sich nicht schwaerzen.
    const real = info.items.filter((i) => i.id !== 'unscannable' && i.id !== 'clipboard_source' && i.id !== 'hidden_instruction' && i.id !== 'document_match');
    const input = info.mode === 'send' || info.mode === 'paste';
    // Bilder (Design-Review Bilder 14.10.2026): Fund, Pruefung laeuft, nicht pruefbar.
    const img = info.mode === 'image';
    const imgAny = img || info.mode === 'imagewait' || info.mode === 'imagefail';
    // Textdokument mit Hinweis auf versteckte Anweisungen: nur Abbrechen/Trotzdem (Design-Review KI-Agenten).
    const doc = info.mode === 'doc';
    // Sprachmodus (Design-Review Diktat und Fingerabdruecke 16.10.2026): nur Abbrechen/Trotzdem.
    const voice = info.mode === 'voice';
    const block = (input || img || doc) && info.action === 'block';
    // Dokument: Bereinigte Version hochladen nur, wenn content.js eine gepruefte Fassung hat (Design-Review Bereinigen 19.10.2026).
    const docFix = doc && info.fix === true;
    const canRedact = (input || img || info.mode === 'live' || docFix) && real.length > 0 && (info.action === 'warn' || info.action === 'redact');
    const canOverride = (input || img || doc || voice || info.mode === 'imagefail') && info.action === 'warn' && info.allowOverride === true;
    const paste = info.mode === 'paste';

    // Knoepfe (schlank, 17.10.2026): sichtbar nur Hauptaktion, Bearbeiten/Verwerfen,
    // Rueckgaengig und Ausblenden; Platzhalter, Umformulieren, "Trotzdem", "Kein sensibler Wert"
    // und "Mehr erfahren" hinter "Weitere Optionen" (drei Punkte). "Trotzdem" bleibt abgesetzt
    // und braucht weiter zwei echte Klicks bei bestaetigter Sichtbarkeit.
    const actions = [];
    const extra = [];
    measures = [];
    disarms = [];
    let primary = null;
    if (canRedact) {
      primary = button(docFix ? T('redactDoc') : img ? T('redactImage') : info.mode === 'live' ? T('redact') : paste ? T('redactPaste') : T('redact'), 'dlx-knopf dlx-haupt', () => decide('redact'), 'redact');
      actions.push(primary);
      // Platzhalter [TYP_n] statt Schwaerzen; echte Werte nur in der Ansicht (Richtlinie allowPlaceholders).
      if (info.allowPlaceholders === true && !img && !doc) extra.push(button(T('placeholder'), 'dlx-knopf', () => decide('pseudonym'), 'pseudonym'));
      // Sicher umformulieren (Design-Review Tabellen/Verschleierung/Umformen 16.10.2026): nur Senden/Einfuegen.
      if (info.allowRephrase === true && input) extra.push(button(T('rephrase'), 'dlx-knopf', () => decide('rephrase'), 'rephrase'));
    }
    // Nach dem Umformulieren: Rueckgaengig nur beim Senden (beim Einfuegen nie das Original, Auflage 16).
    if (info.mode === 'rephrased' && info.reason !== 'paste') actions.push(button(T('undo'), 'dlx-knopf', () => decide('undo'), 'undo'));
    if (info.mode === 'reveal' && info.allowPlaceholders === true) actions.push(primary = button(T('showReal'), 'dlx-knopf dlx-haupt', () => decide('show'), 'show'));
    if (input) actions.push(button(paste ? T('discard') : T('edit'), 'dlx-knopf', () => decide('cancel'), 'cancel'));
    else if (imgAny || doc) actions.push(button(T('cancel'), primary ? 'dlx-knopf' : 'dlx-knopf dlx-haupt', () => decide('cancel'), 'cancel'));
    else if (info.mode === 'fileinfo') actions.push(primary = button(T('ok'), 'dlx-knopf dlx-haupt', () => decide('ok'), 'ok'));
    else if (!soft(info.mode)) actions.push(primary = button(T('ok'), 'dlx-knopf dlx-haupt', () => decide('cancel'), 'cancel'));
    if (canOverride) {
      const o = h('button', { type: 'button', class: 'dlx-knopf dlx-trotzdem', 'data-k': 'override' }, voice ? T('voiceAnyway') : doc ? T('uploadAnyway') : imgAny ? T('pasteImageAnyway') : paste ? T('pasteAnyway') : T('sendAnyway'));
      armOverride(o, voice ? T('reallyVoice') : doc ? T('reallyUpload') : imgAny ? T('reallyPasteImage') : paste ? T('reallyPaste') : T('reallySend'));
      extra.push(o);
    }
    if (input && info.allowNotSensitive === true) {
      const ns = h('button', { type: 'button', class: 'dlx-knopf dlx-trotzdem', 'data-k': 'notsensitive', title: T('confirmNotSensitive') }, T('notSensitive'));
      armOverride(ns, T('reallyNotSensitive'), 'notsensitive');
      extra.push(ns);
    }
    const moreSlot = actions.length;
    if (soft(info.mode)) {
      const x = h('button', { type: 'button', class: 'dlx-knopf dlx-zu', 'data-k': 'hide', 'aria-label': T('hide'), title: T('hide') }, DLX.dom.icon('close'));
      x.addEventListener('click', (e) => { if (e.isTrusted && !locked()) decide('hide'); });
      actions.push(x);
    }

    // Typen: in der Leiste Kurzname ohne Klammerzusatz ("2× IBAN"), hoechstens zwei, dann "+n".
    // Live-Hinweis: unsichere Funde nur dezent ("moeglicherweise"), sie halten das Senden nie an.
    const sureItems = info.mode === 'live' ? info.items.filter((it) => it.sure !== false) : info.items;
    const maybeItems = info.mode === 'live' ? info.items.filter((it) => it.sure === false) : [];
    const quiet = info.mode === 'live' && !sureItems.length;
    const shownOf = (list) => {
      const names = list.map((it) => {
        const name = DLX.i18n.typeName(lang, it.id);
        // Eingefuegter Code: Zeilennummern (nur Zahlen, vom Service Worker geprueft).
        const where = Array.isArray(it.lines) && it.lines.length ? ' (' + T('lineWord') + ' ' + it.lines.join(', ') + ')' : '';
        return (it.n > 1 ? it.n + '× ' : '') + (bar ? name.replace(/\s*\([^)]*\)$/, '') : name) + where;
      });
      return bar && names.length > 2 ? names.slice(0, 2).join(', ') + ' +' + (names.length - 2) : names.join(', ');
    };
    const part = (key, list) => {
      const [pre, post] = T(key).split('{types}');
      return [pre, h('mark', { class: 'dlx-fund' }, shownOf(list)), post];
    };
    // Warum heikel (ein fester Satz je Datentyp-Gruppe) und "Mehr erfahren" auf die
    // lokale Seite ui/wissen.html; der Link ist keine Entscheidung und sendet nichts.
    // Typeigener Satz (z. B. why_internal_link) vor dem Gruppensatz; "Mehr erfahren" fuehrt immer zur Gruppe.
    const hasWhy = (cat) => DLX.i18n.has('en', 'why_' + cat);
    const whyCats = [], learnCats = [];
    if (input || img || info.mode === 'live') for (const it of sureItems) {
      const k = hasWhy(it.id) ? it.id : it.cat;
      if (it.id !== 'unscannable' && hasWhy(k) && !whyCats.includes(k)) { whyCats.push(k); learnCats.push(it.cat); }
    }
    const learn = (cat) => h('a', { class: 'dlx-mehr', href: chrome.runtime.getURL('ui/wissen.html#' + cat), target: '_blank', 'data-k': 'learn' }, T('learnMore'));
    // Zusatzoptionen: eigene Zeile, erst nach Klick auf "Weitere Optionen" sichtbar; beim Aufklappen
    // 400 ms keine Klicks (nichts rueckt unbemerkt unter den Zeiger, Auflage 9), dann Breiten messen.
    const options = (learnCat) => {
      if (learnCat) extra.push(learn(learnCat));
      if (!extra.length) return null;
      const box = h('div', { class: 'dlx-optionen', id: 'dlx-optionen' }, extra);
      box.hidden = !extraOpen;
      const more = h('button', { type: 'button', class: 'dlx-knopf dlx-optionen-knopf', 'data-k': 'more', 'aria-label': T('moreOptions'), title: T('moreOptions'), 'aria-controls': 'dlx-optionen', 'aria-expanded': String(extraOpen) }, DLX.dom.icon('more'));
      more.addEventListener('click', (e) => {
        if (!e.isTrusted || locked()) return;
        extraOpen = !extraOpen;
        box.hidden = !extraOpen;
        more.setAttribute('aria-expanded', String(extraOpen));
        lockedUntil = performance.now() + LOCK_MS;
        if (extraOpen) for (const m of measures) m();
        else for (const d of disarms) d();
        fit();
      });
      actions.splice(moreSlot, 0, more);
      return box;
    };
    const detected = () => {
      if (info.mode === 'reveal') return part('revealAsk', info.items);
      // KI-Antwort: nur Typname und Anzahl; nach dem Kopieren eigener Satz.
      if (info.mode === 'answer') return part(info.reason === 'copy' ? 'answerCopy' : 'answerAsk', info.items);
      if (info.mode !== 'live') return part('detected', info.items);
      const out = sureItems.length ? part('liveAsk', sureItems) : [];
      if (maybeItems.length) out.push(sureItems.length ? ' · ' : '', ...part('liveMaybe', maybeItems));
      return out;
    };

    // Kontoart (nur Enum vom Service Worker, nie ein Workspace-Name), wenn fuer die
    // Seite Regeln je Konto gelten (Design-Review Konto-Regeln 14.10.2026).
    const account = ['business', 'personal', 'unknown'].includes(info.account)
      ? h('span', { class: 'dlx-konto', 'data-k': 'account', 'data-konto': info.account }, T('account_' + info.account)) : null;

    document.body.replaceChildren();
    if (bar) {
      const lead = { send: block ? 'blockSend' : 'stopSend', paste: block ? 'blockPaste' : 'stopPaste', image: block ? 'blockImage' : 'stopImage', doc: block ? 'blockDoc' : 'stopDoc' }[info.mode];
      const fail = ['size', 'type', 'timeout', 'count', 'busy'].includes(info.reason) ? info.reason : 'fail';
      const text = { fileinfo: 'barFileInfo', fileblock: 'barFileBlock', site: 'barSite', inactive: 'barInactive', imagewait: 'barImageWait', imagefail: 'barImageFail_' + fail, voice: info.action === 'block' ? 'barVoiceBlock' : 'barVoiceWarn', rephrased: 'barRephrased' }[info.mode];
      // Bereinigen: "nach erkannten Datentypen", bei PDF "Layout geht verloren" (Restrisiko Review).
      const fixNote = docFix ? T(info.loss ? 'docFixLoss' : 'docFix') : '';
      const why = !text && whyCats.length ? T('why_' + whyCats[0]) : fixNote;
      const opts = options(why ? learnCats[0] : null);
      // Kern (Anlass + Typen) bleibt immer ganz lesbar; gekuerzt wird nur der Erklaersatz, passt der Kern
      // nicht, bricht die Leiste um (fit misst den Ueberlauf).
      const msg = h('p', { class: 'dlx-bar-text', title: why || null },
        h('span', { class: 'dlx-bar-kern' }, lead ? h('span', { class: 'dlx-bar-lead' }, T(lead) + ': ') : null, text ? T(text) : detected()),
        why ? h('span', { class: 'dlx-bar-warum' }, ' – ' + why) : null);
      // Signet und Produktname (Branding, umbenennbar) gut sichtbar in der Leiste.
      const mark = DLX.dom.mark(b, 28);
      const brandName = h('span', { class: 'dlx-bar-marke' }, DLX.dom.wordmark(b));
      // Eine Zeile, sonst zwei und mehr (fit misst): oben Marke + Text, darunter die
      // Knoepfe, "Mehr erfahren" immer ganz rechts.
      const el = h('div', { class: 'dlx-bar' + (quiet ? ' dlx-leise' : ''), role: input || img || doc || voice || info.mode === 'imagefail' ? 'alertdialog' : 'status', 'aria-label': DLX.dom.productName(b) },
        mark, brandName, account, msg, h('span', { class: 'dlx-umbruch' }), h('div', { class: 'dlx-bar-aktionen' }, actions, opts));
      document.body.append(el);
      barEl = el;
      fit();
      watchVisibility(el);
    } else {
      const intro = { send: 'introSend', paste: 'introPaste', fileinfo: 'introFileInfo', fileblock: 'introFileBlock', inactive: 'introInactive', site: 'introSite', live: 'introSend', image: 'introImage', imagewait: 'introImageWait', imagefail: 'introImageFail', doc: info.items.some((it) => it.id === 'hidden_instruction') ? 'introDoc' : info.items.some((it) => it.id === 'document_match') ? 'introDocMatch' : info.items.some((it) => it.id !== 'mass_list' && it.id !== 'unscannable') ? 'introDocData' : 'introDocTable', voice: 'introVoice' }[info.mode];
      const card = h('main', { class: 'dlx-karte', role: 'alertdialog', 'aria-label': b.productName },
        DLX.dom.brand(b, b.companyName || ''),
        input || img || doc ? h('h1', null, T('title')) : null,
        account ? h('p', null, account) : null,
        h('p', { class: 'dlx-intro' }, T(intro)));
      if (info.items.length) {
        card.append(h('ul', { class: 'dlx-liste' }, info.items.map((it) =>
          h('li', null, h('span', null, h('mark', { class: 'dlx-fund' }, DLX.i18n.typeName(lang, it.id)), h('span', { class: 'dlx-kat' }, T('cat_' + it.cat)),
            Array.isArray(it.lines) && it.lines.length ? h('span', { class: 'dlx-zeile', 'data-k': 'lines' }, T('lineWord') + ' ' + it.lines.join(', ')) : null),
            h('strong', { class: 'dlx-zahl' }, '× ' + it.n)))));
      }
      if (info.code) card.append(h('p', { class: 'dlx-code' }, T('codeNote')));
      if (docFix) card.append(h('p', { class: 'dlx-warum', 'data-k': 'fixnote' }, T(info.loss ? 'docFixLoss' : 'docFix')));
      for (const cat of whyCats) card.append(h('p', { class: 'dlx-warum' }, T('why_' + cat)));
      if (block) card.append(h('p', { class: 'dlx-sperre' }, T('blockNote')));
      // Knopfzeile bleibt unten sichtbar (sticky), Zusatzoptionen darin als eigene Zeile.
      const opts = options(whyCats.length ? learnCats[0] : null);
      card.append(h('div', { class: 'dlx-aktionen' }, actions, opts));
      if (info.managed) card.append(h('p', { class: 'dlx-verwaltet' }, b.companyName ? T('managed') : T('managedNoName')));
      if (b.supportText || b.supportUrl) {
        card.append(h('p', { class: 'dlx-support' }, b.supportText || '', b.supportUrl ? ' ' : '',
          b.supportUrl ? h('a', { href: b.supportUrl, target: '_blank' }, T('support')) : null));
      }
      document.body.append(card);
      watchVisibility(card);
    }
    // Die Leiste nimmt dem Eingabefeld nie den Fokus (stoert nicht beim Arbeiten; Escape
    // im Feld = Bearbeiten). Nur der Vollbild-Rueckfall fokussiert, nie "Trotzdem" (Auflage 5).
    if (!bar && !done) (primary || actions[0] || document.body).focus();
  }

  // Hoehe der Leiste: eine Zeile, wenn alles samt lesbarem Text hineinpasst, sonst
  // umbrechen und die noetige Hoehe messen. An den Service Worker geht nur diese
  // Zahl (44..240), nur solange die eigene Hoehe nicht stimmt (auch nach einem
  // nudge mit neuer Nonce); die Hoehe wirkt nie auf die Breite zurueck
  // (Design-Review Leiste/Hoehe 15.10.2026, Auflagen 2, 3, 5).
  // Kompakt (Richtlinie/Einstellung barCompact): on, off oder auto = Leiste schmaler als
  // 640 px; nur eine feste Klasse, 44 px statt 56 (Design-Review Warnleiste anpassbar 17.10.2026).
  const BAR_H = 56, BAR_H2 = 100, BAR_MAX = 240, BAR_K = 44, BAR_K2 = 76, BAR_K_W = 640;
  const kompakt = () => info.compact === 'on' || (info.compact !== 'off' && window.innerWidth < BAR_K_W);
  let barEl = null;
  function fit() {
    const el = barEl;
    if (!el || inPopup || info.layout !== 'bar' || !el.isConnected) return;
    const k = kompakt();
    el.classList.toggle('dlx-kompakt', k);
    el.classList.remove('dlx-bar-2');
    let need = k ? BAR_K : BAR_H;
    if (extraOpen || el.scrollWidth > el.clientWidth + 1) {
      el.classList.add('dlx-bar-2');
      el.style.height = 'auto';
      need = Math.max(k ? BAR_K2 : BAR_H2, Math.ceil(el.getBoundingClientRect().height));
      el.style.height = '';
    }
    need = Math.min(BAR_MAX, need);
    if (need !== Math.round(innerHeight)) {
      chrome.runtime.sendMessage({ t: 'size', h: need }).catch(() => {});
    }
  }
  let fitQueued = false;
  window.addEventListener('resize', () => {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(() => { fitQueued = false; fit(); });
  });

  // Marken-Schriften laden nach (font-display swap): danach neu messen, sonst
  // passt die Leiste zur Rueckfall-Schrift und laeuft ueber.
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => fit());

  render();
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || done) return;
    decide(info.mode === 'fileinfo' ? 'ok' : soft(info.mode) ? 'hide' : 'cancel');
  });
  // Datenloser Anstoss vom Service Worker: Knoepfe kurz sperren, Stand neu holen.
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== chrome.runtime.id || sender.tab || !msg || msg.t !== 'nudge' || done) return;
    lockedUntil = performance.now() + LOCK_MS;
    hello().then((next) => {
      if (!next || next.gone || done) return;
      const changed = JSON.stringify(next) !== JSON.stringify(info);
      info = next;
      if (changed) { vis.since = 0; vis.ever = false; extraOpen = false; render(); } else fit();
    });
  });
})();
