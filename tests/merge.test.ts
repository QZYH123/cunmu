import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldNote } from '../src/data/store';

test('合并: pictures and a date on the imported one are kept, not dropped', () => {
  const date = { source: 'user' as const, value: '2020-01', precision: 'month' as const, baseLevel: 1, observedAt: 'x' };
  const im = { id: 'i1', src: 'idb:i1', aspect: 1, addedAt: 'x' };
  const n = foldNote({ images: [im], date, review: ['b'] }, { review: ['a'], images: [{ ...im, id: 'i0', src: 'idb:i0' }] });
  assert.deepEqual(n.images?.map((i) => i.id), ['i0', 'i1']);
  assert.deepEqual(n.date, date);
  assert.deepEqual(n.review, ['a', 'b']);
  const own = { ...date, value: '2019' };
  assert.equal(foldNote({ date }, { date: own }).date, own);
});

test('合并: a 最爱 and the frontispiece follow the imported one into the one you had', async () => {
  const { repointMe } = await import('../src/data/store');
  const { EMPTY_ME } = await import('../src/data/me');
  const me = { ...EMPTY_ME, favorites: [{ id: 'a', at: 't' }, { id: 'c', at: 't' }], profile: { frontispiece: 'a' } };
  const r = repointMe(me, 'a', 'b');
  assert.deepEqual(r.favorites.map((f) => f.id), ['b', 'c']);
  assert.equal(r.profile.frontispiece, 'b');
  assert.deepEqual(repointMe({ ...me, favorites: [{ id: 'a', at: 't' }, { id: 'b', at: 't' }] }, 'a', 'b').favorites.map((f) => f.id), ['b']);
});

test('合并: 只给自己 on the imported one keeps the merged one hidden', async () => {
  const me = { ...(await import('../src/data/me')).EMPTY_ME, onlyMe: ['a'] };
  assert.deepEqual((await import('../src/data/store')).repointMe(me, 'a', 'b').onlyMe, ['b']);
  assert.deepEqual((await import('../src/data/store')).repointMe({ ...me, onlyMe: ['a', 'b'] }, 'a', 'b').onlyMe, ['b']);
  assert.equal((await import('../src/data/store')).repointMe({ ...(await import('../src/data/me')).EMPTY_ME, onlyMe: ['b'] }, 'a', 'b').onlyMe.includes('b'), true);
});
