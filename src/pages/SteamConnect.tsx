import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useStore } from '../data/store';
import { fmtNum } from '../data/derive';
import { Sheet, Dots } from '../components/Bits';
import { ExplainList } from './Connect';
import { getSecret, setSecret } from '../lib/secrets';
import { parseOwnedGames, type SteamGame } from '../lib/steam';
import { readAchievements, readAppDetails, readOwnedGames, readProfile, resolveSteamUser, steamReachable, SteamError } from '../lib/steamNet';
import { openOutside } from '../lib/openOut';
import { clearSteamDraft, readSteamDraft, saveSteamDraft } from '../lib/steamDraft';
import type { SteamProfile } from '../lib/steam';
import { isNative, pickAccept } from '../lib/native';
import { DUR } from '../tokens';
import { withViewTransition } from '../lib/motion';

/** what went wrong, in plain words (a timeout is the common one from mainland China) */
const SAY: Record<SteamError['kind'], string> = {
  key: 'Steam 不认这个 Key。到 Steam 的 Key 页面重新复制完整的 Key，再试一次。',
  private: '读到了这个账号，但看不到游戏。到 Steam 隐私设置里，把「个人资料」和「游戏详情」设成公开再试。',
  net: '现在连不上 Steam，过一会儿再试。在国内，Steam 有时要多试几次。',
  user: '没找到这个账号。填个人资料页的链接、链接里 /id/ 后面的名字，或者 17 位的 SteamID64。',
};
const KEY_PAGE = 'https://steamcommunity.com/dev/apikey';

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
  // the account, checked on its public profile page as soon as it is typed (no key needed)
  const [who, setWho] = useState<{ q: string; p?: SteamProfile; looking?: boolean; err?: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    setErr(''); setBusy(false); setFound(null); setWho(null);
    // back from Steam's key page (the app may have been closed meanwhile): what was typed is still here
    setUser(readSteamDraft()?.user || conn?.vanity || conn?.steamId || '');
    void getSecret('steam-key').then((k) => setKey(k ?? ''));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const lookUp = async () => {
    const q = user.trim();
    if (!live || !q || who?.q === q) return;
    setWho({ q, looking: true });
    try {
      const p = await readProfile(q);
      setWho((w) => (w?.q === q ? { q, p } : w));
    } catch (e) {
      setWho((w) => (w?.q === q ? { q, err: SAY[e instanceof SteamError ? e.kind : 'net'] } : w));
    }
  };
  const editUser = (v: string) => { setUser(v); setErr(''); saveSteamDraft(v, false); };
  const openKeyPage = () => { saveSteamDraft(user, true); void openOutside(KEY_PAGE).catch(() => undefined); };
  const close = () => { clearSteamDraft(); onClose(); };

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
    if (games === 'private') { setErr(SAY.private); return; }
    if (!games) { setErr('这个文件读不出来。要的是 GetOwnedGames 返回的那份 JSON。'); return; }
    if (!games.length) { setErr(EMPTY_OWNED); return; }
    setErr('');
    setFound({ games, steamId: conn?.steamId ?? 'file' });
  };
  const played = found ? found.games.filter((g) => g.playtime_forever > 0).length : 0;
  const unplayed = found ? found.games.length - played : 0;
  // the first things in: the start page crossfades into 首页, which rises in (MOTION-SPEC P1-7)
  const bring = () => void withViewTransition(bringNow, 'page');
  const bringNow = () => {
    if (!found) return;
    if (live) void setSecret('steam-key', key.trim());
    clearSteamDraft();
    const r = store.applySteam({
      games: found.games, includeUnplayed: all,
      conn: { status: 'connected', steamId: found.steamId, includeUnplayed: all, ...(found.vanity ? { vanity: found.vanity } : null), lastOkSyncAt: new Date().toISOString(), ...(live ? { keyTail: key.trim().slice(-4) } : null) },
    });
    onClose();
    nav('/');
    setTimeout(() => store.toast(r.added ? `搬进来 ${fmtNum(r.added)} 部游戏${r.matched ? `，${fmtNum(r.matched)} 部已有的记上了时长` : ''}` : r.matched ? `${fmtNum(r.matched)} 部已有的游戏记上了时长` : '没有新的游戏'), DUR.place);
  };

  return (
    <Sheet open={open} onClose={close} label="从 Steam 搬进来">
      {!found && (
        <div className="sheet-body weread steam" key="ask">
          <h2 className="t-title">从 Steam 搬进来</h2>
          {live ? (
            <>
              <p className="t-small c-2 steam-lead">搬你玩过的游戏，连同时长，只从 Steam 读，不往回写。要两样：你的 Steam 个人资料，和一个你自己的 Web API Key。</p>
              <h3 className="label-head steam-step"><span className="ordinal">1</span>你的 Steam 个人资料</h3>
              <label className="key-field plain bgm-field steam-user">
                <input
                  value={user} onChange={(e) => editUser(e.target.value)} onBlur={() => void lookUp()}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void lookUp(); }}
                  placeholder="个人资料链接、自定义名字或 17 位数字" aria-label="Steam 个人资料"
                  autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
                />
                {who?.looking && <Dots label="正在查找" words />}
              </label>
              {who?.p && who.q === user.trim() ? (
                <p className="t-small c-2 field-say" role="status">
                  找到了：{who.p.name || who.p.steamId}。{who.p.isPublic ? '' : '这个账号的个人资料没有公开，读不到游戏：到 Steam 的隐私设置里，把「个人资料」和「游戏详情」设成公开。'}
                </p>
              ) : who?.err && who.q === user.trim() ? (
                <p className="t-small c-2 field-say" role="alert">{who.err}</p>
              ) : (
                <p className="t-caption c-3 field-say">在 Steam 里点头像 › 个人资料，复制页面地址，粘贴到这里。</p>
              )}

              <h3 className="label-head steam-step"><span className="ordinal">2</span>你的 Web API Key</h3>
              <ol className="steam-how t-small c-2">
                <li>打开 Steam 的申请页，登录。</li>
                <li>「域名」填 localhost，勾选同意条款，点「注册」。</li>
                <li>Steam 会要你在 Steam 手机应用的「确认」里同意一次。这是 Steam 的规定。</li>
                <li>复制页面上那串 32 位的 Key，回到这里粘贴。</li>
              </ol>
              <button className="btn btn-secondary steam-open" onClick={openKeyPage}>打开申请页</button>
              <p className="t-caption c-3 field-say">{isNative() ? '申请页开在存目里，关掉就回到这里；中途切到别的应用，填好的也还在。' : '申请页在浏览器里打开。拿到 Key，回到这里粘贴。'}</p>
              <label className="key-field steam-key">
                <input
                  className="key-mono" value={key} onChange={(e) => { setKey(e.target.value); setErr(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void read(); }}
                  placeholder="粘贴 Web API Key" spellCheck={false} autoCapitalize="off" autoComplete="off" aria-label="Steam Web API Key"
                />
                {busy && <Dots label="正在读取" words />}
              </label>
              <p className="t-caption c-3 key-note"><Lock size={12} strokeWidth={1.5} />Key 只存在这台设备上，不进导出文件</p>
              {err && <p className="t-small c-2 field-say" role="alert">{err}</p>}
              <div className="sheet-actions">
                <button className="btn btn-primary" disabled={!key.trim() || !user.trim() || busy} onClick={() => void read()}>读取游戏</button>
              </div>
            </>
          ) : (
            <>
              <ExplainList items={[
                { t: '搬你玩过的游戏，连同时长', d: '每部游戏记下总时长、最近两周玩了多久，日期按最后一次玩的那天记。没玩过的默认不搬。只从 Steam 读，不往回写。' },
                { t: 'Key 要你自己去拿', d: <>在 Steam 网页上登录、申请一个 Web API Key（域名填 localhost），复制回来。<a className="infolink" href={KEY_PAGE} target="_blank" rel="noreferrer">去 Steam 申请 ↗</a></> },
                { t: '个人资料要公开', d: '在 Steam 的隐私设置里，把「个人资料」和「游戏详情」设成公开，否则读不到游戏。' },
              ]} />
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

/** a saved list that parsed and has no games in it */
export const EMPTY_OWNED = '这份列表里没有游戏。账号的「游戏详情」没有公开时，列表会是空的。';

/** the web build cannot ask Steam; the row on 设置 says so (the word lives in this file) */
export const STEAM_WEB = '成就要在手机或电脑上的存目里读取。';

/** r21 the Steam row's words for the batch read (games only, STYLE v0.4 §3.19.8: 成就 allowed here) */
export const STEAM_ACH = {
  read: '读取全部游戏的成就',
  reading: (a: number, b: number) => `正在读成就 ${a} / ${b}`,
  done: (n: string) => `读好了 ${n} 部游戏的成就`,
};
