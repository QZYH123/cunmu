import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_ME, chapterOrder, shownTo, type Interest, type MeData, type Period } from '../src/data/me';
import { autoLine, homeLead, interestLead, oftenMet, periodLead, plain, type LeadCtx } from '../src/data/lead';
import { docTitle, outwardView, shownIndex, type DocTitleInput } from '../src/data/visible';
import { DEFAULT_SETTINGS, derive, personId } from '../src/data/derive';
import { openInShow } from '../src/components/ShowMode';
import { searchLibrary } from '../src/components/CommandPalette';
import type { Work } from '../src/data/types';

/**
 * Cipher legend (the task's five, plus the plan's tag and a favorite line, so any SECRET- is a leak):
 * SECRET-W work title, SECRET-I hidden interest, SECRET-P person who exists only on hidden works,
 * SECRET-C that work's cover, SECRET-T hidden period. SECRET-TAG is the hidden work's genre,
 * SECRET-FAV its 最爱 line, SECRET-ESSAY a hidden essay, SECRET-SAMPLE the sample.
 * A partly visible interest keeps the name 还在的兴趣. SECRET-OWN is the owner's own line and must stay.
 */

const TODAY = '2026-10-23';
const COVER = 'https://example.com/SECRET-C.jpg';

const work = (over: Partial<Work> & Pick<Work, 'id' | 'title'>): Work => ({
  kind: 'book', credits: [], genres: [], info: [], finished: '2020-01-01', collected: '2020-01-01',
  source: 'manual', cover: null, ...over,
});
const credit = (name: string) => ({ name, role: '作者', core: true as const });
const interest = (over: Partial<Interest> & Pick<Interest, 'id' | 'name'>): Interest => ({
  rule: {}, include: [], exclude: [], createdAt: '2020-01-01', ...over,
});
const period = (over: Partial<Period> & Pick<Period, 'id' | 'name' | 'from'>): Period => ({
  to: null, include: [], exclude: [], createdAt: '2020-01-01', ...over,
});

const secW = work({
  id: 'sec-w', title: 'SECRET-W', finished: '2019-01-15', credits: [credit('SECRET-P')],
  tags: ['私密题'], genres: ['SECRET-TAG'], cover: { thumb: COVER, medium: COVER, aspect: 2 / 3 },
});
const library: Work[] = [
  secW,
  work({ id: 'sec-2', title: '私密二', finished: '2019-02-01', credits: [credit('差一点')], tags: ['私密题'] }),
  work({ id: 'sec-3', title: '私密三', finished: '2019-03-01', credits: [credit('差一点')], tags: ['私密题'] }),
  work({ id: 'sec-4', title: '私密四', finished: '2019-04-01', credits: [credit('差一点')], tags: ['私密题'] }),
  work({ id: 'sec-5', title: '私密五', finished: '2019-05-01', credits: [credit('SECRET-P')] }),
  work({ id: 'essay-no', kind: 'essay', title: 'SECRET-ESSAY', finished: '2019-06-01', body: ['SECRET-ESSAY'] }),
  work({ id: 'sample', title: 'SECRET-SAMPLE', finished: '2018-01-01', isSample: true }),
  work({ id: 'pub-a', title: '海边的书', finished: '2020-06-01', credits: [credit('公开作者')], tags: ['海边'] }),
  work({ id: 'pub-b', title: '另一本海边', finished: '2021-03-01', credits: [credit('公开作者')], tags: ['海边'] }),
  work({ id: 'pub-trap', title: '还能看的', finished: '2020-08-01', credits: [credit('公开作者')], tags: ['私密题'] }),
  work({ id: 'pub-keep', title: '还在的那部', finished: '2022-04-01', credits: [credit('差一点')] }),
  work({ id: 'essay-ok', kind: 'essay', title: '写过的一篇', finished: '2020-07-01', body: ['写过的一篇'] }),
  work({ id: 'doing', title: '正在读', finished: '2023-01-01', credits: [credit('公开作者')], status: 'doing' }),
];

const me: MeData = {
  ...EMPTY_ME,
  onlyMe: ['sec-w', 'sec-2', 'sec-3', 'sec-4', 'sec-5', 'essay-no'],
  interests: [
    interest({ id: 'i-secret', name: 'SECRET-I', rule: { tags: ['私密题'] }, exclude: ['pub-trap'] }),
    interest({ id: 'i-keep', name: '还在的兴趣', include: ['pub-keep'] }),
    interest({ id: 'i-sea', name: '海边', rule: { tags: ['海边'] } }),
  ],
  periods: [
    period({ id: 'p-secret', name: 'SECRET-T', from: '2019-01', to: '2019-12' }),
    period({ id: 'p-open', name: '那几年', from: '2020-01', to: '2021-12' }),
    period({ id: 'p-aug', name: '八月', from: '2020-08', to: '2020-08' }),
  ],
  favorites: [
    { id: 'sec-w', why: 'SECRET-FAV', at: '2020-01-01' },
    { id: 'sample', why: 'SECRET-SAMPLE', at: '2020-01-01' },
    { id: 'pub-a', why: '值得再看', at: '2020-01-01' },
    { id: 'essay-ok', why: '可以看的随笔', at: '2020-01-01' },
  ],
};

const ov = outwardView(library, me, TODAY);
const guestWorks = library.filter(shownTo(me.onlyMe));
const guestCtx: LeadCtx = {
  name: '我的库', works: guestWorks, interests: ov.interests, periods: ov.periods, today: TODAY, known: () => true,
};
const ownerCtx: LeadCtx = {
  name: '我的库', works: library, interests: me.interests, periods: chapterOrder(me.periods), today: TODAY, known: () => true,
};
/** what a forgotten caller would pass: every interest, but only the works a guest can see */
const leakyCtx: LeadCtx = { ...guestCtx, interests: me.interests };

const titleOf = (over: Partial<DocTitleInput> = {}): DocTitleInput => ({
  pathname: '/', libraryTitle: '我的库', appName: '存目', show: true, onlyMe: me.onlyMe,
  interests: ov.interests, periods: ov.periods, ...over,
});

test('outward view: hidden names, covers and favorites are gone; a partly visible interest stays', () => {
  const blob = JSON.stringify(ov);
  assert.doesNotMatch(blob, /SECRET-/, blob);
  assert.deepEqual(ov.interests.map((i) => i.name), ['还在的兴趣', '海边']);
  assert.deepEqual(ov.hiddenInterests, ['i-secret']);
  assert.ok(ov.hiddenPeriods.includes('p-secret'));
  assert.ok(!ov.hiddenPeriods.includes('p-open') && !ov.hiddenPeriods.includes('p-aug'));
  assert.ok(ov.works.some((w) => w.id === 'doing'), 'a work in progress stays');
  assert.ok(!ov.works.some((w) => w.kind === 'essay' || w.isSample || me.onlyMe.includes(w.id)));
  assert.deepEqual(ov.favorites.map((f) => f.id), ['pub-a', 'essay-ok']);
  assert.equal(ov.favorites.find((f) => f.id === 'pub-a')?.why, '值得再看');
  // the fixture really does carry the ciphers, or the assertion above would pass by saying nothing
  assert.match(JSON.stringify(library), /SECRET-W/);
  assert.match(JSON.stringify(me), /SECRET-I/);
  assert.match(plain(homeLead(ownerCtx)), /SECRET-I/);
});

test('guest outlets: the lead, the line, a period, the title and search carry no cipher', () => {
  const guest = shownIndex(library, me.onlyMe, DEFAULT_SETTINGS, []);
  const full = derive(library, DEFAULT_SETTINGS, new Set());
  const aug = me.periods.find((p) => p.id === 'p-aug')!;
  const keep = me.interests.find((i) => i.id === 'i-keep')!;
  const titles = [
    docTitle(titleOf()),
    docTitle(titleOf({ pathname: '/interest/i-secret' })),
    docTitle(titleOf({ pathname: '/interest/i-keep' })),
    docTitle(titleOf({ pathname: '/period/p-secret' })),
    docTitle(titleOf({ pathname: '/period/p-open' })),
    docTitle(titleOf({ pathname: `/person/${personId('SECRET-P')}` })),
    docTitle(titleOf({ pathname: '/entry/sec-w', work: { title: 'SECRET-W', kind: 'book' } })),
    docTitle(titleOf({ pathname: '/essay/essay-no', work: { title: 'SECRET-ESSAY', kind: 'essay' } })),
    docTitle(titleOf({ pathname: '/entry/pub-a', work: { title: '海边的书', kind: 'book' } })),
    docTitle(titleOf({ pathname: '/year/2020/3' })),
    docTitle(titleOf({ pathname: '/kind/book' })),
    docTitle(titleOf({ pathname: '/search' })),
    docTitle(titleOf({ libraryTitle: '', pathname: '/' })),
  ];
  const queries = ['SECRET-W', 'SECRET-I', 'SECRET-P', 'SECRET-C', 'SECRET-T', 'SECRET-TAG', 'SECRET-FAV', 'SECRET-ESSAY', 'SECRET-SAMPLE'];
  const info = [
    ov.interests.filter((_, n) => n < 4).map((i) => i.name).join('、'),
    oftenMet(ov.works, 3, () => true).join('、'),
    ov.periods[ov.periods.length - 1]?.name ?? '',
    ov.works.find((w) => w.finished)?.title ?? '',
  ];
  const blob = JSON.stringify({
    home: plain(homeLead(guestCtx)),
    line: autoLine(guestCtx),
    homeLeaky: plain(homeLead(leakyCtx)),
    lineLeaky: autoLine(leakyCtx),
    interest: plain(interestLead(keep, guestCtx)),
    period: plain(periodLead(ov.periods.find((p) => p.id === 'p-open')!, guestCtx)),
    periodLeaky: plain(periodLead(aug, leakyCtx)),
    titles,
    info,
    search: queries.map((q) => searchLibrary(q, guest.library, guest.d)),
    recent: guest.library.slice(0, 6).map((w) => w.title),
    people: oftenMet(ov.works, 5, () => true),
  });
  assert.doesNotMatch(blob, /SECRET-/, blob);
  assert.match(plain(homeLead(guestCtx)), /还在的兴趣/);
  assert.match(plain(homeLead(ownerCtx)), /SECRET-I/);
  assert.match(autoLine(ownerCtx), /SECRET-I/);
  assert.match(plain(periodLead(aug, ownerCtx)), /SECRET-I/);
  assert.equal(docTitle(titleOf({ pathname: '/interest/i-secret' })), '兴趣 · 存目');
  assert.equal(docTitle(titleOf({ pathname: '/period/p-secret' })), '时期 · 存目');
  assert.equal(docTitle(titleOf({ pathname: `/person/${personId('SECRET-P')}` })), '人物 · 存目');
  assert.equal(docTitle(titleOf({ pathname: '/entry/sec-w', work: secW })), '我的库 · 存目');
  assert.equal(docTitle(titleOf({ pathname: '/interest/i-keep' })), '还在的兴趣 · 存目');
  assert.equal(docTitle(titleOf({ pathname: '/entry/pub-a', work: library.find((w) => w.id === 'pub-a') })), '《海边的书》 · 存目');
  assert.equal(docTitle(titleOf({ show: false, pathname: '/interest/i-secret', interests: me.interests, periods: me.periods })), 'SECRET-I · 存目');
  assert.equal(docTitle(titleOf({ pathname: '/year/2020/3' })), '2020 · 三月 · 存目');
  assert.equal(docTitle(titleOf({ libraryTitle: '', pathname: '/' })), '存目');
  assert.equal(docTitle(titleOf({ pathname: '/card' })), '名片 · 存目');
  // the owner's own line is shown as written. taste.rows is not a field yet; this is that outlet.
  const mine = 'SECRET-OWN 这是我写的';
  assert.equal(mine.trim() || autoLine(guestCtx), mine);
  assert.doesNotMatch(autoLine(guestCtx), /SECRET-/);
  // search really can see the ciphers in the whole library, and cannot in the guest index
  assert.ok(searchLibrary('SECRET-W', library, full).works.length >= 1);
  assert.equal(searchLibrary('SECRET-W', guest.library, guest.d).works.length, 0);
  assert.ok(searchLibrary('SECRET-P', library, full).people.some((p) => p.name === 'SECRET-P'));
  assert.equal(searchLibrary('SECRET-P', guest.library, guest.d).people.length, 0);
  assert.ok(searchLibrary('SECRET-TAG', library, full).interests.some(([g]) => g === 'SECRET-TAG'));
  assert.equal(searchLibrary('SECRET-TAG', guest.library, guest.d).interests.length, 0);
  assert.ok(!guest.d.years.has(2019));
  assert.ok(library.slice(0, 6).some((w) => /SECRET-/.test(w.title)));
  assert.ok(!guest.library.slice(0, 6).some((w) => /SECRET-/.test(JSON.stringify(w))));
});

test('给人看: a hidden interest or period is not opened; omitting the list still opens an interest', () => {
  assert.equal(openInShow('/interest/i-secret', me.onlyMe, ov.hiddenPeriods, ov.hiddenInterests), false);
  assert.equal(openInShow('/period/p-secret', me.onlyMe, ov.hiddenPeriods, ov.hiddenInterests), false);
  assert.equal(openInShow('/entry/sec-w', me.onlyMe, ov.hiddenPeriods, ov.hiddenInterests), false);
  assert.equal(openInShow('/interest/i-keep', me.onlyMe, ov.hiddenPeriods, ov.hiddenInterests), true);
  assert.equal(openInShow('/period/p-open', me.onlyMe, ov.hiddenPeriods, ov.hiddenInterests), true);
  assert.equal(openInShow('/interest/i-secret', []), true);
  assert.equal(openInShow('/person/p-x', me.onlyMe, ov.hiddenPeriods, ov.hiddenInterests), false);
  assert.equal(openInShow('/search', []), false);
  assert.equal(openInShow('/card', []), false);
});

test('常遇见 counts the works it is given: hidden works do not add a person, and do not add to a count', () => {
  const all = library.filter((w) => w.kind !== 'essay');
  const full = oftenMet(all, 5, () => true);
  const open = oftenMet(ov.works, 5, () => true);
  assert.ok(full.includes('差一点'));
  assert.ok(full.includes('SECRET-P'));
  assert.ok(!open.includes('差一点'), 'one visible work plus three hidden ones is not 常遇见');
  assert.ok(!open.includes('SECRET-P'));
  assert.ok(open.includes('公开作者'));
  const count = (ws: Work[], name: string) => ws.filter((w) => w.credits.some((c) => c.core && c.name === name)).length;
  assert.equal(count(all, '差一点'), 4);
  assert.equal(count(ov.works, '差一点'), 1);
  assert.equal(count(all, 'SECRET-P'), 2);
  assert.equal(count(ov.works, 'SECRET-P'), 0);
});
