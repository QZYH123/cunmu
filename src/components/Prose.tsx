import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { creatorLine, fmtYMD, linkify, mentionTitle, whenOf, mentionsOf, type Segment } from '../data/derive';
import { KIND_LABEL } from '../data/types';
import { Preview, Seal, Section, WorkPreviewBody } from './Bits';
import { Avatar } from './Cover';
import { useLongPress } from '../lib/motion';
import { LINK_PREVIEW, SIDE_MENTIONS } from '../tokens';
import { openInShow } from './ShowMode';

interface LinkHover { enter: (seg: Segment, el: HTMLElement) => void; leave: () => void }

function AutoLink({ seg, onLong, hover, lit }: { seg: Segment; onLong: (seg: Segment, el: HTMLElement) => void; hover: LinkHover; lit?: boolean }) {
  const nav = useNavigate();
  const { show, me } = useStore();
  const to = seg.kind === 'person' ? `/person/${seg.target}` : `/entry/${seg.target}`;
  // a span, so the 给人看 click guard (anchors only) does not see it; a person page lists 只给自己 works
  const go = () => { if (show && !openInShow(to, me.onlyMe)) return; nav(to); };
  const lp = useLongPress((el) => onLong(seg, el), go);
  return (
    <span
      className={`autolink ${lit ? 'lit' : ''}`} role="link" tabIndex={0} {...lp} data-target={seg.target}
      onKeyDown={(e) => e.key === 'Enter' && go()}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') hover.enter(seg, e.currentTarget); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') hover.leave(); }}
      onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) hover.enter(seg, e.currentTarget); }}
      onBlur={hover.leave}
    >
      {seg.text}
    </span>
  );
}

/** Body text with automatic links: first occurrence only. Long-press (touch) or a 500ms pointer dwell
 *  (desktop, §8.5) opens the preview card; the card survives a 150ms gap so the pointer can reach it. */
/**
 * S5 (§7.6): `dropcap` sinks the first Han character three lines (callers decide: essays ≥ 300 字);
 * `pull` is set after the paragraph it comes from (essays ≥ 1,200 字); `lit` lights the links to one
 * target (the desktop marginalia hover pair).
 */
export function Prose({ paragraphs, selfId, className = 't-body prose', dropcap, pull, lit }: {
  paragraphs: string[]; selfId: string; className?: string; dropcap?: boolean; pull?: string; lit?: string;
}) {
  const { d, unlinked, unlink, show, me } = useStore();
  // 给人看: a work that is 只给自己 is plain text in the essay, with no preview
  const hid = useMemo(() => new Set(show ? me.onlyMe : []), [show, me.onlyMe]);
  const nav = useNavigate();
  const unl = useMemo(() => new Set(unlinked), [unlinked]);
  const segs = useMemo(() => linkify(paragraphs, d, selfId, unl), [paragraphs, d, selfId, unl]);
  const pullAt = pull ? paragraphs.findIndex((p) => p.includes(pull)) : -1;
  const [pv, setPv] = useState<{ seg: Segment; rect: DOMRect; hover?: boolean } | null>(null);
  const timer = useRef<number>();
  const stop = () => { window.clearTimeout(timer.current); timer.current = undefined; };
  const hover: LinkHover = {
    enter: (seg, el) => {
      stop();
      timer.current = window.setTimeout(() => setPv((p) => (p && !p.hover ? p : { seg, rect: el.getBoundingClientRect(), hover: true })), LINK_PREVIEW.show);
    },
    leave: () => {
      stop();
      timer.current = window.setTimeout(() => setPv((p) => (p?.hover ? null : p)), LINK_PREVIEW.grace);
    },
  };
  const hovering = !!pv?.hover;
  useEffect(() => {
    if (!hovering) return;
    const off = () => setPv((p) => (p?.hover ? null : p));
    window.addEventListener('scroll', off, { passive: true });
    return () => window.removeEventListener('scroll', off);
  }, [hovering]);
  useEffect(() => stop, []);
  const target = pv?.seg.kind === 'work' ? d.byId.get(pv.seg.target!) : undefined;
  const person = pv?.seg.kind === 'person' ? d.persons.get(pv.seg.target!) : undefined;
  return (
    <div className={`${className} ${dropcap && /^\p{Script=Han}/u.test(paragraphs[0] ?? '') ? 'has-dropcap' : ''}`}>
      {segs.map((p, i) => (
        <Fragment key={i}>
          <p>
            {p.map((s, j) => (s.target && !(s.kind === 'work' && hid.has(s.target)) ? <AutoLink key={j} seg={s} hover={hover} lit={lit === s.target} onLong={(seg, el) => { stop(); setPv({ seg, rect: el.getBoundingClientRect() }); }} /> : <span key={j}>{s.text}</span>))}
          </p>
          {pull && i === pullAt && <blockquote className="pull-quote">{pull}</blockquote>}
        </Fragment>
      ))}
      {pv && (
        <Preview
          anchor={pv.rect}
          hover={pv.hover}
          onPointerEnter={pv.hover ? stop : undefined}
          onPointerLeave={pv.hover ? hover.leave : undefined}
          onClose={() => setPv(null)}
          actions={[
            ...(show && !openInShow(pv.seg.kind === 'person' ? `/person/${pv.seg.target}` : `/entry/${pv.seg.target}`, me.onlyMe) ? [] : [{ label: '打开', run: () => { setPv(null); nav(pv.seg.kind === 'person' ? `/person/${pv.seg.target}` : `/entry/${pv.seg.target}`); } }]),
            ...(show ? [] : [{ label: '不是这个，取消链接', run: () => { unlink(selfId, pv.seg.target!); setPv(null); } }]),
          ]}
        >
          {target && <WorkPreviewBody work={target} meta={[creatorLine(target), target.year, target.finished ? `${whenOf(target, 'ym')} · ${target.kind === 'music' ? '听过' : target.kind === 'game' ? '玩过' : '看完'}` : ''].filter(Boolean).join(' · ')} />}
          {person && (
            <>
              <Avatar name={person.name} size={40} />
              <div className="preview-meta">
                <span className="t-label c-3">人物 · {person.roles[0]}</span>
                <span className="preview-title">{person.name}</span>
                <span className="t-small c-2">出现在 {person.works.filter((w) => !(show && me.onlyMe.includes(w.id))).length} 部作品里</span>
              </div>
            </>
          )}
        </Preview>
      )}
    </div>
  );
}

export function useMentions(targetId: string) {
  const { d, unlinked, show, me } = useStore();
  const unl = useMemo(() => new Set(unlinked), [unlinked]);
  // 给人看: a work or essay that is 只给自己 is not listed as mentioning this one
  return useMemo(() => {
    const all = mentionsOf(targetId, d, unl);
    if (!show) return all;
    const hid = new Set(me.onlyMe);
    return all.filter((m) => !hid.has(m.from.id));
  }, [targetId, d, unl, show, me.onlyMe]);
}
type MentionItem = ReturnType<typeof mentionsOf>[number];

function MentionRows({ list }: { list: MentionItem[] }) {
  return (
    <>
      {list.map((m) => (
        <Link key={m.from.id} to={m.from.kind === 'essay' ? `/essay/${m.from.id}` : `/entry/${m.from.id}`} className="mention">
          <div className="mention-head">
            <span className="mention-title">{m.from.title}</span>
            <span className="t-caption c-3">{fmtYMD(m.date)}</span>
          </div>
          {m.word ? (
            <p className="t-small c-2 clamp-2">{m.before}<b className="mention-word">{m.word}</b>{m.after}</p>
          ) : (
            <p className="t-caption c-3">{m.relation}</p>
          )}
        </Link>
      ))}
    </>
  );
}

/** 「被提到 · N」 (§3.4): context with the word in ink 500, newest first, >8 folds. `open` starts unfolded. */
export function Mentions({ targetId, open = false, id }: { targetId: string; open?: boolean; id?: string }) {
  const list = useMentions(targetId);
  const [all, setAll] = useState(open);
  if (!list.length) return null;
  const title = mentionTitle(list);
  const shown = all ? list : list.slice(0, 8);
  return (
    <Section title={title} count={list.length} id={id}>
      <div className="mentions">
        <MentionRows list={shown} />
        {list.length > 8 && !all && <button className="info-more mention-more" onClick={() => setAll(true)}>全部 · {list.length}　›</button>}
      </div>
    </Section>
  );
}

/** Side-column 被提到 (§8.3.2): at most 5, then 「全部 · N ›」 opens the full list in the reading column. */
export function SideMentions({ targetId, onAll, allOpen }: { targetId: string; onAll: () => void; allOpen: boolean }) {
  const list = useMentions(targetId);
  if (!list.length) return null;
  const title = mentionTitle(list);
  return (
    <section className="side-mentions" aria-label={`${title} · ${list.length}`}>
      <h2 className="side-head">{title}<span className="count"> · {list.length}</span></h2>
      <div className="mentions">
        <MentionRows list={list.slice(0, SIDE_MENTIONS)} />
        {list.length > SIDE_MENTIONS && !allOpen && <button className="info-more mention-more" onClick={onAll}>全部 · {list.length}　›</button>}
      </div>
    </section>
  );
}

export function Colophon({ date, source, reason, seal, pinned }: { date: string; source?: string; reason?: string; seal?: boolean; pinned?: boolean }) {
  return (
    <footer className="colophon">
      {seal && <Seal />}
      {/* 「设为首页封面」 answers here, not in a toast (r5 #5) */}
      {/* a synced work says only where it came from: the day it came in is an import, not a date of yours,
          and next to 看完 it read like one (FEEDBACK 2026-10-10 §2) */}
      <span>{reason ?? <>{source ? `来自 ${source}` : `收于 ${fmtYMD(date)}`}{pinned ? ' · 首页封面' : ''}</>}</span>
    </footer>
  );
}

export const kindTag = (k: keyof typeof KIND_LABEL) => (k === 'essay' ? '随笔' : `作品 · ${KIND_LABEL[k]}`);
