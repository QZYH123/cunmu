/**
 * 豆备 (doubak) canonical v1 → the same rows as a 豆伴 table (lib/douban.ts), so planning, merging and undo
 * are shared. Two files: marks.ndjson (what you marked) and subjects.ndjson (the works' names and makers).
 * Shapes: doubak-data-specs canonical/v1 mark.schema.json / subject.schema.json — the newest revision of
 * each record counts; only `done` marks come in; unknown media are left out, never guessed.
 */
import type { Credit, Kind } from '../data/types';
import type { DoubanError, DoubanRow } from './douban';
import { cleanName } from './douban';

interface Rev { fields?: Record<string, unknown> }
interface Mark { medium?: string; subject?: { id?: string; upstream_deleted?: boolean }; revisions?: Rev[] }
interface Subject { id?: string; upstream_deleted?: boolean; revisions?: Rev[] }

const KIND: Record<string, { kind: Kind; stage?: true }> = {
  movie: { kind: 'film' }, tv: { kind: 'film' }, book: { kind: 'book' }, music: { kind: 'music' }, game: { kind: 'game' },
  performance: { kind: 'film', stage: true },
};
/** which of the page's own labels name the core maker, per medium (first one present) */
const MAKER: Record<string, [string, string][]> = {
  movie: [['导演', '导演']], tv: [['导演', '导演']], performance: [['导演', '导演'], ['编剧', '编剧']],
  book: [['作者', '作者']], music: [['表演者', '艺术家']], game: [['开发商', '开发'], ['发行商', '发行']],
};
const DATE_KEYS = ['上映日期', '首播', '出版年', '发行时间', '发行日期', '首演日期', '首演时间'];
const DAYISH = new Set(['second', 'minute', 'hour', 'day']);

const lines = (text: string) => text.split(/\r?\n/).filter((l) => l.trim()).map((l) => { try { return JSON.parse(l) as unknown; } catch { return null; } });
const latest = (r: { revisions?: Rev[] }) => r.revisions?.[r.revisions.length - 1]?.fields ?? {};
const str = (v: unknown) => (typeof v === 'string' ? v : '');


export function parseDoubak(marksText: string, subjectsText: string | null): { rows: DoubanRow[] } | { error: DoubanError } {
  const marks = lines(marksText).filter((m): m is Mark => !!m && typeof m === 'object' && Array.isArray((m as Mark).revisions) && !!(m as Mark).subject?.id);
  if (!marks.length) return { error: 'not-backup' };
  if (!subjectsText) return { error: 'need-subjects' };
  const subjects = new Map<string, Subject>();
  for (const s of lines(subjectsText) as Subject[]) if (s && typeof s === 'object' && s.id) subjects.set(String(s.id), s);
  const rows = new Map<string, DoubanRow>();
  for (const m of marks) {
    const f = latest(m);
    if (f.status !== 'done') continue;
    const k = KIND[m.medium ?? ''];
    if (!k) continue;
    const sid = String(m.subject!.id);
    const s = subjects.get(sid);
    const sf = s ? latest(s) : {};
    const gone = !!(m.subject!.upstream_deleted || s?.upstream_deleted);
    const info = (sf.info && typeof sf.info === 'object' ? sf.info : {}) as Record<string, string[]>;
    const raw = str(f.raw_meta) || str(sf.raw_meta);
    const dated = DATE_KEYS.map((key) => info[key]?.[0]).find(Boolean) ?? raw;
    const y = dated.match(/(1[89]\d\d|20\d\d)/)?.[1];
    const credits: Credit[] = [];
    for (const [key, role] of MAKER[m.medium!] ?? []) {
      const names = (info[key] ?? []).map(cleanName).filter(Boolean).slice(0, 2);
      if (names.length) { credits.push(...names.map((name) => ({ name, role, core: true }))); break; }
    }
    const when = f.marked_at as { iso?: string | null; precision?: string } | null | undefined;
    const marked = when?.iso && DAYISH.has(when.precision ?? '') ? when.iso.slice(0, 10) : null;
    const stars = typeof f.rating === 'number' ? f.rating : 0;
    const comment = str(f.comment).trim();
    rows.set(sid, {
      sid, kind: k.kind, title: gone ? '' : str(sf.title).trim(), subtitle: raw, year: y ? Number(y) : undefined,
      ...(k.stage ? { stage: true } : null), marked,
      ...(stars >= 1 && stars <= 5 ? { rating10: stars * 2 } : null),
      ...(comment ? { comment } : null), credits,
    });
  }
  if (!rows.size) return { error: 'no-done' };
  return { rows: [...rows.values()] };
}
