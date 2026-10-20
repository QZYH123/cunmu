/**
 * Undoing a Steam import: the playtime it laid on games that were already here goes back to what it was.
 * The import records those values (ImportBatch.steamPrior); an older batch without them leaves them alone.
 */
import type { Play } from '../lib/steam';
import type { DateClaim, Work } from './types';

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
