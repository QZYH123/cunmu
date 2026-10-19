/**
 * What a backup says about Bangumi and Steam once it is back on this device.
 * A file never carries the token or the Steam key (they stay in lib/secrets.ts). If this device still has
 * them, the connection is the same as before the export. If it does not, the row says so — it is not a
 * token that stopped working.
 */
import type { BangumiConnection } from './persist';
import type { SteamConnection } from '../lib/steam';

export const BANGUMI_FILE_NO_TOKEN = '导出文件里没有令牌。填一个新的就能接着同步，已经搬进来的都还在。';
export const STEAM_FILE_NO_KEY = '导出文件里没有 Key。填一个新的就能接着读。';

export interface BackupBangumi {
  mode?: string;
  username?: string;
  userId?: number;
  nickname?: string;
}
export interface BackupSteam {
  steamId?: string;
  vanity?: string;
}

export function bangumiFromBackup(
  eb: BackupBangumi | null | undefined,
  opts: { demo: boolean; hasToken: boolean; today: string; now: string },
): BangumiConnection | null {
  if (!eb || !(opts.demo || eb.userId)) return null;
  const mode: BangumiConnection['mode'] = eb.mode === 'token' ? 'token' : 'public';
  const base: BangumiConnection = {
    status: 'connected', mode, username: eb.username ?? '', epoch: 1, baselineDoneAt: opts.today,
  };
  // the demo build has no real token and pretends the last sync just happened
  if (opts.demo) return { ...base, lastOkSyncAt: opts.now };
  if (!eb.userId) return null;
  const conn: BangumiConnection = { ...base, userId: eb.userId, nickname: eb.nickname };
  if (mode === 'token' && !opts.hasToken) conn.problem = 'absent';
  return conn;
}

export function steamFromBackup(steam: BackupSteam | null | undefined, opts: { hasKey: boolean }): SteamConnection | null {
  if (!steam?.steamId) return null;
  const conn: SteamConnection = {
    status: 'connected', steamId: steam.steamId, ...(steam.vanity ? { vanity: steam.vanity } : null),
  };
  if (!opts.hasKey) conn.problem = 'absent';
  return conn;
}
