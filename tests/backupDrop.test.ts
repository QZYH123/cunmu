import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCunmuBackup } from '../src/data/backupFile';
import { makeZip } from '../src/lib/zip';

const file = (name: string, blob: Blob) => ({ name, arrayBuffer: () => blob.arrayBuffer(), text: () => blob.text() });
const backup = JSON.stringify({ format: 'cunmu-export/1', works: [] });

test('drop: a 存目 backup (ZIP or JSON, old name too) goes to 从文件恢复; a Douban file or junk does not', async () => {
  assert.equal(await isCunmuBackup(file('Cunmu 2026-10-22.zip', makeZip([{ name: 'cunmu.json', data: backup }]))), true);
  assert.equal(await isCunmuBackup(file('old.zip', makeZip([{ name: 'strata.json', data: JSON.stringify({ format: 'strata-export/1', works: [] }) }]))), true);
  assert.equal(await isCunmuBackup(file('cunmu.json', new Blob([backup]))), true);
  assert.equal(await isCunmuBackup(file('douban.zip', makeZip([{ name: 'marks.ndjson', data: '{}' }]))), false);
  assert.equal(await isCunmuBackup(file('豆伴.xlsx', new Blob(['PK']))), false);
  assert.equal(await isCunmuBackup(file('bad.zip', new Blob(['not a zip']))), false);
  assert.equal(await isCunmuBackup(file('other.json', new Blob([JSON.stringify({ format: 'x', works: [] })]))), false);
});
