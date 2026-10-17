// Training-Ampel (Design-Review Training-Ampel 16.10.2026): mitgelieferte
// Angaben je KI-Seite der Liste (common/aisites.js), ob Eingaben standardmaessig
// zum Training der Modelle genutzt werden, je Kontoart. Reine Daten plus Regeln;
// nichts wird nachgeladen, geaendert wird nur per Release (danach npm run build
// fuer docs/ki-training-liste.md). Werte nur aus Herstellerquellen (Auflage 14):
// ja = standardmaessig an, nein = ausdrueckliche Herstellerangabe "kein Training",
// teils = nur in bestimmten Faellen (Region, Stufe, oeffentliche Inhalte, Feedback),
// unbekannt = Quelle nennt keine klare Regel. business null = keine Firmenvariante.
// optOut = Seite mit der Einstellung (leer = kein sicherer Link bekannt), quelle =
// Herstellerseite. Beide nur auf Hosts der Seite oder den hier genannten
// Anbieter-Hosts (Auflage 10).
(function (g) {
  'use strict';
  const DLX = g.DLX || (g.DLX = {});
  const STAND = '2026-10-16';
  const MAX_ALTER_TAGE = 365; // aelter -> gelb (Auflage 11)
  const WERTE = Object.freeze(['ja', 'nein', 'teils', 'unbekannt']);
  const FARBEN = Object.freeze(['gruen', 'gelb', 'rot']);
  const TYPES = Object.freeze(['business', 'personal', 'unknown']);
  const E = (id, personal, business, optOut, quelle, anbieter, notiz) =>
    Object.freeze({ id, personal, business, optOut, quelle, anbieter: Object.freeze(anbieter), notiz, stand: STAND });
  const LIST = Object.freeze([
    E('chatgpt', 'ja', 'nein', 'https://chatgpt.com/#settings/DataControls', 'https://help.openai.com/en/articles/7730893-data-controls-faq', ['help.openai.com'], 'Standard an, abschaltbar; Business/Enterprise trainiert nicht'),
    E('claude', 'ja', 'nein', 'https://claude.ai/settings/data-privacy-controls', 'https://www.anthropic.com/legal/privacy', ['www.anthropic.com'], 'Seit 2025 standardmässig an, abschaltbar; Team/Enterprise nicht'),
    E('gemini', 'ja', 'nein', 'https://myactivity.google.com/product/gemini', 'https://support.google.com/gemini/answer/13594961', ['myactivity.google.com', 'support.google.com'], 'Mit gespeicherter Aktivität an; Workspace nicht'),
    E('copilot', 'ja', null, '', 'https://support.microsoft.com/en-us/topic/privacy-faq-for-microsoft-copilot-27b3a435-8dc9-4b55-9a4b-58eeb9647a7f', ['support.microsoft.com'], 'Standard an, in den Copilot-Einstellungen abschaltbar'),
    E('m365copilot', 'unbekannt', 'nein', '', 'https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-privacy', ['learn.microsoft.com'], 'Firmenkonten: kein Training der Basismodelle'),
    E('perplexity', 'ja', 'nein', '', 'https://www.perplexity.ai/hub/legal/privacy-policy', [], 'Datennutzung standardmässig an; Enterprise nie'),
    E('mistral', 'ja', 'nein', '', 'https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models', ['help.mistral.ai'], 'Gratis standardmässig an; Team/Enterprise nicht'),
    E('deepseek', 'ja', null, '', 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html', ['cdn.deepseek.com'], 'Standard an; Widerspruch nur EWR/UK/Schweiz'),
    E('grok', 'ja', 'unbekannt', '', 'https://x.ai/legal/faq', ['x.ai'], 'Abschaltbar; Feedback wird trotzdem genutzt'),
    E('poe', 'teils', null, '', 'https://poe.com/privacy', [], 'Bot-Anbieter dürfen Chats zum Training nutzen'),
    E('characterai', 'ja', null, '', 'https://policies.character.ai/privacy', ['policies.character.ai'], 'Training mit Chats; Widerspruch nur EWR/UK'),
    E('you', 'unbekannt', 'teils', '', 'https://home.you.com/support/zdr', ['home.you.com'], 'Kein Training nur für Team-Pläne beschrieben'),
    E('huggingchat', 'nein', null, '', 'https://huggingface.co/chat/privacy', [], 'Gespräche privat, nicht für Training'),
    E('metaai', 'ja', null, '', 'https://www.facebook.com/privacy/genai', ['www.facebook.com'], 'Gespräche verbessern die Modelle'),
    E('qwen', 'unbekannt', null, '', 'https://chat.qwen.ai/', [], 'Keine klare Regel in den Bedingungen'),
    E('kimi', 'ja', null, '', 'https://www.kimi.com/help/others/data-usage', [], 'Standard an; Widerspruch nur per Antrag'),
    E('zai', 'unbekannt', 'unbekannt', '', 'https://docs.z.ai/legal-agreement/privacy-policy', ['docs.z.ai'], 'Keine klare Regel auffindbar'),
    E('doubao', 'unbekannt', null, '', 'https://www.doubao.com/', [], 'Keine klare Regel auffindbar'),
    E('ernie', 'unbekannt', null, '', 'https://yiyan.baidu.com/', [], 'Keine klare Regel auffindbar'),
    E('pi', 'ja', null, '', 'https://inflection.ai/notice-on-model-training', ['inflection.ai'], 'Training mit Gesprächen, im Konto abschaltbar'),
    E('duckai', 'nein', null, '', 'https://duckduckgo.com/duckduckgo-help-pages/duckai/ai-chat-privacy', ['duckduckgo.com'], 'Kein Training, auch nicht bei Modellanbietern'),
    E('aistudio', 'ja', 'nein', '', 'https://ai.google.dev/gemini-api/terms', ['ai.google.dev'], 'Gratisnutzung trainiert, bezahlte Nutzung nicht'),
    E('notebooklm', 'teils', 'nein', '', 'https://support.google.com/notebooklm/answer/16164461', ['support.google.com'], 'Nur bei Feedback; Workspace nie'),
    E('jules', 'teils', 'unbekannt', '', 'https://jules.google/docs/faq/', ['jules.google'], 'Private Repos nie, öffentliche möglich'),
    E('githubcopilot', 'ja', 'nein', 'https://github.com/settings/copilot', 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement', ['docs.github.com'], 'Free/Pro standardmässig an; Business/Enterprise nicht'),
    E('phind', 'unbekannt', 'unbekannt', '', 'https://www.phind.com/privacy', [], 'Keine aktuelle Angabe'),
    E('v0', 'ja', 'nein', '', 'https://vercel.com/legal/privacy-notice', ['vercel.com'], 'Abschalten nur in Business/Enterprise'),
    E('bolt', 'teils', 'unbekannt', '', 'https://stackblitz.com/privacy-policy', ['stackblitz.com'], 'Kein Training für Konten aus EWR/UK/Schweiz'),
    E('lovable', 'ja', 'nein', '', 'https://docs.lovable.dev/features/business/data-opt-out', ['docs.lovable.dev'], 'Abschalten nur in Business/Enterprise'),
    E('replit', 'teils', 'unbekannt', '', 'https://replit.com/privacy-policy', [], 'Öffentliche Apps ja, private nicht'),
    E('genspark', 'unbekannt', 'unbekannt', '', 'https://www.genspark.ai/', [], 'Keine klare Regel auffindbar'),
    E('manus', 'unbekannt', 'unbekannt', '', 'https://manus.im/privacy', [], 'Nur de-identifizierte Daten genannt'),
    E('felo', 'ja', 'unbekannt', '', 'https://account.felo.ai/policies/privacy-policy', ['account.felo.ai'], 'Daten für KI-Entwicklung genutzt'),
    E('openrouter', 'teils', 'teils', 'https://openrouter.ai/settings/privacy', 'https://openrouter.ai/docs/guides/privacy/data-collection', [], 'Je nach Einstellung trainieren die Modellanbieter'),
    E('lmarena', 'ja', null, '', 'https://lmarena.ai/privacy-policy', [], 'Gespräche gehen an Anbieter, teils öffentlich'),
    E('deepl', 'ja', 'nein', '', 'https://www.deepl.com/en/privacy', [], 'Gratis trainiert, Pro nicht'),
    E('jasper', 'nein', 'nein', '', 'https://www.jasper.ai/legal/eula', ['www.jasper.ai'], 'Kundeninhalte trainieren keine Modelle'),
    E('copyai', 'unbekannt', 'unbekannt', '', 'https://www.copy.ai/privacy', ['www.copy.ai'], 'Keine klare Regel auffindbar'),
    E('writesonic', 'teils', 'unbekannt', '', 'https://writesonic.com/privacy', ['writesonic.com'], 'Gratis-Stufe trainiert, Bezahlstufe unklar'),
    E('gamma', 'ja', 'nein', '', 'https://help.gamma.app/en/articles/12281928-does-gamma-use-my-content-to-train-its-ai-features', ['help.gamma.app'], 'Einzelkonten an; Team/Business aus'),
    E('midjourney', 'ja', null, '', 'https://docs.midjourney.com/docs/terms-of-service', ['docs.midjourney.com'], 'Trainingslizenz in allen Stufen'),
    E('firefly', 'nein', 'nein', '', 'https://www.adobe.com/ai/overview/firefly/gen-ai-approach.html', ['www.adobe.com'], 'Nie mit Nutzerinhalten trainiert'),
    E('designer', 'unbekannt', null, '', 'https://support.microsoft.com/en-us/topic/frequently-asked-questions-about-microsoft-designer-9264654d-22f5-43ac-961d-b35851bbb93f', ['support.microsoft.com'], 'Nur Verbesserung des Dienstes genannt'),
    E('leonardo', 'teils', 'unbekannt', '', 'https://leonardo.ai/privacy-policy/', ['leonardo.ai'], 'Gratis trainiert, private Bezahlinhalte nicht'),
    E('ideogram', 'ja', null, '', 'https://ideogram.ai/privacy-policy', [], 'Prompts und Bilder trainieren'),
    E('dreamstudio', 'ja', null, '', 'https://stability.ai/ds-pp', ['stability.ai'], 'Standard an, abschaltbar'),
    E('sora', 'ja', 'nein', 'https://privacy.openai.com/', 'https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/', ['privacy.openai.com', 'openai.com'], 'Eigene Einstellung, unabhängig von ChatGPT'),
    E('runway', 'ja', 'unbekannt', '', 'https://runwayml.com/privacy-policy', ['runwayml.com'], 'Trainingslizenz an Ein- und Ausgaben'),
    E('heygen', 'nein', 'nein', '', 'https://www.heygen.com/en-au/faq', ['www.heygen.com'], 'Nutzerdaten nicht für Training'),
    E('synthesia', 'nein', 'nein', '', 'https://www.synthesia.io/ai-governance', ['www.synthesia.io'], 'Kein Training mit Kundendaten'),
    E('suno', 'ja', null, '', 'https://suno.com/privacy', [], 'Eingaben trainieren Modelle'),
    E('elevenlabs', 'ja', 'nein', '', 'https://help.elevenlabs.io/hc/en-us/articles/29952728805393-Is-my-data-used-to-improve-ElevenLabs-AI-models', ['help.elevenlabs.io'], 'Standard an, abschaltbar; Enterprise nicht'),
  ]);
  const BY_ID = new Map(LIST.map((x) => [x.id, x]));
  const byId = (id) => (typeof id === 'string' && BY_ID.has(id) ? BY_ID.get(id) : null);

  // Erlaubte Link-Hosts eines Eintrags: Hosts der Seite plus ausdrueckliche Anbieter-Hosts.
  function linkHosts(x) {
    const s = DLX.aisites && DLX.aisites.byId(x.id);
    return (s ? s.hosts : []).concat(x.anbieter);
  }
  // Link nur https, ohne Benutzer/Passwort/Port, Host exakt aus der Liste (Auflage 10); sonst ''.
  function safeLink(x, url) {
    if (!x || typeof url !== 'string' || !url) return '';
    let u;
    try { u = new URL(url); } catch (e) { return ''; }
    if (u.protocol !== 'https:' || u.username || u.password || u.port || linkHosts(x).indexOf(u.hostname) === -1) return '';
    return u.href;
  }

  const RANK = { nein: 0, teils: 1, unbekannt: 1, ja: 2 };
  // Wert fuer eine Kontoart: business ohne Firmenvariante = unbekannt; unknown = strengster.
  function value(x, type) {
    const biz = x.business === null ? 'unbekannt' : x.business;
    if (type === 'business') return biz;
    if (type === 'unknown' && x.business !== null) return RANK[biz] > RANK[x.personal] ? biz : x.personal;
    return x.personal;
  }
  const alterTage = (x, now) => (now - Date.parse(x.stand + 'T00:00:00Z')) / 86400000;
  // Vollstaendig: bekannte Werte, Datum, Quelle gueltig (Auflage 11).
  const complete = (x) => WERTE.indexOf(x.personal) !== -1 && (x.business === null || WERTE.indexOf(x.business) !== -1) &&
    /^\d{4}-\d{2}-\d{2}$/.test(x.stand) && !!safeLink(x, x.quelle);

  // Ampel fuer Seite + Kontoart; null = keine KI-Seite der Liste. gruen nur bei
  // "nein" fuer genau diese Kontoart, veraltet/unvollstaendig immer gelb (Auflage 11).
  function ampel(id, type, now) {
    const x = byId(id);
    if (!x) return null;
    const t = TYPES.indexOf(type) !== -1 ? type : 'unknown';
    const wert = value(x, t);
    const alt = !(alterTage(x, now) <= MAX_ALTER_TAGE);
    let farbe = wert === 'ja' ? 'rot' : wert === 'nein' ? 'gruen' : 'gelb';
    if ((alt || !complete(x)) && farbe === 'gruen') farbe = 'gelb';
    return { id, typ: t, wert, farbe, alt, stand: x.stand, quelle: safeLink(x, x.quelle), optOut: safeLink(x, x.optOut) };
  }

  // Kontoart fuer die Ampel: ohne accountRules fuer die Seite gilt personal; mit
  // Regel nur die gemeldete Kontoart aus der festen Liste, sonst unknown (Auflagen 8, 9).
  function typeFor(cfg, siteId, reported) {
    const rules = cfg && cfg.accountRules && typeof cfg.accountRules === 'object' ? cfg.accountRules : {};
    if (!Object.hasOwn(rules, siteId)) return 'personal';
    return TYPES.indexOf(reported) !== -1 ? reported : 'unknown';
  }

  // Bedingungen fuer declarativeContent (nur pageUrl, nur https, Host exakt; Pfad
  // auf Segmentgrenze: genau der Pfad oder Pfad + "/", Auflagen 4, 5) - entscheidet
  // wie DLX.aisites.find (Test in tests/training.test.mjs).
  function conditions(s) {
    const out = [];
    for (const h of s.hosts) {
      if (!s.pfad) { out.push({ hostEquals: h, schemes: ['https'] }); continue; }
      out.push({ hostEquals: h, pathEquals: s.pfad, schemes: ['https'] });
      out.push({ hostEquals: h, pathPrefix: s.pfad + '/', schemes: ['https'] });
    }
    return out;
  }

  DLX.training = Object.freeze({ STAND, MAX_ALTER_TAGE, WERTE, FARBEN, TYPES, LIST, byId, linkHosts, safeLink, value, ampel, typeFor, conditions });
})(globalThis);
