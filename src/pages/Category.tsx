import { fmtPlaytime } from '../lib/steam';
import { arrowNav, useFly } from '../components/CoverWall';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LayoutGrid, Library, List } from 'lucide-react';
import { useStore, type CatGroup, type CatSort, type CatSortKey, type CatView } from '../data/store';
import { byLetter, letterOf } from '../lib/letters';
import { useSheets } from '../App';
import type { Kind, Work } from '../data/types';
import { KIND_ASPECT, KIND_LABEL, KIND_UNIT } from '../data/types';
import { creatorLine, fmtNum, listDate, whenOf } from '../data/derive';
import { PickBar, PickToggle, usePicker, type Picker } from '../components/Pick';
import { hash, paperVar } from '../lib/hash';
import { TopBar } from '../components/Shell';
import { Cover } from '../components/Cover';
import { ListRow, Seg } from '../components/Bits';
import { staggerStyle, useEnterClass } from '../lib/motion';
import { isDesk, useBreakpoint, useElementWidth } from '../lib/useWidth';
import { useSectionSpy } from './Entry';
import { CAT_GRID, DUR, TABLE_THUMB } from '../tokens';

type View = CatView;
type Group = CatGroup;

const hrefOf = (w: Work) => (w.kind === 'essay' ? `/essay/${w.id}` : `/entry/${w.id}`);

/** the grid's caption (STYLE v0.4 §3.14.1): 2024 · 约 2021 · nothing for 时间未知 (the cell stays top-aligned) */
const cellWhen = (w: Work) => (w.finished ? whenOf(w, 'year') : '');
type Pick = Picker;

/** Phone: 3 columns. Wider: auto-fill with a 148 minimum (168 on wide), column gap 24 (§8.3.7). */
export function Grid({ works, offset, pick, noYear }: { works: Work[]; offset: number; pick?: Pick; noYear?: boolean }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const bp = useBreakpoint();
  const gap = bp === 'phone' ? CAT_GRID.gapPhone : CAT_GRID.gap;
  const min = bp === 'wide' ? CAT_GRID.minWide : CAT_GRID.min;
  const cols = bp === 'phone' ? 3 : Math.max(3, Math.floor((width + gap) / (min + gap)));
  const cw = Math.max(0, Math.floor((width - gap * (cols - 1)) / cols));
  const fly = useFly();
  return (
    // one tab stop per grid; arrow keys move over the 2D grid, Enter opens (§8.5, P2-4)
    <div className="cat-grid" ref={ref} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} onKeyDown={(e) => arrowNav(e, '.cat-cell')}>
      {works.map((w, i) => {
        const a = KIND_ASPECT[w.kind];
        return (
          <Link
            key={w.id} to={hrefOf(w)} className={`cat-cell ${pick?.has(w.id) ? 'picked' : ''}`} tabIndex={i === 0 ? 0 : -1} style={staggerStyle(offset + i)} data-fly-src={w.id}
            onClick={pick?.on ? (e) => { e.preventDefault(); pick.toggle(w); } : w.kind === 'essay' ? undefined : (e) => fly(e, w.id)}
            {...(pick?.on ? { role: 'checkbox', 'aria-checked': pick.has(w.id), 'aria-label': `${w.title}${pick.has(w.id) ? '，已选' : ''}` } : null)}
          >
            <div className="cat-cover"><Cover work={w} w={cw} h={Math.round(cw / a)} paperPlaceholder /></div>
            <span className="t-small c-ink clamp-2 cat-name">{w.title}</span>
            {!noYear && cellWhen(w) && <span className="t-caption c-3">{cellWhen(w)}</span>}
          </Link>
        );
      })}
    </div>
  );
}

/* ---------- desktop table (§8.3.7, P2-4) ---------- */

const COLLATOR = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
const yearOf = (w: Work) => w.year ?? null;
/** Sort value per column; missing values always sort last, whatever the direction. */
const SORT_VAL: Record<CatSortKey, (w: Work) => string | number | null> = {
  title: (w) => w.title,
  creator: (w) => creatorLine(w) || null,
  genre: (w) => w.genres.filter(Boolean).slice(0, 2).join(' · ') || null,
  year: yearOf,
  finished: (w) => w.finished,
  // r19 minutes played (Steam); works without a time sort last
  playtime: (w) => w.play?.minutes ?? null,
};
export function sortWorksBy(works: Work[], { key, dir }: CatSort): Work[] {
  const f = SORT_VAL[key];
  const sign = dir === 'asc' ? 1 : -1;
  return works.map((w, i) => ({ w, v: f(w), i })).sort((a, b) => {
    if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
    const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : COLLATOR.compare(String(a.v), String(b.v));
    return c ? c * sign : a.i - b.i;   // ties keep the library order (newest first)
  }).map((x) => x.w);
}
/** Columns follow §8.3.7 (书名 | 作者 | 类型 | 年份 | 看完); the words follow the kind. */
function columnsFor(k: Kind | 'all'): { key: CatSortKey; label: string; first: 'asc' | 'desc' }[] {
  const verb = k === 'music' ? '听过' : k === 'game' ? '玩过' : k === 'essay' ? '写于' : k === 'all' ? '日期' : '看完';
  if (k === 'essay') return [{ key: 'title', label: '标题', first: 'asc' }, { key: 'finished', label: verb, first: 'desc' }];
  return [
    { key: 'title', label: k === 'book' ? '书名' : '标题', first: 'asc' },
    { key: 'creator', label: k === 'book' ? '作者' : '主创', first: 'asc' },
    { key: 'genre', label: '类型', first: 'asc' },
    { key: 'year', label: '年份', first: 'desc' },
    { key: 'finished', label: verb, first: 'desc' },
    ...(k === 'game' ? [{ key: 'playtime' as const, label: '时长', first: 'desc' as const }] : []),
  ];
}

function Table({ groups, kind, sort, onSort, pick }: {
  groups: { key: string; label: string; items: Work[]; total: number | null }[]; kind: Kind | 'all';
  sort: CatSort; onSort: (s: CatSort) => void; pick?: Pick;
}) {
  const cols = columnsFor(kind);
  const nav = useNavigate();
  const cell = (w: Work, key: CatSortKey) => {
    if (key === 'title') return null;
    if (key === 'playtime') return w.play ? fmtPlaytime(w.play.minutes) : <span className="c-4">—</span>;
    if (key === 'finished') return w.finished ? (w.finished.length === 4 ? whenOf(w, 'year') : w.finished) : '';
    const v = SORT_VAL[key](w);
    return v === null ? <span className="c-4">—</span> : v;
  };
  // ↑ ↓ move between rows (Home / End to the ends); the table is one tab stop (roving tabindex)
  const rowKeys = (e: React.KeyboardEvent<HTMLTableElement>) => {
    const cur = (e.target as HTMLElement).closest<HTMLAnchorElement>('.td-title a');
    if (!cur || e.altKey || e.metaKey || e.ctrlKey || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    const links = [...e.currentTarget.querySelectorAll<HTMLAnchorElement>('.td-title a')];
    const i = links.indexOf(cur);
    const next = links[e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1 : i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    cur.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  };
  let n = 0;
  return (
    <table className={`cat-table n${cols.length}`} onKeyDown={rowKeys}>
      <colgroup>{cols.map((c) => <col key={c.key} className={`col-${c.key}`} />)}</colgroup>
      <thead>
        <tr>
          {cols.map((c) => {
            const on = sort.key === c.key;
            return (
              <th key={c.key} scope="col" aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`th-${c.key}`}>
                <button className={on ? 'on' : ''} onClick={() => onSort(on ? { key: c.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.first })}>
                  {c.label}<span className="sort-mark" aria-hidden>{on ? (sort.dir === 'asc' ? '↑' : '↓') : ''}</span>
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      {groups.map((g) => (
        <tbody key={g.key || 'all'} id={g.key ? `g-${g.key}` : undefined}>
          {g.label && (
            <tr className="group-row"><th colSpan={cols.length} scope="rowgroup"><span className="t-h2">{g.label}</span>{g.total !== null && <span className="t-caption c-3">{g.total}</span>}</th></tr>
          )}
          {g.items.map((w) => {
            const [tw, th] = w.kind === 'music' ? [TABLE_THUMB.w, TABLE_THUMB.w] : [TABLE_THUMB.w, TABLE_THUMB.h];
            return (
              // the row is one target: a click anywhere opens the entry; the title link is the tab stop
              <tr
                key={w.id} data-ctx={w.id} className={pick?.has(w.id) ? 'picked' : ''}
                onClick={(e) => { if (pick?.on) { e.preventDefault(); pick.toggle(w); return; } if (!(e.target as HTMLElement).closest('a')) nav(hrefOf(w)); }}
              >
                {cols.map((c) => c.key === 'title' ? (
                  <td key="title" className="td-title">
                    <Link to={hrefOf(w)} tabIndex={n++ === 0 ? 0 : -1} onClick={pick?.on ? (e) => e.preventDefault() : undefined} {...(pick?.on ? { role: 'checkbox', 'aria-checked': pick.has(w.id) } : null)}>
                      <Cover work={w} w={tw} h={th} paperPlaceholder />
                      <span className="ellipsis">{w.title}</span>
                    </Link>
                  </td>
                ) : (
                  <td key={c.key} className={`td-${c.key}`}><span className="ellipsis">{cell(w, c.key)}</span></td>
                ))}
              </tr>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}

function Spines({ works }: { works: Work[] }) {
  const [ref, avail] = useElementWidth<HTMLDivElement>();
  const shelves: Work[][] = [];
  let row: Work[] = [];
  let x = 0;
  const dims = (w: Work) => {
    const h = hash(w.id);
    return { w: 22 + (h % 13), h: 168 + ((h >> 5) % 29) };
  };
  for (const w of works) {
    const sw = dims(w).w + 2;
    if (x + sw > avail && row.length) { shelves.push(row); row = []; x = 0; }
    row.push(w); x += sw;
  }
  if (row.length) shelves.push(row);
  return (
    <div ref={ref}>
      {avail > 0 && shelves.map((s, i) => (
        <div className="shelf" key={i}>
          {s.map((w) => {
            const dm = dims(w);
            return (
              <Link key={w.id} to={hrefOf(w)} className="spine" style={{ width: dm.w, height: dm.h, background: paperVar(w.id) }} aria-label={w.title}>
                <span>{w.title}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function Category() {
  const { kind = 'book' } = useParams();
  const { library, catView, setCatView, catSort, setCatSort, catGroup, setCatGroup, sample } = useStore();
  // 「选几部」 (STYLE v0.4 §3.14.3): pick some, put them all in one year
  const pick = usePicker();
  const picking = pick.on;
  const sheets = useSheets();
  const nav = useNavigate();
  const bp = useBreakpoint();
  const desk = isDesk(bp);
  const enter = useEnterClass();
  const k = kind as Kind | 'all';
  const works = useMemo(() => (k === 'all' ? library : library.filter((w) => w.kind === k)), [library, k]);
  // the view is remembered (P2-4); spines exist only for books, elsewhere that choice shows the grid
  const views: View[] = k === 'book' ? ['grid', 'spine', 'list'] : ['grid', 'list'];
  const view: View = views.includes(catView) ? catView : 'grid';
  const setView = (v: View) => setCatView(v);
  const table = desk && view === 'list';
  // the grouping is remembered with the view and the table's sort
  const group: Group = catGroup ?? 'all';
  const letters = group === 'letter';
  const [limit, setLimit] = useState(120);
  const { h1, h1Gone } = useSectionSpy([kind]);
  const sentinel = useRef<HTMLDivElement>(null);
  const [switching, setSwitching] = useState(0);
  const nextView = views[(views.indexOf(view) + 1) % views.length];
  const title = k === 'all' ? '全部' : KIND_LABEL[k];
  const unit = k === 'all' ? '条' : KIND_UNIT[k];

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + 120), { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [view, group]);

  const sorted = useMemo(() => (letters ? byLetter(works, (w) => w.title) : table ? sortWorksBy(works, catSort) : works), [works, letters, table, catSort]);
  const groups = useMemo(() => {
    const works = sorted;
    const list = works.slice(0, limit);
    if (group === 'all') return [{ key: '', label: '', items: list, total: works.length }];
    const m = new Map<string, Work[]>();
    const totals = new Map<string, number>();
    const groupOf = (w: Work) => (group === 'letter' ? letterOf(w.title) : group === 'period' ? w.finished.slice(0, 4) : w.genres.find(Boolean) || '其他');
    for (const w of works) {
      const g = groupOf(w);
      totals.set(g, (totals.get(g) ?? 0) + 1);
    }
    for (const w of list) {
      // 时间未知 is its own last group ('' key)
      const g = groupOf(w);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(w);
    }
    const entries = [...m.entries()];
    if (group === 'letter') { /* already A–Z, # last */ } else if (group === 'genre') entries.sort((a, b) => totals.get(b[0])! - totals.get(a[0])!);
    else {
      // years newest first — unless the table is sorted oldest-first by date, then oldest first
      const up = table && catSort.key === 'finished' && catSort.dir === 'asc' ? -1 : 1;
      entries.sort((a, b) => (!a[0] !== !b[0] ? (a[0] ? -1 : 1) : a[0] < b[0] ? up : a[0] > b[0] ? -up : 0));
    }
    // the 时间未知 group carries no count: it's a place, not a tally of what's missing
    return entries.map(([key, items]) => (key || group !== 'period'
      ? { key, label: key, items, total: totals.get(key)! as number | null }
      : { key: 'unknown', label: '时间未知', items, total: null }));
  }, [sorted, group, limit, table, catSort]);

  // year rail: fades in while scrolling, out 1.2s after stopping
  const [rail, setRail] = useState(false);
  useEffect(() => {
    let t: number | undefined;
    const f = () => { setRail(true); clearTimeout(t); t = window.setTimeout(() => setRail(false), DUR.idleDelay); };
    window.addEventListener('scroll', f, { passive: true });
    return () => { window.removeEventListener('scroll', f); clearTimeout(t); };
  }, []);
  const railYears = group === 'period' ? groups.map((g) => g.key).filter((k) => k !== 'unknown') : [];
  const railLetters = letters ? groups.map((g) => g.key) : [];
  useEffect(() => pick.stop(), [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  let offset = 0;
  // a kind that doesn't exist (an old or mistyped link): say so and offer the way back, not a blank shelf
  if (k !== 'all' && !KIND_LABEL[k]) {
    return (
      <div className="page under-bar page-x">
        <TopBar />
        <p className="t-ui c-2 empty-line">没有这个分类。</p>
        <Link to="/" className="btn-text quiet empty-back">回到首页 ›</Link>
      </div>
    );
  }

  return (
    <div className="page under-bar">
      <TopBar
        title={title}
        titleOn={h1Gone}
        back={!picking}
        right={works.length > 0 && (
          <>
          {!sample.on && k !== 'essay' && <PickToggle p={pick} />}
          {!desk && !picking && <button className="icon-btn" aria-label={{ grid: '封面格', spine: '书脊', list: '列表' }[nextView]} onClick={() => { setView(nextView); setSwitching((s) => s + 1); }}>
            {nextView === 'grid' ? <LayoutGrid strokeWidth={1.5} /> : nextView === 'spine' ? <Library strokeWidth={1.5} /> : <List strokeWidth={1.5} />}
          </button>}
          </>
        )}
      />
      <div className={`page-x ${enter}`}>
        <h1 className="t-title page-title" ref={h1}>{title}</h1>
        <p className="t-caption c-3">{fmtNum(works.length)} {unit}</p>
        {works.length === 0 ? (
          <div className="cat-empty">
            <div className="shelf-line" />
            <p className="t-ui c-2">{k === 'all' || !KIND_LABEL[k as Kind] ? '第一条会放在这里' : `第一${unit}${KIND_LABEL[k as Kind]}会放在这里`}</p>
            <button className="btn btn-secondary" onClick={() => (k === 'essay' ? nav('/write') : sheets.add())}>{k === 'essay' ? '写点什么' : '收录'}</button>
          </div>
        ) : (
          <>
            <div className="cat-tools">
              <Seg
                className="cat-seg"
                options={[{ value: 'all', label: '全部' }, { value: 'period', label: '按时期' }, { value: 'genre', label: '按类型' }, { value: 'letter', label: '按首字母' }]}
                value={group}
                onChange={(v) => { setCatGroup(v as Group); setSwitching((s) => s + 1); }}
              />
              {/* desktop: the view is a labelled control beside the grouping, not an icon to decode (P2-4) */}
              {desk && (
                <Seg
                  className="cat-seg cat-view-seg"
                  ariaLabel="视图"
                  options={views.map((v) => ({ value: v, label: { grid: '封面', spine: '书脊', list: '表格' }[v] }))}
                  value={view}
                  onChange={(v) => { setView(v as View); setSwitching((s) => s + 1); }}
                />
              )}
            </div>
            <div className="cat-body" key={switching}>
              {/* A–Z shows as the title column sorted up; sorting by any column leaves A–Z */}
              {table && <Table groups={groups} kind={k} sort={letters ? { key: 'title', dir: 'asc' } : catSort} onSort={(s) => { if (letters) setCatGroup('all'); setCatSort(s); }} pick={pick} />}
              {!table && groups.map((g) => {
                const start = offset;
                offset += g.items.length;
                return (
                  <section key={g.key || 'all'} id={g.key ? `g-${g.key}` : undefined}>
                    {g.label && (
                      <h2 className={`group-head ${g.key === 'unknown' ? 'is-unknown' : ''}`}>
                        {g.key === 'unknown' ? <Link to="/unknown" className="t-h2">{g.label}</Link> : <span className="t-h2">{g.label}</span>}
                        {g.total !== null && <span className="t-caption c-3">{g.total}</span>}
                      </h2>
                    )}
                    {(view === 'grid' || (picking && view === 'spine')) && <Grid works={g.items} offset={start} pick={pick} />}
                    {view === 'spine' && !picking && <Spines works={g.items} />}
                    {view === 'list' && (
                      <div className="cat-list">
                        {g.items.map((w, i) => <ListRow key={w.id} work={w} index={start + i} to={hrefOf(w)} date={listDate(w)} onPick={picking ? () => pick.toggle(w) : undefined} picked={pick.has(w.id)} />)}
                      </div>
                    )}
                  </section>
                );
              })}
              {limit < works.length && <div ref={sentinel} style={{ height: 1 }} />}
            </div>
          </>
        )}
      </div>
      <PickBar p={pick} works={works} />
      {railYears.length > 2 && (
        <nav className={`year-rail ${rail ? 'on' : ''}`} aria-label="年份速查">
          {railYears.map((y) => <button key={y} onClick={() => document.getElementById(`g-${y}`)?.scrollIntoView()}>{y.slice(2)}</button>)}
        </nav>
      )}
      {railLetters.length > 2 && (
        <nav className={`year-rail ${rail ? 'on' : ''}`} aria-label="首字母速查">
          {railLetters.map((l) => <button key={l} onClick={() => document.getElementById(`g-${l}`)?.scrollIntoView()}>{l}</button>)}
        </nav>
      )}
    </div>
  );
}
