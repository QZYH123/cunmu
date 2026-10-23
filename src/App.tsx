import { PageRail } from './components/PageRail';
import { SteamSheet } from './pages/SteamConnect';
import { readSteamDraft } from './lib/steamDraft';
import { steamReachable } from './lib/steamNet';
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState } from 'react';
import { createHashRouter, RouterProvider, ScrollRestoration, useLocation, useNavigate } from 'react-router-dom';
import { routeArrivals } from './lib/motion';
import { StoreProvider, useStore } from './data/store';
import { BangumiAgent } from './data/bangumiAgent';
import { APP_NAME } from './lib/native';
import { shownTo } from './data/me';
import { docTitle } from './data/visible';
import { useMeView } from './components/MeParts';
import { DesktopBar, homeIsWall, TabBar, Toasts } from './components/Shell';
import Home from './pages/Home';
import MeHome from './pages/MeHome';
import { InterestPage, PeriodPage } from './pages/MePages';
import { WereadSheet, BangumiSheet } from './pages/Connect';
import { AddSheet } from './pages/Add';
import { DoubanSheet } from './components/DoubanSheet';
import { PaletteProvider } from './components/CommandPalette';
import { ContextPreview } from './components/ContextPreview';
import { ShowBar, ShowOutlet, useShowGuard } from './components/ShowMode';
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
const CardSheet = lazy(() => import('./components/CardSheet'));
const Privacy = lazy(() => import('./pages/About').then((m) => ({ default: m.Privacy })));
const Licenses = lazy(() => import('./pages/About').then((m) => ({ default: m.Licenses })));
import Editor from './pages/Editor';
import Writing from './pages/Writing';
import { Doing, Removed, Unknown } from './pages/Lists';
import { decodePart } from './lib/decode';
import { isCunmuBackup } from './data/backupFile';

/** bangumi: 'token' opens on the token card, { user } reads that account at once; douban: a dropped backup file */
interface Sheets { weread: () => void; bangumi: (start?: unknown) => void; douban: (file?: unknown) => void; add: (query?: unknown) => void; steam: () => void }
const SheetCtx = createContext<Sheets>({ weread: () => {}, bangumi: () => {}, douban: () => {}, add: () => {}, steam: () => {} });
export const useSheets = () => useContext(SheetCtx);

/** the window title (VOICE v0.1 §3): home 「存目」 (or 「{名字} · 存目」 once named), elsewhere 「页面名 · 存目」 */
function useDocTitle() {
  const { pathname } = useLocation();
  const store = useStore();
  const view = useMeView();
  useEffect(() => {
    const [, a, b] = pathname.split('/').map(decodePart);
    const found = store.d.byId.get(b) ?? store.removedWorks.find((w) => w.id === b);
    const hiddenWork = store.show && (a === 'entry' || a === 'essay') && store.me.onlyMe.includes(b);
    const person = a === 'person' ? store.d.persons.get(b) : undefined;
    const personName = person && (!store.show || person.works.some(shownTo(store.me.onlyMe))) ? person.name : undefined;
    document.title = docTitle({
      pathname,
      libraryTitle: store.title?.trim() ?? '',
      appName: APP_NAME,
      show: store.show,
      onlyMe: store.me.onlyMe,
      interests: view.ctx.interests,
      periods: view.periods,
      personName,
      work: !hiddenWork && found && (a === 'entry' || a === 'essay') ? found : undefined,
    });
  }, [pathname, store.d, store.removedWorks, store.title, store.me, store.show, view]);
}

/** r5 #3: files dropped anywhere on the window go to the 豆瓣 sheet — a backup is read, anything else shows that sheet's own error;
 *  a 存目 backup goes to 从文件恢复 instead */
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
      if (files) void dropped(files); else { setBackup(null); setOpen('douban'); }
    },
    add: (q) => { setAddQ(typeof q === 'string' ? q : ''); setOpen('add'); },
    steam: () => setOpen('steam'),
  };
  const close = () => setOpen(null);
  // a 存目 backup goes to 设置 › 从文件恢复 (its own confirm); anything else to the 豆瓣 sheet
  async function dropped(files: File[]) {
    if (files.length === 1 && await isCunmuBackup(files[0])) { setOpen(null); navTo('/me', { state: { restoreFile: files[0] } }); return; }
    setBackup(files);
    setOpen('douban');
  }
  // the app was closed while the person was getting a Steam key: open 从 Steam 搬进来 again where they were
  useEffect(() => { if (steamReachable() && readSteamDraft()?.away) setOpen('steam'); }, []);
  // 给人看 changes nothing: a file dropped on the window is not taken in
  const onBackup = useCallback((files: File[]) => { if (store.show) return; void dropped(files); }, [store.show]); // eslint-disable-line react-hooks/exhaustive-deps
  useBackupDrop(onBackup);
  return (
    <SheetCtx.Provider value={sheets}>
      <PaletteProvider onAdd={() => sheets.add()}>
      <div className="app">
        <DesktopBar onPlus={sheets.add} onShow={() => { store.setShow(true); navTo('/'); window.scrollTo(0, 0); }} />
        <ShowBar />
        {/* the page itself (one main landmark; the box adds nothing to the layout) */}
        <main className="page-main"><ShowOutlet /></main>
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
      { path: '/card', element: <Suspense fallback={null}><CardSheet /></Suspense> },
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
