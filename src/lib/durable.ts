/**
 * A JSON text kept in one file that a crash, a full disk or a killed app can't take away (TECH-PLAN v0.3
 * §10, APP-PLAN v0.2): every write goes to a temporary file first and is renamed over the old one, and the
 * file it replaces stays one generation as `.prev`. Reading takes the first of current → tmp → prev that
 * parses. Pure over a small file-system interface, so tests/durable.test.ts runs it in memory.
 */
export interface FsLike {
  /** the file's text, or null when it isn't there */
  read(path: string): Promise<string | null>;
  write(path: string, text: string): Promise<void>;
  /** `to` never exists when this is called */
  rename(from: string, to: string): Promise<void>;
  /** no error when it isn't there */
  remove(path: string): Promise<void>;
}

export interface DurableStore {
  /** the newest readable copy; `from` says which file it came from */
  read(): Promise<{ text: string; from: 'current' | 'tmp' | 'prev' } | null>;
  /** tmp ← text (read back and checked) → prev ← current → current ← tmp */
  write(text: string): Promise<void>;
  /** every copy goes (删除全部内容) */
  clear(): Promise<void>;
}

const parses = (t: string | null): t is string => {
  if (!t) return false;
  try { JSON.parse(t); return true; } catch { return false; }
};

export function createDurableStore(fs: FsLike, base: string): DurableStore {
  const cur = `${base}.json`, tmp = `${base}.json.tmp`, prev = `${base}.prev.json`;
  return {
    async read() {
      for (const [p, from] of [[cur, 'current'], [tmp, 'tmp'], [prev, 'prev']] as const) {
        const t = await fs.read(p).catch(() => null);
        if (parses(t)) return { text: t, from };
      }
      return null;
    },
    async write(text) {
      await fs.write(tmp, text);
      // a short write (disk full) must not replace a good copy
      if ((await fs.read(tmp)) !== text) { await fs.remove(tmp); throw new Error('durable: the written copy did not read back'); }
      const had = await fs.read(cur);
      if (had !== null) {
        if (parses(had)) {
          await fs.remove(prev);
          await fs.rename(cur, prev);
        } else {
          // a broken current is not worth keeping over the last good prev
          await fs.remove(cur);
        }
      }
      await fs.rename(tmp, cur);
    },
    async clear() {
      for (const p of [cur, tmp, prev]) await fs.remove(p);
    },
  };
}

/**
 * Writes, batched: `schedule` keeps only the newest text and writes it `delay` ms after the last change;
 * `flush` writes now (the app going to the background) and resolves when it is on disk. Writes never
 * overlap; a failed write keeps its text pending for the next try.
 */
export function createWriter(write: (text: string) => Promise<void>, delay = 800) {
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  const run = (): Promise<void> => {
    if (timer) { clearTimeout(timer); timer = null; }
    chain = chain.then(async () => {
      if (pending === null) return;
      const text = pending;
      pending = null;
      try { await write(text); } catch (e) { pending ??= text; console.warn('save failed', e); }
    });
    return chain;
  };
  return {
    schedule(text: string) {
      pending = text;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delay);
    },
    flush: run,
    get dirty() { return pending !== null; },
  };
}

/** the bits of Storage the key move uses */
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

/**
 * The save under `key`, or — once — the one under `legacyKey` copied to `key` (its backup too). The old keys
 * are removed only after the new copies read back the same, so a full storage can never lose the save.
 */
export function moveLegacy(kv: KV, key: string, bak: string, legacyKey: string, legacyBak: string): string | null {
  const t = kv.getItem(key);
  if (t !== null) return t;
  const old = kv.getItem(legacyKey);
  if (old === null) return null;
  try {
    kv.setItem(key, old);
    const oldBak = kv.getItem(legacyBak);
    if (oldBak !== null && kv.getItem(bak) === null) kv.setItem(bak, oldBak);
    if (kv.getItem(key) === old && (oldBak === null || kv.getItem(bak) === oldBak)) {
      kv.removeItem(legacyKey);
      kv.removeItem(legacyBak);
    }
  } catch { /* full: the old key stays, and is read again next time */ }
  return old;
}
