// Formularwache (Design-Review KI-Agenten 16.10.2026, docs/sicherheit/design-review-ki-agenten.md):
// Content Script nur auf Seiten der Richtlinie formGuardSites, die der Benutzer erteilt hat
// (Service Worker registriert es, Hauptframe, isoliert). Prueft beim Absenden eines Formulars
// die Feldwerte lokal mit derselben Engine wie auf den KI-Seiten - egal ob ein Mensch oder ein
// KI-Agent sie eingetragen hat. Bei Fund: Absenden stoppen, Service Worker oeffnet ein eigenes
// Fenster ausserhalb der Seite. Werte verlassen dieses Skript nie; an den Service Worker gehen
// nur Typ-ID, Gruppe und Anzahl. Kein window.postMessage, kein Speicher, kein Netz.
// Bekannte Luecke (Auflage 11): form.submit() und fetch/XHR loesen kein submit-Ereignis aus
// und werden nicht geprueft; versteckte Felder (type=hidden) werden nicht geprueft.
(function (g) {
  'use strict';
  const DLX = g.DLX;
  if (!DLX || !DLX.engine || !DLX.policy || g.__dlxFormLoaded) return;
  g.__dlxFormLoaded = true;

  const PASS_MS = 30000;      // einmaliger Durchlass nach "Trotzdem senden" (Auflage 8)
  const SKIP = /^(password|file|hidden|submit|button|image|reset)$/i;   // Auflage 11
  let eng = DLX.policy.engineConfig(DLX.policy.defaults(navigator.language));
  let wait = null;            // { hash, n } Meldung, auf deren Entscheid gewartet wird
  let pass = null;            // { hash, until }

  chrome.runtime.sendMessage({ t: 'formCfg' }).then((r) => { if (r && r.cfg) eng = DLX.policy.engineConfig(r.cfg); }).catch(() => {});

  // Werte aller zugeordneten Felder (form.elements enthaelt auch <input form="...">) und
  // bearbeitbarer Bereiche im Formular.
  function values(form) {
    const out = [];
    for (const el of Array.from(form.elements || [])) {
      const text = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !SKIP.test(el.type || 'text'));
      if (text && el.value) out.push(String(el.value));
    }
    for (const el of Array.from(form.querySelectorAll('[contenteditable]'))) if (el.isContentEditable && el.innerText) out.push(String(el.innerText));
    return out;
  }
  // Pruefsumme nur im Speicher (Auflage 9): anderer Inhalt = neue Pruefung.
  const hashOf = (list) => DLX.dictionary.sha256Hex(list.map((v) => v.normalize('NFKC').replace(/\s+/g, ' ').trim()).join('\u0000'));

  function onSubmit(e) {
    const form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    const list = values(form);
    if (!list.length) return;
    const hash = hashOf(list);
    if (pass && pass.hash === hash && Date.now() < pass.until) { pass = null; return; }
    pass = null;
    const res = DLX.engine.scan(list.join('\n'), eng);
    const findings = res.unscannable ? [{ id: 'unscannable', cat: 'unscannable', start: 0, end: 0, action: 'warn' }]
      : Array.from(res.findings).filter((f) => f.action !== 'off');
    if (!findings.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const items = Array.from(DLX.engine.summarize(findings), (s) => ({ id: s.id, cat: s.cat, n: s.n }));
    // Fenster offen oder zu schnell erneut: der Service Worker antwortet busy, Absenden bleibt gestoppt
    // und die offene Meldung (mit ihrem Inhalt) bleibt die einzige, die freigegeben werden kann (Auflage 10).
    chrome.runtime.sendMessage({ t: 'formFound', items }).then((r) => { if (r && typeof r.nonce === 'string') wait = { hash, n: r.nonce }; }).catch(() => {});
  }

  // Durchlass nur vom Service Worker (kein Tab-Absender), gebunden an die Nonce dieser Meldung (Auflage 8).
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== chrome.runtime.id || sender.tab || !msg || msg.t !== 'formPass' || !wait || !wait.n || msg.n !== wait.n) return;
    pass = { hash: wait.hash, until: Date.now() + PASS_MS };
    wait = null;
  });
  g.addEventListener('submit', onSubmit, true);
  g.addEventListener('pagehide', () => { wait = null; pass = null; });
})(globalThis);
