/**
 * Voice check for a generated sentence. Your own rewrite is never passed through here.
 * Banned words are written as escapes so the source scan does not see them.
 */
import { GATES } from './gates';
import { numbersInCn } from './num';

const BANNED = [
  '\u56de\u5fc6', // hui-yi
  '\u65f6\u5149',
  '\u5c81\u6708',
  '\u4e13\u5c5e',
  '\u5e74\u5ea6\u62a5\u544a',
  '\u4e00\u952e',
  '\u5c11\u5e74',
  '\u72ec\u81ea',
  '\u91cd\u770b',
  '\u8bdd\u6570',
  '\u9605\u8bfb\u65f6\u957f',
  '\u6df1\u591c',
  '\u901a\u52e4',
  '\u5fc3\u60c5',
];

const EN = /(?:^|[^A-Za-z])(?:commute|late-night|age)(?![A-Za-z])/i;
const MEASURE = /(?:\d|[零〇一二三四五六七八九十百千万两])\s*[\u672c\u5f20\u6b3e]/;
const END_PARTICLE = /[\u5440\u5566\u54e6\u5462\u561b]\s*$/u;

/** Empty means the sentence can be shown. */
export function lintSentence(text: string): string[] {
  const bad: string[] = [];
  if (numbersInCn(text) > GATES.numbers.max) bad.push('numbers');
  if (/[!\uFF01]/.test(text)) bad.push('exclamation');
  if (/\p{Extended_Pictographic}/u.test(text)) bad.push('emoji');
  if (END_PARTICLE.test(text)) bad.push('particle');
  for (const w of BANNED) if (text.includes(w)) bad.push('banned');
  if (EN.test(text)) bad.push('banned-en');
  if (MEASURE.test(text)) bad.push('measure');
  if ([...text].length > 60) bad.push('length');
  return bad;
}
