import { useRef, useState } from 'react';
import { haptic } from '../lib/motion';

interface SliderProps {
  values: number[];
  value: number;
  defaultValue: number;
  onChange: (v: number) => void;
  leftLabel: string;
  rightLabel: string;
  resetting?: boolean;
  label: string;
}

/** Discrete slider (§3.11): 2px track, 24px thumb (28 while held), default dot + 「默认」, 44px hit area. */
export function Slider({ values, value, defaultValue, onChange, leftLabel, rightLabel, resetting, label }: SliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const idx = Math.max(0, values.indexOf(value));
  const defIdx = values.indexOf(defaultValue);
  const pct = (i: number) => (i / (values.length - 1)) * 100;
  const last = useRef(idx);

  const fromX = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (x - r.left) / r.width));
    return Math.round(t * (values.length - 1));
  };
  const set = (i: number) => {
    if (i === last.current) return;
    last.current = i;
    haptic(i === defIdx ? 'medium' : 'selection');
    onChange(values[i]);
  };
  last.current = idx;

  return (
    <div className="slider">
      <span className="slider-end t-caption c-3">{leftLabel}</span>
      <div
        className={`slider-hit ${active ? 'active' : ''} ${resetting ? 'resetting' : ''}`}
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={values.length - 1}
        aria-valuenow={idx}
        aria-valuetext={String(values[idx])}
        tabIndex={0}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setActive(true); set(fromX(e.clientX)); }}
        onPointerMove={(e) => { if (active) set(fromX(e.clientX)); }}
        onPointerUp={() => setActive(false)}
        onPointerCancel={() => setActive(false)}
        onKeyDown={(e) => {
          // ← → ±1, Shift ±5, Home / End jump to the ends (§8.5)
          const step = e.shiftKey ? 5 : 1;
          const max = values.length - 1;
          const to = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(max, idx + step)
            : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(0, idx - step)
            : e.key === 'Home' ? 0 : e.key === 'End' ? max : null;
          if (to === null) return;
          e.preventDefault();
          set(to);
        }}
      >
        <div className="slider-track" ref={track}>
          <div className="slider-fill" style={{ width: `${pct(idx)}%` }} />
          <div className="slider-thumb" style={{ left: `${pct(idx)}%` }} />
          {defIdx >= 0 && (
            <div className="slider-default" style={{ left: `${pct(defIdx)}%` }}>
              <i />
              <span className="t-caption c-3">默认</span>
            </div>
          )}
        </div>
      </div>
      <span className="slider-end t-caption c-3">{rightLabel}</span>
    </div>
  );
}
