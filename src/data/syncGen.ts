/**
 * Generations for background reads. A read captures a stamp when it starts and may write only while
 * that stamp still matches.
 *
 *   library  moves on a restore or 删除全部内容, and both sources move with it
 *   bangumi  moves on 断开 or a new bring-in (an in-flight Steam read is not affected)
 *   steam    moves on 断开, a new bring-in, or undoing a Steam import (an in-flight Bangumi read is not affected)
 */
export interface SyncStamp {
  library: number;
  bangumi: number;
  steam: number;
}

let g: SyncStamp = { library: 0, bangumi: 0, steam: 0 };

export const syncStamp = (): SyncStamp => ({ ...g });

export function bumpLibraryGeneration(): void {
  g = { library: g.library + 1, bangumi: g.bangumi + 1, steam: g.steam + 1 };
}

export function bumpBangumiGeneration(): void {
  g = { ...g, bangumi: g.bangumi + 1 };
}

export function bumpSteamGeneration(): void {
  g = { ...g, steam: g.steam + 1 };
}

export const bangumiMayLand = (started: SyncStamp | undefined) =>
  !!started && started.library === g.library && started.bangumi === g.bangumi;

export const steamMayLand = (started: SyncStamp | undefined) =>
  !!started && started.library === g.library && started.steam === g.steam;
