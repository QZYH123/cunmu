import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openInShow } from '../src/components/ShowMode';
import { normRange } from '../src/lib/longImage';

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
