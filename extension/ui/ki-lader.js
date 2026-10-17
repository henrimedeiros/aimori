// Kurzlebiger Lade-Worker der lokalen KI-Erkennung (klassischer Worker, nur von
// ui/ki.js gestartet): liest Modell, ONNX-WASM und Tokenizer aus den Paket-Stuecken
// vendor/ki/daten per importScripts (kein fetch, connect-src 'none'), dekodiert sie
// Stueck fuer Stueck in je einen vorallokierten Puffer und uebertraegt die Puffer.
// Danach beendet ui/ki.js diesen Worker; damit gibt der Browser auch die
// base64-Quelltexte frei (Speicher, Design-Review KI 16.10.2026, Auflage 9).
// Meldet nur den Fortschritt als Zahl 0-90 und bei Fehlern einen festen Grund:
// paket = Paket-Datei fehlt, laden = Inhalt passt nicht (Design-Review KI vorladen 16.10.2026).
'use strict';
let total = 0;
let done = 0;
let last = -1;
function step() {
  done++;
  const p = Math.floor((done / total) * 90);
  if (p >= last + 5) { last = p; self.postMessage({ p }); }
}
function paket(fn) {
  try { fn(); } catch (e) { throw new Error('paket'); }
}

function part(name) {
  const info = self.DLX_KI_INHALT.teile[name];
  const buf = new Uint8Array(info.bytes);
  let off = 0;
  for (let i = 0; i < info.n; i++) {
    self.DLX_KI_STUECK = (nm, idx, b64) => {
      if (nm !== name || idx !== i) return;
      if (buf.setFromBase64) { off += buf.subarray(off).setFromBase64(b64).written; return; }
      const bin = atob(b64);
      for (let k = 0; k < bin.length; k++) buf[off + k] = bin.charCodeAt(k);
      off += bin.length;
    };
    paket(() => importScripts('../vendor/ki/daten/' + name + '-' + String(i).padStart(2, '0') + '.js'));
    step();
  }
  self.DLX_KI_STUECK = null;
  if (off !== info.bytes) throw new Error('laden');
  return buf.buffer;
}

try {
  paket(() => importScripts('../vendor/ki/inhalt.js'));
  const teile = self.DLX_KI_INHALT && self.DLX_KI_INHALT.teile;
  if (!teile || !teile.model || !teile.wasm || !teile.tokenizer) throw new Error('paket');
  total = teile.model.n + teile.wasm.n + teile.tokenizer.n;
  const model = part('model');
  const wasm = part('wasm');
  const tokenizer = part('tokenizer');
  self.postMessage({ ok: true, model, wasm, tokenizer, labels: self.DLX_KI_INHALT.labels }, [model, wasm, tokenizer]);
} catch (e) {
  self.postMessage({ ok: false, grund: e && e.message === 'paket' ? 'paket' : 'laden' });
}
