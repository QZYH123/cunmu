import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dressOf, spineSet } from '../src/lib/shelf';
import type { Work } from '../src/data/types';
import { balance, runLength, runsOf, setSpineTitle, splitTitle, type SpineBox } from '../src/lib/spineTitle';

const box = (over: Partial<SpineBox> = {}): SpineBox => ({ w: 21, avail: 92, fsMax: 13, fsMin: 11, maxW: 31, padX: 3, colGap: 2, ...over });
const texts = (t: string, b = box()) => setSpineTitle(t, b).cols.map((c) => `${c.sub ? '~' : ''}${c.text}${c.fade ? '…' : ''}`);

test('spine title: the part that tells a volume apart goes to a second line', () => {
  assert.deepEqual(splitTitle('三体Ⅱ：黑暗森林'), { main: '三体Ⅱ', sub: '黑暗森林', soft: false });
  assert.deepEqual(splitTitle('福尔摩斯历险记 第一季'), { main: '福尔摩斯历险记', sub: '第一季', soft: false });
  assert.deepEqual(splitTitle('JoJo的奇妙冒险 第七部 飙马野郎'), { main: 'JoJo的奇妙冒险', sub: '第七部 飙马野郎', soft: false });
  assert.deepEqual(splitTitle('进击的巨人 第三季 Part.2'), { main: '进击的巨人', sub: '第三季 Part.2', soft: false });
  assert.deepEqual(splitTitle('剧场版 空之境界 第五章 矛盾螺旋'), { main: '空之境界', sub: '剧场版 第五章 矛盾螺旋', soft: false });
  assert.deepEqual(splitTitle('CLANNAD 〜AFTER STORY〜'), { main: 'CLANNAD', sub: 'AFTER STORY', soft: false });
  assert.deepEqual(splitTitle('塞尔达传说 -时光之笛-'), { main: '塞尔达传说', sub: '时光之笛', soft: false });
  assert.deepEqual(splitTitle('猫和老鼠（1965年电视版）'), { main: '猫和老鼠', sub: '1965年电视版', soft: false });
  // two names at a space are kept together when they fit; CJK meeting Latin is where they part
  assert.deepEqual(splitTitle('塞尔达传说 王国之泪'), { main: '塞尔达传说', sub: '王国之泪', soft: true });
  assert.deepEqual(splitTitle('钢之炼金术师 FULLMETAL ALCHEMIST'), { main: '钢之炼金术师', sub: 'FULLMETAL ALCHEMIST', soft: true });
  // nothing to split: a Latin colon inside a name, a plain title
  assert.equal(splitTitle('NieR:Automata').sub, '');
  assert.equal(splitTitle('葬送的芙莉莲').sub, '');
  assert.equal(splitTitle('THE BOOK 2').sub, '');
});

test('spine title: CJK upright, Latin turned, a short number upright among the characters', () => {
  assert.deepEqual(runsOf('明日之丈2'), [{ t: '明日之丈', upright: true }, { t: '2', upright: true, tcy: true }]);
  assert.deepEqual(runsOf('THE BOOK 2'), [{ t: 'THE BOOK 2', upright: false }]);
  assert.deepEqual(runsOf('1965年'), [{ t: '1965', upright: false }, { t: '年', upright: true }]);
  // a two-digit number is one upright cell, not two characters' run
  assert.equal(runLength('第12季', 10, undefined, 0), 30);
});

test('spine title: a short title is one column, as large as the bounds and the spine allow', () => {
  const r = setSpineTitle('三体', box());
  assert.deepEqual(r.cols, [{ text: '三体' }]);
  assert.equal(r.fs, 13);
  assert.equal(r.w, 21, 'the spine keeps its width');
  // a narrow spine caps the size by its width
  assert.equal(setSpineTitle('三体', box({ w: 16 })).fs, 11);
  // the size gives a little before anything else
  const s = setSpineTitle('秋天的第一场雨', box({ avail: 85 }));
  assert.equal(s.cols.length, 1);
  assert.ok(s.fs < 13 && s.fs >= 11);
});

test('spine title: a subtitle stands beside the name, a step smaller; the spine grows for it within bounds', () => {
  const r = setSpineTitle('福尔摩斯历险记 第一季', box());
  assert.deepEqual(r.cols.map((c) => c.text), ['福尔摩斯历险记', '第一季']);
  assert.equal(r.cols[1].sub, true);
  assert.equal(r.subFs, Math.max(11, r.fs - 1));
  assert.ok(r.w > 21 && r.w <= 31);
  // a spine that may not grow keeps the name alone
  assert.deepEqual(texts('福尔摩斯历险记 第一季', box({ maxW: 21 })), ['福尔摩斯历险记']);
  // two names at a space stay whole when they fit
  assert.deepEqual(texts('塞尔达传说 王国之泪', box({ avail: 140 })), ['塞尔达传说 王国之泪']);
  assert.deepEqual(texts('塞尔达传说 王国之泪'), ['塞尔达传说', '~王国之泪']);
});

test('spine title: too long for a column, two balanced columns at a natural break; a fade only last', () => {
  assert.deepEqual(texts('The Remains of the Day'), ['The Remains', 'of the Day'], 'whole words');
  assert.notEqual(balance('大逆转裁判2 成步堂龙之介的觉悟', 11)![1].slice(0, 1), '2', 'a number stays with its name');
  for (const c of setSpineTitle('大逆转裁判2 成步堂龙之介的觉悟', box({ w: 19, avail: 60 })).cols) assert.doesNotMatch(c.text, /^2/, 'even when it must fade');
  const [a, b] = balance('献给阿尔吉侬的花束', 11)!;
  assert.ok(Math.abs([...a].length - [...b].length) <= 1);
  // kinsoku: no column starts with 、。」
  for (const t of ['我们仍未知道那天所看见的花的名字。', '你好、世界、再见了朋友们啊、还有你']) {
    for (const c of setSpineTitle(t, box()).cols) assert.doesNotMatch(c.text, /^[、。」]/);
  }
  // nothing fits: two columns, the end fading out — never a hard cut
  const r = setSpineTitle('久石让在武道馆与宫崎骏动画一同走过的二十五年音乐会全程实况录音', box());
  assert.equal(r.cols.length, 2);
  assert.equal(r.cols[1].fade, true);
  assert.equal(r.fs, 11, 'the floor is 11px (§2.3)');
  // never under the floor, never past maxW
  for (const t of ['海猫鸣泣之时咲～猫箱和梦想的交响曲～', 'GUNDAM 30th ANNIVERSARY GUNDAM SONGS 145', '新・福音战士剧场版：终']) {
    const s = setSpineTitle(t, box());
    assert.ok(s.fs >= 11 && s.subFs >= 11 && s.w <= 31, t);
  }
});

const work = (id: string, kind: Work['kind'], title = '某部作品', year?: number): Work =>
  ({ id, kind, title, year, credits: [], finished: '', collected: '', source: 'manual', cover: null, genres: [], info: [] } as unknown as Work);

test('spine dress: each kind its own object, the same for a work every time, varied within the kind', () => {
  const kinds = { book: 'book', film: 'film', game: 'game', anime: 'anime', essay: 'plain', music: 'plain' } as const;
  for (const [k, d] of Object.entries(kinds)) assert.equal(dressOf(work('x1', k as Work['kind'])).kind, d);
  assert.deepEqual(dressOf(work('bgm-9585', 'book')), dressOf(work('bgm-9585', 'book')), 'deterministic');
  // within a kind the dress varies: over many works both places of a film band and both band tones turn up
  const films = Array.from({ length: 200 }, (_, i) => dressOf(work(`f${i}`, 'film', 't', 2000 + (i % 25))));
  const at = new Set(films.map((d) => d.orn[0].at)), tone = new Set(films.map((d) => d.orn[0].tone));
  assert.deepEqual([...at].sort(), ['foot', 'top']);
  assert.deepEqual([...tone].sort(), ['frame', 'ink']);
  const books = Array.from({ length: 200 }, (_, i) => dressOf(work(`b${i}`, 'book')));
  const hb = books.filter((d) => d.orn.some((o) => o.k === 'headband')).length;
  assert.ok(hb > 40 && hb < 120, `headbands on some books, not all (${hb}/200)`);
  assert.ok(books.some((d) => d.cls.includes('paperback')) && books.some((d) => !d.cls.includes('paperback')));
});

test('spine dress: a film band carries the year\'s two digits; ornaments take their run from the title', () => {
  assert.equal(dressOf(work('f1', 'film', 't', 2003)).orn[0].mark, '03');
  assert.equal(dressOf(work('f1', 'film', 't')).orn[0].mark, undefined, 'no year, no number');
  for (let i = 0; i < 50; i++) {
    for (const k of ['book', 'film', 'game', 'anime'] as const) {
      const d = dressOf(work(`w${i}`, k));
      const top = d.orn.filter((o) => o.at === 'top').reduce((n, o) => n + (o.h ?? 0), 0);
      const foot = d.orn.filter((o) => o.at === 'foot').reduce((n, o) => n + (o.h ?? 0), 0);
      assert.ok(d.top >= top && d.foot >= foot, `${k}: the title keeps clear of the ornaments`);
      assert.equal(d.foil, k === 'book' ? d.foil : false, 'foil only on books');
    }
  }
  // a dressed spine's title is set in what is left
  const plain = spineSet(work('e1', 'essay', '秋天的第一场雨'), 136);
  assert.equal(plain.dress.top + plain.dress.foot, 0);
  const film = spineSet(work('f1', 'film', '福尔摩斯历险记 第一季', 1984), 136);
  assert.ok(film.dress.top + film.dress.foot > 0);
});
