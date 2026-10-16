/**
 * Bangumi covers are fetched at run time, never bundled. A phone keeps a copy of each wall-size cover in
 * its cache directory (Directory.Cache/covers — the system may clear it; they come back on the next
 * warm-up), so the wall opens offline. Both the phone and the browser measure each cover once, so the wall
 * lays it out at its real shape (BangumiPull.aspects).
 *
 * localCover(url) is synchronous: the cached file's URL when there is one, else the url itself.
 *
 * r9: the copies are capped (COVER_CACHE_MAX_BYTES). Each file's last use is remembered (covers-lru.json,
 * beside the folder); past the cap the least recently used go until the cache is back under COVER_CACHE_TARGET.
 * A dropped cover shows from the network again and is copied again the next time it is warmed.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { hash } from './hash';
import { isNative, USER_AGENT } from './native';
import { pickEvictions, type CacheEntry } from './lru';

/** about 3,000 wall-size covers */
export const COVER_CACHE_MAX_BYTES = 150 * 1024 * 1024;
const COVER_CACHE_TARGET = Math.round(COVER_CACHE_MAX_BYTES * 0.85);
/** how long last-use times wait before they are written (not a UI timing) */
const LRU_SAVE_MS = 20_000;
const LRU_FILE = 'covers-lru.json';

const DIR = 'covers';
const have = new Map<string, string>();   // remote url → local URL
let known = new Set<string>();             // file names on disk
const index = new Map<string, CacheEntry>(); // file name → size, last use
const urlOf = new Map<string, string>();   // file name → remote url (to forget `have` when a file goes)
let lruTimer: ReturnType<typeof setTimeout> | null = null;
let ready: Promise<void> | null = null;
let base = '';

const nameOf = (url: string) => `${hash(url).toString(36)}-${url.length.toString(36)}.jpg`;

/** phone: learn which covers are already on disk (once, at start) */
export function initCoverCache(): Promise<void> {
  if (!isNative()) return Promise.resolve();
  ready ??= (async () => {
    try {
      await Filesystem.mkdir({ path: DIR, directory: Directory.Cache, recursive: true }).catch(() => undefined);
      base = (await Filesystem.getUri({ path: DIR, directory: Directory.Cache })).uri;
      const { files } = await Filesystem.readdir({ path: DIR, directory: Directory.Cache });
      let used: Record<string, number> = {};
      try {
        const r = await Filesystem.readFile({ path: LRU_FILE, directory: Directory.Cache, encoding: Encoding.UTF8 });
        used = JSON.parse(typeof r.data === 'string' ? r.data : await r.data.text());
      } catch { /* first run, or the system cleared it: file times stand in */ }
      known = new Set();
      for (const f of files) {
        const name = typeof f === 'string' ? f : f.name;
        known.add(name);
        index.set(name, { size: typeof f === 'string' ? 0 : f.size ?? 0, used: used[name] ?? (typeof f === 'string' ? 0 : Number(f.mtime) || 0) });
      }
      void evict();
    } catch { known = new Set(); }
  })();
  return ready;
}


export function localCover(url: string): string {
  if (!isNative() || !/^https?:\/\/lain\.bgm\.tv\//.test(url)) return url;
  const n = nameOf(url);
  const hit = have.get(url);
  if (hit) { touch(n); return hit; }
  if (base && known.has(n)) {
    const u = Capacitor.convertFileSrc(`${base}/${n}`);
    have.set(url, u);
    urlOf.set(n, url);
    touch(n);
    return u;
  }
  return url;
}

function touch(n: string) {
  const e = index.get(n);
  if (!e) return;
  e.used = Date.now();
  lruTimer ??= setTimeout(saveLru, LRU_SAVE_MS);
}
function saveLru() {
  lruTimer = null;
  const used = Object.fromEntries([...index].map(([n, e]) => [n, e.used]));
  void Filesystem.writeFile({ path: LRU_FILE, data: JSON.stringify(used), directory: Directory.Cache, encoding: Encoding.UTF8 }).catch(() => undefined);
}
/** past the cap: the least recently used copies go */
async function evict() {
  const drop = pickEvictions(index, COVER_CACHE_MAX_BYTES, COVER_CACHE_TARGET);
  for (const n of drop) {
    index.delete(n); known.delete(n);
    const url = urlOf.get(n);
    if (url) { have.delete(url); urlOf.delete(n); }
    await Filesystem.deleteFile({ path: `${DIR}/${n}`, directory: Directory.Cache }).catch(() => undefined);
  }
  if (drop.length) saveLru();
}

/** for 复制诊断信息: how many copies, how big (phone only) */
export function coverCacheStats(): { files: number; bytes: number } | null {
  if (!isNative()) return null;
  let bytes = 0;
  for (const e of index.values()) bytes += e.size;
  return { files: index.size, bytes };
}

async function download(url: string): Promise<string | null> {
  const n = nameOf(url);
  if (!known.has(n)) {
    const r = await CapacitorHttp.get({ url, responseType: 'blob', headers: { 'User-Agent': USER_AGENT }, connectTimeout: 15000, readTimeout: 30000 });
    if (r.status !== 200 || typeof r.data !== 'string') return null;
    await Filesystem.writeFile({ path: `${DIR}/${n}`, data: r.data, directory: Directory.Cache, recursive: true });
    known.add(n);
    // base64 → bytes
    index.set(n, { size: Math.floor((r.data.length * 3) / 4), used: Date.now() });
    await evict();
  }
  return localCover(url);
}

const measure = (src: string) => new Promise<number | null>((res) => {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => res(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null);
  img.onerror = () => res(null);
  img.src = src;
});

/**
 * Warm the covers of these works (subject id → cover url), two at a time; `onAspects` hears real shapes in
 * batches. Returns a stop function.
 */
export function warmCovers(items: [string, string][], onAspects: (a: Record<string, number>) => void): () => void {
  let stopped = false;
  let pending: Record<string, number> = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => { timer = null; if (Object.keys(pending).length) { const p = pending; pending = {}; onAspects(p); } };
  const queue = [...items];
  const worker = async () => {
    await initCoverCache();
    while (!stopped && queue.length) {
      const [sid, url] = queue.shift()!;
      try {
        const src = isNative() ? await download(url) : url;
        const a = src ? await measure(src) : null;
        if (a && a > 0.3 && a < 3) { pending[sid] = Math.round(a * 1000) / 1000; timer ??= setTimeout(flush, 3000); }
      } catch { /* the next warm-up tries again */ }
    }
    if (!queue.length) flush();
  };
  void worker(); void worker();
  return () => { stopped = true; if (timer) clearTimeout(timer); flush(); };
}

/** 断开 Bangumi / 删除全部内容: the copies go */
export async function clearCoverCache() {
  have.clear(); known = new Set(); index.clear(); urlOf.clear();
  if (lruTimer) { clearTimeout(lruTimer); lruTimer = null; }
  if (isNative()) {
    await Filesystem.rmdir({ path: DIR, directory: Directory.Cache, recursive: true }).catch(() => undefined);
    await Filesystem.deleteFile({ path: LRU_FILE, directory: Directory.Cache }).catch(() => undefined);
  }
}
