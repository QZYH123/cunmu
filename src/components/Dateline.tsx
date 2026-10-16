/**
 * The line above the name: today's date and, with a birthday set (设置 › 关于你), the day count —
 * 「10 月 11 日 · 这是你来到世上的第 11,454 天」. On the birthday the date reads 「6 月 3 日，生日」 in the accent
 * with a small dot; on a round day (every thousandth) the number takes the accent and a hairline under it.
 * No age, ever. Never in 给人看 and never in the long image (the page leaves it out there).
 */
import { useStore } from '../data/store';
import { dayCount, fmtDays } from '../lib/birthday';

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export function Dateline({ now = new Date() }: { now?: Date }) {
  const { birthday } = useStore();
  const c = dayCount(birthday, now);
  const date = `${now.getMonth() + 1} 月 ${now.getDate()} 日`;
  if (!c) return <p className="dateline"><span>{date}</span><span className="dl-sep" aria-hidden>·</span><span>{WEEK[now.getDay()]}</span></p>;
  return (
    <p className={`dateline ${c.birthday ? 'is-birthday' : ''} ${c.round ? 'is-round' : ''}`}>
      {c.birthday
        ? <span className="dl-acc"><i className="dl-dot" aria-hidden />{date}，生日</span>
        : <span>{date}</span>}
      <span className="dl-sep" aria-hidden>·</span>
      <span>这是你来到世上的第 <b className="dl-n">{fmtDays(c.n)}</b> 天</span>
    </p>
  );
}
