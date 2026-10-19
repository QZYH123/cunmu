import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { DEFAULT_SETTINGS, monthEntries, yearsGrouped, type Settings } from '../data/derive';
import { TopBar } from '../components/Shell';
import { RollingNumber } from '../components/Bits';
import { Slider } from '../components/Slider';
import { useEnterClass } from '../lib/motion';
import { DUR } from '../tokens';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

interface Def {
  key: keyof Settings;
  title: string;
  desc: string;
  unit: string;
  values: number[];
  special: Record<string, string>;
  ends: [string, string];
  preview: (n: number) => [string, string];
}

const DEFS: Def[] = [
  {
    key: 'yearGroup', title: '一年多少条后按月分组', desc: '记录多的年份按月分开看', unit: '条',
    values: [0, ...range(6, 50), Infinity], special: { 0: '总是按月', Infinity: '从不按月' }, ends: ['总是', '从不'],
    preview: () => ['按这个设置，你现在会有 ', ' 个年份按月分组'],
  },
  {
    key: 'monthEntry', title: '一个月多少条成为月条目', desc: '记录多的月份有自己的页面', unit: '条',
    values: [Infinity, ...range(3, 20)], special: { Infinity: '不建月条目' }, ends: ['不建', '20 条'],
    preview: () => ['按这个设置，你现在会有 ', ' 个月条目'],
  },
  {
    key: 'personThreshold', title: '某人出现在几部作品里收进档案', desc: '常出现的人会自动收进索引', unit: '部',
    values: [Infinity, ...range(2, 10)], special: { Infinity: '只收核心创作者' }, ends: ['只收核心', '10 部'],
    preview: () => ['按这个设置，你现在会有 ', ' 位人物'],
  },
];

export default function Organize() {
  const { d, settings, setSettings, promoted } = useStore();
  const enter = useEnterClass();
  const [resetting, setResetting] = useState(false);
  const isDefault = DEFS.every((x) => settings[x.key] === DEFAULT_SETTINGS[x.key]);

  const personsAt = useMemo(() => {
    const pr = new Set(promoted);
    return (t: number) => {
      let n = 0;
      for (const [id, p] of d.allPeople) if (p.core || pr.has(id) || p.works.length >= t) n++;
      return n;
    };
  }, [d, promoted]);
  const count = (k: keyof Settings, v: number) => {
    const s = { ...settings, [k]: v };
    if (k === 'yearGroup') return yearsGrouped(d, s);
    if (k === 'monthEntry') return monthEntries(d, s);
    return personsAt(v);
  };

  return (
    <div className="page under-bar">
      <TopBar />
      <div className={`page-x ${enter}`}>
        <h1 className="t-title page-title">整理方式</h1>
        <p className="t-small c-2">默认就够用。改了马上生效，收起的东西不会删除。</p>
        <div className="organize">
          {DEFS.map((def) => {
            const v = settings[def.key];
            const sp = def.special[String(v)];
            const n = count(def.key, v);
            const base = count(def.key, DEFAULT_SETTINGS[def.key]);
            const [pre, post] = def.preview(n);
            const hidden = def.key !== 'yearGroup' ? base - n : 0;
            return (
              <section className="org-item" key={def.key}>
                <div className="org-head">
                  <h2 className="t-h3">{def.title}</h2>
                  {sp
                    ? <span className="org-special">{sp}</span>
                    : <span className="org-value"><RollingNumber value={String(v)} /><span className="t-caption">{def.unit}</span></span>}
                </div>
                <p className="t-small c-2">{def.desc}</p>
                <Slider
                  label={def.title}
                  values={def.values}
                  value={v}
                  defaultValue={DEFAULT_SETTINGS[def.key]}
                  leftLabel={def.ends[0]}
                  rightLabel={def.ends[1]}
                  resetting={resetting}
                  onChange={(nv) => setSettings({ ...settings, [def.key]: nv })}
                />
                <p className="t-small c-reading org-preview">{pre}<b className="w-500 c-ink"><RollingNumber value={String(n)} /></b>{post}</p>
                {hidden > 0 && <p className="t-small c-3">比默认少收 {hidden} 个，调回来还在。</p>}
              </section>
            );
          })}
        </div>
        <div className="org-reset">
          <button
            className="btn-text"
            disabled={isDefault}
            onClick={() => {
              setResetting(true);
              setSettings(DEFAULT_SETTINGS);
              setTimeout(() => setResetting(false), DUR.page);
            }}
          >恢复默认</button>
        </div>
      </div>
    </div>
  );
}
