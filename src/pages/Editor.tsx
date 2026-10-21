import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Image, X } from 'lucide-react';
import { useStore } from '../data/store';
import { ALL_BY_ID } from '@demo';
import type { UserImage, Work } from '../data/types';
import { entryWhen, linkify } from '../data/derive';
import { Cover, thumbSize } from '../components/Cover';
import { CoverViewer } from '../components/Bits';
import { DateSheet } from '../components/DateSheet';
import { toParagraphs, todayISO } from '../lib/today';
import { essayBody, essayPlan } from '../lib/essay';
import { IMAGES_PER_WORK, deleteImage, putImage, shrinkToBlob, useImageSrc } from '../lib/images';
import { Link } from 'react-router-dom';
import { OVERLAY } from '../lib/shell';
import { noteLanding, takeOpenFrom } from '../lib/motion';
import { EASE, M } from '../tokens';

const imgId = () => `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
/** a picked picture, shrunk and put in IndexedDB; null if it can't be read */
async function storePicture(f: File): Promise<UserImage | null> {
  try {
    const { blob, aspect } = await shrinkToBlob(f);
    const id = imgId();
    await putImage(id, blob);
    return { id, src: `idb:${id}`, aspect, addedAt: new Date().toISOString() };
  } catch { return null; }
}

const NO_UNLINKS = new Set<string>();

/**
 * 随笔编辑器 (§3.10, STYLE v0.4 §3.19.7): title + body only, accent caret/selection, no counters, no format bar.
 * Everything typed is kept. ‹ 返回, Esc, Android back, 「完成」 and a tab all leave the same way: an empty
 * new page saves nothing; a new essay is kept and the footnote 「随笔收好了　不要了」 offers to drop it;
 * editing an essay or a work's 短评 just keeps the words.
 *
 *   /write             a new essay (it goes on the wall like any work)
 *   /write?id=…        edit one of your essays
 *   /write?for=<work>  write on a work: the body becomes its 短评, with an optional 摘抄, pictures and 看完 date
 */
export default function Editor() {
  const [params] = useSearchParams();
  const forId = params.get('for');
  const store = useStore();
  const target = forId ? store.d.byId.get(forId) ?? ALL_BY_ID.get(forId) : undefined;
  // the sample is only to look at (decided): nothing to write on
  if (target?.isSample) return <div className="page under-bar page-x"><p className="t-ui c-2 empty-line">这是示例里的作品，不能在上面写。</p><Link to="/" className="btn-text quiet empty-back">回到首页 ›</Link></div>;
  return target ? <WorkNoteEditor work={target} /> : <EssayEditor editId={params.get('id')} />;
}

/** 「提到 《三体》、刘慈欣」 — the links the page will get, shown while typing (a textarea can't underline). */
function MentionLine({ text, selfId }: { text: string; selfId: string }) {
  const { d } = useStore();
  const names = useMemo(() => {
    const segs = linkify(toParagraphs(text), d, selfId, NO_UNLINKS).flat().filter((s) => s.target);
    return segs.map((s) => (s.kind === 'work' ? `《${s.text}》` : s.text));
  }, [text, d, selfId]);
  return (
    <span className="editor-mentions t-caption c-3 ellipsis" aria-live="polite">
      {names.length ? <>会连上 {names.join('、')}</> : null}
    </span>
  );
}

/**
 * Saves when the editor goes away, however it goes (‹, Esc, Android back, a tab, 「完成」). `onLeft` runs after
 * that last save, once the page is gone; closing the tab or reloading saves too, quietly.
 */
function useSaveOnLeave(save: () => void, onLeft?: () => void) {
  const ref = useRef({ save, onLeft });
  ref.current = { save, onLeft };
  useEffect(() => {
    const f = () => ref.current.save();
    window.addEventListener('pagehide', f);
    return () => { window.removeEventListener('pagehide', f); ref.current.save(); ref.current.onLeft?.(); };
  }, []);
}

/** Esc leaves the editor, unless something is open on top of it (a sheet, the date picker, a picture) */
function useEscLeaves(leave: () => void) {
  const ref = useRef(leave);
  ref.current = leave;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented || document.querySelector(OVERLAY)) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
}

/**
 * The bottom bar sits on the keyboard. iOS keeps the layout viewport and shrinks the visual one, so a fixed
 * bar would stay behind the keyboard; the bar is lifted by the part of the window the keyboard covers.
 * (Android pads the web view itself; there this stays 0.)
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const f = () => setInset(Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop))));
    f();
    vv.addEventListener('resize', f);
    vv.addEventListener('scroll', f);
    return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f); };
  }, []);
  return inset;
}

function EditorBar({ children }: { children: ReactNode }) {
  const inset = useKeyboardInset();
  return <div className={`editor-bar ${inset > 0 ? 'on-keyboard' : ''}`} style={inset > 0 ? { bottom: inset } : undefined}>{children}</div>;
}

/** ‹ 返回, where every other page has it; it saves like 「完成」 does */
function EditorHead({ onBack }: { onBack: () => void }) {
  return (
    <header className="editor-head">
      <button className="icon-btn" aria-label="返回" onClick={onBack}><ChevronLeft strokeWidth={1.5} /></button>
    </header>
  );
}

function EssayEditor({ editId }: { editId: string | null }) {
  const store = useStore();
  const nav = useNavigate();
  const found = editId ? store.d.byId.get(editId) : undefined;
  const existing = found?.kind === 'essay' ? found : undefined;
  const [id] = useState(() => existing?.id ?? `essay-u${Date.now().toString(36)}`);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState((existing?.body ?? []).join('\n\n'));
  // the photo lives in IndexedDB ('idb:<id>'); an older one may still be a data URL in the record
  const raw = store.extras.find((w) => w.id === editId)?.cover;
  const [photo, setPhoto] = useState<{ src: string; aspect: number } | null>(raw ? { src: raw.medium, aspect: raw.aspect } : null);
  const photoUrl = useImageSrc(photo?.src);
  const file = useRef<HTMLInputElement>(null);
  // saving is idempotent by content: 「完成」 and the unmount both call it (and StrictMode's dev remount)
  const sig = JSON.stringify([title, body, photo?.src ?? '']);
  const saved = useRef(sig);
  // a new essay that got words: once the page is gone, a quiet way to drop it
  const keptNew = useRef(false);
  // an existing essay saved with nothing left: once the page is gone, a way to put it back
  const dropped = useRef(false);

  const save = () => {
    if (saved.current === sig) return;
    const paras = toParagraphs(body);
    const plan = essayPlan({ existing: !!existing, title, paragraphs: paras, photo: !!photo });
    if (plan === 'skip') return;
    saved.current = sig;
    if (plan === 'drop') {
      dropped.current = true;
      store.removeWork(id);
      return;
    }
    dropped.current = false;
    if (!existing) { keptNew.current = true; noteLanding(id); }
    const date = existing?.finished ?? todayISO();
    const w: Work = {
      id, kind: 'essay', title: title.trim(), credits: [], finished: date, collected: existing?.collected ?? date, source: 'manual',
      cover: photo ? { thumb: photo.src, medium: photo.src, aspect: photo.aspect } : null,
      genres: [], info: [], body: essayBody(title, paras),
    };
    store.saveEssay(w);
  };
  useSaveOnLeave(save, () => {
    if (keptNew.current) store.toast('随笔收好了', { label: '不要了', run: () => store.removeWork(id) });
    else if (dropped.current) store.toast('这篇随笔删掉了', { label: '撤销', run: () => store.restoreWork(id) });
  });
  // the unmount saves too (and, for a new essay, leaves the footnote); saving before going back lets
  // 随笔 know which row to land as it renders (P1-5)
  const leave = () => { save(); history.state?.idx > 0 ? nav(-1) : nav('/'); };
  useEscLeaves(leave);
  // opened from 「写一篇」: the page unfolds out of the button's box (a clip, the text is never scaled),
  // and the caret appears once it is open (P1-5)
  const sheet = useRef<HTMLDivElement>(null);
  const [from] = useState(takeOpenFrom);
  useEffect(() => {
    const el = sheet.current, ta = el?.querySelector<HTMLTextAreaElement>('.editor-body');
    if (!el || !from) { ta?.focus({ preventScroll: true }); return; }
    const { innerWidth: w, innerHeight: h } = window;
    const inset = `inset(${from.top}px ${w - from.right}px ${h - from.bottom}px ${from.left}px round ${from.height / 2}px)`;
    const a = el.animate([{ clipPath: inset }, { clipPath: 'inset(0 0 0 0 round 0px)' }], { duration: M.base, easing: EASE.out });
    a.finished.then(() => ta?.focus({ preventScroll: true }), () => undefined);
    return () => a.cancel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="editor" ref={sheet}>
      <EditorHead onBack={leave} />
      <input className="editor-title" placeholder="标题（可以不写）" aria-label="标题" value={title} onChange={(e) => setTitle(e.target.value)} />
      {photo && (
        <figure className="editor-photo">
          {photoUrl && <img src={photoUrl} alt="" />}
          <button className="icon-btn" aria-label="去掉图片" onClick={() => setPhoto(null)}><X strokeWidth={1.5} /></button>
        </figure>
      )}
      <textarea className="editor-body" placeholder="写点什么" aria-label="正文" value={body} onChange={(e) => setBody(e.target.value)} />
      <EditorBar>
        <button className="icon-btn" aria-label="图片" onClick={() => file.current?.click()}><Image strokeWidth={1.5} /></button>
        <input
          ref={file} type="file" accept="image/*" hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            const im = f && await storePicture(f);
            if (im) setPhoto({ src: im.src, aspect: im.aspect }); else if (f) store.toast('这张图片读不出来，换一张再试');
          }}
        />
        <MentionLine text={`${title}\n${body}`} selfId={id} />
        <button className="btn-text" onClick={leave}>完成</button>
      </EditorBar>
    </div>
  );
}

function Thumb({ im, onRemove, onOpen }: { im: UserImage; onRemove: () => void; onOpen: (url: string) => void }) {
  const url = useImageSrc(im.src);
  return (
    <figure className="note-thumb">
      <button className="note-open" aria-label="看大图" onClick={() => url && onOpen(url)}>{url && <img src={url} alt="" />}</button>
      <button className="note-x" aria-label="去掉这张图片" onClick={onRemove}><span><X size={12} strokeWidth={1.5} /></span></button>
    </figure>
  );
}


function WorkNoteEditor({ work }: { work: Work }) {
  const store = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const fromEntry = (loc.state as { from?: string } | null)?.from === 'entry';
  const note = store.notes[work.id];
  const [body, setBody] = useState((note?.review ?? work.review ?? []).join('\n\n'));
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quote, setQuote] = useState('');
  const [dateKey, setDateKey] = useState(0);
  const [dating, setDating] = useState(false);
  const [dateAt, setDateAt] = useState<DOMRect | null>(null);
  const [big, setBig] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const images = note?.images ?? [];
  const sig = JSON.stringify([body, quote]);
  const saved = useRef(sig);
  const verb = work.kind === 'music' ? '听过' : work.kind === 'game' ? '玩过' : '看完';
  const when = work.status === 'doing' ? '' : entryWhen(work);

  const save = () => {
    if (saved.current === sig) return;
    saved.current = sig;
    const review = toParagraphs(body);
    const before = (work.review ?? []).join('\n');
    const patch: Parameters<typeof store.setNote>[1] = {};
    if (review.join('\n') !== before) patch.review = review;
    if (quote.trim()) patch.quotes = [{ id: `q-${Date.now().toString(36)}`, text: quote.trim(), date: todayISO() }, ...(note?.quotes ?? [])];
    if (Object.keys(patch).length) store.setNote(work.id, patch);
  };
  useSaveOnLeave(save);
  // pictures are kept the moment they're picked (they're in IndexedDB already); no mood, no rating (DECISIONS-r2 #14)
  const addPictures = async (fs: File[]) => {
    const room = IMAGES_PER_WORK - images.length;
    if (room <= 0) return;
    const got = (await Promise.all(fs.slice(0, room).map(storePicture))).filter((x): x is UserImage => !!x);
    if (got.length) store.setNote(work.id, { images: [...images, ...got] });
    if (got.length < Math.min(fs.length, room)) store.toast('这张图放不进来，换一张再试');
  };
  const removePicture = (im: UserImage) => {
    store.setNote(work.id, { images: images.filter((x) => x.id !== im.id) });
    void deleteImage(im.id);
  };
  // back to the entry it was opened from; from anywhere else (the 「写」 toast on home) the entry opens
  const leave = () => { save(); fromEntry && history.state?.idx > 0 ? nav(-1) : nav(`/entry/${work.id}`, { replace: true }); };
  useEscLeaves(leave);
  const [tw, th] = thumbSize(work, 32);

  return (
    <div className="editor">
      <EditorHead onBack={leave} />
      <header className="editor-work">
        <Cover work={work} w={tw} h={th} paperPlaceholder />
        <div>
          <div className="t-label c-3">写几句</div>
          <div className="editor-work-title ellipsis">{work.kind === 'essay' ? work.title : `《${work.title}》`}</div>
        </div>
      </header>
      <textarea className="editor-body" placeholder="写点什么，可以不写" aria-label="短评" autoFocus value={body} onChange={(e) => setBody(e.target.value)} />
      {quoteOpen && (
        <textarea className="editor-quote" placeholder="摘一句" aria-label="摘抄" rows={3} autoFocus value={quote} onChange={(e) => setQuote(e.target.value)} />
      )}
      {images.length > 0 && (
        <div className="note-thumbs" aria-label="图片">
          {images.map((im) => <Thumb key={im.id} im={im} onRemove={() => removePicture(im)} onOpen={setBig} />)}
        </div>
      )}
      <EditorBar>
        <div className="editor-tools">
          {/* 摘抄 · 图片 · 看完 …, in that order; no mood (v0.4 §3.19.4) */}
          <button className="btn-text quiet" disabled={quoteOpen} onClick={() => setQuoteOpen(true)}>摘抄</button>
          <button className="btn-text quiet" disabled={images.length >= IMAGES_PER_WORK} onClick={() => file.current?.click()}>图片</button>
          <input
            ref={file} type="file" accept="image/*" multiple hidden
            onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void addPictures(fs); }}
          />
          {when && <button className="btn-text quiet" onClick={(e) => { setDateAt(e.currentTarget.getBoundingClientRect()); setDateKey((k) => k + 1); setDating(true); }}>{verb} {when}</button>}
        </div>
        <MentionLine text={body} selfId={work.id} />
        <button className="btn-text" onClick={leave}>完成</button>
      </EditorBar>
      {dateKey > 0 && <DateSheet key={dateKey} works={[work]} open={dating} anchor={dateAt} onClose={() => setDating(false)} />}
      {big && <CoverViewer work={{ ...work, coverBroken: false, cover: { thumb: big, medium: big, aspect: 1 } }} onClose={() => setBig(null)} />}
    </div>
  );
}

