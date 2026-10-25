/**
 * Works for 偏爱 tests. A default work has a trusted day (level 2, the source said so).
 * Pass `date: undefined` for a work whose year is only a bare finished string.
 */
import { planSync, type BgmCollection } from '../../src/lib/bangumi';
import { resolveDates } from '../../src/data/resolve';
import { computeTaste } from '../../src/data/taste/engine';
import type { PeopleStatus, TastePeriod } from '../../src/data/taste/types';
import type { Credit, EffDate, Work } from '../../src/data/types';
import type { Play } from '../../src/lib/steam';
import reader from '../fixtures/bangumi/reader-done-dates.json';
import readerTags from '../fixtures/bangumi/reader-tags.json';

export const TODAY = '2026-10-23';
export const READY: PeopleStatus = { coverage: 1, covered: 0, total: 0, state: 'ready' };

let seq = 0;

export const by = (name: string, role = '作者'): Credit => ({ name, role, core: true });

export function mk(over: Partial<Work> = {}): Work {
  const id = over.id ?? `t${++seq}`;
  const finished = over.finished ?? '2016-06-15';
  const givenDate = Object.prototype.hasOwnProperty.call(over, 'date');
  let date = over.date;
  if (!givenDate && /^\d{4}-\d{2}/.test(finished)) {
    const precision: EffDate['precision'] = finished.length >= 10 ? 'day' : 'month';
    date = {
      value: finished.slice(0, precision === 'day' ? 10 : 7),
      precision,
      level: 2,
      source: 'douban_marked',
      approx: false,
      locked: false,
    };
  }
  const w: Work = {
    id,
    kind: over.kind ?? 'book',
    title: over.title ?? id,
    credits: over.credits ?? [],
    finished,
    collected: over.collected ?? (finished.length >= 10 ? finished.slice(0, 10) : '2016-06-15'),
    source: over.source ?? 'manual',
    cover: over.cover === undefined ? null : over.cover,
    genres: over.genres ?? [],
    info: over.info ?? [],
  };
  if (over.tags) w.tags = over.tags;
  if (over.myTags) w.myTags = over.myTags;
  if (over.status) w.status = over.status;
  if (over.isSample) w.isSample = over.isSample;
  if (over.play) w.play = over.play;
  if (over.year != null) w.year = over.year;
  if (date) w.date = date;
  return w;
}

/** one trusted work in `year`; `n` moves the day so two works in one year can be ordered */
export function at(year: number, n: number, over: Partial<Work> = {}): Work {
  const day = String((n % 27) + 1).padStart(2, '0');
  const month = String((Math.floor(n / 27) % 12) + 1).padStart(2, '0');
  return mk({ ...over, finished: `${year}-${month}-${day}` });
}

export function fBooks(years: readonly number[], perYear: number, over: Partial<Work> = {}): Work[] {
  const out: Work[] = [];
  years.forEach((year, yi) => {
    for (let i = 0; i < perYear; i++) out.push(at(year, yi * 31 + i, over));
  });
  return out;
}

/** a hand-added work. A full day can join the same-day clump; a bare year cannot. */
export function manualAdd(day: string, over: Partial<Work> = {}): Work {
  const precision: EffDate['precision'] = day.length >= 10 ? 'day' : day.length >= 7 ? 'month' : 'year';
  return mk({
    ...over,
    finished: day,
    source: 'manual',
    date: { value: day, precision, level: 2, source: 'manual_add', approx: false, locked: false },
  });
}

export function played(year: number, appid: number, tags?: string[]): Work {
  const day = `${year}-08-01`;
  const play: Play = { minutes: 90, lastPlayed: day, provider: 'steam', appid };
  return mk({
    kind: 'game',
    ...(tags ? { tags } : null),
    play,
    finished: day,
    date: { value: day, precision: 'day', level: 2, source: 'steam_last_played', approx: false, locked: false },
  });
}

export function tasteOf(
  works: readonly Work[],
  people: PeopleStatus = READY,
  today = TODAY,
  periods: readonly TastePeriod[] = [],
) {
  return computeTaste({ works, periods, today, people });
}

/** 推理 leaves for three recorded years, then comes back. Each of those years has three works. */
export function gapWorks(): Work[] {
  const topic = { tags: ['推理'] };
  return [
    ...fBooks([2008, 2009], 2, topic),
    ...fBooks([2008, 2009], 1),
    ...fBooks([2010, 2011, 2012], 3),
    ...fBooks([2013, 2014], 2, topic),
    ...fBooks([2013, 2014], 1),
  ];
}

const READER_NOW = '2026-10-10T20:00:00+08:00';
let readerCache: Work[] | null = null;

/** the 1019-work reader library, dates resolved the same way as tests/lead.test.ts */
export function readerWorks(): Work[] {
  if (readerCache) return readerCache;
  const tags = new Map((readerTags as { rows: [number, number, string[]][] }).rows.map(([id, , t]) => [id, t]));
  const collection = ([id, type, updated, cn, name, date]: (string | number)[]): BgmCollection => ({
    subject_id: Number(id), subject_type: Number(type), type: 2, rate: 0, comment: null, tags: [], updated_at: String(updated), private: false,
    subject: {
      id: Number(id), type: Number(type), name: String(name), name_cn: String(cn), date: date ? String(date) : null, images: null,
      tags: (tags.get(Number(id)) ?? []).map((name, i) => ({ name, count: 100 - i })),
    },
  });
  readerCache = resolveDates(
    planSync(null, (reader as { rows: (string | number)[][] }).rows.map(collection), { epoch: 1, now: READER_NOW }).pull.done,
    { userClaims: {}, bgmBaseline: null },
  ).map((w) => ({ ...w, cover: { thumb: 'x', medium: 'x', aspect: 0.7 } }));
  return readerCache;
}
