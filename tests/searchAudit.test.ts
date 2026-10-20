import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_EMPTY, hitAside, searchMeta, worksMatching } from '../src/lib/searchText';
import type { Work } from '../src/data/types';

test('B-12 / B-13: search matches every credit, and says why when the title does not', () => {
  const w: Work = {
    id: '1', kind: 'book', title: '闻青棹', originalTitle: 'Blue House', credits: [
      { name: '闻青棹', role: '作者', core: true },
      { name: '牧晚汀', role: '译者' },
    ], finished: '2026', collected: '', source: 'manual', cover: null, genres: [], info: [],
  };
  assert.equal(worksMatching('牧晚汀', [w]).length, 1);
  assert.equal(worksMatching('没有', [w]).length, 0);
  assert.equal(hitAside(w, 'blue'), 'Blue House');
  assert.equal(hitAside(w, '牧晚汀'), '牧晚汀');
  assert.equal(hitAside(w, '闻青棹'), undefined);
  assert.equal(searchMeta(w, 'blue'), '闻青棹 · Blue House · 2026');
  assert.equal(SEARCH_EMPTY, '没有叫这个的条目');
});
