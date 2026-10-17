// Erzeugt die Standard-Icons (PNG) ohne Abhaengigkeiten aus dem Signet der
// Website (gleiches Zeichen wie Website, Popup und Hinweis-Leiste). Die Pixel
// kommen aus extension/common/signet.js, derselben Funktion, mit der der
// Service Worker die Ampel-Symbole zeichnet (Design-Review Training-Ampel, Auflage 6).
// Aufruf: node scripts/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { load } from '../tests/helpers/load.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function png(size) {
  const px = load(['common/signet.js']).signet.rgba(size, '');
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let i = 0; i < size * 4; i++) raw[y * (size * 4 + 1) + 1 + i] = px[y * size * 4 + i];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(OUT, `icon${s}.png`), png(s));
  console.log('icons written');
}
