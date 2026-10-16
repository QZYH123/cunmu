#!/usr/bin/env node
/**
 * Compositor check for S1 entrance, S1 parallax, S2 flight / return and the S3 sheen (polish r3, P2; §6.5 #55/#57).
 * Records a Chromium trace of each animation and counts, inside its window, the main-thread work a
 * frame can cost: style recalc, layout, paint, raster — and reads Blink's own verdict on every
 * animation (the `Animation` trace events carry `compositeFailed` / `unsupportedProperties` when an
 * animation could NOT run on the compositor). Also takes Performance.getMetrics deltas.
 *   BASE=http://localhost:4173 OUT=/tmp/trace GPU=1 node scripts/trace.mjs
 * GPU=1 adds --ignore-gpu-blocklist --enable-gpu-rasterization (on a box with no GPU, Chrome still
 * rasterises with SwiftShader — software — so frame *times* here say nothing about a real device).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://localhost:4173';
const OUT = process.env.OUT || '/tmp/trace';
mkdirSync(OUT, { recursive: true });
const args = process.env.GPU ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy'] : [];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args });
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'blink.animations', 'cc', 'viz', 'benchmark', 'disabled-by-default-devtools.timeline.paint'];
const report = { flags: args, gpu: null };

const COUNT = ['UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'PaintImage', 'RasterTask', 'Layerize', 'Commit', 'DrawFrame', 'BeginFrame', 'AnimationFrame', 'FireAnimationFrame', 'ScrollLayer', 'UpdateLayer'];

async function traced(page, name, run, focusRe = /$^/, skipMs = 0) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await browser.startTracing(page, { path: join(OUT, `${name}.json`), categories: CATS });
  const meta = await run();
  const buf = await browser.stopTracing();
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const { traceEvents } = JSON.parse(buf.toString());
  // every Blink animation in the trace: 'b' opens it (name, target), 'n' steps carry the verdict
  const live = new Map(), anims = [];
  for (const e of traceEvents) {
    if (e.name !== 'Animation') continue;
    const k = e.id2?.local ?? e.id;
    const d = e.args?.data ?? {};
    if (e.ph === 'b') { const a = { name: d.displayName || d.name || '', node: d.nodeName || '', ts: e.ts, end: null, failed: 0, unsupported: [] }; live.set(k, a); anims.push(a); }
    const a = live.get(k);
    if (!a) continue;
    if (d.compositeFailed) { a.failed |= d.compositeFailed; if (d.unsupportedProperties) a.unsupported = d.unsupportedProperties; }
    if (e.ph === 'e') { a.end = e.ts; live.delete(k); }
  }
  // the window: from the first to the last focused animation's start/end (or the whole trace)
  const focus = anims.filter((a) => focusRe.test(a.node) || focusRe.test(a.name));
  const tEnd = (a) => a.end ?? a.ts;
  const w0 = focus.length ? Math.min(...focus.map((a) => a.ts)) + skipMs * 1000 : -Infinity;
  const w1 = focus.length ? Math.max(...focus.map(tEnd)) : Infinity;
  const counts = {};
  for (const n of COUNT) counts[n] = 0;
  const ms = { style: 0, layout: 0, paint: 0 };
  for (const e of traceEvents) {
    if (!COUNT.includes(e.name) || e.ts < w0 || e.ts > w1) continue;
    if (!['X', 'B', 'I', 'i', 'R'].includes(e.ph)) continue;
    counts[e.name]++;
    if (e.name === 'Layout') ms.layout += (e.dur || 0) / 1000;
    if (e.name === 'Paint') ms.paint += (e.dur || 0) / 1000;
    if (e.name === 'UpdateLayoutTree') ms.style += (e.dur || 0) / 1000;
  }
  const BITS = { 64: 'other animation on same target not composited', 8192: 'unsupported property', 32: 'target not composited', 131072: 'no visible change (nothing to draw)' };
  const why = (f) => Object.entries(BITS).filter(([b]) => f & Number(b)).map(([, t]) => t).join(' + ') || String(f);
  const failed = anims.filter((a) => a.failed && !(a.failed === 131072));
  const delta = (k) => +((m1[k] ?? 0) - (m0[k] ?? 0)).toFixed(4);
  report[name] = {
    ...meta,
    window: focus.length ? { from: focus[0].name || focus[0].node, ms: Math.round((w1 - w0) / 1000), skippedFirstMs: skipMs } : 'whole trace',
    animations: anims.length,
    composited: anims.filter((a) => !a.failed).length,
    noVisibleChange: anims.filter((a) => a.failed === 131072).length,
    notComposited: failed.map((a) => `${a.node} · ${a.name} — ${why(a.failed)}${a.unsupported.length ? ` (${a.unsupported.join(', ')})` : ''}`),
    inWindow: { ...counts, mainThreadMs: { style: +ms.style.toFixed(1), layout: +ms.layout.toFixed(1), paint: +ms.paint.toFixed(1) } },
    metricsWholeTrace: { LayoutCount: delta('LayoutCount'), RecalcStyleCount: delta('RecalcStyleCount') },
  };
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
// GPU status as Chrome sees it
{
  const g = await ctx.newPage();
  await g.goto('chrome://gpu').catch(() => {});
  await g.waitForTimeout(800);
  report.gpu = await g.evaluate(() => {
    const txt = document.querySelector('info-view')?.shadowRoot?.textContent ?? document.body.innerText;
    const pick = (k) => (txt.match(new RegExp(`${k}\\s*:?\\s*([^\\n]+?)(?=\\s{2}|\\n|$)`)) || [])[1];
    return { compositing: pick('Compositing'), rasterization: pick('Rasterization'), gl: pick('GL_RENDERER') };
  }).catch(() => null);
  await g.close();
}

// S1 entrance: navigate cold (session intro not yet played) and trace through the wave
await page.goto(`${BASE}/?tier=500&data=real&theme=light&reset=1&font=1&motion=normal#/kind/book`);
await page.waitForTimeout(800);
await traced(page, 's1-entrance', async () => {
  await page.evaluate(() => sessionStorage.removeItem('cunmu/wall-intro'));
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForSelector('.wall .tile');
  const n = await page.evaluate(() => document.getAnimations().length);
  await page.waitForTimeout(1300);
  return { runningAtStart: n };
}, /class='tile'/, 120);
await page.waitForTimeout(600);

// S1 parallax: 90 rAF-driven scroll steps over the wall. Polish r4: the parallax is a scroll-driven
// animation built at mount — flip the in-app reduce switch off and on so it is rebuilt inside the
// trace and its compositing verdict is recorded.
await traced(page, 's1-parallax', async () => {
  await page.evaluate(async () => {
    const el = document.documentElement, was = el.dataset.motion;
    el.dataset.motion = 'reduce'; await new Promise((r) => setTimeout(r, 50));
    if (was === undefined) delete el.dataset.motion; else el.dataset.motion = was;
    await new Promise((r) => setTimeout(r, 100));
  });
  const ts = await page.evaluate(() => new Promise((res) => {
    const ts = []; let y = 0;
    const step = (t) => { ts.push(t); y += 6; window.scrollTo(0, y); if (ts.length < 90) requestAnimationFrame(step); else res(ts); };
    requestAnimationFrame(step);
  }));
  const d = ts.slice(1).map((t, i) => t - ts[i]);
  return { frames: d.length, meanFrameMs: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(2), maxFrameMs: +Math.max(...d).toFixed(1), transform: await page.evaluate(() => getComputedStyle(document.querySelector('.wall')).transform), driver: await page.evaluate(() => (document.querySelector('.wall').getAnimations().some((x) => x.timeline?.constructor?.name === 'ScrollTimeline') ? 'ScrollTimeline' : 'rAF')) };
});
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(600);

// wall hover (§7.2-7): rise + lift shadow
await traced(page, 'hover', async () => {
  const b = await page.locator('.wall .tile:has(img)').nth(5).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  await page.waitForTimeout(500);
  await page.mouse.move(5, 880, { steps: 4 });
  await page.waitForTimeout(500);
  return {};
}, /tile/, 0);
await page.waitForTimeout(400);

// S1 pointer light (P2-2): 60 mouse steps across the wall. Tile hover and the dwell label are
// switched off for this run so the trace holds only the light following the pointer: it should be
// style + composite per frame, with no paint of the wall.
await traced(page, 'pointer-light', async () => {
  await page.addStyleTag({ content: '.tile-tip{display:none!important}.tile:hover{transform:none!important;z-index:auto!important}.tile:hover::before{opacity:0!important}.tile:hover img{filter:var(--wall-filter) brightness(var(--row-b))!important}' });
  await page.mouse.move(200, 150);
  await page.waitForTimeout(400);
  const t0 = Date.now();
  await page.mouse.move(1240, 480, { steps: 60 });
  const ms = Date.now() - t0;
  const spot = await page.evaluate(() => { const s = document.querySelector('.wall-pointer'); return { on: s.classList.contains('on'), transform: s.style.transform }; });
  await page.waitForTimeout(200);
  return { steps: 60, ms, spot };
});
await page.mouse.move(5, 880);
await page.reload();
await page.waitForSelector('.wall .tile img');
await page.waitForTimeout(1200);

// S2 flight: click a cover on the wall
await traced(page, 's2-flight', async () => {
  await page.locator('.wall .tile:has(img)').nth(3).click();
  await page.waitForFunction(() => document.getAnimations().some((a) => String(a.effect?.pseudoElement).includes('hero-cover')), null, { timeout: 3000 });
  await page.waitForTimeout(1100);
  return {};
}, /view-transition-group\(hero-cover\)/, 0);
await page.waitForTimeout(800);

// S2 return: the browser's own back
await traced(page, 's2-back', async () => {
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => document.getAnimations().some((a) => String(a.effect?.pseudoElement).includes('hero-cover')), null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(800);
  return {};
}, /view-transition-group\(hero-cover\)/, 0);

await page.waitForTimeout(600);

// S3 sheen (P2-1): open an entry not yet swept this session; the window is the sheen animation itself
await traced(page, 's3-sheen', async () => {
  await page.evaluate(() => { location.hash = '#/entry/bgm-507'; });
  await page.waitForFunction(() => document.getAnimations().some((a) => a.animationName === 'sheen'), null, { timeout: 5000 });
  await page.waitForTimeout(900);
  return {};
}, /sheen/, 0);

await browser.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
