/**
 * Shapes for 偏爱. Algorithms live in calc/; the words live in copy.ts.
 * Seg matches lead.ts so a sentence can link a person or a work. It is copied here:
 * lead.ts already depends on me.ts, and me.ts keeps these preferences.
 */
import type { Kind, Work } from '../types';

export type WorkKind = Exclude<Kind, 'essay'>;
export type Dim = 'long' | 'stay' | 'met' | 'turn';
export type TemplateId =
  | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7'
  | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6'
  | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6'
  | 'Z1' | 'Z1b' | 'Z2' | 'Z3' | 'Z4' | 'Z5' | 'Z6' | 'Z7';
export type HeadlineId = 'H1' | 'H2' | 'H3' | 'H4';

export const DIMS = ['long', 'stay', 'met', 'turn'] as const satisfies readonly Dim[];
export const TEMPLATE_IDS = [
  'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7',
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6',
  'M1', 'M2', 'M3', 'M4', 'M5', 'M6',
  'Z1', 'Z1b', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7',
] as const satisfies readonly TemplateId[];

/** where a trusted year came from (D2) */
export type YearTrust = 'own' | 'added' | 'source' | 'lastPlayed';

export interface TasteWork {
  id: string;
  kind: WorkKind;
  title: string;
  /** trusted year; null = not usable in a year sentence */
  year: number | null;
  trust: YearTrust;
  precision: 'day' | 'month' | 'year';
  /** full date string, only to order two works inside one year */
  finished: string;
  /** release year (D6) */
  made: number | null;
  topics: string[];
  creators: { key: string; name: string }[];
  /** Steam minutes; null = none recorded */
  minutes: number | null;
}

export interface Evidence {
  id: string;
  title: string;
  year: number | null;
  note?: string;
}

export interface Seg { text: string; to?: string; kind?: 'interest' | 'period' | 'person' | 'work' }

export interface Sentence {
  tid: TemplateId;
  dim: Dim;
  segs: Seg[];
  text: string;
  evidence: Evidence[];
  nums: number;
  slots: Record<string, string | number>;
  variant: string;
  star: boolean;
  head?: string;
  short?: string;
  /** people named in the sentence, in reading order */
  names?: string[];
}

export type MissingReason = 'few' | 'noTags' | 'noSteam' | 'noPeople' | 'peopleLoading' | 'peopleBlocked' | 'none';

/** how many Bangumi works already have a people result (see people.ts) */
export interface PeopleStatus {
  coverage: number;
  covered: number;
  total: number;
  state: 'ready' | 'loading' | 'blocked';
}

export interface TasteResult {
  gate: { trusted: number; need: number; ok: boolean };
  rows: Record<Dim, Sentence[]>;
  headlines: { id: HeadlineId; sentence: Sentence }[];
  hollow: Sentence | null;
  missing: Partial<Record<Dim, MissingReason>>;
}

export interface TasteInput {
  works: readonly Work[];
  /** kept for 转向; this version does not read them */
  periods: readonly { id: string }[];
  today: string;
  people: PeopleStatus;
}

/** one calc result, before copy is applied */
export interface Hit {
  slots: Record<string, string | number>;
  evidence: TasteWork[];
  variant: string;
  names?: string[];
  /** when set, the engine uses these for the hit's own variant (names stay linked) */
  segs?: Seg[];
}

export interface RowPref {
  off?: true;
  pick?: TemplateId;
  /** your own words, at most 80 */
  text?: string;
}

export interface TastePrefs {
  on: boolean;
  rows: Partial<Record<Dim, RowPref>>;
}

export interface CardPrefs {
  layout?: 'A' | 'B' | 'C';
  theme: 'light' | 'dark';
  byline: boolean;
  total?: boolean;
  badge: boolean;
}
