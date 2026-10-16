import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epigraphOf, normalizeNoteQuotes, normalizeQuotes } from '../src/data/quotes';
import { load } from '../src/data/persist';

test('quotes: a bare string becomes a quote, bad items are skipped, nothing throws', () => {
  const got = normalizeQuotes(['  一句话  ', '', null, 3, [], {}, { text: 42 }, { text: '好', where: 'p.3', date: '2024-01-02', starred: true, note: {} }, { quote: '旧格式' }]);
  assert.deepEqual(got, [
    { text: '一句话', date: '' },
    { text: '42', date: '' },
    { text: '好', date: '2024-01-02', where: 'p.3', starred: true },
    { text: '旧格式', date: '' },
  ]);
  assert.deepEqual(normalizeQuotes('只有一句'), [{ text: '只有一句', date: '' }]);
  for (const bad of [undefined, null, 0, true, {}, { foo: 1 }]) assert.deepEqual(normalizeQuotes(bad), []);
});

test('quotes: notes from a file keep their other fields and lose quotes that come out empty', () => {
  const n = normalizeNoteQuotes<{ quotes?: unknown; review?: string[] }>({ a: { quotes: '一句', review: ['x'] }, b: { quotes: [null] }, c: 'junk' });
  assert.deepEqual(n, { a: { quotes: [{ text: '一句', date: '' }], review: ['x'] }, b: {} });
  assert.deepEqual(normalizeNoteQuotes(null), {});
});

test('quotes: a saved library with malformed quotes loads', () => {
  const s = load(JSON.stringify({ schemaVersion: 4, notes: { w1: { quotes: ['摘一句', { nope: 1 }] } }, extras: [{ id: 'm1', kind: 'book', title: 't', credits: [], finished: '', collected: '2024-01-01', source: 'manual', cover: null, genres: [], info: [], quotes: 'x' }] }));
  assert.deepEqual(s.notes.w1.quotes, [{ text: '摘一句', date: '' }]);
  assert.deepEqual(s.extras[0].quotes, [{ text: 'x', date: '' }]);
});

test('quotes: the one under the title is starred, else the earliest dated; undated alone gives none', () => {
  const u = { text: '没日期', date: '' }, a = { text: 'a', date: '2024-05-01' }, b = { text: 'b', date: '2023-01-01' };
  assert.equal(epigraphOf([u, a, b]), b);
  assert.equal(epigraphOf([u]), undefined);
  assert.equal(epigraphOf([]), undefined);
  const s = { ...u, starred: true };
  assert.equal(epigraphOf([a, s]), s);
});
