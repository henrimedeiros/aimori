// Lokale KI-Erkennung: Tokenisieren, Modell rechnen, BIO-Labels zu Spannen
// zusammenfassen. Gemeinsam fuer den Worker (ui/ki-worker.mjs) und die Messung
// in Node (scripts/ki-messung.mjs). Kein Netz, keine Konsolenausgabe, nichts
// gespeichert: Text und Tensoren leben nur bis zum Ende von run()
// (Design-Review KI 16.10.2026, Auflagen 9, 11, 15).
const MAX_TOK = 510;      // 512 minus <s> und </s>
const OVERLAP = 64;       // Ueberlappung der Fenster (Auflage 15)
const BOS = 0, EOS = 2;

export async function createRunner({ ort, Tokenizer, model, tokenizerJson, labels, executionProviders, wasmBinary }) {
  ort.env.logLevel = 'error';
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  if (wasmBinary) ort.env.wasm.wasmBinary = wasmBinary;
  const session = await ort.InferenceSession.create(model, { executionProviders, logSeverityLevel: 3, graphOptimizationLevel: 'all' });
  const tok = new Tokenizer(tokenizerJson, {});
  const needsTypes = session.inputNames.indexOf('token_type_ids') !== -1;

  // Text -> Tokens mit Zeichenspannen. Die Tokenizer-Vorstufe (Metaspace) trennt
  // nur an Leerraum, darum je Wort einzeln kodieren und die Teilstuecke der Reihe
  // nach im Wort verorten.
  function tokens(text) {
    const out = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const word = m[0];
      const enc = tok.encode(word, { add_special_tokens: false });
      let pos = 0;
      let first = true;
      for (let i = 0; i < enc.ids.length; i++) {
        const piece = String(enc.tokens[i] || '').replace(/^▁/, '');
        let len = piece.length;
        // Reines Wortanfangs-Zeichen: leere Spanne, zaehlt nicht als Wortanfang.
        if (!piece) { out.push({ id: enc.ids[i], s: m.index + pos, e: m.index + pos, w0: false, empty: true }); continue; }
        if (word.substr(pos, len) !== piece) {
          const at = piece ? word.indexOf(piece, pos) : -1;
          if (at !== -1 && at - pos < 3) pos = at; else len = Math.min(Math.max(len, 1), word.length - pos);
        }
        if (i === enc.ids.length - 1) len = Math.max(len, word.length - pos);
        const s = m.index + Math.min(pos, word.length);
        const e = m.index + Math.min(pos + len, word.length);
        out.push({ id: enc.ids[i], s, e, w0: first, ws: m.index });
        first = false;
        pos = Math.min(pos + len, word.length);
      }
    }
    return out;
  }

  async function window(ids) {
    const n = ids.length + 2;
    const inp = new BigInt64Array(n);
    inp[0] = BigInt(BOS);
    for (let i = 0; i < ids.length; i++) inp[i + 1] = BigInt(ids[i]);
    inp[n - 1] = BigInt(EOS);
    const feeds = {
      input_ids: new ort.Tensor('int64', inp, [1, n]),
      attention_mask: new ort.Tensor('int64', new BigInt64Array(n).fill(1n), [1, n]),
    };
    if (needsTypes) feeds.token_type_ids = new ort.Tensor('int64', new BigInt64Array(n), [1, n]);
    const res = await session.run(feeds);
    const t = res[session.outputNames[0]];
    const k = t.dims[2];
    const out = [];
    for (let i = 1; i < n - 1; i++) {
      const row = t.data.subarray(i * k, (i + 1) * k);
      let best = 0, max = -Infinity, sum = 0;
      for (let j = 0; j < k; j++) if (row[j] > max) { max = row[j]; best = j; }
      for (let j = 0; j < k; j++) sum += Math.exp(row[j] - max);
      out.push({ label: best, p: 1 / sum });
    }
    for (const v of Object.values(res)) if (v && v.dispose) v.dispose();
    return out;
  }

  // Ergebnis: [{ type, start, end, score }] - nur Positionen, kein Text.
  async function run(text) {
    const toks = tokens(text);
    const pred = new Array(toks.length);
    for (let from = 0; from < toks.length; from += MAX_TOK - OVERLAP) {
      const to = Math.min(toks.length, from + MAX_TOK);
      const got = await window(toks.slice(from, to).map((t) => t.id));
      // In der Ueberlappung gilt das Fenster, in dem das Token weiter vom Rand liegt.
      const keepFrom = from === 0 ? 0 : OVERLAP / 2;
      for (let i = keepFrom; i < got.length; i++) pred[from + i] = got[i];
      if (to === toks.length) break;
    }
    const ents = [];
    let cur = null;
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].empty) continue;
      const name = labels[pred[i].label] || 'O';
      const type = name === 'O' ? null : name.slice(2);
      // Folge-Teilstuecke eines Worts gehoeren zum Wort (gleiches Label wie das erste).
      if (cur && !toks[i].w0) { cur.end = toks[i].e; cur.ps.push(pred[i].p); continue; }
      if (cur && (type !== cur.type || name.startsWith('B-'))) { ents.push(cur); cur = null; }
      if (!type) continue;
      if (!cur) cur = { type, start: toks[i].w0 ? toks[i].s : toks[i].ws, end: toks[i].e, ps: [] };
      cur.end = toks[i].e;
      cur.ps.push(pred[i].p);
    }
    if (cur) ents.push(cur);
    return ents.map((x) => ({ type: x.type, start: x.start, end: x.end, score: Math.round(x.ps.reduce((a, b) => a + b, 0) / x.ps.length * 1000) / 1000 }));
  }

  return { run, release: () => session.release() };
}
