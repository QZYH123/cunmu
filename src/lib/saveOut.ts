/**
 * Handing a finished file (the export ZIP) to the person. In a browser it downloads, as before. In the
 * phone apps there is no Downloads folder to drop it in: it is written to the app's cache and handed to
 * the system share sheet (save to Files, AirDrop, a chat, a drive…). On the desktop the save dialog asks
 * where it goes. Nothing is uploaded by us.
 */
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isDesktop, platform } from './native';
import { saveBlob } from './exportMd';

export type ExportTarget = 'share' | 'download' | 'save-dialog';
/** where an export goes on this platform */
export const exportTarget = (p: 'ios' | 'android' | 'web' = platform(), desktop = isDesktop()): ExportTarget =>
  (desktop ? 'save-dialog' : p === 'web' ? 'download' : 'share');

const DIR = 'exports';
const base64Of = (blob: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

/** 'done' once it was handed over; 'cancelled' when the share sheet was closed without picking anything */
export async function saveOut(blob: Blob, name: string): Promise<'done' | 'cancelled'> {
  const target = exportTarget();
  if (target === 'download') { saveBlob(blob, name); return 'done'; }
  if (target === 'save-dialog') return (await import('./desktop')).saveAs(blob, name);
  // one export at a time in the cache: the previous one goes
  await Filesystem.rmdir({ path: DIR, directory: Directory.Cache, recursive: true }).catch(() => undefined);
  const { uri } = await Filesystem.writeFile({ path: `${DIR}/${name}`, directory: Directory.Cache, data: await base64Of(blob), recursive: true });
  try {
    await Share.share({ title: name, files: [uri] });
    return 'done';
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message ?? e))) return 'cancelled';
    throw e;
  }
}

export type ImageTarget = 'album' | ExportTarget;
/** where the long image goes: Android's photo library; a download on the web; the save dialog on the
 *  desktop; iOS, which has no album bridge here yet, keeps the share sheet */
export const imageTarget = (p: 'ios' | 'android' | 'web' = platform(), desktop = isDesktop()): ImageTarget =>
  (!desktop && p === 'android' ? 'album' : exportTarget(p, desktop));

interface AlbumPlugin { savePng(o: { data: string; name: string }): Promise<void> }
let album: AlbumPlugin | null = null;

/** 存成一张长图: into the photo library on Android, and nothing opens afterwards */
export async function saveImageOut(blob: Blob, name: string): Promise<'done' | 'cancelled'> {
  if (imageTarget() !== 'album') return saveOut(blob, name);
  album ??= (await import('@capacitor/core')).registerPlugin<AlbumPlugin>('Album');
  await album.savePng({ data: await base64Of(blob), name });
  return 'done';
}
