/**
 * 「这是你来到世上的第 N 天」: a day count from a birthday, in the device's own time zone (a day turns at
 * local midnight, never at UTC's). The birthday itself is day 1. Pure, so tests/birthday.test.ts can pin `now`.
 */
const DAY = 86400000;
const parse = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  // 2023-02-29 and the like are not a day
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return { y, mo, d, t };
};
/** the local calendar day of `now`, as a UTC midnight (so the subtraction counts calendar days, DST or not) */
const localDay = (now: Date) => Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export interface DayCount {
  /** the birthday is day 1 */
  n: number;
  /** today is the birthday (29 February is kept on 28 February in a common year) */
  birthday: boolean;
  /** a round day: every thousandth (1,000 · 2,000 · … · 10,000 · …) */
  round: boolean;
  month: number;
  day: number;
}

/** null: no birthday, an impossible date, or one still ahead */
export function dayCount(birthISO: string | null | undefined, now: Date = new Date()): DayCount | null {
  if (!birthISO) return null;
  const b = parse(birthISO);
  if (!b) return null;
  const today = localDay(now);
  const n = Math.round((today - b.t) / DAY) + 1;
  if (n < 1) return null;
  const y = now.getFullYear(), mo = now.getMonth() + 1, d = now.getDate();
  const feb29 = b.mo === 2 && b.d === 29;
  const birthday = n > 1 && (feb29 && !isLeap(y) ? mo === 2 && d === 28 : mo === b.mo && d === b.d);
  return { n, birthday, round: n % 1000 === 0, month: mo, day: d };
}

/** the date line's number, with thousands separators: 11,454 */
export const fmtDays = (n: number) => n.toLocaleString('en-US');
