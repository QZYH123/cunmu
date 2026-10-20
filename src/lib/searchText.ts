import type { Work } from '../data/types';
import { KIND_LABEL } from '../data/types';
import { creatorLine, whenOf } from '../data/derive';

/** titles, original titles, and every credit — not only the core ones */
export function worksMatching(term: string, library: readonly Work[]): Work[] {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  return library.filter((w) => w.title.toLowerCase().includes(t)
    || (w.originalTitle ?? '').toLowerCase().includes(t)
    || w.credits.some((c) => c.name.toLowerCase().includes(t)));
}

/**
 * Why a row matched, when the title itself does not contain the query:
 * the original title, else the credit name (when that name is not already in the title or the original title).
 */
export function hitAside(w: Work, term: string): string | undefined {
  const q = term.trim().toLowerCase();
  if (!q || w.title.toLowerCase().includes(q)) return undefined;
  const orig = w.originalTitle?.trim() ?? '';
  if (orig && orig.toLowerCase().includes(q)) return orig;
  const credit = w.credits.find((c) => c.name.toLowerCase().includes(q));
  if (!credit) return undefined;
  const name = credit.name.trim();
  if (!name) return undefined;
  if (w.title.toLowerCase().includes(name.toLowerCase())) return undefined;
  if (orig.toLowerCase().includes(name.toLowerCase())) return undefined;
  return name;
}

export function searchMeta(w: Work, term: string, withKind = false): string {
  const who = creatorLine(w);
  const aside = hitAside(w, term);
  return [withKind ? KIND_LABEL[w.kind] : '', who, aside && aside !== who ? aside : '', w.finished && whenOf(w, 'year')].filter(Boolean).join(' · ');
}

/** a search that found nothing */
export const SEARCH_EMPTY = '没有叫这个的条目';
