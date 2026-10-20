import { storage } from '../lib/storage';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, MoreHorizontal, Plus, Search } from 'lucide-react';
import { Menu } from './Bits';
import { useStore } from '../data/store';
import { afterAnimations, reduced, useScrolled } from '../lib/motion';
import { flyBack, flyableHero } from '../lib/backFlight';
import { DUR, EASE } from '../tokens';
import { usePalette } from './CommandPalette';
import { SEARCH_PLACEHOLDER } from '../lib/naming';

const SW = 1.5;

export function TopBar({ back = true, title, titleOn, sub, right, clear, hidden }: {
  back?: boolean; title?: string; titleOn?: boolean; sub?: string; right?: ReactNode; clear?: boolean; hidden?: boolean;
}) {
  const nav = useNavigate();
  const scrolled = useScrolled();
  return (
    <>
    <header className={`topbar ${scrolled && !clear ? 'scrolled' : ''} ${clear ? 'clear' : ''} ${hidden ? 'hidden' : ''}`}>
      <div>
        {back && (
          <button className="icon-btn" aria-label="返回" onClick={() => goBack(nav)}>
            <ChevronLeft strokeWidth={SW} />
          </button>
        )}
      </div>
      <div className="topbar-mid" aria-hidden={!titleOn}>
        {title && <div className={`topbar-title ellipsis ${titleOn ? 'on' : ''}`}>{title}</div>}
        {sub !== undefined && <SectionTicker text={sub} />}
      </div>
      <div className="topbar-right">{right}</div>
    </header>
    {/* ≥ 1024 the page bar gives way to DesktopBar; its page actions stay, inline at the top right. */}
    {right && <div className="desk-tools">{right}</div>}
    </>
  );
}

/**
 * Back. From an entry whose cover flew in, the cover flies back to where it came from (S2 return,
 * §7.3, 440ms). If that tile / cover is not on screen after the page restores, it is a plain
 * crossfade instead.
 */
export function goBack(nav: ReturnType<typeof useNavigate>) {
  const go = () => (history.state?.idx > 0 ? nav(-1) : nav('/'));
  const id = flyableHero();
  if (!id || !(history.state?.idx > 0)) { go(); return; }
  flyBack(id, go);
}

/** 首页 is 「我」 once there is something of yours; before that (and in the sample) the start with its imports */
export const homeIsWall = (s: { library: unknown[]; sample: { on: boolean } }) => !s.library.length || s.sample.on;

/** which place a path belongs to: 首页 (「我」 and its interests and periods), 随笔 (the list, an essay, and its editor), 全部 (everything else you browse).
 *  `/write?for=` is a note on a work, so it stays with 全部. */
export function placeOf(p: string, search = ''): 'home' | 'all' | 'index' | 'writing' | 'search' | 'settings' | 'other' {
  if (p === '/' || p.startsWith('/interest') || p.startsWith('/period')) return 'home';
  if (p.startsWith('/index')) return 'index';
  if (p.startsWith('/search')) return 'search';
  if (p.startsWith('/settings') || p.startsWith('/me')) return 'settings';
  if (p.startsWith('/essay') || p.startsWith('/writing')) return 'writing';
  if (p === '/write' || p.startsWith('/write/')) {
    const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    if (q.has('for')) return 'all';
    return 'writing';
  }
  return 'all';
}

export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * Desktop top bar (§8.2), ≥ 1024 only: the 存目 wordmark + 首页 / 全部 / 索引 · search with the ⌘K hint ·
 * 给人看 · ＋ 收录 · ··· (存成一张长图, 换首页封面, 设置). Over the cover wall its background fades in over the
 * first 80px of scroll; the wall starts below it.
 */
export function DesktopBar({ onPlus, onShow }: { onPlus: () => void; onShow?: () => void }) {
  const loc = useLocation();
  const nav = useNavigate();
  const store = useStore();
  const palette = usePalette();
  const p = loc.pathname;
  const place = placeOf(p, loc.search);
  const onHome = place === 'home', onAll = place === 'all', onIndex = place === 'index', onWriting = place === 'writing';
  const wall = p === '/all' || (p === '/' && homeIsWall(store));
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [o, setO] = useState(1);
  useEffect(() => {
    if (!wall) { setO(1); return; }
    const f = () => setO(Math.min(1, Math.max(0, window.scrollY / 80)));
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, [wall]);
  const mine = !homeIsWall(store);
  const items = [
    ...(mine && onShow ? [{ label: '存成一张长图', note: '给人看时的样子', run: () => nav('/', { state: { act: 'image' } }) }] : []),
    ...(mine ? [{ label: '换首页封面', run: () => nav('/', { state: { act: 'cover' } }) }] : []),
    { label: '设置', run: () => nav('/settings') },
  ];
  return (
    <header className="deskbar" style={{ '--bar-o': o } as React.CSSProperties}>
      <div className="deskbar-in">
        <div className="deskbar-left">
          <Link to="/" className="wordmark">存目</Link>
          <nav className="desk-nav" aria-label="主导航">
            <Link to="/" data-line="desk:home" className={onHome ? 'on' : ''} aria-current={onHome ? 'page' : undefined}>首页<DeskLine on={onHome} id="home" /></Link>
            <Link to="/all" data-line="desk:all" className={onAll ? 'on' : ''} aria-current={onAll ? 'page' : undefined}>全部<DeskLine on={onAll} id="all" /></Link>
            <Link to="/writing" data-line="desk:writing" className={onWriting ? 'on' : ''} aria-current={onWriting ? 'page' : undefined}>随笔<DeskLine on={onWriting} id="writing" /></Link>
            <Link to="/index/people" data-line="desk:index" className={onIndex ? 'on' : ''} aria-current={onIndex ? 'page' : undefined}>索引<DeskLine on={onIndex} id="index" /></Link>
          </nav>
        </div>
        <button className="desk-search" onClick={palette.open} aria-keyshortcuts={IS_MAC ? 'Meta+K /' : 'Control+K /'}>
          <Search strokeWidth={SW} />
          <span>{SEARCH_PLACEHOLDER}</span>
          <kbd className="kbd">{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <div className="deskbar-right">
          {mine && onShow && <button className="btn-text desk-show" onClick={onShow}>给人看</button>}
          <button className="pill-plus" onClick={onPlus}><Plus strokeWidth={1.75} />收录</button>
          <button className={`icon-btn desk-more ${place === 'settings' ? 'on' : ''}`} aria-label="更多" aria-haspopup="menu" aria-expanded={!!menu} onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}><MoreHorizontal strokeWidth={SW} /></button>
        </div>
        {menu && <Menu anchor={menu} onClose={() => setMenu(null)} items={items} label="更多" />}
      </div>
    </header>
  );
}

/** Current-section line under the title: old line fades up 60%, new one comes from below. */
function SectionTicker({ text }: { text: string }) {
  const [items, setItems] = useState<{ t: string; k: number; s: 'in-start' | '' | 'out' }[]>([]);
  const k = useRef(0);
  useEffect(() => {
    const key = ++k.current;
    setItems((xs) => [...xs.filter((x) => x.s !== 'out').map((x) => ({ ...x, s: 'out' as const })), ...(text ? [{ t: text, k: key, s: 'in-start' as const }] : [])]);
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setItems((xs) => xs.map((x) => (x.k === key ? { ...x, s: '' } : x)))));
    let live = true;
    void afterAnimations(document.querySelector('.topbar-sub'), DUR.fade).then(() => { if (live) setItems((xs) => xs.filter((x) => x.s !== 'out')); });
    return () => { live = false; cancelAnimationFrame(r); };
  }, [text]);
  if (!items.length) return null;
  return (
    <div className="topbar-sub">
      {items.map((x) => <span key={x.k} className={`ellipsis ${x.s}`}>{x.t}</span>)}
    </div>
  );
}

/** 首页 · 全部 · ＋ · 随笔 · 搜索 (CONCEPT v1, 随笔 r27); 设置 is under 首页's ··· */
export function TabBar({ onPlus }: { onPlus: () => void }) {
  const loc = useLocation();
  const place = placeOf(loc.pathname, loc.search);
  const home = place === 'home', all = place === 'all' || place === 'index', writing = place === 'writing', search = loc.pathname === '/search';
  return (
    // r5 #9: words, not glyphs — a running footer in the serif; the ink ＋ stays the one primary action
    <nav className="tabbar" aria-label="主导航">
      <NavLink to="/" className={() => `tab ${home ? 'on' : ''}`} aria-current={home ? 'page' : undefined}><span data-line="tab:home">首页<TabLine on={home} id="home" /></span></NavLink>
      <NavLink to="/all" className={() => `tab ${all ? 'on' : ''}`} aria-current={all ? 'page' : undefined}><span data-line="tab:all">全部<TabLine on={all} id="all" /></span></NavLink>
      <button className="tab tab-plus" aria-label="收录" onClick={onPlus}><i><Plus strokeWidth={1.75} size={20} /></i></button>
      <NavLink to="/writing" className={() => `tab ${writing ? 'on' : ''}`} aria-current={writing ? 'page' : undefined}><span data-line="tab:writing">随笔<TabLine on={writing} id="writing" /></span></NavLink>
      <NavLink to="/search" className={() => `tab ${search ? 'on' : ''}`}><span data-line="tab:search">搜索<TabLine on={search} id="search" /></span></NavLink>
    </nav>
  );
}

/**
 * The current item's hairline (P1-2). A route change is a cut, but the line slides over from the item it
 * left to the new one: one transform (translateX + scaleX from the left edge) on the compositor, no view
 * transition. It slides only when the old line went in the same commit (one item to another); arriving from
 * a page with no current item, or under reduced motion, it is simply there.
 */
const lastLine: Record<string, { id: string; gone: number }> = {};
function SlideLine({ group, id, className }: { group: string; id: string; className: string }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current, prev = lastLine[group];
    lastLine[group] = { id, gone: Infinity };
    if (el && prev && prev.id !== id && performance.now() - prev.gone < 100 && !reduced()) {
      const from = el.closest('nav')?.querySelector<HTMLElement>(`[data-line="${group}:${prev.id}"]`);
      const a = from?.getBoundingClientRect(), b = el.getBoundingClientRect();
      if (a && a.width && b.width) {
        el.animate([{ transform: `translateX(${a.left - b.left}px) scaleX(${a.width / b.width})` }, { transform: 'none' }],
          { duration: DUR.pop, easing: EASE.out });
      }
    }
    return () => { if (lastLine[group]?.id === id) lastLine[group].gone = performance.now(); };
  }, [group, id]);
  return <i ref={ref} className={className} aria-hidden />;
}
const TabLine = ({ on, id }: { on: boolean; id: string }) => (on ? <SlideLine group="tab" id={id} className="tab-line" /> : null);
const DeskLine = ({ on, id }: { on: boolean; id: string }) => (on ? <SlideLine group="desk" id={id} className="desk-line" /> : null);

/** the save could not be read: nothing this session writes is kept (lib/storage.ts), and that stays said */
export const SAVE_BLOCKED = '存档没能读出来。为了保护原有内容，这次打开期间的改动不会保存。';

/** a save that did not get written; gone once one does */
export const SAVE_FAILED = '最近的改动没能保存，设备的存储空间可能不够了。';

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  const t = toasts[0];
  const [leaving, setLeaving] = useState(false);
  const blocked = storage.isBlocked();
  const failing = useSyncExternalStore(storage.onFailingChange, storage.isFailing);
  useEffect(() => {
    if (!t) return;
    setLeaving(false);
    const a = setTimeout(() => setLeaving(true), DUR.toast);
    const b = setTimeout(() => dismissToast(t.id), DUR.toast + DUR.fade);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [t, dismissToast]);
  if (!t && !blocked && !failing) return null;
  return (
    <div className="toast-wrap">
      {t && (
        <div className={`toast ${leaving ? 'leaving' : ''}`} key={t.id} role="status">
          <span>{t.text}</span>
          {t.action && <button className="btn-text" onClick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</button>}
        </div>
      )}
      {blocked && <div className="toast save-blocked" role="alert"><span>{SAVE_BLOCKED}</span></div>}
      {failing && !blocked && <div className="toast save-blocked" role="alert"><span>{SAVE_FAILED}</span></div>}
    </div>
  );
}
