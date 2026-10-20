/** index lists stop here until the rest is asked for — they are not dropped */
export const INDEX_PEOPLE_CAP = 400;
export const INDEX_WORK_CAP = 200;

export function capped<T>(items: readonly T[], cap: number, open: boolean): { shown: T[]; rest: number } {
  if (open || items.length <= cap) return { shown: items.slice(), rest: 0 };
  return { shown: items.slice(0, cap), rest: items.length - cap };
}
