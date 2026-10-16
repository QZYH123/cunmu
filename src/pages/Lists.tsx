import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { KIND_LABEL, SOURCE_LABEL } from '../data/types';
import { creatorLine } from '../data/derive';
import { TopBar } from '../components/Shell';
import { ListRow } from '../components/Bits';
import { Cover, thumbSize } from '../components/Cover';
import { PickBar, PickToggle, usePicker } from '../components/Pick';
import { useEnterClass } from '../lib/motion';
import { useSectionSpy } from './Entry';
import { Grid } from './Category';

/** 「在看」 (STYLE v0.4 §3.19.1): Bangumi's 在看, a list by last update; never on the wall, no progress */
export function Doing() {
  const { doing } = useStore();
  const enter = useEnterClass();
  const { h1, h1Gone } = useSectionSpy([]);
  const list = [...doing].sort((a, b) => ((a.bgmUpdatedAt ?? '') < (b.bgmUpdatedAt ?? '') ? 1 : -1));
  const md = (iso?: string) => (iso ? `${Number(iso.slice(5, 7))}-${Number(iso.slice(8, 10))}` : '');
  return (
    <div className="page under-bar">
      <TopBar title="在看" titleOn={h1Gone} />
      <div className={`page-x read-x list-page ${enter}`}>
        <h1 className="t-title page-title" ref={h1}>在看</h1>
        <p className="t-small c-2 list-lede">在 Bangumi 标成「在看」的，放在这里，不上墙。</p>
        {list.length ? (
          <div className="list-rule">
            {list.map((w, i) => <ListRow key={w.id} work={w} index={i} date={md(w.bgmUpdatedAt)} meta={[KIND_LABEL[w.kind], creatorLine(w)].filter(Boolean).join(' · ')} />)}
          </div>
        ) : (
          <>
            <p className="t-ui c-2 empty-line">在看的会放在这里。</p>
            <Link to="/" className="btn-text quiet empty-back">回到首页 ›</Link>
          </>
        )}
      </div>
    </div>
  );
}

/** 「时间未知」 (STYLE v0.4 §3.15): a period like the others — a grid of covers, titles only, no number anywhere */
export function Unknown() {
  const { d, sample } = useStore();
  const enter = useEnterClass();
  const { h1, h1Gone } = useSectionSpy([]);
  const pick = usePicker();
  const works = [...d.unknown].sort((a, b) => (a.collected < b.collected ? 1 : -1));
  return (
    <div className="page under-bar">
      <TopBar title="时间未知" titleOn={h1Gone} back={!pick.on} right={works.length > 0 && !sample.on && <PickToggle p={pick} />} />
      <div className={`page-x ${enter}`}>
        <div className="t-label c-3 entry-tag">时期</div>
        <h1 className="t-display entry-title" ref={h1}>时间未知</h1>
        <p className="t-small c-2 unknown-lede">这些作品没有记下是哪一年。</p>
        {works.length
          ? <Grid works={works} offset={0} pick={pick} noYear />
          : (
            <>
              <p className="t-ui c-2 empty-line">没有记下年份的作品，会放在这里。</p>
              <Link to="/index/periods" className="btn-text quiet empty-back">所有年份 ›</Link>
            </>
          )}
      </div>
      <PickBar p={pick} works={works} />
    </div>
  );
}

const md = (iso: string) => `${Number(iso.slice(5, 7))} 月 ${Number(iso.slice(8, 10))} 日`;

/** 「移出的作品」 (STYLE v0.4 §3.19.2): newest removal first; rows don't open (they're not on the wall).
 *  放回 answers in place (r5 #5): the row stays for this visit as 「放回了 · 撤回」, no toast. */
export function Removed() {
  const store = useStore();
  const enter = useEnterClass();
  const { h1, h1Gone } = useSectionSpy([]);
  // the list as it was when you came in: rows you put back stay where they were until you leave
  const [snap, setSnap] = useState(() => store.removedWorks);
  const live = new Set(store.removedWorks.map((w) => w.id));
  useEffect(() => { setSnap((s) => [...store.removedWorks.filter((w) => !s.some((x) => x.id === w.id)), ...s]); }, [store.removedWorks]);
  const list = snap;
  return (
    <div className="page under-bar">
      <TopBar title="移出的作品" titleOn={h1Gone} />
      <div className={`page-x read-x list-page ${enter}`}>
        <h1 className="t-title page-title" ref={h1}>移出的作品</h1>
        <p className="t-small c-2 list-lede">这些不在墙上，也不会被同步回来。放回以后，你写过的都还在。</p>
        {list.length ? (
          <div className="list-rule">
            {list.map((w) => {
              const [tw, th] = thumbSize(w);
              const from = w.source === 'manual' ? '' : `来自 ${SOURCE_LABEL[w.source].replace('同步', '')}`;
              return (
                <div key={w.id} className={`list-row removed-row ${live.has(w.id) ? '' : 'is-back'}`}>
                  <Cover work={w} w={tw} h={Math.min(th, 60)} paperPlaceholder />
                  <div className="list-main">
                    <span className="list-title ellipsis">{w.title}</span>
                    <span className="list-meta ellipsis" aria-live="polite">{live.has(w.id) ? [KIND_LABEL[w.kind], from, `${md(store.removed[w.id] ?? '')}移出`].filter(Boolean).join(' · ') : '放回了，在墙上'}</span>
                  </div>
                  {live.has(w.id)
                    ? <button className="btn-text removed-back" onClick={() => store.restoreWork(w.id)}>放回</button>
                    : <button className="btn-text quiet removed-back" onClick={() => store.removeWork(w.id)}>撤回</button>}
                </div>
              );
            })}
          </div>
        ) : <p className="t-ui c-2 empty-line">移出的作品会放在这里，随时可以放回。</p>}
      </div>
    </div>
  );
}
