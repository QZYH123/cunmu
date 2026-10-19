import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './Bits';
import { Cover, thumbSize } from './Cover';
import { useStore } from '../data/store';
import type { CoverImage, Work } from '../data/types';
import { MAKER, makerOf, sourceLabelOf } from '../data/types';
import { putImage, shrinkToBlob } from '../lib/images';

/**
 * 补封面、作者 (r7 sim #3): what 「只用名字放进来」 promised — 「封面、作者以后能补上」. For a work of yours
 * (typed, pasted, from 豆瓣): its name, its maker, and a picture of your own as its cover. Nothing is
 * saved until 好了; the picture lives in this device's image store and goes into your export.
 * A synced work (Bangumi, 微信读书) takes the same edits as overrides that later syncs leave alone; where a
 * field differs from the source, a quiet line under it says what the source has, with 「恢复原样」.
 */
export { MAKER };

export function EditWorkSheet({ work, open, onClose }: { work: Work; open: boolean; onClose: () => void }) {
  const store = useStore();
  const src = store.sourceValues(work.id);
  const from = sourceLabelOf(work);
  const core = makerOf(work);
  const [title, setTitle] = useState(work.title);
  const [maker, setMaker] = useState(core?.name ?? '');
  const [pic, setPic] = useState<{ blob: Blob; aspect: number; url: string } | null>(null);
  const [drop, setDrop] = useState(false);
  /** 恢复原样 on the cover: back to the source's (saved on 好了) */
  const [back, setBack] = useState(false);
  const [err, setErr] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setTitle(work.title); setMaker(makerOf(work)?.name ?? ''); setPic(null); setDrop(false); setBack(false); setErr(false);
  }, [open, work]);
  useEffect(() => () => { if (pic) URL.revokeObjectURL(pic.url); }, [pic]);

  const baseCover = back && src ? src.cover : work.cover;
  const hasCover = !!baseCover && !(work.coverBroken && !back) && !drop;
  // the preview: the picture just chosen, else the one it has, else its paper cover with the name as typed
  const preview = useMemo<Work>(() => ({
    ...work, title: title.trim() || work.title, coverBroken: back ? false : work.coverBroken,
    cover: pic ? { thumb: pic.url, medium: pic.url, aspect: pic.aspect } : drop ? null : baseCover,
  }), [work, title, pic, drop, baseCover, back]);
  // a synced work whose cover is yours (or none) right now, compared with the source's
  const coverChanged = !!src && (pic !== null || drop || (!back && store.notes[work.id]?.coverOverride !== undefined));
  const [pw, ph] = thumbSize(preview, 72);

  const choose = async (f: File | undefined) => {
    if (!f) return;
    try {
      const { blob, aspect } = await shrinkToBlob(f, 720);
      setPic({ blob, aspect, url: URL.createObjectURL(blob) }); setDrop(false); setErr(false);
    } catch { setErr(true); }
  };
  const save = async () => {
    let cover: CoverImage | null | undefined;
    if (pic) {
      const id = `cover-${work.id}-${Date.now().toString(36)}`;
      await putImage(id, pic.blob);
      cover = { thumb: `idb:${id}`, medium: `idb:${id}`, aspect: pic.aspect };
    } else if (drop) cover = null;
    store.editWork(work.id, {
      title, creator: { name: maker, role: MAKER[work.kind] },
      ...(cover !== undefined ? { cover } : back ? { cover: 'source' as const } : null),
    });
    onClose();
  };

  const head = src || (work.cover && !work.coverBroken) ? '改封面、主创' : '补封面、主创';
  return (
    <Sheet open={open} onClose={onClose} label={head} className="edit-sheet">
      <div className="sheet-body">
        <h2 className="t-title">{head}</h2>
        <div className="edit-cover">
          <Cover work={preview} w={pw} h={ph} paperPlaceholder className="thumb" />
          <div className="edit-cover-side">
            <div className="edit-cover-acts">
              <button className="btn-text" onClick={() => file.current?.click()}>{pic || hasCover ? '换一张' : '选一张图'}</button>
              {(pic || hasCover) && <button className="btn-text quiet" onClick={() => { setPic(null); setDrop(!!baseCover); }}>不用图</button>}
            </div>
            <p className="t-caption c-3">{err ? '这张图读不出来，换一张试试。' : '用你自己拍的或存下的图，只放在这台设备和你的导出里。'}</p>
            {coverChanged && (
              <p className="t-caption c-3 edit-source">
                {src!.cover ? `${from} 上有封面` : `${from} 上没有封面`}<span aria-hidden> · </span>
                <button className="btn-text quiet" onClick={() => { setPic(null); setDrop(false); setBack(true); }}>恢复原样</button>
              </p>
            )}
          </div>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <label className="key-field plain edit-field">
          <span className="t-label c-3">名字</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="名字" autoComplete="off" />
        </label>
        {src && title.trim() && title.trim() !== src.title && <SourceSays from={from} value={src.title} onBack={() => setTitle(src.title)} />}
        <label className="key-field plain edit-field">
          <span className="t-label c-3">{MAKER[work.kind]}</span>
          <input value={maker} onChange={(e) => setMaker(e.target.value)} aria-label={MAKER[work.kind]} placeholder="不知道就空着" autoComplete="off" />
        </label>
        {src && maker.trim() !== src.maker && <SourceSays from={from} value={src.maker} onBack={() => setMaker(src.maker)} />}
        <div className="sheet-actions">
          <button className="btn btn-primary" onClick={() => void save()}>好了</button>
        </div>
      </div>
    </Sheet>
  );
}

/** under a field of a synced work: what the source has, and the way back to it */
function SourceSays({ from, value, onBack }: { from: string; value: string; onBack: () => void }) {
  return (
    <p className="t-caption c-3 edit-source">
      {value ? `${from} 上是「${value}」` : `${from} 上没有写`}<span aria-hidden> · </span>
      <button className="btn-text quiet" onClick={onBack}>恢复原样</button>
    </p>
  );
}
