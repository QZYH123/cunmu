/**
 * Steam, read-only (r19): a player's owned games through the Steam Web API, with the player's own Web API key.
 *
 *   IPlayerService/GetOwnedGames   appid, name, playtime_forever / playtime_2weeks (minutes), rtime_last_played
 *   ISteamUser/ResolveVanityURL    a custom profile name (steamcommunity.com/id/<name>) → SteamID64
 *   steamcommunity.com …/?xml=1    the public profile page: the account and whether it is public, no key (checked as it is typed)
 *
 * There is no key-less way: the API answers 401 without a key, and the community pages that once listed a
 * profile's games (…/games?xml=1) now send a visitor to the login page. api.steampowered.com sends no CORS
 * headers, so only the apps can call it (native HTTP: lib/steamNet.ts); a browser can read a saved
 * GetOwnedGames response instead (parseOwnedGames takes either).
 *
 * Mapping (pure; tests/steam.test.ts replays a recorded response): a played game is a 游戏 work dated by when
 * it was last played (Steam says so: level 2, 「最后玩于」); never-played games are left out unless asked
 * for. The playtime is the work's own field (Work.play). A game you already have (by title) gains the
 * playtime instead of a second entry.
 */
import type { CoverImage, Work } from '../data/types';
import { normTitle } from './douban';
import { decodePart } from './decode';

export const STEAM_API = 'https://api.steampowered.com';
export const STEAM_CDN = 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps';

export interface SteamGame {
  appid: number;
  name: string;
  /** minutes */
  playtime_forever: number;
  playtime_2weeks?: number;
  /** unix seconds; 0 = never (or before Steam kept it, 2009) */
  rtime_last_played?: number;
  img_icon_url?: string;
}
export interface SteamPull {
  games: SteamGame[];
  /** ISO time of the read */
  at: string;
  /** keep games never played */
  includeUnplayed?: boolean;
}
export interface SteamConnection {
  status: 'connected' | 'disconnected';
  steamId: string;
  /** what the user typed, if it was a profile name */
  vanity?: string;
  lastOkSyncAt?: string;
  keyTail?: string;
  /** games never played come in too (the choice made at the first read, kept for the next) */
  includeUnplayed?: boolean;
  /** 'key' = the key was refused · 'private' = the profile or its game details are not public · 'net' = Steam did not answer.
   *  'absent' = a restored file, and this device has no key (the file never carries one). */
  problem?: 'key' | 'private' | 'net' | 'absent';
}
/** the work's play record (Work.play): minutes and the last time, as Steam says */
export interface Play {
  minutes: number;
  recentMinutes?: number;
  /** 'YYYY-MM-DD' */
  lastPlayed?: string;
  provider: 'steam';
  appid: number;
  /** r20 read on demand (the game page, or 读取全部成就): kept until read again */
  ach?: AchSummary;
  /** r20 the store's facts (appdetails), kept the same way */
  store?: StoreFacts;
}

export const steamId = (appid: number | string) => `steam-${appid}`;

/** what the user typed — a SteamID64, a profile link, or a custom name — as an id or a name to resolve */
export function parseSteamUser(input: string): { id: string } | { vanity: string } | null {
  const t = input.trim().replace(/\/+$/, '');
  if (!t) return null;
  let m = /^(\d{17})$/.exec(t) ?? /steamcommunity\.com\/profiles\/(\d{17})/i.exec(t);
  if (m) return { id: m[1] };
  m = /steamcommunity\.com\/id\/([^/?#\s]+)/i.exec(t);
  if (m) return { vanity: decodePart(m[1]) };
  if (/^[A-Za-z0-9_-]{2,32}$/.test(t)) return { vanity: t };
  return null;
}

/**
 * The public profile page as XML (steamcommunity.com/id/<name>/?xml=1 or /profiles/<id>/?xml=1): no key
 * needed, so what was typed can be checked before there is a key. It names the account and says whether the
 * profile is public; it does not list games (that page asks a visitor to sign in).
 */
export const profileXmlUrl = (u: { id: string } | { vanity: string }) =>
  'id' in u ? `https://steamcommunity.com/profiles/${u.id}/?xml=1` : `https://steamcommunity.com/id/${encodeURIComponent(u.vanity)}/?xml=1`;
export interface SteamProfile { steamId: string; name: string; isPublic: boolean }
/** the profile XML read: the account, 'none' for Steam's 「no such profile」, null for anything else (a login page, an error page) */
export function parseProfileXml(body: unknown): SteamProfile | 'none' | null {
  if (typeof body !== 'string') return null;
  if (/<response>\s*<error>/i.test(body)) return 'none';
  if (!/<profile>/i.test(body)) return null;
  const tag = (name: string) => {
    const m = new RegExp(`<${name}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${name}>`, 'i').exec(body);
    return m ? (m[1] ?? m[2] ?? '').trim() : '';
  };
  const steamId = tag('steamID64');
  if (!/^\d{17}$/.test(steamId)) return null;
  return { steamId, name: tag('steamID'), isPublic: tag('privacyState') === 'public' };
}

export const ownedGamesUrl = (key: string, id: string) =>
  `${STEAM_API}/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(key)}&steamid=${id}&include_appinfo=1&include_played_free_games=1&format=json`;
export const resolveVanityUrl = (key: string, name: string) =>
  `${STEAM_API}/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(key)}&vanityurl=${encodeURIComponent(name)}&format=json`;

/** a GetOwnedGames response (as text or parsed): its games, `'private'` for an empty `response`
 *  (Steam's signal that game details are private), or null if it isn't one.
 *  `games: []` is a real list with nothing in it — not private. */
export function parseOwnedGames(body: unknown): SteamGame[] | 'private' | null {
  let j = body;
  if (typeof j === 'string') { try { j = JSON.parse(j); } catch { return null; } }
  const r = (j as { response?: { games?: unknown[] } } | null)?.response ?? (j as { games?: unknown[] } | null);
  if (!r || typeof r !== 'object') return null;
  const gs = (r as { games?: unknown[] }).games;
  if (!Array.isArray(gs)) {
    if (Object.keys(r).length === 0) return 'private';
    // a public library with nothing in it: Steam sends the count and leaves the list out
    return (r as { game_count?: unknown }).game_count === 0 ? [] : null;
  }
  const out: SteamGame[] = [];
  const seen = new Set<number>();
  for (const g of gs as Record<string, unknown>[]) {
    const appid = Number(g?.appid);
    // a game listed twice (a file put together by hand) comes in once, so no two works share an id
    if (!Number.isInteger(appid) || appid <= 0 || seen.has(appid)) continue;
    seen.add(appid);
    out.push({
      appid,
      name: typeof g.name === 'string' && g.name.trim() ? g.name.trim() : `App ${appid}`,
      playtime_forever: Math.max(0, Number(g.playtime_forever) || 0),
      ...(Number(g.playtime_2weeks) > 0 ? { playtime_2weeks: Number(g.playtime_2weeks) } : {}),
      ...(Number(g.rtime_last_played) > 0 ? { rtime_last_played: Number(g.rtime_last_played) } : {}),
      ...(typeof g.img_icon_url === 'string' && g.img_icon_url ? { img_icon_url: g.img_icon_url } : {}),
    });
  }
  return out;
}

/** the day a unix time falls on for the reader (Steam keeps UTC seconds; the day is local) */
export const dayOfUnix = (s: number, tzOffsetMin = new Date(s * 1000).getTimezoneOffset()) =>
  new Date(s * 1000 - tzOffsetMin * 60000).toISOString().slice(0, 10);

export const steamCover = (appid: number): CoverImage => ({
  thumb: `${STEAM_CDN}/${appid}/library_600x900.jpg`,
  medium: `${STEAM_CDN}/${appid}/library_600x900.jpg`,
  aspect: 600 / 900,
});
/** a game whose tall library art is missing falls back to the wide store header */
export const steamHeader = (appid: number) => `${STEAM_CDN}/${appid}/header.jpg`;

export const playOf = (g: SteamGame, tz?: number): Play => ({
  minutes: g.playtime_forever,
  ...(g.playtime_2weeks ? { recentMinutes: g.playtime_2weeks } : {}),
  ...(g.rtime_last_played ? { lastPlayed: dayOfUnix(g.rtime_last_played, tz) } : {}),
  provider: 'steam',
  appid: g.appid,
});

/** one game → a work of its own */
export function steamWork(g: SteamGame, at: string, tz?: number): Work {
  const play = playOf(g, tz);
  return {
    id: steamId(g.appid), kind: 'game', title: g.name, credits: [], genres: [], info: [],
    finished: play.lastPlayed ?? '', collected: at.slice(0, 10), source: 'steam',
    sources: [{ provider: 'steam', externalId: String(g.appid) }],
    claims: play.lastPlayed ? [{ source: 'steam_last_played', value: play.lastPlayed, precision: 'day', baseLevel: 2, observedAt: at }] : [],
    cover: g.appid ? steamCover(g.appid) : null,
    play,
  };
}

/**
 * The pull → what joins the library: works of their own for games not already there, and the playtime laid
 * on games that are (same title, a game). `others` are the library's works from every other source.
 * Pure; a later read just replaces the pull, so a resync is the same call (new games appear, times move on).
 */
export function planSteam(pull: SteamPull, others: Work[], tz?: number): { works: Work[]; plays: Record<string, Play>; skipped: number } {
  const byTitle = new Map<string, Work>();
  for (const w of others) if (w.kind === 'game' && !w.id.startsWith('steam-')) { const k = normTitle(w.title); if (k && !byTitle.has(k)) byTitle.set(k, w); }
  const works: Work[] = [];
  const plays: Record<string, Play> = {};
  let skipped = 0;
  for (const g of pull.games) {
    if (!pull.includeUnplayed && g.playtime_forever <= 0) { skipped++; continue; }
    const same = byTitle.get(normTitle(g.name));
    if (same) { plays[same.id] = playOf(g, tz); continue; }
    works.push(steamWork(g, pull.at, tz));
  }
  return { works, plays, skipped };
}

/** 「126 小时」 / 「45 分钟」: whole hours from 2 hours on, one decimal under 10 */
export function fmtPlaytime(min: number): string {
  if (min < 60) return `${Math.max(0, Math.round(min))} 分钟`;
  const h = min / 60;
  return `${h < 10 ? (Math.round(h * 10) / 10).toString() : Math.round(h).toString()} 小时`;
}

/* ---------- r20 achievements and store facts (read on demand, kept on the work) ---------- */

/** one achievement as shown: Steam's words in Chinese where the game has them */
export interface Ach {
  api: string;
  title: string;
  desc?: string;
  icon?: string;
  /** 'YYYY-MM-DD' when you unlocked it */
  at?: string;
  /** share of all players who have it, 0–100 */
  pct?: number;
}
export interface AchSummary {
  total: number;
  unlocked: number;
  /** the first and the last unlock, 'YYYY-MM-DD' */
  first?: string;
  last?: string;
  /** the rarest one you have (lowest global %) */
  rarest?: Ach;
  list: Ach[];
  /** ISO time it was read */
  at: string;
}
/** what the store says of the game (appdetails, l=schinese, cc=cn) */
export interface StoreFacts {
  genres: string[];
  developers: string[];
  publishers: string[];
  /** as the store writes it (「2019 年 10 月 15 日」) and its year */
  released?: string;
  year?: number;
  platforms: string[];
  metacritic?: number;
  at: string;
}

export const playerAchievementsUrl = (key: string, id: string, appid: number) =>
  `${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(key)}&steamid=${id}&appid=${appid}&l=schinese&format=json`;
export const schemaUrl = (key: string, appid: number) =>
  `${STEAM_API}/ISteamUserStats/GetSchemaForGame/v2/?key=${encodeURIComponent(key)}&appid=${appid}&l=schinese&format=json`;
export const globalPctUrl = (appid: number) =>
  `${STEAM_API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}&format=json`;
export const appDetailsUrl = (appid: number) =>
  `https://store.steampowered.com/api/appdetails?appids=${appid}&l=schinese&cc=cn`;

const asJson = (b: unknown): unknown => { if (typeof b !== 'string') return b; try { return JSON.parse(b); } catch { return null; } };

/**
 * GetPlayerAchievements + GetSchemaForGame (names, icons) + the global percentages → one summary. A game
 * without achievements (or a response that says so) → null. Unlock times are the reader's local day.
 */
export function summarizeAchievements(player: unknown, schema: unknown, global: unknown, at: string, tz?: number): AchSummary | null {
  const ps = (asJson(player) as { playerstats?: { success?: boolean; achievements?: { apiname: string; achieved: number; unlocktime?: number; name?: string; description?: string }[] } } | null)?.playerstats;
  const mine = ps?.achievements;
  if (!Array.isArray(mine) || !mine.length) return null;
  const sch = (asJson(schema) as { game?: { availableGameStats?: { achievements?: { name: string; displayName?: string; description?: string; icon?: string; icongray?: string; hidden?: number }[] } } } | null)?.game?.availableGameStats?.achievements ?? [];
  const byApi = new Map(sch.map((a) => [a.name, a]));
  const gl = (asJson(global) as { achievementpercentages?: { achievements?: { name: string; percent: number | string }[] } } | null)?.achievementpercentages?.achievements ?? [];
  const pct = new Map(gl.map((g) => [g.name, Number(g.percent)]));
  const list: Ach[] = mine.map((a) => {
    const s = byApi.get(a.apiname);
    const p = pct.get(a.apiname);
    const got = a.achieved === 1;
    return {
      api: a.apiname,
      title: (s?.displayName || a.name || a.apiname).trim(),
      ...((s?.description || a.description) ? { desc: (s?.description || a.description)!.trim() } : null),
      ...((got ? s?.icon : s?.icongray ?? s?.icon) ? { icon: (got ? s?.icon : s?.icongray ?? s?.icon)! } : null),
      ...(got && a.unlocktime ? { at: dayOfUnix(a.unlocktime, tz) } : null),
      ...(Number.isFinite(p) ? { pct: Math.round(p! * 10) / 10 } : null),
    };
  });
  const got = list.filter((a) => mine.find((m) => m.apiname === a.api)?.achieved === 1);
  const days = got.map((a) => a.at).filter((d): d is string => !!d).sort();
  const rarest = got.filter((a) => a.pct !== undefined).sort((a, b) => a.pct! - b.pct!)[0];
  // yours first, newest first; then the rest, the most common first (the next ones you might get)
  list.sort((a, b) => {
    const ga = got.includes(a), gb = got.includes(b);
    if (ga !== gb) return ga ? -1 : 1;
    if (ga) return (b.at ?? '').localeCompare(a.at ?? '');
    return (b.pct ?? -1) - (a.pct ?? -1);
  });
  return {
    total: list.length, unlocked: got.length,
    ...(days.length ? { first: days[0], last: days[days.length - 1] } : null),
    ...(rarest ? { rarest } : null),
    list, at,
  };
}

/** appdetails → the facts a work can use; null when the store has no page for it (or not in this region) */
export function parseAppDetails(body: unknown, appid: number, at: string): StoreFacts | null {
  const j = asJson(body) as Record<string, { success?: boolean; data?: Record<string, unknown> }> | null;
  const d = j?.[String(appid)];
  if (!d?.success || !d.data) return null;
  const x = d.data as {
    genres?: { description: string }[]; developers?: string[]; publishers?: string[];
    release_date?: { date?: string; coming_soon?: boolean }; platforms?: Record<string, boolean>; metacritic?: { score?: number };
  };
  const released = x.release_date?.date?.trim() || undefined;
  const y = released ? Number(/(\d{4})/.exec(released)?.[1]) : NaN;
  const PLAT: Record<string, string> = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };
  return {
    genres: (x.genres ?? []).map((g) => g.description).filter(Boolean),
    developers: (x.developers ?? []).filter(Boolean),
    publishers: (x.publishers ?? []).filter(Boolean),
    ...(released ? { released } : null),
    ...(Number.isFinite(y) ? { year: y } : null),
    platforms: Object.entries(x.platforms ?? {}).filter(([, on]) => on).map(([k]) => PLAT[k] ?? k),
    ...(x.metacritic?.score ? { metacritic: x.metacritic.score } : null),
    at,
  };
}

/** a Steam-only work takes the store's facts where it has none of its own (never over yours or another source's) */
export function withStoreFacts(w: Work, f: StoreFacts): Work {
  const credits = w.credits.length ? w.credits : [
    ...f.developers.slice(0, 2).map((name) => ({ name, role: '开发', core: true })),
    ...f.publishers.filter((p) => !f.developers.includes(p)).slice(0, 2).map((name) => ({ name, role: '发行' })),
  ];
  return {
    ...w,
    credits,
    genres: w.genres.length ? w.genres : f.genres.slice(0, 3),
    ...(w.year || !f.year ? null : { year: f.year }),
  };
}
