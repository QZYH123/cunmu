import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface TocItem { id: string; label: string; count?: number }

/**
 * Entry table of contents (§8.3.2): sticky under the desktop bar, only with ≥ 2 sections. The current
 * section is ink 500 and a 2px ink bar slides to it; the colophon and seal sit at the bottom.
 */
export function TocRail({ items, current, onJump, footer }: {
  items: TocItem[]; current: string; onJump: (id: string) => void; footer?: ReactNode;
}) {
  const list = useRef<HTMLOListElement>(null);
  const [bar, setBar] = useState<{ top: number; height: number } | null>(null);
  const cur = items.some((it) => it.id === current) ? current : items[0]?.id ?? '';
  const sig = items.map((it) => it.id).join('|');
  useLayoutEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(cur)}"]`);
    setBar(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
  }, [cur, sig]);
  if (items.length < 2) return null;
  return (
    <nav className="toc" aria-label="目录">
      <div className="toc-scroll">
        <ol className="toc-list" ref={list}>
          {items.map((it) => (
            <li key={it.id}>
              <button
                data-id={it.id}
                className={it.id === cur ? 'on' : ''}
                aria-current={it.id === cur ? 'location' : undefined}
                onClick={() => onJump(it.id)}
              >
                {it.label}
                {it.count !== undefined && <span className="count"> · {it.count}</span>}
              </button>
            </li>
          ))}
          {bar && <li className="toc-bar" style={{ top: bar.top, height: bar.height }} aria-hidden />}
        </ol>
        {footer && <div className="toc-foot">{footer}</div>}
      </div>
    </nav>
  );
}
