import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { creatorLine, whenOf } from '../data/derive';
import type { Work } from '../data/types';
import { Preview, WorkPreviewBody } from './Bits';
import { isDesktop } from '../lib/native';
import { decodePart } from '../lib/decode';

/** Desktop right-click on a cover or a work row opens the long-press card (P2-6, §8.5). */
const FINE = '(hover: hover) and (pointer: fine)';

/** The work a context-menu event points at: an element marked data-ctx, else a link to an entry. */
function targetOf(t: EventTarget | null): { id: string; el: HTMLElement } | null {
  const node = t instanceof Element ? t : null;
  const marked = node?.closest<HTMLElement>('[data-ctx]');
  if (marked) return { id: marked.dataset.ctx!, el: marked };
  const a = node?.closest<HTMLAnchorElement>('a[href*="#/entry/"]');
  if (!a) return null;
  const id = decodePart(a.getAttribute('href')!.split('#/entry/')[1]?.split(/[?#]/)[0] ?? '');
  return id ? { id, el: a } : null;
}

/** The same actions as a long press, plus what the native menu would have offered: a new tab. */
export const workActions = (w: Work, nav: (to: string) => void, close: () => void, onWallView?: (w: Work) => void) => [
  { label: '打开', run: () => { close(); nav(`/entry/${w.id}`); } },
  { label: '在整面墙里看', run: () => { close(); onWallView ? onWallView(w) : nav(`/wall?at=${w.id}`); } },
  ...(matchMedia(FINE).matches && !isDesktop() ? [{ label: '新标签页打开', run: () => { close(); window.open(`#/entry/${w.id}`, '_blank', 'noopener'); } }] : []),
];
const doneVerb = (w: Work) => (w.kind === 'music' ? '听过' : w.kind === 'game' ? '玩过' : w.kind === 'essay' ? '写' : '看完');
export const workMeta = (w: Work) => [creatorLine(w), w.finished ? `${whenOf(w, 'ym')} · ${doneVerb(w)}` : ''].filter(Boolean).join(' · ');

export function ContextPreview() {
  const { d, show } = useStore();
  const nav = useNavigate();
  const [card, setCard] = useState<{ work: Work; at: DOMRect; el: HTMLElement; keyboard: boolean } | null>(null);
  useEffect(() => {
    const on = (e: MouseEvent) => {
      // a component that handles its own (wall tiles, prose links) already took it; Shift keeps the native menu
      // 给人看: a guest gets the page, not the owner's card of actions
      if (e.defaultPrevented || e.shiftKey || show || !matchMedia(FINE).matches) return;
      const t = targetOf(e.target);
      const work = t && d.byId.get(t.id);
      if (!t || !work) return;
      e.preventDefault();
      // the menu key / Shift+F10 reports no pointer: anchor to the element instead
      const keyboard = e.button !== 2 || (e.clientX === 0 && e.clientY === 0);
      setCard({ work, at: keyboard ? t.el.getBoundingClientRect() : new DOMRect(e.clientX, e.clientY, 0, 0), el: t.el, keyboard });
    };
    document.addEventListener('contextmenu', on);
    return () => document.removeEventListener('contextmenu', on);
  }, [d, show]);
  // the source stays "held" (its hover state) while its card is open, like the lifted tile on the wall
  useEffect(() => {
    if (!card) return;
    card.el.classList.add('held');
    const close = () => setCard(null);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => { card.el.classList.remove('held'); window.removeEventListener('scroll', close); window.removeEventListener('resize', close); };
  }, [card]);
  if (!card) return null;
  const close = () => setCard(null);
  return (
    <Preview anchor={card.at} onClose={close} focusFirst={card.keyboard} actions={workActions(card.work, nav, close)}>
      <WorkPreviewBody work={card.work} meta={workMeta(card.work)} />
    </Preview>
  );
}
