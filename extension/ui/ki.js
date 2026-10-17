// Offscreen-Dokument, Teil lokale KI-Erkennung (Design-Review KI 16.10.2026):
// laesst Modell, ONNX-WASM und Tokenizer vom Lade-Worker ui/ki-lader.js aus den
// Paket-Stuecken vendor/ki/daten lesen (kein fetch, connect-src 'none') und
// uebertraegt die Puffer an den Modul-Worker ui/ki-worker.mjs (Auflagen 8, 9). Nimmt nur
// Nachrichten mit Zielmarke vom eigenen Service Worker an (Auflage 13); Text
// lebt nur bis zur Antwort im Speicher, nichts wird gespeichert oder ausgegeben.
(function (g) {
  'use strict';
  const TARGET = 'dlx-ki';
  const SW_URL = chrome.runtime.getURL('background.js');
  const MAX_TEXT = 4000;
  const IDLE_MS = 600000;

  let worker = null;
  let ready = null;
  let ep = null;
  let n = 0;
  const waiting = new Map();
  let queue = Promise.resolve();

  // Bytes aus dem kurzlebigen Lade-Worker ui/ki-lader.js; danach wird er beendet,
  // damit die base64-Quelltexte nicht im Speicher bleiben (Auflage 9).
  // Fortschritt (nur Zahl) geht an den eigenen Service Worker; Fehler mit festem Grund.
  function loadParts() {
    return new Promise((resolve, reject) => {
      const w = new Worker('ki-lader.js');
      w.onmessage = (e) => {
        const d = e.data || {};
        if (Number.isInteger(d.p)) { chrome.runtime.sendMessage({ t: 'kiFortschritt', p: d.p }).catch(() => {}); return; }
        w.terminate();
        if (d.ok) resolve(d); else reject(new Error(d.grund === 'paket' ? 'paket' : 'laden'));
      };
      w.onerror = () => { w.terminate(); reject(new Error('paket')); };
    });
  }

  function call(msg, transfer) {
    return new Promise((resolve, reject) => {
      const id = ++n;
      waiting.set(id, { resolve, reject });
      worker.postMessage(Object.assign({ id }, msg), transfer || []);
    });
  }

  function stop() {
    if (worker) worker.terminate();
    worker = null;
    ready = null;
    ep = null;
    for (const w of waiting.values()) w.reject(new Error('stop'));
    waiting.clear();
  }

  function start(gpu) {
    if (ready) return ready;
    const mine = (async () => {
      const { model, wasm, tokenizer, labels } = await loadParts();
      worker = new Worker('ki-worker.mjs', { type: 'module' });
      worker.onmessage = (e) => {
        const d = e.data;
        const w = d && waiting.get(d.id);
        if (!w) return;
        waiting.delete(d.id);
        if (d.error) w.reject(new Error(d.error)); else w.resolve(d);
      };
      worker.onerror = () => stop();
      const r = await call({ t: 'init', model, wasm, tokenizer, labels, gpu }, [model, wasm, tokenizer]).catch(() => { throw new Error('start'); });
      ep = r.ep;
    })();
    ready = mine;
    mine.catch(() => { if (ready === mine) stop(); });
    return mine;
  }

  // Modell nach 10 Min ohne Pruefung aus dem Speicher (auch wenn das Dokument offen bleibt).
  let idle = null;
  function touch() {
    clearTimeout(idle);
    idle = setTimeout(stop, IDLE_MS);
  }
  // Vorladen ohne Text (Design-Review KI vorladen 16.10.2026, Auflage 1).
  async function load(gpu) {
    touch();
    try {
      await start(gpu);
      return { ok: true, ep };
    } catch (e) {
      stop();
      return { error: ['paket', 'laden', 'start'].includes(e && e.message) ? e.message : 'laden' };
    }
  }
  async function run(msg) {
    touch();
    try {
      const t0 = performance.now();
      await start(msg.gpu === true);
      const t1 = performance.now();
      const r = await call({ t: 'run', text: msg.text });
      return { ents: r.ents, ep, loadMs: Math.round(t1 - t0), ms: Math.round(performance.now() - t1) };
    } catch (e) {
      stop();
      return { error: 'fail' };
    }
  }

  // Nur der eigene Service Worker, fuer run, load und stop gleich (Auflage 1).
  const fromSw = (sender) => sender.id === chrome.runtime.id && !sender.tab && sender.url === SW_URL;
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.target !== TARGET || !fromSw(sender)) return;
    if (msg.t === 'stop') { stop(); sendResponse({ ok: true }); return; }
    if (msg.t === 'load') { load(msg.gpu === true).then(sendResponse); return true; }
    if (msg.t !== 'run' || typeof msg.text !== 'string' || msg.text.length > MAX_TEXT) return;
    // Nacheinander, nie parallel.
    const job = queue.then(() => run(msg));
    queue = job.catch(() => {});
    job.then(sendResponse, () => sendResponse({ error: 'fail' }));
    return true;
  });
})(globalThis);
