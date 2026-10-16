import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import type { Work } from '../data/types';
import { KIND_LABEL } from '../data/types';
import { Cover, thumbSize } from './Cover';
import { creatorLine, fmtMD } from '../data/derive';
import { DUR, EASE, INFO_FIT } from '../tokens';
import { afterAnimations, haptic, reduced, STAGGER_MAX, staggerStyle } from '../lib/motion';
import { workActions, workMeta } from './ContextPreview';

/* ---------- Sheet ---------- */
/** `locked`: while something can't be interrupted (正在删除 / 正在断开), the scrim and Esc don't close it */
export function Sheet({ open, onClose, children, label, className = '', locked = false }: { open: boolean; onClose: () => void; children: ReactNode; label: string; className?: string; locked?: boolean }) {
  const lockRef = useRef(locked);
  lockRef.current = locked;
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setLeaving(false); }
    else if (mounted) {
      setLeaving(true);
      let live = true;
      void afterAnimations(box.current, DUR.fade).then(() => { if (live) { setMounted(false); setLeaving(false); } });
      return () => { live = false; };
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // focus moves into the dialog and stays there; Esc closes; focus returns to the opener (§8.5),
  // unless the sheet led somewhere else (收录 → 写点什么): then the new page keeps its own focus
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openedAt = useRef('');
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    openedAt.current = location.hash;
    const t = window.setTimeout(() => box.current?.querySelector<HTMLElement>('button:not([disabled]), input, textarea, a[href], [tabindex="0"]')?.focus({ preventScroll: true }), 0);
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); if (!lockRef.current) onClose(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href], textarea, [tabindex="0"]')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener('keydown', k);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', k);
      const o = opener.current;
      if (o?.isConnected && location.hash === openedAt.current) o.focus?.({ preventScroll: true });
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mounted) return null;
  return createPortal(
    <>
      <div className={`scrim ${leaving ? 'leaving' : ''}`} onClick={() => { if (!lockRef.current) onClose(); }} />
      <div className={`sheet ${className} ${leaving ? 'leaving' : ''}`} role="dialog" aria-modal="true" aria-label={label} ref={box}>
        <div className="sheet-handle" />
        {children}
      </div>
    </>,
    document.body,
  );
}

/* ---------- Preview card (anchored above/below a rect) ---------- */
/** `hover`: opened by a pointer dwell (§8.5) — no click-catching layer, the page stays live. */
export function Preview({ anchor, onClose, children, actions, hover, onPointerEnter, onPointerLeave, focusFirst }: {
  anchor: DOMRect; onClose: () => void; children: ReactNode; actions?: { label: string; run: () => void }[];
  hover?: boolean; onPointerEnter?: () => void; onPointerLeave?: () => void;
  /** opened from the keyboard: focus the first action (and Tab stays inside the card) */
  focusFirst?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // a clicked-open card is modal-ish: Esc closes it and focus goes back where it was (§8.5)
  useEffect(() => {
    if (hover) return;
    const back = document.activeElement as HTMLElement | null;
    if (focusFirst) setTimeout(() => ref.current?.querySelector<HTMLElement>('button, a[href]')?.focus({ preventScroll: true }), 0);
    const k = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !ref.current?.contains(document.activeElement)) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>('button, a[href]')];
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]?.focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]?.focus(); }
    };
    window.addEventListener('keydown', k, true);
    return () => {
      window.removeEventListener('keydown', k, true);
      if (back && back !== document.body && back.isConnected && (!document.activeElement || document.activeElement === document.body || ref.current?.contains(document.activeElement))) back.focus({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const vw = window.innerWidth;
    const gap = 8;
    const below = anchor.bottom + gap + h < window.innerHeight - 60;
    const preferAbove = anchor.top - gap - h > 56;
    const top = preferAbove && !below ? anchor.top - gap - h : below ? anchor.bottom + gap : Math.max(56, anchor.top - gap - h);
    const left = Math.min(Math.max(20, anchor.left + anchor.width / 2 - w / 2), vw - 20 - w);
    setPos({ top, left, origin: `${anchor.left + anchor.width / 2 - left}px ${top < anchor.top ? '100%' : '0'}` });
  }, [anchor]);
  return createPortal(
    <>
      {!hover && <div className="preview-layer" onClick={onClose} onContextMenu={(e) => e.preventDefault()} />}
      <div
        ref={ref}
        className="preview"
        role="dialog"
        style={pos ? { top: pos.top, left: pos.left, transformOrigin: pos.origin } : { visibility: 'hidden', top: 0, left: 0 }}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        <div className="preview-main">{children}</div>
        {actions && (
          <div className="preview-actions">
            {actions.map((a) => <button key={a.label} className="btn-text" onClick={a.run}>{a.label}</button>)}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

/**
 * A small menu under a ··· button (entry page, polish r3): the preview card's material, text rows
 * only, right-aligned to the button. Esc or a click outside closes it; focus starts on the first
 * row and returns to the button.
 */
export interface MenuItem { label: string; run?: () => void; note?: string }
export function Menu({ anchor, onClose, items, label }: { anchor: DOMRect; onClose: () => void; items: MenuItem[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const k = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const bs = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const i = bs.indexOf(document.activeElement as HTMLButtonElement);
        bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); back?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <>
      <div className="preview-layer" onClick={onClose} />
      <div ref={ref} className="menu" role="menu" aria-label={label} style={{ top: anchor.bottom + 6, right: Math.max(12, window.innerWidth - anchor.right) }}>
        {items.map((it) => (
          <button key={it.label} role="menuitem" className="menu-item" disabled={!it.run} onClick={() => { onClose(); it.run?.(); }}>
            <span>{it.label}</span>
            {it.note && <span className="menu-note">{it.note}</span>}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}

export function WorkPreviewBody({ work, meta }: { work: Work; meta: string }) {
  const [w, h] = work.kind === 'music' ? [40, 40] : [40, 60];
  return (
    <>
      <Cover work={work} w={w} h={h} />
      <div className="preview-meta">
        <span className="t-label c-3">作品 · {KIND_LABEL[work.kind]}</span>
        <span className="preview-title clamp-2">{work.title}</span>
        <span className="t-small c-2 ellipsis">{meta}</span>
      </div>
    </>
  );
}

/* ---------- Segmented text tabs with sliding 1.5px bar ---------- */
export function Seg<T extends string>({ options, value, onChange, className = '', ariaLabel }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string; ariaLabel?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLButtonElement>(`button[data-v="${CSS.escape(value)}"]`);
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options.length]);
  return (
    // a tab list is one stop on the Tab key; ← → (Home / End) move along it and choose (WAI-ARIA tabs)
    <div
      className={`seg ${className}`} ref={wrap} role="tablist" aria-label={ariaLabel}
      onKeyDown={(e) => {
        const i = options.findIndex((o) => o.value === value);
        const j = e.key === 'ArrowRight' ? Math.min(options.length - 1, i + 1) : e.key === 'ArrowLeft' ? Math.max(0, i - 1)
          : e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : -1;
        if (j < 0 || j === i) return;
        e.preventDefault();
        onChange(options[j].value);
        wrap.current?.querySelector<HTMLButtonElement>(`button[data-v="${CSS.escape(options[j].value)}"]`)?.focus();
      }}
    >
      {options.map((o) => (
        <button key={o.value} data-v={o.value} role="tab" aria-selected={o.value === value} tabIndex={o.value === value ? 0 : -1} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
      {bar && <span className="seg-bar" style={{ transform: `translateX(${bar.left}px) scaleX(${bar.width})` }} />}
    </div>
  );
}

/* ---------- Section (h2 + hairline) ---------- */
export function Section({ title, count, children, id }: { title: string; count?: number; children: ReactNode; id?: string }) {
  return (
    <section className="section" data-section={title} data-count={count} id={id}>
      <h2 className="section-head t-h2">
        {title}
        {count !== undefined && <span className="count"> · {count}</span>}
      </h2>
      {children}
    </section>
  );
}

/* ---------- Infobox ---------- */
export interface InfoRow { key: string; value: ReactNode; mono?: boolean }
/** `hide`: keys already shown elsewhere on the page (the entry hero strip, §7.4-5). */
/**
 * `fit` (entry hero side column, polish r4): the box shares the cover's height so its rules meet the
 * cover's top and foot exactly — rows ease apart to fill it (from INFO_FIT.fill of the height), or the
 * tail folds behind 「全部 · n」 when they would run past it. INFO_FIT.band rows or fewer are not a
 * column at all: they set as cells continuing the hero strip, on its rules. In between, the box
 * keeps its natural height on the strip's baseline, well clear of the cover top.
 */
export function InfoBox({ rows, fold = Infinity, foldLabel, hide, fit }: {
  rows: InfoRow[]; fold?: number; foldLabel?: (n: number) => string; hide?: readonly string[]; fit?: number;
}) {
  const [open, setOpen] = useState(false);
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | 'auto'>('auto');
  const visible = rows.filter((r) => r.value !== undefined && r.value !== null && r.value !== '' && !hide?.includes(r.key));
  const band = !!fit && visible.length <= INFO_FIT.band && visible.length <= fold;
  const [gen, setGen] = useState(0);
  const [fitted, setFitted] = useState<{ gen: number; cut: number; fill: boolean; tight?: boolean } | null>(null);
  const measuring = !!fit && !band && !open && fitted?.gen !== gen;
  const cut = !fit || band || open || measuring || !fitted ? Infinity : fitted.cut;
  const fill = !!fit && !band && !open && !measuring && !!fitted?.fill;
  const tight = fill && !!fitted?.tight;
  const folded = visible.length > Math.min(fold, cut) && !open;
  const shown = folded ? visible.slice(0, Math.min(fold, cut)) : visible;
  // re-fit when the column's width or the faces change (fonts land, window resizes)
  useEffect(() => {
    if (!fit) return;
    const bump = () => setGen((g) => g + 1);
    window.addEventListener('resize', bump);
    document.fonts?.addEventListener?.('loadingdone', bump);
    return () => { window.removeEventListener('resize', bump); document.fonts?.removeEventListener?.('loadingdone', bump); };
  }, [fit]);
  useEffect(() => { setGen((g) => g + 1); }, [fit, visible.length, fold]);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!measuring || !el || !fit) return;
    const rowEls = Array.from(el.querySelectorAll<HTMLElement>('.info-row'));
    const hs = rowEls.map((r) => r.offsetHeight);
    const total = el.offsetHeight;
    if (total <= fit) { setFitted({ gen, cut: Infinity, fill: total >= fit * INFO_FIT.fill }); return; }
    // a little over: the rows close up (INFO_FIT.tightPad each side instead of the spec's 10) first
    const save = 2 * (INFO_FIT.pad - INFO_FIT.tightPad);
    if (total - hs.length * save <= fit) { setFitted({ gen, cut: Infinity, fill: true, tight: true }); return; }
    const tight = hs.map((x) => x - save);
    const frame = total - hs.reduce((a, b) => a + b, 0);
    const data = Math.min(fold, visible.length);
    const more = Math.min(...tight.slice(0, data));
    let k = 0, sum = frame + more;
    while (k < data && sum + tight[k] <= fit) sum += tight[k++];
    setFitted({ gen, cut: Math.max(1, k), fill: true, tight: true });
  });
  const toggle = () => {
    const el = inner.current;
    if (!el) return;
    // MOTION-SPEC P0-4: no height animation — the box opens at once and the rows it gained rise in
    const had = el.querySelectorAll('.info-row').length - 1;
    setOpen(true);
    setH('auto');
    if (reduced()) return;
    requestAnimationFrame(() => {
      [...el.querySelectorAll<HTMLElement>('.info-row')].slice(had).forEach((r, i) => r.animate(
        [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
        { duration: DUR.pop, delay: Math.min(i, STAGGER_MAX) * DUR.stagger, easing: EASE.out, fill: 'backwards' },
      ));
    });
  };
  if (!visible.length) return null;
  return (
    <div
      className={`infobox info-expand ${band ? 'band' : ''} ${fill ? 'fill' : ''} ${tight ? 'tight' : ''}`} ref={inner}
      style={{ height: fill && h === 'auto' ? fit : h }}
    >
      <dl>
        {shown.map((r, i) => (
          <div className="info-row" key={r.key + i}>
            <dt>{r.key}</dt>
            <dd className={r.mono ? 'isbn' : ''}>{r.value}</dd>
          </div>
        ))}
        {folded && (
          <div className="info-row">
            <button className="info-more" onClick={toggle}>{foldLabel && cut >= fold ? foldLabel(visible.length - fold) : `全部 · ${visible.length}`}　›</button>
          </div>
        )}
      </dl>
    </div>
  );
}

/* ---------- List row (64 high, 40×60 thumb) ---------- */
/**
 * `onPick` turns the row into a choice (the category's 「选几部」): a tap picks, nothing opens.
 * On a touch screen a long press opens the same card as on the wall (open / see it on the whole wall).
 */
export function ListRow({ work, meta, date, index = 0, to, onPick, picked, aside }: {
  work: Work; meta?: string; date?: string; index?: number; to?: string; onPick?: () => void; picked?: boolean;
  /** an action in place of the date (a sibling of the link, never inside it) */
  aside?: React.ReactNode;
}) {
  const [w, h] = thumbSize(work);
  const nav = useNavigate();
  const [card, setCard] = useState<DOMRect | null>(null);
  const press = useRef<{ x: number; y: number; t: number; fired: boolean } | null>(null);
  const cancel = () => { if (press.current) window.clearTimeout(press.current.t); };
  const lp = onPick ? {} : {
    onPointerDown: (e: React.PointerEvent<HTMLAnchorElement>) => {
      if (e.pointerType !== 'touch') return;
      const el = e.currentTarget;
      cancel();
      press.current = { x: e.clientX, y: e.clientY, fired: false, t: window.setTimeout(() => {
        if (!press.current) return;
        press.current.fired = true;
        haptic('light');
        setCard(el.getBoundingClientRect());
      }, DUR.longPress) };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current;
      if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) { cancel(); press.current = null; }
    },
    onPointerUp: () => { cancel(); if (!press.current?.fired) press.current = null; },
    onPointerCancel: () => { cancel(); press.current = null; },
    onContextMenu: (e: React.MouseEvent) => { if (press.current) e.preventDefault(); },
  };
  const onClick = (e: React.MouseEvent) => {
    if (onPick) { e.preventDefault(); onPick(); return; }
    if (press.current?.fired) { e.preventDefault(); press.current = null; }
  };
  const close = () => setCard(null);
  const Wrap = aside ? 'div' : Fragment;
  return (
    <Wrap {...(aside ? { className: 'list-row-wrap' } : null)}>
      <Link
        to={to ?? `/entry/${work.id}`} className={`list-row ${onPick ? 'pickable' : ''} ${picked ? 'picked' : ''}`} style={staggerStyle(index)}
        onClick={onClick} {...lp} {...(onPick ? { role: 'checkbox', 'aria-checked': !!picked } : null)}
      >
        <Cover work={work} w={w} h={Math.min(h, 60)} paperPlaceholder />
        <div className="list-main">
          <span className="list-title ellipsis">{work.title}</span>
          <span className="list-meta ellipsis">{meta ?? [KIND_LABEL[work.kind], creatorLine(work)].filter(Boolean).join(' · ')}</span>
        </div>
        <span className="list-date">{aside ? '' : date ?? fmtMD(work.finished)}</span>
      </Link>
      {aside}
      {card && (
        <Preview anchor={card} onClose={close} actions={workActions(work, nav, close)}>
          <WorkPreviewBody work={work} meta={workMeta(work)} />
        </Preview>
      )}
    </Wrap>
  );
}

/* ---------- Rolling number: each digit rolls on its own, only when it changes (MOTION-SPEC P1-10) ----------
 * The one way a count changes anywhere. Digits are keyed from the right, so 99 → 100 rolls the ones and
 * tens in place and the new hundreds digit comes in, instead of every digit being replaced. */
export function RollingNumber({ value, className = '' }: { value: string; className?: string }) {
  const first = useRef(true);
  useEffect(() => { first.current = false; }, []);
  return (
    <span className={`roll ${className}`} aria-label={value}>
      {Array.from(value).map((ch, i) => {
        const d = Number(ch);
        if (Number.isNaN(d) || ch === ' ') return <span key={i} aria-hidden>{ch}</span>;
        return (
          <span key={`r${value.length - i}`} className="roll-digit" aria-hidden>
            <span className="roll-col" style={{ transform: `translateY(${-d * 10}%)`, transition: first.current ? 'none' : undefined }}>
              {'0123456789'.split('').map((x) => <span key={x}>{x}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/* ---------- Full-screen cover viewer (§3.3): pure black, one close button top right ---------- */
export function CoverViewer({ work, onClose }: { work: Work; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const done = useRef(onClose);
  done.current = onClose;
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') done.current(); };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); back?.focus?.(); };
  }, []);
  if (!work.cover) return null;
  return createPortal(
    <div
      className="viewer" role="dialog" aria-modal="true" aria-label={`《${work.title}》封面`}
      onClick={onClose} onKeyDown={(e) => { if (e.key === 'Tab') e.preventDefault(); }}
    >
      <button ref={closeBtn} className="icon-btn viewer-close" aria-label="关闭" onClick={onClose}><X strokeWidth={1.5} /></button>
      <img className="viewer-img" src={work.cover.medium} alt={work.title} onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}

/* ---------- Seal 「藏」 (16×16, 1px accent ring, radius 2) ---------- */
export function Seal() {
  return (
    <svg className="seal" viewBox="0 0 16 16" aria-hidden>
      <rect x="0.5" y="0.5" width="15" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
      <text x="8" y="11.6" textAnchor="middle" fontSize="10" fill="currentColor">藏</text>
    </svg>
  );
}

/**
 * Waiting (MOTION-SPEC P1-8): three dots darkening in turn, one step per --m-quick — nothing spins.
 * Where no words say what is happening, after 3 s it says 「还在读」 instead.
 */
export function Dots({ label, words = false }: { label?: string; words?: boolean }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!words) return;
    const t = window.setTimeout(() => setLate(true), DUR.dotsWords);
    return () => window.clearTimeout(t);
  }, [words]);
  if (late) return <span className="dots-late t-caption c-3" role="status">还在读</span>;
  return <span className="dots" {...(label ? { role: 'status', 'aria-label': label } : { 'aria-hidden': true })}><i /><i /><i /></span>;
}
