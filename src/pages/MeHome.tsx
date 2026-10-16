/**
 * 首页 「我」 (CONCEPT v1 · 以你为主角): a page about you, written from what you keep. The name and a line,
 * one picture you chose, a paragraph from the records (yours once you rewrite it), the facts in a box, then
 * 最爱, what you have always liked, the stretches of your life by name, what you wrote and shot, and the way
 * into everything. While nothing is set it is a draft, with one suggestion at a time.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useStore } from '../data/store';
import type { Work } from '../data/types';
import { fmtNum, fmtYM, fmtYMD } from '../data/derive';
import { interestMembers, periodMembers, spanText, type Interest, type Period } from '../data/me';
import { whyFor } from '../data/suggest';
import { autoLine, homeLead, oftenMet, type Seg } from '../data/lead';
import { personId } from '../data/derive';
import { TopBar } from '../components/Shell';
import { Cover } from '../components/Cover';
import { InfoBox, Menu, Seal, type MenuItem } from '../components/Bits';
import { MiniRow } from '../components/YearMini';
import { chapterNo, CoverPickSheet, FavEditSheet, fit, Lead, LeadText, Pill, Strip, SuggestCard, useMeView } from '../components/MeParts';
import { Dateline } from '../components/Dateline';
import { fileTitle, titleOf } from '../lib/naming';
import { saveOut, exportTarget } from '../lib/saveOut';
import { isDesk, useBreakpoint } from '../lib/useWidth';
import { useEnterClass } from '../lib/motion';
import { useSheets } from '../App';
import { DUR, IMPORT_LINE_MAX } from '../tokens';

export type HomeAct = 'cover' | 'favs' | 'image';

export default function MeHome() {
  const store = useStore();
  const { me, show, d } = store;
  const view = useMeView();
  const { works, periods, ctx, favs, next } = view;
  const nav = useNavigate();
  const loc = useLocation();
  const desk = isDesk(useBreakpoint());
  const enter = useEnterClass();
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [sheet, setSheet] = useState<null | 'cover' | 'favs'>(null);
  const draft = !store.title?.trim();
  const name = titleOf(store.title);

  /* ----- 存成一张长图: drawn exactly as 给人看 shows the page ----- */
  const pageRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const saveImage = async () => {
    if (drawing || !pageRef.current) return;
    setDrawing(true);
    const was = store.show;
    if (!was) store.setShow(true);
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
    try {
      await frame(); await frame();
      const el = pageRef.current!;
      // every picture in, not only the ones on screen, and settled past its fade
      await Promise.all([...el.querySelectorAll('img')].map((img) => { img.loading = 'eager'; return img.decode().catch(() => undefined); }));
      await document.fonts.ready;
      await wait(DUR.place);
      const { drawLong } = await import('../lib/longImage');
      const blob = await drawLong(el);
      // drawn: the page is yours again before the file is handed over (给人看 stops every link, a download's too)
      if (!was) store.setShow(false);
      await frame();
      const r = await saveOut(blob, `${fileTitle(store.title) || '存目'}.png`);
      if (r === 'done' && exportTarget() === 'download') store.toast('长图存好了，在下载里');
    } catch {
      store.toast('这张图没画出来，再试一次');
    } finally {
      if (!was) store.setShow(false);
      setDrawing(false);
    }
  };
  const enterShow = () => { store.setShow(true); window.scrollTo(0, 0); };

  // the desktop bar's ··· (and a deep link) ask for a sheet by navigating here with it
  useEffect(() => {
    const act = (loc.state as { act?: HomeAct } | null)?.act;
    if (act === 'cover' || act === 'favs') setSheet(act);
    if (act === 'image') void saveImage();
  }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- the title scrolls out → the bar takes it ----- */
  const nameRef = useRef<HTMLHeadingElement>(null);
  const [nameGone, setNameGone] = useState(false);
  useEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNameGone(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-48px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const lead = useMemo(() => homeLead(ctx), [ctx]);
  const line = me.profile.line?.trim() || autoLine(ctx);

  /* ----- the one picture ----- */
  const plate = useMemo(() => {
    const pick = (id?: string) => (id ? d.byId.get(id) : undefined);
    const ok = (w?: Work) => !!w?.cover && (!show || !me.onlyMe.includes(w.id));
    const fromFav = favs.find((x) => ok(x.w))?.w;
    const w = [pick(me.profile.frontispiece), fromFav].find(ok) ?? works.find((x) => x.cover && (x.rating10 ?? 0) >= 9) ?? works.find((x) => x.cover);
    if (!w) return null;
    const why = me.favorites.find((f) => f.id === w.id)?.why || whyFor(w).why;
    return { w, why };
  }, [d, me, favs, works, show]);

  const essays = view.visible.filter((w) => w.kind === 'essay');
  const photos = useMemo(() => view.visible.flatMap((w) => (w.images ?? []).map((im) => ({ im, w }))).sort((a, b) => (a.im.addedAt < b.im.addedAt ? 1 : -1)), [view.visible]);
  const firstWork = useMemo(() => works.filter((w) => w.finished).reduce<Work | null>((a, w) => (!a || w.finished < a.finished ? w : a), null), [works]);
  const people = useMemo(() => oftenMet(works, 3, (n) => d.persons.has(personId(n))), [works, d]);

  const segLinks = (segs: Seg[][]) => segs.flatMap((s, i) => [...(i ? [{ text: '、' }] : []), ...s]);
  const info = [
    firstWork && { key: '始于', value: <LeadText className="mh-infotext" segs={[{ text: `${fmtYM(firstWork.finished)} · 《` }, { text: firstWork.title, to: `/entry/${firstWork.id}`, kind: 'work' }, { text: '》' }]} /> },
    me.interests.length > 0 && { key: '一直喜欢', value: <LeadText className="mh-infotext" segs={segLinks(me.interests.slice(0, 4).map((i) => [{ text: i.name, to: `/interest/${i.id}`, kind: 'interest' as const }]))} /> },
    people.length > 0 && { key: '常遇见', value: <LeadText className="mh-infotext" segs={segLinks(people.map((p) => [{ text: p, to: `/person/${personId(p)}`, kind: 'person' as const }]))} /> },
    periods.length > 0 && { key: '时期', value: <LeadText className="mh-infotext" segs={[{ text: `${periods.length} 段，最近一段是「` }, { text: periods[periods.length - 1].name, to: `/period/${periods[periods.length - 1].id}`, kind: 'period' }, { text: '」' }]} /> },
    (essays.length > 0 || photos.length > 0) && { key: '写过', value: [essays.length && `${essays.length} 篇随笔`, photos.length && `${photos.length} 张照片`].filter(Boolean).join('，') },
  ].filter(Boolean) as { key: string; value: React.ReactNode }[];

  const menuItems: MenuItem[] = [
    { label: '存成一张长图', note: '给人看时的样子', run: () => void saveImage() },
    { label: '换首页封面', run: () => setSheet('cover') },
    { label: '设置', run: () => nav('/settings') },
  ];
  const right = !desk && !show && (
    <span className="mh-tools">
      <button className="btn-text mh-show" onClick={enterShow}>给人看</button>
      <button className="icon-btn" aria-label="更多" aria-haspopup="menu" aria-expanded={!!menu} onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}><MoreHorizontal strokeWidth={1.5} /></button>
    </span>
  );

  const plateEl = plate && (
    <figure className="mh-plate">
      <Link to={`/entry/${plate.w.id}`} aria-label={`《${plate.w.title}》`} data-ctx={plate.w.id} className="mh-plate-cv">
        {(() => { const [cw, ch] = fit(plate.w, desk ? 236 : 212, desk ? 340 : 300); return <Cover work={plate.w} w={cw} h={ch} size="medium" />; })()}
      </Link>
      <figcaption>
        <span className="mh-plate-t">《{plate.w.title}》{plate.w.year ? `，${plate.w.year}` : ''}</span>
        {plate.why && <span className="mh-plate-q">{plate.why}</span>}
      </figcaption>
    </figure>
  );
  const infoEl = info.length > 0 && <div className="mh-info"><InfoBox rows={info} /></div>;

  return (
    <div className={`page mh ${show ? 'showing' : ''}`} ref={pageRef}>
      <TopBar back={false} title={name} titleOn={nameGone} right={right || undefined} />
      <div className={`page-x mh-wrap ${enter}`}>
        <div className="mh-main">
          <header className="mh-head">
            {!show && <Dateline />}
            <h1 className="mh-name" ref={nameRef}>{name}</h1>
            {line && <p className="mh-line">{line}</p>}
            {draft && !show && <p className="mh-draft">先这样排了，随时能改</p>}
          </header>
          {!show && <ImportLine />}
          {next && <SuggestCard key={next.key} s={next} />}
          {!desk && plateEl}
          <Lead segs={lead} mine={me.profile.lead} onSave={(t) => store.setProfile({ lead: t })} />
          {!desk && infoEl}

          <Favorites favs={favs} desk={desk} onEdit={() => setSheet('favs')} />
          <Interests list={me.interests} works={works} />
          <Periods list={periods} works={works} today={view.today} />
          <Writing essays={essays} photos={photos} />

          {!show && (
            <footer className="mh-all">
              <Link to="/all" className="mh-all-link" aria-label={`全部 ${fmtNum(works.length)} 部`}>
                <MiniRow works={works} h={46} align="center" className="mh-all-row" />
                <span>全部 <span className="c-3">{fmtNum(works.length)} 部 ›</span></span>
              </Link>
            </footer>
          )}
          <p className="mh-colo"><Seal /><span>存目</span></p>
        </div>
        {desk && <aside className="mh-side">{plateEl}{infoEl}</aside>}
      </div>
      {menu && <Menu anchor={menu} onClose={() => setMenu(null)} items={menuItems} label="更多" />}
      <CoverPickSheet open={sheet === 'cover'} onClose={() => setSheet(null)} />
      <FavEditSheet open={sheet === 'favs'} onClose={() => setSheet(null)} />
      {drawing && createPortal(<div className="drawing-veil" role="status"><span>正在画成一张长图…</span></div>, document.body)}
    </div>
  );
}

function Favorites({ favs, desk, onEdit }: { favs: { f: { id: string; why?: string }; w: Work }[]; desk: boolean; onEdit: () => void }) {
  const { show } = useStore();
  if (!favs.length && show) return null;
  const box = desk ? 270 : 232;
  return (
    <section className="mh-sec" aria-labelledby="mh-favs">
      <div className="section-head mh-sec-head">
        <h2 id="mh-favs" className="t-h2">最爱</h2>
        {!show && <button className="btn-text quiet mh-sec-act" onClick={onEdit}>{favs.length ? '改一下' : '挑几部'}</button>}
      </div>
      {favs.length === 0
        ? <p className="t-small c-3 mh-quiet">还没有。在任何一部的页面上点「放进最爱」，它就会在这里。</p>
        : (
          <ol className="mh-favs">
            {favs.map(({ f, w }) => {
              const auto = f.why ? null : whyFor(w);
              const why = f.why || auto?.why;
              const [cw, ch] = fit(w, desk ? 196 : 160, box);
              return (
                <li key={w.id} className="mh-fav">
                  <Link to={`/entry/${w.id}`} data-ctx={w.id} className="mh-fav-link">
                    <span className="mh-fav-box" style={{ height: box }}><Cover work={w} w={cw} h={ch} paperPlaceholder /></span>
                    <span className="mh-fav-t">{w.title}{w.year ? <span className="mh-fav-y">{w.year}</span> : null}</span>
                  </Link>
                  {why && <p className="mh-fav-w">{why}{auto?.whyFrom === 'bangumi' && !show && <span className="mh-from">在 Bangumi 写的</span>}</p>}
                </li>
              );
            })}
          </ol>
        )}
    </section>
  );
}

function Interests({ list, works }: { list: Interest[]; works: Work[] }) {
  const rows = useMemo(() => list.map((i) => {
    const ms = interestMembers(i, works);
    const dated = ms.filter((w) => w.finished);
    const first = dated.length ? dated.reduce((a, w) => (w.finished < a.finished ? w : a)) : undefined;
    const last = dated.length ? dated.reduce((a, w) => (w.finished > a.finished ? w : a)) : undefined;
    return { i, ms, first, last };
  }).filter((x) => x.ms.length), [list, works]);
  if (!rows.length) return null;
  return (
    <section className="mh-sec" aria-labelledby="mh-ints">
      <div className="section-head mh-sec-head"><h2 id="mh-ints" className="t-h2">一直喜欢的</h2></div>
      <ul className="mh-ints">
        {rows.map(({ i, ms, first, last }) => (
          <li key={i.id} className="mh-int">
            <Link to={`/interest/${i.id}`} className="mh-int-link">
              <span className="mh-int-n">{i.name}</span>
              {first && <span className="mh-int-y">{first.finished.slice(0, 4)} 年起</span>}
              <span className="mh-int-d">{i.blurb || (first && last && first !== last ? `从《${first.title}》开始；最近一部是《${last.title}》。` : first ? `从《${first.title}》开始。` : '')}</span>
              <Strip works={ms} h={52} max={6} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Periods({ list, works, today }: { list: Period[]; works: Work[]; today: string }) {
  const { show } = useStore();
  const rows = useMemo(() => list.map((p) => ({ p, ms: periodMembers(p, works, today) })), [list, works, today]);
  if (!rows.length) return null;
  return (
    <section className="mh-sec" aria-labelledby="mh-pers">
      <div className="section-head mh-sec-head"><h2 id="mh-pers" className="t-h2">那几段日子</h2></div>
      <ol className="mh-toc">
        {rows.map(({ p, ms }, n) => {
          const lead = ms.find((w) => w.cover);
          return (
            <li key={p.id} className="mh-ch">
              <Link to={`/period/${p.id}`} className="mh-ch-link">
                <span className="mh-ch-plate">{lead && (() => { const [cw, ch] = fit(lead, 72, 100); return <Cover work={lead} w={cw} h={ch} paperPlaceholder />; })()}</span>
                <span className="mh-ch-r">
                  <span className="mh-ch-h"><span className="mh-ch-n">{chapterNo(n)}</span><span className="mh-ch-t">{p.name}</span></span>
                  <span className="mh-ch-y">{spanText(p)}</span>
                  <span className="mh-ch-l">{p.epigraph || (ms[0] ? `从《${ms[0].title}》开始。` : '')}</span>
                  <Strip works={ms.slice(1)} h={40} max={5} />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      {!show && <p className="mh-years t-caption c-3"><Link to="/all">没起名字的年份，在「全部」里按年排着 ›</Link></p>}
    </section>
  );
}

function Writing({ essays, photos }: { essays: Work[]; photos: { im: { id: string; src: string; aspect: number; addedAt: string }; w: Work }[] }) {
  const { me, show } = useStore();
  if (!essays.length && !photos.length) return null;
  return (
    <section className="mh-sec" aria-labelledby="mh-writ">
      <div className="section-head mh-sec-head"><h2 id="mh-writ" className="t-h2">写过的、拍过的</h2></div>
      {essays.slice(0, 3).map((e) => (
        <Link key={e.id} to={`/essay/${e.id}`} className="mh-essay">
          <span className="mh-essay-t">{e.title || '随笔'}{!show && me.onlyMe.includes(e.id) && <Pill>只给自己</Pill>}</span>
          <span className="mh-essay-d">{fmtYMD(e.finished || e.collected.slice(0, 10))}</span>
          {e.body?.[0] && <span className="mh-essay-x">{e.body[0]}</span>}
        </Link>
      ))}
      {photos.length > 0 && (
        <div className={`mh-photos n${Math.min(3, photos.length)}`}>
          {photos.slice(0, 3).map(({ im, w }) => (
            <Link key={im.id} to={w.kind === 'essay' ? `/essay/${w.id}` : `/entry/${w.id}`} className="mh-photo" aria-label={w.title}>
              <img src={im.src} alt="" loading="lazy" decoding="async" />
            </Link>
          ))}
        </div>
      )}
      {photos.length > 3 && <p className="t-caption c-3 mh-pcap">另外 {photos.length - 3} 张</p>}
    </section>
  );
}

/** a small library: one quiet line offering the two big ways in, as on 全部 (不用了 is remembered) */
function ImportLine() {
  const store = useStore();
  const sheets = useSheets();
  const bgmDone = store.bangumiOn;
  const doubanDone = store.batches.some((b) => b.provider === 'douban_xlsx' && !b.undoneAt);
  const steamDone = !!store.connections.steam;
  const own = store.library.filter((w) => !w.isSample).length;
  if (store.sample.on || store.importLineOff || (bgmDone && doubanDone) || !own || own >= IMPORT_LINE_MAX) return null;
  return (
    <p className="home-import mh-import t-small c-3">
      <span>看过的也能一次带进来：</span>
      {!bgmDone && <button className="btn-text quiet" onClick={() => sheets.bangumi()}>从 Bangumi 搬</button>}
      {!bgmDone && !doubanDone && <span aria-hidden>·</span>}
      {!doubanDone && <button className="btn-text quiet" onClick={() => sheets.douban()}>导入豆瓣备份</button>}
      {!steamDone && <><span aria-hidden>·</span><button className="btn-text quiet" onClick={() => sheets.steam()}>从 Steam 搬游戏</button></>}
      <button className="btn-text quiet home-import-off" onClick={store.hideImportLine}>不用了</button>
    </p>
  );
}
