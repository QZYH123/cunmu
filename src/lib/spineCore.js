/**
 * Spine colour for 索引 · 年份 (r6): one solid colour per cover, the way a book's spine carries the
 * colour of its jacket. Shared by the browser (src/lib/spine.ts, sampled lazily and cached) and the
 * build step (the demo kit's make-spines.mjs, for the bundled demo covers). Plain JS so Node runs it as is.
 *
 * Input: RGBA pixels of a small downscale. k-means (k = 5) in OKLab; the cluster with the largest
 * share wins, nudged a little towards colour (a white jacket with a red band stays white; a cover that
 * is mostly red is red). Then it is quieted so a row of them sits together like cloth and paper:
 * lightness kept inside [L_MIN, L_MAX], chroma scaled and capped, mapped into sRGB, and moved out of the
 * band where neither ink reaches 4.5:1 against it. Returns OKLCH {l, c, h}.
 */
import { rgbToOklab } from './tintCore.js';

const L_MIN = 0.27, L_MAX = 0.92, C_SCALE = 0.86, C_MAX = 0.12, CONTRAST = 4.5;
/** the two inks a spine title may take (mirrors --spine-ink-dark / --spine-ink-light in tokens.css) */
export const INK_DARK = [0x1e, 0x1d, 0x1b], INK_LIGHT = [0xf4, 0xf2, 0xee];

const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const LUM_DARK = lum(INK_DARK), LUM_LIGHT = lum(INK_LIGHT);

/** OKLCH → linear sRGB (unclamped) */
function oklchToLin(l, c, h) {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}
const inGamut = (lin) => lin.every((v) => v >= -0.0005 && v <= 1.0005);
const toByte = (v) => { v = Math.min(1, Math.max(0, v)); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)); };

/** OKLCH → sRGB bytes, chroma reduced until it fits the gamut */
export function oklchToRgb(l, c, h) {
  let cc = c;
  let lin = oklchToLin(l, cc, h);
  while (!inGamut(lin) && cc > 0) { cc = Math.max(0, cc - 0.004); lin = oklchToLin(l, cc, h); }
  return lin.map(toByte);
}

/** which ink reads better on this spine: 'light' or 'dark' (and the contrast it gets) */
export function inkFor({ l, c, h }) {
  const L = lum(oklchToRgb(l, c, h));
  const dark = ratio(L, LUM_DARK), light = ratio(L, LUM_LIGHT);
  return dark >= light ? { ink: 'dark', contrast: dark } : { ink: 'light', contrast: light };
}

/** quiet a raw cover colour into a spine colour (see the header) */
export function settle(l, c, h) {
  l = Math.min(L_MAX, Math.max(L_MIN, l));
  c = Math.min(C_MAX, c * C_SCALE);
  // fit the gamut first, so the contrast below is measured on the colour that is actually shown
  while (c > 0 && !inGamut(oklchToLin(l, c, h))) c = Math.max(0, c - 0.004);
  // out of the middle band: lighter spines go lighter (dark ink), darker ones darker (light ink)
  for (let i = 0; i < 20 && inkFor({ l, c, h }).contrast < CONTRAST; i++) {
    l = l >= 0.58 ? Math.min(0.97, l + 0.015) : Math.max(0.12, l - 0.015);
    while (c > 0 && !inGamut(oklchToLin(l, c, h))) c = Math.max(0, c - 0.004);
  }
  return { l: +l.toFixed(3), c: +c.toFixed(3), h: Math.round(h) % 360 };
}

/** @param {ArrayLike<number>} px RGBA bytes  @returns {{l:number,c:number,h:number}|null} */
export function spineFromPixels(px, k = 5, iters = 10) {
  const pts = [];
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    pts.push(rgbToOklab(px[i], px[i + 1], px[i + 2]));
  }
  if (pts.length < k) return null;
  const sorted = [...pts].sort((a, b) => a[0] - b[0]);
  let cents = Array.from({ length: k }, (_, j) => sorted[Math.floor(((j + 0.5) / k) * sorted.length)].slice(0, 3));
  const assign = new Int32Array(pts.length);
  let counts = new Array(k).fill(0);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < pts.length; i++) {
      let best = 0, bd = Infinity;
      for (let j = 0; j < k; j++) {
        const c = cents[j];
        const d = (pts[i][0] - c[0]) ** 2 + (pts[i][1] - c[1]) ** 2 + (pts[i][2] - c[2]) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
      assign[i] = best;
    }
    const sum = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) { const s = sum[assign[i]]; s[0] += pts[i][0]; s[1] += pts[i][1]; s[2] += pts[i][2]; s[3]++; }
    counts = sum.map((s) => s[3]);
    cents = sum.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cents[j]));
  }
  let win = null, score = -1;
  cents.forEach((c, j) => {
    const sc = (counts[j] / pts.length) * (1 + 3 * Math.hypot(c[1], c[2]));
    if (sc > score) { score = sc; win = c; }
  });
  if (!win) return null;
  const c = Math.hypot(win[1], win[2]);
  let h = (Math.atan2(win[2], win[1]) * 180) / Math.PI;
  if (h < 0) h += 360;
  return settle(win[0], c, h);
}
