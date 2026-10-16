import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSync, type BgmCollection } from '../src/lib/bangumi';
import { resolveDates } from '../src/data/resolve';
import { bursts, favCandidates, interestClusters, suggestions, verbOf, whyFor, asInterest, asPeriod } from '../src/data/suggest';
import { EMPTY_ME, interestMembers, periodMembers } from '../src/data/me';
import type { Work } from '../src/data/types';
import reader from './fixtures/bangumi/reader-done-dates.json';
import readerTags from './fixtures/bangumi/reader-tags.json';

const NOW = '2026-10-10T20:00:00+08:00';
const TODAY = '2026-10-11';
const tags = new Map((readerTags as { rows: [number, number, string[]][] }).rows.map(([id, , t]) => [id, t]));
const collection = ([id, type, updated, cn, name, date]: (string | number)[]): BgmCollection => ({
  subject_id: Number(id), subject_type: Number(type), type: 2, rate: 0, comment: null, tags: [], updated_at: String(updated), private: false,
  subject: { id: Number(id), type: Number(type), name: String(name), name_cn: String(cn), date: date ? String(date) : null, images: null,
    tags: (tags.get(Number(id)) ?? []).map((name, i) => ({ name, count: 100 - i })) },
});
const READER: Work[] = resolveDates(planSync(null, (reader as { rows: (string | number)[][] }).rows.map(collection), { epoch: 1, now: NOW }).pull.done, { userClaims: {}, bgmBaseline: null })
  .map((w) => ({ ...w, cover: { thumb: 'x', medium: 'x', aspect: 0.7 } }));

const w = (id: string, finished: string, extra: Partial<Work> = {}): Work => ({
  id, kind: 'anime', title: `作品${id}`, credits: [], finished, collected: '', source: 'bangumi', cover: { thumb: '', medium: '', aspect: 0.7 }, genres: [], info: [], ...extra,
});

test('suggest: reader — interests come from tags over years, never from what a thing is (TV, 漫画, a year)', () => {
  const cs = interestClusters(READER);
  const names = cs.map((c) => c.name);
  assert.ok(names.includes('科幻'), names.join(' '));
  for (const meta of ['TV', '漫画', '剧场版', '日本', '2010', 'PC', 'ACT']) assert.ok(!names.includes(meta), `${meta} is not an interest`);
  // 伊藤润二 and 伊藤潤二 are one interest that gathers both spellings
  const ito = cs.filter((c) => /伊藤/.test(c.name));
  assert.equal(ito.length, 1, ito.map((c) => c.name).join(' '));
  assert.ok((ito[0].rule.tags ?? []).length >= 1);
  // deterministic: the same library, the same answer
  assert.deepEqual(interestClusters(READER).map((c) => c.key), cs.map((c) => c.key));
  // each one's works really carry it, and span at least three years
  for (const c of cs.filter((x) => !x.person)) assert.ok(new Set(c.members.map((m) => m.finished.slice(0, 4))).size >= 3, c.name);
});

test('suggest: reader — periods are the busy stretches, named by season', () => {
  const bs = bursts(READER, TODAY);
  assert.ok(bs.length >= 1, 'reader has busy stretches');
  for (const b of bs) {
    assert.ok(b.members.length >= 8 && b.days >= 4, `${b.name} ${b.members.length}/${b.days}`);
    assert.match(b.name, /(春天|夏天|秋天|冬天)/);
    assert.deepEqual(periodMembers({ from: b.from, to: b.to, include: [], exclude: [] }, READER, TODAY).map((x) => x.id), b.members.map((x) => x.id));
  }
  assert.deepEqual(bursts(READER, TODAY).map((b) => b.from), bs.map((b) => b.from));
});

test('suggest: a period card says the same year and season its name will have, and a tag as 「多是…」', () => {
  const cards = suggestions(READER, { title: 'x', me: { ...EMPTY_ME, dismissed: ['fav'] }, today: TODAY }).filter((x) => x.type === 'period');
  assert.ok(cards.length >= 1);
  for (const c of cards) {
    if (c.type !== 'period') continue;
    const said = /^(\d{4}) 年(春天|夏天|秋天|冬天)/.exec(c.question)!;
    assert.ok(said, c.question);
    const named = /(\d{4}) 年/.exec(c.name);
    if (named) assert.equal(named[1], said[1], `${c.name} / ${c.question}`);
    assert.ok(c.name.includes(said[2]), `${c.name} / ${c.question}`);
    assert.doesNotMatch(c.question, /部[^，。\s]/, c.question);
  }
});

test('suggest: an interest since long ago and still going is 「这些年」, not 「这几年」', () => {
  const sci = suggestions(READER, { title: 'x', me: { ...EMPTY_ME, dismissed: ['fav'] }, today: TODAY }).find((x) => x.type === 'interest' && x.name === '科幻');
  assert.ok(sci);
  assert.equal(sci!.question, '这些年你一直在看科幻，收成一个兴趣吗？');
});

test('suggest: one card at a time — name, 最爱, then interests and periods in turn; 「不是」 never asks again', () => {
  const lib = [
    ...Array.from({ length: 30 }, (_, i) => w(`s${i}`, `${2020 + (i % 6)}-0${1 + (i % 9)}-1${i % 9}`, { tags: ['科幻'] })),
    ...Array.from({ length: 10 }, (_, i) => w(`m${i}`, `2016-04-${String(1 + i * 2).padStart(2, '0')}`, { tags: ['推理'] })),
    ...Array.from({ length: 20 }, (_, i) => w(`o${i}`, `${2010 + (i % 12)}-0${1 + (i % 8)}-05`)),
    w('fav1', '2015-01-01', { rating10: 10, srcComment: '看过四遍，每一遍看懂的地方不一样。后来又看了。' }),
    w('fav2', '2016-01-01', { rating10: 9 }),
    w('fav3', '2017-01-01', { rating10: 9 }),
  ];
  const s = suggestions(lib, { me: EMPTY_ME, today: TODAY });
  assert.deepEqual(s.slice(0, 2).map((x) => x.type), ['name', 'fav']);
  assert.equal(s[0].question, '怎么称呼你？');
  const fav = s[1] as Extract<typeof s[number], { type: 'fav' }>;
  assert.deepEqual(fav.picks.map((p) => p.id), ['fav1', 'fav3', 'fav2'], 'a 10 first; equal marks, the newer first');
  assert.equal(fav.picks[0].why, '看过四遍，每一遍看懂的地方不一样。');
  assert.equal(fav.picks[0].whyFrom, 'bangumi');
  const sci = s.find((x) => x.type === 'interest' && x.name === '科幻');
  assert.ok(sci, s.map((x) => x.key).join(' '));
  assert.equal(sci!.question, '这几年你好像一直在看科幻，收成一个兴趣吗？');
  assert.match(sci!.evidence, /^2020 年起 · 30 部 · 最近一部是《/);
  const named = suggestions(lib, { title: '沈舟', me: { ...EMPTY_ME, dismissed: ['fav', sci!.key] }, today: TODAY });
  assert.ok(!named.some((x) => x.key === 'name' || x.key === 'fav' || x.key === sci!.key), 'answered ones stay answered');
  // taking one ends it too (its key is remembered by the store; here: it is an interest now)
  const kept = asInterest(sci as never, { name: '硬科幻', exclude: ['s1'] });
  assert.equal(kept.name, '硬科幻'); assert.equal(kept.key, sci!.key);
  const after = suggestions(lib, { title: '沈舟', me: { ...EMPTY_ME, interests: [{ ...kept, id: 'i1', createdAt: '' }] }, today: TODAY });
  assert.ok(!after.some((x) => x.type === 'interest' && x.name === '科幻'), 'an interest you have is not offered again');
  assert.equal(interestMembers(kept, lib).length, 29);
  // nothing of yours: nothing to suggest
  assert.deepEqual(suggestions([], { me: EMPTY_ME, today: TODAY }), []);
  assert.deepEqual(suggestions(lib.map((x) => ({ ...x, isSample: true as const })), { me: EMPTY_ME, today: TODAY }), []);
});

test('suggest: a period is offered for a burst, not for a day of marking a back catalogue', () => {
  const steady = Array.from({ length: 40 }, (_, i) => w(`b${i}`, `${2010 + Math.floor(i / 12)}-${String(1 + (i % 12)).padStart(2, '0')}-10`));
  const spring = Array.from({ length: 21 }, (_, i) => w(`p${i}`, `2014-0${3 + (i % 3)}-${String(2 + i).padStart(2, '0')}`, { tags: ['推理'] }));
  const dump = Array.from({ length: 30 }, (_, i) => w(`d${i}`, '2012-01-10'));
  const bs = bursts([...steady, ...spring, ...dump], TODAY);
  assert.deepEqual(bs.map((b) => [b.from, b.to, b.name]), [['2014-03', '2014-05', '推理那个春天']]);
  const s = suggestions([...steady, ...spring, ...dump], { title: 'x', me: { ...EMPTY_ME, dismissed: ['fav'] }, today: TODAY }).find((x) => x.type === 'period')!;
  assert.equal(s.question, '2014 年春天，你一口气看了 21 部，多是推理。把这段日子收成一个时期吗？');
  assert.equal(asPeriod(s as never).from, '2014-03');
  // a period you already have covers it: not offered
  const none = suggestions([...steady, ...spring], { title: 'x', me: { ...EMPTY_ME, periods: [{ id: 'p', name: '那年春天', from: '2014-04', to: '2014-04', include: [], exclude: [], createdAt: '' }] }, today: TODAY });
  assert.ok(!none.some((x) => x.type === 'period'));
});

test('suggest: the why is yours first, then your short review on Bangumi; verbs follow the kinds', () => {
  assert.deepEqual(whyFor(w('a', '', { source: 'manual', review: ['后来又看了一遍。还是很好。'] })), { why: '后来又看了一遍。', whyFrom: 'yours' });
  assert.deepEqual(whyFor(w('a', '', { srcComment: '神' })), { why: '神', whyFrom: 'bangumi' });
  assert.deepEqual(whyFor(w('a', '')), {});
  assert.equal(verbOf([w('a', '', { kind: 'book' }), w('b', '', { kind: 'book' }), w('c', '')]), '读');
  assert.equal(verbOf([w('a', '', { kind: 'game' })]), '玩');
  assert.deepEqual(favCandidates([w('x', '', { rating10: 3, srcComment: '不好看' })]), [], 'a low mark with words is not a favourite');
});
