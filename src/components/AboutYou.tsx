/**
 * 设置 › 关于你: 名字, 一句话 (the line under the name on 首页), 生日 (only for counting days on 首页; on this
 * device only; never shown to anyone, never in the long image).
 */
import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useStore } from '../data/store';
import { Sheet } from './Bits';
import { DEFAULT_TITLE, TITLE_MAX } from '../lib/naming';

const LINE_MAX = 40;
const CN_MONTH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
export const fmtBirthday = (iso?: string) => (iso ? `${Number(iso.slice(0, 4))} 年 ${Number(iso.slice(5, 7))} 月 ${Number(iso.slice(8, 10))} 日` : '');

function TextSheet({ open, onClose, title, say, value, max, placeholder, onSave }: {
  open: boolean; onClose: () => void; title: string; say: string; value: string; max: number; placeholder: string; onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => { if (open) setV(value); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => { onSave(v.trim()); onClose(); };
  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <div className="sheet-body">
        <h2 className="t-title">{title}</h2>
        <p className="t-small c-2 sheet-say">{say}</p>
        <input
          className="ask-field" value={v} placeholder={placeholder} aria-label={title} enterKeyHint="done"
          onChange={(e) => setV([...e.target.value].slice(0, max).join(''))}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) save(); }}
        />
        <div className="sheet-actions pair">
          <button className="btn btn-secondary" onClick={onClose}>不改了</button>
          <button className="btn btn-primary" onClick={save}>存下</button>
        </div>
      </div>
    </Sheet>
  );
}

/** year, then month, then the day: a tap on the day keeps it */
export function BirthdaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const now = new Date();
  const cur = store.birthday;
  const [y, setY] = useState(cur ? Number(cur.slice(0, 4)) : 1995);
  const [m, setM] = useState(cur ? Number(cur.slice(5, 7)) : 0);
  const years = Array.from({ length: now.getFullYear() - 1919 }, (_, i) => now.getFullYear() - i);
  useEffect(() => {
    if (!open) return;
    setY(cur ? Number(cur.slice(0, 4)) : 1995); setM(cur ? Number(cur.slice(5, 7)) : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // the row opens on the year already picked (or 1995), in the middle: only the row scrolls, never the page
  const yearsRef = useCallback((el: HTMLDivElement | null) => {
    const on = el?.querySelector<HTMLElement>('.on');
    if (el && on) el.scrollLeft = on.offsetLeft - el.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;
  }, []);
  const future = (yy: number, mm: number, dd: number) => new Date(yy, mm - 1, dd) > now;
  return (
    <Sheet open={open} onClose={onClose} label="你的生日">
      <div className="sheet-body">
        <h2 className="t-title">你的生日</h2>
        <p className="t-small c-2 sheet-say">只用来数日子。</p>
        <div className="bd-years" ref={yearsRef} role="group" aria-label="年">
          {years.map((yy) => <button key={yy} className={yy === y ? 'on' : ''} aria-pressed={yy === y} onClick={() => setY(yy)}>{yy}</button>)}
        </div>
        <div className="bd-months" role="group" aria-label="月">
          {CN_MONTH.map((t, i) => <button key={t} className={m === i + 1 ? 'on' : ''} aria-pressed={m === i + 1} disabled={future(y, i + 1, 1)} onClick={() => setM(i + 1)}>{t}</button>)}
        </div>
        {m > 0 && (
          <div className="bd-days" role="group" aria-label="日">
            {Array.from({ length: daysIn(y, m) }, (_, i) => i + 1).map((dd) => {
              const iso = `${y}-${pad(m)}-${pad(dd)}`;
              return <button key={dd} className={cur === iso ? 'on' : ''} aria-label={`${y} 年 ${m} 月 ${dd} 日`} disabled={future(y, m, dd)} onClick={() => { store.setBirthday(iso); onClose(); }}>{dd}</button>;
            })}
          </div>
        )}
        <div className="sheet-actions pair">
          <button className="btn btn-secondary" onClick={() => { store.setBirthday(null); onClose(); }}>不填了</button>
          <span className="t-caption c-3 bd-hint">{m ? '点一下就记下' : '先挑年和月'}</span>
        </div>
      </div>
    </Sheet>
  );
}

export function AboutYou() {
  const store = useStore();
  const [open, setOpen] = useState<null | 'name' | 'line' | 'birthday'>(null);
  const close = () => setOpen(null);
  const line = store.me.profile.line ?? '';
  const row = (key: 'name' | 'line' | 'birthday', name: string, value: string, empty: string) => (
    <button className="me-row about-row" onClick={() => setOpen(key)}>
      <span className="t-ui">{name}</span>
      <span className="about-v"><span className={`ellipsis ${value ? 'c-2' : 'c-3'}`}>{value || empty}</span><ChevronRight className="chev" size={18} strokeWidth={1.5} /></span>
    </button>
  );
  return (
    <section className="me-group" aria-labelledby="about-you">
      <div className="label-head me-label" id="about-you">关于你</div>
      {row('name', '名字', store.title?.trim() ?? '', '可以不填')}
      {row('line', '一句话', line, '按记录写')}
      {row('birthday', '生日', fmtBirthday(store.birthday), '可以不填')}
      <p className="t-caption c-3 me-cap about-note">可以不填。生日只用来在首页数日子，只存在这台设备上；给人看和存成图的时候都不显示。</p>
      <TextSheet
        open={open === 'name'} onClose={close} title="名字" placeholder={DEFAULT_TITLE} max={TITLE_MAX} value={store.title ?? ''}
        say={`写在首页最上面。最多 ${TITLE_MAX} 个字；空着，就是「${DEFAULT_TITLE}」。`} onSave={(v) => store.setTitle(v === DEFAULT_TITLE ? '' : v)}
      />
      <TextSheet
        open={open === 'line'} onClose={close} title="一句话" placeholder="看东西很慢，喜欢的会看很多遍。" max={LINE_MAX} value={line}
        say="名字下面的一句。空着，就按记录写一句。" onSave={(v) => store.setProfile({ line: v })}
      />
      <BirthdaySheet open={open === 'birthday'} onClose={close} />
    </section>
  );
}
