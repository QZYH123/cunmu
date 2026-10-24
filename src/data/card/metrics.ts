/**
 * The card canvas, in CSS pixels. Export multiplies by SCALE.
 * tokens.css --card-* repeats these numbers; the two have to stay in step.
 * A 1px hairline here is 2px on the 1080 image.
 */
export const CARD_W = 540;
export const CARD_H = 720;
export const SCALE = 2;
export const PAD_X = 36;
export const ZONE = {
  top: { y: 36, h: 36 },
  mid: { y: 72, h: 345 },
  favs: { y: 446, h: 159 },
  badge: { y: 677, h: 21 },
} as const;
export const MID_H = ZONE.mid.h;
/** bottom 15% of 720; the mark may pass it, nothing else may */
export const BOTTOM_SAFE = 612;
export const FLOOR_PX = 12;
export const BADGE_PX = 10;

export const LABEL_W = 64;
export const COL_GAP = 8;
export const INNER_W = CARD_W - PAD_X * 2;
export const TEXT_W = INNER_W - LABEL_W - COL_GAP;

export const FAV_GAP = 8;
export const FAV_MAX_W = 87.5;
export const FAV_RATIO = 1.5;

export const HEAD_TOP = 24;
export const AFTER_HEAD = 16;
export const ROW_GAP = 12;
export const PERIOD_BEFORE = 20;
export const PERIOD_GAP = 8;

export const TITLE_EM = 32;
export const TITLE_LH = 42;
export const LEAD_EM = 16;
export const LEAD_LH = 24;
export const PERIOD_EM = 14;
export const PERIOD_LH = 20;
export const LINE_MAX = 2;

/** n covers in a row, 2:3, left aligned, never wider than the cap */
export function favSlot(n: number): { w: number; h: number } {
  const count = Math.max(1, n);
  const w = Math.min(FAV_MAX_W, (INNER_W - FAV_GAP * (count - 1)) / count);
  return { w, h: w * FAV_RATIO };
}
