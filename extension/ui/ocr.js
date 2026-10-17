// Offscreen-Dokument (nur vom Service Worker angelegt, nie web_accessible):
// lokale Texterkennung mit den gepinnten Tesseract-Dateien aus vendor/ocr
// (Design-Review Bilder 14.10.2026). Kein Netz (connect-src 'none'), kein
// Cache, keine Datenbank, keine Konsolenausgabe von Text. Zurueck gehen nur
// Woerter mit Rahmen; Bildbytes und Text bleiben nur bis zum Ende des Auftrags
// im Speicher.
(function (g) {
  'use strict';
  const B = g.DLX.bild;
  const TARGET = 'dlx-ocr';
  const IDLE_MS = 60000;
  const SW_URL = chrome.runtime.getURL('background.js');
  const CORE = chrome.runtime.getURL('vendor/ocr/tesseract-core-simd-lstm.wasm.js');

  let worker = null;
  let ready = null;
  let langsKey = '';
  let jobN = 0;
  const waiting = new Map();
  let idleTimer = null;
  let queue = Promise.resolve();

  // Direktes Nachrichtenprotokoll des Tesseract-Workers (tesseract.js 7.0.0,
  // gepinnt): load, loadLanguage, initialize, recognize. Sprachdaten als
  // {code, data} aus eigenen Dateien, cacheMethod 'none' (Auflage 11).
  function call(action, payload) {
    return new Promise((resolve, reject) => {
      const jobId = 'j' + (++jobN);
      waiting.set(jobId, { resolve, reject });
      worker.postMessage({ workerId: 'dlx', jobId, action, payload });
    });
  }

  function onMessage(e) {
    const d = e.data;
    if (!d || typeof d !== 'object' || !waiting.has(d.jobId) || d.status === 'progress') return;
    const w = waiting.get(d.jobId);
    waiting.delete(d.jobId);
    if (d.status === 'resolve') w.resolve(d.data); else w.reject(new Error('ocr'));
  }

  function stopWorker() {
    if (worker) worker.terminate();
    worker = null;
    ready = null;
    langsKey = '';
    for (const w of waiting.values()) w.reject(new Error('stop'));
    waiting.clear();
  }

  // Sprachdaten per <script> aus vendor/ocr/lang (kein fetch, connect-src bleibt 'none').
  function loadLang(code) {
    if (g.DLX_OCR_LANG && typeof g.DLX_OCR_LANG[code] === 'string') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '../vendor/ocr/lang/' + code + '.js';
      s.onload = () => (g.DLX_OCR_LANG && typeof g.DLX_OCR_LANG[code] === 'string' ? resolve() : reject(new Error('lang')));
      s.onerror = () => reject(new Error('lang'));
      document.head.append(s);
    });
  }

  function bytesOf(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function start(langs) {
    const key = langs.join('+');
    if (ready && langsKey === key) return ready;
    stopWorker();
    langsKey = key;
    worker = new Worker('../vendor/ocr/worker.min.js');
    worker.onmessage = onMessage;
    worker.onerror = () => stopWorker();
    const mine = (async () => {
      await call('load', { options: { lstmOnly: true, corePath: CORE, logging: false } });
      for (const l of langs) await loadLang(l);
      const data = langs.map((l) => ({ code: l, data: bytesOf(g.DLX_OCR_LANG[l]) }));
      await call('loadLanguage', { langs: data, options: { cacheMethod: 'none', gzip: true, lstmOnly: true } });
      await call('initialize', { langs: key, oem: 1, config: {} });
    })();
    ready = mine;
    mine.catch(() => { if (ready === mine) stopWorker(); });
    return mine;
  }

  // Fremdes Bild nur mit dem Browser-Dekoder oeffnen (nach der Kopfpruefung),
  // dann als eigenes Graustufen-PGM an Tesseract (Auflagen 9, 11).
  async function prepare(bytes) {
    const pre = B.precheck(bytes);
    if (!pre.ok) throw new Error(pre.reason);
    const bmp = await createImageBitmap(new Blob([bytes]));
    try {
      if (bmp.width * bmp.height > B.LIMITS.pixels) throw new Error('size');
      const k = B.scaleFor(bmp.width, bmp.height);
      const w = bmp.width * k, h = bmp.height * k;
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, w, h);
      const px = ctx.getImageData(0, 0, w, h).data;
      c.width = 0; c.height = 0;
      const head = new TextEncoder().encode('P5\n' + w + ' ' + h + '\n255\n');
      const pgm = new Uint8Array(head.length + w * h);
      pgm.set(head);
      for (let i = 0, j = head.length; i < px.length; i += 4, j++) pgm[j] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
      return { pgm, scale: k, w: bmp.width, h: bmp.height };
    } finally {
      bmp.close();
    }
  }

  // Nur Woerter mit Rahmen, kein hOCR/TSV/Bild (Auflage 4).
  function linesOf(blocks) {
    const out = [];
    for (const b of blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
      out.push((l.words || []).map((w) => [String(w.text || ''), w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1]));
    }
    return out;
  }

  async function run(msg) {
    clearTimeout(idleTimer);
    try {
      const img = await prepare(bytesOf(msg.data));
      await start(msg.langs);
      const t0 = performance.now();
      const r = await call('recognize', { image: img.pgm, options: {}, output: { text: false, blocks: true, hocr: false, tsv: false } });
      return { lines: linesOf(r && r.blocks), scale: img.scale, w: img.w, h: img.h, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      const reason = e && (e.message === 'size' || e.message === 'type') ? e.message : 'fail';
      if (reason === 'fail') stopWorker();
      return { error: reason };
    } finally {
      idleTimer = setTimeout(stopWorker, IDLE_MS);
    }
  }

  // Nur Nachrichten mit fester Zielmarke vom eigenen Service Worker (Auflage 2).
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.target !== TARGET || sender.id !== chrome.runtime.id || sender.tab || sender.url !== SW_URL) return;
    const langs = Array.isArray(msg.langs) ? msg.langs : [];
    if (msg.t !== 'run' || typeof msg.data !== 'string' || !langs.length || langs.length > 3 || !langs.every((l) => B.LANGS.includes(l))) return;
    // Bilder nacheinander, nie parallel (Auflage 10).
    const job = queue.then(() => run(msg));
    queue = job.catch(() => {});
    job.then(sendResponse, () => sendResponse({ error: 'fail' }));
    return true;
  });
})(globalThis);
