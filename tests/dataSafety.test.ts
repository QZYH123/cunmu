import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExportConfirm } from '../src/components/DataSheets';
import { freshQuotes, QUOTES_THERE } from '../src/data/quotes';
import { keptLead } from '../src/data/lead';
import { NAME_EMPTY, titleReady } from '../src/data/guards';
import { STEAM_OFF_DROPS, STEAM_OFF_KEEPS, withoutSteam } from '../src/data/steamOff';
import { EARLIER_RESTORE, JSON_BACKUP_SAY, missingImageIds, referencedImageIds, restoreNotice } from '../src/data/backupImages';

const q = (text: string, where?: string) => ({ text, date: '2026-10-20', ...(where ? { where } : null) });

test('C-4: a pasted highlight already on the work, same words and chapter, is not added again', () => {
  const have = [q('同一句', '第三章')];
  assert.deepEqual(freshQuotes([q('同一句', '第三章'), q('  '), q('另一句', '第三章')], have).map((x) => x.text), ['另一句']);
  assert.deepEqual(freshQuotes([q('同一句', '第四章')], have).map((x) => x.where), ['第四章']);
  assert.deepEqual(freshQuotes([q('同一句', '第三章'), q('同一句', '第三章')], []).map((x) => x.where), ['第三章']);
  assert.equal(freshQuotes([q('同一句', '第三章')], have).length, 0);
  assert.equal(QUOTES_THERE, '这些摘抄已经在了');
});

test('C-6: disconnecting Steam clears recorded playtime and the connection, and says so', () => {
  const next = withoutSteam({
    plays: { 'steam-1': { minutes: 40 } },
    connections: { steam: { status: 'connected', steamId: '1' }, bangumi: { status: 'connected' } },
    extras: ['keep'],
  });
  assert.deepEqual(next.plays, {});
  assert.equal(next.connections.steam, null);
  assert.equal(next.connections.bangumi.status, 'connected');
  assert.deepEqual(next.extras, ['keep']);
  assert.match(STEAM_OFF_DROPS.join('\n'), /时长/);
  assert.match(STEAM_OFF_KEEPS, /还在/);
});

test('C-7: a JSON restore keeps a picture that is in the file or already on the device, and warns otherwise', () => {
  const json = {
    works: [{ cover: { thumb: 'idb:a', medium: 'idb:a', aspect: 1 } }, { cover: { medium: 'https://lain.bgm.tv/pic/cover/l/x.jpg' } }],
    notes: { w2: { coverOverride: { medium: 'idb:b' }, images: [{ src: 'idb:c' }] } },
  };
  assert.deepEqual(referencedImageIds(json).sort(), ['a', 'b', 'c']);
  assert.deepEqual(missingImageIds(['a', 'b', 'c'], ['a'], ['b']), ['c']);
  assert.deepEqual(missingImageIds(['a'], ['a'], []), []);
  assert.match(restoreNotice('恢复了 2 条', true), /封面会空着/);
  assert.equal(restoreNotice('恢复了 2 条', false), '恢复了 2 条');
  assert.match(JSON_BACKUP_SAY, /JSON/);
  assert.match(JSON_BACKUP_SAY, /图片/);
  assert.equal(EARLIER_RESTORE, '用更早版本的存目恢复这份文件时，偏爱和名片的设置不会带回来，其余内容都在。');
  const html = renderToStaticMarkup(createElement(ExportConfirm, { err: false, busy: false, onGo: () => {} }));
  assert.match(html, /用更早版本的存目恢复这份文件时，偏爱和名片的设置不会带回来，其余内容都在。/);
  assert.match(html, /class="t-small c-reading confirm-note"/);
});

test('B-5: an empty name cannot be saved', () => {
  assert.equal(titleReady(''), false);
  assert.equal(titleReady('   '), false);
  assert.equal(titleReady(' 牧晚汀 '), true);
  assert.equal(NAME_EMPTY, '先写上名字。');
});

test('A-9: a rewrite that only repeats the generated paragraph is not kept', () => {
  const auto = '从 2010 年开始记下看过的东西。';
  assert.equal(keptLead(`  ${auto}  `, auto), undefined);
  assert.equal(keptLead('', auto), undefined);
  assert.equal(keptLead('改过的一段。', auto), '改过的一段。');
});
