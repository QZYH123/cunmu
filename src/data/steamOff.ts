/**
 * Disconnecting Steam drops the key (the caller clears the secret) and the playtime recorded on games
 * already here. Games that came from Steam stay.
 */
export const STEAM_OFF_DROPS = [
  'Steam Web API Key 会从这台设备删掉。',
  '记在原有游戏上的时长和进度记录会去掉。',
] as const;
export const STEAM_OFF_KEEPS = '从 Steam 搬来的游戏和它们的时长都还在。';

export function withoutSteam<T extends { connections: object }>(x: T): T {
  return { ...x, plays: {}, connections: { ...x.connections, steam: null } };
}
