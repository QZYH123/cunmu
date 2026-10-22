import { fmtPlaytime } from '../lib/steam';
import { SteamPlay } from '../components/SteamPlay';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EditWorkSheet } from '../components/EditWorkSheet';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { FAV_MAX } from '../data/me';
import { useStore } from '../data/store';
import { epigraphOf, normalizeQuotes } from '../data/quotes';
import { ALL_BY_ID } from '@demo';
import type { Credit, Kind, Work } from '../data/types';
import { KIND_ASPECT, KIND_LABEL, SOURCE_LABEL, sourceLabelOf } from '../data/types';
import { Cover } from '../components/Cover';
import { cnMonth, entryWhen, entryWhenParts, mentionTitle, personId } from '../data/derive';
import { DateSheet } from '../components/DateSheet';
import { useImageSrc } from '../lib/images';
import type { UserImage } from '../data/types';
import { TopBar } from '../components/Shell';
import { CoverViewer, InfoBox, Menu, Preview, Section, type InfoRow, type MenuItem } from '../components/Bits';
import { Colophon, Mentions, Prose, SideMentions, kindTag, useMentions } from '../components/Prose';
import { HeroZone, type Epigraph, type StripItem } from '../components/HeroZone';
import { TocRail, type TocItem } from '../components/TocRail';
import { reduced, takeFlight, useEnterClass, useFlip } from '../lib/motion';
import { isDesk, useBreakpoint, useViewportW } from '../lib/useWidth';
import { BP, DUR, ENTRY_COVER, ENTRY_TOC_MIN, EPIGRAPH_MAX, HERO_COVER, SIDE_STICKY_SLACK, SPY_OFFSET, type Breakpoint } from '../tokens';
import Essay from './Essay';
import { useFontsFor } from '../lib/fontsReady';
import { wantPeople } from '../data/bangumiAgent';

/** Fields the hero strip already shows; the infobox does not repeat them (§7.4-5). */
const HERO_KEYS = ['看完', '听过', '玩过', '类型', '来源'] as const;

function heroCover(kind: Kind, bp: Breakpoint, vw: number): [number, number] {
  const t = HERO_COVER[bp][kind === 'music' ? 'music' : kind === 'game' ? 'game' : 'base'];
  const col = vw >= ENTRY_TOC_MIN ? ENTRY_COVER.find(([min]) => vw >= min)?.[1] : undefined;
  const w = col ?? Math.round(Math.min(vw * t.vw, t.max));
  return [w, Math.round(w / KIND_ASPECT[kind])];
}

const clip = (s: string) => {
  const cs = Array.from(s);
  return cs.length > EPIGRAPH_MAX ? `${cs.slice(0, EPIGRAPH_MAX).join('')}……` : s;
};

/** Scroll a `[data-section]` block under the bar (its scroll-margin matches the spy line). */
export function jumpTo(section: string) {
  const el = document.querySelector<HTMLElement>(`[data-section="${CSS.escape(section)}"]`);
  el?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
}

/** Track which h2 section is under the top bar, and whether the h1 / hero have scrolled away. */
export function useSectionSpy(deps: unknown[]) {
  const h1 = useRef<HTMLHeadingElement>(null);
  const hero = useRef<HTMLElement>(null);
  const [h1Gone, setGone] = useState(false);
  const [heroGone, setHeroGone] = useState(false);
  const [section, setSection] = useState('');
  useEffect(() => {
    let bar = 48;
    let line = bar + SPY_OFFSET.phone;
    const measure = () => {
      bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-top')) || bar;
      line = bar + (window.innerWidth >= BP.desktop ? SPY_OFFSET.desk : SPY_OFFSET.phone);
    };
    const f = () => {
      const el = h1.current;
      if (el) setGone(el.getBoundingClientRect().bottom < bar);
      if (hero.current) setHeroGone(hero.current.getBoundingClientRect().bottom < bar);
      const all = document.querySelectorAll<HTMLElement>('[data-section]');
      let cur = '';
      all.forEach((s) => { if (s.getBoundingClientRect().top < line) cur = s.dataset.section!; });
      // The last block can be too short to ever reach the line: at the very bottom it is current.
      const doc = document.documentElement;
      if (all.length && doc.scrollHeight > window.innerHeight && window.scrollY + window.innerHeight >= doc.scrollHeight - 2) {
        cur = all[all.length - 1].dataset.section!;
      }
      setSection(cur);
    };
    const r = () => { measure(); f(); };
    r();
    window.addEventListener('scroll', f, { passive: true });
    window.addEventListener('resize', r);
    return () => { window.removeEventListener('scroll', f); window.removeEventListener('resize', r); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { h1, hero, h1Gone, heroGone, section };
}

function EntryImage({ im, onOpen, square }: { im: UserImage; onOpen: (url: string, aspect: number) => void; square: boolean }) {
  const url = useImageSrc(im.src);
  return (
    <button className="entry-image" style={square ? undefined : { aspectRatio: String(im.aspect) }} aria-label="看大图" onClick={() => url && onOpen(url, im.aspect)}>
      {url && <img src={url} alt="" loading="lazy" />}
    </button>
  );
}

function PersonName({ c }: { c: Credit }) {
  const { d, promote } = useStore();
  const id = personId(c.name);
  const isEntry = d.persons.has(id);
  const [card, setCard] = useState<DOMRect | null>(null);
  const [fresh, setFresh] = useState(false);
  if (isEntry) return <Link to={`/person/${id}`} className={`infolink ${fresh ? 'appear' : ''}`}>{c.name}</Link>;
  const count = d.allPeople.get(id)?.works.length ?? 1;
  return (
    <>
      <button className="staff-name" onClick={(e) => setCard(e.currentTarget.getBoundingClientRect())}>{c.name}</button>
      {card && (
        <Preview anchor={card} onClose={() => setCard(null)}>
          <div className="staff-card">
            <span className="preview-title">{c.name}</span>
            <span className="t-small c-2">出现在 {count} 部作品里</span>
            <button className="btn btn-secondary" onClick={() => { setCard(null); setFresh(true); promote(id); }}>收进索引</button>
          </div>
        </Preview>
      )}
    </>
  );
}

export default function Entry() {
  const { id = '' } = useParams();
  const store = useStore();
  const { d } = store;
  const work = d.byId.get(id) ?? store.removedWorks.find((w) => w.id === id) ?? ALL_BY_ID.get(id);
  if (work?.kind === 'essay') return <Essay />;
  if (!work) return <div className="page under-bar page-x"><TopBar /><p className="t-ui c-2 empty-line">找不到这一条。</p><Link to="/" className="btn-text quiet empty-back">回到首页 ›</Link></div>;
  return <WorkEntry work={work} key={work.id} />;
}

/** Side column stays sticky only while it fits under the bar (§8.3.2). */
function useFitsSticky<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const f = () => setFits(el.offsetHeight <= window.innerHeight - SIDE_STICKY_SLACK);
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    window.addEventListener('resize', f);
    return () => { ro.disconnect(); window.removeEventListener('resize', f); };
  });
  return [ref, fits];
}

function WorkEntry({ work }: { work: Work }) {
  const store = useStore();
  const { d } = store;
  const nav = useNavigate();
  const enterCls = useEnterClass();
  // app: a Bangumi work's core creators are read when it is first opened (first in the queue)
  useEffect(() => { if (work.source === 'bangumi') wantPeople(work.id); }, [work.id, work.source]);
  // S2 (§7.3): arriving by the cover flight, the hero runs the flight schedule and the body waits
  const [flown] = useState(() => takeFlight(work.id));
  const enter = flown ? '' : enterCls;
  const settleMs = flown ? DUR.flight : enter ? DUR.page : 0;
  const bp = useBreakpoint();
  const vw = useViewportW();
  const desk = isDesk(bp);
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const pendingJump = useRef('');
  const { h1, hero, heroGone, section } = useSectionSpy([work.id, mentionsOpen, bp]);
  const [coverW, coverH] = heroCover(work.kind, bp, vw);
  const [viewer, setViewer] = useState(false);
  const [editing, setEditing] = useState(false);
  const [allQuotes, setAllQuotes] = useState(false);
  const [dating, setDating] = useState(false);
  const [dateKey, setDateKey] = useState(0);
  const [dateAt, setDateAt] = useState<DOMRect | null>(null);
  const openDate = (el?: HTMLElement) => { setDateAt(el?.closest('dd')?.getBoundingClientRect() ?? null); setDateKey((k) => k + 1); setDating(true); };
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [sideRef, sideFits] = useFitsSticky<HTMLElement>();
  const linked = useMemo(() => new Set(store.linked), [store.linked]);
  const mentions = useMentions(work.id);
  const mentionCount = mentions.length;
  const mentionHead = mentionTitle(mentions);

  const parts = entryWhenParts(work);
  const y = parts.kind === 'unknown' ? 0 : parts.y;
  const named = y ? d.years.get(y)?.named : undefined;
  const sample = !!work.isSample;
  const doing = work.status === 'doing';
  // the same line as 写几句: this year says the day, an earlier year stays at the month
  const when = entryWhen(work);
  // 「约」 and 时间未知 speak in grey, never with an icon
  const whenNode = parts.kind === 'unknown' ? <span className="strip-unknown">时间未知</span>
    : parts.kind === 'year' && parts.approx ? <><span className="strip-approx">约</span>{` ${parts.y}`}</> : when;
  const monthLink = (yy: number, mm: number, label: string) => (
    (d.years.get(yy)?.months.get(mm)?.length ?? 0) >= store.settings.monthEntry
      ? <Link className="infolink" to={`/year/${yy}/${mm}`}>{label}</Link>
      : label
  );
  const core = work.credits.filter((c) => c.core);
  // a date Steam gave is the last time played, and says so (as Bangumi's says 标记于)
  const verb = work.date?.source === 'steam_last_played' ? '最后玩于' : work.kind === 'music' ? '听过' : work.kind === 'game' ? '玩过' : '看完';
  const play = work.play;
  const genres = work.genres.filter(Boolean);

  const strip: StripItem[] = [
    doing
      ? { k: '状态', v: '在看' }
      : { k: verb, v: when, node: whenNode, ...(sample || store.show ? null : { onClick: (el: HTMLElement) => openDate(el), label: `${verb}：${when}，改时间` }) },
    // r19 time played is the game's own fact, up in the strip beside the date
    ...(play ? [{ k: '时长', v: fmtPlaytime(play.minutes) }] : []),
    { k: '类型', v: genres.join(' · ') || work.info.find((r) => r.key === '类型')?.value || '' },
    { k: '来源', v: sourceLabelOf(work) },
  ].filter((x) => x.v);

  const credits = work.kind === 'book' ? work.credits.filter((c) => !c.core) : work.credits;
  const byRole = new Map<string, Credit[]>();
  for (const c of credits) byRole.set(c.role, [...(byRole.get(c.role) ?? []), c]);
  const rows: InfoRow[] = [
    ...work.info.map((r) => ({ key: r.key, value: r.value, mono: r.mono })),
    ...(work.readHours ? [{ key: '阅读', value: `微信读书里读了 ${work.readHours} 小时` }] : []),
    ...[...byRole].map(([role, cs]) => ({
      key: role,
      value: <>{cs.map((c, i) => <span key={c.name}>{i > 0 && '、'}<PersonName c={c} /></span>)}</>,
    })),
  ];
  const staffCount = byRole.size;
  const plainRows = rows.length - staffCount - rows.filter((r) => (HERO_KEYS as readonly string[]).includes(r.key)).length;
  const fold = staffCount > 6 ? plainRows + 6 : Infinity;

  const persons = core.map((c) => d.persons.get(personId(c.name))).filter(Boolean);
  const quotes = useMemo(() => normalizeQuotes(work.quotes), [work.quotes]);
  const epi = epigraphOf(quotes);
  // relations (DECISIONS-r2 #13): the sure ones are linked outright, the unsure ones never shown;
  // a link you made by hand (linked) stays, one you took apart (unlinked) stays apart
  const unlinked = new Set(store.unlinked);
  const linkedIds = [...(work.related ?? []), ...[...linked].filter((k) => k.startsWith(`${work.id}>`)).map((k) => k.split('>')[1])];
  const linkedList = [...new Set(linkedIds)].map((x) => d.byId.get(x)).filter((x): x is Work => !!x && !unlinked.has(`${work.id}>${x.id}`) && !(store.show && store.me.onlyMe.includes(x.id)));
  const imgs = work.images ?? [];
  // the pictures belong to 短评 (v0.4 §3.19.4): pictures alone still make the section
  const hasReview = !!work.review?.length || imgs.length > 0;
  // what you wrote on Bangumi comes in with the work and sits apart from yours, named (方案 v0.7 §4.7)
  const bgmWords = work.srcComment?.trim() ?? '';
  const hasWords = hasReview || !!bgmWords;
  const [bigImg, setBigImg] = useState<{ url: string; aspect: number } | null>(null);
  // every work has a period, so 相关 always has somewhere to go (a work with no creator or genre was a dead end)
  const hasRelated = true;

  const openMentions = () => { pendingJump.current = mentionHead; setMentionsOpen(true); };
  // arriving from the year page's quote: open all quotes and land on 摘抄
  const loc = useLocation();
  useEffect(() => {
    const j = (loc.state as { jump?: string } | null)?.jump;
    if (!j) return;
    if (j === '摘抄') setAllQuotes(true);
    const t = window.setTimeout(() => jumpTo(j), settleMs);
    return () => window.clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mentionsOpen && pendingJump.current) { jumpTo(pendingJump.current); pendingJump.current = ''; }
  }, [mentionsOpen]);
  const jump = (id: string) => (id === mentionHead && !mentionsOpen && bp !== 'phone' ? openMentions() : jumpTo(id));

  const fontsOk = useFontsFor(work.title + (epi ? clip(epi.text) : '') + core.map((c) => c.name).join(''));
  const epigraph: Epigraph | undefined = epi && { text: clip(epi.text), where: epi.where, onClick: () => { setAllQuotes(true); jumpTo('摘抄'); } };
  const byline = (
    <>
      {core.map((c, i) => (
        <span key={c.name}>{i > 0 && '、'}{d.persons.has(personId(c.name)) ? <Link className="byline-link" to={`/person/${personId(c.name)}`}>{c.name}</Link> : c.name}</span>
      ))}
      {work.year && <span>{core.length ? '　' : ''}{work.year}</span>}
    </>
  );
  const empty = !hasReview && !sample && (
    <button className="t-ui c-3 hero-empty" onClick={() => nav(`/write?for=${work.id}`, { state: { from: 'entry' } })}>写几句</button>
  );

  const infobox = rows.length > 0 && (
    <InfoBox rows={rows} fold={fold} foldLabel={() => `全部职务 · ${staffCount}`} hide={HERO_KEYS} />
  );
  // the same box, sized to the cover when it stands in the wide hero's side column (polish r4)
  const heroFacts = rows.length > 0 && (
    <InfoBox rows={rows} fold={fold} foldLabel={() => `全部职务 · ${staffCount}`} hide={HERO_KEYS} fit={coverH} />
  );
  const review = hasWords && (
    <Section title="短评">
      {!!work.review?.length && <Prose paragraphs={work.review} selfId={work.id} />}
      {imgs.length > 0 && (
        <div className={`entry-images ${imgs.length === 1 ? 'one' : 'grid'}`}>
          {imgs.map((im) => <EntryImage key={im.id} im={im} square={imgs.length > 1} onOpen={(url, aspect) => setBigImg({ url, aspect })} />)}
        </div>
      )}
      {bgmWords && (
        <div className="entry-src">
          <div className="t-body prose">{bgmWords.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}</div>
          <p className="t-caption c-3 entry-src-from">在 Bangumi 写的</p>
        </div>
      )}
    </Section>
  );
  const quoteBlock = quotes.length > 0 && (
    <Section title="摘抄" count={quotes.length}>
      <div className="quotes">
        {(allQuotes ? quotes : quotes.slice(0, 5)).map((q, i) => (
          <figure className="quote" key={i}>
            <blockquote className="t-quote">{q.text}</blockquote>
            <figcaption className="t-caption c-3">{[q.where, q.date].filter(Boolean).join(' · ')}</figcaption>
            {q.note && <p className="t-small c-reading quote-note">我的想法：{q.note}</p>}
          </figure>
        ))}
        {quotes.length > 5 && !allQuotes && <button className="info-more" onClick={() => setAllQuotes(true)}>全部摘抄 · {quotes.length}　›</button>}
      </div>
    </Section>
  );
  // r20 游玩: time, achievements, the rarest one — the dense part behind a disclosure (SteamPlay)
  const playBlock = play ? <SteamPlay work={work} /> : null;
  const related = hasRelated && (
    <Section title="相关">
      <dl className="related">
        {persons.length > 0 && (
          <div className="info-row"><dt>人物</dt><dd>{persons.map((p, i) => <span key={p!.id}>{i > 0 && '、'}<Link className="infolink" to={`/person/${p!.id}`}>{p!.name}</Link></span>)}</dd></div>
        )}
        <div className="info-row">
          <dt>时期</dt>
          <dd>
            {doing ? '还在看' : parts.kind === 'unknown' ? <Link className="infolink" to="/unknown">时间未知</Link> : (
              <>
                {parts.kind === 'year' && <>{parts.approx && <><span className="strip-approx">约</span>{' '}</>}<Link className="infolink" to={`/year/${parts.y}`}>{parts.y}</Link></>}
                {parts.kind === 'past' && <><Link className="infolink" to={`/year/${parts.y}`}>{parts.y}</Link>{' · '}{monthLink(parts.y, parts.m, cnMonth(parts.m))}</>}
                {parts.kind === 'month' && monthLink(parts.y, parts.m, cnMonth(parts.m))}
                {parts.kind === 'day' && <>{monthLink(parts.y, parts.m, `${parts.m} 月`)}{` ${parts.d} 日`}</>}
                {named && <> · <Link className="infolink" to="/index/periods">{named}</Link></>}
              </>
            )}
          </dd>
        </div>
        {genres.length > 0 && (
          <div className="info-row"><dt>标签</dt><dd>{genres.map((g, i) => <span key={g}>{i > 0 && '、'}<Link className="infolink" to={`/index/interests?g=${encodeURIComponent(g)}`}>{g}</Link></span>)}</dd></div>
        )}
        {linkedList.length > 0 && (
          <div className="info-row"><dt>作品</dt><dd>{linkedList.map((x, i) => <span key={x.id}>{i > 0 && '、'}<Link className="infolink" to={`/entry/${x.id}`}>{x.title}</Link></span>)}</dd></div>
        )}
      </dl>
    </Section>
  );
  // 在看 isn't in the encyclopedia yet and the sample never is: no seal for either (v0.4 §3.19.1 / §3.19.3)
  const colophon = sample ? <Colophon date={work.collected} reason="示例内容，不是你收的" />
    : doing ? <Colophon date={work.collected} reason="来自 Bangumi · 在看" />
      : <Colophon seal date={work.collected} source={sourceLabelOf(work) === SOURCE_LABEL.manual ? undefined : sourceLabelOf(work)} pinned={store.me.profile.frontispiece === work.id} />;
  const maybe = !sample && !doing && !store.show ? <MaybeSame work={work} /> : null;
  const side = <SideMentions targetId={work.id} allOpen={mentionsOpen} onAll={openMentions} />;
  const fullMentions = (bp === 'phone' || mentionsOpen) && <Mentions targetId={work.id} open={bp !== 'phone'} />;

  // ··· menu (polish r3): this cover as 首页's picture (CONCEPT v1: the frontispiece), or hand the choice back
  const pinned = store.me.profile.frontispiece === work.id;
  const fav = store.me.favorites.some((f) => f.id === work.id);
  const onlyMe = store.me.onlyMe.includes(work.id);
  const synced = work.source !== 'manual';
  // yours (typed, pasted, from 豆瓣) or synced (Bangumi, 微信读书): a synced one keeps your values as overrides
  const editable = work.kind !== 'essay';
  // sample works are only to look at: nothing to write on, nothing to take out (decided)
  const menuItems: MenuItem[] = sample ? [{ label: '这是示例', note: '放进你自己的作品后，示例会收起来' }] : [
    !work.cover || work.coverBroken
      ? { label: '设为首页封面', note: '这一条没有封面图' }
      : pinned
        ? { label: '改回第一部最爱', run: () => store.setProfile({ frontispiece: '' }) }
        : { label: '设为首页封面', run: () => store.setProfile({ frontispiece: work.id }) },
    ...(doing ? [] : [fav
      ? { label: '从最爱拿掉', run: () => store.removeFavorite(work.id) }
      : store.me.favorites.length >= FAV_MAX
        ? { label: '放进最爱', note: `最爱最多 ${FAV_MAX} 部，先拿掉一部` }
        : { label: '放进最爱', run: () => { if (store.addFavorite(work.id)) store.toast(`放进最爱了：《${work.title}》`); } }]),
    ...(doing ? [] : [onlyMe
      ? { label: '不再只给自己', run: () => store.setOnlyMe(work.id, false) }
      : { label: '只给自己', note: '给人看时不出现', run: () => store.setOnlyMe(work.id, true) }]),
    // a work of yours can get its picture and maker later, as 收录 promised; a synced one can have them changed
    ...(editable ? [{ label: work.cover && !work.coverBroken ? '改封面、主创' : '补封面、主创', run: () => setEditing(true) }] : []),
    { label: hasReview ? '改短评、加摘抄' : '写几句', run: () => nav(`/write?for=${work.id}`, { state: { from: 'entry' } }) },
    ...(doing ? [] : [{ label: `改${verb}时间`, run: () => openDate() }]),
    // synced works can go too (DECISIONS-r2 #10): the next sync leaves them out
    { label: '移出', ...(synced ? { note: '以后同步也不会再加回来' } : null), run: () => store.removeWork(work.id) },
  ];
  // 移出 happens in place (r5 #5): the page stays, faded, with 「放回」 under the bar for as long as you are here
  const removed = !!store.removed[work.id];

  const toc: TocItem[] = [
    hasWords && { id: '短评', label: '短评' },
    quotes.length > 0 && { id: '摘抄', label: '摘抄', count: quotes.length },
    !!play && { id: '游玩', label: '游玩' },
    hasRelated && { id: '相关', label: '相关' },
    mentionCount > 0 && { id: mentionHead, label: mentionHead, count: mentionCount },
  ].filter((x): x is TocItem => !!x);
  const withToc = desk && vw >= ENTRY_TOC_MIN;
  const tocShown = withToc && toc.length >= 2;
  const factsUp = withToc && !epigraph && !!infobox;

  return (
    <div className={`page entry-page ${removed ? 'is-removed' : ''}`}>
      <TopBar
        title={work.title} titleOn={heroGone} sub={heroGone ? section : ''} clear={!heroGone && !removed}
        right={!removed && <button className="icon-btn" aria-label="更多" aria-haspopup="menu" aria-expanded={!!menu} onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}><MoreHorizontal strokeWidth={1.5} /></button>}
      />
      {removed && <RemovedNote onBack={() => store.restoreWork(work.id)} />}
      <div className={`entry-body ${enter} ${fontsOk ? '' : 'fonts-wait'}`} {...(removed ? { inert: '' } : null) as object}>
        <HeroZone
          work={work} coverW={coverW} coverH={coverH} zoneRef={hero}
          tag={kindTag(work.kind)} title={work.title} titleRef={h1} byline={byline}
          strip={strip} epigraph={epigraph} after={empty} flown={flown} settleMs={settleMs} withToc={withToc}
          facts={factsUp ? heroFacts : undefined}
          onCover={work.cover && !work.coverBroken ? () => setViewer(true) : undefined}
        />

        {bp === 'phone' && (
          <article className={`page-x entry-flow ${flown ? 'late-in' : ''}`}>
            {infobox && <div className="entry-infobox">{infobox}</div>}
            {review}{quoteBlock}{playBlock}{related}{fullMentions}{maybe}
            {colophon}
          </article>
        )}

        {bp === 'tablet' && (
          <>
            <div className={`page-x read-x entry-pair ${flown ? 'late-in' : ''}`}>
              {infobox && <div>{infobox}</div>}
              {mentionCount > 0 && side}
            </div>
            <article className={`page-x read-x entry-flow ${flown ? 'late-in' : ''}`}>
              {review}{quoteBlock}{playBlock}{related}{fullMentions}{maybe}
              {colophon}
            </article>
          </>
        )}

        {desk && (
          <div className={`entry-grid ${withToc ? 'with-toc' : ''} ${flown ? 'late-in' : ''}`}>
            {withToc && (
              <div className="entry-toc-col">
                <TocRail items={toc} current={section} onJump={jump} footer={tocShown ? colophon : undefined} />
              </div>
            )}
            <article className="entry-read">
              {review}{quoteBlock}{playBlock}{related}{fullMentions}{maybe}
              {!tocShown && colophon}
            </article>
            <aside className={`entry-side ${sideFits ? 'stick' : ''}`} ref={sideRef} aria-label="侧栏">
              {!factsUp && infobox}
              {side}
            </aside>
          </div>
        )}
      </div>

      {viewer && <CoverViewer work={work} onClose={() => setViewer(false)} />}
      {editable && <EditWorkSheet work={work} open={editing} onClose={() => setEditing(false)} />}
      {bigImg && <CoverViewer work={{ ...work, coverBroken: false, cover: { thumb: bigImg.url, medium: bigImg.url, aspect: bigImg.aspect } }} onClose={() => setBigImg(null)} />}
      {menu && <Menu anchor={menu} onClose={() => setMenu(null)} items={menuItems} label="更多" />}
      {dateKey > 0 && <DateSheet key={dateKey} works={[work]} open={dating} anchor={dateAt} onClose={() => setDating(false)} />}
    </div>
  );
}

/**
 * 「可能是同一部」 (STYLE v0.4 §3.16): an unsure duplicate from a 豆瓣 import, at the very bottom, at most two
 * rows, two text buttons. It is dedup, not relation — the old 「可能相关」 is gone (§3.19.6).
 */
function MaybeSame({ work }: { work: Work }) {
  const store = useStore();
  const [going, setGoing] = useState<string | null>(null);
  const nav = useNavigate();
  const box = useRef<HTMLElement>(null);
  useFlip(box);
  const others = store.maybeFor(work.id);
  if (!others.length) return null;
  const decide = (o: Work, v: 'merged' | 'not') => {
    setGoing(o.id);
    setTimeout(() => {
      store.resolveMaybe(work.id, o.id, v);
      setGoing(null);
      if (v !== 'merged') return;
      // the imported one (db-…) folds into the one you had: standing on it, follow it to where it went
      if (work.id.startsWith('db-')) nav(`/entry/${o.id}`, { replace: true });
      store.toast('合在一起了');
    }, DUR.fade);
  };
  return (
    <section className="maybe-same" aria-label="可能是同一部" ref={box}>
      <div className="t-label c-3">可能是同一部</div>
      {others.map((o) => {
        const [tw, th] = [28, 42];
        const from = o.sources?.some((r) => r.provider === 'douban_xlsx') ? '来自豆瓣备份' : sourceLabelOf(o);
        return (
          <div key={o.id} data-flip={o.id} className={`maybe-row${going === o.id ? ' going' : ''}`}>
            <Link to={`/entry/${o.id}`} className="maybe-main">
              <Cover work={o} w={tw} h={th} paperPlaceholder />
              <span className="maybe-text">
                <span className="t-small ellipsis">{o.title}</span>
                <span className="t-caption c-3 ellipsis">{[KIND_LABEL[o.kind], o.year, from].filter(Boolean).join(' · ')}</span>
              </span>
            </Link>
            <button className="btn-text maybe-btn" onClick={() => decide(o, 'merged')}>合并</button>
            <button className="btn-text maybe-btn" onClick={() => decide(o, 'not')}>不是</button>
          </div>
        );
      })}
    </section>
  );
}

/** 「移出了」, in place (r5 #5): a quiet line under the bar; 「放回」 stays as long as the page does */
export function RemovedNote({ onBack }: { onBack: () => void }) {
  return (
    <div className="removed-note" role="status">
      <span>移出了。墙上不再有它。</span>
      <button className="btn-text" onClick={onBack}>放回</button>
    </div>
  );
}
