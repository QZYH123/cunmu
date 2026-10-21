/**
 * Bangumi in the background (app build only; the demo build simulates it):
 *   - a sync when the app opens or comes back and the last good one is ≥ 6 h old, and 「同步一次」 in 我
 *   - the core creators of every work, one subject at a time (an entry being looked at goes first)
 *   - covers: a copy on the phone, the real shape of each (lib/coverCache.ts)
 * Nothing here runs while Bangumi isn't connected or the token stopped working.
 */
import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { DEMO } from '@demo';
import { useStore } from './store';
import type { Credit, Kind, Work } from './types';
import { BgmError, fetchCore, planSync } from '../lib/bangumi';
import { bgmClient } from '../lib/bangumiNet';
import { getBangumiToken } from '../lib/secrets';
import { initCoverCache, localCover, warmCovers } from '../lib/coverCache';
import { isNative } from '../lib/native';

type Store = ReturnType<typeof useStore>;
export const SYNC_EVERY_MS = 6 * 3600_000;
/** people found in the background are saved at least this often (not a UI timing) */
const SAVE_PEOPLE_MS = 15_000;
let syncing: Promise<SyncOutcome> | null = null;
export type SyncOutcome = { ok: true; added: number; removed: number } | { ok: false; problem: 'token' | 'gone' | 'net' };

/** one sync: read every 看过 / 在看 again and lay the pull over the last one (lib/bangumi.ts planSync) */
export function runBangumiSync(store: Store): Promise<SyncOutcome> {
  syncing ??= (async (): Promise<SyncOutcome> => {
    const b = store.connections.bangumi;
    if (!b || b.status !== 'connected') return { ok: false, problem: 'gone' };
    const token = b.mode === 'token' ? await getBangumiToken() : null;
    // a restore that found no token already says so ('absent'); do not call that a dead token
    if (b.mode === 'token' && !token) {
      if (b.problem !== 'absent') store.setBangumiProblem('token');
      return { ok: false, problem: 'token' };
    }
    const client = bgmClient(token ?? undefined);
    try {
      const username = b.mode === 'token' ? (await client.me()).username : b.username;
      const items = await client.collections(username);
      const prev = store.bangumi ?? null;
      // a public collection that went private reads as empty: keep what is here rather than empty the wall
      if (!items.length && prev && (prev.done.length || prev.doing.length)) { store.setBangumiProblem('gone'); return { ok: false, problem: 'gone' }; }
      const now = new Date().toISOString();
      const r = planSync(prev, items, { epoch: b.epoch, now, prevSyncAt: b.lastOkSyncAt });
      const { problem: _p, ...rest } = b;
      store.applyBangumi({ pull: r.pull, conn: { ...rest, username, lastOkSyncAt: now }, added: r.added.filter((id) => r.pull.done.some((w) => w.id === id)), sync: true });
      return { ok: true, added: r.added.length, removed: r.removed.length };
    } catch (e) {
      const code = e instanceof BgmError ? e.code : 'net';
      const problem = code === 'token' ? 'token' : code === 'gone' ? 'gone' : 'net';
      store.setBangumiProblem(problem);
      return { ok: false, problem };
    }
  })().finally(() => { syncing = null; });
  return syncing;
}

/** an entry page asks for its work's people first */
const wanted: string[] = [];
let poke: (() => void) | null = null;
export function wantPeople(workId: string) {
  if (DEMO || !/^bgm-\d+$/.test(workId)) return;
  wanted.unshift(workId.slice(4));
  poke?.();
}

export function BangumiAgent() {
  const store = useStore();
  const ref = useRef(store);
  ref.current = store;
  const b = store.connections.bangumi;
  const on = !DEMO && b?.status === 'connected';
  const blocked = b?.problem === 'token' || b?.problem === 'absent';

  // sync when opened / brought back, if the last good one is old
  useEffect(() => {
    if (!on || blocked) return;
    const maybe = () => {
      const s = ref.current;
      const last = s.connections.bangumi?.lastOkSyncAt;
      if (!last || Date.now() - Date.parse(last) >= SYNC_EVERY_MS) void runBangumiSync(s);
    };
    maybe();
    const vis = () => { if (document.visibilityState === 'visible') maybe(); };
    document.addEventListener('visibilitychange', vis);
    const sub = isNative() ? CapApp.addListener('resume', maybe) : null;
    return () => { document.removeEventListener('visibilitychange', vis); void sub?.then((h) => h.remove()); };
  }, [on, blocked]);

  // core creators, one subject at a time, saved in small batches
  const pullKey = `${store.bangumi?.done.length ?? 0}/${store.bangumi?.doing.length ?? 0}/${b?.epoch ?? 0}`;
  useEffect(() => {
    if (!on || blocked) return;
    let stop = false;
    let found: Record<string, Credit[]> = {};
    let n = 0;
    const tried = new Set<string>();   // asked this session (found is emptied on each save)
    const save = () => { if (n) { ref.current.learnBangumi({ people: found }); found = {}; n = 0; } };
    const timer = setInterval(save, SAVE_PEOPLE_MS);
    /** the next work without people; `urgent` = an entry page is waiting for it */
    const next = (): { w: Work; urgent: boolean } | undefined => {
      const pull = ref.current.bangumi;
      if (!pull) return undefined;
      const all = [...pull.done, ...pull.doing];
      const missing = (w: Work) => !pull.people?.[w.id.slice(4)] && !tried.has(w.id.slice(4));
      while (wanted.length) { const sid = wanted.shift()!; const w = all.find((x) => x.id === `bgm-${sid}`); if (w && missing(w)) return { w, urgent: true }; }
      const w = all.find(missing);
      return w && { w, urgent: false };
    };
    let wake: (() => void) | null = null;
    poke = () => wake?.();
    (async () => {
      const token = b?.mode === 'token' ? (await getBangumiToken()) ?? undefined : undefined;
      const client = bgmClient(token);
      while (!stop) {
        const it = next();
        if (!it) { save(); await new Promise<void>((r) => { wake = r; }); wake = null; continue; }
        const sid = it.w.id.slice(4);
        tried.add(sid);
        try {
          found[sid] = await fetchCore(client, sid, it.w.kind as Exclude<Kind, 'essay'>);
          n++;
          if (n >= 8 || it.urgent) save();
        } catch (e) {
          if (e instanceof BgmError && (e.code === 'gone' || e.code === 'bad')) { found[sid] = []; n++; continue; }
          break;   // offline / busy: the next open tries again
        }
      }
      save();
    })();
    return () => { stop = true; wake?.(); poke = null; clearInterval(timer); save(); };
  }, [on, blocked, pullKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // covers: a copy on the phone; the real shape of each
  useEffect(() => {
    if (!on) return;
    let stop: (() => void) | null = null;
    let live = true;
    void initCoverCache().then(() => {
      if (!live) return;
      const pull = ref.current.bangumi;
      if (!pull) return;
      const items: [string, string][] = [...pull.done, ...pull.doing]
        .filter((w) => w.cover && (!pull.aspects?.[w.id.slice(4)] || (isNative() && localCover(w.cover.thumb) === w.cover.thumb)))
        .map((w) => [w.id.slice(4), w.cover!.thumb]);
      if (items.length) stop = warmCovers(items, (a) => ref.current.learnBangumi({ aspects: a }));
    });
    return () => { live = false; stop?.(); };
  }, [on, pullKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
