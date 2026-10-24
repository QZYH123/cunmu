/**
 * 常遇见 M1–M3. The people gate is first: below it, every M sentence is absent.
 * M4–M6 are named and return nothing. Games never enter this index.
 */
import { personId } from '../../derive';
import { capWorks, byTime, evenPick, type CreatorFact, type Facts } from '../facts';
import { GATES } from '../gates';
import { cnYears } from '../num';
import type { Hit, Seg, TasteWork } from '../types';

function ready(f: Facts): boolean {
  return f.people.state === 'ready';
}

function qualifies(c: CreatorFact): boolean {
  return c.works.length >= GATES.M.minWorks && c.years.length >= GATES.M.minYears;
}

function dated(c: CreatorFact): TasteWork[] {
  const withYear = c.works.filter((w) => w.year != null);
  return [...(withYear.length ? withYear : c.works)].sort(byTime);
}

function M2(f: Facts): Hit | null {
  if (!ready(f)) return null;
  const top = f.creators.filter(qualifies).slice(0, 3);
  if (!top.length) return null;
  const list = top.map((p) => `${p.name} ${p.works.length} 部`).join(' · ');
  const segs: Seg[] = [];
  top.forEach((p, i) => {
    if (i) segs.push({ text: ' · ' });
    segs.push({ text: p.name, to: `/person/${personId(p.name)}`, kind: 'person' });
    segs.push({ text: ` ${p.works.length} 部` });
  });
  const evidence: TasteWork[] = [];
  for (const p of top) {
    const pool = dated(p);
    if (pool.length <= 2) evidence.push(...pool);
    else evidence.push(pool[0], pool[pool.length - 1]);
  }
  return { slots: { list }, evidence: capWorks(evidence), variant: 'full', names: top.map((p) => p.name), segs };
}

function M1(f: Facts): Hit | null {
  if (!ready(f)) return null;
  const [a, b] = f.creators;
  if (!a || !b || !qualifies(a) || !qualifies(b)) return null;
  const ids = new Set<string>();
  for (const w of a.works) ids.add(w.id);
  for (const w of b.works) ids.add(w.id);
  const segs: Seg[] = [
    { text: a.name, to: `/person/${personId(a.name)}`, kind: 'person' },
    { text: '和' },
    { text: b.name, to: `/person/${personId(b.name)}`, kind: 'person' },
    { text: `，在你不同年份的 ${ids.size} 部作品里反复出现。` },
  ];
  return {
    slots: { p1: a.name, p2: b.name, n: ids.size },
    evidence: capWorks([...evenPick(dated(a), 3), ...evenPick(dated(b), 3)]),
    variant: 'full',
    names: [a.name, b.name],
    segs,
  };
}

function spanOf(c: CreatorFact): number {
  if (c.years.length < 2) return 0;
  return c.years[c.years.length - 1] - c.years[0];
}

function M3(f: Facts): Hit | null {
  if (!ready(f)) return null;
  const cands = f.creators.filter((c) => c.works.length >= GATES.M3.minWorks && spanOf(c) >= GATES.M3.spanYears);
  if (!cands.length) return null;
  cands.sort((a, b) => spanOf(b) - spanOf(a) || b.works.length - a.works.length || a.name.localeCompare(b.name, 'zh'));
  const p = cands[0];
  const span = cnYears(spanOf(p));
  const firstYear = p.years[0];
  const lastYear = p.years[p.years.length - 1];
  const pool = dated(p);
  const first = pool[0];
  const last = pool[pool.length - 1];
  const middle = pool.slice(1, -1);
  const segs: Seg[] = [
    { text: '你和' },
    { text: p.name, to: `/person/${personId(p.name)}`, kind: 'person' },
    { text: `，${firstYear} 年第一次碰上，到 ${lastYear} 年还在碰。${span}年。` },
  ];
  return {
    slots: { p: p.name, firstYear, lastYear, span },
    evidence: capWorks([first, ...evenPick(middle, 4), last]),
    variant: 'full',
    names: [p.name],
    segs,
  };
}

export const metCalc: Record<'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6', (f: Facts) => Hit | null> = {
  M1, M2, M3, M4: () => null, M5: () => null, M6: () => null,
};
