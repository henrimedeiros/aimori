// Content Script (ISOLATED world, document_start): prueft Eingaben lokal,
// bevor die KI-Seite sie sendet oder einfuegt. Werte verlassen dieses Skript
// nie; an den Service Worker gehen nur Datentyp-IDs und Anzahlen.
// Meldungen erscheinen als schmale Leiste direkt oberhalb des Eingabefelds
// (erweiterungseigenes iframe in closed Shadow Root); nur wenn sie dort nicht
// sicher Platz hat, als Vollbild-Dialog (Design-Review 14.10.2026).
(function (g) {
  'use strict';
  const DLX = g.DLX;
  const B = DLX.bild;
  const site = DLX.adapters.forHost(location.hostname);
  if (!site || g.__dlxContentLoaded) return;
  g.__dlxContentLoaded = true;

  const FALLBACK_MS = 1500;   // Auflage B4
  const BYPASS_MS = 30000;    // Auflage B12
  const GESTURE_MS = 1500;
  const FILE_INFO_GAP_MS = 60000;
  const LIVE_MS = 400;        // Live-Hinweis: Pause nach der letzten Eingabe
  const LIVE_RENEW_MS = 60000;
  const GUARD_MS = 400;
  const PLACE_MS = 100;       // Nachfuehren hoechstens alle 100 ms (Auflage 9)
  // Leiste 56 px (zwei Zeilen 100 px): gut lesbar mit Signet und Produktname (Handtest 14.10.2026).
  // Live-Hinweis (2 Knoepfe) einzeilig ab 700 px, sonst zweizeilig, unter 420 px keine Leiste;
  // Senden & Co. (bis 5 Knoepfe) zweizeilig unter 1100 px, unter 680 px Vollbild-Rueckfall.
  // Das ist nur der Startwert: der Frame misst sein Layout und meldet die noetige Hoehe
  // (56..240 px, dlgSize), damit nie ein Knopf abgeschnitten wird (15.10.2026).
  const BAR_H = 56, BAR_H2 = 100, BAR_MAX = 240, BAR_GAP = 8, BAR_MIN_W = 420, BAR_MIN_SEND = 680, BAR_NARROW_LIVE = 700, BAR_NARROW = 1100;

  let cfg = DLX.policy.defaults(navigator.language);
  let eng = DLX.policy.engineConfig(cfg);
  let pending = null;         // { kind, nonce, ... } solange eine Meldung auf Entscheidung wartet
  let bypass = null;          // { hash, until }
  let ui = null;              // { host, layout, kind, rect, composer, watcher, timer } – Leiste oder Vollbild
  let readyTimer = null;
  let lastFileInfo = 0;
  let lastStatus = null;
  let lastAccount = null;
  // KI-Seite per Richtlinie gesperrt: nichts pruefen, keine Leiste/kein Dialog,
  // Senden/Einfuegen stoppen; die Sperrseite zeigt content/aiguard.js
  // (Design-Review KI-Seiten 14.10.2026, Auflage 10).
  let aiBlocked = false;

  const lang = () => DLX.i18n.resolveLang(cfg.language, navigator.language);
  const siteAllowed = () => cfg.allowedSites.indexOf(site.id) !== -1;
  const textHash = (kind, text) => DLX.dictionary.sha256Hex(kind + ':' + text.normalize('NFKC').replace(/\s+/g, ' ').trim());

  // Platzhalter-Zuordnung nur hier im Speicher dieses Dokuments (Design-Review
  // Platzhalter 14.10.2026): nie storage, verworfen bei pagehide und Richtlinie aus.
  const pseudo = DLX.pseudonym.create();
  const placeholdersOn = () => cfg.allowPlaceholders === true;
  // Ganztext-Funde ohne Wertposition (nicht schwaerzbar, keine Zeilennummern).
  const WHOLE = (f) => f.id === 'unscannable' || f.id === 'clipboard_source' || f.id === 'hidden_instruction' || f.id === 'document_match';

  // Sicher umformulieren (Design-Review Tabellen/Verschleierung/Umformen 16.10.2026, Auflagen 14-17):
  // Original nur beim Senden und nur hier im Speicher, hoechstens REPH_MS; nie storage, nie in Nachrichten.
  const REPH_MS = 60000;
  const reph = { nonce: null, orig: null, out: null, kind: null, composer: null, timer: null };
  // Ueber mehrere Nachrichten verteilte Teile (Auflage 12): Enden der zuletzt tatsaechlich gesendeten
  // Texte nur hier (isolierte Welt), je Chat-Pfad, TAIL_MS; nie window, DOM, storage oder Nachrichten.
  const TAIL_MS = 600000;
  const tails = { list: [], path: null, at: 0 };
  const deobfOn = () => cfg.deobfuscation !== false && !!DLX.entschleiern;
  // Derselbe Chat: gleicher Pfad oder Wechsel von einer Startseite ohne Chat-Kennung ("/", "/new", "/app")
  // auf den Pfad des neuen Chats, den die Seite nach der ersten Nachricht setzt (z. B. "/c/<id>");
  // jeder andere Pfadwechsel (anderer Chat) verwirft die Enden.
  const sameChat = (prev, cur) => prev === cur || (typeof prev === 'string' && /^\/[A-Za-z-]{0,20}\/?$/.test(prev));
  function tailList() {
    const cur = location.pathname;
    if (!deobfOn() || !sameChat(tails.path, cur) || Date.now() - tails.at > TAIL_MS) tails.list = [];
    tails.path = cur;
    return tails.list;
  }
  function remember(text) {
    if (!deobfOn() || !text) return;
    const l = tailList();
    const tail = text.slice(-DLX.entschleiern.TAIL);
    if (l.length && l[l.length - 1] === tail) return;   // eine Sende-Geste loest oft mehrere Ereignisse aus
    l.push(tail);
    while (l.length > DLX.entschleiern.PARTS) l.shift();
    tails.at = Date.now();
  }
  const dropTails = () => { tails.list = []; tails.path = null; tails.at = 0; };

  function loadConfig() {
    chrome.runtime.sendMessage({ t: 'cfg' }).then((r) => {
      if (r && r.cfg) { cfg = r.cfg; eng = DLX.policy.engineConfig(cfg, r.ignore); }
      aiBlocked = !!(r && r.aiBlocked === true);
      if (aiBlocked) failClosed();
      if (!placeholdersOn()) dropPlaceholders();
      if (cfg.allowRephrase !== true) hideRephrased();
      if (!deobfOn()) dropTails();
    }).catch(() => { /* Service Worker nicht erreichbar: sichere Standardwerte bleiben */ });
  }
  loadConfig();
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'managed' || area === 'local') loadConfig(); });

  function stop(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  // --- Meldungs-Host (erweiterungseigenes iframe in closed Shadow Root, B1/B2) --
  // Stile inline mit !important, Host direkt an documentElement (Auflage 8). Zuerst
  // all: initial, damit Seiten-CSS auch nicht gesetzte Eigenschaften (max-height,
  // zoom, scale, rotate, ...) am Host nicht veraendern kann (15.10.2026).
  const HOST_BASE = {
    all: 'initial', position: 'fixed', 'z-index': '2147483647', display: 'block', visibility: 'visible', opacity: '1',
    'pointer-events': 'auto', transform: 'none', filter: 'none', 'clip-path': 'none', margin: '0', padding: '0',
    border: '0', 'box-sizing': 'border-box', background: 'transparent',
  };
  const HOST_FULL = { inset: '0', width: 'auto', height: 'auto', background: 'rgba(0,0,0,0.35)' };

  // Sichtbare Fensterflaeche ohne Scrollleiste: ein fixed-Host mit inset 0 ist um
  // die Scrollleiste schmaler als innerWidth (Windows), der Dialog verschwand
  // sonst sofort. clientWidth nur im Standardmodus und nur bis 40 px Abzug, sonst
  // innerWidth (Quirks-Mode/html-Breite duerfen den Dialog nicht verkleinern;
  // Design-Review 13.10.2026 Auflage 4).
  function viewport(inner, prop) {
    const de = document.documentElement;
    const c = de ? de[prop] : NaN;
    return document.compatMode === 'CSS1Compat' && inner - c >= 0 && inner - c <= 40 ? c : inner;
  }

  // Platz der Leiste: Breite des Eingabe-Behaelters (form/fieldset, sonst Feld),
  // direkt darueber, sonst darunter. null = nicht sicher platzierbar.
  // Sichtbarer Eingabe-Behaelter: form/fieldset, sonst der groesste Vorfahre (bis
  // 4 Ebenen), der das Feld ganz umschliesst und nicht hoeher als 320 px ist.
  function anchorOf(c) {
    const box = c.closest('form, fieldset');
    if (box) return box;
    let best = c;
    const cr = c.getBoundingClientRect();
    for (let n = c.parentNode, i = 0; i < 4 && n && n.nodeType === 1 && n !== document.body; i++, n = n.parentNode) {
      const r = n.getBoundingClientRect();
      if (!r.width && !r.height) continue;   // display: contents
      if (r.height > 320 || r.top > cr.top || r.left > cr.left || r.bottom < cr.bottom || r.right < cr.right) break;
      best = n;
    }
    return best;
  }

  function barRect(c, kind, want) {
    if (!c || !c.isConnected) return null;
    const r = anchorOf(c).getBoundingClientRect();
    const vw = viewport(window.innerWidth, 'clientWidth'), vh = viewport(window.innerHeight, 'clientHeight');
    if (!(r.width > 0) || r.bottom < 0 || r.top > vh) return null;
    const width = Math.round(Math.min(r.width, vw - 8));
    const live = kind === 'live' || kind === 'reveal' || kind === 'answer' || kind === 'rephrased';
    if (width < (live ? BAR_MIN_W : BAR_MIN_SEND)) return null;
    const height = want || (width < (live ? BAR_NARROW_LIVE : BAR_NARROW) ? BAR_H2 : BAR_H);
    const left = Math.round(Math.max(4, Math.min(r.left, vw - width - 4)));
    let top = Math.round(r.top - BAR_GAP - height);
    if (top < 4) top = Math.round(r.bottom + BAR_GAP);
    if (top < 4 || top + height > vh - 4) return null;
    return { left, top, width, height };
  }

  // Pruefpunkte am Signet, am Produktnamen und als Raster ueber jede Knopfzeile
  // (rechts, Mitte, links; bei mehreren Zeilen alle 46 px), dazu die vier Ecken
  // (Auflage 9; Design-Review Anrede/Leiste 14.10.2026, Auflage 8; Leiste/Hoehe 15.10.2026, Auflage 6).
  function probePoints(r) {
    const two = r.height > BAR_H;
    const right = r.left + r.width, bottom = r.top + r.height;
    const y1 = two ? r.top + 26 : r.top + r.height / 2;
    const rows = [];
    if (!two) rows.push(y1);
    else for (let y = bottom - 25; y > r.top + 50; y -= 46) rows.push(y);
    const pts = [[r.left + 26, y1], [r.left + 90, y1], [r.left + 3, r.top + 3], [right - 3, r.top + 3], [r.left + 3, bottom - 3], [right - 3, bottom - 3]];
    for (const y of rows) for (const x of [right - 34, right - 130, right - 240, r.left + r.width / 2, r.left + 60, r.left + 160]) pts.push([x, y]);
    return pts.filter(([x]) => x > r.left && x < right);
  }

  function setStyles(host, styles) { for (const [k, v] of Object.entries(styles)) host.style.setProperty(k, v, 'important'); }

  function placeHost(r) {
    setStyles(ui.host, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    ui.rect = r;
  }

  const near = (a, b) => Math.abs(a - b) <= 1;
  function untouched(cs) {
    return cs.transform === 'none' && cs.filter === 'none' && (cs.clipPath === 'none' || cs.clipPath === undefined);
  }

  // Wache: Host verbunden, sichtbar, unveraendert, nicht verdeckt (B1, Auflagen 7-9).
  function hostIntact() {
    const host = ui && ui.host;
    if (!host || !host.isConnected || host.parentNode !== document.documentElement) return false;
    const cs = getComputedStyle(host);
    if (cs.display === 'none' || cs.visibility !== 'visible' || Number(cs.opacity) < 1 || cs.position !== 'fixed' || !untouched(cs)) return false;
    if (!untouched(getComputedStyle(document.documentElement))) return false;
    const r = host.getBoundingClientRect();
    if (ui.layout === 'full') {
      if (!(r.width >= viewport(window.innerWidth, 'clientWidth') - 1 && r.height >= viewport(window.innerHeight, 'clientHeight') - 1)) return false;
      // Mitte und die feste Knopfzeile unten in der Karte (Frame hoechstens 560 px / 90 % hoch)
      const fh = Math.min(560, r.height * 0.9);
      return covered([[r.width / 2, r.height / 2], [r.width / 2, r.height / 2 + fh / 2 - 36]]) === false;
    }
    const want = ui.rect;
    if (!near(r.left, want.left) || !near(r.top, want.top) || !near(r.width, want.width) || !near(r.height, want.height)) return false;
    return covered(probePoints(want)) === false;
  }

  // elementFromPoint liefert fuer Punkte im closed Shadow Root den Host.
  function covered(points) {
    if (typeof document.elementFromPoint !== 'function') return false;
    return points.some(([x, y]) => document.elementFromPoint(x, y) !== ui.host);
  }

  function removeHost() {
    if (!ui) return;
    if (ui.kind === 'reveal') reveal.nonce = null;
    if (ui.kind === 'answer') ans.nonce = null;
    if (ui.kind === 'rephrased') reph.nonce = null;
    if (ui.kind === 'view') view.nonce = null;
    if (ui.watcher) ui.watcher.disconnect();
    clearTimeout(ui.timer);
    clearTimeout(readyTimer);
    if (ui.host.isConnected) ui.host.remove();
    ui = null;
  }

  // Manipulation an der Meldung -> immer Abbrechen (fail-closed), nie Senden.
  function failClosed() {
    if (pending) {
      chrome.runtime.sendMessage({ t: 'cancelPending' }).catch(() => {});
      pending = null;
    }
    live.nonce = null;
    removeHost();
  }

  // Hell/Dunkel der KI-Seite: Hintergrund des Felds bzw. seiner Vorfahren.
  function pageTheme(c) {
    for (let n = c; n && n.nodeType === 1; n = n.parentNode) {
      const m = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?/.exec(getComputedStyle(n).backgroundColor || '');
      if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) continue;
      const lum = 0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3];
      return lum < 128 ? 'dunkel' : 'hell';
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dunkel' : 'hell';
  }

  // Host anlegen; layout 'bar' (Rechteck r) oder 'full'.
  // Art 'view': Ansicht mit echten Werten, Nonce nur in der URL des Frames in der
  // closed Shadow Root; nur sie darf in die Zwischenablage schreiben (Auflagen 3, 5).
  function createHost(kind, layout, r, composer, viewNonce) {
    removeHost();
    const host = document.createElement('div');
    ui = { host, layout, kind, rect: r, composer, watcher: null, timer: null, placedAt: 0 };
    setStyles(host, HOST_BASE);
    if (layout === 'full') setStyles(host, HOST_FULL); else placeHost(r);
    const root = host.attachShadow({ mode: 'closed' });
    const frame = document.createElement('iframe');
    frame.src = kind === 'view' ? chrome.runtime.getURL('ui/view.html') + '#' + viewNonce : chrome.runtime.getURL('ui/dialog.html');
    frame.setAttribute('allow', kind === 'view' ? 'clipboard-write' : '');
    frame.style.cssText = layout === 'full'
      ? 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(460px,94vw);height:min(560px,90vh);border:0;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.35);background:transparent;color-scheme:normal;'
      : 'display:block;width:100%;height:100%;border:0;border-radius:12px;box-shadow:0 1px 2px rgba(21,24,28,.06),0 8px 24px -10px rgba(21,24,28,.28);background:transparent;color-scheme:normal;';
    root.append(frame);
    document.documentElement.append(host);
    const u = ui;
    const verify = () => { if (ui === u && !hostIntact()) onBroken(); };
    u.watcher = new MutationObserver(verify);
    u.watcher.observe(host, { attributes: true });
    u.watcher.observe(document.documentElement, { childList: true, attributes: true });
    const tick = () => { if (ui !== u) return; verify(); if (ui === u) u.timer = setTimeout(tick, GUARD_MS); };
    u.timer = setTimeout(tick, GUARD_MS);
  }

  // Wache verletzt: Sende-/Einfuege-Meldung -> Abbrechen, Live-Hinweis -> weg.
  function onBroken() {
    if (ui && ui.kind === 'live') { hideLive(); return; }
    if (ui && (ui.kind === 'reveal' || ui.kind === 'view' || ui.kind === 'answer')) { removeHost(); return; }
    if (ui && ui.kind === 'rephrased') { hideRephrased(); return; }
    failClosed();
  }

  function showDialog(p) {
    if (aiBlocked) return;
    hideLive();
    pending = p;
    const c = p.composer || site.findComposer();
    const r = barRect(c, p.kind);
    const layout = r ? 'bar' : 'full';    // Rueckfall-Kette: Leiste -> Vollbild -> Popupfenster (Auflage 14)
    createHost(p.kind, layout, r, c);
    // Eingefuegter Code: je Typ hoechstens 5 Zeilennummern, nie Werte (Design-Review Code und Bilder, Auflage 5).
    const lines = p.text && p.findings && DLX.code.isCode(p.text) ? DLX.code.linesOf(p.text, p.findings) : null;
    const summary = p.findings ? Array.from(DLX.engine.summarize(p.findings), (s) => Object.assign({ id: s.id, cat: s.cat, n: s.n },
      lines && !WHOLE(s) && lines.get(s.id) && lines.get(s.id).length ? { lines: lines.get(s.id).slice() } : null)) : [];
    chrome.runtime.sendMessage({ t: 'found', mode: p.kind, action: p.action, items: summary, code: !!lines, layout, theme: pageTheme(c), account: p.account || null, reason: p.reason || null }).then((res) => {
      if (!res || !res.nonce || pending !== p) { if (pending === p) failClosed(); return; }
      p.nonce = res.nonce;
      readyTimer = setTimeout(() => {
        if (pending === p && !p.ready) chrome.runtime.sendMessage({ t: 'fallback' }).catch(() => failClosed());
      }, FALLBACK_MS);
    }).catch(() => { if (pending === p) failClosed(); });
  }

  // Leiste beim Scrollen/Groessenaendern nachfuehren, hoechstens alle 100 ms;
  // danach sperrt der Frame seine Knoepfe 400 ms (Auflage 9).
  let placeTimer = null;
  function follow() {
    if (!ui || ui.layout !== 'bar' || placeTimer) return;
    const wait = Math.max(0, PLACE_MS - (Date.now() - ui.placedAt));
    placeTimer = setTimeout(() => {
      placeTimer = null;
      if (!ui || ui.layout !== 'bar') return;
      const r = barRect(ui.composer, ui.kind, ui.wantH);
      if (!r) { onBroken(); return; }
      if (r.left === ui.rect.left && r.top === ui.rect.top && r.width === ui.rect.width && r.height === ui.rect.height) return;
      ui.placedAt = Date.now();
      placeHost(r);
      chrome.runtime.sendMessage({ t: 'moved' }).catch(() => {});
    }, wait);
  }
  // Hoehe vom Frame (ueber den Service Worker, nur mit der Nonce der angezeigten
  // Meldung): Leiste neu legen, Wache sofort; passt sie nicht ins Fenster, Sende-
  // Meldungen ins Rueckfall-Popupfenster, Live-Hinweis weg (Design-Review Leiste/Hoehe
  // 15.10.2026, Auflagen 3-6). 'moved' sperrt die Knoepfe im Frame erneut 400 ms.
  function resizeBar(msg) {
    if (!ui || ui.layout !== 'bar') return;
    const n = ui.kind === 'live' ? live.nonce : ui.kind === 'reveal' ? reveal.nonce : ui.kind === 'answer' ? ans.nonce : ui.kind === 'rephrased' ? reph.nonce : pending && pending.nonce;
    const h = msg.h;
    if (!n || msg.nonce !== n || typeof h !== 'number' || !Number.isInteger(h) || h < BAR_H || h > BAR_MAX || h === ui.rect.height) return;
    ui.wantH = h;
    const r = barRect(ui.composer, ui.kind, h);
    if (!r) {
      if (ui.kind === 'live' || ui.kind === 'reveal' || ui.kind === 'answer' || ui.kind === 'rephrased') { onBroken(); return; }
      removeHost();
      chrome.runtime.sendMessage({ t: 'fallback' }).catch(() => failClosed());
      return;
    }
    ui.placedAt = Date.now();
    placeHost(r);
    chrome.runtime.sendMessage({ t: 'moved' }).catch(() => {});
    if (!hostIntact()) onBroken();
  }

  window.addEventListener('resize', follow, { passive: true });
  window.addEventListener('scroll', follow, { passive: true, capture: true });

  // --- Text ersetzen/einfuegen ueber die Editor-Eingabe (B11) ---------------
  function selectAllIn(el) {
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') { el.select(); return; }
    const r = document.createRange();
    r.selectNodeContents(el);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function insertText(el, text) {
    el.focus();
    const ok = document.execCommand('insertText', false, text);
    if (!ok && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const start = el.selectionStart, end = el.selectionEnd;
      const next = el.value.slice(0, start) + text + el.value.slice(end);
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  const placeholder = (f) => (f.rows ? DLX.i18n.t(lang(), 'rowsRemoved', { n: f.rows }) : DLX.i18n.t(lang(), 'cat_' + f.cat));

  // Schwaerzen oder (choice 'pseudonym', Richtlinie an) Platzhalter [TYP_n];
  // ab 500 Zuordnungen faellt der Rest auf normales Schwaerzen zurueck.
  function replaced(text, findings, choice) {
    return choice === 'pseudonym' && placeholdersOn()
      ? pseudo.pseudonymize(text, findings, placeholder)
      : DLX.engine.redact(text, findings, placeholder);
  }
  const replacing = (choice) => choice === 'redact' || choice === 'pseudonym';

  // Nach bestaetigtem "Trotzdem senden" genau ein click() auf den beim Anhalten
  // erkannten Senden-Knopf – nur wenn er noch derselbe, sichtbar, aktiv und im
  // Behaelter des Felds ist und der Text unveraendert ist; sonst drueckt der
  // Nutzer selbst Enter. Kein kuenstliches Enter, kein form.submit() (Auflagen 1-3).
  function clickRemembered(p) {
    const btn = p.sendBtn;
    if (!btn || !btn.isConnected || !btn.getClientRects().length || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
    if (!p.composer || !p.composer.isConnected || !site.sameBox(btn, p.composer)) return;
    if (!bypass || textHash('send', site.readText(p.composer)) !== bypass.hash) { bypass = null; return; }
    btn.click();
  }

  // --- Entscheidungen vom Service Worker -------------------------------------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || sender.tab || !msg || typeof msg !== 'object') return;
    if (msg.t === 'srcMarks') { srcApply(msg); return; }
    // Text der Ansicht nur auf tabs.sendMessage mit der Nonce der offenen Ansicht (Auflage 4).
    if (msg.t === 'viewText') {
      if (view.nonce && msg.nonce === view.nonce && ui && ui.kind === 'view' && placeholdersOn()) sendResponse({ text: viewText() });
      return;
    }
    if (msg.t === 'dlgReady' && pending && msg.nonce === pending.nonce) { pending.ready = true; clearTimeout(readyTimer); return; }
    if (msg.t === 'dlgReady' && live.nonce && msg.nonce === live.nonce) { live.ready = true; return; }
    if (msg.t === 'dlgSize') { resizeBar(msg); return; }
    if (msg.t !== 'decision') return;
    if (live.nonce && msg.nonce === live.nonce) {
      // Live-Nonce: nur Schwaerzen/Platzhalter oder Ausblenden (Auflage 10).
      if (replacing(msg.choice)) redactLive(msg.choice);
      else if (msg.choice === 'hide') { live.dismissed = live.sig; hideLive(); }
      return;
    }
    if (reveal.nonce && msg.nonce === reveal.nonce) {
      if (msg.choice === 'show' && typeof msg.view === 'string' && /^[0-9a-f]{32}$/.test(msg.view)) openView(msg.view);
      else if (msg.choice === 'hide') { if (reveal.el) reveal.dismissed.add(reveal.el); hideReveal(); }
      return;
    }
    if (view.nonce && msg.nonce === view.nonce) {
      if (msg.choice === 'hide') closeView();
      return;
    }
    if (ans.nonce && msg.nonce === ans.nonce) {
      if (msg.choice === 'hide') { ans.dismissed = ans.sig; ans.copyUntil = 0; hideAnswer(); }
      return;
    }
    if (reph.nonce && msg.nonce === reph.nonce) {
      if (msg.choice === 'undo') undoRephrase();
      else if (msg.choice === 'hide') hideRephrased();
      return;
    }
    if (!pending || msg.nonce !== pending.nonce) return;
    const p = pending;
    pending = null;
    removeHost();
    const usable = (p.findings || []).filter((f) => !WHOLE(f));
    if ((p.kind === 'send' || p.kind === 'paste') && msg.choice === 'rephrase') {
      if (usable.length && cfg.allowRephrase === true) rephraseNow(p, usable);
    } else if (p.kind === 'send') {
      if (replacing(msg.choice) && usable.length) {
        selectAllIn(p.composer);
        insertText(p.composer, replaced(p.text, usable, msg.choice));
      }
      if (p.composer && p.composer.isConnected) p.composer.focus();
      if (msg.choice === 'override' || msg.choice === 'notsensitive') {
        if (msg.choice === 'notsensitive') ignoreValues(p, usable);
        bypass = { hash: textHash('send', p.text), until: Date.now() + BYPASS_MS };
        clickRemembered(p);
      }
    } else if (p.kind === 'paste' && p.target && p.target.isConnected) {
      if (replacing(msg.choice) && usable.length) insertText(p.target, replaced(p.text, usable, msg.choice));
      else if (msg.choice === 'override' || msg.choice === 'notsensitive') {
        if (msg.choice === 'notsensitive') ignoreValues(p, usable);
        insertText(p.target, p.text);
      } else p.target.focus();
    } else if (p.kind === 'voice') {
      // "Sprachmodus trotzdem": gilt fuer diese Seite bis zum Neuladen, nur im Speicher (Auflage 5).
      if (msg.choice === 'override') voiceOk = true;
    } else if (p.kind === 'image' || p.kind === 'imagefail' || p.kind === 'doc') {
      if (msg.choice === 'override') p.deliver(p.files);
      else if (msg.choice === 'redact' && p.kind === 'image') redactImages(p).then(p.deliver, () => imageFail(p, 'fail'));
    }
    scheduleLive(null);
  });

  // --- Sicher umformulieren ----------------------------------------------------
  // Nur wenn das Feld noch genau den geprueften Text traegt (Auflage 14); danach sofort neu
  // pruefen: bleibt ein Fund, kommt die normale Meldung statt der leisen Leiste (Auflage 15).
  // Kein Weg legt eine Ausnahme fuer das naechste Senden an.
  function rephraseNow(p, usable) {
    const send = p.kind === 'send';
    const target = send ? p.composer : p.target;
    if (!target || !target.isConnected) return;
    if (send && site.readText(p.composer) !== p.text) { p.composer.focus(); return; }
    hideRephrased();
    const out = DLX.umformen.rephrase(p.text, usable, lang()).text;
    const r = check(out);
    if (send) { selectAllIn(p.composer); insertText(p.composer, out); }
    if (r.findings.length) {
      showDialog(send ? { kind: 'send', composer: p.composer, text: out, findings: r.findings, action: r.action, sendBtn: null, account: r.account }
        : { kind: 'paste', target: p.target, composer: p.composer, text: out, findings: r.findings, action: r.action, account: r.account });
      return;
    }
    if (!send) insertText(p.target, out);
    // Beim Einfuegen nie das Original merken: Rueckgaengig gibt es dort nicht (Auflage 16).
    reph.orig = send ? p.text : null;
    reph.out = out;
    reph.kind = p.kind;
    reph.composer = send ? p.composer : null;
    reph.timer = setTimeout(hideRephrased, REPH_MS);
    rephrasedBar(Array.from(DLX.engine.summarize(usable), (x) => ({ id: x.id, cat: x.cat, n: x.n })));
  }
  function rephrasedBar(items) {
    const c = site.findComposer();
    const r = barRect(c, 'rephrased');
    if (!r || pending || ui) { dropReph(); return; }
    chrome.runtime.sendMessage({ t: 'found', mode: 'rephrased', action: 'warn', items, layout: 'bar', theme: pageTheme(c), reason: reph.kind === 'paste' ? 'paste' : null }).then((res) => {
      if (!res || !res.nonce || pending || ui || !reph.out) { dropReph(); return; }
      createHost('rephrased', 'bar', r, c);
      reph.nonce = res.nonce;
    }).catch(() => dropReph());
  }
  // Rueckgaengig beim Senden: Original zurueck, nur wenn das Feld noch das Umformulierte traegt;
  // das naechste Senden wird voll geprueft (keine Ausnahme).
  function undoRephrase() {
    const c = reph.composer, orig = reph.orig, out = reph.out;
    hideRephrased();
    if (!c || !orig || !c.isConnected || site.readText(c) !== out) return;
    selectAllIn(c);
    insertText(c, orig);
    c.focus();
  }
  function dropReph() {
    clearTimeout(reph.timer);
    reph.timer = null; reph.orig = null; reph.out = null; reph.kind = null; reph.composer = null;
  }
  function hideRephrased() {
    if (ui && ui.kind === 'rephrased') removeHost();
    reph.nonce = null;
    dropReph();
  }

  // "Kein sensibler Wert": an den Service Worker gehen nur HMAC-Werte, der
  // Schluessel bleibt in diesem Skript (Design-Review Fehlalarme, Auflage 10).
  function ignoreValues(p, list) {
    const key = eng.ignore && eng.ignore.key;
    if (!key) return;
    const hashes = [];
    for (const f of list) {
      if (!DLX.engine.ignorable(f.id)) continue;
      const h = DLX.engine.ignoreHash(key, f.id, p.text.slice(f.start, f.end));
      if (hashes.indexOf(h) === -1) hashes.push(h);
    }
    chrome.runtime.sendMessage({ t: 'ignoreAdd', nonce: p.nonce, hashes }).then(loadConfig, () => {});
  }

  // --- Pruefung ---------------------------------------------------------------
  // Unsichere Funde nach Richtlinie uncertainFindings (Auflage 1): hint = nur
  // Live-Hinweis, nie Dialog; warn = hoechstens Warnen; enforce = wie sichere.
  const loud = (f) => f.sure || cfg.uncertainFindings === 'warn' || cfg.uncertainFindings === 'enforce';
  function counted(list) {
    if (cfg.uncertainFindings === 'enforce') return list;
    return list.filter(loud).map((f) => (f.sure ? f : Object.assign({}, f, { action: 'warn' })));
  }

  // Regeln je Konto: Kontoart bei jeder Pruefung neu aus sichtbaren
  // Seitensignalen (content/account.js), nichts gespeichert (Design-Review
  // Konto-Regeln 14.10.2026, Auflage 11). null = keine Konto-Regel fuer die Seite.
  function accountState() {
    if (!DLX.policy.accountLevel(cfg, site.id, null)) return null;
    return DLX.policy.accountLevel(cfg, site.id, DLX.account.detect(site.id, cfg.accountRules[site.id], site.composerSelector));
  }

  // --- Lokale KI-Erkennung (Design-Review KI 16.10.2026) --------------------
  // Text (hoechstens die ersten 4000 Zeichen) geht nur an den eigenen Service
  // Worker; zurueck kommen nur Positionen, geprueft (Auflage 16) und nur fuer
  // genau diesen Text im Speicher gehalten (nie storage). Regeln laufen immer,
  // die KI ergaenzt nur (Auflage 18); ohne Antwort oder bei Fehlern gelten
  // allein die Regeln. Je Anfrage eine Sequenznummer, aeltere Antworten verfallen.
  const ki = { text: null, ents: null, seq: 0, busy: null };
  const kiOn = () => cfg.detection !== 'regeln';
  function kiFindings(text) {
    if (!kiOn() || !ki.ents || ki.text !== text.slice(0, DLX.ki.MAX_TEXT)) return [];
    return DLX.ki.findings(text, ki.ents, eng);
  }
  // always: wird in jedem Fall genau einmal aufgerufen (Antwort, Fehler, nichts zu tun).
  function kiRequest(text, then, always) {
    const fin = () => { if (always) always(); };
    if (!kiOn() || !text || !text.trim()) return fin();
    const part = text.slice(0, DLX.ki.MAX_TEXT);
    if ((ki.text === part && ki.ents) || ki.busy === part) return fin();
    const seq = ++ki.seq;
    ki.busy = part;
    chrome.runtime.sendMessage({ t: 'ki', text: part, seq }).then((r) => {
      if (seq !== ki.seq) return fin();
      ki.busy = null;
      const ents = r && !r.error ? DLX.ki.valid(r, part.length) : null;
      if (ents) {
        ki.text = part;
        ki.ents = ents;
        if (then) then();
      }
      fin();
    }).catch(() => { if (seq === ki.seq) ki.busy = null; fin(); });
  }
  // Bildtext: auf die lokale KI warten, hoechstens ms; danach entscheiden die Regeln allein
  // (Design-Review Code und Bilder, Auflagen 6, 8). Die KI ergaenzt nur (merge, Auflage 7).
  const kiAwait = (text, ms) => new Promise((done) => {
    const timer = setTimeout(done, Math.max(0, ms));
    kiRequest(text, null, () => { clearTimeout(timer); done(); });
  });
  const withKi = (text, list) => DLX.ki.merge(list, kiFindings(text));

  // Dokument-Fingerabdruecke (Design-Review Diktat und Fingerabdruecke 16.10.2026, Teil B):
  // ein Ganztext-Fund mit Art und Anzahl 1, nie welcher Abschnitt oder Wert (Auflage 14).
  const docMatch = () => ({ id: 'document_match', cat: 'firma', start: 0, end: 0, action: eng.fp.action, sure: true });

  function check(text) {
    const res = DLX.engine.scan(text, eng);
    const dm = DLX.fingerprint.scan(text, eng.fp);
    let findings = counted(withKi(text, Array.from(res.findings)));
    if (dm.hit) findings.push(docMatch());
    // Zeitbudget der Fingerabdruecke ueberschritten = nicht pruefbar wie beim Scan (Auflage 13), mit der
    // strengeren Aktion aus warn und documentFingerprints.action; ein Fingerabdruck-Treffer bleibt neben
    // "nicht pruefbar" stehen. Ein langer Text schwaecht eine Sperre nie zur Warnung ab (Auflagen
    // Pflicht-Pruefung 16.10.2026).
    if (res.unscannable || dm.timeout) {
      findings = [{ id: 'unscannable', cat: 'unscannable', start: 0, end: 0, action: eng.fp && eng.fp.action === 'block' && (dm.timeout || dm.hit) ? 'block' : 'warn' }];
      if (dm.hit) findings.push(docMatch());
    }
    const acc = accountState();
    if (acc) findings = DLX.policy.accountFindings(findings, acc.level);
    return { findings, action: DLX.engine.strictest(findings), account: acc ? acc.type : null };
  }

  // Gemeinsame Vorpruefung: Seite gesperrt / Schutz inaktiv / Meldung offen.
  // Bei offener Meldung wird jeder weitere Versuch erneut gestoppt (Auflage 13).
  function gate(e) {
    if (aiBlocked) { stop(e); return false; }
    if (pending) { stop(e); return false; }
    if (!siteAllowed()) { stop(e); showDialog({ kind: 'site', action: 'block' }); return false; }
    if (!site.findComposer() && cfg.blockWhenInactive) { stop(e); showDialog({ kind: 'inactive', action: 'block' }); return false; }
    return true;
  }

  function onSend(e) {
    if (!gate(e)) return;
    // Feld aus dem Ereignis zuerst: eine versteckte Rueckfall-textarea darf
    // den getippten Text nie verdecken.
    const path = e.composedPath();
    const composer = site.composerIn(path) || site.findComposer();
    if (!composer) return;
    const text = site.readText(composer);
    if (!text || !text.trim()) return;
    // Ausnahme gilt fuer genau eine Sende-Geste: Enter/Klick loesen oft noch
    // ein submit aus; danach ist sie verbraucht (B12).
    const now = Date.now();
    if (reph.orig) hideRephrased();   // Original verwerfen, sobald gesendet wird (Auflage 17)
    if (bypass && now < bypass.until && bypass.hash === textHash('send', text)) {
      if (!bypass.usedAt) bypass.usedAt = now;
      if (now - bypass.usedAt < GESTURE_MS) { remember(text); return; }
    }
    bypass = null;
    const r = check(text);
    // Teile ueber mehrere Nachrichten: nur starke Funde ueber die Grenze (Auflage 12).
    if (deobfOn() && tailList().length) {
      const split = DLX.entschleiern.across(tailList(), text, (t) => DLX.engine.scan(t, Object.assign({}, eng, { strongOnly: 1 })))
        .filter((f) => r.findings.every((k) => WHOLE(k) || f.end <= k.start || f.start >= k.end));
      if (split.length) { r.findings = r.findings.concat(split); r.action = DLX.engine.strictest(r.findings); }
    }
    if (!r.findings.length) { remember(text); return; }
    stop(e);
    // Senden-Knopf als Referenz merken (Auflage 1): aus dem Ereignis, sonst der sichtbare der Seite.
    const btn = site.sendButtonIn(path) || site.findSendButton();
    const sendBtn = btn && btn.getClientRects().length && site.sameBox(btn, composer) ? btn : null;
    showDialog({ kind: 'send', composer, text, findings: r.findings, action: r.action, sendBtn, account: r.account });
  }

  function onFiles(e, files, deliver) {
    const kind = blockKind();
    if (kind) { stop(e); if (!pending) showDialog({ kind, action: 'block' }); return true; }
    if (passiveFiles()) return false;
    // Bilder lokal per Texterkennung pruefen statt durchlassen (Design-Review Bilder 14.10.2026).
    if (deliver && imageSet(files)) { stop(e); if (!pending) checkImages(files, deliver); return true; }
    if (deliver && docSet(files)) { stop(e); if (!pending) checkDocs(files, deliver); return true; }
    if (cfg.blockUncheckedFiles) { stop(e); if (!pending) showDialog({ kind: 'fileblock', action: 'block' }); return true; }
    fileInfo();
    return false;
  }
  // Hinweis "Dateien werden nicht geprueft" hoechstens alle 60 s (auch nach sauberem Textdokument:
  // geprueft wird dort nur auf versteckte Anweisungen, nicht auf heikle Daten).
  function fileInfo() {
    if (!pending && Date.now() - lastFileInfo > FILE_INFO_GAP_MS) {
      lastFileInfo = Date.now();
      setTimeout(() => { if (!pending) showDialog({ kind: 'fileinfo', action: 'warn' }); }, 0);
    }
  }

  // m365.cloud.microsoft traegt die ganze M365-Oberflaeche: Einfuegen/Dateien
  // dort nur im bzw. neben dem Chat-Feld pruefen, sonst passiv (Auflage 1).
  // Gesperrte Seite und nicht erkanntes Feld (blockWhenInactive) gehen immer vor
  // der Passivitaet: fail-closed (Pflicht-Pruefung 13.10.2026).
  const passive = (e) => site.onlyComposer && !site.inComposer(e.composedPath());
  const passiveFiles = () => site.onlyComposer && !site.findComposer();
  const blockKind = () => (aiBlocked || !siteAllowed() ? 'site' : cfg.blockWhenInactive && !site.findComposer() ? 'inactive' : null);

  // Versteckte Anweisungen (Design-Review KI-Agenten 16.10.2026): Ganztext-Funde nur mit Art
  // und Anzahl, nie Ausschnitte (Auflage 4); Grenze ueberschritten = Fund (Auflagen 3, 5).
  const INJ = DLX.injektion;
  const scanHidden = (input) => (cfg.hiddenInstructionScan === false ? null : INJ.check(input));
  function injFindings(res) {
    if (!res) return [];
    const n = res.unscannable ? Math.max(res.n, 1) : res.n;
    const action = cfg.hiddenInstructionAction === 'block' ? 'block' : 'warn';
    return Array.from({ length: n }, () => ({ id: 'hidden_instruction', cat: 'injection', start: 0, end: 0, action, sure: true }));
  }
  // blockUncheckedFiles sperrt Dateien weiter ganz: Textdokumente nur ohne diese Richtlinie lesen.
  // Gelesen wird auch, wenn nur Dokument-Fingerabdruecke gesetzt sind (Teil B).
  const hiddenOn = () => cfg.hiddenInstructionScan !== false;
  // Tabellen (Design-Review Tabellen/Verschleierung/Umformen 16.10.2026): auch XLSX wird gelesen, nie ausgefuehrt.
  const tableOn = () => cfg.tableScan !== false && !!DLX.tabelle;
  const docSet = (files) => (hiddenOn() || !!eng.fp || tableOn()) && !cfg.blockUncheckedFiles && files.length > 0
    && files.every((f) => INJ.isDoc(f) || (tableOn() && DLX.tabelle.XLSX_FILE(f)));
  // Textdokumente lokal als Text lesen (nie ausfuehren); die Seite bekommt sie erst nach der Pruefung.
  async function checkDocs(files, deliver) {
    let n = 0, over = false, fpHit = false, fpOver = false, rows = 0, tabOver = false;
    const topts = { minRows: cfg.tableMinRows, minCols: cfg.tableMinColumns };
    for (const f of files) {
      if (tableOn() && DLX.tabelle.XLSX_FILE(f)) {
        // XLSX: Tabellen aus den Blaettern; Zellen und Kommentare als Text fuer die bestehenden Pruefungen.
        if (f.size > INJ.LIMITS.bytes) { tabOver = true; continue; }
        let x;
        try { x = await DLX.tabelle.xlsx(await f.arrayBuffer(), topts); } catch (err) { x = { unscannable: true, text: '' }; }
        if (x.unscannable) tabOver = true; else if (x.leak) rows = Math.max(rows, x.rows);
        if (x.text && hiddenOn()) { const res = INJ.check({ text: x.text }); if (res.unscannable) over = true; n = Math.max(n, res.n); }
        if (x.text && eng.fp) { const d = DLX.fingerprint.scan(x.text, eng.fp); if (d.timeout) fpOver = true; else if (d.hit) fpHit = true; }
        x = null;
        continue;
      }
      // Zu gross oder unlesbar: beide Pruefungen melden es mit ihrer eigenen Aktion
      // (Fingerabdruck-Sperre greift auch hier; Auflage Pflicht-Pruefung 16.10.2026).
      if (f.size > INJ.LIMITS.bytes) { if (hiddenOn()) over = true; if (tableOn()) tabOver = true; fpOver = true; continue; }
      let t;
      try { t = await f.text(); } catch (err) { if (hiddenOn()) over = true; if (tableOn()) tabOver = true; fpOver = true; continue; }
      if (hiddenOn()) {
        const res = INJ.check(INJ.HTML_DOC(f) ? { text: t, html: t } : { text: t });
        if (res.unscannable) over = true;
        n = Math.max(n, res.n);
      }
      if (eng.fp) {
        const d = DLX.fingerprint.scan(t, eng.fp);
        if (d.timeout) fpOver = true; else if (d.hit) fpHit = true;
      }
      if (tableOn()) { const x = DLX.tabelle.checkText(f, t, topts); if (x.unscannable) tabOver = true; else if (x.leak) rows = Math.max(rows, x.rows); }
      t = null;
    }
    const findings = injFindings({ n, unscannable: over })
      .concat(fpHit ? [docMatch()] : [], fpOver && eng.fp ? [{ id: 'unscannable', cat: 'unscannable', start: 0, end: 0, action: eng.fp.action, sure: true }] : [])
      // Tabelle mit Personendaten: ein Ganztext-Fund mit der Zeilenzahl, nie Werte; Datei wird nie umgeschrieben (Auflage 8).
      .concat(rows && DLX.engine.actionFor('mass_list', eng) !== 'off' ? [{ id: 'mass_list', cat: 'person', start: 0, end: 0, n: rows, action: DLX.engine.actionFor('mass_list', eng), sure: true }] : [],
        tabOver ? [{ id: 'unscannable', cat: 'unscannable', start: 0, end: 0, action: 'warn', sure: true }] : []);
    if (!findings.length) { deliver(files); fileInfo(); return; }
    if (pending) return;
    showDialog({ kind: 'doc', composer: site.findComposer(), files, deliver, findings, action: DLX.engine.strictest(findings) });
  }

  function onInsert(e, dt) {
    if (aiBlocked) { stop(e); return; }
    if (!dt) return;
    if (reph.orig) hideRephrased();
    const hasFiles = (dt.files && dt.files.length > 0) || Array.from(dt.items || []).some((i) => i.kind === 'file');
    if (hasFiles && onFiles(e, Array.from(dt.files || []), redeliver(e))) return;
    const text = dt.getData('text/plain');
    if (!text) return;
    if (!gate(e) || passive(e)) return;
    const r = check(text);
    if (fromSource(text)) {
      r.findings = r.findings.concat({ id: 'clipboard_source', cat: 'source', start: 0, end: 0, action: cfg.sensitiveSourceAction === 'block' ? 'block' : 'warn' });
      r.action = DLX.engine.strictest(r.findings);
    }
    const inj = injFindings(scanHidden({ text, html: dt.getData('text/html') }));
    if (inj.length) { r.findings = r.findings.concat(inj); r.action = DLX.engine.strictest(r.findings); }
    if (!r.findings.length) return;
    stop(e);
    const path = e.composedPath();
    const target = path.find((n) => n && n.nodeType === 1 && (n.isContentEditable || n.tagName === 'TEXTAREA' || n.tagName === 'INPUT')) || site.findComposer();
    showDialog({ kind: 'paste', target, composer: site.composerIn(path) || site.findComposer(), text, findings: r.findings, action: r.action, account: r.account });
  }

  // --- Bilder pruefen (Design-Review Bilder 14.10.2026) -----------------------
  // Eingefuegte, abgelegte oder hochgeladene PNG/JPEG/WebP: Ereignis sofort
  // stoppen, Bild im Offscreen-Dokument lokal lesen lassen, Text wie beim
  // Einfuegen pruefen. Die Seite bekommt das Bild erst danach (Original,
  // geschwaerzte Kopie oder nichts); nicht Pruefbares nie still (Auflagen 5-11).
  const IMAGE_TYPE = /^image\/(png|jpe?g|webp)$/i;
  const imageSet = (files) => cfg.imageScan !== false && files.length > 0
    && files.every((f) => IMAGE_TYPE.test(f.type) || (!f.type && /\.(png|jpe?g|webp)$/i.test(f.name)));
  const own = new WeakSet();   // eigene Weitergabe, gilt nur fuer genau dieses Ereignis (Auflage 7)
  let swallow = null;          // Datei-Feld, dessen folgendes change ebenfalls gestoppt wird

  function fire(target, ev) {
    own.add(ev);
    try { target.dispatchEvent(ev); } finally { own.delete(ev); }
  }
  function transfer(files) {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    return dt;
  }
  // Weitergabe wie das urspruengliche Ereignis: Einfuegen oder Ablegen am selben Ziel.
  function redeliver(e) {
    const first = e.composedPath().find((n) => n && n.nodeType === 1) || null;
    const x = e.clientX || 0, y = e.clientY || 0;
    const drop = e.type === 'drop' || e.inputType === 'insertFromDrop';
    return (files) => {
      const target = first && first.isConnected ? first : site.findComposer();
      if (!target) return;
      const dt = transfer(files);
      if (drop) for (const type of ['dragenter', 'dragover', 'drop']) fire(target, new DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer: dt }));
      else fire(target, new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true, clipboardData: dt }));
    };
  }
  // Datei-Feld: Auswahl sofort leeren, sonst liest die Seite input.files trotzdem (Auflage 5).
  function fileInputImages(e) {
    const n = e.target;
    if (!n || n.tagName !== 'INPUT' || n.type !== 'file' || !n.files || !n.files.length) return false;
    const files = Array.from(n.files);
    const img = imageSet(files);
    if ((!img && !docSet(files)) || blockKind() || passiveFiles()) return false;
    // Auch bei schon offener Meldung leeren und stoppen (fail-closed wie gate(), Auflage 13
    // MVP): die Seite darf die Auswahl nie ungeprueft lesen; neu waehlen nach der Meldung.
    stop(e);
    n.value = '';
    if (e.type === 'input') swallow = n;   // nur dann folgt noch das change des Browsers
    if (!pending) {
      (img ? checkImages : checkDocs)(files, (list) => {
        if (!n.isConnected) return;
        n.files = transfer(list).files;
        fire(n, new Event('input', { bubbles: true, composed: true }));
        fire(n, new Event('change', { bubbles: true }));
      });
    }
    return true;
  }

  function base64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const FAIL = ['size', 'type', 'timeout', 'busy'];

  // Bilder nacheinander (Auflage 10); Gesamtzeit LIMITS.ms, danach Meldung.
  async function checkImages(files, deliver) {
    const composer = site.findComposer();
    const p = { kind: 'imagewait', action: 'warn', composer, files, deliver };
    showDialog(p);
    const fail = (reason) => { if (pending === p) imageFail(p, reason); };
    if (files.length > B.LIMITS.images) return fail('count');
    const t0 = Date.now();
    const shots = [];
    try {
      for (const file of files) {
        const left = B.LIMITS.ms - (Date.now() - t0);
        if (left < 1000) return fail('timeout');
        if (file.size > B.LIMITS.bytes) return fail('size');
        let bytes = new Uint8Array(await file.arrayBuffer());
        if (pending !== p) return;
        const pre = B.precheck(bytes);
        if (!pre.ok) return fail(pre.reason);
        let data = base64(bytes);
        bytes = null;
        const res = await chrome.runtime.sendMessage({ t: 'ocr', data, lang: lang(), ms: left }).catch(() => null);
        data = null;
        if (pending !== p) return;
        if (!res || res.error || !B.validLines(res.lines)) return fail(res && FAIL.includes(res.error) ? res.error : 'fail');
        const { text, spans } = B.textOf(res.lines);
        if (text.trim()) await kiAwait(text, B.LIMITS.ms - (Date.now() - t0) - 500);
        if (pending !== p) return;
        const r = text.trim() ? check(text) : { findings: [], account: null };
        if (r.findings.some((f) => f.id === 'unscannable')) return fail('fail');
        // Ausweis/Rechnung: Fund ueber den ganzen Text (geschwaerzte Kopie deckt alle Woerter), zuerst genannt.
        for (const id of B.docType(text, r.findings)) {
          const action = DLX.engine.actionFor(id, eng);
          if (action !== 'off') r.findings.unshift({ id, cat: id === 'doc_identity' ? 'reise' : 'finanz', start: 0, end: text.length, action, sure: true });
        }
        const rects = r.findings.length ? B.rectsFor(r.findings, spans, res.scale, res.w, res.h) : [];
        if (!rects) return fail('fail');
        shots.push({ file, findings: r.findings, rects, account: r.account, w: res.w, h: res.h });
      }
    } catch (err) {
      return fail('fail');
    }
    if (pending !== p) return;
    const findings = shots.flatMap((s) => s.findings);
    if (!findings.length) {
      // Kein Fund: Meldung schliessen, Original weitergeben.
      pending = null;
      removeHost();
      chrome.runtime.sendMessage({ t: 'cancelPending' }).catch(() => {});
      deliver(files);
      return;
    }
    const acc = shots.find((s) => s.account);
    showDialog({ kind: 'image', composer, files, deliver, shots, findings, action: DLX.engine.strictest(findings), account: acc ? acc.account : null });
  }

  // Nicht pruefbar: Meldung statt still durchlassen; mit blockUncheckedFiles nur Abbrechen.
  function imageFail(p, reason) {
    showDialog({ kind: 'imagefail', action: cfg.blockUncheckedFiles ? 'block' : 'warn', composer: p.composer, files: p.files, deliver: p.deliver, reason });
  }

  // Geschwaerzte Kopie: deckend schwarz, neues PNG ohne Metadaten, neutraler Name (Auflage 8).
  async function redactImages(p) {
    const out = [];
    let n = 0;
    for (const s of p.shots) {
      if (!s.rects.length) { out.push(s.file); continue; }
      const bmp = await createImageBitmap(s.file);
      try {
        if (bmp.width !== s.w || bmp.height !== s.h) throw new Error('size');
        const c = new OffscreenCanvas(s.w, s.h);
        const ctx = c.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        ctx.fillStyle = '#000';
        for (const [x, y, w, h] of s.rects) ctx.fillRect(x, y, w, h);
        const blob = await c.convertToBlob({ type: 'image/png' });
        c.width = 0;
        c.height = 0;
        n++;
        out.push(new File([blob], n > 1 ? 'bild-geschwaerzt-' + n + '.png' : 'bild-geschwaerzt.png', { type: 'image/png' }));
      } finally {
        bmp.close();
      }
    }
    return out;
  }

  // --- Live-Hinweis beim Tippen (Design-Review Live-Hinweis A2-A7) ----------
  // Reiner Komfort: dieselbe Leiste, zeigt nur Datentyp-Namen und Anzahl, nie
  // Werte. Schuetzen tut allein die Pruefung beim Senden; Fehler hier aendern sie
  // nie (A7). Eintrag im Service Worker mit eigener Art "live" (Auflage 10).
  let liveTimer = null;
  let liveComposer = null;
  let composing = false;
  const live = { nonce: null, sig: null, at: 0, dismissed: null, ready: false };

  function scheduleLive(composer) {
    clearTimeout(liveTimer);
    if (aiBlocked) return;
    if (composer) liveComposer = composer;
    liveTimer = setTimeout(liveCheck, LIVE_MS);
  }

  function hideLive() {
    if (ui && ui.kind === 'live') removeHost();
    live.nonce = null;
    live.sig = null;
  }

  // Funde bleiben in dieser Funktion; heraus geht nur die wertfreie Liste (A4/A5).
  function liveSummary(text, acc) {
    const res = DLX.engine.scan(text, eng);
    const dm = DLX.fingerprint.scan(text, eng.fp);
    if (res.unscannable || dm.timeout) return null;   // Budget/Laenge: Hinweis weglassen, nicht "sauber" (A6)
    let list = withKi(text, Array.from(res.findings));
    if (dm.hit) list.push(docMatch());
    // Langer Text: KI hat nur den Anfang gesehen (Auflage 15), dezent anzeigen.
    if (kiOn() && ki.ents && text.length > DLX.ki.MAX_TEXT) list.push({ id: 'ki_partial', cat: 'unscannable', start: 0, end: 0, action: 'warn', sure: false });
    // Konto-Stufe: allow zeigt nur harte Sperren, hint zeigt den Rest grau.
    const level = acc ? acc.level : 'normal';
    if (level === 'allow') list = list.filter((f) => f.action === 'block');
    const strong = (f) => loud(f) && (level !== 'hint' || f.action === 'block');
    // Nur unsichere Typen tragen sure:false (grauer Hinweis); sonst nur ID/Kategorie/Anzahl.
    return Array.from(DLX.engine.summarize(list), (s) => Object.assign({ id: s.id, cat: s.cat, n: s.n },
      list.some((f) => f.id === s.id && strong(f)) ? {} : { sure: false }));
  }

  function liveCheck() {
    try {
      if (ui && ui.kind === 'view') return;   // Ansicht mit echten Werten bleibt offen
      const c = liveComposer && liveComposer.isConnected ? liveComposer : site.findComposer();
      liveComposer = c;
      if (!c || pending || composing || !siteAllowed()) { hideLive(); return; }
      const text = site.readText(c);
      // KI-Pruefung anstossen; ihr Ergebnis zeigt die naechste Runde dieses Hinweises.
      kiRequest(text, () => { if (!pending && liveComposer === c) liveCheck(); });
      const acc = text && text.trim() ? accountState() : null;
      const items = text && text.trim() ? liveSummary(text, acc) : null;
      if (!items || !items.length) { hideLive(); live.dismissed = null; return; }
      const account = acc ? acc.type : null;
      const sig = JSON.stringify([items, account]);
      if (sig === live.dismissed) { hideLive(); return; }
      showLive(c, items, sig, account);
    } catch (err) {
      try { hideLive(); } catch (err2) { /* Hinweis von der Seite zerlegt: Sende-Pruefung bleibt */ }
    }
  }

  function showLive(c, items, sig, account) {
    const r = barRect(c, 'live');
    if (!r) { hideLive(); return; }
    const fresh = ui && ui.kind === 'live' && ui.host.isConnected && live.nonce && live.sig === sig && Date.now() - live.at < LIVE_RENEW_MS;
    if (fresh) { ui.composer = c; follow(); return; }
    const first = !(ui && ui.kind === 'live' && ui.host.isConnected);
    live.sig = sig;
    live.at = Date.now();
    chrome.runtime.sendMessage({ t: 'found', mode: 'live', action: 'warn', items, layout: 'bar', theme: pageTheme(c), renew: !first, account: account || null }).then((res) => {
      if (!res || !res.nonce || pending || live.sig !== sig) return;
      live.nonce = res.nonce;
      if (first || !ui || ui.kind !== 'live') { live.ready = false; createHost('live', 'bar', r, c); }
    }).catch(() => { try { hideLive(); } catch (err) { /* A7 */ } });
  }

  // Schwaerzen aus dem Hinweis: neu scannen, keine gespeicherten Positionen (A4); wie B11.
  function redactLive(choice) {
    const c = liveComposer;
    hideLive();
    if (!c || !c.isConnected || !site.inComposer([c]) || pending) return;
    const text = site.readText(c);
    const res = DLX.engine.scan(text, eng);
    const findings = res.unscannable ? [] : withKi(text, Array.from(res.findings));
    if (findings.length) {
      selectAllIn(c);
      insertText(c, replaced(text, findings, choice));
    }
    scheduleLive(c);
  }

  // --- Antwort mit Platzhaltern (Design-Review Platzhalter 14.10.2026) ------
  // Liest nur (hoechstens 20000 Zeichen), schreibt nie ins Seiten-DOM. Die
  // Leiste nennt nur Arten und Anzahl; echte Werte zeigt allein die Ansicht
  // ui/view.html (erweiterungseigene Herkunft, Auflagen 3-6).
  const ANSWER_MAX = 20000;
  const PH_ONE = new RegExp(DLX.pseudonym.PATTERN.source);
  const reveal = { nonce: null, el: null, sig: null, dismissed: new WeakSet() };
  const view = { nonce: null, el: null };

  // Letzter Textknoten mit Platzhalter ausserhalb des Eingabefelds, aufwaerts bis
  // 6 Ebenen, solange der Vorfahr das Feld nicht enthaelt.
  function findAnswer() {
    if (!document.body) return null;
    const composer = site.findComposer();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let last = null;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.data.indexOf('[') === -1 || !PH_ONE.test(n.data) || (composer && composer.contains(n))) continue;
      const p = n.parentElement;   // nur sichtbarer Text (kein script/style/template)
      if (p && !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA)$/.test(p.tagName) && p.getClientRects().length) last = n;
    }
    let el = last && last.parentElement;
    if (!el || (el.closest && el.closest('[contenteditable="true"], textarea, input'))) return null;
    for (let i = 0; i < 6; i++) {
      const up = el.parentElement;
      if (!up || up === document.body || (composer && up.contains(composer)) || up.textContent.length > ANSWER_MAX) break;
      el = up;
    }
    return el;
  }
  const answerText = (el) => String(el.innerText || el.textContent || '').slice(0, ANSWER_MAX);

  function hideReveal() {
    if (ui && ui.kind === 'reveal') removeHost();
    reveal.nonce = null;
    reveal.sig = null;
  }

  function revealCheck() {
    try {
      if (aiBlocked || !pseudo.size || !placeholdersOn() || document.visibilityState !== 'visible' || pending) return;
      if (ui && ui.kind !== 'reveal' && ui.kind !== 'answer') return;   // Sende-/Live-/Ansicht gehen vor
      const el = findAnswer();
      if (!el || reveal.dismissed.has(el)) { hideReveal(); return; }
      const items = pseudo.summary(answerText(el));
      if (!items.length) { hideReveal(); return; }
      const c = site.findComposer();
      const r = barRect(c, 'reveal');
      if (!r) { hideReveal(); return; }
      const sig = JSON.stringify(items);
      if (ui && ui.kind === 'reveal' && reveal.nonce && reveal.el === el && reveal.sig === sig) { ui.composer = c; follow(); return; }
      reveal.el = el;
      reveal.sig = sig;
      chrome.runtime.sendMessage({ t: 'found', mode: 'reveal', action: 'warn', items, layout: 'bar', theme: pageTheme(c) }).then((res) => {
        if (!res || !res.nonce || pending || reveal.sig !== sig || (ui && ui.kind !== 'reveal')) return;
        reveal.nonce = null;
        createHost('reveal', 'bar', r, c);
        reveal.nonce = res.nonce;
      }).catch(() => {});
    } catch (err) {
      try { hideReveal(); } catch (err2) { /* Hinweis von der Seite zerlegt: Schutz bleibt */ }
    }
  }

  function openView(nonce) {
    const el = reveal.el;
    if (el) reveal.dismissed.add(el);   // nach dem Schliessen nicht erneut fuer dieselbe Antwort
    hideReveal();
    if (!placeholdersOn() || pending) return;
    createHost('view', 'full', null, site.findComposer(), nonce);
    view.nonce = nonce;
    view.el = el;
  }

  function closeView() {
    if (ui && ui.kind === 'view') removeHost();
    view.nonce = null;
    view.el = null;
  }

  // Text erst beim Abruf lesen (Antwort kann noch wachsen), Ruecktausch in einem Durchgang.
  function viewText() {
    const el = view.el && view.el.isConnected ? view.el : findAnswer();
    return el ? pseudo.restore(answerText(el)) : '';
  }

  // --- KI-Antworten pruefen (Design-Review Antwort/Zwischenablage 16.10.2026) ---
  // Letzte Antwort lokal mit Regeln/Katalog pruefen (nur sichere Funde), Funde per
  // CSS Custom Highlight dezent markieren (Name zufaellig je Seitenladen, fremde
  // Registrierungen nie angefasst, Auflage 2); die Leiste nennt nur Typ und Anzahl.
  // Text, Werte und Ranges verlassen dieses Skript nie (Auflage 3).
  const ANSWER_SEL = ['[data-message-author-role="assistant"]', 'model-response', '[data-testid="assistant-message"]',
    '.font-claude-response', '[data-content="ai-message"]'].join(',');
  const ANSWER_BUDGET_MS = 50;      // eigenes Zeitbudget je Durchlauf (Auflage 1)
  const ANSWER_COPY_MS = 8000;
  const BLOCKS = 'p,div,li,pre,td,th,tr,h1,h2,h3,h4,h5,h6,blockquote,dd,dt,section,article';
  const ans = { nonce: null, el: null, sig: null, items: null, copyItems: null, copyUntil: 0, barSig: null, dismissed: null, hl: null, sheet: null, name: null };
  const answerOn = () => cfg.answerCheck !== 'off' && !aiBlocked;

  function lastAnswer() {
    const list = document.querySelectorAll(ANSWER_SEL);
    const c = site.findComposer();
    for (let i = list.length - 1; i >= 0; i--) {
      const el = list[i];
      if (el.getClientRects().length && !(c && (el.contains(c) || c.contains(el)))) return el;
    }
    return null;
  }
  // Textknoten in Leserichtung; zwischen Bloecken ein Zeilenumbruch, damit Werte
  // aus zwei Absaetzen nie zusammenwachsen. Hoechstens ANSWER_MAX Zeichen.
  function answerNodes(el) {
    const nodes = [], starts = [];
    let text = '', prevBlock = null;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n && text.length < ANSWER_MAX; n = w.nextNode()) {
      const p = n.parentElement;
      if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) continue;
      const block = p.closest(BLOCKS);
      if (nodes.length && block !== prevBlock) text += '\n';
      prevBlock = block;
      nodes.push(n);
      starts.push(text.length);
      text += n.data;
    }
    return { nodes, starts, text: text.slice(0, ANSWER_MAX) };
  }
  // Position im Gesamttext -> [Textknoten, Versatz]; end: letztes Zeichen zaehlt.
  function pointAt(a, pos, end) {
    const want = end ? pos - 1 : pos;
    let lo = 0, hi = a.starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (a.starts[mid] <= want) lo = mid; else hi = mid - 1; }
    const n = a.nodes[lo];
    return [n, Math.max(0, Math.min(n.data.length, pos - a.starts[lo]))];
  }
  function unmark() {
    if (ans.hl && g.CSS && CSS.highlights && CSS.highlights.has(ans.name)) CSS.highlights.delete(ans.name);
    ans.hl = null;
  }
  function mark(a, found) {
    if (!g.CSS || !CSS.highlights || typeof Highlight !== 'function' || typeof CSSStyleSheet !== 'function') return;
    if (!ans.name) ans.name = 'h' + Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => x.toString(16).padStart(2, '0')).join('');
    if (!ans.hl && CSS.highlights.has(ans.name)) return;   // fremde Registrierung: nie ueberschreiben
    if (!found.length || !a.nodes.length) { unmark(); return; }
    if (!ans.sheet) {
      ans.sheet = new CSSStyleSheet();
      ans.sheet.replaceSync('::highlight(' + ans.name + ') { text-decoration: underline dotted #b42318 2px; text-underline-offset: 3px; background-color: rgba(180, 35, 24, 0.08); }');
    }
    if (document.adoptedStyleSheets.indexOf(ans.sheet) === -1) document.adoptedStyleSheets = document.adoptedStyleSheets.concat(ans.sheet);
    const ranges = found.map((f) => {
      const r = document.createRange();
      r.setStart(...pointAt(a, f.start, false));
      r.setEnd(...pointAt(a, f.end, true));
      return r;
    });
    ans.hl = new Highlight(...ranges);
    CSS.highlights.set(ans.name, ans.hl);
  }
  function scanQuiet(text) {
    const t0 = performance.now();
    // Engine-Budget auf ANSWER_BUDGET_MS verkuerzen: ihre Uhr laeuft entsprechend schneller.
    const k = DLX.engine.BUDGET_MS / ANSWER_BUDGET_MS;
    const res = DLX.engine.scan(text, eng, () => t0 + (performance.now() - t0) * k);
    return res.unscannable ? null : Array.from(res.findings).filter((f) => f.sure !== false && f.action !== 'off');
  }
  const summaryOf = (found) => (found && found.length ? Array.from(DLX.engine.summarize(found), (s) => ({ id: s.id, cat: s.cat, n: s.n })) : null);

  function hideAnswer() {
    if (ui && ui.kind === 'answer') removeHost();
    ans.nonce = null;
    ans.barSig = null;
  }
  function clearAnswer() {
    hideAnswer();
    unmark();
    ans.el = null;
    ans.sig = null;
    ans.items = null;
  }
  function answerCheck() {
    try {
      if (!answerOn()) { clearAnswer(); return; }
      if (document.visibilityState !== 'visible') return;
      const el = lastAnswer();
      if (!el) { clearAnswer(); return; }
      const a = answerNodes(el);
      // Nur neu pruefen, wenn sich Laenge oder Pruefsumme geaendert haben (Auflage 1).
      const sig = a.text.length + ':' + DLX.dictionary.sha256Hex(a.text);
      if (el !== ans.el || sig !== ans.sig) {
        const found = scanQuiet(a.text);
        if (!found) return;   // Budget ueberschritten: naechster Takt versucht es erneut
        ans.el = el;
        ans.sig = sig;
        ans.items = summaryOf(found);
        mark(a, found);
      }
      answerBar();
    } catch (err) {
      try { clearAnswer(); } catch (err2) { /* Hinweis von der Seite zerlegt: Pruefung beim Senden bleibt */ }
    }
  }
  function answerBar() {
    const copy = Date.now() < ans.copyUntil && ans.copyItems;
    const items = copy ? ans.copyItems : ans.dismissed === ans.sig ? null : ans.items;
    if (!items) { hideAnswer(); return; }
    if (pending || (ui && ui.kind !== 'answer')) return;   // Senden/Live/Platzhalter gehen vor
    const c = site.findComposer();
    const r = barRect(c, 'answer');
    if (!r) { hideAnswer(); return; }
    const sig = JSON.stringify([copy ? 'copy' : '', items, ans.sig]);
    if (ui && ui.kind === 'answer' && ans.nonce && ans.barSig === sig) { ui.composer = c; follow(); return; }
    ans.barSig = sig;
    chrome.runtime.sendMessage({ t: 'found', mode: 'answer', action: 'warn', items, layout: 'bar', theme: pageTheme(c), reason: copy ? 'copy' : null }).then((res) => {
      if (!res || !res.nonce || pending || ans.barSig !== sig || (ui && ui.kind !== 'answer')) return;
      createHost('answer', 'bar', r, c);
      ans.nonce = res.nonce;
    }).catch(() => {});
  }
  // Kopieren auf der KI-Seite: nur die Auswahl lesen, nie clipboardData aendern
  // oder das Kopieren stoppen (Auflage 4).
  function onCopy(e) {
    try {
      if (!answerOn() || site.inComposer(e.composedPath())) return;
      const s = g.getSelection && g.getSelection();
      const text = s ? String(s.toString()).slice(0, ANSWER_MAX) : '';
      const found = text.trim() ? scanQuiet(text) : null;
      const items = summaryOf(found);
      if (!items) return;
      ans.copyItems = items;
      ans.copyUntil = Date.now() + ANSWER_COPY_MS;
      answerBar();
    } catch (err) { /* nur Hinweis */ }
  }

  // --- Zwischenablage aus vertraulichen Quellen (Design-Review Antwort/Zwischenablage 16.10.2026) ---
  // Nur Pruefsummen mit Salz vom Service Worker, nur im Speicher dieses Skripts
  // (Auflagen 13, 15, 16); Abgleich synchron beim Einfuegen.
  const HEX64 = /^[0-9a-f]{64}$/;
  const src = { v: -1, salt: null, marks: [] };
  function srcApply(r) {
    if (!r || !Number.isInteger(r.v) || r.v < src.v) return;
    src.v = r.v;
    src.salt = typeof r.salt === 'string' && HEX64.test(r.salt) ? r.salt : null;
    src.marks = Array.isArray(r.marks) ? r.marks.filter((m) => m && typeof m.h === 'string' && HEX64.test(m.h) && Number.isFinite(m.exp)).slice(-20) : [];
  }
  let srcPulled = 0;
  function srcPull() {
    if (Date.now() - srcPulled < 200) return;
    srcPulled = Date.now();
    chrome.runtime.sendMessage({ t: 'srcMarks' }).then(srcApply).catch(() => {});
  }
  function fromSource(text) {
    if (!src.salt || !src.marks.length) return false;
    const n = DLX.quellen.normalize(text);
    if (!DLX.quellen.hashable(n)) return false;
    const h = DLX.dictionary.sha256Hex(src.salt + ':' + DLX.dictionary.sha256Hex(n));
    const now = Date.now();
    return src.marks.some((m) => m.h === h && m.exp > now);
  }
  srcPull();
  window.addEventListener('focus', srcPull);
  // Der Push erreicht KI-Tabs nur mit Host-Recht (tabs.query mit URL-Filter findet
  // statische Content-Script-Seiten nicht, E2E 16.10.2026). Darum zusaetzlich vor jedem
  // Einfuegeweg abholen: Strg/Cmd gedrueckt (vor dem V), Kontextmenue, Ziehen ueber die Seite.
  window.addEventListener('keydown', (e) => { if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Shift' || e.key === 'Insert') srcPull(); }, { capture: true });
  window.addEventListener('contextmenu', srcPull, { capture: true });
  window.addEventListener('dragenter', srcPull, { capture: true });
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') srcPull(); }, { capture: true });

  function dropPlaceholders() {
    pseudo.clear();
    hideReveal();
    closeView();
  }

  // Listener frueh auf window in der Capture-Phase (B9).
  const opts = { capture: true };
  // Enter = Senden, wenn ohne Shift, ausserhalb einer IME-Komposition und im Feld.
  // --- Sprachmodus (Design-Review Diktat und Fingerabdruecke 16.10.2026, Teil A) ---
  // Im Sprachmodus geht Gesprochenes ohne Text an die KI: nicht pruefbar. Richtlinie
  // voiceMode: allow | warn | block. warn ohne allowUserOverride wirkt wie block, "Trotzdem"
  // gilt nur im Speicher bis zum Neuladen (Auflage 5). Erkennung ueber composedPath (auch
  // Shadow DOM); Tastatur (Enter/Leertaste) loest click aus und ist damit erfasst (Auflage 3).
  let voiceOk = false;
  function onVoice(e) {
    if (cfg.voiceMode === 'allow' || !site.isVoiceButton(e.composedPath())) return;
    if (aiBlocked || pending) { stop(e); return; }
    const action = cfg.voiceMode === 'warn' && cfg.allowUserOverride === true ? 'warn' : 'block';
    if (action === 'warn' && voiceOk) return;
    stop(e);
    showDialog({ kind: 'voice', action });
  }
  for (const type of ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click']) window.addEventListener(type, onVoice, opts);

  // Diktat: Transkripte erscheinen oft ohne input-Ereignis im Feld. Im 3-s-Takt startet ein
  // geaenderter Feldtext die Live-Pruefung; Laenge und Pruefsumme nur in dieser Variable,
  // nie gespeichert; nicht bei verborgener Seite oder ohne Feld (Auflage 1). Senden wird
  // davon unabhaengig immer geprueft, auch bei automatischem Senden (Auflage 2).
  // Bei offener Meldung oder IME-Eingabe wird nur der Stand nachgefuehrt, nicht geprueft
  // (sonst gaelte ein Diktat direkt nach dem Schliessen einer Meldung als Ausgangsstand; E2E 16.10.2026).
  let dictSig = null;
  function dictationCheck() {
    if (document.hidden || aiBlocked) return;
    const c = site.findComposer();
    if (!c) return;
    const text = site.readText(c);
    const sig = text.length + ':' + textHash('feld', text);
    if (sig === dictSig) return;
    const first = dictSig === null;
    dictSig = sig;
    if (!first && !pending && !composing && text.trim()) scheduleLive(c);
  }

  const sendEnter = (e) => e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && site.inComposer(e.composedPath());
  // Wurde das keydown gestoppt, gilt das fuer dieselbe Tastenfolge (keypress,
  // keyup, beforeinput): manche Seiten senden erst dort. Merker bis keyup bzw.
  // hoechstens 1 s (Design-Review 13.10.2026 Auflage 3).
  let enterHeld = false;
  let enterTimer = null;
  window.addEventListener('keydown', (e) => {
    // Escape im Feld bei offener Leiste = Bearbeiten (Abbrechen, nie Senden).
    if (e.key === 'Escape' && pending && ui && ui.layout === 'bar' && site.inComposer(e.composedPath())) { failClosed(); return; }
    if (e.key === 'Escape' && ui && ui.kind === 'view') { closeView(); return; }
    if (!sendEnter(e)) return;
    onSend(e);
    if (e.defaultPrevented && pending) {
      enterHeld = true;
      clearTimeout(enterTimer);
      enterTimer = setTimeout(() => { enterHeld = false; }, 1000);
    }
    scheduleLive(null);
  }, opts);
  for (const type of ['keypress', 'keyup']) {
    window.addEventListener(type, (e) => {
      if (!sendEnter(e)) return;
      if (enterHeld || pending) stop(e);
      if (type === 'keyup') { enterHeld = false; clearTimeout(enterTimer); }
    }, opts);
  }
  // Senden-Knopf: manche Seiten senden schon bei pointerdown/mousedown/touch.
  // Jede dieser Gesten prueft den aktuellen Text; ist eine Meldung offen, stoppt
  // gate() auch die Folgeereignisse bis zum click.
  for (const type of ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend']) {
    window.addEventListener(type, (e) => { if (site.isSendButton(e.composedPath())) onSend(e); }, opts);
  }
  window.addEventListener('click', (e) => {
    const path = e.composedPath();
    const fileInput = path.find((n) => n && n.tagName === 'INPUT' && n.type === 'file');
    if (fileInput) {
      const kind = blockKind() || (cfg.blockUncheckedFiles && !passiveFiles() ? 'fileblock' : null);
      if (kind) { stop(e); if (!pending) showDialog({ kind, action: 'block' }); }
      return;
    }
    if (site.isSendButton(path)) { onSend(e); scheduleLive(null); }
  }, opts);
  window.addEventListener('submit', (e) => {
    const form = e.target;
    if (form && form.querySelector && site.findComposer() && form.contains(site.findComposer())) onSend(e);
  }, opts);
  window.addEventListener('paste', (e) => { if (!own.has(e)) onInsert(e, e.clipboardData); }, opts);
  window.addEventListener('drop', (e) => { if (!own.has(e)) onInsert(e, e.dataTransfer); }, opts);
  window.addEventListener('copy', onCopy, opts);
  window.addEventListener('beforeinput', (e) => {
    if (own.has(e)) return;
    if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') onInsert(e, e.dataTransfer);
    // Absatz aus einem gestoppten Enter (nie ein freies Shift+Enter).
    else if (e.inputType === 'insertParagraph' && (enterHeld || pending) && site.inComposer(e.composedPath())) stop(e);
  }, opts);
  window.addEventListener('change', (e) => {
    if (own.has(e)) return;
    const n = e.target;
    if (n && n === swallow) { swallow = null; stop(e); return; }
    if (fileInputImages(e)) return;
    if (n && n.tagName === 'INPUT' && n.type === 'file' && n.files && n.files.length) onFiles(e);
  }, opts);
  window.addEventListener('input', (e) => {
    if (own.has(e) || fileInputImages(e)) return;
    const c = site.composerIn(e.composedPath());
    // Eingabe im Feld bei offener Meldung = Bearbeiten: Abbrechen, nie Senden (Auflage 13).
    if (c && pending) failClosed();
    if (e.isComposing || composing) return;
    if (c) scheduleLive(c);
  }, opts);
  window.addEventListener('compositionstart', () => { composing = true; clearTimeout(liveTimer); }, opts);
  window.addEventListener('compositionend', (e) => { composing = false; scheduleLive(site.composerIn(e.composedPath())); }, opts);
  window.addEventListener('pagehide', () => {
    clearTimeout(liveTimer);
    if (!pending && (live.nonce || reveal.nonce || view.nonce)) chrome.runtime.sendMessage({ t: 'cancelPending', views: true }).catch(() => {});
    hideLive();
    failClosed();
    dropPlaceholders();
    clearAnswer();
    hideRephrased();
    dropTails();
  }, opts);
  // Seitennachrichten werden bewusst ignoriert (kein window.message-Listener, A4).

  // --- Status "Schutz aktiv/nicht aktiv" (A6, B10) ---------------------------
  function status() {
    const composer = site.findComposer();
    let active = !!composer && siteAllowed() && !aiBlocked;
    if (active && site.readText(composer).trim() && !site.findSendButton()) active = false;
    // Training-Ampel: Kontoart nur als Enum und nur mit accountRules fuer die Seite
    // (Design-Review Training-Ampel 16.10.2026, Auflage 8).
    const account = cfg.accountRules && Object.hasOwn(cfg.accountRules, site.id)
      ? DLX.account.detect(site.id, cfg.accountRules[site.id], site.composerSelector).type || 'unknown' : null;
    if (active !== lastStatus || account !== lastAccount) {
      lastStatus = active;
      lastAccount = account;
      chrome.runtime.sendMessage(account ? { t: 'status', active, account } : { t: 'status', active }).catch(() => {});
    }
  }
  setInterval(() => { status(); if (ui && ui.kind === 'live') liveCheck(); dictationCheck(); revealCheck(); answerCheck(); }, 3000);
})(globalThis);
