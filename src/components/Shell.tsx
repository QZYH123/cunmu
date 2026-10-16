import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, MoreHorizontal, Plus, Search } from 'lucide-react';
import { Menu } from './Bits';
import { useStore } from '../data/store';
import { afterAnimations, useScrolled } from '../lib/motion';
import { flyBack, flyableHero } from '../lib/backFlight';
import { DUR } from '../tokens';
import { usePalette } from './CommandPalette';

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

/** which place a path belongs to: 首页 (「我」 and its interests and periods), 随笔 (the list and the editor), 全部 (everything else you browse) */
export function placeOf(p: string): 'home' | 'all' | 'index' | 'writing' | 'search' | 'settings' | 'other' {
  if (p === '/' || p.startsWith('/interest') || p.startsWith('/period')) return 'home';
  if (p.startsWith('/index')) return 'index';
  if (p.startsWith('/search')) return 'search';
  if (p.startsWith('/settings') || p.startsWith('/me')) return 'settings';
  if (p.startsWith('/write') || p.startsWith('/writing')) return 'writing';
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
  const place = placeOf(p);
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
            <Link to="/" className={onHome ? 'on' : ''} aria-current={onHome ? 'page' : undefined}>首页</Link>
            <Link to="/all" className={onAll ? 'on' : ''} aria-current={onAll ? 'page' : undefined}>全部</Link>
            <Link to="/writing" className={onWriting ? 'on' : ''} aria-current={onWriting ? 'page' : undefined}>随笔</Link>
            <Link to="/index/people" className={onIndex ? 'on' : ''} aria-current={onIndex ? 'page' : undefined}>索引</Link>
          </nav>
        </div>
        <button className="desk-search" onClick={palette.open} aria-keyshortcuts={IS_MAC ? 'Meta+K /' : 'Control+K /'}>
          <Search strokeWidth={SW} />
          <span>搜索条目、人物、年份</span>
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
  const place = placeOf(loc.pathname);
  const home = place === 'home', all = place === 'all' || place === 'index', writing = place === 'writing';
  return (
    // r5 #9: words, not glyphs — a running footer in the serif; the ink ＋ stays the one primary action
    <nav className="tabbar" aria-label="主导航">
      <NavLink to="/" className={() => `tab ${home ? 'on' : ''}`} aria-current={home ? 'page' : undefined}><span>首页</span></NavLink>
      <NavLink to="/all" className={() => `tab ${all ? 'on' : ''}`} aria-current={all ? 'page' : undefined}><span>全部</span></NavLink>
      <button className="tab tab-plus" aria-label="收录" onClick={onPlus}><i><Plus strokeWidth={1.75} size={20} /></i></button>
      <NavLink to="/writing" className={() => `tab ${writing ? 'on' : ''}`} aria-current={writing ? 'page' : undefined}><span>随笔</span></NavLink>
      <NavLink to="/search" className={({ isActive }) => `tab ${isActive ? 'on' : ''}`}><span>搜索</span></NavLink>
    </nav>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  const t = toasts[0];
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!t) return;
    setLeaving(false);
    const a = setTimeout(() => setLeaving(true), DUR.toast);
    const b = setTimeout(() => dismissToast(t.id), DUR.toast + DUR.fade);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [t, dismissToast]);
  if (!t) return null;
  return (
    <div className="toast-wrap" role="status">
      <div className={`toast ${leaving ? 'leaving' : ''}`} key={t.id}>
        <span>{t.text}</span>
        {t.action && <button className="btn-text" onClick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</button>}
      </div>
    </div>
  );
}
