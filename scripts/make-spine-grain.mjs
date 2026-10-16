#!/usr/bin/env node
/**
 * r8 spine material: one small tileable texture shared by every spine in 索引 · 年份 — a whisper of
 * cloth / paper fibre, stretched along the spine. White and black specks on transparency (so it lifts
 * and darkens any spine colour alike, no blend mode needed), each at most `MAX` alpha.
 * 256px, shown at 128 CSS px (crisp on a 2× screen). Writes public/spine-grain.png. Run: node scripts/make-spine-grain.mjs
 */
import sharp from 'sharp';
import { statSync } from 'node:fs';

const S = 256, MAX = 0.075;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <filter id="n" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".7 .32" numOctaves="3" stitchTiles="stitch" seed="11"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
  <rect width="100%" height="100%" filter="url(#n)"/>
</svg>`;
const { data, info } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true });
let mean = 0, dev = 0;
for (const v of data) mean += v;
mean /= data.length;
for (const v of data) dev = Math.max(dev, Math.abs(v - mean));
const out = Buffer.alloc(S * S * 4);
for (let i = 0; i < S * S; i++) {
  const v = (data[i * info.channels] - mean) / dev;           // -1 … 1
  const a = Math.round(Math.min(1, Math.abs(v) * 1.4) * MAX * 255);
  const c = v > 0 ? 255 : 0;
  out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = c; out[i * 4 + 3] = a;
}
const file = new URL('../public/spine-grain.png', import.meta.url).pathname;
await sharp(out, { raw: { width: S, height: S, channels: 4 } }).png({ palette: true, colours: 16, dither: 0, compressionLevel: 9, effort: 10 }).toFile(file);
console.log(file, statSync(file).size, 'bytes');
