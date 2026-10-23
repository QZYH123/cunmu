/**
 * 题句. H2 is built from an M3 sentence already in the result.
 * H1, H3 and H4 are left empty until 转向 and the rest of 长情 are in.
 * Your own line under the name wins, and it is not linted.
 */
import { personId } from '../derive';
import { plain } from '../lead';
import { lintSentence } from './lint';
import { numbersInCn } from './num';
import type { ShownRow } from './pick';
import type { Sentence, TasteResult } from './types';

export function headlineH2(m3: Sentence): Sentence | null {
  const span = m3.slots.span;
  const p = m3.slots.p;
  if (span == null || p == null || span === '' || p === '') return null;
  const name = String(p);
  const segs: Sentence['segs'] = [
    { text: `${span}年，同一个名字：` },
    { text: name, to: `/person/${personId(name)}`, kind: 'person' },
    { text: '。' },
  ];
  const text = plain(segs);
  if (lintSentence(text).length) return null;
  return {
    tid: 'M3', dim: 'met', segs, text,
    evidence: m3.evidence,
    nums: numbersInCn(text),
    slots: { span: String(span), p: name },
    variant: 'full',
    star: true,
    names: [name],
  };
}

export function headlineH1(): null { return null; }
export function headlineH3(): null { return null; }
export function headlineH4(): null { return null; }

export function pickHeadline(result: TasteResult, rows: readonly ShownRow[], userLine: string): Sentence | null {
  const line = userLine.trim();
  if (line) {
    return { tid: 'L1', dim: 'long', segs: [{ text: line }], text: line, evidence: [], nums: 0, slots: {}, variant: 'user', star: false };
  }
  if (!rows.some((row) => row.dim === 'met' && row.sentence != null && !row.off)) return null;
  return result.headlines.find((h) => h.id === 'H2')?.sentence ?? null;
}
