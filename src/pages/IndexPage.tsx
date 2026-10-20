import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { fmtNum, listDate } from '../data/derive';
import { TopBar } from '../components/Shell';
import { Avatar } from '../components/Cover';
import { isDesk, useBreakpoint } from '../lib/useWidth';
import { ListRow, Seg } from '../components/Bits';
import { staggerStyle, useEnterClass } from '../lib/motion';
import { YearShelves } from '../components/YearShelves';
import { ShelfViewToggle } from '../components/ShelfView';
import { useSectionSpy } from './Entry';
import { capped, INDEX_PEOPLE_CAP, INDEX_WORK_CAP } from '../data/lists';

type Tab = 'people' | 'periods' | 'interests';

export default function IndexPage() {
  const { tab = 'people' } = useParams();
  const [q] = useSearchParams();
  const nav = useNavigate();
  const { d, yearView, setYearView } = useStore();
  const enter = useEnterClass();
  const { h1, h1Gone } = useSectionSpy([tab]);
  const people = useMemo(() => [...d.persons.values()].sort((a, b) => b.works.length - a.works.length || a.name.localeCompare(b.name, 'zh')), [d]);
  const interests = useMemo(() => [...d.interests.entries()].sort((a, b) => b[1].length - a[1].length), [d]);
  const g = q.get('g');
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [openWorks, setOpenWorks] = useState<string | null>(null);
  const peopleView = capped(people, INDEX_PEOPLE_CAP, peopleOpen);
  const interestWorks = d.interests.get(g ?? '') ?? [];
  const worksView = capped(interestWorks, INDEX_WORK_CAP, openWorks === g);
  const desk = isDesk(useBreakpoint());
  // r23 an empty library: one quiet line per tab saying what will be here (never 「暂无」)
  const hint = tab === 'people' ? (people.length ? '' : '放进作品以后，作者、导演这些人会排在这里。')
    : tab === 'periods' ? (d.years.size || d.unknown.length ? '' : '放进作品以后，这里按年份一排排放着。')
      : interests.length ? '' : '放进作品以后，同一类的会自己归到一起。';
  if (!['people', 'periods', 'interests'].includes(tab)) return <Navigate to="/index/people" replace />;
  return (
    <div className="page under-bar">
      <TopBar title="索引" titleOn={h1Gone} />
      <div className={`page-x ${enter}`}>
        <h1 className="t-title page-title" ref={h1}>索引</h1>
        {/* r7: 年份 can be read as spines or as covers — r19: a two-icon switch at the end of the same line,
            remembered on this device */}
        <div className="cat-tools idx-tools">
          <Seg
            className="cat-seg"
            options={[{ value: 'people', label: '人物' }, { value: 'periods', label: '年份' }, { value: 'interests', label: '兴趣' }]}
            value={tab as Tab}
            onChange={(v) => nav(`/index/${v}`, { replace: true })}
          />
          {tab === 'periods' && (
            <ShelfViewToggle className="idx-view" value={yearView} onChange={setYearView} />
          )}
        </div>
        <div className="index-body" key={tab}>
          {hint && <p className="t-small c-3 quiet-hint">{hint}</p>}
          {tab === 'people' && (
            // desktop: three card-free columns — photo, name, count (§8.3.7)
            <>
            <div className={desk ? 'index-cols' : undefined}>
              {peopleView.shown.map((p, i) => (
                <Link key={p.id} to={`/person/${p.id}`} className="list-row person-row" style={staggerStyle(i)}>
                  <Avatar name={p.name} size={40} />
                  <div className="list-main">
                    <span className="list-title ellipsis">{p.name}</span>
                    <span className="list-meta ellipsis">{p.roles.slice(0, 2).join(' · ')}</span>
                  </div>
                  <span className="list-date">{p.works.length}</span>
                </Link>
              ))}
            </div>
            {peopleView.rest > 0 && <button type="button" className="btn-text quiet index-more" onClick={() => setPeopleOpen(true)}>展开其余 {fmtNum(peopleView.rest)} 人</button>}
            </>
          )}
          {tab === 'periods' && <YearShelves />}
          {tab === 'interests' && !g && (
            <div className={desk ? 'index-cols' : undefined}>
              {interests.map(([name, ws], i) => (
                <Link key={name} to={`/index/interests?g=${encodeURIComponent(name)}`} className="list-row no-thumb" style={staggerStyle(i)}>
                  <div className="list-main">
                    <span className="list-title">{name}</span>
                    {desk && <span className="list-meta ellipsis">{ws.slice(0, 3).map((w) => w.title).join(' · ')}</span>}
                  </div>
                  <span className="list-date">{fmtNum(ws.length)}</span>
                </Link>
              ))}
            </div>
          )}
          {tab === 'interests' && g && (
            <div>
              <h2 className="group-head"><span className="t-h2">{g}</span><span className="t-caption c-3">{interestWorks.length}</span></h2>
              {worksView.shown.map((w, i) => <ListRow key={w.id} work={w} index={i} date={listDate(w)} />)}
              {worksView.rest > 0 && <button type="button" className="btn-text quiet index-more" onClick={() => setOpenWorks(g)}>展开其余 {fmtNum(worksView.rest)} 条</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
