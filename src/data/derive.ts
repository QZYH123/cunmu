import type { Kind, Person, Work } from './types';
import { KIND_ORDER } from './types';
import { hash } from '../lib/hash';
import { NAMED_PERIODS } from '@demo';

export interface Settings {
  /** 一年多少条后按月分组: number, 0 = 总是按月, Infinity = 从不按月 */
  yearGroup: number;
  /** 一个月多少条成为月条目: number, Infinity = 不建月条目 */
  monthEntry: number;
  /** 某人出现在几部作品里收进档案: number, Infinity = 只收核心创作者 */
  personThreshold: number;
}
export const DEFAULT_SETTINGS: Settings = { yearGroup: 12, monthEntry: 5, personThreshold: 3 };

export const personId = (name: string) => `p-${hash(name).toString(36)}`;

export interface YearInfo {
  year: number;
  works: Work[];
  /** works dated to a month or a day, by month */
  months: Map<number, Work[]>;
  /** works known only to the year (「约」 or a year you set): 「这一年里」, after the months */
  loose: Work[];
  named?: string;
}

export interface Linkable { name: string; target: string; kind: 'work' | 'person' }

export interface Mention {
  from: Work;
  /** context before / the matched word / after */
  before?: string; word?: string; after?: string;
  relation?: string;
  date: string;
}

export interface Derived {
  works: Work[];
  byId: Map<string, Work>;
  persons: Map<string, Person>;
  /** every credited name (A + B), for staff popovers */
  allPeople: Map<string, { name: string; works: Work[]; roles: Set<string>; core: boolean }>;
  years: Map<number, YearInfo>;
  kindCounts: Map<Kind, number>;
  interests: Map<string, Work[]>;
  linkables: Linkable[];
  startedAt?: string;
  /** 时间未知: on the wall's end, never in a year */
  unknown: Work[];
}

export const yearsGrouped = (d: Derived, s: Settings) => [...d.years.values()].filter((y) => y.works.length >= s.yearGroup).length;
export const monthEntries = (d: Derived, s: Settings) => {
  let n = 0;
  for (const y of d.years.values()) for (const ws of y.months.values()) if (ws.length >= s.monthEntry) n++;
  return n;
};

export function derive(works: Work[], settings: Settings, promoted: Set<string>, doing: Work[] = []): Derived {
  const byId = new Map([...doing, ...works].map((w) => [w.id, w]));
  const allPeople: Derived['allPeople'] = new Map();
  for (const w of works) {
    for (const c of w.credits) {
      const id = personId(c.name);
      let p = allPeople.get(id);
      if (!p) { p = { name: c.name, works: [], roles: new Set(), core: false }; allPeople.set(id, p); }
      if (!p.works.includes(w)) p.works.push(w);
      p.roles.add(c.role);
      if (c.core) p.core = true;
    }
  }
  const persons = new Map<string, Person>();
  for (const [id, p] of allPeople) {
    const manual = promoted.has(id);
    if (p.core || manual || p.works.length >= settings.personThreshold) {
      persons.set(id, { id, name: p.name, roles: [...p.roles], works: p.works, core: p.core, manual });
    }
  }

  const years = new Map<number, YearInfo>();
  const unknown: Work[] = [];
  for (const w of works) {
    if (!w.finished) { unknown.push(w); continue; }
    const y = Number(w.finished.slice(0, 4));
    let yi = years.get(y);
    if (!yi) { yi = { year: y, works: [], months: new Map(), loose: [], named: NAMED_PERIODS.find((n) => n.years.includes(y))?.name }; years.set(y, yi); }
    yi.works.push(w);
    if (w.finished.length < 7) { yi.loose.push(w); continue; }
    const m = Number(w.finished.slice(5, 7));
    if (!yi.months.has(m)) yi.months.set(m, []);
    yi.months.get(m)!.push(w);
  }
  const dated = works.filter((w) => w.finished);

  const kindCounts = new Map<Kind, number>();
  for (const k of KIND_ORDER) kindCounts.set(k, 0);
  for (const w of works) kindCounts.set(w.kind, (kindCounts.get(w.kind) ?? 0) + 1);

  const interests = new Map<string, Work[]>();
  for (const w of works) for (const g of w.genres) {
    if (!g) continue;
    if (!interests.has(g)) interests.set(g, []);
    interests.get(g)!.push(w);
  }

  // Auto-link candidates: only curated / synced titles and promoted people (宁可少连).
  const linkables: Linkable[] = [];
  for (const w of works) {
    if (w.id.startsWith('gen-') || w.id.startsWith('wr-') || w.kind === 'essay' || w.title.length < 2) continue;
    linkables.push({ name: w.title, target: w.id, kind: 'work' });
  }
  for (const p of persons.values()) if (p.name.length >= 2 && /[\u4e00-\u9fff]/.test(p.name)) linkables.push({ name: p.name, target: p.id, kind: 'person' });
  linkables.sort((a, b) => b.name.length - a.name.length);

  return {
    works, byId, persons, allPeople, years, kindCounts, interests, linkables,
    // 始于: the earliest date you have at all (a 「约」 year counts; 时间未知 doesn't)
    startedAt: dated.length ? dated.reduce((a, w) => (w.finished < a ? w.finished : a), dated[0].finished) : undefined,
    unknown,
  };
}

/* ---------- autolinks ---------- */

export type Segment = { text: string; target?: string; kind?: 'work' | 'person' };

/**
 * Split paragraphs into text / link segments. A target is linked only at its first occurrence in the
 * whole document (§3.4), never to the document itself, and never if the user unlinked it.
 */
export function linkify(paragraphs: string[], d: Derived, selfId: string, unlinked: Set<string>): Segment[][] {
  const done = new Set<string>();
  const cands = d.linkables.filter((l) => l.target !== selfId && !unlinked.has(`${selfId}>${l.target}`));
  return paragraphs.map((p) => {
    const segs: Segment[] = [];
    let i = 0;
    let buf = '';
    while (i < p.length) {
      let hit: Linkable | undefined;
      for (const c of cands) {
        if (p.startsWith(c.name, i)) { hit = c; break; }
      }
      if (hit) {
        if (!done.has(hit.target)) {
          if (buf) { segs.push({ text: buf }); buf = ''; }
          segs.push({ text: hit.name, target: hit.target, kind: hit.kind });
          done.add(hit.target);
        } else buf += hit.name;
        i += hit.name.length;
      } else {
        buf += p[i];
        i++;
      }
    }
    if (buf) segs.push({ text: buf });
    return segs;
  });
}

const textOf = (w: Work) => [...(w.review ?? []), ...(w.body ?? [])];

/**
 * 「互相提到 N 处」 on 我: the links your own words really make — a name of another work or person in a 短评,
 * an essay, a note, linked once per page as the page shows it (unlinked ones don't count). Not credits or
 * genres: those are the catalogue, not a mention.
 */
export function countCrossRefs(works: Work[], d: Derived, unlinked: Set<string>): number {
  let n = 0;
  for (const w of works) {
    const paras = textOf(w);
    if (!paras.length) continue;
    for (const p of linkify(paras, d, w.id, unlinked)) for (const s of p) if (s.target) n++;
  }
  return n;
}

/** 「被提到」: text mentions (with ~30 chars of context) + automatic relations, newest first. */
export function mentionsOf(targetId: string, d: Derived, unlinked: Set<string>): Mention[] {
  const target = d.byId.get(targetId);
  const person = d.persons.get(targetId);
  const name = target?.title ?? person?.name;
  if (!name) return [];
  const out: Mention[] = [];
  const seen = new Set<string>();
  for (const w of d.works) {
    if (w.id === targetId || unlinked.has(`${w.id}>${targetId}`)) continue;
    const paras = textOf(w);
    for (const p of paras) {
      const at = p.indexOf(name);
      if (at < 0) continue;
      const lw = d.linkables.find((l) => l.target === targetId);
      if (!lw) break;
      out.push({
        from: w, date: w.finished,
        before: (at > 30 ? '……' : '') + p.slice(Math.max(0, at - 30), at),
        word: name,
        after: p.slice(at + name.length, at + name.length + 30) + (at + name.length + 30 < p.length ? '……' : ''),
      });
      seen.add(w.id);
      break;
    }
  }
  if (target) {
    const authors = target.credits.filter((c) => c.core).map((c) => personId(c.name));
    for (const w of d.works) {
      if (w.id === targetId || seen.has(w.id) || w.kind === 'essay') continue;
      if (w.credits.some((c) => c.core && authors.includes(personId(c.name)))) {
        out.push({ from: w, relation: target.kind === 'book' ? '作品 · 同一作者' : '作品 · 同一创作者', date: w.finished });
        seen.add(w.id);
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ---------- formatting ---------- */

const CN_MONTH = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
export const cnMonth = (m: number) => `${CN_MONTH[m - 1]}月`;
const CN_DIGIT = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
export const cnYear = (y: number) => String(y).split('').map((c) => CN_DIGIT[Number(c)]).join('');
export const isLatin = (s: string) => !/[\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/.test(s);
export const fmtNum = (n: number) => n.toLocaleString('en-US');
/* dates come as 'YYYY-MM-DD', 'YYYY-MM', 'YYYY' or '' (时间未知): each formatter says only what is known */
export const fmtYM = (iso: string) => (!iso ? '时间未知' : iso.length < 7 ? `${Number(iso.slice(0, 4))} 年` : `${Number(iso.slice(0, 4))} 年 ${Number(iso.slice(5, 7))} 月`);
export const fmtYMD = (iso: string) => (iso.length < 10 ? fmtYM(iso) : `${Number(iso.slice(0, 4))} 年 ${Number(iso.slice(5, 7))} 月 ${Number(iso.slice(8, 10))} 日`);
export const fmtMD = (iso: string) => (iso.length < 7 ? '' : iso.length < 10 ? `${Number(iso.slice(5, 7))} 月` : `${Number(iso.slice(5, 7))}-${Number(iso.slice(8, 10))}`);
/** a list row's date column: 2024-03 / 约 2021 / 时间未知 */
export const listDate = (w: Work) => (w.finished.length >= 7 ? w.finished.slice(0, 7) : whenOf(w, 'year'));
/** a work's 看完 / 写于, as precise as it is known: 「2024 年 3 月 16 日」「2024 年 3 月」「约 2021 年」「时间未知」 */
export function whenOf(w: Work, style: 'long' | 'ym' | 'year' = 'long'): string {
  const d = w.date;
  const v = w.finished;
  if (!v) return '时间未知';
  const approx = d?.approx ? '约 ' : '';
  if (style === 'year' || v.length < 7) return style === 'year' ? `${approx}${v.slice(0, 4)}` : `${approx}${Number(v.slice(0, 4))} 年`;
  return style === 'ym' ? fmtYM(v) : fmtYMD(v);
}

export const creatorLine = (w: Work) => w.credits.filter((c) => c.core).map((c) => c.name).slice(0, 2).join('、');

/**
 * The date on an entry and in 写几句, as far as it is known.
 * This year with a day: 「10 月 3 日」. This year, month only: 「十月」.
 * An earlier year: 「2024 · 三月」. A year alone: 「约 2021」. Nothing: 「时间未知」.
 */
export type EntryWhen =
  | { kind: 'unknown' }
  | { kind: 'year'; y: number; approx: boolean }
  | { kind: 'past'; y: number; m: number }
  | { kind: 'month'; y: number; m: number }
  | { kind: 'day'; y: number; m: number; d: number };

export function entryWhenParts(w: Pick<Work, 'finished' | 'date'>, year = new Date().getFullYear()): EntryWhen {
  const v = w.finished;
  if (!v) return { kind: 'unknown' };
  const y = Number(v.slice(0, 4));
  if (v.length < 7) return { kind: 'year', y, approx: !!w.date?.approx };
  const m = Number(v.slice(5, 7));
  if (y !== year) return { kind: 'past', y, m };
  if (v.length >= 10) return { kind: 'day', y, m, d: Number(v.slice(8, 10)) };
  return { kind: 'month', y, m };
}

/** 「被提到」 when a row really names this work; 「同一作者」 when every row is only that relation */
export function mentionTitle(list: { word?: string }[]): string {
  return list.length > 0 && list.every((m) => !m.word) ? '同一作者' : '被提到';
}

export function entryWhen(w: Pick<Work, 'finished' | 'date'>, year = new Date().getFullYear()): string {
  const p = entryWhenParts(w, year);
  if (p.kind === 'unknown') return '时间未知';
  if (p.kind === 'year') return `${p.approx ? '约 ' : ''}${p.y}`;
  if (p.kind === 'past') return `${p.y} · ${cnMonth(p.m)}`;
  if (p.kind === 'month') return cnMonth(p.m);
  return `${p.m} 月 ${p.d} 日`;
}
