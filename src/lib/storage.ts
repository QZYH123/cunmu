/**
 * Where the save (persist.ts, one JSON text) lives.
 *
 *   phone  a file in the app's own data directory (Directory.Data/cunmu/library.json), written through
 *          durable.ts: temp file + rename, one previous copy kept, batched writes flushed when the app
 *          goes to the background. A WebView's localStorage / IndexedDB can be cleared by the system;
 *          this file can't. On the first start the app copies over whatever the WebView had.
 *   desktop the same durable file, in the app data folder, through tauri-plugin-fs (lib/desktop.ts)
 *   web    localStorage, as before, under KEY (the prototype's `self-pedia/v1` moves over once).
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { App } from '@capacitor/app';
import { createDurableStore, createWriter, moveLegacy, type FsLike } from './durable';
import { isDesktop, isNative } from './native';
import { BAK, KEY, LEGACY_BAK, LEGACY_KEY } from '../data/persist';

const DIR = 'cunmu';

/** Directory.Data through FsLike; a read that fails on a file that IS there throws (never "start fresh") */
export const dataFs: FsLike = {
  async read(path) {
    try {
      const r = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
      return typeof r.data === 'string' ? r.data : await r.data.text();
    } catch (e) {
      const there = await Filesystem.stat({ path, directory: Directory.Data }).then(() => true, () => false);
      if (there) throw e;
      return null;
    }
  },
  async write(path, text) {
    await Filesystem.writeFile({ path, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
  },
  async rename(from, to) {
    await Filesystem.rename({ from, to, directory: Directory.Data, toDirectory: Directory.Data });
  },
  async remove(path) {
    await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => undefined);
  },
};

/** a phone or the desktop: the save is a file */
const onDisk = () => isNative() || isDesktop();
let fs: FsLike = dataFs;
let durable = createDurableStore(fs, `${DIR}/library`);
const writer = createWriter((t) => durable.write(t), 800);

let initial: string | null = null;
/** the copy could not be read although it is there: nothing is written this session, so nothing is lost */
let blocked = false;

/** web: KEY, or the prototype's key moved to KEY (removed only once the new copy reads back the same) */
function readLocal(): string | null {
  try { return moveLegacy(localStorage, KEY, BAK, LEGACY_KEY, LEGACY_BAK); } catch { return null; }
}

async function bootFile(): Promise<string | null> {
  if (isDesktop()) {
    const d = await import('./desktop');
    fs = d.deskFs;
    durable = createDurableStore(fs, `${DIR}/library`);
    await d.ensureDir(DIR);
  } else {
    await Filesystem.mkdir({ path: DIR, directory: Directory.Data, recursive: true }).catch(() => undefined);
  }
  let got: Awaited<ReturnType<typeof durable.read>>;
  try {
    got = await durable.read();
  } catch (e) {
    console.error('storage: the save is there but could not be read; not writing this session', e);
    blocked = true;
    return null;
  }
  if (got) {
    if (got.from !== 'current') console.warn(`storage: read the ${got.from} copy`);
    return got.text;
  }
  // first start of the app: move over what the WebView kept (an earlier build stored it there)
  const local = readLocal();
  if (local !== null) {
    await durable.write(local);
    const back = await durable.read();
    if (back?.text === local) { try { localStorage.removeItem(KEY); } catch { /* fine */ } }
  }
  return local;
}

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  const flush = () => { void writer.flush(); };
  if (isDesktop()) void import('./desktop').then((d) => d.flushOnClose(() => writer.flush()));
  else {
    void App.addListener('pause', flush);
    void App.addListener('appStateChange', ({ isActive }) => { if (!isActive) flush(); });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);
}

/** the newest save text (for its size only) */
let lastText: string | null = null;

export const storage = {
  /** before the first render (main.tsx) */
  async boot(): Promise<void> {
    if (onDisk()) {
      initial = await bootFile().catch((e) => { console.error('storage boot', e); blocked = true; return null; });
      listen();
    } else {
      initial = readLocal();
    }
  },
  initialText: () => initial,
  /** a v1 save's raw text, kept once before it is migrated */
  keepBak(raw: string) {
    const v = JSON.stringify({ bakAt: new Date().toISOString(), text: raw });
    if (onDisk()) { void fs.write(`${DIR}/library.v1-bak.json`, v).catch(() => undefined); return; }
    try { if (localStorage.getItem(BAK) === null) localStorage.setItem(BAK, v); } catch { /* full */ }
  },
  save(text: string) {
    lastText = text;
    if (blocked) return;
    if (onDisk()) { writer.schedule(text); return; }
    try { localStorage.setItem(KEY, text); } catch { /* full */ }
  },
  flush: () => writer.flush(),
  /** the size of the save as last handed over, in bytes (复制诊断信息) */
  lastBytes: () => (lastText === null ? null : new TextEncoder().encode(lastText).length),
  /** 删除全部内容: every copy, both keys */
  async clear() {
    if (onDisk()) { await writer.flush(); await durable.clear(); }
    try { for (const k of [KEY, BAK, LEGACY_KEY, LEGACY_BAK]) localStorage.removeItem(k); } catch { /* fine */ }
  },
};
