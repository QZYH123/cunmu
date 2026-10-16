import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixMe, inPeriod, interestMembers, periodEssays, periodMembers, spanText, chapterOrder, isMetaTag, EMPTY_ME, type Period } from '../src/data/me';
import { migrateV1toV2, migrateV2toV3, SCHEMA_VERSION, load, serialize } from '../src/data/persist';
import type { Work } from '../src/data/types';

const w = (id: string, finished: string, extra: Partial<Work> = {}): Work => ({
  id, kind: 'anime', title: id, credits: [], finished, collected: '', source: 'bangumi', cover: null, genres: [], info: [], ...extra,
});

test('periods: a work is in a period at the period\'s own precision', () => {
  const p = { from: '2014-03', to: '2014-05' };
  assert.equal(inPeriod(p, '2014-03-02', '2026-10-11'), true);
  assert.equal(inPeriod(p, '2014-05-31', '2026-10-11'), true);
  assert.equal(inPeriod(p, '2014-06-01', '2026-10-11'), false);
  assert.equal(inPeriod(p, '2014-02-28', '2026-10-11'), false);
  assert.equal(inPeriod(p, '2014', '2026-10-11'), false, 'a year-only date is too loose for a span of months');
  assert.equal(inPeriod(p, '', '2026-10-11'), false);
  const years = { from: '2011', to: '2014' };
  assert.equal(inPeriod(years, '2011', '2026-10-11'), true);
  assert.equal(inPeriod(years, '2014-12-31', '2026-10-11'), true);
  assert.equal(inPeriod(years, '2015-01-01', '2026-10-11'), false);
  const open = { from: '2023', to: null };
  assert.equal(inPeriod(open, '2026-10-11', '2026-10-11'), true, 'a period still going runs to today');
});

test('periods: members oldest first, by hand in and out; essays apart', () => {
  const ws = [w('a', '2014-03-02'), w('b', '2014-04-10'), w('c', '2014-07-01'), w('d', '2014-04-20', { kind: 'essay' }), w('e', '2014-05-01')];
  const p: Period = { id: 'p', name: '推理那个春天', from: '2014-03', to: '2014-05', include: ['c'], exclude: ['e'], createdAt: '' };
  assert.deepEqual(periodMembers(p, ws, '2026-10-11').map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(periodEssays(p, ws, '2026-10-11').map((x) => x.id), ['d']);
  assert.equal(spanText(p), '2014 年 3 月 – 5 月');
  assert.equal(spanText({ from: '2011', to: '2014' }), '2011 – 2014');
  assert.equal(spanText({ from: '2023', to: null }), '2023 –');
  assert.equal(spanText({ from: '2013-11', to: '2014-02' }), '2013 年 11 月 – 2014 年 2 月');
  assert.deepEqual(chapterOrder([{ ...p, id: 'x', from: '2018' }, p]).map((x) => x.id), ['p', 'x']);
});

test('interests: by tag (Bangumi\'s, yours, genres) or by creator; by hand wins', () => {
  const ws = [
    w('a', '2020-01-01', { tags: ['科幻', '漫画'] }),
    w('b', '2021-01-01', { genres: ['科幻'] }),
    w('c', '2022-01-01', { myTags: ['科幻'] }),
    w('d', '2023-01-01', { credits: [{ name: '今敏', role: '导演', core: true }] }),
    w('e', '2019-01-01', { tags: ['科幻'], kind: 'essay' }),
    w('f', '2018-01-01'),
  ];
  assert.deepEqual(interestMembers({ rule: { tags: ['科幻'] }, include: ['f'], exclude: ['b'] }, ws).map((x) => x.id), ['c', 'a', 'f']);
  assert.deepEqual(interestMembers({ rule: { people: ['今敏'] }, include: [], exclude: [] }, ws).map((x) => x.id), ['d']);
  assert.equal(isMetaTag('漫画'), true); assert.equal(isMetaTag('2014'), true); assert.equal(isMetaTag('2014年4月'), true); assert.equal(isMetaTag('科幻'), false);
});

test('migration: a schema-2 save gains an empty 「我」 and keeps everything else', () => {
  const v2 = { schemaVersion: 2, extras: [w('m', '2024-05-01', { source: 'manual' })], notes: { m: { review: ['好'] } }, title: '沈舟', theme: 'dark' };
  const m = migrateV1toV2(v2, '2026-10-11T00:00:00Z');
  assert.equal(m.schemaVersion, 4); assert.equal(SCHEMA_VERSION, 4);
  assert.deepEqual(m.me, EMPTY_ME);
  assert.equal(m.title, '沈舟'); assert.equal(m.theme, 'dark'); assert.equal(m.extras.length, 1); assert.deepEqual(m.notes.m.review, ['好']);
  assert.deepEqual(migrateV1toV2(m, '2026-10-11T00:00:00Z'), m, 'idempotent');
  // a v1 save goes all the way
  const v1 = migrateV1toV2({ extras: [], tier: 0 }, '2026-10-11T00:00:00Z');
  assert.equal(v1.schemaVersion, 4); assert.deepEqual(v1.me, EMPTY_ME);
});

test('migration: odd shapes are mended, a bad birthday is dropped, a round trip holds', () => {
  const m = fixMe({ profile: { line: '  ', lead: 'x', frontispiece: 3 }, favorites: [{ id: 'a' }, { id: 'a' }, { nope: 1 }], interests: [{ id: 'i', name: '科幻' }], periods: [{ id: 'p', name: 'P', from: '2014', to: 5 }], onlyMe: ['e', 'e', 1], dismissed: 'x' });
  assert.deepEqual(m.profile, { lead: 'x' });
  assert.deepEqual(m.favorites.map((f) => f.id), ['a']);
  assert.deepEqual(m.interests[0], { id: 'i', name: '科幻', rule: {}, include: [], exclude: [] });
  assert.equal(m.periods[0].to, null);
  assert.deepEqual(m.onlyMe, ['e']); assert.deepEqual(m.dismissed, []);
  assert.equal(migrateV2toV3({ schemaVersion: 2, birthday: '1995-6-3' }).birthday, undefined);
  assert.equal(migrateV2toV3({ schemaVersion: 2, birthday: '1995-06-03' }).birthday, '1995-06-03');
  const s = migrateV1toV2({ schemaVersion: 3, me: { ...EMPTY_ME, favorites: [{ id: 'bgm-1', why: '看过四遍', at: 'x' }] }, birthday: '1995-06-03' }, '2026-10-11T00:00:00Z');
  let bak = '';
  const back = load(serialize(s), (t) => { bak = t; });
  assert.equal(bak, '', 'a current save is not copied aside');
  assert.deepEqual(back.me.favorites, s.me.favorites); assert.equal(back.birthday, '1995-06-03');
  load(serialize({ ...s, schemaVersion: 2 } as never), (t) => { bak = t; });
  assert.ok(bak.length > 0, 'an older save is copied aside before it is moved up');
});
