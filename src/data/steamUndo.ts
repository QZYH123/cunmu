/**
 * Undoing a Steam import: the playtime it laid on games that were already here goes back to what it was.
 * The import records those values (ImportBatch.steamPrior); an older batch without them leaves them alone.
 */
import type { Play } from '../lib/steam';
import type { DateClaim, Work } from './types';
import type { ImportBatch } from './persist';

export interface SteamPrior {
  /** work id → its play before the import on a game another source brought; null = it had none */
  plays: Record<string, Play | null>;
  /** a Steam game already here → its play and claims before the import */
  extras: Record<string, { play: Play | null; claims: DateClaim[] | null }>;
}

/** the values an import is about to change */
export function steamPriorOf(plays: Record<string, Play> | undefined, extras: Work[], next: Map<string, unknown>, nextPlays: string[]): SteamPrior {
  const prior: SteamPrior = { plays: {}, extras: {} };
  // the import replaces the whole map: a play it drops comes back on undo too
  for (const wid of new Set([...Object.keys(plays ?? {}), ...nextPlays])) prior.plays[wid] = plays?.[wid] ?? null;
  for (const w of extras) if (w.source === 'steam' && next.has(w.id)) prior.extras[w.id] = { play: w.play ?? null, claims: w.claims ?? null };
  return prior;
}

/** what was read on demand after the import (achievements, store facts) stays */
const back = (prior: Play, now: Play | undefined): Play => {
  const out: Play = { ...prior };
  if (now?.ach) out.ach = now.ach; else delete out.ach;
  if (now?.store) out.store = now.store; else delete out.store;
  return out;
};

export function undoSteamPrior<S extends { plays?: Record<string, Play>; extras: Work[] }>(x: S, prior: SteamPrior | undefined): S {
  if (!prior) return x;
  const plays = { ...(x.plays ?? {}) };
  for (const [wid, p] of Object.entries(prior.plays)) {
    if (p) plays[wid] = back(p, plays[wid]); else delete plays[wid];
  }
  const extras = x.extras.map((w) => {
    const p = prior.extras[w.id];
    if (!p) return w;
    const n: Work = { ...w };
    if (p.play) n.play = back(p.play, w.play); else delete n.play;
    if (p.claims) n.claims = p.claims; else delete n.claims;
    return n;
  });
  return { ...x, plays, extras };
}

/**
 * Auto-syncs in a row that only move playtime share one record: the newest record (by time) must be such a run,
 * not undone, with no undo of another record since. A manual import, a run that adds games, or an undo starts anew.
 */
export function syncUpdateTarget(batches: ImportBatch[]): ImportBatch | undefined {
  if (!batches.length) return undefined;
  const last = batches.reduce((a, b) => (b.createdAt >= a.createdAt ? b : a));
  if (last.provider !== 'steam' || !last.syncUpdated || last.created.length || last.undoneAt) return undefined;
  if (batches.some((b) => b.undoneAt && b.undoneAt >= last.createdAt)) return undefined;
  return last;
}

/** two priors as one: what was there before the earlier run wins; the later run adds only what the earlier did not touch */
export function mergeSteamPrior(earlier: SteamPrior | undefined, later: SteamPrior): SteamPrior {
  return { plays: { ...later.plays, ...earlier?.plays }, extras: { ...later.extras, ...earlier?.extras } };
}

/** lays a playtime-only auto-sync's record on the list: into the last such record when it can, else as a new one */
export function recordSyncUpdate(batches: ImportBatch[], run: { id: string; at: string; prior: SteamPrior; changed: string[]; merged: string[]; label: (n: number) => string }): ImportBatch[] {
  const t = syncUpdateTarget(batches);
  if (!t) return [...batches, { id: run.id, provider: 'steam', label: run.label(run.changed.length), createdAt: run.at, created: [], merged: run.merged, skipped: [], quoteIds: [], steamPrior: run.prior, syncUpdated: run.changed }];
  const changed = [...new Set([...t.syncUpdated!, ...run.changed])];
  const merged = [...new Set([...t.merged, ...run.merged])];
  return batches.map((b) => (b === t ? { ...b, label: run.label(changed.length), createdAt: run.at, merged, steamPrior: mergeSteamPrior(b.steamPrior, run.prior), syncUpdated: changed } : b));
}
