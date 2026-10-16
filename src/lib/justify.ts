import { ROW_TOLERANCE } from '../tokens';

export interface Tile { index: number; x: number; y: number; w: number; h: number }
export interface Row { y: number; h: number; tiles: Tile[] }

const clampAspect = (a: number) => Math.min(1.6, Math.max(0.6, a));

/**
 * Justified rows (§3.9.2): fill each row until its natural width reaches the container, scale it to
 * exactly the container width, keep the row height within ±18% of H (else move the last tile to the
 * next row), and drop the trailing incomplete row — so there are never holes or half rows.
 * Positions are rounded cumulatively so tiles meet with zero gaps.
 */
export function justify(aspects: number[], width: number, H: number, maxRows = Infinity, startIndex = 0): Row[] {
  const rows: Row[] = [];
  if (!(width > 0) || !(H > 0)) return rows;
  const lo = H * (1 - ROW_TOLERANCE);
  const hi = H * (1 + ROW_TOLERANCE);
  let i = startIndex;
  let yExact = 0;
  while (rows.length < maxRows && i < aspects.length) {
    let sum = 0;
    let j = i;
    while (j < aspects.length && sum * H < width) {
      sum += clampAspect(aspects[j]);
      j++;
    }
    if (sum * H < width) break; // not enough left to fill a row → leave them off the wall
    let h = width / sum;
    if (h < lo && j - i > 1) {
      const without = sum - clampAspect(aspects[j - 1]);
      const h2 = width / without;
      if (h2 <= hi || Math.abs(h2 - H) < Math.abs(h - H)) {
        j--;
        sum = without;
        h = h2;
      }
    }
    const top = Math.round(yExact);
    const bottom = Math.round(yExact + h);
    const tiles: Tile[] = [];
    let xExact = 0;
    for (let k = i; k < j; k++) {
      const x0 = Math.round(xExact);
      xExact += clampAspect(aspects[k]) * h;
      const x1 = k === j - 1 ? width : Math.round(xExact);
      tiles.push({ index: k, x: x0, y: top, w: x1 - x0, h: bottom - top });
    }
    rows.push({ y: top, h: bottom - top, tiles });
    yExact += h;
    i = j;
  }
  return rows;
}

const cache = new Map<string, Row[]>();

/** Layout cached by「条目数 + 屏宽」(+ the ordered ids' signature) — §3.9.9. */
export function justifyCached(key: string, aspects: number[], width: number, H: number, maxRows = Infinity): Row[] {
  const k = `${key}|${aspects.length}|${width}|${H}|${maxRows}`;
  let v = cache.get(k);
  if (!v) {
    v = justify(aspects, width, H, maxRows);
    if (cache.size > 64) cache.clear();
    cache.set(k, v);
  }
  return v;
}

export const wallAspect = clampAspect;

/**
 * Justified rows with a lead tile: `lead` stands at the left edge spanning the first `span` rows,
 * and those rows are justified into the width to its right; the rest continue full width below.
 * The lead's width follows its own aspect at the spanned height (a few fixed-point steps; the last
 * px of mismatch is absorbed by object-fit: cover). Still no holes and no half rows. Returns null
 * when there are not enough tiles to fill the spanned rows.
 */
export function justifyLead(aspects: number[], lead: number, width: number, H: number, span: number, maxRows = Infinity): Row[] | null {
  const perm = [lead, ...aspects.map((_, i) => i).filter((i) => i !== lead)];
  const pa = perm.map((i) => aspects[i]);
  const a = clampAspect(pa[0]);
  let lw = Math.round(a * span * H);
  const fill = (w: number) => justify(pa, w, H, span, 1);
  let top = fill(width - lw);
  for (let it = 0; it < 6 && top.length === span; it++) {
    const nw = Math.round(a * (top[span - 1].y + top[span - 1].h));
    if (Math.abs(nw - lw) <= 1) break;
    lw = nw;
    top = fill(width - lw);
  }
  // a lead too wide for the container (or one that leaves an empty row beside it) can't stand there
  if (top.length < span || width - lw < H * 0.6 || top.some((r) => !r.tiles.length)) return null;
  const leadH = top[span - 1].y + top[span - 1].h;
  const next = top[span - 1].tiles[top[span - 1].tiles.length - 1].index + 1;
  const below = maxRows > span ? justify(pa, width, H, maxRows - span, next) : [];
  const rows: Row[] = [
    ...top.map((r) => ({ y: r.y, h: r.h, tiles: r.tiles.map((t) => ({ ...t, index: perm[t.index], x: t.x + lw })) })),
    ...below.map((r) => ({ y: r.y + leadH, h: r.h, tiles: r.tiles.map((t) => ({ ...t, index: perm[t.index], y: t.y + leadH })) })),
  ];
  rows[0].tiles.unshift({ index: lead, x: 0, y: 0, w: lw, h: leadH });
  return rows;
}
