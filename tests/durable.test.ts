import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDurableStore, createWriter, moveLegacy, type FsLike, type KV } from '../src/lib/durable';

/** an in-memory file system that can be told to fail at a given step */
function memFs(failAt?: { op: keyof FsLike; nth: number }) {
  const files = new Map<string, string>();
  const n: Record<string, number> = {};
  const step = (op: keyof FsLike) => { n[op] = (n[op] ?? 0) + 1; if (failAt && failAt.op === op && failAt.nth === n[op]) throw new Error(`boom ${op}`); };
  const fs: FsLike = {
    async read(p) { step('read'); return files.get(p) ?? null; },
    async write(p, t) { step('write'); files.set(p, t); },
    async rename(a, b) { step('rename'); if (files.has(b)) throw new Error('target exists'); const t = files.get(a); if (t === undefined) throw new Error('missing'); files.delete(a); files.set(b, t); },
    async remove(p) { step('remove'); files.delete(p); },
  };
  return { fs, files };
}

test('durable: write, then read the newest; the previous copy stays as prev', async () => {
  const { fs, files } = memFs();
  const d = createDurableStore(fs, 'cunmu/library');
  assert.equal(await d.read(), null);
  await d.write('{"v":1}');
  await d.write('{"v":2}');
  assert.deepEqual(await d.read(), { text: '{"v":2}', from: 'current' });
  assert.equal(files.get('cunmu/library.prev.json'), '{"v":1}');
  assert.equal(files.has('cunmu/library.json.tmp'), false);
});

test('durable: a crash between the renames leaves the tmp copy, which is read', async () => {
  const { fs, files } = memFs();
  const d = createDurableStore(fs, 'x');
  await d.write('{"v":1}');
  // simulate: tmp written, current already moved to prev, the final rename never happened
  files.set('x.json.tmp', '{"v":2}');
  files.set('x.prev.json', files.get('x.json')!);
  files.delete('x.json');
  assert.deepEqual(await d.read(), { text: '{"v":2}', from: 'tmp' });
  await d.write('{"v":3}');
  assert.deepEqual(await d.read(), { text: '{"v":3}', from: 'current' });
});

test('durable: a broken current falls back to prev; a failing write keeps the good copy', async () => {
  const { fs, files } = memFs();
  const d = createDurableStore(fs, 'x');
  await d.write('{"v":1}');
  await d.write('{"v":2}');
  files.set('x.json', '{"v":2');      // torn
  assert.deepEqual(await d.read(), { text: '{"v":1}', from: 'prev' });

  const m = memFs({ op: 'rename', nth: 2 });
  const d2 = createDurableStore(m.fs, 'y');
  await d2.write('{"a":1}');                       // rename #1
  await assert.rejects(d2.write('{"a":2}'));       // rename #2 (current → prev) fails
  assert.equal((await d2.read())?.text, '{"a":1}'); // the old copy is still there
});

test('durable: a write that does not read back is refused', async () => {
  const { fs } = memFs();
  const short: FsLike = { ...fs, write: async (p, t) => fs.write(p, t.slice(0, 3)) };
  const d = createDurableStore(short, 'x');
  await assert.rejects(d.write('{"v":1}'));
  assert.equal(await d.read(), null);
});

test('writer: batches changes, flush writes the newest at once, a failure is retried', async () => {
  const wrote: string[] = [];
  let fail = true;
  const warn = console.warn; console.warn = () => undefined;
  const w = createWriter(async (t) => { if (fail) { fail = false; throw new Error('disk'); } wrote.push(t); }, 50);
  w.schedule('a'); w.schedule('b'); w.schedule('c');
  await w.flush();
  assert.deepEqual(wrote, []);
  assert.equal(w.dirty, true);
  await w.flush();
  assert.deepEqual(wrote, ['c']);
  w.schedule('d');
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(wrote, ['c', 'd']);
  console.warn = warn;
});

function memKV(full = false): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { if (full) throw new Error('QuotaExceeded'); m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}

test('storage key: self-pedia/v1 moves to cunmu/library once, the old key goes only after it reads back', () => {
  const kv = memKV();
  kv.m.set('self-pedia/v1', '{"tier":3}');
  kv.m.set('self-pedia/v1.bak', '{"bakAt":"x"}');
  assert.equal(moveLegacy(kv, 'cunmu/library', 'cunmu/library.bak', 'self-pedia/v1', 'self-pedia/v1.bak'), '{"tier":3}');
  assert.equal(kv.m.get('cunmu/library'), '{"tier":3}');
  assert.equal(kv.m.get('cunmu/library.bak'), '{"bakAt":"x"}');
  assert.equal(kv.m.has('self-pedia/v1'), false);
  // the new key wins from then on
  kv.m.set('self-pedia/v1', '{"stale":1}');
  assert.equal(moveLegacy(kv, 'cunmu/library', 'cunmu/library.bak', 'self-pedia/v1', 'self-pedia/v1.bak'), '{"tier":3}');

  const full = memKV(true);
  full.m.set('self-pedia/v1', '{"keep":1}');
  assert.equal(moveLegacy(full, 'cunmu/library', 'cunmu/library.bak', 'self-pedia/v1', 'self-pedia/v1.bak'), '{"keep":1}');
  assert.equal(full.m.get('self-pedia/v1'), '{"keep":1}', 'a full storage keeps the old key');
});

test('durable: a copy that is there but cannot be read or parsed, with no good copy beside it, throws instead of reading as no save', async () => {
  const a = memFs({ op: 'read', nth: 1 });
  a.files.set('cunmu/library.json', '{"v":1}');
  await assert.rejects(createDurableStore(a.fs, 'cunmu/library').read());
  const b = memFs();
  b.files.set('cunmu/library.json', '{"v":1');
  await assert.rejects(createDurableStore(b.fs, 'cunmu/library').read());
  // a broken tmp alone is a cut-off first write, not a save
  const c = memFs();
  c.files.set('cunmu/library.json.tmp', '{"v":');
  assert.equal(await createDurableStore(c.fs, 'cunmu/library').read(), null);
  // a good prev beside a broken current is still read
  b.files.set('cunmu/library.prev.json', '{"v":0}');
  assert.deepEqual(await createDurableStore(b.fs, 'cunmu/library').read(), { text: '{"v":0}', from: 'prev' });
});
