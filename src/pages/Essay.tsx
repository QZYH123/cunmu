import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useStore } from '../data/store';
import { ALL_BY_ID } from '@demo';
import { KIND_LABEL, KIND_ORDER } from '../data/types';
import { fmtYMD, linkify } from '../data/derive';
import { TopBar } from '../components/Shell';
import { Menu, Section } from '../components/Bits';
import { Colophon, Mentions, Prose } from '../components/Prose';
import { noteEssay, TITLE_VT, useEnterClass } from '../lib/motion';
import { useFontsFor } from '../lib/fontsReady';
import { RemovedNote, useSectionSpy } from './Entry';
import { Marginalia } from '../components/Marginalia';
import { isDesk, useBreakpoint } from '../lib/useWidth';
import { EDITORIAL } from '../tokens';

/** Selection → 「设为引文」 (§7.6-2): a sentence inside one paragraph of the body. */
function usePullPicker(body: React.RefObject<HTMLElement>, on: boolean) {
  const [pick, setPick] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!on) return;
    const f = () => {
      const sel = document.getSelection();
      const root = body.current;
      if (!sel || sel.isCollapsed || !root || !sel.rangeCount) { setPick(null); return; }
      const r = sel.getRangeAt(0);
      const pa = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest('.prose > p');
      const p = pa(r.startContainer);
      const text = sel.toString().trim();
      if (!p || p !== pa(r.endContainer) || !root.contains(p) || text.length < EDITORIAL.pullMin || text.length > EDITORIAL.pullMax) { setPick(null); return; }
      const rect = r.getBoundingClientRect();
      setPick({ text, x: rect.left + rect.width / 2, y: rect.top });
    };
    document.addEventListener('selectionchange', f);
    return () => document.removeEventListener('selectionchange', f);
  }, [on, body]);
  return [pick, () => setPick(null)] as const;
}

export default function Essay() {
  const { id = '' } = useParams();
  const store = useStore();
  const { d, unlinked, pulls, setPull } = store;
  const nav = useNavigate();
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const enter = useEnterClass();
  const bp = useBreakpoint();
  const desk = isDesk(bp);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState<string>();
  const essay = d.byId.get(id) ?? store.removedWorks.find((w) => w.id === id) ?? ALL_BY_ID.get(id);
  const { h1, h1Gone, section } = useSectionSpy([id]);
  useEffect(() => noteEssay(id), [id]);
  const unl = useMemo(() => new Set(unlinked), [unlinked]);
  const mentioned = useMemo(() => {
    if (!essay?.body) return [];
    const ids = new Set(linkify(essay.body, d, essay.id, unl).flat().filter((s) => s.target).map((s) => s.target!));
    return [...ids];
  }, [essay, d, unl]);
  const chars = (essay?.body ?? []).join('').length;
  const pullOk = chars >= EDITORIAL.pull;
  const [pick, clearPick] = usePullPicker(bodyRef, pullOk);
  // cold load: the serif title and the drop cap (bold serif, sized from the font's own metrics)
  // re-measure when their slices land; hold the column back until they are in (≤ FONT_WAIT_MS)
  const capChar = chars >= EDITORIAL.dropcap ? Array.from(essay?.body?.[0] ?? '')[0] ?? '' : '';
  const fontsOk = useFontsFor(essay?.title || (essay?.body?.[0] ?? '').slice(0, 16), [['700 64px', capChar]]);
  // an old link to an essay that is gone: the same way out as a work that is gone
  if (!essay) return <div className="page under-bar page-x"><TopBar /><p className="t-ui c-2 empty-line">找不到这一条。</p><Link to="/" className="btn-text quiet empty-back">回到首页 ›</Link></div>;
  const removed = !!store.removed[essay.id];
  const pull = pullOk ? (pulls[essay.id] ?? essay.pull) || undefined : undefined;
  const titled = !!essay.title;
  // 给人看: a work that is 只给自己 is not named among what this essay mentions
  const works = mentioned.map((x) => d.byId.get(x)).filter((w) => !!w && !(store.show && store.me.onlyMe.includes(w.id)));
  const people = mentioned.map((x) => d.persons.get(x)).filter(Boolean);
  const said = works.length + people.length;
  return (
    <div className={`page under-bar essay-page ${removed ? 'is-removed' : ''}`}>
      <TopBar
        title={essay.title} titleOn={h1Gone} sub={h1Gone ? section : ''}
        right={!removed && <button className="icon-btn" aria-label="更多" aria-haspopup="menu" aria-expanded={!!menu} onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}><MoreHorizontal strokeWidth={1.5} /></button>}
      />
      {removed && <RemovedNote onBack={() => store.restoreWork(essay.id)} />}
      {menu && (
        <Menu
          anchor={menu} onClose={() => setMenu(null)} label="更多"
          items={[
            { label: '改一改', run: () => nav(`/write?id=${essay.id}`) },
            store.me.onlyMe.includes(essay.id)
              ? { label: '不再只给自己', run: () => store.setOnlyMe(essay.id, false) }
              : { label: '只给自己', note: '给人看时不出现', run: () => store.setOnlyMe(essay.id, true) },
            {
              label: '移出',
              run: () => store.removeWork(essay.id),
            },
          ]}
        />
      )}
      <article className={`page-x entry essay-wrap entry-body ${enter} ${fontsOk ? '' : 'fonts-wait'}`} {...(removed ? { inert: '' } : null) as object}>
        <div className="essay-col">
        <div className="t-label c-3 entry-tag">随笔</div>
        <h1 className={`hero-title essay-title ${titled ? '' : 'c-2'}`} ref={h1} style={{ viewTransitionName: TITLE_VT }}>{essay.title || (essay.body?.[0] ?? '').slice(0, 16)}</h1>
        <p className="t-caption c-3 entry-by">{fmtYMD(essay.finished)}{said ? ` · 提到 ${said} 个条目` : ''}</p>
        {essay.cover && (
          <figure className="essay-figure">
            <img src={essay.cover.medium} alt="" />
          </figure>
        )}
        <div
          className="essay-body" ref={bodyRef}
          onPointerOver={desk ? (e) => setLit((e.target as HTMLElement).closest<HTMLElement>('.autolink')?.dataset.target) : undefined}
          onPointerLeave={desk ? () => setLit(undefined) : undefined}
        >
          <Prose paragraphs={essay.body ?? []} selfId={essay.id} dropcap={chars >= EDITORIAL.dropcap} pull={pull} lit={lit} />
        </div>
        {said > 0 && (
          <Section title="这篇提到了">
            <dl className="related">
              {KIND_ORDER.map((k) => {
                const ws = works.filter((w) => w!.kind === k);
                if (!ws.length) return null;
                return (
                  <div className="info-row" key={k}>
                    <dt>{KIND_LABEL[k]}</dt>
                    <dd>{ws.map((w, i) => <span key={w!.id}>{i > 0 && '、'}<Link className="infolink" to={`/entry/${w!.id}`}>{w!.title}</Link></span>)}</dd>
                  </div>
                );
              })}
              {people.length > 0 && (
                <div className="info-row"><dt>人物</dt><dd>{people.map((p, i) => <span key={p!.id}>{i > 0 && '、'}<Link className="infolink" to={`/person/${p!.id}`}>{p!.name}</Link></span>)}</dd></div>
              )}
            </dl>
          </Section>
        )}
        <Mentions targetId={essay.id} />
        <Colophon date={essay.finished} reason={`${fmtYMD(essay.finished)}写下`} />
        </div>
        {desk && <Marginalia body={bodyRef} lit={lit} onLit={setLit} />}
      </article>
      {pick && !store.show && (
        <button
          className="pull-pick" style={{ left: pick.x, top: pick.y }}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => { setPull(essay.id, pick.text); clearPick(); document.getSelection()?.removeAllRanges(); }}
        >设为引文</button>
      )}
    </div>
  );
}
