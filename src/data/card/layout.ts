/**
 * Which arrangement the data would pick.
 * The painted card is arrangement A for now; B and C stay as a choice the model can already name.
 * A sentence count under 2 with at least 2 named periods picks B; otherwise that shortage picks C.
 */
export type Layout = 'A' | 'B' | 'C';

export function autoLayout(lines: number, periods: number): Layout {
  if (lines >= 2) return 'A';
  if (periods >= 2) return 'B';
  return 'C';
}
