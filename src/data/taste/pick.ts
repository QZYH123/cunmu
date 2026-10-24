/**
 * Engine result + what you saved → the rows a page may show.
 * Switches are per dimension. Your own sentence ignores the engine until you clear it.
 */
import { HINT } from './copy';
import { TEMPLATE_IDS, type Dim, type Sentence, type TastePrefs, type TasteResult, type TemplateId } from './types';

const TIDS = new Set<string>(TEMPLATE_IDS);
const DIM_ORDER: readonly Dim[] = ['long', 'stay', 'met', 'turn'];
/** only dimensions that have sentences in this version can carry the one grey line */
const GRAY: readonly Dim[] = ['long', 'met'];
const FALLBACK: Record<Dim, TemplateId> = { long: 'L1', stay: 'S1', met: 'M2', turn: 'Z1' };

export const DIM_LABEL: Record<Dim, '长情' | '停留' | '常遇见' | '转向'> = {
  long: '长情', stay: '停留', met: '常遇见', turn: '转向',
};

export function fallbackTid(dim: Dim): TemplateId {
  return FALLBACK[dim];
}

export interface ShownRow {
  dim: Dim;
  sentence: Sentence | null;
  own: boolean;
  off: boolean;
  /** other candidates you could switch to; with your own words, every candidate counts */
  others: number;
  hint?: string;
}

function ownSentence(dim: Dim, text: string, pick?: string): Sentence {
  const tid = pick && TIDS.has(pick) ? pick as TemplateId : FALLBACK[dim];
  return { tid, dim, segs: [{ text }], text, evidence: [], nums: 0, slots: {}, variant: 'user', star: false };
}

function gray(dim: Dim, missing: TasteResult['missing']): ShownRow {
  const hint = dim === 'met' && missing.met === 'peopleLoading' ? HINT.people : HINT.more;
  return { dim, sentence: null, own: false, off: false, others: 0, hint };
}

export function resolveRows(result: TasteResult, prefs: TastePrefs, mode: 'own' | 'outward'): ShownRow[] {
  if (!prefs.on) return [];
  if (!result.gate.ok) {
    if (mode === 'outward') return [];
    return [gray('long', result.missing)];
  }
  const built: ShownRow[] = [];
  const missing: Dim[] = [];
  for (const dim of DIM_ORDER) {
    const pref = prefs.rows[dim];
    const cands = result.rows[dim];
    if (pref?.text) {
      built.push({ dim, sentence: ownSentence(dim, pref.text, pref.pick), own: true, off: pref.off === true, others: cands.length });
      continue;
    }
    if (!cands.length) { missing.push(dim); continue; }
    const picked = pref?.pick && TIDS.has(pref.pick) ? cands.find((s) => s.tid === pref.pick) : undefined;
    const sentence = picked ?? cands[0];
    built.push({
      dim, sentence, own: false, off: pref?.off === true, others: Math.max(0, cands.length - 1),
    });
  }
  if (built.length > 0 && built.every((row) => row.off)) {
    if (mode === 'outward') return [];
    return [{ dim: 'long', sentence: null, own: false, off: false, others: 0, hint: HINT.allOff }];
  }
  if (mode === 'outward') return built.filter((row) => !row.off);
  const first = missing.find((dim) => GRAY.includes(dim));
  if (first && !built.some((row) => row.dim === first)) {
    const row = gray(first, result.missing);
    const at = built.findIndex((cur) => DIM_ORDER.indexOf(cur.dim) > DIM_ORDER.indexOf(first));
    if (at < 0) built.push(row);
    else built.splice(at, 0, row);
  }
  return built;
}

/** a 偏爱 row is actually saying something (a grey line or a switched-off row does not count) */
export function showsTasteRow(rows: readonly Pick<ShownRow, 'sentence' | 'off'>[]): boolean {
  return rows.some((row) => row.sentence != null && !row.off);
}

/** the next sentence in this dimension, wrapping; null when there is nothing to switch to */
export function nextTid(cands: readonly { tid: TemplateId }[], current: TemplateId | null): TemplateId | null {
  if (cands.length < 2) return null;
  const i = cands.findIndex((c) => c.tid === current);
  if (i < 0) return cands[0].tid;
  return cands[(i + 1) % cands.length].tid;
}

/** dimensions the edit sheet can show: a sentence, or words you wrote */
export function sheetDims(result: TasteResult, prefs: TastePrefs): Dim[] {
  if (!prefs.on || !result.gate.ok) return [];
  return DIM_ORDER.filter((dim) => {
    if (prefs.rows[dim]?.text) return true;
    return result.rows[dim].length > 0;
  });
}
