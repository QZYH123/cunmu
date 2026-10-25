/**
 * The card as data. Pure: no DOM, and no owner-only lists.
 * Everything visible comes from an outward view. A caller's own sentence is kept
 * only once the record is far enough along for a guest to be shown one.
 */
import { creatorLine } from '../derive';
import { homeLead, plain } from '../lead';
import { periodMembers, type Period } from '../me';
import { KIND_ASPECT } from '../types';
import type { Work } from '../types';
import { pickHeadline } from '../taste/headline';
import { DIM_LABEL, fallbackTid, resolveRows, type ShownRow } from '../taste/pick';
import { toTasteWorks } from '../taste/facts';
import type { CardPrefs, Dim, Evidence, Sentence, TastePrefs, TasteResult, TemplateId } from '../taste/types';
import type { OutwardView } from '../visible';
import { autoLayout, type Layout } from './layout';

export type { Layout };

export interface CardLine {
  dim: Dim;
  tid: TemplateId;
  label: '长情' | '停留' | '常遇见' | '转向';
  text: string;
  short?: string;
  names?: string[];
  own: boolean;
}

export interface CardPeriod { id: string; text: string }

export interface CardFav {
  workId: string;
  title: string;
  author?: string;
  cover: string | null;
  aspect: number;
  kind: Exclude<Work['kind'], 'essay'>;
  why?: string;
}

/** Choices that live on the card page and are not saved. */
export interface CardPicks {
  hide: TemplateId[];
  swap: Partial<Record<Dim, TemplateId>>;
  favs?: string[];
  literal: string[];
}

export interface CardModel {
  layout: Layout;
  theme: 'light' | 'dark';
  top: { since: number | null; byline: string | null; total: number | null };
  headline: string | null;
  lines: CardLine[];
  lead: string | null;
  periods: CardPeriod[];
  favs: CardFav[];
  badge: { name: '存目'; version: string; month: string } | null;
  notes: Array<'peopleLoading' | 'fewFavs' | 'noLines'>;
  key: string;
}

export const CARD_MODEL_KEYS = ['layout', 'theme', 'top', 'headline', 'lines', 'lead', 'periods', 'favs', 'badge', 'notes', 'key'] as const;

/** A card wants three works a guest can see, not counting one still in progress. */
export const CARD_MIN_WORKS = 3;

export function cardWorkCount(works: readonly { status?: string }[]): number {
  return works.filter((w) => w.status !== 'doing').length;
}

/** 「2026 年 10 月」 — the month is not padded. */
export function badgeMonth(today: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(today);
  if (!m) return '';
  return `${m[1]} 年 ${Number(m[2])} 月`;
}

const CARD_ORDER: readonly Dim[] = ['met', 'long', 'turn'];
const EMPTY_PICKS: CardPicks = { hide: [], swap: {}, literal: [] };

export interface CardInput {
  view: OutwardView;
  taste: TasteResult;
  prefs: TastePrefs;
  card: CardPrefs;
  /** the library's name, already trimmed; empty when it has none */
  title: string;
  /** the line under the name, already trimmed */
  line: string;
  today: string;
  version: string;
  picks?: CardPicks;
}

function lineOf(row: ShownRow, sentence: Sentence, hide: readonly TemplateId[]): CardLine | null {
  if (hide.includes(sentence.tid)) return null;
  return {
    dim: row.dim,
    tid: sentence.tid,
    label: DIM_LABEL[row.dim],
    text: sentence.text,
    ...(sentence.short ? { short: sentence.short } : null),
    ...(sentence.names?.length ? { names: sentence.names } : null),
    own: row.own,
  };
}

function sentenceFor(row: ShownRow, taste: TasteResult, picks: CardPicks): Sentence | null {
  if (!row.sentence) return null;
  if (row.own) return row.sentence;
  const swap = picks.swap[row.dim];
  if (!swap) return row.sentence;
  return taste.rows[row.dim].find((s) => s.tid === swap) ?? row.sentence;
}

/** met, then long, then turn. A missing or switched-off turn is the only slot stay may fill. */
function cardLines(taste: TasteResult, prefs: TastePrefs, picks: CardPicks): CardLine[] {
  if (!prefs.on || !taste.gate.ok) return [];
  const byDim = new Map(resolveRows(taste, prefs, 'outward').map((row) => [row.dim, row]));
  const lines: CardLine[] = [];
  for (const dim of CARD_ORDER) {
    const row = byDim.get(dim);
    if (!row) continue;
    const sentence = sentenceFor(row, taste, picks);
    if (!sentence) continue;
    const line = lineOf(row, sentence, picks.hide);
    if (line) lines.push(line);
  }
  const turn = prefs.rows.turn;
  const turnMissing = !turn?.text && taste.rows.turn.length === 0;
  const turnHidden = turn?.off === true;
  if ((turnMissing || turnHidden) && !lines.some((l) => l.dim === 'turn')) {
    const stay = byDim.get('stay');
    if (stay) {
      const sentence = sentenceFor(stay, taste, picks);
      if (sentence) {
        const line = lineOf(stay, sentence, picks.hide);
        if (line) lines.push(line);
      }
    }
  }
  return lines.slice(0, 3);
}

function yearOf(d: string): number | null {
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

function hollowSpan(taste: TasteResult): { from: number; to: number } | null {
  const from = taste.hollow?.slots.from;
  const to = taste.hollow?.slots.to;
  if (typeof from !== 'number' || typeof to !== 'number') return null;
  return { from, to };
}

function insideHollow(p: Period, span: { from: number; to: number } | null, today: string): boolean {
  if (!span) return false;
  const y0 = yearOf(p.from);
  const y1 = p.to ? yearOf(p.to) : yearOf(today);
  if (y0 == null || y1 == null) return false;
  return y0 >= span.from && y1 <= span.to;
}

function periodText(p: Period, n: number): string {
  const y0 = yearOf(p.from);
  const y1 = p.to ? yearOf(p.to) : y0;
  const when = y0 != null && y1 != null && p.to && y1 !== y0 ? `${y0}\u2013${y1}` : `${y0 ?? ''}`;
  return `${when} · ${p.name} · ${n} 部`;
}

function cardPeriods(view: OutwardView, taste: TasteResult, today: string): { shown: CardPeriod[]; eligible: number } {
  const span = hollowSpan(taste);
  const ranked = view.periods.filter((p) => p.name.trim() && !insideHollow(p, span, today)).map((p) => ({
    p, n: periodMembers(p, view.works, today).length,
  })).filter((x) => x.n > 0);
  ranked.sort((a, b) => b.n - a.n || (a.p.from < b.p.from ? -1 : a.p.from > b.p.from ? 1 : a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0));
  if (ranked.length < 2) return { shown: [], eligible: ranked.length };
  const picked = ranked.slice(0, 2).map((x) => x.p);
  picked.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
  const count = new Map(ranked.map((x) => [x.p.id, x.n]));
  return {
    eligible: ranked.length,
    shown: picked.map((p) => ({ id: p.id, text: periodText(p, count.get(p.id) ?? 0) })),
  };
}

function firstSentence(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const i = t.indexOf('。');
  return i < 0 ? t : t.slice(0, i + 1);
}

/** M2 is `name n 部` joined by ` · `. Take out the people a headline already named. */
function listWithout(line: CardLine, drop: ReadonlySet<string>): CardLine | null {
  const keep = (line.names ?? []).filter((name) => name && !drop.has(name));
  if (!keep.length) return null;
  const take = (text: string): string | null => {
    const parts = text.split(' · ').filter((part) => keep.some((name) => part === name || part.startsWith(`${name} `)));
    return parts.length === keep.length ? parts.join(' · ') : null;
  };
  const text = take(line.text);
  if (text == null) return null;
  const short = line.short == null ? undefined : take(line.short) ?? undefined;
  return {
    dim: line.dim,
    tid: line.tid,
    label: line.label,
    text,
    ...(short ? { short } : null),
    names: keep,
    own: line.own,
  };
}

/**
 * A guest headline that repeats a kept sentence leaves that sentence out.
 * H2 is built from M3, so the same person can still sit in the default M2 list:
 * those names leave the list, and a sentence that is only about them leaves too.
 * Words you wrote stay.
 */
function linesBeside(lines: CardLine[], head: Sentence): CardLine[] {
  const drop = new Set(head.names ?? []);
  const out: CardLine[] = [];
  for (const line of lines) {
    if (line.own) { out.push(line); continue; }
    if (line.tid === head.tid && line.dim === head.dim) continue;
    const shared = drop.size > 0 && line.names?.some((name) => drop.has(name));
    if (!shared) { out.push(line); continue; }
    if (line.tid === 'M2') {
      const next = listWithout(line, drop);
      if (next) out.push(next);
    }
  }
  return out;
}

function cardKey(m: Omit<CardModel, 'key'>): string {
  return [
    m.layout,
    m.theme,
    m.top.since ?? '',
    m.top.byline ?? '',
    m.top.total ?? '',
    m.headline ?? '',
    m.lines.map((l) => `${l.tid}:${l.text}:${l.short ?? ''}`).join('|'),
    m.periods.map((p) => p.id).join('|'),
    m.favs.map((f) => f.workId).join('|'),
    m.badge ? `${m.badge.version}:${m.badge.month}` : '',
  ].join('~');
}

export function buildCardModel(o: CardInput): CardModel {
  const picks = o.picks ?? EMPTY_PICKS;
  const hide = picks.hide;
  let lines = cardLines(o.taste, o.prefs, { ...picks, hide });
  // 偏爱 and 转向 decide the arrangement before a headline takes one of them off the card
  const tasteLines = lines.length;
  const shown: ShownRow[] = lines.map((line) => ({
    dim: line.dim,
    sentence: line.own
      ? { tid: line.tid, dim: line.dim, segs: [{ text: line.text }], text: line.text, evidence: [], nums: 0, slots: {}, variant: 'user', star: false }
      : (o.taste.rows[line.dim].find((s) => s.tid === line.tid) ?? null),
    own: line.own,
    off: false,
    others: 0,
  }));
  const head = pickHeadline(o.taste, shown, o.line);
  if (head && head.variant !== 'user') lines = linesBeside(lines, head);

  const { shown: periods, eligible } = cardPeriods(o.view, o.taste, o.today);
  const byId = new Map(o.view.works.map((w) => [w.id, w]));
  const whyOf = new Map(o.view.favorites.map((f) => [f.id, f.why]));
  const literal = new Set(picks.literal);
  const ids = (picks.favs
    ? picks.favs.filter((id) => byId.has(id)).slice(0, 6)
    : o.view.favorites.map((f) => f.id).filter((id) => byId.has(id)).slice(0, 5));
  const favs: CardFav[] = [];
  for (const id of ids) {
    const w = byId.get(id);
    if (!w || w.kind === 'essay') continue;
    const author = creatorLine(w);
    favs.push({
      workId: id,
      title: w.title,
      ...(author ? { author } : null),
      cover: literal.has(id) ? null : (w.cover?.thumb ?? null),
      aspect: w.cover?.aspect ?? KIND_ASPECT[w.kind],
      kind: w.kind,
      ...(ids.length === 1 && whyOf.get(id) ? { why: whyOf.get(id) } : null),
    });
  }

  let since: number | null = null;
  for (const w of toTasteWorks(o.view.works, o.today)) {
    if (w.year == null || w.trust === 'lastPlayed') continue;
    if (since == null || w.year < since) since = w.year;
  }
  const counted = cardWorkCount(o.view.works);
  const total = o.card.total === true || (o.card.total == null && counted >= 100) ? counted : null;
  const title = o.title.trim();
  const byline = o.card.byline && title ? Array.from(title).slice(0, 12).join('') : null;

  const lead = o.prefs.on && lines.length === 0
    ? firstSentence(plain(homeLead({
      name: '', works: o.view.works, interests: o.view.interests, periods: o.view.periods, today: o.today, skipOften: true,
    })))
    : null;

  const notes: CardModel['notes'] = [];
  if (o.taste.missing.met === 'peopleLoading' && !lines.some((l) => l.dim === 'met')) notes.push('peopleLoading');
  if (favs.length < 4) notes.push('fewFavs');
  if (o.prefs.on && lines.length === 0) notes.push('noLines');

  const draft: Omit<CardModel, 'key'> = {
    layout: o.card.layout ?? autoLayout(tasteLines, eligible),
    theme: o.card.theme,
    top: { since, byline, total },
    headline: head?.text ?? null,
    lines,
    lead,
    periods,
    favs,
    badge: o.card.badge ? { name: '存目', version: o.version, month: badgeMonth(o.today) } : null,
    notes,
  };
  return { ...draft, key: cardKey(draft) };
}

export { fallbackTid };
export type { Evidence };
