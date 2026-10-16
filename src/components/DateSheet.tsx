import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Sheet } from './Bits';
import { useStore, type DatePick } from '../data/store';
import type { Work } from '../data/types';
import { BP, DUR } from '../tokens';

const MONTHS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
const FIRST_YEAR = 1950;

export const doneVerb = (w: Work) => (w.kind === 'music' ? '听' : w.kind === 'game' ? '玩' : w.kind === 'book' ? '读' : '看');
const askOf = (w: Work) => (w.kind === 'music' ? '什么时候听的' : w.kind === 'game' ? '什么时候玩的' : '什么时候看完的');

/**
 * The 看完 date picker (STYLE v0.4 §3.14.2, DECISIONS-r2 #9). Every tap applies at once — no save, no
 * confirm. A year (or a month) and then two quiet seconds closes it; a day closes it; 「不记得了」 pins
 * the work to 时间未知 and closes it. 「约」 sits at the row's left edge and keeps it to the year.
 * Phone: a bottom sheet. Desktop with an anchor: a 400-wide card hung 8 below the cell.
 *
 * `multi` (§3.14.3 「归到……」): the same row of years for several works, plus 「和另一部作品同一年……」;
 * one tap puts them all there and ends the selection (`onApplied`).
 */
export function DateSheet({ works, open, onClose, anchor, multi, onApplied }: {
  works: Work[]; open: boolean; onClose: () => void; anchor?: DOMRect | null; multi?: boolean; onApplied?: () => void;
}) {
  const store = useStore();
  const one = !multi && works.length === 1 ? works[0] : null;
  const v0 = one?.finished ?? '';
  const now = new Date();
  const thisYear = now.getFullYear();
  const [y, setY] = useState<number | null>(v0 ? Number(v0.slice(0, 4)) : null);
  const [m, setM] = useState<number | null>(v0.length >= 7 ? Number(v0.slice(5, 7)) : null);
  const [dd, setD] = useState<number | null>(v0.length >= 10 ? Number(v0.slice(8, 10)) : null);
  const [approx, setApprox] = useState(!!one?.date?.approx);
  const [days, setDays] = useState(false);
  const [forgot, setForgot] = useState(!!one && one.date?.level === 4 && one.date.locked);
  const [same, setSame] = useState(false);
  const [err, setErr] = useState(false);

  // closes itself 2s after the last tap (never while the days are open)
  const timer = useRef<number>();
  const linger = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(onClose, DUR.linger); };
  const still = () => window.clearTimeout(timer.current);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { if (!open) still(); }, [open]);

  const years = useMemo(() => { const a: number[] = []; for (let i = thisYear; i >= FIRST_YEAR; i--) a.push(i); return a; }, [thisYear]);
  const row = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const el = row.current?.querySelector<HTMLElement>('.ds-year.on');
    if (el && row.current) row.current.scrollLeft = Math.max(0, el.offsetLeft - row.current.clientWidth / 2 + el.offsetWidth / 2);
  }, [open]);

  const commit = (p: DatePick | null) => {
    try { store.setDateClaim(works.map((w) => w.id), p); setErr(false); return true; } catch { setErr(true); return false; }
  };
  const put = (yy: number, mm: number | null, d: number | null, ap: boolean) => {
    setForgot(false);
    const pad = (n: number) => String(n).padStart(2, '0');
    if (mm && d) return commit({ value: `${yy}-${pad(mm)}-${pad(d)}`, precision: 'day' });
    if (mm) return commit({ value: `${yy}-${pad(mm)}`, precision: 'month' });
    return commit({ value: String(yy), precision: 'year', approx: ap });
  };
  const applyMulti = (yy: number, ap: boolean) => {
    if (commit({ value: String(yy), precision: 'year', approx: ap })) { onApplied?.(); onClose(); }
  };
  const pickY = (yy: number) => {
    if (multi) { applyMulti(yy, approx); return; }
    setY(yy);
    const mm = m && !(yy === thisYear && m > now.getMonth() + 1) ? m : null;
    const d = mm && dd && dd <= daysIn(yy, mm) ? dd : null;
    setM(mm); setD(d);
    if (put(yy, mm, d, approx) && !days) linger();
  };
  const pickM = (mm: number) => {
    setM(mm); setD(null);
    if (put(y!, mm, null, false) && !days) linger();
  };
  const openDays = () => { still(); setDays(true); };
  const pickD = (d: number) => { setD(d); if (put(y!, m, d, false)) window.setTimeout(onClose, DUR.fade); };
  const toggleApprox = () => {
    const a = !approx;
    setApprox(a);
    if (a) { setM(null); setD(null); setDays(false); }
    if (y !== null && !multi) { put(y, null, null, a); linger(); }
  };
  const dontKnow = () => {
    setForgot(true); setY(null); setM(null); setD(null); setApprox(false);
    if (commit({ value: null, precision: 'unknown' })) onClose();
  };

  const futureM = (mm: number) => y === thisYear && mm > now.getMonth() + 1;
  const futureD = (d: number) => y === thisYear && m === now.getMonth() + 1 && d > now.getDate();
  const title = multi ? '归到哪一年' : one ? askOf(one) : '';
  const sub = multi ? `选了 ${works.length} 部` : one ? `《${one.title}》` : '';

  const yearRow = (
    <div className="ds-yearline">
      <button className={`ds-approx ${approx ? 'on' : ''}`} aria-pressed={approx} aria-label="约" onClick={toggleApprox}>约</button>
      <i className="ds-vline" aria-hidden />
      <div className="ds-years" ref={row} role="group" aria-label="年份" onKeyDown={(e) => rowKeys(e, '.ds-year')}>
        {years.map((yy) => (
          <button key={yy} className={`ds-year ${!multi && y === yy && !forgot ? 'on' : ''}`} aria-pressed={!multi && y === yy} onClick={() => pickY(yy)}>{yy}</button>
        ))}
      </div>
    </div>
  );

  const body = same ? (
    <SameYear exclude={new Set(works.map((w) => w.id))} onPick={(w) => applyMulti(Number(w.finished.slice(0, 4)), !!w.date?.approx)} />
  ) : (
    <>
      {yearRow}
      {!multi && y !== null && !approx && !forgot && (
        <div className="ds-months" role="group" aria-label="月份">
          {MONTHS.map((t, i) => (
            <button key={t} className={`ds-cell ${m === i + 1 ? 'on' : ''}`} aria-pressed={m === i + 1} disabled={futureM(i + 1)} onClick={() => pickM(i + 1)}>{t}月</button>
          ))}
        </div>
      )}
      {!multi && m !== null && !approx && !forgot && (days
        ? (
          <div className="ds-days" role="group" aria-label="哪天">
            {Array.from({ length: daysIn(y!, m) }, (_, i) => i + 1).map((d) => (
              <button key={d} className={`ds-cell ${dd === d ? 'on' : ''}`} aria-pressed={dd === d} disabled={futureD(d)} onClick={() => pickD(d)}>{d}</button>
            ))}
          </div>
        )
        : <button className="ds-text ds-more" onClick={openDays}>具体哪天</button>)}
      <div className="ds-foot">
        {multi
          ? <button className="ds-text" onClick={() => setSame(true)}>和另一部作品同一年……</button>
          : <button className={`ds-text ${forgot ? 'is-on' : ''}`} onClick={dontKnow}>不记得了</button>}
      </div>
      {err && <p className="t-small c-2 ds-err">没改成，再点一次。</p>}
    </>
  );
  const content = (
    <div className="ds-body" onPointerDown={() => { if (timer.current) linger(); }}>
      <h2 className="t-h2 ds-title">{title}</h2>
      <p className="t-small c-2 ellipsis ds-sub">{sub}</p>
      {one && <Provenance work={one} />}
      {body}
    </div>
  );
  const desk = typeof window !== 'undefined' && window.innerWidth >= BP.desktop;
  if (desk && anchor) return <Popover open={open} anchor={anchor} onClose={onClose} label={title}>{content}</Popover>;
  return <Sheet open={open} onClose={onClose} label={title} className="date-sheet">{content}</Sheet>;
}

/** the day Bangumi has for a work: its mark claim, or (the demo catalogue) the bare updated_at */
function bgmDayOf(w: Work): { day: string; seen: boolean } | null {
  const c = w.claims?.find((x) => x.source === 'bgm_updated_at' || x.source === 'bgm_first_seen');
  if (c?.value && c.value.length >= 10) return { day: c.value.slice(0, 10), seen: c.source === 'bgm_first_seen' };
  if (c) return null;
  return w.source === 'bangumi' && w.bgmUpdatedAt && w.bgmUpdatedAt.length >= 10 ? { day: w.bgmUpdatedAt.slice(0, 10), seen: false } : null;
}

/**
 * Where the date came from, one grey line under the title (FEEDBACK 2026-10-10 §2): 「Bangumi 上标记于 2012-08-20」;
 * a batch marked in one go, which is why it reads 时间未知: 「Bangumi 上 2020-08-16 一次标了 40 部」.
 */
function Provenance({ work }: { work: Work }) {
  const { library } = useStore();
  const b = bgmDayOf(work);
  const pile = !!b && !b.seen && work.date?.level === 4 && !work.date.locked;
  const n = useMemo(() => (pile && b ? library.filter((w) => bgmDayOf(w)?.day === b.day).length : 0), [pile, b?.day, library]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = work.claims?.find((c) => c.source === 'steam_last_played');
  if (!b) return st?.value ? <p className="t-caption c-3 tnum ds-prov">{`Steam 上最后玩于 ${st.value}`}</p> : null;
  const text = b.seen ? `${b.day} 同步时在 Bangumi 上看到` : pile && n > 1 ? `Bangumi 上 ${b.day} 一次标了 ${n} 部` : `Bangumi 上标记于 ${b.day}`;
  return <p className="t-caption c-3 tnum ds-prov">{text}</p>;
}

/** ← → along a row, Enter picks (desktop keyboard, §3.14.2) */
function rowKeys(e: React.KeyboardEvent<HTMLElement>, sel: string) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const all = [...e.currentTarget.querySelectorAll<HTMLElement>(sel)];
  const i = all.indexOf(document.activeElement as HTMLElement);
  const n = all[i + (e.key === 'ArrowRight' ? 1 : -1)];
  if (n) { e.preventDefault(); n.focus(); n.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }
}

/** 「和另一部作品同一年……」: find one whose year you remember */
function SameYear({ exclude, onPick }: { exclude: Set<string>; onPick: (w: Work) => void }) {
  const { library } = useStore();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return library.filter((w) => w.finished && !exclude.has(w.id) && !w.isSample && (!t || w.title.toLowerCase().includes(t))).slice(0, 40);
  }, [library, q, exclude]);
  return (
    <div className="ds-same">
      <input className="ds-search" placeholder="找一部记得年份的" aria-label="找一部记得年份的" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="ds-same-list">
        {list.map((w) => (
          <button key={w.id} className="ds-same-row" onClick={() => onPick(w)}>
            <span className="t-ui ellipsis">{w.title}</span>
            <span className="t-caption c-3 tnum">{w.date?.approx ? '约 ' : ''}{w.finished.slice(0, 4)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** desktop: a card hung under the cell it came from; Esc or a click outside closes it */
function Popover({ open, anchor, onClose, label, children }: { open: boolean; anchor: DOMRect; onClose: () => void; label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', k);
    const t = window.setTimeout(() => box.current?.querySelector<HTMLElement>('.ds-year.on, .ds-year')?.focus({ preventScroll: true }), 0);
    return () => { window.removeEventListener('keydown', k); window.clearTimeout(t); back?.focus?.({ preventScroll: true }); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // below the cell when it fits; otherwise above it; otherwise held inside the window (it grows with 具体哪天)
  const [top, setTop] = useState(anchor.bottom + 8);
  useLayoutEffect(() => {
    const el = box.current;
    if (!open || !el) return;
    const fit = () => {
      const h = el.offsetHeight;
      const vh = window.innerHeight;
      setTop(anchor.bottom + 8 + h <= vh - 16 ? anchor.bottom + 8 : anchor.top - 8 - h >= 16 ? anchor.top - 8 - h : Math.max(16, vh - 16 - h));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, anchor]);
  if (!open) return null;
  const W = 400;
  const left = Math.max(16, Math.min(anchor.left, window.innerWidth - W - 16));
  return createPortal(
    <>
      <div className="preview-layer" onClick={onClose} />
      <div className="ds-pop" role="dialog" aria-label={label} ref={box} style={{ left, top }}>{children}</div>
    </>,
    document.body,
  );
}
