import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { openShortcutHelp } from '../lib/shortcutHelp';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useStore } from '../data/store';
import type { Kind, Work } from '../data/types';
import { KIND_LABEL, KIND_ORDER } from '../data/types';
import { creatorLine, whenOf } from '../data/derive';
import { Avatar, Cover, thumbSize } from './Cover';
import { HERO } from './CoverWall';
import { afterAnimations, markFlight, reduced, withViewTransition } from '../lib/motion';
import { BP, DUR } from '../tokens';
import { isDesktop } from '../lib/native';

/* ---------- results (shared by the palette and the /search page) ---------- */

export interface Hit { key: string; group: string; to: string; label: string; meta: string; work?: Work; person?: string; interest?: boolean; expand?: string }

/** a search's words, its opened groups and its current row: what 搜索 comes back to (in the URL and the
 *  history entry, so the in-app back, the Android back button and the browser's all find it) */
export interface SearchState { q: string; open: string[]; cur?: number }
export const searchPath = (q: string) => (q ? `/search?q=${encodeURIComponent(q)}` : '/search');
/** the search a /search history entry holds (its words from the URL, the rest from the entry's state) */
export function searchStateOf(loc: { search: string; state: unknown }): SearchState {
  const q = new URLSearchParams(loc.search).get('q')?.trim() ?? '';
  const st = (loc.state as { search?: Partial<SearchState> } | null)?.search;
  const open = Array.isArray(st?.open) && st?.q === q ? st.open.filter((g): g is string => typeof g === 'string') : [];
  return { q, open, ...(st?.q === q && typeof st.cur === 'number' ? { cur: st.cur } : null) };
}

/** Per-group cap before 「展开其余 N 条」 (UX r1: results used to stop at 40 with counts that looked complete). */
export const GROUP_CAP = 6;

/** Search over titles (and original titles), core creators, people, interests and years. */
export function searchLibrary(term: string, library: Work[], d: ReturnType<typeof useStore>['d']) {
  const t = term.trim().toLowerCase();
  const works = library.filter((w) => w.title.toLowerCase().includes(t) || w.originalTitle?.toLowerCase().includes(t)
    || w.credits.some((c) => c.core && c.name.toLowerCase().includes(t)));
  const people = [...d.persons.values()].filter((p) => p.name.toLowerCase().includes(t)).sort((a, b) => b.works.length - a.works.length);
  const interests = [...d.interests.entries()].filter(([g]) => g.toLowerCase().includes(t)).sort((a, b) => b[1].length - a[1].length);
  const years = [...d.years.keys()].filter((y) => String(y).includes(t));
  return { works, people, interests, years };
}

export function useSearchHits(term: string, expanded: Set<string> = new Set()): { hits: Hit[]; empty: boolean } {
  const { d, library } = useStore();
  return useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) {
      return {
        empty: false,
        hits: library.slice(0, 6).map((w) => ({
          key: w.id, group: '最近', to: w.kind === 'essay' ? `/essay/${w.id}` : `/entry/${w.id}`, label: w.title,
          meta: [KIND_LABEL[w.kind], creatorLine(w)].filter(Boolean).join(' · '), work: w,
        })),
      };
    }
    const r = searchLibrary(t, library, d);
    const capped = <T,>(group: string, xs: T[], make: (x: T) => Hit): Hit[] => {
      const open = expanded.has(group) || xs.length <= GROUP_CAP + 1;
      const shown = (open ? xs : xs.slice(0, GROUP_CAP)).map(make);
      return open ? shown : [...shown, { key: `more-${group}`, group, to: '', label: `展开其余 ${xs.length - GROUP_CAP} 条`, meta: '', expand: group }];
    };
    const hits: Hit[] = [
      ...capped('人物', r.people, (p) => ({ key: p.id, group: '人物', to: `/person/${p.id}`, label: p.name, meta: `${p.roles[0]} · ${p.works.length} 部`, person: p.name })),
      ...KIND_ORDER.flatMap((k: Kind) => capped(KIND_LABEL[k], r.works.filter((w) => w.kind === k), (w) => ({
        key: w.id, group: KIND_LABEL[k], to: k === 'essay' ? `/essay/${w.id}` : `/entry/${w.id}`, label: w.title,
        meta: [creatorLine(w), w.finished && whenOf(w, 'year')].filter(Boolean).join(' · '), work: w,
      }))),
      ...capped('兴趣', r.interests, ([g, ws]) => ({ key: `g-${g}`, group: '兴趣', to: `/index/interests?g=${encodeURIComponent(g)}`, label: g, meta: `${ws.length} 条`, interest: true })),
      ...r.years.map((y) => ({ key: `y${y}`, group: '年份', to: `/year/${y}`, label: String(y), meta: `${d.years.get(y)!.works.length} 条` })),
    ];
    return { hits, empty: !hits.length };
  }, [term, library, d, expanded]);
}

/** Matched characters in ink 600, the rest secondary — weight, never a colour highlight. */
function Hl({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <span>{text}</span>;
  return <>{text.slice(0, i)}<b className="hit">{text.slice(i, i + q.length)}</b>{text.slice(i + q.length)}</>;
}

/* ---------- the panel ---------- */

/**
 * Search command panel (§8.3.6): 640 wide at 14vh on desktop (or inline at 720 on /search). Arrow
 * keys move the current row, Enter opens (a work's thumbnail flies into its entry, §7.3),
 * ⌘/Ctrl-Enter opens in a new tab, Esc closes. Focus stays in the input (aria-activedescendant).
 */
export function PalettePanel({ inline, onClose, onAdd, onHelp, start, onState }: {
  inline?: boolean; onClose?: (now?: boolean) => void; onAdd?: (t: string) => void; onHelp?: () => void;
  /** where a search left off (搜索 on desktop, coming back from what it opened) */
  start?: SearchState; onState?: (s: SearchState) => void;
}) {
  const nav = useNavigate();
  const [q, setQ] = useState(start?.q ?? '');
  const [cur, setCur] = useState(start?.cur ?? 0);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(start?.open ?? []));
  // new words: the groups close and the first row is current (not on the way back, which keeps them)
  const lastQ = useRef(q);
  useEffect(() => { if (lastQ.current === q) return; lastQ.current = q; setExpanded(new Set()); setCur(0); }, [q]);
  useEffect(() => { onState?.({ q: q.trim(), open: [...expanded] }); }, [q, expanded]); // eslint-disable-line react-hooks/exhaustive-deps
  const { hits, empty } = useSearchHits(q, expanded);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const uid = useId();
  // (no scroll: coming back, the page is where it was)
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  useLayoutEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${cur}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cur]);
  const open = (h: Hit, newTab = false) => {
    if (h.expand) { setExpanded((x) => new Set([...x, h.expand!])); return; }
    // a new tab exists in a browser only; the desktop app opens it in place
    if (newTab && !isDesktop()) { window.open(`${location.pathname}${location.search}#${h.to}`, '_blank', 'noopener'); return; }
    const row = list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(h.key)}"]`);
    const c = h.work && h.work.kind !== 'essay' ? row?.querySelector<HTMLElement>('.cover img') ?? row?.querySelector<HTMLElement>('.cover') : null;
    const at: SearchState = { q: q.trim(), open: [...expanded], cur: Math.max(0, hits.indexOf(h)) };
    const go = () => {
      // back from what a search opened is the search again, its words, its open groups, this row: on 搜索 the
      // page's own entry remembers them; from the ⌘K panel over another page, 搜索 is put in between (at its
      // top: the scroll saved for it is its own, not the page underneath)
      if (inline) onState?.(at);
      else if (at.q) { nav(searchPath(at.q), { state: { search: at } }); window.scrollTo(0, 0); }
      nav(h.to);
    };
    if (c && !reduced()) {
      // the panel leaves inside the transition, so its thumbnail is the only flying cover
      c.style.viewTransitionName = HERO;
      markFlight(h.work!.id);
      withViewTransition(() => { onClose?.(true); go(); }, 'flight');
    } else { onClose?.(); go(); }
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCur((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); setCur(0); }
    else if (e.key === 'Enter' && hits[cur]) { e.preventDefault(); open(hits[cur], e.metaKey || e.ctrlKey); }
    else if (e.key === 'Escape' && onClose) { e.preventDefault(); onClose(); }
    else if (e.key === 'Tab' && !inline) e.preventDefault();   // focus stays in the dialog (§8.5)
    // the foot says 「按 ? 查看快捷键」: with nothing typed yet, ? opens the help instead of searching for "?"
    else if (e.key === '?' && !q && onHelp) { e.preventDefault(); onHelp(); }
  };
  const term = q.trim();
  let last = '';
  return (
    <div className={`palette ${inline ? 'inline' : ''}`} role="dialog" aria-modal={!inline} aria-label="搜索">
      <label className="palette-field">
        <Search strokeWidth={1.5} />
        <input
          ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key}
          placeholder="搜索条目、人物、年份" enterKeyHint="search" role="combobox" aria-expanded aria-controls={`${uid}-l`}
          aria-activedescendant={hits[cur] ? `${uid}-${cur}` : undefined} autoComplete="off" spellCheck={false}
        />
      </label>
      <div className="palette-list" ref={list} role="listbox" id={`${uid}-l`}>
        {hits.map((h, i) => {
          const head = h.group !== last ? h.group : '';
          last = h.group;
          const [tw, th] = h.work ? thumbSize(h.work, 28) : [28, 28];
          return (
            <div key={h.key}>
              {head && <div className="palette-group t-label c-3">{head}</div>}
              <div
                id={`${uid}-${i}`} data-i={i} data-key={h.key} role="option" aria-selected={i === cur}
                className={`palette-row ${i === cur ? 'on' : ''} ${h.expand ? 'more' : ''}`}
                onPointerMove={() => setCur(i)} onClick={(e) => open(h, e.metaKey || e.ctrlKey)}
              >
                {h.expand ? <span className="palette-year" aria-hidden>…</span>
                  : h.work ? (h.work.kind === 'essay' ? <span className="palette-essay" aria-hidden>文</span> : <Cover work={h.work} w={tw} h={th} className="thumb" paperPlaceholder />)
                  : h.person ? <Avatar name={h.person} size={28} /> : <span className="palette-year" aria-hidden>{h.interest ? '趣' : '年'}</span>}
                <span className="palette-label ellipsis"><Hl text={h.label} q={term} /></span>
                <span className="t-caption c-3 ellipsis palette-meta">{h.meta}</span>
              </div>
            </div>
          );
        })}
        {empty && (
          <div className="palette-none">
            <p className="t-ui c-2">这里没有「{term}」</p>
            {onAdd && <button className="btn-text" onClick={() => onAdd(term)}>收录《{term}》</button>}
          </div>
        )}
      </div>
      <div className="palette-foot t-caption c-3">
        <span aria-hidden>↑↓ 选择　↵ 打开　esc 关闭</span>
        {/* the one visible way into the shortcut help (desktop, fine pointer only — CSS hides it elsewhere) */}
        {onHelp && (
          <button className="palette-help" tabIndex={-1} onClick={onHelp}>
            按 <kbd className="kbd">?</kbd> 查看快捷键
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- global open / close + shortcuts ---------- */

const Ctx = createContext<{ open: () => void }>({ open: () => {} });
export const usePalette = () => useContext(Ctx);

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function PaletteProvider({ children, onAdd }: { children: ReactNode; onAdd: (q?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const back = useRef<HTMLElement | null>(null);
  const loc = useLocation();
  const nav = useNavigate();
  const show = () => {
    if (window.innerWidth < BP.desktop) { nav('/search', { state: { focus: true } }); return; }
    if (loc.pathname === '/search') { document.querySelector<HTMLInputElement>('.palette input')?.focus(); return; }
    back.current = document.activeElement as HTMLElement | null;
    setClosing(false);
    setOpen(true);
  };
  const close = (now = false) => {
    if (now) { setOpen(false); setClosing(false); return; }
    setClosing(true);
    void afterAnimations(document.querySelector('.palette-scrim'), DUR.fade).then(() => { setOpen(false); setClosing(false); back.current?.focus?.(); });
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (cmdK || (e.key === '/' && !isTyping(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        if (open) close(); else show();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  return (
    <Ctx.Provider value={{ open: show }}>
      {children}
      {open && createPortal(
        <div className={`palette-scrim ${closing ? 'closing' : ''}`} onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <PalettePanel
            onClose={close}
            onAdd={(t) => { close(true); onAdd(t); }}
            // close at once (no delayed focus return to steal focus from the help); hand the opener back
            // first so the help returns focus there when it closes
            onHelp={() => { close(true); back.current?.focus?.({ preventScroll: true }); openShortcutHelp(); }}
          />
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}
