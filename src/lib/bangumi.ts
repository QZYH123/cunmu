/**
 * Bangumi, for real (https://api.bgm.tv/v0, read-only): a user's public collections by username, or
 * everything with a personal access token. TECH-PLAN v0.3 §4.1, APP-PLAN v0.2.
 *
 *   mapping   collection → Work (pure; tests/bangumi.test.ts replays recorded responses)
 *   sync      the previous pull + this pull → the next one, with date claims per §4.1.3 (pure)
 *   client    one request at a time, ≥ 1 s apart, backing off on 429 / 5xx; the User-Agent Bangumi asks
 *             for (a phone sends it through native HTTP; a browser won't let a page set it)
 *
 * Only 看过 (type 2) goes on the wall and 在看 (type 3) on its own shelf; 想看 / 搁置 / 抛弃 are not read.
 */
import { firstSeenClaim } from '../data/resolve';
import type { Credit, DateClaim, Kind, Work } from '../data/types';
import { KIND_ASPECT } from '../data/types';

const DAY_MS = 86400000;

export const API = 'https://api.bgm.tv';
export const PAGE = 100;
export const MIN_GAP_MS = 1000;

/* ---------- what Bangumi returns ---------- */

export interface BgmImages { small: string; grid: string; large: string; medium: string; common: string }
export interface BgmSlimSubject {
  id: number; type: number; name: string; name_cn: string; date: string | null; images: BgmImages | null;
  short_summary?: string; tags?: { name: string; count: number }[]; score?: number; eps?: number; volumes?: number;
}
export interface BgmCollection {
  subject_id: number; subject_type: number; type: number; rate: number; comment: string | null; tags: string[];
  updated_at: string; private: boolean; subject: BgmSlimSubject; ep_status?: number; vol_status?: number;
}
export interface BgmPage<T> { data: T[]; total: number; limit: number; offset: number }
export interface BgmUser { id: number; username: string; nickname: string }
export interface BgmPerson { id: number; name: string; relation: string; type: number; career?: string[] }
export interface BgmSubject extends BgmSlimSubject { infobox?: { key: string; value: string | { v: string }[] }[]; platform?: string }

/* ---------- mapping ---------- */

/** Bangumi subject types: 1 书籍 · 2 动画 · 3 音乐 · 4 游戏 · 6 三次元 (5 is unused) */
export const KIND_OF: Record<number, Exclude<Kind, 'essay'>> = { 1: 'book', 2: 'anime', 3: 'music', 4: 'game', 6: 'film' };
/** collection types: 1 想看 · 2 看过 · 3 在看 · 4 搁置 · 5 抛弃 */
export const DONE = 2;
export const DOING = 3;

/**
 * Core creators, in order of preference: the first relation that has anyone wins (at most 2 names). A TV
 * drama without a 导演 credit shows its 主演; a book without people falls back to the infobox 作者.
 */
export const CORE_ROLES: Record<Exclude<Kind, 'essay'>, string[]> = {
  book: ['作者', '原作', '作画', '插图'],
  anime: ['导演', '原作', '动画制作'],
  film: ['导演', '编剧', '主演'],
  music: ['艺术家', '作曲', '作词'],
  game: ['开发', '发行'],
};
/** the role a fallback name from the infobox gets */
const INFOBOX_KEYS: Record<Exclude<Kind, 'essay'>, string[]> = {
  book: ['作者', '原作', '作画'], anime: ['导演', '原作'], film: ['导演', '主演'], music: ['艺术家', '作曲'], game: ['开发', '发行'],
};
/** subject tags that read as a genre (the rest are years, studios, people, places) */
export const GENRE_WORDS = ['科幻', '奇幻', '日常', '治愈', '悬疑', '推理', '爱情', '冒险', '青春', '喜剧', '动作', '剧情', '犯罪',
  '历史', '摇滚', '流行', '角色扮演', '独立游戏', '平台跳跃', '文学', '日本文学', '音乐', '战斗', '百合', '恐怖', '开放世界', '动作冒险',
  '搞笑', '运动', '机战', '校园', '恋爱', '战争', '纪录片', '传记', '家庭', '惊悚', '电子', '民谣', '爵士', '古典', '原声', '解谜',
  '策略', '射击', '模拟', '格斗', '竞速', '音游', '视觉小说', '漫画', '轻小说', '小说', '散文', '诗歌'];

export const bgmId = (subjectId: number | string) => `bgm-${subjectId}`;
/** Bangumi's updated_at carries its own +08:00: its first ten characters are the day Bangumi means */
export const dayOf = (iso: string) => iso.slice(0, 10);

/** the core creators among a subject's people (companies count: a game's 开发 is a studio) */
export function coreCredits(kind: Exclude<Kind, 'essay'>, people: BgmPerson[]): Credit[] {
  for (const role of CORE_ROLES[kind]) {
    const names = [...new Set(people.filter((p) => p.relation === role).map((p) => p.name))].slice(0, 2);
    if (names.length) return names.map((name) => ({ name, role, core: true }));
  }
  return [];
}
/** a subject without people: the infobox's 作者 / 导演 / … line, split on the usual separators */
export function infoboxCredits(kind: Exclude<Kind, 'essay'>, s: BgmSubject): Credit[] {
  for (const key of INFOBOX_KEYS[kind]) {
    const row = s.infobox?.find((r) => r.key === key);
    if (!row) continue;
    const raw = typeof row.value === 'string' ? row.value : row.value.map((v) => v.v).join('、');
    const names = raw.split(/[、,，/／;；]/).map((n) => n.trim()).filter(Boolean).slice(0, 2);
    if (names.length) return names.map((name) => ({ name, role: key, core: true }));
  }
  return [];
}

function infoRows(kind: Exclude<Kind, 'essay'>, s: BgmSlimSubject): Work['info'] {
  const rows: Work['info'] = [];
  if ((kind === 'anime' || kind === 'film') && s.eps) rows.push({ key: kind === 'anime' ? '话数' : '集数', value: String(s.eps) });
  if (kind === 'book' && s.volumes) rows.push({ key: '册数', value: String(s.volumes) });
  if (s.date) rows.push({ key: kind === 'anime' || kind === 'film' ? '放送' : kind === 'book' ? '出版' : '发售', value: s.date });
  return rows;
}

/** a collection item as a work, without its dates (sync adds the claims) and without people (fetched lazily) */
export function workFromCollection(c: BgmCollection): Work | null {
  const kind = KIND_OF[c.subject_type];
  if (!kind) return null;
  const s = c.subject;
  const title = (s.name_cn || s.name || '').trim() || `Bangumi ${c.subject_id}`;
  const img = s.images;
  const genres = (s.tags ?? []).map((t) => t.name).filter((t) => GENRE_WORDS.includes(t)).slice(0, 2);
  return {
    id: bgmId(c.subject_id),
    kind,
    title,
    originalTitle: s.name_cn && s.name && s.name_cn !== s.name ? s.name : undefined,
    credits: [],
    year: s.date ? Number(s.date.slice(0, 4)) || undefined : undefined,
    finished: '',
    collected: '',
    source: 'bangumi',
    bgmUpdatedAt: dayOf(c.updated_at),
    ...(c.type === DOING ? { status: 'doing' as const } : null),
    ...(c.comment?.trim() ? { srcComment: c.comment.trim() } : null),
    ...(c.rate > 0 ? { rating10: c.rate } : null),
    // fetched at runtime, never bundled; a phone keeps a copy (lib/coverCache.ts)
    cover: img?.common ? { thumb: img.common, medium: img.medium || img.large || img.common, aspect: KIND_ASPECT[kind] } : null,
    genres,
    ...(s.tags?.length ? { tags: [...s.tags].sort((a, b) => b.count - a.count).slice(0, 10).map((t) => t.name) } : null),
    ...(c.tags?.length ? { myTags: c.tags.slice(0, 10) } : null),
    info: infoRows(kind, s),
  };
}

/* ---------- sync ---------- */

/** what a pull keeps: 看过 and 在看 as works, plus what it knows about them */
export interface BangumiPull {
  done: Work[];
  doing: Work[];
  /** subject id → core creators (filled in the background, one subject at a time) */
  people?: Record<string, Credit[]>;
  /** subject id → the cover's real width / height, once a copy was loaded */
  aspects?: Record<string, number>;
}
export interface SyncResult { pull: BangumiPull; added: string[]; removed: string[]; nowDone: string[] }

/**
 * The next pull from the previous one and what Bangumi says now (§4.1.3):
 *   - the first pull (baseline) dates every 看过 by Bangumi's updated_at — not a mark time, so level 3:
 *     a year 「约」 (and a pile-up on one day drops to 时间未知)
 *   - a later pull keeps the claims it gave before; a mark it sees for the first time (or a 在看 that is
 *     now 看过) is dated by when it was first seen, by the gap since the previous good sync
 *   - what Bangumi no longer lists leaves (it was un-marked there)
 */
/**
 * The date a 看过 mark gets the first time a pull sees it (DECISIONS-r2 #20: Bangumi's updated_at is the mark time).
 * The first import takes updated_at as the day (a pile-up on one day still drops to 时间未知, in resolve).
 * A later sync takes it too when it is after the previous sync — the mark was made in between; otherwise
 * (an old mark only now visible, or no usable time) it falls back to the day the sync first saw it.
 */
export function markClaim(updatedAt: string, baseline: boolean, opts: { now: string; prevSyncAt?: string }): DateClaim {
  const t = Date.parse(updatedAt);
  if (updatedAt && !Number.isNaN(t) && (baseline || (opts.prevSyncAt && t > Date.parse(opts.prevSyncAt) && t <= Date.parse(opts.now) + DAY_MS))) {
    return { source: 'bgm_updated_at', value: dayOf(updatedAt), precision: 'day', baseLevel: 2, observedAt: opts.now };
  }
  return firstSeenClaim(opts.now, opts.prevSyncAt);
}

export function planSync(prev: BangumiPull | null, items: BgmCollection[], opts: { epoch: number; now: string; prevSyncAt?: string }): SyncResult {
  const baseline = !prev;
  const before = new Map<string, Work>([...(prev?.done ?? []), ...(prev?.doing ?? [])].map((w) => [w.id, w]));
  const wasDoing = new Set((prev?.doing ?? []).map((w) => w.id));
  const done: Work[] = [];
  const doing: Work[] = [];
  const added: string[] = [];
  const nowDone: string[] = [];
  const seen = new Set<string>();
  for (const c of items) {
    if (c.type !== DONE && c.type !== DOING) continue;
    const w = workFromCollection(c);
    if (!w || seen.has(w.id)) continue;
    seen.add(w.id);
    const old = before.get(w.id);
    const firstSeenAt = old?.sources?.find((s) => s.provider === 'bangumi_account')?.firstSeenAt ?? opts.now;
    const source = { provider: 'bangumi_account' as const, externalId: String(c.subject_id), epoch: opts.epoch, firstSeenAt, ...(c.type === DOING ? { status: 'doing' as const } : null) };
    if (c.type === DOING) {
      doing.push({ ...w, sources: [source], claims: [], collected: dayOf(firstSeenAt) });
      if (!old) added.push(w.id);
      continue;
    }
    let claims: DateClaim[];
    const oldClaims = old && !wasDoing.has(w.id) ? old.claims ?? [] : null;
    if (oldClaims && oldClaims.length) claims = oldClaims;
    else claims = [markClaim(c.updated_at, baseline, opts)];
    if (!old) added.push(w.id);
    else if (wasDoing.has(w.id)) nowDone.push(w.id);
    done.push({ ...w, sources: [source], claims, collected: dayOf(firstSeenAt) });
  }
  const removed = [...before.keys()].filter((id) => !seen.has(id));
  return { pull: { done, doing, people: prev?.people, aspects: prev?.aspects }, added, removed, nowDone };
}

/** the people and real cover shapes a pull has learned, laid onto its works */
export function withKnown(ws: Work[], pull: BangumiPull | undefined): Work[] {
  if (!pull?.people && !pull?.aspects) return ws;
  return ws.map((w) => {
    const sid = w.id.slice(4);
    const credits = pull.people?.[sid];
    const aspect = pull.aspects?.[sid];
    if (!credits?.length && !aspect) return w;
    return {
      ...w,
      ...(credits?.length ? { credits } : null),
      ...(aspect && w.cover ? { cover: { ...w.cover, aspect } } : null),
    };
  });
}

/* ---------- client ---------- */

export interface Transport {
  /** status + parsed JSON body (null when it isn't JSON — Cloudflare's HTML pages) + Retry-After seconds */
  get(url: string, headers: Record<string, string>): Promise<{ status: number; body: unknown; retryAfter?: number }>;
}
export type BgmErrorCode = 'net' | 'gone' | 'token' | 'busy' | 'bad';
export class BgmError extends Error {
  constructor(public code: BgmErrorCode, message: string = code) { super(message); }
}

export interface ClientOpts {
  transport: Transport;
  token?: string;
  /** injectable for tests */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  minGapMs?: number;
}

export function createClient(o: ClientOpts) {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? (() => Date.now());
  const gap = o.minGapMs ?? MIN_GAP_MS;
  let last = -Infinity;
  let chain: Promise<unknown> = Promise.resolve();

  async function once(path: string): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (o.token) headers.Authorization = `Bearer ${o.token}`;
    for (let attempt = 0; ; attempt++) {
      const wait = last + gap - now();
      if (wait > 0) await sleep(wait);
      last = now();
      let r: Awaited<ReturnType<Transport['get']>>;
      try { r = await o.transport.get(`${API}${path}`, headers); } catch {
        if (attempt >= 3) throw new BgmError('net');
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      if (r.status === 200 && r.body !== null) return r.body;
      if (r.status === 401 || r.status === 403) throw new BgmError('token');
      if (r.status === 404) throw new BgmError('gone');
      if (r.status === 400 || r.status === 422) throw new BgmError('bad', JSON.stringify(r.body));
      // 429, 5xx, a 200 that isn't JSON (a Cloudflare page): wait and try again, then give up quietly
      if (attempt >= 3) throw new BgmError(r.status === 429 ? 'busy' : 'net');
      await sleep(Math.max((r.retryAfter ?? 0) * 1000, 2000 * 2 ** attempt));
    }
  }
  /** requests run one after another, never side by side */
  const get = <T,>(path: string): Promise<T> => {
    const p = chain.then(() => once(path));
    chain = p.catch(() => undefined);
    return p as Promise<T>;
  };

  return {
    get,
    user: (username: string) => get<BgmUser>(`/v0/users/${encodeURIComponent(username)}`),
    me: () => get<BgmUser>('/v0/me'),
    subject: (id: number | string) => get<BgmSubject>(`/v0/subjects/${id}`),
    persons: (id: number | string) => get<BgmPerson[]>(`/v0/subjects/${id}/persons`),
    /** every 看过 and 在看, page by page; `onPage` hears the running count against Bangumi's total */
    async collections(username: string, onPage?: (got: number, total: number) => void): Promise<BgmCollection[]> {
      const out: BgmCollection[] = [];
      let total = 0;
      const grand: Record<number, number> = {};
      for (const type of [DONE, DOING]) {
        for (let offset = 0; ; offset += PAGE) {
          const page = await get<BgmPage<BgmCollection>>(`/v0/users/${encodeURIComponent(username)}/collections?type=${type}&limit=${PAGE}&offset=${offset}`);
          grand[type] = page.total;
          total = Object.values(grand).reduce((a, b) => a + b, 0);
          out.push(...page.data);
          onPage?.(out.length, total);
          if (!page.data.length || offset + PAGE >= page.total) break;
        }
      }
      return out;
    },
  };
}
export type BgmClient = ReturnType<typeof createClient>;

/** the core creators of one subject: its people, or its infobox when it has none */
export async function fetchCore(client: BgmClient, subjectId: string, kind: Exclude<Kind, 'essay'>): Promise<Credit[]> {
  const people = await client.persons(subjectId);
  const core = coreCredits(kind, people);
  if (core.length) return core;
  return infoboxCredits(kind, await client.subject(subjectId));
}

/** a pasted subject link (收录): the subject as a work of yours, with its core creators */
export async function workFromSubject(client: BgmClient, id: string): Promise<Work | null> {
  const s = await client.subject(id);
  const kind = KIND_OF[s.type];
  if (!kind) return null;
  const w = workFromCollection({ subject_id: s.id, subject_type: s.type, type: DONE, rate: 0, comment: null, tags: [], updated_at: '', private: false, subject: s });
  if (!w) return null;
  let credits = infoboxCredits(kind, s);
  try { const c = coreCredits(kind, await client.persons(id)); if (c.length) credits = c; } catch { /* the infobox will do */ }
  return { ...w, credits, bgmUpdatedAt: undefined };
}
