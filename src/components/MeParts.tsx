/**
 * The pieces the 「我」 pages share (CONCEPT v1): what a viewer may see, the paragraph written from the
 * records and its rewrite, small cover strips, the one suggestion card with its 「改一下」 sheet, and the
 * sheets that change 最爱 and the frontispiece.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, Search, X } from 'lucide-react';
import { DEMO } from '@demo';
import { useStore } from '../data/store';
import type { Work } from '../data/types';
import { KIND_ASPECT } from '../data/types';
import { personId } from '../data/derive';
import { chapterOrder, FAV_MAX, INTEREST_LINE_MAX, INTEREST_NAME_MAX, interestMembers, ownInterest, withMembers, type Interest } from '../data/me';
import { outwardView, shownLibrary } from '../data/visible';
import { asFavorites, asInterest, asPeriod, favCandidates, nameFromCard, sheetMembers, suggestions, whyFor, type FavPick, type Suggestion } from '../data/suggest';
import { keptLead, plain, spaced, withTasteRows, type LeadCtx, type Seg } from '../data/lead';
import { computeTaste } from '../data/taste/engine';
import { peopleStatus } from '../data/taste/people';
import { resolveRows } from '../data/taste/pick';
import { todayISO } from '../lib/today';
import { titleOf, TITLE_MAX } from '../lib/naming';
import { Cover } from './Cover';
import { Sheet } from './Bits';
import { searchLibrary } from './CommandPalette';

/* ---------- what is on the page ---------- */

export const aspectOf = (w: Work) => w.cover?.aspect ?? KIND_ASPECT[w.kind];
/** a cover inside a bw × bh box, by its own shape */
export function fit(w: Work, bw: number, bh: number): [number, number] {
  const a = aspectOf(w);
  return bh * a > bw ? [bw, Math.round(bw / a)] : [Math.round(bh * a), bh];
}

/**
 * The 「我」 view of the library. While 给人看, works, periods, interests and 最爱 come from outwardView
 * (nothing 只给自己, no sample, and no interest or period a guest would find empty). The owner sees the whole
 * library. Suggestions are the owner's: never while showing.
 */
export function useMeView() {
  const store = useStore();
  const { library, d, me, show, bangumi, connections } = store;
  const today = todayISO();
  return useMemo(() => {
    const ov = outwardView(library, me, today);
    // essays stay in the lead's works (「也写一点东西」); outwardView().works leaves them out
    const visible = show ? shownLibrary(library, me.onlyMe) : library;
    const works = show ? ov.works : visible.filter((w) => w.kind !== 'essay');
    const periods = show ? ov.periods : chapterOrder(me.periods); // outward-allow: the owner sees every period
    const interests = show ? ov.interests : me.interests; // outward-allow: the owner sees every interest
    const tasteWorks = show ? ov.works : library.filter((w) => !w.isSample);
    const people = peopleStatus(tasteWorks, bangumi ?? null, connections.bangumi ?? undefined, DEMO);
    const taste = computeTaste({ works: tasteWorks, periods, today, people });
    const rows = resolveRows(taste, me.taste, show ? 'outward' : 'own');
    const ctx: LeadCtx = withTasteRows(
      { name: store.title?.trim() ?? '', works: visible, interests, periods, today, known: (n) => d.persons.has(personId(n)) },
      rows,
    );
    const favSource = show ? ov.favorites : me.favorites;
    const favs = favSource.map((f) => ({ f, w: d.byId.get(f.id) })).filter((x): x is { f: typeof x.f; w: Work } => !!x.w);
    const next: Suggestion | null = show ? null : suggestions(library, { title: store.title, me, today })[0] ?? null;
    return {
      visible, works, periods, ctx, favs, next, today,
      hiddenPeriods: show ? ov.hiddenPeriods : [],
      hiddenInterests: show ? ov.hiddenInterests : [],
    };
  }, [library, d, me, show, store.title, today, bangumi, connections]);
}

/* ---------- the paragraph ---------- */

/** a paragraph from the records, its names linked (a person's page is not for a viewer: in 给人看 it is plain) */
export function LeadText({ segs, className = 'mh-lead' }: { segs: Seg[]; className?: string }) {
  const { show } = useStore();
  return (
    <p className={className}>
      {spaced(segs).map((s, i) => (s.to && !(show && s.kind === 'person')
        ? <Link key={i} to={s.to} className="autolink">{s.text}</Link>
        : <span key={i}>{s.text}</span>))}
    </p>
  );
}

/**
 * The paragraph and, under it, where it came from: 「这一段是按记录写的 · 改写」; once rewritten, yours, with
 * 「用按记录写的」 to go back. In 给人看 only the paragraph.
 */
export function Lead({ segs, mine, onSave, className }: { segs: Seg[]; mine?: string; onSave: (text: string) => void; className?: string }) {
  const { show } = useStore();
  const [editing, setEditing] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  if (!segs.length && !mine) return null;
  if (editing) {
    return (
      <div className="mh-rewrite">
        <textarea
          ref={ta} className="mh-rewrite-field" defaultValue={mine ?? plain(segs)} rows={5} aria-label="改写这一段" autoFocus
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(false); } }}
        />
        <div className="mh-rewrite-acts">
          <button className="btn btn-primary" onClick={() => { onSave(keptLead(ta.current?.value ?? '', plain(segs)) ?? ''); setEditing(false); }}>存下</button>
          <button className="btn-text quiet" onClick={() => setEditing(false)}>不改了</button>
        </div>
      </div>
    );
  }
  return (
    <>
      {mine ? mine.split(/\n+/).filter(Boolean).map((p, i) => <p key={i} className={className ?? 'mh-lead'}>{p}</p>) : <LeadText segs={segs} className={className} />}
      {!show && (
        <p className="mh-auto t-caption c-3">
          {mine
            ? <><button className="btn-text quiet" onClick={() => setEditing(true)}>改写</button><span aria-hidden> · </span><button className="btn-text quiet" onClick={() => onSave('')}>改回按记录写的</button></>
            : <><span>这一段是按记录写的</span><span aria-hidden> · </span><button className="btn-text quiet" onClick={() => setEditing(true)}>改写</button></>}
        </p>
      )}
    </>
  );
}

/* ---------- small covers ---------- */

/** a row of small covers at one height, each a way into its entry (or not, when the row is the link) */
export function Strip({ works, h, max = 6, linked = false, className = '' }: { works: Work[]; h: number; max?: number; linked?: boolean; className?: string }) {
  const ws = works.filter((w) => w.cover).slice(0, max);
  const pad = ws.length < max ? works.filter((w) => !w.cover).slice(0, max - ws.length) : [];
  return (
    <span className={`mh-strip ${className}`} aria-hidden={!linked}>
      {[...ws, ...pad].map((w) => {
        const [cw, ch] = fit(w, h * 1.6, h);
        const c = <Cover work={w} w={cw} h={ch} paperPlaceholder />;
        return linked ? <Link key={w.id} to={`/entry/${w.id}`} aria-label={w.title} data-ctx={w.id}>{c}</Link> : <span key={w.id}>{c}</span>;
      })}
    </span>
  );
}

/* ---------- the suggestion card ---------- */

/**
 * One card under the name: a question, what it is based on, a few covers, 是 / 不是 / 改一下. 「不是」 never
 * comes back; 「改一下」 opens a sheet to rename it and take out what doesn't belong.
 */
export function SuggestCard({ s }: { s: Suggestion }) {
  const store = useStore();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const no = () => store.dismiss(s.key);
  const yes = () => {
    if (s.type === 'fav') { store.addFavorites(asFavorites(s.picks)); store.toast(`放进最爱了：${s.picks.length} 部`); }
    else if (s.type === 'interest') { const id = store.addInterest(asInterest(s)); store.toast(`收成了一个兴趣：${s.name}`, { label: '看看', run: () => nav(`/interest/${id}`) }); }
    else if (s.type === 'period') { const id = store.addPeriod(asPeriod(s)); store.toast(`收成了一个时期：${s.name}`, { label: '看看', run: () => nav(`/period/${id}`) }); }
  };
  if (s.type === 'name') {
    const save = () => { const v = nameFromCard(name); if (v) store.setTitle(v); };
    return (
      <section className="ask" aria-label="一个建议">
        <h2 className="ask-q">{s.question}</h2>
        <p className="ask-why t-caption c-3">写在首页最上面。可以是名字，也可以是你想被叫的样子，最多 {TITLE_MAX} 个字。</p>
        <input
          className="ask-field" value={name} placeholder="写一个名字" aria-label="名字" maxLength={TITLE_MAX * 2} enterKeyHint="done"
          onChange={(e) => setName([...e.target.value].slice(0, TITLE_MAX).join(''))}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) save(); }}
        />
        <div className="ask-acts">
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>好</button>
          <button className="btn-text quiet" onClick={no}>跳过</button>
        </div>
      </section>
    );
  }
  const covers = s.type === 'fav' ? s.picks.map((p) => store.d.byId.get(p.id)).filter((w): w is Work => !!w) : s.members;
  return (
    <section className="ask" aria-label="一个建议">
      <h2 className="ask-q">{s.question}</h2>
      <p className="ask-why t-caption c-3">{s.evidence}</p>
      <Strip works={covers} h={64} max={6} className="ask-strip" />
      <div className="ask-acts">
        <button className="btn btn-primary" onClick={yes}>是</button>
        <button className="btn btn-secondary" onClick={no}>不是</button>
        <button className="btn-text" onClick={() => setEditing(true)}>改一下</button>
      </div>
      {s.type === 'fav'
        ? <FavPickSheet open={editing} onClose={() => setEditing(false)} pool={s.pool} preset={s.picks.map((p) => p.id)} onDone={(ids) => { if (ids.length) store.addFavorites(asFavorites(s.pool.filter((p) => ids.includes(p.id)))); }} />
        : <EditSuggestionSheet s={s} open={editing} onClose={() => setEditing(false)} />}
    </section>
  );
}

/** a grid of covers to tick (a tick = in); used by the suggestion sheets and 最爱 */
export function PickGrid({ works, on, toggle, label, titled = false }: { works: Work[]; on: Set<string>; toggle: (id: string) => void; label: string; titled?: boolean }) {
  return (
    <div className={`pick-grid ${titled ? 'titled' : ''}`} role="group" aria-label={label}>
      {works.map((w) => {
        const [cw, ch] = fit(w, 72, 100);
        const sel = on.has(w.id);
        return (
          <button key={w.id} className={`pick-cell ${sel ? 'on' : 'off'}`} aria-pressed={sel} aria-label={w.title} onClick={() => toggle(w.id)}>
            <span className="pick-cv"><Cover work={w} w={cw} h={ch} paperPlaceholder /></span>
            {/* a series looks alike on its covers: under each one its name */}
            {titled && <span className="pick-t clamp-2" aria-hidden>{w.title}</span>}
            <i aria-hidden>{sel && <Check size={12} strokeWidth={2.5} />}</i>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 添一个兴趣 / 改这个兴趣: its name, a line under it, and the works in it — ticked; a tap takes one out, and a
 * search over the library finds more to put in. Saved in one go (存下), so a slip is undone by closing.
 */
export function InterestSheet({ open, onClose, interest, focus = 'name', onRemove }: {
  open: boolean; onClose: () => void; interest?: Interest; focus?: 'name' | 'works'; onRemove?: () => void;
}) {
  const store = useStore();
  const nav = useNavigate();
  const { library, d } = store;
  const works = useMemo(() => library.filter((w) => w.kind !== 'essay' && !w.isSample), [library]);
  const [start] = useState(() => (interest ? interestMembers(interest, works) : []));
  const [name, setName] = useState(interest?.name ?? '');
  const [line, setLine] = useState(interest?.blurb ?? '');
  // what is listed under 算在里面的: the members, then each one put in from the search, in that order
  const [listed, setListed] = useState<Work[]>(start);
  const [on, setOn] = useState(() => new Set(start.map((w) => w.id)));
  const [q, setQ] = useState('');
  const term = q.trim();
  // what the search finds that isn't listed yet (any = it found something at all)
  const { found, any } = useMemo(() => {
    if (!term) return { found: [], any: false };
    const have = new Set(listed.map((w) => w.id));
    const all = searchLibrary(term, works, d).works;
    return { found: all.filter((w) => !have.has(w.id)).slice(0, 24), any: all.length > 0 };
  }, [term, works, d, listed]);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open || focus !== 'works') return;
    const t = window.setTimeout(() => search.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(t);
  }, [open, focus]);
  const toggle = (id: string) => setOn((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const put = (id: string) => {
    const w = found.find((x) => x.id === id);
    if (!w) return;
    setListed((xs) => [...xs, w]);
    setOn((x) => new Set([...x, id]));
  };
  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (interest) {
      store.updateInterest(interest.id, { name: n.slice(0, INTEREST_NAME_MAX), blurb: line.trim().slice(0, INTEREST_LINE_MAX) || undefined, ...withMembers(interest, works, on) });
    } else {
      const id = store.addInterest(ownInterest(n, line, listed.filter((w) => on.has(w.id)).map((w) => w.id)));
      store.toast(`添了一个兴趣：${n}`, { label: '看看', run: () => nav(`/interest/${id}`) });
    }
    onClose();
  };
  const title = interest ? '改这个兴趣' : '添一个兴趣';
  return (
    <Sheet open={open} onClose={onClose} label={title} className="sheet-tall">
      <div className="sheet-body">
        <h2 className="t-title">{title}</h2>
        <p className="t-small c-2 sheet-say">{interest ? '不算的，点一下拿掉；要放进来的，在下面找。' : '一个作者、一种题材、一个系列都行。以后在它的页面上还能改。'}</p>
        <label className="mp-field"><span className="label-head">名字</span><input className="ask-field" value={name} maxLength={INTEREST_NAME_MAX} onChange={(e) => setName(e.target.value)} /></label>
        <label className="mp-field"><span className="label-head">一句话</span><input className="ask-field ask-field-quiet" value={line} maxLength={INTEREST_LINE_MAX} placeholder="可以不写" onChange={(e) => setLine(e.target.value)} /></label>
        <p className="label-head pick-head">算在里面的 · {on.size} 部</p>
        {listed.length > 0
          ? <PickGrid works={listed} on={on} toggle={toggle} label="算在里面的" titled />
          : <p className="t-small c-3 pick-none">在下面找到一部，点一下就放进来。</p>}
        <label className="search-field pick-search">
          <Search strokeWidth={1.5} />
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="书名、人名" enterKeyHint="search" aria-label="找一部放进来" autoComplete="off" spellCheck={false} />
        </label>
        {found.length > 0 && <PickGrid works={found} on={new Set()} toggle={put} label="找到的" titled />}
        {term && !found.length && <p className="t-small c-3 pick-none">{any ? '找到的都在里面了' : `这里没有「${term}」`}</p>}
        <div className="sheet-actions pair">
          {interest && onRemove
            ? <button className="btn btn-secondary" onClick={() => { onRemove(); onClose(); }}>不要这个兴趣了</button>
            : <button className="btn btn-secondary" onClick={onClose}>先不添</button>}
          <button className="btn btn-primary" disabled={!name.trim()} onClick={save}>{interest ? '存下' : '添上'}</button>
        </div>
      </div>
    </Sheet>
  );
}

function EditSuggestionSheet({ s, open, onClose }: { s: Extract<Suggestion, { type: 'interest' | 'period' }>; open: boolean; onClose: () => void }) {
  const store = useStore();
  const nav = useNavigate();
  const [name, setName] = useState(s.name);
  const [on, setOn] = useState(() => new Set(s.members.map((w) => w.id)));
  const toggle = (id: string) => setOn((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const view = sheetMembers(s.members, on);
  const keep = () => {
    const { exclude } = view;
    if (s.type === 'interest') { const id = store.addInterest(asInterest(s, { name, exclude })); store.toast(`收成了一个兴趣：${name.trim() || s.name}`, { label: '看看', run: () => nav(`/interest/${id}`) }); }
    else { const id = store.addPeriod(asPeriod(s, { name, exclude })); store.toast(`收成了一个时期：${name.trim() || s.name}`, { label: '看看', run: () => nav(`/period/${id}`) }); }
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} label={s.type === 'interest' ? '收成一个兴趣' : '收成一个时期'}>
      <div className="sheet-body">
        <h2 className="t-title">{s.type === 'interest' ? '收成一个兴趣' : '收成一个时期'}</h2>
        <p className="t-small c-2 sheet-say">名字可以改；不算的，点一下拿掉。</p>
        <input className="ask-field" value={name} onChange={(e) => setName(e.target.value)} aria-label="名字" maxLength={24} />
        <p className="label-head pick-head">算在里面的 · {view.count} 部</p>
        <PickGrid works={view.shown} on={on} toggle={toggle} label="算在里面的" />
        <div className="sheet-actions pair">
          <button className="btn btn-secondary" onClick={() => { store.dismiss(s.key); onClose(); }}>不收了</button>
          <button className="btn btn-primary" onClick={keep}>收下</button>
        </div>
      </div>
    </Sheet>
  );
}

/** 最爱 from the strongest candidates: tick the ones that are */
function FavPickSheet({ open, onClose, pool, preset, onDone }: { open: boolean; onClose: () => void; pool: FavPick[]; preset: string[]; onDone: (ids: string[]) => void }) {
  const { d } = useStore();
  const works = pool.map((p) => d.byId.get(p.id)).filter((w): w is Work => !!w);
  const [on, setOn] = useState(() => new Set(preset));
  const toggle = (id: string) => setOn((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else if (n.size < FAV_MAX) n.add(id); return n; });
  return (
    <Sheet open={open} onClose={onClose} label="挑几部放进最爱">
      <div className="sheet-body">
        <h2 className="t-title">挑几部放进最爱</h2>
        <p className="t-small c-2 sheet-say">五到九部就好，以后在任何一部的页面上也能放进来。</p>
        <PickGrid works={works} on={on} toggle={toggle} label="最爱" />
        <div className="sheet-actions pair">
          <button className="btn btn-secondary" onClick={onClose}>先不放</button>
          <button className="btn btn-primary" disabled={on.size === 0} onClick={() => { if (!on.size) return; onDone(works.filter((w) => on.has(w.id)).map((w) => w.id)); onClose(); }}>放进最爱 · {on.size}</button>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------- 最爱: order, why, out ---------- */

export function FavEditSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const { me, d, library } = store;
  const favs = me.favorites.map((f) => ({ f, w: d.byId.get(f.id) })).filter((x): x is { f: typeof x.f; w: Work } => !!x.w);
  const more = useMemo(() => favCandidates(library.filter((w) => !w.isSample)).filter((p) => !me.favorites.some((f) => f.id === p.id)).slice(0, 12)
    .map((p) => d.byId.get(p.id)).filter((w): w is Work => !!w), [library, me.favorites, d]);
  const move = (i: number, by: number) => {
    const ids = favs.map((x) => x.f.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    store.orderFavorites(ids);
  };
  return (
    <Sheet open={open} onClose={onClose} label="最爱" className="sheet-tall">
      <div className="sheet-body">
        <h2 className="t-title">最爱</h2>
        <p className="t-small c-2 sheet-say">排在最前的，默认用作首页那一张。每部下面可以写一句；不写，就沿用你给这部写过的那句。</p>
        <ol className="fav-edit">
          {favs.map(({ f, w }, i) => {
            const auto = whyFor(w);
            return (
              <li key={f.id} className="fav-edit-row">
                <Cover work={w} w={40} h={Math.round(40 / aspectOf(w))} paperPlaceholder />
                <div className="fav-edit-main">
                  <span className="t-ui ellipsis">{w.title}</span>
                  <input
                    className="fav-why-field" defaultValue={f.why ?? ''} placeholder={auto.why ?? '一句就好'} aria-label={`《${w.title}》，为什么`}
                    onBlur={(e) => { if ((e.target.value.trim() || '') !== (f.why ?? '')) store.setFavoriteWhy(f.id, e.target.value); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); }}
                  />
                </div>
                <div className="fav-edit-acts">
                  <button className="icon-btn" aria-label={`《${w.title}》往前`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={18} strokeWidth={1.5} /></button>
                  <button className="icon-btn" aria-label={`《${w.title}》往后`} disabled={i === favs.length - 1} onClick={() => move(i, 1)}><ArrowDown size={18} strokeWidth={1.5} /></button>
                  <button className="icon-btn" aria-label={`《${w.title}》拿出最爱`} onClick={() => store.removeFavorite(f.id)}><X size={18} strokeWidth={1.5} /></button>
                </div>
              </li>
            );
          })}
        </ol>
        {favs.length < FAV_MAX && more.length > 0 && (
          <>
            <p className="label-head pick-head">还可以放进来的</p>
            <PickGrid works={more} on={new Set()} toggle={(id) => store.addFavorite(id)} label="还可以放进来的" />
          </>
        )}
        <div className="sheet-actions"><button className="btn btn-secondary" onClick={onClose}>好了</button></div>
      </div>
    </Sheet>
  );
}

/** 换首页封面: the frontispiece from 最爱 first, then what you rated highest, then the latest */
export function CoverPickSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const { me, d, library } = store;
  const works = useMemo(() => {
    const ids = [...me.favorites.map((f) => f.id), ...favCandidates(library.filter((w) => !w.isSample)).map((p) => p.id), ...library.filter((w) => w.cover && w.kind !== 'essay').slice(0, 24).map((w) => w.id)];
    return [...new Set(ids)].map((id) => d.byId.get(id)).filter((w): w is Work => !!w?.cover).slice(0, 24);
  }, [me.favorites, library, d]);
  const cur = me.profile.frontispiece ?? me.favorites[0]?.id;
  return (
    <Sheet open={open} onClose={onClose} label="换首页封面">
      <div className="sheet-body">
        <h2 className="t-title">换首页封面</h2>
        <p className="t-small c-2 sheet-say">首页名字下面那一张。默认是第一部最爱。</p>
        <PickGrid works={works} on={new Set(cur ? [cur] : [])} toggle={(id) => { store.setProfile({ frontispiece: id }); onClose(); }} label="首页封面" />
        <div className="sheet-actions pair">
          <button className="btn btn-secondary" onClick={() => { store.setProfile({ frontispiece: '' }); onClose(); }}>改回第一部最爱</button>
          <button className="btn btn-secondary" onClick={onClose}>不换了</button>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------- small things ---------- */

export const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
export const chapterNo = (i: number) => CN_NUM[i] ?? String(i + 1);
export const nameOf = (title?: string) => titleOf(title);
export function Pill({ children }: { children: ReactNode }) { return <span className="mh-pill">{children}</span>; }
