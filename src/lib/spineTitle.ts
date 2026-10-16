/**
 * Setting a title on a spine (r17). Real spines and good shelves never just cut a long title off: the series
 * name stands as the title and what tells the volume apart (第二季, a subtitle after 「：」, 剧场版) goes into a
 * smaller, lighter second line; a title runs in its own direction (CJK upright, Latin turned on its side,
 * a one- or two-digit number set upright in the column); the size gives a little before anything is lost;
 * a title too long for one column is broken in two balanced columns at a natural place; and only when even
 * that is not enough does the end fade out. The whole title is always in the label and under the shelf.
 * Pure: no DOM (a measure for Latin runs can be passed in), so tests/spine.test.ts pins it.
 */

export interface TitleParts {
  main: string;
  /** what tells this one apart: season, volume, subtitle; '' = none */
  sub: string;
  /** the parts were only split at a space: keep them as one when the whole fits */
  soft: boolean;
}

const SERIES = '第[一二三四五六七八九十百零〇两\\d]+[季期部章卷篇话集]';
const SUFFIX = new RegExp(`^(.+?)\\s*((?:${SERIES}|Season\\s*\\d+|S\\d{1,2}|Part\\.?\\s*\\d+|\\d+(?:st|nd|rd|th)\\s+(?:GIG|Season))(?:\\s.*)?)$`, 'i');
const PREFIX = /^(剧场版|劇場版|电影版|OVA|新剧场版)\s+(.+)$/;
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\u2160-\u217f]/;

/** a title's main part and the part that tells this one apart (as a real spine sets them) */
export function splitTitle(title: string): TitleParts {
  const t = title.trim().replace(/\s+/g, ' ');
  const out = (main: string, sub: string, soft = false): TitleParts => {
    const m = main.trim(), s = sub.trim();
    return [...m].length >= 1 && s ? { main: m, sub: s, soft } : { main: t, sub: '', soft: false };
  };
  // 「剧场版 空之境界」: what kind of release it is goes under the name
  const pre = PREFIX.exec(t);
  if (pre) { const r = splitTitle(pre[2]); return out(r.main, [pre[1], r.sub].filter(Boolean).join(' ')); }
  // a subtitle after a full-width colon, a spaced Latin colon or a spaced dash
  const colon = /^(.+?)(?:：|: | [-–—－] )(.+)$/.exec(t);
  if (colon) return out(colon[1], colon[2]);
  // a trailing bracket (～…～, （…）, (…), […], 〈…〉, 「…」)
  const br = /^(.+?)\s*([\uff5e〜~][^\uff5e〜~]+[\uff5e〜~]?|\s[-–][^-–]+[-–]|（[^（）]+）|\([^()]+\)|\[[^\]]+\]|〈[^〉]+〉|＜[^＞]+＞)$/.exec(t);
  if (br) return out(br[1], br[2].trim().replace(/^[\uff5e〜~（(［[〈＜\-–]|[\uff5e〜~）)］\]〉＞\-–]$/g, ''));
  // a season / part / volume after the name
  const se = SUFFIX.exec(t);
  if (se && [...se[1]].length >= 2) return out(se[1], se[2]);
  // 「塞尔达传说 王国之泪」: two names at a space — only apart when the whole doesn't fit. Where CJK meets
  // Latin (「钢之炼金术师 FULLMETAL ALCHEMIST」) is the place; else the last space between CJK names.
  const mix = /^(.*[^\x00-\x7f])\s+([\x00-\x7f]+)$/.exec(t) ?? /^([\x00-\x7f]+)\s+([^\x00-\x7f].*)$/.exec(t);
  if (mix && CJK.test(t)) return out(mix[1], mix[2], true);
  const sp = t.lastIndexOf(' ');
  if (sp > 0 && CJK.test(t)) {
    const a = t.slice(0, sp), b = t.slice(sp + 1);
    if ([...a].length >= 2 && [...b].length >= 2 && CJK.test(a) && CJK.test(b)) return out(a, b, true);
  }
  return { main: t, sub: '', soft: false };
}

/** a run of a column: set upright (CJK, and a short number among it: 縦中横) or turned (Latin) */
export interface Run { t: string; upright: boolean; tcy?: boolean }
const isLatinCh = (c: string) => /[A-Za-z0-9.,'’!?&+\-/:;·*$%@#]/.test(c);
export function runsOf(text: string): Run[] {
  const runs: Run[] = [];
  const cs = [...text];
  let i = 0;
  while (i < cs.length) {
    const lat = isLatinCh(cs[i]) || (cs[i] === ' ' && i > 0 && isLatinCh(cs[i - 1]) && i + 1 < cs.length && isLatinCh(cs[i + 1]));
    let j = i + 1;
    while (j < cs.length) {
      const c = cs[j];
      const l = isLatinCh(c) || (c === ' ' && isLatinCh(cs[j - 1]) && j + 1 < cs.length && isLatinCh(cs[j + 1]));
      if (l !== lat) break;
      j++;
    }
    const t = cs.slice(i, j).join('');
    // one or two digits among CJK stand upright, side by side (「明日之丈2」, 「第3季」)
    if (lat && /^\d{1,2}$/.test(t)) runs.push({ t, upright: true, tcy: true });
    else if (lat && t.trim()) runs.push({ t, upright: false });
    else if (t.trim()) runs.push({ t: t.replace(/ /g, '\u2002'), upright: true });
    i = j;
  }
  return runs;
}

/** how far a piece of text runs down a column at `fs` (px); `latin` measures a turned Latin run */
export type Measure = (latin: string, fs: number) => number;
export const guessLatin: Measure = (t, fs) => {
  let w = 0;
  for (const c of t) w += c === ' ' ? 0.28 : /[A-Z0-9]/.test(c) ? 0.66 : /[il.,'’:;!|]/.test(c) ? 0.3 : 0.54;
  return w * fs;
};
export function runLength(text: string, fs: number, measure: Measure = guessLatin, track = 0.04): number {
  let n = 0;
  for (const r of runsOf(text)) {
    if (!r.upright) n += measure(r.t, fs);
    else if (r.tcy) n += fs;
    else for (const c of r.t) n += c === '\u2002' ? fs * 0.5 : /[、。，．・：；\uff01？「」『』（）〈〉《》\uff5e]/.test(c) ? fs * 0.9 : fs * (1 + track);
  }
  return n;
}

/** kinsoku: a column never starts with these, and never ends with the opening ones */
const NO_START = /^[、。，．・：；\uff01？」』）〉》\uff5eー々ゃゅょっャュョッァィゥェォ]/;
const NO_END = /[「『（〈《]$/;

/** the best place to break `text` into two columns of nearly equal length */
export function balance(text: string, fs: number, measure: Measure = guessLatin): [string, string] | null {
  const cs = [...text];
  if (cs.length < 2) return null;
  const total = runLength(text, fs, measure);
  let best: [string, string] | null = null, bestCost = Infinity;
  for (let i = 1; i < cs.length; i++) {
    let a = cs.slice(0, i).join(''), b = cs.slice(i).join('');
    // never inside a Latin word or a number
    if (isLatinCh(cs[i - 1]) && isLatinCh(cs[i])) continue;
    // nor between a name and the number that belongs to it (「大逆转裁判2」)
    if (/\d/.test(cs[i]) && !isLatinCh(cs[i - 1]) && cs[i - 1] !== ' ') continue;
    const atSpace = cs[i] === ' ' || cs[i - 1] === ' ';
    a = a.trimEnd(); b = b.trimStart();
    if (!a || !b || NO_START.test(b) || NO_END.test(a)) continue;
    const la = runLength(a, fs, measure), lb = runLength(b, fs, measure);
    // as even as can be; a little better at a space or after punctuation; the first column a touch longer
    let cost = Math.abs(la - lb) / total;
    if (atSpace || /[・、，·]$/.test(a)) cost -= 0.12;
    if (lb > la) cost += 0.02;
    if (cost < bestCost) { bestCost = cost; best = [a, b]; }
  }
  return best;
}

export interface SpineCol { text: string; sub?: boolean; fade?: boolean }
export interface SpineText {
  cols: SpineCol[];
  /** the title's size (px); the sub line is one step lighter, at `subFs` */
  fs: number;
  subFs: number;
  /** the spine's width, widened for a second column when that is needed (never past `maxW`) */
  w: number;
}
export interface SpineBox {
  /** the spine's own width and the run its title may take (px) */
  w: number; avail: number;
  fsMax: number; fsMin: number;
  /** widest a spine may grow for two columns */
  maxW: number;
  /** room each side of the title, and between two columns */
  padX: number; colGap: number;
  measure?: Measure;
}

/**
 * Lay a title out on a spine: the largest size (within bounds) at which its main part runs in one column,
 * its distinguishing part beside it, lighter and smaller, when the spine may grow for it; else the main part
 * in two balanced columns; else, last, two columns with the end fading out.
 */
export function setSpineTitle(title: string, box: SpineBox): SpineText {
  const { w, avail, fsMin, maxW, padX, colGap } = box;
  const m = box.measure ?? guessLatin;
  const len = (t: string, fs: number) => runLength(t, fs, m);
  const parts = splitTitle(title);
  const fsTop = Math.max(fsMin, Math.min(box.fsMax, w - padX * 2));
  const two = (fs: number, sfs: number) => Math.round(Math.max(w, fs + colGap + sfs + padX * 2));
  const sizes: number[] = [];
  for (let fs = fsTop; fs >= fsMin - 1e-6; fs -= 0.5) sizes.push(fs);
  if (!sizes.length) sizes.push(fsMin);

  const whole = parts.soft ? `${parts.main} ${parts.sub}` : title.trim();
  // the whole title in one column (a soft split stays whole when it fits)
  if (parts.soft || !parts.sub) {
    for (const fs of sizes) if (len(whole, fs) <= avail) return { cols: [{ text: whole }], fs, subFs: fs, w };
  }
  if (parts.sub && len(parts.main, fsMin) <= avail) {
    // the main part in one column, the rest beside it, lighter and a step smaller, where the spine may grow
    for (const fs of sizes) {
      const sfs = Math.max(fsMin, fs - 1);
      if (len(parts.main, fs) > avail || two(fs, sfs) > maxW) continue;
      return { cols: [{ text: parts.main }, { text: parts.sub, sub: true, fade: len(parts.sub, sfs) > avail }], fs, subFs: sfs, w: two(fs, sfs) };
    }
    // a spine that can't grow: the main part alone (the rest is in the label and under the shelf)
    for (const fs of sizes) if (len(parts.main, fs) <= avail) return { cols: [{ text: parts.main }], fs, subFs: fs, w };
  }
  // too long for one column: the whole title in two balanced columns
  for (const fs of sizes) {
    if (two(fs, fs) > maxW) continue;
    const b = balance(whole, fs, m);
    if (b && len(b[0], fs) <= avail && len(b[1], fs) <= avail) return { cols: [{ text: b[0] }, { text: b[1] }], fs, subFs: fs, w: two(fs, fs) };
  }
  // a name in two balanced columns, the rest left to the label, before anything fades
  if (parts.sub) {
    for (const fs of sizes) {
      if (two(fs, fs) > maxW) continue;
      const b = balance(parts.main, fs, m);
      if (b && len(b[0], fs) <= avail && len(b[1], fs) <= avail) return { cols: [{ text: b[0] }, { text: b[1] }], fs, subFs: fs, w: two(fs, fs) };
    }
  }
  // last resort: as much as two columns hold (or one, on a spine that can't grow), the end fading out
  if (two(fsMin, fsMin) <= maxW) {
    const b = balance(whole, fsMin, m) ?? [whole, ''];
    const [a, rest] = fill(whole, fsMin, avail, m);
    const second = rest ? rest : b[1];
    return { cols: [{ text: a }, { text: second, fade: len(second, fsMin) > avail }], fs: fsMin, subFs: fsMin, w: two(fsMin, fsMin) };
  }
  return { cols: [{ text: whole, fade: len(whole, fsMin) > avail }], fs: fsMin, subFs: fsMin, w };
}

/** as much of `text` as runs `avail` at `fs` (whole words / numbers), and the rest */
function fill(text: string, fs: number, avail: number, m: Measure): [string, string] {
  const cs = [...text];
  let i = 0;
  while (i < cs.length && runLength(cs.slice(0, i + 1).join(''), fs, m) <= avail) i++;
  let j = i;
  while (j > 0 && j < cs.length && isLatinCh(cs[j - 1]) && isLatinCh(cs[j])) j--;
  if (j === 0) j = i;
  while (j > 1 && j < cs.length && NO_START.test(cs[j])) j--;
  // a number goes with the name before it (「…裁判2」 is not split before the 2)
  while (j > 1 && j < cs.length && /\d/.test(cs[j]) && !isLatinCh(cs[j - 1]) && cs[j - 1] !== ' ') j--;
  return [cs.slice(0, j).join('').trimEnd(), cs.slice(j).join('').trimStart()];
}
