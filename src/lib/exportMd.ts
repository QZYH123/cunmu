import type { Work } from '../data/types';
import { KIND_LABEL, SOURCE_LABEL } from '../data/types';
import type { CunmuExport } from '../data/store';
import { exportFileName } from './naming';
import { creatorLine, whenOf } from '../data/derive';
import { todayISO } from './today';
import { getImage } from './images';
import { makeZip, type ZipFile } from './zip';
import { DUR } from '../tokens';
import { referencedImageIds } from '../data/backupImages';

const imgPath = (src: string) => `图片/${src.replace(/^idb:/, '')}.jpg`;

/** one work or essay as a Markdown file anyone can open without the app */
export function workMarkdown(w: Work, essayPhoto?: string): string {
  const out: string[] = [w.kind === 'essay' ? `# ${w.title || '无题'}` : `# 《${w.title}》`];
  const meta = [KIND_LABEL[w.kind], creatorLine(w), w.year ? String(w.year) : '', `${w.kind === 'essay' ? '写于' : w.kind === 'music' ? '听过' : w.kind === 'game' ? '玩过' : '看完'} ${whenOf(w)}`, w.kind === 'essay' ? '' : SOURCE_LABEL[w.source]].filter(Boolean);
  out.push('', meta.join(' · '), '');
  if (w.originalTitle) out.push(`原名：${w.originalTitle}`, '');
  if (essayPhoto) out.push(`![](../${imgPath(essayPhoto)})`, '');
  for (const p of w.body ?? []) out.push(p, '');
  if (w.review?.length || w.images?.length) {
    out.push('## 短评', '');
    for (const p of w.review ?? []) out.push(p, '');
    for (const im of w.images ?? []) out.push(`![](../${imgPath(im.src)})`, '');
  }
  if (w.quotes?.length) {
    out.push('## 摘抄', '');
    for (const q of w.quotes) out.push(`> ${q.text}`, `> —— ${[q.where, q.date].filter(Boolean).join(' · ')}`, '');
  }
  return out.join('\n');
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/**
 * 导出全部内容 (方案 v0.6 §6.8, STYLE v0.4 §3.18.1; decided: your own pictures go in, covers never):
 * Cunmu-{名字}-YYYY-MM-DD.zip (exportFileName; no name: Cunmu-YYYY-MM-DD.zip) = cunmu.json + Markdown/ (one file per work and essay) + 图片/.
 */
export async function buildExportZip(works: Work[], backup: CunmuExport, essayPhotos: Record<string, string>, title?: string): Promise<{ blob: Blob; name: string; count: number }> {
  const files: ZipFile[] = [{ name: 'cunmu.json', data: JSON.stringify(backup, null, 2) }];
  const used = new Set<string>();
  const pics = new Set<string>();
  for (const w of works) {
    let base = w.kind === 'essay' && !w.title ? `无题-${(w.collected || todayISO()).slice(0, 10)}` : safeName(w.title) || w.id;
    if (used.has(base)) { let i = 2; while (used.has(`${base} (${i})`)) i++; base = `${base} (${i})`; }
    used.add(base);
    const photo = essayPhotos[w.id];
    files.push({ name: `Markdown/${base}.md`, data: workMarkdown(w, photo) });
    if (photo) pics.add(photo);
    for (const im of w.images ?? []) pics.add(im.src);
  }
  for (const src of exportPictures(pics, backup)) {
    const b = await getImage(src.slice(4));
    if (b) files.push({ name: imgPath(src), data: new Uint8Array(await b.arrayBuffer()) });
  }
  return { blob: makeZip(files), name: exportFileName(title, todayISO()), count: works.length };
}

/** every 'idb:' picture the ZIP should carry: the ones the Markdown shows, and every one cunmu.json points at
 *  (a removed work's, a 在看 work's note) so a restore elsewhere finds them all */
export function exportPictures(shown: Iterable<string>, backup: unknown): string[] {
  const all = new Set([...shown].filter((s) => s.startsWith('idb:')));
  for (const id of referencedImageIds(backup)) all.add(`idb:${id}`);
  return [...all];
}

/** hands the file to the browser (the app hands it to the system share / save sheet) */
export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), DUR.toast);
}
