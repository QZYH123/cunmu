import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_ME, type MeData, type Period } from '../src/data/me';
import { KIND_ASPECT, type Work } from '../src/data/types';
import { EMPTY_CARD, EMPTY_TASTE } from '../src/data/taste/prefs';
import { nextTid, sheetDims } from '../src/data/taste/pick';
import type { CardPrefs, Dim, Sentence, TastePrefs, TasteResult, TemplateId } from '../src/data/taste/types';
import { computeTaste } from '../src/data/taste/engine';
import { outwardView, type OutwardView } from '../src/data/visible';
import { buildCaption } from '../src/data/card/caption';
import { applyDrops } from '../src/data/card/fit';
import {
  CARD_MODEL_KEYS, CARD_MIN_WORKS, badgeMonth, buildCardModel, cardWorkCount,
  type CardInput, type CardModel, type CardPicks,
} from '../src/data/card/model';
import { READY, TODAY, at, by, fBooks, manualAdd, mk, played, tasteOf } from './helpers/tasteFixtures';

function sentence(dim: Dim, tid: TemplateId, text: string, extra: Partial<Sentence> = {}): Sentence {
  return { tid, dim, segs: [{ text }], text, evidence: [], nums: 0, slots: {}, variant: 'full', star: false, ...extra };
}

function result(rows: Partial<TasteResult['rows']> = {}, extra: Partial<TasteResult> = {}): TasteResult {
  return {
    gate: { trusted: 12, need: 12, ok: true },
    rows: { long: [], stay: [], met: [], turn: [], ...rows },
    headlines: [],
    hollow: null,
    missing: {},
    ...extra,
  };
}

function period(id: string, name: string, from: string, to: string | null, createdAt = TODAY): Period {
  return { id, name, from, to, include: [], exclude: [], createdAt };
}

function view(works: Work[], extra: Partial<OutwardView> = {}): OutwardView {
  return { works, periods: [], interests: [], favorites: [], hiddenPeriods: [], hiddenInterests: [], ...extra };
}

function build(over: Partial<CardInput> & Pick<CardInput, 'view' | 'taste'>): CardModel {
  return buildCardModel({
    prefs: EMPTY_TASTE, card: EMPTY_CARD, title: '', line: '', today: TODAY, version: '0.2.0', ...over,
  });
}

const fav = (id: string, why?: string) => ({ id, at: TODAY, ...(why ? { why } : null) });

test('lines come out met, long, turn, one each, and stay only fills a missing or hidden turn', () => {
  const taste = result({
    met: [sentence('met', 'M2', '常'), sentence('met', 'M1', '另一句常')],
    long: [sentence('long', 'L1', '长'), sentence('long', 'L5', '另一句长')],
    stay: [sentence('stay', 'S1', '停')],
    turn: [sentence('turn', 'Z1', '转')],
  });
  const full = build({ view: view([]), taste });
  assert.deepEqual(full.lines.map((l) => l.dim), ['met', 'long', 'turn']);
  assert.equal(full.lines[0].tid, 'M2');
  assert.equal(full.lines[0].label, '常遇见');

  const hidden = build({ view: view([]), taste, picks: { hide: ['M2'], swap: {}, literal: [] } });
  assert.deepEqual(hidden.lines.map((l) => [l.dim, l.tid]), [['long', 'L1'], ['turn', 'Z1']]);

  const swapped = build({ view: view([]), taste, picks: { hide: [], swap: { long: 'L5' }, literal: [] } });
  assert.equal(swapped.lines.find((l) => l.dim === 'long')?.tid, 'L5');

  const ownPrefs: TastePrefs = { on: true, rows: { long: { text: '我写的长情', pick: 'L5' } } };
  const own = build({ view: view([]), taste, prefs: ownPrefs, picks: { hide: [], swap: { long: 'L5' }, literal: [] } });
  const ownLine = own.lines.find((l) => l.dim === 'long');
  assert.equal(ownLine?.text, '我写的长情');
  assert.equal(ownLine?.own, true);
  assert.equal(ownLine?.tid, 'L5');

  const closed = build({ view: view([]), taste: result({}, { gate: { trusted: 3, need: 12, ok: false } }), prefs: { on: true, rows: { long: { text: '自己写的' } } } });
  assert.deepEqual(closed.lines, []);

  const stayTaste = result({ long: [sentence('long', 'L1', '长')], stay: [sentence('stay', 'S1', '停', { short: '短停' })] });
  const filled = build({ view: view([]), taste: stayTaste });
  assert.deepEqual(filled.lines.map((l) => l.dim), ['long', 'stay']);
  assert.equal(filled.lines[1].short, '短停');

  const metOff = build({ view: view([]), taste, prefs: { on: true, rows: { met: { off: true }, turn: { off: true } } } });
  assert.deepEqual(metOff.lines.map((l) => l.dim), ['long', 'stay']);

  const turnOn = build({ view: view([]), taste: result({ ...taste.rows, stay: [sentence('stay', 'S1', '停')] }) });
  assert.equal(turnOn.lines.some((l) => l.dim === 'stay'), false);
});

test('a guest headline that repeats a sentence drops that sentence; your line and your own words stay', () => {
  const m3 = sentence('met', 'M3', '六年，同一个名字：甲。', { names: ['甲'] });
  const taste = result(
    { met: [m3, sentence('met', 'M2', '甲 6 部', { names: ['甲'] })], long: [sentence('long', 'L1', '从 2010 到 2021')] },
    { headlines: [{ id: 'H2', sentence: { ...m3, text: '六年，同一个名字：甲。' } }] },
  );
  const dropped = build({ view: view(fBooks([2016], 12)), taste });
  assert.equal(dropped.headline, '六年，同一个名字：甲。');
  assert.equal(dropped.lines.some((l) => l.tid === 'M3'), false);
  assert.equal(dropped.lines.some((l) => l.dim === 'long'), true);
  assert.equal(dropped.lines.length, 1);
  assert.equal(dropped.layout, 'A');
  const periods = [period('p1', '甲', '2010', '2012'), period('p2', '乙', '2015', '2017')];
  const stillA = build({ view: view(fBooks([2011, 2016], 2), { periods }), taste });
  assert.equal(stillA.lines.length, 1);
  assert.equal(stillA.periods.length, 2);
  assert.equal(stillA.layout, 'A');
  const alone = result({ met: [m3] }, { headlines: [{ id: 'H2', sentence: { ...m3 } }] });
  const thinCard = build({ view: view([]), taste: alone });
  assert.equal(thinCard.lines.length, 0);
  assert.equal(thinCard.layout, 'C');

  const mine = build({ view: view([]), taste, line: '我的题句' });
  assert.equal(mine.headline, '我的题句');
  assert.equal(mine.lines.some((l) => l.tid === 'L1'), true);

  const written = build({
    view: view([]), taste,
    prefs: { on: true, rows: { met: { text: '自己的常遇见', pick: 'M3' } } },
  });
  assert.equal(written.lines.some((l) => l.own && l.text === '自己的常遇见'), true);
});

test('H2 leaves its person out of the default M2 list, and drops a sentence that is only about them', () => {
  const h2 = sentence('met', 'M3', '六年，同一个名字：甲。', { names: ['甲'] });
  const taste = result(
    {
      met: [
        sentence('met', 'M2', '甲 6 部 · 乙 5 部 · 丙 4 部', { names: ['甲', '乙', '丙'] }),
        sentence('met', 'M1', '甲和乙，在你不同年份的 8 部作品里反复出现。', { names: ['甲', '乙'] }),
        h2,
      ],
      long: [sentence('long', 'L1', '从 2010 到 2021')],
    },
    { headlines: [{ id: 'H2', sentence: h2 }] },
  );
  const card = build({ view: view(fBooks([2016], 12)), taste });
  assert.equal(card.headline, '六年，同一个名字：甲。');
  const met = card.lines.find((l) => l.dim === 'met');
  assert.equal(met?.tid, 'M2');
  assert.equal(met?.text, '乙 5 部 · 丙 4 部');
  assert.deepEqual(met?.names, ['乙', '丙']);
  assert.equal(card.lines.some((l) => l.text.includes('甲')), false);
  assert.equal(buildCaption(card).includes('甲'), false);
  assert.match(buildCaption(card), /常遇见 乙、丙/);

  const alone = build({
    view: view([]),
    taste: result(
      { met: [sentence('met', 'M2', '甲 6 部', { names: ['甲'] }), h2] },
      { headlines: [{ id: 'H2', sentence: h2 }] },
    ),
  });
  assert.equal(alone.headline, h2.text);
  assert.equal(alone.lines.some((l) => l.dim === 'met'), false);

  const swapped = build({
    view: view([]),
    taste,
    picks: { hide: [], swap: { met: 'M1' }, literal: [] },
  });
  assert.equal(swapped.headline, h2.text);
  assert.equal(swapped.lines.some((l) => l.dim === 'met'), false);
  assert.equal(swapped.lines.some((l) => l.dim === 'long'), true);

  const mine = build({ view: view([]), taste, line: '我的题句' });
  assert.equal(mine.headline, '我的题句');
  assert.equal(mine.lines.find((l) => l.dim === 'met')?.text, '甲 6 部 · 乙 5 部 · 丙 4 部');

  const written = build({
    view: view([]),
    taste,
    prefs: { on: true, rows: { met: { text: '仍然写甲', pick: 'M2' } } },
  });
  assert.equal(written.lines.find((l) => l.dim === 'met')?.text, '仍然写甲');
});

test('periods need two named stretches, hollow years leave, and the two fullest are ordered by time', () => {
  const works = [
    ...Array.from({ length: 5 }, (_, i) => at(2011, i)),
    ...Array.from({ length: 3 }, (_, i) => at(2016, i)),
    at(2019, 0),
  ];
  const periods = [
    period('p1', '早期', '2010', '2012', '2020-01-03'),
    period('p2', '中期', '2015', '2017', '2020-01-02'),
    period('p3', '后期', '2018', '2020', '2020-01-01'),
  ];
  const taste = result();
  const card = build({ view: view(works, { periods }), taste });
  assert.deepEqual(card.periods.map((p) => p.id), ['p1', 'p2']);
  assert.equal(card.periods[0].text, '2010\u20132012 · 早期 · 5 部');
  assert.equal(card.periods[1].text, '2015\u20132017 · 中期 · 3 部');
  assert.equal(card.layout, 'B');

  const one = build({ view: view(works, { periods: [periods[0]] }), taste });
  assert.deepEqual(one.periods, []);

  const hollow = sentence('long', 'L1', '', { slots: { from: 2010, to: 2017 } });
  const skipped = build({ view: view(works, { periods }), taste: result({}, { hollow }) });
  assert.deepEqual(skipped.periods, []);
});

test('since ignores last-played and a same-day clump; the total, the byline and the mark follow the switches', () => {
  const clump = Array.from({ length: 15 }, (_, i) => manualAdd('2002-01-01', { id: `c${i}`, title: `c${i}` }));
  const works = [
    played(2001, 1),
    ...clump,
    mk({ id: 'doing', status: 'doing', finished: '2003-01-01' }),
    at(2008, 0, { id: 'real' }),
    at(2014, 0, { id: 'later' }),
  ];
  const card = build({ view: view(works), taste: result() });
  assert.equal(card.top.since, 2008);
  assert.equal(card.top.total, null);
  assert.equal(card.top.byline, null);

  const many = fBooks([2016], 100);
  const withDoing = [...many, mk({ id: 'd', status: 'doing', finished: '2001-01-01' })];
  const counted = build({ view: view(withDoing), taste: result() });
  assert.equal(counted.top.total, 100);
  const forced = build({ view: view(works), taste: result(), card: { ...EMPTY_CARD, total: true } });
  assert.equal(forced.top.total, cardWorkCount(works));
  const hidden = build({ view: view(withDoing), taste: result(), card: { ...EMPTY_CARD, total: false } });
  assert.equal(hidden.top.total, null);

  const named = build({ view: view([]), taste: result(), card: { ...EMPTY_CARD, byline: true }, title: '甲'.repeat(13) });
  assert.equal(named.top.byline, '甲'.repeat(12));
  assert.equal(named.top.byline?.includes('…'), false);
  const blank = build({ view: view([]), taste: result(), card: { ...EMPTY_CARD, byline: true }, title: '   ' });
  assert.equal(blank.top.byline, null);

  assert.equal(badgeMonth('2026-10-23'), '2026 年 10 月');
  assert.equal(badgeMonth('2026-01-05'), '2026 年 1 月');
  assert.deepEqual(card.badge, { name: '存目', version: '0.2.0', month: '2026 年 10 月' });
  const noMark = build({ view: view([]), taste: result(), card: { ...EMPTY_CARD, badge: false } });
  assert.equal(noMark.badge, null);
});

test('the fallback sentence skips last-played, a same-day clump and 在看, and still says an approximate year', () => {
  const quiet = result({}, { gate: { trusted: 2, need: 12, ok: false } });
  const works = [
    played(2001, 1),
    ...Array.from({ length: 15 }, (_, i) => manualAdd('2002-01-01', { id: `c${i}`, title: `堆${i}` })),
    mk({ id: 'doing', status: 'doing', finished: '2003-01-01' }),
    at(2008, 0, { id: 'real' }),
  ];
  const card = build({ view: view(works), taste: quiet });
  assert.equal(card.lines.length, 0);
  assert.equal(card.top.since, 2008);
  assert.match(card.lead ?? '', /从 2008 年/);
  assert.equal(/2001|2002|2003/.test(card.lead ?? ''), false);

  const games = Array.from({ length: 12 }, (_, i) => played(2019, 3000 + i));
  const onlyGames = build({ view: view(games), taste: tasteOf(games) });
  assert.equal(onlyGames.lines.length, 0);
  assert.equal(onlyGames.top.since, null);
  assert.equal(onlyGames.lead, null);

  const approx = mk({
    id: 'yue',
    title: '旧',
    finished: '1999',
    date: { value: '1999', precision: 'year', level: 3, source: 'bgm_updated_at', approx: true, locked: false },
  });
  const early = build({ view: view([approx, at(2008, 1, { id: 'later' })]), taste: quiet });
  assert.equal(early.top.since, 2008);
  assert.match(early.lead ?? '', /从 1999 年/);
});

test('arrangement follows the sentence count, unless a saved choice says otherwise', () => {
  const two = build({ view: view([]), taste: result({ long: [sentence('long', 'L1', '长')], met: [sentence('met', 'M2', '常')] }) });
  assert.equal(two.layout, 'A');
  const works = [at(2011, 0), at(2011, 1), at(2016, 0), at(2016, 1)];
  const periods = [period('p1', '甲', '2010', '2012'), period('p2', '乙', '2015', '2017'), period('p3', '丙', '2018', null)];
  const wide = build({ view: view(works, { periods }), taste: result() });
  assert.equal(wide.layout, 'B');
  assert.equal(wide.periods.length, 2);
  const quiet = build({ view: view([]), taste: result() });
  assert.equal(quiet.layout, 'C');
  const pinned: CardPrefs = { ...EMPTY_CARD, layout: 'C' };
  const over = build({ view: view([]), taste: result({ long: [sentence('long', 'L1', '长')], met: [sentence('met', 'M2', '常')] }), card: pinned });
  assert.equal(over.layout, 'C');
});

test('notes, the lead, favorites and the key', () => {
  const quiet = tasteOf(fBooks([2016], 12));
  const lead = build({ view: view(fBooks([2016], 12)), taste: quiet });
  assert.equal(lead.lines.length, 0);
  assert.match(lead.lead ?? '', /^你从 /);
  assert.ok(lead.notes.includes('noLines'));
  assert.ok(lead.notes.includes('fewFavs'));

  const off = build({ view: view(fBooks([2016], 12)), taste: quiet, prefs: { ...EMPTY_TASTE, on: false } });
  assert.equal(off.lines.length, 0);
  assert.equal(off.lead, null);
  assert.equal(off.notes.includes('noLines'), false);

  const books = fBooks([2016], 6);
  const loading = result({ long: [sentence('long', 'L1', '长')] }, { missing: { met: 'peopleLoading' } });
  const noted = build({ view: view(books.slice(0, 2)), taste: loading });
  assert.deepEqual(noted.notes, ['peopleLoading', 'fewFavs']);

  const loved = books.slice(0, 5).map((w, i) => ({ ...w, title: `爱${i}`, cover: { thumb: `https://example/${i}`, medium: `https://example/${i}`, aspect: 0.7 } }));
  const favs = build({
    view: view(loved, { favorites: loved.map((w, i) => fav(w.id, i === 0 ? '因为' : undefined)).concat([fav('missing')]) }),
    taste: result(),
  });
  assert.deepEqual(favs.favs.map((f) => f.workId), loved.slice(0, 5).map((w) => w.id));
  assert.equal(favs.favs[0].why, undefined);
  assert.equal(favs.notes.includes('fewFavs'), false);

  const one = build({
    view: view([loved[0]], { favorites: [fav(loved[0].id, '因为')] }),
    taste: result(),
  });
  assert.equal(one.favs[0].why, '因为');
  assert.equal(one.favs[0].cover, loved[0].cover?.thumb);
  assert.equal(one.favs[0].aspect, 0.7);

  const extra = at(2017, 0, { id: 'extra', title: '额外', cover: null });
  const essay = mk({ id: 'e', kind: 'essay', title: '随笔' });
  const picks: CardPicks = { hide: [], swap: {}, literal: [loved[1].id], favs: [extra.id, ...loved.map((w) => w.id), 'nope', essay.id] };
  const picked = build({ view: view([...loved, extra, essay]), taste: result(), picks });
  assert.equal(picked.favs.length, 6);
  assert.equal(picked.favs.some((f) => f.workId === 'nope' || f.kind === 'essay'), false);
  assert.equal(picked.favs.find((f) => f.workId === loved[1].id)?.cover, null);
  assert.equal(picked.favs[0].aspect === 0.7 || picked.favs[0].aspect === KIND_ASPECT.book, true);

  const again = build({ view: view([]), taste: result({ long: [sentence('long', 'L1', '长')] }) });
  assert.equal(again.key, build({ view: view([]), taste: result({ long: [sentence('long', 'L1', '长')] }) }).key);
  const dark = build({ view: view([]), taste: result({ long: [sentence('long', 'L1', '长')] }), card: { ...EMPTY_CARD, theme: 'dark' } });
  assert.notEqual(dark.key, again.key);
  assert.equal(applyDrops(again, 2).key, again.key);
  assert.deepEqual(Object.keys(again), [...CARD_MODEL_KEYS]);
  for (const key of ['rating', 'rating10', 'username', 'avatar']) {
    assert.equal(key in again, false);
    assert.equal(again.favs.some((f) => key in f), false);
  }
  assert.equal(CARD_MIN_WORKS, 3);
});

test('a card built from the outward view keeps your own sentence and no private name', () => {
  const publicWorks = fBooks([2016], 12);
  const secret = mk({
    id: 'sec-w', title: 'SECRET-W', finished: '2001-01-01', credits: [by('SECRET-P')], tags: ['SECRET-TAG'],
    cover: { thumb: 'SECRET-C', medium: 'SECRET-C', aspect: 1 },
  });
  const me: MeData = {
    ...EMPTY_ME,
    onlyMe: ['sec-w', 'sec-e'],
    favorites: [fav('sec-w', 'SECRET-FAV'), fav(publicWorks[0].id)],
    interests: [{ id: 'i-s', name: 'SECRET-I', rule: { tags: ['SECRET-TAG'] }, include: [], exclude: [], createdAt: TODAY }],
    periods: [period('p-s', 'SECRET-PERIOD', '2001', '2001')],
    taste: { on: true, rows: { long: { text: 'SECRET-OWN' } } },
  };
  const library = [
    ...publicWorks, secret,
    mk({ id: 'sec-e', kind: 'essay', title: 'SECRET-ESSAY', finished: '2016-01-01' }),
    mk({ id: 'sec-s', title: 'SECRET-SAMPLE', isSample: true, finished: '2016-01-01' }),
  ];
  const seen = outwardView(library, me, TODAY);
  const taste = computeTaste({ works: seen.works, periods: seen.periods, today: TODAY, people: READY });
  assert.equal(taste.gate.ok, true);
  const model = build({ view: seen, taste, prefs: me.taste, title: 'SECRET-TITLE' });
  const blob = JSON.stringify(model) + buildCaption(model);
  assert.match(blob, /SECRET-OWN/);
  assert.doesNotMatch(blob, /SECRET-(?!OWN)/);
  assert.doesNotMatch(JSON.stringify(taste), /SECRET-/);

  const short = fBooks([2016], 11);
  const early = outwardView(short, { ...me, onlyMe: ['sec-w'], taste: me.taste }, TODAY);
  const quiet = computeTaste({ works: early.works, periods: early.periods, today: TODAY, people: READY });
  const hidden = build({ view: early, taste: quiet, prefs: me.taste });
  assert.equal(quiet.gate.ok, false);
  assert.doesNotMatch(JSON.stringify(hidden) + buildCaption(hidden), /SECRET-/);
});

test('a turn headline still counts, and the empty stretch never reaches the card', () => {
  const early = fBooks([2016, 2017, 2018], 4, { kind: 'anime', tags: ['推理'] });
  const lateBooks = fBooks([2022, 2023], 2, { tags: ['推理'] });
  const lateGames = fBooks([2022, 2023], 6, { kind: 'game' });
  const works = [...early, ...lateBooks, ...lateGames];
  const taste = tasteOf(works);
  const card = build({ view: view(works), taste });
  assert.equal(taste.hollow?.text, '2019 到 2021 年，几乎没留下记录。');
  assert.equal(card.headline, '变过的是番和游戏，没变的是『推理』。');
  assert.equal(card.lines.some((l) => l.dim === 'turn'), false);
  assert.equal(card.lines[0]?.dim, 'long');
  assert.equal(card.layout, 'A');
  assert.equal(JSON.stringify(card).includes('几乎没留下记录'), false);

  const me: MeData = { ...EMPTY_ME, onlyMe: lateGames.map((w) => w.id) };
  const seen = outwardView(works, me, TODAY);
  const guestTaste = tasteOf(seen.works);
  const guest = build({ view: seen, taste: guestTaste });
  assert.equal(guestTaste.rows.turn.some((s) => s.tid === 'Z1'), false);
  assert.equal(guest.headline, null);
  assert.equal(JSON.stringify(guest).includes('多是游戏'), false);
  assert.equal(JSON.stringify(guest).includes('几乎没留下记录'), false);
});

test('the edit sheet walks sentences and only lists a dimension that has one', () => {
  const cands = [sentence('long', 'L1', '甲'), sentence('long', 'L4', '乙'), sentence('long', 'L5', '丙')];
  assert.equal(nextTid(cands.slice(0, 1), 'L1'), null);
  assert.equal(nextTid([], null), null);
  assert.equal(nextTid(cands, null), 'L1');
  assert.equal(nextTid(cands, 'L4'), 'L5');
  assert.equal(nextTid(cands, 'L5'), 'L1');
  assert.equal(nextTid(cands, 'L7' as TemplateId), 'L1');

  const taste = result({ long: cands, met: [sentence('met', 'M2', '常')] });
  const prefs: TastePrefs = { on: true, rows: { turn: { text: '自己写的转向' } } };
  assert.deepEqual(sheetDims(taste, prefs), ['long', 'met', 'turn']);
  assert.deepEqual(sheetDims(taste, { ...prefs, on: false }), []);
  assert.deepEqual(sheetDims(result({}, { gate: { trusted: 1, need: 12, ok: false } }), prefs), []);
});
