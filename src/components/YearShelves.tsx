import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../data/store';
import type { YearView } from '../data/store';
import type { Work } from '../data/types';
import { KIND_LABEL, KIND_ORDER } from '../data/types';
import { fmtNum } from '../data/derive';
import { haptic, reduced } from '../lib/motion';
import { useBreakpoint, useElementWidth } from '../lib/useWidth';
import { spineOf, useSpineColours } from '../lib/spine';
import { coverDim, faceW, grainAt, spineLook, spineName, spineSet, type Dim, type SpineSet } from '../lib/shelf';
import { Cover } from './Cover';
import { measureLatin } from './SpineTitle';
import { SpineBody } from './Spine';
import { ScrollRail } from './ScrollRail';
import { fmtPlaytime } from '../lib/steam';
import { DUR, SHELF } from '../tokens';
import { FlyLink } from './FlyLink';

/**
 * 索引 · 年份: one row per year, in one of two layouts (the user's choice, remembered on the device):
 *  - 书脊 (r6, material r8): every work a spine standing on the year's hairline — one quiet colour from its
 *    cover (paper when it has none), its title down it, a rounded back, a head edge, a whisper of fibre;
 *    some with hairline bands, a few books with a paper label. Books stand taller and vary; boxed media
 *    stand even; a long book or a long series is a little thicker. Pointing at a spine (resting on it,
 *    focusing it, holding it on a phone) turns it in place to show its cover; the spines after it slide
 *    over to make room, and slide back when it turns back (r8). Its full title shows under the shelf.
 *  - 封面 (r7, the pre-r5 ledger the user liked for its air): small whole covers in a row between hairlines.
 * Both run in the year's own order and scroll sideways when they don't fit, with a quiet 「‹ ›」 step at the
 * end; the row simply ends (r18 dropped the bookend hairline). The year label opens the year; a work opens its
 * entry. 时间未知 is the last row, with no number.
 */

type Row = { key: string; to: string; label: string; named?: string; works: Work[]; unknown?: boolean };
type By = 'mouse' | 'key' | 'touch';
type Active = { row: string; id: string; by: By } | null;
type Want = (a: Active, delay: number, restart?: boolean) => void;

const mixOf = (ws: Work[]) => {
  const n = new Map<string, number>();
  for (const w of ws) n.set(w.kind, (n.get(w.kind) ?? 0) + 1);
  return KIND_ORDER.filter((k) => n.has(k)).sort((a, b) => n.get(b)! - n.get(a)!).map((k) => `${KIND_LABEL[k]} ${n.get(k)}`);
};

/** an even turn (sine in-out): under way at once, landing softly, the same both ways, so turning back
 *  mid-way reads as one motion. (A cubic in-out sat still for its first ~100ms: it read as a lag.) */
const ease = (u: number) => 0.5 - Math.cos(Math.PI * u) / 2;
const sel = (id: string) => `[data-id="${CSS.escape(id)}"]`;

/** hairline bands at head and foot take a little of the title's run */
const bandsOf = (w: Work) => spineLook(w, 0, '', true) === 'bands';

const ShelfRow = memo(function ShelfRow({ row, layout, H, phone, activeId, want }: {
  row: Row; layout: YearView; H: number; phone: boolean; activeId: string | null; want: Want;
}) {
  const spines = layout === 'spines';
  const gap = spines ? SHELF.gap : SHELF.coverGap;
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const shelf = useRef<HTMLDivElement>(null);
  // every work of the year, in order; x of each from the row's start
  const { dims, xs, total, indexOf } = useMemo(() => {
    const dims: (Dim | SpineSet)[] = row.works.map((w) => (spines ? spineSet(w, H, phone, bandsOf(w) ? SHELF.look.bandPad * 2 : 0, measureLatin) : coverDim(w, H)));
    const xs: number[] = [];
    let x = 0;
    for (const d of dims) { xs.push(x); x += d.w + gap; }
    return { dims, xs, total: x, indexOf: new Map(row.works.map((w, i) => [w.id, i])) };
  }, [row.works, spines, H, phone, gap]);
  // sideways: where the row is scrolled to, and how far it has been seen (render that far ahead, not all)
  const [sl, setSl] = useState(0);
  const [seen, setSeen] = useState(0);
  const raf = useRef(0);
  const reach = seen + width * SHELF.ahead;
  let limit = 0;
  while (limit < xs.length && xs[limit] < reach) limit++;
  const all = limit >= row.works.length;
  const rendered = useMemo(() => row.works.slice(0, limit), [row.works, limit]);
  // colours for what is (nearly) on screen; a first visit holds the row back until they are in, or `wait`
  const lo = sl - width, hi = sl + width * 2;
  const near = useMemo(() => (spines ? rendered.filter((_, i) => xs[i] + dims[i].w >= lo && xs[i] <= hi) : []), [spines, rendered, xs, dims, lo, hi]);
  useSpineColours(near);
  const firstScreen = spines ? rendered.filter((_, i) => xs[i] < width) : [];
  const pending = firstScreen.some((w) => spineOf(w) === undefined);
  const [waited, setWaited] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setWaited(true), SHELF.wait); return () => window.clearTimeout(t); }, []);
  const [focusIdx, setFocusIdx] = useState(0);
  const press = useRef<{ x: number; y: number; t: number; fired: boolean } | null>(null);
  const wantFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (wantFocus.current === null) return;
    const el = shelf.current?.querySelectorAll<HTMLElement>('[data-roving]')[wantFocus.current];
    wantFocus.current = null;
    el?.focus();
  });

  /* ---- the turn (r8): the slot widens from the spine's width to its cover's as the spine turns away and
     the cover turns in about the corner they share; both are driven here, frame by frame, on one slot ---- */
  const [faces, setFaces] = useState<string[]>([]);          // covers mounted: the turned one, ones turning back
  const anims = useRef(new Map<string, { u: number; dir: 1 | -1; raf: number; last: number }>());
  const latest = useRef({ dims, indexOf, works: row.works });
  latest.current = { dims, indexOf, works: row.works };
  const selfScroll = useRef(0);
  const geoOf = (id: string) => {
    const { dims: ds, indexOf: ix, works } = latest.current;
    const i = ix.get(id);
    return i === undefined ? null : { w: ds[i].w, fw: faceW(works[i], ds[i].h), i };
  };
  const apply = (id: string, u: number) => {
    const el = shelf.current?.querySelector<HTMLElement>(sel(id));
    const g = geoOf(id);
    if (!el || !g) return;
    const spine = el.querySelector<HTMLElement>('.yspine'), face = el.querySelector<HTMLElement>('.yface');
    if (u <= 0) {
      el.style.width = `${g.w}px`; el.classList.remove('is-cross'); el.style.removeProperty('--turn');
      if (spine) spine.style.transform = '';
      return;
    }
    const e = ease(u), a = (e * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
    el.style.width = `${(g.w * c + g.fw * s).toFixed(2)}px`;
    el.style.setProperty('--turn', s.toFixed(3));
    if (spine) spine.style.transform = `translateX(${(g.w * c - g.w).toFixed(2)}px) rotateY(${(-e * 90).toFixed(2)}deg)`;
    if (face) face.style.transform = `translateX(${(g.w * c).toFixed(2)}px) rotateY(${(90 - e * 90).toFixed(2)}deg)`;
  };
  const run = (id: string, dir: 1 | -1) => {
    const m = anims.current;
    if (reduced()) {
      // no turn, no sliding: the cover is there at once (and fades in), or the spine is back at once
      const el = shelf.current?.querySelector<HTMLElement>(sel(id));
      const g = geoOf(id);
      if (el && g) { el.style.width = `${dir > 0 ? g.fw : g.w}px`; el.classList.toggle('is-cross', dir > 0); }
      if (dir < 0) setFaces((f) => f.filter((x) => x !== id));
      return;
    }
    let a = m.get(id);
    if (!a) { a = { u: dir > 0 ? 0 : 1, dir, raf: 0, last: performance.now() }; m.set(id, a); }
    a.dir = dir; a.last = performance.now();
    const st = a;
    const tick = () => {
      const now = performance.now();
      st.u = Math.min(1, Math.max(0, st.u + (st.dir * (now - st.last)) / SHELF.flip.ms));
      st.last = now;
      apply(id, st.u);
      if (st.dir > 0) keepInView(id, false);
      if ((st.dir > 0 && st.u >= 1) || (st.dir < 0 && st.u <= 0)) {
        st.raf = 0;
        if (st.u <= 0) { m.delete(id); setFaces((f) => f.filter((x) => x !== id)); }
        return;
      }
      st.raf = requestAnimationFrame(tick);
    };
    if (!st.raf) st.raf = requestAnimationFrame(tick);
  };
  // keep the turning cover inside the row, clear of the edge (and of the edge's fade). Near the far edge the
  // row follows the cover frame by frame as it widens (the room to scroll into only exists as it grows);
  // near the start it scrolls once. With reduced motion it is all there at once, so one jump.
  const keepInView = (id: string, smooth: boolean) => {
    const sh = shelf.current, el = sh?.querySelector<HTMLElement>(sel(id)), g = geoOf(id);
    if (!sh || !el || !g) return;
    const r = sh.getBoundingClientRect(), b = el.getBoundingClientRect();
    const left = b.left - r.left, right = b.right - r.left, W = sh.clientWidth;
    const mR = g.i < latest.current.works.length - 1 ? SHELF.flip.fade : SHELF.flip.margin;
    const mL = sh.scrollLeft > 0 ? SHELF.flip.fadeStart : SHELF.flip.margin;
    let d = 0;
    if (right > W - mR) d = Math.min(right - (W - mR), left - mL);
    else if (left < mL) d = left - mL;
    if (Math.abs(d) < 0.5) return;
    selfScroll.current = performance.now();
    if (smooth) sh.scrollBy({ left: d, behavior: 'smooth' });
    else sh.scrollLeft += d;
  };
  const prevActive = useRef<string | null>(null);
  const opening = useRef<string | null>(null);
  useLayoutEffect(() => {
    const prev = prevActive.current;
    prevActive.current = activeId;
    if (prev && prev !== activeId) run(prev, -1);
    if (activeId && activeId !== prev) {
      opening.current = activeId;
      setFaces((f) => (f.includes(activeId) ? f : [...f, activeId]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);
  useLayoutEffect(() => {
    const id = opening.current;
    if (!id || !faces.includes(id)) return;
    opening.current = null;
    run(id, 1);
    // the start edge (its room is already there) in one smooth move; the far edge follows the turn
    if (reduced()) keepInView(id, false);
    else {
      const sh = shelf.current, el = sh?.querySelector<HTMLElement>(sel(id));
      if (sh && el && el.getBoundingClientRect().left - sh.getBoundingClientRect().left < (sh.scrollLeft > 0 ? SHELF.flip.fadeStart : SHELF.flip.margin)) keepInView(id, true);
    }
  });
  useEffect(() => () => { for (const a of anims.current.values()) cancelAnimationFrame(a.raf); }, []);

  const onScroll = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const s = shelf.current?.scrollLeft ?? 0;
      setSl(s);
      setSeen((v) => Math.max(v, s));
    });
    // a swipe or a 「‹ ›」 step turns a cover back; a keyboard walk that scrolls, or our own reveal, doesn't
    // our own reveal scrolls the row under a resting pointer: don't read that as the reader leaving
    if (activeId && performance.now() - selfScroll.current > SHELF.flip.selfScroll && !shelf.current?.contains(document.activeElement)) {
      const l = last.current;
      const r = shelf.current?.getBoundingClientRect();
      if (!l || !r || l.y < r.top || l.y > r.bottom) want(null, 0);
    }
  };
  const step = (dir: 1 | -1) => shelf.current?.scrollBy({ left: dir * width * SHELF.step, behavior: reduced() ? 'auto' : 'smooth' });
  const more = width > 0 && sl + width < total + (spines ? SHELF.endBare : 0) - gap - 1;
  const less = sl > 1;

  const items = () => [...(shelf.current?.querySelectorAll<HTMLElement>('[data-roving]') ?? [])];
  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = items();
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    let j = -1;
    if (e.key === 'ArrowRight') j = Math.min(els.length - 1, i + 1);
    else if (e.key === 'ArrowLeft') j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') {
      // the last one may not be rendered yet: render all, then focus it
      e.preventDefault();
      setSeen(total);
      setFocusIdx(row.works.length - 1);
      wantFocus.current = row.works.length - 1;
      return;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // the same place on the row above / below
      const rows = [...document.querySelectorAll<HTMLElement>('.yshelf')];
      const r = rows[rows.indexOf(shelf.current!) + (e.key === 'ArrowDown' ? 1 : -1)];
      if (!r) return;
      e.preventDefault();
      const x = els[i].getBoundingClientRect().left;
      const there = [...r.querySelectorAll<HTMLElement>('[data-roving]')];
      let best = there[0], bd = Infinity;
      for (const el of there) { const d = Math.abs(el.getBoundingClientRect().left - x); if (d < bd) { bd = d; best = el; } }
      best?.focus();
      return;
    }
    if (j < 0) return;
    e.preventDefault();
    setFocusIdx(j);
    els[j].focus();
  };

  const at = (w: Work): Active => ({ row: row.key, id: w.id, by: 'key' });
  const itemProps = (w: Work, i: number) => ({
    'data-roving': '',
    tabIndex: i === focusIdx ? 0 : -1,
    'aria-label': w.title,
    onFocus: () => { setFocusIdx(i); if (spines) want(at(w), SHELF.flip.keyDwell); },
    ...(spines ? {
      'data-id': w.id,
      onBlur: (e: React.FocusEvent) => { if (!shelf.current?.contains(e.relatedTarget as Node)) want(null, 0); },
      // a phone has no pointing: holding a spine turns it; a tap opens (the turned one too)
      onPointerDown: (e: React.PointerEvent) => {
        if (press.current) window.clearTimeout(press.current.t);
        if (e.pointerType !== 'touch') { press.current = null; return; }
        press.current = { x: e.clientX, y: e.clientY, fired: false, t: window.setTimeout(() => {
          if (!press.current) return;
          press.current.fired = true;
          haptic('light');
          want({ row: row.key, id: w.id, by: 'touch' }, 0);
        }, DUR.longPress) };
      },
      onPointerMove: (e: React.PointerEvent) => {
        const p = press.current;
        if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) { window.clearTimeout(p.t); press.current = null; }
      },
      onPointerUp: () => {
        const p = press.current;
        if (!p) return;
        window.clearTimeout(p.t);
        // the click that follows a hold is swallowed; one that never comes doesn't swallow the next tap
        if (!p.fired) press.current = null;
        else window.setTimeout(() => { if (press.current === p) press.current = null; }, DUR.longPress);
      },
      onPointerCancel: () => { if (press.current) window.clearTimeout(press.current.t); press.current = null; },
      onContextMenu: (e: React.MouseEvent) => { if (press.current) e.preventDefault(); },
      onClick: (e: React.MouseEvent) => { if (press.current?.fired) { e.preventDefault(); press.current = null; } },
    } : {}),
  });
  // a resting mouse turns the spine under it: the wait starts over while the pointer still travels, so a
  // sweep or a slow approach across other spines turns nothing. A pointer that hasn't moved is ignored —
  // the browser reports one when the spines slide under it, and that is not the reader pointing.
  const last = useRef<{ x: number; y: number; t: number } | null>(null);
  const onPointerMove = (e: React.PointerEvent) => {
    if (!spines || e.pointerType !== 'mouse') return;
    const l = last.current;
    if (l && l.x === e.clientX && l.y === e.clientY) return;
    const v = l ? Math.hypot(e.clientX - l.x, e.clientY - l.y) / Math.max(1, e.timeStamp - l.t) : 0;
    last.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    const id = (e.target as Element).closest?.('[data-id]')?.getAttribute('data-id');
    want(id ? { row: row.key, id, by: 'mouse' } : null, SHELF.flip.dwell, v > SHELF.flip.slow);
  };
  const onPointerLeave = (e: React.PointerEvent) => {
    last.current = null;
    // a slot widening under the pointer can fire a leave with the pointer still over the row
    if (spines && e.pointerType === 'mouse' && !shelf.current?.contains(document.activeElement)
      && !shelf.current?.contains(e.relatedTarget as Node)) want(null, SHELF.flip.dwell);
  };

  const activeI = activeId ? indexOf.get(activeId) ?? -1 : -1;
  const active = activeI >= 0 && activeI < limit ? row.works[activeI] : null;
  const activeFw = active ? faceW(active, dims[activeI].h) : 0;
  const titleRight = active && xs[activeI] - sl > width / 2;
  const mix = row.unknown ? [] : mixOf(row.works);
  const n = row.works.length;

  return (
    <section className={`yrow ${layout} ${row.unknown ? 'yrow-unknown' : ''}`} aria-label={row.label} data-rail-label={row.label}>
      <Link to={row.to} className="yrow-label" aria-label={row.unknown ? '时间未知' : `${row.label}${row.named ? `，${row.named}` : ''}，${n} 条`}>
        <span className="yrow-name">
          <span className="yrow-year">{row.label}</span>
          {row.named && <span className="yrow-named">{row.named}</span>}
        </span>
        {!row.unknown && (
          <span className="yrow-sum">
            <span className="yrow-count">{fmtNum(n)}<span className="yrow-unit"> 条</span></span>
            {mix.length > 0 && <span className="yrow-mix">{mix.map((m) => <span key={m}>{m}</span>)}</span>}
          </span>
        )}
      </Link>
      <div ref={ref} className={`yrow-shelf ${active ? 'has-turned' : ''}`}>
        <div
          ref={shelf}
          className={`yshelf ${pending && !waited ? 'is-waiting' : ''} ${more ? 'has-more' : ''} ${less ? 'has-less' : ''}`}
          role="group"
          aria-label={row.unknown ? '时间未知的作品' : `${row.label} 年的作品`}
          style={{ gap }}
          onKeyDown={onKeyDown}
          onScroll={onScroll}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          {width > 0 && rendered.map((w, i) => {
            const dm = dims[i];
            if (!spines) {
              return (
                <FlyLink key={w.id} id={w.id} to={`/entry/${w.id}`} className="ycover" {...itemProps(w, i)}>
                  <Cover work={w} w={dm.w} h={dm.h} paperPlaceholder />
                </FlyLink>
              );
            }
            const c = spineOf(w);
            const set = (dm as SpineSet).text;
            // a plate holds one short column; a title set in two goes on the cloth
            const look0 = spineLook(w, (dm as SpineSet).base, spineName(w), !c, phone);
            const look = look0 === 'plate' && set.cols.length > 1 ? 'plain' : look0;
            const faced = faces.includes(w.id);
            return (
              <Link
                key={w.id}
                to={`/entry/${w.id}`}
                className={`yslot ${faced ? 'is-turning' : ''}`}
                style={{ width: dm.w, height: dm.h }}
                {...itemProps(w, i)}
              >
                <SpineBody set={dm as SpineSet} dress={(dm as SpineSet).dress} c={c} look={look} grain={grainAt(w)} />
                {faced && (
                  <span className="yface" aria-hidden>
                    <Cover work={w} w={faceW(w, dm.h)} h={dm.h} paperPlaceholder />
                  </span>
                )}
              </Link>
            );
          })}
          {width > 0 && !all && <span className="yshelf-rest" style={{ width: total - xs[limit] }} aria-hidden />}
        </div>
        <ScrollRail target={shelf} line={spines} />
        {(more || less) && (
          <span className="yscroll">
            <button type="button" className="yscroll-btn" tabIndex={-1} aria-label="往前看" disabled={!less} onClick={() => step(-1)}><ChevronLeft strokeWidth={1.5} /></button>
            <button type="button" className="yscroll-btn" tabIndex={-1} aria-label="往后看" disabled={!more} onClick={() => step(1)}><ChevronRight strokeWidth={1.5} /></button>
          </span>
        )}
        {spines && active && (
          <span
            key={`t-${active.id}`}
            className={`yspine-title ${titleRight ? 'right' : ''}`}
            style={titleRight ? { right: Math.max(0, width - (xs[activeI] - sl) - activeFw) } : { left: Math.max(0, xs[activeI] - sl) }}
            aria-hidden
          >
            {active.title}
          </span>
        )}
      </div>
    </section>
  );
});

/**
 * r19 封面 as a grid: a year's works as whole covers in rows that wrap, with room round each — no sideways
 * scroll, every work of the year in view. Covers share a width and stand on a common foot so books, discs
 * and posters keep their own shapes; under each its title and, quietly, what kind of thing it is.
 */
const CoverGridRow = memo(function CoverGridRow({ row, cw }: { row: Row; cw: number }) {
  const mix = row.unknown ? [] : mixOf(row.works);
  const n = row.works.length;
  return (
    <section className={`yrow ygrid-row ${row.unknown ? 'yrow-unknown' : ''}`} aria-label={row.label} data-rail-label={row.label}>
      <Link to={row.to} className="yrow-label" aria-label={row.unknown ? '时间未知' : `${row.label}${row.named ? `，${row.named}` : ''}，${n} 条`}>
        <span className="yrow-name">
          <span className="yrow-year">{row.label}</span>
          {row.named && <span className="yrow-named">{row.named}</span>}
        </span>
        {!row.unknown && (
          <span className="yrow-sum">
            <span className="yrow-count">{fmtNum(n)}<span className="yrow-unit"> 条</span></span>
            {mix.length > 0 && <span className="yrow-mix">{mix.map((m) => <span key={m}>{m}</span>)}</span>}
          </span>
        )}
      </Link>
      <ul className="ygrid" aria-label={row.unknown ? '时间未知的作品' : `${row.label} 年的作品`} style={{ ['--ygrid-w' as string]: `${cw}px` }}>
        {row.works.map((w) => {
          const d = coverDim(w, 100);
          const h = Math.round((cw * d.h) / d.w);
          return (
            <li key={w.id} className={`ygrid-item kind-${w.kind}`}>
              <FlyLink id={w.id} to={`/entry/${w.id}`} className="ygrid-link" aria-label={`${w.title}，${KIND_LABEL[w.kind]}`}>
                <span className="ygrid-cover"><Cover work={w} w={cw} h={h} paperPlaceholder /></span>
                <span className="ygrid-title">{w.title}</span>
                <span className="ygrid-kind" aria-hidden>{KIND_LABEL[w.kind]}{w.play ? ` · ${fmtPlaytime(w.play.minutes)}` : ""}</span>
              </FlyLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
});

export function YearShelves() {
  const { d, yearView } = useStore();
  const bp = useBreakpoint();
  const phone = bp === 'phone';
  const H = yearView === 'spines' ? SHELF.h[bp] : SHELF.coverH[bp];
  const rows = useMemo<Row[]>(() => {
    const ys = [...d.years.values()].sort((a, b) => b.year - a.year)
      .map((y) => ({ key: String(y.year), to: `/year/${y.year}`, label: String(y.year), named: y.named, works: y.works }));
    return d.unknown.length ? [...ys, { key: 'unknown', to: '/unknown', label: '时间未知', works: d.unknown, unknown: true }] : ys;
  }, [d]);
  // one spine turned at a time, on the whole page. A request waits `delay` (a resting pointer, a key walk);
  // asking again for what is already on its way doesn't restart the wait, so a slow drift still lands.
  const [active, setActive] = useState<Active>(null);
  const cur = useRef<Active>(null);
  cur.current = active;
  const pend = useRef<Active | undefined>(undefined);
  const timer = useRef(0);
  const want = useCallback<Want>((a, delay, restart = false) => {
    const same = (x: Active | undefined, y: Active) => x?.id === y?.id && x?.row === y?.row;
    if (!restart && pend.current !== undefined && same(pend.current, a)) return;
    window.clearTimeout(timer.current);
    pend.current = undefined;
    if (same(cur.current, a)) return;
    if (delay <= 0) { setActive(a); return; }
    pend.current = a;
    timer.current = window.setTimeout(() => { pend.current = undefined; setActive(a); }, delay);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // a cover turned by holding it stays until a touch lands anywhere else
  useEffect(() => {
    if (active?.by !== 'touch') return;
    const off = (e: PointerEvent) => { if (!(e.target as Element).closest?.(sel(active.id))) want(null, 0); };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [active, want]);
  return (
    <div className={`yshelves ${yearView}`} key={yearView}>
      {yearView === 'covers' ? rows.map((r) => <CoverGridRow key={r.key} row={r} cw={SHELF.grid[bp]} />) : rows.map((r) => (
        <ShelfRow
          key={r.key} row={r} layout={yearView} H={H} phone={phone}
          activeId={active?.row === r.key ? active.id : null} want={want}
        />
      ))}
    </div>
  );
}
