/**
 * 从 Steam 搬进来, half done: the account typed so far, and whether the key page was opened. A phone may close
 * the app while the person is in Steam's page or the Steam app confirming the key; when the app opens again
 * within the half hour, the sheet opens again with what was typed. The key itself is never kept here.
 */
const KEY = 'cunmu/steam-draft';
const FRESH_MS = 30 * 60_000;

export interface SteamDraft { user: string; away: boolean; at: number }

export function readSteamDraft(now = Date.now()): SteamDraft | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SteamDraft | null;
    if (!d || typeof d.user !== 'string' || typeof d.at !== 'number' || now - d.at > FRESH_MS || d.at > now) return null;
    return { user: d.user, away: !!d.away, at: d.at };
  } catch { return null; }
}
export function saveSteamDraft(user: string, away: boolean, now = Date.now()) {
  try { localStorage.setItem(KEY, JSON.stringify({ user, away, at: now })); } catch { /* storage blocked: nothing kept */ }
}
export function clearSteamDraft() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
