import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import type { Work } from '../data/types';
import { fmtNum } from '../data/derive';
import { paperVar } from '../lib/hash';
import { useElementWidth } from '../lib/useWidth';
import { spineOf, spineVars, useSpineColours } from '../lib/spine';
import { coverDim, fitFirst, miniSpineDim, spineSet, type SpineSet } from '../lib/shelf';
import { Cover } from './Cover';
import { measureLatin } from './SpineTitle';
import { SpineBody } from './Spine';
import { SHELF } from '../tokens';

/**
 * The small versions of 索引 · 年份 (r7), in whichever layout is chosen there: a year's first works in their
 * own order, as narrow untitled spines or as small covers, as many as fit — never a part of one. Not
 * interactive; the row around it is the link. Used by the home 年份 list, a year's foot (上一年 / 下一年)
 * and the colophon on 我.
 */

const NONE: Work[] = [];

export function MiniRow({ works, h, align = 'start', className = '', titled = false }: {
  works: Work[]; h: number; align?: 'start' | 'end' | 'center'; className?: string;
  /** spines at full width with their titles (我's colophon: a few works read as books, not as bars) */
  titled?: boolean;
}) {
  const { yearView } = useStore();
  const spines = yearView === 'spines';
  const [ref, width] = useElementWidth<HTMLSpanElement>();
  const gap = spines ? (titled ? SHELF.gap : SHELF.mini.gap) : SHELF.coverGap;
  const { picks, dims } = useMemo(
    () => (width > 0 ? fitFirst(works, width, (w) => (spines ? (titled ? spineSet(w, h, true, 0, measureLatin) : miniSpineDim(w, h)) : coverDim(w, h)), gap) : { picks: NONE, dims: [] }),
    [works, width, spines, h, gap, titled],
  );
  useSpineColours(spines ? picks : NONE);
  return (
    <span ref={ref} className={`mini-row ${yearView} ${align} ${className}`} style={{ height: h, gap }} aria-hidden>
      {picks.map((w, i) => {
        if (!spines) return <Cover key={w.id} work={w} w={dims[i].w} h={dims[i].h} paperPlaceholder className="mini-cover" />;
        const c = spineOf(w);
        if (titled) {
          const s = dims[i] as SpineSet;
          return <SpineBody key={w.id} set={s} dress={s.dress} c={c} look="plain" className="mini-titled" />;
        }
        return (
          <span
            key={w.id}
            className={`mini-spine ${c ? '' : 'paper'}`}
            style={{ width: dims[i].w, height: dims[i].h, ...(c ? spineVars(c) : { '--paper': paperVar(w.id) }) } as React.CSSProperties}
          />
        );
      })}
    </span>
  );
}

/** home, right column: the years, newest first — the number, a small row, how many; 时间未知 last, no number */
export function SideYears() {
  const { d } = useStore();
  const rows = useMemo(() => {
    const ys = [...d.years.values()].sort((a, b) => b.year - a.year).map((y) => ({ key: String(y.year), to: `/year/${y.year}`, label: String(y.year), works: y.works, unknown: false }));
    return d.unknown.length ? [...ys, { key: 'unknown', to: '/unknown', label: '时间未知', works: d.unknown, unknown: true }] : ys;
  }, [d]);
  return (
    <ol className="side-years">
      {rows.map((r) => (
        <li key={r.key}>
          <Link to={r.to} className={`side-year ${r.unknown ? 'unknown' : ''}`} aria-label={r.unknown ? '时间未知' : `${r.label} 年，${r.works.length} 条`}>
            <span className="side-year-name">{r.label}</span>
            <MiniRow works={r.works} h={SHELF.mini.side} />
            {!r.unknown && <span className="side-year-n">{fmtNum(r.works.length)}</span>}
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** a year's foot: the year before and the year after, each with its small row; ← / → move between them */
export function YearPager({ year }: { year: number }) {
  const { d } = useStore();
  const nav = useNavigate();
  const ys = [...d.years.keys()].sort((a, b) => a - b);
  const i = ys.indexOf(year);
  const prev = i > 0 ? ys[i - 1] : undefined;
  const next = i >= 0 && i < ys.length - 1 ? ys[i + 1] : undefined;
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable], [role="dialog"], .tile, [role="slider"]')) return;
      if (e.key === 'ArrowLeft' && prev) { e.preventDefault(); nav(`/year/${prev}`, { replace: true }); }
      if (e.key === 'ArrowRight' && next) { e.preventDefault(); nav(`/year/${next}`, { replace: true }); }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [prev, next, nav]);
  if (prev === undefined && next === undefined) return null;
  const cell = (y: number | undefined, label: string, side: 'prev' | 'next') => (y === undefined
    ? <span className={`pager-cell ${side}`} />
    : (
      <Link to={`/year/${y}`} replace className={`pager-cell ${side}`} aria-keyshortcuts={side === 'prev' ? 'ArrowLeft' : 'ArrowRight'}>
        <span className="t-label c-3">{label}</span>
        <span className="pager-num">{y}</span>
        <MiniRow works={d.years.get(y)!.works} h={SHELF.mini.pager} align={side === 'next' ? 'end' : 'start'} className="pager-row" />
      </Link>
    ));
  return (
    <nav className="year-pager" aria-label="相邻的年份">
      {cell(prev, prev === year - 1 ? '上一年' : '更早', 'prev')}
      {cell(next, next === year + 1 ? '下一年' : '更近', 'next')}
    </nav>
  );
}
