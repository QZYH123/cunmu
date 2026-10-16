import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { haptic } from '../lib/motion';
import { RAIL } from '../tokens';

export interface RailMark { label: string; y: number }

/**
 * The year rail (r5 #1; no name in the UI, only year labels): the full wall's right edge as a core sample. Each year takes the length of the
 * rail that it takes on the wall; a tick marks where one gives way to the next. Press and drag
 * along it (or click a year) and the wall follows; ↑ / ↓ step a year at a time. On a phone it
 * surfaces while the wall moves — like a scroll indicator, but it knows the years.
 */
export function CoreRail({ marks, height, top, vh, scroll, under, active, onScrub, current }: {
  marks: RailMark[];
  /** the wall's height, and its offset in the document */
  height: number; top: number;
  vh: number; scroll: number;
  /** px of the viewport covered by the bars on top of the wall */
  under: number;
  /** visible (a phone shows it only while the wall moves or is being scrubbed) */
  active: boolean;
  onScrub: (on: boolean) => void;
  current: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [railH, setRailH] = useState(0);
  const [drag, setDrag] = useState(false);
  const last = useRef('');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const f = () => setRailH(el.getBoundingClientRect().height);
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = height > 0 ? railH / height : 0;
  // labels that don't crowd each other (the newest of a crowd keeps its label)
  const labelled = useMemo(() => {
    const out = new Set<number>();
    let prev = -Infinity;
    marks.forEach((m, i) => { const p = m.y * k; if (p - prev >= RAIL.labelGap) { out.add(i); prev = p; } });
    return out;
  }, [marks, k]);

  const go = (clientY: number) => {
    const el = ref.current;
    if (!el || !height) return;
    const r = el.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    const y = top + p * height - under;
    window.scrollTo(0, Math.max(0, y));
    // a light tick each time the finger crosses into another year
    const at = [...marks].reverse().find((m) => m.y <= p * height)?.label ?? '';
    if (at && at !== last.current) { if (last.current) haptic('selection'); last.current = at; }
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = current;
    setDrag(true); onScrub(true);
    go(e.clientY);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => { if (drag) go(e.clientY); };
  const onUp = () => { if (!drag) return; setDrag(false); onScrub(false); };
  const jump = (i: number) => { const m = marks[Math.max(0, Math.min(marks.length - 1, i))]; if (m) window.scrollTo(0, Math.max(0, top + m.y - under)); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = Math.max(0, marks.findIndex((m) => m.label === current));
    const map: Record<string, number> = { ArrowUp: i - 1, ArrowDown: i + 1, PageUp: i - 1, PageDown: i + 1, Home: 0, End: marks.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    jump(map[e.key]);
  };

  const thumbTop = Math.max(0, (scroll - top + under) * k);
  const thumbH = Math.max(RAIL.thumbMin, (vh - under) * k);
  const pct = height > vh ? Math.round(Math.min(1, Math.max(0, (scroll - top + under) / (height - vh + under))) * 100) : 0;
  return (
    <div
      ref={ref}
      className={`core-rail ${active || drag ? 'on' : ''} ${drag ? 'dragging' : ''}`}
      role="slider" tabIndex={0} aria-label="按年份跳转" aria-orientation="vertical"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={current}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
    >
      <i className="core-line" aria-hidden />
      {marks.map((m, i) => (
        <span key={m.label} className={`core-mark ${m.label === current ? 'is-here' : ''}`} style={{ transform: `translateY(${Math.round(m.y * k)}px)` }} aria-hidden>
          {labelled.has(i) && m.label !== '时间未知' && <span className="core-label">{m.label}</span>}
        </span>
      ))}
      <i className="core-thumb" style={{ transform: `translateY(${Math.round(thumbTop)}px)`, height: Math.round(Math.min(thumbH, railH)) }} aria-hidden />
    </div>
  );
}
