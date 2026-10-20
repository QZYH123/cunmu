/**
 * The user's pictures: UserImage.src is 'idb:<id>' wherever they live.
 *   web    IndexedDB (`self-pedia-images` / `images`, key = id, value = a JPEG Blob)
 *   phone  files in the app's data directory (Directory.Data/cunmu/images/<id>.jpg), which the system
 *          never clears; a picture still in the WebView's IndexedDB (an earlier build) is copied over on
 *          first use and by migrateImages() at start.
 * 删除全部内容 deletes all of them.
 */
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { isNative } from './native';

const IMG_DIR = 'cunmu/images';
const fileOf = (id: string) => `${IMG_DIR}/${id.replace(/[^\w.-]/g, '_')}.jpg`;
const blobToBase64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => rej(r.error);
  r.readAsDataURL(b);
});
const base64ToBlob = (b64: string, type = 'image/jpeg') => {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type });
};
async function fileWrite(id: string, blob: Blob) {
  await Filesystem.writeFile({ path: fileOf(id), data: await blobToBase64(blob), directory: Directory.Data, recursive: true });
}
async function fileRead(id: string): Promise<Blob | null> {
  try {
    const r = await Filesystem.readFile({ path: fileOf(id), directory: Directory.Data });
    return typeof r.data === 'string' ? base64ToBlob(r.data) : r.data;
  } catch { return null; }
}
async function fileUrl(id: string): Promise<string | null> {
  try {
    await Filesystem.stat({ path: fileOf(id), directory: Directory.Data });
    const { uri } = await Filesystem.getUri({ path: fileOf(id), directory: Directory.Data });
    return Capacitor.convertFileSrc(uri);
  } catch { return null; }
}

const DB = 'self-pedia-images';
const STORE = 'images';
/** per picture, after shrinking (the long edge is 1280); a bigger one is shrunk further */
export const IMAGE_MAX_BYTES = 600_000;
/** pictures per work */
export const IMAGES_PER_WORK = 4;

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
const tx = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const r = f(t.objectStore(STORE));
    r.onerror = () => rej(r.error);
    // a write is kept only once its transaction completes: a full disk aborts it after the request succeeded
    if (mode === 'readonly') r.onsuccess = () => res(r.result);
    else {
      t.oncomplete = () => res(r.result);
      t.onabort = () => rej(t.error ?? r.error ?? new Error('aborted'));
    }
  });
};

const idbGet = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>).catch(() => undefined);

const urls = new Map<string, string>();
export async function putImage(id: string, blob: Blob) {
  if (isNative()) await fileWrite(id, blob);
  else await tx('readwrite', (s) => s.put(blob, id));
}
export async function deleteImage(id: string) {
  if (isNative()) await Filesystem.deleteFile({ path: fileOf(id), directory: Directory.Data }).catch(() => undefined);
  await tx('readwrite', (s) => s.delete(id)).catch(() => undefined);
  const u = urls.get(id); if (u) { if (u.startsWith('blob:')) URL.revokeObjectURL(u); urls.delete(id); }
}
/** phone: the file, or the WebView's IndexedDB copy moved into a file */
async function nativeBlobOrMove(id: string): Promise<boolean> {
  if (await fileUrl(id)) return true;
  const old = await idbGet(id);
  if (!old) return false;
  await fileWrite(id, old);
  return true;
}
export async function imageURL(src: string): Promise<string | null> {
  if (!src.startsWith('idb:')) return src;
  const id = src.slice(4);
  const hit = urls.get(id);
  if (hit) return hit;
  if (isNative()) {
    if (!(await nativeBlobOrMove(id).catch(() => false))) return null;
    const u = await fileUrl(id);
    if (u) urls.set(id, u);
    return u;
  }
  const blob = await idbGet(id);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urls.set(id, u);
  return u;
}
export async function getImage(id: string): Promise<Blob | null> {
  if (isNative()) return (await fileRead(id)) ?? (await idbGet(id)) ?? null;
  return (await idbGet(id)) ?? null;
}
/** phone, at start: every picture an earlier build left in the WebView's IndexedDB gets its file */
export async function migrateImages(): Promise<number> {
  if (!isNative()) return 0;
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).catch(() => [] as IDBValidKey[]);
  let n = 0;
  for (const k of keys) if (typeof k === 'string' && !(await fileUrl(k)) && (await nativeBlobOrMove(k).catch(() => false))) n++;
  return n;
}
/** 删除全部内容: every picture goes */
export async function clearImages() {
  for (const u of urls.values()) if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  urls.clear();
  if (isNative()) await Filesystem.rmdir({ path: IMG_DIR, directory: Directory.Data, recursive: true }).catch(() => undefined);
  const d = dbp ? await dbp.catch(() => null) : null;
  d?.close();
  dbp = null;
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); });
}

/** a displayable URL for an 'idb:' (or plain) src; null while loading or when the picture is gone */
export function useImageSrc(src: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(src && !src.startsWith('idb:') ? src : (src ? urls.get(src.slice(4)) ?? null : null));
  useEffect(() => {
    let live = true;
    if (!src) { setUrl(null); return; }
    imageURL(src).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [src]);
  return url;
}

/** shrink a picked picture to a JPEG Blob under IMAGE_MAX_BYTES */
export async function shrinkToBlob(file: Blob, max = 1280): Promise<{ blob: Blob; aspect: number }> {
  const bmp = await createImageBitmap(file);
  const aspect = bmp.width / bmp.height;
  let edge = max;
  for (let i = 0; i < 4; i++) {
    const k = Math.min(1, edge / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.82));
    if (blob && (blob.size <= IMAGE_MAX_BYTES || i === 3)) return { blob, aspect };
    edge = Math.round(edge * 0.75);
  }
  throw new Error('image');
}
