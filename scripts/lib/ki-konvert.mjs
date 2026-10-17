// Lokale KI-Erkennung: Vokabular des gepinnten Modells kuerzen (Design-Review
// Vokabular 16.10.2026, Auflagen 1-5; docs/sicherheit/design-review-ki.md).
// Eingabe sind nur die zwei gepinnten Dateien (ONNX + tokenizer.json, SHA-256
// vorher geprueft). Ersetzt wird genau eine Tensor-Nachricht (die Einbettungs-
// Matrix, nur Zeilen der behaltenen Token-Ids); alle anderen Bytes des Modells
// bleiben gleich, nur die umschliessenden Laengenfelder werden angepasst. Kein
// Netz, keine Abhaengigkeit, keine Ausgabe ausser Fehlern.
import crypto from 'node:crypto';

const MAX_DEPTH = 3;   // ModelProto > GraphProto > Tensor/Node > Attribut

// --- Protobuf lesen (mit Grenzpruefung, Auflage 1) ---
// Werte als int64 (negative Attribute wie axis=-1 sind 10 Bytes lang).
function varint(b, p, end) {
  let r = 0n, sh = 0n;
  for (let i = 0; i < 10; i++) {
    if (p >= end) throw new Error('ONNX: Varint ueber das Ende');
    const c = b[p++];
    r |= BigInt(c & 0x7f) << sh;
    if (!(c & 0x80)) {
      const v = Number(BigInt.asIntN(64, r));
      if (!Number.isSafeInteger(v)) throw new Error('ONNX: Varint zu gross');
      return [v, p];
    }
    sh += 7n;
  }
  throw new Error('ONNX: Varint laenger als 10 Bytes');
}

// Felder einer Nachricht: { f, w, v | s, e, k0, end }; unbekannte Wire-Typen brechen ab.
export function fields(b, start = 0, end = b.length, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error('ONNX: zu tief verschachtelt');
  const out = [];
  let p = start;
  while (p < end) {
    const k0 = p;
    let k;
    [k, p] = varint(b, p, end);
    const f = Math.floor(k / 8), w = k % 8;
    if (f <= 0) throw new Error('ONNX: Feldnummer 0');
    if (w === 0) { let v; [v, p] = varint(b, p, end); out.push({ f, w, v, k0, end: p }); }
    else if (w === 2) {
      let l;
      [l, p] = varint(b, p, end);
      if (l < 0 || p + l > end) throw new Error('ONNX: Laenge ueber das Ende');
      out.push({ f, w, s: p, e: p + l, k0, end: p + l });
      p += l;
    } else if (w === 1 || w === 5) {
      const n = w === 1 ? 8 : 4;
      if (p + n > end) throw new Error('ONNX: Feld ueber das Ende');
      out.push({ f, w, s: p, e: p + n, k0, end: p + n });
      p += n;
    } else throw new Error('ONNX: unbekannter Wire-Typ ' + w);
  }
  return out;
}

const str = (b, x) => b.toString('utf8', x.s, x.e);
function encVarint(n) {
  const a = [];
  while (n >= 128) { a.push((n % 128) | 128); n = Math.floor(n / 128); }
  a.push(n);
  return Buffer.from(a);
}
const lenField = (f, body) => Buffer.concat([encVarint(f * 8 + 2), encVarint(body.length), body]);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function graphOf(b) {
  const top = fields(b, 0, b.length, 0);
  const g = top.filter((x) => x.f === 7);
  if (g.length !== 1 || g[0].w !== 2) throw new Error('ONNX: genau ein Graph erwartet');
  return { top, g: g[0], gf: fields(b, g[0].s, g[0].e, 1) };
}

function tensorInfo(b, x) {
  const t = fields(b, x.s, x.e, 2);
  const name = t.find((y) => y.f === 8);
  return {
    t, name: name ? str(b, name) : '',
    dims: t.filter((y) => y.f === 1).map((y) => { if (y.w !== 0) throw new Error('ONNX: dims gepackt'); return y.v; }),
    dt: (t.find((y) => y.f === 2) || {}).v,
    raw: t.filter((y) => y.f === 9),
    // float_data 4, int32_data 5, string_data 6, int64_data 7, double_data 10, uint64_data 11, external_data 13
    other: t.filter((y) => [4, 5, 6, 7, 10, 11, 13].includes(y.f)),
    loc: (t.find((y) => y.f === 14) || { v: 0 }).v,
  };
}

function nodeInfo(b, x) {
  const n = fields(b, x.s, x.e, 2);
  const s = (f) => n.filter((y) => y.f === f).map((y) => str(b, y));
  const attrs = n.filter((y) => y.f === 5).map((y) => {
    const a = fields(b, y.s, y.e, 3);
    const nm = a.find((z) => z.f === 1);
    const i = a.find((z) => z.f === 3);
    const t = a.find((z) => z.f === 5);
    return { name: nm ? str(b, nm) : '', i: i ? i.v : undefined, t };
  });
  return { inputs: s(1), outputs: s(2), op: s(4)[0] || '', domain: s(7)[0] || '', attrs };
}

// Int64-Werte eines Tensors (nur raw_data), um Shape-Konstanten zu pruefen.
function int64s(b, ti) {
  if (ti.dt !== 7 || ti.raw.length !== 1) return [];
  const r = ti.raw[0];
  const out = [];
  for (let p = r.s; p + 8 <= r.e; p += 8) out.push(Number(b.readBigInt64LE(p)));
  return out;
}

// Prueft das Modell (Auflage 2) und liefert die Lage der Einbettungs-Matrix.
export function inspect(b, matrixName) {
  const { gf } = graphOf(b);
  const inits = gf.filter((x) => x.f === 5);
  const nodes = gf.filter((x) => x.f === 1).map((x) => nodeInfo(b, x));
  const hit = inits.filter((x) => tensorInfo(b, x).name === matrixName);
  if (hit.length !== 1) throw new Error('ONNX: Einbettungs-Matrix nicht genau einmal vorhanden');
  const ti = tensorInfo(b, hit[0]);
  if (ti.dims.length !== 2 || ti.dt !== 2) throw new Error('ONNX: Einbettung ist keine uint8-Matrix [V, D]');
  if (ti.other.length || ti.loc !== 0 || ti.raw.length !== 1) throw new Error('ONNX: Einbettung nicht als raw_data im Modell');
  const [V, D] = ti.dims;
  if (ti.raw[0].e - ti.raw[0].s !== V * D) throw new Error('ONNX: Einbettung hat falsche Groesse');
  for (const x of inits) {
    const t = tensorInfo(b, x);
    if (t.other.some((y) => y.f === 13) || t.loc !== 0) throw new Error('ONNX: externe Daten nicht erlaubt');
    if (t.name === matrixName) continue;
    if (t.dims.includes(V) || int64s(b, t).includes(V)) throw new Error('ONNX: weiterer Tensor mit Vokabelgroesse ' + t.name);
  }
  const users = nodes.filter((n) => n.inputs.includes(matrixName));
  if (users.length !== 1 || users[0].op !== 'Gather' || users[0].domain || users[0].inputs[0] !== matrixName) throw new Error('ONNX: Einbettung nicht genau von einem Gather benutzt');
  if (users[0].attrs.some((a) => a.name === 'axis' && a.i !== 0)) throw new Error('ONNX: Gather nicht auf Achse 0');
  for (const n of nodes) {
    if (n.op !== 'Constant') continue;
    for (const a of n.attrs) if (a.t && int64s(b, tensorInfo(b, a.t)).includes(V)) throw new Error('ONNX: Konstante mit Vokabelgroesse');
  }
  const next = nodes.filter((n) => n.inputs.includes(users[0].outputs[0]));
  const byName = new Map(inits.map((x) => { const t = tensorInfo(b, x); return [t.name, t]; }));
  for (const n of next) {
    if (n.op !== 'DequantizeLinear' || n.inputs[0] !== users[0].outputs[0]) throw new Error('ONNX: nach dem Gather nur DequantizeLinear erwartet');
    for (const q of n.inputs.slice(1)) {
      const t = byName.get(q);
      if (!t || t.dims.reduce((a, c) => a * c, 1) !== 1) throw new Error('ONNX: Quantisierung der Einbettung nicht skalar (je Zeile nicht unterstuetzt)');
    }
  }
  return { V, D, tensor: hit[0] };
}

// Ersetzt die Einbettungs-Matrix durch die Zeilen keep (aufsteigende alte Ids).
export function shrinkModel(b, matrixName, keep) {
  const { g } = graphOf(b);
  const { V, D, tensor } = inspect(b, matrixName);
  for (let i = 0; i < keep.length; i++) if (!Number.isInteger(keep[i]) || keep[i] < 0 || keep[i] >= V || (i && keep[i] <= keep[i - 1])) throw new Error('Auswahl ungueltig');
  const ti = tensorInfo(b, tensor);
  const rows = Buffer.alloc(keep.length * D);
  keep.forEach((id, i) => b.copy(rows, i * D, ti.raw[0].s + id * D, ti.raw[0].s + (id + 1) * D));
  // Tensor-Nachricht: erstes dims-Feld und raw_data neu, alle anderen Felder byte-gleich.
  let firstDim = true;
  const parts = ti.t.map((y) => {
    if (y.f === 1 && firstDim) { firstDim = false; return Buffer.concat([encVarint(8), encVarint(keep.length)]); }
    if (y.f === 9) return lenField(9, rows);
    return b.subarray(y.k0, y.end);
  });
  const newTensor = Buffer.concat(parts);
  const newGraph = Buffer.concat([b.subarray(g.s, tensor.k0), lenField(5, newTensor), b.subarray(tensor.end, g.e)]);
  const out = Buffer.concat([b.subarray(0, g.k0), lenField(7, newGraph), b.subarray(g.end, b.length)]);
  selfCheck(b, out, matrixName, keep, D);
  return out;
}

// Selbsttest (Auflagen 1, 5): alles ausser der einen Matrix byte-gleich, Zeilen gleich.
function selfCheck(a, b, matrixName, keep, D) {
  const A = graphOf(a), B = graphOf(b);
  if (A.top.length !== B.top.length || A.gf.length !== B.gf.length) throw new Error('Selbsttest: Feldanzahl weicht ab');
  const same = (x, y, xa, ya) => x.f === y.f && xa.subarray(x.k0, x.end).equals(ya.subarray(y.k0, y.end));
  A.top.forEach((x, i) => { if (x.f !== 7 && !same(x, B.top[i], a, b)) throw new Error('Selbsttest: Modell-Feld geaendert'); });
  let changed = 0;
  A.gf.forEach((x, i) => {
    if (same(x, B.gf[i], a, b)) return;
    changed++;
    if (x.f !== 5 || tensorInfo(a, x).name !== matrixName) throw new Error('Selbsttest: anderes Graph-Feld geaendert');
    const ta = tensorInfo(a, x), tb = tensorInfo(b, B.gf[i]);
    if (tb.dims[0] !== keep.length || tb.dims[1] !== D || tb.dt !== ta.dt) throw new Error('Selbsttest: Form falsch');
    keep.forEach((id, r) => {
      if (!a.subarray(ta.raw[0].s + id * D, ta.raw[0].s + (id + 1) * D).equals(b.subarray(tb.raw[0].s + r * D, tb.raw[0].s + (r + 1) * D))) throw new Error('Selbsttest: Zeile weicht ab');
    });
  });
  if (changed !== 1) throw new Error('Selbsttest: nicht genau ein Feld ersetzt');
}

// Code-Punkt-Bereiche aus der Konfiguration ("0020-007E").
function ranges(cfg) {
  const out = [[0x2581, 0x2581]];   // Wortanfangs-Zeichen der Tokenizer-Vorstufe
  for (const list of Object.values(cfg.bereiche)) for (const r of list) {
    const m = /^([0-9A-F]{4,6})-([0-9A-F]{4,6})$/.exec(r);
    if (!m) throw new Error('Vokabular: Bereich ungueltig ' + r);
    out.push([parseInt(m[1], 16), parseInt(m[2], 16)]);
  }
  return out;
}

export const configHash = (cfg) => sha256(Buffer.from(JSON.stringify({ bereiche: cfg.bereiche, groesse: cfg.groesse, matrix: cfg.matrix })));

// Auswahl (Auflage 4): Sondertoken, alle Einzelzeichen der Bereiche, dann die
// wahrscheinlichsten Teilwoerter der Bereiche (Unigram-Score absteigend, bei
// Gleichstand kleinere Id) bis zur Groesse. Ergebnis aufsteigend sortiert.
export function selectVocab(tj, cfg) {
  const m = tj.model;
  if (!m || m.type !== 'Unigram' || !Array.isArray(m.vocab)) throw new Error('Tokenizer: Unigram erwartet');
  const R = ranges(cfg);
  const inR = (s) => { for (const ch of s) { const c = ch.codePointAt(0); if (!R.some(([x, y]) => c >= x && c <= y)) return false; } return s.length > 0; };
  const special = new Set(tj.added_tokens.map((a) => a.id));
  special.add(m.unk_id);
  const keep = new Set(special);
  if (m.byte_fallback) m.vocab.forEach(([p], i) => { if (/^<0x[0-9A-F]{2}>$/.test(p)) keep.add(i); });
  const elig = [];
  m.vocab.forEach(([p], i) => { if (!special.has(i) && inR(p)) elig.push(i); });
  for (const i of elig) if ([...m.vocab[i][0].replace(/^▁/, '')].length <= 1) keep.add(i);
  if (keep.size > cfg.groesse) throw new Error('Vokabular: Groesse kleiner als Pflicht-Token');
  const ranked = elig.slice().sort((a, b) => (m.vocab[b][1] - m.vocab[a][1]) || (a - b));
  for (const i of ranked) { if (keep.size >= cfg.groesse) break; keep.add(i); }
  return [...keep].sort((a, b) => a - b);
}

// Tokenizer passend umnummerieren (Auflage 3).
export function shrinkTokenizer(tj, keep, rows) {
  const map = new Map(keep.map((id, i) => [id, i]));
  const m = tj.model;
  for (const id of [0, 1, 2, 3]) if (map.get(id) !== id) throw new Error('Tokenizer: Sondertoken 0-3 muessen gleich bleiben');
  const out = {};
  for (const [k, v] of Object.entries(tj)) out[k] = v;   // gleiche Schluesselreihenfolge, Teile unveraendert
  out.added_tokens = tj.added_tokens.map((a) => { if (!map.has(a.id)) throw new Error('Tokenizer: Sondertoken fehlt'); return { ...a, id: map.get(a.id) }; });
  const model = {};
  for (const [k, v] of Object.entries(m)) model[k] = v;
  model.unk_id = map.get(m.unk_id);
  model.vocab = keep.map((id) => m.vocab[id]);
  out.model = model;
  if (model.vocab.length !== rows || out.added_tokens.some((a) => a.id >= rows) || !(model.unk_id < rows)) throw new Error('Tokenizer: Ids passen nicht zur Matrix');
  for (const k of ['normalizer', 'pre_tokenizer', 'post_processor', 'decoder']) if (JSON.stringify(out[k]) !== JSON.stringify(tj[k])) throw new Error('Tokenizer: ' + k + ' veraendert');
  // Der Post-Processor bleibt byte-gleich; darum darf er nur die unveraenderten Ids 0-3 nennen.
  const ids = [];
  const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'ids' && Array.isArray(v)) ids.push(...v); else walk(v); } };
  walk(tj.post_processor);
  if (ids.some((id) => !(Number.isInteger(id) && id >= 0 && id <= 3))) throw new Error('Tokenizer: Post-Processor nutzt umnummerierte Ids');
  return { json: out, map };
}
