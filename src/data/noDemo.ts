/**
 * What `@demo` resolves to: no catalogue, no covers, no fake people. The public repository has no demo
 * catalogue; the development kit (kept outside the repo) maps `@demo` to its own catalogue with the same
 * exports. The app's own 看看示例 sample (data/generate.ts) is not this — it ships.
 */
import type { Work } from './types';
import type { BangumiConnection, WereadConnection } from './persist';

export const DEMO: boolean = false;
export const NAMED_PERIODS: { name: string; years: number[] }[] = [];
export const DOING_IDS: number[] = [];
export const BGM_BASELINE: string = '';
export const BGM_CLUMP_DAY: string = '';
export const DEMO_CONNECTIONS: { bangumi: BangumiConnection; weread: WereadConnection } | null = null;
export const doingFor = (_dataset?: unknown): Work[] => [];
export const masterFor = (_dataset?: unknown): Work[] => [];
export const WEREAD_BATCH: Work[] = [];
export const ADDABLE: Work[] = [];
export const ALL_BY_ID = new Map<string, Work>();
export const brokenCover = (id: string) => `missing:${id}`;
