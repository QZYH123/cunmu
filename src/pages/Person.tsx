import { Link, useParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { TopBar } from '../components/Shell';
import { Avatar, Cover } from '../components/Cover';
import { InfoBox, ListRow, Section } from '../components/Bits';
import { Colophon, Mentions } from '../components/Prose';
import { fmtYMD, isLatin, listDate } from '../data/derive';
import { titleSize } from '../components/HeroZone';
import { useEnterClass } from '../lib/motion';
import { isDesk, useBreakpoint, useWidth } from '../lib/useWidth';

const aspectOf = (w: Work) => (w.cover && !w.coverBroken ? Math.min(1, w.cover.aspect) : KIND_ASPECT[w.kind]);
import { tintOf, tintVars, useTint } from '../lib/tint';
import { useFly } from '../components/CoverWall';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { DUR, OBJ_FIT_MIN, PERSON_BAND, PERSON_SEAL } from '../tokens';
import { useSectionSpy } from './Entry';
import { KIND_ASPECT, type Work } from '../data/types';
import { justify } from '../lib/justify';
import { ScrollRail } from '../components/ScrollRail';
import { spaceLiterals, wallAspectOf } from '../components/CoverWall';

export default function Person() {
  const { id = '' } = useParams();
  const { d } = useStore();
  const enter = useEnterClass();
  const p = d.persons.get(id);
  const { h1, h1Gone, section } = useSectionSpy([id]);
  const bp = useBreakpoint();
  const desk = isDesk(bp);
  const fly = useFly();
  const [pageRef, vw] = useWidth<HTMLDivElement>();
  // S4 on the person hero (§7.5): there are no portrait photos in the prototype, so the light comes
  // from the cover of their work that has the strongest colour — still the user's own collection.
  const lightFrom = p?.works.filter((w) => tintOf(w)).sort((a, b) => (tintOf(b)!.c - tintOf(a)!.c))[0];
  const tint = useTint(lightFrom);
  const [lit, setLit] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setLit(true), enter ? DUR.page : 0); return () => window.clearTimeout(t); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Desktop objects (P2-3): the row runs from the container's left edge to the viewport's right, and
  // the covers shrink (to OBJ_FIT_MIN of their height at most) so the whole set fits it when it can —
  // at 1920 the row used to stop at the container edge, a cover sliced off mid-page.
  const objRow = useRef<HTMLDivElement>(null);
  const [objFit, setObjFit] = useState<number | null>(null);
  const objKey = `${id}:${vw}:${bp}`;
  useLayoutEffect(() => {
    const el = objRow.current;
    if (!el || !desk) { setObjFit(null); return; }
    const cs = getComputedStyle(el);
    const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const n = p?.works.length ?? 0;
    const sum = (p?.works ?? []).reduce((a, w) => a + aspectOf(w), 0);
    if (!n || !sum) return;
    const fit = (avail - parseFloat(cs.columnGap || '0') * (n - 1)) / sum;
    const full = PERSON_BAND[bp].objH;
    setObjFit(Math.round(Math.max(full * OBJ_FIT_MIN, Math.min(full, fit))));
  }, [objKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return <div className="page under-bar page-x"><TopBar /><p className="t-ui c-2 empty-line">索引里还没有这个人。</p><Link to="/index/people" className="btn-text quiet empty-back">所有人物 ›</Link></div>;
  const works = [...p.works].sort((a, b) => (a.finished < b.finished ? 1 : -1));
  const byRelease = [...p.works].filter((w) => w.year).sort((a, b) => (a.year! - b.year!));
  const earliest = byRelease[0];
  const latest = byRelease[byRelease.length - 1];
  const firstIn = [...p.works].sort((a, b) => (a.collected < b.collected ? -1 : 1))[0];
  const spec = PERSON_BAND[bp];
  // a band needs at least two works per row and every row full (justify drops a short last row)
  const bandWorks = spaceLiterals(works);
  const bandRows = works.length >= 4 && vw > 0 ? justify(bandWorks.map(wallAspectOf), vw, spec.H, spec.rows) : [];
  const band = bandRows.length ? { rows: bandRows, height: bandRows[bandRows.length - 1].y + bandRows[bandRows.length - 1].h } : null;
  const objH = desk && objFit ? objFit : spec.objH;
  const roleLabel = p.roles.slice(0, 2).join(' · ');
  const reason = p.core
    ? (firstIn.source === 'manual'
      ? `${fmtYMD(firstIn.collected)}收进索引，因为《${firstIn.title}》`
      : `因为《${firstIn.title}》收进索引`)
    : p.manual ? `${fmtYMD(firstIn.collected)}从《${firstIn.title}》收进索引` : `因为出现在 ${p.works.length} 部作品里`;
  const info = (
    <InfoBox rows={[
      { key: '担任', value: roleLabel },
      { key: '最早', value: earliest && <>{earliest.year}<Link className="infolink" to={`/entry/${earliest.id}`}>《{earliest.title}》</Link></> },
      { key: '最近', value: latest && latest !== earliest ? <>{latest.year}<Link className="infolink" to={`/entry/${latest.id}`}>《{latest.title}》</Link></> : undefined },
      ...(desk ? [] : [{ key: '出现在', value: `${p.works.length} 部` }]),
    ]} />
  );
  const zone = `hero-zone person-zone ${tint ? 'tinted' : ''} ${lit ? 'lit' : ''} ${band ? 'has-band' : ''}`;
  const zoneStyle = tintVars(tint) as CSSProperties;
  const tile = (w: Work, t: { x: number; y: number; w: number; h: number }) => (
    <Link key={w.id} to={`/entry/${w.id}`} className="pband-tile" style={{ left: t.x, top: t.y, width: t.w, height: t.h }} data-fly-src={w.id} onClick={(e) => fly(e, w.id)} aria-label={w.title}>
      <Cover work={w} w={t.w} h={t.h} className="flat" paperPlaceholder />
    </Link>
  );
  const object = (w: Work) => (
    <Link key={w.id} to={`/entry/${w.id}`} className="pobject" data-fly-src={w.id} onClick={(e) => fly(e, w.id)} aria-label={w.title}>
      <Cover work={w} w={Math.round(objH * aspectOf(w))} h={objH} paperPlaceholder />
    </Link>
  );
  // The works are the portrait (polish r2): enough of them to fill a row → a full-bleed band in the
  // wall's language; otherwise they stand on the paper as objects. The monogram drops to a seal.
  const picture = band ? (
    <div className="pband" style={{ height: band.height }}>
      {band.rows.flatMap((r) => r.tiles.map((t) => tile(bandWorks[t.index], t)))}
    </div>
  ) : (
    <>
      <div className="pobjects page-x hscroll" ref={objRow}>{works.map(object)}</div>
      <ScrollRail target={objRow} />
    </>
  );
  const nameBlock = (
    <div className="person-name">
      <div className="person-tag t-label c-3"><Avatar name={p.name} size={PERSON_SEAL} />人物 · {p.roles[0]}</div>
      <h1 className={`hero-title ${titleSize(p.name)} ${isLatin(p.name) ? 'is-latin' : ''}`} ref={h1}>{p.name}</h1>
      {p.alias && <p className="t-ui c-2">{p.alias}</p>}
    </div>
  );
  const record = works.map((w, i) => <ListRow key={w.id} work={w} index={i} date={listDate(w)} />);

  if (desk) {
    return (
      <div className="page person-page" ref={pageRef}>
        <TopBar title={p.name} titleOn={h1Gone} sub={h1Gone ? section : ''} />
        <div className={enter}>
          <header className={zone} style={zoneStyle}>
            {picture}
            <div className="page-x person-hero">
              {nameBlock}
              <div className="person-count">
                <span className="person-num">{p.works.length}</span>
                <span className="t-caption c-3">部作品</span>
              </div>
            </div>
          </header>
          <div className="page-x person-grid">
            <section className="person-works">
              <h2 className="label-head home-label">我看过的</h2>
              <div className="person-list">{record}</div>
            </section>
            <aside className="person-side">
              {info}
              <Mentions targetId={p.id} />
              <Colophon date={firstIn.collected} reason={reason} />
            </aside>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page person-page-phone" ref={pageRef}>
      <TopBar title={p.name} titleOn={h1Gone} sub={h1Gone ? section : ''} clear={!h1Gone} />
      <div className={enter}>
        <header className={zone} style={zoneStyle}>
          {picture}
          <div className="page-x person-head">{nameBlock}</div>
        </header>
        <div className="page-x person">
          <div className="person-info">{info}</div>
          <Section title="我看过的" count={works.length}>
            <div className="person-list">{record}</div>
          </Section>
          <Mentions targetId={p.id} />
          <Colophon date={firstIn.collected} reason={reason} />
        </div>
      </div>
    </div>
  );
}
