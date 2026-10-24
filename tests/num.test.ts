import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COPY, HEADLINE_COPY, fill } from '../src/data/taste/copy';
import { cnDecades, cnYears, daysTier, hoursTier, numbersInCn, shareWord } from '../src/data/taste/num';

const hours = (h: number) => hoursTier(h * 60);
const days = (d: number) => daysTier(d * 24 * 60);

test('hours step down by 100, then by 1000, and an exact step drops 多', () => {
  assert.equal(hours(99), '');
  assert.equal(hours(100), '100 个小时');
  assert.equal(hours(799), '700 多个小时');
  assert.equal(hours(800), '800 个小时');
  assert.equal(hours(899), '800 多个小时');
  assert.equal(hours(1200), '1,200 个小时');
  assert.equal(hours(10000), '10,000 个小时');
  assert.equal(hours(10999), '10,000 多个小时');
});

test('days under 10 stay exact; from 10 they step by 10', () => {
  assert.equal(days(2), '2 天');
  assert.equal(days(2.5), '2.5 天');
  assert.equal(days(9.9), '9.9 天');
  assert.equal(days(10), '10 天');
  assert.equal(days(170), '170 天');
  assert.equal(days(171), '170 多天');
});

test('成 is never rounded up', () => {
  assert.equal(shareWord(0.9), '九成');
  assert.equal(shareWord(0.8), '八成');
  assert.equal(shareWord(0.799), '七成');
  assert.equal(shareWord(0.7), '七成');
  assert.equal(shareWord(0.699), null);
});

test('years up to 99 are spoken; 100 stays a figure', () => {
  assert.equal(cnYears(6), '六');
  assert.equal(cnYears(10), '十');
  assert.equal(cnYears(14), '十四');
  assert.equal(cnYears(20), '二十');
  assert.equal(cnYears(31), '三十一');
  assert.equal(cnYears(99), '九十九');
  assert.equal(cnYears(100), '100');
  assert.equal(cnDecades(20), '二十年');
  assert.equal(cnDecades(30), '三十年');
  assert.equal(cnDecades(38), '三十多年');
});

test('a sentence counts the numbers it states, and grammar 一 does not count', () => {
  assert.equal(numbersInCn(fill(COPY.L1.full, { from: 2014, to: 2026, a: '科幻', b: '推理' })), 3);
  assert.equal(numbersInCn(fill(COPY.L4.full, { topic: '推理', firstYear: 2017, lastYear: 2026, firstTitle: '三体', lastTitle: '余下', span: '九' })), 3);
  assert.equal(numbersInCn(fill(HEADLINE_COPY.H2, { span: '九', p: '伊坂幸太郎' })), 1);
  assert.equal(numbersInCn('1,200 个小时'), 1);
  assert.equal(numbersInCn('十四年'), 1);
  assert.equal(numbersInCn('三十多年'), 1);
  assert.equal(numbersInCn('一年没落下'), 0);
  assert.equal(numbersInCn('一部'), 0);
  assert.equal(numbersInCn('第一部'), 0);
  assert.equal(numbersInCn('第十四部'), 0);
  assert.equal(numbersInCn('两部'), 1);
  assert.equal(numbersInCn('九成'), 1);
  assert.equal(numbersInCn('每一年'), 0);
  assert.equal(numbersInCn('第一次'), 0);
});
