import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plain } from '../src/data/lead';
import { buildFacts, toTasteWorks } from '../src/data/taste/facts';
import { headlineH1, headlineH4, pickHeadline } from '../src/data/taste/headline';
import { COPY } from '../src/data/taste/copy';
import { lintSentence } from '../src/data/taste/lint';
import { numbersInCn } from '../src/data/taste/num';
import { nextTid, resolveRows, sheetDims } from '../src/data/taste/pick';
import { EMPTY_TASTE } from '../src/data/taste/prefs';
import type { Sentence, TastePeriod } from '../src/data/taste/types';
import type { Kind, Work } from '../src/data/types';
import { READY, TODAY, at, fBooks, manualAdd, mk, played, tasteOf } from './helpers/tasteFixtures';

const WHO = new Set(['读书的人', '看番的人', '看片的人', '听专辑的人', '玩游戏的人']);

function voice(s: Sentence) {
  assert.equal(s.nums, numbersInCn(s.text), s.text);
  assert.ok(s.nums <= 3, s.text);
  assert.deepEqual(lintSentence(s.text), [], s.text);
  assert.equal(s.text.includes('口味在变化'), false, s.text);
  assert.equal(s.text.includes('少年'), false, s.text);
  assert.ok(s.evidence.length <= 6, s.tid);
  assert.equal(s.text, plain(s.segs), s.text);
}

function subset(s: Sentence, works: readonly { id: string }[]) {
  const ids = new Set(works.map((w) => w.id));
  for (const e of s.evidence) assert.ok(ids.has(e.id), `${s.tid} ${e.title}`);
}

function spread(kind: Kind, count: number, years: readonly number[], over: Partial<Work> = {}): Work[] {
  const out: Work[] = [];
  for (let i = 0; i < count; i++) out.push(at(years[i % years.length], i + years[0], { ...over, kind }));
  return out;
}

function period(name: string, from: string, to: string | null, include: string[] = []): TastePeriod {
  return { id: name, name, from, to, include, exclude: [] };
}

function z1(extra: Work[] = []) {
  const early = fBooks([2016, 2017, 2018], 4, { kind: 'anime' });
  const late = fBooks([2022, 2023], 6, { kind: 'game' });
  return { early, late, all: [...early, ...late, ...extra] };
}

test('Z1 and Z1b: a split needs both sides, and the sentence uses the real years', () => {
  const base = z1();
  const r = tasteOf(base.all);
  const z = r.rows.turn.find((s) => s.tid === 'Z1');
  const id = r.rows.turn.find((s) => s.tid === 'Z1b');
  assert.ok(z && id);
  voice(z);
  voice(id);
  assert.equal(r.rows.turn[0].tid, 'Z1');
  assert.equal(r.rows.turn[1].tid, 'Z1b');
  assert.equal(z.text, '2016 到 2018 年，你记下的多是番；2022 年以后，多是游戏。');
  assert.equal(id.text, '2016 到 2018 年，你是看番的人；2022 年以后，是玩游戏的人。');
  assert.equal(z.slots.after, 2022);
  assert.equal(z.head?.includes('分界前 12 部'), true);
  assert.equal(z.head?.includes('分界后 12 部'), true);
  assert.equal(id.head, z.head);
  subset(z, base.all);
  assert.ok(WHO.has(String(id.slots.whoEarly)) && WHO.has(String(id.slots.whoLate)));
  assert.equal(z.star, true);
  assert.equal(id.star, true);
  assert.equal(nextTid(r.rows.turn, 'Z1'), 'Z1b');
  assert.deepEqual(sheetDims(r, EMPTY_TASTE), ['turn']);
  assert.equal(r.rows.turn.some((s) => s.tid === 'Z7'), false);
});

test('Z1 boundaries: 45%, 25%, the two spans, and a gap before the later years', () => {
  const earlyYears = [2010, 2011, 2012];
  const lateYears = [2016, 2017];
  const pass = tasteOf([
    ...spread('anime', 9, earlyYears),
    ...spread('book', 6, earlyYears),
    ...spread('music', 5, earlyYears),
    ...spread('film', 12, lateYears),
  ]);
  const z = pass.rows.turn.find((s) => s.tid === 'Z1');
  assert.ok(z);
  voice(z);
  assert.equal(z.slots.nounEarly, '番');
  assert.equal(z.slots.nounLate, '影视');
  assert.equal(z.head?.includes('分界前 20 部'), true);
  assert.equal(z.head?.includes('分界后 12 部'), true);

  const under = tasteOf([
    ...spread('anime', 11, earlyYears),
    ...spread('book', 8, earlyYears),
    ...spread('music', 6, earlyYears),
    ...spread('film', 12, lateYears),
  ]);
  assert.equal(under.rows.turn.some((s) => s.tid === 'Z1'), false);
  assert.equal(JSON.stringify(under.rows).includes('口味在变化'), false);

  const stayed = tasteOf([
    ...spread('book', 12, earlyYears),
    ...spread('anime', 5, earlyYears),
    ...spread('music', 3, earlyYears),
    ...spread('anime', 12, lateYears),
  ]);
  assert.equal(stayed.rows.turn.some((s) => s.tid === 'Z1'), false);

  const arrived = tasteOf([
    ...spread('book', 12, earlyYears),
    ...spread('anime', 4, earlyYears),
    ...spread('music', 4, earlyYears),
    ...spread('anime', 12, lateYears),
  ]);
  const lateKind = arrived.rows.turn.find((s) => s.tid === 'Z1');
  assert.equal(lateKind?.slots.nounEarly, '书');
  assert.equal(lateKind?.slots.nounLate, '番');
  assert.equal(lateKind?.head?.includes('分界前 20 部'), true);

  const shortEarly = tasteOf([
    ...spread('anime', 12, [2016, 2017]),
    ...spread('game', 12, [2022, 2023]),
  ]);
  assert.equal(shortEarly.rows.turn.some((s) => s.tid === 'Z1'), false);
  const shortLate = tasteOf([
    ...spread('anime', 12, [2016, 2017, 2018]),
    ...spread('game', 12, [2022]),
  ]);
  assert.equal(shortLate.rows.turn.some((s) => s.tid === 'Z1'), false);

  const tied = tasteOf([
    ...spread('book', 12, [2010, 2011, 2012]),
    ...spread('film', 18, [2013, 2014, 2015]),
    ...spread('anime', 12, [2016, 2017]),
  ]);
  assert.equal(tied.rows.turn.find((s) => s.tid === 'Z1')?.text, '2010 到 2012 年，你记下的多是书；2013 年以后，多是影视。');

  const balanced = tasteOf([
    ...spread('book', 12, [2010, 2011, 2012]),
    ...spread('film', 20, [2013, 2014, 2015]),
    ...spread('anime', 16, [2016, 2017]),
  ]);
  assert.equal(balanced.rows.turn.find((s) => s.tid === 'Z1')?.text, '2010 到 2015 年，你记下的多是影视；2016 年以后，多是番。');
});

test('dates that are not trusted, and games, stay out of the early side', () => {
  const early = [2016, 2017, 2018];
  const late = [2022, 2023];
  const buried = tasteOf([
    ...spread('anime', 12, early),
    ...spread('game', 30, early),
    ...spread('game', 12, late),
  ]);
  const z = buried.rows.turn.find((s) => s.tid === 'Z1');
  assert.equal(z?.slots.nounEarly, '番');
  assert.equal(z?.head?.includes('分界前 12 部'), true);
  assert.equal(z?.head?.split(' · ')[0].includes('游戏'), false);

  const tooFew = tasteOf([
    ...spread('anime', 9, early),
    ...spread('game', 30, early),
    ...spread('film', 12, late),
  ]);
  assert.equal(tooFew.rows.turn.some((s) => s.tid === 'Z1'), false);

  const approx = spread('anime', 12, early).map((w) => mk({
    ...w,
    date: { value: String(w.finished.slice(0, 4)), precision: 'year', level: 3, source: 'douban_marked', approx: true, locked: false },
  }));
  assert.equal(tasteOf([...approx, ...spread('game', 12, late)]).rows.turn.length, 0);

  const low = spread('anime', 12, early).map((w) => mk({
    ...w,
    date: { value: w.finished, precision: 'day', level: 3, source: 'douban_marked', approx: false, locked: false },
  }));
  assert.equal(tasteOf([...low, ...spread('game', 12, late)]).rows.turn.some((s) => s.tid === 'Z1'), false);

  const unknown = spread('anime', 12, early).map((w) => mk({
    ...w,
    date: { value: null, precision: 'unknown', level: 4, source: 'douban_marked', approx: false, locked: false },
  }));
  assert.equal(tasteOf([...unknown, ...spread('game', 12, late)]).rows.turn.length, 0);

  const clump = [
    ...Array.from({ length: 15 }, (_, i) => manualAdd('2016-01-01', { id: `c${i}`, title: `堆${i}`, kind: 'anime' })),
    ...spread('game', 12, late),
  ];
  assert.equal(tasteOf(clump).rows.turn.some((s) => s.tid === 'Z1'), false);

  const steam = tasteOf([
    ...spread('anime', 12, early),
    ...Array.from({ length: 6 }, (_, i) => played(2022, 2200 + i)),
    ...Array.from({ length: 6 }, (_, i) => played(2023, 2300 + i)),
  ]);
  assert.equal(steam.rows.turn.some((s) => s.tid === 'Z1' || s.tid === 'Z1b'), false);
  assert.equal(JSON.stringify(steam.rows.turn).includes('游戏'), false);

  const beside = tasteOf([
    ...spread('anime', 12, early),
    ...spread('film', 12, late),
    ...Array.from({ length: 20 }, (_, i) => played(2022 + (i % 2), 3000 + i)),
  ]);
  const kept = beside.rows.turn.find((s) => s.tid === 'Z1');
  assert.equal(kept?.slots.nounLate, '影视');
  assert.equal(kept?.head?.includes('分界后 12 部'), true);
  assert.equal(kept?.head?.includes('游戏'), false);
  assert.equal(kept?.text, '2016 到 2018 年，你记下的多是番；2022 年以后，多是影视。');
  voice(kept!);
});

test('the default is the first of Z1, Z6, Z4, Z3, Z5 that holds', () => {
  const both = tasteOf([
    ...spread('book', 30, [2010, 2011, 2012], { tags: ['推理'] }),
    ...spread('anime', 9, [2010, 2011, 2012]),
    ...spread('anime', 20, [2013, 2014, 2015], { tags: ['治愈'] }),
    ...spread('book', 9, [2013, 2014, 2015]),
  ]);
  assert.equal(both.rows.turn[0].tid, 'Z1');
  assert.ok(both.rows.turn.some((s) => s.tid === 'Z6'));
  assert.ok(both.rows.turn.some((s) => s.tid === 'Z4'));
  for (const s of both.rows.turn) voice(s);

  const noZ1 = tasteOf([
    ...spread('book', 27, [2010, 2011, 2012], { tags: ['推理'] }),
    ...spread('anime', 9, [2010, 2011, 2012]),
    ...spread('anime', 18, [2013, 2014, 2015], { tags: ['治愈'] }),
    ...spread('book', 9, [2013, 2014, 2015]),
  ]);
  assert.equal(noZ1.rows.turn.some((s) => s.tid === 'Z1' || s.tid === 'Z1b'), false);
  assert.equal(noZ1.rows.turn[0].tid, 'Z6');
  assert.ok(noZ1.rows.turn.some((s) => s.tid === 'Z4'));
  assert.ok(noZ1.rows.turn.findIndex((s) => s.tid === 'Z4') > 0);

  const books = fBooks([2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018], 1);
  const anime = fBooks([2014, 2015, 2016, 2017, 2018], 2, { kind: 'anime' });
  const peak = fBooks([2016], 20);
  const third = tasteOf([...books, ...anime, ...peak]);
  assert.equal(third.rows.turn[0].tid, 'Z3');
  assert.ok(third.rows.turn.some((s) => s.tid === 'Z5'));

  const onlyPeak = tasteOf([
    ...fBooks([2010, 2011, 2012], 2),
    ...fBooks([2016], 26),
  ]);
  assert.equal(onlyPeak.rows.turn[0]?.tid, 'Z5');
});

test('Z6: one kind stays ahead, then the other does, and a thin year breaks it', () => {
  const held = tasteOf([
    ...spread('book', 15, [2018, 2019, 2020]),
    ...spread('anime', 9, [2018, 2019, 2020]),
    ...spread('book', 6, [2021, 2022]),
    ...spread('anime', 10, [2021, 2022]),
  ]);
  const z = held.rows.turn.find((s) => s.tid === 'Z6');
  assert.ok(z);
  voice(z);
  assert.equal(z.text, '2021 年是个分界：这一年起，你看的番比读的书多了。');
  assert.equal(z.head, '2018—2020 年书多于番；2021—2022 年番多于书');
  assert.equal(z.star, true);
  const counted = [
    ...spread('book', 15, [2018, 2019, 2020]),
    ...spread('anime', 9, [2018, 2019, 2020]),
    ...spread('book', 6, [2021, 2022]),
    ...spread('anime', 10, [2021, 2022]),
  ];
  // rebuild so the evidence ids match this library, not a second tasteOf's ids
  const again = tasteOf(counted);
  subset(again.rows.turn.find((s) => s.tid === 'Z6')!, counted);

  const broken = tasteOf([
    ...spread('book', 10, [2018, 2019]),
    ...spread('anime', 6, [2018, 2019]),
    ...spread('book', 5, [2020]),
    ...spread('anime', 2, [2020]),
    ...spread('book', 6, [2021, 2022]),
    ...spread('anime', 10, [2021, 2022]),
  ]);
  assert.equal(broken.rows.turn.some((s) => s.tid === 'Z6'), false);
});

test('Z4: a topic fades and another takes its place; games do not bring the old one back', () => {
  const early = fBooks([2010, 2011, 2012], 2, { tags: ['推理'] });
  const late = fBooks([2016, 2017, 2018], 2, { kind: 'anime', tags: ['治愈'] });
  const games = fBooks([2018], 4, { kind: 'game', tags: ['推理'] });
  const r = tasteOf([...early, ...late, ...games]);
  const z = r.rows.turn.find((s) => s.tid === 'Z4');
  assert.ok(z);
  voice(z);
  assert.equal(z.text, '『推理』在 2013 年以后几乎没再出现，换成了『治愈』。');
  assert.equal(z.head?.includes('（6 部）'), true);
  assert.equal(z.star, true);
  subset(z, [...early, ...late]);
  assert.equal(z.evidence.some((e) => games.some((g) => g.id === e.id)), false);

  const thin = tasteOf([
    ...fBooks([2010, 2011, 2012], 1, { tags: ['推理'] }),
    ...fBooks([2010, 2011], 1, { tags: ['推理'] }),
    ...fBooks([2016, 2017], 2, { tags: ['推理'] }),
    ...fBooks([2016, 2017, 2018], 2, { tags: ['治愈'] }),
  ]);
  assert.equal(thin.rows.turn.some((s) => s.tid === 'Z4'), false);
});

test('Z3: a kind can arrive late and then stay, and a game cannot', () => {
  const books = fBooks([2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018], 1);
  const anime = fBooks([2014, 2015, 2016, 2017, 2018], 2, { kind: 'anime' });
  const full = tasteOf([...books, ...anime]);
  const z = full.rows.turn.find((s) => s.tid === 'Z3');
  assert.equal(z?.variant, 'full');
  assert.equal(z?.text, '2014 年，你第一次记下番。从那年起，每年都有。');
  voice(z!);
  subset(z!, anime);

  const stopped = fBooks([2014, 2015, 2016], 2, { kind: 'anime' });
  const gap = tasteOf([...books, ...stopped]);
  const short = gap.rows.turn.find((s) => s.tid === 'Z3');
  assert.equal(short?.variant, 'short');
  assert.equal(short?.text, '2014 年，你第一次记下番。那之后的三年里，每年都有。');
  voice(short!);

  const soon = fBooks([2012, 2013, 2014, 2015, 2016, 2017, 2018], 2, { kind: 'anime' });
  assert.equal(tasteOf([...books, ...soon]).rows.turn.some((s) => s.tid === 'Z3'), false);

  const games = fBooks([2014, 2015, 2016, 2017, 2018], 2, { kind: 'game' });
  assert.equal(tasteOf([...books, ...games]).rows.turn.some((s) => s.tid === 'Z3'), false);
});

test('Z5: the fullest year, the 30% margin, and a last-played year does not count', () => {
  const quiet = [2016, 2017, 2018];
  const full = tasteOf([
    ...fBooks(quiet, 5),
    ...fBooks([2019], 26),
  ]);
  const z = full.rows.turn.find((s) => s.tid === 'Z5');
  assert.equal(z?.text, '记得最满的一年是 2019：26 部，书占了一半。');
  assert.equal(z?.slots.n, 26);
  assert.equal(z?.head?.includes('26 部'), true);
  voice(z!);
  assert.equal(z!.evidence.every((e) => e.year === 2019), true);

  const exact = tasteOf([
    ...fBooks([2016], 20),
    ...fBooks([2017, 2018], 10),
    ...fBooks([2019], 26),
  ]);
  assert.equal(exact.rows.turn.find((s) => s.tid === 'Z5')?.slots.n, 26);

  const under = tasteOf([
    ...fBooks([2016], 20),
    ...fBooks([2017, 2018], 10),
    ...fBooks([2019], 25),
  ]);
  assert.equal(under.rows.turn.some((s) => s.tid === 'Z5'), false);

  const few = tasteOf([...fBooks(quiet, 5), ...fBooks([2019], 19)]);
  assert.equal(few.rows.turn.some((s) => s.tid === 'Z5'), false);
  assert.equal(tasteOf(fBooks([2016, 2017, 2018], 20)).rows.turn.some((s) => s.tid === 'Z5'), false);

  const named = tasteOf([
    ...fBooks(quiet, 5),
    ...spread('anime', 9, [2019]),
    ...spread('book', 8, [2019]),
    ...spread('film', 3, [2019]),
  ]);
  const half = named.rows.turn.find((s) => s.tid === 'Z5');
  assert.equal(half?.text, '记得最满的一年是 2019：20 部，番占了一半。');
  assert.equal(half?.slots.n, 20);
  voice(half!);

  const unnamed = tasteOf([
    ...fBooks(quiet, 5),
    ...spread('anime', 8, [2019]),
    ...spread('book', 7, [2019]),
    ...spread('film', 5, [2019]),
  ]);
  const plainYear = unnamed.rows.turn.find((s) => s.tid === 'Z5');
  assert.equal(plainYear?.variant, 'short');
  assert.equal(plainYear?.text, '记得最满的一年是 2019：20 部。');
  assert.equal(plainYear?.text.includes('一半'), false);
  assert.equal(plainYear?.slots.n, 20);

  const steam = tasteOf([
    ...fBooks([2016, 2017, 2018, 2019], 5),
    ...Array.from({ length: 30 }, (_, i) => played(2026, 8000 + i)),
  ]);
  assert.equal(steam.rows.turn.some((s) => s.tid === 'Z5'), false);
});

test('Z2 quotes a kept period, and only when it is strictly the fullest', () => {
  const summer = [
    ...Array.from({ length: 4 }, (_, i) => mk({ kind: 'anime', finished: `2019-06-${String(i + 1).padStart(2, '0')}` })),
    ...Array.from({ length: 4 }, (_, i) => mk({ kind: 'anime', finished: `2019-07-${String(i + 1).padStart(2, '0')}` })),
    ...Array.from({ length: 4 }, (_, i) => mk({ kind: 'anime', finished: `2019-08-${String(i + 1).padStart(2, '0')}` })),
  ];
  const r = tasteOf(summer, undefined, TODAY, [period('番剧的夏天', '2019-06-01', '2019-08-31')]);
  const z = r.rows.turn.find((s) => s.tid === 'Z2');
  assert.equal(z?.text, '2019 年夏天，你一口气记下 12 部番。那是你记得最满的一个季节。');
  assert.equal(z?.slots.n, 12);
  assert.equal(z?.head, '番剧的夏天：12 部');
  voice(z!);
  subset(z!, summer);
  assert.equal(z!.evidence.length <= 6, true);

  assert.equal(tasteOf(summer.slice(0, 9), undefined, TODAY, [period('番剧的夏天', '2019-06-01', '2019-08-31')]).rows.turn.some((s) => s.tid === 'Z2'), false);

  const winter = Array.from({ length: 12 }, (_, i) => mk({ finished: `2018-01-${String((i % 27) + 1).padStart(2, '0')}` }));
  const tie = tasteOf([...summer, ...winter], undefined, TODAY, [
    period('番剧的夏天', '2019-06-01', '2019-08-31'),
    period('另一个', '2018-01-01', '2018-01-31'),
  ]);
  assert.equal(tie.rows.turn.some((s) => s.tid === 'Z2'), false);

  const more = Array.from({ length: 11 }, (_, i) => mk({ finished: `2018-12-${String(i + 1).padStart(2, '0')}` }));
  const won = tasteOf([...summer.slice(0, 10), ...more], undefined, TODAY, [
    period('夏天', '2019-06-01', '2019-08-31'),
    period('年底', '2018-12-01', '2018-12-31'),
  ]);
  const picked = won.rows.turn.find((s) => s.tid === 'Z2');
  assert.equal(picked?.slots.n, 11);
  assert.equal(picked?.head, '年底：11 部');
  assert.equal(String(picked?.text).includes('冬天'), true);

  const across = tasteOf(summer, undefined, TODAY, [period('两年', '2018-06-01', '2019-08-31')]);
  const long = across.rows.turn.find((s) => s.tid === 'Z2');
  assert.equal(long?.variant, 'noSeason');
  assert.equal(long?.text.includes('一段日子'), true);
  assert.equal(long?.text.includes('夏天'), false);

  const yearOnly = tasteOf(summer, undefined, TODAY, [period('整年', '2019', '2019')]);
  assert.equal(yearOnly.rows.turn.find((s) => s.tid === 'Z2')?.variant, 'noSeason');

  const mixed = [
    ...summer.slice(0, 8),
    ...Array.from({ length: 4 }, (_, i) => mk({ kind: 'book', finished: `2019-08-${String(i + 10).padStart(2, '0')}` })),
  ];
  const bare = tasteOf(mixed, undefined, TODAY, [period('夏天', '2019-06-01', '2019-08-31')]);
  const noNoun = bare.rows.turn.find((s) => s.tid === 'Z2');
  assert.equal(noNoun?.text, '2019 年夏天，你一口气记下 12 部。那是你记得最满的一个季节。');
  assert.equal(noNoun?.slots.n, mixed.length);

  assert.equal(tasteOf(summer).rows.turn.some((s) => s.tid === 'Z2'), false);
});

test('Z7 is an empty stretch for the owner only, and it is not a 转向 row', () => {
  const around = [
    ...fBooks([2010, 2011, 2012], 10),
    ...fBooks([2016, 2017], 10),
  ];
  const r = tasteOf(around);
  assert.equal(r.rows.turn.length, 0);
  assert.ok(r.hollow);
  voice(r.hollow);
  assert.equal(r.hollow.text, '2013 到 2015 年，几乎没留下记录。');
  assert.equal(r.hollow.tid, 'Z7');
  assert.equal(r.missing.turn, undefined);
  const own = resolveRows(r, EMPTY_TASTE, 'own');
  assert.equal(own.some((row) => row.dim === 'turn'), false);
  assert.equal(own.some((row) => row.hint != null && row.dim === 'turn'), false);
  assert.equal(JSON.stringify(resolveRows(r, EMPTY_TASTE, 'outward')).includes('几乎没留下记录'), false);

  const shortGap = tasteOf([
    ...fBooks([2010, 2011], 10),
    ...fBooks([2014, 2015], 10),
  ]);
  assert.equal(shortGap.hollow, null);

  const even = tasteOf([
    ...fBooks([2010], 10),
    ...fBooks([2011], 40),
    ...fBooks([2015], 20),
    ...fBooks([2016], 30),
  ]);
  assert.equal(even.hollow?.text, '2012 到 2014 年，几乎没留下记录。');
  const broken = tasteOf([
    ...fBooks([2010], 10),
    ...fBooks([2011], 40),
    ...fBooks([2013], 3),
    ...fBooks([2015], 20),
    ...fBooks([2016], 30),
  ]);
  assert.equal(broken.hollow, null);

  const withTurn = z1();
  const both = tasteOf(withTurn.all);
  assert.equal(both.rows.turn[0].tid, 'Z1');
  assert.equal(both.hollow?.text, '2019 到 2021 年，几乎没留下记录。');
  assert.equal(both.rows.turn.some((s) => s.tid === 'Z7'), false);

  const stretched = tasteOf([
    ...around,
    ...Array.from({ length: 12 }, (_, i) => played(2026, 9000 + i)),
  ]);
  assert.equal(stretched.hollow?.text, '2013 到 2015 年，几乎没留下记录。');
  assert.equal(stretched.hollow?.evidence.some((e) => e.year === 2026), false);
});

test('H1 names what changed and the topic that did not; H4 needs a long topic and a turn toward games', () => {
  const early = fBooks([2016, 2017, 2018], 4, { kind: 'anime', tags: ['推理'] });
  const lateBooks = fBooks([2022, 2023], 2, { tags: ['推理'] });
  const lateGames = fBooks([2022, 2023], 6, { kind: 'game' });
  const r = tasteOf([...early, ...lateBooks, ...lateGames]);
  const h1 = r.headlines.find((h) => h.id === 'H1')?.sentence;
  assert.ok(h1);
  voice(h1);
  assert.equal(h1.text, '变过的是番和游戏，没变的是『推理』。');
  assert.equal(h1.star, true);
  subset(h1, [...early, ...lateBooks]);
  const shown = resolveRows(r, EMPTY_TASTE, 'own');
  assert.equal(pickHeadline(r, shown, '')?.text, h1.text);
  assert.equal(pickHeadline(r, shown, '  我的题句  ')?.text, '我的题句');
  const off = resolveRows(r, { on: true, rows: { turn: { off: true } } }, 'own');
  assert.equal(pickHeadline(r, off, '')?.id, undefined);
  assert.notEqual(pickHeadline(r, off, '')?.text, h1.text);

  const thin = tasteOf([
    ...fBooks([2016, 2017, 2018], 4, { kind: 'anime', tags: ['推理'] }),
    ...fBooks([2022, 2023], 1, { tags: ['推理'] }),
    ...fBooks([2022, 2023], 6, { kind: 'game' }),
  ]);
  assert.equal(thin.headlines.some((h) => h.id === 'H1'), false);
  assert.ok(thin.rows.turn.some((s) => s.tid === 'Z1'));

  const years = [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018];
  const topic = fBooks(years, 2, { tags: ['科幻'] });
  const games = fBooks([2022, 2023], 6, { kind: 'game' });
  const h4 = tasteOf([...topic, ...games]);
  const line = h4.headlines.find((h) => h.id === 'H4')?.sentence;
  assert.equal(line?.text, '八年绕着『科幻』转，这几年更多是游戏。');
  voice(line!);
  const showingL4 = resolveRows(h4, EMPTY_TASTE, 'own');
  assert.notEqual(showingL4.find((row) => row.dim === 'long')?.sentence?.tid, 'L3');
  assert.equal(pickHeadline(h4, showingL4, ''), null);
  const showingL3 = resolveRows(h4, { on: true, rows: { long: { pick: 'L3' } } }, 'own');
  assert.equal(pickHeadline(h4, showingL3, '')?.text, line?.text);
  const otherLong = showingL3.map((row) => (
    row.dim === 'long' && row.sentence ? { ...row, sentence: { ...row.sentence, tid: 'L5' as const } } : row
  ));
  assert.equal(pickHeadline(h4, otherLong, ''), null);

  const heavyGames = games.map((w, i) => ({ ...w, play: { minutes: 6000, lastPlayed: w.finished, provider: 'steam' as const, appid: 9000 + i } }));
  const lived = tasteOf([...topic, ...heavyGames]);
  assert.equal(lived.headlines.find((h) => h.id === 'H4')?.sentence.text, '八年绕着『科幻』转，这几年住在游戏里。');

  const shorter = fBooks([2012, 2013, 2014, 2015, 2016, 2017, 2018], 2, { tags: ['科幻'] });
  assert.equal(tasteOf([...shorter, ...games]).headlines.some((h) => h.id === 'H4'), false);

  const facts = buildFacts(toTasteWorks([
    ...fBooks([2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018], 2, { tags: ['科幻'] }),
    ...fBooks([2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018], 2, { tags: ['推理'] }),
  ], TODAY), TODAY, READY);
  const l1 = { tid: 'L1' as const, dim: 'long' as const, segs: [], text: '', evidence: [], nums: 0, slots: { a: '科幻', b: '推理' }, variant: 'full', star: true };
  assert.equal(headlineH4(l1, facts)?.text, '十年绕着『科幻』转，这几年更多是游戏。');
  const l3 = { ...l1, tid: 'L3' as const, slots: { topic: '推理' } };
  assert.equal(headlineH4(l3, facts)?.text, '八年绕着『推理』转，这几年更多是游戏。');
  assert.equal(headlineH1({ ...l1, tid: 'Z1', slots: {} }, facts), null);
});

test('every 转向 template, filled the same way the engine fills it, stays inside the voice rules', () => {
  for (const tid of ['Z1', 'Z1b', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7'] as const) {
    for (const tpl of Object.values(COPY[tid])) {
      assert.equal(tpl.includes('口味在变化'), false, tid);
      assert.equal(tpl.includes('少年'), false, tid);
    }
  }
});
