import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secretOrNone } from '../src/lib/secrets';

test('restore: a secure store that never answers counts as no token after the wait, so the restore goes on', async () => {
  const t0 = Date.now();
  assert.equal(await secretOrNone(new Promise<string | null>(() => {}), 50), null);
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(await secretOrNone(Promise.resolve('tok'), 50), 'tok');
  const { SECRET_WAIT_MS } = await import('../src/lib/secrets');
  assert.equal(SECRET_WAIT_MS, 3000);
});
