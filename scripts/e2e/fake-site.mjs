// Wegwerf-Attrappen von KI-Seiten fuer den E2E-Test (nur 127.0.0.1, Host-Pruefung,
// zufaelliger Port). Edge loest die Hosts per --host-resolver-rules hierher auf.
// Nur nachgebauter Seitenaufbau, keine echten KI-Seiten (Design-Review 13.10.2026).
import https from 'node:https';
import { createHash } from 'node:crypto';

// Wie die echten Seiten: das erste Senden oeffnet einen Chat mit eigener URL
// (der Handtest erkennt "gesendet" am Pfadwechsel oder am geleerten Feld).
// Neutrales Chat-Aussehen fuer Screenshots (keine fremden Marken, sichtbar als
// "Attrappe" beschriftet); ?theme=dunkel schaltet ein dunkles Seitenthema, wie es
// KI-Seiten unabhaengig vom System haben. Aufbau und Selektoren bleiben unveraendert.
const LOOK = `<style>
:root { color-scheme: light; --bg: #ffffff; --fg: #1f2328; --muted: #6b7280; --line: #e3e5e8; --box: #f4f4f5; --blase: #f0f1f3; }
html.dunkel { color-scheme: dark; --bg: #212121; --fg: #ececec; --muted: #a1a1aa; --line: #383838; --box: #2f2f2f; --blase: #303030; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
.att-kopf { position: fixed; top: 0; left: 0; right: 0; z-index: 2; height: 52px; display: flex; align-items: center; gap: 10px; padding: 0 20px; border-bottom: 1px solid var(--line); background: var(--bg); font-weight: 600; }
.att-kopf small { color: var(--muted); font-weight: 400; font-size: 12px; border: 1px solid var(--line); border-radius: 6px; padding: 1px 6px; }
.att-verlauf { max-width: 720px; margin: 0 auto; padding: 88px 20px 240px; }
.att-nutzer { margin: 0 0 20px auto; width: fit-content; max-width: 70%; padding: 10px 16px; border-radius: 18px; background: var(--blase); }
.att-ki { margin: 0 0 20px; color: var(--fg); }
.att-feld { position: fixed !important; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1; box-sizing: border-box; width: min(720px, calc(100% - 32px)); margin: 0 !important; padding: 12px 14px !important; display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; background: var(--box); border: 1px solid var(--line) !important; border-radius: 24px; }
.att-feld [contenteditable] { flex: 1 1 100%; min-height: 24px !important; margin: 0 !important; border: 0 !important; outline: none; }
.att-feld [contenteditable] p { margin: 0; }
.att-feld button { height: 32px; min-width: 32px; padding: 0 10px; border-radius: 16px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); font: inherit; font-size: 13px; }
.att-feld #send, .att-feld [data-testid="send-button"], .att-feld [aria-label="Send"] { margin-left: auto; background: var(--fg); color: var(--bg); border-color: var(--fg); }
.att-feld > div:not([contenteditable]) { display: contents; }
#log { position: absolute !important; left: -9999px !important; }
</style><script>if (new URLSearchParams(location.search).get('theme') === 'dunkel') document.documentElement.className = 'dunkel';</script>`;
const VERLAUF = (frage, antwort) => `<header class="att-kopf">KI-Assistent <small>Attrappe</small></header>
<main class="att-verlauf"><p class="att-nutzer">${frage}</p><p class="att-ki">${antwort}</p></main>`;

const NEW_CHAT = `function newChat() { if (!location.pathname.startsWith('/c/')) history.pushState(null, '', '/c/1' + location.search); }`;

// ChatGPT am 13.10.2026: versteckte Rueckfall-textarea, Composer
// div.ProseMirror[contenteditable] mit aria-label im form; ohne Text nur ein
// Diktat-Knopf, der Senden-Knopf (data-testid="send-button") erscheint erst mit
// Text; Enter sendet per eigenem keydown-Handler, nicht per submit.
const chatgpt = `<!doctype html><html><head><meta charset="utf-8"><title>fake</title>${LOOK}</head><body>
${VERLAUF('Kannst du mir helfen, eine Zahlungserinnerung zu formulieren?', 'Gerne. Schreiben Sie mir kurz, worum es geht und wie der Ton sein soll.')}
<form id="f" class="att-feld">
<textarea name="prompt-textarea" style="display:none"></textarea>
<div class="ProseMirror" contenteditable="true" translate="no" role="textbox" aria-label="Ask ChatGPT" style="min-height:40px;border:1px solid #999;margin-top:80px"><p><br></p></div>
<button type="button" aria-label="Dictate button">Mic</button>
<button type="button" id="voice" data-testid="composer-speech-button" aria-label="Start voice mode">Voice</button>
<span id="slot"></span>
<input type="file" id="datei" multiple accept="image/*" style="font-size:11px;max-width:180px">
</form>
<div id="log"></div>
<script>
${NEW_CHAT}
const ed = document.querySelector('.ProseMirror');
const log = document.getElementById('log');
const text = () => ed.innerText.trim();
// Bildpruefung (E2E): empfangene Dateien mit Name, Groesse und Kurz-Pruefsumme protokollieren.
window.__files = [];
async function got(kind, list) {
  for (const f of Array.from(list)) {
    window.__files.push(f);
    const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer())).slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
    log.textContent += kind + ':' + f.name + ':' + h + '|';
  }
}
ed.addEventListener('paste', (e) => { if (e.clipboardData && e.clipboardData.files.length) { e.preventDefault(); got('PASTE', e.clipboardData.files); } });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) got('DROP', e.dataTransfer.files); });
document.getElementById('datei').addEventListener('change', (e) => { if (e.target.files.length) got('INPUT', e.target.files); });
// Sprachmodus-Knopf (E2E Sprache/Diktat): protokolliert nur den Start.
document.getElementById('voice').addEventListener('click', () => { log.textContent += 'VOICE|'; });
function sync() {
  let b = document.querySelector('[data-testid="send-button"]');
  if (text() && !b) {
    b = document.createElement('button');
    b.type = 'button'; b.id = 'composer-submit-button'; b.dataset.testid = 'send-button';
    b.setAttribute('aria-label', 'Send prompt'); b.textContent = 'Send';
    b.addEventListener('click', send);
    document.getElementById('slot').append(b);
  }
  if (!text() && b) b.remove();
}
function send() {
  if (!text()) return;
  log.textContent += 'SENT:' + text() + '|';
  // Antwort der KI-Attrappe: wiederholt Platzhalter wie [IBAN_1] (Platzhalter-Test).
  if (/[[][A-Z0-9_]+_[0-9]+]/.test(text())) {
    const a = document.createElement('p');
    a.className = 'att-ki';
    a.textContent = 'Erhalten: ' + text().replace(/^Konto /, 'Ihr Konto ');
    document.body.append(a);   // zuletzt, wie eine neue Antwort im Verlauf
  }
  newChat();
  ed.replaceChildren(document.createElement('p'));
  sync();
}
ed.addEventListener('input', sync);
ed.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); send(); });
// Kontobereich (Regeln je Konto, Selektor wie content/account.js): ?konto=firma |
// privat (Firmenname nur in der versteckten Auswahlliste) | versteckt (aria-hidden) |
// durchsichtig (opacity 0) | keins. Erfundene Namen.
(() => {
  const k = new URLSearchParams(location.search).get('konto');
  if (!k || k === 'keins') return;
  const span = (t) => { const s = document.createElement('span'); s.textContent = t; return s; };
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.testid = k === 'firma' ? 'workspace-switcher-button' : 'accounts-profile-button';
  b.style.cssText = 'position:fixed;top:8px;right:16px;z-index:3;display:flex;gap:6px;padding:4px 10px;border-radius:8px';
  b.append(span(k === 'privat' ? 'Max Muster' : 'Beispiel AG'), span(k === 'privat' ? 'Plus' : 'Team'));
  if (k === 'privat') {
    const m = document.createElement('div');
    m.setAttribute('role', 'menu');
    m.style.display = 'none';
    const it = document.createElement('div');
    it.setAttribute('role', 'menuitem');
    it.textContent = 'Beispiel AG';
    m.append(it);
    b.append(m);
  }
  if (k === 'versteckt') b.setAttribute('aria-hidden', 'true');
  if (k === 'durchsichtig') b.style.opacity = '0';
  document.body.append(b);
})();
</script></body></html>`;

// claude.ai am 13.10.2026 (Live-Test): html lang de-DE, Composer
// div.tiptap.ProseMirror[contenteditable][role=textbox] in einem fieldset, kein
// form; Senden-Knopf button[type=button] aria-label "Nachricht senden" im
// fieldset. Entwurf wird lokal gespeichert und beim Neuladen ohne Ereignis
// wiederhergestellt. Die Seite ist hoeher als das Fenster (Scrollleiste).
// ?send=keyup|keypress|pointerdown: Seite sendet auf diesem Ereignis statt auf
// keydown/click (Varianten, die die Sende-Sperre ebenfalls abfangen muss).
const claude = `<!doctype html><html lang="de-DE"><head><meta charset="utf-8"><title>fake</title>${LOOK}</head><body>
<div style="min-height:160vh">
${VERLAUF('Bitte prüfe diese Überweisung auf Tippfehler.', 'Klar – fügen Sie die Angaben ein, ich sehe sie mir an.')}
<fieldset class="att-feld" style="border:1px solid #999;margin-top:80px">
<div class="tiptap ProseMirror" contenteditable="true" translate="no" role="textbox" aria-label="Schreibe deinen Prompt an Claude" style="min-height:40px"><p><br></p></div>
<button type="button" aria-label="Diktat starten">Mic</button>
<button type="button" aria-label="Nachricht senden" id="send">&#8593;</button>
</fieldset>
</div>
<div id="log" style="position:fixed;bottom:0"></div>
<script>
${NEW_CHAT}
const mode = new URLSearchParams(location.search).get('send') || 'keydown';
const ed = document.querySelector('.tiptap');
const btn = document.getElementById('send');
const log = document.getElementById('log');
const text = () => ed.innerText.trim();
const draft = localStorage.getItem('draft');
if (draft) { const p = document.createElement('p'); p.textContent = draft; ed.replaceChildren(p); }
function send() {
  if (!text()) return;
  log.textContent += 'SENT:' + text() + '|';
  newChat();
  ed.replaceChildren(document.createElement('p'));
  localStorage.removeItem('draft');
}
ed.addEventListener('input', () => localStorage.setItem('draft', text()));
const enterEv = mode === 'keyup' || mode === 'keypress' ? mode : 'keydown';
ed.addEventListener(enterEv, (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
if (enterEv === 'keyup') ed.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) e.preventDefault(); });
btn.addEventListener(mode === 'pointerdown' ? 'pointerdown' : 'click', send);
</script></body></html>`;

// Microsoft 365 Copilot (copilot.cloud.microsoft) am 13.10.2026: Composer
// span#m365-chat-editor-target-element[contenteditable] mit aria-label
// "Message Copilot", kein form; Senden-Knopf type=button neben dem Feld.
const m365 = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fake</title>${LOOK}</head><body>
${VERLAUF('Summarise the attached invoice for me.', 'Sure – paste the relevant part and I will summarise it.')}
<div><div class="att-feld"><div style="margin-top:80px">
<span id="m365-chat-editor-target-element" contenteditable="true" role="textbox" aria-label="Message Copilot" style="display:block;min-height:40px;border:1px solid #999"></span>
</div>
<div><button type="button" aria-label="Send">Send</button></div>
</div></div>
<input id="search" type="text" aria-label="Search" style="position:fixed;top:12px;right:20px;z-index:3">
<div id="log"></div>
<script>
const ed = document.getElementById('m365-chat-editor-target-element');
const log = document.getElementById('log');
const text = () => ed.innerText.trim();
function send() {
  if (!text()) return;
  log.textContent += 'SENT:' + text() + '|';
  ed.replaceChildren();
}
ed.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
document.querySelector('button[aria-label="Send"]').addEventListener('click', send);
</script></body></html>`;

// Gemini und Copilot (Consumer) nach den Selektoren in content/adapters.js:
// contenteditable .ql-editor in rich-textarea bzw. textarea#userInput im form.
const gemini = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fake</title></head><body>
<div style="margin-top:80px"><rich-textarea><div class="ql-editor" contenteditable="true" role="textbox" aria-label="Enter a prompt here" style="min-height:40px;border:1px solid #999"><p><br></p></div></rich-textarea>
<div class="send-button-container"><button class="send-button" aria-label="Send message">Send</button></div></div>
<div id="log"></div>
<script>
${NEW_CHAT}
const ed = document.querySelector('.ql-editor');
const log = document.getElementById('log');
const text = () => ed.innerText.trim();
function send() {
  if (!text()) return;
  log.textContent += 'SENT:' + text() + '|';
  newChat();
  ed.replaceChildren(document.createElement('p'));
}
ed.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
document.querySelector('.send-button').addEventListener('click', send);
</script></body></html>`;

const copilot = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fake</title></head><body>
<form id="f" style="margin-top:80px"><textarea id="userInput" data-testid="composer-input" aria-label="Message Copilot" style="width:400px;height:40px"></textarea>
<button type="submit" data-testid="submit-button" aria-label="Submit message">Send</button></form>
<div id="log"></div>
<script>
${NEW_CHAT}
const ed = document.getElementById('userInput');
const log = document.getElementById('log');
function send() {
  if (!ed.value.trim()) return;
  log.textContent += 'SENT:' + ed.value.trim() + '|';
  newChat();
  ed.value = '';
}
ed.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); send(); });
</script></body></html>`;

// Vertrauliche Quelle fuer den Zwischenablage-Schutz (nur Testhost bank.example, erfundene Daten).
const bank = `<!doctype html><html><head><meta charset="utf-8"><title>bank</title></head><body>
<h1>Konto (Attrappe)</h1>
<p id="lohn">Lohnliste Oktober Muster AG – Anna Beispiel 6500 CHF</p>
<p id="kurz">Ja OK</p>
<p id="anders">Kontoauszug Seite 2 Muster Bank</p>
<!-- Formularwache: Testformular (erfundene Daten), Absenden nur ins eigene Protokoll -->
<form id="kontakt"><input id="name" name="name"><textarea id="nachricht" name="nachricht"></textarea><input type="password" id="pw" name="pw"><button id="senden">Senden</button></form>
<pre id="log"></pre>
<script>document.getElementById('kontakt').addEventListener('submit', (e) => { e.preventDefault(); document.getElementById('log').textContent += 'SUBMIT|'; });</script>
</body></html>`;

// Beliebige Seite fuer den Hinweis beim Kopieren (Design-Review Kopierwarnung 16.10.2026; erfundene Daten,
// offizielle Test-IBAN). Strenge CSP wie viele echte Seiten: der Hinweis darf keine Inline-Stile im Markup brauchen.
const notizen = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-NOTIZEN'; style-src 'none'"><title>notizen</title></head><body>
<h1>Notizen (Attrappe)</h1>
<p id="sauber">Treffen am Montag um 10 Uhr im Sitzungszimmer.</p>
<p id="iban">Zahlung bitte auf CH93 0076 2011 6238 5295 7, Verwendungszweck Rechnung 1234.</p>
<p id="text">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere erat a ante venenatis dapibus.</p>
<pre id="log"></pre>
<script>NOTIZEN_SKRIPT</script>
</body></html>`;
const NOTIZEN_SKRIPT = "document.addEventListener('copy', (e) => { setTimeout(() => { document.getElementById('log').textContent += 'COPY:' + e.defaultPrevented + '|'; }, 0); });";
const notizenSeite = notizen.replace('NOTIZEN_SKRIPT', NOTIZEN_SKRIPT).replace('sha256-NOTIZEN', 'sha256-' + createHash('sha256').update(NOTIZEN_SKRIPT).digest('base64'));

export const PAGES = { 'bank.example': bank, 'notizen.example': notizenSeite, 'chatgpt.com': chatgpt, 'claude.ai': claude, 'gemini.google.com': gemini, 'copilot.microsoft.com': copilot,
  'copilot.com': copilot,
  'copilot.cloud.microsoft': m365, 'm365.cloud.microsoft': m365 };

export function startFakeSite(key, cert) {
  const server = https.createServer({ key, cert }, (req, res) => {
    const page = Object.hasOwn(PAGES, req.headers.host) ? PAGES[req.headers.host] : null;
    if (!page) { res.writeHead(403); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() })));
}
