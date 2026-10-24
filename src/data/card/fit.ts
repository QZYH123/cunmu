/**
 * What leaves the middle when it will not fit. One step does one thing.
 * n is how many steps have been applied to the original model, not a running edit.
 */
import type { Layout } from './layout';
import type { CardModel } from './model';

export type DropStep = 'periods' | 'periodTail' | 'sentence3' | 'short';

export const DROP_ORDER: Record<Layout, DropStep[]> = {
  A: ['periods', 'sentence3', 'short'],
  B: ['periodTail', 'short'],
  C: ['short'],
};

export const maxDrops = (m: Pick<CardModel, 'layout'>): number => DROP_ORDER[m.layout].length;

/** The same key: a fit pass must not look like a new card. */
export function applyDrops(m: CardModel, n: number): CardModel {
  const steps = DROP_ORDER[m.layout].slice(0, Math.max(0, n));
  let lines = m.lines.map((l) => ({ ...l }));
  let periods = m.periods.map((p) => ({ ...p }));
  for (const step of steps) {
    if (step === 'periods') periods = [];
    else if (step === 'periodTail') { if (periods.length > 2) periods = periods.slice(0, -1); }
    else if (step === 'sentence3') { if (lines.length >= 3) lines = lines.slice(0, 2); }
    else lines = lines.map((l) => ({ ...l, text: l.short ?? l.text }));
  }
  return { ...m, lines, periods };
}

export const DROP_PERIODS = '内容放不下，已先省去时期。';
export const DROP_BOTH = '内容放不下，已先省去时期和第三句。';

/**
 * One grey line under the preview, never on the image.
 * A short-sentence step alone says nothing. Fewer than four favorites says nothing extra.
 */
export function previewNote(drop: number, layout: Layout, notes: readonly CardModel['notes'][number][], people: string, noLines: string): string | null {
  if (drop > 0) {
    const steps = DROP_ORDER[layout].slice(0, drop);
    const lostPeriod = steps.includes('periods') || steps.includes('periodTail');
    const lostThird = steps.includes('sentence3');
    if (lostPeriod && lostThird) return DROP_BOTH;
    if (lostPeriod) return DROP_PERIODS;
  }
  if (notes.includes('peopleLoading')) return people;
  if (notes.includes('noLines')) return noLines;
  return null;
}
