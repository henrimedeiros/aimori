// Meldungs-Frame (ui/dialog.js) in einem Mini-DOM: Leiste, "Trotzdem" nur mit zwei
// echten Klicks bei bestaetigter Sichtbarkeit, nudge mit neuen Daten loest kein
// spontanes Abbrechen/Ausblenden aus (Design-Review 14.10.2026 Auflagen 5, 7, 9, 12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, ENGINE_FILES } from './helpers/load.mjs';

class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.text = ''; this.style = {}; this.disabled = false; this.parent = null;
    this.classList = { set: new Set(), add: (c) => this.classList.set.add(c), remove: (c) => this.classList.set.delete(c),
      toggle: (c, on) => (on ? this.classList.set.add(c) : this.classList.set.delete(c)) }; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.hasOwn(this.attrs, k) ? this.attrs[k] : null; }
  hasAttribute(k) { return Object.hasOwn(this.attrs, k); }
  append(...n) { for (const c of n) { c.parent = this; this.children.push(c); } }
  replaceChildren(...n) { this.children = []; this.append(...n); }
  set textContent(v) { this.children = []; this.text = String(v); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  addEventListener(t, f) { (this.listeners[t] || (this.listeners[t] = [])).push(f); }
  getBoundingClientRect() { return { width: 100, height: Node.layout ? Node.layout.h : undefined }; }
  // Layout-Attrappe fuer fit() (Leiste misst sich selbst), nur wenn ein Test sie setzt
  get isConnected() { return !!Node.layout; }
  get scrollWidth() { return Node.layout ? Node.layout.sw : 0; }
  get clientWidth() { return Node.layout ? Node.layout.cw : 0; }
  focus() {}
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
}

function setup(first, innerWidth) {
  const doc = { body: new Node('body'), documentElement: new Node('html'), hidden: false, listeners: {} };
  doc.documentElement.style.setProperty = () => {};
  doc.createElement = (t) => new Node(t);
  doc.createElementNS = (ns, t) => new Node(t);
  doc.createTextNode = (s) => Object.assign(new Node('#text'), { text: s });
  doc.querySelectorAll = (sel) => doc.body.all((n) => sel === 'button' && n.tagName === 'BUTTON');
  doc.addEventListener = (t, f) => { doc.listeners[t] = f; };
  let now = 0;
  const timers = [];
  const observers = [];
  const sent = [];
  let onMsg = null;
  let info = first;
  const chrome = {
    runtime: {
      id: 'x',
      getURL: (p) => 'chrome-extension://x/' + p,
      sendMessage: (m) => { sent.push(m); return Promise.resolve(m.t === 'hello' ? JSON.parse(JSON.stringify(info)) : { ok: true }); },
      onMessage: { addListener: (f) => { onMsg = f; } },
    },
  };
  class IO {
    constructor(cb) { this.cb = cb; this.targets = []; this.off = false; observers.push(this); }
    observe(t) { this.targets.push(t); }
    disconnect() { this.off = true; }
    fire(visible, target) { this.cb([{ target: target || this.targets[0], isVisible: visible }]); }
  }
  const win = { addEventListener: () => {}, innerWidth };
  win.top = {};
  const ctx = {
    document: doc, window: win, chrome, navigator: { language: 'de-CH' }, innerHeight: 44, IntersectionObserver: IO,
    matchMedia: () => ({ matches: false }), performance: { now: () => now },
    setTimeout: (f, ms) => { timers.push({ at: now + ms, f }); return timers.length; }, clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].f = null; },
    requestAnimationFrame: (f) => f(),
  };
  load(['branding.js', ...ENGINE_FILES, 'common/i18n.js', 'common/dom.js', 'ui/dialog.js'], ctx);
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const advance = (ms) => { const end = now + ms; for (const t of timers) if (t.f && t.at <= end) { now = Math.max(now, t.at); const f = t.f; t.f = null; f(); } now = end; };
  const button = (k) => doc.body.all((n) => n.getAttribute('data-k') === k)[0];
  const click = (k, trusted = true) => { const b = button(k); for (const f of b.listeners.click || []) f({ isTrusted: trusted, target: b }); };
  const decisions = () => sent.filter((m) => m.t === 'decide');
  return { doc, observers, sent, decisions, flush, advance, button, click, setInfo: (i) => { info = i; }, nudge: () => onMsg({ t: 'nudge' }, { id: 'x' }) };
}

const BASE = { action: 'warn', layout: 'bar', theme: 'hell', allowOverride: true, branding: { productName: 'Example' }, language: 'de', managed: false };
const LIVE = Object.assign({}, BASE, { mode: 'live', items: [{ id: 'iban', cat: 'finanz', n: 1 }] });
const SEND = Object.assign({}, BASE, { mode: 'send', items: [{ id: 'iban', cat: 'finanz', n: 1 }] });

test('Leiste: eine Zeile, Typ ohne Wert, keine Knoepfe ausser Schwaerzen/Ausblenden beim Live-Hinweis', async () => {
  const s = setup(LIVE);
  await s.flush();
  assert.match(s.doc.body.textContent, /IBAN erkannt – vor dem Senden schwärzen\?/);
  assert.ok(s.button('redact') && s.button('hide'));
  assert.equal(s.button('override'), undefined);
  assert.equal(s.doc.documentElement.getAttribute('data-theme'), 'hell');
});

test('nudge mit neuen Daten: alter Beobachter getrennt, kein spontanes Abbrechen/Ausblenden', async () => {
  const s = setup(LIVE);
  await s.flush();
  const old = s.observers[0];
  const oldTarget = old.targets[0];
  old.fire(true);
  s.setInfo(Object.assign({}, LIVE, { items: [{ id: 'iban', cat: 'finanz', n: 1 }, { id: 'ahv', cat: 'sozial', n: 1 }] }));
  s.nudge();
  await s.flush();
  assert.equal(old.off, true, 'alter IntersectionObserver getrennt');
  assert.match(s.doc.body.textContent, /IBAN, /, 'neu gezeichnet mit beiden Funden');
  s.observers[1].fire(true);                // neues Element sichtbar
  old.fire(false, oldTarget);              // spaete Meldung des alten Elements
  s.advance(5000);                          // alter FIRST_SEEN-Zeitgeber darf nicht feuern
  await s.flush();
  assert.deepEqual(s.decisions(), [], 'kein decide');
  // Verlust der Sichtbarkeit des aktuellen Elements -> Ausblenden (fail-closed beim Live-Hinweis).
  s.observers[1].fire(false);
  await s.flush();
  assert.deepEqual(s.decisions().map((d) => d.choice), ['hide']);
});

// Schlanke Leiste: sichtbar nur Hauptaktion und Bearbeiten/Verwerfen; der Rest
// liegt versteckt hinter "Weitere Optionen", das Aufklappen sperrt Klicks 400 ms und macht die Leiste zweizeilig.
test('Leiste: nur Schwaerzen und Bearbeiten sichtbar, Platzhalter/Umformulieren/Trotzdem/Kein sensibler Wert hinter "Weitere Optionen"', async () => {
  try {
    Node.layout = { sw: 900, cw: 900, h: 120 };
    const s = setup(Object.assign({}, SEND, { allowPlaceholders: true, allowRephrase: true, allowNotSensitive: true }));
    await s.flush();
    const akt = s.doc.body.children[0].children.find((n) => n.getAttribute('class') === 'dlx-bar-aktionen');
    const sichtbar = akt.children.filter((n) => n.getAttribute('class') !== 'dlx-optionen').map((n) => n.getAttribute('data-k'));
    assert.deepEqual(sichtbar, ['redact', 'cancel', 'more']);
    const box = akt.children.find((n) => n.getAttribute('class') === 'dlx-optionen');
    assert.deepEqual(box.children.map((n) => n.getAttribute('data-k')), ['pseudonym', 'rephrase', 'override', 'notsensitive', 'learn']);
    assert.equal(box.hidden, true, 'zugeklappt');
    assert.equal(s.button('more').getAttribute('aria-expanded'), 'false');
    s.click('more', false);
    assert.equal(box.hidden, true, 'unechter Klick klappt nicht auf');
    s.click('more');
    assert.equal(box.hidden, false, 'aufgeklappt');
    assert.equal(s.button('more').getAttribute('aria-expanded'), 'true');
    assert.equal(s.doc.body.children[0].classList.set.has('dlx-bar-2'), true, 'aufgeklappt zweizeilig');
    s.click('pseudonym');
    assert.deepEqual(s.decisions(), [], 'direkt nach dem Aufklappen 400 ms keine Klicks');
    s.advance(400);
    s.click('pseudonym');
    await s.flush();
    assert.deepEqual(s.decisions().map((d) => d.choice), ['pseudonym']);
  } finally {
    Node.layout = null;
  }
  const live = setup(Object.assign({}, LIVE, { allowPlaceholders: true }));
  await live.flush();
  const la = live.doc.body.children[0].children.find((n) => n.getAttribute('class') === 'dlx-bar-aktionen');
  assert.deepEqual(la.children.filter((n) => n.getAttribute('class') !== 'dlx-optionen').map((n) => n.getAttribute('data-k')), ['redact', 'more', 'hide'], 'Live-Hinweis: Ausblenden bleibt ganz rechts');
  const none = setup(Object.assign({}, SEND, { allowOverride: false, items: [{ id: 'unscannable', cat: 'x', n: 1 }] }));
  await none.flush();
  assert.equal(none.button('more'), undefined, 'ohne Zusatzoptionen kein Knopf');
});

// Security-Pruefung 17.10.2026: Zuklappen entschaerft "Trotzdem"; nach Zu- und Aufklappen loest ein einzelner Klick nichts aus.
test('Weitere Optionen: scharfes "Trotzdem" wird beim Zuklappen entschaerft, ein einzelner Klick danach sendet nicht', async () => {
  const s = setup(SEND);
  await s.flush();
  s.advance(100);
  s.observers[0].fire(true);
  s.advance(400);
  s.click('more'); s.advance(400);
  const label = s.button('override').textContent;
  s.click('override');
  assert.notEqual(s.button('override').textContent, label, 'erster Klick: Rueckfrage sichtbar');
  s.advance(500);
  s.click('more'); s.advance(400);             // zuklappen
  assert.equal(s.button('override').textContent, label, 'zugeklappt: wieder Normaltext');
  s.click('more'); s.advance(400);             // wieder aufklappen
  assert.equal(s.button('override').textContent, label, 'aufgeklappt: Normaltext, nicht scharf');
  s.click('override');
  await s.flush();
  assert.deepEqual(s.decisions(), [], 'ein einzelner Klick nach Zu-/Aufklappen sendet nicht');
  assert.notEqual(s.button('override').textContent, label, 'er schaltet nur neu scharf');
  s.advance(500); s.click('override');
  await s.flush();
  assert.deepEqual(s.decisions().map((d) => d.choice), ['override'], 'erst der zweite Klick sendet');
});

test('Senden: "Trotzdem" nur mit zwei echten Klicks (400 ms bis 4 s) bei >= 400 ms Sichtbarkeit; verdeckt = Abbrechen', async () => {
  const s = setup(SEND);
  await s.flush();
  assert.match(s.doc.body.textContent, /Senden angehalten: IBAN erkannt/);
  s.click('override'); s.advance(500); s.click('override');
  assert.deepEqual(s.decisions(), [], 'ohne bestaetigte Sichtbarkeit nichts');
  s.observers[0].fire(true);
  s.advance(400);
  s.click('override', false); s.advance(500); s.click('override', false);
  assert.deepEqual(s.decisions(), [], 'unechte Klicks zaehlen nicht');
  s.click('override'); s.advance(100); s.click('override');
  assert.deepEqual(s.decisions(), [], 'zweiter Klick unter 400 ms zaehlt nicht');
  s.advance(4000);
  assert.equal(s.button('override').textContent, 'Trotzdem senden', 'nach 4 s zurueckgesetzt');
  s.click('override'); s.advance(500); s.click('override');
  await s.flush();
  assert.deepEqual(s.decisions().map((d) => [d.choice, d.confirmed]), [['override', true]]);
  const c = setup(SEND);
  await c.flush();
  c.observers[0].fire(true);
  c.observers[0].fire(false);
  await c.flush();
  assert.deepEqual(c.decisions().map((d) => d.choice), ['cancel'], 'verdeckt nach Sichtbarkeit = Abbrechen');
});

test('Richtlinie block: nur Bearbeiten, kein Schwaerzen, kein Trotzdem', async () => {
  const s = setup(Object.assign({}, SEND, { action: 'block' }));
  await s.flush();
  assert.match(s.doc.body.textContent, /Senden gesperrt/);
  assert.ok(s.button('cancel'));
  assert.equal(s.button('redact'), undefined);
  assert.equal(s.button('override'), undefined);
});

test('Kein sensibler Wert in der Leiste: nur wenn erlaubt, zwei echte Klicks wie "Trotzdem", dann notsensitive bestaetigt', async () => {
  const off = setup(SEND);
  await off.flush();
  assert.equal(off.button('notsensitive'), undefined, 'ohne allowNotSensitive kein Knopf');
  const s = setup(Object.assign({}, SEND, { allowNotSensitive: true }));
  await s.flush();
  s.advance(100);
  s.observers[0].fire(true);
  s.advance(400);
  s.click('notsensitive');
  assert.deepEqual(s.decisions(), [], 'erster Klick nur Bestaetigung');
  assert.equal(s.button('notsensitive').textContent, 'Wirklich? 30 Tage ignorieren');
  s.advance(500); s.click('notsensitive');
  await s.flush();
  assert.deepEqual(s.decisions().map((d) => [d.choice, d.confirmed]), [['notsensitive', true]]);
});

test('Live-Hinweis nur mit unsicheren Funden: dezent ("moeglicherweise"), Klasse dlx-leise', async () => {
  const s = setup(Object.assign({}, LIVE, { items: [{ id: 'ch_tel', cat: 'kontakt', n: 1, sure: false }] }));
  await s.flush();
  assert.match(s.doc.body.textContent, /möglicherweise/);
  assert.ok(s.doc.body.all((n) => n.getAttribute('class') && n.getAttribute('class').includes('dlx-leise')).length === 1);
});

test('Platzhalter: Knopf neben Schwaerzen nur mit allowPlaceholders; Antwort-Leiste mit "Mit echten Werten anzeigen"', async () => {
  const off = setup(SEND);
  await off.flush();
  assert.equal(off.button('pseudonym'), undefined, 'ohne allowPlaceholders kein Knopf');
  const s = setup(Object.assign({}, SEND, { allowPlaceholders: true }));
  await s.flush();
  assert.ok(s.button('redact') && s.button('pseudonym'));
  s.click('pseudonym');
  await s.flush();
  assert.deepEqual(s.decisions().map((d) => d.choice), ['pseudonym']);
  const live = setup(Object.assign({}, LIVE, { allowPlaceholders: true }));
  await live.flush();
  assert.ok(live.button('pseudonym') && live.button('hide'));
  const r = setup(Object.assign({}, BASE, { mode: 'reveal', items: [{ id: 'iban', cat: 'finanz', n: 2 }], allowPlaceholders: true }));
  await r.flush();
  assert.match(r.doc.body.textContent, /Antwort enthält Platzhalter für 2× IBAN/);
  assert.ok(r.button('show') && r.button('hide'));
  assert.equal(r.button('redact'), undefined);
  r.click('show');
  await r.flush();
  assert.deepEqual(r.decisions().map((d) => d.choice), ['show']);
  const rOff = setup(Object.assign({}, BASE, { mode: 'reveal', items: [{ id: 'iban', cat: 'finanz', n: 1 }], allowPlaceholders: false }));
  await rOff.flush();
  assert.equal(rOff.button('show'), undefined, 'Richtlinie aus: keine Ansicht');
});
test('Erklaerung: Satz je Gruppe in Leiste und Dialog, "Mehr erfahren" nur auf die eigene Seite, keine Nachricht (Auflage 7)', async () => {
  const s = setup(Object.assign({}, SEND, { items: [{ id: 'iban', cat: 'finanz', n: 1 }, { id: 'email', cat: 'kontakt', n: 1 }] }));
  await s.flush();
  assert.match(s.doc.body.textContent, /IBAN.*– Konto- und Kartennummern genügen zusammen mit einem Namen für Betrug/);
  const links = s.doc.body.all((n) => n.tagName === 'A');
  assert.equal(links.length, 1, 'in der Leiste ein Link fuer die erste Gruppe');
  assert.equal(links[0].getAttribute('href'), 'chrome-extension://x/ui/wissen.html#finanz');
  assert.equal(links[0].getAttribute('rel'), 'noopener noreferrer');
  assert.equal(links[0].getAttribute('target'), '_blank');
  assert.deepEqual(Object.keys(links[0].listeners), [], 'kein Klick-Handler: keine Nachricht, keine Entscheidung');
  const before = s.sent.length;
  await s.flush();
  assert.equal(s.sent.length, before);
  const full = setup(Object.assign({}, SEND, { layout: 'full', items: [{ id: 'iban', cat: 'finanz', n: 1 }, { id: 'email', cat: 'kontakt', n: 1 }] }));
  await full.flush();
  const why = full.doc.body.all((n) => n.getAttribute('class') === 'dlx-warum');
  assert.equal(why.length, 2);
  assert.match(why[1].textContent, /E-Mail-Adressen, Telefonnummern/);
  // Datei- und Seitenhinweise ohne Funde: kein Satz, kein Link
  const file = setup(Object.assign({}, BASE, { mode: 'fileinfo', items: [] }));
  await file.flush();
  assert.equal(file.doc.body.all((n) => n.tagName === 'A').length, 0);
  // fremde Ziele werden nie gebaut: h() verwirft andere Schemata
  const other = setup(LIVE);
  await other.flush();
  assert.ok(other.doc.body.all((n) => n.tagName === 'A').every((a) => a.getAttribute('href').startsWith('chrome-extension://x/ui/wissen.html#')));
});

// --- Bilder pruefen (Design-Review Bilder 14.10.2026) ---------------------------
const IMG = Object.assign({}, BASE, { mode: 'image', items: [{ id: 'iban', cat: 'finanz', n: 1 }], allowPlaceholders: true, allowNotSensitive: true });

test('Bild mit Fund: Geschwaerzte Kopie / Abbrechen / Trotzdem (zwei echte Klicks), nie Platzhalter oder "Kein sensibler Wert"', async () => {
  const s = setup(IMG);
  await s.flush();
  assert.match(s.doc.body.textContent, /Bild angehalten: IBAN erkannt/);
  assert.equal(s.button('redact').textContent, 'Geschwärzte Kopie einfügen');
  assert.ok(s.button('cancel'));
  assert.equal(s.button('pseudonym'), undefined);
  assert.equal(s.button('notsensitive'), undefined);
  assert.equal(s.button('override').textContent, 'Bild trotzdem einfügen');
  s.advance(10);   // Sichtbarkeit zaehlt erst ab einem Zeitpunkt > 0
  s.observers[0].fire(true);
  s.advance(400);
  s.click('override');
  await s.flush();
  assert.deepEqual(s.decisions(), [], 'ein Klick reicht nicht');
  s.advance(500); s.click('override');
  await s.flush();
  assert.deepEqual(s.decisions().map((d) => [d.choice, d.confirmed]), [['override', true]]);
  const r = setup(IMG);
  await r.flush();
  r.advance(10);
  r.observers[0].fire(true);
  r.advance(400);
  r.click('redact');
  await r.flush();
  assert.deepEqual(r.decisions().map((d) => d.choice), ['redact']);
});

test('Bild gesperrt (Richtlinie block) und Pruefleiste: nur Abbrechen', async () => {
  const b = setup(Object.assign({}, IMG, { action: 'block' }));
  await b.flush();
  assert.match(b.doc.body.textContent, /Bild gesperrt: IBAN erkannt/);
  assert.ok(b.button('cancel'));
  assert.equal(b.button('redact'), undefined);
  assert.equal(b.button('override'), undefined);
  const w = setup(Object.assign({}, BASE, { mode: 'imagewait', items: [] }));
  await w.flush();
  assert.match(w.doc.body.textContent, /Bild wird lokal geprüft/);
  assert.ok(w.button('cancel'));
  assert.equal(w.button('override'), undefined);
});

test('Bild nicht pruefbar: Grund als feste Meldung, Trotzdem nur bei warn; unbekannter Grund = allgemein', async () => {
  const t = setup(Object.assign({}, BASE, { mode: 'imagefail', items: [], reason: 'timeout' }));
  await t.flush();
  assert.match(t.doc.body.textContent, /Bildprüfung dauerte zu lange – nicht eingefügt/);
  assert.ok(t.button('cancel') && t.button('override'));
  const b = setup(Object.assign({}, BASE, { mode: 'imagefail', items: [], reason: 'size', action: 'block' }));
  await b.flush();
  assert.match(b.doc.body.textContent, /Bild zu gross zum Prüfen/);
  assert.equal(b.button('override'), undefined);
  const u = setup(Object.assign({}, BASE, { mode: 'imagefail', items: [], reason: '<img>' }));
  await u.flush();
  assert.match(u.doc.body.textContent, /Bild konnte nicht geprüft werden/);
});

// Handtest 14.10.2026: Signet und Produktname gut sichtbar in der Leiste; Name aus dem
// Branding (umbenennbar), bereinigt und gekuerzt (Design-Review Anrede/Leiste, Auflage 7).
test('Leiste zeigt Signet und Produktnamen aus dem Branding; Steuer-/Bidi-Zeichen weg, max. 40 Zeichen, leer = Standardname', async () => {
  const marke = (s) => s.doc.body.all((n) => n.getAttribute('class') === 'dlx-bar-marke');
  const s = setup(LIVE);
  await s.flush();
  assert.equal(marke(s).length, 1);
  assert.equal(marke(s)[0].textContent, 'Example');
  assert.equal(s.doc.body.all((n) => String(n.getAttribute('class')).includes('dlx-logo')).length, 1, 'Signet in der Leiste');
  const odd = setup(Object.assign({}, LIVE, { branding: { productName: ' ‮Acme⁦ Guard\u0007 ' + 'x'.repeat(60) } }));
  await odd.flush();
  const t = marke(odd)[0].textContent;
  assert.ok(t.startsWith('Acme Guard') && t.length <= 40 && !/[‪-‮⁦-⁩\u0000-\u001f]/.test(t), t);
  for (const productName of ['', '   ', 42]) {
    const d = setup(Object.assign({}, LIVE, { branding: { productName } }));
    await d.flush();
    assert.equal(marke(d)[0].textContent, 'AImori', String(productName));
  }
});

// Design-Review Leiste/Hoehe 15.10.2026, Auflagen 2, 3, 5: der Frame meldet nur eine Zahl,
// nur bei Aenderung, nie aus dem Popupfenster; "Mehr erfahren" steht ganz rechts.
const sizes = (s) => JSON.parse(JSON.stringify(s.sent.filter((m) => m.t === 'size')));
test('Leiste misst sich: passt alles in eine Zeile -> 56, sonst umbrechen und Hoehe melden (hoechstens 240)', async () => {
  try {
    Node.layout = { sw: 900, cw: 900, h: 0 };
    const one = setup(Object.assign({}, SEND, { items: [{ id: 'iban', cat: 'finanz', n: 1 }] }));
    await one.flush();
    assert.deepEqual(sizes(one), [{ t: 'size', h: 56 }]);
    const bar = one.doc.body.children[0];
    assert.equal(bar.classList.set.has('dlx-bar-2'), false);
    const akt = bar.children[bar.children.length - 1];
    assert.equal(akt.getAttribute('class'), 'dlx-bar-aktionen');
    const opt = akt.children[akt.children.length - 1];
    assert.equal(opt.getAttribute('class'), 'dlx-optionen', 'Zusatzoptionen als letzte Zeile');
    assert.equal(opt.children[opt.children.length - 1].getAttribute('data-k'), 'learn', '"Mehr erfahren" ganz rechts');

    Node.layout = { sw: 1300, cw: 700, h: 151.2 };
    const two = setup(SEND);
    await two.flush();
    assert.deepEqual(sizes(two), [{ t: 'size', h: 152 }], 'aufgerundet');
    assert.equal(two.doc.body.children[0].classList.set.has('dlx-bar-2'), true);
    two.nudge(); await two.flush();
    assert.equal(two.sent.filter((m) => m.t === 'size').length, 2, 'Hoehe noch nicht angekommen (neue Nonce): erneut melden');

    Node.layout = { sw: 1300, cw: 300, h: 900 };
    const big = setup(SEND);
    await big.flush();
    assert.deepEqual(sizes(big), [{ t: 'size', h: 240 }]);

    const full = setup(Object.assign({}, SEND, { layout: 'full' }));
    await full.flush();
    assert.equal(full.sent.filter((m) => m.t === 'size').length, 0, 'Vollbild meldet keine Hoehe');
    const card = full.doc.body.children[0];
    const row = card.children.find((n) => n.getAttribute('class') === 'dlx-aktionen');
    const fopt = row.children[row.children.length - 1];
    assert.equal(fopt.children[fopt.children.length - 1].getAttribute('data-k'), 'learn', 'auch im Vollbild ganz rechts');
  } finally {
    Node.layout = null;
  }
  const src = (await import('node:fs')).readFileSync(new URL('../extension/ui/dialog.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /postMessage|onMessageExternal|externally_connectable/, 'nie an die Seite, nie extern');
});

test('KI-Antwort: Leiste nennt Typ und Anzahl, nach dem Kopieren eigener Satz, nur Ausblenden (Design-Review Antwort/Zwischenablage, Auflage 3)', async () => {
  const s = setup(Object.assign({}, BASE, { mode: 'answer', items: [{ id: 'iban', cat: 'finanz', n: 2 }], reason: null }));
  await s.flush();
  assert.match(s.doc.body.textContent, /KI-Antwort enthält 2× IBAN – vor dem Kopieren prüfen/);
  for (const k of ['redact', 'pseudonym', 'override', 'cancel', 'show', 'notsensitive']) assert.equal(s.button(k), undefined, k);
  s.click('hide');
  await s.flush();
  assert.deepEqual(s.decisions().map((d) => d.choice), ['hide']);
  const c = setup(Object.assign({}, BASE, { mode: 'answer', items: [{ id: 'iban', cat: 'finanz', n: 1 }], reason: 'copy' }));
  await c.flush();
  assert.match(c.doc.body.textContent, /Kopierter Text enthält IBAN/);
});

test('Einfuegen aus vertraulicher Quelle: Typname, kein Schwaerzen, Verwerfen und abgesetztes Trotzdem', async () => {
  const s = setup(Object.assign({}, BASE, { mode: 'paste', items: [{ id: 'clipboard_source', cat: 'source', n: 1 }], allowNotSensitive: false }));
  await s.flush();
  assert.match(s.doc.body.textContent, /Text aus vertraulicher Quelle/);
  assert.equal(s.button('redact'), undefined);
  assert.equal(s.button('pseudonym'), undefined);
  assert.ok(s.button('cancel') && s.button('override'));
  const b = setup(Object.assign({}, BASE, { mode: 'paste', action: 'block', items: [{ id: 'clipboard_source', cat: 'source', n: 1 }] }));
  await b.flush();
  assert.equal(b.button('override'), undefined, 'block: kein Trotzdem');
});

test('Versteckte Anweisungen: Typname und Anzahl, Dokument nur Abbrechen/Trotzdem, block ohne Trotzdem (Design-Review KI-Agenten)', async () => {
  const items = [{ id: 'hidden_instruction', cat: 'injection', n: 2 }];
  const p = setup(Object.assign({}, BASE, { mode: 'paste', items, allowNotSensitive: false }));
  await p.flush();
  assert.match(p.doc.body.textContent, /Hinweise auf versteckte Anweisungen/);
  assert.equal(p.button('redact'), undefined, 'nicht schwaerzbar');
  const d = setup(Object.assign({}, BASE, { mode: 'doc', items }));
  await d.flush();
  assert.match(d.doc.body.textContent, /Dokument angehalten/);
  assert.equal(d.button('redact'), undefined);
  assert.ok(d.button('cancel') && d.button('override'));
  const b = setup(Object.assign({}, BASE, { mode: 'doc', action: 'block', items }));
  await b.flush();
  assert.match(b.doc.body.textContent, /Dokument gesperrt/);
  assert.equal(b.button('override'), undefined, 'block: kein Trotzdem');
});

test('Sprachmodus und Firmendokument: feste Texte, Trotzdem nur bei warn mit Override, nie Schwaerzen (Design-Review Diktat und Fingerabdruecke)', async () => {
  const w = setup(Object.assign({}, BASE, { mode: 'voice', action: 'warn', items: [], allowOverride: true }));
  await w.flush();
  assert.match(w.doc.body.textContent, /Sprachmodus wird nicht geprüft/);
  assert.ok(w.button('cancel'));
  assert.ok(w.button('override'));
  assert.match(w.button('override').textContent, /Sprachmodus trotzdem starten/);
  const b = setup(Object.assign({}, BASE, { mode: 'voice', action: 'block', items: [], allowOverride: true }));
  await b.flush();
  assert.match(b.doc.body.textContent, /Sprachmodus gesperrt/);
  assert.equal(b.button('override'), undefined);
  const d = setup(Object.assign({}, BASE, { mode: 'paste', action: 'warn', items: [{ id: 'document_match', cat: 'firma', n: 1 }], allowOverride: true }));
  await d.flush();
  assert.match(d.doc.body.textContent, /Teile eines Firmendokuments/);
  assert.equal(d.button('redact'), undefined, 'Ganztext-Fund nicht schwaerzbar');
  assert.equal(d.button('pseudonym'), undefined);
});

test('Umformulieren: Knopf nur bei Senden/Einfuegen mit allowRephrase; Leiste danach mit Rueckgaengig nur beim Senden', async () => {
  const off = setup(SEND);
  await off.flush();
  assert.equal(off.button('rephrase'), undefined, 'ohne allowRephrase kein Knopf');
  const s = setup(Object.assign({}, SEND, { allowRephrase: true }));
  await s.flush();
  assert.ok(s.button('redact') && s.button('rephrase'));
  assert.match(s.button('rephrase').textContent, /Sicher umformulieren/);
  s.click('rephrase');
  await s.flush();
  assert.deepEqual(s.decisions().map((d) => d.choice), ['rephrase']);
  const live = setup(Object.assign({}, LIVE, { allowRephrase: true }));
  await live.flush();
  assert.equal(live.button('rephrase'), undefined, 'Live-Hinweis ohne Umformulieren');
  const r = setup(Object.assign({}, LIVE, { mode: 'rephrased', allowRephrase: true }));
  await r.flush();
  assert.match(r.doc.body.textContent, /Sicher umformuliert/);
  assert.ok(r.button('undo') && r.button('hide'));
  const p = setup(Object.assign({}, LIVE, { mode: 'rephrased', reason: 'paste', allowRephrase: true }));
  await p.flush();
  assert.equal(p.button('undo'), undefined, 'beim Einfuegen kein Rueckgaengig');
});
// Design-Review Warnleiste anpassbar 17.10.2026, Auflage 5: kompakt = feste Klasse, 44 px,
// Kernsatz, Fundart, alle Knoepfe und die Erklaerung (Screenreader) bleiben; Thema nur hell/dunkel.
test('Warnleiste kompakt: on/off/auto (schmaler als 640 px), 44 bzw. ab 76 px, nichts entfernt', async () => {
  try {
    Node.layout = { sw: 500, cw: 500, h: 0 };
    const voll = setup(SEND, 1000);
    await voll.flush();
    const on = setup(Object.assign({}, SEND, { compact: 'on' }), 1000);
    await on.flush();
    const bar = on.doc.body.children[0];
    assert.equal(bar.classList.set.has('dlx-kompakt'), true);
    assert.deepEqual(sizes(on), [], 'Ziel 44 px = Hoehe der Attrappe (innerHeight 44): keine Meldung');
    const knoepfe = (s) => s.doc.body.all((n) => n.tagName === 'BUTTON').map((b) => b.getAttribute('data-k'));
    assert.deepEqual(knoepfe(on), knoepfe(voll), 'dieselben Knoepfe wie normal');
    assert.equal(on.doc.body.textContent, voll.doc.body.textContent, 'derselbe Text samt Erklaerung');
    assert.ok(on.doc.body.all((n) => n.getAttribute('class') === 'dlx-bar-warum').length === 1, 'Erklaerung bleibt im DOM');
    assert.equal(voll.doc.body.children[0].classList.set.has('dlx-kompakt'), false);
    assert.deepEqual(sizes(voll), [{ t: 'size', h: 56 }]);

    const schmal = setup(SEND, 600);
    await schmal.flush();
    assert.equal(schmal.doc.body.children[0].classList.set.has('dlx-kompakt'), true, 'auto unter 640 px');
    const aus = setup(Object.assign({}, SEND, { compact: 'off' }), 600);
    await aus.flush();
    assert.equal(aus.doc.body.children[0].classList.set.has('dlx-kompakt'), false, 'off auch schmal');
    const fremd = setup(Object.assign({}, SEND, { compact: '__proto__' }), 1000);
    await fremd.flush();
    assert.equal(fremd.doc.body.children[0].classList.set.has('dlx-kompakt'), false, 'unbekannt = auto');

    Node.layout = { sw: 1300, cw: 500, h: 60.2 };
    const zwei = setup(Object.assign({}, SEND, { compact: 'on' }), 1000);
    await zwei.flush();
    assert.deepEqual(sizes(zwei), [{ t: 'size', h: 76 }], 'zwei Zeilen kompakt mindestens 76');
  } finally {
    Node.layout = null;
  }
  const dunkel = setup(Object.assign({}, SEND, { theme: 'dunkel' }));
  await dunkel.flush();
  assert.equal(dunkel.doc.documentElement.getAttribute('data-theme'), 'dunkel');
  const css = (await import('node:fs')).readFileSync(new URL('../extension/ui/ui.css', import.meta.url), 'utf8');
  assert.match(css, /\.dlx-bar\.dlx-kompakt \.dlx-knopf \{ height: 30px;/, 'Knoepfe mindestens 30 px');
  assert.match(css, /\.dlx-bar\.dlx-kompakt \.dlx-logo \{ width: 24px; height: 24px; \}/, 'Signet nie unter 24 px (Markenvorgabe)');
  assert.doesNotMatch(css, /\.dlx-kompakt[^{]*\{[^}]*display:\s*none/, 'nichts ausgeblendet');
});
