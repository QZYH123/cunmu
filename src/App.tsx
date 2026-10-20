import { PageRail } from './components/PageRail';
import { SteamSheet } from './pages/SteamConnect';
import { readSteamDraft } from './lib/steamDraft';
import { steamReachable } from './lib/steamNet';
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState } from 'react';
import { createHashRouter, Outlet, RouterProvider, ScrollRestoration, useLocation, useNavigate } from 'react-router-dom';
import { routeArrivals } from './lib/motion';
import { StoreProvider, useStore } from './data/store';
import { BangumiAgent } from './data/bangumiAgent';
import { KIND_LABEL, type Kind } from './data/types';
import { cnMonth } from './data/derive';
import { APP_NAME } from './lib/native';
import { DesktopBar, homeIsWall, TabBar, Toasts } from './components/Shell';
import Home from './pages/Home';
import MeHome from './pages/MeHome';
import { InterestPage, PeriodPage } from './pages/MePages';
import { WereadSheet, BangumiSheet } from './pages/Connect';
import { AddSheet } from './pages/Add';
import { DoubanSheet } from './components/DoubanSheet';
import { PaletteProvider } from './components/CommandPalette';
import { ContextPreview } from './components/ContextPreview';
import { ShowBar, useShowGuard } from './components/ShowMode';
import { Shortcuts } from './components/Shortcuts';

import FullWall from './pages/FullWall';
import Entry from './pages/Entry';
import Essay from './pages/Essay';
import Year from './pages/Year';
import Person from './pages/Person';
import Category from './pages/Category';
import IndexPage from './pages/IndexPage';
import SearchPage from './pages/Search';
import Me from './pages/Me';
import Organize from './pages/Organize';
const Privacy = lazy(() => import('./pages/About').then((m) => ({ default: m.Privacy })));
const Licenses = lazy(() => import('./pages/About').then((m) => ({ default: m.Licenses })));
import Editor from './pages/Editor';
import Writing from './pages/Writing';
import { Doing, Removed, Unknown } from './pages/Lists';

/** bangumi: 'token' opens on the token card, { user } reads that account at once; douban: a dropped backup file */
interface Sheets { weread: () => void; bangumi: (start?: unknown) => void; douban: (file?: unknown) => void; add: (query?: unknown) => void; steam: () => void }
const SheetCtx = createContext<Sheets>({ weread: () => {}, bangumi: () => {}, douban: () => {}, add: () => {}, steam: () => {} });
export const useSheets = () => useContext(SheetCtx);

/** the window title (VOICE v0.1 §3): home 「存目」 (or 「{名字} · 存目」 once named), elsewhere 「页面名 · 存目」 */
function useDocTitle() {
  const { pathname } = useLocation();
  const store = useStore();
  useEffect(() => {
    const [, a, b, c] = pathname.split('/').map(decodeURIComponent);
    const work = (id: string) => store.d.byId.get(id) ?? store.removedWorks.find((w) => w.id === id);
    let name = store.title?.trim() ?? '';
    if (a === 'entry' || a === 'essay') { const w = work(b); if (w) name = w.kind === 'essay' ? (w.title || '随笔') : `《${w.title}》`; }
    else if (a === 'year') name = c ? `${b} · ${cnMonth(Number(c))}` : b;
    else if (a === 'person') name = store.d.persons.get(b)?.name ?? '人物';
    else if (a === 'kind') name = KIND_LABEL[b as Kind] ?? '分类';
    else if (a === 'index') name = '索引';
    else if (a === 'search') name = '搜索';
    else if (a === 'wall') name = '整面墙';
    else if (a === 'doing') name = '在看';
    else if (a === 'unknown') name = '时间未知';
    else if (a === 'write') name = '写';
    else if (a === 'writing') name = '随笔';
    else if (a === 'me') name = b === 'removed' ? '移出的作品' : b === 'organize' ? '整理方式' : '设置';
    else if (a === 'settings') name = '设置';
    else if (a === 'all') name = '全部';
    else if (a === 'interest') name = store.me.interests.find((i) => i.id === b)?.name ?? '兴趣';
    else if (a === 'period') name = store.me.periods.find((p) => p.id === b)?.name ?? '时期';
    document.title = name ? `${name} · ${APP_NAME}` : APP_NAME;
  }, [pathname, store.d, store.removedWorks, store.title, store.me]);
}

/** r5 #3: files dropped anywhere on the window go to the 豆瓣 sheet — a backup is read, anything else shows that sheet's own error */
function useBackupDrop(onFiles: (files: File[]) => void) {
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      onFiles(files);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, [onFiles]);
}

function Layout() {
  useDocTitle();
  useShowGuard();
  const store = useStore();
  const navTo = useNavigate();
  const [open, setOpen] = useState<null | 'weread' | 'bangumi' | 'douban' | 'add' | 'steam'>(null);
  const [bgmStart, setBgmStart] = useState<'name' | 'token'>('name');
  const [bgmUser, setBgmUser] = useState('');
  const [backup, setBackup] = useState<File[] | null>(null);
  // 「添加《…》」 from a search that found nothing hands its words to the sheet (a click event is not a query)
  const [addQ, setAddQ] = useState('');
  const sheets: Sheets = {
    weread: () => setOpen('weread'),
    // a click event is not a start: only the string 'token' opens on the personal-token card
    bangumi: (start) => {
      setBgmStart(start === 'token' ? 'token' : 'name');
      setBgmUser(start && typeof start === 'object' && 'user' in start ? String((start as { user: string }).user) : '');
      setOpen('bangumi');
    },
    douban: (file) => {
      const files = file instanceof File ? [file] : Array.isArray(file) && file.every((f) => f instanceof File) ? file : null;
      setBackup(files);
      setOpen('douban');
    },
    add: (q) => { setAddQ(typeof q === 'string' ? q : ''); setOpen('add'); },
    steam: () => setOpen('steam'),
  };
  const close = () => setOpen(null);
  // the app was closed while the person was getting a Steam key: open 从 Steam 搬进来 again where they were
  useEffect(() => { if (steamReachable() && readSteamDraft()?.away) setOpen('steam'); }, []);
  const onBackup = useCallback((files: File[]) => { setBackup(files); setOpen('douban'); }, []);
  useBackupDrop(onBackup);
  return (
    <SheetCtx.Provider value={sheets}>
      <PaletteProvider onAdd={sheets.add}>
      <div className="app">
        <DesktopBar onPlus={sheets.add} onShow={() => { store.setShow(true); navTo('/'); window.scrollTo(0, 0); }} />
        <ShowBar />
        {/* the page itself (one main landmark; the box adds nothing to the layout) */}
        <main className="page-main"><Outlet /></main>
        <TabBar onPlus={sheets.add} />
        <PageRail />
        <Toasts />
        <ContextPreview />
        <Shortcuts onAdd={sheets.add} />
        <WereadSheet open={open === 'weread'} onClose={close} onManual={() => sheets.add()} />
        <BangumiSheet open={open === 'bangumi'} onClose={close} start={bgmStart} user={bgmUser} />
        <DoubanSheet open={open === 'douban'} onClose={close} file={backup} />
        <AddSheet open={open === 'add'} onClose={close} initial={addQ} />
        <SteamSheet open={open === 'steam'} onClose={close} />
      </div>
      </PaletteProvider>
      <ScrollRestoration getKey={(l) => l.key} />
    </SheetCtx.Provider>
  );
}

function HomeRoute() {
  const s = useSheets();
  const store = useStore();
  if (!homeIsWall(store)) return <MeHome />;
  return <Home onWeread={s.weread} onBangumi={s.bangumi} onAdd={s.add} />;
}
/** 全部: the cover wall and what is under it */
function AllRoute() {
  const s = useSheets();
  return <Home onWeread={s.weread} onBangumi={s.bangumi} onAdd={s.add} />;
}

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomeRoute /> },
      { path: '/all', element: <AllRoute /> },
      { path: '/interest/:id', element: <InterestPage /> },
      { path: '/period/:id', element: <PeriodPage /> },
      { path: '/settings', element: <Me /> },
      { path: '/wall', element: <FullWall /> },
      { path: '/entry/:id', element: <Entry /> },
      { path: '/essay/:id', element: <Essay /> },
      { path: '/year/:y', element: <Year /> },
      { path: '/year/:y/:m', element: <Year /> },
      { path: '/person/:id', element: <Person /> },
      { path: '/kind/:kind', element: <Category /> },
      { path: '/index/:tab', element: <IndexPage /> },
      { path: '/search', element: <SearchPage /> },
      { path: '/me', element: <Me /> },
      { path: '/me/organize', element: <Organize /> },
      { path: '/me/removed', element: <Removed /> },
      { path: '/me/privacy', element: <Suspense fallback={null}><Privacy /></Suspense> },
      { path: '/me/licenses', element: <Suspense fallback={null}><Licenses /></Suspense> },
      { path: '/doing', element: <Doing /> },
      { path: '/unknown', element: <Unknown /> },
      { path: '/write', element: <Editor /> },
      { path: '/writing', element: <Writing /> },
      { path: '*', element: <HomeRoute /> },
    ],
  },
]);

routeArrivals(router as unknown as Parameters<typeof routeArrivals>[0]);

export default function App() {
  return (
    <StoreProvider>
      <BangumiAgent />
      <RouterProvider router={router} />
    </StoreProvider>
  );
}
