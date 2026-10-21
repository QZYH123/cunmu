import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from './fixtures/steam-owned-games.json';
import ach from './fixtures/steam-achievements.json';
import { fmtPlaytime, parseAppDetails, parseProfileXml, profileXmlUrl, summarizeAchievements, withStoreFacts, parseOwnedGames, parseSteamUser, planSteam, steamWork, type SteamPull } from '../src/lib/steam';
import { migrateV1toV2, migrateV3toV4, DEFAULTS } from '../src/data/persist';
import type { Work } from '../src/data/types';

const fixture = JSON.stringify(raw);
const AT = '2026-10-15T07:00:00.000Z';

function asGames(body: unknown) {
  const g = parseOwnedGames(body);
  assert.ok(Array.isArray(g));
  return g;
}

test('steam: a GetOwnedGames response reads as games (text or parsed); a private profile is not an empty library', () => {
  const gs = asGames(fixture);
  assert.equal(gs.length, 5);
  assert.deepEqual(gs[0], { appid: 1086940, name: "Baldur's Gate 3", playtime_forever: 7563, playtime_2weeks: 312, rtime_last_played: 1728900000, img_icon_url: 'd866cd' });
  assert.equal(gs[3].rtime_last_played, undefined);
  assert.equal(parseOwnedGames({ response: {} }), 'private');
  assert.deepEqual(parseOwnedGames({ response: { games: [] } }), []);
  assert.equal(parseOwnedGames('<html>'), null);
  assert.equal(parseOwnedGames({ nope: 1 }), null);
});

test('steam: what the user types — an id, a profile link, a custom name', () => {
  assert.deepEqual(parseSteamUser('76561197960435530'), { id: '76561197960435530' });
  assert.deepEqual(parseSteamUser('https://steamcommunity.com/profiles/76561197960435530/'), { id: '76561197960435530' });
  assert.deepEqual(parseSteamUser('https://steamcommunity.com/id/gaben/games'), { vanity: 'gaben' });
  assert.deepEqual(parseSteamUser('gaben'), { vanity: 'gaben' });
  assert.equal(parseSteamUser('  '), null);
  assert.equal(parseSteamUser('不是账号'), null);
});

test('steam: a game becomes a 游戏 dated by when it was last played (Steam says so, by the day)', () => {
  const w = steamWork(asGames(fixture)[0], AT, -480);
  assert.equal(w.id, 'steam-1086940');
  assert.equal(w.kind, 'game');
  assert.equal(w.source, 'steam');
  // 1728900000 = 2024-10-14 10:00 UTC = 18:00 in Singapore
  assert.equal(w.finished, '2024-10-14');
  assert.deepEqual(w.claims, [{ source: 'steam_last_played', value: '2024-10-14', precision: 'day', baseLevel: 2, observedAt: AT }]);
  assert.deepEqual(w.play, { minutes: 7563, recentMinutes: 312, lastPlayed: '2024-10-14', provider: 'steam', appid: 1086940 });
  assert.match(w.cover!.thumb, /1086940\/library_600x900\.jpg$/);
  // never dated: 时间未知, no claim
  const s = steamWork(asGames(fixture)[4], AT, -480);
  assert.equal(s.finished, '');
  assert.deepEqual(s.claims, []);
});

test('steam: unplayed games stay out unless asked; a game you have by title gains the time, not a twin', () => {
  const games = asGames(fixture);
  const mine = { id: 'bgm-1', kind: 'game', title: 'Disco Elysium', credits: [], finished: '2021-01-01', collected: '2021-01-01', source: 'bangumi', cover: null, genres: [], info: [] } as Work;
  const book = { ...mine, id: 'bgm-2', kind: 'book', title: 'Hollow Knight' } as Work;
  const pull: SteamPull = { games, at: AT };
  const a = planSteam(pull, [mine, book], -480);
  assert.deepEqual(a.works.map((w) => w.id), ['steam-1086940', 'steam-367520', 'steam-413150']);
  assert.equal(a.skipped, 1);
  assert.deepEqual(Object.keys(a.plays), ['bgm-1']);
  assert.equal(a.plays['bgm-1'].minutes, 2890);
  const b = planSteam({ ...pull, includeUnplayed: true }, [mine], -480);
  assert.equal(b.works.length, 4);
  assert.equal(b.skipped, 0);
  // a resync is the same call: the times move on, nothing doubles
  const later = planSteam({ games: games.map((g) => ({ ...g, playtime_forever: g.playtime_forever ? g.playtime_forever + 60 : 0 })), at: AT }, [mine], -480);
  assert.equal(later.works.length, a.works.length);
  assert.equal(later.works[0].play!.minutes, 7623);
});

test('steam: playtime in words', () => {
  assert.equal(fmtPlaytime(45), '45 分钟');
  assert.equal(fmtPlaytime(90), '1.5 小时');
  assert.equal(fmtPlaytime(7563), '126 小时');
});

test('schema 4: a 3 save gains no Steam and no playtime; migrating twice changes nothing', () => {
  const v3 = { ...DEFAULTS, schemaVersion: 3 as const, connections: { bangumi: null, weread: { connected: false } } };
  delete (v3 as { plays?: unknown }).plays;
  const v4 = migrateV1toV2(v3, AT);
  assert.equal(v4.schemaVersion, 4);
  assert.equal(v4.connections.steam, null);
  assert.deepEqual(v4.plays, {});
  assert.deepEqual(migrateV3toV4(v4), v4);
});


test('steam r20: what you have of a game, the first day, the rarest one', () => {
  const a = summarizeAchievements(ach.player, JSON.stringify(ach.schema), ach.global, AT, -480)!;
  assert.equal(a.total, 4);
  assert.equal(a.unlocked, 3);
  // 1576051200 = 2019-12-11 08:00 UTC; local (UTC+8) day
  assert.equal(a.first, '2019-12-11');
  assert.equal(a.last, '2020-02-01');
  assert.equal(a.rarest?.title, '海岸');
  assert.equal(a.rarest?.pct, 3.3);
  // yours newest first, then the rest; an empty description is left out; a locked one shows its grey icon
  assert.deepEqual(a.list.map((x) => x.api), ['ACH_D', 'ACH_B', 'ACH_A', 'ACH_C']);
  assert.equal(a.list[1].desc, undefined);
  assert.match(a.list[3].icon!, /c_g\.jpg$/);
  assert.equal(a.list[3].at, undefined);
  // a game without any: null
  assert.equal(summarizeAchievements({ playerstats: { success: true } }, null, null, AT), null);
});

test('steam r20: the store facts, and a Steam-only work takes them only where it has none', () => {
  const f = parseAppDetails(ach.appdetails, 632470, AT)!;
  assert.deepEqual(f, { genres: ['冒险', '角色扮演'], developers: ['ZA/UM'], publishers: ['ZA/UM'], released: '2019 年 10 月 15 日', year: 2019, platforms: ['Windows', 'macOS'], metacritic: 91, at: AT });
  assert.equal(parseAppDetails(ach.noApp, 999, AT), null);
  const w = steamWork(asGames(fixture)[1], AT, -480);
  const filled = withStoreFacts(w, f);
  assert.deepEqual(filled.credits, [{ name: 'ZA/UM', role: '开发', core: true }]);
  assert.deepEqual(filled.genres, ['冒险', '角色扮演']);
  assert.equal(filled.year, 2019);
  const kept = withStoreFacts({ ...w, genres: ['侦探'], year: 2020 }, f);
  assert.deepEqual(kept.genres, ['侦探']);
  assert.equal(kept.year, 2020);
});

test('steam: the public profile page names the account without a key; no such profile, or a login page, is told apart', () => {
  // recorded 2026-10-19 from steamcommunity.com/id/robinwalker/?xml=1 (cut short)
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><profile>\n\t<steamID64>76561197960435530</steamID64>\n\t<steamID><![CDATA[Robin]]></steamID>\n\t<onlineState>online</onlineState>\n\t<privacyState>public</privacyState>\n\t<visibilityState>3</visibilityState>\n</profile>';
  assert.deepEqual(parseProfileXml(xml), { steamId: '76561197960435530', name: 'Robin', isPublic: true });
  assert.deepEqual(parseProfileXml(xml.replace('>public<', '>private<')), { steamId: '76561197960435530', name: 'Robin', isPublic: false });
  assert.equal(parseProfileXml('<?xml version="1.0"?><response><error><![CDATA[The specified profile could not be found.]]></error></response>'), 'none');
  assert.equal(parseProfileXml('<!DOCTYPE html><html><title>Sign In</title></html>'), null);
  assert.equal(parseProfileXml({ profile: 1 }), null);
  assert.equal(profileXmlUrl({ vanity: 'robin walker' }), 'https://steamcommunity.com/id/robin%20walker/?xml=1');
  assert.equal(profileXmlUrl({ id: '76561197960435530' }), 'https://steamcommunity.com/profiles/76561197960435530/?xml=1');
});

test('steam: a profile link with a broken escape is taken as typed, not thrown on', () => {
  assert.deepEqual(parseSteamUser('https://steamcommunity.com/id/ab%E0/'), { vanity: 'ab%E0' });
});

test('steam: an empty public library (only game_count: 0) is an empty list; a game listed twice comes in once', () => {
  assert.deepEqual(parseOwnedGames('{"response":{"game_count":0}}'), []);
  assert.equal(parseOwnedGames('{"response":{"game_count":2}}'), null);
  const two = parseOwnedGames({ response: { game_count: 3, games: [{ appid: 10, name: 'A', playtime_forever: 5 }, { appid: 10, name: 'A', playtime_forever: 5 }, { appid: 1.5, name: 'B' }] } });
  assert.ok(Array.isArray(two));
  assert.deepEqual((two as { appid: number }[]).map((g) => g.appid), [10]);
});
