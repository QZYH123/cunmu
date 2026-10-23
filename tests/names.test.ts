import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonKey, mergeCreators } from '../src/data/taste/names';

test('spellings of one name share a key; a different person does not', () => {
  const watanabe = canonKey('渡边信一郎');
  assert.equal(canonKey('渡辺信一郎'), watanabe);
  assert.equal(canonKey('渡邊信一郎'), watanabe);
  assert.equal(canonKey('渡边·信一郎'), watanabe);
  assert.equal(canonKey('渡边 信一郎'), watanabe);
  assert.equal(canonKey('宮崎駿'), canonKey('宫崎骏'));
  assert.equal(canonKey('伊藤潤二'), canonKey('伊藤润二'));
  assert.equal(canonKey('後藤'), canonKey('后藤'));
  assert.equal(canonKey('髙桥'), canonKey('高桥'));
  assert.equal(canonKey('Ｇａｒｙ\u3000Ｏｌｄｍａｎ'), canonKey('gary oldman'));
  assert.notEqual(canonKey('Watanabe Shinichiro'), watanabe);
  assert.notEqual(canonKey('伊坂幸太郎'), canonKey('伊坂幸三郎'));
  assert.notEqual(canonKey('於'), canonKey('于'));
});

test('the shown spelling is the one that occurs most, and a tie keeps the first', () => {
  assert.deepEqual(
    mergeCreators(['渡辺信一郎', '渡边信一郎']).map((m) => m.name),
    ['渡辺信一郎'],
  );
  const merged = mergeCreators(['渡边信一郎', '渡辺信一郎', '渡边信一郎']);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, '渡边信一郎');
  assert.equal(merged[0].key, canonKey('渡边信一郎'));
  assert.equal(mergeCreators(['', '伊坂幸太郎']).length, 1);
});
