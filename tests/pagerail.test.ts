import { test } from 'node:test';
import assert from 'node:assert/strict';
import { railLabelAt } from '../src/components/PageRail';

test('page rail names the section whose top has passed the reading line', () => {
  const tops = [{ label: '2026', top: -900 }, { label: '2025', top: -200 }, { label: '2024', top: 300 }, { label: '2023', top: 1200 }];
  assert.equal(railLabelAt(tops, 320), '2024');
  assert.equal(railLabelAt(tops, 100), '2025');
  // before the first section reaches the line, the first one is named
  assert.equal(railLabelAt([{ label: '2026', top: 500 }], 320), '2026');
  assert.equal(railLabelAt([], 320), '');
});
