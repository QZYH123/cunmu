import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BP, breakpointOf, type Breakpoint } from '../tokens';

const viewportW = () => document.documentElement.clientWidth || window.innerWidth;

/** Width of the app column (for wall layout); re-measured on resize. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(viewportW);
  useLayoutEffect(() => {
    const el = ref.current?.closest('.app') as HTMLElement | null;
    if (!el) return;
    const f = () => setW(el.clientWidth);
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Content width of the element itself (grids and shelves that sit inside a container or column). */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const f = () => setW(el.clientWidth);
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ---------- viewport breakpoint (§8.1) ---------- */

const queries = [BP.tablet, BP.desktop, BP.wide].map((px) => `(min-width: ${px}px)`);
function subscribe(cb: () => void) {
  const mqs = queries.map((q) => matchMedia(q));
  mqs.forEach((m) => m.addEventListener('change', cb));
  return () => mqs.forEach((m) => m.removeEventListener('change', cb));
}
// window.innerWidth includes a classic scrollbar, exactly like the CSS media queries do.
const snapshot = (): Breakpoint => breakpointOf(window.innerWidth);

/** phone < 640 · tablet 640–1023 · desktop 1024–1439 · wide ≥ 1440, following the CSS @media blocks. */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, snapshot);
}

export const isDesk = (bp: Breakpoint) => bp === 'desktop' || bp === 'wide';

/** Viewport width as the CSS media queries see it, re-read on resize. */
export function useViewportW(): number {
  return useSyncExternalStore(
    (cb) => { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb); },
    () => window.innerWidth,
  );
}

/** Viewport height, re-read on resize (wall height cap). */
export function useViewportH(): number {
  return useSyncExternalStore(
    (cb) => { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb); },
    () => window.innerHeight,
  );
}
