// Seitenadapter: wo das Eingabefeld und der Senden-Knopf je KI-Seite liegen.
// Neue Seiten nur per Update (Manifest, Auflage A1). Selektoren muessen bei
// Seitenumbauten nachgefuehrt werden; ohne Treffer meldet das Content Script
// "Schutz nicht aktiv" (Auflagen A6, B10). Neue Selektoren erweitern nur,
// Rueckfaelle (Enter, submit, Senden-Wort im aria-label) bleiben (Review Live-Hinweis A8).
(function (g) {
  'use strict';
  const DLX = g.DLX;

  const SEND_WORDS = /\b(send|senden|absenden|verzenden|versturen|envoyer|invia|inviare|enviar|submit)\b/i;
  // aria-labels des Senden-Knopfs je Sprache (claude.ai zeigt sie in der
  // Browsersprache, z. B. "Nachricht senden" bei de-DE).
  const SEND_LABELS = ['Send message', 'Send Message', 'Nachricht senden', 'Envoyer le message', 'Invia messaggio',
    'Enviar mensaje', 'Enviar mensagem', 'Bericht verzenden'];
  const labelled = (labels) => labels.map((l) => 'button[aria-label="' + l + '"]');
  const M365_COMPOSER = ['#m365-chat-editor-target-element', 'span[contenteditable="true"][aria-label="Message Copilot"]'];
  const M365_SEND = labelled(['Send', 'Senden', 'Envoyer', 'Invia', 'Enviar']).concat(labelled(SEND_LABELS));

  // Sprachmodus-Knoepfe: Gesprochenes geht ohne Text an die KI (Design-Review Diktat und
  // Fingerabdruecke 16.10.2026, Auflage 4). Stand 16.10.2026 nach oeffentlicher Oberflaeche,
  // nicht an angemeldeten Seiten gemessen: data-testid und Markennamen vor aria-labels in
  // en/de/fr/it. Diktat-Knoepfe (Text landet im Feld und wird geprueft) gehoeren nicht hierher.
  // Ohne Treffer greift voiceMode nicht: Grenzen in docs/sprache-und-diktat.md.
  const VOICE_CHATGPT = ['button[data-testid="composer-speech-button"]'].concat(labelled(['Start voice mode', 'Use voice mode',
    'Sprachmodus starten', 'Sprachmodus verwenden', 'Démarrer le mode vocal', 'Utiliser le mode vocal', 'Avvia la modalità vocale', 'Usa la modalità vocale']));
  const VOICE_CLAUDE = labelled(['Voice mode', 'Start voice mode', 'Sprachmodus', 'Sprachmodus starten', 'Mode vocal', 'Modalità vocale']);
  const VOICE_GEMINI = ['button[aria-label*="Gemini Live"]', '[role="button"][aria-label*="Gemini Live"]'];
  const VOICE_COPILOT = labelled(['Talk to Copilot', 'Start voice', 'Mit Copilot sprechen', 'Sprachmodus starten', 'Parler à Copilot', 'Parla con Copilot']);

  // Reihenfolge = Vorrang. ChatGPT (Stand 13.10.2026): Composer ist
  // div.ProseMirror[contenteditable] im form, daneben evtl. eine versteckte
  // Rueckfall-textarea; der Senden-Knopf erscheint erst mit Text.
  const SITES = [
    { id: 'chatgpt', hosts: ['chatgpt.com'],
      composer: ['div.ProseMirror[contenteditable="true"]', '#prompt-textarea', 'form [contenteditable="true"]', 'form textarea'],
      send: ['button[data-testid="send-button"]', '#composer-submit-button', 'button[aria-label="Send prompt"]', 'button[aria-label="Send message"]'],
      voice: VOICE_CHATGPT },
    // claude.ai (Stand 13.10.2026): div.tiptap.ProseMirror im fieldset, kein
    // form; Senden-Knopf type="button" mit aria-label in der Browsersprache.
    { id: 'claude', hosts: ['claude.ai'],
      composer: ['div.ProseMirror[contenteditable="true"]', 'div.tiptap[contenteditable="true"]', '[contenteditable="true"][role="textbox"]', 'fieldset [contenteditable="true"]'],
      send: labelled(SEND_LABELS).concat(['fieldset button[type="submit"]']), voice: VOICE_CLAUDE },
    { id: 'gemini', hosts: ['gemini.google.com'],
      composer: ['rich-textarea [contenteditable="true"]', '.ql-editor[contenteditable="true"]'],
      send: ['button.send-button', 'button[aria-label="Send message"]', '.send-button-container button'], voice: VOICE_GEMINI },
    // Microsoft Copilot (Consumer): copilot.microsoft.com leitet seit Oktober 2026
    // auf copilot.com um (Handtest 14.10.2026); Edge sperrt Erweiterungen auf
    // copilot.microsoft.com fest, copilot.com nicht (E2E-Attrappe). Annahme:
    // gleiche App und Selektoren, ohne Treffer "Schutz nicht aktiv".
    { id: 'copilot', hosts: ['copilot.microsoft.com', 'copilot.com'],
      composer: ['textarea#userInput', 'textarea[data-testid="composer-input"]', 'form textarea'],
      send: ['button[data-testid="submit-button"]', 'button[aria-label="Submit message"]', 'form button[type="submit"]'], voice: VOICE_COPILOT },
    // Microsoft 365 Copilot (Stand 13.10.2026, copilot.microsoft.com leitet fuer
    // Firmenkonten dorthin um): span#m365-chat-editor-target-element[contenteditable],
    // kein form. copilot.cloud.microsoft ist reiner Chat und wird voll geprueft;
    // m365.cloud.microsoft traegt die ganze M365-Oberflaeche: dort nur im
    // Chat-Feld reagieren, sonst passiv (onlyComposer, Design-Review 13.10.2026
    // Auflage 1; Pflicht-Pruefung: nur dieser Host).
    { id: 'm365copilot', hosts: ['copilot.cloud.microsoft'], composer: M365_COMPOSER, send: M365_SEND },
    { id: 'm365copilot', hosts: ['m365.cloud.microsoft'], onlyComposer: true, composer: M365_COMPOSER, send: M365_SEND },
  ];

  function make(def) {
    const composerSel = def.composer.join(',');
    const sendSel = def.send.join(',');
    const voiceSel = (def.voice || []).join(',');
    const isEl = (n) => n && n.nodeType === 1;
    const visible = (n) => n.getClientRects().length > 0;
    // Erster sichtbarer Treffer nach Vorrang, sonst erster Treffer ueberhaupt:
    // eine versteckte Rueckfall-textarea darf das echte Feld nie verdecken.
    function first(list) {
      let any = null;
      for (const sel of list) {
        for (const n of document.querySelectorAll(sel)) {
          if (visible(n)) return n;
          if (!any) any = n;
        }
      }
      return any;
    }
    // Behaelter des Knopfs mit Eingabefeld: form/fieldset, sonst naechster
    // Vorfahre bis 6 Ebenen (claude.ai und M365 Copilot haben kein form).
    function boxOf(btn) {
      const box = btn.closest('form, fieldset');
      if (box && box.querySelector(composerSel)) return box;
      let n = btn.parentNode;
      for (let i = 0; i < 6 && isEl(n); i++, n = n.parentNode) if (n.querySelector(composerSel)) return n;
      return null;
    }
    return {
      id: def.id,
      onlyComposer: def.onlyComposer === true,
      composerSelector: composerSel,
      findComposer() { return first(def.composer); },
      findSendButton() { return first(def.send); },
      // Eingabefeld, in dem das Ereignis liegt (composedPath, auch Shadow DOM).
      composerIn(path) { return path.find((n) => isEl(n) && n.matches(composerSel)) || null; },
      inComposer(path) { return !!this.composerIn(path); },
      readText(el) { return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : (el.innerText || el.textContent || ''); },
      isSendButton(path) { return !!this.sendButtonIn(path); },
      // Sprachmodus-Knopf im Ereignispfad (das Element selbst oder ein Vorfahre im Pfad).
      isVoiceButton(path) { return !!voiceSel && path.some((n) => isEl(n) && n.matches(voiceSel)); },
      // Senden-Knopf im Ereignispfad (das Element selbst, fuer den einen Klick
      // nach "Trotzdem senden", Design-Review 14.10.2026 Auflage 1).
      sendButtonIn(path) {
        for (const n of path) {
          if (!isEl(n)) continue;
          if (n.matches(sendSel)) return n;
          if (n.tagName === 'BUTTON') {
            const label = (n.getAttribute('aria-label') || '') + ' ' + (n.getAttribute('title') || '');
            // Nur ausdrueckliches type="submit": Knoepfe ohne type (z. B. Diktat)
            // sind im form zwar submit, loesen aber den submit-Rueckfall aus.
            if ((n.getAttribute('type') === 'submit' || SEND_WORDS.test(label)) && boxOf(n)) return n;
            return null;
          }
        }
        return null;
      },
      // Liegen Knopf und Eingabefeld im selben Behaelter?
      sameBox(btn, composer) { const b = boxOf(btn); return !!b && b.contains(composer); },
    };
  }

  function forHost(host) {
    const def = SITES.find((s) => s.hosts.indexOf(host) !== -1);
    return def ? make(def) : null;
  }

  DLX.adapters = { SITES, forHost };
})(globalThis);
