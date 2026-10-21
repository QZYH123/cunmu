/**
 * 给人看 (CONCEPT v1): the phone handed to someone. Only what you put on 首页 and what it links to — the
 * interests, the periods, the works and essays they name — and nothing to change. No tab bar, no ···, no
 * date line, no suggestions, nothing 只给自己. The way out is to hold 「按住退出」 for a second (a light tick
 * says it let go); a tap does nothing, so a guest can't fall out of it. Android's back moves between the
 * pages that are open to them and, on 首页, stays.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMeView } from './MeParts';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useStore } from '../data/store';
import { DUR } from '../tokens';
import { tick } from '../lib/shell';
import { decodePart } from '../lib/decode';

/** the pages a guest can open; a work or essay only when it isn't 只给自己 */
export function openInShow(path: string, onlyMe: string[], hiddenPeriods: string[] = []): boolean {
  if (path === '/' || path === '') return true;
  const m = path.match(/^\/(interest|period|entry|essay)\/([^/]+)$/);
  if (!m) return false;
  if ((m[1] === 'entry' || m[1] === 'essay') && onlyMe.includes(decodePart(m[2]))) return false;
  // a period with nothing in it a guest can see is not shown, so not opened either
  if (m[1] === 'period' && hiddenPeriods.includes(decodePart(m[2]))) return false;
  return true;
}

/** in 给人看, a page that isn't open to a guest goes back to 首页; a link to one does nothing */
export function useShowGuard() {
  const { show, me } = useStore();
  const view = useMeView();
  const hidden = useMemo(() => (show ? me.periods.filter((p) => !view.periods.some((q) => q.id === p.id)).map((p) => p.id) : []), [show, me.periods, view.periods]);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    if (show && !openInShow(loc.pathname, me.onlyMe, hidden)) nav('/', { replace: true });
  }, [show, loc.pathname, hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!show) return;
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!a || a.hasAttribute('download')) return; // a file being handed over (the long image), not a way off the page
      const href = a.getAttribute('href') ?? '';
      const path = href.startsWith('#') ? href.slice(1).split('?')[0] : null;
      if (path === null || !openInShow(path, me.onlyMe, hidden)) { e.preventDefault(); e.stopPropagation(); }
    };
    // ⌘K, / and the other shortcuts lead to 搜索, 全部, ＋: not for a guest
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow')) return;
      if ((e.target as Element | null)?.closest?.('.showbar')) return;
      e.stopPropagation();
      if (e.metaKey || e.ctrlKey || e.key === '/' || e.key === '?') e.preventDefault();
    };
    document.addEventListener('click', click, true);
    window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('click', click, true); window.removeEventListener('keydown', key, true); };
  }, [show, me.onlyMe, hidden]);
}

/** the bar while showing: ‹ (off 首页), 「给人看」, and the hold-to-leave pill */
export function ShowBar() {
  const store = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const stop = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; setHolding(false); };
  const start = () => {
    if (timer.current) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null; setHolding(false); tick('light'); store.setShow(false);
      // the keyboard lands back on 「给人看」, where it came from, not on the page's top
      requestAnimationFrame(() => [...document.querySelectorAll<HTMLElement>('.desk-show, .mh-show')].find((b) => b.offsetParent)?.focus({ preventScroll: true }));
    }, DUR.showHold);
  };
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!store.show) return null;
  const home = loc.pathname === '/';
  return (
    <header className="showbar">
      <div className="showbar-l">
        {!home && <button className="icon-btn" aria-label="返回" onClick={() => (history.state?.idx > 0 ? nav(-1) : nav('/'))}><ChevronLeft strokeWidth={1.5} /></button>}
      </div>
      <div className="showbar-m" aria-hidden>给人看</div>
      <div className="showbar-r">
        <button
          className={`showbar-x ${holding ? 'on' : ''}`}
          aria-label="按住一秒，退出给人看"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); start(); }}
          onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}
          onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }}
          onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') stop(); }}
          onBlur={stop}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => e.preventDefault()}
        >按住退出</button>
      </div>
    </header>
  );
}
