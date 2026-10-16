import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useStore } from '../data/store';
import type { Kind } from '../data/types';
import { KIND_LABEL, KIND_ORDER } from '../data/types';
import { justify, wallAspect, type Row } from '../lib/justify';
import { WallTile, useTileTip, useWallInteractions, wallAspectOf } from '../components/CoverWall';
import { RollingNumber, Seg } from '../components/Bits';
import { useBreakpoint, useWidth } from '../lib/useWidth';
import { DUR, FULL_WALL_ROW, RAIL } from '../tokens';
import { CoreRail, type RailMark } from '../components/CoreRail';
import { PickBar, PickToggle, usePicker } from '../components/Pick';

const noop = () => undefined;

/** Every row of the full wall; the oldest leftovers form a final, unstretched row (the wall's end). */
function fullRows(aspects: number[], width: number, H: number): Row[] {
  const rows = justify(aspects, width, H);
  const used = rows.reduce((n, r) => n + r.tiles.length, 0);
  if (used < aspects.length) {
    const y = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : 0;
    let x = 0;
    const tiles = [];
    for (let i = used; i < aspects.length; i++) {
      const w = Math.round(wallAspect(aspects[i]) * H);
      tiles.push({ index: i, x, y, w, h: H });
      x += w;
    }
    rows.push({ y, h: H, tiles });
  }
  return rows;
}

export default function FullWall() {
  const { library, sample } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [ref, width] = useWidth<HTMLDivElement>();
  const bp = useBreakpoint();
  // the year rail (r5 #1): beside the wall on tablet / desktop it has its own margin; on a phone it floats over the edge
  const gutter = bp === 'phone' ? 0 : RAIL.gutter;
  const wallW = Math.max(0, width - gutter);
  const works = useMemo(() => (kind === 'all' ? library : library.filter((w) => w.kind === kind)), [library, kind]);
  // 时间未知 (STYLE v0.4 §3.15) sorts last; the wall gets no divider — only the year float says so
  const rows = useMemo(() => fullRows(works.map(wallAspectOf), wallW, FULL_WALL_ROW[bp]), [works, wallW, bp]);
  const pick = usePicker();
  const height = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : 0;
  const { open, onLift, overlay, lifted } = useWallInteractions((w) => {
    const row = rows.find((r) => r.tiles.some((t) => works[t.index].id === w.id));
    if (row) window.scrollTo({ top: row.y });
  });

  const { onTip, tipNode } = useTileTip();
  const wallRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // ---- keyboard (P2-4, §8.2): a 2D roving focus over the whole, virtualised wall ----
  // the model, not the DOM, decides where focus goes (most tiles aren't rendered); the focused tile's
  // row is always rendered so focus never falls out of the document.
  const [focus, setFocus] = useState<number | null>(null);
  const rowOf = useMemo(() => {
    const m = new Int32Array(works.length);
    rows.forEach((r, ri) => r.tiles.forEach((t) => { m[t.index] = ri; }));
    return m;
  }, [rows, works.length]);
  const indexOf = useMemo(() => new Map(works.map((w, i) => [w.id, i])), [works]);
  useEffect(() => setFocus(null), [kind]);
  const pending = useRef(false);
  const nearestIn = (ri: number, cx: number) => rows[ri].tiles.reduce((a, b) => (Math.abs(a.x + a.w / 2 - cx) <= Math.abs(b.x + b.w / 2 - cx) ? a : b)).index;
  const onWallKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.tile[data-id]');
    const i = el ? indexOf.get(el.dataset.id!) : undefined;
    if (i === undefined || e.altKey || e.metaKey) return;
    const ri = rowOf[i];
    const row = rows[ri];
    const t = row.tiles.find((x) => x.index === i)!;
    const cx = t.x + t.w / 2;
    const page = Math.max(1, Math.floor((window.innerHeight - (barRef.current?.getBoundingClientRect().bottom ?? 0)) / row.h) - 1);
    const ctrl = e.ctrlKey;
    let next: number | undefined;
    switch (e.key) {
      case 'ArrowRight': next = ctrl ? undefined : i + 1; break;
      case 'ArrowLeft': next = ctrl ? undefined : i - 1; break;
      case 'ArrowDown': next = !ctrl && ri + 1 < rows.length ? nearestIn(ri + 1, cx) : undefined; break;
      case 'ArrowUp': next = !ctrl && ri > 0 ? nearestIn(ri - 1, cx) : undefined; break;
      case 'PageDown': next = nearestIn(Math.min(rows.length - 1, ri + page), cx); break;
      case 'PageUp': next = nearestIn(Math.max(0, ri - page), cx); break;
      case 'Home': next = ctrl ? 0 : row.tiles[0].index; break;
      case 'End': next = ctrl ? works.length - 1 : row.tiles[row.tiles.length - 1].index; break;
      default: return;
    }
    e.preventDefault();
    if (next === undefined || next < 0 || next >= works.length || next === i) return;
    pending.current = true;
    setFocus(next);
  };
  // after the move renders: focus the tile, and bring its row fully into view under the sticky bars
  useLayoutEffect(() => {
    if (!pending.current || focus === null) return;
    pending.current = false;
    const el = wallRef.current?.querySelector<HTMLElement>(`.tile[data-id="${CSS.escape(works[focus].id)}"]`);
    if (!el) return;
    el.focus({ preventScroll: true });
    const r = el.getBoundingClientRect();
    const under = (barRef.current?.getBoundingClientRect().bottom ?? 0) + 8;
    if (r.top < under) window.scrollBy({ top: r.top - under });
    else if (r.bottom > window.innerHeight - 8) window.scrollBy({ top: r.bottom - window.innerHeight + 8 });
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const [scroll, setScroll] = useState(0);
  const [vh, setVh] = useState(window.innerHeight);
  const [scrolling, setScrolling] = useState(false);
  useEffect(() => {
    let raf = 0;
    let idle: number | undefined;
    const f = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScroll(window.scrollY));
      setScrolling(true);
      clearTimeout(idle);
      idle = window.setTimeout(() => setScrolling(false), DUR.idleDelay);
    };
    const r = () => setVh(window.innerHeight);
    window.addEventListener('scroll', f, { passive: true });
    window.addEventListener('resize', r);
    return () => { window.removeEventListener('scroll', f); window.removeEventListener('resize', r); cancelAnimationFrame(raf); clearTimeout(idle); };
  }, []);

  // ?at=<id>: open the wall scrolled to that cover (from the long-press card).
  useLayoutEffect(() => {
    const at = params.get('at');
    if (!at || !rows.length) return;
    const row = rows.find((r) => r.tiles.some((t) => works[t.index]?.id === at));
    if (row) window.scrollTo({ top: row.y });
  }, [rows.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = wallRef.current?.offsetTop ?? 0;
  const from = scroll - top - vh;
  const to = scroll - top + vh * 2;
  // binary search the first visible row
  let lo = 0, hi = rows.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m].y + rows[m].h < from) lo = m + 1; else hi = m; }
  const visible: Row[] = [];
  for (let i = lo; i < rows.length && rows[i].y < to; i++) visible.push(rows[i]);
  const focusRow = focus !== null && focus < works.length ? rows[rowOf[focus]] : undefined;
  if (focusRow && !visible.includes(focusRow)) visible.push(focusRow);

  const barH = barRef.current?.getBoundingClientRect().bottom ?? 44;
  const firstOnScreen = rows.find((r) => r.y + r.h > scroll - top + barH);
  const firstWork = firstOnScreen ? works[firstOnScreen.tiles[0].index] : undefined;
  const year = firstWork ? firstWork.finished.slice(0, 4) || '时间未知' : '';
  // one tab stop: the tile last moved to, else the first tile on screen
  const stop = focus ?? firstOnScreen?.tiles[0].index ?? 0;

  // where each year begins on the wall (the first row it leads)
  const marks = useMemo(() => {
    const out: RailMark[] = [];
    let prev = '';
    for (const r of rows) {
      const label = works[r.tiles[0].index]?.finished.slice(0, 4) || '时间未知';
      if (label !== prev) { out.push({ label, y: r.y }); prev = label; }
    }
    return out;
  }, [rows, works]);
  const [scrubbing, setScrubbing] = useState(false);

  const kinds = KIND_ORDER.filter((k) => library.some((w) => w.kind === k));
  const options = [{ value: 'all' as const, label: '全部' }, ...kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))];

  return (
    <div className="page fullwall-page" ref={ref}>
      <h1 className="sr-only">全部封面</h1>
      <div className="fullwall-bar" ref={barRef}>
        {!pick.on && <button className="icon-btn" aria-label="返回" onClick={() => (history.state?.idx > 0 ? nav(-1) : nav('/'))}><ChevronLeft strokeWidth={1.5} /></button>}
        <div className="hscroll" style={{ flex: 1 }}>
          <Seg options={options} value={kind} onChange={(v) => { setKind(v as 'all' | Kind); pick.stop(); window.scrollTo({ top: 0 }); }} />
        </div>
        {!sample.on && <PickToggle p={pick} />}
      </div>
      <div
        className={`fullwall wall-plain ${gutter ? 'with-rail' : ''} ${lifted ? 'dimmed' : ''}`} ref={wallRef} style={{ height }} key={kind}
        onKeyDown={onWallKey}
        onFocus={(e) => { const i = indexOf.get((e.target as HTMLElement).dataset.id ?? ''); if (i !== undefined && i !== focus) setFocus(i); }}
      >
        {visible.flatMap((r) => r.tiles.map((t) => {
          const w = works[t.index];
          return pick.on
            ? <WallTile key={w.id} work={w} onOpen={pick.toggle} onLift={noop} tabStop={t.index === stop} picked={pick.has(w.id)} style={{ left: t.x, top: t.y, width: t.w, height: t.h }} />
            : <WallTile key={w.id} work={w} onOpen={open} onLift={onLift} onTip={onTip} tabStop={t.index === stop} style={{ left: t.x, top: t.y, width: t.w, height: t.h }} />;
        }))}
      </div>
      {!lifted && tipNode}
      {marks.length > 1 && !pick.on && (
        <CoreRail
          marks={marks} height={height} top={top} vh={vh} scroll={scroll} under={barH}
          active={!!gutter || scrolling || scrubbing} onScrub={setScrubbing} current={year}
        />
      )}
      <div className={`year-float ${(scrolling || scrubbing) && year ? 'on' : ''}`} aria-hidden>
        {year === '时间未知' ? <span className="year-float-word" key="u">时间未知</span> : <RollingNumber value={year || '0000'} />}
      </div>
      {overlay}
      <PickBar p={pick} works={works} />
    </div>
  );
}
