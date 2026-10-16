import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backStep } from '../src/lib/shell';
import { pickEvictions } from '../src/lib/lru';
import { diagnosticsText } from '../src/lib/diagnostics';

test('android back: the top thing first, then a page back, then 首页, then leave', () => {
  assert.equal(backStep({ overlay: true, picking: false, hash: '#/entry/1', canGoBack: true }), 'escape');
  assert.equal(backStep({ overlay: false, picking: true, hash: '#/year/2024', canGoBack: true }), 'escape');
  assert.equal(backStep({ overlay: true, picking: false, hash: '#/', canGoBack: false }), 'escape');
  assert.equal(backStep({ overlay: false, picking: false, hash: '#/entry/1', canGoBack: true }), 'back');
  // opened straight on a page (a link from outside): nothing to go back to, so 首页 rather than gone
  assert.equal(backStep({ overlay: false, picking: false, hash: '#/me', canGoBack: false }), 'home');
  for (const hash of ['', '#', '#/']) assert.equal(backStep({ overlay: false, picking: false, hash, canGoBack: true }), 'leave');
});

test('cover cache: under the cap nothing goes; over it the least recently used go down to the target', () => {
  const e = (size: number, used: number) => ({ size, used });
  assert.deepEqual(pickEvictions([['a', e(40, 1)], ['b', e(50, 2)]], 100, 80), []);
  assert.deepEqual(pickEvictions(new Map([['new', e(40, 9)], ['old', e(40, 1)], ['mid', e(40, 5)]]), 100, 80), ['old']);
  assert.deepEqual(pickEvictions([['x', e(60, 3)], ['y', e(60, 2)], ['z', e(60, 1)]], 100, 50), ['z', 'y', 'x']);
});

test('diagnostics: counts and settings, never the person\'s own words', () => {
  const t = diagnosticsText({
    app: 'Cunmu', version: '0.1.0', platform: 'android', userAgent: 'UA', screen: { w: 390, h: 844, dpr: 3 },
    theme: '深色', kinds: { book: 3, anime: 2 }, doing: 1, removed: 0, people: 4, years: 2,
    bangumi: 'public', bangumiProblem: null, lastSync: '2026-10-01T03:00:00Z',
    imports: { douban: 1, wereadPaste: 0 }, saveBytes: 2048, covers: { files: 12, bytes: 3 * 1024 * 1024 },
    reduceMotion: false, fontScale: 1,
  });
  assert.match(t, /^Cunmu 0\.1\.0\n平台：android/);
  assert.match(t, /条目：5（书 3 · 番 2） · 在看 1 · 移出 0/);
  assert.match(t, /Bangumi：用户名 · 上次同步 2026-10-01/);
  assert.match(t, /保存的文件：2 KB/);
  assert.match(t, /封面缓存：12 张，3\.0 MB/);
  // the input carries no titles, names, usernames or tokens, and the text adds none
  assert.doesNotMatch(t, /reader|token|令牌 /);
});

test('android back in 给人看: never out of the mode — back among the open pages, and on 首页 nothing', () => {
  assert.equal(backStep({ overlay: false, picking: false, hash: '#/', canGoBack: true, show: true }), 'stay');
  assert.equal(backStep({ overlay: false, picking: false, hash: '', canGoBack: false, show: true }), 'stay');
  assert.equal(backStep({ overlay: false, picking: false, hash: '#/interest/i-1', canGoBack: true, show: true }), 'back');
  assert.equal(backStep({ overlay: false, picking: false, hash: '#/period/p-1', canGoBack: false, show: true }), 'home');
  // a sheet open on top still closes first
  assert.equal(backStep({ overlay: true, picking: false, hash: '#/', canGoBack: true, show: true }), 'escape');
  // out of the mode, 首页 leaves as before
  assert.equal(backStep({ overlay: false, picking: false, hash: '#/', canGoBack: true }), 'leave');
});
