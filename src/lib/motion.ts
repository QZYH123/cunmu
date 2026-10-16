import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigationType } from 'react-router-dom';
import { DUR, EASE } from '../tokens';
import { tick } from './shell';

export const reduced = () =>
  document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Haptics map (§2.7): light = 入库 / 长按, selection = slider step, medium = slider default. */
export function haptic(kind: 'light' | 'selection' | 'medium') {
  tick(kind);
}

type VT = { finished: Promise<void>; ready: Promise<void> };
type VTDoc = Document & { startViewTransition?: (cb: () => void | Promise<void>) => VT };

/**
 * Shared-element navigation via the View Transitions API (falls back to a plain update).
 * `kind` tags <html data-vt> for the duration so CSS can time the S2 flight (§7.3): 'flight' is
 * wall → entry (520ms), 'back' the return (440ms). Reduced motion: no flight, the page's own
 * 150ms fade does the work.
 */
/** flight / back: a cover flies; theme: one quick crossfade of the whole page; show: into / out of 给人看, the bars trade places in one fade (P0-8); page: a page crossfade (the 随笔 title flight, the first import). */
export type VTKind = 'flight' | 'back' | 'theme' | 'show' | 'page';
export function withViewTransition(update: () => void | Promise<void>, kind?: VTKind): Promise<void> {
  const d = document as VTDoc;
  if (!d.startViewTransition || reduced()) { const r = update(); return Promise.resolve(r).then(() => undefined); }
  const root = document.documentElement;
  if (kind) root.dataset.vt = kind;
  const vt = d.startViewTransition(() => {
    let r: void | Promise<void> = undefined;
    flushSync(() => { r = update(); });
    return r;
  });
  if (kind === 'flight' || kind === 'back') vt.ready.then(() => { const f = compositeFlight(); if (f) vt.finished.finally(() => f.cancel()); }, () => undefined);
  const done = vt.finished.catch(() => undefined).then(() => { if (root.dataset.vt === kind) delete root.dataset.vt; });
  running = done;
  done.then(() => { if (running === done) running = null; });
  return done;
}

/** A page is mounting inside a page crossfade (the 随笔 title flight, the first import): the crossfade is
 *  its entrance, so nothing on it should also start from opacity 0 (that reads as a blank flash). */
export const inPageFade = () => document.documentElement.dataset.vt === 'page';

/** The view transition in flight, if any: dynamic signatures wait for it (one at a time, §7). */
let running: Promise<void> | null = null;
export const transitionIdle = (): Promise<void> => running ?? Promise.resolve();

/**
 * A route change is a cut, on every device (MOTION-SPEC P1-1, as under reduced motion): no view
 * transition; the new page fades in once, quickly, without the rise, and the tab line grows under its
 * tab. Wraps the router's navigate so no call site changes; a navigation inside another transition
 * (a cover flight, an essay title) is left to it. A page already seen comes back on ‹ as it was.
 */
type Nav = (to: unknown, opts?: unknown) => Promise<void>;
let arriving = false;
/** A page is mounting because of a route change (not a flight, not the first open). */
export const arrivedByRoute = () => arriving;
export function routeArrivals(router: { navigate: Nav }) {
  const raw = router.navigate.bind(router);
  router.navigate = (to, opts) => {
    if (running) return raw(to, opts);
    arriving = true;
    // the router settles a beat after its promise: one task later the new page has mounted
    return raw(to, opts).finally(() => window.setTimeout(() => { arriving = false; }, 0));
  };
}

/**
 * The UA flies ::view-transition-group by animating width and height as well as transform, and
 * width / height cannot run on the compositor: Chromium lays the group out on the main thread every
 * frame — the same frames in which the new page is mounting (trace, polish r3). This swaps it for a
 * transform-only flight that also never stretches (polish r4):
 *
 * - the group stays at its end size, scaled non-uniformly (sx, sy) from the tile's box to the hero's
 *   (transform-origin 0 0), and clips (wall.css) — so it is a window whose edges follow the UA path;
 * - inside it each snapshot is laid out at its own aspect (object-fit: contain) and counter-scaled
 *   so its net scale is uniform and just covers the window — the tile starts exactly as it sat on
 *   the wall, the hero ends exactly as it stands, and in between both crop, never squash;
 * - keyframes are sampled from the stylesheet's easing (FLIGHT_STEPS), linear between, so the
 *   window and the counter-scale stay in step. Transform only; the UA's opacity cross-fade remains.
 */
const GROUP = '::view-transition-group(hero-cover)';
const OLD = '::view-transition-old(hero-cover)';
const NEW = '::view-transition-new(hero-cover)';
const FLIGHT_STEPS = 32;
function compositeFlight(): { cancel: () => void } | undefined {
  const a = document.getAnimations().find((x) => (x.effect as KeyframeEffect | null)?.pseudoElement === GROUP);
  const fx = a?.effect as KeyframeEffect | undefined;
  if (!a || !fx) return;
  const kf = fx.getKeyframes();
  const from = kf[0], to = kf[kf.length - 1];
  const [w0, h0, w1, h1] = [from.width, from.height, to.width, to.height].map((v) => parseFloat(String(v)));
  if (![w0, h0, w1, h1].every((v) => v > 0) || typeof from.transform !== 'string' || typeof to.transform !== 'string') return;
  let m0: DOMMatrix, m1: DOMMatrix;
  try { m0 = new DOMMatrix(from.transform); m1 = new DOMMatrix(to.transform); } catch { return; }
  if (m0.b || m0.c || m1.b || m1.c) return; // rotated or skewed: leave the UA's flight alone
  // duration and easing as the stylesheet set them for this kind (flight 520 / back 440)
  const cs = getComputedStyle(document.documentElement, GROUP);
  const dur = parseFloat(cs.animationDuration) * (/ms$/.test(cs.animationDuration) ? 1 : 1000);
  const ease = easingFn(typeof from.easing === 'string' && from.easing !== 'linear' ? from.easing : cs.animationTimingFunction);
  const duration = dur > 0 ? dur : Number(fx.getTiming().duration) || DUR.flight;
  a.cancel();
  // the window's box is the end box (w1 × h1); each snapshot is contain-fitted into it at its own aspect
  const fit = (ar: number) => (ar > w1 / h1 ? [w1, w1 / ar] : [h1 * ar, h1]);
  const [ow, oh] = fit(w0 / h0), [nw, nh] = fit(w1 / h1);
  const lerp = (x: number, y: number, p: number) => x + (y - x) * p;
  const g: Keyframe[] = [], o: Keyframe[] = [], n: Keyframe[] = [];
  for (let k = 0; k <= FLIGHT_STEPS; k++) {
    const p = ease(k / FLIGHT_STEPS), offset = k / FLIGHT_STEPS;
    const w = lerp(w0 * m0.a, w1 * m1.a, p), h = lerp(h0 * m0.d, h1 * m1.d, p);
    const sx = w / w1, sy = h / h1;
    g.push({ offset, transform: `translate(${lerp(m0.e, m1.e, p)}px, ${lerp(m0.f, m1.f, p)}px) scale(${sx}, ${sy})` });
    const cover = (cw: number, ch: number) => { const v = Math.max(w / cw, h / ch); return `scale(${(v * w1) / w}, ${(v * h1) / h})`; };
    o.push({ offset, transform: cover(ow, oh) });
    n.push({ offset, transform: cover(nw, nh) });
  }
  const root = document.documentElement;
  root.dataset.vtFit = '';
  const opts = { duration, easing: 'linear', fill: 'both' } as const;
  const anims = [root.animate(g, { ...opts, pseudoElement: GROUP }), root.animate(o, { ...opts, pseudoElement: OLD }), root.animate(n, { ...opts, pseudoElement: NEW })];
  // (cancelled when the transition ends: a filled animation would outlive its pseudo-element)
  return { cancel: () => { anims.forEach((x) => x.cancel()); delete root.dataset.vtFit; } };
}

/** CSS easing → function of progress (cubic-bezier and the keywords; anything else is linear). */
const NAMED: Record<string, number[]> = { ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
export function easingFn(css: string): (t: number) => number {
  const m = /cubic-bezier\(([^)]+)\)/.exec(css);
  const c = m ? m[1].split(',').map(Number) : NAMED[css.trim()];
  if (!c || c.length !== 4 || c.some(Number.isNaN)) return (t) => t;
  const [x1, y1, x2, y2] = c;
  const bz = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x) => {
    if (x <= 0 || x >= 1) return x;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 40; i++) { t = (lo + hi) / 2; if (bz(x1, x2, t) < x) lo = t; else hi = t; }
    return bz(y1, y2, t);
  };
}

/* ---------- S2: which entry is being flown into (read once by the entry page) ---------- */
// Read without clearing (StrictMode runs state initialisers twice); it expires on its own.
let flightTo: { id: string; at: number } | null = null;
export const markFlight = (id: string) => { flightTo = reduced() ? null : { id, at: performance.now() }; };
export const takeFlight = (id: string): boolean =>
  !!flightTo && flightTo.id === id && performance.now() - flightTo.at < DUR.flight * 2;

/** Poll (16ms steps, ≤ 320ms) until `find` returns something — used after a POP navigation.
 *  Timers, not rAF: rendering is paused while a view transition's update callback runs. */
export function waitFor<T>(find: () => T | null, tries = 20): Promise<T | null> {
  return new Promise((res) => {
    let n = 0;
    const tick = () => { const v = find(); if (v || ++n >= tries) res(v); else window.setTimeout(tick, POLL_MS); };
    window.setTimeout(tick, 0);
  });
}
const POLL_MS = 16;

/**
 * S3 sheen plays once per entry per session (§7.4-4). The spec keeps the set in memory only, but
 * also says a refresh must not replay a signature (§7) — so it lives in sessionStorage: gone with the
 * tab, kept across a reload. Never on a back / forward step (POP onto a history entry past the first).
 */
const SHEEN_KEY = 'cunmu/sheened';
const sheened: Set<string> = (() => { try { return new Set(JSON.parse(sessionStorage.getItem(SHEEN_KEY) || '[]')); } catch { return new Set(); } })();
export const sheenDue = (id: string, nav: string) =>
  !sheened.has(id) && !(nav === 'POP' && (history.state?.idx ?? 0) > 0);
export const markSheened = (id: string) => {
  if (sheened.has(id)) return;
  sheened.add(id);
  try { sessionStorage.setItem(SHEEN_KEY, JSON.stringify([...sheened].slice(-500))); } catch { /* private mode */ }
};

/** Content rises once on first visit; returning (POP) shows the page as it was. */
const seenKeys = new Set<string>();
export function useEnterClass(): string {
  const nav = useNavigationType();
  const { key } = useLocation();
  const [cls] = useState(() => {
    const seen = seenKeys.has(key);
    seenKeys.add(key);
    if (seen && nav === 'POP') return '';
    // inside a page crossfade the page only rises (the crossfade is its fade); after a route change it
    // only fades in, quickly (the cut, P1-1)
    return inPageFade() ? 'enter in-vt' : arrivedByRoute() ? 'enter by-route' : 'enter';
  });
  return cls;
}
export const wasSeen = (key: string) => seenKeys.has(key);

export function useScrolled(threshold = 4): boolean {
  const [s, set] = useState(false);
  useEffect(() => {
    const f = () => set(window.scrollY > threshold);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, [threshold]);
  return s;
}

/** Long press (350ms) with movement cancel; returns pointer handlers. */
export function useLongPress(onLong: (el: HTMLElement) => void, onTap?: (el: HTMLElement) => void) {
  const t = useRef<number>();
  const start = useRef<{ x: number; y: number; fired: boolean; el: HTMLElement } | null>(null);
  const clear = () => { if (t.current) window.clearTimeout(t.current); t.current = undefined; };
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const el = e.currentTarget;
      start.current = { x: e.clientX, y: e.clientY, fired: false, el };
      el.classList.add('pressed');
      clear();
      t.current = window.setTimeout(() => {
        if (!start.current) return;
        start.current.fired = true;
        el.classList.remove('pressed');
        haptic('light');
        onLong(el);
      }, DUR.longPress);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (s && !s.fired && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) { clear(); s.el.classList.remove('pressed'); start.current = null; }
    },
    onPointerUp: () => {
      const s = start.current;
      clear();
      start.current = null;
      if (s) { s.el.classList.remove('pressed'); if (!s.fired) onTap?.(s.el); }
    },
    onPointerCancel: () => { clear(); start.current?.el.classList.remove('pressed'); start.current = null; },
    // desktop: right-click is the long press — the preview card opens at once, no native menu (§8.5)
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      if (e.shiftKey && matchMedia('(pointer: fine)').matches) return;   // Shift+right-click keeps the native menu
      e.preventDefault();
      if (matchMedia('(pointer: fine)').matches) { clear(); start.current = null; e.currentTarget.classList.remove('pressed'); onLong(e.currentTarget); }
    },
  };
}

/** Stagger delay for the first 6 list items (MOTION-SPEC §5.3 --stagger 30ms), others together. */
/** 随笔 (P1-4): an essay's title in the list and the essay page's h1 share this name, so it flies between them. */
export const TITLE_VT = 'essay-title';
let lastEssay = '';
export const noteEssay = (id: string) => { lastEssay = id; };
export const lastEssayOpen = () => lastEssay;

/**
 * 写一篇 (P1-5): the editor opens out of the button that asked for it, and a new essay lands in 随笔.
 * Both are one-shot notes, taken by the page that plays them.
 */
let openFrom: DOMRect | null = null;
let landing = '';
export const noteOpenFrom = (el: Element | null) => { openFrom = el && !reduced() ? el.getBoundingClientRect() : null; };
export const takeOpenFrom = () => { const r = openFrom; openFrom = null; return r; };
export const noteLanding = (id: string) => { landing = id; };
export const takeLanding = () => { const id = landing; landing = ''; return id; };

export const STAGGER_MAX = 6;
export const staggerStyle = (i: number): React.CSSProperties =>
  ({ animationDelay: `calc(var(--stagger) * ${Math.min(i, STAGGER_MAX)})` });

/**
 * FLIP for a list (MOTION-SPEC P0-4, P1-9): children marked data-flip="<key>" that moved since the last
 * render glide from where they were (transform only), so a row leaving or arriving never animates height.
 * Offsets, not viewport rects, so scrolling between renders moves nothing.
 */
export function useFlip(ref: React.RefObject<HTMLElement>) {
  const prev = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const now = new Map<string, number>();
    const still = reduced();
    for (const c of el.querySelectorAll<HTMLElement>(':scope > [data-flip]')) {
      const k = c.dataset.flip!, y = c.offsetTop;
      now.set(k, y);
      const was = prev.current.get(k);
      if (!still && was !== undefined && Math.abs(was - y) > 1) {
        c.animate([{ transform: `translateY(${was - y}px)` }, { transform: 'none' }], { duration: DUR.pop, easing: EASE.out });
      }
    }
    prev.current = now;
  });
}

/**
 * Resolves when what `el` is animating (it and its subtree: CSS transitions, keyframes, WAAPI) has
 * finished — the real end, not a guessed timeout (MOTION-SPEC P0-9). Looks one frame later so a class
 * just added has started its transition; with nothing running (reduced motion, no element) it waits
 * `fallback` ms, or the reduced duration.
 */
export function afterAnimations(el: Element | null | undefined, fallback: number): Promise<void> {
  return new Promise((done) => requestAnimationFrame(() => {
    const running = el?.isConnected ? el.getAnimations({ subtree: true })
      // a loop (a spinner inside) never finishes: only what ends counts
      .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity) : [];
    if (!running.length) { window.setTimeout(done, reduced() ? Math.min(fallback, DUR.reduced) : fallback); return; }
    Promise.all(running.map((a) => a.finished.catch(() => undefined))).then(() => done());
  }));
}
