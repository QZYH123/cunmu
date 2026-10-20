import { useFly } from '../components/CoverWall';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { useStore } from '../data/store';
import type { Work } from '../data/types';
import { KIND_LABEL, KIND_ORDER } from '../data/types';
import { fmtNum } from '../data/derive';
import { ADD_BLANK, SEARCH_EMPTY, searchMeta } from '../lib/searchText';
import { useSheets } from '../App';
import { Avatar, Cover } from '../components/Cover';
import { ListRow, RollingNumber } from '../components/Bits';
import { useEnterClass, useFlip } from '../lib/motion';
import { isDesk, useBreakpoint } from '../lib/useWidth';
import { GROUP_CAP, PalettePanel, searchLibrary, searchPath, searchStateOf, type SearchState } from '../components/CommandPalette';
import { SEARCH_PLACEHOLDER } from '../lib/naming';

/** Matched characters in ink 600, the rest secondary 400 — weight, never colour highlight. */
function Hl({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <span className="c-2">{text}</span>;
  return <><span className="c-2">{text.slice(0, i)}</span><b className="hit">{text.slice(i, i + q.length)}</b><span className="c-2">{text.slice(i + q.length)}</span></>;
}

/**
 * The search this page's history entry holds, and a way to keep it there as it changes (replacing the entry,
 * never adding one, the scroll left alone): back from what it opened, the words, the open groups and the
 * scroll are as they were, whichever back it was.
 */
function useKeptSearch(): [SearchState, (s: SearchState) => void] {
  const loc = useLocation();
  const nav = useNavigate();
  const [start] = useState(() => searchStateOf(loc));
  const at = useRef(loc);
  at.current = loc;
  const keep = useCallback((s: SearchState) => {
    const l = at.current;
    if (l.pathname !== '/search') return;
    const now = searchStateOf(l);
    if (now.q === s.q && (s.cur === undefined || now.cur === s.cur) && now.open.join('\n') === s.open.join('\n')) return;
    nav(searchPath(s.q), { replace: true, preventScrollReset: true, state: { search: s } });
  }, [nav]);
  return [start, keep];
}

export default function SearchPage() {
  const { d, library } = useStore();
  const sheets = useSheets();
  const loc = useLocation();
  const enter = useEnterClass();
  const desk = isDesk(useBreakpoint());
  const fly = useFly();
  const input = useRef<HTMLInputElement>(null);
  const [start, keep] = useKeptSearch();
  const [q, setQ] = useState(start.q);
  const [animKey] = useState(0);
  // coming back to results, they are simply there (they rise in only the first time words find something)
  const firstResults = useRef(!start.q);
  useEffect(() => { if ((loc.state as { focus?: boolean } | null)?.focus) input.current?.focus(); }, [loc.state]);

  const term = q.trim();
  const [open, setOpen] = useState<Set<string>>(() => new Set(start.open));
  const lastTerm = useRef(term);
  useEffect(() => { if (lastTerm.current === term) return; lastTerm.current = term; setOpen(new Set()); }, [term]);
  useEffect(() => { if (!desk) keep({ q: term, open: [...open] }); }, [term, open, desk, keep]);
  const results = useMemo(() => (term ? searchLibrary(term, library, d) : null), [term, library, d]);
  const has = results && (results.works.length || results.people.length || results.years.length || results.interests.length);
  /** first GROUP_CAP of a group, then a quiet 「展开其余 N 条」 that opens the rest in place */
  const cap = <T,>(group: string, xs: T[]): [T[], number] => (open.has(group) || xs.length <= GROUP_CAP + 1 ? [xs, 0] : [xs.slice(0, GROUP_CAP), xs.length - GROUP_CAP]);
  const more = (group: string, n: number) => n > 0 && (
    <button className="btn-text quiet search-more" onClick={() => setOpen((x) => new Set([...x, group]))}>展开其余 {n} 条</button>
  );
  const animate = firstResults.current && !!has;
  // typing: the rows that stay glide to their new place, new ones fade in, nothing is swapped wholesale (P1-9)
  const resultsBox = useRef<HTMLDivElement>(null);
  useFlip(resultsBox);
  useEffect(() => { if (has) firstResults.current = false; if (!term) firstResults.current = true; }, [has, term]);

  const groups = results ? KIND_ORDER.map((k) => [k, results.works.filter((w) => w.kind === k)] as const).filter(([, ws]) => ws.length) : [];
  const recent = library.slice(0, 5);
  const counts = KIND_ORDER.filter((k) => (d.kindCounts.get(k) ?? 0) > 0);

  const row = (w: Work) => (
    <Link key={w.id} to={w.kind === 'essay' ? `/essay/${w.id}` : `/entry/${w.id}`} className="list-row search-row" data-fly-src={w.id} data-flip={w.id} onClick={w.kind === 'essay' ? undefined : (e) => fly(e, w.id)}>
      {w.kind !== 'essay' && <Cover work={w} w={32} h={w.kind === 'music' ? 32 : 48} paperPlaceholder />}
      <div className="list-main">
        <span className="t-ui ellipsis"><Hl text={w.title} q={term} /></span>
        <span className="list-meta ellipsis c-3">{searchMeta(w, term, true)}</span>
      </div>
    </Link>
  );

  if (desk) {
    return (
      <div className="page under-bar search-desk">
        <div className="page-x"><PalettePanel inline onAdd={() => sheets.add()} start={start} onState={keep} /></div>
      </div>
    );
  }
  return (
    <div className="page under-bar-lite">
      <div className={`page-x ${enter}`}>
        <h1 className="t-title page-title">搜索</h1>
        <label className="search-field">
          <SearchIcon strokeWidth={1.5} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={SEARCH_PLACEHOLDER} enterKeyHint="search" aria-label="搜索" />
        </label>
        {!term && !recent.length && <p className="t-small c-3 quiet-hint">放进作品以后，可以在这里按书名、人名、年份找。</p>}
        {!term && recent.length > 0 && (
          <>
            <section className="home-recent">
              <span className="label-head">最近</span>
              {recent.map((w, i) => <ListRow key={w.id} work={w} index={i} to={w.kind === 'essay' ? `/essay/${w.id}` : undefined} />)}
            </section>
            <section className="home-recent">
              <span className="label-head">按类型</span>
              <p className="type-line">
                {counts.map((k) => <Link key={k} to={`/kind/${k}`}><span className="c-2">{KIND_LABEL[k]}</span> <span className="t-caption c-3">{fmtNum(d.kindCounts.get(k)!)}</span></Link>)}
                {d.persons.size > 0 && <Link to="/index/people"><span className="c-2">人物</span> <span className="t-caption c-3">{fmtNum(d.persons.size)}</span></Link>}
                {d.years.size > 0 && <Link to="/index/periods"><span className="c-2">年份</span> <span className="t-caption c-3">{d.years.size}</span></Link>}
              </p>
            </section>
          </>
        )}
        {term && has ? (
          <div className={`results ${animate ? 'results-in' : ''}`} key={animKey} ref={resultsBox}>
            {results!.people.length > 0 && (
              <section className="result-group">
                <div className="t-label c-3">人物 · <RollingNumber value={String(results!.people.length)} /></div>
                {cap('人物', results!.people)[0].map((p) => (
                  <Link key={p.id} to={`/person/${p.id}`} className="list-row search-row" data-flip={`p:${p.id}`}>
                    <Avatar name={p.name} size={32} />
                    <div className="list-main">
                      <span className="t-ui"><Hl text={p.name} q={term} /></span>
                      <span className="list-meta c-3">{p.roles[0]} · {p.works.length} 部</span>
                    </div>
                  </Link>
                ))}
                {more('人物', cap('人物', results!.people)[1])}
              </section>
            )}
            {groups.map(([k, ws]) => {
              const [shown, rest] = cap(k, ws);
              return (
                <section className="result-group" key={k}>
                  <div className="t-label c-3">{KIND_LABEL[k]} · <RollingNumber value={fmtNum(ws.length)} /></div>
                  {shown.map(row)}
                  {more(k, rest)}
                </section>
              );
            })}
            {results!.interests.length > 0 && (
              <section className="result-group">
                <div className="t-label c-3">兴趣 · <RollingNumber value={String(results!.interests.length)} /></div>
                {cap('兴趣', results!.interests)[0].map(([g, ws]) => (
                  <Link key={g} to={`/index/interests?g=${encodeURIComponent(g)}`} className="list-row search-row no-thumb">
                    <div className="list-main"><span className="t-ui"><Hl text={g} q={term} /></span><span className="list-meta c-3">{fmtNum(ws.length)} 条</span></div>
                  </Link>
                ))}
                {more('兴趣', cap('兴趣', results!.interests)[1])}
              </section>
            )}
            {results!.years.length > 0 && (
              <section className="result-group">
                <div className="t-label c-3">年份 · <RollingNumber value={String(results!.years.length)} /></div>
                {results!.years.map((y) => (
                  <Link key={y} to={`/year/${y}`} className="list-row search-row no-thumb">
                    <div className="list-main"><span className="t-ui"><Hl text={String(y)} q={term} /></span><span className="list-meta c-3">{d.years.get(y)!.works.length} 条</span></div>
                  </Link>
                ))}
              </section>
            )}
          </div>
        ) : term ? (
          <div className="no-result">
            <p className="t-ui c-2">{SEARCH_EMPTY}</p>
            <button className="btn-text" onClick={() => sheets.add()}>{ADD_BLANK}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
