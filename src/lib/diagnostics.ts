/**
 * 复制诊断信息: what helps answer a bug report — the build, the platform, how many of each kind, how things
 * are connected — and nothing of the person's own: no titles, names, notes, usernames or tokens.
 */
import { KIND_LABEL, type Kind } from '../data/types';

export interface DiagInput {
  app: string;
  version: string;
  platform: string;              // 'android' | 'ios' | 'windows' | 'web'
  userAgent: string;
  screen: { w: number; h: number; dpr: number };
  theme: string;                 // setting (resolved)
  kinds: Partial<Record<Kind, number>>;
  doing: number;
  removed: number;
  people: number;
  years: number;
  bangumi: 'off' | 'public' | 'token';
  bangumiProblem?: string | null;
  lastSync?: string | null;      // ISO
  imports: { douban: number; wereadPaste: number };
  saveBytes?: number | null;
  covers?: { files: number; bytes: number } | null;
  reduceMotion: boolean;
  fontScale: number;
}

const kb = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export function diagnosticsText(x: DiagInput): string {
  const total = Object.values(x.kinds).reduce((a, b) => a + (b ?? 0), 0);
  const kinds = (Object.keys(KIND_LABEL) as Kind[]).filter((k) => x.kinds[k]).map((k) => `${KIND_LABEL[k]} ${x.kinds[k]}`).join(' · ');
  const lines = [
    `${x.app} ${x.version}`,
    `平台：${x.platform}`,
    `浏览器内核：${x.userAgent}`,
    `屏幕：${x.screen.w}×${x.screen.h} @${x.screen.dpr}x`,
    `外观：${x.theme}${x.reduceMotion ? ' · 减少动效' : ''}${x.fontScale !== 1 ? ` · 字号 ${Math.round(x.fontScale * 100)}%` : ''}`,
    `条目：${total}${kinds ? `（${kinds}）` : ''} · 在看 ${x.doing} · 移出 ${x.removed}`,
    `人物 ${x.people} · 年份 ${x.years}`,
    `Bangumi：${x.bangumi === 'off' ? '没连接' : x.bangumi === 'token' ? '个人令牌' : '用户名'}${x.bangumiProblem ? ` · 问题 ${x.bangumiProblem}` : ''}${x.lastSync ? ` · 上次同步 ${x.lastSync.slice(0, 10)}` : ''}`,
    `导入：豆瓣备份 ${x.imports.douban} 次 · 微信读书粘贴 ${x.imports.wereadPaste} 次`,
  ];
  if (x.saveBytes != null) lines.push(`保存的文件：${kb(x.saveBytes)}`);
  if (x.covers) lines.push(`封面缓存：${x.covers.files} 张，${kb(x.covers.bytes)}`);
  return lines.join('\n');
}

/** copy text; the WebView's clipboard API can refuse, then the old way */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* below */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
