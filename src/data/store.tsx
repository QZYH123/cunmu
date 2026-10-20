import { freshQuotes, normalizeNoteQuotes, normalizeQuotes } from './quotes';
import { withoutSteam } from './steamOff';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEMO, doingFor, masterFor } from '@demo';
import { SAMPLE_WORKS } from './generate';
import { derive, type Derived, type Settings } from './derive';
import { firstSeenClaim, resolveDates, sortWorks } from './resolve';
import {
  DEFAULTS, NO_CONNECTIONS, connectionsFor, fixInf, load, migrateV1toV2, serialize, SCHEMA_VERSION,
  type BangumiConnection, type CatSort, type CatGroup, type CatView, type YearView, type ImportBatch, type PersistedV2, type Theme, type WorkNote, type WorkSourceRow,
  fixCoverAspect,
} from './persist';
import { withKnown, type BangumiPull } from '../lib/bangumi';
import { planSteam, withStoreFacts, type AchSummary, type Play, type SteamConnection, type SteamGame, type StoreFacts } from '../lib/steam';
import { getBangumiToken, getSecret, setBangumiToken, setSecret } from '../lib/secrets';
import { bangumiFromBackup, steamFromBackup } from './restore';
import { clearSteamDraft } from '../lib/steamDraft';
import { steamPriorOf, undoSteamPrior } from './steamUndo';
import { withViewTransition } from '../lib/motion';
import { clearCoverCache } from '../lib/coverCache';
import type { CoverImage, Credit, Dataset, DateClaim, Quote, Work } from './types';
import { makerOf, sourceKeyOf, withMaker } from './types';
import { todayISO } from '../lib/today';
import { EMPTY_ME, FAV_MAX, fixMe, type Favorite, type Interest, type MeData, type Period, type Profile } from './me';
import { clearImages, imageURL } from '../lib/images';
import { storage } from '../lib/storage';
import { APP_VERSION, applyLook } from '../lib/native';
import { clearSpineColours } from '../lib/spine';
import { DUR } from '../tokens';
import { TITLE_MAX } from '../lib/naming';

export const TIERS = [0, 1, 3, 5, 12, 50, 500, 3000] as const;
export type { Theme, CatView, YearView, CatSort, CatSortKey, CatGroup, WorkNote, ImportBatch, WorkSourceRow } from './persist';

/** what the source says under your overrides (for 「恢复原样」) */
/** the covers a file carries: your own pictures (by reference) and Bangumi's (by address, https only) */
/** Steam's image hosts (the ones the desktop policy lets through) */
const STEAM_COVER = /^https:\/\/(shared\.cloudflare\.steamstatic\.com|cdn\.cloudflare\.steamstatic\.com|cdn\.akamai\.steamstatic\.com|steamcdn-a\.akamaihd\.net)\//;
export const travels = (c: Work['cover'] | undefined): Work['cover'] =>
  c && (c.medium.startsWith('idb:') || (!DEMO && (/^https:\/\/lain\.bgm\.tv\//.test(c.medium) || STEAM_COVER.test(c.medium)))) ? c : null;

export interface SourceValues { title: string; maker: string; cover: CoverImage | null }

export interface Arrival { kind: 'single' | 'batch'; ids: string[]; prevIds: string[] }
export interface ToastMsg { id: number; text: string; action?: { label: string; run: () => void } }

/** what a date pick says (the store adds source / level / observedAt); null value = 「不记得了」 */
export interface DatePick { value: string | null; precision: DateClaim['precision']; approx?: boolean }

/** Restore also takes a backup made before the app was renamed 存目 Cunmu: 'strata-export/1', strata.json in the ZIP. */
export const LEGACY_EXPORT = { format: 'strata-export/1', json: 'strata.json' } as const;
export const isBackupFormat = (f: unknown): boolean => f === 'cunmu-export/1' || f === LEGACY_EXPORT.format;

/** cunmu-export/1 (TECH-PLAN v0.3 §10.7): everything that is yours; no sample, no device settings, no keys, no pixels */
export interface CunmuExport {
  format: 'cunmu-export/1';
  exportedAt: string;
  app: { name: 'Cunmu'; version: string; schemaVersion: number };
  works: (Omit<Work, 'cover' | 'date' | 'finished' | 'isSample'> & { sourceKey: string | null; /** a picture of yours ('idb:') or a Bangumi cover's address; never a demo cover */ cover: Work['cover'] })[];
  notes: Record<string, WorkNote>;
  removed: Record<string, string>;
  batches: ImportBatch[];
  links: { linked: string[]; unlinked: string[] };
  promoted: string[];
  pulls: Record<string, string>;
  settings: Settings;
  /** the collection's name, when its owner gave it one */
  title?: string;
  /** the 「我」 page (schema 3); the birthday is not here: it stays on the device */
  me?: MeData;
  connections: { bangumi: { mode: string; username: string; userId?: number; nickname?: string } | null; steam?: { steamId: string; vanity?: string } };
  /** r19 Steam playtime on works another source brought (schema 4) */
  plays?: Record<string, Play>;
  /** prototype only: which demo catalogue the works sit on (production has no such thing) */
  prototype: { tier: number; dataset: Dataset; workSources: WorkSourceRow[] };
}

interface Store extends PersistedV2 {
  tier: number;
  dataset: Dataset;
  /** what is shown: the user's library, with the built-in sample laid over it while sample.on */
  library: Work[];
  d: Derived;
  /** Bangumi 在看: its own small shelf (never on the wall) */
  doing: Work[];
  /** works taken out with 「移出」, newest first, for putting back */
  removedWorks: Work[];
  weread: { connected: boolean; keyTail?: string };
  bangumiOn: boolean;
  arrival: Arrival | null;
  consumeArrival: () => Arrival | null;
  toasts: ToastMsg[];
  /** the work just put in by hand this session: 「最近」 offers 「写几句」 on it until it is opened (r5 #5) */
  justAdded: string | null;
  setJustAdded: (id: string | null) => void;
  toast: (text: string, action?: ToastMsg['action']) => void;
  dismissToast: (id: number) => void;
  setTier: (n: number) => void;
  setDataset: (ds: Dataset) => void;
  setTheme: (t: Theme) => void;
  setReduceMotion: (b: boolean) => void;
  setFontScale: (n: number) => void;
  setSettings: (s: Settings) => void;
  addWork: (w: Work, note?: WorkNote) => void;
  /** what the user wrote on a work (merged over what is there; an empty field clears). Sample works refuse */
  setNote: (id: string, patch: WorkNote) => void;
  /** the user's date for one or several works; null = drop the user's claim (back to the sources) */
  setDateClaim: (ids: string[], pick: DatePick | null) => void;
  /** 「移出」 and 「放回」 — synced works too; a later sync doesn't bring them back */
  removeWork: (id: string) => void;
  restoreWork: (id: string) => void;
  saveEssay: (w: Work) => void;
  /** 「随便看看」 lays the sample over; 「换成我自己的」 takes it away — neither touches the library */
  setSample: (on: boolean) => void;
  importWorks: (ws: Work[], label: string | null) => void;
  /** a WeRead 「复制笔记」 paste: quotes onto books here, new books (时间未知) for the rest — one undoable batch */
  importPaste: (books: { title: string; author?: string; quotes: Quote[] }[]) => { first: string; quotes: number; fresh: number };
  connectWeread: (keyTail: string) => void;
  disconnectWeread: (deleteBooks: boolean) => void;
  connectBangumi: (mode: 'public' | 'token', username: string, tokenTail?: string) => void;
  /** 原型调试: move the token's expiry (days from today) to see the quiet hint in 「我」 */
  devTokenExpiry: (days: number) => void;
  /** you wrote on Bangumi works and then disconnected: it is kept (「都收着」) */
  bangumiStash: boolean;
  setIcloud: (on: boolean) => void;
  /** name the collection (trimmed, at most TITLE_MAX); '' = back to the plain default (naming.ts) */
  setTitle: (t: string) => void;
  /** 「可能是同一部」 still open for this work (at most 2 shown) */
  maybeFor: (id: string) => Work[];
  resolveMaybe: (a: string, b: string, verdict: 'merged' | 'not') => void;
  /** Bangumi's items leave; everything you wrote stays (and reattaches on reconnect) */
  disconnectBangumi: () => void;
  /** demo build: a simulated light sync — marks made since (在看 → 看过) come in; works you took out stay out */
  syncBangumi: () => number;
  /** app build: a Bangumi pull (lib/bangumi.ts planSync) and the connection it came with; `added` arrive on the wall */
  applyBangumi: (r: { pull: BangumiPull; conn: BangumiConnection; added: string[]; first?: boolean }) => void;
  /** what the background learned about Bangumi works: core creators, real cover shapes */
  learnBangumi: (patch: { people?: Record<string, Credit[]>; aspects?: Record<string, number> }) => void;
  /** r19 a Steam read (lib/steam.ts): new games join as one batch, times move on for the ones already here;
   *  returns how many arrived and how many matched a game you had */
  applySteam: (r: { games: SteamGame[]; conn: SteamConnection; includeUnplayed: boolean }) => { added: number; matched: number; skipped: number };
  /** r20 what was read for one game on demand: its achievements, the store's facts */
  learnSteam: (workId: string, patch: { ach?: AchSummary; store?: StoreFacts }) => void;
  /** Steam's games stay (they are yours now); the connection, its key and the playtime laid on other works go */
  disconnectSteam: () => void;
  setSteamProblem: (p: SteamConnection['problem'] | null) => void;
  /** the last sync could not read (null = it could again) */
  setBangumiProblem: (p: BangumiConnection['problem'] | null) => void;
  /** a 豆瓣 backup import, as one batch */
  applyImport: (batch: ImportBatch, created: Work[], rows: WorkSourceRow[], notes: Record<string, WorkNote>, maybe?: { a: string; b: string; batchId: string }[]) => void;
  undoBatch: (id: string) => { removed: number; kept: number };
  exportBackup: () => CunmuExport;
  importBackup: (b: unknown) => Promise<boolean>;
  /** 删除全部内容: back to the empty first-open state (appearance stays) */
  deleteAll: () => Promise<void>;
  promote: (personId: string) => void;
  unlink: (fromId: string, targetId: string) => void;
  link: (fromId: string, targetId: string) => void;
  setPull: (essayId: string, text: string) => void;
  setLeadPin: (id: string | null) => void;
  setCatView: (v: CatView) => void;
  setCatSort: (s: CatSort) => void;
  setCatGroup: (g: CatGroup) => void;
  setYearView: (v: YearView) => void;
  /** 补封面、作者: a work of yours (typed, pasted, from 豆瓣) gets its name, its maker or its picture. A synced
   *  work (Bangumi, 微信读书) gets them as overrides in its note: a value equal to the source's drops the
   *  override; cover 'source' = back to the source's cover */
  editWork: (id: string, patch: { title?: string; creator?: { name: string; role: string } | null; cover?: CoverImage | null | 'source' }) => void;
  /** a synced work: what its source says, where you changed it; null for your own works */
  sourceValues: (id: string) => SourceValues | null;
  /** home's quiet import line: 不用了 */
  hideImportLine: () => void;
  resolvedTheme: 'light' | 'dark';
  /* ----- the 「我」 page ----- */
  setProfile: (patch: Partial<Profile>) => void;
  /** 'YYYY-MM-DD', or null = 不填了 */
  setBirthday: (iso: string | null) => void;
  /** 放进最爱 (at the end; at most FAV_MAX: false when full) */
  addFavorite: (id: string, why?: string) => boolean;
  removeFavorite: (id: string) => void;
  /** the new order, as ids */
  orderFavorites: (ids: string[]) => void;
  setFavoriteWhy: (id: string, why: string) => void;
  /** several at once (the 最爱 suggestion), in this order, after those already there */
  addFavorites: (fs: { id: string; why?: string }[]) => void;
  addInterest: (i: Omit<Interest, 'id' | 'createdAt'>) => string;
  updateInterest: (id: string, patch: Partial<Interest>) => void;
  removeInterest: (id: string) => void;
  addPeriod: (p: Omit<Period, 'id' | 'createdAt'>) => string;
  updatePeriod: (id: string, patch: Partial<Period>) => void;
  removePeriod: (id: string) => void;
  /** 只给自己 on / off for an essay or a work */
  setOnlyMe: (id: string, on: boolean) => void;
  /** a suggestion answered 「不是」: never asked again */
  dismiss: (key: string) => void;
  /** 给人看: the phone handed over — only what you put on the page, nothing to change (session, survives a reload) */
  show: boolean;
  setShow: (on: boolean) => void;
}

const Ctx = createContext<Store | null>(null);

/** what a content reset clears (the dev tier switch): the library, never the device settings */
const CLEAN = { me: EMPTY_ME, extras: [] as Work[], notes: {}, removed: {}, batches: [] as ImportBatch[], workSources: [] as WorkSourceRow[], sample: { on: false } };

const layerNote = (w: Work, n?: WorkNote): Work => {
  if (!n) return w;
  return {
    ...w,
    ...(n.titleOverride ? { title: n.titleOverride } : null),
    ...(n.makerOverride ? { credits: withMaker(w, n.makerOverride.name, n.makerOverride.role) } : null),
    ...(n.coverOverride !== undefined ? { cover: n.coverOverride, coverBroken: false } : null),
    ...(n.kindOverride ? { kind: n.kindOverride } : null),
    ...(n.review !== undefined ? { review: n.review.length ? n.review : undefined } : null),
    ...(n.quotes?.length ? { quotes: [...normalizeQuotes(n.quotes), ...normalizeQuotes(w.quotes)] } : null),
    ...(n.images?.length ? { images: n.images } : null),
    ...(n.rating10 ? { rating10: n.rating10 } : null),
  };
};
/** 「合并」: what you wrote on the imported one joins the note of the one you had — pictures and your date too */
export function foldNote(na: WorkNote, nb0: WorkNote | undefined): WorkNote {
  const nb: WorkNote = { ...(nb0 ?? {}) };
  if (na.rating10 && !nb.rating10) nb.rating10 = na.rating10;
  if (na.review?.length) nb.review = [...(nb.review ?? []), ...na.review];
  if (na.quotes?.length) nb.quotes = [...na.quotes, ...(nb.quotes ?? [])];
  if (na.images?.length) nb.images = [...(nb.images ?? []), ...na.images];
  if (na.date && !nb.date) nb.date = na.date;
  return nb;
}
/** 「合并」: a 最爱, the frontispiece or 只给自己 on the imported one carries over to the one it folded into */
export function repointMe(me: PersistedV2['me'], from: string, into: string): PersistedV2['me'] {
  let out = me;
  if (me.favorites.some((f) => f.id === from)) {
    const favorites = me.favorites.some((f) => f.id === into) ? me.favorites.filter((f) => f.id !== from) : me.favorites.map((f) => (f.id === from ? { ...f, id: into } : f));
    out = { ...out, favorites };
  }
  if (me.profile.frontispiece === from) out = { ...out, profile: { ...out.profile, frontispiece: into } };
  // 只给自己 on either side: the merged one stays hidden
  if (me.onlyMe.includes(from)) out = { ...out, onlyMe: [...new Set([...me.onlyMe.filter((i) => i !== from), into])] };
  return out;
}
const nowISO = () => new Date().toISOString();
let qn = 0;
export const quoteId = () => `q-${Date.now().toString(36)}-${qn++}`;
const batchId = () => `b-${Date.now().toString(36)}`;
const MONTH_DAY = (d = new Date()) => `${d.getMonth() + 1} 月 ${d.getDate()} 日`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<PersistedV2>(() => load(storage.initialText(), storage.keepBak, storage.block));
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const arrivalRef = useRef<Arrival | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [sysDark, setSysDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const [show, setShowState] = useState(() => { try { return sessionStorage.getItem('cunmu/show') === '1'; } catch { return false; } });
  useEffect(() => {
    const el = document.documentElement;
    if (show) el.dataset.show = '1'; else delete el.dataset.show;
    try { if (show) sessionStorage.setItem('cunmu/show', '1'); else sessionStorage.removeItem('cunmu/show'); } catch { /* private mode */ }
  }, [show]);

  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: dark)');
    const f = () => setSysDark(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  useEffect(() => storage.save(serialize(s)), [s]);
  // essay photos are in IndexedDB ('idb:<id>'): resolve them to object URLs for the wall and the page
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const want = [...s.extras.map((w) => w.cover?.medium), ...Object.values(s.notes).map((n) => n.coverOverride?.medium)]
      .filter((u): u is string => !!u && u.startsWith('idb:') && !blobUrls[u]);
    if (!want.length) return;
    let live = true;
    Promise.all(want.map(async (u) => [u, await imageURL(u)] as const)).then((got) => {
      if (live) setBlobUrls((b) => ({ ...b, ...Object.fromEntries(got.filter((g): g is readonly [string, string] => !!g[1])) }));
    });
    return () => { live = false; };
  }, [s.extras, s.notes]); // eslint-disable-line react-hooks/exhaustive-deps
  const extras = useMemo(() => s.extras.map((w) => {
    const u = w.cover?.medium;
    if (!u?.startsWith('idb:')) return w;
    const url = blobUrls[u];
    return { ...w, cover: url ? { ...w.cover!, thumb: url, medium: url } : null };
  }), [s.extras, blobUrls]);

  // the system's reduced-motion setting and the app's own switch are one attribute (MOTION-SPEC §8)
  const [sysReduce, setSysReduce] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const f = () => setSysReduce(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  const resolvedTheme = s.theme === 'system' ? (sysDark ? 'dark' : 'light') : s.theme;
  // layout effect: the theme lands inside the view transition's update, so the crossfade sees it (P0-7)
  useLayoutEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = resolvedTheme;
    applyLook(s.theme, resolvedTheme);
    if (s.reduceMotion || sysReduce) el.dataset.motion = 'reduce'; else delete el.dataset.motion;
    el.style.fontSize = s.fontScale === 1 ? '' : `${s.fontScale * 100}%`;
  }, [resolvedTheme, s.theme, s.reduceMotion, sysReduce, s.fontScale]);

  const { tier, dataset, wereadRemoved } = s.dev;
  const bgm = s.connections.bangumi;
  const bangumiOn = bgm?.status === 'connected';
  const shown = (w: Work): Work => {
    const u = w.cover?.medium;
    if (!u?.startsWith('idb:')) return w;
    const url = blobUrls[u];
    return { ...w, cover: url ? { ...w.cover!, thumb: url, medium: url } : null };
  };
  const { library, doing, removedWorks, originals } = useMemo(() => {
    const master = masterFor(dataset);
    // demo: the fake catalogue stands in for the sources, Bangumi's part only while it is connected;
    // app: Bangumi's part is the last pull (s.bangumi), with what the background learned laid on
    let base = master.slice(0, Math.max(0, tier));
    if (bangumiOn && tier === 0) base = master.filter((w) => w.id.startsWith('bgm-') && w.source === 'bangumi');
    else if (!bangumiOn) base = base.filter((w) => w.source !== 'bangumi');
    if (!DEMO) base = bangumiOn ? withKnown(s.bangumi?.done ?? [], s.bangumi) : [];
    const doingAll = bangumiOn ? (DEMO ? doingFor(dataset) : withKnown(s.bangumi?.doing ?? [], s.bangumi)) : [];
    // source ties the catalogue doesn't carry: a merged 豆瓣 row; a later sync finding a 在看 work 看过
    const rows = new Map<string, WorkSourceRow[]>();
    for (const r of s.workSources) {
      if (r.provider === 'bangumi_account' && (!bangumiOn || r.epoch !== bgm?.epoch)) continue;
      rows.set(r.workId, [...(rows.get(r.workId) ?? []), r]);
    }
    const nowDone = doingAll.filter((w) => rows.get(w.id)?.some((r) => r.provider === 'bangumi_account') || s.notes[w.id]?.statusOverride === 'done');
    const doneIds = new Set(nowDone.map((w) => w.id));
    base = [...nowDone.map((w) => ({ ...w, status: undefined, sources: [] })), ...base];
    const baseIds = new Set(base.map((w) => w.id));
    // an extra with a base id is the user's edit of it (an essay rewritten in the editor): it wins
    const edits = new Map(extras.filter((w) => baseIds.has(w.id)).map((w) => [w.id, w]));
    let all = [...base.map((w) => edits.get(w.id) ?? w), ...extras.filter((w) => !baseIds.has(w.id))];
    if (wereadRemoved) all = all.filter((w) => w.source !== 'weread');
    // under your overrides: what the source says (shown in 改封面、作者 with 「恢复原样」)
    const originals = new Map<string, SourceValues>();
    const sourceOf = (w: Work): SourceValues => ({ title: w.title, maker: makerOf(w)?.name ?? '', cover: w.cover });
    for (const w of [...all, ...doingAll]) {
      const n = s.notes[w.id];
      if (n && (n.titleOverride || n.makerOverride || n.coverOverride !== undefined)) originals.set(w.id, sourceOf(w));
    }
    all = all.map((w) => {
      const rs = rows.get(w.id);
      const tied = rs ? {
        ...w,
        sources: [...(w.sources ?? []), ...rs.map(({ workId: _w, claim: _c, payload: _p, ...src }) => src)],
        claims: [...(w.claims ?? []), ...rs.flatMap((r) => (r.claim ? [r.claim] : []))],
      } : w;
      const pl = s.plays?.[w.id];
      return shown(layerNote(pl ? { ...tied, play: pl } : tied, s.notes[w.id]));
    });
    if (s.sample.on) all = [...SAMPLE_WORKS, ...all];
    const userClaims: Record<string, DateClaim> = {};
    for (const [id, n] of Object.entries(s.notes)) if (n.date) userClaims[id] = n.date;
    const resolved = resolveDates(all, { userClaims, bgmBaseline: bangumiOn ? bgm?.baselineDoneAt ?? null : null });
    const gone = s.removed;
    return {
      library: sortWorks(resolved.filter((w) => !gone[w.id])),
      removedWorks: resolved.filter((w) => gone[w.id]).sort((a, b) => (gone[a.id] < gone[b.id] ? 1 : -1)),
      doing: doingAll.filter((w) => !doneIds.has(w.id) && !gone[w.id]).map((w) => shown(layerNote(w, s.notes[w.id]))),
      originals,
    };
  }, [tier, dataset, wereadRemoved, extras, blobUrls, s.notes, s.removed, s.workSources, s.sample.on, s.bangumi, s.plays, bangumiOn, bgm?.baselineDoneAt, bgm?.epoch]);

  const byIdAll = useMemo(() => new Map(library.map((w) => [w.id, w])), [library]);
  const openMaybe = useMemo(() => (s.maybeSame ?? []).filter((m) => !m.resolved && byIdAll.has(m.a) && byIdAll.has(m.b)), [s.maybeSame, byIdAll]);
  const bangumiStash = useMemo(() => {
    if (bangumiOn) return false;
    const bgmIds = new Set([...masterFor(dataset).filter((w) => w.source === 'bangumi').map((w) => w.id), ...doingFor(dataset).map((w) => w.id)]);
    const isBgm = (id: string) => (DEMO ? bgmIds.has(id) : /^bgm-\d+$/.test(id) && !s.extras.some((e) => e.id === id));
    return Object.entries(s.notes).some(([id, n]) => isBgm(id) && !!(n.review?.length || n.quotes?.length || n.images?.length || n.date));
  }, [bangumiOn, dataset, s.notes, s.extras]);
  const promotedSet = useMemo(() => new Set(s.promoted), [s.promoted]);
  const d = useMemo(() => derive(library, s.settings, promotedSet, doing), [library, s.settings, promotedSet, doing]);

  const toastId = useRef(0);
  const toast = useCallback((text: string, action?: ToastMsg['action']) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, action }].slice(-3));
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const announce = (a: Arrival) => { arrivalRef.current = a; setArrival(a); };
  const ownIds = () => library.filter((w) => !w.isSample).map((w) => w.id);
  /** your own first work ends the sample (DECISIONS-r2 #12): the sample goes, nothing of yours is touched */
  const leaveSample = (x: PersistedV2): PersistedV2 =>
    (x.sample.on ? { ...x, sample: { ...x.sample, on: false, exitedAt: nowISO(), exitReason: 'first_own_item' } } : x);
  const isSampleId = (id: string) => id.startsWith('sample-');
  const mineClaim = (w: Work, source: 'manual_add' | 'essay_written'): Work =>
    (w.claims ? w : { ...w, claims: [{ source, value: w.finished || todayISO(), precision: 'day', baseLevel: 1, observedAt: nowISO() }] });
  const withSource = (w: Work): Work => (w.sources ? w : { ...w, sources: [{ provider: 'manual', externalId: w.id, firstSeenAt: nowISO() }] });

  const store: Store = {
    ...s,
    tier, dataset,
    library, d, doing, removedWorks,
    weread: s.connections.weread,
    bangumiOn, bangumiStash,
    arrival,
    consumeArrival: () => {
      const a = arrivalRef.current;
      arrivalRef.current = null;
      if (a) setArrival(null);
      return a;
    },
    toasts, toast, dismissToast, resolvedTheme, justAdded, setJustAdded,
    show, setShow: (on) => { void withViewTransition(() => setShowState(on), 'show'); },
    setTier: (n) => {
      const prev = ownIds();
      setS((x) => ({ ...x, ...CLEAN, dev: { ...x.dev, tier: n, wereadRemoved: false }, connections: connectionsFor(n), ...(n === 0 ? { leadPin: null } : null) }));
      announce({ kind: 'batch', ids: [], prevIds: prev });
    },
    setSample: (on) => {
      const prev = library.map((w) => w.id);
      setS((x) => ({ ...x, sample: on ? { on: true, enteredAt: nowISO() } : { ...x.sample, on: false, exitedAt: nowISO(), exitReason: 'user' }, leadPin: null }));
      announce({ kind: 'batch', ids: [], prevIds: prev });
    },
    setDataset: (ds) => { const prev = library.map((w) => w.id); setS((x) => ({ ...x, dev: { ...x.dev, dataset: ds } })); announce({ kind: 'batch', ids: [], prevIds: prev }); },
    setTheme: (t) => { void withViewTransition(() => setS((x) => ({ ...x, theme: t })), 'theme'); },
    setReduceMotion: (b) => setS((x) => ({ ...x, reduceMotion: b })),
    setFontScale: (n) => setS((x) => ({ ...x, fontScale: n })),
    setSettings: (st) => setS((x) => ({ ...x, settings: st })),
    addWork: (w0, note) => {
      const w = withSource(mineClaim(w0, 'manual_add'));
      const prev = ownIds();
      setS((x0) => {
        const x = leaveSample(x0);
        const removed = { ...x.removed };
        delete removed[w.id];
        return { ...x, extras: [...x.extras.filter((e) => e.id !== w.id), w], removed, ...(note ? { notes: { ...x.notes, [w.id]: { ...note, updatedAt: nowISO() } } } : null) };
      });
      announce({ kind: 'single', ids: [w.id], prevIds: prev });
    },
    setNote: (id, patch) => {
      if (isSampleId(id)) return;
      setS((x) => {
        const cur: WorkNote = { ...(x.notes[id] ?? {}), ...patch, updatedAt: nowISO() };
        // a field you touch is yours now: an import's undo leaves it alone
        if (cur.fieldBatch) {
          const fb = { ...cur.fieldBatch };
          for (const k of Object.keys(patch)) delete fb[k as keyof typeof fb];
          cur.fieldBatch = Object.keys(fb).length ? fb : undefined;
        }
        return { ...x, notes: { ...x.notes, [id]: cur } };
      });
    },
    setDateClaim: (ids, pick) => setS((x) => {
      const notes = { ...x.notes };
      for (const id of ids) {
        if (isSampleId(id)) continue;
        const n = { ...(notes[id] ?? {}), updatedAt: nowISO() };
        if (!pick) delete n.date;
        else n.date = { source: 'user', value: pick.value, precision: pick.value ? pick.precision : 'unknown', baseLevel: 1, ...(pick.approx ? { approx: true } : null), observedAt: nowISO() };
        notes[id] = n;
      }
      return { ...x, notes };
    }),
    removeWork: (id) => { if (!isSampleId(id)) setS((x) => ({ ...x, removed: { ...x.removed, [id]: nowISO() }, leadPin: x.leadPin === id ? null : x.leadPin })); },
    restoreWork: (id) => setS((x) => { const removed = { ...x.removed }; delete removed[id]; return { ...x, removed }; }),
    saveEssay: (w0) => {
      const w = withSource(mineClaim(w0, 'essay_written'));
      const isNew = !s.extras.some((e) => e.id === w.id);
      const prev = ownIds();
      setS((x0) => { const x = isNew ? leaveSample(x0) : x0; return { ...x, extras: [...x.extras.filter((e) => e.id !== w.id), w] }; });
      if (isNew) announce({ kind: 'single', ids: [w.id], prevIds: prev });
    },
    importWorks: (ws, label) => {
      const have = new Set(ownIds());
      const fresh = ws.filter((w) => !have.has(w.id)).map((w) => withSource(w.claims ? w : mineClaim(w, 'manual_add')));
      const prev = ownIds();
      setS((x0) => { const x = leaveSample(x0); return { ...x, extras: [...x.extras, ...fresh] }; });
      announce({ kind: fresh.length > 8 ? 'batch' : 'single', ids: fresh.map((w) => w.id), prevIds: prev });
      if (fresh.length && label) setTimeout(() => toast(`${label} ${fresh.length} 部`), DUR.place);
    },
    importPaste: (books) => {
      const id = batchId();
      const at = nowISO();
      const own = library.filter((w) => !w.isSample);
      const created: Work[] = [];
      const merged: string[] = [];
      const quoteIds: string[] = [];
      const addQuotes: Record<string, Quote[]> = {};
      let first = '';
      for (const b of books) {
        const have = own.find((w) => w.kind === 'book' && w.title === b.title) ?? created.find((w) => w.title === b.title);
        const prior = [...(have?.quotes ?? []), ...(have ? addQuotes[have.id] ?? [] : [])];
        const freshQs = freshQuotes(b.quotes, prior);
        if (!freshQs.length) continue;
        const qs = freshQs.map((q) => { const qid = quoteId(); quoteIds.push(qid); return { ...q, id: qid, provider: 'weread_paste' as const, batchId: id }; });
        if (have && own.some((w) => w.id === have.id)) {
          addQuotes[have.id] = [...(addQuotes[have.id] ?? []), ...qs];
          if (!merged.includes(have.id)) merged.push(have.id);
          first ||= have.id;
          continue;
        }
        if (have) { addQuotes[have.id] = [...(addQuotes[have.id] ?? []), ...qs]; first ||= have.id; continue; }
        const wid = `paste-${Date.now().toString(36)}-${created.length}`;
        // decided: a pasted book has no date of its own — 时间未知, not the day of the paste
        created.push({
          id: wid, kind: 'book', title: b.title, credits: b.author ? [{ name: b.author, role: '作者', core: true }] : [],
          finished: '', collected: todayISO(), source: 'manual', cover: null, genres: [], info: [],
          sources: [{ provider: 'weread_paste', externalId: wid, batchId: id, firstSeenAt: at }], claims: [],
        });
        addQuotes[wid] = qs;
        first ||= wid;
      }
      const n = quoteIds.length;
      if (!n) return { first: '', quotes: 0, fresh: 0 };
      const prev = ownIds();
      setS((x0) => {
        const x = leaveSample(x0);
        const notes = { ...x.notes };
        for (const [wid, qs] of Object.entries(addQuotes)) notes[wid] = { ...(notes[wid] ?? {}), quotes: [...qs, ...(notes[wid]?.quotes ?? [])], updatedAt: at };
        const batch: ImportBatch = { id, provider: 'weread_paste', label: `${MONTH_DAY()} · 微信读书笔记 · ${n} 条`, createdAt: at, created: created.map((w) => w.id), merged, skipped: [], quoteIds };
        return { ...x, extras: [...x.extras, ...created], notes, batches: [batch, ...x.batches] };
      });
      if (created.length) announce({ kind: 'single', ids: created.map((w) => w.id), prevIds: prev });
      return { first, quotes: n, fresh: created.length };
    },
    connectWeread: (keyTail) => setS((x0) => { const x = leaveSample(x0); return { ...x, connections: { ...x.connections, weread: { connected: true, keyTail } }, dev: { ...x.dev, wereadRemoved: false } }; }),
    disconnectWeread: (deleteBooks) => setS((x) => ({
      ...x,
      connections: { ...x.connections, weread: { connected: false } },
      dev: { ...x.dev, wereadRemoved: deleteBooks },
      extras: deleteBooks ? x.extras.filter((w) => w.source !== 'weread') : x.extras,
    })),
    connectBangumi: (mode, username, tokenTail) => {
      const prev = ownIds();
      setS((x0) => {
        const x = leaveSample(x0);
        const epoch = x.connections.bangumi?.epoch ?? 1;
        // a new baseline: what this first sync finds carries only Bangumi's updated_at (约 a year)
        return { ...x, connections: { ...x.connections, bangumi: {
          status: 'connected', mode, username: mode === 'public' ? username : '', epoch, baselineDoneAt: todayISO(), lastOkSyncAt: nowISO(),
          // a personal token: only its last 4 are kept for the row; the demo token runs a year
          ...(mode === 'token' ? { tokenTail: tokenTail ?? '', tokenExpiresAt: new Date(Date.now() + 365 * 86400000).toISOString() } : null),
        } } };
      });
      announce({ kind: 'batch', ids: [], prevIds: prev });
    },
    devTokenExpiry: (days) => setS((x) => {
      const b = x.connections.bangumi;
      if (!b) return x;
      return { ...x, connections: { ...x.connections, bangumi: { ...b, tokenExpiresAt: new Date(Date.now() + days * 86400000).toISOString() } } };
    }),
    setIcloud: (on) => setS((x) => ({ ...x, icloud: on })),
    setTitle: (t) => setS((x) => ({ ...x, title: [...t.trim()].slice(0, TITLE_MAX).join('') })),
    maybeFor: (id) => openMaybe.filter((m) => m.a === id || m.b === id)
      .map((m) => byIdAll.get(m.a === id ? m.b : m.a)).filter((w): w is Work => !!w).slice(0, 2),
    resolveMaybe: (a, b, verdict) => {
      const prev = ownIds();
      setS((x) => {
        const maybeSame = (x.maybeSame ?? []).map((m) => ((m.a === a && m.b === b) || (m.a === b && m.b === a) ? { ...m, resolved: verdict } : m));
        if (verdict === 'not') return { ...x, maybeSame };
        // 合并: the imported one (a) folds into the one you had (b) — its 豆瓣 row and mark move over
        const pair = (x.maybeSame ?? []).find((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a));
        const [from, into] = pair ? [pair.a, pair.b] : [a, b];
        const w = x.extras.find((e) => e.id === from);
        if (!w) return { ...x, maybeSame };
        const src = w.sources?.find((r) => r.provider === 'douban_xlsx');
        const row: WorkSourceRow | null = src ? { workId: into, provider: 'douban_xlsx', externalId: src.externalId, batchId: src.batchId, firstSeenAt: src.firstSeenAt, claim: w.claims?.[0], payload: { title: w.title, year: w.year } } : null;
        const notes = { ...x.notes };
        const na = notes[from];
        if (na) {
          notes[into] = { ...foldNote(na, notes[into]), updatedAt: nowISO() };
          delete notes[from];
        }
        return {
          ...x, maybeSame, notes,
          me: repointMe(x.me, from, into),
          // the home cover set on the imported one now points at the one it folded into
          leadPin: x.leadPin === from ? into : x.leadPin,
          extras: x.extras.filter((e) => e.id !== from),
          workSources: row ? [...x.workSources, row] : x.workSources,
          batches: x.batches.map((bt) => (bt.created.includes(from) ? { ...bt, created: bt.created.filter((i) => i !== from), merged: [...bt.merged, into] } : bt)),
        };
      });
      if (verdict === 'merged') announce({ kind: 'batch', ids: [], prevIds: prev });
    },
    disconnectBangumi: () => {
      const prev = ownIds();
      setS((x) => {
        const b = x.connections.bangumi;
        if (!b) return x;
        const pinIsBgm = !!x.leadPin && /^(bgm|gen)-/.test(x.leadPin);
        return {
          ...x,
          // the epoch moves on: rows from before can't come back by way of another device
          connections: { ...x.connections, bangumi: { status: 'disconnected', mode: b.mode, username: b.username, epoch: b.epoch + 1, ...(b.userId ? { userId: b.userId } : null) } },
          // Bangumi's works go with it (your notes on them stay, and reattach on reconnect)
          bangumi: undefined,
          // first-seen dates say when you marked things on Bangumi: Bangumi data, so they go too (decided)
          workSources: x.workSources.filter((r) => r.provider !== 'bangumi_account'),
          leadPin: pinIsBgm ? null : x.leadPin,
        };
      });
      announce({ kind: 'batch', ids: [], prevIds: prev });
      if (!DEMO) { void setBangumiToken(null); void clearCoverCache(); }
    },
    applySteam: ({ games, conn, includeUnplayed }) => {
      const at = nowISO();
      const own = library.filter((w) => !w.isSample);
      const plan = planSteam({ games, at, includeUnplayed }, own.filter((w) => w.source !== 'steam'));
      const have = new Map(s.extras.filter((w) => w.source === 'steam').map((w) => [w.id, w]));
      const fresh = plan.works.filter((w) => !have.has(w.id));
      const id = batchId();
      const prev = ownIds();
      setS((x0) => {
        const x = fresh.length ? leaveSample(x0) : x0;
        const next = new Map(plan.works.map((w) => [w.id, w]));
        // a game already here keeps your edits and its first date; its time and last-played claim move on
        const extras = x.extras.map((w) => {
          const n = w.source === 'steam' ? next.get(w.id) : undefined;
          // what was read on demand (achievements, store facts) stays until read again
          return n ? { ...w, play: { ...w.play, ...n.play! }, claims: n.claims } : w;
        });
        const plays = Object.fromEntries(Object.entries(plan.plays).map(([wid, p]) => [wid, { ...x.plays?.[wid], ...p }]));
        const steamPrior = steamPriorOf(x.plays, x.extras, next, Object.keys(plan.plays));
        return {
          ...x,
          extras: [...extras, ...fresh.map((w) => ({ ...w, sources: w.sources?.map((r) => ({ ...r, batchId: id, firstSeenAt: at })) }))],
          plays,
          connections: { ...x.connections, steam: conn },
          batches: fresh.length ? [...x.batches, { id, provider: 'steam' as const, label: `${at.slice(5, 7).replace(/^0/, '')} 月 ${at.slice(8, 10).replace(/^0/, '')} 日 · Steam · ${fresh.length} 部`, createdAt: at, created: fresh.map((w) => w.id), merged: Object.keys(plan.plays), skipped: [], quoteIds: [], steamPrior }] : x.batches,
        };
      });
      if (fresh.length) announce({ kind: fresh.length > 8 ? 'batch' : 'single', ids: fresh.map((w) => w.id), prevIds: prev });
      return { added: fresh.length, matched: Object.keys(plan.plays).length, skipped: plan.skipped };
    },
    learnSteam: (wid, patch) => setS((x) => {
      const ex = x.extras.find((w) => w.id === wid && w.source === 'steam' && w.play);
      if (ex) {
        const w1 = { ...ex, play: { ...ex.play!, ...patch } };
        const w2 = patch.store ? withStoreFacts(w1, patch.store) : w1;
        return { ...x, extras: x.extras.map((w) => (w.id === wid ? w2 : w)) };
      }
      const p = x.plays?.[wid];
      if (!p) return x;
      return { ...x, plays: { ...x.plays, [wid]: { ...p, ...patch } } };
    }),
    disconnectSteam: () => {
      setS((x) => withoutSteam(x));
      void setSecret('steam-key', null);
    },
    setSteamProblem: (p) => setS((x) => {
      const c = x.connections.steam;
      if (!c || (c.problem ?? null) === p) return x;
      const next = { ...c };
      if (p) next.problem = p; else delete next.problem;
      return { ...x, connections: { ...x.connections, steam: next } };
    }),
    applyBangumi: ({ pull, conn, added, first }) => {
      const prev = ownIds();
      setS((x0) => {
        const x = first ? leaveSample(x0) : x0;
        return { ...x, bangumi: pull, connections: { ...x.connections, bangumi: conn } };
      });
      if (first || added.length) announce({ kind: first || added.length > 8 ? 'batch' : 'single', ids: first ? [] : added, prevIds: prev });
    },
    learnBangumi: ({ people, aspects }) => setS((x) => {
      if (!x.bangumi) return x;
      return { ...x, bangumi: {
        ...x.bangumi,
        ...(people ? { people: { ...(x.bangumi.people ?? {}), ...people } } : null),
        ...(aspects ? { aspects: { ...(x.bangumi.aspects ?? {}), ...aspects } } : null),
      } };
    }),
    setBangumiProblem: (p) => setS((x) => {
      const b = x.connections.bangumi;
      if (!b || (b.problem ?? null) === p) return x;
      const next = { ...b };
      if (p) next.problem = p; else delete next.problem;
      return { ...x, connections: { ...x.connections, bangumi: next } };
    }),
    syncBangumi: () => {
      if (!bangumiOn || !bgm) return 0;
      const seen = new Set(s.workSources.filter((r) => r.provider === 'bangumi_account').map((r) => r.workId));
      const next = doingFor(dataset).find((w) => !seen.has(w.id) && s.notes[w.id]?.statusOverride !== 'done');
      const at = nowISO();
      const prev = ownIds();
      setS((x) => {
        const b = x.connections.bangumi!;
        const row: WorkSourceRow | null = next ? { workId: next.id, provider: 'bangumi_account', externalId: next.id.slice(4), epoch: b.epoch, firstSeenAt: at, claim: firstSeenClaim(at, b.lastOkSyncAt) } : null;
        return { ...x, connections: { ...x.connections, bangumi: { ...b, lastOkSyncAt: at } }, ...(row ? { workSources: [...x.workSources, row] } : null) };
      });
      if (next) announce({ kind: 'single', ids: [next.id], prevIds: prev });
      return next ? 1 : 0;
    },
    applyImport: (batch, created, rows, notesIn, maybe = []) => {
      const prev = ownIds();
      setS((x0) => {
        const x = leaveSample(x0);
        const notes = { ...x.notes };
        for (const [id, n] of Object.entries(notesIn)) notes[id] = { ...(notes[id] ?? {}), ...n, fieldBatch: { ...(notes[id]?.fieldBatch ?? {}), ...n.fieldBatch }, updatedAt: batch.createdAt };
        return { ...x, extras: [...x.extras, ...created], workSources: [...x.workSources, ...rows], notes, batches: [batch, ...x.batches], maybeSame: [...(x.maybeSame ?? []), ...maybe] };
      });
      announce({ kind: created.length > 8 ? 'batch' : 'single', ids: created.map((w) => w.id), prevIds: prev });
    },
    undoBatch: (id) => {
      const batch = s.batches.find((b) => b.id === id);
      if (!batch || batch.undoneAt) return { removed: 0, kept: 0 };
      const qids = new Set(batch.quoteIds);
      // edited after the import (decided: those stay): a date you set, your own quote or picture,
      // or a review / rating that isn't the import's
      const touched = (wid: string) => {
        const n = s.notes[wid];
        return !!n?.date || !!n?.images?.length || !!n?.quotes?.some((q) => !qids.has(q.id ?? ''))
          || (!!n?.review?.length && n.fieldBatch?.review !== id && !batch.appended?.[wid]) || (!!n?.rating10 && n.fieldBatch?.rating10 !== id);
      };
      const createdIds = new Set(batch.created);
      const keep = new Set(batch.created.filter(touched));
      const prev = ownIds();
      setS((x) => {
        const notes: Record<string, WorkNote> = {};
        for (const [wid, n0] of Object.entries(x.notes)) {
          const n: WorkNote = { ...n0 };
          if (n.quotes) { n.quotes = n.quotes.filter((q) => !qids.has(q.id ?? '')); if (!n.quotes.length) delete n.quotes; }
          if (n.fieldBatch?.review === id) delete n.review;
          if (n.fieldBatch?.rating10 === id) delete n.rating10;
          const app = batch.appended?.[wid];
          if (app && n.review) n.review = n.review.filter((p) => p !== app);
          if (n.fieldBatch) {
            const fb = { ...n.fieldBatch };
            if (fb.review === id) delete fb.review;
            if (fb.rating10 === id) delete fb.rating10;
            n.fieldBatch = Object.keys(fb).length ? fb : undefined;
          }
          notes[wid] = n;
        }
        const extras = x.extras.flatMap((w) => {
          if (!createdIds.has(w.id)) return [w];
          if (!keep.has(w.id)) return [];
          // you wrote on it: it stays, as a hand-added work (the import's part, its date included, goes)
          return [{ ...w, source: 'manual' as const, sources: [{ provider: 'manual' as const, externalId: w.id }], claims: [] }];
        });
        // a Steam import: the playtime it changed on games already here goes back (an older batch recorded none)
        // once Steam is disconnected, the playtime on games from other sources stays cleared, as disconnecting said
        const prior = batch.steamPrior && !x.connections.steam ? { ...batch.steamPrior, plays: {} } : batch.steamPrior;
        const y = undoSteamPrior({ ...x, extras }, prior);
        return {
          ...y, notes,
          workSources: x.workSources.filter((r) => r.batchId !== id),
          maybeSame: (x.maybeSame ?? []).filter((m) => m.batchId !== id),
          batches: x.batches.map((b) => (b.id === id ? { ...b, undoneAt: nowISO() } : b)),
        };
      });
      announce({ kind: 'batch', ids: [], prevIds: prev });
      return { removed: createdIds.size - keep.size, kept: keep.size };
    },
    exportBackup: () => {
      const own = [...library.filter((w) => !w.isSample), ...removedWorks];
      return {
        format: 'cunmu-export/1',
        exportedAt: new Date().toISOString(),
        app: { name: 'Cunmu', version: APP_VERSION, schemaVersion: SCHEMA_VERSION },
        // a picture of yours (an essay's photo, a cover you chose) stays as its 'idb:' reference — the ZIP carries the file;
        // a cover from Bangumi stays as its address (r9 UX-SIM: without it a restored library was all paper until the
        // next sync, and stayed so offline); the demo catalogue's covers never travel
        works: (() => {
          const raw = new Map<string, Work['cover']>();
          for (const w of [...(s.bangumi?.done ?? []), ...(s.bangumi?.doing ?? []), ...s.extras]) raw.set(w.id, w.cover);
          return own.map(({ cover: _c, date: _d, finished: _f, isSample: _s, images: _i, ...w }) => (
            { ...w, sourceKey: sourceKeyOf(w.id), cover: travels(raw.get(w.id)) }
          ));
        })(),
        // your pictures keep their 'idb:<id>' src; the export ZIP puts each one at 图片/<id>.jpg
        notes: s.notes,
        removed: s.removed,
        batches: s.batches,
        links: { linked: s.linked, unlinked: s.unlinked },
        promoted: s.promoted,
        pulls: s.pulls,
        settings: s.settings,
        ...(s.title ? { title: s.title } : null),
        // the 「我」 page goes with your things; the birthday stays on this device (it is said so where it is set)
        me: s.me,
        connections: {
          bangumi: bgm ? { mode: bgm.mode, username: bgm.username, ...(bgm.userId ? { userId: bgm.userId, nickname: bgm.nickname } : null) } : null,
          // Steam: which profile, never the key
          ...(s.connections.steam ? { steam: { steamId: s.connections.steam.steamId, ...(s.connections.steam.vanity ? { vanity: s.connections.steam.vanity } : null) } } : null),
        },
        ...(s.plays && Object.keys(s.plays).length ? { plays: s.plays } : null),
        prototype: { tier, dataset, workSources: s.workSources },
      };
    },
    importBackup: async (b) => {
      const j = b as Partial<CunmuExport> | null;
      if (!j || !isBackupFormat(j.format) || !Array.isArray(j.works)) return false;
      // the file never has the token or the key; keep using the ones still on this device
      const [hasToken, hasKey] = await Promise.all([
        getBangumiToken().then((t) => !!t),
        getSecret('steam-key').then((k) => !!k),
      ]);
      const catalogue = new Set(masterFor(j.prototype?.dataset ?? dataset).map((w) => w.id));
      // app: Bangumi's works come back as its last pull (the next sync brings their covers back)
      const fromPull = (w: { id: string; sources?: Work['sources'] }) => !DEMO && /^bgm-\d+$/.test(w.id) && !!w.sources?.some((r) => r.provider === 'bangumi_account');
      const eb = j.connections?.bangumi;
      const pullWorks = eb ? j.works.filter(fromPull).map(({ sourceKey: _k, ...w }) => fixCoverAspect({ ...w, cover: travels(w.cover), finished: '' } as Work)) : [];
      // works the demo catalogue provides come back with it; the rest are yours and come back as they were
      const extras = j.works.filter((w) => !fromPull(w) && (!catalogue.has(w.id) || w.kind === 'essay'))
        .map(({ sourceKey: _k, ...w }) => fixCoverAspect({ ...w, cover: travels(w.cover), finished: '' } as Work))
        .map((w) => (w.quotes === undefined ? w : { ...w, quotes: normalizeQuotes(w.quotes) }));
      const prev = ownIds();
      setS((x) => ({
        ...x, ...CLEAN,
        extras,
        notes: normalizeNoteQuotes<WorkNote>(j.notes),
        removed: j.removed ?? {},
        batches: j.batches ?? [],
        workSources: j.prototype?.workSources ?? [],
        linked: j.links?.linked ?? [], unlinked: j.links?.unlinked ?? [],
        promoted: j.promoted ?? [], pulls: j.pulls ?? {},
        settings: { ...x.settings, ...fixInf(j.settings as unknown as Record<string, unknown>) },
        title: typeof j.title === 'string' ? j.title : x.title,
        // a file from before the 「我」 page has none: it starts empty (and the suggestions offer it again)
        me: fixMe(j.me),
        connections: {
          // app: no sync time, so the next open reads Bangumi again; a token still on the device is used as-is
          bangumi: bangumiFromBackup(eb, { demo: DEMO, hasToken, today: todayISO(), now: nowISO() }),
          weread: { connected: false },
          steam: steamFromBackup(j.connections?.steam, { hasKey }),
        },
        plays: j.plays ?? {},
        bangumi: pullWorks.length && (DEMO || eb?.userId) ? { done: pullWorks.filter((w) => w.status !== 'doing'), doing: pullWorks.filter((w) => w.status === 'doing') } : undefined,
        dev: { tier: j.prototype?.tier ?? 0, dataset: j.prototype?.dataset ?? dataset, wereadRemoved: false },
        leadPin: null,
      }));
      announce({ kind: 'batch', ids: [], prevIds: prev });
      return true;
    },
    deleteAll: async () => {
      await clearImages();
      await storage.clear();
      await setBangumiToken(null);
      await setSecret('steam-key', null);
      await clearCoverCache();
      clearSpineColours();
      clearSteamDraft();
      setS((x) => ({ ...DEFAULTS, ...CLEAN, dev: { tier: 0, dataset: x.dev.dataset, wereadRemoved: false }, connections: NO_CONNECTIONS, theme: x.theme, reduceMotion: x.reduceMotion, fontScale: x.fontScale }));
    },
    promote: (id) => setS((x) => ({ ...x, promoted: [...new Set([...x.promoted, id])] })),
    unlink: (from, target) => setS((x) => ({ ...x, unlinked: [...new Set([...x.unlinked, `${from}>${target}`])] })),
    link: (from, target) => setS((x) => ({ ...x, linked: [...new Set([...x.linked, `${from}>${target}`])] })),
    setPull: (id, text) => setS((x) => ({ ...x, pulls: { ...x.pulls, [id]: text } })),
    setLeadPin: (id) => setS((x) => ({ ...x, leadPin: id })),
    setCatView: (v) => setS((x) => ({ ...x, catView: v })),
    setCatSort: (c) => setS((x) => ({ ...x, catSort: c })),
    setCatGroup: (g) => setS((x) => ({ ...x, catGroup: g })),
    setYearView: (v) => setS((x) => ({ ...x, yearView: v })),
    editWork: (id, patch) => {
      if (isSampleId(id)) return;
      if (!s.extras.some((e) => e.id === id)) {
        // a synced work: your values sit in its note, over the source's, and outlive every sync
        const cur = byIdAll.get(id) ?? doing.find((w) => w.id === id);
        if (!cur) return;
        const src = originals.get(id) ?? { title: cur.title, maker: makerOf(cur)?.name ?? '', cover: cur.cover };
        setS((x) => {
          const n: WorkNote = { ...(x.notes[id] ?? {}), updatedAt: nowISO() };
          if (patch.title !== undefined) {
            const t = patch.title.trim();
            if (!t || t === src.title) delete n.titleOverride; else n.titleOverride = t;
          }
          if (patch.creator !== undefined) {
            const name = patch.creator?.name.trim() ?? '';
            if (name === src.maker) delete n.makerOverride; else n.makerOverride = { name, role: patch.creator?.role ?? '' };
          }
          if (patch.cover === 'source') delete n.coverOverride;
          else if (patch.cover !== undefined) n.coverOverride = patch.cover;
          return { ...x, notes: { ...x.notes, [id]: n } };
        });
        return;
      }
      setS((x) => ({
        ...x,
        extras: x.extras.map((w) => {
          if (w.id !== id) return w;
          const next = { ...w };
          if (patch.title !== undefined && patch.title.trim()) next.title = patch.title.trim();
          if (patch.creator !== undefined) {
            // the maker you name replaces the core one(s); the rest of the credits stay
            const rest = w.credits.filter((c) => !c.core);
            next.credits = patch.creator?.name.trim() ? [{ name: patch.creator.name.trim(), role: patch.creator.role, core: true }, ...rest] : rest;
          }
          if (patch.cover !== undefined && patch.cover !== 'source') next.cover = patch.cover;
          return next;
        }),
      }));
    },
    sourceValues: (id) => {
      if (s.extras.some((e) => e.id === id)) return null;
      const o = originals.get(id);
      if (o) return o;
      const w = byIdAll.get(id) ?? doing.find((x) => x.id === id);
      return w ? { title: w.title, maker: makerOf(w)?.name ?? '', cover: w.cover } : null;
    },
    hideImportLine: () => setS((x) => ({ ...x, importLineOff: true })),
    setProfile: (patch) => setS((x) => {
      const profile: Profile = { ...x.me.profile };
      for (const [k, v] of Object.entries(patch) as [keyof Profile, string | undefined][]) { if (v && v.trim()) profile[k] = v.trim(); else delete profile[k]; }
      return { ...x, me: { ...x.me, profile } };
    }),
    setBirthday: (iso) => setS((x) => { const n = { ...x }; if (iso) n.birthday = iso; else delete n.birthday; return n; }),
    addFavorite: (id, why) => {
      if (s.me.favorites.some((f) => f.id === id)) return true;
      if (s.me.favorites.length >= FAV_MAX) return false;
      setS((x) => (x.me.favorites.some((f) => f.id === id) || x.me.favorites.length >= FAV_MAX ? x
        : { ...x, me: { ...x.me, favorites: [...x.me.favorites, { id, at: nowISO(), ...(why?.trim() ? { why: why.trim() } : null) }] } }));
      return true;
    },
    removeFavorite: (id) => setS((x) => ({ ...x, me: { ...x.me, favorites: x.me.favorites.filter((f) => f.id !== id), profile: x.me.profile.frontispiece === id ? { ...x.me.profile, frontispiece: undefined } : x.me.profile } })),
    orderFavorites: (ids) => setS((x) => {
      const by = new Map(x.me.favorites.map((f) => [f.id, f]));
      const next = ids.map((i) => by.get(i)).filter((f): f is Favorite => !!f);
      return { ...x, me: { ...x.me, favorites: [...next, ...x.me.favorites.filter((f) => !ids.includes(f.id))] } };
    }),
    setFavoriteWhy: (id, why) => setS((x) => ({ ...x, me: { ...x.me, favorites: x.me.favorites.map((f) => {
      if (f.id !== id) return f;
      const n: Favorite = { ...f };
      if (why.trim()) n.why = why.trim(); else delete n.why;
      return n;
    }) } })),
    addFavorites: (fs) => setS((x) => {
      const have = new Set(x.me.favorites.map((f) => f.id));
      const add = fs.filter((f) => !have.has(f.id)).map((f) => ({ id: f.id, at: nowISO(), ...(f.why?.trim() ? { why: f.why.trim() } : null) }));
      return { ...x, me: { ...x.me, favorites: [...x.me.favorites, ...add].slice(0, FAV_MAX) } };
    }),
    addInterest: (i) => {
      const id = `i-${Date.now().toString(36)}-${(qn++).toString(36)}`;
      setS((x) => ({ ...x, me: { ...x.me, interests: [...x.me.interests, { ...i, id, createdAt: nowISO() }], dismissed: i.key ? [...new Set([...x.me.dismissed, i.key])] : x.me.dismissed } }));
      return id;
    },
    updateInterest: (id, patch) => setS((x) => ({ ...x, me: { ...x.me, interests: x.me.interests.map((i) => (i.id === id ? { ...i, ...patch, id } : i)) } })),
    removeInterest: (id) => setS((x) => ({ ...x, me: { ...x.me, interests: x.me.interests.filter((i) => i.id !== id) } })),
    addPeriod: (p) => {
      const id = `p-${Date.now().toString(36)}-${(qn++).toString(36)}`;
      setS((x) => ({ ...x, me: { ...x.me, periods: [...x.me.periods, { ...p, id, createdAt: nowISO() }], dismissed: p.key ? [...new Set([...x.me.dismissed, p.key])] : x.me.dismissed } }));
      return id;
    },
    updatePeriod: (id, patch) => setS((x) => ({ ...x, me: { ...x.me, periods: x.me.periods.map((p) => (p.id === id ? { ...p, ...patch, id } : p)) } })),
    removePeriod: (id) => setS((x) => ({ ...x, me: { ...x.me, periods: x.me.periods.filter((p) => p.id !== id) } })),
    setOnlyMe: (id, on) => setS((x) => ({ ...x, me: { ...x.me, onlyMe: on ? [...new Set([...x.me.onlyMe, id])] : x.me.onlyMe.filter((i) => i !== id) } })),
    dismiss: (key) => setS((x) => ({ ...x, me: { ...x.me, dismissed: [...new Set([...x.me.dismissed, key])] } })),
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

export { migrateV1toV2 };
