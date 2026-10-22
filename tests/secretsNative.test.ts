import './helpers/fakeAndroid';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNative } from '../src/lib/native';
import { getBangumiToken, getSecret } from '../src/lib/secrets';

const within = <T,>(p: Promise<T>, ms = 2000) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('never answered')), ms))]);

// 从文件恢复 on the phone did nothing after 换掉: importBackup asks for the token and the Steam key, and the
// secure store was handed back from an async function — the plugin proxy looks like a promise, so it never settled
test('phone: the secure store answers (token and Steam key), so a restore goes on', async () => {
  assert.equal(isNative(), true);
  assert.equal(await within(getBangumiToken()), null);
  assert.equal(await within(getSecret('steam-key')), null);
});
