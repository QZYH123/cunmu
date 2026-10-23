import { test } from 'node:test';
import assert from 'node:assert/strict';
import { longCalc } from '../src/data/taste/calc/long';
import { metCalc } from '../src/data/taste/calc/met';
import { buildFacts, toTasteWork, toTasteWorks, trustedOf } from '../src/data/taste/facts';
import { READY, TODAY, at, by, fBooks, gapWorks, manualAdd, mk, played, tasteOf } from './helpers/tasteFixtures';

const facts = (works: ReturnType<typeof mk>[]) => buildFacts(toTasteWorks(works, TODAY), TODAY, READY);

test('F3: genres that are not a topic leave only the unbroken kind, or nothing', () => {
  const years = Array.from({ length: 12 }, (_, i) => 2010 + i);
  const r = tasteOf(fBooks(years, 1, { genres: ['剧情'], tags: [] }));
  assert.deepEqual(r.rows.long.map((s) => s.tid), ['L5']);
  const s = r.rows.long[0];
  assert.equal(s.variant, 'full');
  assert.equal(s.slots.kindVerb, '读书');
  assert.equal(s.slots.from, 2010);
  assert.equal(s.slots.years, 12);
  assert.equal(s.text, '从 2010 年起，你每一年都在读书，一年没落下。');
  assert.equal(s.text.includes('剧情'), false);
});

test('F4: an approximate year, or a level-3 year, is not a year a sentence may say', () => {
  const approx = (year: number) => mk({
    finished: `${year}-06-01`,
    date: { value: `${year}-06-01`, precision: 'day', level: 2, source: 'douban_marked', approx: true, locked: false },
  });
  const loose = (year: number) => mk({
    finished: `${year}-06-01`,
    date: { value: `${year}-06-01`, precision: 'day', level: 3, source: 'bgm_updated_at', approx: false, locked: false },
  });
  for (const works of [[2019, 2020].flatMap((y) => Array.from({ length: 6 }, () => approx(y))), Array.from({ length: 12 }, () => loose(2019))]) {
    const r = tasteOf(works);
    assert.equal(r.gate.trusted, 0);
    assert.equal(r.gate.ok, false);
    assert.equal(/2019|2020/.test(JSON.stringify(r.rows)), false);
  }
});

test('F5: fifteen hand-added works on one day lose the year; fourteen, or a bare year, keep it', () => {
  const lose = Array.from({ length: 15 }, () => manualAdd('2016-04-01', { tags: ['科幻'] }));
  assert.equal(toTasteWork(lose[0], TODAY).year, 2016);
  assert.ok(toTasteWorks(lose, TODAY).every((w) => w.year == null));
  const keep = Array.from({ length: 14 }, () => manualAdd('2016-04-01'));
  assert.ok(toTasteWorks(keep, TODAY).every((w) => w.year === 2016));
  const yearsOnly = Array.from({ length: 15 }, () => manualAdd('2016'));
  assert.ok(toTasteWorks(yearsOnly, TODAY).every((w) => w.year === 2016));
  const otherDays = Array.from({ length: 15 }, (_, i) => manualAdd(`2016-05-${String(i + 1).padStart(2, '0')}`));
  assert.ok(toTasteWorks(otherDays, TODAY).every((w) => w.year === 2016));
});

test('F6: a game, and the year it was last played, stays out of 长情', () => {
  const games = Array.from({ length: 12 }, (_, i) => played(2026, 1000 + i, ['科幻']));
  const only = facts(games);
  assert.equal(only.topics.size, 0);
  assert.equal(only.maxYear, null);
  assert.equal(only.creators.length, 0);
  const g = tasteOf(games);
  assert.equal(g.gate.ok, true);
  assert.equal(g.rows.long.length, 0);
  assert.equal(g.missing.long, 'noTags');
  assert.equal(g.missing.stay, undefined);
  assert.equal(g.rows.stay.length, 0);

  const books = fBooks([2010, 2011, 2012, 2013, 2014, 2015, 2016], 1);
  const mixed = facts([...books, ...Array.from({ length: 5 }, (_, i) => played(2026, i))]);
  assert.equal(mixed.maxYear, 2016);
  const l5 = tasteOf([...books, ...Array.from({ length: 5 }, (_, i) => played(2026, i))]).rows.long.find((s) => s.tid === 'L5');
  assert.equal(l5?.variant, 'full');
  assert.equal(l5?.slots.from, 2010);
  assert.equal(l5?.slots.years, 7);
  assert.equal(l5?.slots.kindVerb, '读书');

  const few = tasteOf([
    ...fBooks([2010, 2011, 2012, 2013, 2014], 1, { tags: ['科幻'] }),
    ...Array.from({ length: 7 }, (_, i) => played(2026, i, ['科幻'])),
  ]);
  assert.equal(few.gate.ok, true);
  assert.equal(few.rows.long.some((s) => s.tid === 'L1' || s.tid === 'L5'), false);
});

test('F7: 在看, a sample, and an essay are not in the batch', () => {
  const years = Array.from({ length: 12 }, (_, i) => 2010 + i);
  assert.equal(toTasteWorks(fBooks(years, 1).map((w) => ({ ...w, status: 'doing' as const })), TODAY).length, 0);
  assert.equal(toTasteWorks(fBooks(years, 1).map((w) => ({ ...w, isSample: true as const })), TODAY).length, 0);
  assert.equal(toTasteWorks(fBooks(years, 1).map((w) => ({ ...w, kind: 'essay' as const })), TODAY).length, 0);
  assert.equal(tasteOf(fBooks(years, 1).map((w) => ({ ...w, status: 'doing' as const }))).gate.trusted, 0);
});

test('F11: 断档回归 needs the gap to be a recorded gap, and two works on the way back', () => {
  const back = tasteOf(gapWorks());
  const l2 = back.rows.long[0];
  assert.equal(l2.tid, 'L2');
  assert.equal(l2.slots.topic, '推理');
  assert.equal(l2.slots.gap, '三');
  assert.equal(l2.slots.back, 2013);
  assert.equal(l2.text, '『推理』消失了三年。2013 年，你又回来了。');
  assert.ok(l2.evidence.length <= 6);
  assert.ok(l2.evidence.some((e) => e.year === 2013));

  const thin = [
    ...fBooks([2008], 3, { tags: ['推理'] }),
    ...fBooks([2009], 2, { tags: ['推理'] }),
    ...fBooks([2010, 2011, 2012], 3),
    ...fBooks([2013], 1, { tags: ['推理'] }),
  ];
  assert.equal(longCalc.L2(facts(thin)), null);

  const clump = [2010, 2011, 2012].flatMap((y) => Array.from({ length: 15 }, () => manualAdd(`${y}-04-01`)));
  const sides = [
    ...fBooks([2008, 2009], 2, { tags: ['推理'] }),
    ...fBooks([2013, 2014], 2, { tags: ['推理'] }),
  ];
  const f = facts([...sides, ...clump]);
  assert.equal(f.recorded.has(2010), false);
  assert.equal(longCalc.L2(f), null);
});

test('a year is trusted by who said it, and two short topics stay two topics', () => {
  const user = mk({ date: { value: '2018-01-02', precision: 'day', level: 1, source: 'user', approx: false, locked: true } });
  assert.equal(trustedOf(user)?.trust, 'own');
  const steam = mk({ date: { value: '2024-01-02', precision: 'day', level: 2, source: 'steam_last_played', approx: false, locked: false } });
  assert.equal(trustedOf(steam)?.trust, 'lastPlayed');
  const bare = mk({ finished: '2017-05-05', date: undefined });
  assert.equal(trustedOf(bare)?.trust, 'source');
  assert.equal(trustedOf(bare)?.year, 2017);
  assert.equal(trustedOf(mk({ finished: '2017', date: undefined })), null);

  const f = facts([
    ...fBooks([2010, 2011, 2012], 2, { tags: ['科幻'] }),
    ...fBooks([2010, 2011, 2012], 2, { tags: ['玄幻'] }),
  ]);
  assert.equal(f.topics.has('科幻'), true);
  assert.equal(f.topics.has('玄幻'), true);
});

test('a company role is not a person, and a game brings none', () => {
  const w = toTasteWork(mk({
    credits: [by('今敏', '导演'), by('某社', '动画制作'), by('任天堂', '发行'), by('某人', '开发'), { name: '路人', role: '配角' }],
  }), TODAY);
  assert.deepEqual(w.creators.map((c) => c.name), ['今敏']);
  const game = toTasteWork(mk({ kind: 'game', tags: ['科幻'], credits: [by('今敏', '导演')] }), TODAY);
  assert.deepEqual(game.creators, []);
  assert.deepEqual(game.topics, []);
});

test('a title long enough to break the line falls back, and a banned topic is not said', () => {
  const longTitle = '题'.repeat(40);
  const years = [2010, 2012, 2014, 2016, 2018, 2020];
  const works = years.flatMap((year) => [0, 1].map((i) => at(year, i, { tags: ['科幻'], title: longTitle })));
  const r = tasteOf(works);
  const l4 = r.rows.long.find((s) => s.tid === 'L4');
  assert.equal(l4?.variant, 'noTitle');
  assert.equal(l4?.text.includes('题'), false);
  assert.equal(l4?.text, '2010 年起、到 2020 年，十年，同一条线。');

  const banned = tasteOf(fBooks([2010, 2011, 2012, 2013, 2014, 2015], 2, { tags: ['回忆'] }));
  assert.ok(banned.rows.long.length > 0);
  for (const s of banned.rows.long) assert.equal(s.text.includes('回忆'), false);
});

test('L6, L7 and M4 are named and say nothing', () => {
  const empty = facts([]);
  assert.equal(longCalc.L6(empty), null);
  assert.equal(longCalc.L7(empty), null);
  assert.equal(metCalc.M4(empty), null);
  assert.equal(metCalc.M5(empty), null);
  assert.equal(metCalc.M6(empty), null);
});
