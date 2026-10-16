/**
 * What the app keeps on the device, in TECH-PLAN v0.3 §10 field names (PersistedV2), as one JSON text.
 * Where that text lives is lib/storage.ts (a file in the app's data directory on a phone, localStorage
 * on the web, under KEY). A v1 save is migrated on first read (migrateV1toV2: pure, idempotent) after
 * its raw text is copied to BAK. Pictures are not here: IndexedDB (images.ts).
 */
import { DEMO, DEMO_CONNECTIONS } from '@demo';
import { DEFAULT_SETTINGS, type Settings } from './derive';
import type { BangumiPull } from '../lib/bangumi';
import type { Play, SteamConnection } from '../lib/steam';
import { EMPTY_ME, fixMe, type MeData } from './me';
import { KIND_ASPECT, type CoverImage, type DateClaim, type DatePrecision, type Dataset, type Kind, type Quote, type UserImage, type Work, type WorkSource } from './types';

export const KEY = 'cunmu/library';
export const BAK = 'cunmu/library.bak';
/** the prototype's keys: read once, moved to KEY, removed after the new copy reads back the same */
export const LEGACY_KEY = 'self-pedia/v1';
export const LEGACY_BAK = 'self-pedia/v1.bak';
/** 3: the 「我」 page's own data (me) and the birthday; a 2 save gains them empty (migrateV2toV3)
 *  4 (r19): Steam — its connection, and playtime laid on works another source brought (plays); a 3 save
 *  gains them empty (migrateV3toV4) */
export const SCHEMA_VERSION = 4;

export type Theme = 'system' | 'light' | 'dark';
export type CatView = 'grid' | 'spine' | 'list';
/** 索引 · 年份 and its small versions (home 年份, the year page's foot, 我): spines or covers (r7) */
export type YearView = 'spines' | 'covers';
export type CatSortKey = 'title' | 'creator' | 'genre' | 'year' | 'finished' | 'playtime';
export interface CatSort { key: CatSortKey; dir: 'asc' | 'desc' }

/** notes = work_user + quotes + user_images + the user's date claim, for one work */
export interface WorkNote {
  /** paragraphs; replaces the source's review in display */
  review?: string[];
  /** 1–10; a 豆瓣 「我的评分」 × 2 lands here only when empty */
  rating10?: number;
  /** shown before the source's quotes */
  quotes?: Quote[];
  images?: UserImage[];
  /** source is always 'user'; value null = 「不记得了」 (locked to 时间未知) */
  date?: DateClaim;
  kindOverride?: Kind;
  /** your name / maker / cover over what a source (Bangumi, 微信读书) says: a later sync never touches them,
   *  and the source's own value stays underneath for 「恢复原样」 */
  titleOverride?: string;
  /** replaces the source's core credit(s); name '' = you cleared it */
  makerOverride?: { name: string; role: string };
  /** null = 不用图; an 'idb:' picture of yours goes into the export ZIP */
  coverOverride?: CoverImage | null;
  /** 「看完了」 on the 在看 shelf */
  statusOverride?: 'done';
  /** which import wrote this field; touching the field deletes the key, so undo leaves your edits alone */
  fieldBatch?: Partial<Record<'review' | 'rating10', string>>;
  updatedAt?: string;
}

/** import_batches (+ batch_items as id lists) */
export interface ImportBatch {
  id: string;
  provider: 'douban_xlsx' | 'weread_paste' | 'cunmu_json' | 'steam';
  /** 「10 月 8 日 · 豆瓣备份 · 41 部」 */
  label: string;
  createdAt: string;
  fileSha256?: string;
  created: string[];
  merged: string[];
  skipped: string[];
  quoteIds: string[];
  /** prototype addition: short reviews appended to one you had already (undo takes the paragraph back out) */
  appended?: Record<string, string>;
  undoneAt?: string;
}

/** device-level, never synced or exported */
export interface SampleState { on: boolean; enteredAt?: string; exitedAt?: string; exitReason?: 'user' | 'first_own_item' }

export interface BangumiConnection {
  status: 'connected' | 'disconnected';
  /** ① public collections by username · ② a pasted personal token · ④ one-tap (later) */
  mode: 'public' | 'token' | 'oauth';
  username: string;
  /** +1 on every disconnect */
  epoch: number;
  baselineDoneAt?: string;
  lastOkSyncAt?: string;
  /** token mode: the last 4 characters and when it expires (shown in 我 only within 14 days of it) */
  tokenTail?: string;
  tokenExpiresAt?: string;
  /** app build: when the token was pasted (its expiry is not readable; a 401 says it ended) */
  tokenSetAt?: string;
  /** Bangumi's numeric user id — set by a real connection (the demo account has none) */
  userId?: number;
  nickname?: string;
  /** the last sync could not read: 'token' = the token stopped working (expired or revoked), 'gone' = no such
   *  user or the collection went private, 'net' = no network / Bangumi did not answer */
  problem?: 'token' | 'gone' | 'net';
  // the token itself never goes in here (nor in an export): lib/secrets.ts keeps it on the device only
}

export interface WereadConnection { connected: boolean; keyTail?: string }

/**
 * A source tie onto a work the fake catalogue provides (prototype stand-in for the production
 * work_sources rows of those works): a 豆瓣 row merged into a Bangumi work, or a later Bangumi sync
 * finding a 在看 work 看过 (no status, its first-seen claim).
 */
export interface WorkSourceRow extends WorkSource {
  workId: string;
  claim?: DateClaim;
  payload?: { title: string; year?: number; subtitle?: string };
}

export interface PersistedV2 {
  schemaVersion: 3 | 4;
  /** the 「我」 page: profile, 最爱, interests, periods, 只给自己, turned-down suggestions (exported) */
  me: MeData;
  /** 'YYYY-MM-DD', only for the home date line; device level: never exported, never in 给人看 or a long image */
  birthday?: string;
  // the user's library (later: the iCloud sync scope)
  extras: Work[];
  notes: Record<string, WorkNote>;
  /** 「移出」: id → when; any source bringing the id back still keeps it off the wall */
  removed: Record<string, string>;
  batches: ImportBatch[];
  workSources: WorkSourceRow[];
  linked: string[];
  unlinked: string[];
  promoted: string[];
  /** essay id → pull-quote sentence the user set (§7.6-2); '' = cleared */
  pulls: Record<string, string>;
  connections: { bangumi: BangumiConnection | null; weread: WereadConnection; steam?: SteamConnection | null };
  /** r19 Steam's playtime on a work another source brought (same game, by title): work id → play. A game
   *  Steam alone brought is an extra and carries its play itself. Exported. */
  plays?: Record<string, Play>;
  /** real Bangumi collections (app builds); the demo catalogue stands in for them in development */
  bangumi?: BangumiPull;
  settings: Settings;
  /** 「可能是同一部」 (STYLE v0.4 §3.16): an imported work and the one it might be; resolved = merged or 「不是」 */
  maybeSame?: { a: string; b: string; batchId: string; resolved?: 'merged' | 'not' }[];
  /** 「我 → 多设备」: 用 iCloud 在我的苹果设备间同步 (prototype: a remembered switch; nothing syncs) */
  icloud?: boolean;
  /** the collection's own name (VOICE v0.1 §3); empty / missing = the plain default (naming.ts) */
  title?: string;
  /** home's quiet 「也能一次带进来」 line: 不用了 */
  importLineOff?: boolean;
  // device level
  sample: SampleState;
  /** work pinned as the home wall's lead tile (「设为首页封面」); null = picked automatically */
  leadPin: string | null;
  theme: Theme;
  reduceMotion: boolean;
  fontScale: number;
  catView: CatView;
  catSort: CatSort;
  yearView: YearView;
  // prototype only (no production counterpart)
  dev: { tier: number; dataset: Dataset; wereadRemoved: boolean };
  _legacy?: Record<string, unknown>;
}

/** connections of an empty encyclopedia */
export const NO_CONNECTIONS: PersistedV2['connections'] = { bangumi: null, weread: { connected: false }, steam: null };

/** a first open: empty (development: the demo library, connected) */
export const DEFAULTS: PersistedV2 = {
  schemaVersion: 4,
  me: EMPTY_ME,
  extras: [], notes: {}, removed: {}, batches: [], workSources: [],
  linked: [], unlinked: [], promoted: [], pulls: {},
  connections: DEMO_CONNECTIONS ?? NO_CONNECTIONS,
  settings: DEFAULT_SETTINGS,
  sample: { on: false },
  leadPin: null, theme: 'system', reduceMotion: false, fontScale: 1,
  catView: 'grid', catSort: { key: 'finished', dir: 'desc' }, yearView: 'spines',
  dev: { tier: DEMO ? 500 : 0, dataset: 'real', wereadRemoved: false },
};
/** connections for a dev tier: the demo library comes with Bangumi and WeRead; tier 0 with nothing */
export const connectionsFor = (tier: number): PersistedV2['connections'] => (tier > 0 && DEMO_CONNECTIONS ? DEMO_CONNECTIONS : NO_CONNECTIONS);

const KNOWN_V1 = ['tier', 'dataset', 'extras', 'settings', 'theme', 'reduceMotion', 'fontScale', 'weread', 'wereadRemoved',
  'promoted', 'unlinked', 'linked', 'pulls', 'leadPin', 'catView', 'catSort', 'notes', 'removed', 'sample', 'schemaVersion'];
const precisionOf = (v: string): DatePrecision => (v.length === 4 ? 'year' : v.length === 7 ? 'month' : 'day');
const mineClaim = (source: DateClaim['source'], value: string, at: string): DateClaim =>
  ({ source, value, precision: precisionOf(value), baseLevel: 1, observedAt: at });

/** v1 extras carry only `source` + `finished`: give them sources + claims by id prefix (§10.9 table) */
function withSourcesAndClaims(w: Work, now: string): Work {
  if (w.sources) return w;
  const f = w.finished;
  if (w.id.startsWith('wr-')) return { ...w, sources: [{ provider: 'weread', externalId: w.id.slice(3) }], claims: f ? [{ source: 'weread_finish', value: f, precision: precisionOf(f), baseLevel: 2, observedAt: now }] : [] };
  if (w.id.startsWith('paste-')) return { ...w, sources: [{ provider: 'weread_paste', externalId: w.id, batchId: 'b-legacy-paste' }], claims: f ? [mineClaim('manual_add', f, now)] : [] };
  if (w.kind === 'essay') return { ...w, sources: [{ provider: 'manual', externalId: w.id }], claims: f ? [mineClaim('essay_written', f, now)] : [] };
  return { ...w, sources: [{ provider: 'manual', externalId: w.id }], claims: f ? [mineClaim('manual_add', f, now)] : [] };
}

/** 2 → 3, pure and idempotent: the 「我」 data, empty, and a birthday only if it reads as a date */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateV2toV3(v2: any): PersistedV2 {
  const birthday = typeof v2?.birthday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v2.birthday) ? v2.birthday : undefined;
  const out: PersistedV2 = { ...DEFAULTS, ...v2, schemaVersion: 3 as const, me: fixMe(v2?.me) };
  if (birthday) out.birthday = birthday; else delete out.birthday;
  return out;
}

/** 3 → 4, pure and idempotent: no Steam yet, no playtime */
export function migrateV3toV4(v3: PersistedV2): PersistedV2 {
  return { ...v3, schemaVersion: 4, connections: { ...NO_CONNECTIONS, ...v3.connections, steam: v3.connections?.steam ?? null }, plays: v3.plays ?? {} };
}

/** v1 → v2 → the current shape, pure and idempotent: a current object comes back as it is */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateV1toV2(v1: any, now: string): PersistedV2 {
  if (v1?.schemaVersion === 2 || v1?.schemaVersion === 3 || v1?.schemaVersion === 4) return migrateV3toV4(migrateV2toV3(v1));
  const day = now.slice(0, 10);
  let q = 0;
  const qid = () => `q-${Date.parse(now).toString(36)}-${q++}`;
  const raw: Work[] = v1.extras ?? [];
  // Bangumi items the v1 panel copied into extras: the catalogue brings them while connected
  const hadBgm = raw.some((w) => w.id.startsWith('bgm-'));
  const extras = raw.filter((w) => !w.id.startsWith('bgm-')).map((w) => withSourcesAndClaims(w, now));
  const legacyPaste = extras.filter((w) => w.id.startsWith('paste-'));
  const notes: Record<string, WorkNote> = {};
  for (const [id, n] of Object.entries<{ review?: string[]; quotes?: Quote[]; finished?: string }>(v1.notes ?? {})) {
    notes[id] = {
      ...(n.review ? { review: n.review } : null),
      ...(n.quotes ? { quotes: n.quotes.map((x) => ({ id: x.id ?? qid(), ...x })) } : null),
      ...(n.finished ? { date: mineClaim('user', n.finished, now) } : null),
      updatedAt: now,
    };
  }
  const tier = v1.sample ? 0 : typeof v1.tier === 'number' ? v1.tier : 500;
  const legacy = Object.fromEntries(Object.entries(v1 ?? {}).filter(([k]) => !KNOWN_V1.includes(k)));
  return migrateV3toV4(migrateV2toV3({
    schemaVersion: 2,
    extras, notes,
    removed: Object.fromEntries(((v1.removed ?? []) as string[]).map((id) => [id, now])),
    batches: legacyPaste.length ? [{ id: 'b-legacy-paste', provider: 'weread_paste', label: '以前粘贴的微信读书笔记', createdAt: now, created: legacyPaste.map((w) => w.id), merged: [], skipped: [], quoteIds: [] }] : [],
    workSources: [],
    linked: v1.linked ?? [], unlinked: v1.unlinked ?? [], promoted: v1.promoted ?? [], pulls: v1.pulls ?? {},
    connections: {
      bangumi: tier > 0 && DEMO_CONNECTIONS ? DEMO_CONNECTIONS.bangumi : hadBgm ? { status: 'connected', mode: 'public', username: '', epoch: 1, baselineDoneAt: day, lastOkSyncAt: day } : null,
      weread: v1.weread ?? { connected: false },
    },
    settings: { ...DEFAULT_SETTINGS, ...fixInf(v1.settings) },
    sample: { on: !!v1.sample, ...(v1.sample ? { enteredAt: now } : null) },
    leadPin: v1.leadPin ?? null, theme: v1.theme ?? 'system', reduceMotion: !!v1.reduceMotion,
    fontScale: v1.fontScale ?? 1, catView: v1.catView ?? 'grid', catSort: v1.catSort ?? DEFAULTS.catSort, yearView: DEFAULTS.yearView,
    dev: { tier, dataset: v1.dataset === 'mixed' ? 'mixed' : 'real', wereadRemoved: !!v1.wereadRemoved },
    ...(Object.keys(legacy).length ? { _legacy: legacy } : null),
  }));
}

export function fixInf(o?: Record<string, unknown> | null): Partial<Settings> {
  if (!o) return {};
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) r[k] = v === null ? Infinity : Array.isArray(v) ? v : Number(v);
  return r as Partial<Settings>;
}

/**
 * An app build has no demo catalogue: a save the prototype wrote (its demo tier, its fake Bangumi account
 * and WeRead key) keeps everything the user wrote, and drops what only the demo could provide.
 */
export function forApp(s: PersistedV2): PersistedV2 {
  if (DEMO) return s;
  const b = s.connections.bangumi;
  return {
    ...s,
    dev: { ...s.dev, tier: 0 },
    connections: { bangumi: b && b.userId ? b : null, weread: { connected: false }, steam: s.connections.steam ?? null },
  };
}

/**
 * The save from its stored text (migrating a v1 one; `keepBak` is handed its raw text first), then the dev
 * URL overrides. `text` comes from lib/storage.ts; null / unreadable = a first open.
 */
/** a cover whose shape is missing or absurd (an old or hand-edited save) takes its kind's, so no layout divides by it */
export function fixCoverAspect(w: Work): Work {
  const a = w.cover?.aspect;
  if (!w.cover || (typeof a === 'number' && a > 0.2 && a < 5)) return w;
  return { ...w, cover: { ...w.cover, aspect: KIND_ASPECT[w.kind] ?? KIND_ASPECT.book } };
}

export function load(text: string | null = null, keepBak?: (raw: string) => void): PersistedV2 {
  let s: PersistedV2 = DEFAULTS;
  try {
    const j = text ? JSON.parse(text) : null;
    if (j) {
      if (j.schemaVersion !== SCHEMA_VERSION && text) keepBak?.(text);
      const m = migrateV1toV2(j, new Date().toISOString());
      s = forApp({ ...DEFAULTS, ...m, extras: (m.extras ?? []).map(fixCoverAspect), dev: { ...DEFAULTS.dev, ...m.dev }, settings: { ...DEFAULT_SETTINGS, ...fixInf(m.settings as unknown as Record<string, unknown>) } });
    }
  } catch { /* unreadable: start fresh (storage.ts keeps the unreadable text aside before the first save) */ }
  // URL overrides (?tier=50&data=real&theme=dark&motion=reduce&font=1.5) — the screenshot and smoke scripts;
  // an app build takes only the appearance ones
  const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  if (q.has('theme')) s = { ...s, theme: q.get('theme') as Theme };
  if (q.has('motion')) s = { ...s, reduceMotion: q.get('motion') === 'reduce' };
  if (q.has('font')) s = { ...s, fontScale: Number(q.get('font')) };
  if (!DEMO) return s;
  if (q.has('tier')) { const tier = Number(q.get('tier')); s = { ...s, dev: { ...s.dev, tier }, extras: [], connections: connectionsFor(tier), sample: { on: false } }; }
  if (q.has('data')) s = { ...s, dev: { ...s.dev, dataset: q.get('data') === 'mixed' ? 'mixed' : 'real' } };
  if (q.has('reset')) s = { ...DEFAULTS, dev: { ...DEFAULTS.dev, tier: s.dev.tier, dataset: s.dev.dataset }, connections: s.connections, theme: s.theme, reduceMotion: s.reduceMotion, fontScale: s.fontScale };
  if (q.has('yearView')) s = { ...s, yearView: q.get('yearView') === 'covers' ? 'covers' : 'spines' };
  return s;
}

/** the save as stored text (Infinity, a 「不限」 setting, goes as null; fixInf reads it back) */
export const serialize = (s: PersistedV2) => JSON.stringify(s, (_k, v) => (v === Infinity ? null : v));
