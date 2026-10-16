import type { Kind, Work } from '../data/types';
import { hash } from './hash';
import { thumbSize } from '../components/Cover';
import { SHELF } from '../tokens';
import { setSpineTitle, splitTitle, type Measure, type SpineText } from './spineTitle';

/**
 * Sizes for the year rows (索引 · 年份 and its small versions): a spine's width and height, a cover's
 * width at a given height, and how many of a year fit a width in their own order.
 */
export interface Dim { w: number; h: number }

const num = (s?: string) => { const n = s ? parseInt(s.replace(/[^\d]/g, ''), 10) : NaN; return Number.isFinite(n) ? n : 0; };
const infoNum = (w: Work, key: string) => num(w.info.find((i) => i.key === key)?.value);
/** 0–1: how much there is of it — pages, episodes, reading hours. Unknown is thin-ish, not zero. */
function substance(w: Work): number {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  if (w.kind === 'book') {
    const p = infoNum(w, '页数');
    if (p) return clamp((p - 160) / 560);
    if (w.readHours) return clamp((w.readHours - 2) / 16);
    return 0.35;
  }
  if (w.kind === 'anime' || w.kind === 'film') {
    const e = infoNum(w, w.kind === 'anime' ? '话数' : '集数');
    return e ? clamp((e - 1) / 36) : w.kind === 'anime' ? 0.3 : 0;
  }
  if (w.kind === 'game') return 0.4;
  return 0;
}

/** a spine standing in a row whose tallest spine is H: kind decides how tall, substance how thick */
export function spineDim(w: Work, H: number, phone = false): Dim {
  const k = hash(w.id);
  const [lo, hi] = SHELF.stand[w.kind as Kind];
  const h = Math.round(H * (lo + (hi - lo) * ((k % 1000) / 999)));
  const base = SHELF.w[w.kind as Kind] + SHELF.thick * substance(w) + SHELF.jitter * (((k >> 10) % 100) / 99);
  return { w: Math.max(SHELF.minW, Math.round(phone ? base * SHELF.phone : base)), h };
}
/** the same spine, small: no title, a fraction of the width */
export function miniSpineDim(w: Work, h: number): Dim {
  return { w: Math.max(SHELF.mini.minW, Math.round(spineDim(w, SHELF.h.desktop).w * SHELF.mini.k)), h: spineDim(w, h).h };
}
/** a whole cover at height h, in its kind's proportions (music square, books 2:3 …) */
export function coverDim(w: Work, h: number): Dim {
  const [tw, th] = thumbSize(w, 100);
  return { w: Math.round((h * tw) / th), h };
}

/** the first ones of a year (its own order) that fit `width` with `gap` between them */
export function fitFirst(works: Work[], width: number, dim: (w: Work) => Dim, gap: number): { picks: Work[]; dims: Dim[] } {
  const picks: Work[] = [], dims: Dim[] = [];
  let x = 0;
  for (const w of works) {
    const d = dim(w);
    if (x + d.w > width) break;
    picks.push(w); dims.push(d); x += d.w + gap;
  }
  return { picks, dims };
}

/** r8: how a spine is finished — most plain; some with hairline bands at head and foot; a few books with
 *  a small paper label under the title. Picked from the id, so a work always looks the same. */
export type SpineLook = 'plain' | 'bands' | 'plate';
export function spineLook(w: Work, width: number, title: string, paper: boolean, phone = false): SpineLook {
  if (w.kind === 'essay') return 'plain';
  const L = SHELF.look;
  const share = w.kind === 'book' ? L.book : w.kind === 'music' ? L.music : L.case;
  const r = (hash(w.id) >>> 17) % 100;
  if (r < share.bands) return 'bands';
  if (r < share.bands + share.plate) {
    const fits = !paper && width >= (phone ? L.plateMinWPhone : L.plateMinW) && [...title].length <= L.plateMax;
    return fits ? 'plate' : 'plain';
  }
  return 'plain';
}
/** the grain tile's offset on a spine (px), so neighbours don't repeat it */
export function grainAt(w: Work): [number, number] {
  const k = hash(w.id);
  return [(k >>> 3) % 128, (k >>> 11) % 128];
}
/** a spine turned to face the room: its cover at the spine's own height, in the cover's proportions */
export function faceW(w: Work, h: number): number {
  const [tw, th] = thumbSize(w, 100);
  const art = w.cover && !w.coverBroken && w.kind !== 'essay';
  const [lo, hi] = SHELF.faceAspect;
  return Math.round(h * Math.min(hi, Math.max(lo, art ? w.cover!.aspect : tw / th)));
}

/** r17: a spine with its title set — the width it stands at (wider for a second column) and the columns */
export interface SpineSet extends Dim { id: string; text: SpineText; base: number; dress: Dress }
export function spineSet(w: Work, H: number, phone = false, reserve = 0, measure?: Measure): SpineSet {
  const d = spineDim(w, H, phone);
  const dress = dressOf(w);
  reserve += dress.top + dress.foot;
  const T = SHELF.title;
  const text = setSpineTitle(w.title, {
    w: d.w, avail: Math.max(0, d.h - SHELF.pad.top - SHELF.pad.bottom - reserve),
    fsMax: phone ? T.fsMax.phone : T.fsMax.desk, fsMin: T.fsMin, maxW: phone ? T.maxW.phone : T.maxW.desk,
    padX: T.padX, colGap: T.colGap, measure,
  });
  return { w: text.w, h: d.h, base: d.w, text, dress, id: w.id };
}
/** the title a spine's finish is chosen by: its main part (a plate holds a short name, not a subtitle) */
export const spineName = (w: Work) => splitTitle(w.title).main;

/**
 * r17: how a spine is dressed for its kind, with smaller variations within the kind picked from its id (so a
 * work always looks the same): the ornaments it carries and the run they take from the title, head and foot.
 * Colour stays the work's own; the kind only decides the object (cloth or paperback, slim case, game case,
 * disc case). Essays and music keep the plain spine.
 */
export interface Dress {
  kind: 'book' | 'film' | 'game' | 'anime' | 'plain';
  /** classes on the spine */
  cls: string[];
  /** ornaments: where they sit and what they carry */
  orn: { k: 'headband' | 'band' | 'strip' | 'banner' | 'obi'; at?: 'top' | 'foot' | 'left' | 'right'; h?: number; mark?: string; tone?: 'ink' | 'frame' }[];
  top: number; foot: number;
  /** a book that may take a foil title (decided with its colour: deep enough to keep the contrast) */
  foil: boolean;
}
export function dressOf(w: Work): Dress {
  const D = SHELF.dress;
  const k = hash(`${w.id}:dress`);
  const r = (n: number) => ((k >>> n) % 100);
  const d: Dress = { kind: 'plain', cls: [], orn: [], top: 0, foot: 0, foil: false };
  if (w.kind === 'book') {
    d.kind = 'book';
    if (r(0) < D.book.headband) { d.orn.push({ k: 'headband', at: 'top', h: D.book.headbandH }); d.top += D.book.headbandH; }
    if (r(7) < D.book.paperback) d.cls.push('paperback');
    d.foil = r(14) < D.book.foil;
  } else if (w.kind === 'film') {
    d.kind = 'film'; d.cls.push('case');
    const at = r(0) < D.film.foot ? 'foot' : 'top';
    const mark = w.year ? String(w.year % 100).padStart(2, '0') : undefined;
    d.orn.push({ k: 'band', at, h: D.film.bandH, mark, tone: r(7) < D.film.frame ? 'frame' : 'ink' });
    if (at === 'top') d.top += D.film.bandH + D.gap; else d.foot += D.film.bandH + D.gap;
  } else if (w.kind === 'game') {
    d.kind = 'game'; d.cls.push('case');
    const at = r(0) < D.game.foot ? 'foot' : 'top';
    const h = D.game.strip[r(7) % D.game.strip.length];
    d.orn.push({ k: 'strip', at, h });
    if (at === 'top') d.top += h + D.gap; else d.foot += h + D.gap;
  } else if (w.kind === 'anime') {
    d.kind = 'anime'; d.cls.push('case');
    d.orn.push({ k: 'banner', at: 'top', h: D.anime.banner }); d.top += D.anime.banner + D.gap;
    if (r(14) < D.anime.obi) { d.orn.push({ k: 'obi', at: 'foot', h: D.anime.obiH }); d.foot += D.anime.obiH + D.gap; }
  }
  return d;
}
