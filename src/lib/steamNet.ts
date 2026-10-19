/**
 * How the app reaches api.steampowered.com (r19). Steam sends no CORS headers, so a page can't read it:
 *   phone    native HTTP (CapacitorHttp)
 *   desktop  tauri-plugin-http (scoped to api.steampowered.com, the store's API and public profile pages in src-tauri/capabilities)
 *   web      not at all — the sheet offers reading a saved GetOwnedGames response instead
 * Steam can be slow or unreachable (mainland China especially): a read that hangs counts as 'net'.
 */
import { CapacitorHttp } from '@capacitor/core';
import { isDesktop, isNative } from './native';
import { appDetailsUrl, globalPctUrl, ownedGamesUrl, parseAppDetails, parseOwnedGames, parseProfileXml, parseSteamUser, profileXmlUrl, type SteamProfile, playerAchievementsUrl, resolveVanityUrl, schemaUrl, summarizeAchievements, type AchSummary, type SteamGame, type StoreFacts } from './steam';

/** a request that hangs this long counts as offline (not a UI timing) */
const REQUEST_TIMEOUT_MS = 20_000;

export const steamReachable = () => isNative() || isDesktop();

export class SteamError extends Error {
  constructor(public kind: 'key' | 'private' | 'net' | 'user') { super(kind); }
}

async function get(url: string, text = false): Promise<{ status: number; body: unknown }> {
  if (isNative()) {
    const r = await CapacitorHttp.get({ url, responseType: text ? 'text' : 'json', connectTimeout: 15000, readTimeout: REQUEST_TIMEOUT_MS });
    return { status: r.status, body: r.data };
  }
  if (isDesktop()) {
    const { fetch: tfetch } = await import('@tauri-apps/plugin-http');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const r = await tfetch(url, { signal: ctrl.signal });
      return { status: r.status, body: await r.text() };
    } finally { clearTimeout(t); }
  }
  throw new SteamError('net');
}

/** one request at a time, a little apart: a batch read of every game stays well under Steam's limits */
const MIN_GAP_MS = 350;
let queue: Promise<unknown> = Promise.resolve();
let lastAt = 0;
const spaced = <T,>(f: () => Promise<T>): Promise<T> => {
  const run = queue.then(async () => {
    const wait = lastAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try { return await f(); } finally { lastAt = Date.now(); }
  });
  queue = run.catch(() => undefined);
  return run;
};

const call = async (url: string, okStatuses: number[] = [], text = false) => {
  let r;
  try { r = await spaced(() => get(url, text)); } catch (e) { throw e instanceof SteamError ? e : new SteamError('net'); }
  if (okStatuses.includes(r.status)) return r.body;
  if (r.status === 401 || r.status === 403) throw new SteamError('key');
  if (r.status >= 500 || r.status === 0 || r.status === 429) throw new SteamError('net');
  return r.body;
};

/**
 * The account behind what was typed (a profile link, a custom name, a SteamID64), from the public profile
 * page: no key needed. 'user' = no such account; 'net' = Steam didn't answer, or answered with something else.
 */
export async function readProfile(input: string): Promise<SteamProfile & { vanity?: string }> {
  const u = parseSteamUser(input);
  if (!u) throw new SteamError('user');
  const p = parseProfileXml(await call(profileXmlUrl(u), [403, 404], true));
  if (p === 'none') throw new SteamError('user');
  if (!p) throw new SteamError('net');
  return { ...p, ...('vanity' in u ? { vanity: u.vanity } : null) };
}

/** the account behind what the user typed: a SteamID64 as is, a custom name from its profile page, else with the key */
export async function resolveSteamUser(key: string, input: string): Promise<{ steamId: string; vanity?: string }> {
  const u = parseSteamUser(input);
  if (!u) throw new SteamError('user');
  if ('id' in u) return { steamId: u.id };
  const p = await readProfile(input).catch((e) => { if (e instanceof SteamError && e.kind === 'user') throw e; return null; });
  if (p) return { steamId: p.steamId, vanity: u.vanity };
  const b = await call(resolveVanityUrl(key, u.vanity));
  const j = (typeof b === 'string' ? JSON.parse(b) : b) as { response?: { success?: number; steamid?: string } } | null;
  if (j?.response?.success !== 1 || !j.response.steamid) throw new SteamError('user');
  return { steamId: j.response.steamid, vanity: u.vanity };
}

/** every owned game with its time; [] from Steam for a profile whose game details aren't public → 'private' */
export async function readOwnedGames(key: string, steamId: string): Promise<SteamGame[]> {
  const games = parseOwnedGames(await call(ownedGamesUrl(key, steamId)));
  if (games === null) throw new SteamError('net');
  if (!games.length) throw new SteamError('private');
  return games;
}

/**
 * r20 one game's achievements: yours (GetPlayerAchievements), their names and icons (GetSchemaForGame), how
 * rare each is (GetGlobalAchievementPercentagesForApp, no key). null = the game has none. Steam answers 400
 * for a game without stats; that is "none", not an error.
 */
export async function readAchievements(key: string, steamId: string, appid: number, tz?: number): Promise<AchSummary | null> {
  const player = await call(playerAchievementsUrl(key, steamId, appid), [400]);
  const ps = (typeof player === 'string' ? (() => { try { return JSON.parse(player); } catch { return null; } })() : player) as { playerstats?: { success?: boolean; error?: string } } | null;
  if (!ps?.playerstats?.success) {
    if (/private|not public/i.test(ps?.playerstats?.error ?? '')) throw new SteamError('private');
    return null;
  }
  const [schema, global] = [await call(schemaUrl(key, appid), [400]), await call(globalPctUrl(appid), [400, 403])];
  return summarizeAchievements(ps, schema, global, new Date().toISOString(), tz);
}

/** r20 the store's facts (store.steampowered.com/api/appdetails, Chinese, the CN store); null = no page */
export async function readAppDetails(appid: number): Promise<StoreFacts | null> {
  return parseAppDetails(await call(appDetailsUrl(appid)), appid, new Date().toISOString());
}
