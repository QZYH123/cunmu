import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMPTY_ME, fixMe } from '../src/data/me';
import { SCHEMA_VERSION, load } from '../src/data/persist';
import { EMPTY_CARD, EMPTY_TASTE, fixCard, fixTaste } from '../src/data/taste/prefs';

test('fixTaste fills defaults, drops a bad value, and cuts a sentence at 80', () => {
  assert.deepEqual(fixTaste(undefined), EMPTY_TASTE);
  const fixed = fixTaste({
    on: false,
    rows: {
      nope: { off: true },
      long: { off: false, pick: 'NOPE', text: '   ' },
      met: { off: true, pick: 'M2', text: `  ${'字'.repeat(90)}  ` },
    },
  });
  assert.equal(fixed.on, false);
  assert.equal(fixed.rows.long, undefined);
  assert.equal(fixed.rows.met?.off, true);
  assert.equal(fixed.rows.met?.pick, 'M2');
  assert.equal([...(fixed.rows.met?.text ?? '')].length, 80);
  assert.deepEqual(fixTaste(fixed), fixed);
});

test('fixCard keeps a known choice and drops the rest', () => {
  assert.deepEqual(fixCard(undefined), EMPTY_CARD);
  assert.deepEqual(fixCard({ layout: 'D', theme: 'dark', byline: true, badge: false, total: false, extra: 1 }), {
    theme: 'dark', byline: true, badge: false, total: false,
  });
  assert.deepEqual(fixCard({ layout: 'B', theme: 'nope' }), { layout: 'B', theme: 'light', byline: false, badge: true });
});

test('an older save keeps schema 4 and gains empty 偏爱 and card choices', () => {
  assert.equal(SCHEMA_VERSION, 4);
  const raw = {
    schemaVersion: 4,
    title: '沈舟',
    me: { profile: { line: '一行' }, favorites: [], interests: [], periods: [], onlyMe: ['x'], dismissed: [] },
  };
  const s = load(JSON.stringify(raw));
  assert.equal(s.schemaVersion, 4);
  assert.equal(s.title, '沈舟');
  assert.equal(s.me.profile.line, '一行');
  assert.deepEqual(s.me.onlyMe, ['x']);
  assert.deepEqual(s.me.taste, EMPTY_TASTE);
  assert.deepEqual(s.me.card, EMPTY_CARD);
  const me = fixMe({
    ...EMPTY_ME,
    profile: { line: '一行' },
    taste: { on: true, rows: { long: { text: '留着' } } },
    card: { theme: 'dark', byline: true, badge: false },
  });
  assert.deepEqual(fixMe(JSON.parse(JSON.stringify(me))), me);
});

test('a backup carries 偏爱 and the card, and merging two works does not touch them', async () => {
  const store = readFileSync('src/data/store.tsx', 'utf8');
  assert.match(store, /me:\s*s\.me/);
  assert.match(store, /me:\s*fixMe\(j\.me\)/);
  const me = fixMe({
    ...EMPTY_ME,
    favorites: [{ id: 'a', at: 't' }],
    taste: { on: true, rows: { met: { text: '常遇见这句' } } },
    card: { theme: 'dark', byline: false, badge: true, layout: 'A' },
  });
  const exported = { format: 'cunmu-export/1', me };
  assert.deepEqual(fixMe((exported as { me: unknown }).me), me);
  const { repointMe } = await import('../src/data/store');
  const moved = repointMe(me, 'a', 'b');
  assert.equal(moved.favorites[0].id, 'b');
  assert.equal(moved.taste.rows.met?.text, '常遇见这句');
  assert.equal(moved.card.layout, 'A');
});
