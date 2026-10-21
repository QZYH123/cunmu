import type { Work } from '../data/types';
import { KIND_LABEL } from '../data/types';
import { creatorLine, whenOf } from '../data/derive';

/** what search compares: full-width and half-width forms as one (NFKC), case folded */
export const fold = (s: string) => s.normalize('NFKC').toLowerCase();

/** where the query sits in the text, for the highlight; null when not found, or when folding changed the length
 *  (then the indexes would not line up with what is shown) */
export function hitRange(text: string, q: string): [number, number] | null {
  const ft = fold(text), fq = fold(q.trim());
  if (!fq || ft.length !== text.length) return null;
  const i = ft.indexOf(fq);
  return i < 0 ? null : [i, i + fq.length];
}

/** titles, original titles, and every credit — not only the core ones */
export function worksMatching(term: string, library: readonly Work[]): Work[] {
  const t = fold(term.trim());
  if (!t) return [];
  return library.filter((w) => fold(w.title).includes(t)
    || fold(w.originalTitle ?? '').includes(t)
    || w.credits.some((c) => fold(c.name).includes(t)));
}

/**
 * Why a row matched, when the title itself does not contain the query:
 * the original title, else the credit name (when that name is not already in the title or the original title).
 */
export function hitAside(w: Work, term: string): string | undefined {
  const q = fold(term.trim());
  if (!q || fold(w.title).includes(q)) return undefined;
  const orig = w.originalTitle?.trim() ?? '';
  if (orig && fold(orig).includes(q)) return orig;
  const credit = w.credits.find((c) => fold(c.name).includes(q));
  if (!credit) return undefined;
  const name = credit.name.trim();
  if (!name) return undefined;
  if (fold(w.title).includes(fold(name))) return undefined;
  if (fold(orig).includes(fold(name))) return undefined;
  return name;
}

export function searchMeta(w: Work, term: string, withKind = false): string {
  const who = creatorLine(w);
  const aside = hitAside(w, term);
  return [withKind ? KIND_LABEL[w.kind] : '', who, aside && aside !== who ? aside : '', w.finished && whenOf(w, 'year')].filter(Boolean).join(' · ');
}

/** a search that found nothing */
export const SEARCH_EMPTY = '没有找到相符的条目';
/** the way out of no results: a blank 收录 panel, never prefilled with the search words */
export const ADD_BLANK = '手动收录一部';
