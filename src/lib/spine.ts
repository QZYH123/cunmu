import { useEffect, useSyncExternalStore } from 'react';
import type { Work } from '../data/types';
import { hash } from './hash';
import { inkFor, spineFromPixels, type SpineColour } from './spineCore.js';
import { SHELF } from '../tokens';

/**
 * Spine colours for 索引 · 年份 (r6). A bundled demo cover carries one from the build
 * (the demo kit's make-spines.mjs); any other cover is drawn once into a 16×24 canvas, reduced to one quiet
 * colour (spineCore.js) and remembered — in memory, and on the device under KEY, keyed by a hash of
 * the image address so a changed cover gets a new colour. Sampling runs a few at a time, off the
 * first paint. Works without art (no cover, a broken one, an essay) have no colour: their spine is paper.
 */
const KEY = 'cunmu/spine-colours/1';
const mem = new Map<string, SpineColour | null>();
let loaded = false;
const queue: { key: string; src: string }[] = [];
const queued = new Set<string>();
let active = 0;
let version = 0;
const listeners = new Set<() => void>();
let notifyT = 0;
let saveT = 0;

const art = (w: Work) => (w.kind !== 'essay' && w.cover && !w.coverBroken && !w.cover.thumb.startsWith('idb:') ? w.cover.thumb : null);
const keyOf = (src: string) => hash(src).toString(36) + src.length.toString(36);

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, [number, number, number] | 0>;
    for (const [k, v] of Object.entries(j)) mem.set(k, v ? { l: v[0], c: v[1], h: v[2] } : null);
  } catch { /* unreadable: sample again */ }
}
function save() {
  window.clearTimeout(saveT);
  saveT = window.setTimeout(() => {
    const o: Record<string, [number, number, number] | 0> = {};
    for (const [k, v] of mem) o[k] = v ? [v.l, v.c, v.h] : 0;
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* full: memory only */ }
  }, SHELF.saveDelay);
}
/** 删除全部内容: the colours remembered for covers go too (they are read from the user's own images) */
export function clearSpineColours() {
  window.clearTimeout(saveT);
  mem.clear(); queued.clear(); queue.length = 0; loaded = true;
  version++;
  try { localStorage.removeItem(KEY); } catch { /* nothing to remove */ }
  notify();
}
/** colours arrive in bursts: the shelves hear about them a few times a second, not every frame (r9 perf) */
function notify() {
  if (notifyT) return;
  notifyT = window.setTimeout(() => { notifyT = 0; version++; listeners.forEach((f) => f()); }, SHELF.notifyMs);
}

let canvas: CanvasRenderingContext2D | null | undefined;
/** one small canvas, reused for every sample */
const ctx2d = () => {
  if (canvas === undefined) {
    const c = document.createElement('canvas');
    c.width = SHELF.sampleW; c.height = SHELF.sampleH;
    canvas = c.getContext('2d', { willReadFrequently: true });
  }
  return canvas;
};

/** the few pixels, read back from the small canvas */
function readSmall(source: CanvasImageSource): SpineColour | null {
  const g = ctx2d();
  if (!g) return null;
  g.clearRect(0, 0, SHELF.sampleW, SHELF.sampleH);
  g.drawImage(source, 0, 0, SHELF.sampleW, SHELF.sampleH);
  return spineFromPixels(g.getImageData(0, 0, SHELF.sampleW, SHELF.sampleH).data);
}

/**
 * One cover → one colour. The file is fetched and the browser decodes and shrinks it to 16×24 off the main
 * thread (createImageBitmap on the bytes); only those pixels are read here. Drawing whole covers into a canvas
 * cost ~0.8 s per screen of spines on a slow phone (r9 perf). Where that path fails (no CORS on the fetch, an
 * old WebView), the image element and a canvas draw, as before.
 */
async function sample(src: string): Promise<SpineColour | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const r = await fetch(src, { credentials: 'omit' });
      if (r.ok) {
        const bmp = await createImageBitmap(await r.blob(), { resizeWidth: SHELF.sampleW, resizeHeight: SHELF.sampleH, resizeQuality: 'low' });
        try { return readSmall(bmp); } finally { bmp.close(); }
      }
    } catch { /* the element below */ }
  }
  return new Promise((res) => {
    const img = new Image();
    img.decoding = 'async';
    // a cover from another host must allow it, or the canvas can't be read (it then stays paper)
    if (/^https?:/.test(src) && !src.startsWith(location.origin)) img.crossOrigin = 'anonymous';
    img.src = src;
    img.decode().then(() => { try { res(readSmall(img)); } catch { res(null); } }, () => res(null));
  });
}
function pump() {
  while (active < SHELF.parallel && queue.length) {
    const { key, src } = queue.shift()!;
    active++;
    sample(src).then((v) => {
      mem.set(key, v);
      queued.delete(key);
      active--;
      save();
      notify();
      pump();
    });
  }
}

/** a work's spine colour: a colour, null (paper), or undefined (not sampled yet) */
export function spineOf(w: Work): SpineColour | null | undefined {
  const src = art(w);
  if (!src) return null;
  if (w.cover!.spine !== undefined) return w.cover!.spine;
  load();
  return mem.get(keyOf(src));
}

const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
/** how many of these works have their colour settled (a number, so React compares it cheaply) */
function known(works: Work[]): number {
  let n = 0;
  for (const w of works) if (spineOf(w) !== undefined) n++;
  return n * 1e6 + works.length;
}

/** Ask for the colours of these works (the ones on screen); re-renders as they arrive. */
export function useSpineColours(works: Work[]): number {
  // re-render only when one of *these* works got its colour (a 2,000-work shelf has 20-odd rows; r9 perf)
  const v = useSyncExternalStore(subscribe, () => known(works));
  useEffect(() => {
    load();
    let added = false;
    for (const w of works) {
      const src = art(w);
      if (!src || w.cover!.spine !== undefined) continue;
      const key = keyOf(src);
      if (mem.has(key) || queued.has(key)) continue;
      queued.add(key);
      queue.push({ key, src });
      added = true;
    }
    if (added) pump();
  }, [works]);
  return v;
}

/** inline custom properties for a spine: its colour as OKLCH parts and which ink its title takes */
export function spineVars(s: SpineColour) {
  return { '--sl': String(s.l), '--sc': String(s.c), '--sh': String(s.h) } as React.CSSProperties;
}
export const inkOf = (s: SpineColour) => inkFor(s).ink;
