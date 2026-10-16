import { Link } from 'react-router-dom';
import type { Work } from '../data/types';
import { KIND_ASPECT } from '../data/types';
import { COLLAGE } from '../tokens';
import { Cover } from './Cover';
import { useFly } from './CoverWall';

const ratio = (w: Work) => (w.cover && !w.coverBroken ? Math.min(1.6, Math.max(0.6, w.cover.aspect)) : KIND_ASPECT[w.kind]);
const hOf = (w: Work, width: number) => Math.round(width / ratio(w));

/**
 * Year-page cover collage (§4.2; desktop §8.3.4) — density steps up with the count and never draws
 * empty cells. On desktop the block / tapestry tiers run edge to edge with twice the columns (more
 * on very wide screens, so a cell stays near the phone's scale), and the object tiers grow ×1.6.
 */
export function Collage({ works, width, desk = false }: { works: Work[]; width: number; desk?: boolean }) {
  const fly = useFly();
  const n = works.length;
  if (!n) return null;
  const k = desk ? COLLAGE.deskScale : 1;
  const item = (w: Work, cw: number, ch: number, cls?: string) => (
    <Link key={w.id} to={`/entry/${w.id}`} data-fly-src={w.id} aria-label={w.title} onClick={(e) => fly(e, w.id)}>
      <Cover work={w} w={cw} h={ch} className={cls} paperPlaceholder />
    </Link>
  );
  if (n === 1) {
    const w = works[0];
    const cw = Math.round(140 * k);
    return <div className="collage collage-1">{item(w, cw, hOf(w, cw))}</div>;
  }
  if (n <= 4) {
    const cw = Math.round(96 * k);
    return <div className="collage collage-row">{works.map((w) => item(w, cw, hOf(w, cw)))}</div>;
  }
  if (n <= 12) {
    const per = Math.ceil(n / 2);
    const gap = 8;
    const cw = Math.min(Math.round(72 * k), Math.floor((width - 36 - gap * (per - 1)) / per));
    const rows = [works.slice(0, per), works.slice(per)];
    return (
      <div className="collage collage-stagger">
        {rows.map((r, i) => (
          <div key={i} className="collage-row" style={{ gap, paddingLeft: i ? cw / 2 : 0 }}>
            {r.map((w) => item(w, cw, hOf(w, cw)))}
          </div>
        ))}
      </div>
    );
  }
  // Block and tapestry always fill whole rows: covers that would leave a ragged last row fold into a
  // final 「+N」 cell, so there is never an empty cell or a half row (§4.2, §6 #19).
  const solid = (cols: number, maxCells: number) => {
    const cells = Math.min(maxCells, Math.floor(n / cols) * cols);
    return n > cells ? { shown: works.slice(0, cells - 1), more: n - (cells - 1) } : { shown: works, more: 0 };
  };
  if (n <= 40) {
    // wider screens may add columns, but never so many that the collage drops below two full rows
    let cols = desk ? Math.max(COLLAGE.block.desk, Math.round(width / COLLAGE.block.cell)) : COLLAGE.block.phone;
    while (desk && cols > COLLAGE.block.desk && Math.floor(n / cols) < 2) cols--;
    const gap = desk ? 2 : 4;
    const cw = (width - gap * (cols - 1)) / cols;
    const { shown, more } = solid(cols, desk ? cols * COLLAGE.block.rows : 36);
    return (
      <div className="collage collage-block" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>
        {shown.map((w) => item(w, cw, Math.round(cw * 1.5), 'flat'))}
        {more > 0 && <div className="collage-more is-block" style={{ height: Math.round(cw * 1.5) }}>+{more}</div>}
      </div>
    );
  }
  let cols = desk ? Math.max(COLLAGE.tapestry.desk, Math.round(width / COLLAGE.tapestry.cell)) : COLLAGE.tapestry.phone;
  while (desk && cols > COLLAGE.tapestry.desk && Math.floor(n / cols) < 3) cols--;
  const cw = (width - 2 * (cols - 1)) / cols;
  const { shown, more } = solid(cols, desk ? cols * COLLAGE.tapestry.rows : 80);
  return (
    <div className="collage collage-tapestry" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {shown.map((w) => item(w, cw, cw, 'flat square'))}
      {more > 0 && <div className="collage-more" style={{ height: cw }}>+{more}</div>}
    </div>
  );
}
