import type { Kind } from '../data/types';

/**
 * The collection's name (VOICE v0.1 §3): the masthead, the home window title, the export file.
 * The product is always 存目 (Cunmu in Latin); the collection carries no coined name — it is the owner's own name or a
 * title they choose, and until then the plain 「我看过的」. (Metaphor stays in the design, never in names.)
 */
export const DEFAULT_TITLE = '我看过的';
/** the same words in every search field */
export const SEARCH_PLACEHOLDER = '书名、人名、年份、随笔';
export const TITLE_MAX = 12;
export const titleOf = (t?: string | null) => (t ?? '').trim() || DEFAULT_TITLE;
/** what goes into a file name: no path or reserved characters */
export const fileTitle = (t?: string | null) => (t ?? '').trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
/**
 * 导出全部内容's file (方案 v0.7 §3.18, replacing STYLE v0.4 §3.18.1's 「Cunmu-我的百科-…」): Cunmu, the name you
 * gave it, the day — 「Cunmu-沈舟-2026-10-11.zip」; with no name, 「Cunmu-2026-10-11.zip」.
 */
export const exportFileName = (title: string | null | undefined, day: string) => `${['Cunmu', fileTitle(title), day].filter(Boolean).join('-')}.zip`;

/** the masthead's plain caption: what was done, by kind present, then the span — 「读过、看过、玩过 · 2019—2026」 */
const VERB: [Kind[], string][] = [[['book'], '读过'], [['anime', 'film'], '看过'], [['music'], '听过'], [['game'], '玩过'], [['essay'], '写过']];
export function captionOf(counts: Map<Kind, number>, years: number[]) {
  const verbs = VERB.filter(([ks]) => ks.some((k) => (counts.get(k) ?? 0) > 0)).map(([, v]) => v).join('、');
  const lo = Math.min(...years), hi = Math.max(...years);
  const span = years.length ? (lo === hi ? `${lo}` : `${lo}—${hi}`) : '';
  return [verbs, span].filter(Boolean).join(' · ');
}
