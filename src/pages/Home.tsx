import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { TIERS, useStore } from '../data/store';
import { ALL_BY_ID } from '@demo';
import type { Work } from '../data/types';
import { KIND_LABEL, KIND_ORDER } from '../data/types';
import { HomeWall, homeLayout, tierFor, wallIntroPending, type WallMode } from '../components/CoverWall';
import { ListRow, RollingNumber } from '../components/Bits';
import { Avatar } from '../components/Cover';
import { SideYears } from '../components/YearMini';
import { TopBar } from '../components/Shell';
import { fmtMD, fmtNum } from '../data/derive';
import { arrivedByRoute, haptic, inPageFade, reduced, useEnterClass, withViewTransition } from '../lib/motion';
import { DUR, IMPORT_LINE_MAX, PULL_TO_WALL } from '../tokens';
import { captionOf, SEARCH_PLACEHOLDER, titleOf } from '../lib/naming';
import { isDesk, useBreakpoint, useViewportH, useWidth } from '../lib/useWidth';
import { useSheets } from '../App';

export default function Home({ onWeread, onBangumi, onAdd }: { onWeread: () => void; onBangumi: () => void; onAdd: () => void }) {
  const store = useStore();
  const sheets = useSheets();
  const { library, d, consumeArrival, arrival } = store;
  const nav = useNavigate();
  const enterCls = useEnterClass();
  // On the session's first home visit the masthead rises 240ms into the wall's S1 wave (§7.2-5).
  const [enter] = useState(() => (wallIntroPending() && library.length && !inPageFade() && !arrivedByRoute() ? 'enter mast-in' : enterCls));
  const [ref, width] = useWidth<HTMLDivElement>();
  const vh = useViewportH();
  const bp = useBreakpoint();
  const desk = isDesk(bp);
  const title = titleOf(store.title);

  // after the first work: one quiet line offering the two big ways in. It goes on 不用了 (remembered), once
  // both are done, or by itself once the library is established (IMPORT_LINE_MAX works) — a quiet fade, no notice
  const bgmDone = store.bangumiOn;
  const doubanDone = store.batches.some((b) => b.provider === 'douban_xlsx' && !b.undoneAt);
  const steamDone = !!store.connections.steam;
  const wantLine = !store.sample.on && !store.importLineOff && !(bgmDone && doubanDone) && library.length > 0 && library.length < IMPORT_LINE_MAX;
  const [lineState, setLineState] = useState<'on' | 'fading' | 'off'>(wantLine ? 'on' : 'off');
  useEffect(() => {
    if (wantLine) { setLineState('on'); return; }
    if (lineState !== 'on') return;
    setLineState('fading');
    const t = setTimeout(() => setLineState('off'), DUR.place);
    return () => clearTimeout(t);
  }, [wantLine]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- what the wall currently shows (lags the library while an arrival animates) ----- */
  const [shown, setShown] = useState<Work[]>(() => {
    const a = arrival;
    return a ? (a.prevIds.map((id) => ALL_BY_ID.get(id) ?? library.find((w) => w.id === id)).filter(Boolean) as Work[]) : library;
  });
  const [mode, setMode] = useState<WallMode>('none');
  const [newIds, setNewIds] = useState<string[]>([]);
  const mountedAt = useRef(performance.now());

  useEffect(() => {
    const a = consumeArrival();
    if (!a) {
      if (shown !== library) { setMode('none'); setShown(library); }
      return;
    }
    const visible = window.scrollY < 300;
    const sinceMount = performance.now() - mountedAt.current;
    const delay = sinceMount < 100 ? DUR.page : 0;
    const t = setTimeout(() => {
      const layoutOf = (ws: Work[]) => `${tierFor(ws.length)?.name}|${homeLayout(ws, width, vh, bp).display}`;
      const kind: WallMode = !visible ? 'none' : a.kind === 'single' && layoutOf(shown) === layoutOf(library) ? 'flip' : 'fade';
      setMode(kind);
      setNewIds(a.ids);
      setShown(library);
      const before = new Set(shown.map((w) => w.kind));
      const fresh = KIND_ORDER.filter((k) => !before.has(k) && library.some((w) => w.kind === k));
      if (shown.length && fresh.length) setTimeout(() => store.toast(`多了一类：${KIND_LABEL[fresh[0]]}`), a.kind === 'batch' ? DUR.toast + DUR.fade * 2 : DUR.place);
    }, delay);
    return () => clearTimeout(t);
  }, [library, arrival]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- top bar appears when the title scrolls out ----- */
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [titleGone, setTitleGone] = useState(false);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setTitleGone(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0, rootMargin: '-48px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [shown.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- pull down at the top → 整面墙 ----- */
  const wallRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let y0: number | null = null;
    let fired = false;
    let dy = 0;
    const start = (e: TouchEvent) => { if (window.scrollY <= 0) { y0 = e.touches[0].clientY; fired = false; dy = 0; } };
    // Pull-to-wall is touch only: a mouse wheel at the top of the page never triggers it (§8.5).
    const move = (e: TouchEvent) => {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0;
      if (dy <= 0) return;
      if (!reduced() && wallRef.current) {
        wallRef.current.style.transition = 'none';
        wallRef.current.style.transform = `scaleY(${1 + Math.min(0.08, (dy / PULL_TO_WALL) * 0.08)})`;
      }
      if (dy > PULL_TO_WALL && !fired) { fired = true; haptic('light'); }
    };
    const end = () => {
      if (y0 === null) return;
      y0 = null;
      const el = wallRef.current;
      if (el) { el.style.transition = ''; el.style.transform = ''; }
      if (fired && dy > PULL_TO_WALL) nav('/wall');
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); };
  }, [nav]);

  /* ----- dev tier switch (prototype only; ?dev=1 or tap the title three times) ----- */
  const [dev, setDev] = useState(() => new URLSearchParams(location.search).has('dev') || sessionStorage.getItem('dev') === '1');
  const taps = useRef<number[]>([]);
  const onTitleTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 600), now];
    if (taps.current.length >= 3) { const v = !dev; setDev(v); sessionStorage.setItem('dev', v ? '1' : ''); taps.current = []; }
  };
  const devPill = dev && (
    <div className="dev-pill" aria-label="假数据档位（原型调试）">
      <div>{TIERS.map((t) => <button key={t} className={store.tier === t && !store.extras.length ? 'on' : ''} onClick={() => store.setTier(t)}>{t}</button>)}</div>
    </div>
  );

  const people = useMemo(
    () => [...d.persons.values()].sort((a, b) => b.works.length - a.works.length || a.name.localeCompare(b.name, 'zh')).slice(0, 5),
    [d],
  );

  if (!shown.length) {
    const handOver = (el: HTMLTextAreaElement) => { const v = el.value; if (!v.trim()) return; el.value = ''; sheets.add(v); };
    return (
      <div className={`page page-x read-x home-empty ${enter}`} ref={ref}>
        <EmptyShelf />
        <h1 className="masthead-title" onClick={onTitleTap}>{title}</h1>
        <p className="empty-lede"><span className="phrase">只有你看得见。</span><span className="phrase">书、番、影视、音乐、游戏，</span><span className="phrase">都能收进来。</span></p>
        {/* r5 #8: one way that brings the most (a whole Bangumi collection), one field that takes anything
            (a name, a link, a pasted note — it hands over to 收录 with the words already in), and the rest as a quiet line */}
        <div className="actions">
          <button className="btn btn-primary" onClick={onBangumi}>从 Bangumi 搬进来</button>
          <label className="search-field empty-field">
            <Plus strokeWidth={1.5} />
            <textarea
              rows={1} aria-label="写一个书名、贴一个链接" placeholder="或者，写一个书名、贴一个链接"
              // uncontrolled, and nothing happens mid-composition: a pinyin IME finishes its word here first
              onInput={(e) => { if (!(e.nativeEvent as InputEvent).isComposing) handOver(e.currentTarget); }}
              onCompositionEnd={(e) => handOver(e.currentTarget)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
              spellCheck={false} autoCapitalize="off"
            />
          </label>
          <p className="empty-more t-small c-3">
            <button className="btn-text quiet" onClick={onWeread}>粘贴微信读书笔记</button><span aria-hidden> · </span>
            <button className="btn-text quiet" onClick={() => sheets.douban()}>导入豆瓣备份</button><span aria-hidden> · </span>
            <button className="btn-text quiet" onClick={() => sheets.steam()}>从 Steam 搬游戏</button><span aria-hidden> · </span>
            <button className="btn-text quiet" onClick={() => store.setSample(true)}>看看示例</button>
            {!desk && <><span aria-hidden> · </span><Link className="btn-text quiet" to="/settings">设置</Link></>}
          </p>
        </div>
        {devPill}
      </div>
    );
  }

  const kinds = KIND_ORDER.filter((k) => (d.kindCounts.get(k) ?? 0) > 0);
  const persons = d.persons.size;
  const years = d.years.size;

  // this year's say the day (「5-20」); an earlier year's say only the year, so the list reads in order
  const thisYear = String(new Date().getFullYear());
  // this year: the month and day; other years, or only the year known (a Bangumi import this year): the year (r9: was a bare 「约」)
  const yearOf = (w: Work) => `${w.date?.approx ? '约 ' : ''}${w.finished.slice(0, 4)}`;
  const recentDate = (w: Work) => (!w.finished ? '' : (w.finished.startsWith(thisYear) && fmtMD(w.finished)) || yearOf(w));
  const importLine = lineState !== 'off' && (
    <p className={`home-import t-small c-3 ${lineState === 'fading' ? 'is-fading' : ''}`}>
      <span>看过的也能一次带进来：</span>
      {!bgmDone && <button className="btn-text quiet" onClick={onBangumi}>从 Bangumi 搬</button>}
      {!bgmDone && !doubanDone && <span aria-hidden>·</span>}
      {!doubanDone && <button className="btn-text quiet" onClick={() => sheets.douban()}>导入豆瓣备份</button>}
      {!steamDone && <><span aria-hidden>·</span><button className="btn-text quiet" onClick={() => sheets.steam()}>从 Steam 搬游戏</button></>}
      <button className="btn-text quiet home-import-off" onClick={store.hideImportLine}>不用了</button>
    </p>
  );
  const recent = (
    <section className="home-recent">
      <h2 className="label-head home-label">最近</h2>
      <div>
        {library.slice(0, desk ? 8 : 5).map((w, i) => (
          <ListRow
            key={w.id} work={w} index={i} to={w.kind === 'essay' ? `/essay/${w.id}` : undefined} date={recentDate(w)}
            aside={i === 0 && w.id === store.justAdded && !w.review?.length
              ? <Link to={`/write?for=${w.id}`} className="btn-text row-aside" onClick={() => store.setJustAdded(null)}>写几句</Link>
              : undefined}
          />
        ))}
      </div>
      <Link to="/kind/all" className="btn-text home-more">全部 ›</Link>
      {importLine}
    </section>
  );

  return (
    <div className="page home" ref={ref}>
      <TopBar back={false} title={title} titleOn={titleGone} hidden={!titleGone} />
      <div className="home-top">
        <div ref={wallRef} className="wall-pull">
          <HomeWall works={shown} width={width} vh={vh} bp={bp} mode={mode} newIds={newIds} pin={store.leadPin} />
        </div>
      </div>
      <div className={`page-x home-head ${homeLayout(shown, width, vh, bp).display ? 'no-overlap' : ''} ${enter}`}>
        <header className="masthead">
          {/* the owner's name (or the plain default) set large; under it, plainly, what and since when */}
          <div className="masthead-name">
            <h1 className="masthead-title" ref={titleRef} onClick={onTitleTap}>{title}</h1>
            {!store.sample.on && <p className="t-caption c-3 masthead-caption">{captionOf(d.kindCounts, [...d.years.keys()])}</p>}
          </div>
          <div className="masthead-count">
            <Link to="/wall" className="masthead-num" aria-label={`${fmtNum(shown.length)} 条，看整面墙`}>
              <RollingNumber value={fmtNum(shown.length)} /><span className="t-caption c-ink masthead-unit">条</span>
            </Link>
            {store.sample.on
              // 「随便看看」 fills the wall with a sample: say so, and give the way back to an empty start
              ? <span className="t-caption c-3">示例内容 · <button className="btn-text quiet sample-out" onClick={() => store.setSample(false)}>换成我自己的</button></span>
              : null}
          </div>
        </header>
        {!desk && (
          <button
            className="searchbox"
            onClick={() => withViewTransition(() => nav('/search', { state: { focus: true } }))}
            aria-label="搜索"
          >
            <Search strokeWidth={1.5} />
            <span>{SEARCH_PLACEHOLDER}</span>
          </button>
        )}
        <div className="home-index">
          <nav className="type-index hscroll" aria-label="类型索引">
            {kinds.map((k) => (
              <Link key={k} to={`/kind/${k}`}><span>{KIND_LABEL[k]}</span><span>{fmtNum(d.kindCounts.get(k)!)}</span></Link>
            ))}
            {persons > 0 && <Link to="/index/people"><span>人物</span><span>{fmtNum(persons)}</span></Link>}
            {years > 0 && <Link to="/index/periods"><span>年份</span><span>{years}</span></Link>}
            {/* 在看 (v0.4 §3.19.1): the last item, only while Bangumi has some; never on the wall or in the totals */}
            {store.doing.length > 0 && <Link to="/doing"><span>在看</span><span>{store.doing.length}</span></Link>}
          </nav>
          <Link to="/wall" className="btn-text quiet wall-link">整面墙 ›</Link>
        </div>
        {desk ? (
          <div className="home-lower">
            {recent}
            <aside className="home-side">
              {people.length > 0 && (
                <section>
                  <h2 className="label-head home-label">常出现的人</h2>
                  {people.map((p) => (
                    <Link key={p.id} to={`/person/${p.id}`} className="list-row no-thumb home-person">
                      <Avatar name={p.name} size={32} />
                      <div className="list-main"><span className="list-title ellipsis">{p.name}</span></div>
                      <span className="list-date">{p.works.length}</span>
                    </Link>
                  ))}
                </section>
              )}
              {years > 0 && (
                <section className="home-vols">
                  <h2 className="label-head home-label">年份</h2>
                  <SideYears />
                </section>
              )}
            </aside>
          </div>
        ) : recent}
      </div>
      {devPill}
    </div>
  );
}

/** r9: before anything is in, five blank paper covers in each kind's own shape stand where the wall will be. */
const SHELF: [label: string, ratio: string, paper: string, book?: boolean][] = [
  ['书', '2 / 3', 'var(--paper-1)', true], ['番', '7 / 10', 'var(--paper-4)'], ['影视', '7 / 10', 'var(--paper-2)'],
  ['音乐', '1 / 1', 'var(--paper-5)'], ['游戏', '3 / 4', 'var(--paper-3)'],
];
function EmptyShelf() {
  return (
    <div className="empty-shelf" aria-hidden>
      {SHELF.map(([label, ratio, paper, book]) => (
        <div key={label} className={`cover${book ? ' is-book' : ''}`} style={{ aspectRatio: ratio, background: paper }}>
          <div className="literal"><div className="literal-title">{label}</div></div>
        </div>
      ))}
    </div>
  );
}

