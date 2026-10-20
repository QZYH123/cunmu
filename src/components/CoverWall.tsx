import { brokenCover } from '@demo';
import { forwardRef, memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { Work } from '../data/types';
import { KIND_ASPECT } from '../data/types';
import { justifyCached, justifyLead, type Row } from '../lib/justify';
import { paperVar } from '../lib/hash';
import { DUR, EASE, TILE_TIP, TYPE_FLOOR, WALL_CAP_VH, WALL_LEAD, WALL_LITERAL_GAP, WALL_WIDE_SCALE, WALL_INTRO, WALL_PARALLAX, WALL_TIERS, type Breakpoint } from '../tokens';
import { arrivedByRoute, haptic, inPageFade, markFlight, reduced, useLongPress, withViewTransition } from '../lib/motion';
import { Preview, WorkPreviewBody } from './Bits';
import { Cover } from './Cover';
import { workActions, workMeta } from './ContextPreview';
import { localCover } from '../lib/coverCache';

export const HERO = 'hero-cover';

/** a cover's shape on the wall; a cover without a usable aspect (an old or hand-edited file) takes its kind's */
export const wallAspectOf = (w: Work) => {
  const a = w.cover && !w.coverBroken ? w.cover.aspect : undefined;
  return typeof a === 'number' && a > 0.2 && a < 5 ? a : KIND_ASPECT[w.kind];
};

export function tierFor(n: number) {
  return WALL_TIERS.find((t) => n >= t.min && n <= t.max) ?? null;
}

/**
 * Rows for the home wall (§7.2-1, §8.3.1). Target row height follows the tier and breakpoint.
 * Phone keeps the tier's row count and caps the wall at min(tier cap, 56vh); tablet / desktop cap
 * it at 60 / 64vh and the row count follows from that cap. Whole rows are dropped to fit, so the
 * wall never ends in a half row.
 */
/**
 * Which work leads the home wall (polish r3): the pinned one if it is in the library with a real
 * cover; otherwise the strongest real cover among the newest WALL_LEAD.window works. The score is a
 * pure function of the library, so the same library always opens on the same picture; ties go to
 * the newer work. Returns an index into `works`, or -1.
 */
export function pickLead(works: Work[], pin?: string | null): number {
  const real = (w: Work) => !!w.cover && !w.coverBroken;
  if (pin) {
    const i = works.findIndex((w) => w.id === pin);
    if (i >= 0 && real(works[i])) return i;
  }
  let best = -1, top = -Infinity;
  const n = Math.min(works.length, WALL_LEAD.window);
  for (let i = 0; i < n; i++) {
    const w = works[i];
    if (!real(w) || w.cover!.strength === null) continue;
    let s = (w.cover!.strength ?? WALL_LEAD.unknown) - i * WALL_LEAD.recency;
    if (w.cover!.aspect > WALL_LEAD.wideAspect) s -= WALL_LEAD.widePenalty;
    if (s > top + 1e-9) { top = s; best = i; }
  }
  return best;
}

export function homeRows(works: Work[], width: number, vh: number, sig: string, bp: Breakpoint, pin?: string | null): { rows: Row[]; height: number } {
  const tier = tierFor(works.length);
  if (!tier || tier.name === 'display' || width <= 0) return { rows: [], height: 0 };
  const H = Math.round(tier.H[bp] * (bp === 'wide' ? Math.min(WALL_WIDE_SCALE.max, Math.max(1, width / WALL_WIDE_SCALE.from)) : 1));
  const phone = bp === 'phone';
  const cap = phone ? Math.min(tier.cap, vh * WALL_CAP_VH.phone) : vh * WALL_CAP_VH[bp];
  const maxRows = phone ? tier.rows : Math.max(1, Math.ceil(cap / (H * 0.82)) + 1);
  const aspects = works.map(wallAspectOf);
  const fit = (rs: Row[], keep = 1) => {
    while (rs.length > keep && rs[rs.length - 1].y + rs[rs.length - 1].h > cap) rs = rs.slice(0, -1);
    return rs;
  };
  let rows = fit(justifyCached(sig, aspects, width, H, maxRows));
  // Lead (polish r2/r3): one strong recent cover (or the pinned one) stands at the left edge,
  // spanning the first rows, so the wall opens on one picture instead of a uniform thumbnail grid.
  const li = (WALL_LEAD.tiers as readonly string[]).includes(tier.name) ? pickLead(works, pin) : -1;
  if (li >= 0 && rows.length >= 2) {
    for (let span = Math.min(rows.length, WALL_LEAD.span[bp]); span >= 2; span--) {
      const led = justifyLead(aspects, li, width, H, span, rows.length);
      if (!led) continue;
      const leadH = led[span - 1].y + led[span - 1].h;
      if (leadH > cap || led[0].tiles[0].w > width * WALL_LEAD.maxShare) continue;
      rows = fit(led, span);
      break;
    }
  }
  const last = rows[rows.length - 1];
  return { rows, height: last ? last.y + last.h : 0 };
}

/**
 * The home wall's layout, including when it is a 陈列 row (§8.3.1): the 1–4 tier, and any count whose
 * covers cannot fill one whole row at this breakpoint's row height (a few covers on a wide screen),
 * which would otherwise leave no wall at all.
 */
const layouts = new WeakMap<Work[], Map<string, HomeLayout>>();
type HomeLayout = { display: boolean; rows: Row[]; height: number; works: Work[] };
export function homeLayout(works: Work[], width: number, vh: number, bp: Breakpoint, pin?: string | null): HomeLayout {
  const key = `${width}|${vh}|${bp}|${pin ?? ''}`;
  const memo = layouts.get(works) ?? new Map<string, HomeLayout>();
  layouts.set(works, memo);
  const hit = memo.get(key);
  if (hit) return hit;
  const tier = tierFor(works.length);
  let ordered = spaceLiterals(works);
  const sig = works.length ? works[0].id + works[works.length - 1].id : '';
  let { rows, height } = homeRows(ordered, width, vh, sig, bp, pin);
  // Two covers without art in one column (or side by side) read as a hole in the picture: move the
  // later one a few places, keeping a move only if the wall as a whole has fewer such pairs. The lead
  // is held (a move shifts recency by a place), and each arrangement gets its own justify cache key.
  let clash = literalClashes(rows, ordered);
  if (clash.count) {
    const li = (WALL_LEAD.tiers as readonly string[]).includes(tier?.name ?? '') ? pickLead(ordered, pin) : -1;
    const hold = li >= 0 ? ordered[li].id : pin;
    for (let it = 0; clash.count && it < WALL_LITERAL_GAP.restack; it++) {
      let moved = false;
      for (const d of WALL_LITERAL_GAP.moves) {
        const next = moveBy(ordered, clash.worst, d);
        if (!next) continue;
        const lay = homeRows(next, width, vh, `${sig}~${arrangement(next)}`, bp, hold);
        const c = literalClashes(lay.rows, next);
        if (c.count < clash.count) { ordered = next; ({ rows, height } = lay); clash = c; moved = true; break; }
      }
      if (!moved) break;
    }
  }
  const display = tier?.name === 'display' || (works.length > 0 && width > 0 && !rows.length);
  const out = { display, rows, height, works: ordered };
  if (memo.size > 16) memo.clear();
  memo.set(key, out);
  return out;
}

/**
 * Pairs of literal tiles that read as one hole, over every row of the wall: side by side in a row
 * (less than half a tile between), one row apart and touching even corner to corner, or two rows
 * apart sharing a third of a column. `worst` is the later tile of the last pair (an index into
 * `works`), or -1. spaceLiterals keeps them apart in reading order; this sees the 2-D wall.
 */
function literalClashes(rows: Row[], works: Work[]): { count: number; worst: number } {
  const lit: { r: number; x: number; w: number; index: number }[] = [];
  rows.forEach((row, r) => row.tiles.forEach((t) => {
    if (isLiteral(works[t.index]) && t.h <= row.h + 1) lit.push({ r, x: t.x, w: t.w, index: t.index });
  }));
  let count = 0, worst = -1;
  for (const b of lit) for (const a of lit) {
    if (a === b || a.r > b.r || b.r - a.r > WALL_LITERAL_GAP.rows) continue;
    const mw = Math.min(a.w, b.w);
    const d = b.r - a.r;
    const hit = d === 0
      ? a.x < b.x && b.x - (a.x + a.w) < mw / 2
      : Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > (d === 1 ? -0.5 : 1 / 3) * mw;
    if (hit) { count++; if (b.index > worst) worst = b.index; }
  }
  return { count, worst };
}

/** `works` with the item at `i` taken out and put back `d` places later (or earlier), or null. */
function moveBy(works: Work[], i: number, d: number): Work[] | null {
  const to = i + d;
  if (i < 0 || to < 0 || to >= works.length) return null;
  const out = works.slice();
  const [w] = out.splice(i, 1);
  out.splice(to, 0, w);
  return out;
}

/** Moves keep the covered works in order, so where the literal ones sit names the arrangement. */
function arrangement(works: Work[]): string {
  const at: string[] = [];
  for (let i = 0; i < Math.min(works.length, 400); i++) if (isLiteral(works[i])) at.push(`${i}:${works[i].id}`);
  return at.join(',');
}

const isLiteral = (w: Work) => !w.cover || !!w.coverBroken;
const spaced = new WeakMap<Work[], Work[]>();
/**
 * Near the top of the wall, covers without art (essays, literal covers) keep at least
 * WALL_LITERAL_GAP tiles apart: two pale typographic tiles side by side read as a hole in the
 * picture. The later one swaps places with the next work that has a cover, so the order stays
 * newest-first within a few places. Beyond the first rows the order is untouched.
 */
export function spaceLiterals(works: Work[]): Work[] {
  const hit = spaced.get(works);
  if (hit) return hit;
  const out = works.slice();
  const end = Math.min(out.length, WALL_LITERAL_GAP.within);
  let last = -Infinity;
  for (let i = 0; i < end; i++) {
    if (!isLiteral(out[i])) continue;
    if (i - last < WALL_LITERAL_GAP.gap) {
      const j = out.findIndex((w, k) => k > i && !isLiteral(w));
      if (j < 0) break;
      const [w] = out.splice(j, 1);
      out.splice(i, 0, w);
      continue;
    }
    last = i;
  }
  spaced.set(works, out);
  return out;
}

/* ---------- a single wall tile ---------- */

function WallLiteral({ work, w, h }: { work: Work; w: number; h: number }) {
  const big = h >= 120;
  const mid = h >= 84 && h < 120;
  if (work.kind === 'essay') {
    return (
      <div className="literal" style={{ background: 'var(--paper-6)' }}>
        <div className="literal-essay-rule" />
        <div className="literal-essay-title" style={{ fontSize: Math.max(TYPE_FLOOR, big ? w * 0.13 : w * 0.34), textAlign: big ? 'left' : 'center' }}>
          {big ? work.title : work.title.slice(0, 1)}
        </div>
      </div>
    );
  }
  if (big) return <div className="literal"><div className="literal-title" style={{ fontSize: Math.max(TYPE_FLOOR, w * 0.14) }}>{work.title}</div></div>;
  const text = mid ? work.title.slice(0, 2) : work.title.slice(0, 1);
  const fs = Math.max(TYPE_FLOOR, mid ? Math.min(w * 0.3, h * 0.34) : w * 0.42);
  return <div className="literal literal-center" style={{ fontSize: fs }}><span className={mid ? 'vertical' : ''}>{text}</span></div>;
}

interface TileProps {
  work: Work; style: CSSProperties; onOpen: (w: Work, el: HTMLElement) => void; onLift: (w: Work, el: HTMLElement) => void;
  /** desktop label (§7.2-7): called with the tile on pointer dwell / keyboard focus, null on leave */
  onTip?: (w: Work, el: HTMLElement | null, now?: boolean) => void;
  /** roving tab stop: only one tile of a wall is in the Tab order, arrows move between tiles */
  tabStop?: boolean;
  /** the lead tile (spans several rows): lifts less on hover, it is already the largest thing on screen */
  lead?: boolean;
  /** 「选几部」: picked covers are dimmed, nothing else (v0.4 §3.14.3) */
  picked?: boolean;
}

export const WallTile = memo(forwardRef<HTMLDivElement, TileProps>(function WallTile({ work, style, onOpen, onLift, onTip, tabStop, lead, picked }, ref) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState<0 | 1 | 2>(0);
  const src = work.cover && !failed ? (work.coverBroken ? brokenCover(work.id) : localCover(work.cover.thumb)) : null;
  const lp = useLongPress((el) => onLift(work, el), (el) => onOpen(work, el));
  const w = Number(style.width);
  const h = Number(style.height);
  return (
    <div
      ref={ref}
      className={`${lead ? 'tile lead' : 'tile'}${picked ? ' picked' : ''}`}
      data-id={work.id}
      style={{ ...style, background: work.kind === 'essay' && !src ? 'var(--paper-6)' : paperVar(work.id) }}
      role={picked === undefined ? 'link' : 'checkbox'}
      aria-checked={picked === undefined ? undefined : picked}
      aria-label={work.title}
      tabIndex={tabStop ? 0 : -1}
      {...lp}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTip?.(work, null); onOpen(work, e.currentTarget); } }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onTip?.(work, e.currentTarget); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') onTip?.(work, null); }}
      onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) onTip?.(work, e.currentTarget, true); }}
      onBlur={() => onTip?.(work, null)}
    >
      {src ? (
        <img
          src={src}
          // the lead is drawn up to ~384 CSS px wide: let it take the medium image (the one exception
          // to thumbnails-only on the wall, polish r3)
          srcSet={lead && work.cover && !work.coverBroken && work.cover.medium !== src ? `${src} 240w, ${work.cover.medium} 400w` : undefined}
          sizes={lead ? `${Math.round(w)}px` : undefined}
          alt=""
          decoding="async"
          loading={lead ? 'eager' : 'lazy'}
          draggable={false}
          ref={(el) => { if (el?.complete && el.naturalWidth && !loaded) setLoaded(2); }}
          className={loaded === 0 ? 'loading' : loaded === 1 ? 'loaded' : ''}
          onLoad={() => setLoaded((v) => (v === 0 ? 1 : v))}
          onError={() => setFailed(true)}
        />
      ) : (
        <WallLiteral work={work} w={w} h={h} />
      )}
    </div>
  );
}));

/* ---------- desktop tile label: title + year, 8px under the tile (§7.2-7) ---------- */

export function useTileTip() {
  const [tip, setTip] = useState<{ work: Work; rect: DOMRect } | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    window.addEventListener('scroll', hide, { passive: true });
    return () => window.removeEventListener('scroll', hide);
  }, [tip]);
  const onTip = useRef((work: Work, el: HTMLElement | null, now = false) => {
    window.clearTimeout(timer.current);
    if (!el) { timer.current = window.setTimeout(() => setTip(null), TILE_TIP.hide); return; }
    const show = () => setTip({ work, rect: el.getBoundingClientRect() });
    if (now) show(); else timer.current = window.setTimeout(show, TILE_TIP.show);
  }).current;
  const node = tip && createPortal(<TileTip work={tip.work} rect={tip.rect} />, document.body);
  return { onTip, tipNode: node };
}

function TileTip({ work, rect }: { work: Work; rect: DOMRect }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const gap = TILE_TIP.gap;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(gap, rect.left + rect.width / 2 - w / 2), window.innerWidth - gap - w);
    const top = rect.bottom + gap + h < window.innerHeight ? rect.bottom + gap : rect.top - gap - h;
    setPos({ left, top });
  }, [rect]);
  const year = work.year ?? (Number(work.finished.slice(0, 4)) || undefined);
  return (
    <div ref={ref} className="tile-tip" role="tooltip" style={pos ?? { visibility: 'hidden', left: 0, top: 0 }}>
      <span className="tile-tip-title ellipsis">{work.title}</span>
      {year ? <span className="t-caption c-3">{year}</span> : null}
    </div>
  );
}

/**
 * Arrow keys move a roving focus between the items of a 2D layout by geometry (rows are in DOM
 * order): ← → step, ↑ ↓ go to the nearest item by centre in the row above / below, Home / End go to
 * the first / last item of the current row (行首 / 行尾). Only the focused item keeps tabIndex 0.
 * Used by the home wall and the category cover grid; the full wall, which is virtualised, has its own (FullWall.tsx).
 */
export function arrowNav(e: KeyboardEvent<HTMLElement>, item: string) {
  const cur = (e.target as HTMLElement).closest<HTMLElement>(item);
  if (!cur || e.altKey || e.metaKey || e.ctrlKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(item)];
  const i = items.indexOf(cur);
  let next: HTMLElement | undefined;
  if (e.key === 'ArrowRight') next = items[i + 1];
  else if (e.key === 'ArrowLeft') next = items[i - 1];
  else if (e.key === 'Home' || e.key === 'End') {
    const row = items.filter((t) => t.offsetTop === cur.offsetTop);
    next = e.key === 'Home' ? row[0] : row[row.length - 1];
  }
  else {
    const top = cur.offsetTop;
    const cx = cur.offsetLeft + cur.offsetWidth / 2;
    const rowTops = [...new Set(items.map((t) => t.offsetTop))].sort((a, b) => a - b);
    const target = rowTops[rowTops.indexOf(top) + (e.key === 'ArrowDown' ? 1 : -1)];
    if (target !== undefined) {
      next = items.filter((t) => t.offsetTop === target)
        .reduce((a, b) => (Math.abs(a.offsetLeft + a.offsetWidth / 2 - cx) <= Math.abs(b.offsetLeft + b.offsetWidth / 2 - cx) ? a : b));
    }
  }
  if (!next) return;
  e.preventDefault();
  cur.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
}
export const wallArrowKeys = (e: KeyboardEvent<HTMLElement>) => arrowNav(e, '.tile[data-id]');

/* ---------- interactions shared by the home wall and 「整面墙」 ---------- */

export function useWallInteractions(onWallView?: (w: Work) => void) {
  const nav = useNavigate();
  const [lift, setLift] = useState<{ work: Work; rect: DOMRect; src: string | null; bg: string; keyboard?: boolean } | null>(null);
  const open = (w: Work, el: HTMLElement) => {
    el.classList.add('pressed');
    const img = el.querySelector('img');
    if (img) (img as HTMLElement).style.viewTransitionName = HERO;
    else el.style.viewTransitionName = HERO;
    setTimeout(() => {
      markFlight(w.id);
      withViewTransition(() => nav(`/entry/${w.id}`), 'flight').then(() => {
        el.classList.remove('pressed'); if (img) (img as HTMLElement).style.viewTransitionName = ''; el.style.viewTransitionName = '';
      });
    }, DUR.press);
  };
  const onLift = (w: Work, el: HTMLElement) => {
    const img = el.querySelector('img');
    setLift({ work: w, rect: el.getBoundingClientRect(), src: img?.getAttribute('src') ?? null, bg: el.style.background, keyboard: el.matches(':focus-visible') });
  };
  const overlay = lift && (
    <>
      {createPortal(
        <div
          className="tile lifted"
          style={{ position: 'fixed', left: lift.rect.left, top: lift.rect.top, width: lift.rect.width, height: lift.rect.height, background: lift.bg }}
        >
          {lift.src ? <img src={lift.src} alt="" /> : <WallLiteral work={lift.work} w={lift.rect.width} h={lift.rect.height} />}
        </div>,
        document.body,
      )}
      <Preview
        anchor={lift.rect}
        onClose={() => setLift(null)}
        focusFirst={lift.keyboard}
        actions={workActions(lift.work, nav, () => setLift(null), onWallView)}
      >
        <WorkPreviewBody work={lift.work} meta={workMeta(lift.work)} />
      </Preview>
    </>
  );
  return { open, onLift, overlay, lifted: !!lift };
}

/* ---------- S2 from any cover (category grid, collage, person strip, search, §7.3) ---------- */

/** Click handler for a link around a `.cover`: that cover flies into the entry hero. Mark the link
 *  with data-fly-src={id} so the return flight can find it. */
export function useFly() {
  const nav = useNavigate();
  return (e: React.MouseEvent<HTMLElement>, id: string, path = `/entry/${id}`) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || reduced()) return;
    e.preventDefault();
    const c = e.currentTarget.querySelector<HTMLElement>('.cover img') ?? e.currentTarget.querySelector<HTMLElement>('.cover');
    if (c) c.style.viewTransitionName = HERO;
    markFlight(id);
    withViewTransition(() => nav(path), 'flight').then(() => { if (c) c.style.viewTransitionName = ''; });
  };
}

/* ---------- the home wall ---------- */

export type WallMode = 'none' | 'flip' | 'fade';

/* ---------- S1 entrance (§7.2-5): once per session, refresh included ---------- */
const INTRO_KEY = 'cunmu/wall-intro';
let introPending = (() => { try { return !sessionStorage.getItem(INTRO_KEY); } catch { return true; } })();
/** True exactly once per session: the first home wall to mount plays the diagonal wave. */
export function takeWallIntro(): boolean {
  if (!introPending) return false;
  introPending = false;
  try { sessionStorage.setItem(INTRO_KEY, '1'); } catch { /* private mode */ }
  return true;
}
/** Whether this session's intro is still to come (the masthead uses it to time its rise). */
export const wallIntroPending = () => introPending;

/**
 * Drop a finished one-shot tile animation. A finished WAAPI animation stays attached to its tile,
 * and Chromium then refuses to composite any later transform animation there (the hover rise ran on
 * the main thread — trace, polish r3). Its fill is 'backwards' or none, so cancelling is invisible.
 */
const release = (a: Animation) => { a.finished.then(() => a.cancel(), () => undefined); return a; };

/** Diagonal wave: delay = (x / W + y / H) / 2 × spread, each tile .985 → 1 and 0 → 1 (§7.2-5). */
function playIntro(layer: HTMLElement, W: number, H: number, quiet = false) {
  const tiles = [...layer.querySelectorAll<HTMLElement>('.tile[data-id]')];
  if (quiet || reduced()) {
    release(layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.reduced, easing: EASE.standard, fill: 'backwards' }));
    return;
  }
  for (const t of tiles) {
    const cx = t.offsetLeft + t.offsetWidth / 2;
    const cy = t.offsetTop + t.offsetHeight / 2;
    const delay = ((cx / W + cy / H) / 2) * WALL_INTRO.spread;
    release(t.animate(
      [{ opacity: 0, transform: `scale(${WALL_INTRO.scale})` }, { opacity: 1, transform: 'none' }],
      { duration: DUR.wallIn, delay, easing: EASE.out, fill: 'backwards' },
    ));
  }
}

/**
 * S1 parallax (§7.2-6): the wall drifts at 0.6× scroll speed; transform only, fine pointers only.
 * Where ScrollTimeline exists (polish r4) it is a scroll-driven animation: the compositor maps the
 * scroll offset straight to the wall's transform — no script, no style recalc on the main thread per
 * frame. The range ends at the wall's foot, after which it holds (the wall is off screen by then).
 * Elsewhere a rAF loop writes the same transform.
 */
type ScrollTimelineCtor = new (o: { source: Element; axis: 'block' }) => AnimationTimeline;
function useParallax(layer: React.RefObject<HTMLElement>, wrap: React.RefObject<HTMLElement>, on: boolean) {
  useEffect(() => {
    const el = layer.current;
    const box = wrap.current;
    if (!el || !box || !on) return;
    const mq = matchMedia('(hover: hover) and (pointer: fine)');
    const ST = (window as unknown as { ScrollTimeline?: ScrollTimelineCtor }).ScrollTimeline;
    const live = () => mq.matches && !reduced();
    let raf = 0, anim: Animation | null = null, end = -1;
    const apply = () => {
      raf = 0;
      if (!live()) { el.style.transform = ''; return; }
      const y = window.scrollY;
      const bottom = box.offsetTop + box.offsetHeight;
      if (y > bottom) return;                       // off screen: leave it where it was
      el.style.transform = y > 0 ? `translate3d(0, ${(y * WALL_PARALLAX).toFixed(1)}px, 0)` : '';
    };
    const f = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const build = () => {
      const bottom = live() ? box.offsetTop + box.offsetHeight : -1;
      if (bottom === end && (anim || bottom < 0)) return;
      end = bottom;
      anim?.cancel(); anim = null;
      if (bottom <= 0 || !ST) return;
      anim = el.animate(
        [{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(0, ${(bottom * WALL_PARALLAX).toFixed(1)}px, 0)` }],
        { timeline: new ST({ source: document.documentElement, axis: 'block' }), rangeStart: '0px', rangeEnd: `${bottom}px`, fill: 'both', easing: 'linear' } as KeyframeAnimationOptions,
      );
    };
    if (ST) {
      build();
      const ro = new ResizeObserver(() => build());
      ro.observe(box);
      const mo = new MutationObserver(build);          // the in-app reduce-motion switch
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
      mq.addEventListener('change', build);
      return () => { ro.disconnect(); mo.disconnect(); mq.removeEventListener('change', build); anim?.cancel(); };
    }
    apply();
    window.addEventListener('scroll', f, { passive: true });
    return () => { window.removeEventListener('scroll', f); cancelAnimationFrame(raf); el.style.transform = ''; };
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
}

interface HomeWallProps { works: Work[]; width: number; vh: number; bp: Breakpoint; mode: WallMode; newIds: string[]; onArrived?: () => void; pin?: string | null }

/**
 * S1 pointer light (§7.2-8, P2-2): a soft circle of light that follows a fine pointer across the wall.
 * The light is a pre-rendered radial layer inside the wall (it rides the parallax with the tiles);
 * following the pointer only rewrites its transform, once per frame at most, so the compositor moves
 * an already-painted layer — the wall is never repainted. Fades in / out over 300ms; off for touch,
 * reduced motion (OS or the in-app switch) and while a lifted tile's card is open.
 */
function usePointerLight(layer: React.RefObject<HTMLElement>, light: React.RefObject<HTMLElement>, on: boolean) {
  useEffect(() => {
    const el = layer.current, spot = light.current;
    if (!el || !spot || !on) return;
    const mq = matchMedia('(hover: hover) and (pointer: fine)');
    let raf = 0, x = 0, y = 0, inside = false;
    const half = () => spot.offsetWidth / 2;
    const place = () => {
      raf = 0;
      if (!inside) return;
      const r = el.getBoundingClientRect();
      const h = half();
      spot.style.transform = `translate3d(${(x - r.left - h).toFixed(1)}px, ${(y - r.top - h).toFixed(1)}px, 0)`;
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(place); };
    const show = (v: boolean) => { inside = v; spot.classList.toggle('on', v); };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !mq.matches || reduced()) { if (inside) show(false); return; }
      x = e.clientX; y = e.clientY;
      if (!inside) { show(true); place(); } else queue();   // first frame placed at once: no slide-in
    };
    const leave = () => show(false);
    const scroll = () => { if (inside) queue(); };       // the wall drifts under a still pointer
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerleave', leave);
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave);
      window.removeEventListener('scroll', scroll); cancelAnimationFrame(raf); show(false);
    };
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function HomeWall({ works, width, vh, bp, mode, newIds, onArrived, pin }: HomeWallProps) {
  const { display, rows, height, works: placed } = homeLayout(works, width, vh, bp, pin);
  const { open, onLift, overlay, lifted } = useWallInteractions();
  const { onTip, tipNode } = useTileTip();
  const layer = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const intro = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    // first layout with tiles in it: decide (once) whether this mount plays the S1 wave
    const el = layer.current;
    if (intro.current !== null || !el || width <= 0 || !works.length) return;
    intro.current = takeWallIntro();
    // inside a page crossfade the wall is already whole; after a route change it only fades in, quickly,
    // as under reduced motion (a wave from opacity 0 would show the page empty for its first beats)
    if (intro.current && !inPageFade()) playIntro(el, width, display ? 1 : Math.max(1, height), arrivedByRoute());
  }, [width, works.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useParallax(layer, wrap, !display);
  const spot = useRef<HTMLDivElement>(null);
  usePointerLight(layer, spot, !display && !lifted);
  const prevRects = useRef(new Map<string, { x: number; y: number; w: number; h: number }>());

  // Capture previous positions + run FLIP / crossfade after each layout change.
  useLayoutEffect(() => {
    const el = layer.current;
    if (!el) return;
    const tiles = [...el.querySelectorAll<HTMLElement>('[data-id]')];
    const next = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const t of tiles) next.set(t.dataset.id!, { x: t.offsetLeft, y: t.offsetTop, w: t.offsetWidth, h: t.offsetHeight });
    const rm = reduced();
    if (mode === 'flip' && newIds.length) {
      for (const t of tiles) {
        const id = t.dataset.id!;
        const now = next.get(id)!;
        const was = prevRects.current.get(id);
        if (newIds.includes(id)) {
          const kf = rm
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }];
          const a = t.animate(kf, { duration: rm ? DUR.reduced : DUR.place, easing: EASE.out, fill: 'backwards' });
          a.onfinish = () => { haptic('light'); onArrived?.(); };
          release(a);
        } else if (was && !rm && !display) {
          const dx = was.x - now.x;
          const dy = was.y - now.y;
          if (dx || dy || was.w !== now.w) {
            release(t.animate(
              [{ transform: `translate(${dx}px, ${dy}px) scale(${was.w / now.w}, ${was.h / now.h})` }, { transform: 'none' }],
              { duration: DUR.page, easing: EASE.out },
            ));
          }
        }
      }
    }
    prevRects.current = next;
  }, [rows, mode, newIds, works, display]); // eslint-disable-line react-hooks/exhaustive-deps

  // Crossfade (batch arrivals, tier changes): the previous wall stays on top and fades out.
  const [ghost, setGhost] = useState<{ works: Work[]; key: number } | null>(null);
  const prevWorks = useRef(works);
  useLayoutEffect(() => {
    if (prevWorks.current !== works && mode === 'fade' && prevWorks.current.length) {
      setGhost({ works: prevWorks.current, key: Date.now() });
      const t = setTimeout(() => setGhost(null), reduced() ? DUR.reduced : DUR.page);
      prevWorks.current = works;
      return () => clearTimeout(t);
    }
    prevWorks.current = works;
  }, [works, mode]);

  const wallH = display ? 0 : height;
  return (
    <div className={`wall-wrap ${display ? 'is-display' : ''}`} ref={wrap} style={{ height: display ? 'var(--wall-display-h)' : wallH }}>
      {ghost && <StaticWall works={ghost.works} width={width} vh={vh} bp={bp} pin={pin} key={ghost.key} />}
      <div
        className={`wall ${display ? 'display' : ''} ${lifted ? 'dimmed' : ''} ${ghost ? 'fresh' : ''}`}
        ref={layer}
        style={{ height: display ? undefined : wallH }}
        onKeyDown={wallArrowKeys}
        aria-label="封面墙"
      >
        {display
          ? <Display works={works} width={width} bp={bp} newIds={mode === 'flip' ? newIds : []} />
          : rows.flatMap((r, ri) => r.tiles.map((t, ti) => {
              const w = placed[t.index];
              return <WallTile key={w.id} work={w} onOpen={open} onLift={onLift} onTip={onTip} tabStop={ri === 0 && ti === 0} lead={t.h > r.h} style={{ left: t.x, top: t.y, width: t.w, height: t.h, '--row': ri } as CSSProperties} />;
            }))}
        {!display && <div className="wall-light" aria-hidden />}
        {!display && <div className="wall-pointer" ref={spot} aria-hidden />}
      </div>
      {overlay}
      {!lifted && tipNode}
    </div>
  );
}

/** 陈列 (1–4, or too few to fill a row): covers stand on the paper like objects, one centred row, gap 12; 240 high on desktop. */
function Display({ works, width, bp, newIds }: { works: Work[]; width: number; bp: Breakpoint; newIds: string[] }) {
  const nav = useNavigate();
  const big = WALL_TIERS[0].H[bp];
  let H = bp === 'desktop' || bp === 'wide' ? big : works.length <= 2 ? big : Math.round(big * 0.76);
  const gap = 12;
  const avail = width - 40;
  const total = works.reduce((s, w) => s + wallAspectOf(w) * H, 0) + gap * (works.length - 1);
  if (total > avail) H = Math.floor(H * (avail - gap * (works.length - 1)) / (total - gap * (works.length - 1)));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = (e.target as HTMLElement).closest<HTMLButtonElement>('.display-item');
    if (!cur || e.altKey || e.metaKey || e.ctrlKey) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.display-item')];
    const i = items.indexOf(cur);
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? items[i + 1]
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? items[i - 1]
      : e.key === 'Home' ? items[0]
      : e.key === 'End' ? items[items.length - 1]
      : undefined;
    if (!next || next === cur) return;
    e.preventDefault();
    e.stopPropagation();
    cur.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  };
  return (
    <div className="display-row" data-id="display" onKeyDown={onKey}>
      {works.map((w, i) => (
        <button
          key={w.id}
          className={`display-item ${newIds.includes(w.id) ? 'drop' : ''}`}
          tabIndex={i === 0 ? 0 : -1}
          data-ctx={w.id}
          onClick={(e) => {
            const c = e.currentTarget.querySelector<HTMLElement>('.cover');
            if (c) c.style.viewTransitionName = HERO;
            markFlight(w.id);
            withViewTransition(() => nav(`/entry/${w.id}`), 'flight').then(() => { if (c) c.style.viewTransitionName = ''; });
          }}
          aria-label={w.title}
        >
          <Cover work={w} w={Math.round(wallAspectOf(w) * H)} h={H} paperPlaceholder />
        </button>
      ))}
    </div>
  );
}

/** Non-interactive copy of a wall, used as the fading-out layer of a crossfade. */
function StaticWall({ works, width, vh, bp, pin }: { works: Work[]; width: number; vh: number; bp: Breakpoint; pin?: string | null }) {
  const { display, rows, height, works: placed } = homeLayout(works, width, vh, bp, pin);
  const noop = () => {};
  if (display) return <div className="wall ghost display" aria-hidden><Display works={works} width={width} bp={bp} newIds={[]} /></div>;
  return (
    <div className="wall ghost" style={{ height }} aria-hidden>
      {rows.flatMap((r) => r.tiles.map((t) => {
        const w = placed[t.index];
        return <WallTile key={w.id} work={w} onOpen={noop} onLift={noop} lead={t.h > r.h} style={{ left: t.x, top: t.y, width: t.w, height: t.h }} />;
      }))}
    </div>
  );
}
