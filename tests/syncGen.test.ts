import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bangumiMayLand, bumpBangumiGeneration, bumpLibraryGeneration, bumpSteamGeneration, steamMayLand, syncStamp } from '../src/data/syncGen';

test('a Bangumi or Steam read may land only on the library it started on', () => {
  const bangumi = syncStamp();
  const steam = syncStamp();
  assert.equal(bangumiMayLand(bangumi), true);
  assert.equal(steamMayLand(steam), true);

  // bringing Steam in does not cancel a Bangumi read of this same library
  bumpSteamGeneration();
  assert.equal(bangumiMayLand(bangumi), true);
  assert.equal(steamMayLand(steam), false);
  assert.equal(steamMayLand(syncStamp()), true);

  // 断开 Bangumi cancels its read, not Steam's
  const steam2 = syncStamp();
  bumpBangumiGeneration();
  assert.equal(bangumiMayLand(bangumi), false);
  assert.equal(steamMayLand(steam2), true);

  // a restore or 删除全部内容 cancels both, including one that started during the restore
  const mid = syncStamp();
  bumpLibraryGeneration();
  assert.equal(bangumiMayLand(mid), false);
  assert.equal(steamMayLand(mid), false);
  assert.equal(bangumiMayLand(undefined), false);
  assert.equal(steamMayLand(syncStamp()), true);
});
