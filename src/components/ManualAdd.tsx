import { useEffect, useMemo, useRef, useState } from 'react';
import { Cover, thumbSize } from './Cover';
import type { CoverImage, Kind, Work } from '../data/types';
import { KIND_ASPECT, KIND_LABEL, MAKER } from '../data/types';
import type { WorkNote } from '../data/store';
import { putImage, shrinkToBlob } from '../lib/images';
import { isDesktop } from '../lib/native';
import { todayISO } from '../lib/today';

const KINDS: Kind[] = ['book', 'anime', 'film', 'music', 'game'];
type When = 'today' | 'day' | 'year' | 'forgot';
const ASK: Record<Kind, string> = { book: '什么时候读完', anime: '什么时候看完', film: '什么时候看完', music: '什么时候听的', game: '什么时候玩的', essay: '' };
const WHEN: { v: When; label: string }[] = [{ v: 'today', label: '今天' }, { v: 'day', label: '某一天' }, { v: 'year', label: '某一年' }, { v: 'forgot', label: '不记得了' }];

/** a pasted picture address: https only (a phone's WebView refuses http next to the app's own https) */
export const coverUrlOk = (s: string) => /^https:\/\/\S+$/i.test(s.trim());

/** what the form says, as a work and its note (pure: tests/manualAdd.test.ts) */
export function manualWork(f: {
  id: string; title: string; kind: Kind; maker: string; cover: CoverImage | null;
  when: When; day: string; year: string; approx: boolean; words: string; today: string; at: string;
}): { work: Work; note?: WorkNote } {
  const user = (value: string | null, precision: 'day' | 'year' | 'unknown', approx = false) =>
    ({ source: 'user' as const, value, precision, baseLevel: 1 as const, ...(approx ? { approx: true } : null), observedAt: f.at });
  const date = f.when === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(f.day) ? user(f.day, 'day')
    : f.when === 'year' && /^\d{4}$/.test(f.year) ? user(f.year, 'year', f.approx)
    : f.when === 'forgot' ? user(null, 'unknown') : undefined;
  const finished = date ? date.value ?? '' : f.today;
  const review = f.words.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const work: Work = {
    id: f.id, kind: f.kind, title: f.title.trim(), source: 'manual', finished, collected: f.today,
    credits: f.maker.trim() ? [{ name: f.maker.trim(), role: MAKER[f.kind], core: true }] : [],
    cover: f.cover, genres: [], info: [],
  };
  const note: WorkNote | undefined = date || review.length ? { ...(date ? { date } : null), ...(review.length ? { review } : null) } : undefined;
  return { work, note };
}

/**
 * 手动填写: a work typed in field by field — 名字, 类型, 作者 (or 导演, 开发…), 封面 (a picture of your own, or
 * an address to one), when, and a few words. Only the name is needed; the rest can be filled in later on the
 * work's page (补封面、作者, the date).
 */
export function ManualAdd({ start, onBack, onAdd }: { start: string; onBack: () => void; onAdd: (w: Work, note?: WorkNote) => void }) {
  const [title, setTitle] = useState(start);
  const [kind, setKind] = useState<Kind>('book');
  const [maker, setMaker] = useState('');
  const [pic, setPic] = useState<{ blob: Blob; aspect: number; url: string } | null>(null);
  const [addr, setAddr] = useState<string | null>(null);   // null = the address field is closed
  const [picErr, setPicErr] = useState(false);
  const [when, setWhen] = useState<When>('today');
  const [day, setDay] = useState(todayISO());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [approx, setApprox] = useState(false);
  const [words, setWords] = useState('');
  const [tried, setTried] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const name = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (pic) URL.revokeObjectURL(pic.url); }, [pic]);
  useEffect(() => { if (!start) name.current?.focus({ preventScroll: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const urlCover = addr && coverUrlOk(addr) ? addr.trim() : null;
  const preview = useMemo<Work>(() => ({
    id: 'manual-preview', kind, title: title.trim() || '名字', source: 'manual', finished: '', collected: '', genres: [], info: [],
    credits: maker.trim() ? [{ name: maker.trim(), role: MAKER[kind], core: true }] : [],
    cover: pic ? { thumb: pic.url, medium: pic.url, aspect: pic.aspect } : urlCover ? { thumb: urlCover, medium: urlCover, aspect: KIND_ASPECT[kind] } : null,
  }), [kind, title, maker, pic, urlCover]);
  const [pw, ph] = thumbSize(preview, 72);
  const choose = async (f: File | undefined) => {
    if (!f) return;
    try {
      const { blob, aspect } = await shrinkToBlob(f, 720);
      setPic({ blob, aspect, url: URL.createObjectURL(blob) }); setAddr(null); setPicErr(false);
    } catch { setPicErr(true); }
  };
  const yearOk = /^\d{4}$/.test(year) && Number(year) >= 1900 && Number(year) <= new Date().getFullYear();
  const ok = !!title.trim() && (when !== 'year' || yearOk) && (when !== 'day' || !!day);

  const save = async () => {
    setTried(true);
    if (!ok) { if (!title.trim()) name.current?.focus(); return; }
    const id = `manual-${Date.now().toString(36)}`;
    let cover: CoverImage | null = null;
    if (pic) {
      const img = `cover-${id}`;
      await putImage(img, pic.blob);
      cover = { thumb: `idb:${img}`, medium: `idb:${img}`, aspect: pic.aspect };
    } else if (urlCover) cover = { thumb: urlCover, medium: urlCover, aspect: KIND_ASPECT[kind] };
    const { work, note } = manualWork({ id, title, kind, maker, cover, when, day, year, approx, words, today: todayISO(), at: new Date().toISOString() });
    onAdd(work, note);
  };

  return (
    <div className="sheet-body manual" key="form">
      <h2 className="t-title">手动填写</h2>
      <p className="t-small c-3 manual-lead">只有名字是要填的，别的可以空着，以后在它的页面上补。</p>

      <label className="key-field plain edit-field manual-first">
        <span className="t-label c-3">名字</span>
        <input ref={name} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="名字" placeholder="书名、片名、游戏名" autoComplete="off" />
      </label>
      {tried && !title.trim() && <p className="t-caption c-2 field-say" role="alert">先写上名字。</p>}

      <div className="add-kinds manual-row" role="radiogroup" aria-label="类型">
        <span className="t-label c-3 manual-key">类型</span>
        {KINDS.map((k) => (
          <button key={k} role="radio" aria-checked={kind === k} className={`btn-text quiet ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
        ))}
      </div>

      <label className="key-field plain edit-field">
        <span className="t-label c-3">{MAKER[kind]}</span>
        <input value={maker} onChange={(e) => setMaker(e.target.value)} aria-label={MAKER[kind]} placeholder="不知道就空着" autoComplete="off" />
      </label>

      <div className="edit-cover manual-cover">
        <Cover work={preview} w={pw} h={ph} paperPlaceholder className="thumb" />
        <div className="edit-cover-side">
          <span className="t-label c-3">封面</span>
          <div className="edit-cover-acts">
            <button className="btn-text" onClick={() => file.current?.click()}>{pic ? '换一张图' : '选一张图'}</button>
            {/* the desktop app shows pictures only from places it knows (its content policy): no addresses there */}
            {!isDesktop() && addr === null && <button className="btn-text" onClick={() => { setAddr(''); setPic(null); }}>贴图片地址</button>}
            {(pic || addr !== null) && <button className="btn-text quiet" onClick={() => { setPic(null); setAddr(null); }}>不用图</button>}
          </div>
          <p className="t-caption c-3">{picErr ? '这张图读不出来，换一张再试。' : pic || urlCover ? '' : '不放图，就用名字排一张纸封面。'}</p>
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {addr !== null && (
        <>
          <label className="key-field plain edit-field">
            <span className="t-label c-3">地址</span>
            <input value={addr} onChange={(e) => setAddr(e.target.value)} aria-label="图片地址" placeholder="https:// 开头的图片地址" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off" />
          </label>
          {addr.trim() && !urlCover && <p className="t-caption c-2 field-say">要 https:// 开头的地址。</p>}
        </>
      )}

      <div className="add-kinds manual-row" role="radiogroup" aria-label={ASK[kind]}>
        <span className="t-label c-3 manual-key">{ASK[kind]}</span>
        {WHEN.map((o) => (
          <button key={o.v} role="radio" aria-checked={when === o.v} className={`btn-text quiet ${when === o.v ? 'on' : ''}`} onClick={() => setWhen(o.v)}>{o.label}</button>
        ))}
      </div>
      {when === 'day' && (
        <label className="key-field plain edit-field">
          <span className="t-label c-3">日期</span>
          <input type="date" value={day} max={todayISO()} min="1900-01-01" onChange={(e) => setDay(e.target.value)} aria-label="日期" />
        </label>
      )}
      {when === 'year' && (
        <div className="manual-year">
          <label className="key-field plain edit-field">
            <span className="t-label c-3">年份</span>
            <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" aria-label="年份" placeholder="比如 2019" autoComplete="off" />
          </label>
          <label className="manual-approx t-small c-2">
            <input type="checkbox" checked={approx} onChange={(e) => setApprox(e.target.checked)} />约
          </label>
        </div>
      )}
      {when === 'year' && tried && !yearOk && <p className="t-caption c-2 field-say" role="alert">年份写四位数字，比如 2019。</p>}
      {when === 'forgot' && <p className="t-caption c-3 field-say">放在「时间未知」里，想起来再改。</p>}

      <label className="key-field plain edit-field manual-words">
        <span className="t-label c-3">写几句</span>
        <textarea value={words} onChange={(e) => setWords(e.target.value)} aria-label="写几句" placeholder="可以不写" rows={2} />
      </label>

      <div className="sheet-actions">
        <button className="btn btn-primary" onClick={() => void save()}>放进来</button>
        <button className="btn-text" onClick={onBack}>返回</button>
      </div>
    </div>
  );
}
