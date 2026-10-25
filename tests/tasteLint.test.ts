import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COPY, HEADLINE_COPY, SAMPLE, fill } from '../src/data/taste/copy';
import { lintSentence } from '../src/data/taste/lint';

const BANNED = ['回忆', '时光', '岁月', '专属', '年度报告', '一键', '少年', '独自', '重看', '话数', '阅读时长', '深夜', '通勤', '心情'];

test('every written variant, filled with the sample slots, passes', () => {
  for (const [tid, variants] of Object.entries(COPY)) {
    for (const [name, tpl] of Object.entries(variants)) {
      assert.deepEqual(lintSentence(fill(tpl, SAMPLE)), [], `${tid}/${name}`);
    }
  }
  for (const [id, tpl] of Object.entries(HEADLINE_COPY)) {
    assert.deepEqual(lintSentence(fill(tpl, SAMPLE)), [], id);
  }
});

test('a generated sentence is dropped for voice, length, or a measure word', () => {
  for (const w of BANNED) assert.ok(lintSentence(`这里有${w}`).includes('banned'), w);
  assert.ok(lintSentence('on the commute').includes('banned-en'));
  assert.ok(lintSentence('late-night').includes('banned-en'));
  assert.ok(lintSentence('age').includes('banned-en'));
  assert.deepEqual(lintSentence('pages'), []);
  assert.ok(lintSentence('3 本').includes('measure'));
  assert.ok(lintSentence('两张').includes('measure'));
  assert.ok(lintSentence('1 款').includes('measure'));
  assert.deepEqual(lintSentence('3 部'), []);
  assert.ok(lintSentence('1 2 3 4').includes('numbers'));
  assert.ok(lintSentence('啊'.repeat(61)).includes('length'));
  assert.deepEqual(lintSentence('啊'.repeat(60)).filter((p) => p === 'length'), []);
  assert.ok(lintSentence('好呀').includes('particle'));
  assert.ok(lintSentence('太好了！').includes('exclamation'));
  assert.ok(lintSentence('好!').includes('exclamation'));
  assert.ok(lintSentence('好👍').includes('emoji'));
});
