import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openInShow } from '../src/components/ShowMode';
import { normRange } from '../src/lib/longImage';
import { shownPeriods, viewerWorks, type Period } from '../src/data/me';
import type { Work } from '../src/data/types';

test('给人看 counts drop samples and 只给自己; the owner still counts both', () => {
  const works = [
    { id: 'a' },
    { id: 'secret' },
    { id: 'sample', isSample: true as const },
    undefined,
  ];
  assert.deepEqual(viewerWorks(works, false, ['secret']).map((w) => w.id), ['a', 'secret', 'sample']);
  assert.deepEqual(viewerWorks(works, true, ['secret']).map((w) => w.id), ['a']);
});

test('给人看: a guest can open 首页, interests, periods and the works and essays they name — nothing else', () => {
  for (const p of ['/', '/interest/i-1', '/period/p-1', '/entry/bgm-1', '/essay/e-1']) assert.ok(openInShow(p, []), p);
  for (const p of ['/all', '/search', '/settings', '/me', '/me/organize', '/write', '/wall', '/year/2020', '/person/x', '/kind/book', '/index/people', '/doing', '/unknown'])
    assert.ok(!openInShow(p, []), p);
  // 只给自己 stays closed even by its address
  assert.ok(!openInShow('/entry/bgm-1', ['bgm-1']));
  assert.ok(!openInShow('/essay/e-1', ['e-1']));
});

test('long image: the browser\'s unicode-range and the stylesheet\'s are the same range', () => {
  assert.equal(normRange('U+0000-00FF, U+0131'), normRange('U+131, U+0-FF'));
  assert.notEqual(normRange('U+4E00-4E3F'), normRange('U+4E40-4E7F'));
  assert.equal(normRange(''), normRange('U+0-10FFFF'));
});

test('a link with a broken escape (%E0) is read as typed, not thrown on', () => {
  assert.equal(openInShow('/entry/%E0%A4', []), true);
  assert.equal(openInShow('/entry/%E0%A4', ['%E0%A4']), false);
});

test('给人看: a period with no works a guest can see is hidden, and its address does not open', () => {
  const w = (id: string, finished: string, kind = 'book'): Work => ({ id, kind, title: id, credits: [], finished, collected: '', source: 'manual', cover: null, genres: [], info: [] } as Work);
  const per = (id: string, from: string, to: string, include: string[] = []): Period => ({ id, name: id, from, to, include, exclude: [], createdAt: '2020-01-01' } as Period);
  const all = [w('a', '2015-05-01'), w('secret', '2018-05-01'), w('e', '2019-05-01', 'essay')];
  const onlyMe = ['secret'];
  const visible = all.filter((x) => !onlyMe.includes(x.id));
  const ps = [per('p-has', '2015-01', '2015-12'), per('p-secret', '2018-01', '2018-12'), per('p-empty', '2016-01', '2016-12'), per('p-inc', '2017-01', '2017-12', ['a'])];
  assert.deepEqual(shownPeriods(ps, visible, '2026-10-21').map((p) => p.id), ['p-has', 'p-inc']);
  // the owner sees them all (with every work, the 只给自己 one counts)
  assert.deepEqual(shownPeriods(ps, all, '2026-10-21').map((p) => p.id), ['p-has', 'p-secret', 'p-inc']);
  assert.ok(!openInShow('/period/p-secret', onlyMe, ['p-secret', 'p-empty']));
  assert.ok(openInShow('/period/p-has', onlyMe, ['p-secret', 'p-empty']));
});
