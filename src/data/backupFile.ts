import { readZip } from '../lib/zip';
import { isBackupFormat, LEGACY_EXPORT } from './store';

/**
 * A dropped file that is a 存目 backup (the export ZIP, or its JSON) goes to 从文件恢复, not the 豆瓣 sheet,
 * which could only say 「不是豆伴」 about it. Anything unreadable is not one.
 */
export async function isCunmuBackup(f: { name: string; arrayBuffer: () => Promise<ArrayBuffer>; text: () => Promise<string> }): Promise<boolean> {
  try {
    let text: string;
    if (/\.zip$/i.test(f.name)) {
      const files = await readZip(await f.arrayBuffer());
      const j = files.get('cunmu.json') ?? files.get(LEGACY_EXPORT.json);
      if (!j) return false;
      text = new TextDecoder().decode(j);
    } else if (/\.json$/i.test(f.name)) text = await f.text();
    else return false;
    const j = JSON.parse(text) as { format?: unknown; works?: unknown } | null;
    return !!j && isBackupFormat(j.format) && Array.isArray(j.works);
  } catch {
    return false;
  }
}
