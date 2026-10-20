import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { isBackupFormat, LEGACY_EXPORT, TIERS, useStore, type Theme } from '../data/store';
import type { ImportBatch } from '../data/persist';
import { useSheets } from '../App';
import { countCrossRefs, fmtNum, fmtYMD } from '../data/derive';
import { Seg, Sheet } from '../components/Bits';
import { DeleteAllSheet, DisconnectBangumiSheet, ExportSheet, KeyBlocks, UndoImportSheet } from '../components/DataSheets';
import { useEnterClass } from '../lib/motion';
import { readZip } from '../lib/zip';
import { getImage, putImage } from '../lib/images';
import { missingImageIds, referencedImageIds, restoreNotice } from '../data/backupImages';
import { STEAM_OFF_DROPS, STEAM_OFF_KEEPS } from '../data/steamOff';
import { DEFAULT_TITLE, TITLE_MAX, titleOf } from '../lib/naming';
import { MiniRow } from '../components/YearMini';
import { useElementWidth } from '../lib/useWidth';
import { SHELF } from '../tokens';
import { DEMO } from '@demo';
import { APP_NAME, APP_NAME_EN, APP_VERSION, isDesktop, pickAccept, platform } from '../lib/native';
import { FEEDBACK_EMAIL, ISSUES_URL } from '../config';
import { copyText, diagnosticsText } from '../lib/diagnostics';
import { coverCacheStats } from '../lib/coverCache';
import { storage } from '../lib/storage';
import type { Kind } from '../data/types';
import { runBangumiSync } from '../data/bangumiAgent';
import { BANGUMI_FILE_NO_TOKEN, STEAM_FILE_NO_KEY } from '../data/restore';
import { steamReachable } from '../lib/steamNet';
import { runSteamDetails, runSteamSync, STEAM_ACH, STEAM_WEB } from './SteamConnect';
import { TopBar } from '../components/Shell';
import { AboutYou } from '../components/AboutYou';

const ymdLong = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`; };
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1} 月 ${d.getDate()} 日`; };
const DAY = 86400000;

/** a setting row with its quiet caption lines and text-button actions under it (STYLE v0.4 §0.4) */
function Row({ name, right, onClick, disabled, captions = [], actions = [], mono }: {
  name: string; right?: React.ReactNode; onClick?: () => void; disabled?: boolean;
  captions?: React.ReactNode[]; actions?: { label: string; run: () => void }[]; mono?: number;
}) {
  const head = onClick
    ? <button className="me-row" onClick={onClick} disabled={disabled}><span className="t-ui">{name}</span>{right}</button>
    : <div className="me-row"><span className="t-ui">{name}</span>{right}</div>;
  return (
    <div className={`me-item${disabled ? ' is-off' : ''}`}>
      {head}
      {captions.map((c, i) => <p key={i} className={`t-caption c-3 me-cap${mono === i ? ' key-mono-caption' : ''}`}>{c}</p>)}
      {actions.length > 0 && (
        <div className="me-actions">{actions.map((a) => <button key={a.label} className="btn-text" onClick={a.run}>{a.label}</button>)}</div>
      )}
    </div>
  );
}
/**
 * The name, set like a title on a copyright page (r5 #4): it reads as type, not as a form, until it is
 * touched. Enter or leaving keeps it; Esc puts it back; an empty name is the plain default again.
 */
function TitleField() {
  const store = useStore();
  const [draft, setDraft] = useState<string | null>(null);
  const cancel = useRef(false);
  const shown = draft ?? titleOf(store.title);
  return (
    <>
      <input
        className="colophon-title" value={shown} aria-label="名字" spellCheck={false} autoComplete="off" enterKeyHint="done"
        onFocus={(e) => { setDraft(shown); e.currentTarget.select(); }}
        onChange={(e) => setDraft([...e.target.value].slice(0, TITLE_MAX).join(''))}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { cancel.current = true; e.currentTarget.blur(); }
        }}
        onBlur={() => {
          if (!cancel.current && draft !== null) store.setTitle(draft.trim() === DEFAULT_TITLE ? '' : draft);
          cancel.current = false;
          setDraft(null);
        }}
      />
    </>
  );
}

const Go = ({ label = '连接' }: { label?: string }) => <span className="t-caption c-3 me-go">{label} <ChevronRight size={16} strokeWidth={1.5} /></span>;

export default function Me() {
  const store = useStore();
  const { d, library, weread } = store;
  const sheets = useSheets();
  const enter = useEnterClass();
  const [confirm, setConfirm] = useState(false);
  const [alsoBooks, setAlsoBooks] = useState(false);
  const [layer, setLayer] = useState<null | 'export' | 'delete' | 'bgm-off' | 'steam-off'>(null);
  const [undo, setUndo] = useState<ImportBatch | null>(null);
  const restoreFile = useRef<HTMLInputElement>(null);
  const sample = store.sample.on;
  const own = library.filter((w) => !w.isSample);
  const refs = useMemo(() => countCrossRefs(library.filter((w) => !w.isSample), d, new Set(store.unlinked)), [library, d, store.unlinked]);
  const bangumiCount = own.filter((w) => w.source === 'bangumi').length;
  const wereadCount = own.filter((w) => w.source === 'weread').length;
  const bgm = store.connections.bangumi;
  const lastOf = (p: ImportBatch['provider']) => store.batches.find((b) => b.provider === p && !b.undoneAt) ?? null;
  const douban = lastOf('douban_xlsx');
  const paste = lastOf('weread_paste');
  const batchCount = (b: ImportBatch) => new Set([...b.created, ...b.merged]).size;

  // r19 the Steam row: how many games came, when it last read, what stopped it; 再读一次 with the kept key
  const steam = store.connections.steam;
  const steamCount = own.filter((w) => w.source === 'steam').length;
  const [steamBusy, setSteamBusy] = useState(false);
  const steamAgain = async () => {
    if (steamBusy) return;
    setSteamBusy(true);
    const r = await runSteamSync(store);
    setSteamBusy(false);
    if (r === 'sheet') sheets.steam();
    else if (r.ok) store.toast(r.added ? `读了一次：多了 ${fmtNum(r.added)} 部游戏` : '读了一次：时长更新了，没有新的游戏');
    else store.toast(r.say);
  };
  // r20 every game's Steam record (what it has of yours, how rare) and the store's facts, spaced out
  const [detailStep, setDetailStep] = useState<[number, number] | null>(null);
  const readDetails = async () => {
    if (detailStep) return;
    setDetailStep([0, 0]);
    const r = await runSteamDetails(store, (a, b) => setDetailStep([a, b]));
    setDetailStep(null);
    store.toast(r.say ?? (r.read ? STEAM_ACH.done(fmtNum(r.read)) : '都是最近读过的'));
  };
  const steamRow = steam ? (
    <Row
      name="Steam" right={<span className="t-caption c-3 tnum">{fmtNum(steamCount)} 部</span>}
      captions={[
        ...(steam.lastOkSyncAt ? [`上次读取：${ymdLong(steam.lastOkSyncAt)}`] : []),
        ...(steam.problem === 'key' ? ['Key 用不了了，换一个就能接着读。搬进来的都还在。'] : steam.problem === 'absent' ? [STEAM_FILE_NO_KEY] : steam.problem === 'private' ? ['读不到游戏：Steam 上的「游戏详情」可能不是公开的。'] : steam.problem === 'net' ? ['上次没连上 Steam，过一会儿再试。'] : []),
        ...(!steamReachable() ? [STEAM_WEB] : []),
      ]}
      actions={[
        { label: steamBusy ? '正在读取' : '再读一次', run: () => void steamAgain() },
        ...(steamReachable() ? [{ label: detailStep ? STEAM_ACH.reading(detailStep[0], detailStep[1]) : STEAM_ACH.read, run: () => void readDetails() }] : []),
        { label: '断开 Steam', run: () => setLayer('steam-off') },
      ]}
    />
  ) : <Row name="Steam" right={<Go label="连接" />} onClick={sheets.steam} captions={['只搬游戏，连同时长']} />;

  // the Bangumi row (§3.17.3): the expiry shows only within 14 days, here and nowhere else
  const [syncing, setSyncing] = useState(false);
  const syncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    const r = await runBangumiSync(store);
    setSyncing(false);
    if (r.ok) store.toast(r.added ? `同步了一次：多了 ${fmtNum(r.added)} 部` : '同步了一次：没有新的');
    else store.toast(r.problem === 'token' ? '令牌用不了了，换一个就能接着同步' : r.problem === 'gone' ? '这次没读到收藏，搬进来的都还在' : '现在连不上 Bangumi，过一会儿再试');
  };
  let bgmRow: React.ReactNode;
  if (!DEMO && store.bangumiOn && bgm) {
    // app: what the last sync said, in plain words; a token's expiry can't be read, so a 401 says it
    const caps: React.ReactNode[] = [bgm.mode === 'token' ? `个人令牌 ••••${bgm.tokenTail ?? ''}` : `用户名 ${bgm.username} · 读公开收藏`];
    if (bgm.problem === 'token') caps.splice(0, 1, '令牌用不了了，可能到期了，也可能在 Bangumi 上删掉了。同步先停着，搬进来的都还在。');
    else if (bgm.problem === 'absent') caps.splice(0, 1, BANGUMI_FILE_NO_TOKEN);
    else if (bgm.problem === 'gone') caps.push('这次没读到这个用户名的公开收藏（改了名，或者设成了私密）。搬进来的都还在。');
    else if (bgm.problem === 'net') caps.push('上次没连上 Bangumi，下次打开时再试。');
    else if (bgm.lastOkSyncAt) caps.push(syncing ? '正在同步' : `上次同步 ${md(bgm.lastOkSyncAt)}`);
    const acts: { label: string; run: () => void }[] = [];
    if (bgm.problem === 'token') acts.push({ label: '换一个令牌', run: () => sheets.bangumi('token') });
    else if (bgm.problem === 'absent') acts.push({ label: '填一个令牌', run: () => sheets.bangumi('token') });
    else acts.push({ label: syncing ? '正在同步' : '同步一次', run: () => void syncNow() });
    if (bgm.problem === 'gone' && bgm.mode === 'public') acts.push({ label: '用个人令牌连接', run: () => sheets.bangumi('token') });
    else if (bgm.mode === 'public' && bgm.problem !== 'token') acts.push({ label: '用个人令牌连接', run: () => sheets.bangumi('token') });
    else if (bgm.mode === 'token' && bgm.problem !== 'token' && bgm.problem !== 'absent') acts.push({ label: '改用用户名', run: () => sheets.bangumi() });
    acts.push({ label: '断开 Bangumi', run: () => setLayer('bgm-off') });
    bgmRow = (
      <Row
        name="Bangumi" right={<span className="t-caption c-3 tnum">{fmtNum(bangumiCount)} 部</span>}
        captions={caps} mono={bgm.mode === 'token' && bgm.problem !== 'token' && bgm.problem !== 'absent' ? 0 : undefined} actions={acts}
      />
    );
  } else if (!store.bangumiOn) {
    bgmRow = <Row name="Bangumi" right={<Go />} onClick={() => sheets.bangumi()} captions={store.bangumiStash ? ['你在 Bangumi 作品上写的都收着，重新连接后回到原处。'] : []} />;
  } else if (bgm?.mode === 'token') {
    const exp = bgm.tokenExpiresAt ? new Date(bgm.tokenExpiresAt).getTime() : Infinity;
    const left = exp - Date.now();
    const caps: React.ReactNode[] = [`个人令牌 ••••${bgm.tokenTail || '3f9a'}`];
    if (left <= 0) caps.splice(0, 1, `令牌 ${md(bgm.tokenExpiresAt!)}到期了，同步先停着。搬进来的都还在。`);
    else if (left <= 14 * DAY) caps.push(`令牌 ${md(bgm.tokenExpiresAt!)}到期`);
    bgmRow = (
      <Row
        name="Bangumi" right={<span className="t-caption c-3 tnum">{fmtNum(bangumiCount)} 部</span>}
        captions={caps} mono={left > 0 ? 0 : undefined}
        actions={[
          left <= 14 * DAY ? { label: '换一个令牌', run: () => sheets.bangumi('token') } : { label: '改用用户名', run: () => sheets.bangumi() },
          { label: '断开 Bangumi', run: () => setLayer('bgm-off') },
        ]}
      />
    );
  } else {
    bgmRow = (
      <Row
        name="Bangumi" right={<span className="t-caption c-3 tnum">{fmtNum(bangumiCount)} 部</span>}
        captions={[`用户名 ${bgm?.username || 'sakura'} · 读公开收藏`]}
        actions={[{ label: '用个人令牌连接', run: () => sheets.bangumi('token') }, { label: '断开 Bangumi', run: () => setLayer('bgm-off') }]}
      />
    );
  }

  // 从文件恢复 replaces what is here: read the file first, and when there is something of yours to lose, ask
  const [pending, setPending] = useState<{ json: unknown; images: [string, Blob][]; count: number } | null>(null);
  const applyRestore = async (p: { json: unknown; images: [string, Blob][]; count: number }) => {
    setPending(null);
    try {
      for (const [id, blob] of p.images) await putImage(id, blob);
      if (!(await store.importBackup(p.json))) throw new Error('format');
      const want = referencedImageIds(p.json);
      const onDevice: string[] = [];
      for (const id of want) {
        if (p.images.some(([x]) => x === id)) continue;
        if (await getImage(id)) onDevice.push(id);
      }
      const missing = missingImageIds(want, p.images.map(([id]) => id), onDevice);
      const base = p.count ? `恢复了 ${fmtNum(p.count)} 条` : '恢复好了';
      store.toast(restoreNotice(base, missing.length > 0));
    } catch {
      store.toast('这个文件读不出来，换一个存目导出的文件再试');
    }
  };
  const restore = async (f: File) => {
    try {
      let json: unknown;
      const images: [string, Blob][] = [];
      if (/\.zip$/i.test(f.name)) {
        const files = await readZip(await f.arrayBuffer());
        const j = files.get('cunmu.json') ?? files.get(LEGACY_EXPORT.json);
        if (!j) throw new Error('no json');
        json = JSON.parse(new TextDecoder().decode(j));
        for (const [name, bytes] of files) {
          const m = name.match(/^图片\/(.+)\.jpg$/);
          if (m) images.push([m[1], new Blob([bytes as BlobPart], { type: 'image/jpeg' })]);
        }
      } else json = JSON.parse(await f.text());
      const j = json as { format?: string; works?: { kind?: string }[] } | null;
      if (!j || !isBackupFormat(j.format) || !Array.isArray(j.works)) throw new Error('format');
      const p = { json, images, count: j.works.length };
      if (own.length && !sample) setPending(p); else await applyRestore(p);
    } catch {
      store.toast('这个文件读不出来，换一个存目导出的文件再试');
    }
  };

  const noExport = !own.length || sample;

  // 关于 → 复制诊断信息: counts and settings only (lib/diagnostics.ts says what is left out)
  const diag = () => {
    const kinds: Partial<Record<Kind, number>> = {};
    for (const w of own) kinds[w.kind] = (kinds[w.kind] ?? 0) + 1;
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    return diagnosticsText({
      app: APP_NAME_EN, version: APP_VERSION,
      platform: isDesktop() ? 'windows（桌面应用）' : platform() === 'web' ? '网页' : platform(),
      userAgent: navigator.userAgent,
      screen: { w: screen.width, h: screen.height, dpr: Math.round(devicePixelRatio * 100) / 100 },
      theme: store.theme === 'system' ? `跟随系统（${dark ? '深色' : '浅色'}）` : store.theme === 'dark' ? '深色' : '浅色',
      kinds, doing: store.doing.length, removed: store.removedWorks.length, people: d.persons.size, years: d.years.size,
      bangumi: !store.bangumiOn || !bgm ? 'off' : bgm.mode === 'token' ? 'token' : 'public',
      bangumiProblem: bgm?.problem ?? null, lastSync: bgm?.lastOkSyncAt ?? null,
      imports: {
        douban: store.batches.filter((b) => b.provider === 'douban_xlsx' && !b.undoneAt).length,
        wereadPaste: store.batches.filter((b) => b.provider === 'weread_paste' && !b.undoneAt).length,
      },
      saveBytes: storage.lastBytes(), covers: coverCacheStats(),
      reduceMotion: store.reduceMotion, fontScale: store.fontScale,
    });
  };
  const [diagShown, setDiagShown] = useState<string | null>(null);
  // a WebView that refuses the clipboard: the text in a sheet, selected, to copy by hand
  const copyDiag = async () => { const t = diag(); if (await copyText(t)) store.toast('诊断信息复制好了，可以贴进反馈里'); else setDiagShown(t); };
  const feedbackHref = FEEDBACK_EMAIL
    ? `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} 反馈`)}&body=${encodeURIComponent(`\n\n\n——\n${APP_NAME} ${APP_VERSION} · ${isDesktop() ? 'windows' : platform()}`)}`
    : ISSUES_URL;
  const [head, headW] = useElementWidth<HTMLElement>();
  return (
    <div className="page under-bar settings-page">
      <TopBar title="设置" titleOn />
      <div className={`page-x me-page ${enter}`}>
        {/* r5 #4: 我 opens on its own copyright page — the collection's name, what it holds, when it began,
            under a small row of the works themselves (r7: spines or covers, as 索引 · 年份 is set); the settings follow as short sections */}
        <header className="colophon" ref={head}>
          <h1 className="sr-only">设置</h1>
          {own.length > 0 && headW > 0 && (
            <Link to="/wall" className="colophon-row-link" aria-label={`${fmtNum(own.length)} 条，看整面墙`}>
              <MiniRow
                works={own} align="center" className="colophon-row" titled={store.yearView === 'spines'}
                h={store.yearView === 'spines'
                  ? (headW >= SHELF.mini.wideAt ? SHELF.mini.shelfWide : SHELF.mini.shelf)
                  : (headW >= SHELF.mini.wideAt ? SHELF.mini.colophonWide : SHELF.mini.colophon)}
              />
            </Link>
          )}
          <TitleField />
          {/* while the name is being set, its one rule takes the place of the figures under it */}
          <div className="colophon-under">
          <p className="t-caption c-3 colophon-hint">写上你的名字，或者给它起个名字。最多 {TITLE_MAX} 个字；空着，就是「{DEFAULT_TITLE}」</p>
          <div className="colophon-lines">
            {!sample && own.length > 0 ? (
              <>
                {/* only a number that counts real mentions; none yet, no clause (FEEDBACK 2026-10-10 §3.8) */}
                <p>收录 {fmtNum(own.length)} 条{refs > 0 ? ` · 互相提到 ${fmtNum(refs)} 处` : ''}</p>
                {d.startedAt && <p>始于 {fmtYMD(d.startedAt)}</p>}
              </>
            ) : <p>{sample ? '现在看到的是示例内容' : '还没有收录'}</p>}
          </div>
          </div>
        </header>

        {!sample && <AboutYou />}

        <section className="me-group">
          <div className="label-head me-label">来源</div>
          {bgmRow}
          {weread.connected ? (
            <Row
              name="微信读书" right={<span className="key-mono-caption c-3">wrk-••••{weread.keyTail}</span>}
              actions={[{ label: '断开并删除授权码', run: () => { setAlsoBooks(false); setConfirm(true); } }]}
            />
          ) : (
            <Row
              name="微信读书" right={<Go label={DEMO ? undefined : "粘贴笔记"} />} onClick={sheets.weread}
              captions={paste ? [`上次粘贴：${ymdLong(paste.createdAt)} · ${fmtNum(paste.quoteIds.length)} 条摘抄`] : []}
              actions={paste ? [{ label: '撤销这次导入', run: () => setUndo(paste) }] : []}
            />
          )}
          {steamRow}
          <Row
            name="豆瓣备份" right={<Go label="导入" />} onClick={sheets.douban}
            captions={douban ? [`上次导入：${ymdLong(douban.createdAt)} · ${fmtNum(batchCount(douban))} 条`] : []}
            actions={douban ? [{ label: '撤销这次导入', run: () => setUndo(douban) }] : []}
          />
        </section>

        {/* 保管: what keeps it safe, as one line of words — four rows of chevrons said less */}
        <section className="me-group">
          <div className="label-head me-label">保管</div>
          <div className="me-keep">
            <button className="btn-text" onClick={() => setLayer('export')} disabled={noExport}>导出全部内容</button>
            <button className="btn-text" onClick={() => restoreFile.current?.click()}>从文件恢复</button>
            {store.removedWorks.length > 0 && <Link to="/me/removed" className="btn-text">移出的作品</Link>}
          </div>
          <p className="t-caption c-3 me-keep-cap">
            {sample ? '示例内容不会导出。' : !own.length ? '放进第一部作品以后就能导出。' : <><span className="phrase">导出是 Markdown + JSON，</span><span className="phrase">连同你自己加的图片，</span><span className="phrase">放在你自己手里。</span></>}
          </p>
          <input ref={restoreFile} type="file" hidden accept={pickAccept(".zip,.json,application/zip,application/json")} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f); }} />
        </section>

        <section className="me-group">
          <div className="label-head me-label">整理与显示</div>
          <Link to="/me/organize" className="me-row">
            <span className="t-ui">整理方式</span>
            <ChevronRight className="chev" size={18} strokeWidth={1.5} />
          </Link>
          {/* iCloud sync is not built yet: the prototype's remembered switch stays in the demo build only */}
          {DEMO && (
            <button className="me-row" onClick={() => store.setIcloud(!store.icloud)} role="switch" aria-checked={!!store.icloud}>
              <span className="t-ui">用 iCloud 在我的苹果设备间同步</span>
              <i className={`switch ${store.icloud ? 'on' : ''}`} />
            </button>
          )}
          <div className="me-row me-theme">
            <span className="t-ui">外观</span>
            <Seg<Theme>
              options={[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]}
              value={store.theme}
              onChange={store.setTheme}
              ariaLabel="外观"
            />
          </div>
          <button className="me-row" onClick={() => store.setReduceMotion(!store.reduceMotion)} role="switch" aria-checked={store.reduceMotion}>
            <span className="t-ui">减少动效</span>
            <i className={`switch ${store.reduceMotion ? 'on' : ''}`} />
          </button>
          <button className="me-row" onClick={() => store.setFontScale(store.fontScale === 1 ? 1.25 : 1)} role="switch" aria-checked={store.fontScale !== 1}>
            <span className="t-ui">大字号</span>
            <i className={`switch ${store.fontScale !== 1 ? 'on' : ''}`} />
          </button>
        </section>

        <section className="me-group">
          <div className="label-head me-label">关于</div>
          <Link to="/me/privacy" className="me-row"><span className="t-ui">隐私说明</span><ChevronRight className="chev" size={18} strokeWidth={1.5} /></Link>
          <Link to="/me/licenses" className="me-row"><span className="t-ui">开源许可</span><ChevronRight className="chev" size={18} strokeWidth={1.5} /></Link>
          <a className="me-row" href={feedbackHref} target="_blank" rel="noreferrer">
            <span className="t-ui">反馈</span><span className="t-caption c-3 me-go">{FEEDBACK_EMAIL ? '写邮件' : 'GitHub'} <ChevronRight size={16} strokeWidth={1.5} /></span>
          </a>
          <button className="me-row" onClick={() => void copyDiag()}>
            <span className="t-ui">复制诊断信息</span><span className="t-caption c-3">不含你收录的内容</span>
          </button>
        </section>

        {DEMO && <details className="me-group me-dev">
          <summary className="label-head me-label">原型调试</summary>
          <p className="t-small c-2 me-note">假数据条数（首页也可以连点三下刊头打开）</p>
          <div className="dev-tiers">
            {TIERS.map((t) => (
              <button key={t} className={store.tier === t && !store.extras.length ? 'on' : ''} onClick={() => store.setTier(t)}>{fmtNum(t)}</button>
            ))}
          </div>
          <button className="me-row" onClick={() => store.setDataset(store.dataset === 'real' ? 'mixed' : 'real')} role="switch" aria-checked={store.dataset === 'real'}>
            <span className="t-ui">真实封面优先</span>
            <i className={`switch ${store.dataset === 'real' ? 'on' : ''}`} />
          </button>
          {store.bangumiOn && bgm?.mode === 'token' && (
            <div className="me-actions">
              <button className="btn-text" onClick={() => store.devTokenExpiry(11)}>令牌 11 天后到期</button>
              <button className="btn-text" onClick={() => store.devTokenExpiry(-1)}>令牌已到期</button>
              <button className="btn-text" onClick={() => store.devTokenExpiry(365)}>令牌一年后到期</button>
            </div>
          )}
          {store.bangumiOn && (
            <div className="me-actions">
              <button className="btn-text" onClick={() => { const n = store.syncBangumi(); store.toast(n ? '同步了一次：多了 1 部看过' : '同步了一次：没有新的'); }}>模拟一次 Bangumi 同步</button>
            </div>
          )}
        </details>}

        {/* ink, not --danger: the warning colour stays out of the first layer (v0.3 colour rule 3); it sits
            apart, at the foot, where nothing is tapped on the way to something else */}
        <div className="me-end">
          <button className="btn-text quiet" onClick={() => setLayer('delete')} disabled={sample}>删除全部内容</button>
        </div>

        <footer className="copyright">
          <p>{APP_NAME} · 版本 {APP_VERSION}</p>
          {/* the name, once, where someone looking for it would look (r10) */}
          <p className="copyright-note">「存目」取自《四库全书》：没有收进全文的书，只留下书名和一段提要。</p>
        </footer>
      </div>

      <ExportSheet open={layer === 'export'} onClose={() => setLayer(null)} />
      <DeleteAllSheet open={layer === 'delete'} onClose={() => setLayer(null)} />
      <DisconnectBangumiSheet open={layer === 'bgm-off'} onClose={() => setLayer(null)} count={bangumiCount} />
      <UndoImportSheet batch={undo} onClose={() => setUndo(null)} />

      <Sheet open={diagShown !== null} onClose={() => setDiagShown(null)} label="诊断信息">
        <div className="sheet-body">
          <h2 className="t-title">诊断信息</h2>
          <p className="t-small c-2" style={{ marginTop: 'var(--s-3)' }}>没能自动复制。长按下面的文字，全选后复制。</p>
          <textarea className="diag-text" readOnly value={diagShown ?? ''} rows={10} onFocus={(e) => e.currentTarget.select()} aria-label="诊断信息" />
          <div className="sheet-actions"><button className="btn btn-secondary" onClick={() => setDiagShown(null)}>关闭</button></div>
        </div>
      </Sheet>

      <Sheet open={!!pending} onClose={() => setPending(null)} label="用这个文件换掉现在的内容">
        <div className="sheet-body">
          <h2 className="t-title">用这个文件换掉现在的内容？</h2>
          <p className="t-small c-2 restore-say">现在的 {fmtNum(own.length)} 条会换成文件里的 {fmtNum(pending?.count ?? 0)} 条。想留一份现在的，先导出。</p>
          <div className="sheet-actions pair">
            <button className="btn btn-secondary" onClick={() => pending && void applyRestore(pending)}><span className="btn-danger-text">换掉</span></button>
            <button className="btn btn-secondary" onClick={() => setPending(null)}>先不换</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={layer === 'steam-off'} onClose={() => setLayer(null)} label="断开 Steam">
        <div className="sheet-body">
          <h2 className="t-title">断开 Steam</h2>
          <KeyBlocks blocks={[
            { k: '会删掉', lines: [...STEAM_OFF_DROPS] },
            { k: '会留下', lines: [STEAM_OFF_KEEPS] },
          ]} />
          <div className="sheet-actions pair">
            <button className="btn btn-secondary" onClick={() => { store.disconnectSteam(); setLayer(null); store.toast('断开了。搬进来的游戏还在'); }}><span className="btn-danger-text">断开</span></button>
            <button className="btn btn-secondary" onClick={() => setLayer(null)}>先不断开</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={confirm} onClose={() => setConfirm(false)} label="断开微信读书">
        <div className="sheet-body">
          <h2 className="t-title">断开微信读书</h2>
          <p className="t-small c-2" style={{ marginTop: 'var(--s-3)' }}>授权码会从这台手机上删除，之后不再读取。已经搬进来的 {wereadCount} 本书默认留着。</p>
          <button className="me-row" onClick={() => setAlsoBooks(!alsoBooks)} role="switch" aria-checked={alsoBooks} style={{ marginTop: 'var(--s-5)' }}>
            <span className="t-ui">同时删除已搬进来的书</span>
            <i className={`switch ${alsoBooks ? 'on' : ''}`} />
          </button>
          <div className="sheet-actions pair">
            <button className="btn btn-secondary" onClick={() => { store.disconnectWeread(alsoBooks); setConfirm(false); }}><span className="btn-danger-text">断开并删除授权码</span></button>
            <button className="btn btn-secondary" onClick={() => setConfirm(false)}>先不断开</button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
