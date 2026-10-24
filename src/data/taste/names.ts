/**
 * One person, several spellings. 渡辺 / 渡邊 / 渡边 fold together.
 * 伊坂幸太郎 and 伊坂幸三郎 do not: this is not a fuzzy match.
 * Romaji stays romaji (Watanabe Shinichiro is not 渡边信一郎).
 */
import { VARIANTS } from './variants';

const DROP = /[\s·・･.．。]/u;

/** NFKC, lower case, no spaces or middle dots, variants folded. */
export function canonKey(name: string): string {
  let out = '';
  for (const ch of name.normalize('NFKC').toLowerCase()) {
    if (DROP.test(ch)) continue;
    out += VARIANTS.get(ch) ?? ch;
  }
  return out;
}

/**
 * Group spellings by canonKey.
 * The name shown is the spelling that occurs most; a tie keeps the one that appeared first.
 */
export function mergeCreators(names: readonly string[]): { key: string; name: string }[] {
  const buckets = new Map<string, Map<string, number>>();
  const order: string[] = [];
  for (const name of names) {
    if (!name) continue;
    const key = canonKey(name);
    if (!key) continue;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = new Map();
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.set(name, (bucket.get(name) ?? 0) + 1);
  }
  return order.map((key) => {
    let best = '';
    let n = -1;
    for (const [name, k] of buckets.get(key)!) {
      if (k > n) { best = name; n = k; }
    }
    return { key, name: best };
  });
}
