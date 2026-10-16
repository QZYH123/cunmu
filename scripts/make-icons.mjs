#!/usr/bin/env node
// Makes every platform's icon and launch-mark files from design/icon/mark.mjs.
//   node scripts/make-icons.mjs [--sheet out.png]
// Writes: public/ (favicon, touch icon, PWA icons), android/app/src/main/res (launcher + splash mark),
// ios/App/App/Assets.xcassets (AppIcon, Splash, SplashBg), src-tauri/icons (png + ico).
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../design/icon/mark.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => join(root, ...p);
const put = (p, data) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data); };
const png = (svg, size, { flatten } = {}) => {
  let s = sharp(Buffer.from(svg), { density: Math.max(72, (72 * size * 2) / 1024) }).resize(size, size);
  if (flatten) s = s.flatten({ background: flatten });
  return s.png({ compressionLevel: 9 }).toBuffer();
};
const onto = (svg, bg) => svg.replace(/(<svg[^>]*>)/, `$1<rect width="1024" height="1024" fill="${bg}"/>`);
const circle = (svg) => svg.replace(/(<svg[^>]*>)/, '$1<clipPath id="c"><circle cx="512" cy="512" r="512"/></clipPath><g clip-path="url(#c)">').replace('</svg>', '</g></svg>');

/** an .ico holding PNG images (Vista and later read these) */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}
// below 48px the hand-placed pixel drawings (16 as drawn; 24 and 32 from the 32px one)
const small = (size) => (size === 16 ? png(M.tile16(), 16) : size <= 32 ? png(M.tile32(), size) : png(M.tile(), size));
const icoOf = async (sizes) => ico(await Promise.all(sizes.map(async (size) => ({ size, data: await small(size) }))));

// ── web ──
// the tab icon: the hand-placed 32px drawing (browsers prefer the svg to the ico, and the full drawing blurs at tab size)
put(at('public/favicon.svg'), M.tile32());
put(at('public/icon.svg'), M.tile()); // the manifest's any-size icon
put(at('public/favicon.ico'), await icoOf([16, 32, 48]));
put(at('public/apple-touch-icon.png'), await png(M.square(), 180, { flatten: M.SAGE }));
put(at('public/icon-192.png'), await png(M.tile(), 192));
put(at('public/icon-512.png'), await png(M.tile(), 512));
// maskable: the stack inside the 80% safe circle
put(at('public/icon-maskable-512.png'), await png(M.square(0.8), 512, { flatten: M.SAGE }));

// ── Android ──
const res = at('android/app/src/main/res');
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  put(join(res, `mipmap-${d}/ic_launcher.png`), await png(M.tile(1, 200), 48 * k));
  put(join(res, `mipmap-${d}/ic_launcher_round.png`), await png(circle(M.square(0.86)), 48 * k));
  put(join(res, `mipmap-${d}/ic_launcher_background.png`), await png(M.background(), 108 * k, { flatten: M.SAGE }));
  put(join(res, `mipmap-${d}/ic_launcher_foreground.png`), await png(M.foreground(), 108 * k));
  put(join(res, `mipmap-${d}/ic_launcher_monochrome.png`), await png(M.monochrome(), 108 * k));
  // Android 12 launch icon: a 288dp canvas (masked to a 192dp circle); the tile is 96dp across, as on the web start screen
  put(join(res, `drawable-${d}/splash_mark.png`), await sharp({ create: { width: 288 * k, height: 288 * k, channels: 4, background: '#0000' } })
    .composite([{ input: await png(M.tile(), 96 * k) }]).png({ compressionLevel: 9 }).toBuffer());
}
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
put(join(res, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptive);
put(join(res, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptive);
rmSync(join(res, 'values/ic_launcher_background.xml'), { force: true }); // the background is a picture now (the sage gradient)
// the template's placeholders: the Capacitor splash pictures and the stock vector foreground
for (const p of ['drawable/splash.png', 'drawable/ic_launcher_background.xml', 'drawable-v24/ic_launcher_foreground.xml',
  ...['land', 'port'].flatMap((o) => Object.keys(dens).map((d) => `drawable-${o}-${d}/splash.png`))]) {
  rmSync(join(res, p), { force: true });
}
for (const o of ['land', 'port']) for (const d of Object.keys(dens)) { const dir = join(res, `drawable-${o}-${d}`); if (existsSync(dir)) rmSync(dir, { recursive: true }); }
if (existsSync(join(res, 'drawable-v24'))) rmSync(join(res, 'drawable-v24'), { recursive: true });

// ── iOS ──
const xc = at('ios/App/App/Assets.xcassets');
// iOS: no transparency
put(join(xc, 'AppIcon.appiconset/AppIcon-512@2x.png'), await png(M.square(), 1024, { flatten: M.SAGE }));
rmSync(join(xc, 'Splash.imageset'), { recursive: true, force: true });
const splashImgs = [];
for (const k of [1, 2, 3]) {
  const f = `splash-mark@${k}x.png`;
  put(join(xc, 'Splash.imageset', f), await png(M.tile(), 96 * k));
  splashImgs.push({ idiom: 'universal', filename: f, scale: `${k}x` });
}
put(join(xc, 'Splash.imageset/Contents.json'), JSON.stringify({ images: splashImgs, info: { version: 1, author: 'xcode' } }, null, 2) + '\n');
const comp = (hex) => { const n = (i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3); return { 'color-space': 'srgb', components: { red: n(1), green: n(3), blue: n(5), alpha: '1.000' } }; };
put(join(xc, 'SplashBg.colorset/Contents.json'), JSON.stringify({
  colors: [
    { idiom: 'universal', color: comp(M.PAPER) },
    { idiom: 'universal', appearances: [{ appearance: 'luminosity', value: 'dark' }], color: comp(M.NIGHT) },
  ],
  info: { version: 1, author: 'xcode' },
}, null, 2) + '\n');

// ── Windows (Tauri) ──
const ti = at('src-tauri/icons');
put(join(ti, '32x32.png'), await png(M.tile32(), 32));
put(join(ti, '128x128.png'), await png(M.tile(), 128));
put(join(ti, '128x128@2x.png'), await png(M.tile(), 256));
put(join(ti, 'icon.png'), await png(M.tile(), 512));
put(join(ti, 'icon.ico'), await icoOf([16, 24, 32, 48, 64, 256]));
rmSync(join(ti, 'source.png'), { force: true });

// ── the web start screen: the same tile, inline in index.html (it shows before any script or file loads) ──
{
  const html = at('index.html');
  const text = readFileSync(html, 'utf8');
  const next = text.replace(/(<div class="splash" aria-hidden="true">)<svg[\s\S]*?<\/svg>(<\/div>)/, `$1${M.splashSvg()}$2`);
  if (next === text && !text.includes(M.splashSvg())) throw new Error('index.html: no start-screen mark to replace');
  writeFileSync(html, next);
}

// ── a contact sheet, for looking at ──
const sheetAt = process.argv.indexOf('--sheet');
if (sheetAt > 0) {
  const out = process.argv[sheetAt + 1];
  const cells = [];
  const add = async (img, size, x, y) => cells.push({ input: await sharp(img).resize(size, size, { kernel: size > 64 ? 'lanczos3' : 'nearest' }).png().toBuffer(), left: x, top: y });
  for (const [band, bg] of [[0, M.PAPER], [1, M.NIGHT]]) {
    const y0 = 40 + band * 420;
    let x = 40;
    for (const s of [256, 180, 120, 64, 48, 32]) { await add(await png(M.tile(), s), s, x, y0 + (256 - s)); x += s + 32; }
    await add(await png(M.tile16(), 16), 16, x, y0 + 240); x += 48;
    await add(await png(M.tile32(), 32), 32, x, y0 + 224); x += 64;
    // android: adaptive circle, monochrome on a tinted plate, iOS square (rounded by the system)
    await add(await png(circle(M.background().replace('</svg>', M.foreground().replace(/<svg[^>]*>/, ''))), 160), 160, x, y0 + 96); x += 192;
    await add(await png(circle(onto(M.monochrome(band ? '#D7E3F3' : '#1F3550'), band ? '#1F3550' : '#D7E3F3')), 160), 160, x, y0 + 96);
  }
  const w = 1600, h = 880;
  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h / 2}" fill="${M.PAPER}"/><rect y="${h / 2}" width="${w}" height="${h / 2}" fill="${M.NIGHT}"/></svg>`;
  await sharp(Buffer.from(base)).composite(cells).png().toFile(out);
  console.log('sheet', out);
}
console.log('icons written');
