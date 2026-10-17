// Worker der lokalen KI-Erkennung (Modul-Worker, nur vom Offscreen-Dokument
// ui/ki.js gestartet). ONNX-Laufzeit und Tokenizer statisch aus dem Paket
// (vendor/ki, gepinnt), kein import() zur Laufzeit, kein wasmPaths, kein Netz
// (CSP connect-src 'none'). Modell-, WASM- und Tokenizer-Bytes kommen als
// uebertragene ArrayBuffer; zurueck gehen nur Typ, Start, Ende, Konfidenz
// (Design-Review KI 16.10.2026, Auflagen 8, 9, 11).
import * as ort from '../vendor/ki/ort.webgpu.bundle.min.mjs';
import { Tokenizer } from '../vendor/ki/tokenizers.min.mjs';
import { createRunner } from './ki-lauf.mjs';

let runner = null;
let ep = null;

async function init(d) {
  const tokenizerJson = JSON.parse(new TextDecoder().decode(d.tokenizer));
  // WebGPU wenn vorhanden und nicht abgeschaltet, sonst WASM (Rueckfall).
  const gpu = d.gpu === true && typeof navigator !== 'undefined' && navigator.gpu && await navigator.gpu.requestAdapter().catch(() => null);
  for (const eps of gpu ? [['webgpu'], ['wasm']] : [['wasm']]) {
    try {
      runner = await createRunner({ ort, Tokenizer, model: new Uint8Array(d.model), tokenizerJson, labels: d.labels, executionProviders: eps, wasmBinary: d.wasm });
      ep = eps[0];
      return;
    } catch (e) {
      runner = null;
    }
  }
  throw new Error('init');
}

self.onmessage = async (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  try {
    if (d.t === 'init') {
      await init(d);
      self.postMessage({ id: d.id, ok: true, ep });
    } else if (d.t === 'run' && runner && typeof d.text === 'string') {
      const ents = await runner.run(d.text);
      self.postMessage({ id: d.id, ents });
    } else {
      self.postMessage({ id: d.id, error: 'state' });
    }
  } catch (err) {
    // Nur Fehlerart, nie Text oder Tensor-Inhalte (Auflage 11).
    self.postMessage({ id: d.id, error: d.t === 'init' ? 'init' : 'run' });
  }
};
