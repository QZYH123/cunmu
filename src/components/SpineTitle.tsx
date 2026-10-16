import { runsOf, type Measure, type SpineText } from '../lib/spineTitle';

/**
 * The title on a spine (r17), as src/lib/spineTitle.ts set it: one or two columns down the spine, right to
 * left; CJK upright, Latin turned on its side, a short number upright among the characters; a subtitle a
 * step smaller and lighter in weight; an end that doesn't fit fades out rather than being cut.
 */
export function SpineTitle({ text }: { text: SpineText }) {
  return (
    <span
      className={`yspine-t ${text.cols.length > 1 ? 'two' : ''}`}
      style={{ '--spine-fs': `${text.fs}px`, '--spine-sfs': `${text.subFs}px` } as React.CSSProperties}
      aria-hidden
    >
      {text.cols.map((c, i) => (
        <span key={i} className={`yspine-col ${c.sub ? 'sub' : ''} ${c.fade ? 'fade' : ''}`}>
          {runsOf(c.text).map((r, j) => (r.tcy
            ? <span key={j} className="tcy">{r.t}</span>
            : r.upright ? r.t : <span key={j} className="lat">{r.t}</span>))}
        </span>
      ))}
    </span>
  );
}

let g: CanvasRenderingContext2D | null | undefined;
let face = '';
/** a turned Latin run's length in the spine face, measured once per run and size */
const cache = new Map<string, number>();
export const measureLatin: Measure = (t, fs) => {
  const k = `${fs}|${t}`;
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  if (g === undefined) {
    g = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (g) face = getComputedStyle(document.documentElement).getPropertyValue('--font-serif').trim() || 'serif';
  }
  if (!g) return t.length * fs * 0.6;
  g.font = `600 ${fs}px ${face}`;
  const v = g.measureText(t).width * 1.04;
  cache.set(k, v);
  return v;
};
