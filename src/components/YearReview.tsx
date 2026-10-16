import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Quote, Work } from '../data/types';

const EPI_MAX = 60;
const clip = (s: string) => { const cs = Array.from(s); return cs.length > EPI_MAX ? `${cs.slice(0, EPI_MAX).join('')}……` : s; };
const md = (iso: string) => `${Number(iso.slice(5, 7))}-${Number(iso.slice(8, 10))}`;

/** the earliest / latest of a set, by month first; within a month a dated day wins over a bare month */
function edge(ws: Work[], last: boolean): Work | undefined {
  if (!ws.length) return undefined;
  const months = [...new Set(ws.map((w) => w.finished.slice(0, 7)))].sort();
  const mo = last ? months[months.length - 1] : months[0];
  const inMo = ws.filter((w) => w.finished.startsWith(mo));
  const days = inMo.filter((w) => w.finished.length >= 10).sort((a, b) => (a.finished < b.finished ? -1 : a.finished > b.finished ? 1 : 0));
  if (days.length) return last ? days[days.length - 1] : days[0];
  return [...inMo].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
}

/**
 * The year page doubles as the year's review (STYLE v0.4 §3.7.1): ② how it began and ended, ③ one
 * quote, ④ what you wrote. Each block appears only when it has something; no big numbers, no comparing.
 */
export function YearReview({ works }: { works: Work[] }) {
  const nav = useNavigate();
  const [allEssays, setAll] = useState(false);
  const seen = works.filter((w) => w.kind !== 'essay');
  // ② only works dated to a month or a day know their order
  const dated = seen.filter((w) => w.finished.length >= 7);
  const a = edge(dated, false);
  const b = edge(dated, true);
  const span = dated.length >= 2 && a && b && a.id !== b.id ? [a, b] as const : null;
  // ③ a starred quote, else the year's earliest — fixed, never shuffled
  const quotes = seen.flatMap((w) => (w.quotes ?? []).map((q) => ({ q, w })));
  const pickQ = quotes.find((x) => x.q.starred) ?? [...quotes].sort((x, y) => (x.q.date < y.q.date ? -1 : x.q.date > y.q.date ? 1 : 0))[0] as { q: Quote; w: Work } | undefined;
  // ④ essays, oldest first, five before 「全部」
  const essays = works.filter((w) => w.kind === 'essay').sort((x, y) => (x.finished < y.finished ? -1 : 1));
  if (!span && !pickQ && !essays.length) return null;
  const shown = allEssays ? essays : essays.slice(0, 5);
  return (
    <div className="year-review">
      {span && (
        <p className="yr-span">
          这一年从<Link className="autolink" to={`/entry/${span[0].id}`}>《{span[0].title}》</Link>开始，到<Link className="autolink" to={`/entry/${span[1].id}`}>《{span[1].title}》</Link>。
        </p>
      )}
      {pickQ && (
        <button className="yr-quote" onClick={() => nav(`/entry/${pickQ.w.id}`, { state: { jump: '摘抄' } })}>
          <span className="yr-quote-text">「{clip(pickQ.q.text)}」</span>
          <span className="t-caption c-3 yr-quote-by">——《{pickQ.w.title}》</span>
        </button>
      )}
      {essays.length > 0 && (
        <section className="yr-essays">
          <h2 className="t-h2">这一年写下的</h2>
          <div className={`yr-essay-list ${shown.length > 3 ? 'cols' : ''}`}>
            {shown.map((e) => (
              <Link key={e.id} to={`/essay/${e.id}`} className="yr-essay">
                <span className="yr-essay-head"><span className="yr-essay-title ellipsis">{e.title || '无题'}</span><span className="t-caption c-3 tnum">{md(e.finished)}</span></span>
                <span className="t-small c-2 clamp-2">{(e.body ?? [])[0] ?? ''}</span>
              </Link>
            ))}
          </div>
          {essays.length > 5 && !allEssays && <button className="info-more" onClick={() => setAll(true)}>全部 · {essays.length}　›</button>}
        </section>
      )}
    </div>
  );
}
