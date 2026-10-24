import { test } from 'node:test';
import assert from 'node:assert/strict';
import { peopleStatus } from '../src/data/taste/people';

const works = (n: number, prefix = 'bgm-') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}` }));
const pull = (ids: number[]) => ({ people: Object.fromEntries(ids.map((id) => [String(id), [] as { name: string }[]])) });

test('no Bangumi works is ready, and an empty creator list still counts as looked up', () => {
  assert.deepEqual(peopleStatus([], null, undefined, false), { coverage: 1, covered: 0, total: 0, state: 'ready' });
  const none = peopleStatus([{ id: 'db-1' }, { id: 'steam-2' }], null, undefined, false);
  assert.equal(none.total, 0);
  assert.equal(none.state, 'ready');
  const looked = peopleStatus(works(4), pull([1, 2, 3, 4]), { status: 'disconnected' }, false);
  assert.equal(looked.covered, 4);
  assert.equal(looked.state, 'ready');
});

test('8 of 10 is ready even with no connection; 7 of 10 waits, or stops', () => {
  const eight = peopleStatus(works(10), pull([1, 2, 3, 4, 5, 6, 7, 8]), { status: 'disconnected' }, false);
  assert.equal(eight.coverage, 0.8);
  assert.equal(eight.state, 'ready');
  const seven = (conn?: { status?: string; problem?: string }, demo = false) =>
    peopleStatus(works(10), pull([1, 2, 3, 4, 5, 6, 7]), conn, demo);
  assert.equal(seven({ status: 'connected', problem: 'net' }).state, 'loading');
  assert.equal(seven({ status: 'connected', problem: 'gone' }).state, 'loading');
  assert.equal(seven({ status: 'connected' }).state, 'loading');
  assert.equal(seven({ status: 'connected', problem: 'token' }).state, 'blocked');
  assert.equal(seven({ status: 'connected', problem: 'absent' }).state, 'blocked');
  assert.equal(seven({ status: 'connected' }, true).state, 'blocked');
  assert.equal(seven({ status: 'disconnected' }).state, 'blocked');
  assert.equal(seven(undefined).state, 'blocked');
});
