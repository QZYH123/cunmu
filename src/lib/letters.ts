/**
 * 「按首字母」: titles A–Z.
 *
 * - The initial is read from the first character that is a letter: leading spaces, quotes, brackets
 *   and other marks are skipped (「」《》“” …), and full-width forms count as their plain ones (ＡＢ → AB).
 * - Latin: that letter, accents dropped (Émile → E).
 * - Chinese: the pinyin initial, from the system's own Chinese collation (ICU, the same in Android's
 *   WebView, Windows' WebView2 and browsers). ICU marks where each letter begins in pinyin order; a
 *   character's letter is the last mark at or before it. Traditional forms read the same (龍 → L).
 *   A character with several readings takes the one ICU sorts it by (長 → Z, zhǎng).
 *   If that collation is missing or reads wrongly, Chinese titles go under # rather than under a wrong letter.
 * - Japanese kana: the Hepburn initial of the first kana (し → S, ち → C, つ → T, ふ → F, じ → J, ん → N).
 * - Anything else (digits, kanji outside the common blocks, hangul, a title of marks only): #, last.
 *
 * Within a letter titles follow the Chinese collation: Chinese by pinyin, then Latin, then kana.
 */

export const OTHER = '#';
const MARKS = 'ABCDEFGHJKLMNOPQRSTWXYZ';   // the letters ICU marks in pinyin order (no pinyin begins with I, U or V)

const COLLATOR = new Intl.Collator('zh-u-co-pinyin', { numeric: true, sensitivity: 'base' });

type HanReader = (ch: string) => string | null;
/** reads a Han character's initial; null when the collation can't be trusted here */
export function hanReader(collator: Intl.Collator): HanReader | null {
  const marks = MARKS.split('').map((l) => ({ l, at: '\uFDD0' + l }));
  const read: HanReader = (ch) => {
    let out: string | null = null;
    for (const m of marks) {
      if (collator.compare(m.at, ch) <= 0) out = m.l; else break;
    }
    return out;
  };
  // a quick check on characters whose readings are not in doubt
  const known: [string, string][] = [['阿', 'A'], ['八', 'B'], ['草', 'C'], ['龍', 'L'], ['莫', 'M'], ['文', 'W'], ['中', 'Z']];
  try {
    return known.every(([ch, l]) => read(ch) === l) ? read : null;
  } catch {
    return null;
  }
}
const HAN = hanReader(COLLATOR);

// Hepburn initials of hiragana; katakana are the same characters + 0x60
const KANA_BY_LETTER: Record<string, string> = {
  A: 'ぁあ', I: 'ぃい', U: 'ぅう', E: 'ぇえ', O: 'ぉおを',
  K: 'かきくけこゕゖ', G: 'がぎぐげご', S: 'さしすせそ', Z: 'ざずぜぞづ', J: 'じぢ',
  T: 'たっつてと', D: 'だでど', C: 'ち', N: 'なにぬねのん', H: 'はひへほ', B: 'ばびぶべぼ', P: 'ぱぴぷぺぽ', F: 'ふ',
  M: 'まみむめも', Y: 'ゃやゅゆょよ', R: 'らりるれろ', W: 'ゎわゐゑ', V: 'ゔ',
};
const KANA = new Map<string, string>(Object.entries(KANA_BY_LETTER).flatMap(([l, cs]) => [...cs].map((c) => [c, l] as [string, string])));

const isHan = (cp: number) => (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0xf900 && cp <= 0xfaff);

const cache = new Map<string, string>();
/** the title's letter: A–Z, or # */
export function letterOf(title: string): string {
  const hit = cache.get(title);
  if (hit !== undefined) return hit;
  let out = OTHER;
  for (const ch of title.normalize('NFKC')) {
    if (/[\s\p{P}\p{S}]/u.test(ch)) continue;    // marks before the first letter
    const base = ch.normalize('NFD')[0];
    if (/[a-z]/i.test(base)) out = base.toUpperCase();
    else if (isHan(ch.codePointAt(0)!)) out = HAN?.(ch) ?? OTHER;
    else {
      const cp = ch.codePointAt(0)!;
      const hira = cp >= 0x30a1 && cp <= 0x30f6 ? String.fromCodePoint(cp - 0x60) : ch;
      out = KANA.get(hira) ?? OTHER;
    }
    break;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(title, out);
  return out;
}

const rank = (l: string) => (l === OTHER ? 26 : l.charCodeAt(0) - 65);
/** titles A–Z (# last); a stable sort, so equal titles keep the order they came in */
export function byLetter<T>(items: T[], titleOf: (t: T) => string): T[] {
  return items
    .map((it, i) => ({ it, i, t: titleOf(it), l: letterOf(titleOf(it)) }))
    .sort((a, b) => rank(a.l) - rank(b.l) || COLLATOR.compare(a.t, b.t) || a.i - b.i)
    .map((x) => x.it);
}
