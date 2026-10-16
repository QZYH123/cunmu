#!/usr/bin/env node
/**
 * Frame pacing on a phone-sized page with the CPU slowed 4× (a mid-range Android WebView stand-in):
 * scrolls the wall and the 全部 page with the tab bar over them, picks several on the wall (选几部), flies a cover
 * into its entry and switches tabs. For each: rAF frame intervals (p50 / p95 / max, frames over 25ms)
 * and how many layouts and style recalcs ran. Relative numbers — compare two builds on one machine.
 *   BASE=http://127.0.0.1:4173 OUT=/tmp/frames.json node scripts/motion-frames.mjs
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = process.env.OUT || '/tmp/motion-frames.json';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const RUNS = Number(process.env.RUNS || 3);
const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-dev-shm-usage'] });

const stats = (d) => {
  const s = [...d].sort((a, b) => a - b);
  const q = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
  return { frames: d.length, p50: q(0.5), p95: q(0.95), max: +s[s.length - 1].toFixed(1), over25: d.filter((x) => x > 25).length };
};
const metrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
/** record rAF intervals while `act` runs */
const TRACKED = ['Layout', 'UpdateLayoutTree', 'Paint', 'RasterTask', 'PrePaint', 'Layerize', 'CompositeLayers'];
async function measure(page, cdp, act, ms) {
  await browser.startTracing(page, { categories: ['devtools.timeline'] });
  const m0 = await metrics(cdp);
  await page.evaluate(() => { window.__ts = []; const f = (t) => { window.__ts.push(t); window.__raf = requestAnimationFrame(f); }; window.__raf = requestAnimationFrame(f); });
  await act();
  await page.waitForTimeout(ms);
  const ts = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__ts; });
  const m1 = await metrics(cdp);
  const trace = JSON.parse((await browser.stopTracing()).toString()).traceEvents;
  const ms_ = Object.fromEntries(TRACKED.map((n) => [n, 0]));
  for (const e of trace) if (e.ph === 'X' && e.name in ms_) ms_[e.name] += (e.dur ?? 0) / 1000;
  return { ...stats(ts.slice(1).map((t, i) => t - ts[i])), layouts: m1.LayoutCount - m0.LayoutCount, styles: m1.RecalcStyleCount - m0.RecalcStyleCount,
    layoutMs: +ms_.Layout.toFixed(1), styleMs: +ms_.UpdateLayoutTree.toFixed(1), paintMs: +(ms_.Paint + ms_.PrePaint).toFixed(1), rasterMs: +ms_.RasterTask.toFixed(1) };
}
const scrollBy = (page, total, steps) => page.evaluate(async ([total, steps]) => {
  for (let i = 0; i < steps; i++) { window.scrollBy(0, total / steps); await new Promise((r) => requestAnimationFrame(r)); }
}, [total, steps]);

const report = {};
for (let run = 0; run < RUNS; run++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  if (process.env.NOVT) await page.addInitScript(() => { delete Document.prototype.startViewTransition; });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const go = async (hash) => { await page.goto(`${BASE}/?tier=500&data=real&theme=light&font=1&motion=normal#${hash}`); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1500); };
  await go('/');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const put = (k, v) => { (report[k] ??= []).push(v); };
  await go('/wall');
  put('wall-scroll', await measure(page, cdp, () => scrollBy(page, 2400, 60), 300));
  await go('/');
  put('home-scroll', await measure(page, cdp, () => scrollBy(page, 1600, 50), 300));
  await go('/wall');
  report.pickedVia ??= [];
  put('pick-several', await measure(page, cdp, async () => {
    await page.locator('.pick-toggle').first().click();
    for (const k of [2, 5, 9]) await page.locator('.tile[data-id]').nth(k).click();
  }, 700));
  report.pickedVia.push(await page.evaluate(() => String(document.querySelectorAll('.tile.picked, .tile.is-picked, .tile[aria-checked="true"], .tile[aria-pressed="true"]').length)));
  await go('/all');
  const t2 = page.locator('.tile[data-id]:has(img)').nth(2);
  put('cover-flight', await measure(page, cdp, () => t2.click(), 900));
  await go('/');
  put('tab-switch', await measure(page, cdp, () => page.locator('.tabbar .tab', { hasText: process.env.TABTO || '全部' }).click(), 700));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await ctx.close();
}
await browser.close();
// median of runs per field
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const picked = report.pickedVia; delete report.pickedVia;
const out = Object.fromEntries(Object.entries(report).map(([k, runs]) => [k, Object.fromEntries(Object.keys(runs[0]).map((f) => [f, med(runs.map((r) => r[f]))]))]));
out.pickedVia = picked;
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
