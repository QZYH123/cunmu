import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../data/store';
import type { ImportBatch } from '../data/persist';
import { fmtNum } from '../data/derive';
import { Sheet, Dots } from './Bits';
import { JSON_BACKUP_SAY } from '../data/backupImages';
import { buildExportZip } from '../lib/exportMd';
import { saveOut } from '../lib/saveOut';
import { DUR } from '../tokens';
import { afterAnimations, haptic } from '../lib/motion';

/** 「键在上、字在下」 (STYLE v0.4 §0.4): label on top, plain sentences under it, blocks split by --line-inner */
export function KeyBlocks({ blocks }: { blocks: { k: string; lines: ReactNode[] }[] }) {
  return (
    <div className="kv-group">
      {blocks.map((b) => (
        <div className="kv-block" key={b.k}>
          <div className="t-label c-3 kv-key">{b.k}</div>
          {b.lines.map((l, i) => <p key={i} className="t-small c-reading">{l}</p>)}
        </div>
      ))}
    </div>
  );
}

const Spin = () => <Dots />;

/** builds and hands over the ZIP (download on the web, the share sheet in the app); the count, 'cancelled', or null when it failed */
export function useExport() {
  const store = useStore();
  return async (): Promise<number | 'cancelled' | null> => {
    try {
      const own = store.library.filter((w) => !w.isSample);
      // your pictures as covers: on your own works, and the ones you put over a synced work's cover
      const photos = Object.fromEntries([
        ...store.extras.filter((w) => w.cover?.medium.startsWith('idb:')).map((w) => [w.id, w.cover!.medium]),
        ...Object.entries(store.notes).filter(([, n]) => n.coverOverride?.medium.startsWith('idb:')).map(([id, n]) => [id, n.coverOverride!.medium]),
      ]);
      const { blob, name, count } = await buildExportZip(own, store.exportBackup(), photos, store.title);
      return (await saveOut(blob, name)) === 'cancelled' ? 'cancelled' : count;
    } catch {
      return null;
    }
  };
}

/** 导出全部内容 (§3.18.1) — decided: your own pictures go in (case B), fetched covers never (a cover you set yourself is your picture) */
export function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const run = useExport();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => { if (open) { setBusy(false); setErr(false); } }, [open]);
  const go = async () => {
    setBusy(true); setErr(false);
    const [n] = await Promise.all([run(), new Promise((r) => setTimeout(r, DUR.readFile))]);
    setBusy(false);
    if (n === null) { setErr(true); return; }
    if (n === 'cancelled') return;   // the share sheet was closed: nothing happened, the sheet stays
    onClose();
    store.toast(`导出了 ${fmtNum(n as number)} 条`);
  };
  return (
    <Sheet open={open} onClose={onClose} label="导出全部内容" locked={busy}>
      <div className="sheet-body confirm">
        <h2 className="t-title">导出全部内容</h2>
        <KeyBlocks blocks={[
          { k: 'Markdown', lines: ['给自己读的。每部作品、每篇随笔一份，任何文本编辑器、笔记软件都能直接打开。'] },
          { k: 'JSON', lines: [JSON_BACKUP_SAY] },
          { k: '图片', lines: ['你自己加的图片、自己换上的封面会一起放进去。从别处带来的封面不放。'] },
        ]} />
        {err && <p className="t-small c-2 field-say">这次没导出来，再试一次。</p>}
        <div className="sheet-actions">
          <button className="btn btn-secondary" disabled={busy} onClick={go}>{busy ? <><Spin />正在整理</> : '导出'}</button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * 「按住删除」 (§3.18.3): a 1px ink line grows inside the button, evenly, for as long as you hold; it is the
 * time your hand has been down, not a task's progress — no track, no number. Let go early and it retracts.
 */
function HoldToDelete({ onDone, busy }: { onDone: () => void; busy: boolean }) {
  const line = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);
  const t0 = useRef(0);
  const [down, setDown] = useState(false);
  const [hint, setHint] = useState(false);
  const done = useRef(false);
  const set = (k: number, back = false) => {
    const el = line.current;
    if (!el) return;
    el.style.transition = back ? 'transform var(--m-quick) var(--e-in)' : 'none';
    el.style.transform = `scaleX(${k})`;
  };
  const start = () => {
    if (busy || done.current || raf.current) return;
    setDown(true); setHint(false);
    t0.current = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0.current) / DUR.hold);
      set(k);
      if (k >= 1) {
        raf.current = 0; done.current = true; setDown(false);
        onDone();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (!raf.current) return;
    cancelAnimationFrame(raf.current); raf.current = 0;
    setDown(false); setHint(true);
    set(0, true);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <>
      <button
        className={`btn btn-secondary hold-btn${down ? ' held' : ''}`}
        aria-label="删除全部内容，按住约 1.5 秒"
        disabled={busy}
        onPointerDown={(e) => { if (e.button === 0) { e.currentTarget.setPointerCapture?.(e.pointerId); start(); } }}
        onPointerUp={stop} onPointerCancel={stop}
        onPointerLeave={stop}
        onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }}
        onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') stop(); }}
        // focus that leaves mid-hold (another window, Tab) never sends the key up: the hold ends there, nothing is deleted
        onBlur={stop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="btn-danger-text hold-label">{busy ? <><Spin />正在删除</> : '按住删除'}</span>
        <span className="hold-line" ref={line} aria-hidden />
      </button>
      <p className={`t-caption c-3 hold-hint${hint ? ' on' : ''}`} aria-live="polite">{hint ? '要按住，约 1.5 秒' : ''}</p>
    </>
  );
}

/** 删除全部内容 (§3.18.2) */
export function DeleteAllSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const run = useExport();
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [scope, setScope] = useState<'all' | 'here'>('all');
  const [busy, setBusy] = useState(false);
  const [k, setK] = useState(0);
  useEffect(() => { if (open) { setExportedAt(null); setExporting(false); setScope('all'); setBusy(false); setK((x) => x + 1); } }, [open]);
  const exportFirst = async () => {
    setExporting(true);
    const n = await run();
    setExporting(false);
    if (typeof n === 'number') { const d = new Date(); setExportedAt(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); }
  };
  const doDelete = async () => {
    setBusy(true);
    const app = document.querySelector('.app');
    await new Promise((r) => setTimeout(r, DUR.place));
    app?.classList.add('app-out');
    await afterAnimations(app, DUR.fade);
    await store.deleteAll();
    // the one light tick says it is done — after the deleting, not when the hold ends
    haptic('light');
    onClose();
    requestAnimationFrame(() => app?.classList.remove('app-out'));
  };
  return (
    <Sheet open={open} onClose={onClose} label="删除全部内容" locked={busy}>
      <div className="sheet-body confirm" key={k}>
        <h2 className="t-title">删除全部内容</h2>
        {exportedAt
          ? <p className="t-caption c-3 confirm-first">已导出一份 · {exportedAt}</p>
          : <button className="btn-text confirm-first" disabled={exporting || busy} onClick={exportFirst}>{exporting ? <><Spin />正在整理</> : '先导出一份 ›'}</button>}
        <KeyBlocks blocks={[
          { k: '会删掉', lines: ['这台设备上的全部内容。', ...(store.icloud ? ['iCloud 里的副本。'] : []), '保存的 Bangumi 连接（用户名或令牌）和 Steam Web API Key。'] },
          { k: '删不到', lines: ['你之前导出的文件、手机备份里的副本，需要你自己处理。', 'Bangumi、Steam、微信读书上的记录不受影响。'] },
        ]} />
        {store.icloud && (
          <div className="radio-group" role="radiogroup" aria-label="删哪里">
            {([['all', '这台设备和 iCloud 里的'], ['here', '只删这台设备']] as const).map(([v, l]) => (
              <button key={v} className="radio-row" role="radio" aria-checked={scope === v} onClick={() => setScope(v)} disabled={busy}>
                <i className="radio" /> <span className="t-ui">{l}</span>
              </button>
            ))}
          </div>
        )}
        <div className="sheet-actions hold-actions">
          <HoldToDelete busy={busy} onDone={doDelete} />
          <button className="btn-text" disabled={busy} onClick={onClose}>先不删</button>
        </div>
      </div>
    </Sheet>
  );
}

/** 断开 Bangumi (§3.17.4): no solid button; only 「断开并删除」's words are --danger; no toast after */
export function DisconnectBangumiSheet({ open, onClose, count }: { open: boolean; onClose: () => void; count: number }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setBusy(false); }, [open]);
  const doing = store.doing.length;
  const token = store.connections.bangumi?.mode === 'token';
  const go = () => {
    setBusy(true);
    setTimeout(() => { store.disconnectBangumi(); onClose(); }, DUR.readFile);
  };
  return (
    <Sheet open={open} onClose={onClose} label="断开 Bangumi" locked={busy}>
      <div className="sheet-body confirm">
        <h2 className="t-title">断开 Bangumi</h2>
        <KeyBlocks blocks={[
          { k: '会删掉', lines: [`从 Bangumi 搬来的 ${fmtNum(count)} 部作品${doing ? `（包括在看的 ${doing} 部）` : ''}会从这里删掉，墙上只留下其他来源的东西。`] },
          { k: '会留下', lines: ['你写的短评、摘抄、随笔和改过的日期都会留着。以后重新连接，它们会自己回到原来的作品上。'] },
          { k: '为什么', lines: ['这是 Bangumi 对第三方 App 的要求。'] },
          { k: 'Bangumi 那边', lines: ['你在 Bangumi 上的标记都还在，Bangumi 那边不会有任何变化。'] },
        ]} />
        {store.icloud && <p className="t-small c-2 confirm-note">你其他苹果设备上的也会一起删掉。</p>}
        {token && <a className="infolink t-small confirm-note" href="https://next.bgm.tv/demo/access-token" target="_blank" rel="noreferrer">去 Bangumi 撤销令牌 ↗</a>}
        <div className="sheet-actions pair">
          <button className="btn btn-secondary" disabled={busy} onClick={go}><span className="btn-danger-text">{busy ? <><Spin />正在断开</> : '断开并删除'}</span></button>
          <button className="btn btn-secondary" disabled={busy} onClick={onClose}>先不断开</button>
        </div>
      </div>
    </Sheet>
  );
}

/** 撤销这次导入 (§3.16 屏 6) — decided: what you wrote on afterwards stays */
export function UndoImportSheet({ batch, onClose }: { batch: ImportBatch | null; onClose: () => void }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [b, setB] = useState<ImportBatch | null>(batch);
  useEffect(() => { if (batch) { setB(batch); setBusy(false); setErr(false); } }, [batch]);
  const go = () => {
    if (!b) return;
    setBusy(true);
    setTimeout(() => {
      const r = store.undoBatch(b.id);
      if (r.removed + r.kept === 0 && b.created.length + b.merged.length > 0 && !b.quoteIds.length) { setBusy(false); setErr(true); return; }
      onClose();
      if (b.provider === 'steam') store.toast('这次导入撤销了');
    }, DUR.readFile);
  };
  const created = b?.created.length ?? 0;
  const merged = b ? new Set(b.merged).size : 0;
  return (
    <Sheet open={!!batch} onClose={onClose} label="撤销这次导入" locked={busy}>
      <div className="sheet-body confirm">
        <h2 className="t-title">撤销这次导入</h2>
        <KeyBlocks blocks={[
          { k: '会删掉', lines: [b?.provider === 'weread_paste' ? `这次放进来的摘抄${created ? `和 ${created} 本书` : ''}会从这里删掉。你后来在上面写过东西的，会留着。` : `这次搬进来的 ${fmtNum(created)} 条会从这里删掉。你后来在上面写过东西的，会留着。`] },
          ...(merged && b?.provider === 'steam' ? [{ k: '会改回', lines: [`已经在这里的 ${fmtNum(merged)} 部，游戏时长改回这次导入之前的样子，作品留在墙上。`] }] : []),
          ...(merged && b?.provider !== 'weread_paste' && b?.provider !== 'steam' ? [{ k: '会改回', lines: [`和其他来源合在一起的 ${fmtNum(merged)} 部，只去掉豆瓣那部分，作品留在墙上。`] }] : []),
          { k: '不受影响', lines: ['在这次导入之前就在的作品，和其他来源搬来的东西。'] },
        ]} />
        {err && <p className="t-small c-2 field-say">没撤销掉，再试一次。</p>}
        <div className="sheet-actions pair">
          <button className="btn btn-secondary" disabled={busy} onClick={go}><span className="btn-danger-text">{busy ? <><Spin />正在撤销</> : '撤销导入'}</span></button>
          <button className="btn btn-secondary" disabled={busy} onClick={onClose}>先不撤销</button>
        </div>
      </div>
    </Sheet>
  );
}
