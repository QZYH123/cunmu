import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSync, type BgmCollection } from '../src/lib/bangumi';
import { resolveDates } from '../src/data/resolve';
import { asInterest, asPeriod, suggestions, INTERESTS_MAX } from '../src/data/suggest';
import { EMPTY_ME, chapterOrder, type Interest, type MeData, type Period } from '../src/data/me';
import { autoLine, homeLead, interestLead, numbersIn, oftenMet, orgLike, periodLead, plain, spaced, type LeadCtx, type Seg } from '../src/data/lead';
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

/** reader after saying 是 to every card, as the page would */
function acceptAll(): MeData {
  let me: MeData = { ...EMPTY_ME };
  for (let i = 0; i < 30; i++) {
    const s = suggestions(READER, { title: '沈舟', me, today: TODAY }).find((x) => x.type === 'interest' || x.type === 'period');
    if (!s) break;
    if (s.type === 'interest') me = { ...me, interests: [...me.interests, { ...asInterest(s), id: `i${i}`, createdAt: `2026-10-11T00:00:${String(i).padStart(2, '0')}Z` } as Interest] };
    else if (s.type === 'period') me = { ...me, periods: [...me.periods, { ...asPeriod(s), id: `p${i}`, createdAt: `2026-10-11T00:00:${String(i).padStart(2, '0')}Z` } as Period] };
  }
  return me;
}
const ME = acceptAll();
const ctx = (me: MeData, name = '沈舟'): LeadCtx => ({ name, works: READER, interests: me.interests, periods: chapterOrder(me.periods), today: TODAY });

/** the words the paragraph says itself: a name (an interest, a period, a work) is a name, not a figure */
const own = (segs: Seg[]) => segs.filter((s) => !s.kind).map((s) => s.text).join('').replace(/[《》]/g, '');

test('lead: the home paragraph says at most one number, and it is the year it began', () => {
  for (const me of [EMPTY_ME, ME]) {
    const text = plain(homeLead(ctx(me)));
    assert.ok(numbersIn(own(homeLead(ctx(me)))) <= 1, text);
    assert.match(text, /^沈舟从 \d{4} 年开始记下/);
    assert.ok(!/\d,\d{3}/.test(text), 'no counts in the lead');
  }
  // with interests and periods it names them, and each name links to its page
  const segs = homeLead(ctx(ME));
  assert.ok(segs.some((s) => s.kind === 'interest' && s.to?.startsWith('/interest/')));
  assert.ok(segs.some((s) => s.kind === 'period' && s.to?.startsWith('/period/')));
  // no name yet: 你
  assert.match(plain(homeLead(ctx(ME, ''))), /^你从/);
});

test('lead: accepting suggestions builds both interests and periods, alternately, and stops at a page\'s worth', () => {
  assert.ok(ME.interests.length >= 2 && ME.periods.length >= 2, `${ME.interests.length} interests, ${ME.periods.length} periods`);
  assert.ok(ME.interests.length <= INTERESTS_MAX);
  // whichever there are fewer of is offered first
  const one = { ...EMPTY_ME, interests: [ME.interests[0]] };
  const next = suggestions(READER, { title: '沈舟', me: one, today: TODAY }).find((x) => x.type === 'interest' || x.type === 'period');
  assert.equal(next?.type, 'period');
});

test('lead: interest and period paragraphs carry no counts; the line under the name carries the one count', () => {
  const c = ctx(ME);
  for (const i of ME.interests) {
    const t = plain(interestLead(i, c));
    assert.ok(numbersIn(own(interestLead(i, c))) <= 1, t);
  }
  for (const p of ME.periods) {
    const t = plain(periodLead(p, c));
    assert.equal(numbersIn(own(periodLead(p, c))), 0, t);
    assert.match(t, /^这段日子/);
  }
  const line = autoLine(c);
  assert.match(line, /^2008 年起，看过、玩过 1,019 部/);
  assert.ok(!/听过/.test(line), 'only the two things done most');
});

test('lead: people are people — a studio or a company division is not 「常遇见」', () => {
  assert.ok(orgLike('任天堂企画制作本部'));
  assert.ok(orgLike('京都アニメーション株式会社'));
  assert.ok(orgLike('Studio Ghibli'));
  assert.ok(!orgLike('伊藤润二'));
  assert.ok(!orgLike('今敏'));
  const w = (id: string, names: string[]): Work => ({ id, kind: 'anime', title: id, credits: names.map((name) => ({ name, role: '导演', core: true })), finished: '2020-01-01', collected: '', source: 'bangumi', cover: null, genres: [], info: [] });
  assert.deepEqual(oftenMet([w('a', ['今敏', '任天堂企画制作本部']), w('b', ['今敏', '任天堂企画制作本部'])]), ['今敏']);
});

test('lead: a space where letters or digits meet Chinese across a link, none after punctuation', () => {
  const t = (segs: { text: string; to?: string }[]) => spaced(segs).map((s) => s.text).join('');
  assert.equal(t([{ text: '最密的是' }, { text: '2010 年春天', to: '/period/a' }, { text: '那段时候。' }]), '最密的是 2010 年春天那段时候。');
  assert.equal(t([{ text: '常遇见' }, { text: '宮崎駿', to: '/p/1' }, { text: '和' }, { text: 'Gary Oldman', to: '/p/2' }, { text: '。' }]), '常遇见宮崎駿和 Gary Oldman。');
  assert.equal(t([{ text: '《' }, { text: 'Fate/Zero', to: '/e/1' }, { text: '》，' }, { text: '2008 年夏天', to: '/x' }]), '《Fate/Zero》，2008 年夏天');
  assert.equal(t([{ text: 'Brian Cox', to: '/p' }, { text: '和' }]), 'Brian Cox 和');
});
