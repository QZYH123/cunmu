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
