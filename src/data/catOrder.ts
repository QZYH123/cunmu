import { creatorLine } from './derive';
import type { CatGroup, CatSort, CatSortKey } from './persist';
import type { Work } from './types';
import { letterOf } from '../lib/letters';

const COLLATOR = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

/** Sort value per column; missing values always sort last, whatever the direction. */
export const SORT_VAL: Record<CatSortKey, (w: Work) => string | number | null> = {
  title: (w) => w.title,
  creator: (w) => creatorLine(w) || null,
  genre: (w) => w.genres.filter(Boolean).slice(0, 2).join(' · ') || null,
  year: (w) => w.year ?? null,
  finished: (w) => w.finished || null,
  // r19 minutes played (Steam); works without a time sort last
  playtime: (w) => w.play?.minutes ?? null,
};

export function sortWorksBy(works: Work[], { key, dir }: CatSort): Work[] {
  const f = SORT_VAL[key];
  const sign = dir === 'asc' ? 1 : -1;
  return works.map((w, i) => ({ w, v: f(w), i })).sort((a, b) => {
    if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
    const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : COLLATOR.compare(String(a.v), String(b.v));
    return c ? c * sign : a.i - b.i;   // ties keep the library order (newest first)
  }).map((x) => x.w);
}

/** which groups a work belongs in. 按类型 lists it under every genre, not only the first. */
export function groupKeys(w: Work, group: CatGroup): string[] {
  if (group === 'letter') return [letterOf(w.title)];
  if (group === 'period') return [w.finished.slice(0, 4)];
  if (group === 'genre') {
    const gs = w.genres.filter(Boolean);
    return gs.length ? gs : ['其他'];
  }
  return [''];
}
