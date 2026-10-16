import { useEffect, useRef, useState, type RefObject } from 'react';
import { SCROLL_RAIL as RAIL } from '../tokens';
import { reduced } from '../lib/motion';

/**
 * The scroll expression for a row that runs on sideways (r17), in place of a native bar: a hairline under the
 * row with a short thumb on it that says where the row is and how much there is. It shows only while the row
 * is in use — the pointer on it, a swipe or a wheel, focus inside it — and fades out a moment after. With a
 * mouse the thumb can be dragged and the hairline clicked to jump; on touch it only shows the place. The row
 * itself stays the scroller: keys, swipes, wheels and the screen reader work on it as before, so the rail is
 * decorative to assistive tech. It positions itself under its row (a sibling, same offset parent), as wide
 * as the row's content (inside its padding): below the row, or with `line` on the hairline the row's content
 * already stands on.
 */
export function ScrollRail({ target, line = false, className = '' }: {
  target: RefObject<HTMLElement | null>; line?: boolean; className?: string;
}) {
  const rail = useRef<HTMLSpanElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const [runsOn, setRunsOn] = useState(false);
  const [awake, setAwake] = useState(false);
  const [dragging, setDragging] = useState(false);
  const geo = useRef({ tw: 0, W: 0, over: 0 });

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    let timer = 0, inside = false, focused = false;
    const sleepSoon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => { if (!inside && !focused) setAwake(false); }, RAIL.idle); };
    const wake = () => { setAwake(true); sleepSoon(); };
    const place = () => {
      const r = rail.current, th = thumb.current;
      if (!r || !th) return;
      const over = el.scrollWidth - el.clientWidth;
      setRunsOn(over > 1);
      const cs = getComputedStyle(el);
      const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0, pb = parseFloat(cs.paddingBottom) || 0;
      const W = el.offsetWidth - pl - pr;
      r.style.left = `${el.offsetLeft + pl}px`;
      r.style.top = `${el.offsetTop + el.offsetHeight - (line ? pb : 0)}px`;
      r.style.width = `${W}px`;
      const tw = Math.max(RAIL.minThumb, (W * el.clientWidth) / Math.max(1, el.scrollWidth));
      const x = over > 0 ? (el.scrollLeft / over) * (W - tw) : 0;
      geo.current = { tw, W, over };
      th.style.width = `${tw.toFixed(1)}px`;
      th.style.transform = `translateX(${x.toFixed(1)}px)`;
    };
    const onScroll = () => { place(); wake(); };
    const enter = (e: PointerEvent) => { if (e.pointerType === 'mouse') { inside = true; setAwake(true); window.clearTimeout(timer); } };
    const leave = (e: PointerEvent) => { if (e.pointerType === 'mouse') { inside = false; sleepSoon(); } };
    const fin = () => { focused = true; setAwake(true); window.clearTimeout(timer); };
    const fout = (e: FocusEvent) => { if (!el.contains(e.relatedTarget as Node)) { focused = false; sleepSoon(); } };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('focusin', fin);
    el.addEventListener('focusout', fout);
    const r = rail.current;
    r?.addEventListener('pointerenter', enter);
    r?.addEventListener('pointerleave', leave);
    // the row's length changes as it renders further, and with the window
    const ro = new ResizeObserver(place);
    ro.observe(el);
    const mo = new MutationObserver(place);
    mo.observe(el, { childList: true });
    place();
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('focusin', fin);
      el.removeEventListener('focusout', fout);
      r?.removeEventListener('pointerenter', enter);
      r?.removeEventListener('pointerleave', leave);
      ro.disconnect(); mo.disconnect();
    };
  }, [target, line]);

  // with a mouse: drag the thumb, or click the hairline to bring that part of the row into view
  const grab = useRef(0);
  const scrollTo = (clientX: number, smooth: boolean) => {
    const el = target.current, r = rail.current;
    if (!el || !r) return;
    const { tw, W, over } = geo.current;
    const x = clientX - r.getBoundingClientRect().left - grab.current;
    const left = (Math.min(W - tw, Math.max(0, x)) / Math.max(1, W - tw)) * over;
    el.scrollTo({ left, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    e.preventDefault();
    const th = thumb.current!.getBoundingClientRect();
    const onThumb = e.clientX >= th.left && e.clientX <= th.right;
    grab.current = onThumb ? e.clientX - th.left : geo.current.tw / 2;
    if (!onThumb) { scrollTo(e.clientX, true); return; }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => { if (dragging) scrollTo(e.clientX, false); };
  const end = () => setDragging(false);

  return (
    <span
      ref={rail}
      className={`srail ${line ? 'on-line' : ''} ${runsOn && (awake || dragging) ? 'is-awake' : ''} ${dragging ? 'is-dragging' : ''} ${runsOn ? '' : 'is-still'} ${className}`}
      aria-hidden
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span ref={thumb} className="srail-thumb" />
    </span>
  );
}
