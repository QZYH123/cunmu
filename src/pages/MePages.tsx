/**
 * An interest's page and a period's page (CONCEPT v1): a heading, the covers, a paragraph from the records
 * (yours once rewritten), the facts, and what you wrote then. Both are open in 给人看; their owner's
 * controls (rename, a line, take it away) are not.
 */
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useStore } from '../data/store';
import type { Work } from '../data/types';
import { fmtNum, fmtYM, fmtYMD, personId } from '../data/derive';
import { interestMembers, periodEssays, periodMembers, spanText } from '../data/me';
import { whyFor } from '../data/suggest';
import { interestLead, oftenMet, periodLead, type Seg } from '../data/lead';
import { TopBar } from '../components/Shell';
import { Cover } from '../components/Cover';
import { InfoBox, Menu, Seal, Sheet } from '../components/Bits';
import { MiniRow } from '../components/YearMini';
import { ShelfViewToggle } from '../components/ShelfView';
import { ScrollRail } from '../components/ScrollRail';
import { chapterNo, fit, InterestSheet, Lead, LeadText, useMeView } from '../components/MeParts';
import { useEnterClass } from '../lib/motion';
import { isDesk, useBreakpoint } from '../lib/useWidth';
import { FlyLink } from '../components/FlyLink';

const segList = (xs: Seg[][]) => xs.flatMap((s, i) => [...(i ? [{ text: '、' }] : []), ...s]);

function Gone({ what }: { what: string }) {
  return (
    <div className="page page-x read-x">
      <TopBar title={what} titleOn />
      <p className="t-small c-3 mp-gone">这一页已经不在了。</p>
      <Link to="/" className="btn-text">回首页</Link>
    </div>
  );
}

/** the covers across the top: as many as fit one row, at one height */
function Collage({ works }: { works: Work[] }) {
  const desk = isDesk(useBreakpoint());
  const h = desk ? 200 : 150;
  const ws = works.filter((w) => w.cover).slice(0, desk ? 7 : 5);
  if (!ws.length) return null;
  return (
    <div className="mp-collage">
      {ws.map((w) => { const [cw, ch] = fit(w, h * 1.4, h); return <FlyLink key={w.id} id={w.id} to={`/entry/${w.id}`} data-ctx={w.id} aria-label={w.title}><Cover work={w} w={cw} h={ch} paperPlaceholder /></FlyLink>; })}
    </div>
  );
}

/** the members, newest year first: the year, a small row (each year opens its page) */
function ByYear({ works }: { works: Work[] }) {
  const { yearView, setYearView } = useStore();
  const years = useMemo(() => {
    const m = new Map<number, Work[]>();
    for (const w of works) if (w.finished) { const y = Number(w.finished.slice(0, 4)); m.set(y, [...(m.get(y) ?? []), w]); }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [works]);
  if (years.length < 2) return null;
  return (
    <section className="mh-sec" aria-labelledby="mp-years">
      <div className="section-head mh-sec-head"><h2 id="mp-years" className="t-h2">一年年</h2><span className="mh-sec-aside">点一年，翻到那年</span><ShelfViewToggle className="mh-sec-view" value={yearView} onChange={setYearView} /></div>
      <ul className="mp-years">
        {years.map(([y, ws]) => (
          <li key={y}><Link to={`/year/${y}`} className="mp-yr" aria-label={`${y} 年，${ws.length} 部`}><span className="mp-y">{y}</span><MiniRow works={ws} h={36} /></Link></li>
        ))}
      </ul>
    </section>
  );
}

function Essays({ title, list }: { title: string; list: Work[] }) {
  if (!list.length) return null;
  return (
    <section className="mh-sec" aria-label={title}>
      <div className="section-head mh-sec-head"><h2 className="t-h2">{title}</h2></div>
      {list.slice(0, 4).map((e) => (
        <Link key={e.id} to={`/essay/${e.id}`} className="mh-essay">
          <span className="mh-essay-t">{e.title || '随笔'}</span>
          <span className="mh-essay-d">{fmtYMD(e.finished || e.collected.slice(0, 10))}</span>
          {e.body?.[0] && <span className="mh-essay-x">{e.body[0]}</span>}
        </Link>
      ))}
    </section>
  );
}

/** 改名字 and the line under it; 不要了 */
function NameSheet({ open, onClose, kind, name, line, lineLabel, onSave, onRemove }: {
  open: boolean; onClose: () => void; kind: string; name: string; line: string; lineLabel: string;
  onSave: (name: string, line: string) => void; onRemove: () => void;
}) {
  const [n, setN] = useState(name);
  const [l, setL] = useState(line);
  return (
    <Sheet open={open} onClose={onClose} label={`改这个${kind}`}>
      <div className="sheet-body">
        <h2 className="t-title">改这个{kind}</h2>
        <label className="mp-field"><span className="label-head">名字</span><input className="ask-field" value={n} maxLength={24} onChange={(e) => setN(e.target.value)} /></label>
        <label className="mp-field"><span className="label-head">{lineLabel}</span><input className="ask-field ask-field-quiet" value={l} maxLength={80} placeholder="可以不写" onChange={(e) => setL(e.target.value)} /></label>
        <div className="sheet-actions pair">
          <button className="btn btn-secondary" onClick={() => { onRemove(); onClose(); }}>不要这个{kind}了</button>
          <button className="btn btn-primary" disabled={!n.trim()} onClick={() => { onSave(n.trim(), l.trim()); onClose(); }}>存下</button>
        </div>
      </div>
    </Sheet>
  );
}

function useOwnerMenu(label: string) {
  const { show } = useStore();
  const desk = isDesk(useBreakpoint());
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const button = !show && (
    <button className="icon-btn" aria-label="更多" aria-haspopup="menu" aria-expanded={!!menu} onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}><MoreHorizontal strokeWidth={1.5} /></button>
  );
  return { menu, setMenu, right: button || undefined, desk, label };
}

/* ---------- 兴趣 ---------- */

export function InterestPage() {
  const { id = '' } = useParams();
  const store = useStore();
  const nav = useNavigate();
  const { me, show } = store;
  const view = useMeView();
  const enter = useEnterClass();
  const i = me.interests.find((x) => x.id === id);
  // which part the sheet opens on; a fresh sheet each time (the last one keeps its leave)
  const [editing, setEditing] = useState<null | 'name' | 'works'>(null);
  const [round, setRound] = useState(0);
  const edit = (f: 'name' | 'works') => { setRound((r) => r + 1); setEditing(f); };
  const own = useOwnerMenu('兴趣');
  const ms = useMemo(() => (i ? interestMembers(i, view.works) : []), [i, view.works]);
  if (!i) return <Gone what="兴趣" />;
  const dated = ms.filter((w) => w.finished);
  const first = dated.length ? dated.reduce((a, w) => (w.finished < a.finished ? w : a)) : undefined;
  const lead = interestLead(i, view.ctx);
  const people = oftenMet(ms, 3, (n) => store.d.persons.has(personId(n))).filter((n) => n !== i.name);
  const inP = view.periods.map((p) => ({ p, n: periodMembers(p, ms, view.today).length })).filter((x) => x.n >= 3).sort((a, b) => b.n - a.n)[0];
  const also = (i.rule.tags ?? []).slice(1);
  const favs = view.favs.filter((x) => ms.some((w) => w.id === x.w.id));
  const essays = view.visible.filter((w) => w.kind === 'essay' && ms.some((m) => (w.body ?? []).some((p) => p.includes(m.title))));
  const rows = [
    first && { key: '始于', value: <LeadText className="mh-infotext" segs={[{ text: `${fmtYM(first.finished)} · 《` }, { text: first.title, to: `/entry/${first.id}`, kind: 'work' }, { text: '》' }]} /> },
    people.length > 0 && { key: '常遇见', value: <LeadText className="mh-infotext" segs={segList(people.map((p) => [{ text: p, to: `/person/${personId(p)}`, kind: 'person' as const }]))} /> },
    inP && { key: '多在', value: <LeadText className="mh-infotext" segs={[{ text: inP.p.name, to: `/period/${inP.p.id}`, kind: 'period' }]} /> },
    also.length > 0 && { key: '也算', value: also.join('、') },
  ].filter(Boolean) as { key: string; value: React.ReactNode }[];
  return (
    <div className="page mp">
      <TopBar title={i.name} titleOn right={own.desk ? undefined : own.right} />
      <div className={`page-x read-x mp-wrap ${enter}`}>
        <p className="mp-kicker">兴趣</p>
        <h1 className="mp-title">{i.name}</h1>
        <p className="mp-sub">{[first && `${first.finished.slice(0, 4)} 年起`, `${fmtNum(ms.length)} 部`].filter(Boolean).join(' · ')}</p>
        {i.blurb && <p className="mp-epigraph">{i.blurb}</p>}
        <Collage works={ms} />
        {ms.length === 0 && !show && (
          <p className="mp-empty t-small c-3">
            <span>放进来的作品会排在这里。</span>
            <button className="btn-text quiet" onClick={() => edit('works')}>挑几部放进来</button>
          </p>
        )}
        <Lead segs={lead} mine={i.lead} onSave={(t) => store.updateInterest(i.id, { lead: t.trim() || undefined })} />
        {rows.length > 0 && <div className="mh-info"><InfoBox rows={rows} /></div>}
        {favs.length > 0 && (
          <section className="mh-sec" aria-labelledby="mp-favs">
            <div className="section-head mh-sec-head"><h2 id="mp-favs" className="t-h2">最爱里的</h2></div>
            <ul className="mp-favs">
              {favs.map(({ f, w }) => (
                <li key={w.id}><FlyLink id={w.id} to={`/entry/${w.id}`} className="mp-fav" data-ctx={w.id}>
                  {(() => { const [cw, ch] = fit(w, 64, 92); return <Cover work={w} w={cw} h={ch} paperPlaceholder />; })()}
                  <span><span className="mh-fav-t">{w.title}{w.year ? <span className="mh-fav-y">{w.year}</span> : null}</span><span className="mh-fav-w">{f.why || whyFor(w).why}</span></span>
                </FlyLink></li>
              ))}
            </ul>
          </section>
        )}
        <ByYear works={ms} />
        <Essays title="写到它的" list={essays} />
        <p className="mh-colo"><Seal /><span>存目</span></p>
      </div>
      {own.desk && own.right && <div className="desk-tools">{own.right}</div>}
      {own.menu && <Menu anchor={own.menu} onClose={() => own.setMenu(null)} label="更多" items={[{ label: '改名字和一句话', run: () => edit('name') }, { label: '放进或拿出作品', run: () => edit('works') }]} />}
      {!show && (
        <InterestSheet
          key={`${i.id}-${round}`} open={!!editing} onClose={() => setEditing(null)} interest={i} focus={editing ?? 'name'}
          onRemove={() => { const keep = i; store.removeInterest(i.id); nav('/', { replace: true }); store.toast(`拿掉了兴趣：${keep.name}`, { label: '撤销', run: () => store.addInterest({ ...keep }) }); }}
        />
      )}
    </div>
  );
}

/* ---------- 时期 ---------- */

export function PeriodPage() {
  const { id = '' } = useParams();
  const shelfRef = useRef<HTMLDivElement>(null);
  const store = useStore();
  const nav = useNavigate();
  const { show } = store;
  const view = useMeView();
  const enter = useEnterClass();
  const at = view.periods.findIndex((x) => x.id === id);
  const p = at >= 0 ? view.periods[at] : undefined;
  const [editing, setEditing] = useState(false);
  const own = useOwnerMenu('时期');
  const ms = useMemo(() => (p ? periodMembers(p, view.works, view.today) : []), [p, view.works, view.today]);
  if (!p) return <Gone what="时期" />;
  const lead = periodLead(p, view.ctx);
  const essays = periodEssays(p, view.visible, view.today);
  const quoted = ms.map((w) => ({ w, ...whyFor(w) })).find((x) => x.why && [...x.why].length >= 8);
  const prev = at > 0 ? view.periods[at - 1] : null;
  const next = at < view.periods.length - 1 ? view.periods[at + 1] : null;
  return (
    <div className="page mp">
      <TopBar title={p.name} titleOn right={own.desk ? undefined : own.right} />
      <div className={`page-x read-x mp-wrap ${enter}`}>
        <p className="mp-kicker">时期 · 第{chapterNo(at)}段</p>
        <h1 className="mp-title">{p.name}</h1>
        <p className="mp-sub">{spanText(p)} · {fmtNum(ms.length)} 部</p>
        {p.epigraph && <p className="mp-epigraph">{p.epigraph}</p>}
        {/* the stretch itself, in its order: one row of covers that scrolls sideways */}
        <div className="mp-shelf" ref={shelfRef} role="group" aria-label={`这段日子的 ${ms.length} 部`}>
          {ms.slice(0, 80).map((w) => { const [cw, ch] = fit(w, 150 * 1.4, 150); return <FlyLink key={w.id} id={w.id} to={`/entry/${w.id}`} data-ctx={w.id} aria-label={w.title}><Cover work={w} w={cw} h={ch} paperPlaceholder /></FlyLink>; })}
        </div>
        <ScrollRail target={shelfRef} />
        {ms.length > 4 && <p className="t-caption c-3 mp-more">按时间排着，往左滑看{ms.length > 80 ? '前 80 部' : '完'}</p>}
        <Lead segs={lead} mine={p.lead} onSave={(t) => store.updatePeriod(p.id, { lead: t.trim() || undefined })} />
        {quoted && (
          <blockquote className="mp-quote">
            「{quoted.why}」
            <cite>{quoted.whyFrom === 'bangumi' ? `你在 Bangumi 给《${quoted.w.title}》写的` : `摘自你在《${quoted.w.title}》写的几句`}{quoted.w.finished ? ` · ${fmtYM(quoted.w.finished)}` : ''}</cite>
          </blockquote>
        )}
        <Essays title="那时写下的" list={essays} />
        {(prev || next) && (
          <nav className="mp-chapnav" aria-label="前后的时期">
            {prev ? <Link to={`/period/${prev.id}`}><span className="k">‹ 前一段</span><span className="t">{prev.name}</span></Link> : <span />}
            {next ? <Link to={`/period/${next.id}`} className="next"><span className="k">后一段 ›</span><span className="t">{next.name}</span></Link> : <span />}
          </nav>
        )}
        <p className="mh-colo"><Seal /><span>存目</span></p>
      </div>
      {own.desk && own.right && <div className="desk-tools">{own.right}</div>}
      {own.menu && <Menu anchor={own.menu} onClose={() => own.setMenu(null)} label="更多" items={[{ label: '改名字和一句话', run: () => setEditing(true) }]} />}
      {!show && (
        <NameSheet
          key={`${p.id}-${editing}`} open={editing} onClose={() => setEditing(false)} kind="时期" name={p.name} line={p.epigraph ?? ''} lineLabel="题记（一句那时候的话）"
          onSave={(name, epigraph) => store.updatePeriod(p.id, { name, epigraph: epigraph || undefined })}
          onRemove={() => { const keep = p; store.removePeriod(p.id); nav('/', { replace: true }); store.toast(`拿掉了时期：${keep.name}`, { label: '撤销', run: () => store.addPeriod({ ...keep }) }); }}
        />
      )}
    </div>
  );
}
