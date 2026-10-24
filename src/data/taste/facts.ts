/**
 * What the calcs share: which works count, which years are trusted, which topics and people.
 * One pass. Calcs only read the indexes.
 */
import type { Work } from '../types';
import { orgLike } from '../lead';
import { isMetaTag, tagsOf } from '../me';
import { GATES } from './gates';
import { canonKey, mergeCreators } from './names';
import type { PeopleStatus, TasteWork, WorkKind, YearTrust } from './types';

const COMPANY_ROLE = new Set(['动画制作', '开发', '发行']);

export function byTime(a: TasteWork, b: TasteWork): number {
  return (a.year ?? 99999) - (b.year ?? 99999)
    || a.finished.localeCompare(b.finished)
    || a.title.localeCompare(b.title, 'zh')
    || a.id.localeCompare(b.id);
}

export interface TopicStat {
  works: TasteWork[];
  years: number[];
  span: number;
  first: number;
  last: number;
}

export interface CreatorFact {
  key: string;
  name: string;
  works: TasteWork[];
  /** trusted years, ascending; an undated work counts in `works` but not here */
  years: number[];
}

export interface Facts {
  works: TasteWork[];
  topicYears: Map<string, Map<number, TasteWork[]>>;
  topics: Map<string, TopicStat>;
  /** trusted works per year, games included: "the record has this year" */
  yearCount: Map<number, number>;
  recorded: Set<number>;
  /** latest trusted year among non-games that are not "last played" */
  maxYear: number | null;
  creators: CreatorFact[];
  people: PeopleStatus;
}

export function eligible(w: Work): boolean {
  return w.kind !== 'essay' && !w.isSample && w.status !== 'doing';
}

export function trustedOf(w: Work): { year: number; trust: YearTrust; precision: 'day' | 'month' | 'year' } | null {
  const d = w.date;
  if (!d) {
    if (!/^\d{4}-\d{2}/.test(w.finished)) return null;
    return {
      year: +w.finished.slice(0, 4),
      trust: 'source',
      precision: w.finished.length >= 10 ? 'day' : 'month',
    };
  }
  if (d.level > 2 || d.approx || d.precision === 'unknown' || !d.value) return null;
  const year = +d.value.slice(0, 4);
  if (!Number.isFinite(year)) return null;
  const trust: YearTrust = d.source === 'user' ? 'own'
    : d.source === 'manual_add' ? 'added'
    : d.source === 'steam_last_played' ? 'lastPlayed'
    : 'source';
  const precision = d.precision === 'day' || d.precision === 'month' ? d.precision : 'year';
  return { year, trust, precision };
}

/** a hand-added calendar day, or null when this work cannot join a same-day clump */
export function addedDay(w: Work): string | null {
  const d = w.date;
  if (!d || d.source !== 'manual_add') return null;
  if (d.level > 2 || d.approx || d.precision !== 'day' || !d.value) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(d.value) ? d.value.slice(0, 10) : null;
}

function peopleNames(w: Work): string[] {
  if (w.kind === 'game' && GATES.games.restrictAll) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of w.credits ?? []) {
    if (!c?.core || !c.name || seen.has(c.name)) continue;
    if (COMPANY_ROLE.has(c.role) || orgLike(c.name)) continue;
    seen.add(c.name);
    out.push(c.name);
  }
  return out;
}

function rawTopics(w: Work, creatorNames: Set<string>): string[] {
  if (w.kind === 'game' && GATES.games.restrictAll) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tagsOf(w)) {
    if (!t || seen.has(t) || isMetaTag(t) || creatorNames.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** same length, at least half the characters equal, and only from 3 characters up (科幻 stays 科幻) */
function canonTopics(list: readonly string[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const t of list) count.set(t, (count.get(t) ?? 0) + 1);
  const byLen = new Map<number, string[]>();
  for (const t of count.keys()) {
    const n = [...t].length;
    if (n < 3) continue;
    const bucket = byLen.get(n) ?? [];
    bucket.push(t);
    byLen.set(n, bucket);
  }
  const map = new Map<string, string>();
  for (const bucket of byLen.values()) {
    bucket.sort((a, b) => (count.get(b)! - count.get(a)!) || a.localeCompare(b, 'zh'));
    const canon: string[] = [];
    const canonCp: string[][] = [];
    for (const t of bucket) {
      const cp = [...t];
      let hit = -1;
      for (let i = 0; i < canon.length; i++) {
        let same = 0;
        const other = canonCp[i];
        for (let k = 0; k < cp.length; k++) if (cp[k] === other[k]) same += 1;
        if (same * 2 >= cp.length) { hit = i; break; }
      }
      if (hit >= 0) map.set(t, canon[hit]);
      else { canon.push(t); canonCp.push(cp); map.set(t, t); }
    }
  }
  return map;
}

function madeYear(w: Work, today: string): number | null {
  const cap = Number(today.slice(0, 4)) + 1;
  return typeof w.year === 'number' && w.year >= 1800 && w.year <= cap ? w.year : null;
}

/**
 * One work, without the same-day clump (that needs the whole batch — see toTasteWorks).
 * Essays, samples and 在看 are not passed here.
 */
export function toTasteWork(w: Work, today: string, ctx?: { creatorNames?: Set<string>; topicOf?: Map<string, string>; display?: Map<string, string> }): TasteWork {
  const names = peopleNames(w);
  const creatorNames = ctx?.creatorNames ?? new Set(names);
  const raw = rawTopics(w, creatorNames);
  const topics = [...new Set(raw.map((t) => ctx?.topicOf?.get(t) ?? t))];
  const creators: { key: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = canonKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    creators.push({ key, name: ctx?.display?.get(key) ?? name });
  }
  const trust = trustedOf(w);
  const kind = w.kind as WorkKind;
  return {
    id: w.id,
    kind,
    title: w.title,
    year: trust?.year ?? null,
    trust: trust?.trust ?? 'source',
    precision: trust?.precision ?? 'year',
    finished: w.finished ?? '',
    made: madeYear(w, today),
    topics,
    creators,
    minutes: typeof w.play?.minutes === 'number' ? w.play.minutes : null,
  };
}

/** the batch the engine reads: ineligible works gone, a same-day hand-add of 15 or more loses its year */
export function toTasteWorks(works: readonly Work[], today: string): TasteWork[] {
  const list = works.filter(eligible);
  const dayCount = new Map<string, number>();
  for (const w of list) {
    const day = addedDay(w);
    if (day) dayCount.set(day, (dayCount.get(day) ?? 0) + 1);
  }
  const clumped = new Set<string>();
  for (const [day, n] of dayCount) if (n >= GATES.addedClump) clumped.add(day);

  const perNames = list.map(peopleNames);
  const creatorNames = new Set<string>();
  const flat: string[] = [];
  for (const names of perNames) for (const name of names) { creatorNames.add(name); flat.push(name); }
  const merged = mergeCreators(flat);
  const display = new Map(merged.map((m) => [m.key, m.name]));
  for (const m of merged) creatorNames.add(m.name);

  const rawPer = list.map((w) => rawTopics(w, creatorNames));
  const topicOf = canonTopics(rawPer.flat());
  const ctx = { creatorNames, topicOf, display };

  return list.map((w) => {
    const tw = toTasteWork(w, today, ctx);
    const day = addedDay(w);
    if (day && clumped.has(day)) return { ...tw, year: null };
    return tw;
  });
}

export function buildFacts(ws: TasteWork[], today: string, people: PeopleStatus): Facts {
  void today;
  const topicYears = new Map<string, Map<number, TasteWork[]>>();
  const yearCount = new Map<number, number>();
  let maxYear: number | null = null;
  for (const w of ws) {
    if (w.year != null) yearCount.set(w.year, (yearCount.get(w.year) ?? 0) + 1);
    const countsForSpan = w.kind !== 'game' && w.trust !== 'lastPlayed' && w.year != null;
    if (countsForSpan && (maxYear == null || w.year! > maxYear)) maxYear = w.year;
    if (!countsForSpan) continue;
    for (const t of w.topics) {
      let years = topicYears.get(t);
      if (!years) { years = new Map(); topicYears.set(t, years); }
      const bucket = years.get(w.year!) ?? [];
      bucket.push(w);
      years.set(w.year!, bucket);
    }
  }
  const topics = new Map<string, TopicStat>();
  for (const [t, years] of topicYears) {
    const ys = [...years.keys()].sort((a, b) => a - b);
    const seen = new Set<string>();
    const works: TasteWork[] = [];
    for (const y of ys) {
      const bucket = years.get(y)!.sort(byTime);
      years.set(y, bucket);
      for (const w of bucket) if (!seen.has(w.id)) { seen.add(w.id); works.push(w); }
    }
    topics.set(t, { works, years: ys, first: ys[0], last: ys[ys.length - 1], span: ys[ys.length - 1] - ys[0] });
  }
  const recorded = new Set<number>();
  for (const [y, n] of yearCount) if (n >= GATES.recordedYearMin) recorded.add(y);

  const grouped = new Map<string, { key: string; name: string; works: TasteWork[]; years: Set<number> }>();
  for (const w of ws) {
    if (w.kind === 'game') continue;
    const seen = new Set<string>();
    for (const c of w.creators) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      let g = grouped.get(c.key);
      if (!g) { g = { key: c.key, name: c.name, works: [], years: new Set() }; grouped.set(c.key, g); }
      g.works.push(w);
      if (w.year != null && w.trust !== 'lastPlayed') g.years.add(w.year);
    }
  }
  const creators: CreatorFact[] = [...grouped.values()]
    .map((g) => ({ key: g.key, name: g.name, works: g.works, years: [...g.years].sort((a, b) => a - b) }))
    .sort((a, b) => b.works.length - a.works.length || b.years.length - a.years.length || a.name.localeCompare(b.name, 'zh') || a.key.localeCompare(b.key));

  return { works: ws, topicYears, topics, yearCount, recorded, maxYear, creators, people };
}

export function evenPick<T>(xs: readonly T[], n: number): T[] {
  if (n <= 0 || xs.length === 0) return [];
  if (xs.length <= n) return [...xs];
  const used = new Set<number>();
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    let k = Math.round((i * (xs.length - 1)) / (n - 1));
    if (used.has(k)) {
      let up = k;
      while (up < xs.length && used.has(up)) up += 1;
      if (up < xs.length) k = up;
      else {
        let down = k;
        while (down >= 0 && used.has(down)) down -= 1;
        k = Math.max(0, down);
      }
    }
    used.add(k);
    idx.push(k);
  }
  idx.sort((a, b) => a - b);
  return idx.map((i) => xs[i]);
}

/** dedupe, order by time, keep at most `n` with the first and last included */
export function capWorks(ws: readonly TasteWork[], n = GATES.ev.max): TasteWork[] {
  const seen = new Set<string>();
  const uniq: TasteWork[] = [];
  for (const w of [...ws].sort(byTime)) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    uniq.push(w);
  }
  return evenPick(uniq, n);
}
