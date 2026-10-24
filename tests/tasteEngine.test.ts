import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_ME, type Interest, type MeData, type Period } from '../src/data/me';
import { personId } from '../src/data/derive';
import { plain } from '../src/data/lead';
import { headlineH1, headlineH2, headlineH3, headlineH4, pickHeadline } from '../src/data/taste/headline';
import { lintSentence } from '../src/data/taste/lint';
import { numbersInCn } from '../src/data/taste/num';
import { peopleStatus } from '../src/data/taste/people';
import { resolveRows, showsTasteRow } from '../src/data/taste/pick';
import { EMPTY_TASTE } from '../src/data/taste/prefs';
import { HINT } from '../src/data/taste/copy';
import type { PeopleStatus, Sentence, TasteResult } from '../src/data/taste/types';
import type { Work } from '../src/data/types';
import { outwardView, worksForTaste } from '../src/data/visible';
import { READY, TODAY, at, by, fBooks, readerWorks, tasteOf } from './helpers/tasteFixtures';

function voice(result: TasteResult) {
  for (const row of Object.values(result.rows)) {
    for (const s of row) {
      assert.ok(s.evidence.length <= 6, s.tid);
      assert.equal(s.nums, numbersInCn(s.text), s.text);
      assert.deepEqual(lintSentence(s.text), [], s.text);
      assert.equal(s.text, plain(s.segs), s.text);
    }
  }
  for (const h of result.headlines) {
    assert.ok(h.sentence.evidence.length <= 6);
    assert.deepEqual(lintSentence(h.sentence.text), [], h.sentence.text);
  }
}

function orderWorks(): Work[] {
  const spec: [string, number[], string, string][] = [
    ['科幻', [2010, 2013, 2015, 2017, 2019, 2021], '甲', '乙'],
    ['推理', [2011, 2012, 2014, 2016, 2018, 2020], '丙', '丁'],
  ];
  const out: Work[] = [];
  for (const [tag, years, first, last] of spec) {
    for (const year of years) {
      for (let i = 0; i < 3; i++) {
        const title = year === years[0] && i === 0 ? first : year === years[years.length - 1] && i === 2 ? last : '丙';
        out.push(at(year, i, { tags: [tag], title }));
      }
    }
  }
  return out;
}

function metWorks(): Work[] {
  const spec: [string, number, number][] = [['伊坂幸太郎', 3, 3], ['渡边信一郎', 2, 3], ['今敏', 2, 2]];
  const out: Work[] = [];
  for (const [name, early, late] of spec) {
    for (let i = 0; i < early; i++) out.push(at(2010, i, { credits: [by(name)], title: name }));
    for (let i = 0; i < late; i++) out.push(at(2016, i, { credits: [by(name)], title: name }));
  }
  return out;
}

function watanabeWorks(): Work[] {
  const spellings = ['渡边信一郎', '渡辺信一郎', '渡邊信一郎', '渡边 信一郎'];
  const out: Work[] = [];
  spellings.forEach((name, n) => {
    out.push(at(2011, n, { credits: [by(name)], title: name }));
    out.push(at(2019, n, { credits: [by(name)], title: name }));
  });
  out.push(at(2012, 8, { credits: [by('Watanabe Shinichiro')], title: 'W' }));
  out.push(at(2018, 8, { credits: [by('Watanabe Shinichiro')], title: 'W' }));
  out.push(...fBooks([2014], 4));
  return out;
}

test('F1: eleven trusted works stay quiet; twelve open the block and still say nothing soft', () => {
  const eleven = tasteOf(fBooks([2016], 11));
  assert.equal(eleven.gate.trusted, 11);
  assert.equal(eleven.gate.ok, false);
  assert.ok(Object.values(eleven.rows).every((row) => row.length === 0));
  const own = resolveRows(eleven, EMPTY_TASTE, 'own');
  assert.equal(own.length, 1);
  assert.equal(own[0].sentence, null);
  assert.equal(own[0].hint, HINT.more);
  assert.deepEqual(resolveRows(eleven, { ...EMPTY_TASTE, rows: { long: { text: '自己写的' } } }, 'own')[0].sentence, null);
  assert.deepEqual(resolveRows(eleven, EMPTY_TASTE, 'outward'), []);

  const twelve = tasteOf(fBooks([2016], 12));
  assert.equal(twelve.gate.ok, true);
  assert.equal(twelve.rows.long.length, 0);
  assert.equal(twelve.missing.long, 'noTags');
  assert.equal(resolveRows(twelve, EMPTY_TASTE, 'own')[0].hint, HINT.more);
  assert.deepEqual(resolveRows(twelve, EMPTY_TASTE, 'outward'), []);
  voice(twelve);
});

test('F2: no playtime leaves 停留 empty and does not disturb 长情', () => {
  const years = Array.from({ length: 12 }, (_, i) => 2010 + i);
  const r = tasteOf(fBooks(years, 1));
  assert.equal(r.missing.stay, 'noSteam');
  assert.equal(r.rows.stay.length, 0);
  assert.equal(r.rows.long.some((s) => s.tid === 'L5'), true);
  voice(r);
});

test('长情 defaults to L1, then L4, then L5', () => {
  const works = orderWorks();
  const a = tasteOf(works);
  const b = tasteOf(works);
  assert.deepEqual(a, b);
  voice(a);
  assert.deepEqual(a.rows.long.map((s) => s.tid), ['L1', 'L4', 'L5']);
  const l1 = a.rows.long[0];
  assert.equal(l1.variant, 'full');
  assert.equal(l1.star, true);
  assert.equal(l1.text, '从 2010 到 2021，你每隔一阵就回到『科幻』和『推理』。别的都换过几轮了，这两个没走。');
  const l4 = a.rows.long[1];
  assert.equal(l4.variant, 'full');
  assert.equal(l4.text, '你记下的第一部『科幻』是 2010 年的《甲》，最近一部是 2021 年的《乙》。十一年，同一条线。');
  assert.ok(l4.segs.some((s) => s.kind === 'work' && s.text === '甲'));
  assert.ok(l4.evidence.some((e) => e.year === 2010) && l4.evidence.some((e) => e.year === 2021));
  const l5 = a.rows.long[2];
  assert.equal(l5.variant, 'full');
  assert.equal(l5.slots.kindVerb, '读书');
  assert.equal(l5.slots.from, 2010);
  assert.equal(l5.slots.years, 12);
});

test('常遇见 defaults to M2, and the same person can also head the page', () => {
  const r = tasteOf(metWorks());
  voice(r);
  assert.deepEqual(r.rows.met.map((s) => s.tid), ['M2', 'M1', 'M3']);
  const m2 = r.rows.met[0];
  assert.equal(m2.text, '伊坂幸太郎 6 部 · 渡边信一郎 5 部 · 今敏 4 部');
  assert.equal(m2.slots.list, m2.text);
  assert.deepEqual(m2.names, ['伊坂幸太郎', '渡边信一郎', '今敏']);
  assert.equal(m2.segs.find((s) => s.text === '伊坂幸太郎')?.to, `/person/${personId('伊坂幸太郎')}`);
  assert.equal(r.rows.met[1].text, '伊坂幸太郎和渡边信一郎，在你不同年份的 11 部作品里反复出现。');
  assert.equal(r.rows.met[2].text, '你和伊坂幸太郎，2010 年第一次碰上，到 2016 年还在碰。六年。');
  assert.equal(r.rows.met[2].slots.span, '六');
  const rows = resolveRows(r, EMPTY_TASTE, 'own');
  const h = pickHeadline(r, rows, '');
  assert.equal(h?.text, '六年，同一个名字：伊坂幸太郎。');
  assert.equal(h?.tid, 'M3');
  assert.equal(r.headlines[0]?.id, 'H2');
  assert.equal(h?.evidence.length, r.rows.met[2].evidence.length);
  const mine = pickHeadline(r, rows, '  我的题句  ');
  assert.equal(mine?.text, '我的题句');
  assert.equal(mine?.variant, 'user');
  assert.equal(pickHeadline(r, rows, '这是回忆')?.text, '这是回忆');
  assert.equal(headlineH1(), null);
  assert.equal(headlineH3(), null);
  assert.equal(headlineH4(), null);
  assert.equal(headlineH2({ slots: { span: '六', p: '回忆' }, evidence: [] } as Sentence), null);
});

test('F8: four spellings are one person; romaji stays another, and the line still says eight', () => {
  const r = tasteOf(watanabeWorks());
  voice(r);
  assert.deepEqual(r.rows.met.map((s) => s.tid), ['M2', 'M3']);
  const m2 = r.rows.met[0];
  assert.equal(m2.text, '渡边信一郎 8 部');
  assert.deepEqual(m2.names, ['渡边信一郎']);
  assert.equal(m2.text.includes('Watanabe'), false);
  assert.equal(m2.text.includes('渡辺'), false);
  assert.equal(m2.text.includes('渡邊'), false);
  assert.ok(m2.evidence.length <= 6);
  assert.ok(m2.evidence.some((e) => e.year === 2011) && m2.evidence.some((e) => e.year === 2019));
  assert.equal(r.rows.met[1].slots.p, '渡边信一郎');
  assert.equal(r.rows.met[1].slots.span, '八');
});

test('F12: below the people gate, 常遇见 is absent; at the gate, M2 is said', () => {
  const works = metWorks().map((w, i) => ({ ...w, id: `bgm-${i + 1}` }));
  const ids = works.map((w) => w.id.slice(4));
  const cover = (n: number) => ({ people: Object.fromEntries(ids.slice(0, n).map((id) => [id, [] as { name: string }[]])) });
  const loading = peopleStatus(works, cover(Math.floor(ids.length / 2)), { status: 'connected', problem: 'net' }, false);
  assert.equal(loading.state, 'loading');
  assert.ok(loading.coverage < 0.8);
  const quiet = tasteOf(works, loading);
  assert.equal(quiet.rows.met.length, 0);
  assert.equal(quiet.missing.met, 'peopleLoading');
  const ready = peopleStatus(works, cover(Math.ceil(ids.length * 0.8)), { status: 'disconnected' }, false);
  assert.equal(ready.state, 'ready');
  assert.equal(tasteOf(works, ready).rows.met[0]?.tid, 'M2');
});

test('a switch is per row, your sentence stays, and a grey line is only for you', () => {
  const bothWorks = [...orderWorks(), ...metWorks()];
  const result = tasteOf(bothWorks);
  voice(result);
  assert.ok(result.rows.long.length >= 2 && result.rows.met.length >= 2);
  const shown = resolveRows(result, EMPTY_TASTE, 'own');
  assert.equal(shown.find((r) => r.dim === 'long')?.sentence?.tid, 'L1');
  assert.equal(shown.find((r) => r.dim === 'long')?.others, result.rows.long.length - 1);
  assert.equal(shown.find((r) => r.dim === 'met')?.sentence?.tid, 'M2');
  assert.equal(showsTasteRow(shown), true);

  const swapped = resolveRows(result, { on: true, rows: { long: { off: true, pick: 'L5' } } }, 'own');
  const long = swapped.find((r) => r.dim === 'long')!;
  assert.equal(long.sentence?.tid, 'L5');
  assert.equal(long.off, true);
  assert.equal(long.others, result.rows.long.length - 1);
  assert.equal(swapped.find((r) => r.dim === 'met')?.off, false);
  const outward = resolveRows(result, { on: true, rows: { long: { off: true, pick: 'L5' } } }, 'outward');
  assert.ok(outward.every((r) => !r.off && r.hint == null && r.sentence));
  assert.equal(outward.some((r) => r.dim === 'long'), false);

  const missed = resolveRows(result, { on: true, rows: { long: { pick: 'L7' } } }, 'own');
  assert.equal(missed.find((r) => r.dim === 'long')?.sentence?.tid, 'L1');

  const text = '这一句是我写的，不随记录改';
  const kept = { on: true, rows: { met: { text } } };
  assert.equal(resolveRows(result, kept, 'own').find((r) => r.dim === 'met')?.sentence?.text, text);
  assert.equal(resolveRows(tasteOf(orderWorks()), kept, 'own').find((r) => r.dim === 'met')?.sentence?.text, text);
  assert.equal(resolveRows(result, kept, 'own').find((r) => r.dim === 'met')?.own, true);
  assert.equal(resolveRows(result, kept, 'own').find((r) => r.dim === 'met')?.others, result.rows.met.length);

  assert.deepEqual(resolveRows(result, { on: false, rows: { long: { text } } }, 'own'), []);
  const allOff = resolveRows(result, { on: true, rows: { long: { off: true }, met: { off: true } } }, 'own');
  assert.equal(allOff.length, 1);
  assert.equal(allOff[0].hint, HINT.allOff);
  assert.equal(showsTasteRow(allOff), false);
  assert.deepEqual(resolveRows(result, { on: true, rows: { long: { off: true }, met: { off: true } } }, 'outward'), []);

  const waiting: PeopleStatus = { coverage: 0.5, covered: 1, total: 2, state: 'loading' };
  const held = tasteOf(orderWorks(), waiting);
  assert.equal(held.missing.met, 'peopleLoading');
  const grey = resolveRows(held, EMPTY_TASTE, 'own').find((r) => r.dim === 'met');
  assert.equal(grey?.hint, HINT.people);
  assert.equal(grey?.sentence, null);
  assert.equal(resolveRows(held, EMPTY_TASTE, 'outward').some((r) => r.hint || r.dim === 'met'), false);
});

test('给人看 drops 只给自己 before a sentence, a name, or an interest is chosen', () => {
  const pub = [mkPub('p1', '公开甲', ['科幻']), mkPub('p2', '公开乙')];
  const priv = [1, 2, 3].map((i) => mkPub(`secret-${i}`, `SECRET-T${i}`, ['SECRET-TAG'], 'SECRET-C', `200${i}-03-01`));
  const me = meOf(pub, priv);
  assert.equal(worksForTaste([...pub, ...priv], me, TODAY, 'own').length, 5);
  assert.equal(worksForTaste([...pub, ...priv], me, TODAY, 'outward').length, 2);
  const ov = outwardView([...pub, ...priv], me, TODAY);
  assert.deepEqual(ov.interests.map((i) => i.name), ['科幻']);
  assert.deepEqual(ov.hiddenInterests, ['sec']);
  assert.deepEqual(ov.periods.map((p) => p.id), ['vis']);
  assert.deepEqual(ov.hiddenPeriods, ['hid']);
  assert.deepEqual(ov.favorites.map((f) => f.id), ['p1']);
  assert.equal(JSON.stringify(ov).includes('SECRET-'), false);

  const many = fBooks(Array.from({ length: 12 }, (_, i) => 2010 + i), 1);
  many[0].tags = ['科幻'];
  const hidden = [1, 2, 3].map((i) => mkPub(`secret-${i}`, `SECRET-T${i}`, ['SECRET-TAG'], 'SECRET-C', `200${i}-03-01`));
  const view = outwardView([...many, ...hidden], meOf(many, hidden), TODAY);
  const seen = tasteOf(view.works);
  assert.deepEqual(seen, tasteOf(many));
  assert.equal(JSON.stringify(seen).includes('SECRET-'), false);
  assert.equal(JSON.stringify(view).includes('SECRET-'), false);
});

test('F14: the reader library computes twice the same way, within 200ms', () => {
  const works = readerWorks();
  assert.equal(works.length, 1019);
  const people = peopleStatus(works, null, undefined, false);
  assert.equal(people.state, 'blocked');
  assert.equal(people.coverage, 0);
  const run = () => tasteOf(works, people, '2026-10-10');
  run();
  const t0 = performance.now();
  const a = run();
  const ms = performance.now() - t0;
  const b = run();
  assert.ok(ms < 200, `computeTaste took ${ms.toFixed(1)}ms`);
  assert.deepEqual(a, b);
  assert.equal(a.gate.ok, true);
  assert.ok(a.rows.long.length >= 1, 'reader 长情 was empty');
  assert.equal(a.rows.met.length, 0);
  assert.equal(a.missing.met, 'peopleBlocked');
  assert.equal(a.missing.stay, 'noSteam');
  assert.equal(a.rows.stay.length, 0);
  assert.equal(a.rows.turn.length, 0);
  assert.equal(a.missing.turn, undefined);
  assert.equal(a.hollow, null);
  voice(a);

  const credited = withCreators(works);
  const ready: PeopleStatus = { coverage: 1, covered: credited.length, total: credited.length, state: 'ready' };
  const t1 = performance.now();
  const met = tasteOf(credited, ready, '2026-10-10');
  assert.ok(performance.now() - t1 < 200, 'reader with names was slow');
  assert.ok(met.rows.met.length >= 1);
  voice(met);
});

function mkPub(id: string, title: string, tags?: string[], person?: string, finished?: string): Work {
  return at(finished ? Number(finished.slice(0, 4)) : 2016, 0, {
    id, title, ...(tags ? { tags } : null), ...(person ? { credits: [by(person)] } : null), ...(finished ? { finished } : null),
  });
}

function meOf(pub: Work[], priv: Work[]): MeData {
  const interest = (id: string, name: string, tags: string[]): Interest => ({
    id, name, rule: { tags }, include: [], exclude: [], createdAt: '2026-10-23T00:00:00Z',
  });
  const period = (id: string, name: string, from: string, to: string): Period => ({
    id, name, from, to, include: [], exclude: [], createdAt: '2026-10-23T00:00:00Z',
  });
  return {
    ...EMPTY_ME,
    onlyMe: priv.map((w) => w.id),
    interests: [interest('sec', 'SECRET-I', ['SECRET-TAG']), interest('sf', '科幻', ['科幻'])],
    periods: [period('hid', 'SECRET-P', '2001', '2003'), period('vis', '公开时期', '2016', '2016')],
    favorites: [{ id: priv[0].id, at: 't' }, { id: pub[0].id, at: 't' }],
  };
}

function withCreators(works: Work[]): Work[] {
  const next = works.map((w) => ({ ...w, credits: w.credits.map((c) => ({ ...c })) }));
  const first = new Map<number, Work>();
  for (const w of next) {
    const y = Number(w.finished.slice(0, 4));
    if (!Number.isFinite(y) || first.has(y)) continue;
    first.set(y, w);
  }
  const years = [...first.keys()].sort((a, b) => a - b);
  const step = Math.max(1, Math.floor(years.length / 8));
  years.filter((_, i) => i % step === 0).slice(0, 8).forEach((y, i) => {
    first.get(y)!.credits = [by(i % 2 === 0 ? '伊坂幸太郎' : '渡边信一郎')];
  });
  return next;
}
