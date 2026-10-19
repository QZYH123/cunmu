import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANGUMI_FILE_NO_TOKEN, STEAM_FILE_NO_KEY, bangumiFromBackup, steamFromBackup } from '../src/data/restore';
import { entryWhen } from '../src/data/derive';
import type { EffDate } from '../src/data/types';
import { nameFromCard, sheetMembers } from '../src/data/suggest';
import { essayBody, essayPlan } from '../src/lib/essay';

const today = '2026-10-19';
const now = '2026-10-19T12:00:00.000Z';
const tokenFile = { mode: 'token', username: 'sakura', userId: 1, nickname: '樱' };

test('C-2: a restore keeps a token still on the device', () => {
  const c = bangumiFromBackup(tokenFile, { demo: false, hasToken: true, today, now });
  assert.equal(c?.status, 'connected');
  assert.equal(c?.mode, 'token');
  assert.equal(c?.userId, 1);
  assert.equal(c?.problem, undefined);
  assert.equal(c?.lastOkSyncAt, undefined);
});

test('C-2: a restore with no token on the device says the file has none', () => {
  const c = bangumiFromBackup(tokenFile, { demo: false, hasToken: false, today, now });
  assert.equal(c?.problem, 'absent');
  assert.equal(BANGUMI_FILE_NO_TOKEN, '导出文件里没有令牌。填一个新的就能接着同步，已经搬进来的都还在。');
});

test('C-2: a public Bangumi connection is not asked for a token', () => {
  const c = bangumiFromBackup({ ...tokenFile, mode: 'public' }, { demo: false, hasToken: false, today, now });
  assert.equal(c?.mode, 'public');
  assert.equal(c?.problem, undefined);
});

test('C-2: the demo restore still pretends the last sync just happened', () => {
  const c = bangumiFromBackup({ mode: 'token', username: 'sakura' }, { demo: true, hasToken: false, today, now });
  assert.equal(c?.problem, undefined);
  assert.equal(c?.lastOkSyncAt, now);
  assert.equal(c?.userId, undefined);
});

test('C-2: a restore keeps a Steam key still on the device', () => {
  const c = steamFromBackup({ steamId: '76561198000000000', vanity: 'yanagi' }, { hasKey: true });
  assert.equal(c?.status, 'connected');
  assert.equal(c?.steamId, '76561198000000000');
  assert.equal(c?.vanity, 'yanagi');
  assert.equal(c?.problem, undefined);
});

test('C-2: a restore with no Steam key on the device says the file has none', () => {
  const c = steamFromBackup({ steamId: '76561198000000000' }, { hasKey: false });
  assert.equal(c?.problem, 'absent');
  assert.equal(STEAM_FILE_NO_KEY, '导出文件里没有 Key。填一个新的就能接着读。');
});

const approx = { approx: true } as EffDate;
test('A-4: an essay with only a picture is saved; a cleared one is dropped; a title still fills the body', () => {
  assert.equal(essayPlan({ existing: false, title: '', paragraphs: [], photo: true }), 'save');
  assert.equal(essayPlan({ existing: false, title: '  ', paragraphs: [], photo: false }), 'skip');
  assert.equal(essayPlan({ existing: true, title: '', paragraphs: [], photo: false }), 'drop');
  assert.equal(essayPlan({ existing: true, title: '', paragraphs: [], photo: true }), 'save');
  assert.deepEqual(essayBody('', []), []);
  assert.deepEqual(essayBody('无题', []), ['无题']);
  assert.deepEqual(essayBody('无题', ['一段']), ['一段']);
});

test('A-2: Enter on an empty name does nothing', () => {
  assert.equal(nameFromCard(''), null);
  assert.equal(nameFromCard('   '), null);
  assert.equal(nameFromCard(' 舟 '), '舟');
});

test('A-3: the sheet lists every member and the count is how many stay on', () => {
  const members = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}` }));
  const on = new Set(members.map((m) => m.id));
  on.delete('w0');
  const r = sheetMembers(members, on);
  assert.equal(r.shown.length, 30);
  assert.equal(r.count, 29);
  assert.deepEqual(r.exclude, ['w0']);
});

test('B-1: an entry shows the day that was picked', () => {
  assert.equal(entryWhen({ finished: '2026-10-03' }, 2026), '10 月 3 日');
  assert.equal(entryWhen({ finished: '2026-10' }, 2026), '十月');
  assert.equal(entryWhen({ finished: '2024-03-16' }, 2026), '2024 · 三月');
  assert.equal(entryWhen({ finished: '2021', date: approx }, 2026), '约 2021');
  assert.equal(entryWhen({ finished: '2021' }, 2026), '2021');
  assert.equal(entryWhen({ finished: '' }, 2026), '时间未知');
});
