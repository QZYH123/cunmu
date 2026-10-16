import { reduced, waitFor, withViewTransition } from './motion';

/**
 * S2 return flight (§7.3, 440ms): leaving an entry whose hero cover can fly, run `go` inside a view
 * transition and, once the previous page has restored, name the tile / cover it came from as the
 * flight target. If that source is not on screen, the transition is a plain crossfade.
 */
let flying = false;
export function flyBack(id: string, go: () => void) {
  let target: HTMLElement | null = null;
  flying = true;   // the in-app back's own popstate must reach the router untouched
  return withViewTransition(async () => {
    go();
    const src = await waitFor(() => document.querySelector<HTMLElement>(`.tile[data-id="${CSS.escape(id)}"], [data-fly-src="${CSS.escape(id)}"]`));
    if (!src) return;
    const r = src.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return;
    target = src.querySelector<HTMLElement>('img') ?? src.querySelector<HTMLElement>('.cover') ?? src;
    target.style.viewTransitionName = 'hero-cover';
  }, 'back').then(() => { flying = false; if (target) target.style.viewTransitionName = ''; });
}

/** The entry hero currently on screen that can fly back, if any. */
export const flyableHero = () => document.querySelector<HTMLElement>('.hero-cover[data-fly]')?.dataset.fly ?? null;

const REPLAY = Symbol('cunmu-replayed-pop');
type Replayed = PopStateEvent & { [REPLAY]?: true };

/**
 * Browser back / forward on desktop (polish r2): the router hears popstate and re-renders at once,
 * before a view transition could snapshot the old page. This capture listener is registered before
 * the router's (main.tsx imports it first). When the page being left is a flyable entry, it holds
 * the event back, starts the transition (which snapshots the entry as it is), and replays the same
 * popstate inside the transition's update so the router renders the previous page there. Fine
 * pointers only: touch browsers run their own swipe-back animation, and two would fight.
 */
export function installBackFlight() {
  if (typeof window === 'undefined') return;
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const vt = 'startViewTransition' in document;
  window.addEventListener('popstate', (e: Replayed) => {
    if (e[REPLAY] || flying || !vt || !fine.matches || reduced()) return;
    const id = flyableHero();
    if (!id) return;
    e.stopImmediatePropagation();
    const state = e.state;
    flyBack(id, () => {
      const again = new PopStateEvent('popstate', { state }) as Replayed;
      again[REPLAY] = true;
      window.dispatchEvent(again);
    });
  }, { capture: true });
}
installBackFlight();
