import { useFly } from '../components/CoverWall';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { useStore } from '../data/store';
import { useSheets } from '../App';
import type { Work } from '../data/types';
import { KIND_LABEL, KIND_ORDER } from '../data/types';
import { creatorLine, fmtNum, whenOf } from '../data/derive';
import { Avatar, Cover } from '../components/Cover';
import { ListRow } from '../components/Bits';
import { useEnterClass, useFlip } from '../lib/motion';
import { isDesk, useBreakpoint } from '../lib/useWidth';
import { GROUP_CAP, PalettePanel, searchLibrary } from '../components/CommandPalette';

/** Matched characters in ink 600, the rest secondary 400 — weight, never colour highlight. */
function Hl({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <span className="c-2">{text}</span>;
  return <><span className="c-2">{text.slice(0, i)}</span><b className="hit">{text.slice(i, i + q.length)}</b><span className="c-2">{text.slice(i + q.length)}</span></>;
}

export default function SearchPage() {
  const { d, library } = useStore();
  const sheets = useSheets();
  const loc = useLocation();
  const enter = useEnterClass();
  const desk = isDesk(useBreakpoint());
  const fly = useFly();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [animKey] = useState(0);
  const firstResults = useRef(true);
  useEffect(() => { if ((loc.state as { focus?: boolean } | null)?.focus) input.current?.focus(); }, [loc.state]);

  const term = q.trim();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  useEffect(() => { setOpen(new Set()); }, [term]);
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
        <span className="list-meta ellipsis c-3">{[KIND_LABEL[w.kind], creatorLine(w), w.finished && whenOf(w, 'year')].filter(Boolean).join(' · ')}</span>
      </div>
    </Link>
  );

  if (desk) {
    return (
      <div className="page under-bar search-desk">
        <div className="page-x"><PalettePanel inline onAdd={sheets.add} /></div>
      </div>
    );
  }
  return (
    <div className="page under-bar-lite">
      <div className={`page-x ${enter}`}>
        <h1 className="t-title page-title">搜索</h1>
        <label className="search-field">
          <SearchIcon strokeWidth={1.5} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="书、番、人、年份、随笔" enterKeyHint="search" />
        </label>
        {!term && !recent.length && <p className="t-small c-3 quiet-hint">放进作品以后，可以在这里按书名、人名、年份找。</p>}
        {!term && recent.length > 0 && (
          <>
            <section className="home-recent">
              <span className="label-head">最近看过</span>
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
                <div className="t-label c-3">人物 · {results!.people.length}</div>
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
                  <div className="t-label c-3">{KIND_LABEL[k]} · {fmtNum(ws.length)}</div>
                  {shown.map(row)}
                  {more(k, rest)}
                </section>
              );
            })}
            {results!.interests.length > 0 && (
              <section className="result-group">
                <div className="t-label c-3">兴趣 · {results!.interests.length}</div>
                {results!.interests.slice(0, GROUP_CAP).map(([g, ws]) => (
                  <Link key={g} to={`/index/interests?g=${encodeURIComponent(g)}`} className="list-row search-row no-thumb">
                    <div className="list-main"><span className="t-ui"><Hl text={g} q={term} /></span><span className="list-meta c-3">{fmtNum(ws.length)} 条</span></div>
                  </Link>
                ))}
              </section>
            )}
            {results!.years.length > 0 && (
              <section className="result-group">
                <div className="t-label c-3">年份 · {results!.years.length}</div>
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
            <p className="t-ui c-2">这里没有「{term}」</p>
            <button className="btn btn-secondary" onClick={() => sheets.add(term)}>收录《{term}》</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
