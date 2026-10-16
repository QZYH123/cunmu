import { useState } from 'react';
import { useStore } from '../data/store';
import type { Work } from '../data/types';
import { fmtPlaytime, type AchSummary } from '../lib/steam';
import { getSecret } from '../lib/secrets';
import { readAchievements, readAppDetails, steamReachable, SteamError } from '../lib/steamNet';
import { Section, Dots } from './Bits';

const SAY: Record<SteamError['kind'], string> = {
  key: 'Steam 没认这个 Key，到「设置 › 来源」换一个',
  private: 'Steam 上的「游戏详情」不是公开的，读不到成就',
  net: '现在连不上 Steam，过一会儿再试',
  user: '没找到这个账号',
};

/** r21 games only (STYLE v0.4 §3.19.8): 「成就 11 / 18 · 61%」 with a thin bar */
export const achPct = (a: AchSummary) => (a.total ? Math.round((a.unlocked / a.total) * 100) : 0);
export const achLine = (a: AchSummary) => `${a.unlocked} / ${a.total} · ${achPct(a)}%`;

/**
 * r20 游玩: what Steam knows of you and this game, as a few plain lines — time, the last day, how far through
 * its achievements, the rarest one you have and the first (which says roughly when you started). Every
 * achievement and the store's facts wait behind one disclosure. Read on demand here (and kept), or for all
 * games at once from 设置 › 来源.
 */
export function SteamPlay({ work }: { work: Work }) {
  const store = useStore();
  const play = work.play;
  const [busy, setBusy] = useState(false);
  if (!play) return null;
  const a = play.ach;
  const f = play.store;
  const conn = store.connections.steam;
  const canRead = steamReachable() && !!conn && conn.steamId !== 'file' && !work.isSample;
  const read = async () => {
    if (busy || !conn) return;
    const key = await getSecret('steam-key');
    if (!key) { store.toast('先在「设置 › 来源」里连上 Steam'); return; }
    setBusy(true);
    try {
      const [ach, facts] = [await readAchievements(key, conn.steamId, play.appid), await readAppDetails(play.appid).catch(() => null)];
      store.learnSteam(work.id, { ...(ach ? { ach } : null), ...(facts ? { store: facts } : null) });
      if (!ach) store.toast('这部游戏没有成就');
    } catch (e) {
      store.toast(SAY[e instanceof SteamError ? e.kind : 'net']);
    } finally { setBusy(false); }
  };
  return (
    <Section title="游玩">
      <dl className="related steam-play">
        <div className="info-row"><dt>时长</dt><dd>{fmtPlaytime(play.minutes)}{play.recentMinutes ? <span className="c-3">　最近两周 {fmtPlaytime(play.recentMinutes)}</span> : null}</dd></div>
        {play.lastPlayed && <div className="info-row"><dt>最后玩于</dt><dd className="tnum">{play.lastPlayed}</dd></div>}
        {a && a.first && <div className="info-row"><dt>开始</dt><dd className="tnum">约 {a.first}<span className="c-3">　第一个成就解锁的那天</span></dd></div>}
        {a && (
          <div className="info-row">
            <dt>成就</dt>
            <dd>
              <span className="tnum">{achLine(a)}</span>
              <span className="steam-bar" role="img" aria-label={`已解锁 ${achPct(a)}%`}><span style={{ width: `${achPct(a)}%` }} /></span>
            </dd>
          </div>
        )}
        {a?.rarest && (
          <div className="info-row">
            <dt>最稀有</dt>
            <dd>{a.rarest.title}<span className="c-3 tnum">　{a.rarest.pct}% 的玩家解锁{a.rarest.at ? ` · 解锁于 ${a.rarest.at}` : ''}</span></dd>
          </div>
        )}
      </dl>
      {(a || f) && (
        <details className="steam-more">
          <summary className="info-more">{a ? `全部成就 · ${a.total}` : '商店里的信息'}</summary>
          {a && (
            <ol className="steam-achs">
              {a.list.map((x) => (
                <li key={x.api} className={x.at ? 'got' : ''}>
                  {x.icon ? <img src={x.icon} alt="" width={32} height={32} loading="lazy" referrerPolicy="no-referrer" /> : <span className="steam-ach-blank" aria-hidden />}
                  <span className="steam-ach-main">
                    <span className="t-small">{x.title}</span>
                    {x.desc && <span className="t-caption c-3">{x.desc}</span>}
                  </span>
                  <span className="t-caption c-3 tnum steam-ach-side">{x.at ? `解锁于 ${x.at}` : '未解锁'}{x.pct !== undefined ? ` · ${x.pct}%` : ''}</span>
                </li>
              ))}
            </ol>
          )}
          {f && (
            <dl className="related steam-store">
              {f.released && <div className="info-row"><dt>发售</dt><dd>{f.released}</dd></div>}
              {f.platforms.length > 0 && <div className="info-row"><dt>平台</dt><dd>{f.platforms.join(' · ')}</dd></div>}
              {f.metacritic && <div className="info-row"><dt>Metacritic</dt><dd className="tnum">{f.metacritic}</dd></div>}
              {f.genres.length > 0 && <div className="info-row"><dt>商店分类</dt><dd>{f.genres.join(' · ')}</dd></div>}
            </dl>
          )}
          <p className="t-caption c-3 steam-at">{a ? `成就读于 ${a.at.slice(0, 10)}` : ''}{a && f ? ' · ' : ''}{f ? '商店信息来自 Steam 中国区' : ''}</p>
        </details>
      )}
      {canRead && (
        <p className="steam-read">
          <button className="btn-text" onClick={() => void read()} disabled={busy}>
            {busy ? <><Dots /> 正在读取</> : a ? '再读一次成就' : '读取成就'}
          </button>
        </p>
      )}
    </Section>
  );
}
