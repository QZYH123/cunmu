import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, serialize, DEFAULTS, SCHEMA_VERSION } from '../src/data/persist';

test('load: an unreadable save is reported, so it is not written over', () => {
  let hit = 0;
  const s = load('{"schemaVersion":4,"extras":[', undefined, () => hit++);
  assert.equal(hit, 1);
  assert.deepEqual(s.extras, []);
});

test('load: a save from a newer version is not read as a v1 one', () => {
  let hit = 0;
  const newer = JSON.stringify({ ...DEFAULTS, schemaVersion: SCHEMA_VERSION + 1, removed: { a: 'x' }, extras: [{ id: 'm-1', kind: 'book', title: 'T' }] });
  load(newer, () => { throw new Error('no v1 bak for a newer save'); }, () => hit++);
  assert.equal(hit, 1);
});

test('load: a first open (no text) is not reported', () => {
  let hit = 0;
  load(null, undefined, () => hit++);
  load(serialize(DEFAULTS), undefined, () => hit++);
  assert.equal(hit, 0);
});

test('load: JSON that is not a save (null, a list, a string) is reported, not taken as a first open', () => {
  for (const t of ['null', '[]', '"x"', '0']) {
    let hit = 0;
    load(t, () => { throw new Error('no v1 bak'); }, () => hit++);
    assert.equal(hit, 1, t);
  }
});
