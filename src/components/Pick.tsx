import { useCallback, useEffect, useState } from 'react';
import type { Work } from '../data/types';
import { DateSheet } from './DateSheet';

export interface Picker {
  on: boolean;
  has: (id: string) => boolean;
  toggle: (w: Work) => void;
  start: () => void;
  stop: () => void;
  count: number;
}

/**
 * 「选几部」 (STYLE v0.4 §3.14.3): pick some covers, put them all in one year. Esc, 「取消」 and the
 * 归 itself end it. Sample works can't be picked (they're only to look at).
 */
export function usePicker(): Picker {
  const [on, setOn] = useState(false);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const stop = useCallback(() => { setOn(false); setIds(new Set()); }, []);
  useEffect(() => {
    if (!on) return;
    // Android back reads this (lib/shell.ts): while picking, back ends the picking first
    document.documentElement.dataset.picking = '1';
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.sheet, .ds-pop')) stop(); };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); delete document.documentElement.dataset.picking; };
  }, [on, stop]);
  return {
    on, count: ids.size,
    has: (id) => ids.has(id),
    toggle: (w) => { if (w.isSample) return; setIds((p) => { const n = new Set(p); n.has(w.id) ? n.delete(w.id) : n.add(w.id); return n; }); },
    start: () => { setIds(new Set()); setOn(true); },
    stop,
  };
}

/** the top-right text button: 「选几部」 ⇄ 「取消」 */
export function PickToggle({ p }: { p: Picker }) {
  return <button className="btn-text quiet pick-toggle" onClick={p.on ? p.stop : p.start}>{p.on ? '取消' : '选几部'}</button>;
}

/** the floating bar at the bottom, and the 「归到……」 sheet it opens */
export function PickBar({ p, works }: { p: Picker; works: Work[] }) {
  const [k, setK] = useState(0);
  const [open, setOpen] = useState(false);
  const picked = works.filter((w) => p.has(w.id));
  return (
    <>
      {p.on && (
        <div className="pick-bar" role="region" aria-label="选几部">
          <span className="t-caption c-3" aria-live="polite">{picked.length ? `选了 ${picked.length} 部` : '点封面来选'}</span>
          <button className="pick-go" disabled={!picked.length} onClick={() => { setK((x) => x + 1); setOpen(true); }}>归到……</button>
        </div>
      )}
      {k > 0 && <DateSheet key={k} multi works={picked} open={open} onClose={() => setOpen(false)} onApplied={p.stop} />}
    </>
  );
}
