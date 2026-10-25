/**
 * 偏爱 on the home page. Own mode can edit; a guest sees the sentences that stayed, and nothing else.
 * The count that enables 做成名片 is the outward one, so a private work never opens the card.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { outwardView } from '../data/visible';
import { HINT } from '../data/taste/copy';
import { DIM_LABEL, nextTid, sheetDims } from '../data/taste/pick';
import type { Dim, Evidence, Sentence, TemplateId } from '../data/taste/types';
import { CARD_MIN_WORKS, cardWorkCount } from '../data/card/model';
import { useMeView } from './MeParts';
import { Sheet } from './Bits';

function evidenceRows(list: readonly Evidence[]): Evidence[] {
  return [...list].sort((a, b) => {
    if (a.year == null && b.year == null) return a.title.localeCompare(b.title, 'zh');
    if (a.year == null) return 1;
    if (b.year == null) return -1;
    return a.year - b.year || a.title.localeCompare(b.title, 'zh');
  }).slice(0, 6);
}

function evidenceLine(e: Evidence): string {
  if (e.note) return `《${e.title}》 · ${e.note}`;
  if (e.year != null) return `《${e.title}》 · ${e.year} 年`;
  return `《${e.title}》`;
}

function EvidenceList({ list, head, link }: { list: readonly Evidence[]; head?: string; link: boolean }) {
  const rows = evidenceRows(list);
  if (!rows.length) return null;
  const dated = rows.some((e) => e.year != null);
  return (
    <div className="taste-ev t-caption">
      <p>这句话是这么数出来的</p>
      {head && <p>{head}</p>}
      <ul>
        {rows.map((e) => (
          <li key={e.id}>
            {link ? <Link to={`/entry/${e.id}`}>{evidenceLine(e)}</Link> : evidenceLine(e)}
          </li>
        ))}
      </ul>
      {dated && <p className="c-3">{HINT.dated}</p>}
    </div>
  );
}

/** Z7. The owner can read it; it never wears the 转向 label, and a guest never sees it. */
function HollowLine({ sentence }: { sentence: Sentence | null }) {
  const [open, setOpen] = useState(false);
  if (!sentence) return null;
  const evidence = sentence.evidence;
  const canOpen = evidence.length > 0;
  return (
    <div className="taste-hollow">
      {canOpen ? (
        <button type="button" className="taste-sentence" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {sentence.text}
        </button>
      ) : <p className="taste-sentence">{sentence.text}</p>}
      {open && <EvidenceList list={evidence} head={sentence.head} link />}
    </div>
  );
}

function TasteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const { taste } = useMeView();
  const dims = sheetDims(taste, store.me.taste);
  return (
    <Sheet open={open} onClose={onClose} label="偏爱">
      <h2 className="t-title">偏爱</h2>
      {dims.map((dim) => {
        const pref = store.me.taste.rows[dim];
        const cands = taste.rows[dim];
        const own = !!pref?.text;
        const current = own ? null : (pref?.pick ? cands.find((s) => s.tid === pref.pick) ?? cands[0] : cands[0]);
        const off = pref?.off === true;
        const next = nextTid(cands, (current?.tid ?? pref?.pick ?? null) as TemplateId | null);
        return (
          <div className="taste-sheet-row" key={dim}>
            <div className="taste-head">
              <span className="t-label c-3">{DIM_LABEL[dim]}</span>
              <button type="button" className="taste-switch" role="switch" aria-checked={!off} onClick={() => store.setTasteRow(dim, { off: !off })}>
                <span className="t-ui">{off ? '不留' : '留着'}</span>
                <i className={`switch ${off ? '' : 'on'}`} />
              </button>
            </div>
            {!own && cands.length > 1 && next && (
              <button type="button" className="btn-text quiet" onClick={() => store.setTasteRow(dim, { pick: next })}>换一句</button>
            )}
            <input
              className="ask-field ask-field-quiet" aria-label="自己写" value={pref?.text ?? ''}
              onChange={(e) => store.setTasteRow(dim, { text: e.target.value })}
            />
            {own && <button type="button" className="btn-text quiet" onClick={() => store.setTasteRow(dim, { text: null })}>改回按记录写的</button>}
            {!own && current && <EvidenceList list={current.evidence} head={current.head} link />}
          </div>
        );
      })}
      <button type="button" className="btn btn-secondary taste-done" onClick={onClose}>好了</button>
    </Sheet>
  );
}

export function TasteBlock({ mode }: { mode: 'own' | 'outward' }) {
  const store = useStore();
  const nav = useNavigate();
  const view = useMeView();
  const [sheet, setSheet] = useState(false);
  const [openDim, setOpenDim] = useState<Dim | null>(null);
  const guestCount = useMemo(
    () => cardWorkCount(outwardView(store.library, store.me, view.today).works),
    [store.library, store.me, view.today],
  );
  const tooFew = guestCount < CARD_MIN_WORKS;

  if (mode === 'outward') {
    const kept = view.rows.filter((row) => row.sentence && !row.off);
    if (!kept.length) return null;
    return (
      <section className="taste">
        <h2 className="t-h2">偏爱</h2>
        <div className="taste-rows">
          {kept.map((row) => (
            <div className="taste-row" key={row.dim}>
              <span className="taste-key">{DIM_LABEL[row.dim]}</span>
              <p className="taste-sentence">{row.sentence?.text}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!store.me.taste.on) return null;
  if (!view.taste.gate.ok) return <p className="taste-only t-caption c-3">{HINT.more}</p>;

  const allOff = view.rows.length === 1 && !view.rows[0].sentence && view.rows[0].hint === HINT.allOff;
  if (allOff) {
    const at = HINT.allOff.indexOf('改一下');
    const before = at >= 0 ? HINT.allOff.slice(0, at) : HINT.allOff;
    const after = at >= 0 ? HINT.allOff.slice(at + '改一下'.length) : '';
    return (
      <>
        <p className="taste-only t-caption c-3">
          {before}
          <button type="button" className="btn-text quiet" onClick={() => setSheet(true)}>改一下</button>
          {after}
        </p>
        <HollowLine sentence={view.taste.hollow} />
        <TasteSheet open={sheet} onClose={() => setSheet(false)} />
      </>
    );
  }

  return (
    <section className="taste">
      <div className="taste-head">
        <h2 className="t-h2">偏爱</h2>
        <div className="taste-acts">
          <button type="button" className="btn-text quiet" onClick={() => setSheet(true)}>改一下</button>
          <span aria-hidden>　</span>
          <button type="button" className="btn-text quiet" disabled={tooFew} onClick={() => nav('/card')}>做成名片</button>
        </div>
      </div>
      {tooFew && <p className="t-caption c-3">{HINT.more}</p>}
      <div className="taste-rows">
        {view.rows.map((row) => {
          const evidence = row.sentence?.evidence ?? [];
          const canOpen = !!row.sentence && evidence.length > 0 && !row.own;
          const opened = openDim === row.dim;
          return (
            <div key={row.dim}>
              <div className="taste-row">
                <span className="taste-key">{DIM_LABEL[row.dim]}</span>
                {row.sentence ? (
                  canOpen ? (
                    <button type="button" className="taste-sentence" aria-expanded={opened} onClick={() => setOpenDim(opened ? null : row.dim)}>
                      {row.sentence.text}
                    </button>
                  ) : <p className="taste-sentence">{row.sentence.text}</p>
                ) : <p className="taste-sentence t-caption c-3">{row.hint}</p>}
              </div>
              {opened && row.sentence && <EvidenceList list={evidence} head={row.sentence.head} link />}
            </div>
          );
        })}
      </div>
      <HollowLine sentence={view.taste.hollow} />
      <TasteSheet open={sheet} onClose={() => setSheet(false)} />
    </section>
  );
}
