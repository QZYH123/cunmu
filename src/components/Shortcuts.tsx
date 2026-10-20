import { Fragment, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sheet } from './Bits';
import { IS_MAC } from './Shell';
import { reduced } from '../lib/motion';
import { BP } from '../tokens';
import { OPEN_HELP } from '../lib/shortcutHelp';

/**
 * Desktop keyboard shortcuts (§8.2, P2-7): N 收录 · W 整面墙 · G then H 回首页 · [ / ] entry sections ·
 * ? this help. ⌘K / / live in the palette; arrows / Enter / Esc live with the things they move.
 */
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
/** another layer owns the keyboard while it's open */
const layerOpen = () => !!document.querySelector('.sheet, .palette-scrim, .preview-layer, .menu');
const SEQ_MS = 1200;   // G … H

type Keys = string[][];   // alternatives, each a sequence: [['⌘K'], ['/']] or [['G', 'H']]
const MOD = IS_MAC ? '⌘' : 'Ctrl ';
const GROUPS: { title: string; rows: { label: string; keys: Keys }[] }[] = [
  { title: '全局', rows: [
    { label: '搜索', keys: [[`${MOD}K`], ['/']] },
    { label: '收录', keys: [['N']] },
    { label: '整面墙', keys: [['W']] },
    { label: '回首页', keys: [['G', 'H']] },
    { label: '关闭浮层', keys: [['Esc']] },
    { label: '快捷键说明', keys: [['?']] },
  ] },
  { title: '封面墙 · 封面格 · 列表 · 年份', rows: [
    { label: '移动焦点', keys: [['←', '↑', '→', '↓']] },
    { label: '打开', keys: [['Enter']] },
    { label: '行首 / 行尾', keys: [['Home'], ['End']] },
    { label: '整面墙的开头 / 结尾', keys: [[`${MOD}Home`], [`${MOD}End`]] },
    { label: '整面墙翻一屏', keys: [['PgUp'], ['PgDn']] },
    { label: '预览卡（同长按）', keys: [['右键'], ['Shift F10']] },
  ] },
];
// 条目页 · 某一年 sits under 全局 in the first column
GROUPS.splice(1, 0, { title: '条目页 · 某一年', rows: [
  { label: '上一个 / 下一个小节', keys: [['['], [']']] },
  { label: '上一年 / 下一年', keys: [['←'], ['→']] },
] });

export function Shortcuts({ onAdd }: { onAdd: () => void }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [help, setHelp] = useState(false);
  const g = useRef(0);
  const state = useRef({ help, loc, onAdd });
  state.current = { help, loc, onAdd };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (window.innerWidth < BP.desktop || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || e.defaultPrevented) return;
      const { help, loc, onAdd } = state.current;
      if (e.key === '?') {
        if (!help && layerOpen()) return;
        e.preventDefault();
        setHelp((h) => !h);
        return;
      }
      if (help || layerOpen() || e.shiftKey || e.repeat) return;
      const key = e.key.toLowerCase();
      const seq = Date.now() - g.current < SEQ_MS;
      g.current = 0;
      if (key === 'g') { g.current = Date.now(); return; }
      if (seq && key === 'h') { e.preventDefault(); if (loc.pathname !== '/') nav('/'); return; }
      if (key === 'n') { e.preventDefault(); onAdd(); return; }
      if (key === 'w') { e.preventDefault(); if (loc.pathname !== '/wall') nav('/wall'); return; }
      if ((key === '[' || key === ']') && loc.pathname.startsWith('/entry/')) { e.preventDefault(); jumpSection(key === ']' ? 1 : -1); }
    };
    const openHelp = () => setHelp(true);
    window.addEventListener('keydown', k);
    window.addEventListener(OPEN_HELP, openHelp);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener(OPEN_HELP, openHelp); };
  }, [nav]);
  return (
    <Sheet open={help} onClose={() => setHelp(false)} label="键盘快捷键" className="keys-sheet">
      <div className="keys">
        <h2 className="t-h2">键盘快捷键</h2>
        <div className="keys-cols">
        {GROUPS.map((grp) => (
          <section key={grp.title} className="keys-group">
            <h3 className="label-head">{grp.title}</h3>
            {grp.rows.map((r) => (
              <div key={r.label} className="keys-row">
                <span className="t-small c-2">{r.label}</span>
                <span className="keys-keys">
                  {r.keys.map((alt, ai) => (
                    <Fragment key={ai}>
                      {ai > 0 && <span className="keys-or t-caption c-3">或</span>}
                      {alt.map((key, ki) => (
                        <Fragment key={ki}>
                          {ki > 0 && alt.length === 2 && r.label === '回首页' && <span className="keys-or t-caption c-3">然后</span>}
                          <kbd className="kbd">{key}</kbd>
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
        </div>
        <div className="keys-foot">
          <button className="btn-text" onClick={() => setHelp(false)}>关闭</button>
        </div>
      </div>
    </Sheet>
  );
}

/** [ / ]: scroll to the previous / next section of the entry, under the sticky bar. */
function jumpSection(dir: 1 | -1) {
  const secs = [...document.querySelectorAll<HTMLElement>('.page [data-section]')].filter((s) => s.offsetParent);
  if (!secs.length) return;
  const bar = parseFloat(getComputedStyle(secs[0]).scrollMarginTop) || 0;
  const tops = secs.map((s) => s.getBoundingClientRect().top - bar);
  // the current section is the last one whose top has reached the bar (2px tolerance)
  let cur = -1;
  tops.forEach((t, i) => { if (t <= 2) cur = i; });
  const target = dir === 1 ? secs[cur + 1] : tops[cur] < -2 ? secs[cur] : secs[cur - 1];
  if (target) target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  else if (dir === -1) window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
}
