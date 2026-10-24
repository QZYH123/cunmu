/**
 * The card page. What it draws always comes from outwardView — never from the owner's private lists,
 * and never by turning 给人看 on. Arrangement A is the only one painted; B and C stay switched off.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DEMO } from '@demo';
import { useStore } from '../data/store';
import { outwardView } from '../data/visible';
import { computeTaste } from '../data/taste/engine';
import { peopleStatus } from '../data/taste/people';
import { HINT } from '../data/taste/copy';
import { buildCardModel, cardWorkCount, CARD_MIN_WORKS } from '../data/card/model';
import { previewNote } from '../data/card/fit';
import { buildCaption } from '../data/card/caption';
import { CARD_H, CARD_W } from '../data/card/metrics';
import { CARD_ALT, CARD_DRAWING, CARD_PREPARING, CARD_SAVE, COPY_CAPTION, COPY_FAIL, COPY_IMAGE, COPY_IMAGE_FAIL, COPY_OK } from '../data/card/copy';
import { APP_VERSION } from '../lib/native';
import { todayISO } from '../lib/today';
import { copyText } from '../lib/diagnostics';
import { imageTarget, saveImageOut } from '../lib/saveOut';
import { canCopyImage, cardFailToast, cardFileName, copyImage, drawCard, prefetchCovers, savedToast } from '../lib/cardOut';
import { Seg } from './Bits';
import { TopBar } from './Shell';
import CardView, { type FitState } from './CardView';

export default function CardSheet() {
  const store = useStore();
  const { library, me, bangumi, connections } = store;
  const today = todayISO();
  const view = useMemo(() => outwardView(library, me, today), [library, me, today]);
  const people = useMemo(
    () => peopleStatus(view.works, bangumi ?? null, connections.bangumi ?? undefined, DEMO),
    [view.works, bangumi, connections.bangumi],
  );
  const taste = useMemo(
    () => computeTaste({ works: view.works, periods: view.periods, today, people }),
    [view.works, view.periods, today, people],
  );
  const model = useMemo(() => buildCardModel({
    view, taste, prefs: me.taste, card: me.card,
    title: (store.title ?? '').trim(),
    line: (me.profile.line ?? '').trim(),
    today, version: APP_VERSION,
  }), [view, taste, me.taste, me.card, me.profile.line, store.title, today]);

  const few = cardWorkCount(view.works) < CARD_MIN_WORKS;
  const [fit, setFit] = useState<FitState>({ drop: 0, done: false });
  const [covers, setCovers] = useState<ReadonlyMap<string, string>>(new Map());
  const [coversReady, setCoversReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const onFit = (next: FitState) => setFit((prev) => (prev.drop === next.drop && prev.done === next.done ? prev : next));

  const coverKey = model.favs.map((f) => `${f.workId}:${f.cover ? 1 : 0}`).join('|');
  useEffect(() => {
    let live = true;
    setCoversReady(false);
    void prefetchCovers(model.favs.map((f) => ({ workId: f.workId, url: f.cover })))
      .then((map) => { if (live) { setCovers(map); setCoversReady(true); } })
      .catch(() => { if (live) { setCovers(new Map()); setCoversReady(true); } });
    return () => { live = false; };
  }, [model.key, coverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const frame = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setK(el.clientWidth > 0 ? el.clientWidth / CARD_W : 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [few]);

  const caption = buildCaption(model);
  const ready = fit.done && coversReady && !few;
  const note = fit.done ? previewNote(fit.drop, 'A', model.notes, HINT.people, HINT.more) : null;
  const blobKey = `${model.key}|${fit.drop}|${[...covers.keys()].sort().join('|')}`;
  const blobRef = useRef<{ key: string; blob: Blob } | null>(null);

  const ensureBlob = async () => {
    if (blobRef.current?.key === blobKey) return blobRef.current.blob;
    const blob = await drawCard(model, { startDrop: fit.drop, covers });
    blobRef.current = { key: blobKey, blob };
    return blob;
  };

  const save = async () => {
    if (!ready || drawing) return;
    setDrawing(true);
    try {
      const blob = await ensureBlob();
      const result = await saveImageOut(blob, cardFileName(today));
      if (result === 'done') store.toast(savedToast(imageTarget()));
    } catch (err) {
      store.toast(cardFailToast(err));
    } finally {
      setDrawing(false);
    }
  };

  const copyCaption = async () => {
    if (!caption) return;
    store.toast(await copyText(caption) ? COPY_OK : COPY_FAIL);
  };

  const copyPic = async () => {
    if (!ready || drawing) return;
    setDrawing(true);
    try {
      const blob = await ensureBlob();
      store.toast(await copyImage(blob) ? COPY_OK : COPY_IMAGE_FAIL);
    } catch (err) {
      store.toast(cardFailToast(err));
    } finally {
      setDrawing(false);
    }
  };

  const showCopy = canCopyImage();

  return (
    <div className="page">
      <TopBar />
      <div className="page-x under-bar">
        {few ? <p className="card-empty t-caption c-3">{HINT.more}</p> : (
          <>
            <div className="card-frame" ref={frame}>
              <div className="card-scale" role="img" aria-label={caption || CARD_ALT} style={{ width: CARD_W * k, height: CARD_H * k }}>
                <div className="card-zoom" style={{ transform: `scale(${k})` }}>
                  <CardView model={model} covers={covers} onFit={onFit} />
                </div>
              </div>
            </div>
            {note && <p className="card-note t-caption c-3">{note}</p>}
            <div className="card-controls">
              <div className="seg" role="tablist" aria-label="版式">
                <button type="button" role="tab" aria-selected data-v="A" className="on" onClick={() => store.setCardPrefs({ layout: 'A' })}>A</button>
                <button type="button" role="tab" aria-selected={false} data-v="B" disabled>B</button>
                <button type="button" role="tab" aria-selected={false} data-v="C" disabled>C</button>
              </div>
              <Seg
                ariaLabel="配色"
                value={me.card.theme}
                onChange={(theme) => store.setCardPrefs({ theme })}
                options={[{ value: 'light' as const, label: '浅' }, { value: 'dark' as const, label: '深' }]}
              />
            </div>
            <div className="card-actions">
              <button type="button" className="btn btn-primary" disabled={!ready || drawing} onClick={() => void save()}>
                {drawing ? CARD_DRAWING : ready ? CARD_SAVE : CARD_PREPARING}
              </button>
              {caption && <button type="button" className="btn btn-secondary" onClick={() => void copyCaption()}>{COPY_CAPTION}</button>}
              {showCopy && <button type="button" className="btn btn-secondary" disabled={!ready || drawing} onClick={() => void copyPic()}>{COPY_IMAGE}</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
