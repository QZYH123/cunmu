import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastBatchOf } from '../src/data/batches';
import type { ImportBatch } from '../src/data/persist';

const b = (id: string, provider: ImportBatch['provider'], createdAt: string, undoneAt?: string): ImportBatch =>
  ({ id, provider, label: id, createdAt, created: [], merged: [], skipped: [], quoteIds: [], ...(undoneAt ? { undoneAt } : null) });

test('records: the newest one of a provider by time, wherever it sits in the list; undone ones left out', () => {
  // Steam appends, the others prepend
  const list = [b('d2', 'douban_xlsx', '2026-10-02'), b('d1', 'douban_xlsx', '2026-10-01'), b('s1', 'steam', '2026-10-01'), b('s2', 'steam', '2026-10-02'), b('s3', 'steam', '2026-10-03', '2026-10-04')];
  assert.equal(lastBatchOf(list, 'steam')?.id, 's2');
  assert.equal(lastBatchOf(list, 'douban_xlsx')?.id, 'd2');
  assert.equal(lastBatchOf(list, 'weread_paste'), null);
});
