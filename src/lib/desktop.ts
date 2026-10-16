/**
 * The desktop app (Tauri 2, Windows). Loaded only inside it (lib/native.ts isDesktop), so the web build
 * doesn't carry it in its first load.
 *   saves   the app data folder (%APPDATA%\com.qzyh123.cunmu\cunmu\library.json) through
 *           tauri-plugin-fs, with the same temp file + rename + previous copy as a phone (durable.ts)
 *   export  the system save dialog, then the file is written where the person chose
 *   links   http(s) links open in the default browser, not inside the app window
 * Pictures and the Bangumi token stay in the window's own storage (WebView2 keeps it in
 * %LOCALAPPDATA%\com.qzyh123.cunmu\EBWebView, which nothing clears behind the person's back).
 */
import { BaseDirectory, exists, mkdir, readTextFile, remove, rename, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { FsLike } from './durable';

const IN = { baseDir: BaseDirectory.AppData };

/** the app data folder through FsLike; a read that fails on a file that IS there throws */
export const deskFs: FsLike = {
  async read(path) {
    if (!(await exists(path, IN))) return null;
    return readTextFile(path, IN);
  },
  async write(path, text) { await writeTextFile(path, text, IN); },
  async rename(from, to) { await rename(from, to, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData }); },
  async remove(path) { await remove(path, IN).catch(() => undefined); },
};

export async function ensureDir(dir: string) {
  await mkdir(dir, { ...IN, recursive: true }).catch(() => undefined);
}

/** 'cancelled' when the dialog was closed without a place */
export async function saveAs(blob: Blob, name: string): Promise<'done' | 'cancelled'> {
  const ext = name.split('.').pop() ?? 'zip';
  const path = await save({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (!path) return 'cancelled';
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  return 'done';
}

/** closing the window waits for the last save */
export function flushOnClose(flush: () => Promise<void>) {
  void getCurrentWindow().onCloseRequested(async () => { await flush().catch(() => undefined); });
}

/** links out of the app go to the default browser */
export function openLinksOutside() {
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href]');
    const href = a?.getAttribute('href') ?? '';
    if (!/^(https?:|mailto:)/i.test(href)) return;
    e.preventDefault();
    void openUrl(href);
  }, true);
}
