import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { storage } from '../src/lib/storage';
import { KEY } from '../src/data/persist';
import { StoreProvider, useStore } from '../src/data/store';
import { bangumiMayLand, steamMayLand, syncStamp } from '../src/data/syncGen';

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
};

const batch = (id: string, provider: 'steam' | 'douban_xlsx') => ({
  id, provider, label: id, createdAt: '2026-10-21T00:00:00.000Z', created: provider === 'steam' ? ['steam-1'] : [], merged: [], skipped: [], quoteIds: [],
  ...(provider === 'steam' ? { steamPrior: { plays: {}, extras: {} } } : null),
});

test('撤销这次导入 drops a Steam read that is still out, and leaves a Bangumi read alone', () => {
  const g = globalThis as { localStorage?: ReturnType<typeof mem>; sessionStorage?: ReturnType<typeof mem>; matchMedia?: (q: string) => { matches: boolean; addEventListener: () => void; removeEventListener: () => void } };
  const prev = { localStorage: g.localStorage, sessionStorage: g.sessionStorage, matchMedia: g.matchMedia };
  g.localStorage = mem();
  g.sessionStorage = mem();
  g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const game = { id: 'steam-1', kind: 'game', title: 'G', credits: [], finished: '', collected: '', source: 'steam', cover: null, genres: [], info: [], play: { minutes: 10, provider: 'steam', appid: 1 } };
  g.localStorage.setItem(KEY, JSON.stringify({
    schemaVersion: 4,
    extras: [game],
    batches: [batch('d1', 'douban_xlsx'), batch('st-1', 'steam')],
    connections: { bangumi: null, weread: { connected: false }, steam: { status: 'connected', steamId: '1' } },
  }));
  void storage.boot();
  const started = syncStamp();
  const seen = { douban: true, steam: false, bangumi: false };
  function Probe() {
    const store = useStore();
    store.undoBatch('d1');
    seen.douban = steamMayLand(started);
    store.undoBatch('st-1');
    seen.steam = steamMayLand(started);
    seen.bangumi = bangumiMayLand(started);
    return null;
  }
  const err = console.error;
  console.error = (...a: unknown[]) => {
    if (String(a[0] ?? '').includes('useLayoutEffect')) return;
    err(...a);
  };
  try {
    renderToStaticMarkup(createElement(StoreProvider, null, createElement(Probe)));
    assert.equal(seen.douban, true);
    assert.equal(seen.steam, false);
    assert.equal(seen.bangumi, true);
    assert.equal(steamMayLand(syncStamp()), true);
  } finally {
    console.error = err;
    g.localStorage.clear();
    void storage.boot();
    g.localStorage = prev.localStorage;
    g.sessionStorage = prev.sessionStorage;
    g.matchMedia = prev.matchMedia;
  }
});
