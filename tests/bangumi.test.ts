import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BgmError, coreCredits, createClient, fetchCore, infoboxCredits, KIND_OF, planSync, withKnown, workFromCollection,
  type BgmCollection, type BgmPerson, type BgmSubject, type Transport,
} from '../src/lib/bangumi';
import collections from './fixtures/bangumi/collections-reader.json';
import later from './fixtures/bangumi/collections-reader-later.json';
import persons from './fixtures/bangumi/persons.json';
import subjects from './fixtures/bangumi/subjects.json';

// recorded from api.bgm.tv (tests/fixtures/bangumi/RECORDED.md) — no network here
const items = (collections as { data: BgmCollection[] }).data;
const more = (later as { data: BgmCollection[] }).data;
const people = persons as unknown as Record<string, BgmPerson[]>;
const subj = subjects as unknown as Record<string, BgmSubject>;
const NOW = '2026-10-08T12:00:00+08:00';

test('bangumi: subject types map to kinds; others are left out', () => {
  assert.deepEqual(KIND_OF, { 1: 'book', 2: 'anime', 3: 'music', 4: 'game', 6: 'film' });
  const odd = { ...items[0], subject_type: 5 } as BgmCollection;
  assert.equal(workFromCollection(odd), null);
});

test('bangumi: a collection item becomes a work (title, cover URL, no dates, no bundled art)', () => {
  const c = items.find((x) => x.subject_id === 5118)!;   // 阿基拉, anime
  const w = workFromCollection(c)!;
  assert.equal(w.id, 'bgm-5118');
  assert.equal(w.kind, 'anime');
  assert.equal(w.title, c.subject.name_cn || c.subject.name);
  assert.equal(w.source, 'bangumi');
  assert.equal(w.finished, '');
  assert.match(w.cover!.thumb, /^https:\/\/lain\.bgm\.tv\//);
  assert.equal(w.bgmUpdatedAt, c.updated_at.slice(0, 10));
  for (const x of items) assert.ok(workFromCollection(x), `item ${x.subject_id} maps`);
});

test('bangumi: the first pull dates 看过 by updated_at, the day, at level 2; 在看 has no date', () => {
  const r = planSync(null, items, { epoch: 1, now: NOW });
  assert.equal(r.pull.done.length, 25);
  assert.equal(r.pull.doing.length, 6);
  assert.equal(r.added.length, 31);
  for (const w of r.pull.done) {
    assert.equal(w.claims.length, 1);
    assert.equal(w.claims[0].source, 'bgm_updated_at');
    assert.equal(w.claims[0].baseLevel, 2);
    assert.equal(w.claims[0].precision, 'day');
    assert.match(w.claims[0].value, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const w of r.pull.doing) assert.deepEqual(w.claims, []);
  const src = r.pull.done[0].sources![0];
  assert.equal(src.provider, 'bangumi_account');
  assert.equal(src.epoch, 1);
});

test('bangumi: a later pull keeps old dates, dates new marks by updated_at (or first-seen), and notices removals and 在看 → 看过', () => {
  const first = planSync(null, items, { epoch: 1, now: '2026-10-01T09:00:00+08:00' });
  const doingOne = items.find((x) => x.type === 3)!;
  const gone = items.find((x) => x.type === 2 && x.subject_id !== doingOne.subject_id)!;
  const now = [...more, ...items.filter((x) => x !== gone).map((x) => (x === doingOne ? { ...x, type: 2 } : x))];
  const r = planSync(first.pull, now, { epoch: 1, now: NOW, prevSyncAt: '2026-10-01T09:00:00+08:00' });
  assert.deepEqual(r.added.sort(), more.map((x) => `bgm-${x.subject_id}`).sort());
  assert.deepEqual(r.removed, [`bgm-${gone.subject_id}`]);
  assert.deepEqual(r.nowDone, [`bgm-${doingOne.subject_id}`]);
  const kept = r.pull.done.find((w) => w.id === first.pull.done.find((x) => x.id !== `bgm-${gone.subject_id}`)!.id)!;
  assert.equal(kept.claims[0].source, 'bgm_updated_at');
  // marked between the two syncs: Bangumi's own day, not the day this sync ran (FEEDBACK 2026-10-10 §2)
  const fresh = r.pull.done.find((w) => w.id === `bgm-${more[0].subject_id}`)!;
  assert.deepEqual([fresh.claims[0].source, fresh.claims[0].value, fresh.claims[0].baseLevel], ['bgm_updated_at', more[0].updated_at.slice(0, 10), 2]);
  assert.notEqual(fresh.claims[0].value, NOW.slice(0, 10));
  // 在看 → 看过 whose updated_at is older than the last sync: no mark time inside the window, first-seen it is
  const promoted = r.pull.done.find((w) => w.id === `bgm-${doingOne.subject_id}`)!;
  assert.equal(promoted.claims[0]?.source, 'bgm_first_seen');
  // first-seen stays the first one
  assert.equal(kept.sources![0].firstSeenAt, '2026-10-01T09:00:00+08:00');
});

test('bangumi: core creators — first matching role, two names at most; infobox when Bangumi lists none', () => {
  const music = coreCredits('music', people['189549']);
  assert.ok(music.length >= 1 && music.length <= 2);
  const game = coreCredits('game', people['549587']);
  assert.ok(game.length >= 1);
  assert.deepEqual(coreCredits('book', people['123478']), []);   // a book with no persons at all
  const tv = coreCredits('film', people['490728']);
  assert.ok(tv.length >= 1, 'a TV series without 导演 falls back to 编剧 / 主演');
  const book = infoboxCredits('book', subj['9585']);
  assert.ok(book.some((c) => /刘慈欣/.test(c.name)), JSON.stringify(book));
});

test('bangumi: withKnown lays learned people and cover shapes onto works', () => {
  const r = planSync(null, items, { epoch: 1, now: NOW });
  const w = r.pull.done[0];
  const sid = w.id.slice(4);
  const out = withKnown(r.pull.done, { ...r.pull, people: { [sid]: [{ name: '某人', role: '作者' }] as never }, aspects: { [sid]: 0.7 } });
  assert.equal(out[0].credits[0].name, '某人');
  assert.equal(out[0].cover!.aspect, 0.7);
  assert.equal(withKnown(r.pull.done, r.pull), r.pull.done);
});

/** a transport that answers from a script and records when it was called */
function fakeTransport(answers: { status: number; body?: unknown; retryAfter?: number; throws?: boolean }[]) {
  const calls: { url: string; at: number; auth?: string }[] = [];
  let clock = 0;
  const t: Transport = {
    async get(url, headers) {
      calls.push({ url, at: clock, auth: headers.Authorization });
      const a = answers.shift() ?? { status: 404 };
      if (a.throws) throw new Error('offline');
      return { status: a.status, body: a.body ?? null, retryAfter: a.retryAfter };
    },
  };
  const sleeps: number[] = [];
  const sleep = async (ms: number) => { sleeps.push(ms); clock += ms; };
  return { t, calls, sleeps, sleep, now: () => clock };
}

test('bangumi client: one request at a time, at least a second apart, token sent as Bearer', async () => {
  const f = fakeTransport([{ status: 200, body: { id: 1 } }, { status: 200, body: { id: 2 } }, { status: 200, body: { id: 3 } }]);
  const c = createClient({ transport: f.t, token: 'tok', sleep: f.sleep, now: f.now });
  await Promise.all([c.subject(1), c.subject(2), c.subject(3)]);
  assert.deepEqual(f.calls.map((x) => x.at), [0, 1000, 2000]);
  assert.ok(f.calls.every((x) => x.auth === 'Bearer tok'));
});

test('bangumi client: 429 waits (Retry-After or backoff) and retries; errors are named', async () => {
  const f = fakeTransport([{ status: 429, retryAfter: 5 }, { status: 503 }, { status: 200, body: { ok: 1 } }]);
  const c = createClient({ transport: f.t, sleep: f.sleep, now: f.now });
  assert.deepEqual(await c.get('/x'), { ok: 1 });
  assert.ok(f.sleeps.includes(5000), `waited ${f.sleeps}`);
  assert.ok(f.sleeps.includes(4000), `then backed off: ${f.sleeps}`);

  const g = fakeTransport([{ status: 401 }, { status: 404 }, { status: 400, body: { title: 'Bad Request' } }]);
  const d = createClient({ transport: g.t, sleep: g.sleep, now: g.now });
  await assert.rejects(d.me(), (e: unknown) => e instanceof BgmError && e.code === 'token');
  await assert.rejects(d.user('nosuchuser'), (e: unknown) => e instanceof BgmError && e.code === 'gone');
  await assert.rejects(d.get('/bad'), (e: unknown) => e instanceof BgmError && e.code === 'bad');

  const h = fakeTransport([{ status: 0, throws: true }, { status: 0, throws: true }, { status: 0, throws: true }, { status: 0, throws: true }]);
  const e = createClient({ transport: h.t, sleep: h.sleep, now: h.now });
  await assert.rejects(e.get('/y'), (x: unknown) => x instanceof BgmError && x.code === 'net');
  assert.equal(h.calls.length, 4);
});

test('bangumi client: collections page by 100 (the API refuses more) through 看过 then 在看', async () => {
  const page = (n: number, total: number, offset: number) => ({ status: 200, body: { data: Array.from({ length: n }, () => items[0]), total, limit: 100, offset } });
  const f = fakeTransport([page(100, 150, 0), page(50, 150, 100), page(3, 3, 0)]);
  const c = createClient({ transport: f.t, sleep: f.sleep, now: f.now });
  const heard: [number, number][] = [];
  const all = await c.collections('reader', (a, b) => heard.push([a, b]));
  assert.equal(all.length, 153);
  assert.deepEqual(f.calls.map((x) => new URL(x.url).search), ['?type=2&limit=100&offset=0', '?type=2&limit=100&offset=100', '?type=3&limit=100&offset=0']);
  assert.deepEqual(heard.at(-1), [153, 153]);
});

test('bangumi: fetchCore uses persons, and the infobox when persons is empty', async () => {
  const f = fakeTransport([{ status: 200, body: [] }, { status: 200, body: subj['9585'] }]);
  const c = createClient({ transport: f.t, sleep: f.sleep, now: f.now });
  const credits = await fetchCore(c, '9585', 'book');
  assert.ok(credits.some((x) => /刘慈欣/.test(x.name)));
  assert.equal(f.calls.length, 2);
});
