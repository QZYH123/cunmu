#!/usr/bin/env node
/**
 * Smoke test of the APP build (what ships: no demo catalogue). Same rules as smoke.mjs — a page throw, a
 * console error, an empty #root or a missing landmark fails — plus: no request may leave localhost except to
 * api.bgm.tv / lain.bgm.tv, and those are answered from recorded fixtures (tests/fixtures/bangumi/), so the
 * test never touches the network.
 *
 *   node scripts/smoke-app.mjs              build the app into a temp dir and test it
 *   node scripts/smoke-app.mjs --no-build   test the existing dist/ (npm run verify, right after npm run build)
 */
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const t0 = Date.now();
const ROOT = new URL('..', import.meta.url).pathname;
const VITE = join(ROOT, 'node_modules/.bin/vite');
const CHROME = process.env.CHROME || ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
if (!CHROME) { console.error('smoke-app: no Chrome found — set CHROME=/path/to/chrome'); process.exit(2); }

let outDir = join(ROOT, 'dist');
let tmp = null;
if (!process.argv.includes('--no-build')) {
  tmp = mkdtempSync(join(tmpdir(), 'cunmu-smoke-app-'));
  outDir = join(tmp, 'dist');
  const b = spawnSync(VITE, ['build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  if (b.status !== 0) { console.error('smoke-app: build failed'); process.exit(1); }
} else if (!existsSync(join(outDir, 'index.html'))) { console.error('smoke-app: no dist/ — run npm run build first'); process.exit(2); }

const freePort = () => new Promise((res, rej) => {
  const s = createServer(); s.unref(); s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
});
const port = await freePort();
const server = spawn(VITE, ['preview', '--outDir', outDir, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const BASE = `http://127.0.0.1:${port}/`;
process.on('exit', () => { server.kill(); if (tmp) rmSync(tmp, { recursive: true, force: true }); });
for (let i = 0; ; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ }
  if (i > 100) { console.error('smoke-app: preview server did not start'); process.exit(1); }
  await new Promise((r) => setTimeout(r, 100));
}

// ---- Bangumi, answered from fixtures ----
const FIX = join(ROOT, 'tests/fixtures/bangumi');
const fixture = (name) => JSON.parse(readFileSync(join(FIX, name), 'utf8'));
/** a 1×1 JPEG for every cover request */
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const bgmLog = [];
/** reader's whole 看过 (1019, dates only — tests/fixtures/bangumi/reader-done-dates.json) as collection items */
const readerDone = () => fixture('reader-done-dates.json').rows.map(([id, st, updated, cn, name, date]) => ({
  subject_id: id, subject_type: st, type: 2, rate: 0, comment: null, tags: [], updated_at: updated, private: false,
  subject: { id, type: st, name, name_cn: cn, date: date || null, images: null },
}));
async function routeBangumi(ctx, opts = {}) {
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.hostname === 'lain.bgm.tv') return route.fulfill({ status: 200, contentType: 'image/jpeg', body: JPEG, headers: { 'access-control-allow-origin': '*' } });
    if (u.hostname !== 'api.bgm.tv') { bgmLog.push(`blocked ${u.href}`); return route.abort(); }
    bgmLog.push(`${req.method()} ${u.pathname}${u.search}`);
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const m = u.pathname.match(/^\/v0\/users\/([^/]+)(\/collections)?$/);
    if (u.pathname === '/v0/me') {
      const auth = req.headers().authorization ?? '';
      return auth === 'Bearer goodtoken0123456789abcdefghij' ? json(200, fixture('user-reader.json')) : json(401, { title: 'Unauthorized', description: 'bad token' });
    }
    if (m && m[1] === 'nosuchuser') return json(404, { title: 'Not Found', description: 'user not found' });
    if (m && !m[2]) return json(200, fixture('user-reader.json'));
    if (m && m[2]) {
      const type = Number(u.searchParams.get('type'));
      const st = Number(u.searchParams.get('subject_type'));
      const offset = Number(u.searchParams.get('offset') ?? 0);
      const limit = Number(u.searchParams.get('limit') ?? 30);
      const all = (opts.reader ? readerDone().filter(() => type === 2) : fixture('collections-reader.json').data).filter((c) => c.type === type && (!st || c.subject_type === st));
      const extra = opts.more && type === 2 ? fixture('collections-reader-later.json').data.filter((c) => !st || c.subject_type === st) : [];
      const rows = [...extra, ...all];
      return json(200, { data: rows.slice(offset, offset + limit), total: rows.length, limit, offset });
    }
    const p = u.pathname.match(/^\/v0\/subjects\/(\d+)\/persons$/);
    if (p) { const people = fixture('persons.json'); return json(200, people[p[1]] ?? []); }
    const s = u.pathname.match(/^\/v0\/subjects\/(\d+)$/);
    if (s) { const subj = fixture('subjects.json')[s[1]]; return subj ? json(200, subj) : json(404, { title: 'Not Found' }); }
    return json(404, { title: 'Not Found' });
  });
}

// ---- run ----
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const results = [];
const VP = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' };
async function withPage(name, fn, opts = {}) {
  const t = Date.now();
  const ctx = await browser.newContext({ ...VP, acceptDownloads: true });
  await routeBangumi(ctx, opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
  // Bangumi's 401/404 answers are expected in the error tests; the browser logs each one
  page.on('console', (m) => { if (m.type() === 'error' && !/api\.bgm\.tv/.test(m.location()?.url ?? '')) errors.push(`console: ${m.text().split('\n')[0]}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !/api\.bgm\.tv/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });
  let fail = null;
  try { await fn(page, ctx); } catch (e) { fail = e.message.split('\n')[0]; }
  await page.waitForTimeout(150);
  const blocked = bgmLog.filter((l) => l.startsWith('blocked'));
  bgmLog.length = 0;
  const problems = [...(fail ? [fail] : []), ...new Set(errors), ...blocked];
  results.push({ name, ok: !problems.length, problems, ms: Date.now() - t });
  await ctx.close();
}
const open = async (page, hash = '/') => {
  await page.goto(`${BASE}?motion=reduce#${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, null, { timeout: 3000 });
};
const LS = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('cunmu/library') || '{}'));
const sheet = (page) => page.locator('.sheet[role="dialog"]');

await withPage('first open: the empty home, nothing from the demo', async (page) => {
  const reqs = [];
  page.on('request', (r) => reqs.push(r.url()));
  await open(page);
  await page.locator('.app h1, .app .btn').first().waitFor({ timeout: 5000 });
  if (await page.locator('.tile[data-id]').count()) throw new Error('tiles on a first open');
  const bad = reqs.filter((u) => /covers\/|bgm\.tv/.test(u));
  if (bad.length) throw new Error(`requested ${bad[0]}`);
});

await withPage('我: the real version, no prototype tools, no iCloud switch', async (page) => {
  await open(page, '/me');
  await page.locator('.copyright').waitFor({ timeout: 5000 });
  const text = await page.locator('.me-page').innerText();
  if (/原型调试|iCloud/.test(text)) throw new Error('prototype-only rows in 我');
  const ver = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  if (!text.includes(`版本 ${ver}`)) throw new Error(`no 「版本 ${ver}」 in the colophon`);
});

await withPage('关于: privacy names the only two hosts, licences list what ships, diagnostics carry no titles', async (page) => {
  await open(page, '/me');
  await page.getByRole('link', { name: '隐私说明' }).click();
  await page.locator('.doc-page h2').first().waitFor({ timeout: 5000 });
  const privacy = await page.locator('.doc-page').innerText();
  for (const host of ['api.bgm.tv', 'lain.bgm.tv']) if (!privacy.includes(host)) throw new Error(`privacy: no ${host}`);
  await page.goBack();
  await page.getByRole('link', { name: '开源许可' }).click();
  await page.locator('.lic-row').first().waitFor({ timeout: 5000 });
  const lic = await page.locator('.doc-page').innerText();
  for (const name of ['react', '@capacitor/core', '@aparajita/capacitor-secure-storage', 'OFL-1.1']) if (!lic.includes(name)) throw new Error(`licences: no ${name}`);
  await page.goBack();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  // a screen reader hears a toast from a live region that was there before it
  await page.evaluate(() => { window.__live = document.querySelector('[role="status"][aria-live="polite"]'); });
  await page.getByRole('button', { name: /复制诊断信息/ }).click();
  await page.locator('.toast, [role="status"]').filter({ hasText: '诊断信息复制好了' }).first().waitFor({ timeout: 5000 });
  if (!(await page.evaluate(() => !!window.__live?.isConnected && window.__live.textContent.includes('诊断信息复制好了')))) throw new Error('the toast was not put in a live region that was already there');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (!/^Cunmu \d/.test(copied) || !copied.includes('条目：0')) throw new Error(`diagnostics: ${copied.slice(0, 80)}`);
});

await withPage('看看示例: generated art, made-up names, leaves nothing behind', async (page) => {
  await open(page);
  await page.getByRole('button', { name: '看看示例' }).click();
  await page.locator('.tile[data-id^="sample-"]').first().waitFor({ timeout: 5000 });
  const imgs = await page.locator('.tile img').evaluateAll((els) => els.map((e) => e.getAttribute('src') ?? ''));
  if (imgs.some((s) => s && !s.startsWith('data:'))) throw new Error(`a sample cover is not generated art: ${imgs.find((s) => !s.startsWith('data:'))}`);
  await page.getByRole('button', { name: '换成我自己的' }).click();
  await page.waitForTimeout(400);
  if (await page.locator('.tile[data-id^="sample-"]').count()) throw new Error('the sample stayed');
  const s = await LS(page);
  if ((s.extras ?? []).length) throw new Error('the sample wrote into the library');
});

await withPage('a prototype save (self-pedia/v1) moves to cunmu/library; the demo parts go', async (page) => {
  await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('self-pedia/v1', JSON.stringify({
      schemaVersion: 2, extras: [{ id: 'manual-x', kind: 'book', title: '自己加的书', credits: [], finished: '2024-05-01', collected: '2024-05-01', source: 'manual', cover: null, genres: [], info: [], sources: [{ provider: 'manual', externalId: 'manual-x' }], claims: [{ source: 'manual_add', value: '2024-05-01', precision: 'day', baseLevel: 1, observedAt: '2024-05-01' }] }],
      notes: {}, removed: {}, batches: [], workSources: [], linked: [], unlinked: [], promoted: [], pulls: {},
      connections: { bangumi: { status: 'connected', mode: 'public', username: 'yanagi', epoch: 1, baselineDoneAt: '2024-01-06' }, weread: { connected: true, keyTail: '3f9a' } },
      settings: {}, sample: { on: false }, leadPin: null, theme: 'system', reduceMotion: false, fontScale: 1, catView: 'grid', catSort: { key: 'finished', dir: 'desc' }, yearView: 'spines',
      dev: { tier: 500, dataset: 'real', wereadRemoved: false },
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('自己加的书').first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  if (!(await page.locator('.app').innerText()).includes('收录 1') && (await LS(page)).extras?.length !== 1) throw new Error('not just the one work of mine');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  if (keys.includes('self-pedia/v1')) throw new Error('the old key is still there');
  const s = await LS(page);
  if (s.extras?.[0]?.id !== 'manual-x') throw new Error('the work did not move');
  if (s.connections?.bangumi || s.connections?.weread?.connected) throw new Error('the demo connections came along');
});

await withPage('a save that cannot be read stays as it is, and the page says changes are not kept', async (page) => {
  await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
  const broken = '{"schemaVersion":4,"extras":[{"id":"m-1"';
  await page.evaluate((t) => { localStorage.clear(); localStorage.setItem('cunmu/library', t); }, broken);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('存档没能读出来', { exact: false }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(1200);
  if ((await page.evaluate(() => localStorage.getItem('cunmu/library'))) !== broken) throw new Error('the unreadable save was written over');
});

/** a library of these books, typed in by hand (a current save, the way the app writes one) */
const seedBooks = (page, titles) => page.evaluate((ts) => {
  localStorage.clear();
  localStorage.setItem('cunmu/library', JSON.stringify({
    schemaVersion: 4,
    extras: ts.map((title, i) => {
      const day = `2024-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`;
      return { id: `manual-${i}`, kind: 'book', title, credits: [], finished: day, collected: day, source: 'manual', cover: null, genres: [], info: [], sources: [{ provider: 'manual', externalId: `manual-${i}` }], claims: [{ source: 'manual_add', value: day, precision: 'day', baseLevel: 1, observedAt: day }] };
    }),
  }));
}, titles);

await withPage('a 320 px phone: long titles, names and pasted links wrap; no page is wider than the screen', async (page) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
  const long = 'Supercalifragilisticexpialidocious_without_any_spaces_1234567890';
  await seedBooks(page, [long, '短', '中等长度的书名', 'B', 'C']);
  await page.evaluate((l) => {
    const s = JSON.parse(localStorage.getItem('cunmu/library'));
    s.extras[0].credits = [{ name: `Name${l}`, role: '作者', core: true }];
    s.extras.push({ id: 'essay-x', kind: 'essay', title: l, credits: [], finished: '2024-03-03', collected: '2024-03-03', source: 'manual', cover: null, genres: [], info: [], body: [`https://example.com/${l}${l}`], sources: [{ provider: 'manual', externalId: 'essay-x' }], claims: [] });
    s.notes = { 'manual-1': { review: [`https://example.com/${l}${l}`] } };
    localStorage.setItem('cunmu/library', JSON.stringify(s));
  }, long);
  for (const r of ['/', '/entry/manual-0', '/entry/manual-1', '/essay/essay-x', '/year/2024', '/year/2024/1', '/writing']) {
    await open(page, r);
    await page.waitForTimeout(400);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (w[0] > w[1]) throw new Error(`${r} is ${w[0]} px wide on a ${w[1]} px screen`);
  }
});

await withPage('搜索 → 条目 → 返回: back on 搜索 with its words, results and scroll (in-app, system, ⌘K)', async (page) => {
  await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
  await seedBooks(page, Array.from({ length: 30 }, (_, i) => `系列作 第${i + 1}卷`));
  await open(page, '/search');
  await page.locator('.search-field input').fill('系列作');
  await page.getByText('展开其余', { exact: false }).first().click();
  await page.locator('.search-row').nth(20).waitFor({ timeout: 5000 });
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  const at = () => page.evaluate(() => ({ y: Math.round(scrollY), q: document.querySelector('.search-field input')?.value, rows: document.querySelectorAll('.search-row').length, hash: location.hash }));
  const before = await at();
  if (before.y < 300) throw new Error(`the results did not scroll (${before.y})`);
  const row = page.locator('.search-row').nth(12);
  for (const back of ['in-app', 'system']) {
    await row.click();
    await page.locator('h1').filter({ hasText: '系列作' }).first().waitFor({ timeout: 5000 });
    if (back === 'in-app') await page.getByRole('button', { name: '返回' }).first().click();
    else await page.evaluate(() => history.back());   // Android's back button and the browser's
    await page.locator('.search-field input').waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    const now = await at();
    if (now.q !== '系列作' || now.rows !== before.rows || Math.abs(now.y - before.y) > 2) throw new Error(`${back} back: ${JSON.stringify(now)} vs ${JSON.stringify(before)}`);
  }
  // 换封面 on the way (系列作 one by one): a cover chosen in 补封面、主创, then back — still 搜索, not 首页
  for (const back of ['in-app', 'system']) {
    await row.click();
    await page.locator('h1').filter({ hasText: '系列作' }).first().waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: '更多' }).click();
    await page.getByRole('menuitem', { name: /补封面|改封面/ }).click();
    const png = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 60; c.height = 90; const g = c.getContext('2d'); g.fillStyle = '#a33'; g.fillRect(0, 0, 60, 90); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
    await sheet(page).locator('input[type="file"]').setInputFiles({ name: 'c.png', mimeType: 'image/png', buffer: png });
    await sheet(page).getByRole('button', { name: '不用图' }).waitFor({ timeout: 5000 });
    await sheet(page).getByRole('button', { name: '好了' }).click();
    await sheet(page).waitFor({ state: 'detached', timeout: 5000 });
    if (back === 'in-app') await page.getByRole('button', { name: '返回' }).first().click();
    else await page.evaluate(() => history.back());
    await page.locator('.search-field input').waitFor({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(300);
    const now = await at();
    if (now.q !== '系列作' || now.rows !== before.rows || Math.abs(now.y - before.y) > 2) throw new Error(`${back} back after a new cover: ${JSON.stringify(now)} vs ${JSON.stringify(before)}`);
  }
  // ⌘K over another page: back from what it opened is 搜索 with the words, the row it opened current
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/all');
  await page.keyboard.press('Control+k');
  await page.locator('.palette-field input').fill('第3卷');
  await page.keyboard.press('Enter');
  await page.locator('h1').filter({ hasText: '第3卷' }).first().waitFor({ timeout: 5000 });
  await page.goBack();
  await page.locator('.palette.inline .palette-field input').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);   // the overlay's own close
  if (await page.locator('.palette-field input').count() !== 1) throw new Error('the ⌘K overlay stayed open over 搜索');
  const q = await page.locator('.palette.inline .palette-field input').inputValue();
  const on = await page.locator('.palette.inline .palette-row.on .palette-label').innerText();
  if (q !== '第3卷' || on !== '系列作 第3卷') throw new Error(`⌘K back: 「${q}」, current 「${on}」`);
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#/all', null, { timeout: 5000 });
});

await withPage('an IME still choosing keeps its Enter and Esc: ⌘K opens nothing, a sheet stays open', async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/');
  await seedBooks(page, ['乙女']);
  await page.reload();
  await page.waitForTimeout(500);
  const press = (key) => page.evaluate((key) => {
    const el = document.activeElement ?? document.body;
    el.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode: 229, isComposing: true, bubbles: true, cancelable: true }));
  }, key);
  await page.keyboard.press('Control+k');
  await page.locator('.palette-field input').fill('乙女');
  await page.waitForTimeout(200);
  await press('Enter');
  await press('Escape');
  await page.waitForTimeout(400);
  if (!(await page.evaluate(() => location.hash === '#/'))) throw new Error(`a composing Enter opened ${page.url()}`);
  if (!(await page.locator('.palette-field input').count())) throw new Error('a composing Esc closed ⌘K');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('n');
  await sheet(page).waitFor({ timeout: 3000 });
  await page.waitForTimeout(300);
  await press('Escape');
  await page.waitForTimeout(500);
  if (!(await sheet(page).count())) throw new Error('a composing Esc closed the sheet');
});

await withPage('给人看: a work page does not list what is 只给自己 among its mentions or linked works', async (page) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/');
  await page.evaluate(() => {
    const day = '2020-01-01';
    const mk = (id, o) => ({ id, kind: 'book', title: 'T', credits: [{ name: '同一人', role: '作者', core: true }], genres: [], info: [], finished: day, collected: day, source: 'manual', cover: null, sources: [{ provider: 'manual', externalId: id }], claims: [{ source: 'manual_add', value: day, precision: 'day', baseLevel: 1, observedAt: day }], ...o });
    localStorage.clear();
    localStorage.setItem('cunmu/library', JSON.stringify({ schemaVersion: 4,
      extras: [mk('a', { title: '公开之书', related: ['b'] }), mk('b', { title: '秘密之书' }), mk('c', { kind: 'essay', title: '秘密随笔', credits: [], body: ['今天读了公开之书。'] })],
      me: { onlyMe: ['b', 'c'] } }));
  });
  await page.reload();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '给人看' }).first().click();
  await page.waitForTimeout(600);
  await page.evaluate(() => { location.hash = '/entry/a'; });
  await page.locator('h1').filter({ hasText: '公开之书' }).first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  const t = await page.locator('body').innerText();
  if (/秘密/.test(t)) throw new Error(`a hidden title shows: ${t.match(/.{0,20}秘密.{0,10}/)[0]}`);
});

await withPage('给人看: a person link and the address of a 只给自己 work never put that work on the page', async (page) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/');
  await page.evaluate(() => {
    const day = '2020-01-01';
    const mk = (id, o) => ({ id, kind: 'book', title: 'T', credits: [{ name: '同一人', role: '作者', core: true }], genres: [], info: [], finished: day, collected: day, source: 'manual', cover: null, sources: [{ provider: 'manual', externalId: id }], claims: [{ source: 'manual_add', value: day, precision: 'day', baseLevel: 1, observedAt: day }], ...o });
    localStorage.clear();
    localStorage.setItem('cunmu/library', JSON.stringify({ schemaVersion: 4,
      extras: [mk('a', { title: '公开之书' }), mk('b', { title: '秘密之书' }), mk('c', { kind: 'essay', title: '一篇', credits: [], body: ['同一人写过公开之书。'] })],
      me: { onlyMe: ['b'] } }));
  });
  await page.reload();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '给人看' }).first().click();
  await page.waitForTimeout(400);
  await page.evaluate(() => { location.hash = '/essay/c'; });
  await page.locator('h1').filter({ hasText: '一篇' }).first().waitFor({ timeout: 5000 });
  await page.evaluate(() => {
    window.__sawSecret = false;
    new MutationObserver(() => {
      if ((document.body.textContent || '').includes('秘密之书')) window.__sawSecret = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  const note = page.locator('.margin-note', { hasText: '同一人' });
  if (await note.count()) {
    const cap = await note.innerText();
    if (/2\s*部/.test(cap)) throw new Error(`person note counts a hidden work: ${cap}`);
  }
  await page.locator('.autolink', { hasText: '同一人' }).first().click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { location.hash = '/entry/b'; });
  await page.waitForTimeout(400);
  if (await page.evaluate(() => window.__sawSecret)) throw new Error('a 只给自己 work was put on the page');
  if ((await page.locator('body').innerText()).includes('秘密之书')) throw new Error('a 只给自己 title is still showing');
  if ((await page.title()).includes('秘密')) throw new Error(`tab title leaked: ${await page.title()}`);
});

await withPage('the app going to the background keeps a half-written essay, and leaving still keeps it once', async (page) => {
  await open(page, '/write');
  await page.locator('.editor-body').waitFor({ timeout: 5000 });
  await page.locator('.editor-body').fill('写到一半的随笔');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  const essays = (await LS(page)).extras?.filter((w) => w.kind === 'essay') ?? [];
  if (essays.length !== 1 || !essays[0].body?.join('').includes('写到一半的随笔')) throw new Error(`in the background: ${JSON.stringify(essays.map((w) => w.body))}`);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
  await page.locator('.editor-body').fill('写到一半的随笔，写完了');
  await page.getByRole('button', { name: '完成' }).click();
  await page.waitForTimeout(500);
  const after = (await LS(page)).extras?.filter((w) => w.kind === 'essay') ?? [];
  if (after.length !== 1 || !after[0].body?.join('').includes('写完了')) throw new Error(`after leaving: ${JSON.stringify(after.map((w) => w.body))}`);
});

await withPage('a slider at a named end says the name to a screen reader, not 「Infinity」', async (page) => {
  await open(page, '/me/organize');
  const sl = page.getByRole('slider').first();
  await sl.focus();
  await page.keyboard.press('End');
  const vt = await sl.getAttribute('aria-valuetext');
  if (vt !== '从不按月') throw new Error(`slider at the end says 「${vt}」`);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  if (!/^\d+ 条$/.test(await sl.getAttribute('aria-valuetext') ?? '')) throw new Error(`slider value: ${await sl.getAttribute('aria-valuetext')}`);
});

await withPage('a save the browser refuses (storage full) is said, and the notice goes once a save works', async (page) => {
  await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
  await seedBooks(page, ['甲', '乙']);
  await open(page, '/kind/book');
  await page.evaluate(() => {
    const real = Storage.prototype.setItem;
    window.__full = true;
    Storage.prototype.setItem = function (k, v) { if (window.__full && k === 'cunmu/library') throw new DOMException('full', 'QuotaExceededError'); return real.call(this, k, v); };
  });
  await page.getByRole('tab', { name: '按首字母' }).click();
  await page.getByText('没能保存', { exact: false }).waitFor({ timeout: 3000 });
  await page.evaluate(() => { window.__full = false; });
  await page.getByRole('tab', { name: '按时期' }).click();
  await page.getByText('没能保存', { exact: false }).waitFor({ state: 'detached', timeout: 3000 });
});

await withPage('按首字母: titles A–Z under letters, # last; the choice is remembered', async (page) => {
  await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
  await seedBooks(page, ['中国哲学简史', 'Animal Farm', '《百年孤独》', '1984', '阿Q正传', 'しろばんば', '龍族']);
  await open(page, '/kind/book');
  await page.getByRole('tab', { name: '按首字母' }).click();
  const read = () => page.evaluate(() => [...document.querySelectorAll('.cat-body section')].map((s) => [s.querySelector('.group-head .t-h2')?.textContent, [...s.querySelectorAll('.cat-name')].map((n) => n.textContent).join('/')].join(':')));
  const want = ['A:阿Q正传/Animal Farm', 'B:《百年孤独》', 'L:龍族', 'S:しろばんば', 'Z:中国哲学简史', '#:1984'];
  const got = await read();
  if (got.join('|') !== want.join('|')) throw new Error(`A–Z: ${got.join(' | ')}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.cat-body section').first().waitFor({ timeout: 5000 });
  const again = await read();
  if (again.join('|') !== want.join('|')) throw new Error(`after a reload: ${again.join(' | ')}`);
});

await withPage('the bars stay on screen: nothing above them becomes the frame for position: fixed', async (page) => {
  await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
  await seedBooks(page, Array.from({ length: 40 }, (_, i) => `一本书 ${i + 1}`));
  for (const hash of ['/', '/kind/book', '/entry/manual-3', '/search', '/writing']) {
    await open(page, hash);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(200);
    const bad = await page.evaluate(() => {
      const out = [];
      for (const bar of document.querySelectorAll('.tabbar, .topbar')) {
        for (let el = bar.parentElement; el && el !== document.documentElement; el = el.parentElement) {
          const c = getComputedStyle(el);
          // a size container (layout containment before Chrome 129), containment, a transform or a filter all trap fixed boxes
          if (c.containerType !== 'normal' && c.containerType) out.push(`${el.className}: container-type ${c.containerType}`);
          if (/layout|paint|strict|content/.test(c.contain)) out.push(`${el.className}: contain ${c.contain}`);
          if (c.transform !== 'none' || c.filter !== 'none' || c.perspective !== 'none' || /transform|filter/.test(c.willChange)) out.push(`${el.className}: transform/filter`);
        }
      }
      const tab = document.querySelector('.tabbar')?.getBoundingClientRect();
      if (tab && Math.abs(tab.bottom - innerHeight) > 1) out.push(`tab bar at ${tab.bottom}, screen ends at ${innerHeight}`);
      return out;
    });
    if (bad.length) throw new Error(`${hash}: ${[...new Set(bad)].join('; ')}`);
  }
});

await withPage('收录 › 手动填写: name, kind, maker, 约 a year and a few words go in as one work', async (page) => {
  await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
  await seedBooks(page, ['一本书']);
  await open(page, '/');
  await page.locator('.tabbar').getByRole('button', { name: '收录' }).click();
  await page.getByRole('button', { name: /手动填写/ }).click();
  const form = page.locator('.manual');
  await form.getByRole('textbox', { name: '名字', exact: true }).fill('极乐迪斯科');
  await form.getByRole('radio', { name: '游戏' }).click();
  await form.getByRole('textbox', { name: '开发', exact: true }).fill('ZA/UM');
  await form.getByRole('radio', { name: '某一年' }).click();
  await form.getByRole('textbox', { name: '年份', exact: true }).fill('2019');
  await form.getByText('约', { exact: true }).click();
  await form.getByRole('textbox', { name: '写几句', exact: true }).fill('读得最慢的一部游戏。');
  await form.getByRole('button', { name: '放进来' }).click();
  await page.waitForFunction(() => (localStorage.getItem('cunmu/library') ?? '').includes('极乐迪斯科'), null, { timeout: 5000 });
  const saved = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cunmu/library')); const w = s.extras.find((x) => x.title === '极乐迪斯科'); return { w, n: s.notes[w.id] }; });
  if (saved.w.kind !== 'game' || saved.w.credits[0]?.name !== 'ZA/UM' || saved.n?.date?.value !== '2019' || !saved.n?.date?.approx || saved.n?.review?.[0] !== '读得最慢的一部游戏。') throw new Error(JSON.stringify(saved));
});

const bgmRequests = () => bgmLog.filter((l) => /^GET /.test(l));
const toast = (page, text) => page.locator('.toast, [role="status"]').filter({ hasText: text }).first();
async function connectByName(page, name) {
  await open(page);
  await page.getByRole('button', { name: '从 Bangumi 搬进来' }).click();
  await page.getByLabel('Bangumi 用户名').fill(name);
  await page.getByRole('button', { name: '读取收藏' }).click();
}

await withPage('Bangumi by username: read, bring in, undo', async (page) => {
  await connectByName(page, 'reader');
  await sheet(page).getByText('部看过的作品，可以搬进来').waitFor({ timeout: 15000 });
  const n = (await sheet(page).locator('.t-numeral').innerText()).trim();
  if (n !== '25') throw new Error(`found ${n}, the fixture has 25 看过`);
  if (!(await sheet(page).innerText()).includes('另有 6 部在看')) throw new Error('no 在看 count');
  await sheet(page).getByRole('button', { name: '搬进来', exact: true }).click();
  // an import opens 首页 on the 「我」 draft, with its first suggestion
  await page.locator('.mh-name').waitFor({ timeout: 5000 });
  if ((await page.locator('.mh-name').innerText()) !== '我看过的') throw new Error('the draft is not titled 我看过的');
  await page.locator('.ask').getByText('怎么称呼你？').waitFor({ timeout: 3000 }).catch(() => { throw new Error('no first suggestion after the import'); });
  await page.waitForTimeout(1200);   // the save is debounced
  const s = await LS(page);
  const b = s.connections?.bangumi;
  if (b?.userId !== 1000001 || b.username !== 'reader' || b.mode !== 'public') throw new Error(`connection not saved: ${JSON.stringify(b)}`);
  if (s.bangumi?.done?.length !== 25 || s.bangumi?.doing?.length !== 6) throw new Error(`pull ${s.bangumi?.done?.length}/${s.bangumi?.doing?.length}`);
  const w = s.bangumi.done.find((x) => x.id === 'bgm-9585') ?? s.bangumi.done[0];
  if (!w.claims?.some((c) => c.source === 'bgm_updated_at' && c.baseLevel === 2 && c.precision === 'day')) throw new Error('no updated_at day claim');
  if (!w.cover?.thumb?.startsWith('https://lain.bgm.tv/')) throw new Error('cover is not the Bangumi URL');
  const calls = bgmRequests();
  if (!calls.some((l) => l.includes('/v0/users/reader/collections') && l.includes('type=2'))) throw new Error('never read 看过');
  if (calls.some((l) => /limit=(\d+)/.test(l) && Number(l.match(/limit=(\d+)/)[1]) > 100)) throw new Error('asked for more than 100 at once');
  await toast(page, '搬进来 25 部').getByRole('button', { name: '撤销' }).click();
  await page.waitForTimeout(600);
  if (await page.locator('.tile[data-id^="bgm-"]').count()) throw new Error('撤销 left Bangumi works');
  await page.locator('.home-empty').waitFor({ timeout: 3000 }).catch(() => { throw new Error('撤销 did not go back to the empty start'); });
});

await withPage('条目页: 「在 Bangumi 写的」 under 短评 when there is one, nothing when there is not', async (page) => {
  await connectByName(page, 'reader');
  await sheet(page).getByText('部看过的作品，可以搬进来').waitFor({ timeout: 15000 });
  await sheet(page).getByRole('button', { name: '搬进来', exact: true }).click();
  await page.locator('.mh-name').waitFor({ timeout: 5000 });
  // 阿基拉: the fixture's comment is 「第二遍比第一遍好。」
  await page.evaluate(() => { location.hash = '#/entry/bgm-5118'; });
  await page.locator('.entry-page h1').first().waitFor({ timeout: 5000 });
  const src = page.locator('.entry-page .section[data-section="短评"] .entry-src');
  await src.first().waitFor({ timeout: 3000 }).catch(() => { throw new Error('no 「在 Bangumi 写的」 on an entry with a Bangumi comment'); });
  const t = await src.first().innerText();
  if (!t.includes('第二遍比第一遍好。') || !t.includes('在 Bangumi 写的')) throw new Error(`Bangumi comment block: 「${t}」`);
  // 再见绘梨: no comment, nothing written here — no block, no 短评 heading
  await page.evaluate(() => { location.hash = '#/entry/bgm-377599'; });
  await page.locator('.entry-page h1').filter({ hasText: '再见绘梨' }).first().waitFor({ timeout: 5000 });
  if (await page.locator('.entry-page .entry-src').count()) throw new Error('a Bangumi comment block on an entry without one');
  if (await page.locator('.entry-page .section[data-section="短评"]').count()) throw new Error('an empty 短评 section');
});

await withPage('Bangumi dates (reader, 1019 看过): the mark day, months in a year, 最近 dated, 「来自 Bangumi」', async (page) => {
  await connectByName(page, 'reader');
  await sheet(page).getByText('部看过的作品，可以搬进来').waitFor({ timeout: 30000 });
  await sheet(page).getByRole('button', { name: '搬进来', exact: true }).click();
  await page.locator('.mh-name').waitFor({ timeout: 8000 });
  await page.evaluate(() => { location.hash = '#/all'; });
  await page.locator('.home-recent .list-row').first().waitFor({ timeout: 8000 });
  // 最近: real days, not 「约 2026」
  const recent = await page.locator('.home-recent').innerText();
  if (/约/.test(recent)) throw new Error(`最近 still says 约: ${recent.slice(0, 80)}`);
  // 借东西的小人阿莉埃蒂, marked 2012-08-28 on Bangumi
  await page.evaluate(() => { location.hash = '#/entry/bgm-6819'; });
  await page.locator('.entry-page h1').first().waitFor({ timeout: 5000 });
  const entry = await page.locator('.entry-page').first().innerText();
  if (/约 2012/.test(entry) || !/2012/.test(entry)) throw new Error('the entry does not show the 2012 mark as a date');
  const foot = (await page.locator('.entry-page .colophon > span').last().innerText()).trim();
  if (foot !== '来自 Bangumi') throw new Error(`footer: 「${foot}」`);
  // the date picker says where the date came from
  await page.locator('.entry-page').getByRole('button', { name: /2012/ }).first().click();
  await page.getByText('Bangumi 上更新于 2012 年 8 月 28 日').waitFor({ timeout: 3000 }).catch(() => { throw new Error('no provenance line in the date picker'); });
  await page.keyboard.press('Escape');
  // a year by months: 2011 has 168, none left as 「这一年里」
  await page.evaluate(() => { location.hash = '#/year/2011'; });
  await page.locator('.page h1').first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  const heads = await page.locator('.tl-month-head').allInnerTexts();
  if (heads.length < 6) throw new Error(`2011 in ${heads.length} months`);
  if (heads.some((h) => h.includes('这一年里'))) throw new Error('2011 still has 「这一年里」');
}, { reader: true });

await withPage('Bangumi: an unknown username says so, nothing changes', async (page) => {
  await connectByName(page, 'nosuchuser');
  await sheet(page).getByText('没找到这个用户名').waitFor({ timeout: 10000 });
  await page.waitForTimeout(900);
  if ((await LS(page)).connections?.bangumi) throw new Error('a failed read connected');
});

await withPage('Bangumi by token: a bad one is refused, a good one connects', async (page) => {
  await open(page);
  await page.getByRole('button', { name: '从 Bangumi 搬进来' }).click();
  await sheet(page).getByRole('button', { name: '用个人令牌连接' }).click();
  await sheet(page).getByRole('button', { name: '我了解，继续' }).click();
  if (await sheet(page).getByText('原型里用示例令牌').count()) throw new Error('the demo token button is in the app');
  await page.getByLabel('Bangumi 个人令牌').fill('expiredtoken000000000000000000');
  await sheet(page).getByRole('button', { name: '验证' }).click();
  await sheet(page).getByText('这个令牌用不了').waitFor({ timeout: 10000 });
  await page.getByLabel('Bangumi 个人令牌').fill('goodtoken0123456789abcdefghij');
  await sheet(page).getByRole('button', { name: '验证' }).click();
  await sheet(page).getByText('部看过的作品，可以搬进来').waitFor({ timeout: 15000 });
  await sheet(page).getByRole('button', { name: '搬进来', exact: true }).click();
  await page.locator('.mh-name').waitFor({ timeout: 5000 });
  await page.waitForTimeout(1200);
  const s = await LS(page);
  if (s.connections?.bangumi?.mode !== 'token' || s.connections.bangumi.tokenTail !== 'ghij') throw new Error('token connection not saved');
  if (JSON.stringify(s).includes('goodtoken')) throw new Error('the token is inside the library (it goes to export files)');
  const kept = await page.evaluate(() => localStorage.getItem('cunmu/bangumi-token'));
  if (kept !== 'goodtoken0123456789abcdefghij') throw new Error('the token was not kept on the device');
});

const later = { more: false };
await withPage('Bangumi: 同步一次 brings the new ones; 断开 takes them away, keeps notes', async (page) => {
  await connectByName(page, 'reader');
  await sheet(page).getByText('部看过的作品，可以搬进来').waitFor({ timeout: 15000 });
  await sheet(page).getByRole('button', { name: '搬进来', exact: true }).click();
  await page.locator('.mh-name').waitFor({ timeout: 5000 });
  later.more = true;
  await open(page, '/me');
  await page.getByRole('button', { name: '同步一次' }).click();
  await toast(page, '多了 2 部').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  const s = await LS(page);
  if (s.bangumi?.done?.length !== 27) throw new Error(`after sync: ${s.bangumi?.done?.length}`);
  const fresh = s.bangumi.done.find((w) => w.id === 'bgm-79177');
  if (!fresh) throw new Error('the new one is missing');
  if (fresh.claims?.some((c) => c.source === 'bgm_updated_at')) throw new Error('a later item got a baseline claim');
  if (!(await page.locator('.me-page').innerText()).includes('上次同步')) throw new Error('no 上次同步 caption');
  await page.getByRole('button', { name: '断开 Bangumi' }).click();
  await sheet(page).getByRole('button', { name: '断开并删除' }).click();
  await page.waitForTimeout(1500);
  const after = await LS(page);
  if (after.bangumi || after.connections?.bangumi?.status === 'connected') throw new Error('still connected');
  if (after.connections?.bangumi && after.connections.bangumi.userId !== 1000001) throw new Error('lost the user id');
}, later);

await withPage('odd links: a broken escape and a year that is not a number do not break the app', async (page) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await open(page, '/person/%E0%A4');
  await page.waitForTimeout(500);
  if (errs.length) throw new Error(`page error: ${errs[0]}`);
  await open(page, '/year/abc');
  await page.waitForTimeout(500);
  if (!page.url().includes('#/index/periods')) throw new Error(`/year/abc stayed at ${page.url()}`);
  await open(page, '/essay/gone');
  await page.getByText('找不到这一条。').waitFor({ timeout: 3000 });
  if (errs.length) throw new Error(`page error: ${errs[0]}`);
});

await withPage('豆伴 export (.xlsx): read, bring in, paper covers, nothing fetched', async (page) => {
  const reqs = [];
  page.on('request', (r) => { if (!r.url().startsWith(BASE)) reqs.push(r.url()); });
  await open(page, '/me');
  await page.getByRole('button', { name: /豆瓣备份/ }).click();
  // focus goes into the sheet past its hidden file input, and Shift+Tab does not leave it
  await page.waitForTimeout(300);
  const inSheet = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  if (!(await inSheet())) throw new Error('focus did not go into the sheet');
  await page.keyboard.press('Shift+Tab');
  if (!(await inSheet())) throw new Error('Shift+Tab left the sheet');
  await page.getByTestId('douban-file').setInputFiles(join(ROOT, 'tests/fixtures/douban/doufen-synthetic.xlsx'));
  await sheet(page).getByText('条，可以搬进来').waitFor({ timeout: 8000 });
  const n = (await sheet(page).locator('.t-numeral').innerText()).trim();
  if (n !== '12') throw new Error(`found ${n}, the file has 12 done marks`);
  await sheet(page).getByRole('button', { name: '搬进来', exact: true }).click();
  await page.locator('.mh-name').waitFor({ timeout: 8000 });
  await page.waitForTimeout(1200);
  const s = await LS(page);
  const w = (s.extras ?? []).find((x) => x.id === 'db-90000101');
  if (!w || w.cover !== null || w.claims?.[0]?.value !== '2023-05-20') throw new Error(`work not as expected: ${JSON.stringify(w)?.slice(0, 200)}`);
  if (s.notes?.['db-90000101']?.rating10 !== 10) throw new Error('the rating did not come along');
  if (reqs.some((u) => /douban/.test(u))) throw new Error(`asked Douban: ${reqs.find((u) => /douban/.test(u))}`);
});

await withPage('豆备 (marks + subjects .ndjson, two files picked together)', async (page) => {
  await open(page, '/me');
  await page.getByRole('button', { name: /豆瓣备份/ }).click();
  await page.getByTestId('douban-file').setInputFiles(join(ROOT, 'tests/fixtures/doubak/marks.ndjson'));
  await sheet(page).getByText('subjects.ndjson 一起选').waitFor({ timeout: 8000 });
  await page.getByTestId('douban-file').setInputFiles([join(ROOT, 'tests/fixtures/doubak/marks.ndjson'), join(ROOT, 'tests/fixtures/doubak/subjects.ndjson')]);
  await sheet(page).getByText('条，可以搬进来').waitFor({ timeout: 8000 });
  const n = (await sheet(page).locator('.t-numeral').innerText()).trim();
  if (n !== '7') throw new Error(`found ${n}, the fixture has 7 done marks`);
});

await withPage('导出全部内容: a ZIP download on the web, Bangumi covers by address', async (page) => {
  await open(page);
  await page.evaluate(() => {
    const now = new Date().toISOString();
    const bgm = { id: 'bgm-9585', kind: 'anime', title: '搬来的番', credits: [], collected: '2024-05-02', source: 'bangumi', genres: [], info: [], status: 'done',
      cover: { thumb: 'https://lain.bgm.tv/r/400/pic/cover/l/aa/bb/9585_x.jpg', medium: 'https://lain.bgm.tv/pic/cover/l/aa/bb/9585_x.jpg', aspect: 0.7 },
      sources: [{ provider: 'bangumi_account', externalId: '9585', epoch: 1, firstSeenAt: now }], claims: [{ source: 'bgm_updated_at', value: '2024-05-02', precision: 'day', baseLevel: 3, observedAt: now }] };
    localStorage.setItem('cunmu/library', JSON.stringify({ schemaVersion: 2, extras: [{ id: 'manual-x', kind: 'book', title: '自己加的书', credits: [], finished: '2024-05-01', collected: '2024-05-01', source: 'manual', cover: null, genres: [], info: [], sources: [{ provider: 'manual', externalId: 'manual-x' }], claims: [] }], notes: {}, removed: {}, batches: [], workSources: [], linked: [], unlinked: [], promoted: [], pulls: {}, connections: { bangumi: { status: 'connected', mode: 'public', username: 'reader', userId: 1000001, nickname: '读者', epoch: 1, baselineDoneAt: '2024-05-02', lastOkSyncAt: now } }, bangumi: { done: [bgm], doing: [] }, settings: {}, sample: { on: false } }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await open(page, '/me');
  await page.getByRole('button', { name: '导出全部内容' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), sheet(page).getByRole('button', { name: '导出', exact: true }).click()]);
  if (!/^Cunmu.*\.zip$/.test(dl.suggestedFilename())) throw new Error(`file name ${dl.suggestedFilename()}`);
  await toast(page, '导出了 2 条').waitFor({ timeout: 5000 });
  // a Bangumi work keeps its cover's address, so a restored library is not all paper until the next sync (r9)
  const text = readFileSync(await dl.path()).toString('utf8');
  if (!text.includes('https://lain.bgm.tv/pic/cover/l/aa/bb/9585_x.jpg')) throw new Error('the export dropped the Bangumi cover address');
});

await withPage('Steam: 设置 › 撤销这次导入 takes the import back after the confirm', async (page) => {
  await open(page);
  await page.evaluate(() => {
    const now = new Date().toISOString();
    const game = { id: 'steam-620', kind: 'game', title: '搬来的游戏', credits: [], finished: '2024-05-01', collected: '2024-05-01', source: 'steam', cover: null, genres: [], info: [], play: { minutes: 90, provider: 'steam', appid: 620 }, sources: [{ provider: 'steam', externalId: '620', batchId: 'st-1', firstSeenAt: now }], claims: [] };
    const manual = { id: 'manual-x', kind: 'book', title: '自己加的书', credits: [], finished: '2024-05-01', collected: '2024-05-01', source: 'manual', cover: null, genres: [], info: [], sources: [{ provider: 'manual', externalId: 'manual-x' }], claims: [] };
    localStorage.setItem('cunmu/library', JSON.stringify({ schemaVersion: 4, extras: [manual, game], notes: {}, removed: {}, batches: [{ id: 'st-1', provider: 'steam', label: 'Steam · 1 部', createdAt: now, created: ['steam-620'], merged: [], skipped: [], quoteIds: [], steamPrior: { plays: {}, extras: {} } }], workSources: [], linked: [], unlinked: [], promoted: [], pulls: {}, plays: {}, connections: { bangumi: null, weread: { connected: false }, steam: { status: 'connected', steamId: 'file', lastOkSyncAt: now } }, settings: {}, sample: { on: false } }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await open(page, '/me');
  await page.getByRole('button', { name: '撤销这次导入' }).click({ timeout: 5000 });
  await sheet(page).getByRole('button', { name: '撤销导入' }).click();
  await toast(page, '这次导入撤销了').waitFor({ timeout: 5000 });
  const s = await LS(page);
  if (s.extras.some((w) => w.id === 'steam-620')) throw new Error('the Steam game is still here');
  if (!s.batches.find((b) => b.id === 'st-1')?.undoneAt) throw new Error('the record is not marked undone');
  if (await page.getByRole('button', { name: '撤销这次导入' }).count()) throw new Error('撤销这次导入 is still offered with nothing left to undo');
});

await withPage('drop: a 存目 backup dropped on the window goes to 从文件恢复, not the 豆瓣 sheet', async (page) => {
  await open(page);
  await seedBooks(page, ['一本书']);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await open(page, '/');
  await page.evaluate(() => {
    const json = JSON.stringify({ format: 'cunmu-export/1', works: [{ id: 'manual-y', kind: 'book', title: '备份里的书', credits: [], genres: [], info: [], collected: '2024-05-01', source: 'manual', sources: [{ provider: 'manual', externalId: 'manual-y' }], claims: [] }], notes: {} });
    const dt = new DataTransfer();
    dt.items.add(new File([json], 'cunmu.json', { type: 'application/json' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await sheet(page).getByRole('button', { name: '换掉' }).waitFor({ timeout: 5000 });
  if (await page.getByText('不是豆伴').count()) throw new Error('the backup went to the 豆瓣 sheet');
  await sheet(page).getByRole('button', { name: '换掉' }).click();
  await toast(page, '恢复了 1 条').waitFor({ timeout: 5000 });
});

await withPage('从文件恢复: the app’s own export comes back after 换掉', async (page) => {
  await open(page);
  await page.evaluate(() => {
    localStorage.setItem('cunmu/library', JSON.stringify({ schemaVersion: 2, extras: [{ id: 'manual-x', kind: 'book', title: '自己加的书', credits: [], finished: '2024-05-01', collected: '2024-05-01', source: 'manual', cover: null, genres: [], info: [], sources: [{ provider: 'manual', externalId: 'manual-x' }], claims: [] }], notes: {}, removed: {}, batches: [], workSources: [], linked: [], unlinked: [], promoted: [], pulls: {}, connections: {}, settings: {}, sample: { on: false } }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await open(page, '/me');
  await page.getByRole('button', { name: '导出全部内容' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), sheet(page).getByRole('button', { name: '导出', exact: true }).click()]);
  const file = await dl.path();
  await toast(page, '导出了 1 条').waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '从文件恢复' }).click();
  await (await chooser).setFiles({ name: dl.suggestedFilename(), mimeType: 'application/zip', buffer: readFileSync(file) });
  await sheet(page).getByRole('button', { name: '换掉' }).click({ timeout: 5000 });
  await toast(page, '恢复了 1 条').waitFor({ timeout: 5000 });
});

await withPage('desktop (Windows app): runs under its content security policy', async (page, ctx) => {
  // the policy from src-tauri/tauri.conf.json, served with every page, as the Tauri window does
  const csp = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8')).app.security.csp;
  await ctx.route((u) => u.href.startsWith(BASE), async (route) => {
    const r = await route.fetch();
    await route.fulfill({ response: r, headers: { ...r.headers(), 'content-security-policy': csp } });
  });
  const blocked = [];
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) blocked.push(m.text().slice(0, 160)); });
  await open(page);
  await page.getByRole('button', { name: '看看示例' }).click();
  await page.locator('.tile[data-id^="sample-"]').first().waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: '换成我自己的' }).click({ timeout: 5000 });
  await connectByName(page, 'reader');
  await sheet(page).getByText('部看过的作品，可以搬进来').waitFor({ timeout: 15000 });
  await sheet(page).getByRole('button', { name: '搬进来', exact: true }).click();
  await page.locator('.mh-name').waitFor({ timeout: 5000 });
  await page.evaluate(() => { location.hash = '#/all'; });
  await page.locator('.tile[data-id^="bgm-"] img').first().waitFor({ timeout: 5000 });
  await open(page, '/entry/bgm-189549');
  await page.locator('h1').first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(800);
  if (blocked.length) throw new Error(`blocked by the policy: ${blocked[0]}`);
});

// ---- report ----
await browser.close();
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  app  ${r.name.padEnd(52)} ${r.ms}ms`);
  for (const p of r.problems) console.log(`        ${p}`);
}
console.log(`\nsmoke-app: ${results.length - failed.length}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failed.length ? 1 : 0);
