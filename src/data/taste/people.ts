/**
 * Whether Bangumi's creator pass has covered enough of the visible works
 * for 常遇见 to be worth saying. A subject that was looked up and has no
 * creator ([]) counts as covered. No Bangumi works means ready.
 */
import type { BangumiPull } from '../../lib/bangumi';
import { GATES } from './gates';
import type { PeopleStatus } from './types';

export type { PeopleStatus };

export type PeoplePull = Pick<BangumiPull, 'people'>;

/** structural: the connection fields this check reads */
export interface PeopleConn {
  status?: string;
  problem?: string;
}

const BGM = /^bgm-(\d+)$/;

export function peopleStatus(
  works: readonly { id: string }[],
  pull: PeoplePull | null,
  conn: PeopleConn | undefined,
  demo: boolean,
): PeopleStatus {
  let total = 0;
  let covered = 0;
  for (const w of works) {
    const m = BGM.exec(w.id);
    if (!m) continue;
    total += 1;
    if (pull?.people?.[m[1]] !== undefined) covered += 1;
  }
  const coverage = total === 0 ? 1 : covered / total;
  const ready = total === 0 || covered / total + 1e-9 >= GATES.M.peopleReady;
  let state: PeopleStatus['state'];
  if (ready) state = 'ready';
  else if (conn?.status === 'connected' && !demo && conn.problem !== 'token' && conn.problem !== 'absent') state = 'loading';
  else state = 'blocked';
  return { coverage, covered, total, state };
}
