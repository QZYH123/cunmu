import { paperVar } from '../lib/hash';
import { inkOf, spineVars } from '../lib/spine';
import type { SpineColour } from '../lib/spineCore.js';
import { type Dress, type SpineLook, type SpineSet } from '../lib/shelf';
import { SHELF } from '../tokens';
import { SpineTitle } from './SpineTitle';

/**
 * One spine (r6 colour, r8 material, r17 title and dress): the work's own colour or paper, dressed as its kind
 * — a cloth or paperback book, a slim film case with its numbered band, a game case with its strip, a disc
 * case with a clear banner — and its title set on it.
 */
export function SpineBody({ set, dress, c, look, grain, className = '' }: {
  set: SpineSet; dress: Dress; c: SpineColour | null | undefined; look: SpineLook; grain?: [number, number]; className?: string;
}) {
  const ink = c ? inkOf(c) : null;
  const foil = dress.foil && !!c && ink === 'light' && c.l <= SHELF.dress.book.foilMaxL;
  const cls = ['yspine', c ? `ink-${ink}` : 'paper', `look-${look}`, `kind-${dress.kind}`, ...dress.cls, foil ? 'foil' : '', className].filter(Boolean).join(' ');
  return (
    <span
      className={cls}
      style={{
        width: set.w, height: set.h, '--rt': `${dress.top}px`, '--rf': `${dress.foot}px`,
        ...(grain ? { '--gx': `${grain[0]}px`, '--gy': `${grain[1]}px` } : null),
        ...(c ? spineVars(c) : { '--paper': paperVar(set.id) }),
      } as unknown as React.CSSProperties}
    >
      {dress.orn.map((o, i) => (
        <span key={i} className={`yo yo-${o.k} ${o.at ?? ''} ${o.tone ?? ''}`} style={o.h ? { height: o.h } : undefined} aria-hidden>
          {o.mark && <span className="yo-mark">{o.mark}</span>}
        </span>
      ))}
      <SpineTitle text={set.text} />
    </span>
  );
}
