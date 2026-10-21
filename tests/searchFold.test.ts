import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, hitRange, worksMatching } from '../src/lib/searchText';
import type { Work } from '../src/data/types';

const work = (id: string, title: string, extra: Partial<Work> = {}): Work => ({ id, kind: 'game', title, credits: [], finished: '', collected: '', source: 'manual', cover: null, genres: [], info: [], ...extra });

test('search: full-width and half-width are the same, case folded', () => {
  assert.equal(fold('ＡＢＣ１２３'), 'abc123');
  const lib = [work('a', 'ＮＩＥＲ：Ａｕｔｏｍａｔａ'), work('b', 'Persona 5')];
  assert.deepEqual(worksMatching('nier', lib).map((w) => w.id), ['a']);
  assert.deepEqual(worksMatching('ｐｅｒｓｏｎａ ５', lib).map((w) => w.id), ['b']);
  assert.deepEqual(hitRange('ＮＩＥＲ', 'ni'), [0, 2]);
  assert.equal(hitRange('㍿会社', '株式'), null);
});
