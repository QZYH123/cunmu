import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bangumiUsername } from '../src/lib/bangumi';

test('C-13: a Bangumi profile link is the username; a subject link is not', () => {
  assert.equal(bangumiUsername('https://bgm.tv/user/reader'), 'reader');
  assert.equal(bangumiUsername('https://bangumi.tv/user/reader/'), 'reader');
  assert.equal(bangumiUsername('reader'), 'reader');
  assert.equal(bangumiUsername('https://bgm.tv/subject/12345'), null);
  assert.equal(bangumiUsername('不是用户名'), null);
});
