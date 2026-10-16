import { Link, type LinkProps } from 'react-router-dom';
import { useFly } from './CoverWall';

/**
 * A link around a cover that flies into the entry's hero (S2, MOTION-SPEC P1-3) and is where the
 * cover flies back to (data-fly-src). Without a .cover inside it is a plain page transition.
 */
export function FlyLink({ id, onClick, ...rest }: LinkProps & { id: string }) {
  const fly = useFly();
  return <Link {...rest} data-fly-src={id} onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) fly(e, id); }} />;
}
