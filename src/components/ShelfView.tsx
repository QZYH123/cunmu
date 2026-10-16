import { useRef } from 'react';
import { LayoutGrid, Library } from 'lucide-react';
import type { YearView } from '../data/store';

/**
 * r19 how the years are shown — 书脊 or 封面 — as a small two-icon switch with its words for assistive tech
 * and the pointer's tooltip. One choice for every row of years (索引 · 年份, 我 · 一年年, the colophon row),
 * remembered on the device. A radio group: Tab lands on the chosen one, ← → choose.
 */
const OPTS: { v: YearView; label: string; Icon: typeof Library }[] = [
  { v: 'spines', label: '书脊', Icon: Library },
  { v: 'covers', label: '封面', Icon: LayoutGrid },
];

export function ShelfViewToggle({ value, onChange, className = '' }: { value: YearView; onChange: (v: YearView) => void; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={wrap}
      className={`shelf-view ${className}`}
      role="radiogroup"
      aria-label="显示为"
      onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const i = OPTS.findIndex((o) => o.v === value);
        const j = (i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + OPTS.length) % OPTS.length;
        onChange(OPTS[j].v);
        wrap.current?.querySelectorAll<HTMLButtonElement>('button')[j]?.focus();
      }}
    >
      {OPTS.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          aria-label={label}
          title={label}
          tabIndex={v === value ? 0 : -1}
          className={v === value ? 'on' : ''}
          onClick={() => onChange(v)}
        >
          <Icon aria-hidden strokeWidth={1.5} />
          <span className="shelf-view-word">{label}</span>
        </button>
      ))}
    </div>
  );
}
