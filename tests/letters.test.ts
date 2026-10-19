import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byLetter, hanReader, letterOf, OTHER } from '../src/lib/letters';

test('按首字母: Chinese titles by their pinyin initial, traditional forms too', () => {
  assert.equal(letterOf('阿凡达'), 'A');
  assert.equal(letterOf('百年孤独'), 'B');
  assert.equal(letterOf('龍族'), 'L');
  assert.equal(letterOf('三体'), 'S');
  assert.equal(letterOf('葬送的芙莉莲'), 'Z');
  assert.equal(letterOf('《活着》'), 'H', 'brackets and quotes before the first letter are skipped');
});

test('按首字母: Latin by its letter, accents and full-width forms plainly; kana by Hepburn', () => {
  assert.equal(letterOf('Émile'), 'E');
  assert.equal(letterOf('ＢＬＥＡＣＨ'), 'B');
  assert.equal(letterOf('  the end'), 'T');
  assert.equal(letterOf('しろくまカフェ'), 'S');
  assert.equal(letterOf('チェンソーマン'), 'C');
  assert.equal(letterOf('つばさ'), 'T');
  assert.equal(letterOf('ふしぎ'), 'F');
  assert.equal(letterOf('ガンダム'), 'G');
  assert.equal(letterOf('を'), 'O');
});

test('按首字母: digits, marks and what has no reading go under #', () => {
  for (const t of ['1984', '!!!', '', '한국', '々']) assert.equal(letterOf(t), OTHER, t);
});

test('按首字母: A–Z with # last; Chinese by pinyin, then Latin, then kana within a letter', () => {
  const titles = ['Zelda', '中国', '阿凡达', 'Animal', 'あ', '1984', '安', '八月', 'バ', 'Bleach'];
  assert.deepEqual(byLetter(titles, (t) => t), ['阿凡达', '安', 'Animal', 'あ', '八月', 'Bleach', 'バ', '中国', 'Zelda', '1984']);
  const same = [{ t: 'x', n: 1 }, { t: 'x', n: 2 }];
  assert.deepEqual(byLetter(same, (o) => o.t).map((o) => o.n), [1, 2], 'equal titles keep their order');
});

test('按首字母: a collation that reads Chinese wrongly is not trusted', () => {
  assert.equal(hanReader(new Intl.Collator('en')), null);
  assert.notEqual(hanReader(new Intl.Collator('zh-u-co-pinyin')), null);
});
