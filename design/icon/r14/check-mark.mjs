// renders mark.mjs pieces for checking, and measures the adaptive foreground against the 66dp safe circle
import sharp from 'sharp';
import * as M from '../mark.mjs';
const out = process.argv[2] || '/tmp/r14';
const r = (svg, f, s = 1024) => sharp(Buffer.from(svg)).resize(s, s).png().toFile(`${out}/${f}`);
await r(M.tile(), 'm-tile.png'); await r(M.square(), 'm-square.png');
await r(M.foreground(), 'm-fg.png'); await r(M.monochrome(), 'm-mono.png'); await r(M.background(), 'm-bg.png');
// farthest opaque pixel of the foreground from the centre, in dp (canvas = 108dp)
const { data, info } = await sharp(Buffer.from(M.foreground())).resize(1080, 1080).raw().toBuffer({ resolveWithObject: true });
let far = 0;
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 128) far = Math.max(far, Math.hypot(x - 540, y - 540));
console.log('foreground farthest opaque point from centre:', (far / 10).toFixed(1), 'dp (safe radius 33dp)');
