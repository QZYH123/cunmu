export type Kind = 'book' | 'anime' | 'film' | 'music' | 'game' | 'essay';
export type Source = 'bangumi' | 'weread' | 'manual' | 'douban' | 'steam';

/* ---------- unified fields, TECH-PLAN v0.3 §10 (camelCase of the production tables) ---------- */

export type WorkId = string;
/** an external stable key; production ids are UUIDv5 of it (manual works and essays have none) */
export type SourceKey = `${'bangumi' | 'weread' | 'douban'}:subject:${string}`;
/** prototype id → stable key (exports and the production migration use it; pure, reversible) */
export function sourceKeyOf(id: WorkId): SourceKey | null {
  const m = /^bgm-(\d+)$/.exec(id); if (m) return `bangumi:subject:${m[1]}`;
  const d = /^db-(\d+)$/.exec(id); if (d) return `douban:subject:${d[1]}`;
  const w = /^wrb-(.+)$/.exec(id); if (w) return `weread:subject:${w[1]}`;
  return null;
}

/** work_sources.provider — one row per work × source; sources never overwrite each other */
export type Provider = 'bangumi_account' | 'bangumi_catalog' | 'weread' | 'weread_paste' | 'douban_xlsx' | 'manual' | 'steam';
/** a work's tie to one source (work_sources without the payload: the prototype keeps that on the Work) */
export interface WorkSource {
  provider: Provider;
  /** Bangumi subject id / 豆瓣 subject id / WeRead bookId / manual = the work's id */
  externalId: string;
  /** only bangumi_account: 在看; absent = 看过 */
  status?: 'doing';
  /** 豆瓣 / paste / JSON import batch */
  batchId?: string;
  /** only bangumi_account: the connection epoch */
  epoch?: number;
  firstSeenAt?: string;
}

/** date_claims.precision */
export type DatePrecision = 'day' | 'month' | 'year' | 'unknown';
/** date_claims.source (§4.1.3): user / manual_add / essay_written are level 1 (yours, locked) */
export type DateSource = 'user' | 'manual_add' | 'essay_written' | 'douban_marked' | 'bgm_first_seen' | 'bgm_updated_at' | 'weread_finish' | 'steam_last_played';
/** date_claims: one claim per work × source; the work's date is resolved from them (resolve.ts) */
export interface DateClaim {
  source: DateSource;
  /** 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD'; null = 「不记得了」 (a user claim that locks the work to 时间未知) */
  value: string | null;
  precision: DatePrecision;
  /** 1 yours · 2 the source says so · 3 inferred (shown 「约」), before any pile-up demotion */
  baseLevel: 1 | 2 | 3;
  /** the user picked a year and said 「约」 */
  approx?: boolean;
  batchId?: string;
  observedAt: string;
}
/** the resolved date (works.eff_date / eff_precision / eff_level / eff_source / is_approx) */
export interface EffDate {
  value: string | null;
  precision: DatePrecision;
  /** 1 yours · 2 the source says so · 3 inferred, 「约」 · 4 时间未知 */
  level: 1 | 2 | 3 | 4;
  source: DateSource | null;
  approx: boolean;
  /** a level-1 claim decides it: no sync or import can move it */
  locked: boolean;
}

/** user_images: a picture attached to a work. src = 'idb:<id>' (the pixels live in IndexedDB) or an old data URL */
export interface UserImage { id: string; src: string; aspect: number; addedAt: string }

/** S4 ambient tint (§7.5): the dominant cover colour in OKLCH; null = near-grey, no tint. */
export interface Tint { l: number; c: number; h: number }

export interface CoverImage {
  /** Local thumbnail (short edge 240) — the only image the wall / lists may load. */
  thumb: string;
  /** Medium image for the entry page. */
  medium: string;
  /** Precomputed at import (the demo kit's make-tints.mjs); undefined = compute lazily in the browser. */
  tint?: Tint | null;
  /** Spine colour for 索引 · 年份 (the demo kit's make-spines.mjs); undefined = sample lazily in the browser. */
  spine?: { l: number; c: number; h: number } | null;
  /** Visual strength 0–1 for the home wall's lead (the demo kit's make-strength.mjs); null = too small to
   *  lead; undefined = not measured (generated art), treated as middling. */
  strength?: number | null;
  /** Width / height of the source image. Stored at import so layout never waits for pixels. */
  aspect: number;
}

export interface Credit {
  name: string;
  role: string;
  /** Core creators (tier A) always get a person entry. */
  core?: boolean;
}

export interface Quote {
  /** 'q-<b36 time>-<n>' — batch undo and sync need it (v1 quotes get one on migration) */
  id?: string;
  /** absent = written by you */
  provider?: 'weread' | 'weread_paste' | 'douban_xlsx';
  batchId?: string;
  text: string;
  where?: string;
  date: string;
  note?: string;
  /** The user's starred quote becomes the entry epigraph (§7.4-3); otherwise the earliest one. */
  starred?: boolean;
}

export interface Work {
  id: string;
  kind: Kind;
  title: string;
  originalTitle?: string;
  credits: Credit[];
  /** Release year of the work itself. */
  year?: number;
  /**
   * The resolved date's value ('YYYY-MM-DD' | 'YYYY-MM' | 'YYYY', '' = 时间未知) — read `date` for its
   * precision / level / 「约」. Raw data carries the source's own date here until resolve.ts runs.
   */
  finished: string;
  /** ISO date it was collected into the encyclopedia (works.shelved_at; 时间未知 sorts by it). */
  collected: string;
  /** where it came from first (display); `sources` has every tie */
  source: Source;
  sources?: WorkSource[];
  /** the sources' date claims (date_claims minus the user's, which live in the store) */
  claims?: DateClaim[];
  /** resolved by resolve.ts on every library build */
  date?: EffDate;
  /** Bangumi's raw collection updated_at — not a mark time (§4.1.3); only a year 「约」 or a hint */
  bgmUpdatedAt?: string;
  /** 在看 (from its sources): its own small shelf, never on the wall (DECISIONS-r2 #8) */
  status?: 'doing';
  /** the source's subtitle line (豆瓣 简介) — matching only, never split into people */
  srcSubtitle?: string;
  /** 「在 Bangumi 写的」 short comment, shown apart from yours */
  srcComment?: string;
  /** only in the built-in sample; never in the user's library, never written to */
  isSample?: true;
  /** layered from notes on every library build (notes is the truth) */
  rating10?: number;
  images?: UserImage[];
  cover: CoverImage | null;
  /** Simulates a cover whose image fails to load (falls back to the literal cover). */
  coverBroken?: boolean;
  genres: string[];
  /** Bangumi's tags on the subject, most used first (at most 10): what interests are found by */
  tags?: string[];
  /** the tags you gave it on Bangumi */
  myTags?: string[];
  info: { key: string; value: string; mono?: boolean }[];
  review?: string[];
  quotes?: Quote[];
  readHours?: number;
  /** r19 time played, as a game's source says (Steam): minutes, the last two weeks, the last day */
  play?: import('../lib/steam').Play;
  /** Essays: paragraphs of body text. */
  body?: string[];
  /** Essays: the sentence set as the pull quote (§7.6-2). */
  pull?: string;
  /** high-confidence relations: linked automatically (DECISIONS-r2 #13); low ones are never shown */
  related?: string[];
}

export interface Person {
  id: string;
  name: string;
  alias?: string;
  roles: string[];
  works: Work[];
  core: boolean;
  /** Promoted manually via 「收进档案」. */
  manual?: boolean;
}

export const KIND_LABEL: Record<Kind, string> = {
  book: '书',
  anime: '番',
  film: '影视',
  music: '音乐',
  game: '游戏',
  essay: '随笔',
};

export const KIND_UNIT: Record<Kind, string> = {
  book: '本',
  anime: '部',
  film: '部',
  music: '张',
  game: '款',
  essay: '篇',
};

export const KIND_ORDER: Kind[] = ['book', 'anime', 'film', 'music', 'game', 'essay'];

/** Wall aspect per kind (§3.9.2 step 1); photos use their own ratio, clamped 0.6–1.6. */
export const KIND_ASPECT: Record<Kind, number> = {
  book: 0.667,
  anime: 0.7,
  film: 0.7,
  music: 1,
  game: 0.75,
  essay: 0.75,
};

/** where a work came from, in words: a pasted 微信读书 note says so rather than 「手动添加」 */
export const sourceLabelOf = (w: Pick<Work, 'source' | 'sources'>) =>
  (w.source === 'manual' && w.sources?.some((r) => r.provider === 'weread_paste') ? '微信读书笔记' : SOURCE_LABEL[w.source]);
export const SOURCE_LABEL: Record<Source, string> = {
  bangumi: 'Bangumi',
  weread: '微信读书',
  manual: '手动添加',
  douban: '豆瓣备份',
  steam: 'Steam',
};

/** the one maker 补封面、作者 asks for, by kind */
export const MAKER: Record<Kind, string> = { book: '作者', anime: '导演', film: '导演', music: '艺术家', game: '开发', essay: '作者' };
/** a work's maker: the core credit in its kind's maker role, else its first core credit */
export const makerOf = (w: Pick<Work, 'kind' | 'credits'>) => w.credits.find((c) => c.core && c.role === MAKER[w.kind]) ?? w.credits.find((c) => c.core);
/** credits with the maker replaced (only the maker: a 原作 or 脚本 beside a 导演 stays); name '' = no maker */
export const withMaker = (w: Pick<Work, 'kind' | 'credits'>, name: string, role: string): Work['credits'] => {
  const m = makerOf(w);
  const isMaker = (c: Work['credits'][number]) => c.core && (m ? c.role === m.role : true);
  const i = w.credits.findIndex(isMaker);
  const rest = w.credits.filter((c) => !isMaker(c));
  if (!name) return rest;
  const at = i < 0 ? 0 : i;
  return [...rest.slice(0, at), { name, role: m?.role ?? role, core: true }, ...rest.slice(at)];
};

/** which demo catalogue the dev build lays out (src/demo/catalogue.ts); the app has none */
export type Dataset = 'real' | 'mixed';
