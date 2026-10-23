import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardModel } from '../src/data/card/model';
import { DROP_ORDER, applyDrops, maxDrops } from '../src/data/card/fit';
import { BOTTOM_SAFE, MID_H, ZONE } from '../src/data/card/metrics';
import { estimateMiddleHeight } from '../src/data/card/measure';

function model(over: Partial<CardModel> = {}): CardModel {
  const draft = {
    layout: 'A' as const,
    theme: 'light' as const,
    top: { since: 2010, byline: null, total: null },
    headline: '题'.repeat(28),
    lines: [
      { dim: 'met' as const, tid: 'M2' as const, label: '常遇见' as const, text: '句'.repeat(60), short: '短常', own: false },
      { dim: 'long' as const, tid: 'L1' as const, label: '长情' as const, text: '句'.repeat(60), short: '短长', own: false },
      { dim: 'turn' as const, tid: 'Z1' as const, label: '转向' as const, text: '句'.repeat(60), own: false },
    ],
    lead: null,
    periods: [
      { id: 'a', text: `2010 · ${'名'.repeat(12)} · 12 部` },
      { id: 'b', text: `2019 · ${'名'.repeat(12)} · 12 部` },
    ],
    favs: [],
    badge: { name: '存目' as const, version: '0.2.0', month: '2026 年 10 月' },
    notes: [],
    ...over,
  };
  return { ...draft, key: 'fixed' };
}

test('each arrangement drops in its own order, and a step that has nothing to drop still counts', () => {
  assert.deepEqual(DROP_ORDER, {
    A: ['periods', 'sentence3', 'short'],
    B: ['periodTail', 'short'],
    C: ['short'],
  });
  const a = model();
  assert.equal(maxDrops(a), 3);
  assert.equal(applyDrops(a, 0).periods.length, 2);
  assert.equal(applyDrops(a, 0).lines.length, 3);
  assert.deepEqual(applyDrops(a, 1).periods, []);
  assert.equal(applyDrops(a, 1).lines.length, 3);
  assert.equal(applyDrops(a, 2).lines.length, 2);
  assert.equal(applyDrops(a, 3).lines[0].text, '短常');
  assert.equal(applyDrops(a, 3).lines[1].text, '短长');
  assert.equal(applyDrops(a, 3).key, a.key);

  const two = model({ lines: model().lines.slice(0, 2) });
  assert.equal(applyDrops(two, 2).lines.length, 2);

  const b = model({ layout: 'B', periods: [...model().periods, { id: 'c', text: '2020 · 丙 · 3 部' }] });
  assert.equal(applyDrops(b, 1).periods.length, 2);
  assert.equal(applyDrops(b, 1).periods[1].id, 'b');
  const bShort = model({ layout: 'B' });
  assert.equal(applyDrops(bShort, 1).periods.length, 2);
  assert.equal(applyDrops(bShort, 2).lines[0].text, '短常');

  const c = model({ layout: 'C' });
  assert.deepEqual(DROP_ORDER.C, ['short']);
  assert.equal(applyDrops(c, 1).periods.length, 2);
  assert.equal(applyDrops(c, 1).lines[0].text, '短常');
  assert.equal(applyDrops(c, 1).lines[2].text, '句'.repeat(60));
});

test('zones stop above the bottom band, and the worst middle fits within three drops', () => {
  for (const [name, zone] of Object.entries(ZONE)) {
    if (name === 'badge') assert.ok(zone.y >= BOTTOM_SAFE, name);
    else assert.ok(zone.y + zone.h <= BOTTOM_SAFE, `${name} ${zone.y + zone.h}`);
  }
  let cur = model();
  let drops = 0;
  while (estimateMiddleHeight(cur) > MID_H && drops < 3) {
    drops += 1;
    cur = applyDrops(model(), drops);
  }
  assert.ok(drops <= 3, `took ${drops}`);
  assert.ok(estimateMiddleHeight(cur) <= MID_H, String(estimateMiddleHeight(cur)));
});
