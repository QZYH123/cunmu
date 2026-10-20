import type { Quote } from './types';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/**
 * Quotes from a file or an old save, made safe to show: a bare string becomes a quote of that text,
 * an object keeps its known fields when they are strings, anything without text (null, a number,
 * an array, an empty object) is dropped. Never throws; a list that is not a list gives none.
 */
export function normalizeQuotes(raw: unknown): Quote[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' || (raw && typeof raw === 'object') ? [raw] : [];
  const out: Quote[] = [];
  for (const x of list) {
    if (typeof x === 'string') { if (x.trim()) out.push({ text: x.trim(), date: '' }); continue; }
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
    const o = x as Record<string, unknown>;
    const text = str(o.text) || str(o.quote) || str(o.content);
    if (!text) continue;
    const q: Quote = { text, date: str(o.date) };
    if (typeof o.id === 'string' && o.id) q.id = o.id;
    if (o.provider === 'weread' || o.provider === 'weread_paste' || o.provider === 'douban_xlsx') q.provider = o.provider;
    if (typeof o.batchId === 'string') q.batchId = o.batchId;
    const where = str(o.where); if (where) q.where = where;
    const note = str(o.note); if (note) q.note = note;
    if (o.starred === true) q.starred = true;
    out.push(q);
  }
  return out;
}

/** the same for every note of a save: a note whose quotes come out empty loses the key */
export function normalizeNoteQuotes<N extends { quotes?: Quote[] }>(notes: unknown): Record<string, N> {
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return {};
  const out: Record<string, N> = {};
  for (const [id, n] of Object.entries(notes as Record<string, unknown>)) {
    if (!n || typeof n !== 'object' || Array.isArray(n)) continue;
    const m = { ...(n as N) };
    if ('quotes' in m) { const qs = normalizeQuotes(m.quotes); if (qs.length) m.quotes = qs; else delete m.quotes; }
    out[id] = m;
  }
  return out;
}

/**
 * The quote shown under an entry's title: the starred one; else the earliest dated one. An undated quote
 * (a bare string from a file) is never picked on its own — with no starred and no dated quote, none.
 */
export function epigraphOf(quotes: Quote[]): Quote | undefined {
  return quotes.find((q) => q.starred) ?? quotes.filter((q) => !!q.date).sort((a, b) => a.date.localeCompare(b.date))[0];
}

/** same highlight twice: the words and the chapter both match */
export const quoteKey = (q: { text: string; where?: string }) => `${(q.where ?? '').trim()}\u0000${q.text.trim()}`;

/**
 * Highlights not already on the work, and not repeated in this paste. An empty line is dropped.
 * The chapter (`where`) is part of the match: the same words in another chapter stay.
 */
export function freshQuotes(incoming: Quote[], have: Quote[]): Quote[] {
  const seen = new Set(have.map(quoteKey));
  const out: Quote[] = [];
  for (const q of incoming) {
    const text = q.text.trim();
    if (!text) continue;
    const k = quoteKey({ text, where: q.where });
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...q, text });
  }
  return out;
}

/** pasted highlights that were all already here */
export const QUOTES_THERE = '这些摘抄已经在了';
