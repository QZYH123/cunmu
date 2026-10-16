import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportTarget, imageTarget } from '../src/lib/saveOut';
import { pickAccept } from '../src/lib/native';
import { exportFileName } from '../src/lib/naming';

test('export: the browser downloads; the phone apps share; the desktop app asks where', () => {
  assert.equal(exportTarget('web'), 'download');
  assert.equal(exportTarget('android'), 'share');
  assert.equal(exportTarget('ios'), 'share');
  assert.equal(exportTarget(), 'download');   // under node, Capacitor reports the web
  assert.equal(exportTarget('web', true), 'save-dialog');   // the Windows app: the save dialog
});

test('long image: Android puts it in the album; the web downloads; Windows asks; iOS still shares', () => {
  assert.equal(imageTarget('android'), 'album');
  assert.equal(imageTarget('web'), 'download');
  assert.equal(imageTarget('web', true), 'save-dialog');
  assert.equal(imageTarget('ios'), 'share');
});

test('file inputs: the web and iOS filter by extension (Android takes any file, checked by the page)', () => {
  assert.equal(pickAccept('.xlsx,.zip'), '.xlsx,.zip');   // web here
});

test('export file name: Cunmu, your name, the day — never the retired 「我的百科」', () => {
  assert.equal(exportFileName('', '2026-10-11'), 'Cunmu-2026-10-11.zip');
  assert.equal(exportFileName(undefined, '2026-10-11'), 'Cunmu-2026-10-11.zip');
  assert.equal(exportFileName('沈舟', '2026-10-11'), 'Cunmu-沈舟-2026-10-11.zip');
  assert.equal(exportFileName(' 沈 舟/的 ', '2026-10-11'), 'Cunmu-沈-舟-的-2026-10-11.zip');   // no path characters, no spaces
  for (const t of ['', undefined, '沈舟']) assert.doesNotMatch(exportFileName(t, '2026-10-11'), /我的百科|百科/);
});
