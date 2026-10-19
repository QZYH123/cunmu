import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverUrlOk, manualWork } from '../src/components/ManualAdd';

const base = { id: 'manual-x', title: '  极乐迪斯科 ', kind: 'game' as const, maker: ' ZA/UM ', cover: null, when: 'today' as const, day: '', year: '', approx: false, words: '', today: '2026-10-19', at: '2026-10-19T04:00:00.000Z' };

test('手动填写: the name trimmed, the maker as the kind\'s core credit, today by default, no note when nothing else was said', () => {
  const { work, note } = manualWork(base);
  assert.equal(work.title, '极乐迪斯科');
  assert.deepEqual(work.credits, [{ name: 'ZA/UM', role: '开发', core: true }]);
  assert.equal(work.finished, '2026-10-19');
  assert.equal(work.source, 'manual');
  assert.equal(note, undefined);
  assert.deepEqual(manualWork({ ...base, maker: '  ' }).work.credits, []);
});

test('手动填写: a day, 约 a year, or 不记得了 is the user\'s own date claim; a few words are the review', () => {
  const day = manualWork({ ...base, when: 'day', day: '2021-03-04' });
  assert.equal(day.work.finished, '2021-03-04');
  assert.deepEqual(day.note?.date, { source: 'user', value: '2021-03-04', precision: 'day', baseLevel: 1, observedAt: base.at });
  const year = manualWork({ ...base, when: 'year', year: '2019', approx: true, words: '第一段\n\n第二段 ' });
  assert.equal(year.work.finished, '2019');
  assert.equal(year.note?.date?.approx, true);
  assert.deepEqual(year.note?.review, ['第一段', '第二段']);
  const forgot = manualWork({ ...base, when: 'forgot' });
  assert.equal(forgot.work.finished, '');
  assert.equal(forgot.note?.date?.value, null);
  assert.equal(forgot.note?.date?.precision, 'unknown');
});

test('手动填写: a picture address is https', () => {
  assert.ok(coverUrlOk(' https://example.com/a.jpg '));
  assert.ok(!coverUrlOk('http://example.com/a.jpg'));
  assert.ok(!coverUrlOk('example.com/a.jpg'));
});
