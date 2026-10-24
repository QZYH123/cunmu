/**
 * The card, arrangement A, at 540×720. The preview scales this node; the export draws the same node.
 * B and C are named by the model and not painted yet. Covers are data URLs already read, or words.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Work } from '../data/types';
import type { CardFav, CardModel } from '../data/card/model';
import { applyDrops, maxDrops } from '../data/card/fit';
import { favSlot, MID_H } from '../data/card/metrics';
import { LiteralCover } from './Cover';

export interface FitState { drop: number; done: boolean }

interface Props {
  model: CardModel;
  covers?: ReadonlyMap<string, string>;
  startDrop?: number;
  onFit?: (fit: FitState) => void;
  exportMode?: boolean;
}

function cardText(m: CardModel): string {
  return [
    m.headline ?? '', m.lead ?? '', m.top.byline ?? '', m.top.since ?? '', m.badge?.version ?? '', m.badge?.month ?? '',
    ...m.lines.flatMap((l) => [l.label, l.text, l.short ?? '']),
    ...m.periods.map((p) => p.text),
    ...m.favs.flatMap((f) => [f.title, f.author ?? '', f.why ?? '']),
    '存目此生最爱始于共部制长情停留常遇见转向',
  ].join('');
}

/** Load the faces the card actually uses, then say so. A new text starts the wait again. */
function useCardFonts(text: string): boolean {
  const [ready, setReady] = useState('');
  useEffect(() => {
    let live = true;
    const families = ['"Noto Serif SC"', '"Source Serif 4"'];
    const sizes = [32, 16, 14, 13, 12, 10];
    const weights = [500, 600];
    const jobs = families.flatMap((family) => sizes.flatMap((px) => weights.map((w) => document.fonts.load(`${w} ${px}px ${family}`, text).catch(() => undefined))));
    void Promise.all([document.fonts.ready, ...jobs]).then(() => { if (live) setReady(text); });
    return () => { live = false; };
  }, [text]);
  return ready === text;
}

function useFit(model: CardModel, fontsOk: boolean, startDrop: number, mid: RefObject<HTMLDivElement | null>): FitState {
  const sig = `${model.key}|${fontsOk ? 1 : 0}|${startDrop}`;
  const [st, setSt] = useState<FitState & { sig: string }>({ sig, drop: startDrop, done: false });
  let cur = st;
  if (st.sig !== sig) { cur = { sig, drop: startDrop, done: false }; setSt(cur); }
  useLayoutEffect(() => {
    const el = mid.current;
    if (!el || !fontsOk || cur.sig !== sig) return;
    const over = el.scrollHeight > MID_H + 0.5;
    if (over && cur.drop < maxDrops(model)) { setSt({ sig, drop: cur.drop + 1, done: false }); return; }
    if (over) { console.warn('card mid overflow', model.key); el.dataset.overflow = '1'; }
    else delete el.dataset.overflow;
    if (!cur.done) setSt({ sig, drop: cur.drop, done: true });
  }, [cur.drop, cur.sig, sig, fontsOk, model, mid]);
  return { drop: cur.drop, done: cur.done && fontsOk };
}

function stub(f: CardFav): Work {
  return {
    id: f.workId, kind: f.kind, title: f.title,
    credits: f.author ? [{ name: f.author, role: '作者', core: true }] : [],
    finished: '', collected: '', source: 'manual', cover: null, genres: [], info: [],
  };
}

export default function CardView({ model, covers, startDrop = 0, onFit, exportMode }: Props) {
  const basis = useMemo(() => (model.layout === 'A' ? model : { ...model, layout: 'A' as const }), [model]);
  const fontsOk = useCardFonts(cardText(basis));
  const mid = useRef<HTMLDivElement>(null);
  const fit = useFit(basis, fontsOk, startDrop, mid);
  const shown = applyDrops(basis, fit.drop);
  const onFitRef = useRef(onFit);
  onFitRef.current = onFit;
  useEffect(() => { onFitRef.current?.({ drop: fit.drop, done: fit.done }); }, [fit.drop, fit.done]);

  const left = [shown.top.byline, '存目', shown.top.since != null ? `始于 ${shown.top.since} 年` : ''].filter(Boolean).join(' · ');
  const total = shown.top.total;
  const slot = favSlot(shown.favs.length);

  return (
    <article className="card" data-theme={shown.theme} data-layout="A" data-fit={fit.done ? 'done' : 'wait'} data-export={exportMode ? '1' : undefined}>
      <div className="card-top">
        <span>{left}</span>
        {total != null && <span>共 {total.toLocaleString('en-US')} 部</span>}
      </div>
      <div className="card-rule card-rule-mid" />
      <div className="card-mid" ref={mid}>
        {shown.headline && <p className="card-headline clamp-2">{shown.headline}</p>}
        {shown.lines.length > 0 && (
          <div className="card-lines">
            {shown.lines.map((line) => (
              <div className="card-line" key={`${line.dim}:${line.tid}`}>
                <span className="card-line-label">{line.label}</span>
                <span className="card-line-text clamp-2">{line.text}</span>
              </div>
            ))}
          </div>
        )}
        {shown.lines.length === 0 && shown.lead && <p className="card-leadline clamp-2">{shown.lead}</p>}
        {shown.periods.length > 0 && (
          <div className="card-periods">
            {shown.periods.map((p) => <p className="card-period clamp-2" key={p.id}>{p.text}</p>)}
          </div>
        )}
      </div>
      <div className="card-rule card-rule-fav" />
      {shown.favs.length > 0 && (
        <div className="card-favs">
          <div className="card-fav-label">此生最爱</div>
          <div className="card-fav-row">
            {shown.favs.map((f) => {
              const src = covers?.get(f.workId);
              return (
                <div className="card-slot" key={f.workId} style={{ width: slot.w, height: slot.h }}>
                  {src ? <img src={src} alt="" /> : <LiteralCover work={stub(f)} w={slot.w} h={slot.h} />}
                </div>
              );
            })}
            {shown.favs.length === 1 && shown.favs[0].why && <p className="card-why clamp-2">{shown.favs[0].why}</p>}
          </div>
        </div>
      )}
      <div className="card-rule card-rule-mark" />
      <footer className="card-mark" data-badge="" data-on={shown.badge ? '1' : '0'}>
        <span>{shown.badge ? `存目 ${shown.badge.version}` : ''}</span>
        <span>{shown.badge ? `${shown.badge.month}制` : ''}</span>
      </footer>
    </article>
  );
}
