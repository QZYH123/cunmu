import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardModel } from '../src/data/card/model';
import { buildCaption } from '../src/data/card/caption';

function model(over: Partial<CardModel> = {}): CardModel {
  return {
    layout: 'A', theme: 'light',
    top: { since: 2016, byline: null, total: null },
    headline: null,
    lines: [{ dim: 'met', tid: 'M2', label: '常遇见', text: '句子里写了丁，配文不从这里拆', names: ['伊坂幸太郎', '渡边信一郎', '今敏'], own: false }],
    lead: null, periods: [],
    favs: [
      { workId: 'a', title: '甲', cover: null, aspect: 0.7, kind: 'book' },
      { workId: 'b', title: '乙', cover: null, aspect: 0.7, kind: 'book' },
      { workId: 'c', title: '丙', cover: null, aspect: 0.7, kind: 'book' },
      { workId: 'd', title: '丁', cover: null, aspect: 0.7, kind: 'book' },
    ],
    badge: null, notes: [], key: 'k',
    ...over,
  };
}

test('the caption keeps the parts that exist, drops the rest, and adds no address or tag', () => {
  const all = buildCaption(model());
  assert.equal(all, '始于 2016 ｜ 常遇见 伊坂幸太郎、渡边信一郎 ｜ 此生最爱 《甲》《乙》《丙》');
  assert.equal(all.includes('今敏'), false);
  assert.equal(all.includes('丁'), false);
  assert.doesNotMatch(all, /https?:|#/);

  const noMet = buildCaption(model({ lines: [] }));
  assert.equal(noMet, '始于 2016 ｜ 此生最爱 《甲》《乙》《丙》');

  const onlySince = buildCaption(model({ lines: [], favs: [] }));
  assert.equal(onlySince, '始于 2016');

  const named = buildCaption(model({ top: { since: 2016, byline: '名字', total: null } }));
  assert.equal(named.startsWith('名字 ｜ '), true);

  const noFavs = buildCaption(model({ lines: [], favs: [], top: { since: null, byline: '只有名字', total: null } }));
  assert.equal(noFavs, '只有名字');

  const arg = buildCaption(model({ top: { since: 2016, byline: '卡上的', total: null } }), '传入的');
  assert.equal(arg.startsWith('传入的 ｜ '), true);
  assert.equal(buildCaption(model({ lines: [], favs: [], top: { since: null, byline: null, total: null } })), '');
});
