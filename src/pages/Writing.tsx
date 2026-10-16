import { useEffect, useState } from 'react';
import { Link, useNavigate, useNavigationType } from 'react-router-dom';
import { useStore } from '../data/store';
import { fmtYMD } from '../data/derive';
import type { Work } from '../data/types';
import { TopBar } from '../components/Shell';
import { Pill } from '../components/MeParts';
import { RollingNumber } from '../components/Bits';
import { lastEssayOpen, noteOpenFrom, reduced, takeLanding, staggerStyle, TITLE_VT, transitionIdle, useEnterClass, withViewTransition } from '../lib/motion';
import { useSectionSpy } from './Entry';

const dayOf = (w: Work) => w.finished || w.collected.slice(0, 10);

/**
 * 随笔: everything you wrote, newest first — title, day, the opening lines, the first picture beside them.
 * 「写一篇」 opens the editor (/write); a row opens the essay, 「改」 opens it in the editor again.
 * The essays themselves are the same works as before (kind 'essay'): nothing is stored differently.
 */
export default function Writing() {
  const { library, me } = useStore();
  const nav = useNavigate();
  const enter = useEnterClass();
  const { h1, h1Gone } = useSectionSpy([]);
  const essays = library.filter((w) => w.kind === 'essay').sort((a, b) => (dayOf(a) < dayOf(b) ? 1 : dayOf(a) > dayOf(b) ? -1 : 0));
  const write = (ev?: React.MouseEvent) => { noteOpenFrom(ev?.currentTarget ?? null); nav('/write', { state: { from: 'writing' } }); };
  // a new essay just saved settles into the top of the list (P1-5)
  const [landed] = useState(takeLanding);
  // coming back from an essay its title lands in its row, then lets the name go (P1-4)
  const navType = useNavigationType();
  const [back, setBack] = useState(() => (navType === 'POP' ? lastEssayOpen() : ''));
  useEffect(() => { if (back) void transitionIdle().then(() => setBack('')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (ev: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0 || reduced()) return;
    ev.preventDefault();
    const t = ev.currentTarget.querySelector<HTMLElement>('.writing-t');
    if (t) t.style.viewTransitionName = TITLE_VT;
    void withViewTransition(() => nav(`/essay/${id}`), 'page').then(() => { if (t) t.style.viewTransitionName = ''; });
  };
  return (
    <div className="page under-bar">
      <TopBar back={false} title="随笔" titleOn={h1Gone} right={essays.length > 0 && <button className="btn-text" onClick={(ev) => write(ev)}>写一篇</button>} />
      <div className={`page-x read-x list-page writing-page ${enter}`}>
        <h1 className="t-title page-title" ref={h1}>随笔</h1>
        <p className="t-small c-2 list-lede">{essays.length ? <>写过 <RollingNumber value={String(essays.length)} /> 篇。</> : '自己写的东西，放在这里。'}</p>
        {essays.length ? (
          <div className={`writing-list ${enter ? 'stagger' : ''}`}>
            {essays.map((e, i) => {
              const img = e.images?.[0];
              return (
                <article key={e.id} className={`writing-item ${img ? 'has-img' : ''} ${landed === e.id ? 'landed' : ''}`} style={enter ? staggerStyle(i) : undefined}>
                  <Link to={`/essay/${e.id}`} className="writing-link" onClick={(ev) => open(ev, e.id)}>
                    <span className="writing-t" style={back === e.id ? { viewTransitionName: TITLE_VT } : undefined}>{e.title || '随笔'}{me.onlyMe.includes(e.id) && <Pill>只给自己</Pill>}</span>
                    <span className="writing-d">{fmtYMD(dayOf(e))}</span>
                    {e.body?.[0] && <span className="writing-x">{e.body.slice(0, 2).join(' ')}</span>}
                  </Link>
                  {img && <Link to={`/essay/${e.id}`} className="writing-img" tabIndex={-1} aria-hidden><img src={img.src} alt="" loading="lazy" decoding="async" /></Link>}
                  <Link to={`/write?id=${e.id}`} state={{ from: 'writing' }} className="btn-text quiet writing-edit" aria-label={`改「${e.title || '随笔'}」`}>改</Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="writing-empty">
            <p className="t-ui c-2 empty-line">还没有写过。读完、看完想说几句，或者别的什么，都可以写在这里。</p>
            <button className="btn btn-primary" onClick={(ev) => write(ev)}>写一篇</button>
          </div>
        )}
      </div>
    </div>
  );
}
