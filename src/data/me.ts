/**
 * The 「我」 page's own data (CONCEPT v1 「以你为主角」): the profile, 最爱, interests, periods, what is
 * 只给自己, and which suggestions were turned down. Pure: no React, no storage (persist.ts keeps it, store.tsx
 * changes it, tests/me.test.ts checks it).
 */
import { EMPTY_CARD, EMPTY_TASTE, fixCard, fixTaste, type CardPrefs, type TastePrefs } from './taste/prefs';
import type { Work } from './types';

/** what you say about yourself (the name is PersistedV2.title, as before) */
export interface Profile {
  /** the line under the name; empty = an automatic one */
  line?: string;
  /** your rewrite of the lead paragraph; empty = the one written from the records */
  lead?: string;
  /** the frontispiece cover's work id; empty = the first 最爱 */
  frontispiece?: string;
}

/** a work in 最爱, in your order, with your one line on why */
export interface Favorite { id: string; why?: string; at: string }

/** which works an interest gathers: any of these tags (Bangumi's and yours), or any of these core creators */
export interface InterestRule { tags?: string[]; people?: string[] }
export interface Interest {
  id: string;
  name: string;
  /** one line of yours */
  blurb?: string;
  /** your rewrite of its paragraph */
  lead?: string;
  rule: InterestRule;
  /** put in by hand / taken out by hand: they win over the rule */
  include: string[];
  exclude: string[];
  createdAt: string;
  /** the suggestion it came from (so it is never offered again) */
  key?: string;
}

/** a named stretch of time; members are the works dated inside it */
export interface Period {
  id: string;
  name: string;
  /** 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD' */
  from: string;
  /** same; null = still going */
  to: string | null;
  /** a line set under the name */
  epigraph?: string;
  lead?: string;
  include: string[];
  exclude: string[];
  createdAt: string;
  key?: string;
}

export interface MeData {
  profile: Profile;
  favorites: Favorite[];
  interests: Interest[];
  periods: Period[];
  /** ids (essays, works) marked 只给自己: never in 给人看 or the long image */
  onlyMe: string[];
  /** suggestion keys answered 「不是」 (or taken): never asked again */
  dismissed: string[];
  /** 偏爱: the switch, and per-row off / swap / your own sentence */
  taste: TastePrefs;
  /** card choices: arrangement, colours, byline, total, corner mark */
  card: CardPrefs;
}
export const EMPTY_ME: MeData = { profile: {}, favorites: [], interests: [], periods: [], onlyMe: [], dismissed: [], taste: EMPTY_TASTE, card: EMPTY_CARD };
export const FAV_MAX = 9;

/** an older save (or a hand-edited one): every field there, of the right shape — pure, idempotent */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fixMe(m: any): MeData {
  const arr = <T>(v: unknown, ok: (x: any) => boolean): T[] => (Array.isArray(v) ? v.filter(ok) as T[] : []); // eslint-disable-line @typescript-eslint/no-explicit-any
  const str = (v: unknown) => typeof v === 'string';
  const ids = (v: unknown) => arr<string>(v, str);
  const p = m?.profile && typeof m.profile === 'object' ? m.profile : {};
  return {
    profile: {
      ...(str(p.line) && p.line.trim() ? { line: p.line } : null),
      ...(str(p.lead) && p.lead.trim() ? { lead: p.lead } : null),
      ...(str(p.frontispiece) && p.frontispiece.trim() ? { frontispiece: p.frontispiece } : null),
    },
    favorites: dedupe(arr<Favorite>(m?.favorites, (f) => f && str(f.id))).slice(0, FAV_MAX),
    interests: arr<Interest>(m?.interests, (i) => i && str(i.id) && str(i.name)).map((i) => ({ ...i, rule: i.rule ?? {}, include: ids(i.include), exclude: ids(i.exclude) })),
    periods: arr<Period>(m?.periods, (x) => x && str(x.id) && str(x.name) && str(x.from)).map((x) => ({ ...x, to: str(x.to) ? x.to : null, include: ids(x.include), exclude: ids(x.exclude) })),
    onlyMe: [...new Set(ids(m?.onlyMe))],
    dismissed: [...new Set(ids(m?.dismissed))],
    taste: fixTaste(m?.taste),
    card: fixCard(m?.card),
  };
}
const dedupe = (fs: Favorite[]) => { const seen = new Set<string>(); return fs.filter((f) => !seen.has(f.id) && !!seen.add(f.id)); };

/* ---------- what belongs where ---------- */

/** a tag that says what the thing is, not what it is about (never an interest by itself) */
export const META_TAGS = new Set(['剧情', 'ドラマ', '剧情片', 'drama', 'Drama', '漫画', '小说', '轻小说', 'TV', 'OVA', 'OAD', 'WEB', '剧场版', '电影', '动画', '日本', '日本动画', '日剧', '美剧', '国产',
  '中国', '美国', '原创', '漫改', '小说改', '游戏改', '轻改', '漫画改', '单行本', '连载', '完结', '未完结', '短篇', '长篇', '日漫', '国漫', '漫画系列',
  '画集', '设定集', '同人', '书籍', '文库', '系列', 'PC', 'PS4', 'PS5', 'NS', 'Switch', 'Xbox', 'iOS', 'Android', 'STEAM', 'Steam', 'galgame', 'GAL',
  '游戏', '音乐', 'OST', 'ED', 'OP', '专辑', '单曲', '有生之年', '神作', '经典', '补完', '想看', '看过', '在看', '已购', '个人收藏', '未分类',
  '欧美', '美国', '英国', '韩国', '日剧', '美剧', '英剧', '韩剧', '国剧', '电视剧', '动画电影', '短片', '手游', '童年', 'anime', 'TVA', '网络剧',
  '三次元', '纪录', '演唱会', 'single', 'album', 'コミックス', '集英社', '講談社', '讲谈社', '小学館', '小学馆', '角川', 'KADOKAWA', '白泉社', '秋田書店', '双叶社', '新潮社', '文藝春秋', '早川書房', '東京創元社', '光文社', 'PS3', 'PS2', 'PSP', 'PSV', 'NDS', '3DS', 'GBA', 'Wii', 'WiiU', 'Mac', '主机', '掌机', '已完结', '续作', '动态漫画']);
/** a year, a season or a count-like tag */
export const isMetaTag = (t: string) => META_TAGS.has(t) || /^[A-Z0-9]{2,5}$/.test(t) || /^(19|20)\d{2}(年.*)?$/.test(t) || /^\d{4}年\d{1,2}月$/.test(t) || /^\d+$/.test(t) || t.length > 12;

/** the tags a work carries: Bangumi's (most-used first), yours on Bangumi, then its genres */
export const tagsOf = (w: Pick<Work, 'genres'> & { tags?: string[]; myTags?: string[] }) =>
  [...new Set([...(w.myTags ?? []), ...(w.tags ?? []), ...w.genres].filter(Boolean))];
export const coreNames = (w: Pick<Work, 'credits'>) => w.credits.filter((c) => c.core).map((c) => c.name);

const newestFirst = (a: Work, b: Work) => (a.finished === b.finished ? a.id.localeCompare(b.id) : a.finished < b.finished ? 1 : -1);

/** an interest's works, newest first: the rule's, plus those put in, minus those taken out (never essays) */
export function interestMembers(i: Pick<Interest, 'rule' | 'include' | 'exclude'>, works: Work[]): Work[] {
  const tags = new Set(i.rule.tags ?? []);
  const people = new Set(i.rule.people ?? []);
  const inc = new Set(i.include), exc = new Set(i.exclude);
  return works.filter((w) => w.kind !== 'essay' && !exc.has(w.id) && (inc.has(w.id)
    || (tags.size > 0 && tagsOf(w).some((t) => tags.has(t)))
    || (people.size > 0 && coreNames(w).some((n) => people.has(n))))).sort(newestFirst);
}

/** an interest's name and its one line, at most (the same limits as the sheet that changes them) */
export const INTEREST_NAME_MAX = 24;
export const INTEREST_LINE_MAX = 80;

/** an interest you start yourself: a name, a line if you wrote one, the works you picked. No rule: nothing
 *  joins it by itself, only what you put in */
export function ownInterest(name: string, blurb: string, ids: string[]): Omit<Interest, 'id' | 'createdAt'> {
  const line = blurb.trim();
  return { name: name.trim().slice(0, INTEREST_NAME_MAX), ...(line ? { blurb: line.slice(0, INTEREST_LINE_MAX) } : null), rule: {}, include: [...new Set(ids)], exclude: [] };
}

/**
 * The hand lists after putting one work in or taking it out: in = off the out list, and on the in list
 * unless the rule brings it anyway; out = off the in list, and on the out list when the rule would bring it.
 */
export function withMember(i: Pick<Interest, 'rule' | 'include' | 'exclude'>, w: Work, on: boolean): Pick<Interest, 'include' | 'exclude'> {
  const byRule = interestMembers({ rule: i.rule, include: [], exclude: [] }, [w]).length > 0;
  const include = i.include.filter((x) => x !== w.id);
  const exclude = i.exclude.filter((x) => x !== w.id);
  if (on && !byRule) include.push(w.id);
  if (!on && byRule) exclude.push(w.id);
  return { include, exclude };
}

/** the hand lists that make an interest's members exactly `want` (of these works; essays never belong) */
export function withMembers(i: Pick<Interest, 'rule' | 'include' | 'exclude'>, works: Work[], want: Set<string>): Pick<Interest, 'include' | 'exclude'> {
  const now = new Set(interestMembers(i, works).map((w) => w.id));
  let cur = { include: i.include, exclude: i.exclude };
  for (const w of works) {
    if (w.kind === 'essay' || now.has(w.id) === want.has(w.id)) continue;
    cur = withMember({ rule: i.rule, ...cur }, w, want.has(w.id));
  }
  return cur;
}

/** the last string inside a date written as 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD' */
const endOf = (d: string) => `${d}\uffff`;
/** a dated work falls in a period when its date is inside it at the period's own precision ('2014' does not fall in 2014-03…05) */
export function inPeriod(p: Pick<Period, 'from' | 'to'>, date: string, today: string): boolean {
  if (!date) return false;
  const to = p.to ?? today;
  return date >= p.from && date <= endOf(to) && (date.length >= p.from.length || p.from.length <= 4);
}
/** a period's works (essays apart), oldest first — the order they happened in */
export function periodMembers(p: Pick<Period, 'from' | 'to' | 'include' | 'exclude'>, works: Work[], today: string): Work[] {
  const inc = new Set(p.include), exc = new Set(p.exclude);
  return works.filter((w) => w.kind !== 'essay' && !exc.has(w.id) && (inc.has(w.id) || inPeriod(p, w.finished, today)))
    .sort((a, b) => -newestFirst(a, b));
}
/** the essays written inside a period */
export const periodEssays = (p: Pick<Period, 'from' | 'to'>, works: Work[], today: string) =>
  works.filter((w) => w.kind === 'essay' && inPeriod(p, w.finished, today)).sort(newestFirst);

/** 给人看: only the periods a guest would find something in — one with no works they can see (只给自己 kept out) is not shown */
export const shownPeriods = (ps: Period[], visibleWorks: Work[], today: string) => ps.filter((p) => periodMembers(p, visibleWorks, today).length > 0);

/** periods in the order of a book's chapters: by when they began */
export const chapterOrder = (ps: Period[]) => [...ps].sort((a, b) => (a.from === b.from ? a.createdAt.localeCompare(b.createdAt) : a.from < b.from ? -1 : 1));

/** 「2014 年 3 月 – 5 月」「2011 – 2014」「2023 –」 */
export function spanText(p: Pick<Period, 'from' | 'to'>): string {
  const y = (d: string) => Number(d.slice(0, 4));
  const m = (d: string) => Number(d.slice(5, 7));
  const one = (d: string) => (d.length >= 7 ? `${y(d)} 年 ${m(d)} 月` : `${y(d)}`);
  if (!p.to) return `${one(p.from)} –`;
  if (p.from === p.to) return p.from.length >= 7 ? `${y(p.from)} 年 ${m(p.from)} 月` : `${y(p.from)} 年`;
  if (p.from.length >= 7 && p.to.length >= 7 && y(p.from) === y(p.to)) return `${y(p.from)} 年 ${m(p.from)} 月 – ${m(p.to)} 月`;
  return `${one(p.from)} – ${one(p.to)}`;
}

/* ---------- 只给自己 ---------- */

/** what a viewer (给人看, the long image) may see: nothing 只给自己, no sample */
export const shownTo = (onlyMe: string[]) => { const s = new Set(onlyMe); return (w: Pick<Work, 'id'> & { isSample?: true }) => !s.has(w.id) && !w.isSample; };

/** lists and counts a guest sees, the same cut as the person page. The owner still sees every work. */
export function viewerWorks<T extends { id: string; isSample?: true }>(
  works: readonly (T | null | undefined)[],
  show: boolean,
  onlyMe: readonly string[],
): T[] {
  const present = works.filter((w): w is T => !!w);
  if (!show) return present;
  const keep = shownTo([...onlyMe]);
  return present.filter(keep);
}

/* ---------- ids ---------- */
let seq = 0;
export const meId = (prefix: 'i' | 'p') => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
