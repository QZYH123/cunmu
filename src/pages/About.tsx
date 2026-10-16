/**
 * ··· › 设置 › 关于: the privacy note and the open-source licences. Loaded only when opened (the licence list is
 * the size of a small book).
 */
import { useMemo } from 'react';
import { TopBar } from '../components/Shell';
import { useEnterClass } from '../lib/motion';
import { APP_NAME, APP_VERSION, USER_AGENT } from '../lib/native';
import { SOURCE_URL } from '../config';
import LICENSES from '../data/licenses.json';

/** when the privacy note last changed (shown at its foot) */
const PRIVACY_DATE = '2026 年 10 月 16 日';
/** how the requests name the app: the User-Agent without its version (「QZYH123/cunmu」) */
const UA_NAME = USER_AGENT.split(' ')[0].split('/').slice(0, 2).join('/');

function DocPage({ title, children }: { title: string; children: React.ReactNode }) {
  const enter = useEnterClass();
  return (
    <div className="page under-bar">
      <TopBar />
      <article className={`page-x doc-page ${enter}`}>
        <h1 className="doc-title">{title}</h1>
        {children}
      </article>
    </div>
  );
}

/*
 * Every sentence below is checked against the code (r9):
 *  - storage: lib/storage.ts (phone file / desktop AppData / browser localStorage), lib/images.ts, lib/secrets.ts
 *  - network: lib/bangumiNet.ts + lib/bangumi.ts (api.bgm.tv), lib/coverCache.ts + <img> (lain.bgm.tv); nothing else
 *    is fetched (grep for fetch / CapacitorHttp); the Tauri CSP (scripts/apply-app-id.mjs) allows only those two hosts
 *  - sync: data/bangumiAgent.tsx (on open / return, when the last good sync is ≥ 6 h old)
 *  - Steam (r23): lib/steamNet.ts (api.steampowered.com, store.steampowered.com/api, app builds only), covers and
 *    achievement icons from the Steam CDN; the key via lib/secrets.ts ('steam-key'), cleared on disconnect and 删除全部内容
 *  - Douban / WeRead: lib/douban.ts, lib/doubak.ts, pages/Connect.tsx (paste) read locally, no requests
 *  - Android asks for INTERNET only; iOS asks for nothing
 */
export function Privacy() {
  return (
    <DocPage title="隐私说明">
      <p className="doc-lede">{APP_NAME}不需要注册账号，没有自己的服务器，也不收集你怎么使用它。</p>

      <h2>你收录的内容放在哪里</h2>
      <p>都在这台设备上：手机上是应用自己的文件夹，Windows 上是你的 AppData 文件夹，网页版是这个浏览器的本地存储。你加的图片也一样。{APP_NAME}不会把它们传到别处。</p>
      <p>在「··· › 设置」里删除全部内容，或者卸载应用，它们就一起删掉了。想留一份，先导出。</p>

      <h2>什么时候会联网</h2>
      <p>只在和 Bangumi、Steam 打交道的时候。Bangumi：</p>
      <ul>
        <li>从 Bangumi 搬进来、同步的时候，读取你在 Bangumi 上「看过」和「在看」的收藏。用用户名连接只能读到公开的收藏。</li>
        <li>连接以后，每次打开应用，如果距上次同步超过 6 小时，会自动同步一次。</li>
        <li>为搬进来的作品补上作者、导演这些主要创作者时，读取那部作品在 Bangumi 上的公开资料。</li>
        <li>贴一个 Bangumi 条目链接时，读取那一个条目。</li>
        <li>显示封面时，从 Bangumi 的图片服务器下载封面。手机上会在缓存里存一份，没网也能看。</li>
      </ul>
      <p>这些请求只发往 api.bgm.tv 和 lain.bgm.tv，带着一个写明这个应用的标识（{UA_NAME}，Bangumi 要求每个应用这样做），不带你写的任何东西。</p>
      <p>Steam（只在手机和电脑上的应用里；网页版连不上 Steam，只能打开你自己存的文件）：</p>
      <ul>
        <li>从 Steam 搬进来、再读一次的时候，用你的 Key 读取这个账号的游戏和游玩时长（要求 Steam 上的个人资料和游戏详情是公开的）。</li>
        <li>在游戏页「游玩」一节里点读取，或在设置的 Steam 一行里读取全部游戏时，读取你在那部游戏里的进度记录（达成了哪些、它们的名字和图标、全球玩家里达成的比例），以及 Steam 商店里这部游戏的公开资料（类型、开发、发行、发售日期）。</li>
        <li>显示游戏封面和进度记录的小图标时，从 Steam 的图片服务器下载。</li>
      </ul>
      <p>这些请求只发往 api.steampowered.com、store.steampowered.com 和 Steam 的图片服务器。Steam 不会自动同步，只在你点的时候读。读到的时长和进度记录存在这台设备上，会跟着导出的文件走。没连接 Bangumi 和 Steam、也没贴 Bangumi 链接的时候，{APP_NAME}不联网。</p>

      <h2>个人令牌</h2>
      <p>用个人令牌连接时，令牌只存在这台设备上：iPhone 上在钥匙串里，Android 上由系统密钥库加密保存；Windows 和网页版存在本地存储里。它只用来向 Bangumi 证明是你，不会出现在导出的文件里。断开 Bangumi 或删除全部内容时，令牌一起删掉。</p>

      <h2>Steam Web API Key</h2>
      <p>Key 是你自己在 Steam 网页上申请的，只存在这台设备上：iPhone 上在钥匙串里，Android 上由系统密钥库加密保存；Windows 存在本地存储里。它只用来向 Steam 读取你的游戏，不会出现在导出的文件里，也不会发到 Steam 以外的地方。断开 Steam 或删除全部内容时，Key 一起删掉。</p>

      <h2>豆瓣备份和微信读书</h2>
      <p>导入豆瓣备份、粘贴微信读书笔记，都只在这台设备上读你选的文件或贴进来的文字，不联网，也不登录豆瓣或微信读书。</p>

      <h2>导出</h2>
      <p>导出的文件存到你选的位置，或者经系统的分享面板交给你选的应用。之后由你保管。</p>

      <h2>没有的东西</h2>
      <p>没有广告，没有统计或分析工具，没有第三方 SDK。不读通讯录、位置。图片只读你自己选的那几张。Android 版只申请联网这一项权限。</p>

      <h2>外部网页</h2>
      <p>从{APP_NAME}里点开的网页（比如 Bangumi 的令牌页面）由系统浏览器打开，那里的事归那个网站。</p>

      <p className="doc-foot">更新于 {PRIVACY_DATE} · {APP_NAME} {APP_VERSION}</p>
    </DocPage>
  );
}

type Pkg = { name: string; version: string; license: string; copyright: string; url: string };
const DATA = LICENSES as { web: Pkg[]; rust: Pkg[]; texts: Record<string, string> };

function PkgRow({ p }: { p: Pkg }) {
  return (
    <li className="lic-row">
      <div className="lic-name"><span>{p.name}</span>{p.version && <span className="c-3 tnum"> {p.version}</span>}</div>
      <div className="lic-meta">{p.license}{p.copyright && <> · {p.copyright}</>}</div>
    </li>
  );
}

export function Licenses() {
  const texts = useMemo(() => Object.entries(DATA.texts), []);
  return (
    <DocPage title="开源许可">
      <p className="doc-lede">{APP_NAME}用到了下面这些开源软件和字体，感谢它们的作者。每一项后面是它的许可证和版权声明，许可证全文在页尾。</p>
      <p>{APP_NAME}自己以 GNU GPL 第 3 版（或更新的版本）发布，版权归 Yanagi（QZYH123）。可以自由使用、修改和再发布；改过的版本发布时，也要以同样的许可公开源代码。</p>
      <p><a className="infolink" href={SOURCE_URL} target="_blank" rel="noreferrer">{APP_NAME}自己的源代码 ↗</a></p>

      <h2>应用里的（{DATA.web.length}）</h2>
      <ul className="lic-list">{DATA.web.map((p) => <PkgRow key={p.name} p={p} />)}</ul>

      <details className="lic-more">
        <summary>Windows 版另外用到的 Rust 组件（{DATA.rust.length}）</summary>
        <ul className="lic-list">{DATA.rust.map((p) => <PkgRow key={`${p.name}@${p.version}`} p={p} />)}</ul>
      </details>

      <h2>许可证全文</h2>
      {texts.map(([id, text]) => (
        <details key={id} className="lic-more">
          <summary>{id}</summary>
          <pre className="lic-text">{text}</pre>
        </details>
      ))}
    </DocPage>
  );
}
