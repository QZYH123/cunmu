/**
 * S4 ambient tint (STYLE-GUIDE v0.3 §7.5) — shared by the browser (src/lib/tint.ts) and the
 * build-time script (the demo kit's make-tints.mjs). Plain JS so Node can run it without a TS step.
 *
 * Input: RGBA pixels of a 24×36 downscale. k-means (k = 4) in OKLab; the cluster with the largest
 * chroma × pixel share wins. Returns OKLCH {l, c, h} rounded, or null for near-grey covers (c < .02).
 */
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

export function rgbToOklab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** @param {ArrayLike<number>} px RGBA bytes  @returns {{l:number,c:number,h:number}|null} */
export function tintFromPixels(px, k = 4, iters = 12) {
  const pts = [];
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    pts.push(rgbToOklab(px[i], px[i + 1], px[i + 2]));
  }
  if (pts.length < k) return null;
  // deterministic seeding: spread over the lightness-sorted points
  const sorted = [...pts].sort((a, b) => a[0] - b[0]);
  let cents = Array.from({ length: k }, (_, j) => sorted[Math.floor(((j + 0.5) / k) * sorted.length)].slice());
  const assign = new Int32Array(pts.length);
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
    cents = sum.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3], s[3]] : [...cents[j].slice(0, 3), 0]));
  }
  let win = null, score = -1;
  for (const c of cents) {
    const chroma = Math.hypot(c[1], c[2]);
    const sc = chroma * (c[3] / pts.length);
    if (sc > score) { score = sc; win = c; }
  }
  if (!win) return null;
  const c = Math.hypot(win[1], win[2]);
  if (c < 0.02) return null;
  let h = (Math.atan2(win[2], win[1]) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: +win[0].toFixed(3), c: +c.toFixed(3), h: Math.round(h) };
}
