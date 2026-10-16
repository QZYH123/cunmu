#!/usr/bin/env node
/**
 * S6 paper grain (STYLE-GUIDE v0.3 §7.7): renders a 192×192 tileable fractal-noise tile once and
 * writes public/grain.png (grayscale, palette-quantised to stay ≤ 12KB). Run: node scripts/make-grain.mjs
 */
import sharp from 'sharp';
import { statSync } from 'node:fs';

const S = 192;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <filter id="n" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch" seed="7"/>
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer><feFuncR type="linear" slope="1.6" intercept="-.3"/><feFuncG type="linear" slope="1.6" intercept="-.3"/><feFuncB type="linear" slope="1.6" intercept="-.3"/><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer>
  </filter>
  <rect width="100%" height="100%" filter="url(#n)"/>
</svg>`;
const out = new URL('../public/grain.png', import.meta.url).pathname;
await sharp(Buffer.from(svg)).greyscale().png({ palette: true, colours: 4, dither: 0, compressionLevel: 9, effort: 10 }).toFile(out);
console.log(out, statSync(out).size, 'bytes');
