/**
 * 转向 Z1–Z7. A miss is null: nothing vague is written in its place.
 * Z1b is Z1 said as an identity. Z2 comes from a period you already kept.
 * Z7 is the empty stretch, returned to the engine as hollow and never as a row.
 */
import { periodMembers } from '../../me';
import type { Work } from '../../types';
import { byTime, evenPick, type Facts } from '../facts';
import { GATES } from '../gates';
import type { Hit, TastePeriod, TasteWork, WorkKind } from '../types';

const KINDS: readonly WorkKind[] = ['book', 'anime', 'film', 'music', 'game'];
const PLAIN = ['book', 'anime', 'film', 'music'] as const;

const NOUN: Record<WorkKind, string> = {
  book: '书', anime: '番', film: '影视', music: '音乐', game: '游戏',
};
const WHO: Record<WorkKind, string> = {
  book: '读书的人', anime: '看番的人', film: '看片的人', music: '听专辑的人', game: '玩游戏的人',
};
/** "你读的书比看的番多了" — the phrase after 你, and after 比 */
const MORE: Record<Exclude<WorkKind, 'game'>, string> = {
  book: '读的书', anime: '看的番', film: '看的片', music: '听的专辑',
};

export interface TurnCtx {
  periods: readonly TastePeriod[];
  works: readonly Work[];
  today: string;
}

interface Split {
  split: number;
  early: TasteWork[];
  late: TasteWork[];
  topE: WorkKind;
  topL: WorkKind;
  nE: number;
  nL: number;
  /** numerator of the L1 distance between the two kind-share vectors; denominator is nE * nL */
  num: number;
  countsE: Map<WorkKind, number>;
  countsL: Map<WorkKind, number>;
}

function atLeast(n: number, total: number, numer: number, denom: number): boolean {
  return total > 0 && n * denom >= total * numer;
}

function below(n: number, total: number, numer: number, denom: number): boolean {
  return total > 0 && n * denom < total * numer;
}

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.floor((n * 100) / total);
}

function yearsOf(ws: readonly TasteWork[]): number[] {
  const s = new Set<number>();
  for (const w of ws) if (w.year != null) s.add(w.year);
  return [...s].sort((a, b) => a - b);
}

function kindCounts(ws: readonly TasteWork[]): Map<WorkKind, number> {
  const m = new Map<WorkKind, number>();
  for (const w of ws) m.set(w.kind, (m.get(w.kind) ?? 0) + 1);
  return m;
}

/** the unique kind with the most works, or null when two kinds share the top */
function topKind(counts: Map<WorkKind, number>): { kind: WorkKind; n: number } | null {
  let best: { kind: WorkKind; n: number } | null = null;
  let tie = false;
  for (const kind of KINDS) {
    const n = counts.get(kind) ?? 0;
    if (n <= 0) continue;
    if (!best || n > best.n) { best = { kind, n }; tie = false; }
    else if (n === best.n) tie = true;
  }
  return best && !tie ? best : null;
}

function shareHead(label: string, total: number, counts: Map<WorkKind, number>): string {
  const parts = KINDS
    .map((k) => ({ k, n: counts.get(k) ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || KINDS.indexOf(a.k) - KINDS.indexOf(b.k))
    .map((x) => `${NOUN[x.k]} ${pct(x.n, total)}%`);
  return `${label} ${total} 部：${parts.join('、')}`;
}

/** earliest, middle, latest. Fewer than three come back whole. */
function pick3(ws: readonly TasteWork[]): TasteWork[] {
  const sorted = [...ws].sort(byTime);
  if (sorted.length <= 3) return sorted;
  const mid = sorted[Math.floor((sorted.length - 1) / 2)];
  const seen = new Set<string>();
  const out: TasteWork[] = [];
  for (const w of [sorted[0], mid, sorted[sorted.length - 1]]) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    out.push(w);
  }
  return out;
}

function tvBetter(a: Split, b: Split): boolean {
  const left = a.num * b.nE * b.nL;
  const right = b.num * a.nE * a.nL;
  const diff = Number.isSafeInteger(left) && Number.isSafeInteger(right)
    ? left - right
    : a.num / (a.nE * a.nL) - b.num / (b.nE * b.nL);
  if (diff > 0) return true;
  if (diff < 0) return false;
  if (a.nE !== b.nE || a.nL !== b.nL) {
    const aMin = Math.min(a.nE, a.nL);
    const bMin = Math.min(b.nE, b.nL);
    if (aMin !== bMin) return aMin > bMin;
  }
  return a.split < b.split;
}

/**
 * The split year is the last year of the early side.
 * Games never enter that side, so a game cannot be what the early side was.
 * A last-played year is not when the turn happened, so it settles neither the
 * split nor the late kind. Any other year, games included, can still sit on the late side.
 */
export function bestSplit(f: Facts): Split | null {
  const byYear = new Map<number, TasteWork[]>();
  for (const w of f.works) {
    if (w.year == null || w.trust === 'lastPlayed') continue;
    const bucket = byYear.get(w.year) ?? [];
    bucket.push(w);
    byYear.set(w.year, bucket);
  }
  const ys = [...byYear.keys()].sort((a, b) => a - b);
  let best: Split | null = null;
  for (const s of ys.slice(0, -1)) {
    const early: TasteWork[] = [];
    const late: TasteWork[] = [];
    for (const [y, bucket] of byYear) {
      if (y <= s) {
        for (const w of bucket) if (w.kind !== 'game') early.push(w);
      } else {
        late.push(...bucket);
      }
    }
    if (early.length < GATES.Z.sideMin || late.length < GATES.Z.sideMin) continue;
    if (yearsOf(early).length < GATES.Z.earlySpan || yearsOf(late).length < GATES.Z.lateSpan) continue;
    const countsE = kindCounts(early);
    const countsL = kindCounts(late);
    const topE = topKind(countsE);
    const topL = topKind(countsL);
    if (!topE || !topL || topE.kind === topL.kind) continue;
    if (!atLeast(topE.n, early.length, 9, 20) || !atLeast(topL.n, late.length, 9, 20)) continue;
    if (!below(countsE.get(topL.kind) ?? 0, early.length, 1, 4)) continue;
    let num = 0;
    for (const k of KINDS) {
      const cE = countsE.get(k) ?? 0;
      const cL = countsL.get(k) ?? 0;
      num += Math.abs(cE * late.length - cL * early.length);
    }
    const cand: Split = {
      split: s, early, late, topE: topE.kind, topL: topL.kind,
      nE: early.length, nL: late.length, num, countsE, countsL,
    };
    if (!best || tvBetter(cand, best)) best = cand;
  }
  return best;
}

function splitSlots(s: Split): Record<string, string | number> {
  const eYears = yearsOf(s.early);
  const lYears = yearsOf(s.late);
  return {
    from: eYears[0],
    to: eYears[eYears.length - 1],
    after: lYears[0],
    nounEarly: NOUN[s.topE],
    nounLate: NOUN[s.topL],
    whoEarly: WHO[s.topE],
    whoLate: WHO[s.topL],
    kindEarly: s.topE,
    kindLate: s.topL,
    split: s.split,
  };
}

function splitEvidence(s: Split): { evidence: TasteWork[]; head: string } {
  const earlyTop = s.early.filter((w) => w.kind === s.topE);
  const lateTop = s.late.filter((w) => w.kind === s.topL);
  return {
    evidence: [...pick3(earlyTop), ...pick3(lateTop)],
    head: `${shareHead('分界前', s.early.length, s.countsE)} · ${shareHead('分界后', s.late.length, s.countsL)}`,
  };
}

function Z1(f: Facts): Hit | null {
  const s = bestSplit(f);
  if (!s) return null;
  const { evidence, head } = splitEvidence(s);
  return { slots: splitSlots(s), evidence, variant: 'full', head };
}

function Z1b(f: Facts): Hit | null {
  const s = bestSplit(f);
  if (!s) return null;
  const { evidence, head } = splitEvidence(s);
  return { slots: splitSlots(s), evidence, variant: 'full', head };
}

/** a topic with at least `perSide` works on each side of a Z1 split */
export function topicAcross(f: Facts, split: number): { name: string; works: TasteWork[] } | null {
  let best: { name: string; n: number; works: TasteWork[] } | null = null;
  for (const [name, st] of f.topics) {
    const early = st.works.filter((w) => w.year != null && w.year <= split);
    const late = st.works.filter((w) => w.year != null && w.year > split);
    if (early.length < GATES.H1.perSide || late.length < GATES.H1.perSide) continue;
    const works = [...early, ...late];
    const n = works.length;
    if (!best || n > best.n || (n === best.n && name.localeCompare(best.name, 'zh') < 0)) best = { name, n, works };
  }
  return best ? { name: best.name, works: best.works } : null;
}

function bucketsOf(f: Facts, kind: WorkKind): Map<number, TasteWork[]> {
  const m = new Map<number, TasteWork[]>();
  for (const w of f.works) {
    if (w.kind !== kind || w.year == null || w.trust === 'lastPlayed') continue;
    const bucket = m.get(w.year) ?? [];
    bucket.push(w);
    m.set(w.year, bucket);
  }
  return m;
}

function Z6(f: Facts): Hit | null {
  const maps = new Map<WorkKind, Map<number, TasteWork[]>>();
  for (const k of PLAIN) maps.set(k, bucketsOf(f, k));
  let best: {
    year: number; a: Exclude<WorkKind, 'game'>; b: Exclude<WorkKind, 'game'>;
    aYears: number[]; bYears: number[]; works: number;
  } | null = null;
  for (const a of PLAIN) {
    for (const b of PLAIN) {
      if (a === b) continue;
      const A = maps.get(a)!;
      const B = maps.get(b)!;
      const comparable: number[] = [];
      const years = new Set<number>([...A.keys(), ...B.keys()]);
      for (const y of [...years].sort((x, z) => x - z)) {
        if ((A.get(y)?.length ?? 0) >= GATES.Z6.perYear && (B.get(y)?.length ?? 0) >= GATES.Z6.perYear) comparable.push(y);
      }
      if (!comparable.length) continue;
      let start = comparable.length - 1;
      while (start > 0 && comparable[start] === comparable[start - 1] + 1) start -= 1;
      const run = comparable.slice(start);
      for (let i = GATES.Z6.leadYears; i <= run.length - GATES.Z6.backYears; i++) {
        let bOk = true;
        for (let j = i; j < run.length; j++) {
          if ((B.get(run[j])?.length ?? 0) <= (A.get(run[j])?.length ?? 0)) { bOk = false; break; }
        }
        if (!bOk) continue;
        let aLen = 0;
        for (let j = i - 1; j >= 0; j--) {
          if ((A.get(run[j])?.length ?? 0) > (B.get(run[j])?.length ?? 0)) aLen += 1;
          else break;
        }
        if (aLen < GATES.Z6.leadYears) continue;
        const aYears = run.slice(i - aLen, i);
        const bYears = run.slice(i);
        let works = 0;
        for (const y of [...aYears, ...bYears]) works += (A.get(y)?.length ?? 0) + (B.get(y)?.length ?? 0);
        const cand = { year: bYears[0], a, b, aYears, bYears, works };
        const longer = !best
          || cand.aYears.length + cand.bYears.length > best.aYears.length + best.bYears.length
          || (cand.aYears.length + cand.bYears.length === best.aYears.length + best.bYears.length && (
            cand.works > best.works
            || (cand.works === best.works && (cand.year < best.year
              || (cand.year === best.year && (PLAIN.indexOf(cand.b) < PLAIN.indexOf(best.b)
                || (cand.b === best.b && PLAIN.indexOf(cand.a) < PLAIN.indexOf(best.a))))))
          ));
        if (longer) best = cand;
        break;
      }
    }
  }
  if (!best) return null;
  const A = maps.get(best.a)!;
  const B = maps.get(best.b)!;
  const span = (ys: number[]) => ys.length === 1 ? `${ys[0]}` : `${ys[0]}—${ys[ys.length - 1]}`;
  const head = `${span(best.aYears)} 年${NOUN[best.a]}多于${NOUN[best.b]}；${span(best.bYears)} 年${NOUN[best.b]}多于${NOUN[best.a]}`;
  const take2 = (m: Map<number, TasteWork[]>, ys: number[]) => {
    const all: TasteWork[] = [];
    for (const y of ys) all.push(...(m.get(y) ?? []));
    const sorted = all.sort(byTime);
    if (sorted.length <= 2) return sorted;
    return [sorted[0], sorted[sorted.length - 1]];
  };
  return {
    slots: { year: best.year, late: MORE[best.b], early: MORE[best.a], kindLate: best.b, kindEarly: best.a },
    evidence: [...take2(A, best.aYears), ...take2(B, best.bYears)],
    variant: 'full',
    head,
  };
}

function libraryYears(f: Facts): number[] {
  const s = new Set<number>();
  for (const w of f.works) {
    if (w.kind === 'game' || w.year == null || w.trust === 'lastPlayed') continue;
    s.add(w.year);
  }
  return [...s].sort((a, b) => a - b);
}

function Z4(f: Facts): Hit | null {
  const years = libraryYears(f);
  if (years.length < GATES.Z4.sideYears * 2) return null;
  const index = new Map(years.map((y, i) => [y, i]));
  const packs: { name: string; total: number; works: TasteWork[]; cum: number[] }[] = [];
  for (const [name, st] of f.topics) {
    if (st.works.length < GATES.Z4.minWorks) continue;
    const cum = new Array<number>(years.length).fill(0);
    for (const w of st.works) {
      const i = w.year == null ? undefined : index.get(w.year);
      if (i == null) continue;
      cum[i] += 1;
    }
    for (let i = 1; i < cum.length; i++) cum[i] += cum[i - 1];
    packs.push({ name, total: st.works.length, works: st.works, cum });
  }
  if (packs.length < 2) return null;
  let best: { i: number; a: typeof packs[number]; b: typeof packs[number]; score: number } | null = null;
  for (let i = GATES.Z4.sideYears - 1; i <= years.length - GATES.Z4.sideYears - 1; i++) {
    for (const a of packs) {
      const ea = a.cum[i];
      if (!atLeast(ea, a.total, 17, 20)) continue;
      for (const b of packs) {
        if (a.name === b.name) continue;
        const lb = b.total - b.cum[i];
        if (!atLeast(lb, b.total, 17, 20)) continue;
        const score = ea + lb;
        const earlier = !best || score > best.score
          || (score === best.score && (i < best.i
            || (i === best.i && (a.name.localeCompare(best.a.name, 'zh') < 0
              || (a.name === best.a.name && b.name.localeCompare(best.b.name, 'zh') < 0)))));
        if (earlier) best = { i, a, b, score };
      }
    }
  }
  if (!best) return null;
  const lastA = Math.max(...best.a.works.map((w) => w.year ?? 0));
  const aSorted = [...best.a.works].sort(byTime);
  const bSorted = [...best.b.works].sort(byTime);
  const ea = best.a.cum[best.i];
  const lb = best.b.total - best.b.cum[best.i];
  const head = `『${best.a.name}』分界前 ${pct(ea, best.a.total)}%（${ea} 部）· 『${best.b.name}』分界后 ${pct(lb, best.b.total)}%（${lb} 部）`;
  return {
    slots: { a: best.a.name, b: best.b.name, after: lastA + 1 },
    evidence: [...aSorted.slice(-2), ...bSorted.slice(0, 2)],
    variant: 'full',
    head,
  };
}

function libraryStart(f: Facts): number | null {
  let y: number | null = null;
  for (const w of f.works) {
    if (w.kind === 'game' || w.year == null || w.trust === 'lastPlayed') continue;
    if (y == null || w.year < y) y = w.year;
  }
  return y;
}

function Z3(f: Facts): Hit | null {
  const start = libraryStart(f);
  if (start == null || f.maxYear == null) return null;
  let best: { kind: typeof PLAIN[number]; first: number; full: boolean; works: TasteWork[]; per: Map<number, TasteWork[]> } | null = null;
  for (const kind of PLAIN) {
    const per = bucketsOf(f, kind);
    if (!per.size) continue;
    const first = Math.min(...per.keys());
    if (first - start < GATES.Z3.lateByYears) continue;
    let open = true;
    for (let i = 0; i < GATES.Z3.followYears; i++) {
      if ((per.get(first + i)?.length ?? 0) < GATES.Z3.perYear) open = false;
    }
    if (!open) continue;
    let unbroken = true;
    for (let y = first; y <= f.maxYear; y++) if ((per.get(y)?.length ?? 0) < 1) unbroken = false;
    const works = [...per.values()].flat();
    const cand = { kind, first, full: unbroken, works, per };
    const better = !best
      || Number(cand.full) > Number(best.full)
      || (cand.full === best.full && (cand.works.length > best.works.length
        || (cand.works.length === best.works.length && (cand.first < best.first
          || (cand.first === best.first && PLAIN.indexOf(cand.kind) < PLAIN.indexOf(best.kind))))));
    if (better) best = cand;
  }
  if (!best) return null;
  const sorted = [...best.works].sort(byTime);
  const middle = sorted.slice(1, -1);
  const mid = middle.length <= 3 ? middle : evenPick(middle, 3);
  return {
    slots: { year: best.first, noun: NOUN[best.kind], kind: best.kind },
    evidence: [sorted[0], ...mid, sorted[sorted.length - 1]],
    variant: best.full ? 'full' : 'short',
  };
}

/** year totals for Z5: a last-played year is not a year the record filled up */
function recordYears(f: Facts): Map<number, TasteWork[]> {
  const m = new Map<number, TasteWork[]>();
  for (const w of f.works) {
    if (w.year == null || w.trust === 'lastPlayed') continue;
    const bucket = m.get(w.year) ?? [];
    bucket.push(w);
    m.set(w.year, bucket);
  }
  return m;
}

function Z5(f: Facts): Hit | null {
  const byYear = recordYears(f);
  if (byYear.size < GATES.Z5.minYears) return null;
  const ranked = [...byYear.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  const [year, works] = ranked[0];
  const second = ranked[1][1].length;
  if (works.length < GATES.Z5.minWorks) return null;
  if (works.length * 10 < second * 13) return null;
  const top = topKind(kindCounts(works));
  const named = !!top && atLeast(top.n, works.length, 9, 20);
  const head = named
    ? `${year} 年 ${works.length} 部，${NOUN[top!.kind]} ${pct(top!.n, works.length)}%`
    : `${year} 年 ${works.length} 部`;
  return {
    slots: { year, n: works.length, ...(named ? { noun: NOUN[top!.kind], kind: top!.kind } : null) },
    evidence: works,
    variant: named ? 'full' : 'short',
    head,
  };
}

function monthOf(d: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(d);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { y: Number(m[1]), m: month };
}

function seasonWord(p: TastePeriod): string | null {
  if (!p.to) return null;
  const a = monthOf(p.from);
  const b = monthOf(p.to);
  if (!a || !b || a.y !== b.y || b.m < a.m) return null;
  if (b.m - a.m + 1 > GATES.Z2.shortPeriodMonths) return null;
  const mid = a.m + Math.floor((b.m - a.m) / 2);
  if (mid >= 3 && mid <= 5) return '春天';
  if (mid >= 6 && mid <= 8) return '夏天';
  if (mid >= 9 && mid <= 11) return '秋天';
  return '冬天';
}

function asTaste(w: Work, known: Map<string, TasteWork>): TasteWork {
  const hit = known.get(w.id);
  if (hit) return hit;
  const year = /^\d{4}/.test(w.finished ?? '') ? Number(w.finished.slice(0, 4)) : null;
  const kind: WorkKind = w.kind === 'essay' ? 'book' : w.kind;
  return {
    id: w.id, kind, title: w.title, year: Number.isFinite(year) ? year : null,
    trust: 'source', precision: 'year', finished: w.finished ?? '', made: null,
    topics: [], creators: [], minutes: typeof w.play?.minutes === 'number' ? w.play.minutes : null,
  };
}

function Z2(f: Facts, ctx: TurnCtx): Hit | null {
  let best: { p: TastePeriod; members: Work[] } | null = null;
  let tied = false;
  for (const p of ctx.periods) {
    if (!p.name.trim()) continue;
    const members = periodMembers(p, [...ctx.works], ctx.today);
    if (members.length < GATES.Z2.minMembers) continue;
    if (!best || members.length > best.members.length) { best = { p, members }; tied = false; }
    else if (members.length === best.members.length) tied = true;
  }
  if (!best || tied) return null;
  const counts = new Map<WorkKind, number>();
  for (const w of best.members) {
    if (w.kind === 'essay') continue;
    counts.set(w.kind, (counts.get(w.kind) ?? 0) + 1);
  }
  const top = topKind(counts);
  const noun = top && atLeast(top.n, best.members.length, 7, 10) ? NOUN[top.kind] : '';
  const season = seasonWord(best.p);
  const year = Number(best.p.from.slice(0, 4));
  if (!Number.isFinite(year) || year <= 0) return null;
  const known = new Map(f.works.map((w) => [w.id, w]));
  const evidence = best.members.slice(0, GATES.ev.max).map((w) => asTaste(w, known));
  return {
    slots: { year, n: best.members.length, noun, ...(season ? { season } : null) },
    evidence,
    variant: season ? 'full' : 'noSeason',
    head: `${best.p.name.trim()}：${best.members.length} 部`,
  };
}

/** count * 10 < median, with an even median kept as a sum so the cut stays exact */
function thinnerThanMedian(count: number, sorted: readonly number[]): boolean {
  const n = sorted.length;
  if (n === 0) return false;
  if (n % 2 === 1) return count * 10 < sorted[(n - 1) / 2];
  return count * 20 < sorted[n / 2 - 1] + sorted[n / 2];
}

function Z7(f: Facts): Hit | null {
  const present = [...f.yearCount.values()].filter((n) => n > 0).sort((a, b) => a - b);
  if (present.length < 2) return null;
  const years = [...f.yearCount.keys()].sort((a, b) => a - b);
  const min = years[0];
  const max = years[years.length - 1];
  let best: { from: number; to: number; len: number } | null = null;
  let runFrom: number | null = null;
  const consider = (from: number, to: number) => {
    const len = to - from + 1;
    if (len < GATES.Z7.gapYears) return best;
    if (!best || len > best.len || (len === best.len && from < best.from)) return { from, to, len };
    return best;
  };
  for (let y = min; y <= max; y++) {
    const n = f.yearCount.get(y) ?? 0;
    if (thinnerThanMedian(n, present)) {
      if (runFrom == null) runFrom = y;
    } else if (runFrom != null) {
      best = consider(runFrom, y - 1);
      runFrom = null;
    }
  }
  if (runFrom != null) best = consider(runFrom, max);
  if (!best) return null;
  const from = best.from;
  const to = best.to;
  const works = f.works.filter((w) => w.year != null && w.trust !== 'lastPlayed' && w.year >= from && w.year <= to);
  return { slots: { from, to }, evidence: works, variant: 'full' };
}

export const turnCalc = {
  Z1, Z1b, Z2, Z3, Z4, Z5, Z6, Z7,
};
