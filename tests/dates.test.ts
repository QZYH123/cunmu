import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markClaim, planSync, type BgmCollection } from '../src/lib/bangumi';
import { claimsOf, firstSeenClaim, resolveDates, sortWorks, CLUMP_MIN } from '../src/data/resolve';
import { DEFAULT_SETTINGS, derive } from '../src/data/derive';
import type { DateClaim, Work } from '../src/data/types';
import reader from './fixtures/bangumi/reader-done-dates.json';

// FEEDBACK 2026-10-10 §2 / DECISIONS-r2 #20: Bangumi's updated_at is the 看过 mark time
const NOW = '2026-10-10T20:00:00+08:00';
const CTX = { userClaims: {}, bgmBaseline: null };
const collection = ([id, type, updated, cn, name, date]: (string | number)[]): BgmCollection => ({
  subject_id: Number(id), subject_type: Number(type), type: 2, rate: 0, comment: null, tags: [], updated_at: String(updated), private: false,
  subject: { id: Number(id), type: Number(type), name: String(name), name_cn: String(cn), date: date ? String(date) : null, images: null },
});
const READER = (reader as { rows: (string | number)[][] }).rows.map(collection);
const byId = (ws: Work[]) => new Map(ws.map((w) => [w.id, w]));

test('dates: the first import takes updated_at as the day (level 2, not 约)', () => {
  const r = planSync(null, READER.slice(0, 50), { epoch: 1, now: NOW });
  const ws = resolveDates(r.pull.done, CTX);
  for (const w of ws) {
    assert.equal(w.date!.precision, 'day', w.title);
    assert.equal(w.date!.level, 2);
    assert.equal(w.date!.approx, false);
    assert.equal(w.finished, w.bgmUpdatedAt);
  }
});

test('dates: a batch marked on one day is 时间未知; a busy day under the ratio is not', () => {
  const base = READER.slice(0, 200).map((c, i) => (i < 20 ? { ...c, updated_at: '2019-05-04T10:00:00+08:00' } : c));
  const ws = byId(resolveDates(planSync(null, base, { epoch: 1, now: NOW }).pull.done, CTX));
  const piled = ws.get(`bgm-${base[0].subject_id}`)!;
  assert.equal(piled.date!.level, 4);
  assert.equal(piled.finished, '');
  // 14 on a day (below CLUMP_MIN) keep the day
  const few = READER.slice(0, 200).map((c, i) => (i < CLUMP_MIN - 1 ? { ...c, updated_at: '2019-05-04T10:00:00+08:00' } : c));
  const fw = byId(resolveDates(planSync(null, few, { epoch: 1, now: NOW }).pull.done, CTX));
  assert.equal(fw.get(`bgm-${few[0].subject_id}`)!.finished, '2019-05-04');
});

test('dates: a later sync uses updated_at when it is after the previous sync, else the first-seen guess', () => {
  const prev = '2026-09-01T09:00:00+08:00';
  const marked = markClaim('2026-09-20T22:10:00+08:00', false, { now: NOW, prevSyncAt: prev });
  assert.deepEqual([marked.source, marked.value, marked.precision, marked.baseLevel], ['bgm_updated_at', '2026-09-20', 'day', 2]);
  // updated_at before the previous sync (made public later, an old mark): not a time inside the window
  const old = markClaim('2015-03-01T10:00:00+08:00', false, { now: NOW, prevSyncAt: prev });
  assert.deepEqual(old, firstSeenClaim(NOW, prev));
  // a clock in the future or no time at all: the same fallback
  assert.equal(markClaim('2031-01-01T00:00:00+08:00', false, { now: NOW, prevSyncAt: prev }).source, 'bgm_first_seen');
  assert.equal(markClaim('', false, { now: NOW, prevSyncAt: prev }).source, 'bgm_first_seen');
  // the first import never guesses
  assert.equal(markClaim('2012-08-20T21:47:30+08:00', true, { now: NOW }).value, '2012-08-20');
});

test('dates: a library pulled before this reads its stored level-3 day as the day — no network', () => {
  const stored: DateClaim = { source: 'bgm_updated_at', value: '2012-08-28', precision: 'day', baseLevel: 3, observedAt: '2026-10-08T12:00:00+08:00' };
  const w: Work = { id: 'bgm-6819', kind: 'anime', title: '借东西的小人阿莉埃蒂', credits: [], finished: '', collected: '2026-10-08', source: 'bangumi', cover: null, genres: [], info: [], bgmUpdatedAt: '2012-08-28', claims: [stored] };
  assert.equal(claimsOf(w, CTX)[0].baseLevel, 2);
  const [r] = resolveDates([w], CTX);
  assert.deepEqual([r.finished, r.date!.precision, r.date!.approx], ['2012-08-28', 'day', false]);
  // a later sync keeps the stored claim; it still reads as the day
  const again = planSync({ done: [w], doing: [] }, [collection([6819, 2, '2012-08-20T21:47:30+08:00', '借东西的小人阿莉埃蒂', '借りぐらしのアリエッティ', '2010-07-17'])], { epoch: 1, now: NOW, prevSyncAt: '2026-10-08T12:00:00+08:00' });
  assert.equal(resolveDates(again.pull.done, CTX)[0].finished, '2012-08-28');
  // a user's date still wins
  const mine = resolveDates([w], { userClaims: { 'bgm-6819': { source: 'user', value: '2011', precision: 'year', baseLevel: 1, observedAt: NOW } }, bgmBaseline: null })[0];
  assert.equal(mine.finished, '2011');
  // a first-seen guess from a later sync is left alone
  const seen: Work = { ...w, claims: [{ source: 'bgm_first_seen', value: '2026-09', precision: 'month', baseLevel: 2, observedAt: NOW }] };
  assert.equal(resolveDates([seen], CTX)[0].finished, '2026-09');
});

test('dates: reader (1019 看过) — every one a day, no pile-up, years split into months', () => {
  const ws = sortWorks(resolveDates(planSync(null, READER, { epoch: 1, now: NOW }).pull.done, CTX));
  assert.equal(ws.length, 1019);
  assert.ok(ws.every((w) => w.date!.level === 2 && w.finished.length === 10), 'all dated to the day');
  const m = byId(ws);
  assert.equal(m.get('bgm-6819')!.finished, '2012-08-28');
  // the busiest day (2012-01-17, 36 = 3.5%) is under CLUMP_RATIO: kept
  assert.equal(ws.filter((w) => w.finished === '2012-01-17').length, 36);
  const d = derive(ws, DEFAULT_SETTINGS, new Set());
  const y2011 = d.years.get(2011)!;
  assert.equal(y2011.works.length, 168);
  assert.ok(y2011.months.size >= 6, `2011 in ${y2011.months.size} months`);
  assert.equal(y2011.loose.length, 0, 'nothing left as a bare year');
  // newest first on the wall
  assert.ok(ws[0].finished >= ws[ws.length - 1].finished);
});
