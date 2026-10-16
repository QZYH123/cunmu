import { useEffect, useRef, useState } from 'react';
import { PAGE_RAIL as R } from '../tokens';
import { reduced } from '../lib/motion';

/**
 * r18 the page's own scroll expression, in place of the system bar (which is hidden on every platform): a
 * hairline thumb at the right edge, between the bars, the same ink as the shelf rail (ScrollRail). It shows
 * while the page moves — a swipe, a wheel, a key, a jump — and fades a moment after; with a mouse it also
 * wakes when the pointer comes to the edge. The thumb can be dragged on touch and with a mouse to travel the
 * page fast. On a long page whose sections carry `data-rail-label` (索引 · 年份: each year) the label of the
 * section in view rides beside the thumb, so dragging reads as a ruler.
 * The page stays the scroller, so keys, the screen reader and the system's own gestures are untouched; the
 * indicator is decorative to assistive tech. Asleep it takes no pointer at all; awake only the thumb's own
 * narrow band does, never the content beside it.
 */
export const railLabelAt = (tops: { label: string; top: number }[], line: number) => {
  let cur = '';
  for (const t of tops) { if (t.top <= line) cur = t.label; else break; }
  return cur || (tops[0]?.label ?? '');
};

export function PageRail() {
  const box = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const [awake, setAwake] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [runsOn, setRunsOn] = useState(false);
  const [label, setLabel] = useState('');
  const geo = useRef({ th: 0, H: 0, over: 0 });
  const drag = useRef({ on: false, grab: 0 });

  useEffect(() => {
    let timer = 0, edge = false, raf = 0;
    const sleepSoon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => { if (!edge && !drag.current.on) setAwake(false); }, R.idle); };
    const place = () => {
      raf = 0;
      const b = box.current, t = thumb.current;
      if (!b || !t) return;
      const de = document.documentElement;
      const vh = window.innerHeight, sh = de.scrollHeight, over = sh - vh;
      setRunsOn(over > R.minOver);
      const H = b.clientHeight;
      const th = Math.max(R.minThumb, (H * vh) / Math.max(1, sh));
      const y = over > 0 ? (Math.min(over, Math.max(0, window.scrollY)) / over) * (H - th) : 0;
      geo.current = { th, H, over };
      t.style.height = `${th.toFixed(1)}px`;
      t.style.transform = `translateY(${y.toFixed(1)}px)`;
      // the ruler: only on a page long enough to want one
      const marks = sh > vh * R.rulerPages ? document.querySelectorAll<HTMLElement>('[data-rail-label]') : [];
      if (marks.length > 1) {
        const tops = Array.from(marks, (m) => ({ label: m.dataset.railLabel || '', top: m.getBoundingClientRect().top }));
        setLabel(railLabelAt(tops, vh * R.readAt));
      } else setLabel('');
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(place); };
    const onScroll = () => { schedule(); setAwake(true); sleepSoon(); };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const near = window.innerWidth - e.clientX <= R.edge;
      if (near === edge) return;
      edge = near;
      if (near) { schedule(); setAwake(true); window.clearTimeout(timer); } else sleepSoon();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('pointermove', onMove, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    place();
    return () => {
      window.clearTimeout(timer); if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('pointermove', onMove);
      ro.disconnect();
    };
  }, []);

  const scrollTo = (clientY: number, smooth: boolean) => {
    const b = box.current;
    if (!b) return;
    const { th, H, over } = geo.current;
    const y = clientY - b.getBoundingClientRect().top - drag.current.grab;
    const top = (Math.min(H - th, Math.max(0, y)) / Math.max(1, H - th)) * over;
    window.scrollTo({ top, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const r = thumb.current!.getBoundingClientRect();
    const onThumb = e.clientY >= r.top && e.clientY <= r.bottom;
    drag.current = { on: true, grab: onThumb ? e.clientY - r.top : geo.current.th / 2 };
    if (!onThumb) scrollTo(e.clientY, e.pointerType === 'mouse');
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onMove = (e: React.PointerEvent) => { if (drag.current.on) scrollTo(e.clientY, false); };
  const end = () => { drag.current.on = false; setDragging(false); };

  return (
    <div
      ref={box}
      className={`prail ${runsOn && (awake || dragging) ? 'is-awake' : ''} ${dragging ? 'is-dragging' : ''} ${runsOn ? '' : 'is-still'}`}
      aria-hidden
    >
      <span
        ref={thumb}
        className="prail-thumb"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {label && <span className="prail-label">{label}</span>}
      </span>
    </div>
  );
}
