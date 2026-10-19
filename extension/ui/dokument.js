// Offscreen-Dokument, Teil Dokumente (Design-Review A-D 16.10.2026, Auflagen 9,
// 12, 15): liest PDF/DOCX/XLSX/TXT/CSV mit engine/datei.js. Nur Nachrichten mit
// fester Zielmarke vom eigenen Service Worker; ein Auftrag nach dem anderen.
// Kein Netz (CSP default-src 'none'), keine Konsolenausgabe, kein Speicher:
// Bytes und Text leben nur bis zur Antwort.
(function (g) {
  'use strict';
  const D = g.DLX.datei;
  const TARGET = 'dlx-doc';
  const SW_URL = chrome.runtime.getURL('background.js');
  const KINDS = ['pdf', 'docx', 'xlsx', 'text'];
  let queue = Promise.resolve();

  function bytesOf(b64) {
    const s = atob(b64);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  // Antwort traegt die Auftrags-ID des SW zurueck (Design-Review Datei-Uploads 17.10.2026, Auflage 13).
  async function run(msg) {
    try {
      const r = await D.extract(bytesOf(msg.data), msg.kind, msg.ms);
      return { id: msg.id, text: r.text, partial: r.partial === true };
    } catch (e) {
      return { id: msg.id, error: e && D.CODES.indexOf(e.message) !== -1 ? e.message : 'fail' };
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.target !== TARGET || sender.id !== chrome.runtime.id || sender.tab || sender.url !== SW_URL) return;
    if (msg.t !== 'run' || typeof msg.id !== 'string' || typeof msg.data !== 'string' || KINDS.indexOf(msg.kind) === -1) return;
    const job = queue.then(() => run(msg));
    queue = job.catch(() => {});
    job.then(sendResponse, () => sendResponse({ error: 'fail' }));
    return true;
  });
})(globalThis);
