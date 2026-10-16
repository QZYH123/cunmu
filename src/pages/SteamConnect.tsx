import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader, Lock } from 'lucide-react';
import { useStore } from '../data/store';
import { fmtNum } from '../data/derive';
import { Sheet } from '../components/Bits';
import { ExplainList } from './Connect';
import { getSecret, setSecret } from '../lib/secrets';
import { parseOwnedGames, type SteamGame } from '../lib/steam';
import { readAchievements, readAppDetails, readOwnedGames, resolveSteamUser, steamReachable, SteamError } from '../lib/steamNet';
import { pickAccept } from '../lib/native';
import { DUR } from '../tokens';

/** what went wrong, in plain words (a timeout is the common one from mainland China) */
const SAY: Record<SteamError['kind'], string> = {
  key: 'Steam 没认这个 Key。去 Steam 网页上看一眼，复制完整再试。',
  private: '读到了这个账号，但看不到游戏。到 Steam 隐私设置里，把「个人资料」和「游戏详情」设成公开再试。',
  net: '现在连不上 Steam，过一会儿再试。在国内，Steam 有时要多试几次。',
  user: '没找到这个账号。填 17 位的 SteamID64，或者个人资料页的链接。',
};

/**
 * 从 Steam 搬进来 (r19): your games and how long you played them. The apps read Steam's Web API with your own
 * key (kept on this device only); a browser can't reach Steam, so on the web you open a saved
 * GetOwnedGames response instead. Played games come in by default; never-played ones only if asked.
 */
export function SteamSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const nav = useNavigate();
  const conn = store.connections.steam;
  const live = steamReachable();
  const [key, setKey] = useState('');
  const [user, setUser] = useState('');
  const [all, setAll] = useState(!!conn?.includeUnplayed);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [found, setFound] = useState<{ games: SteamGame[]; steamId: string; vanity?: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setErr(''); setBusy(false); setFound(null);
    setUser(conn?.vanity ?? conn?.steamId ?? '');
    void getSecret('steam-key').then((k) => setKey(k ?? ''));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = async () => {
    if (!key.trim() || !user.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      const u = await resolveSteamUser(key.trim(), user);
      const games = await readOwnedGames(key.trim(), u.steamId);
      setFound({ games, ...u });
    } catch (e) {
      setErr(SAY[e instanceof SteamError ? e.kind : 'net']);
    } finally { setBusy(false); }
  };
  const readFile = async (f: File) => {
    const games = parseOwnedGames(await f.text().catch(() => ''));
    if (!games) { setErr('这个文件读不出来。要的是 GetOwnedGames 返回的那份 JSON。'); return; }
    if (!games.length) { setErr(SAY.private); return; }
    setErr('');
    setFound({ games, steamId: conn?.steamId ?? 'file' });
  };
  const played = found ? found.games.filter((g) => g.playtime_forever > 0).length : 0;
  const unplayed = found ? found.games.length - played : 0;
  const bring = () => {
    if (!found) return;
    if (live) void setSecret('steam-key', key.trim());
    const r = store.applySteam({
      games: found.games, includeUnplayed: all,
      conn: { status: 'connected', steamId: found.steamId, includeUnplayed: all, ...(found.vanity ? { vanity: found.vanity } : null), lastOkSyncAt: new Date().toISOString(), ...(live ? { keyTail: key.trim().slice(-4) } : null) },
    });
    onClose();
    nav('/');
    setTimeout(() => store.toast(r.added ? `搬进来 ${fmtNum(r.added)} 部游戏${r.matched ? `，${fmtNum(r.matched)} 部已有的记上了时长` : ''}` : r.matched ? `${fmtNum(r.matched)} 部已有的游戏记上了时长` : '没有新的游戏'), DUR.place);
  };

  return (
    <Sheet open={open} onClose={onClose} label="从 Steam 搬进来">
      {!found && (
        <div className="sheet-body weread steam" key="ask">
          <h2 className="t-title">从 Steam 搬进来</h2>
          <ExplainList items={[
            { t: '搬你玩过的游戏，连同时长', d: '每部游戏记下总时长、最近两周玩了多久，日期按最后一次玩的那天记。没玩过的默认不搬。只从 Steam 读，不往回写。' },
            { t: 'Key 要你自己去拿', d: <>在 Steam 网页上登录、申请一个 Web API Key（域名随便填），复制回来。<a className="infolink" href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">去 Steam 申请 ↗</a></> },
            { t: '个人资料要公开', d: '在 Steam 的隐私设置里，把「个人资料」和「游戏详情」设成公开，否则读不到游戏。' },
          ]} />
          {live ? (
            <>
              <label className="key-field">
                <input
                  className="key-mono" value={key} onChange={(e) => { setKey(e.target.value); setErr(''); }}
                  placeholder="粘贴 Web API Key" spellCheck={false} autoCapitalize="off" autoComplete="off" aria-label="Steam Web API Key"
                />
              </label>
              <p className="t-caption c-3 key-note"><Lock size={12} strokeWidth={1.5} />只存在这台设备上，不进导出文件</p>
              <label className="key-field plain bgm-field">
                <input
                  value={user} onChange={(e) => { setUser(e.target.value); setErr(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void read(); }}
                  placeholder="SteamID64 或个人资料链接" aria-label="SteamID64 或个人资料链接"
                  autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
                />
                {busy && <Loader className="spin" size={16} strokeWidth={1.5} aria-label="正在读取" />}
              </label>
              {err ? <p className="t-small c-2 field-say" role="alert">{err}</p> : <p className="t-caption c-3 field-say">个人资料页地址里 /profiles/ 后面的 17 位数字，或 /id/ 后面的名字都行。</p>}
              <div className="sheet-actions">
                <button className="btn btn-secondary" disabled={!key.trim() || !user.trim() || busy} onClick={() => void read()}>读取游戏</button>
              </div>
            </>
          ) : (
            <>
              <p className="t-small c-2 field-say">网页版连不上 Steam（Steam 不让网页直接读）。在手机或电脑上的存目里可以直接连；这里可以打开一份存好的游戏列表：在浏览器里打开 GetOwnedGames 的地址，把结果存成 .json。</p>
              {err && <p className="t-small c-2 field-say" role="alert">{err}</p>}
              <div className="sheet-actions">
                <button className="btn btn-secondary" onClick={() => file.current?.click()}>打开 JSON 文件</button>
              </div>
              <input ref={file} type="file" hidden accept={pickAccept('.json,application/json')} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readFile(f); }} />
            </>
          )}
        </div>
      )}
      {found && (
        <div className="sheet-body weread found" key="found">
          <div className="t-numeral">{fmtNum(all ? found.games.length : played)}</div>
          <p className="t-ui found-sub">部游戏，可以搬进来</p>
          {unplayed > 0 && (
            <label className="steam-all t-small c-2">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
              没玩过的 {fmtNum(unplayed)} 部也搬
            </label>
          )}
          <p className="t-small c-3 found-more">已经有的同名游戏不会再多一部，只记上时长。</p>
          <div className="sheet-actions">
            <button className="btn btn-primary" onClick={bring}>搬进来</button>
            <button className="btn-text" onClick={() => setFound(null)}>换一个账号</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** 再读一次 from 设置 › 来源: the same read with the key kept on this device; false = the sheet is needed */
export async function runSteamSync(store: ReturnType<typeof useStore>): Promise<'sheet' | { ok: true; added: number } | { ok: false; say: string }> {
  const c = store.connections.steam;
  const key = await getSecret('steam-key');
  if (!c || !key || !steamReachable() || c.steamId === 'file') return 'sheet';
  try {
    const games = await readOwnedGames(key, c.steamId);
    const r = store.applySteam({ games, includeUnplayed: !!c.includeUnplayed, conn: { ...c, status: 'connected', lastOkSyncAt: new Date().toISOString(), problem: undefined } });
    return { ok: true, added: r.added };
  } catch (e) {
    const k = e instanceof SteamError ? e.kind : 'net';
    store.setSteamProblem(k === 'user' ? 'private' : k);
    return { ok: false, say: SAY[k] };
  }
}

/**
 * r20 读取每部游戏的记录: every game with Steam time, one after another (steamNet spaces the requests), its
 * achievements and the store's facts; a game read in the last `fresh` days is skipped. Stops at the first
 * refusal (a key or privacy problem would fail every game the same way).
 */
export async function runSteamDetails(store: ReturnType<typeof useStore>, onStep: (done: number, total: number) => void, fresh = 7): Promise<{ read: number; say?: string }> {
  const c = store.connections.steam;
  const key = await getSecret('steam-key');
  if (!c || !key || !steamReachable()) return { read: 0, say: '先在这台设备上连上 Steam' };
  const cut = Date.now() - fresh * 86400000;
  const todo = store.library.filter((w) => w.play && !w.isSample && !(w.play.ach && Date.parse(w.play.ach.at) > cut));
  let n = 0;
  for (const w of todo) {
    onStep(n, todo.length);
    try {
      const ach = await readAchievements(key, c.steamId, w.play!.appid);
      const facts = await readAppDetails(w.play!.appid).catch(() => null);
      store.learnSteam(w.id, { ...(ach ? { ach } : null), ...(facts ? { store: facts } : null) });
      n++;
    } catch (e) {
      const k = e instanceof SteamError ? e.kind : 'net';
      if (k !== 'net') return { read: n, say: SAY[k] };
    }
  }
  onStep(n, todo.length);
  return { read: n };
}

/** r21 the Steam row's words for the batch read (games only, STYLE v0.4 §3.19.8: 成就 allowed here) */
export const STEAM_ACH = {
  read: '读取全部游戏的成就',
  reading: (a: number, b: number) => `正在读成就 ${a} / ${b}`,
  done: (n: string) => `读好了 ${n} 部游戏的成就`,
};
