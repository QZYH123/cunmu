import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
};
const { clearSteamDraft, readSteamDraft, saveSteamDraft } = await import('../src/lib/steamDraft');

test('steam draft: what was typed comes back within the half hour, never the key; then it is gone', () => {
  const t = Date.parse('2026-10-19T12:00:00Z');
  saveSteamDraft('robinwalker', true, t);
  assert.deepEqual(readSteamDraft(t + 29 * 60_000), { user: 'robinwalker', away: true, at: t });
  assert.equal(readSteamDraft(t + 31 * 60_000), null, 'an old one is not reopened');
  assert.ok(!JSON.stringify([...mem.values()]).includes('key'), 'no key kept');
  clearSteamDraft();
  assert.equal(readSteamDraft(t), null);
  mem.set('cunmu/steam-draft', '{oops');
  assert.equal(readSteamDraft(t), null, 'a broken one reads as none');
});
