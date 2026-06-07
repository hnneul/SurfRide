import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const outDir = path.resolve('img');
fs.mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function writePng(file, width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (width * 4 + 1) + 1 + x * 4;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  fs.writeFileSync(
    file,
    Buffer.concat([
      sig,
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

function make(width, height, draw) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const put = (x, y, color) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
    pixels[i + 3] = color[3] ?? 255;
  };
  const rect = (x, y, w, h, color) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, color);
  };
  const line = (x0, y0, x1, y1, color, thick = 1) => {
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      rect(x - Math.floor(thick / 2), y - Math.floor(thick / 2), thick, thick, color);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  };
  const ellipse = (cx, cy, rx, ry, color) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (((x - cx) ** 2) / (rx * rx) + ((y - cy) ** 2) / (ry * ry) <= 1) put(x, y, color);
      }
    }
  };
  const poly = (pts, color) => {
    const minY = Math.min(...pts.map((p) => p[1]));
    const maxY = Math.max(...pts.map((p) => p[1]));
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y)) xs.push(Math.round(xi + ((y - yi) * (xj - xi)) / (yj - yi)));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i < xs.length; i += 2) for (let x = xs[i]; x <= xs[i + 1]; x++) put(x, y, color);
    }
  };
  draw({ rect, line, ellipse, poly });
  return pixels;
}

const C = {
  white: [255, 255, 255, 255],
  black: [20, 24, 28, 255],
  foam: [210, 246, 255, 255],
  orange: [255, 135, 55, 255],
  orange2: [220, 76, 50, 255],
  wing: [255, 210, 132, 220],
  blue: [49, 95, 127, 255],
  blue2: [32, 66, 91, 255],
  belly: [216, 238, 247, 255],
  whale: [38, 63, 99, 255],
  whale2: [26, 45, 73, 255],
  jelly: [183, 109, 255, 220],
  jellyHi: [229, 182, 255, 230],
  cyan: [122, 247, 224, 180],
  octo: [155, 77, 216, 255],
  octo2: [113, 42, 176, 255],
  yellow: [255, 225, 77, 255],
  yellow2: [255, 247, 160, 160],
};

const assets = [
  ['obstacle-flying-fish.png', 96, 64, ({ ellipse, poly, rect }) => {
    poly([[20, 17], [50, 5], [74, 19]], C.wing);
    poly([[20, 43], [51, 58], [73, 38]], [255, 196, 110, 190]);
    ellipse(45, 32, 31, 13, C.orange);
    poly([[73, 32], [91, 18], [88, 32], [91, 46]], C.orange2);
    rect(20, 27, 6, 5, C.white);
    rect(21, 28, 2, 2, C.black);
    rect(35, 22, 26, 4, [255, 176, 92, 255]);
  }],
  ['obstacle-shark.png', 112, 64, ({ ellipse, poly, rect }) => {
    ellipse(53, 34, 45, 16, C.blue);
    ellipse(47, 42, 28, 7, C.belly);
    poly([[8, 34], [27, 22], [27, 46]], C.blue);
    poly([[92, 34], [110, 16], [105, 34], [110, 52]], C.blue2);
    poly([[50, 21], [63, 3], [70, 25]], C.blue2);
    rect(24, 27, 5, 4, C.white);
    rect(25, 28, 2, 2, C.black);
  }],
  ['obstacle-whale.png', 144, 80, ({ ellipse, poly, rect, line }) => {
    ellipse(62, 43, 58, 27, C.whale);
    ellipse(52, 56, 36, 9, [184, 215, 232, 255]);
    poly([[120, 39], [142, 20], [136, 43]], C.whale2);
    poly([[120, 47], [142, 66], [136, 43]], C.whale2);
    line(47, 15, 34, 0, C.foam, 3);
    line(51, 15, 52, 0, C.foam, 3);
    line(55, 15, 70, 0, C.foam, 3);
    rect(31, 32, 5, 4, C.white);
    rect(32, 33, 2, 2, C.black);
  }],
  ['obstacle-jellyfish.png', 80, 80, ({ ellipse, rect, line }) => {
    ellipse(40, 38, 28, 23, C.cyan);
    ellipse(40, 34, 24, 18, C.jelly);
    rect(22, 34, 36, 8, C.jellyHi);
    for (let i = 0; i < 5; i++) {
      const x = 24 + i * 8;
      line(x, 52, x - 5 + (i % 2) * 10, 74, C.jellyHi, 3);
    }
  }],
  ['obstacle-octopus.png', 96, 88, ({ ellipse, rect, line }) => {
    for (let i = 0; i < 7; i++) {
      const x = 24 + i * 8;
      line(48, 52, x, 80, i % 2 ? C.octo : C.octo2, 6);
    }
    ellipse(48, 36, 29, 27, C.octo);
    rect(31, 27, 12, 12, C.white);
    rect(54, 27, 12, 12, C.white);
    rect(35, 31, 5, 5, C.black);
    rect(57, 31, 5, 5, C.black);
    rect(35, 18, 26, 6, [200, 128, 255, 220]);
  }],
  ['obstacle-lightning.png', 72, 160, ({ poly, rect }) => {
    rect(28, 0, 16, 160, C.yellow2);
    poly([[40, 0], [18, 58], [35, 58], [24, 152], [58, 50], [40, 50], [52, 0]], C.yellow);
    poly([[44, 0], [27, 51], [42, 51], [34, 116], [51, 44], [36, 44], [46, 0]], C.white);
  }],
];

for (const [name, width, height, draw] of assets) {
  writePng(path.join(outDir, name), width, height, make(width, height, draw));
}

console.log(`Generated ${assets.length} obstacle assets in ${outDir}`);
