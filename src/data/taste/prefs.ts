/**
 * What you chose about 偏爱 and the card. Pure and idempotent, same idea as fixMe.
 * Unknown keys are dropped. Your sentence is trimmed and cut at 80 characters.
 */
import { DIMS, TEMPLATE_IDS, type CardPrefs, type Dim, type RowPref, type TastePrefs, type TemplateId } from './types';

export type { CardPrefs, TastePrefs };

const TIDS = new Set<string>(TEMPLATE_IDS);

export const EMPTY_TASTE: TastePrefs = { on: true, rows: {} };
export const EMPTY_CARD: CardPrefs = { theme: 'light', byline: false, badge: true };

export function fixTaste(v: unknown): TastePrefs {
  const t = v && typeof v === 'object' ? v as Record<string, unknown> : {};
  const on = typeof t.on === 'boolean' ? t.on : true;
  const src = t.rows && typeof t.rows === 'object' && !Array.isArray(t.rows) ? t.rows as Record<string, unknown> : {};
  const rows: TastePrefs['rows'] = {};
  for (const dim of DIMS) {
    const raw = src[dim];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const pref: RowPref = {};
    if (r.off === true) pref.off = true;
    if (typeof r.pick === 'string' && TIDS.has(r.pick)) pref.pick = r.pick as TemplateId;
    if (typeof r.text === 'string') {
      const text = Array.from(r.text.trim()).slice(0, 80).join('');
      if (text) pref.text = text;
    }
    if (pref.off || pref.pick || pref.text) rows[dim as Dim] = pref;
  }
  return { on, rows };
}

export function fixCard(v: unknown): CardPrefs {
  const c = v && typeof v === 'object' ? v as Record<string, unknown> : {};
  const card: CardPrefs = {
    theme: c.theme === 'dark' ? 'dark' : 'light',
    byline: c.byline === true,
    badge: c.badge !== false,
  };
  if (c.layout === 'A' || c.layout === 'B' || c.layout === 'C') card.layout = c.layout;
  if (typeof c.total === 'boolean') card.total = c.total;
  return card;
}
