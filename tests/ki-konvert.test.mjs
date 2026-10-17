// Vokabular kuerzen (scripts/lib/ki-konvert.mjs, Design-Review Vokabular 16.10.2026,
// Auflagen 1-5): mit einem kleinen synthetischen ONNX-Modell statt des grossen.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ort from 'onnxruntime-web';
import { fields, inspect, shrinkModel, selectVocab, shrinkTokenizer, configHash } from '../scripts/lib/ki-konvert.mjs';

// --- kleines Protobuf-Werkzeug nur fuer den Test ---
const vi = (n) => { const a = []; let b = BigInt.asUintN(64, BigInt(n)); while (b >= 128n) { a.push(Number(b & 127n) | 128); b >>= 7n; } a.push(Number(b)); return Buffer.from(a); };
const fInt = (f, n) => Buffer.concat([vi(f * 8), vi(n)]);
const fLen = (f, b) => Buffer.concat([vi(f * 8 + 2), vi(b.length), b]);
const fStr = (f, s) => fLen(f, Buffer.from(s));
const tensor = (name, dt, dims, raw, extra = []) => Buffer.concat([...dims.map((d) => fInt(1, d)), fInt(2, dt), fStr(8, name), fLen(9, raw), ...extra]);
const node = (op, ins, outs, attrs = []) => Buffer.concat([...ins.map((s) => fStr(1, s)), ...outs.map((s) => fStr(2, s)), fStr(4, op), ...attrs]);
const vinfo = (name, elem, dims) => fLen(11, Buffer.concat([fStr(1, name), fLen(2, fLen(1, Buffer.concat([fInt(1, elem), fLen(2, Buffer.concat(dims.map((d) => fLen(1, typeof d === 'string' ? fStr(2, d) : fInt(1, d)))))])))]));
const V = 12, D = 3;
const EMB = Buffer.from(Array.from({ length: V * D }, (_, i) => (i * 7) % 251));
function model({ scaleDims = [], extraInit = [], extraNode = [], embExtra = [] } = {}) {
  const graph = Buffer.concat([
    fLen(1, node('Gather', ['E', 'input_ids'], ['g'])),
    fLen(1, node('DequantizeLinear', ['g', 'E_s', 'E_z'], ['logits'])),
    ...extraNode.map((n) => fLen(1, n)),
    fStr(2, 'g'),
    fLen(5, tensor('E', 2, [V, D], EMB, embExtra)),
    fLen(5, tensor('E_s', 1, scaleDims, Buffer.alloc(4 * (scaleDims[0] || 1), 0).fill(Buffer.from(new Float32Array([0.5]).buffer)))),
    fLen(5, tensor('E_z', 2, scaleDims, Buffer.alloc(scaleDims[0] || 1, 3))),
    ...extraInit.map((t) => fLen(5, t)),
    vinfo('input_ids', 7, [1, 'n']),
  ]);
  const out = fLen(12, Buffer.concat([fStr(1, 'logits'), fLen(2, fLen(1, Buffer.concat([fInt(1, 1), fLen(2, Buffer.concat([fLen(1, fInt(1, 1)), fLen(1, fStr(2, 'n')), fLen(1, fInt(1, D))]))])))]));
  return Buffer.concat([fInt(1, 8), fLen(8, Buffer.concat([fStr(1, ''), fInt(2, 13)])), fLen(7, Buffer.concat([graph, out]))]);
}
const vocab = ['<s>', '<pad>', '</s>', '<unk>', '▁a', 'b', '▁Haus', '▁дом', '▁x', '▁Hausboot', 'ö', '<mask>'].map((p, i) => [p, i < 4 || i === 11 ? 0 : -i]);
const TJ = { version: '1.0', added_tokens: [0, 1, 2, 3, 11].map((id) => ({ id, content: vocab[id][0], special: true })), normalizer: null, pre_tokenizer: null,
  post_processor: { type: 'TemplateProcessing', special_tokens: { '<s>': { id: '<s>', ids: [0] }, '</s>': { id: '</s>', ids: [2] } } }, decoder: null,
  model: { type: 'Unigram', unk_id: 3, vocab, byte_fallback: false } };
const CFG = { bereiche: { Latn: ['0020-007E', '00A0-024F'] }, groesse: 9, matrix: 'E' };

test('Auswahl: Sondertoken, Einzelzeichen, dann Score; deterministisch, ohne fremde Schrift', () => {
  const keep = selectVocab(TJ, CFG);
  assert.deepEqual(keep, [0, 1, 2, 3, 4, 5, 8, 10, 11], 'Sondertoken + Einzelzeichen');
  assert.deepEqual(selectVocab(TJ, { ...CFG, groesse: 11 }), [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11], 'dann nach Score; kyrillisches Teilwort faellt weg');
  assert.deepEqual(selectVocab(TJ, CFG), keep);
  assert.notEqual(configHash(CFG), configHash({ ...CFG, groesse: 10 }));
  assert.throws(() => selectVocab(TJ, { ...CFG, groesse: 3 }), /Pflicht-Token/);
});

test('Modell: nur die Matrix ersetzt, Zeilen byte-gleich, ORT rechnet gleich wie vorher', async () => {
  const src = model();
  assert.deepEqual(inspect(src, 'E').V, V);
  const keep = selectVocab(TJ, CFG);
  const out = shrinkModel(src, 'E', keep);
  assert.ok(out.length < src.length);
  ort.env.wasm.numThreads = 1;
  const run = async (buf, ids) => {
    const s = await ort.InferenceSession.create(new Uint8Array(buf));
    const r = await s.run({ input_ids: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]) });
    await s.release();
    return Array.from(r.logits.data);
  };
  const { map } = shrinkTokenizer(TJ, keep, keep.length);
  const old = [0, 4, 8, 10, 2];
  assert.deepEqual(await run(out, old.map((id) => map.get(id))), await run(src, old));
});

test('Modell: unsichere Faelle brechen ab (Auflagen 1, 2)', () => {
  const keep = selectVocab(TJ, CFG);
  assert.throws(() => shrinkModel(model({ scaleDims: [V] }), 'E', keep), /nicht skalar|Vokabelgroesse/, 'Quantisierung je Zeile');
  assert.throws(() => shrinkModel(model({ scaleDims: [2] }), 'E', keep), /nicht skalar/);
  assert.throws(() => shrinkModel(model({ extraInit: [tensor('X', 1, [V], Buffer.alloc(4 * V))] }), 'E', keep), /Vokabelgroesse/);
  assert.throws(() => shrinkModel(model({ extraInit: [tensor('S', 7, [2], Buffer.from(new BigInt64Array([1n, BigInt(V)]).buffer))] }), 'E', keep), /Vokabelgroesse/);
  assert.throws(() => shrinkModel(model({ extraNode: [node('Shape', ['E'], ['s'])] }), 'E', keep), /genau von einem Gather/);
  assert.throws(() => shrinkModel(model({ embExtra: [fInt(14, 1)] }), 'E', keep), /raw_data/);
  assert.throws(() => shrinkModel(model(), 'F', keep), /nicht genau einmal/);
  assert.throws(() => shrinkModel(model(), 'E', [0, 2, 1]), /Auswahl/);
  const src = model();
  assert.throws(() => fields(src.subarray(0, src.length - 5)), /ueber das Ende/);
  assert.throws(() => fields(Buffer.from([0x0b, 0x00])), /Wire-Typ/);
  assert.throws(() => fields(Buffer.from([0x08, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01])), /10 Bytes/);
});

test('Tokenizer: umnummeriert, Teile byte-gleich, Ids passen zur Matrix (Auflage 3)', () => {
  const keep = selectVocab(TJ, CFG);
  const { json } = shrinkTokenizer(TJ, keep, keep.length);
  assert.equal(json.model.vocab.length, keep.length);
  assert.equal(json.model.unk_id, 3);
  assert.equal(json.added_tokens.find((a) => a.content === '<mask>').id, keep.length - 1);
  assert.deepEqual(json.post_processor, TJ.post_processor);
  assert.deepEqual(Object.keys(json), Object.keys(TJ));
  assert.throws(() => shrinkTokenizer(TJ, keep, keep.length + 1), /Matrix/);
  assert.throws(() => shrinkTokenizer({ ...TJ, post_processor: { special_tokens: { x: { ids: [7] } } } }, keep, keep.length), /Post-Processor/);
});
