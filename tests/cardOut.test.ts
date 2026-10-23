import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageTarget } from '../src/lib/saveOut';
import { canCopyImage, cardFailToast, cardFileName, copyImage, prefetchCovers, savedToast } from '../src/lib/cardOut';

test('the card file name is the day, and nothing but ASCII', () => {
  assert.equal(cardFileName('2026-10-23'), 'Cunmu-card-2026-10-23.png');
  assert.equal(cardFileName('2026-10-23T01:02:03'), 'Cunmu-card-2026-10-23.png');
  assert.equal(cardFileName('nope'), 'Cunmu-card-0000-00-00.png');
  assert.match(cardFileName('2026-10-23'), /^Cunmu-card-\d{4}-\d{2}-\d{2}\.png$/);
  assert.match(cardFileName('我的书单名字'), /^[\x00-\x7F]+$/);
});

test('a finished save says where the file went; closing the sheet says nothing here', () => {
  assert.equal(savedToast('album'), '已存入相册');
  assert.equal(savedToast('download'), '名片存好了，在下载里');
  assert.equal(savedToast('save-dialog'), '名片存好了');
  assert.equal(savedToast('share'), '名片准备好了');
  assert.equal(cardFailToast(new Error('Permission denied')), '没有存进相册：先在系统设置里允许存储，再试一次');
  assert.equal(cardFailToast(new Error('boom')), '名片没画出来，再试一次');
  assert.equal(cardFailToast('denied by the system').includes('没有存进相册'), true);
});

test('where the file goes, and who may copy the image', () => {
  assert.equal(imageTarget('android', false), 'album');
  assert.equal(imageTarget('android', true), 'save-dialog');
  assert.equal(imageTarget('ios', false), 'share');
  assert.equal(imageTarget('ios', true), 'save-dialog');
  assert.equal(imageTarget('web', false), 'download');
  assert.equal(imageTarget('web', true), 'save-dialog');
  const clip = { hasClipboardItem: true, canWrite: true };
  assert.equal(canCopyImage({ native: true, desktop: false, ...clip }), false);
  assert.equal(canCopyImage({ native: true, desktop: true, ...clip }), true);
  assert.equal(canCopyImage({ native: false, desktop: false, ...clip }), true);
  assert.equal(canCopyImage({ native: false, desktop: true, hasClipboardItem: false, canWrite: true }), false);
  assert.equal(canCopyImage({ native: false, desktop: false, hasClipboardItem: true, canWrite: false }), false);
});

test('covers: a data url is kept, a stored picture is read, a huge or empty one is skipped', async () => {
  const data = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=';
  const passed = await prefetchCovers([{ workId: 'd', url: data }, { workId: 'n', url: null }], { fetch: async () => { throw new Error('no'); } });
  assert.equal(passed.get('d'), data);
  assert.equal(passed.has('n'), false);

  const png = new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' });
  const stored = await prefetchCovers([{ workId: 'i', url: 'idb:img1' }], { getImage: async (id) => (id === 'img1' ? png : null) });
  assert.match(stored.get('i') ?? '', /^data:image\/png;base64,/);

  const huge = { size: 3 * 1024 * 1024, type: 'image/jpeg', arrayBuffer: async () => { throw new Error('read'); } } as Blob;
  const skipped = await prefetchCovers(
    [{ workId: 'h', url: 'https://lain.bgm.tv/a.jpg' }],
    { localCover: (u) => u, fetch: async () => ({ ok: true, blob: async () => huge }) as Response },
  );
  assert.equal(skipped.has('h'), false);

  const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
  const many = Array.from({ length: 7 }, (_, i) => ({ workId: `w${i}`, url: `https://lain.bgm.tv/${i}.jpg` }));
  const capped = await prefetchCovers(many, {
    localCover: (u) => u,
    fetch: async () => ({ ok: true, blob: async () => jpeg }) as Response,
  });
  assert.equal(capped.size, 6);
  assert.equal(capped.has('w6'), false);

  const text = new Blob(['hello'], { type: 'text/plain' });
  const plain = await prefetchCovers([{ workId: 't', url: 'https://lain.bgm.tv/x' }], {
    localCover: (u) => u,
    fetch: async () => ({ ok: true, blob: async () => text }) as Response,
  });
  assert.equal(plain.has('t'), false);
  assert.equal(await copyImage(new Blob(['x'])), false);
});
