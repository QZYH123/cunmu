import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capped, INDEX_PEOPLE_CAP, INDEX_WORK_CAP } from '../src/data/lists';
import { groupKeys, sortWorksBy } from '../src/data/catOrder';
import type { Work } from '../src/data/types';

test('B-10: long index lists keep the rest instead of dropping it', () => {
  const people = Array.from({ length: INDEX_PEOPLE_CAP + 3 }, (_, i) => i);
  assert.equal(capped(people, INDEX_PEOPLE_CAP, false).shown.length, INDEX_PEOPLE_CAP);
  assert.equal(capped(people, INDEX_PEOPLE_CAP, false).rest, 3);
  assert.equal(capped(people, INDEX_PEOPLE_CAP, true).rest, 0);
  assert.equal(capped(people, INDEX_PEOPLE_CAP, true).shown.length, people.length);
  const works = Array.from({ length: INDEX_WORK_CAP }, (_, i) => i);
  assert.equal(capped(works, INDEX_WORK_CAP, false).rest, 0);
});

test('B-7: a work with no date sorts after every dated one', () => {
  const w = (id: string, finished: string): Work => ({
    id, kind: 'book', title: id, credits: [], finished, collected: '', source: 'manual', cover: null, genres: [], info: [],
  });
  const rows = [w('none', ''), w('new', '2020-01-02'), w('old', '2019')];
  assert.deepEqual(sortWorksBy(rows, { key: 'finished', dir: 'asc' }).map((x) => x.id), ['old', 'new', 'none']);
  assert.deepEqual(sortWorksBy(rows, { key: 'finished', dir: 'desc' }).map((x) => x.id), ['new', 'old', 'none']);
});

test('B-8: 按类型 puts a work under every genre', () => {
  const w = { genres: ['推理', '历史'], title: '甲', finished: '2020' } as Work;
  assert.deepEqual(groupKeys(w, 'genre'), ['推理', '历史']);
  assert.deepEqual(groupKeys({ ...w, genres: [] }, 'genre'), ['其他']);
  assert.deepEqual(groupKeys({ ...w, finished: '' }, 'period'), ['']);
});
