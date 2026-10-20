import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import { ManualAdd } from '../components/ManualAdd';
import { useSheets } from '../App';
import { useStore, type WorkNote } from '../data/store';
import { ADDABLE, ALL_BY_ID, DEMO } from '@demo';
import { workFromSubject } from '../lib/bangumi';
import { bgmClient } from '../lib/bangumiNet';
import type { Kind, Work } from '../data/types';
import { KIND_LABEL } from '../data/types';
import { Sheet } from '../components/Bits';
import { Cover, thumbSize } from '../components/Cover';
import { creatorLine, fmtNum } from '../data/derive';
import { todayISO } from '../lib/today';
import { QUOTES_THERE } from '../data/quotes';
import { DUR } from '../tokens';
import { parseWeread } from './Connect';

const KINDS: Kind[] = ['book', 'anime', 'film', 'music', 'game'];
const DONE: Record<Kind, string> = { book: '看过了', anime: '看过了', film: '看过了', music: '听过了', game: '玩过了', essay: '' };
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
const FIELD_MAX_ROWS = 6;

/** What a paste is, before it is a search (r5 #3): one field for everything. */
export type Pasted =
  | { kind: 'bgm-subject'; id: string }
  | { kind: 'bgm-user'; user: string }
  | { kind: 'douban' }
  | { kind: 'weread'; books: ReturnType<typeof parseWeread> };
const BGM = /(?:bgm\.tv|bangumi\.tv|chii\.in)\/(subject|user)\/([A-Za-z0-9_]+)/i;
export function recognise(text: string): Pasted | null {
  const t = text.trim();
  if (!t) return null;
  const b = t.match(BGM);
  if (b) return b[1].toLowerCase() === 'subject' ? { kind: 'bgm-subject', id: b[2] } : { kind: 'bgm-user', user: b[2] };
  if (/douban\.com\/(?:subject|game)\/\d+/i.test(t)) return { kind: 'douban' };
  if (/\n/.test(t) && /^\s*《.+》\s*$/m.test(t)) {
    const books = parseWeread(t, todayISO()).filter((x) => x.quotes.length);
    if (books.length) return { kind: 'weread', books };
  }
  return null;
}
export const isBackupFile = (f: File) => /\.(xlsx|ndjson)$/i.test(f.name);

/**
 * 收录 (方案 5.2, r5 #3): one field takes anything — a name to search, a Bangumi link (that work, or that
 * account), a 豆瓣 link, a WeRead 「复制笔记」 paste — and a 豆瓣 backup can be dropped on it. A name the
 * catalogue doesn't have goes in with just the name; something already here opens instead of doubling.
 */
export function AddSheet({ open, onClose, initial = '' }: { open: boolean; onClose: () => void; initial?: string }) {
  const store = useStore();
  const sheets = useSheets();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Work | null>(null);
  /** 手动填写, with the name typed so far (null = not open) */
  const [form, setForm] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) { setQ(initial); setPick(null); setForm(null); setOver(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // the field grows with a pasted note (up to FIELD_MAX_ROWS lines), and shrinks back for a name
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = '';
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.style.height = `${Math.min(el.scrollHeight, line * FIELD_MAX_ROWS)}px`;
  }, [q, pick, open]);
  // arriving with words already typed (the empty home's field): the caret goes after them, in the same
  // commit as the sheet appears, so the next keystroke (and a phone's keyboard) carries straight on
  const carried = useRef(false);
  useEffect(() => { if (!open) carried.current = false; }, [open]);
  useLayoutEffect(() => {
    const el = field.current;
    if (!open || !initial || carried.current || !el || el.value !== initial) return;
    carried.current = true;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  });

  const pasted = recognise(q);
  // app: a pasted subject link is read from Bangumi (demo: the catalogue has it or it doesn't)
  const [subjects, setSubjects] = useState<Record<string, Work | null | 'loading'>>({});
  const subjectId = pasted?.kind === 'bgm-subject' ? String(pasted.id) : null;
  useEffect(() => {
    if (DEMO || !subjectId || subjects[subjectId] !== undefined) return;
    setSubjects((m) => ({ ...m, [subjectId]: 'loading' }));
    workFromSubject(bgmClient(), subjectId).then(
      (w) => setSubjects((m) => ({ ...m, [subjectId]: w })),
      () => setSubjects((m) => { const n = { ...m }; n[subjectId] = null; return n; }),
    );
  }, [subjectId]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = pasted ? '' : norm(q.trim());
  const have = new Set(store.library.map((w) => w.id));
  const match = (w: Work) => !t || norm(w.title).includes(t) || norm(w.originalTitle ?? '').includes(t) || norm(creatorLine(w)).includes(t);
  const pool = pasted ? [] : ADDABLE.filter((w) => !have.has(w.id) && match(w));
  const owned = t ? store.library.filter((w) => w.kind !== 'essay' && match(w)).slice(0, 3) : [];
  const exact = [...pool, ...owned].some((w) => norm(w.title) === t);

  const add = (w: Work) => {
    const today = todayISO();
    // 「看过了」 is the user's own word for today: a catalogue entry's own dates and ties don't come along
    const { claims: _c, sources: _s, ...bare } = w; // eslint-disable-line @typescript-eslint/no-unused-vars
    land({ ...bare, finished: today, collected: today });
  };
  const land = (work: Work, note?: WorkNote) => {
    // dated some other time than today (手动填写): it would not be first in 「最近」, so its own page opens
    if (work.finished !== todayISO()) {
      store.addWork(work, note);
      onClose();
      nav(`/entry/${work.id}`);
      return;
    }
    onClose();
    // one work lands on 全部, where 「最近」 has it first with 「写几句」 (a whole import opens on 首页 instead)
    nav('/all');
    setTimeout(() => {
      store.addWork(work, note);
      // no toast: 「最近」's first row offers 「写几句」 in place, for as long as it is the newest (r5 #5)
      store.setJustAdded(work.id);
    }, DUR.fade);
  };
  // only the name: a manual work with a literal cover; the kind defaults to 书 and can be changed in one tap
  const nameOnly = (kind: Kind = 'book'): Work => ({
    id: `manual-${Date.now().toString(36)}`, kind, title: q.trim(), credits: [], finished: '', collected: '',
    source: 'manual', cover: null, genres: [], info: [],
  });
  const handOff = (go: () => void) => { onClose(); setTimeout(go, DUR.fade); };
  const putQuotes = (books: ReturnType<typeof parseWeread>) => {
    const { first, quotes: n, fresh } = store.importPaste(books);
    onClose();
    if (!n) { store.toast(QUOTES_THERE); return; }
    if (books.length === 1) nav(`/entry/${first}`);
    store.toast(books.length === 1
      ? (fresh ? `收下《${books[0].title}》，带 ${n} 条摘抄` : `《${books[0].title}》多了 ${n} 条摘抄`)
      : (fresh === books.length ? `收下 ${books.length} 本书，带 ${n} 条摘抄` : `${books.length} 本书多了 ${n} 条摘抄`));
  };
  const onDrop = (e: DragEvent) => {
    const f = e.dataTransfer.files?.[0];
    setOver(false);
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    if (isBackupFile(f)) handOff(() => sheets.douban(f));
  };

  const row = (w: Work, onClick: () => void) => {
    const [tw, th] = thumbSize(w, 32);
    return (
      <button key={w.id} className="list-row search-row" onClick={onClick}>
        <Cover work={w} w={tw} h={th} paperPlaceholder />
        <div className="list-main">
          <span className="list-title ellipsis">{w.title}</span>
          <span className="list-meta ellipsis">{[KIND_LABEL[w.kind], creatorLine(w), w.year].filter(Boolean).join(' · ')}</span>
        </div>
      </button>
    );
  };
  const ownedRow = (w: Work) => (
    <Link key={w.id} to={`/entry/${w.id}`} className="list-row search-row" onClick={onClose}>
      <Cover work={w} w={thumbSize(w, 32)[0]} h={thumbSize(w, 32)[1]} paperPlaceholder />
      <div className="list-main">
        <span className="list-title ellipsis">{w.title}</span>
        <span className="list-meta ellipsis">{[KIND_LABEL[w.kind], w.finished ? `${Number(w.finished.slice(0, 4))} 年 · ${DONE[w.kind].replace('了', '')}` : ''].join(' · ')}</span>
      </div>
    </Link>
  );

  // what the field recognised, as one line with its one action
  let known: React.ReactNode = null;
  if (pasted?.kind === 'bgm-subject') {
    const got = DEMO ? ALL_BY_ID.get(`bgm-${pasted.id}`) : subjects[String(pasted.id)];
    const w = got && got !== 'loading' ? got : undefined;
    const mine = store.library.find((x) => x.id === `bgm-${pasted.id}`);
    known = got === 'loading' && !mine ? (
      <p className="t-small c-3 known-say">正在读取这一部</p>
    ) : !w && !mine ? (
      <p className="t-small c-2 known-say">这一部还读不到。写上名字，也能放进来。</p>
    ) : mine ? (
      <div className="known"><div className="t-label c-3 known-head">已经收过</div>{ownedRow(mine)}</div>
    ) : w && (
      <div className="known">
        <div className="t-label c-3 known-head">Bangumi 条目</div>
        <div className="known-work">
          <Cover work={w} w={thumbSize(w, 56)[0]} h={thumbSize(w, 56)[1]} />
          <div className="list-main">
            <span className="t-h3 known-title">{w.title}</span>
            <span className="list-meta ellipsis">{[KIND_LABEL[w.kind], creatorLine(w), w.year].filter(Boolean).join(' · ')}</span>
          </div>
          <button className="btn btn-primary known-go" onClick={() => add(w)}>{DONE[w.kind]}</button>
        </div>
      </div>
    );
  } else if (pasted?.kind === 'bgm-user') {
    known = (
      <div className="known">
        <div className="t-label c-3 known-head">Bangumi 账号</div>
        <div className="known-line">
          <span className="t-ui">{pasted.user}</span>
          <button className="btn-text known-act" onClick={() => handOff(() => sheets.bangumi({ user: pasted.user }))}>读取收藏 ›</button>
        </div>
      </div>
    );
  } else if (pasted?.kind === 'douban') {
    known = (
      <div className="known">
        <p className="t-small c-2 known-say">豆瓣的单条链接读不了：存目不连豆瓣。</p>
        <button className="btn-text known-act" onClick={() => handOff(() => sheets.douban())}>导入豆瓣备份 ›</button>
      </div>
    );
  } else if (pasted?.kind === 'weread') {
    const n = pasted.books.reduce((s, b) => s + b.quotes.length, 0);
    known = (
      <div className="known">
        <div className="t-label c-3 known-head">微信读书笔记</div>
        <div className="known-line">
          <span className="t-ui ellipsis">{pasted.books.length === 1 ? `《${pasted.books[0].title}》 · ${fmtNum(n)} 条摘抄` : `${pasted.books.length} 本书 · ${fmtNum(n)} 条摘抄`}</span>
          <button className="btn btn-primary known-go" onClick={() => putQuotes(pasted.books)}>放进来</button>
        </div>
      </div>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} label="收录">
      {form !== null ? (
        <ManualAdd start={form} onBack={() => setForm(null)} onAdd={land} />
      ) : !pick ? (
        <div
          className={`sheet-body add-body ${over ? 'is-over' : ''}`} key="list"
          onDragOver={(e) => { if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) { e.preventDefault(); setOver(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
          onDrop={onDrop}
        >
          <h2 className="t-title">收录</h2>
          <label className="search-field add-field" style={{ marginTop: 'var(--s-5)' }}>
            <Search strokeWidth={1.5} />
            <textarea
              ref={field} rows={1} value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) e.preventDefault(); }}
              placeholder="书名、链接，或一段读书笔记" enterKeyHint="search" aria-label="收录：书名、链接，或一段读书笔记"
              spellCheck={false} autoCapitalize="off"
            />
          </label>
          {!q.trim() && <p className="t-caption c-3 field-say">输入名字查找；贴 Bangumi 链接或微信读书笔记也行。</p>}
          {!pasted && (
            <button className="douban-entry t-ui c-2 manual-entry" onClick={() => setForm(q.trim())}>
              <span>手动填写<span className="c-3">　名字、作者、封面、日期</span></span> <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          )}
          {!q.trim() && (
            <button className="douban-entry t-ui c-2" onClick={() => handOff(() => sheets.douban())}>
              <span>导入豆瓣备份<span className="c-3 drop-hint">　或把文件拖到这里</span></span> <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          )}
          {known}
          <div className="add-list">
            {pool.map((w) => row(w, () => setPick(w)))}
            {t && !exact && (
              <button className="list-row search-row add-name" onClick={() => setPick(nameOnly())}>
                <Cover work={nameOnly()} w={32} h={48} paperPlaceholder />
                <div className="list-main">
                  <span className="list-title ellipsis">只用名字放进来《{q.trim()}》</span>
                  <span className="list-meta">封面、作者可以以后再补</span>
                </div>
              </button>
            )}
            {owned.length > 0 && (
              <div className="add-owned">
                <div className="t-label c-3">已经收过</div>
                {owned.map(ownedRow)}
              </div>
            )}
          </div>
          <div className="sheet-actions">
            <button className="btn btn-secondary" onClick={() => { onClose(); nav('/write'); }}>写点什么</button>
          </div>
        </div>
      ) : (
        <div className="sheet-body" key="pick">
          <div className="add-pick">
            <Cover work={pick} w={96} h={Math.round(96 * thumbSize(pick, 96)[1] / 96)} />
            <div className="add-pick-main">
              <div className="t-label c-3">作品 · {KIND_LABEL[pick.kind]}</div>
              <h2 className="t-title">{pick.title}</h2>
              {(creatorLine(pick) || pick.year) && <p className="t-ui c-2">{[creatorLine(pick), pick.year].filter(Boolean).join('　')}</p>}
            </div>
          </div>
          {pick.id.startsWith('manual-') && (
            <div className="add-kinds" role="radiogroup" aria-label="这是">
              <span className="t-small c-3">这是</span>
              {KINDS.map((k) => (
                <button key={k} role="radio" aria-checked={pick.kind === k} className={`btn-text quiet ${pick.kind === k ? 'on' : ''}`} onClick={() => setPick({ ...pick, kind: k })}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          <div className="sheet-actions">
            <button className="btn btn-primary" onClick={() => add(pick)}>{DONE[pick.kind]}</button>
            <button className="btn-text" onClick={() => setPick(null)}>换一个</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
