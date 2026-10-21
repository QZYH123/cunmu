import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useStore } from '../data/store';
import type { Work } from '../data/types';
import { KIND_LABEL, KIND_ORDER } from '../data/types';
import { cnMonth, creatorLine, fmtMD, personId } from '../data/derive';
import { YearReview } from '../components/YearReview';
import { TopBar } from '../components/Shell';
import { InfoBox } from '../components/Bits';
import { Collage } from '../components/Collage';
import { useEnterClass } from '../lib/motion';
import { isDesk, useBreakpoint, useElementWidth } from '../lib/useWidth';
import { Cover, thumbSize } from '../components/Cover';
import { useFly } from '../components/CoverWall';
import { useSectionSpy } from './Entry';
import { YearPager } from '../components/YearMini';

function TimelineItem({ w }: { w: Work }) {
  const to = w.kind === 'essay' ? `/essay/${w.id}` : `/entry/${w.id}`;
  return (
    <Link to={to} className={`tl-item ${w.kind === 'essay' ? 'is-essay' : ''}`}>
      <i className="tl-dot" aria-hidden />
      <div className="tl-main">
        <span className="t-ui w-500 c-ink ellipsis">{w.title}</span>
        <span className="t-caption c-2 ellipsis">{[KIND_LABEL[w.kind], creatorLine(w)].filter(Boolean).join(' · ')}</span>
      </div>
      <span className="tl-date">{dayOf(w)}</span>
    </Link>
  );
}

/** the date column inside a period: 3-16 / 3 月, 「约」 for a rough year, nothing when the year is all we know */
const dayOf = (w: Work) => fmtMD(w.finished) || (w.date?.approx ? '约' : '');

/** Desktop month column row (§8.3.4): 28×42 thumb, title, date. */
function MonthItem({ w }: { w: Work }) {
  const fly = useFly();
  const essay = w.kind === 'essay';
  const to = essay ? `/essay/${w.id}` : `/entry/${w.id}`;
  const [tw, th] = thumbSize(w, 28);
  return (
    <Link to={to} className="ym-item" data-fly-src={w.id} onClick={essay ? undefined : (e) => fly(e, w.id)}>
      <Cover work={w} w={tw} h={th} className="thumb" />
      <span className="ym-title ellipsis">{w.title}</span>
      <span className="tl-date">{dayOf(w)}</span>
    </Link>
  );
}

export default function Year() {
  const { y = '', m } = useParams();
  const { d, settings } = useStore();
  const enter = useEnterClass();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const { h1, h1Gone } = useSectionSpy([y, m]);
  const bp = useBreakpoint();
  const desk = isDesk(bp);
  const year = Number(y);
  const month = m ? Number(m) : undefined;
  const yi = d.years.get(year);
  // Dev review switch: #/year/2024?n=8 caps the period to N works to check every collage density (§6 #19).
  const [sp] = useSearchParams();
  const cap = Number(sp.get('n')) || Infinity;
  const works = ((month ? yi?.months.get(month) : yi?.works) ?? []).slice(0, cap);
  const title = month ? `${year} · ${cnMonth(month)}` : String(year);

  const byKind = KIND_ORDER.filter((k) => k !== 'essay').map((k) => [k, works.filter((w) => w.kind === k).length] as const).filter(([, c]) => c);
  const essays = works.filter((w) => w.kind === 'essay').length;
  const genreCount = new Map<string, number>();
  for (const w of works) for (const g of w.genres) if (g) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
  const top = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g);
  const seen = works.length - essays;

  const grouped = !month && works.length >= settings.yearGroup;
  const byMonth = new Map<number, Work[]>();
  // known only to the year: 「这一年里」, after the months
  const loose = works.filter((w) => w.finished.length < 7);
  for (const w of works) {
    if (w.finished.length < 7) continue;
    const mo = Number(w.finished.slice(5, 7));
    byMonth.set(mo, [...(byMonth.get(mo) ?? []), w]);
  }
  const months = [...byMonth.keys()].sort((a, b) => b - a);

  // a link that names no year or month (「abc」, month 13) goes to the list of years, as an unknown index tab does
  if (!/^\d{1,4}$/.test(y) || (m !== undefined && !(/^\d{1,2}$/.test(m) && month! >= 1 && month! <= 12))) return <Navigate to="/index/periods" replace />;
  // a year with nothing in it (an old link, or every work moved away): say what it will be, and the way out
  if (!works.length) {
    return (
      <div className="page under-bar page-x">
        <TopBar />
        <div className={enter}>
          <div className="t-label c-3 entry-tag">时期 · {month ? '月' : '年'}</div>
          <h1 className="period-mega">{month ? `${year}.${month}` : year}</h1>
          <p className="t-ui c-2 empty-line">这段时间还没有收录。</p>
          <Link to="/index/periods" className="btn-text quiet empty-back">所有年份 ›</Link>
        </div>
      </div>
    );
  }

  // ① 常遇见 (v0.4 §3.7.1): at most 3 people in ≥ 2 of this year's works; no counts after the names
  const met = new Map<string, { name: string; n: number }>();
  if (!month) for (const w of works) for (const c of new Map(w.credits.map((x) => [x.name, x])).values()) {
    const id = personId(c.name);
    met.set(id, { name: c.name, n: (met.get(id)?.n ?? 0) + 1 });
  }
  const often = [...met.entries()].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name, 'zh')).slice(0, 3);
  const info = (
    <InfoBox rows={[
      { key: '这一年', value: seen ? `${seen} 部 · ${byKind.map(([k, c]) => `${KIND_LABEL[k]} ${c}`).join(' ')}` : undefined },
      { key: '写了', value: essays ? `${essays} 篇随笔` : undefined },
      { key: '多是', value: top.length ? top.join('、') : undefined },
      { key: '常遇见', value: often.length ? <>{often.map(([id, v], i) => <span key={id}>{i > 0 && '、'}{d.persons.has(id) ? <Link className="infolink" to={`/person/${id}`}>{v.name}</Link> : v.name}</span>)}</> : undefined },
    ]} />
  );
  const review = !month && <YearReview works={works} />;
  const numeral = month
    ? <h1 className="t-display entry-title" ref={h1}>{title}</h1>
    : <h1 className="period-mega" ref={h1}>{year}</h1>;
  // block / tapestry run edge to edge on desktop (§8.3.4); the object tiers sit in the container
  const bleed = desk && works.length > 12;
  const collage = (
    <div className={`period-collage ${bleed ? 'bleed' : 'page-x'}`}>
      <div ref={ref}>{width > 0 && <Collage works={works} width={width} desk={desk} />}</div>
    </div>
  );

  if (desk) {
    const asc = [...months].sort((a, b) => a - b);
    return (
      <div className="page under-bar year-page">
        <TopBar title={title} titleOn={h1Gone} />
        <div className={enter}>
          <header className="page-x year-head">
            <div className="year-name">
              <div className="t-label c-3">{month ? '时期 · 月' : '时期 · 年'}</div>
              {numeral}
            </div>
            <div className="year-info">{info}</div>
          </header>
          <div className="page-x"><div className="year-rule">{yi?.named && !month && <p className="t-h3 c-2 period-named">{yi.named}</p>}</div></div>
          {collage}
          {review && <div className="page-x"><div className="year-review-col">{review}</div></div>}
          <div className="page-x">
            {grouped ? (
              <div className="year-months">
                {asc.map((mo) => {
                  const list = byMonth.get(mo)!;
                  const entry = list.length >= settings.monthEntry;
                  const head = <><span className="t-h3">{cnMonth(mo)}</span><span className="tl-count">{list.length}{entry && <ChevronRight size={16} strokeWidth={1.5} />}</span></>;
                  return (
                    <section key={mo} className="ym">
                      {entry ? <Link to={`/year/${year}/${mo}`} className="ym-head">{head}</Link> : <div className="ym-head">{head}</div>}
                      <div className="ym-list">{list.map((w) => <MonthItem key={w.id} w={w} />)}</div>
                    </section>
                  );
                })}
                {loose.length > 0 && (
                  <section className="ym">
                    <div className="ym-head"><span className="t-h3 c-2">这一年里</span></div>
                    <div className="ym-list">{loose.map((w) => <MonthItem key={w.id} w={w} />)}</div>
                  </section>
                )}
              </div>
            ) : (
              <div className="year-months flat">{works.map((w) => <MonthItem key={w.id} w={w} />)}</div>
            )}
            {!month && <YearPager year={year} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page under-bar">
      <TopBar title={title} titleOn={h1Gone} />
      <div className={enter}>
        <div className="page-x">
          <div className="t-label c-3 entry-tag">{month ? '时期 · 月' : '时期 · 年'}</div>
          {numeral}
          {yi?.named && !month && <p className="t-h3 c-2 period-named">{yi.named}</p>}
        </div>
        {collage}
        <div className="page-x">
        <div className="period-lower">
        <div className="period-info">{info}</div>
        {review}

        <div className="timeline">
          {grouped
            ? [...months].map((mo, i) => {
                const list = byMonth.get(mo)!;
                const gap = i > 0 && months[i - 1] - mo > 1;
                const entry = list.length >= settings.monthEntry;
                const head = (
                  <>
                    <span className="t-h3">{cnMonth(mo)}</span>
                    <span className="tl-count">{list.length}{entry && <ChevronRight size={16} strokeWidth={1.5} />}</span>
                  </>
                );
                return (
                  <section key={mo} className={`tl-month ${gap ? 'after-gap' : ''}`}>
                    {entry
                      ? <Link to={`/year/${year}/${mo}`} className="tl-month-head">{head}</Link>
                      : <div className="tl-month-head">{head}</div>}
                    <div className="tl-items">{list.map((w) => <TimelineItem key={w.id} w={w} />)}</div>
                  </section>
                );
              }).concat(loose.length ? [
                <section key="loose" className="tl-month after-gap">
                  <div className="tl-month-head"><span className="t-h3 c-2">这一年里</span></div>
                  <div className="tl-items">{loose.map((w) => <TimelineItem key={w.id} w={w} />)}</div>
                </section>,
              ] : [])
            : <div className="tl-items">{works.map((w) => <TimelineItem key={w.id} w={w} />)}</div>}
        </div>
        {!month && <YearPager year={year} />}
        </div>
        </div>
      </div>
    </div>
  );
}
