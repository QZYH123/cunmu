import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader, Lock } from 'lucide-react';
import { useStore } from '../data/store';
import { DEMO, WEREAD_BATCH, doingFor, masterFor } from '@demo';
import { fmtNum } from '../data/derive';
import type { Quote } from '../data/types';
import { todayISO } from '../lib/today';
import { BgmError, DONE, DOING, KIND_OF, planSync, type BgmCollection, type BgmUser, type SyncResult } from '../lib/bangumi';
import { bgmClient } from '../lib/bangumiNet';
import { setBangumiToken } from '../lib/secrets';
import { Sheet } from '../components/Bits';
import { DUR } from '../tokens';

type Step = 'explain' | 'key' | 'found' | 'manual';

interface Pasted { title: string; author?: string; quotes: Quote[] }
/**
 * WeRead's 「复制笔记」 text: 《书名》, the author, 「N个笔记」, then ◆ chapter lines and >> highlights.
 * Several books can follow each other. Plain paragraphs under a 《书名》 count as highlights too.
 */
export function parseWeread(text: string, date: string): Pasted[] {
  const out: Pasted[] = [];
  let cur: Pasted | null = null;
  let where: string | undefined;
  let afterTitle = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const t = line.match(/^《(.+?)》\s*$/);
    if (t) { cur = { title: t[1].trim(), quotes: [] }; out.push(cur); where = undefined; afterTitle = 1; continue; }
    if (!cur) continue;
    if (/^\d+\s*个笔记$/.test(line)) { afterTitle = 0; continue; }
    if (afterTitle === 1 && !/^(◆|>>|>)/.test(line)) { cur.author = line; afterTitle = 0; continue; }
    afterTitle = 0;
    if (line.startsWith('◆')) { where = line.replace(/^◆\s*/, '') || undefined; continue; }
    const q = line.replace(/^>+\s*/, '');
    if (q) cur.quotes.push({ text: q, where, date });
  }
  return out.filter((b) => b.title);
}

/**
 * 连接微信读书 (§3.12). Prototype only: nothing leaves the page — the key is never sent anywhere,
 * "validation" is a local format check, and the 86 books are fake.
 */
export function WereadSheet({ open, onClose, onManual }: { open: boolean; onClose: () => void; onManual: () => void }) {
  const store = useStore();
  const nav = useNavigate();
  const [step, setStep] = useState<Step>('explain');
  const [key, setKey] = useState('');
  const [checking, setChecking] = useState(false);
  const [hint, setHint] = useState('');
  const [paste, setPaste] = useState('');
  useEffect(() => { if (open) { setStep(DEMO ? 'explain' : 'manual'); setKey(''); setHint(''); setChecking(false); setPaste(''); } }, [open]);

  // 手动导入: the highlights go into each book's 摘抄 — onto the book if it is already here, else with a
  // new one (时间未知: a paste carries no date). One batch, undoable from 「我」
  const importPaste = () => {
    const books = parseWeread(paste, todayISO()).filter((b) => b.quotes.length);
    if (!books.length) { setHint('认不出是哪本书。第一行写上《书名》就行。'); return; }
    const { first, quotes: n } = store.importPaste(books);
    onClose();
    if (books.length === 1) nav(`/entry/${first}`);
    store.toast(books.length === 1 ? `《${books[0].title}》多了 ${n} 条摘抄` : `${books.length} 本书多了 ${n} 条摘抄`);
  };

  const verify = () => {
    const k = key.trim();
    if (!/^wrk-[A-Za-z0-9_-]{6,}$/.test(k)) { setHint('Key 一般是 wrk- 开头的一串字母和数字'); return; }
    setHint('');
    setChecking(true);
    setTimeout(() => { setChecking(false); setStep('found'); }, DUR.verifyKey);
  };

  return (
    <Sheet open={open} onClose={onClose} label="连接微信读书">
      {step === 'explain' && (
        <div className="sheet-body weread" key="explain">
          <h2 className="t-title"><span className="phrase">连接微信读书之前，</span><span className="phrase">先说清三件事</span></h2>
          <ol className="weread-list">
            <li>
              <span className="ordinal">1</span>
              <div>
                <p className="t-ui w-600">Key 要你自己去拿</p>
                <p className="t-small c-2">在微信读书官方页面获取个人 API Key（wrk- 开头）。<a className="infolink" href="https://weread.qq.com/" target="_blank" rel="noreferrer">去官方页面 ↗</a></p>
              </div>
            </li>
            <li>
              <span className="ordinal">2</span>
              <div>
                <p className="t-ui w-600">Key 只存在这台手机上</p>
                <p className="t-small c-2">不会上传到我们的服务器。换手机要重新填。</p>
              </div>
            </li>
            <li>
              <span className="ordinal">3</span>
              <div>
                <p className="t-ui w-600 c-ink">有一定风险</p>
                <p className="t-small c-reading risk">这个 Key 是微信读书给个人使用的授权，官方没有写明是否允许第三方 App 使用。社区里有过同步后账号被封的报告，原因不明。如果担心，可以改用手动导入。</p>
              </div>
            </li>
          </ol>
          <div className="sheet-actions">
            <button className="btn btn-secondary" onClick={() => setStep('key')}>我了解，继续</button>
            <button className="btn btn-secondary" onClick={() => setStep('manual')}>改用手动导入</button>
          </div>
        </div>
      )}

      {step === 'key' && (
        <div className="sheet-body weread" key="key">
          <h2 className="t-title">粘贴你的 Key</h2>
          <label className="key-field">
            <input
              className="key-mono"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="wrk-…"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              aria-label="微信读书 API Key"
            />
            {checking && <Loader className="spin" size={16} strokeWidth={1.5} aria-label="正在验证" />}
          </label>
          <p className="t-caption c-3 key-note"><Lock size={12} strokeWidth={1.5} />只存在这台手机上</p>
          {hint && <p className="t-small c-2">{hint}</p>}
          <div className="sheet-actions">
            <button className="btn btn-secondary" onClick={verify} disabled={checking}>验证</button>
            {DEMO && <button className="btn-text" onClick={() => setKey('wrk-demo7c21e03f9a')}>原型里用示例 Key</button>}
          </div>
        </div>
      )}

      {step === 'found' && (
        <div className="sheet-body weread found" key="found">
          <div className="t-numeral">86</div>
          <p className="t-ui">本书，可以搬进来</p>
          <p className="t-small c-2" style={{ marginTop: 'var(--s-3)' }}>在读和读完的书、阅读时长、划线和想法会一起进来，划线放进每本书的「摘抄」。</p>
          <div className="sheet-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                store.connectWeread(key.trim().slice(-4));
                store.importWorks(WEREAD_BATCH, '搬进来');
                onClose();
                nav('/');
              }}
            >搬进来</button>
          </div>
        </div>
      )}

      {step === 'manual' && (
        <div className="sheet-body weread" key="manual">
          <h2 className="t-title">手动导入</h2>
          <p className="t-small c-2" style={{ marginTop: 'var(--s-3)' }}>可以一本本搜书添加，也可以把从微信读书复制出来的笔记粘贴到这里，划线会放进那本书的「摘抄」。</p>
          <textarea className="paste" placeholder={'《书名》\n作者\n\n◆ 章节\n>> 划线'} rows={5} value={paste} onChange={(e) => { setPaste(e.target.value); setHint(''); }} aria-label="粘贴划线和想法" />
          {hint && <p className="t-small c-2">{hint}</p>}
          <div className="sheet-actions">
            {paste.trim()
              ? <button className="btn btn-secondary" onClick={importPaste}>放进来</button>
              : <button className="btn btn-secondary" onClick={() => { onClose(); onManual(); }}>搜书添加</button>}
            <button className="btn btn-secondary" onClick={onClose}>先这样</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** the explanation card's numbered list (STYLE v0.4 §0.4 「说明卡」; no 2px rule outside WeRead's risk) */
export function ExplainList({ items }: { items: { t: string; d: ReactNode }[] }) {
  return (
    <ol className="weread-list">
      {items.map((it, i) => (
        <li key={i}>
          <span className="ordinal">{i + 1}</span>
          <div>
            <p className="t-ui w-600">{it.t}</p>
            <p className="t-small c-2">{it.d}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

type BgmStep = 'name' | 'token-explain' | 'token' | 'found';
/** what a connect would bring in, from the demo catalogue (the demo build) */
export function bangumiCounts(store: ReturnType<typeof useStore>) {
  const master = masterFor(store.dataset);
  const done = store.tier === 0 ? master.filter((w) => w.id.startsWith('bgm-') && w.source === 'bangumi').length : master.slice(0, store.tier).filter((w) => w.source === 'bangumi').length;
  return { done, doing: doingFor(store.dataset).length };
}

/** what Bangumi said, read and planned, waiting for 「搬进来」 (app build) */
interface Found { user: BgmUser; plan: SyncResult; token?: string }
const countable = (items: BgmCollection[]) => items.filter((c) => (c.type === DONE || c.type === DOING) && KIND_OF[c.subject_type]);
const sayError = (e: unknown, via: 'public' | 'token') => {
  const code = e instanceof BgmError ? e.code : 'net';
  if (code === 'gone') return '没找到这个用户名。它在你 Bangumi 个人主页地址的最后一段。';
  if (code === 'token') return via === 'token' ? '这个令牌用不了，可能已经过期，或者复制时少了几位。' : '这个用户名下的收藏读不到。如果设成了私密，可以用个人令牌。';
  if (code === 'busy') return 'Bangumi 现在有点忙，过一会儿再试。';
  return '现在连不上 Bangumi，过一会儿再试。';
};

/**
 * 从 Bangumi 搬进来 (STYLE v0.4 §3.17.1 / §3.17.2).
 * App build: the username's public collections (or, with a personal token, all of them) are read from
 * api.bgm.tv, page by page, and planned (lib/bangumi.ts) before anything changes; 「搬进来」 applies it.
 * Demo build: nothing is fetched — the demo catalogue stands in; try the usernames 「offline」 and
 * 「private」 to see the errors.
 */
export function BangumiSheet({ open, onClose, start = 'name', user = '' }: { open: boolean; onClose: () => void; start?: 'name' | 'token'; user?: string }) {
  const store = useStore();
  const nav = useNavigate();
  const [step, setStep] = useState<BgmStep>('name');
  const [via, setVia] = useState<'public' | 'token'>('public');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const run = useRef(0);
  useEffect(() => {
    if (!open) { run.current++; return; }
    setStep(start === 'token' ? 'token-explain' : 'name'); setVia(start === 'token' ? 'token' : 'public');
    setName(user); setToken(''); setBusy(false); setErr(''); setProgress(null); setFound(null);
    // a pasted profile link (收录 → 「读取收藏」): the name is known, so the reading starts at once
    if (user && start !== 'token') read(user);
  }, [open, start]); // eslint-disable-line react-hooks/exhaustive-deps
  const demoCounts = bangumiCounts(store);
  const done = DEMO ? demoCounts.done : found?.plan.pull.done.length ?? 0;
  const doing = DEMO ? demoCounts.doing : found?.plan.pull.doing.length ?? 0;

  /** app: read everything, then plan it against what is here (same account: its dates stay) */
  async function fetchAll(who: () => Promise<BgmUser>, how: 'public' | 'token', tok?: string) {
    const mine = ++run.current;
    setBusy(true); setErr(''); setProgress(null);
    try {
      const u = await who();
      const items = await bgmClient(tok).collections(u.username, (got, total) => { if (run.current === mine) setProgress([got, total]); });
      if (run.current !== mine) return;
      if (!countable(items).length) {
        setErr(how === 'token' ? '这个账号下还没有「看过」和「在看」。' : '这个用户名下没有公开的『看过』。如果收藏设成了私密，可以用个人令牌。');
        return;
      }
      const b = store.connections.bangumi;
      const same = b?.userId === u.id && store.bangumi;
      const plan = planSync(same ? store.bangumi! : null, items, { epoch: b?.epoch ?? 1, now: new Date().toISOString(), prevSyncAt: same ? b?.lastOkSyncAt : undefined });
      setFound({ user: u, plan, token: tok });
      setVia(how);
      setStep('found');
    } catch (e) {
      if (run.current === mine) setErr(sayError(e, how));
    } finally {
      if (run.current === mine) { setBusy(false); setProgress(null); }
    }
  }

  function read(given?: string) {
    const u = (given ?? name).trim();
    if (!u || (busy && !given)) return;
    if (!DEMO) {
      if (!/^[A-Za-z0-9_]+$/.test(u)) { setErr('没找到这个用户名。它在你 Bangumi 个人主页地址的最后一段。'); return; }
      void fetchAll(() => bgmClient().user(u), 'public');
      return;
    }
    setBusy(true); setErr('');
    setTimeout(() => {
      setBusy(false);
      if (u === 'offline') setErr('现在连不上 Bangumi，过一会儿再试。');
      else if (u === 'private') setErr('这个用户名下没有公开的『看过』。如果收藏设成了私密，可以用个人令牌。');
      else if (!/^[A-Za-z0-9_]{2,}$/.test(u)) setErr('没找到这个用户名。它在你 Bangumi 个人主页地址的最后一段。');
      else { setVia('public'); setStep('found'); }
    }, DUR.readFile);
  }
  const verify = () => {
    const t = token.trim();
    if (!t || busy) return;
    if (!DEMO) { void fetchAll(() => bgmClient(t).me(), 'token', t); return; }
    setBusy(true); setErr('');
    setTimeout(() => {
      setBusy(false);
      if (!/^[A-Za-z0-9]{24,}$/.test(t)) setErr('这个令牌用不了，可能已经过期，或者复制时少了几位。');
      else { setVia('token'); setStep('found'); }
    }, DUR.readFile);
  };
  const bring = () => {
    if (!DEMO && found) {
      const b = store.connections.bangumi;
      const now = new Date().toISOString();
      const same = b?.userId === found.user.id && !!store.bangumi;
      void setBangumiToken(via === 'token' ? found.token ?? null : null);
      store.applyBangumi({
        pull: found.plan.pull,
        added: found.plan.added,
        first: !same,
        conn: {
          status: 'connected', mode: via, username: found.user.username, userId: found.user.id, nickname: found.user.nickname,
          epoch: b?.epoch ?? 1, baselineDoneAt: same && b?.baselineDoneAt ? b.baselineDoneAt : todayISO(), lastOkSyncAt: now,
          ...(via === 'token' ? { tokenTail: (found.token ?? '').slice(-4), tokenSetAt: now } : null),
        },
      });
      onClose();
      nav('/');
      if (!same) setTimeout(() => store.toast(`搬进来 ${fmtNum(done)} 部`, { label: '撤销', run: () => store.disconnectBangumi() }), DUR.place);
      else store.toast('换好了，接着同步');
      return;
    }
    store.connectBangumi(via, name.trim(), token.trim().slice(-4));
    onClose();
    nav('/');
    setTimeout(() => store.toast(`搬进来 ${fmtNum(done)} 部`), DUR.place);
  };
  const reading = busy && progress && progress[1] > 0
    ? <p className="t-caption c-3 field-say tnum">正在读取 {fmtNum(progress[0])} / {fmtNum(progress[1])}</p>
    : null;

  return (
    <Sheet open={open} onClose={onClose} label="从 Bangumi 搬进来">
      {step === 'name' && (
        <div className="sheet-body weread" key="name">
          <h2 className="t-title">从 Bangumi 搬进来</h2>
          <ExplainList items={[
            { t: '只搬「看过」的，不往回写', d: '动画、书籍、三次元、音乐、游戏里标成「看过」的都会搬进来；「在看」的另放一处，不上墙。存目只从 Bangumi 拉进来，不往回写。' },
            { t: '日期精确到天', d: '按你在 Bangumi 上标成「看过」的那天记。一口气标了很多部的那一天，记作「时间未知」。你随时可以改。' },
            { t: '断开时，从 Bangumi 来的会一起删掉', d: '你自己写的短评、摘抄、随笔和改过的日期会留着，重新连接后回到原来的作品上。' },
          ]} />
          <label className="key-field plain bgm-field">
            <input
              value={name} onChange={(e) => { setName(e.target.value); setErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') read(); }}
              placeholder="Bangumi 用户名" aria-label="Bangumi 用户名"
              autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
            />
            {busy && <Loader className="spin" size={16} strokeWidth={1.5} aria-label="正在读取" />}
          </label>
          {err ? <p className="t-small c-2 field-say">{err}</p> : reading ?? <p className="t-caption c-3 field-say">设成私密的收藏读不到。想连私密收藏，用个人令牌。</p>}
          <div className="sheet-actions">
            <button className="btn btn-secondary" disabled={!name.trim() || busy} onClick={() => read()}>读取收藏</button>
            <button className="btn-text" onClick={() => { setErr(''); setStep('token-explain'); }}>用个人令牌连接</button>
          </div>
        </div>
      )}

      {step === 'token-explain' && (
        <div className="sheet-body weread" key="te">
          <h2 className="t-title"><span className="phrase">用个人令牌连接之前，</span><span className="phrase">先说清三件事</span></h2>
          <ExplainList items={[
            { t: '令牌要你自己去拿', d: <>在 Bangumi 网页上登录、生成一个个人令牌，有效期自己选，复制回来。网页有人机验证，国内网络偶尔打不开，多试一次就好。<a className="infolink" href="https://next.bgm.tv/demo/access-token" target="_blank" rel="noreferrer">去 Bangumi 生成 ↗</a></> },
            { t: '令牌只存在这台设备上', d: '不上传到我们的服务器，也不跟着 iCloud 同步。换设备要重新填。' },
            DEMO
              ? { t: '到期前会安静地提醒', d: '令牌快到期时，「··· › 设置 › 来源」里 Bangumi 那一行会写出到期日，不推送、不弹窗。到期后同步先停着，已经搬进来的都还在。' }
              : { t: '到期以后，换一个就好', d: '有效期最短 7 天。令牌到期或在 Bangumi 上删掉以后，「··· › 设置 › 来源」里 Bangumi 那一行会写明，不推送、不弹窗；换一个令牌就接着同步，已经搬进来的都还在。' },
          ]} />
          <div className="sheet-actions pair">
            <button className="btn btn-secondary" onClick={() => setStep('token')}>我了解，继续</button>
            <button className="btn btn-secondary" onClick={() => setStep('name')}>改用用户名</button>
          </div>
        </div>
      )}

      {step === 'token' && (
        <div className="sheet-body weread" key="token">
          <h2 className="t-title">粘贴你的令牌</h2>
          <label className="key-field">
            <input
              className="key-mono" value={token} onChange={(e) => { setToken(e.target.value); setErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') verify(); }}
              placeholder="粘贴令牌" spellCheck={false} autoCapitalize="off" autoComplete="off" aria-label="Bangumi 个人令牌"
            />
            {busy && <Loader className="spin" size={16} strokeWidth={1.5} aria-label="正在验证" />}
          </label>
          <p className="t-caption c-3 key-note"><Lock size={12} strokeWidth={1.5} />只存在这台设备上</p>
          {err ? <p className="t-small c-2 field-say">{err}</p> : reading}
          <div className="sheet-actions">
            <button className="btn btn-secondary" onClick={verify} disabled={!token.trim() || busy}>验证</button>
            {DEMO && <button className="btn-text" onClick={() => setToken('dEmO7c21e03f9a5b8d4c6e1f2a3b4c3f9a')}>原型里用示例令牌</button>}
          </div>
        </div>
      )}

      {step === 'found' && (
        <div className="sheet-body weread found" key="found">
          <div className="t-numeral">{fmtNum(done)}</div>
          <p className="t-ui found-sub">部看过的作品，可以搬进来</p>
          {doing > 0 && <p className="t-small c-3 found-more">另有 {doing} 部在看，放在「在看」里，不上墙。</p>}
          <div className="sheet-actions">
            <button className="btn btn-primary" onClick={bring}>搬进来</button>
            <button className="btn-text" onClick={() => { setErr(''); setStep(via === 'token' ? 'token' : 'name'); }}>{via === 'token' ? '换一个令牌' : '换一个用户名'}</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
