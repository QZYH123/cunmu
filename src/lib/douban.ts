/**
 * 豆瓣备份 (豆伴 / douban-backup .xlsx) → an import plan (TECH-PLAN v0.3 §4.4.1 / §4.4.3).
 * Checked against 豆伴 (tofu 0.12.0) explorer.js `exportInterest`: sheets 看过/在看/想看, 听过/在听/想听,
 * 读过/在读/想读, 玩过/在玩/想玩, 看过的舞台剧/想看的舞台剧; 9 headers 标题 简介 豆瓣评分 链接 创建时间
 * 我的评分 标签 评论 可见性; 简介 = the subject's card_subtitle; 我的评分 = rating.value (1–5, a number
 * cell); 创建时间 = create_time text 「YYYY-MM-DD hh:mm:ss」. Written by SheetJS (t="str" cells).
 * 豆备 (doubak) NDJSON comes in through lib/doubak.ts as the same rows.
 */
import type { Credit, Kind, Work } from '../data/types';
import type { ImportBatch, WorkNote, WorkSourceRow } from '../data/persist';
import type { Sheet } from './xlsx';
import { localDay } from './today';

export interface DoubanRow {
  sid: string; kind: Kind; title: string; subtitle: string; year?: number; stage?: boolean;
  marked: string | null; rating10?: number; comment?: string;
  /** makers already known by name (豆备 has the page's own labels); otherwise read from 简介 */
  credits?: Credit[];
}
export type DoubanError = 'not-backup' | 'unreadable' | 'no-done' | 'need-subjects';

/** done sheets only (想看 / 在看 are never read): 看过 · 读过 · 听过 · 玩过 · 看过的舞台剧 */
const DONE = /看过|读过|听过|玩过/;
const kindOfSheet = (name: string): Kind => (/读过/.test(name) ? 'book' : /听过/.test(name) ? 'music' : /玩过/.test(name) ? 'game' : 'film');

export function parseDouban(sheets: Sheet[]): { rows: DoubanRow[] } | { error: DoubanError } {
  const looksRight = sheets.some((s) => {
    const h = s.rows[0] ?? [];
    return h.includes('标题') && h.includes('链接') && h.includes('创建时间');
  });
  if (!looksRight) return { error: 'not-backup' };
  const rows = new Map<string, DoubanRow>();
  for (const s of sheets) {
    if (!DONE.test(s.name)) continue;
    const h = s.rows[0] ?? [];
    const col = (k: string) => h.indexOf(k);
    const [cT, cS, cL, cC, cR, cM] = ['标题', '简介', '链接', '创建时间', '我的评分', '评论'].map(col);
    if (cT < 0 || cL < 0) continue;
    for (const r of s.rows.slice(1)) {
      const title = (r[cT] ?? '').trim();
      const link = r[cL] ?? '';
      if (!title && !link) continue;
      const sid = link.match(/\/(?:subject|game|drama)\/(\d+)/)?.[1] ?? `h${hashStr(title + (r[cS] ?? ''))}`;
      const subtitle = (cS >= 0 ? r[cS] : '') ?? '';
      const y = subtitle.match(/(1[89]\d\d|20\d\d)/)?.[1];
      const when = (cC >= 0 ? r[cC] : '')?.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
      const stars = Number((cR >= 0 ? r[cR] : '') || 0);
      const row: DoubanRow = {
        sid, kind: kindOfSheet(s.name), title, subtitle, year: y ? Number(y) : undefined, ...(/舞台剧/.test(s.name) ? { stage: true } : null),
        marked: when ? `${when[1]}-${when[2].padStart(2, '0')}-${when[3].padStart(2, '0')}` : null,
        ...(stars >= 1 && stars <= 5 ? { rating10: stars * 2 } : null),
        ...(cM >= 0 && r[cM]?.trim() ? { comment: r[cM].trim() } : null),
      };
      // the same subject twice (shouldn't happen): keep the earlier mark
      const had = rows.get(sid);
      if (!had || (row.marked && had.marked && row.marked < had.marked)) rows.set(sid, row);
    }
  }
  if (!rows.size) return { error: 'no-done' };
  return { rows: [...rows.values()] };
}

/**
 * The core creator named in 简介 — its layout is the backup tool's, per sheet: 书「作者 / 出版社 / 年」, 影视
 * 「年 / 地区 / 类型 / 导演 / 主演」, 舞台剧「导演 / 编剧 / 年」, 音乐「艺人 / 年 / …」, 游戏「日期 / 开发 / 类型」.
 * Only what reads as a name is kept (no years, no publishers); 「[日] 」 style prefixes go.
 */
/** a name as written, without 「[日] 」 style prefixes; '' when it doesn't read as a name */
export function cleanName(x?: string) {
  const n = (x ?? '').replace(/^[[［(（【][^\]］)）】]*[\]］)）】]\s*/, '').trim();
  return n && n.length <= 24 && !/\d{4}|出版|书店|书局|文库|Press|CD|专辑|EP/i.test(n) ? n : '';
}

export function creditsOf(r: Pick<DoubanRow, 'kind' | 'subtitle' | 'stage' | 'credits'>): Credit[] {
  if (r.credits) return r.credits;
  const segs = r.subtitle.split(/\s+\/\s+/).map((x) => x.trim()).filter(Boolean);
  const dated = (x?: string) => !!x && /^\d{4}/.test(x);
  const name = cleanName;
  const one = (x: string | undefined, role: string): Credit[] => { const n = name(x); return n ? [{ name: n, role, core: true }] : []; };
  if (r.kind === 'book') return one(segs[0], '作者');
  if (r.kind === 'music') return one(segs[0], '艺术家');
  if (r.kind === 'game') return one(dated(segs[0]) ? segs[1] : segs[0], '开发');
  if (r.stage) return one(segs[0], '导演');
  // 影视: the director sits after year, region and genres; several directors are space-separated
  const d = dated(segs[0]) ? segs[3] : undefined;
  return (d ?? '').split(/\s+/).slice(0, 2).flatMap((x) => one(x, '导演'));
}

function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
export const normTitle = (t: string) => t.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const sameShelf = (a: Kind, b: Kind) => a === b || (a === 'film' && b === 'anime');

export interface DoubanPlan {
  fresh: DoubanRow[];
  /** sure duplicates (title + year ± 1 + a core creator in 简介): merged, never shown as a question */
  merge: { row: DoubanRow; into: Work }[];
  /** unsure ones: kept apart, asked about only at the bottom of the entry (「可能是同一部」) */
  maybe: { row: DoubanRow; like: Work }[];
  /** already here from an earlier import, or taken out by you */
  skipped: DoubanRow[];
  byKind: Map<Kind, number>;
}

export function planDouban(rows: DoubanRow[], library: Work[], known: Set<string>, removed: Record<string, string>): DoubanPlan {
  const plan: DoubanPlan = { fresh: [], merge: [], maybe: [], skipped: [], byKind: new Map() };
  const byTitle = new Map<string, Work[]>();
  for (const w of library) if (!w.isSample && w.kind !== 'essay') {
    const k = normTitle(w.title);
    byTitle.set(k, [...(byTitle.get(k) ?? []), w]);
  }
  const taken = new Set<string>();
  for (const r of rows) {
    if (known.has(r.sid) || removed[`db-${r.sid}`]) { plan.skipped.push(r); continue; }
    const cands = (byTitle.get(normTitle(r.title)) ?? []).filter((w) => sameShelf(r.kind, w.kind));
    const sure = cands.find((w) => r.year && w.year && Math.abs(r.year - w.year) <= 1
      && w.credits.some((c) => c.core && c.name.length >= 2 && (r.subtitle.includes(c.name) || !!r.credits?.some((x) => x.name === c.name))));
    // one row per work you had: a second edition that also matches comes in on its own and is asked about,
    // so its mark and words are not written over by the first one's
    if (sure && !taken.has(sure.id)) { taken.add(sure.id); plan.merge.push({ row: r, into: sure }); continue; }
    plan.fresh.push(r);
    plan.byKind.set(r.kind, (plan.byKind.get(r.kind) ?? 0) + 1);
    if (sure) plan.maybe.push({ row: r, like: sure });
    else if (cands.length) plan.maybe.push({ row: r, like: cands[0] });
  }
  return plan;
}

/** turn a plan into what the store writes: new works, source rows on merged works, your notes, the batch */
export function buildDoubanImport(plan: DoubanPlan, notesNow: Record<string, WorkNote>, at: string, label: string) {
  const batchId = `b-db-${Date.now().toString(36)}`;
  const claim = (r: DoubanRow) => (r.marked
    ? [{ source: 'douban_marked' as const, value: r.marked, precision: 'day' as const, baseLevel: 2 as const, batchId, observedAt: at }]
    : []);
  const created: Work[] = plan.fresh.map((r) => ({
    id: `db-${r.sid}`, kind: r.kind, title: r.title || '豆瓣上没有了的条目', credits: creditsOf(r), year: r.year,
    finished: '', collected: localDay(at), source: 'douban', cover: null, genres: [], info: [],
    srcSubtitle: r.subtitle || undefined,
    sources: [{ provider: 'douban_xlsx', externalId: r.sid, batchId, firstSeenAt: at }], claims: claim(r),
  }));
  const rows: WorkSourceRow[] = plan.merge.map(({ row, into }) => ({
    workId: into.id, provider: 'douban_xlsx', externalId: row.sid, batchId, firstSeenAt: at, claim: claim(row)[0],
    payload: { title: row.title, year: row.year, subtitle: row.subtitle },
  }));
  const notes: Record<string, WorkNote> = {};
  const appended: Record<string, string> = {};
  for (const r of plan.fresh) {
    if (!r.rating10 && !r.comment) continue;
    notes[`db-${r.sid}`] = {
      ...(r.rating10 ? { rating10: r.rating10 } : null), ...(r.comment ? { review: [r.comment] } : null),
      fieldBatch: { ...(r.rating10 ? { rating10: batchId } : null), ...(r.comment ? { review: batchId } : null) },
    };
  }
  for (const { row, into } of plan.merge) {
    const n: WorkNote = {};
    const have = notesNow[into.id];
    if (row.rating10 && !have?.rating10 && !into.rating10) { n.rating10 = row.rating10; n.fieldBatch = { rating10: batchId }; }
    if (row.comment) {
      const before = have?.review ?? into.review ?? [];
      if (before.length) {
        // decided: a 豆瓣 short review is appended to the one you have, marked as such
        const p = `${row.comment}（来自豆瓣）`;
        n.review = [...before, p];
        appended[into.id] = p;
      } else { n.review = [row.comment]; n.fieldBatch = { ...n.fieldBatch, review: batchId }; }
    }
    if (Object.keys(n).length) notes[into.id] = n;
  }
  const batch: ImportBatch = {
    id: batchId, provider: 'douban_xlsx', label, createdAt: at,
    created: created.map((w) => w.id), merged: plan.merge.map((m) => m.into.id), skipped: plan.skipped.map((r) => `db-${r.sid}`),
    quoteIds: [], ...(Object.keys(appended).length ? { appended } : null),
  };
  const maybe = plan.maybe.map((m) => ({ a: `db-${m.row.sid}`, b: m.like.id, batchId }));
  return { batch, created, rows, notes, maybe };
}
