/**
 * 长情 L1–L5. L6 and L7 are named so the table is complete; they return nothing.
 * A miss is null — the row is left out, not filled with a softer sentence.
 */
import { capWorks, byTime, type Facts, type TopicStat } from '../facts';
import { GATES } from '../gates';
import { cnYears } from '../num';
import type { Hit, Seg, TasteWork } from '../types';

function jaccard(a: readonly TasteWork[], b: readonly TasteWork[]): number {
  const A = new Set(a.map((w) => w.id));
  const B = new Set(b.map((w) => w.id));
  let inter = 0;
  for (const id of A) if (B.has(id)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 1 : inter / union;
}

/** every year strictly between the two appearances is a year the record actually has */
function holeIsRecorded(f: Facts, y1: number, y2: number): boolean {
  if (y2 - y1 < 2) return false;
  for (let y = y1 + 1; y < y2; y++) if (!f.recorded.has(y)) return false;
  return true;
}

function hasReturn(f: Facts, st: TopicStat): boolean {
  for (let i = 1; i < st.years.length; i++) if (holeIsRecorded(f, st.years[i - 1], st.years[i])) return true;
  return false;
}

function bucket(f: Facts, topic: string, year: number): TasteWork[] {
  return f.topicYears.get(topic)?.get(year) ?? [];
}

function L1(f: Facts): Hit | null {
  const total = f.works.length;
  if (total <= 0) return null;
  const names = [...f.topics.keys()].filter((t) => {
    const st = f.topics.get(t)!;
    return st.works.length >= GATES.L1.minWorks
      && st.years.length >= GATES.L1.minYears
      && st.works.length / total <= GATES.topic.maxShare;
  });
  names.sort((a, b) => {
    const A = f.topics.get(a)!;
    const B = f.topics.get(b)!;
    return B.span - A.span || B.works.length - A.works.length || a.localeCompare(b, 'zh');
  });
  if (names.length < 2) return null;
  const [a, b] = names;
  const A = f.topics.get(a)!;
  const B = f.topics.get(b)!;
  if (jaccard(A.works, B.works) >= GATES.L1.overlap) return null;
  if (!hasReturn(f, A) && !hasReturn(f, B)) return null;
  const shorter = Math.min(A.span, B.span) - GATES.L1.tailShorter;
  const full = names.slice(2).every((t) => f.topics.get(t)!.span <= shorter);
  const from = Math.min(A.first, B.first);
  const to = Math.max(A.last, B.last);
  const picked: TasteWork[] = [];
  for (const topic of [a, b]) {
    const st = f.topics.get(topic)!;
    const firsts = byTimeSort(bucket(f, topic, st.first));
    const lasts = byTimeSort(bucket(f, topic, st.last));
    picked.push(firsts[0], lasts[lasts.length - 1]);
    for (let i = 1; i < st.years.length; i++) {
      const y1 = st.years[i - 1];
      const y2 = st.years[i];
      if (!holeIsRecorded(f, y1, y2)) continue;
      const before = byTimeSort(bucket(f, topic, y1));
      const after = byTimeSort(bucket(f, topic, y2));
      picked.push(before[before.length - 1], after[0]);
    }
  }
  return { slots: { from, to, a, b }, evidence: capWorks(picked), variant: full ? 'full' : 'short' };
}

function byTimeSort(ws: TasteWork[]): TasteWork[] {
  return [...ws].sort(byTime);
}

function L2(f: Facts): Hit | null {
  let best: { topic: string; g: number; back: number; y1: number; works: number } | null = null;
  for (const [topic, st] of f.topics) {
    if (st.works.length < GATES.L2.minWorks) continue;
    for (let i = 1; i < st.years.length; i++) {
      const y1 = st.years[i - 1];
      const y2 = st.years[i];
      const g = y2 - y1 - 1;
      if (g < GATES.L2.gapYears || !holeIsRecorded(f, y1, y2)) continue;
      const before = st.works.filter((w) => w.year != null && w.year <= y1).length;
      const after = st.works.filter((w) => w.year != null && w.year >= y2).length;
      if (before < GATES.L2.sideMinWorks || after < GATES.L2.sideMinWorks) continue;
      const cand = { topic, g, back: y2, y1, works: st.works.length };
      if (!best || cand.g > best.g || (cand.g === best.g && (cand.works > best.works || (cand.works === best.works && cand.topic.localeCompare(best.topic, 'zh') < 0)))) best = cand;
    }
  }
  if (!best) return null;
  const st = f.topics.get(best.topic)!;
  const before = byTimeSort(st.works.filter((w) => w.year != null && w.year <= best.y1)).slice(-3);
  const after = byTimeSort(st.works.filter((w) => w.year != null && w.year >= best.back)).slice(0, 3);
  return {
    slots: { topic: best.topic, gap: cnYears(best.g), back: best.back },
    evidence: capWorks([...before, ...after]),
    variant: 'full',
  };
}

function L3(f: Facts): Hit | null {
  const ranked = [...f.topics.entries()].sort((a, b) => b[1].years.length - a[1].years.length || b[1].works.length - a[1].works.length || a[0].localeCompare(b[0], 'zh'));
  if (!ranked.length || ranked[0][1].years.length < GATES.L3.minYears) return null;
  if (ranked[1] && ranked[0][1].years.length < ranked[1][1].years.length + GATES.L3.lead) return null;
  const [topic, st] = ranked[0];
  const perYear = st.years.map((y) => byTimeSort(bucket(f, topic, y))[0]);
  return { slots: { topic, years: st.years.length }, evidence: capWorks(perYear), variant: 'full' };
}

function uniqueEnd(ws: readonly TasteWork[], which: 'first' | 'last'): TasteWork | null {
  if (!ws.length) return null;
  const y = which === 'first' ? Math.min(...ws.map((w) => w.year!)) : Math.max(...ws.map((w) => w.year!));
  const inYear = ws.filter((w) => w.year === y);
  if (inYear.length === 1) return inYear[0];
  if (inYear.some((w) => w.precision === 'year')) return null;
  const sorted = byTimeSort([...inYear]);
  const end = which === 'first' ? sorted[0] : sorted[sorted.length - 1];
  if (inYear.filter((w) => w.finished === end.finished).length > 1) return null;
  return end;
}

function L4(f: Facts): Hit | null {
  const ranked = [...f.topics.entries()].filter(([, st]) => st.works.length >= GATES.L4.minWorks && st.span >= GATES.L4.spanYears);
  ranked.sort((a, b) => b[1].span - a[1].span || b[1].works.length - a[1].works.length || a[0].localeCompare(b[0], 'zh'));
  const top = ranked[0];
  if (!top) return null;
  const [topic, st] = top;
  const sorted = byTimeSort(st.works);
  const first = uniqueEnd(st.works, 'first');
  const last = uniqueEnd(st.works, 'last');
  const firstW = first ?? sorted[0];
  const lastW = last ?? sorted[sorted.length - 1];
  const span = cnYears(st.span);
  const slots = {
    topic,
    firstTitle: firstW.title,
    firstYear: st.first,
    lastTitle: lastW.title,
    lastYear: st.last,
    span,
  };
  const middle = sorted.filter((w) => w.id !== firstW.id && w.id !== lastW.id);
  const evidence = capWorks([firstW, ...middle.length ? evenMiddle(middle, 4) : [], lastW]);
  if (!first || !last) return { slots, evidence, variant: 'noTitle' };
  const segs: Seg[] = [
    { text: `你记下的第一部『${topic}』是 ${st.first} 年的《` },
    { text: first.title, to: `/entry/${first.id}`, kind: 'work' },
    { text: `》，最近一部是 ${st.last} 年的《` },
    { text: last.title, to: `/entry/${last.id}`, kind: 'work' },
    { text: `》。${span}年，同一条线。` },
  ];
  return { slots, evidence, variant: 'full', segs };
}

function evenMiddle(ws: TasteWork[], n: number): TasteWork[] {
  if (ws.length <= n) return ws;
  const out: TasteWork[] = [];
  for (let i = 0; i < n; i++) out.push(ws[Math.round((i * (ws.length - 1)) / (n - 1))]);
  const seen = new Set<string>();
  return out.filter((w) => !seen.has(w.id) && !!seen.add(w.id));
}

const KIND_VERB = { book: '读书', anime: '看番', film: '看片', music: '听专辑' } as const;
const KIND_ORDER = ['book', 'anime', 'film', 'music'] as const;

function L5(f: Facts): Hit | null {
  if (f.maxYear == null) return null;
  const end = f.maxYear;
  let best: { kind: typeof KIND_ORDER[number]; missing: number; span: number; works: number; first: number; perYear: TasteWork[] } | null = null;
  for (const kind of KIND_ORDER) {
    const ws = f.works.filter((w) => w.kind === kind && w.year != null && w.trust !== 'lastPlayed');
    if (!ws.length) continue;
    const first = Math.min(...ws.map((w) => w.year!));
    const span = end - first + 1;
    if (span < GATES.L5.spanYears) continue;
    const have = new Set(ws.map((w) => w.year!));
    let missing = 0;
    for (let y = first; y <= end; y++) if (!have.has(y)) missing += 1;
    if (missing > GATES.L5.maxMissing) continue;
    const years = [...have].sort((a, b) => a - b);
    const perYear = years.map((y) => byTimeSort(ws.filter((w) => w.year === y))[0]);
    const cand = { kind, missing, span, works: ws.length, first, perYear };
    if (!best || cand.missing < best.missing || (cand.missing === best.missing && (cand.span > best.span || (cand.span === best.span && (cand.works > best.works || (cand.works === best.works && KIND_ORDER.indexOf(cand.kind) < KIND_ORDER.indexOf(best.kind))))))) best = cand;
  }
  if (!best) return null;
  const slots = { kindVerb: KIND_VERB[best.kind], from: best.first, years: best.span, had: best.span - best.missing };
  return {
    slots,
    evidence: capWorks(best.perYear),
    variant: best.missing === 0 ? 'full' : 'gap',
  };
}

export const longCalc: Record<'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7', (f: Facts) => Hit | null> = {
  L1, L2, L3, L4, L5, L6: () => null, L7: () => null,
};
