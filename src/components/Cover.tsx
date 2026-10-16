import { brokenCover } from '@demo';
import { useState, type CSSProperties } from 'react';
import type { Work } from '../data/types';
import { paperVar } from '../lib/hash';
import { creatorLine, isLatin } from '../data/derive';
import { localCover } from '../lib/coverCache';

/**
 * What fits in a vertical run of `avail` px at `fs`: CJK by whole characters, Latin by whole words —
 * never a glyph cut in half at the paper's edge. A subtitle after 「：」 goes first.
 */
let measure: CanvasRenderingContext2D | null | undefined;
let face = '';
/**
 * How long a Latin line runs at `fs` in the cover face (bold serif), measured: a per-letter guess ran short
 * and cut 「The Remains of the Day」 to 「The」 (r9). Without a canvas (tests), the old guess.
 */
function latinWidth(fs: number): (t: string) => number {
  if (measure === undefined) {
    measure = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (measure) face = getComputedStyle(document.documentElement).getPropertyValue('--font-serif').trim() || 'serif';
  }
  const g = measure;
  if (!g) return (t) => t.length * fs * 0.6;
  g.font = `600 ${fs}px ${face}`;
  return (t) => g.measureText(t).width;
}

export function fitVertical(text: string, fs: number, avail: number): string {
  const main = text.split(/[：:（(]/)[0].trim() || text;
  if (isLatin(main)) {
    const wide = latinWidth(fs);
    if (wide(main) <= avail) return main;
    // whole words while they fit; a first word longer than the paper is cut by letters
    const words = main.split(' ');
    let out = '';
    for (const w of words) {
      const next = out ? `${out} ${w}` : w;
      if (wide(next) > avail) break;
      out = next;
    }
    if (out) return out;
    let cut = '';
    for (const ch of main) { if (wide(cut + ch) > avail) break; cut += ch; }
    return cut || main.slice(0, 1);
  }
  const cs = Array.from(main);
  const max = Math.max(1, Math.floor(avail / (fs * 1.02)));
  if (cs.length <= max) return main;
  // never half a number or a word: 「赛博朋克2077」 short of room reads 「赛博朋克」, not 「赛博朋克207」
  let end = max;
  const alnum = (c: string | undefined) => !!c && /[A-Za-z0-9]/.test(c);
  if (alnum(cs[end]) && alnum(cs[end - 1])) { while (end > 0 && alnum(cs[end - 1])) end--; }
  return cs.slice(0, end || max).join('').trim();
}

/** Font size for literal covers: width 120 → 17px, 48 → 9px (linear, §3.3). Text below 11px is
 *  dropped (only paper + spine remain) so no glyph ever renders under the 11px floor (§2.3). */
export const literalFont = (w: number) => w / 9 + 11 / 3;
/** --t-caption's size, for fitting the author line */
const LITERAL_AUTHOR_FS = 13.5;

export function LiteralCover({ work, w, h }: { work: Work; w: number; h: number }) {
  if (work.kind === 'essay') {
    const full = w >= 100;
    const fs = full ? Math.max(12, w * 0.12) : Math.max(11, w * 0.32);
    return (
      <div className="literal" style={{ background: 'var(--paper-6)' }} aria-hidden>
        <div className="literal-essay-rule" />
        <div className="literal-essay-title" style={{ fontSize: fs, textAlign: full ? 'left' : 'center' }}>
          {full ? work.title : work.title.slice(0, 1)}
        </div>
      </div>
    );
  }
  const fs = literalFont(w);
  const showAuthor = w >= 100 && h >= 140;
  // Too narrow for a vertical title at ≥ 11px: fall back to the wall's single-character rule (§3.9.3).
  if (fs < 11) {
    return (
      <div className="literal literal-center" style={{ background: paperVar(work.id), fontSize: Math.max(11, w * 0.42) }} aria-hidden>
        <span>{Array.from(work.title)[0]}</span>
      </div>
    );
  }
  return (
    <div className="literal" style={{ background: paperVar(work.id) }} aria-hidden>
      <div className="literal-title" style={{ fontSize: fs }}>{fitVertical(work.title, fs, h * 0.72)}</div>
      {showAuthor && <div className="literal-author">{fitVertical(creatorLine(work), LITERAL_AUTHOR_FS, h * 0.4)}</div>}
    </div>
  );
}

interface CoverProps {
  work: Work;
  w: number;
  h: number;
  size?: 'thumb' | 'medium';
  className?: string;
  style?: CSSProperties;
  vt?: string;
  onClick?: () => void;
  /** placeholder before decode: entry page uses --surface-2, lists use the item's paper colour */
  paperPlaceholder?: boolean;
  /** S2: the entry hero marks itself as a flight target (data-fly) and shows the cached thumb
   *  underneath while the medium image decodes, so the flying cover is never blank */
  fly?: string;
}

/** A cover as a physical object: 3px radius, contact shadow, inner ring, spine light for books. */
export function Cover({ work, w, h, size = 'thumb', className = '', style, vt, onClick, paperPlaceholder, fly }: CoverProps) {
  const [failed, setFailed] = useState(false);
  // 0 loading · 1 decoded now (fade in) · 2 already cached (show directly, no fade)
  const [loaded, setLoaded] = useState<0 | 1 | 2>(0);
  const src = work.cover ? (work.coverBroken ? brokenCover(work.id) : size === 'medium' ? work.cover.medium : localCover(work.cover.thumb)) : null;
  const literal = !src || failed;
  return (
    <div
      className={`cover ${work.kind === 'book' ? 'is-book' : ''} ${className}`}
      style={{
        width: w, height: h, background: paperPlaceholder || literal ? paperVar(work.id) : undefined, viewTransitionName: vt,
        ...(fly && !literal && size === 'medium' && work.cover ? { '--seed': `url("${work.cover.thumb}")` } : null),
        ...style,
      } as CSSProperties}
      data-fly={fly}
      onClick={onClick}
    >
      {literal ? (
        <LiteralCover work={work} w={w} h={h} />
      ) : (
        <img
          src={src!}
          alt=""
          decoding="async"
          loading={fly ? 'eager' : 'lazy'}
          ref={(el) => { if (el?.complete && el.naturalWidth && !loaded) setLoaded(2); }}
          className={loaded === 0 ? 'loading' : loaded === 1 ? 'loaded' : ''}
          onLoad={() => setLoaded((v) => (v === 0 ? 1 : v))}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden>
      {Array.from(name)[0]}
    </div>
  );
}

/** Thumb size per kind for 40-wide list thumbnails (books 40×60, music square, etc.). */
export function thumbSize(work: Work, w = 40): [number, number] {
  switch (work.kind) {
    case 'music': return [w, w];
    case 'game': return [w, Math.round(w * 4 / 3)];
    case 'anime': case 'film': return [w, Math.round(w / 0.7)];
    case 'essay': return [w, Math.round(w * 1.5)];
    default: return [w, Math.round(w * 1.5)];
  }
}
