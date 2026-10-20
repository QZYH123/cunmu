import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { KIND_LABEL, type Kind } from '../data/types';
import { fmtNum } from '../data/derive';
import { Sheet, Dots } from './Bits';
import { ExplainList } from '../pages/Connect';
import { readXlsx } from '../lib/xlsx';
import { readZip } from '../lib/zip';
import { parseDoubak } from '../lib/doubak';
import { pickAccept } from '../lib/native';
import type { DoubanError, DoubanRow } from '../lib/douban';
import { buildDoubanImport, parseDouban, planDouban, type DoubanPlan } from '../lib/douban';
import { DUR } from '../tokens';
import { withViewTransition } from '../lib/motion';

type Step = 'explain' | 'reading' | 'error' | 'preview' | 'moving';
const ERR = {
  'not-backup': '这个文件看起来不是豆伴、douban-backup 导出的表格，也不是豆备的 marks.ndjson。',
  'need-subjects': '豆备的 marks.ndjson 要和 subjects.ndjson 一起选（或者把两个文件打成一个 zip），才知道作品名。',
  unreadable: '这个文件打不开，可能没有下载完整。',
  'no-done': '这个文件里没有看过、读过、听过、玩过的标记。',
} as const;
const ORDER: Kind[] = ['book', 'film', 'anime', 'music', 'game'];
const MONTH_DAY = (d = new Date()) => `${d.getMonth() + 1} 月 ${d.getDate()} 日`;

/** what was picked or dropped → rows: a 豆伴 / douban-backup .xlsx, or 豆备's marks + subjects (two .ndjson, or a .zip) */
async function rowsOf(files: File[]): Promise<{ rows: DoubanRow[] } | { error: DoubanError }> {
  const xlsx = files.find((f) => /\.xlsx$/i.test(f.name));
  if (xlsx) return parseDouban(await readXlsx(await xlsx.arrayBuffer()));
  const texts = new Map<string, string>();
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      for (const [name, bytes] of await readZip(await f.arrayBuffer())) if (/\.ndjson$/i.test(name)) texts.set(name.split('/').pop()!.toLowerCase(), new TextDecoder().decode(bytes));
    } else if (/\.(ndjson|jsonl|json|txt)$/i.test(f.name)) texts.set(f.name.toLowerCase(), await f.text());
  }
  const marks = texts.get('marks.ndjson') ?? [...texts].find(([n]) => n.includes('mark'))?.[1];
  if (marks) return parseDoubak(marks, texts.get('subjects.ndjson') ?? [...texts].find(([n]) => n.includes('subject'))?.[1] ?? null);
  // not by name: perhaps an .xlsx without its extension (Android hands files over as picked)
  if (files.length === 1 && !texts.size) return parseDouban(await readXlsx(await files[0].arrayBuffer()));
  return { error: 'not-backup' };
}

/**
 * 豆瓣备份导入 (STYLE v0.4 §3.16, 方案 5.7). The file is read here, in the page, and never leaves the
 * device or gets kept. Formats: lib/douban.ts (豆伴 xlsx, checked against its exporter) and lib/doubak.ts.
 */
export function DoubanSheet({ open, onClose, file: given = null }: { open: boolean; onClose: () => void; file?: File[] | null }) {
  const store = useStore();
  const nav = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('explain');
  const [err, setErr] = useState<keyof typeof ERR>('not-backup');
  const [plan, setPlan] = useState<DoubanPlan | null>(null);
  useEffect(() => {
    if (!open) return;
    setStep('explain'); setPlan(null);
    // a backup dropped on 收录 or on the window — or on this sheet while it asks for one: straight to reading it
    if (given?.length) void read(given);
  }, [open, given]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = async (f: File[]) => {
    setStep('reading');
    const wait = new Promise((r) => setTimeout(r, DUR.readFile));
    let result: { plan: DoubanPlan } | { error: keyof typeof ERR };
    try {
      const parsed = await rowsOf(f);
      if ('error' in parsed) result = { error: parsed.error };
      else {
        const known = new Set<string>();
        for (const w of [...store.extras, ...store.removedWorks]) for (const r of w.sources ?? []) if (r.provider === 'douban_xlsx') known.add(r.externalId);
        for (const r of store.workSources) if (r.provider === 'douban_xlsx') known.add(r.externalId);
        result = { plan: planDouban(parsed.rows, store.library, known, store.removed) };
      }
    } catch {
      result = { error: 'unreadable' };
    }
    await wait;
    if ('error' in result) { setErr(result.error); setStep('error'); } else { setPlan(result.plan); setStep('preview'); }
  };

  const move = () => {
    if (!plan) return;
    setStep('moving');
    const n = plan.fresh.length + plan.merge.length;
    setTimeout(() => void withViewTransition(() => {
      const at = new Date().toISOString();
      const { batch, created, rows, notes, maybe } = buildDoubanImport(plan, store.notes, at, `${MONTH_DAY()} · 豆瓣备份 · ${fmtNum(n)} 条`);
      store.applyImport(batch, created, rows, notes, maybe);
      onClose();
      nav('/');
      setTimeout(() => store.toast(`搬进来 ${fmtNum(n)} 条`), DUR.page + DUR.place);
    }, 'page'), DUR.readFile);
  };

  const n = plan ? plan.fresh.length + plan.merge.length : 0;
  const kinds = new Map<Kind, number>();
  if (plan) for (const r of [...plan.fresh, ...plan.merge.map((m) => m.row)]) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);

  return (
    <Sheet open={open} onClose={onClose} label="导入豆瓣备份">
      <input
        ref={file} type="file" hidden
        accept={pickAccept('.xlsx,.ndjson,.zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip')}
        multiple data-testid="douban-file"
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void read(f); }}
      />
      {(step === 'explain' || step === 'error') && (
        <div className="sheet-body weread" key="explain">
          <h2 className="t-title"><span className="phrase">导入豆瓣备份之前，</span><span className="phrase">先说清三件事</span></h2>
          <ExplainList items={[
            { t: '文件要你自己先导出', d: '存目不登录豆瓣，也不连豆瓣。先用备份工具把你的标记导出成文件，再放进来。能认的是豆伴或 douban-backup 导出的 Excel，以及豆备的 marks.ndjson 加 subjects.ndjson。' },
            { t: '备份工具不是我们做的', d: '这类工具访问豆瓣太频繁时可能被锁号，需要短信解锁；用的时候按工具自己的说明来。' },
            { t: '有些内容可能缺', d: '豆瓣上已经被删除的条目和影评，备份里可能没有。' },
          ]} />
          {step === 'error' && <p className="t-small c-2 field-say">{ERR[err]}</p>}
          <div className="sheet-actions">
            <button className="btn btn-secondary" onClick={() => file.current?.click()}>{step === 'error' ? '换一个文件' : '选择文件'}</button>
          </div>
          <p className="t-caption c-3 drop-hint">也可以直接把文件拖到这里。</p>
        </div>
      )}

      {step === 'reading' && (
        <div className="sheet-body weread reading" key="reading">
          <h2 className="t-title"><span className="phrase">导入豆瓣备份之前，</span><span className="phrase">先说清三件事</span></h2>
          <p className="t-ui c-2 reading-line"><Dots />正在读这个文件</p>
        </div>
      )}

      {(step === 'preview' || step === 'moving') && plan && (
        n === 0 ? (
          <div className="sheet-body weread" key="nothing">
            <p className="t-ui c-2 nothing-new">这个文件里的，上次都已经搬进来了。</p>
            <div className="sheet-actions"><button className="btn btn-secondary" onClick={onClose}>好</button></div>
          </div>
        ) : (
          <div className="sheet-body weread found" key="preview">
            <div className="t-numeral">{fmtNum(n)}</div>
            <p className="t-ui found-sub">条，可以搬进来</p>
            <p className="db-kinds">
              {ORDER.filter((k) => kinds.get(k)).map((k) => (
                <span key={k}><span className="t-small c-2">{KIND_LABEL[k]}</span> <span className="t-caption c-3 tnum">{fmtNum(kinds.get(k)!)}</span></span>
              ))}
            </p>
            <div className="db-notes">
              {plan.merge.length > 0 && <p className="t-small c-3">其中 {fmtNum(plan.merge.length)} 部你已经有了，会合在一起。</p>}
              <p className="t-small c-3">只搬看过、读过、听过、玩过的；想看的不搬。</p>
              {plan.skipped.length > 0 && <p className="t-small c-3">另外 {fmtNum(plan.skipped.length)} 条上次已经搬进来了，这次跳过。</p>}
            </div>
            <div className="sheet-actions">
              {step === 'moving'
                ? <p className="t-small c-2 moving-line"><Dots />正在搬，可以先关掉</p>
                : <button className="btn btn-primary" onClick={move}>搬进来</button>}
              <button className="btn-text" onClick={onClose} disabled={step === 'moving'}>先不搬</button>
            </div>
          </div>
        )
      )}
    </Sheet>
  );
}
