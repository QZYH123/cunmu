/**
 * Date resolution — PRODUCT-PLAN v0.5 §4.7 / TECH-PLAN v0.2 §4.1.3 (resolveDate), as a pure function.
 *
 *   level 1  yours: a user claim (picked in the date sheet, 「不记得了」 included), the day you added it
 *            by hand, the day you wrote an essay — locked: no sync or import moves it
 *   level 2  the source says so: WeRead's finish date, a 豆瓣 mark date, Bangumi's updated_at (for a
 *            看过 nobody edited since, that is when it was marked — DECISIONS-r2 #20, overriding #3),
 *            a Bangumi mark first seen by a later sync
 *   level 3  inferred: a year only, shown 「约」 (a first-seen mark after a long gap)
 *   level 4  时间未知
 *
 * A pile-up (one source, one day, ≥ CLUMP_MIN works and ≥ CLUMP_RATIO of that source) is demoted a level:
 * a level-2 day keeps only its year 「约」, a level-3 year becomes 时间未知. Bangumi's updated_at pile-up is
 * a batch marked in one go, so it says nothing about when: 时间未知. Never applies to level 1.
 */
import type { DateClaim, DateSource, EffDate, Work } from './types';

export const CLUMP_MIN = 15;
export const CLUMP_RATIO = 0.05;
const CLUMPABLE = new Set<DateSource>(['douban_marked', 'bgm_first_seen', 'bgm_updated_at']);
const MINE = new Set<DateSource>(['user', 'manual_add', 'essay_written']);

export interface ResolveCtx {
  /** the user's own claims (date_claims where source = 'user'), by work id */
  userClaims: Record<string, DateClaim>;
  /** Bangumi's baseline_done_at for the current epoch; null = not connected */
  bgmBaseline: string | null;
}

/**
 * Bangumi's one claim for a demo-catalogue work: its updated_at, the day (level 2). A real pull
 * (lib/bangumi.ts planSync) writes its claims onto the work itself; then this adds none.
 */
export function bangumiClaim(w: Work, baseline: string | null): DateClaim | null {
  if (!w.bgmUpdatedAt || !baseline) return null;
  if (w.claims?.some((c) => c.source === 'bgm_first_seen' || c.source === 'bgm_updated_at')) return null;
  return { source: 'bgm_updated_at', value: w.bgmUpdatedAt, precision: 'day', baseLevel: 2, observedAt: baseline };
}

/**
 * Libraries pulled before updated_at counted as the mark day read the same, with no network: the first
 * import stored updated_at's day as a level-3 claim (shown as a year 「约」); it is a level-2 day now.
 * A later sync's first-seen guess stays — the stored updated_at may be from before that sync's window.
 */
export function upgradeBangumiClaim(c: DateClaim): DateClaim {
  return c.source === 'bgm_updated_at' && c.precision === 'day' && c.baseLevel === 3 ? { ...c, baseLevel: 2 } : c;
}

const UNKNOWN: EffDate = { value: null, precision: 'unknown', level: 4, source: null, approx: false, locked: false };
const lowerBound = (v: string) => (v + '-01-01').slice(0, 10);

/** every claim on a work, the user's last (it wins anyway) */
export function claimsOf(w: Work, ctx: ResolveCtx): DateClaim[] {
  const out = (w.claims ?? []).map(upgradeBangumiClaim);
  const b = bangumiClaim(w, ctx.bgmBaseline);
  if (b) out.push(b);
  const u = ctx.userClaims[w.id];
  if (u) out.push(u);
  return out;
}

/** resolve every work's date; returns new objects with `date` and `finished` (= the value, '' when unknown) */
export function resolveDates(works: Work[], ctx: ResolveCtx): Work[] {
  const all = works.map((w) => claimsOf(w, ctx));
  // pile-ups, counted per source over this library
  const perDay = new Map<string, number>();
  const perSource = new Map<DateSource, number>();
  for (const cs of all) for (const c of cs) {
    if (!CLUMPABLE.has(c.source) || !c.value) continue;
    perSource.set(c.source, (perSource.get(c.source) ?? 0) + 1);
    const k = `${c.source}|${c.value.slice(0, 10)}`;
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const isClump = (c: DateClaim) => {
    if (!CLUMPABLE.has(c.source) || !c.value) return false;
    const n = perDay.get(`${c.source}|${c.value.slice(0, 10)}`) ?? 0;
    return n >= CLUMP_MIN && n >= CLUMP_RATIO * (perSource.get(c.source) ?? 0);
  };
  return works.map((w, i) => {
    const date = pick(all[i], isClump);
    return { ...w, date, finished: date.value ?? '' };
  });
}

function pick(claims: DateClaim[], isClump: (c: DateClaim) => boolean): EffDate {
  // yours decides: the user's claim over the day you added it / wrote it
  const mine = claims.filter((c) => MINE.has(c.source));
  if (mine.length) {
    const c = mine.find((x) => x.source === 'user') ?? mine[0];
    if (!c.value) return { ...UNKNOWN, source: c.source, locked: true };
    return { value: c.value, precision: c.precision, level: 1, source: c.source, approx: !!c.approx && c.precision === 'year', locked: true };
  }
  let best: EffDate | null = null;
  for (const c of claims) {
    if (!c.value) continue;
    const level = (isClump(c) ? (c.source === 'bgm_updated_at' ? 4 : Math.min(4, c.baseLevel + 1)) : c.baseLevel) as EffDate['level'];
    if (level === 4) continue;
    const e: EffDate = level === 3 || c.precision === 'year'
      ? { value: c.value.slice(0, 4), precision: 'year', level, source: c.source, approx: level === 3 || !!c.approx, locked: false }
      : { value: c.value, precision: c.precision, level, source: c.source, approx: false, locked: false };
    if (!best || e.level < best.level || (e.level === best.level && lowerBound(e.value!) < lowerBound(best.value!))) best = e;
  }
  return best ?? UNKNOWN;
}

/**
 * Wall order (sort_key): newest first; within a year, dated works before the year-only ones (which keep
 * Bangumi's raw time as a hint for their own order); 时间未知 last, newest-collected first.
 */
export function sortKey(w: Work): string {
  const d = w.date;
  if (!d || d.level === 4 || !d.value) return '';
  if (d.precision === 'year') return `${d.value}-00-${(w.bgmUpdatedAt ?? '').slice(5, 10) || '00-00'}`;
  return d.value.length === 7 ? `${d.value}-00` : d.value;
}
export function sortWorks(ws: Work[]): Work[] {
  const keyed = ws.map((w) => ({ w, k: sortKey(w) }));
  keyed.sort((a, b) => {
    if (!a.k !== !b.k) return a.k ? -1 : 1;
    if (!a.k) return a.w.collected < b.w.collected ? 1 : a.w.collected > b.w.collected ? -1 : a.w.id < b.w.id ? -1 : 1;
    return a.k < b.k ? 1 : a.k > b.k ? -1 : a.w.id < b.w.id ? -1 : 1;
  });
  return keyed.map((x) => x.w);
}

export const isUnknown = (w: Work) => !w.date || w.date.level === 4;

const DAY_MS = 86400000;
/**
 * The claim a later sync writes for a Bangumi mark it sees for the first time (§4.1.3, decided):
 * gap to the previous good sync ≤ 31 days → that day; ≤ 365 → the month at the interval's midpoint;
 * longer → only the year, 「约」.
 */
export function firstSeenClaim(seenAt: string, prevSyncAt: string | undefined): DateClaim {
  const day = seenAt.slice(0, 10);
  const gap = prevSyncAt ? (Date.parse(day) - Date.parse(prevSyncAt.slice(0, 10))) / DAY_MS : 0;
  if (gap <= 31) return { source: 'bgm_first_seen', value: day, precision: 'day', baseLevel: 2, observedAt: seenAt };
  if (gap <= 365) {
    const mid = new Date((Date.parse(day) + Date.parse(prevSyncAt!.slice(0, 10))) / 2).toISOString().slice(0, 7);
    return { source: 'bgm_first_seen', value: mid, precision: 'month', baseLevel: 2, observedAt: seenAt };
  }
  return { source: 'bgm_updated_at', value: day.slice(0, 4), precision: 'year', baseLevel: 3, approx: true, observedAt: seenAt };
}
