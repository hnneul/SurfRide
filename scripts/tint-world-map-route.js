import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';

const output = 'public/world-map-pacific-route.png';

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const route = [
  [315, 258],
  [418, 356],
  [527, 443],
  [475, 610],
  [552, 729],
  [812, 565],
  [1091, 456],
  [1120, 254],
  [1325, 342],
  [1475, 240],
];

const YELLOW = [255, 214, 107];
const MASK_RADIUS = 52;
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

const source = readSourcePng();
const chunks = readChunks(source);
const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
if (!ihdr) throw new Error('Missing IHDR chunk');

const width = ihdr.readUInt32BE(0);
const height = ihdr.readUInt32BE(4);
const bitDepth = ihdr[8];
const colorType = ihdr[9];
if (bitDepth !== 8 || colorType !== 2) {
  throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
}

const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data));
const raw = zlib.inflateSync(idat);
const pixels = unfilter(raw, width, height, 3);

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (distanceToRoute(x, y) > MASK_RADIUS) continue;

    const offset = (y * width + x) * 3;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    if (max < 176 || max - min > 54) continue;

    const strength = Math.min(1, Math.max(0.35, (max - 176) / 62));
    pixels[offset] = mix(r, YELLOW[0], strength);
    pixels[offset + 1] = mix(g, YELLOW[1], strength);
    pixels[offset + 2] = mix(b, YELLOW[2], strength);
  }
}

const filtered = filterNone(pixels, width, height, 3);
const rewritten = writePng(chunks, zlib.deflateSync(filtered, { level: 9 }));
fs.writeFileSync(output, rewritten);

function readChunks(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIG)) throw new Error('Invalid PNG signature');
  const result = [];
  let pos = 8;

  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    const crc = buffer.readUInt32BE(pos + 8 + length);
    result.push({ type, data: Buffer.from(data), crc });
    pos += 12 + length;
    if (type === 'IEND') break;
  }

  return result;
}

function readSourcePng() {
  try {
    return execFileSync('git', ['show', `HEAD:${output}`], { maxBuffer: 20 * 1024 * 1024 });
  } catch {
    return fs.readFileSync(output);
  }
}

function unfilter(raw, width, height, channels) {
  const stride = width * channels;
  const out = Buffer.alloc(width * height * channels);
  let rawPos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[rawPos++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const value = raw[rawPos++];
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= channels ? prev[x - channels] : 0;

      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 255;
      else if (filter === 2) row[x] = (value + up) & 255;
      else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (value + paeth(left, up, upLeft)) & 255;
      else throw new Error(`Unsupported PNG filter: ${filter}`);
    }
  }

  return out;
}

function filterNone(pixels, width, height, channels) {
  const stride = width * channels;
  const out = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const srcStart = y * stride;
    const destStart = y * (stride + 1);
    out[destStart] = 0;
    pixels.copy(out, destStart + 1, srcStart, srcStart + stride);
  }

  return out;
}

function writePng(originalChunks, idat) {
  const parts = [PNG_SIG];
  for (const chunk of originalChunks) {
    if (chunk.type === 'IDAT') continue;
    if (chunk.type === 'IEND') parts.push(makeChunk('IDAT', idat));
    parts.push(makeChunk(chunk.type, chunk.data));
  }
  return Buffer.concat(parts);
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function distanceToRoute(x, y) {
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    best = Math.min(best, distanceToSegment(x, y, route[i], route[i + 1]));
  }
  return best;
}

function distanceToSegment(x, y, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = x - a[0];
  const wy = y - a[1];
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  const px = a[0] + vx * t;
  const py = a[1] + vy * t;
  return Math.hypot(x - px, y - py);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255];
  }
  return (crc ^ -1) >>> 0;
}
