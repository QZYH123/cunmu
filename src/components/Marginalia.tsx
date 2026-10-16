import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { KIND_LABEL } from '../data/types';
import { Avatar, Cover, thumbSize } from './Cover';
import { MARGINALIA } from '../tokens';

interface Note { target: string; y: number }

/**
 * Desktop marginalia (§7.6-3): for every automatic link in the essay body, a note in the right
 * column, its top on the link's line — 28×42 cover (people: 28px round) + name + one caption line.
 * Notes keep ≥ 12px apart and slide down when crowded; one pushed more than 120px is dropped, and
 * no screen-height of text carries more than 4. Hovering a link lights its note and vice versa.
 */
export function Marginalia({ body, lit, onLit }: { body: RefObject<HTMLElement>; lit?: string; onLit: (t?: string) => void }) {
  const { d } = useStore();
  const [notes, setNotes] = useState<Note[]>([]);
  const self = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const root = body.current;
    if (!root || !self.current) return;
    const place = () => {
      const top0 = self.current!.getBoundingClientRect().top;
      const seen = new Set<string>();
      const out: Note[] = [];
      let floor = -Infinity;
      for (const a of root.querySelectorAll<HTMLElement>('.autolink[data-target]')) {
        const t = a.dataset.target!;
        if (seen.has(t)) continue;
        seen.add(t);
        const line = a.getClientRects()[0]?.top ?? a.getBoundingClientRect().top;
        const want = line - top0;
        const y = Math.max(want, floor);
        if (y - want > MARGINALIA.maxPush) continue;
        if (out.filter((n) => n.y > y - window.innerHeight).length >= MARGINALIA.perScreen) continue;
        out.push({ target: t, y });
        floor = y + MARGINALIA.noteH + MARGINALIA.gap;
      }
      setNotes(out);
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(root);
    document.fonts?.ready.then(place);
    return () => ro.disconnect();
  }, [body, d]);
  return (
    <aside className="marginalia" aria-label="旁注" ref={self}>
      {notes.map((n) => {
        const w = d.byId.get(n.target);
        const p = w ? undefined : d.persons.get(n.target);
        if (!w && !p) return null;
        const [tw, th] = w ? thumbSize(w, 28) : [28, 28];
        return (
          <Link
            key={n.target}
            to={w ? `/entry/${w.id}` : `/person/${p!.id}`}
            className={`margin-note ${lit === n.target ? 'on' : ''}`}
            style={{ top: n.y }}
            onPointerEnter={() => onLit(n.target)}
            onPointerLeave={() => onLit(undefined)}
            onFocus={() => onLit(n.target)}
            onBlur={() => onLit(undefined)}
          >
            {w ? <Cover work={w} w={tw} h={th} className="thumb" /> : <Avatar name={p!.name} size={28} />}
            <span className="margin-text">
              <span className="margin-title ellipsis">{w ? w.title : p!.name}</span>
              <span className="t-caption c-3 ellipsis">
                {w ? [KIND_LABEL[w.kind], w.year].filter(Boolean).join(' · ') : `${p!.works.length} 部`}
              </span>
            </span>
          </Link>
        );
      })}
    </aside>
  );
}
