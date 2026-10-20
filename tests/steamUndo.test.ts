import { test } from 'node:test';
import assert from 'node:assert/strict';
import { steamPriorOf, undoSteamPrior } from '../src/data/steamUndo';
import type { Work } from '../src/data/types';

const work = (id: string, title: string, extra: Partial<Work> = {}): Work => ({ id, kind: 'game', title, credits: [], finished: '', collected: '', source: 'manual', cover: null, genres: [], info: [], ...extra });

test('steam undo: playtime on games already here goes back; read-on-demand facts stay; old batches unchanged', () => {
  const old = { minutes: 60, provider: 'steam' as const, appid: 1 };
  const claims = [{ source: 'steam_last_played' as never, value: '2020-01-01', precision: 'day' as const, baseLevel: 2, observedAt: 'x' }];
  const ex = work('steam-2', 'G2', { source: 'steam', play: { minutes: 5, provider: 'steam', appid: 2 }, claims });
  const before = { plays: { 'bgm-1': old, 'bgm-9': { ...old, appid: 9 } }, extras: [ex] };
  const prior = steamPriorOf(before.plays, before.extras, new Map([['steam-2', 1]]), ['bgm-1', 'bgm-3']);
  const ach = { done: 1, total: 2 } as never;
  const after = {
    plays: { 'bgm-1': { ...old, minutes: 99, ach }, 'bgm-3': { ...old, appid: 3 } },
    extras: [{ ...ex, play: { minutes: 50, provider: 'steam' as const, appid: 2 }, claims: [] }],
  };
  const back = undoSteamPrior(after, prior);
  assert.equal(back.plays['bgm-1'].minutes, 60);
  assert.equal(back.plays['bgm-1'].ach, ach);
  assert.equal(back.plays['bgm-3'], undefined);
  assert.equal(back.plays['bgm-9'].appid, 9);
  assert.equal(back.extras[0].play?.minutes, 5);
  assert.deepEqual(back.extras[0].claims, claims);
  assert.equal(undoSteamPrior(after, undefined), after);
});
