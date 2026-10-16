// JS-side tokens (durations / thresholds used by scripts). Mirrors tokens.css; keep the two in sync.
/** MOTION-SPEC v0.1 §5 — the same values as tokens.css (check-spec compares the two). */
export const M = { instant: 100, quick: 180, base: 260, space: 440, sign: 520, sheen: 700, tint: 600, reduced: 150 } as const;
export const DUR = {
  press: M.instant,
  fade: M.quick,
  pop: M.base,
  page: M.space,
  place: M.sign,
  wallIn: M.sign,      // S1 per-tile entrance (§7.2-5)
  flight: M.sign,      // S2 cover flight (§7.3)
  flightBack: M.space, // S2 return flight
  tint: M.tint,        // S4 ambient tint fade
  sheen: M.sheen,      // S3 cover sheen (§7.4-4)
  sheenDelay: 120,     // …starting this long after the cover settles
  stagger: 30,
  roll: M.base,
  reduced: M.reduced,
  // waits, not animations
  longPress: 350,
  toast: 4000,
  verifyKey: 1200,   // simulated key check in the WeRead sheet
  idleDelay: 1200,   // wait before hiding the year float / index rail
  linger: 2000,      // date picker: closes itself this long after the last tap (STYLE v0.4 §2.9 --dur-linger)
  hold: 1500,        // 删除全部内容: how long to hold (STYLE v0.4 §2.9 --dur-hold) — the hand, not an animation
  showHold: 1000,    // 给人看: how long to hold 「按住退出」
  readFile: 900,     // simulated reading / fetching in the import & connect sheets
} as const;

export const EASE = {
  out: 'cubic-bezier(.16,1,.3,1)',
  standard: 'cubic-bezier(.2,0,0,1)',
  in: 'cubic-bezier(.4,0,1,1)',
} as const;

export const PULL_TO_WALL = 72;
/** home's quiet 「也能一次带进来」 line: offered while the library is still small (fewer works than this) */
export const IMPORT_LINE_MAX = 30;

/** year rail (r5 #1): year labels on the rail keep ≥ labelGap px apart; the "you are here" window is ≥ thumbMin;
 *  the gutter the rail takes beside the wall on tablet / desktop (mirrors --rail-gutter). */
export const RAIL = { labelGap: 18, thumbMin: 12, gutter: 64 } as const;

/** 索引 · 年份 (r6 spines / r7 covers). Spines — `h`: the tallest per breakpoint; each kind stands at a share of
 *  it (`stand`, [low, high] picked by id hash, so books vary most and boxed media barely). `w`: a base width per
 *  kind (desktop px) + up to `thick` for substance (pages, episodes, reading hours) + up to `jitter` by hash;
 *  the phone multiplies by `phone`, never below `minW`; `gap` between spines. Covers — `coverH` per breakpoint,
 *  `coverGap` between them. Both rows run in the year's own order and scroll sideways: `ahead` widths are
 *  rendered past what has been seen, a 「‹ ›」 step moves `step` of the width. `endBare` is the
 *  air kept after the last spine (r18: no bookend stroke there; it read as a stray line). `fs` mirrors the spine title size in tokens.css (--t-spine-row); `pad` the paper above and below it.
 *  r8 `flip`: a pointed spine turns in place to show its cover (`faceAspect` clamps the cover's width at the
 *  spine's height) and the spines after it slide over: `ms` for the turn, a pointer rests `dwell` (a keyboard
 *  `keyDwell`) before it starts — moving faster than `slow` px/ms starts the wait over — so a sweep along a
 *  row turns nothing; a turned cover is kept `margin` inside
 *  the row's edge, `fade` / `fadeStart` inside an edge that fades (--s-10 / --s-9); for `selfScroll` after it
 *  scrolls a row itself, the scroll doesn't count as the reader's. Depth and shading: --flip-persp, --turn-shade. `look`: the share
 *  (of 100, by id hash) of spines with two hairline `bands` at head and foot, or a small paper `plate` under
 *  the title; plates only on spines at least `plateMinW` wide with titles of up to `plateMax` characters;
 *  `bandPad` more paper above and below a banded title. `wait` is how long a row holds back for its colours
 *  on a first visit. `mini`: the small rows (home 年份, a year's foot, 我) —
 *  a spine at `k` of its width (≥ `minW`), heights per place. */
export const SHELF = {
  h: { phone: 116, tablet: 128, desktop: 136, wide: 144 },
  stand: { book: [0.9, 1], anime: [0.93, 0.95], film: [0.89, 0.91], game: [0.85, 0.87], music: [0.76, 0.78], essay: [0.81, 0.84] },
  w: { book: 21, anime: 20, film: 17, music: 17, game: 21, essay: 17 },
  thick: 6, jitter: 3, phone: 0.9, minW: 16, gap: 2, endBare: 12,
  /** r19 封面 as a grid: each cover's width per breakpoint (its height follows its own shape) */
  grid: { phone: 92, tablet: 108, desktop: 116, wide: 124 },
  coverH: { phone: 56, tablet: 60, desktop: 56, wide: 60 }, coverGap: 4,
  ahead: 1.5, step: 0.8,
  fs: { phone: 11, desk: 12 }, pad: { top: 10, bottom: 8 },
  /** r17 titles: the size gives between these before a title takes two columns; a spine grows to `maxW` for
   *  a second column (a subtitle beside the name, or a long title balanced in two); `padX` each side */
  title: { fsMax: { phone: 12, desk: 13 }, fsMin: 11, maxW: { phone: 30, desk: 32 }, padX: 3, colGap: 2, step: 0.5 },
  faceAspect: [0.62, 1.05], wait: 450,
  flip: { ms: 420, dwell: 140, keyDwell: 60, slow: 0.15, margin: 12, fade: 56, fadeStart: 40, selfScroll: 900 },
  look: { book: { bands: 22, plate: 18 }, case: { bands: 0, plate: 0 }, music: { bands: 10, plate: 0 }, plateMinW: 19, plateMinWPhone: 17, plateMax: 7, bandPad: 7 },
  /** r17: each kind dressed as its own object (shares in %, sizes in px). Books: a headband, a paperback's
   *  smooth back, a foil title on a deep cloth (only where it keeps 4.5:1). Films: a slim case with a band
   *  holding the year's two digits, at the head or the foot. Games: a case with a platform strip. Anime: a
   *  disc case with a clear banner at the head, sometimes a paper obi. */
  dress: {
    book: { headband: 40, paperback: 35, foil: 45, foilMaxL: 0.45, headbandH: 3 },
    film: { foot: 35, frame: 50, bandH: 17 },
    game: { foot: 25, strip: [10, 14] },
    anime: { banner: 8, obi: 28, obiH: 20 },
    gap: 3,
  },
  sampleW: 16, sampleH: 24, parallel: 4, saveDelay: 800, notifyMs: 160,
  mini: { k: 0.4, minW: 5, gap: 1, side: 28, pager: 36, colophon: 44, colophonWide: 56, shelf: 72, shelfWide: 84, wideAt: 640 },
} as const;
/** r17 scroll rail: a hairline thumb that shows where a sideways row is, only while it is being used —
 *  pointed at, scrolled, focused — and goes `idle` ms after; never shorter than `minThumb` px */
export const SCROLL_RAIL = { idle: 1200, minThumb: 24 } as const;
/** r18 the page's scroll indicator (PageRail): asleep after `idle`; a thumb never shorter than `minThumb`; shown
 *  only when the page runs on by more than `minOver` px; a mouse within `edge` px of the right edge wakes it;
 *  section labels ride beside it on pages longer than `rulerPages` screens, naming the section at `readAt`
 *  of the screen's height. */
export const PAGE_RAIL = { idle: 1200, minThumb: 32, minOver: 24, edge: 24, rulerPages: 2, readAt: 0.35 } as const;
export const STAGGER_MAX = 8;

/** §8.1 breakpoints (min widths). Mirrors the @media blocks at the end of tokens.css. */
export const BP = { tablet: 640, desktop: 1024, wide: 1440 } as const;
export type Breakpoint = 'phone' | 'tablet' | 'desktop' | 'wide';
export const breakpointOf = (w: number): Breakpoint =>
  w >= BP.wide ? 'wide' : w >= BP.desktop ? 'desktop' : w >= BP.tablet ? 'tablet' : 'phone';

/** Home wall height cap as a share of the viewport (§7.2-1): phone also capped by the tier. */
export const WALL_CAP_VH: Record<Breakpoint, number> = { phone: 0.56, tablet: 0.6, desktop: 0.64, wide: 0.64 };

/** §3.9.2 wall tiers; target row height H per breakpoint from §8.3.1. On phone the tier's row
 *  count and cap still apply; on larger screens the row count follows from the height cap. */
export const WALL_TIERS = [
  { name: 'display', min: 1, max: 4, H: { phone: 168, tablet: 200, desktop: 240, wide: 240 }, rows: 1, cap: 220 },
  { name: 'large', min: 5, max: 29, H: { phone: 168, tablet: 200, desktop: 240, wide: 260 }, rows: 2, cap: 336 },
  { name: 'medium', min: 30, max: 199, H: { phone: 120, tablet: 144, desktop: 176, wide: 196 }, rows: 3, cap: 360 },
  { name: 'dense', min: 200, max: 1499, H: { phone: 84, tablet: 100, desktop: 144, wide: 160 }, rows: 5, cap: 420 },
  { name: 'woven', min: 1500, max: Infinity, H: { phone: 60, tablet: 72, desktop: 88, wide: 96 }, rows: 7, cap: 420 },
] as const;

/** Home wall lead tile: which tiers get one, how many rows it may span per breakpoint (desktop:
 *  every row of the wall), how far down the newest-first list to look for a real cover, and the
 *  widest share of the wall it may take (past that it spans one row fewer). */
/** Home wall lead tile. `window`: the lead is the visually strongest real cover among the newest
 *  `window` works (cover.strength, the demo kit's make-strength.mjs), each place further back costing
 *  `recency`; landscape covers (aspect > `wideAspect`) lose `widePenalty` — they cannot stand as
 *  a tall lead. Unmeasured covers count as `unknown`. A pinned work (「设为首页封面」) always leads. */
export const WALL_LEAD = {
  tiers: ['medium', 'dense', 'woven'], span: { phone: 3, tablet: 3, desktop: 9, wide: 9 }, maxShare: 0.46,
  window: 16, recency: 0.004, wideAspect: 1.2, widePenalty: 0.1, unknown: 0.5,
} as const;

/** Home wall: within the first `within` tiles, covers without art stay ≥ `gap` tiles apart; across the
 *  whole wall none sits beside or within `rows` rows above another — up to `restack` moves, each
 *  trying these offsets in order and kept only if the wall has fewer such pairs (polish r4). */
export const WALL_LITERAL_GAP = { within: 40, gap: 9, rows: 2, restack: 16, moves: [1, 2, 3, 4, 5, 6, 8, -1, -2, -3] } as const;
/** Wide screens: row height grows with the viewport past 1440 (×1 at 1440 → ×1.2 from 1728), so
 *  a 1920 wall keeps the covers' presence instead of turning into more, smaller thumbnails. */
export const WALL_WIDE_SCALE = { from: 1440, max: 1.2 } as const;

/** Desktop wall tile label (§7.2-7): dwell before it shows, linger after the pointer leaves. */
export const TILE_TIP = { show: 450, hide: 120, gap: 8 } as const;

/** Text-link hover preview (§8.5): dwell before the card, grace period to move into it. */
export const LINK_PREVIEW = { show: 500, grace: 150 } as const;

/** Entry hero cover width (§7.4 phone, §8.3.2 desktop). Phone: share of the viewport, capped. */
export const HERO_COVER: Record<Breakpoint, Record<'base' | 'music' | 'game', { vw: number; max: number }>> = {
  phone: { base: { vw: 0.52, max: 220 }, music: { vw: 0.64, max: 260 }, game: { vw: 0.56, max: 230 } },
  tablet: { base: { vw: 1, max: 240 }, music: { vw: 1, max: 280 }, game: { vw: 1, max: 250 } },
  desktop: { base: { vw: 1, max: 280 }, music: { vw: 1, max: 320 }, game: { vw: 1, max: 280 } },
  wide: { base: { vw: 1, max: 300 }, music: { vw: 1, max: 320 }, game: { vw: 1, max: 300 } },
};
/** ≥ 1280 the hero cover is exactly the TOC column (tokens.css --toc-w) so the title lines up with
 *  the reading column. Widths in px by min viewport width, widest first. */
export const ENTRY_COVER: [number, number][] = [[1600, 300], [1440, 264], [1280, 240]];
/** Epigraph length before it is cut with 「……」 (§7.4-3). */
export const EPIGRAPH_MAX = 60;

/** The entry TOC column appears from this width; below it the grid is reading column | side. */
export const ENTRY_TOC_MIN = 1280;
/** Infobox in the entry hero's side column (polish r4): ≤ `band` rows set as strip cells; from
 *  `fill` of the cover's height the box takes exactly the cover's height. */
export const INFO_FIT = { band: 2, fill: 0.8, pad: 10, tightPad: 6 } as const;
/** A section counts as current once its top passes the bar plus this offset (desktop adds the sticky gap). */
export const SPY_OFFSET = { phone: 8, desk: 48 } as const;
/** Side column stays sticky only while it fits: 100vh − 136 (§8.3.2). */
export const SIDE_STICKY_SLACK = 136;
/** Condensed 被提到 in the side column (§8.3.2). */
export const SIDE_MENTIONS = 5;

/** Category cover grid (§3.5; ≥ 640 auto-fill per §8.3.7). Gaps mirror .cat-grid in pages.css. */
/** Category table (§8.3.7, P2-4): 52px rows hold a 28×42 cover thumb (music 28×28). */
export const TABLE_THUMB = { w: 28, h: 42, row: 52 } as const;
export const CAT_GRID = { gapPhone: 12, gap: 24, min: 148, minWide: 168 } as const;

/** 整面墙 row height (§3.9.8; desktop 140 / wide 160 from §8.3.7). */
export const FULL_WALL_ROW: Record<Breakpoint, number> = { phone: 96, tablet: 112, desktop: 140, wide: 160 };
export const ROW_TOLERANCE = 0.18;

/** S1 entrance wave (§7.2-5): the last tile starts at most `spread` ms after the first. */
export const WALL_INTRO = { spread: 360, scale: 0.985, mastDelay: 240 } as const;
/** S1 parallax (§7.2-6): the wall moves at 0.6× the scroll speed, i.e. translateY(scrollY × 0.4). */
export const WALL_PARALLAX = 0.4;

/** Year collage (§4.2, desktop §8.3.4): columns per tier; on desktop at least 12 / 20, more once a
 *  cell would grow past ~`cell` px; desktop rows capped at `rows`. Object tiers scale ×1.6. */
export const COLLAGE = {
  deskScale: 1.6,
  block: { phone: 6, desk: 12, cell: 120, rows: 3 },
  tapestry: { phone: 10, desk: 20, cell: 72, rows: 4 },
} as const;

/** Desktop marginalia (§7.6-3): note height for spacing, min gap, max push, notes per screen. */
export const MARGINALIA = { noteH: 42, gap: 12, maxPush: 120, perScreen: 4 } as const;
/** S5 thresholds (§7.6): drop cap from 300 字, pull quote from 1,200 字; pull sentence length. */
export const EDITORIAL = { dropcap: 300, pull: 1200, pullMin: 6, pullMax: 80 } as const;

/** Person hero (polish r2): the works are the picture. A band (full-bleed justified rows, row height
 *  H, at most `rows`) when there are enough to fill a row; otherwise covers stand as objects at objH. */
export const PERSON_BAND: Record<Breakpoint, { H: number; rows: number; objH: number }> = {
  phone: { H: 132, rows: 2, objH: 200 },
  tablet: { H: 200, rows: 1, objH: 260 },
  desktop: { H: 240, rows: 1, objH: 300 },
  wide: { H: 264, rows: 1, objH: 330 },
};
/** Desktop objects shrink at most to this share of objH to fit the row (P2-3). */
export const OBJ_FIT_MIN = 0.75;
/** The monogram, now a small seal beside the role label. */
export const PERSON_SEAL = 26;   // 26 × .42 → an 11px initial, the type floor

/** Cold load: how long the entry text may wait for its serif CJK slices before showing anyway. */
export const FONT_WAIT_MS = 400;
