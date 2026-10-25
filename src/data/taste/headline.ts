/**
 * 题句. Each one is assembled from a sentence already in the result.
 * H3 stays empty. Your own line under the name wins, and it is not linted.
 */
import { personId } from '../derive';
import { plain } from '../lead';
import { topicAcross } from './calc/turn';
import { fill, HEADLINE_COPY } from './copy';
import { capWorks, type Facts } from './facts';
import { GATES } from './gates';
import { lintSentence } from './lint';
import { cnYears, numbersInCn } from './num';
import type { ShownRow } from './pick';
import type { Dim, Sentence, TasteResult, TasteWork } from './types';

function kept(rows: readonly ShownRow[], dim: Dim): ShownRow | undefined {
  return rows.find((row) => row.dim === dim && row.sentence != null && !row.off);
}

export function headlineH1(z1: Sentence, facts: Facts): Sentence | null {
  const split = z1.slots.split;
  if (typeof split !== 'number') return null;
  const nounEarly = String(z1.slots.nounEarly ?? '');
  const nounLate = String(z1.slots.nounLate ?? '');
  if (!nounEarly || !nounLate) return null;
  const topic = topicAcross(facts, split);
  if (!topic) return null;
  const text = fill(HEADLINE_COPY.H1, { nounEarly, nounLate, topic: topic.name });
  if (lintSentence(text).length) return null;
  return {
    tid: 'Z1', dim: 'turn', segs: [{ text }], text,
    evidence: capWorks(topic.works),
    nums: numbersInCn(text),
    slots: { nounEarly, nounLate, topic: topic.name, split },
    variant: 'full',
    star: true,
  };
}

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

export function headlineH3(): null { return null; }

function h4Topic(long: Sentence, facts: Facts): { name: string; span: number; works: TasteWork[] } | null {
  const names: string[] = [];
  if (long.tid === 'L1') {
    if (typeof long.slots.a === 'string') names.push(long.slots.a);
    if (typeof long.slots.b === 'string') names.push(long.slots.b);
  } else if (long.tid === 'L3' && typeof long.slots.topic === 'string') names.push(long.slots.topic);
  let best: { name: string; span: number; works: TasteWork[] } | null = null;
  for (const name of names) {
    const st = facts.topics.get(name);
    if (!st || st.span < GATES.H4.spanYears) continue;
    const cand = { name, span: st.span, works: st.works };
    if (!best || cand.span > best.span || (cand.span === best.span && (cand.works.length > best.works.length || (cand.works.length === best.works.length && cand.name.localeCompare(best.name, 'zh') < 0)))) best = cand;
  }
  return best;
}

/** L1 or L3, and the late side of the turn is games. The caller checks the turn. */
export function headlineH4(long: Sentence, facts: Facts): Sentence | null {
  const topic = h4Topic(long, facts);
  if (!topic) return null;
  const heavy = facts.works.filter((w) => w.kind === 'game' && (w.minutes ?? 0) >= GATES.H4.heavyMinutes).length >= GATES.H4.heavyGames;
  const text = fill(heavy ? HEADLINE_COPY.H4lived : HEADLINE_COPY.H4, { span: cnYears(topic.span), topic: topic.name });
  if (lintSentence(text).length) return null;
  return {
    tid: long.tid, dim: 'long', segs: [{ text }], text,
    evidence: capWorks(topic.works),
    nums: numbersInCn(text),
    slots: { span: cnYears(topic.span), topic: topic.name },
    variant: heavy ? 'lived' : 'full',
    star: false,
  };
}

export function pickHeadline(result: TasteResult, rows: readonly ShownRow[], userLine: string): Sentence | null {
  const line = userLine.trim();
  if (line) {
    return { tid: 'L1', dim: 'long', segs: [{ text: line }], text: line, evidence: [], nums: 0, slots: {}, variant: 'user', star: false };
  }
  if (kept(rows, 'turn')) {
    const h1 = result.headlines.find((h) => h.id === 'H1')?.sentence;
    if (h1) return h1;
  }
  if (kept(rows, 'met')) {
    const h2 = result.headlines.find((h) => h.id === 'H2')?.sentence;
    if (h2) return h2;
  }
  if (kept(rows, 'long') && kept(rows, 'turn')) {
    const shown = kept(rows, 'long')?.sentence;
    return result.headlines.find((h) => h.id === 'H4' && h.sentence.tid === shown?.tid)?.sentence ?? null;
  }
  return null;
}
