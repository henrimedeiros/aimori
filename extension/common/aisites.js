// Gepflegte Liste bekannter KI-Seiten fuer die Richtlinien allowedAiSites,
// blockedAiSites und aiSiteMode (Design-Review KI-Seiten 14.10.2026, Auflage 2).
// Reine Daten: Hosts klein, ASCII, ohne Port/Pfad/*, jeder Host genau einmal,
// www-Varianten einzeln. pfad = nur dieser Pfadanfang zaehlt (Seite teilt sich
// den Host mit Nicht-KI-Inhalten). anbieterSitz = Land des Firmensitzes laut
// oeffentlichen Angaben, keine Aussage zum Datenstandort. Aenderungen nur per
// Release (keine Liste aus dem Netz); danach `npm run build` (Manifest, Doku).
(function (g) {
  'use strict';
  const DLX = g.DLX || (g.DLX = {});
  const STAND = '2026-10-14';
  const E = (id, name, kategorie, anbieterSitz, hosts, pfad) => Object.freeze({ id, name, kategorie, anbieterSitz, hosts: Object.freeze(hosts), pfad: pfad || '' });
  const LIST = Object.freeze([
    E('chatgpt', 'ChatGPT', 'chat', 'US', ['chatgpt.com', 'chat.openai.com']),
    E('claude', 'Claude', 'chat', 'US', ['claude.ai']),
    E('gemini', 'Gemini', 'chat', 'US', ['gemini.google.com']),
    E('copilot', 'Microsoft Copilot', 'chat', 'US', ['copilot.microsoft.com', 'copilot.com']),
    E('m365copilot', 'Microsoft 365 Copilot', 'chat', 'US', ['copilot.cloud.microsoft', 'm365.cloud.microsoft']),
    E('perplexity', 'Perplexity', 'suche', 'US', ['perplexity.ai', 'www.perplexity.ai']),
    E('mistral', 'Mistral Le Chat', 'chat', 'FR', ['chat.mistral.ai']),
    E('deepseek', 'DeepSeek', 'chat', 'CN', ['chat.deepseek.com']),
    E('grok', 'Grok', 'chat', 'US', ['grok.com']),
    E('poe', 'Poe', 'sammler', 'US', ['poe.com']),
    E('characterai', 'Character.AI', 'begleiter', 'US', ['character.ai']),
    E('you', 'You.com', 'suche', 'US', ['you.com']),
    E('huggingchat', 'HuggingChat', 'chat', 'US', ['huggingface.co'], '/chat'),
    E('metaai', 'Meta AI', 'chat', 'US', ['meta.ai', 'www.meta.ai']),
    E('qwen', 'Qwen Chat', 'chat', 'CN', ['chat.qwen.ai']),
    E('kimi', 'Kimi', 'chat', 'CN', ['kimi.com', 'www.kimi.com', 'kimi.moonshot.cn']),
    E('zai', 'Z.ai (GLM)', 'chat', 'CN', ['chat.z.ai', 'chatglm.cn']),
    E('doubao', 'Doubao', 'chat', 'CN', ['www.doubao.com']),
    E('ernie', 'ERNIE Bot (Yiyan)', 'chat', 'CN', ['yiyan.baidu.com']),
    E('pi', 'Pi', 'begleiter', 'US', ['pi.ai']),
    E('duckai', 'Duck.ai', 'chat', 'US', ['duck.ai']),
    E('aistudio', 'Google AI Studio', 'code', 'US', ['aistudio.google.com']),
    E('notebooklm', 'NotebookLM', 'schreiben', 'US', ['notebooklm.google.com']),
    E('jules', 'Jules', 'code', 'US', ['jules.google.com']),
    E('githubcopilot', 'GitHub Copilot Chat', 'code', 'US', ['github.com'], '/copilot'),
    E('phind', 'Phind', 'code', 'US', ['phind.com', 'www.phind.com']),
    E('v0', 'v0', 'code', 'US', ['v0.dev', 'v0.app']),
    E('bolt', 'Bolt', 'code', 'US', ['bolt.new']),
    E('lovable', 'Lovable', 'code', 'SE', ['lovable.dev']),
    E('replit', 'Replit', 'code', 'US', ['replit.com']),
    E('genspark', 'Genspark', 'suche', 'US', ['www.genspark.ai', 'genspark.ai']),
    E('manus', 'Manus', 'chat', 'SG', ['manus.im']),
    E('felo', 'Felo', 'suche', 'JP', ['felo.ai']),
    E('openrouter', 'OpenRouter Chat', 'sammler', 'US', ['openrouter.ai']),
    E('lmarena', 'LMArena', 'sammler', 'US', ['lmarena.ai']),
    E('deepl', 'DeepL', 'uebersetzung', 'DE', ['www.deepl.com', 'deepl.com']),
    E('jasper', 'Jasper', 'schreiben', 'US', ['app.jasper.ai']),
    E('copyai', 'Copy.ai', 'schreiben', 'US', ['app.copy.ai']),
    E('writesonic', 'Writesonic', 'schreiben', 'US', ['app.writesonic.com']),
    E('gamma', 'Gamma', 'praesentation', 'US', ['gamma.app']),
    E('midjourney', 'Midjourney', 'bild', 'US', ['www.midjourney.com', 'midjourney.com']),
    E('firefly', 'Adobe Firefly', 'bild', 'US', ['firefly.adobe.com']),
    E('designer', 'Microsoft Designer', 'bild', 'US', ['designer.microsoft.com']),
    E('leonardo', 'Leonardo.Ai', 'bild', 'AU', ['app.leonardo.ai']),
    E('ideogram', 'Ideogram', 'bild', 'CA', ['ideogram.ai']),
    E('dreamstudio', 'DreamStudio', 'bild', 'GB', ['dreamstudio.ai']),
    E('sora', 'Sora', 'video', 'US', ['sora.chatgpt.com', 'sora.com']),
    E('runway', 'Runway', 'video', 'US', ['app.runwayml.com']),
    E('heygen', 'HeyGen', 'video', 'US', ['app.heygen.com']),
    E('synthesia', 'Synthesia', 'video', 'GB', ['app.synthesia.io']),
    E('suno', 'Suno', 'audio', 'US', ['suno.com']),
    E('elevenlabs', 'ElevenLabs', 'audio', 'US', ['elevenlabs.io']),
  ]);
  const IDS = Object.freeze(LIST.map((x) => x.id));
  const BY_HOST = new Map();
  for (const x of LIST) for (const h of x.hosts) BY_HOST.set(h, x);

  // Ursprung fuer Rechte und frame-ancestors: genau https://<host>/* je Host.
  const origins = () => LIST.flatMap((x) => x.hosts.map((h) => 'https://' + h + '/*'));
  // Muster fuer die Registrierung des Waechters (mit Pfadanfang, falls gesetzt).
  const pattern = (x, h) => 'https://' + h + (x.pfad ? x.pfad + '*' : '/*');

  // Eintrag fuer origin (https://host, exakt) und optional URL; null = keine KI-Seite der Liste.
  function find(origin, url) {
    if (typeof origin !== 'string' || !origin.startsWith('https://')) return null;
    const x = BY_HOST.get(origin.slice(8));
    if (!x) return null;
    if (!x.pfad) return x;
    let path = '';
    try { path = new URL(url).pathname; } catch (e) { return null; }
    return path === x.pfad || path.startsWith(x.pfad + '/') ? x : null;
  }

  // Eintrag per ID nur ueber die Map (nie liste[id]: constructor, __proto__ ...).
  const BY_ID = new Map(LIST.map((x) => [x.id, x]));
  const byId = (id) => (typeof id === 'string' && BY_ID.has(id) ? BY_ID.get(id) : null);
  // Startadresse fuer den Knopf "Zu ... wechseln": fest https, erster Host, Pfad aus der Liste.
  const start = (x) => 'https://' + x.hosts[0] + (x.pfad || '/');

  DLX.aisites = Object.freeze({ STAND, LIST, IDS, origins, pattern, find, byId, start });
})(globalThis);
