import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { useNavigationType } from 'react-router-dom';
import type { Work } from '../data/types';
import { isLatin } from '../data/derive';
import { Cover } from './Cover';
import { HERO } from './CoverWall';
import { markSheened, reduced, sheenDue, transitionIdle } from '../lib/motion';
import { DUR } from '../tokens';
import { tintVars, useTint } from '../lib/tint';

export interface StripItem { k: string; v: string; node?: ReactNode; onClick?: (el: HTMLElement) => void; label?: string }
export interface Epigraph { text: string; where?: string; onClick: () => void }

/** Long titles drop one step (§7.1); ≤ 6 characters get the larger phone size. */
export const titleSize = (t: string) => {
  const n = Array.from(t).length;
  // very long titles drop to the title size and show whole (a 3-line clamp hid the rest with nowhere to read it)
  return n > 32 ? 'is-xlong' : n > 14 ? 'is-long' : n <= 6 ? 'is-short' : '';
};

/**
 * Entry hero (§7.4 S3, desktop §8.3.2): the cover stands on the paper with a contact shadow, the
 * title is hero-sized, then a three-column info strip and the epigraph. `.hero-zone` is also the
 * hook for the S4 ambient tint (P1).
 */
/**
 * Motion (§7.3 / §7.4-4 / §7.5): `flown` = the cover arrived by the S2 flight, so the text rises in
 * on the flight's schedule (tag 120 · title 160 · byline / strip / epigraph from 200, 40 apart);
 * otherwise the page's own rise applies. Once the cover has settled the S4 tint fades in, and the
 * first visit to an entry gets one S3 sheen across the cover. Literal covers get neither.
 */
export function HeroZone({ work, coverW, coverH, tag, title, titleRef, byline, strip, epigraph, after, onCover, zoneRef, flown, settleMs, withToc, facts }: {
  work: Work; coverW: number; coverH: number; tag: string; title: string; titleRef: Ref<HTMLHeadingElement>;
  byline: ReactNode; strip: StripItem[]; epigraph?: Epigraph; after?: ReactNode; onCover?: () => void;
  zoneRef?: Ref<HTMLElement>; flown?: boolean; settleMs: number; withToc?: boolean;
  /** ≥ 1280 with no epigraph: the infobox, moved up into the hero's side column (polish r3) */
  facts?: ReactNode;
}) {
  const literal = !work.cover || !!work.coverBroken;
  const tint = useTint(literal ? undefined : work);
  const [lit, setLit] = useState(false);
  const navType = useNavigationType();
  const [sheen] = useState(() => !literal && !reduced() && sheenDue(work.id, navType));
  const [sweep, setSweep] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => { markSheened(work.id); }, [work.id]);
  useEffect(() => {
    const t = window.setTimeout(() => setLit(true), settleMs);
    return () => window.clearTimeout(t);
  }, [settleMs]);
  // S3 (§7.4-4, §7.3 at 640ms): the sweep waits until the cover has settled, the flight (any view
  // transition) has finished — one dynamic signature at a time, §7 — and the hero image is decoded,
  // so it never crosses a blank or half-loaded cover; then 120ms more. Reduced motion is re-checked
  // at that moment (the in-app switch may have flipped meanwhile).
  useEffect(() => {
    if (!sheen) return;
    let live = true, t = 0;
    const img = () => stage.current?.querySelector<HTMLImageElement>('.hero-cover img') ?? null;
    const decoded = () => {
      const i = img();
      if (!i) return Promise.reject(new Error('no image'));
      return i.complete && i.naturalWidth ? Promise.resolve() : i.decode();
    };
    const settled = new Promise<void>((r) => { t = window.setTimeout(r, settleMs); });
    settled.then(transitionIdle).then(decoded).then(() => {
      if (!live || reduced()) return;
      t = window.setTimeout(() => live && setSweep(true), DUR.sheenDelay);
    }, () => undefined);
    return () => { live = false; window.clearTimeout(t); };
  }, [sheen]); // eslint-disable-line react-hooks/exhaustive-deps
  // ≥ 1280 the hero grid has a side column, the same column as the infobox below. It carries the
  // epigraph, level with the info strip (polish r2); with no epigraph, the infobox itself moves up
  // into it (polish r3), so the column reads top to bottom: facts beside the title, then 被提到.
  const quote = epigraph && (
    <figure className="hero-epigraph">
      <blockquote>
        <button className="epigraph-btn" onClick={epigraph.onClick}>「{epigraph.text}」</button>
      </blockquote>
      {epigraph.where && <figcaption className="t-caption c-3">——{epigraph.where}</figcaption>}
    </figure>
  );
  const cover = <Cover work={work} w={coverW} h={coverH} size="medium" vt={HERO} className="hero-cover" fly={work.id} />;
  return (
    <header
      className={`hero-zone ${tint ? 'tinted' : ''} ${lit ? 'lit' : ''} ${flown ? 'flown' : ''}`}
      ref={zoneRef}
      style={{ ...tintVars(tint), '--settle': `${settleMs}ms` } as unknown as CSSProperties}
    >
      <div className={`hero-in ${withToc ? 'with-toc' : ''} ${withToc && (epigraph || facts) ? 'has-aside' : ''}`}>
        <div className="hero-stage" ref={stage}>
          {onCover ? <button className="hero-cover-btn" onClick={onCover} aria-label="查看封面大图">{cover}</button> : cover}
          {sweep && <span className="cover-sheen" aria-hidden style={{ width: coverW, height: coverH }} onAnimationEnd={() => setSweep(false)} />}
          <span className="contact-shadow" aria-hidden />
        </div>
        <div className="hero-text">
          <div className="t-label c-3 hero-tag">{tag}</div>
          <h1 className={`hero-title ${titleSize(title)} ${isLatin(title) ? 'is-latin' : ''}`} ref={titleRef}>{title}</h1>
          <p className="t-ui hero-by">{byline}</p>
          {strip.length > 0 && (
            <dl className={`hero-strip n${strip.length}`}>
              {strip.map((s) => (
                <div key={s.k}>
                  <dt className="t-label c-3">{s.k}</dt>
                  <dd className="ellipsis" title={s.v}>
                    {s.onClick ? <button className="strip-btn" onClick={(e) => s.onClick!(e.currentTarget)} aria-label={s.label}>{s.node ?? s.v}</button> : (s.node ?? s.v)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {epigraph && !withToc && quote}
          {!withToc && after}
        </div>
        {withToc && epigraph && <aside className="hero-aside">{quote}</aside>}
        {withToc && !epigraph && facts && <aside className="hero-aside hero-facts" aria-label="概要">{facts}</aside>}
        {withToc && after && <div className="hero-after">{after}</div>}
      </div>
    </header>
  );
}
