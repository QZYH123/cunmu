/** Which cached files to drop so the cache fits: least recently used first, down to `target` bytes once over `max`. */
export interface CacheEntry { size: number; used: number }

export function pickEvictions(entries: Iterable<[string, CacheEntry]>, max: number, target: number): string[] {
  const list = [...entries];
  let total = list.reduce((n, [, e]) => n + e.size, 0);
  if (total <= max) return [];
  const out: string[] = [];
  for (const [name, e] of list.sort((a, b) => a[1].used - b[1].used)) {
    if (total <= target) break;
    out.push(name);
    total -= e.size;
  }
  return out;
}
