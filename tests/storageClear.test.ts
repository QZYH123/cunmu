import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storage } from '../src/lib/storage';
import { KEY } from '../src/data/persist';

test('删除全部内容: an unreadable save stops blocking once it is gone', async () => {
  const mem = new Map<string, string>();
  const g = globalThis as { localStorage?: unknown };
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  storage.block();
  try {
    assert.equal(storage.isBlocked(), true);
    storage.save('{"should":"not"}');
    assert.equal(mem.has(KEY), false);
    await storage.clear();
    assert.equal(storage.isBlocked(), false);
    storage.save('{"ok":1}');
    assert.equal(mem.get(KEY), '{"ok":1}');
  } finally {
    await storage.clear().catch(() => undefined);
    g.localStorage = prev;
  }
});
