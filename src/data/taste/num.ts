/**
 * How a count is said. Slots are already formatted; fill() does not do arithmetic.
 * A tier is always rounded down, so the sentence never claims more than the record.
 */

const D = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 6 → 六, 14 → 十四, 31 → 三十一; 100 and above stay Arabic */
export function cnYears(n: number): string {
  const x = Math.floor(Math.abs(n));
  if (x >= 100) return String(x);
  if (x < 10) return D[x];
  if (x < 20) return x === 10 ? '十' : `十${D[x - 10]}`;
  const tens = Math.floor(x / 10);
  const ones = x % 10;
  return `${D[tens]}十${ones ? D[ones] : ''}`;
}

/** 38 → 三十多年; an exact ten stays 「三十年」 */
export function cnDecades(n: number): string {
  const x = Math.floor(Math.abs(n));
  const floored = Math.floor(x / 10) * 10;
  const word = cnYears(floored);
  return x === floored ? `${word}年` : `${word}多年`;
}

/**
 * Hours, in bands. Under 100 is left unsaid. 100–9999 step by 100, from 10000 by 1000.
 * An exact band omits 多. 1000 and above are grouped (1,200).
 */
export function hoursTier(minutes: number): string {
  const h = minutes / 60;
  if (!(h >= 100)) return '';
  const step = h >= 10000 ? 1000 : 100;
  const floored = Math.floor(h / step) * step;
  const exact = Math.abs(h - floored) < 1e-9;
  const num = floored >= 1000 ? floored.toLocaleString('en-US') : String(floored);
  return exact ? `${num} 个小时` : `${num} 多个小时`;
}

/** Days. Under 10 is the figure itself (a trailing .0 dropped); otherwise bands of 10. */
export function daysTier(minutes: number): string {
  const d = minutes / 60 / 24;
  if (!(d >= 0)) return '';
  if (d < 10) {
    const rounded = Math.round(d * 10) / 10;
    const shown = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${shown} 天`;
  }
  const floored = Math.floor(d / 10) * 10;
  const exact = Math.abs(d - floored) < 1e-9;
  return exact ? `${floored} 天` : `${floored} 多天`;
}

/** S4: 0.83 is 八成, never rounded up. Below 0.7 is unsaid. */
export function shareWord(ratio: number): '七成' | '八成' | '九成' | null {
  if (ratio >= 0.9) return '九成';
  if (ratio >= 0.8) return '八成';
  if (ratio >= 0.7) return '七成';
  return null;
}

const CN_NUM = /[零〇一二三四五六七八九十百千万两]+/g;

/**
 * How many numbers a sentence states.
 * An Arabic run is one (commas stay inside it, so 1,200 is one).
 * A Chinese numeral followed by 年/部/次/成/天/个 is one.
 * A lone 一 is grammar (一部, 一年, 每一年), not a count. 第十四 is an ordinal, not a count.
 * 两 and anything longer than 一 (十一, 三十多) do count.
 */
export function numbersInCn(s: string): number {
  const noOrd = s.replace(/第[0-9０-９零〇一二三四五六七八九十百千万两]+/g, '');
  let n = 0;
  const arab = noOrd.match(/\d[\d,]*/g);
  n += arab?.length ?? 0;
  const rest = noOrd.replace(/\d[\d,]*/g, '\u0000');
  for (const m of rest.matchAll(CN_NUM)) {
    const at = m.index + m[0].length;
    const more = rest[at] === '多';
    const unit = rest[more ? at + 1 : at];
    if (!unit || !'年部次成天个'.includes(unit)) continue;
    if (m[0] === '一') continue;
    n += 1;
  }
  return n;
}
