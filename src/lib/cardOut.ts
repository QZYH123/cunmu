/**
 * Drawing the card and handing the file over. The pure names (the file, the line after a save)
 * stay free of the DOM so a test can call them on their own.
 * Covers are read here, and only here: the card data itself makes no request.
 */
import type { CardModel } from '../data/card/model';
import { CARD_H, CARD_W, SCALE } from '../data/card/metrics';
import { isDesktop, isNative, platform } from './native';
import type { ImageTarget } from './saveOut';

export function cardFileName(today: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.test(today) ? today.slice(0, 10) : '0000-00-00';
  return `Cunmu-card-${day}.png`;
}

/** Said only after the file was actually handed over. Closing the sheet says nothing. */
export function savedToast(target: ImageTarget): string {
  if (target === 'album') return '已存入相册';
  if (target === 'download') return '名片存好了，在下载里';
  if (target === 'save-dialog') return '名片存好了';
  return '名片准备好了';
}

export function cardFailToast(err: unknown): string {
  const msg = String((err as { message?: string } | null)?.message ?? err);
  if (/denied/i.test(msg)) return '没有存进相册：先在系统设置里允许存储，再试一次';
  return '名片没画出来，再试一次';
}

export interface CopyEnv {
  native: boolean;
  desktop: boolean;
  hasClipboardItem: boolean;
  canWrite: boolean;
}

function liveCopyEnv(): CopyEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    native: isNative(),
    desktop: isDesktop(),
    hasClipboardItem: typeof globalThis.ClipboardItem === 'function',
    canWrite: !!nav?.clipboard && typeof nav.clipboard.write === 'function',
  };
}

/** Phones have no image clipboard here. Desktop and the web do, when the browser allows it. */
export function canCopyImage(env?: CopyEnv): boolean {
  const e = env ?? liveCopyEnv();
  if (e.native && !e.desktop) return false;
  return e.hasClipboardItem && e.canWrite;
}

export async function copyImage(blob: Blob): Promise<boolean> {
  try {
    const Item = globalThis.ClipboardItem;
    const write = navigator.clipboard?.write;
    if (!Item || !write) return false;
    await write([new Item({ 'image/png': Promise.resolve(blob) })]);
    return true;
  } catch {
    return false;
  }
}

export interface CoverItem { workId: string; url: string | null }

const COVER_CAP = 6;
const COVER_BYTE_MAX = 2 * 1024 * 1024;
const FETCH_MS = 6000;

export interface CoverDeps {
  getImage?: (id: string) => Promise<Blob | null>;
  fetch?: typeof fetch;
  localCover?: (url: string) => string;
}

function isImage(buf: Uint8Array, type: string): boolean {
  if (type.startsWith('image/')) return true;
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  return false;
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return `data:${mime || 'image/jpeg'};base64,${btoa(bin)}`;
}

/** At most six covers, one after another. A miss is left out; the card then draws words. */
export async function prefetchCovers(items: readonly CoverItem[], deps: CoverDeps = {}): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = items.filter((item): item is CoverItem & { url: string } => !!item.url).slice(0, COVER_CAP);
  for (const item of list) {
    const url = item.url;
    try {
      if (url.startsWith('data:')) { out.set(item.workId, url); continue; }
      if (url.startsWith('idb:')) {
        const getImage = deps.getImage ?? (await import('./images')).getImage;
        const blob = await getImage(url.slice(4));
        if (!blob || blob.size > COVER_BYTE_MAX) continue;
        const buf = new Uint8Array(await blob.arrayBuffer());
        if (!isImage(buf, blob.type)) continue;
        out.set(item.workId, bytesToDataUrl(buf, blob.type || 'image/jpeg'));
        continue;
      }
      const localCover = deps.localCover ?? (await import('./coverCache')).localCover;
      const src = localCover(url);
      const fetchFn = deps.fetch ?? globalThis.fetch.bind(globalThis);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
      let res: Response;
      try { res = await fetchFn(src, { signal: ctrl.signal }); }
      finally { clearTimeout(timer); }
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.size > COVER_BYTE_MAX) continue;
      const buf = new Uint8Array(await blob.arrayBuffer());
      if (!isImage(buf, blob.type)) continue;
      out.set(item.workId, bytesToDataUrl(buf, blob.type || 'image/jpeg'));
    } catch { /* this cover stays words */ }
  }
  return out;
}

const WAIT_MS = 3000;

function waitFor(pred: () => boolean): Promise<void> {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (pred()) resolve();
      else if (performance.now() - start > WAIT_MS) reject(new Error('card not ready'));
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

function shootTwice(): boolean {
  if (platform() === 'ios') return true;
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|chromium|android/i.test(ua);
}

let fontCache: { n: number; css: string } | null = null;

function loadedCount(): number {
  let n = 0;
  document.fonts.forEach((f) => { if (f.status === 'loaded') n += 1; });
  return n;
}

/**
 * The card, off to the side, at 540×720, then twice that as a PNG.
 * The offset sits on the host, not on the card: the clone keeps the card's own box.
 */
export async function drawCard(model: CardModel, o: { startDrop: number; covers: ReadonlyMap<string, string> }): Promise<Blob> {
  const [{ createElement }, { createRoot }, { toBlob }, { default: CardView }, { loadedFontCSS }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('html-to-image'),
    import('../components/CardView'),
    import('./longImage'),
  ]);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:540px;height:720px;pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(createElement(CardView, { model, covers: o.covers, startDrop: o.startDrop, exportMode: true }));
    await waitFor(() => !!host.querySelector('.card'));
    const card = host.querySelector('.card') as HTMLElement;
    await waitFor(() => card.dataset.fit === 'done');
    await Promise.all([...card.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)));
    const n = loadedCount();
    const fontEmbedCSS = fontCache && fontCache.n === n ? fontCache.css : await loadedFontCSS();
    fontCache = { n: loadedCount(), css: fontEmbedCSS };
    const bg = getComputedStyle(card).backgroundColor;
    const shoot = () => toBlob(card, {
      pixelRatio: SCALE, width: CARD_W, height: CARD_H, backgroundColor: bg, fontEmbedCSS, cacheBust: false,
    });
    let blob = await shoot();
    if (shootTwice()) blob = await shoot();
    if (!blob) throw new Error('nothing drawn');
    return blob;
  } finally {
    root.unmount();
    host.remove();
  }
}
