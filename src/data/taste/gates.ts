/**
 * How many is enough. The numbers come from the product plan; a few guards the product
 * left open (a recorded year, a clump of hand-added works, how alike two topics may be)
 * live here too, so a calc does not bury them.
 */
import type { Dim, TemplateId } from './types';

export const GATES = {
  total: { trustedWorks: 12 },
  topic: { minWorks: 6, maxShare: 0.5, minYears: 3 },
  L1: { minWorks: 6, minYears: 5, tailShorter: 3, overlap: 0.6 },
  L2: { minWorks: 6, gapYears: 3, sideMinWorks: 2 },
  L3: { minYears: 5, lead: 1 },
  L4: { minWorks: 6, spanYears: 3 },
  L5: { spanYears: 6, maxMissing: 2 },
  L6: { madeShare: 0.7, spanYears: 20 },
  L7: { minWorks: 6, spanYears: 6 },
  S1: { minGames: 3, hours: 100, minCount: 2 },
  S2: { hours: 300 },
  S3: { totalHours: 500 },
  S4: { minGames: 6, share: 0.7 },
  S5: { minGames: 6, ratio: 0.25, maxEvery: 4 },
  S6: { minBoth: 30, sameYearShare: 0.4 },
  M: { minWorks: 3, minYears: 2, peopleReady: 0.8 },
  M3: { minWorks: 4, spanYears: 5 },
  M4: { minWorks: 4, minYears: 4, avgGap: 2.5 },
  M5: { minKinds: 2, minWorks: 3 },
  M6: { minTotal: 100, minPeople: 3, perPersonWorks: 4, maxPeople: 12 },
  Z: { sideMin: 12, earlySpan: 3, lateSpan: 2, topShare: 0.45, newcomerMax: 0.25 },
  Z2: { minMembers: 10, shortPeriodMonths: 3 },
  Z3: { lateByYears: 3, followYears: 3, perYear: 2 },
  Z4: { minWorks: 6, side: 0.85, sideYears: 3 },
  Z5: { minYears: 4, minWorks: 20, over: 1.3, kindShare: 0.45 },
  Z6: { leadYears: 3, backYears: 2, perYear: 3 },
  Z7: { gapYears: 3, ratio: 0.1 },
  ev: { max: 6 },
  numbers: { max: 3 },
  /** a year counts as "you were recording" at this many trusted works */
  recordedYearMin: 3,
  /** hand-added works sharing one calendar day at this count lose the year */
  addedClump: 15,
  games: { restrictAll: true },
} as const;

/** first hit is the default; the rest is 「换一句」 */
export const ORDER: Record<Dim, readonly TemplateId[]> = {
  long: ['L1', 'L2', 'L4', 'L3', 'L5', 'L6', 'L7'],
  stay: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
  met: ['M2', 'M1', 'M3', 'M4', 'M5', 'M6'],
  turn: ['Z1', 'Z1b', 'Z6', 'Z4', 'Z3', 'Z5', 'Z2'],
};
