/**
 * The 「我」 page's first draft, offered one card at a time (CONCEPT v1 §5): a name, 最爱, interests, periods.
 * Local, deterministic and explainable: every suggestion says what it is based on (`evidence`), comes only
 * from what is already on the device (Bangumi's tags and your marks, ratings and short reviews — no request),
 * and has a key; a key answered 「不是」 (or taken) is never offered again.
 */
import type { Kind, Work } from './types';
import { GENRE_WORDS } from '../lib/bangumi';
import { coreNames, interestMembers, isMetaTag, periodMembers, spanText, tagsOf, type Favorite, type Interest, type MeData, type Period } from './me';

export interface FavPick { id: string; why?: string; /** where the why came from: your note here, or a short review on Bangumi */ whyFrom?: 'yours' | 'bangumi' }

export type Suggestion =
  | { type: 'name'; key: 'name'; question: string }
  | { type: 'fav'; key: 'fav'; question: string; evidence: string; picks: FavPick[]; pool: FavPick[] }
  | { type: 'interest'; key: string; question: string; evidence: string; name: string; rule: Interest['rule']; members: Work[]; score: number }
  | { type: 'period'; key: string; question: string; evidence: string; name: string; from: string; to: string; members: Work[]; score: number };

const VERB: Partial<Record<Kind, string>> = { book: '读', game: '玩', music: '听' };
/** the verb most of these works take: 读 / 玩 / 听, else 看 */
export function verbOf(ws: Work[]): string {
  const n = new Map<string, number>();
  for (const w of ws) { const v = VERB[w.kind] ?? '看'; n.set(v, (n.get(v) ?? 0) + 1); }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '看';
}
const yearOf = (w: Work) => Number(w.finished.slice(0, 4));
const titled = (w: Work) => `《${w.title}》`;

/** your one line on a work: the first sentence of what you wrote here, else your short review on Bangumi */
export function whyFor(w: Work): { why?: string; whyFrom?: FavPick['whyFrom'] } {
  const first = (t: string) => {
    const s = t.replace(/\s+/g, ' ').trim();
    const cut = s.search(/[。\uFF01？!?\n]/);
    const one = cut > 0 ? s.slice(0, cut + 1) : s;
    return [...one].length > 40 ? `${[...one].slice(0, 39).join('')}…` : one;
  };
  // the source's review is not yours when it came with the work (a catalogue's text): only a note counts
  const mine = w.review?.find((p) => p.trim());
  if (mine && w.source !== 'bangumi') return { why: first(mine), whyFrom: 'yours' };
  if (w.srcComment?.trim()) return { why: first(w.srcComment), whyFrom: 'bangumi' };
  if (mine) return { why: first(mine), whyFrom: 'yours' };
  return {};
}

/* ---------- 最爱 ---------- */

/** the strongest signs that you loved it: a 9 or 10, then your own words on it, then an 8 */
export function favCandidates(works: Work[]): FavPick[] {
  const scored = works.filter((w) => w.kind !== 'essay' && w.cover).map((w) => {
    const r = w.rating10 ?? 0;
    const words = !!(w.srcComment?.trim() || w.review?.length || w.quotes?.length);
    const score = (r >= 9 ? 100 + r * 4 : r >= 8 ? 40 : 0) + (words ? 30 : 0) + (r > 0 && r < 6 ? -200 : 0);
    return { w, score };
  }).filter((x) => x.score >= 40);
  scored.sort((a, b) => b.score - a.score || (a.w.finished < b.w.finished ? 1 : a.w.finished > b.w.finished ? -1 : a.w.id.localeCompare(b.w.id)));
  return scored.map(({ w }) => ({ id: w.id, ...whyFor(w) }));
}

/* ---------- interests ---------- */

interface Cluster { key: string; name: string; rule: Interest['rule']; members: Work[]; score: number; person: boolean }

/** 伊藤润二 / 伊藤潤二: the same length, at least half the characters the same, in place */
const sameWord = (a: string, b: string) => { const x = [...a], y = [...b]; return x.length === y.length && x.length >= 2 && x.filter((ch, i) => y[i] === ch).length * 2 >= x.length; };
const jaccard = (a: Set<string>, b: Set<string>) => {
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i || 1);
};

export function interestClusters(works: Work[], have: Interest[] = []): Cluster[] {
  const ws = works.filter((w) => w.kind !== 'essay');
  const N = ws.length;
  if (N < 12) return [];
  const minN = Math.max(6, Math.ceil(N * 0.015));
  const byTag = new Map<string, Work[]>();
  for (const w of ws) for (const t of tagsOf(w)) if (!isMetaTag(t)) byTag.set(t, [...(byTag.get(t) ?? []), w]);
  const byPerson = new Map<string, Work[]>();
  for (const w of ws) for (const n of coreNames(w)) byPerson.set(n, [...(byPerson.get(n) ?? []), w]);
  const years = (m: Work[]) => new Set(m.filter((w) => w.finished).map(yearOf)).size;
  const cands: Cluster[] = [];
  for (const [t, m] of byTag) {
    if (m.length < minN || m.length > N * 0.5 || years(m) < 3) continue;
    // a series' own name (most of its works are titled with it) is a series, not an interest
    if (m.filter((w) => w.title.includes(t)).length >= m.length * 0.5) continue;
    cands.push({ key: `int:t:${t}`, name: t, rule: { tags: [t] }, members: m, score: m.length * Math.log2(1 + years(m)), person: false });
  }
  for (const [n, m] of byPerson) {
    if (m.length < 4 || years(m) < 2) continue;
    cands.push({ key: `int:p:${n}`, name: n, rule: { people: [n] }, members: m, score: m.length * Math.log2(1 + years(m)) * 1.2, person: true });
  }
  cands.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  // the same thing under two names (伊藤润二 / 伊藤潤二, a tag and its creator) is one interest, under the bigger name
  const taken: { ids: Set<string>; c: Cluster }[] = have.map((i) => ({ ids: new Set(interestMembers(i, ws).map((w) => w.id)), c: { key: i.key ?? i.id, name: i.name, rule: i.rule, members: [], score: Infinity, person: false } }));
  const out: Cluster[] = [];
  for (const c of cands) {
    const ids = new Set(c.members.map((w) => w.id));
    const twin = taken.find((t) => jaccard(t.ids, ids) >= 0.5 || t.c.name === c.name);
    if (twin) {
      const j = jaccard(twin.ids, ids);
      const mine = twin.c.score === Infinity;
      // two spellings of one thing (伊藤润二 / 伊藤潤二): the second folds into the first, so its works come along
      if (!mine && !c.person && !twin.c.person && twin.c.rule.tags && (j >= 0.75 || twin.c.rule.tags.some((t) => sameWord(t, c.name)))) twin.c.rule = { ...twin.c.rule, tags: [...twin.c.rule.tags, c.name] };
      // a plain genre that is really one creator's or one series' (惊悚 that is mostly 伊藤润二): the specific name wins
      else if (!mine && !c.person && !twin.c.person && GENRE_WORDS.includes(twin.c.name) && !GENRE_WORDS.includes(c.name) && c.members.length >= twin.c.members.length * 0.6) {
        twin.c.name = c.name; twin.c.key = c.key; twin.c.rule = { tags: [c.name] }; twin.c.members = c.members; twin.ids = ids;
      }
      continue;
    }
    taken.push({ ids, c });
    out.push(c);
  }
  return out.map((c) => ({ ...c, members: interestMembers({ rule: c.rule, include: [], exclude: [] }, ws) }));
}

/* ---------- periods ---------- */

const SEASON = (m: number) => (m >= 3 && m <= 5 ? '春天' : m >= 6 && m <= 8 ? '夏天' : m >= 9 && m <= 11 ? '秋天' : '冬天');
const monthKey = (d: string) => d.slice(0, 7);
const addMonth = (ym: string, k: number) => {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + k;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12 + 1;
  return `${yy}-${String(mm).padStart(2, '0')}`;
};

export interface Burst { from: string; to: string; members: Work[]; tag?: string; name: string; days: number; year: number; season: string }

/**
 * Stretches when you took in much more than usual: months well above your usual month, joined when
 * next to each other (at most four), each day counting at most four works (a day of marking a back
 * catalogue is not a burst). Named for its season, and for what most of it was, when one thing was.
 */
export function bursts(works: Work[], today: string): Burst[] {
  const ws = works.filter((w) => w.kind !== 'essay' && w.finished.length >= 7 && (w.date ? w.date.level <= 2 && !w.date.approx : true));
  const perDay = new Map<string, number>();
  const month = new Map<string, number>();
  for (const w of ws) {
    const d = w.finished.slice(0, 10);
    const n = (perDay.get(d) ?? 0) + 1;
    perDay.set(d, n);
    if (n <= 4) month.set(monthKey(d), (month.get(monthKey(d)) ?? 0) + 1);
  }
  const counts = [...month.values()].sort((a, b) => a - b);
  if (counts.length < 6) return [];
  const median = counts[Math.floor(counts.length / 2)];
  const hotAt = Math.max(6, Math.ceil(median * 2.5));
  const hot = [...month.entries()].filter(([, n]) => n >= hotAt).map(([m]) => m).sort();
  const windows: string[][] = [];
  for (const m of hot) {
    const last = windows[windows.length - 1];
    if (last && addMonth(last[last.length - 1], 1) === m && last.length < 4) last.push(m); else windows.push([m]);
  }
  const seen = new Set<string>();
  const out: Burst[] = [];
  for (const win of windows) {
    const from = win[0], to = win[win.length - 1];
    const members = periodMembers({ from, to, include: [], exclude: [] }, ws, today);
    const days = new Set(members.map((w) => w.finished.slice(0, 10))).size;
    if (members.length < 8 || days < 4) continue;
    const tc = new Map<string, number>();
    for (const w of members) for (const t of tagsOf(w)) if (!isMetaTag(t)) tc.set(t, (tc.get(t) ?? 0) + 1);
    const top = [...tc.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const tag = top && top[1] >= Math.max(4, members.length * 0.35) ? top[0] : undefined;
    const mid = Number(win[Math.floor((win.length - 1) / 2)].slice(5, 7));
    const year = Number(from.slice(0, 4));
    const season = SEASON(mid);
    let name = tag ? `${tag}那个${season}` : `${year} 年${season}`;
    if (seen.has(name)) name = tag ? `${year} 年，${tag}那个${season}` : `${year} 年${season}，又一段`;
    seen.add(name);
    out.push({ from, to, members, tag, name, days, year, season });
  }
  return out.sort((a, b) => b.members.length - a.members.length || a.from.localeCompare(b.from));
}

/* ---------- all of it, in the order it is asked ---------- */

const overlaps = (a: { from: string; to: string | null }, b: { from: string; to: string | null }, today: string) =>
  a.from <= `${b.to ?? today}\uffff` && b.from <= `${a.to ?? today}\uffff`;

/** enough for a page: past these, nothing more is offered (you can still add your own) */
export const INTERESTS_MAX = 6;
export const PERIODS_MAX = 6;

export function suggestions(works: Work[], ctx: { title?: string; me: MeData; today: string }): Suggestion[] {
  const { me, today } = ctx;
  const no = new Set(me.dismissed);
  const own = works.filter((w) => !w.isSample);
  const out: Suggestion[] = [];
  if (!own.length) return out;
  if (!ctx.title?.trim() && !no.has('name')) out.push({ type: 'name', key: 'name', question: '怎么称呼你？' });

  if (!me.favorites.length && !no.has('fav')) {
    const c = favCandidates(own);
    if (c.length >= 3) {
      const rated = own.filter((w) => (w.rating10 ?? 0) >= 9).length;
      out.push({
        type: 'fav', key: 'fav', question: '这几部像是你最喜欢的，放进最爱吗？',
        evidence: rated ? `你打过 9 分以上的有 ${rated} 部；先挑了这几部` : '按你写过几句的挑了这几部',
        picks: c.slice(0, 6), pool: c.slice(0, 15),
      });
    }
  }

  const ints: Suggestion[] = interestClusters(own, me.interests).filter((c) => !no.has(c.key)).slice(0, Math.max(0, INTERESTS_MAX - me.interests.length)).map((c) => {
    const dated = c.members.filter((w) => w.finished);
    const since = dated.length ? Math.min(...dated.map(yearOf)) : null;
    const latest = dated[0];
    const verb = verbOf(c.members);
    const recent = latest && yearOf(latest) >= Number(today.slice(0, 4)) - 3;
    const question = c.person
      ? `你好像一直在${verb}${c.name}的作品，收成一个兴趣吗？`
      : !recent ? `有好些年你一直在${verb}${c.name}，收成一个兴趣吗？`
      // since 2008 and still at it is not 「这几年」
        : since && since <= Number(today.slice(0, 4)) - 8 ? `这些年你一直在${verb}${c.name}，收成一个兴趣吗？`
          : `这几年你好像一直在${verb}${c.name}，收成一个兴趣吗？`;
    const evidence = [since ? `${since} 年起` : '', `${c.members.length} 部`, latest ? `最近一部是${titled(latest)}` : ''].filter(Boolean).join(' · ');
    return { type: 'interest', key: c.key, question, evidence, name: c.name, rule: c.rule, members: c.members, score: c.score };
  });

  const pers: Suggestion[] = bursts(own, today)
    .filter((b) => !no.has(`per:${b.from}`) && !me.periods.some((p) => overlaps(p, b, today)))
    .slice(0, Math.max(0, Math.min(4, PERIODS_MAX - me.periods.length))).map((b) => {
      const verb = verbOf(b.members);
      // the same year and season the name is made of: the card never says 春天 for what it will call 冬天
      const what = b.tag ? `${b.members.length} 部，多是${b.tag}` : `${b.members.length} 部`;
      const first = b.members[0], last = b.members[b.members.length - 1];
      return {
        type: 'period', key: `per:${b.from}`, name: b.name, from: b.from, to: b.to, members: b.members,
        question: `${b.year} 年${b.season}，你一口气${verb}了 ${what}。把这段日子收成一个时期吗？`,
        evidence: `${spanText({ from: b.from, to: b.to })} · 从${titled(first)}到${titled(last)}`,
        score: b.members.length * 3,
      };
    });

  // interests and periods take turns, the strongest of each first; whichever you have fewer of goes first
  const periodFirst = me.periods.length < me.interests.length;
  for (let i = 0; i < Math.max(ints.length, pers.length); i++) {
    const [a, b] = periodFirst ? [pers[i], ints[i]] : [ints[i], pers[i]];
    if (a) out.push(a);
    if (b) out.push(b);
  }
  return out;
}

/** what 「是」 adds, as the store takes it */
export const asInterest = (s: Extract<Suggestion, { type: 'interest' }>, edit?: { name?: string; exclude?: string[] }): Omit<Interest, 'id' | 'createdAt'> =>
  ({ name: edit?.name?.trim() || s.name, rule: s.rule, include: [], exclude: edit?.exclude ?? [], key: s.key });
export const asPeriod = (s: Extract<Suggestion, { type: 'period' }>, edit?: { name?: string; exclude?: string[] }): Omit<Period, 'id' | 'createdAt'> =>
  ({ name: edit?.name?.trim() || s.name, from: s.from, to: s.to, include: [], exclude: edit?.exclude ?? [], key: s.key });
export const asFavorites = (picks: FavPick[]): Pick<Favorite, 'id' | 'why'>[] => picks.map((p) => ({ id: p.id, ...(p.why && p.whyFrom === 'yours' ? { why: p.why } : null) }));
