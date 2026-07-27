#!/usr/bin/env node
// Generate the favicon / app-icon set from a single source image (brand/favicon.png).
// Outputs transparent, square icons + a compact multi-size favicon.ico.
//
// Usage:  npm run gen-favicons
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'brand', 'favicon.png');
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const MARGIN = 0.06; // breathing room around the mark

// Render the mark centered on a transparent square of the given size.
async function icon(size) {
  const inner = Math.round(size * (1 - MARGIN * 2));
  const pad = Math.round((size - inner) / 2);
  const mark = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: TRANSPARENT } })
    .composite([{ input: mark, top: pad, left: pad }])
    .png()
    .toBuffer();
}

const pngTargets = {
  'src/app/icon.png': 256, // browser tab favicon
  'src/app/apple-icon.png': 180, // iOS home screen
  'public/icon-192.png': 192, // PWA manifest
  'public/icon-512.png': 512, // PWA manifest
};

for (const [rel, size] of Object.entries(pngTargets)) {
  writeFileSync(join(root, rel), await icon(size));
  console.log('wrote', rel, `(${size}px)`);
}

// favicon.ico — pack PNG payloads for 16/32/48 into a valid ICO container.
const icoSizes = [16, 32, 48];
const bufs = await Promise.all(icoSizes.map(icon));
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(bufs.length, 4);
const dir = Buffer.alloc(16 * bufs.length);
let offset = 6 + 16 * bufs.length;
bufs.forEach((buf, i) => {
  const d = 16 * i;
  dir.writeUInt8(icoSizes[i], d); // width
  dir.writeUInt8(icoSizes[i], d + 1); // height
  dir.writeUInt16LE(1, d + 4); // planes
  dir.writeUInt16LE(32, d + 6); // bpp
  dir.writeUInt32LE(buf.length, d + 8);
  dir.writeUInt32LE(offset, d + 12);
  offset += buf.length;
});
writeFileSync(join(root, 'src/app/favicon.ico'), Buffer.concat([header, dir, ...bufs]));
console.log('wrote src/app/favicon.ico', `(${icoSizes.join('/')}px)`);
