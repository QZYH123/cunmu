#!/usr/bin/env node
/**
 * Motion checks for STYLE-GUIDE v0.3 §6.5 (#53 S1 entrance, #56 S2 flight + return). Freezes every
 * running animation (CSS, WAAPI and ::view-transition pseudos) and steps them to fixed times, so the
 * frame sequence is exact rather than whatever a screen recorder happens to catch. Writes PNG frames
 * and a timings report:  BASE=http://localhost:5173 OUT=/tmp/motion node scripts/motion.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = process.env.OUT || join(new URL('..', import.meta.url).pathname, 'motion');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
mkdirSync(OUT, { recursive: true });
const report = {};
const browser = await chromium.launch({ executablePath: CHROME });

// time-based animations only: the parallax runs on a scroll timeline (polish r4) and has no clock
const freeze = (page) => page.evaluate(() => { for (const a of document.getAnimations()) if (a.timeline === document.timeline) a.pause(); });
const seek = (page, t) => page.evaluate((t) => { for (const a of document.getAnimations()) if (a.timeline === document.timeline) a.currentTime = t; }, t);
async function frames(page, name, times) {
  for (const t of times) {
    await seek(page, t);
    await page.waitForTimeout(30);
    await page.screenshot({ path: join(OUT, `${name}-${String(t).padStart(4, '0')}ms.png`) });
  }
}

/* ---------- S1 entrance (#53) ---------- */
for (const [vw, vh] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?tier=500&data=real&theme=light&reset=1&font=1&motion=normal#/`);
  await page.waitForSelector('.wall .tile');
  await freeze(page);
  const t = await page.evaluate(() => {
    const tiles = document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('tile'));
    const ends = tiles.map((a) => { const tm = a.effect.getTiming(); return tm.delay + tm.duration; });
    const starts = tiles.map((a) => a.effect.getTiming().delay);
    return { tiles: tiles.length, firstStart: Math.min(...starts), lastStart: Math.max(...starts), end: Math.max(...ends) };
  });
  report[`s1-entrance-${vw}`] = t;
  await frames(page, `s1-${vw}`, [0, 80, 160, 240, 320, 400, 520, 680, 880]);
  // same session, back to home: must not replay
  await page.evaluate(() => { for (const a of document.getAnimations()) if (a.timeline === document.timeline) a.finish(); });
  await page.goto(`${BASE}/#/kind/book`); await page.waitForTimeout(400);
  await page.goBack(); await page.waitForSelector('.wall .tile');
  report[`s1-replay-${vw}`] = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('tile')).length);
  await ctx.close();
}

/* ---------- S2 flight wall → entry, and back (#56) ---------- */
for (const [vw, vh, mobile] of [[1440, 900, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?tier=500&data=real&theme=light&reset=1&font=1&motion=normal#/`);
  await page.waitForSelector('.wall .tile img');
  await page.waitForTimeout(1200);
  const tile = page.locator('.wall .tile:has(img)').nth(3);
  const id = await tile.getAttribute('data-id');
  await tile.click();
  await page.waitForFunction(() => document.getAnimations().some((a) => String(a.effect?.pseudoElement).includes('hero-cover')), null, { timeout: 3000 });
  await freeze(page);
  report[`s2-flight-${vw}`] = await page.evaluate(() => {
    const g = document.getAnimations().find((a) => a.effect.pseudoElement === '::view-transition-group(hero-cover)');
    const text = document.getAnimations().filter((a) => a.effect?.target?.closest?.('.hero-text')).map((a) => [a.effect.target.className.split(' ')[0] || a.effect.target.tagName, a.effect.getTiming().delay]);
    return { group: g?.effect.getTiming().duration, easing: getComputedStyle(document.documentElement, '::view-transition-group(hero-cover)').animationTimingFunction, text };
  });
  report[`s2-flight-${vw}`].id = id;
  await frames(page, `s2-in-${vw}`, [0, 80, 160, 260, 360, 440, 520, 640, 800, 960]);
  await page.evaluate(() => { for (const a of document.getAnimations()) if (a.timeline === document.timeline) a.finish(); });
  await page.waitForTimeout(1500);
  {
    // phone: the in-app back button · desktop: the browser's own back (history.back / Alt+←)
    if (mobile) await page.locator('.topbar .icon-btn[aria-label="返回"]').click();
    else await page.evaluate(() => history.back());
    const ok = await page.waitForFunction(() => document.getAnimations().some((a) => String(a.effect?.pseudoElement).includes('hero-cover')), null, { timeout: 3000 }).then(() => true, () => false);
    if (ok) {
      await freeze(page);
      report[`s2-back-${vw}`] = await page.evaluate(() => ({
        via: matchMedia('(pointer: fine)').matches ? 'browser back' : 'in-app back',
        group: document.getAnimations().find((a) => a.effect.pseudoElement === '::view-transition-group(hero-cover)')?.effect.getTiming().duration,
        kind: document.documentElement.dataset.vt,
      }));
      await frames(page, `s2-back-${vw}`, [0, 110, 220, 330, 440]);
    } else report[`s2-back-${vw}`] = 'no flight';
  }
  await ctx.close();
}

/* ---------- CLS (#63) and parallax frame pacing (#55) ---------- */
for (const [name, path] of [['home', '/'], ['entry', '/entry/bgm-9585'], ['essay', '/essay/essay-scifi'], ['year', '/year/2024']]) {
  for (const [vw, vh] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(`${BASE}/?tier=500&data=real&theme=light&reset=1&font=1&motion=normal#${path}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    report[`cls-${name}-${vw}`] = +(await page.evaluate(() => window.__cls)).toFixed(4);
    if (name === 'home' && vw === 1440) {
      const frames = await page.evaluate(() => new Promise((res) => {
        const ts = []; let y = 0;
        const step = (t) => { ts.push(t); y += 8; window.scrollTo(0, y); if (ts.length < 90) requestAnimationFrame(step); else res(ts); };
        requestAnimationFrame(step);
      }));
      const d = frames.slice(1).map((t, i) => t - frames[i]);
      report['parallax-1440'] = { frames: d.length, maxFrameMs: +Math.max(...d).toFixed(1), over16_7: d.filter((x) => x > 16.7 * 1.5).length,
        wallTransform: await page.evaluate(() => getComputedStyle(document.querySelector('.wall')).transform),
        driver: await page.evaluate(() => (document.querySelector('.wall').getAnimations().some((x) => x.timeline?.constructor?.name === 'ScrollTimeline') ? 'ScrollTimeline' : 'rAF')) };
    }
    await ctx.close();
  }
}

await browser.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
