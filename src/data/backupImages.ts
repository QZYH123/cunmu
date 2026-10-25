/** JSON in an export holds the records. Pictures the person added live in the ZIP's 图片 folder. */
export const JSON_BACKUP_SAY = '记录在 JSON 里。自己加的图片在同一份 ZIP 的「图片」文件夹里，要一起导回。';

/** Under the three export notes: an older 存目 drops 偏爱 and card settings, and keeps the rest. */
export const EARLIER_RESTORE = '用更早版本的存目恢复这份文件时，偏爱和名片的设置不会带回来，其余内容都在。';

const idOf = (s: unknown): string | null => (typeof s === 'string' && s.startsWith('idb:') ? s.slice(4) : null);

function takeCover(ids: Set<string>, c: unknown) {
  if (!c || typeof c !== 'object') return;
  const o = c as { thumb?: unknown; medium?: unknown };
  for (const s of [o.thumb, o.medium]) {
    const id = idOf(s);
    if (id) ids.add(id);
  }
}

/** `idb:` picture ids a backup points at: work covers, cover overrides, and photos on a note */
export function referencedImageIds(json: unknown): string[] {
  const ids = new Set<string>();
  if (!json || typeof json !== 'object') return [];
  const j = json as { works?: unknown; notes?: unknown };
  if (Array.isArray(j.works)) {
    for (const w of j.works) {
      if (!w || typeof w !== 'object') continue;
      const o = w as { cover?: unknown; images?: { src?: unknown }[] };
      takeCover(ids, o.cover);
      if (Array.isArray(o.images)) for (const im of o.images) {
        const id = idOf(im?.src);
        if (id) ids.add(id);
      }
    }
  }
  if (j.notes && typeof j.notes === 'object' && !Array.isArray(j.notes)) {
    for (const n of Object.values(j.notes as Record<string, unknown>)) {
      if (!n || typeof n !== 'object') continue;
      const o = n as { coverOverride?: unknown; images?: { src?: unknown }[] };
      takeCover(ids, o.coverOverride);
      if (Array.isArray(o.images)) for (const im of o.images) {
        const id = idOf(im?.src);
        if (id) ids.add(id);
      }
    }
  }
  return [...ids];
}

/** ids that are neither in the file nor already on this device */
export function missingImageIds(referenced: readonly string[], inFile: readonly string[], onDevice: readonly string[]): string[] {
  const have = new Set([...inFile, ...onDevice]);
  return referenced.filter((id) => !have.has(id));
}

/** the restore toast: the count, and a warning when some pictures are nowhere to be found */
export function restoreNotice(base: string, missing: boolean): string {
  return missing ? `${base}。有的图片不在这个文件里，封面会空着。` : base;
}
