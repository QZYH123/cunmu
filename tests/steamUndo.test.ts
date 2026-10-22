import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordSyncUpdate, steamPriorOf, undoSteamPrior } from '../src/data/steamUndo';
import type { ImportBatch } from '../src/data/persist';
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

test('steam auto-sync: playtime-only runs in a row share one record; undo goes back to before the first', () => {
  const p = (minutes: number, appid = 1) => ({ minutes, provider: 'steam' as const, appid });
  const label = (n: number) => `10 月 21 日 · Steam · 更新 ${n} 部`;
  const g = (m: number) => work('steam-2', 'G2', { source: 'steam', play: p(m, 2) });
  // run 1: bgm-1 60→70, steam-2 5→6
  const s0 = { plays: { 'bgm-1': p(60) }, extras: [g(5)] };
  const pr1 = steamPriorOf(s0.plays, s0.extras, new Map([['steam-2', 1]]), ['bgm-1']);
  let b = recordSyncUpdate([], { id: 'b1', at: '2026-10-21T01:00:00Z', prior: pr1, changed: ['bgm-1', 'steam-2'], merged: ['bgm-1'], label });
  // run 2: bgm-1 70→80 only
  const s1 = { plays: { 'bgm-1': p(70) }, extras: [g(6)] };
  const pr2 = steamPriorOf(s1.plays, s1.extras, new Map([['steam-2', 1]]), ['bgm-1']);
  b = recordSyncUpdate(b, { id: 'b2', at: '2026-10-21T02:00:00Z', prior: pr2, changed: ['bgm-1'], merged: ['bgm-1'], label });
  assert.equal(b.length, 1);
  assert.equal(b[0].id, 'b1');
  assert.equal(b[0].label, label(2));
  assert.deepEqual(b[0].syncUpdated, ['bgm-1', 'steam-2']);
  const back = undoSteamPrior({ plays: { 'bgm-1': p(80) }, extras: [g(6)] }, b[0].steamPrior);
  assert.equal(back.plays['bgm-1'].minutes, 60);
  assert.equal(back.extras[0].play?.minutes, 5);
});

test('steam auto-sync: a manual import, a run that adds games, or an undo in between starts a new record', () => {
  const pr = { plays: {}, extras: {} };
  const run = (id: string, at: string) => ({ id, at, prior: pr, changed: ['x'], merged: [], label: (n: number) => `更新 ${n} 部` });
  const first = recordSyncUpdate([], run('b1', '2026-10-21T01:00:00Z'));
  const other = (o: Partial<ImportBatch>): ImportBatch => ({ id: 'm', provider: 'steam', label: '', createdAt: '2026-10-21T01:30:00Z', created: [], merged: [], skipped: [], quoteIds: [], ...o });
  // a manual Steam import (no syncUpdated)
  assert.equal(recordSyncUpdate([...first, other({})], run('b2', '2026-10-21T02:00:00Z')).length, 3);
  // a run that added games
  assert.equal(recordSyncUpdate([...first, other({ created: ['g'], syncUpdated: undefined })], run('b2', '2026-10-21T02:00:00Z')).length, 3);
  // a 豆瓣 import put first in the list (newest by time, not by place)
  assert.equal(recordSyncUpdate([other({ provider: 'douban_xlsx' }), ...first], run('b2', '2026-10-21T02:00:00Z')).length, 3);
  // another record undone since
  const old = other({ provider: 'douban_xlsx', createdAt: '2026-10-20T00:00:00Z', undoneAt: '2026-10-21T01:30:00Z' });
  assert.equal(recordSyncUpdate([old, ...first], run('b2', '2026-10-21T02:00:00Z')).length, 3);
  // the record itself undone
  assert.equal(recordSyncUpdate([{ ...first[0], undoneAt: '2026-10-21T01:30:00Z' }], run('b2', '2026-10-21T02:00:00Z')).length, 2);
  // nothing in between: one record
  assert.equal(recordSyncUpdate([old, ...first].map((b) => ({ ...b, undoneAt: b.id === 'm' ? '2026-10-20T01:00:00Z' : b.undoneAt })), run('b2', '2026-10-21T02:00:00Z')).length, 2);
});

test('设置 › Steam 撤销这次导入: the newest Steam record still standing, none once all are undone', async () => {
  const { lastBatchOf } = await import('../src/data/batches');
  const b = (id: string, at: string, o: Partial<ImportBatch> = {}): ImportBatch => ({ id, provider: 'steam', label: id, createdAt: at, created: [], merged: [], skipped: [], quoteIds: [], ...o });
  const list = [b('s1', '2026-10-01T00:00:00Z'), b('d1', '2026-10-09T00:00:00Z', { provider: 'douban_xlsx' }), b('s2', '2026-10-05T00:00:00Z'), b('s3', '2026-10-08T00:00:00Z', { undoneAt: '2026-10-08T01:00:00Z' })];
  assert.equal(lastBatchOf(list, 'steam')?.id, 's2');
  assert.equal(lastBatchOf(list.map((x) => ({ ...x, undoneAt: 'x' })), 'steam'), null);
});
