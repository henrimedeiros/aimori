// Kontoart der KI-Seite (Firmen- oder Privatkonto) nur aus sichtbaren
// Seitensignalen: fester Kontobereich (Profil-/Arbeitsbereich-Knopf),
// Datenschutz-Schild, Hostname. Liest nie Cookies, Speicher, Netz, Eingabefeld
// oder Verlauf; nur textContent sichtbarer Blatt-Elemente im Kontobereich,
// nichts wird gespeichert (Design-Review Konto-Regeln 14.10.2026, Auflagen 4-8, 11, 13).
// Selektoren der echten Seiten sind Annahmen (nicht live geprueft): ohne Treffer
// gilt "unknown" und damit die strengste Stufe.
(function (g) {
  'use strict';
  const DLX = g.DLX;

  const SHIELD = ['[data-testid="edp-shield"]', '[aria-label="Enterprise data protection"]', '[aria-label="Unternehmensdatenschutz"]'];
  // area = Kontobereich (sichtbar = angemeldet, mindestens Privatkonto);
  // workspace = einzige Quelle fuer Workspace-Namen und Plan-Kennzeichen: der
  // Arbeitsbereich-Wechsler, nie der Profil-Knopf mit dem frei waehlbaren
  // Anzeigenamen (Pflicht-Pruefung 14.10.2026, Auflage 1).
  const SIGNALS = {
    chatgpt: { area: ['[data-testid="accounts-profile-button"]', '[data-testid="workspace-switcher-button"]'], workspace: ['[data-testid="workspace-switcher-button"]'] },
    claude: { area: ['[data-testid="user-menu-button"]', '[data-testid="org-switcher-button"]'], workspace: ['[data-testid="org-switcher-button"]'] },
    copilot: { area: ['[data-testid="profile-button"]'], shield: SHIELD },
    m365copilot: { area: [], shield: SHIELD, hosts: ['copilot.cloud.microsoft', 'm365.cloud.microsoft'] },
  };
  // Plan-Kennzeichen von Firmen-Arbeitsbereichen, nur als ganzer Text (Auflage 7).
  const PLANS = ['team', 'enterprise', 'business', 'edu', 'chatgpt team', 'chatgpt enterprise', 'chatgpt business', 'chatgpt edu', 'claude team', 'claude enterprise'];
  // Menues/Auswahllisten (alle Arbeitsbereiche, auch inaktive), Eingaben und Verlauf zaehlen nie (Auflagen 5-6).
  const NOT_IN = '[role="menu"],[role="menuitem"],[role="listbox"],[role="option"],[role="dialog"],[popover]';
  const NOT_NEAR = '[contenteditable],textarea,input,article,[data-message-author-role],[role="log"]';
  const MAX_AREAS = 10, MAX_LEAVES = 50, MAX_TEXT = 200;

  // Sichtbar und nicht versteckt (Auflage 4); ohne checkVisibility nie sichtbar (fail-safe).
  function usable(el, composerSel) {
    if (typeof el.checkVisibility !== 'function' || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    if (!el.getClientRects().length || !(r.width > 0) || !(r.height > 0)) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (n.getAttribute('aria-hidden') === 'true' || n.getAttribute('hidden') !== null || n.getAttribute('inert') !== null) return false;
    }
    const near = NOT_NEAR + (composerSel ? ',' + composerSel : '');
    return !el.closest(NOT_IN + ',' + near) && !el.querySelector(near);
  }

  // Texte der sichtbaren Blatt-Elemente eines Kontobereichs, normalisiert.
  function leafTexts(area, composerSel) {
    const out = [];
    const all = [area].concat(Array.from(area.querySelectorAll('*')).slice(0, MAX_LEAVES));
    for (const n of all) {
      if (n.children.length || !usable(n, composerSel)) continue;
      const t = DLX.policy.normName(String(n.textContent || '').slice(0, MAX_TEXT));
      if (t) out.push(t);
    }
    return out;
  }

  // rule = gueltiger accountRules-Eintrag. Liefert { type, via }, nie Namen.
  // Bei jeder Pruefung neu ermittelt (Auflage 11), nur im Top-Frame (Auflage 6).
  function detect(siteId, rule, composerSel) {
    const sig = Object.hasOwn(SIGNALS, siteId) ? SIGNALS[siteId] : null;
    if (!sig || !rule || !g.window || g.top !== g.window) return { type: 'unknown', via: null };
    const markers = rule.markers || [];
    // Host nur exakt aus location.hostname, nie aus dem DOM (Auflage 8).
    if (markers.indexOf('host') !== -1 && (sig.hosts || []).indexOf(g.location.hostname) !== -1) return { type: 'business', via: 'host' };
    const visible = (sels) => {
      const list = [];
      for (const sel of sels) for (const n of document.querySelectorAll(sel)) if (list.length < MAX_AREAS && list.indexOf(n) === -1 && usable(n, composerSel)) list.push(n);
      return list;
    };
    const areas = visible(sig.area);
    const texts = [];
    for (const a of visible(sig.workspace || [])) texts.push(...leafTexts(a, composerSel));
    if ((rule.workspaces || []).some((w) => texts.indexOf(w) !== -1)) return { type: 'business', via: 'workspace' };
    if (markers.indexOf('plan') !== -1 && texts.some((t) => PLANS.indexOf(t) !== -1)) return { type: 'business', via: 'plan' };
    const shield = sig.shield ? visible(sig.shield).length > 0 : false;
    if (markers.indexOf('shield') !== -1 && shield) return { type: 'business', via: 'shield' };
    return areas.length || shield ? { type: 'personal', via: null } : { type: 'unknown', via: null };
  }

  DLX.account = { SIGNALS, PLANS, detect };
})(globalThis);
