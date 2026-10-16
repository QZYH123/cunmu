#!/usr/bin/env node
/**
 * Static checks for STYLE-GUIDE v0.2 §6 plus the v0.3 additions (#37 material whitelist, #39 tokens,
 * #50 pointer-only :hover, #59 grain, #60 墨夜, #62 reduced motion). Covers what can be verified by reading source:
 *   #1  no raw colors / font sizes / radii / shadows / durations outside token files
 *   #2  UI colors are near-neutral (RGB channel spread ≤ 6, paper ≤ 14; link/accent/danger exempt)
 *   #3  every border is a 1px hairline in --line-*; 2px only for quote + risk rules; no dashed/dotted
 *   #6  mono font only used by the key input / ISBN
 *   #7  no type token below 11px, no negative tracking except Latin-only tokens
 *  #34  no furniture vocabulary
 *  #35  banned copy (§6.3 + §5.13)
 *  #75  VOICE v0.1 banned copy (百科, cheering, selling; layer metaphor kept out of names)
 *  #36–38 no badges / progress / percentages, no gradients beyond the allowed materials,
 *         no animation duration > 600ms, no shimmer skeletons
 * Visual items are covered by screenshots (npm run shots).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const TOKEN_FILES = new Set(['src/motion.gen.ts', 'src/styles/tokens.css', 'src/tokens.ts']);
// Procedural artwork for fake works: these are the *works'* own covers, not UI colors.
const ARTWORK_FILES = new Set(['src/fake/coverArt.ts']);

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk(SRC).map((p) => ({ path: relative(ROOT, p), text: readFileSync(p, 'utf8') }));
files.push({ path: 'index.html', text: readFileSync(join(ROOT, 'index.html'), 'utf8') });

const results = [];
const fail = (item, msg) => results.push({ item, ok: false, msg });
const pass = (item, msg) => results.push({ item, ok: true, msg });

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

function scan(item, label, regex, { skip = () => false, filter = () => true } = {}) {
  const hits = [];
  for (const f of files) {
    if (skip(f.path)) continue;
    const t = stripComments(f.text);
    for (const m of t.matchAll(regex)) {
      if (!filter(m, f)) continue;
      hits.push(`${f.path}:${lineOf(t, m.index)}  ${m[0].trim().slice(0, 80)}`);
    }
  }
  if (hits.length) fail(item, `${label}\n    ${hits.slice(0, 20).join('\n    ')}${hits.length > 20 ? `\n    … ${hits.length - 20} more` : ''}`);
  else pass(item, label);
}

/* ---------- #1 raw values ---------- */
const nonToken = (p) => TOKEN_FILES.has(p) || ARTWORK_FILES.has(p) || p === 'index.html';
scan(1, 'no raw hex colors outside tokens', /#[0-9a-fA-F]{3,8}\b(?![\w-])/g, {
  skip: nonToken,
  filter: (m, f) => f.path.endsWith('.css') || /['"`]#[0-9a-fA-F]{3,8}['"`]/.test(f.text.slice(m.index - 1, m.index + m[0].length + 1)),
});
scan(1, 'no rgb()/rgba()/hsl() outside tokens', /\b(rgba?|hsla?)\(/g, { skip: nonToken });
scan(1, 'no raw font-size', /(font-size\s*:\s*[\d.]+(px|rem|em|pt)|fontSize\s*:\s*['"]?[\d.]+)/g, { skip: nonToken });
scan(1, 'no raw font shorthand sizes', /\bfont\s*:\s*[^;{}]*\b[\d.]+(px|rem)\b/g, { skip: nonToken });
scan(1, 'no raw border-radius', /(border-radius\s*:\s*[^;]*\b[1-9][\d.]*(px|rem|%)|borderRadius\s*:\s*['"]?[1-9])/g, { skip: nonToken });
scan(1, 'no raw box-shadow', /(box-shadow\s*:\s*([^;}]+)|boxShadow\s*:)/g, {
  skip: nonToken,
  filter: (m) => !m[2] || !/^(none|var\(--[\w-]+\))(\s*,\s*var\(--[\w-]+\))*\s*$/.test(m[2].trim()),
});
scan(1, 'no raw ms/s durations in CSS', /\b\d+(\.\d+)?m?s\b/g, {
  skip: (p) => nonToken(p) || !p.endsWith('.css'),
  filter: (m, f) => {
    const t = stripComments(f.text);
    const line = t.split('\n')[lineOf(t, m.index) - 1];
    return /(transition|animation|delay|duration)/.test(line);
  },
});
scan(1, 'no numeric timers outside tokens.ts', /^.*\bset(Timeout|Interval)\(.*[,]\s*\d{2,}\s*\)\s*;?\s*$/gm, { skip: nonToken });
// Inline styles may carry geometry computed at runtime (justified tile sizes, literal-cover type that
// scales with the cover per §3.3) or token references; literal colors / families / timings are not allowed.
scan(1, 'no literal colors / fonts / radii / shadows / timings in inline styles',
  /\b(color|background|fontFamily|borderRadius|boxShadow|transition|animation|fontSize)\s*:\s*(['"`][^'"`]*['"`]|\d[\d.]*)/g, {
    skip: (p) => nonToken(p) || !p.endsWith('.tsx'),
    filter: (m) => !/^['"`]var\(--[\w-]+\)['"`]$/.test(m[2]),
  });

/* ---------- #2 neutral colors ---------- */
{
  const tok = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
  const bad = [];
  let n = 0;
  for (const block of tok.matchAll(/(:root(?:\[data-theme="dark"\])?)\s*\{([\s\S]*?)\n\}/g)) {
    for (const d of block[2].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      const [, name, value] = d;
      if (/^(link|accent|danger)/.test(name) || /^(sh|wall-seam|wall-light|pointer-light|spine-light|mask|sheen)/.test(name)) continue;
      const cols = [...value.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\((\d+),\s*(\d+),\s*(\d+)/g)];
      for (const c of cols) {
        let rgb;
        if (c[1]) {
          const h = c[1].length === 3 ? c[1].split('').map((x) => x + x).join('') : c[1];
          rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
        } else rgb = [c[2], c[3], c[4]].map(Number);
        const spread = Math.max(...rgb) - Math.min(...rgb);
        const limit = name.startsWith('paper') ? 14 : 6;
        n++;
        if (spread > limit) bad.push(`${block[1]} --${name}: ${c[0]} spread ${spread} > ${limit}`);
      }
    }
  }
  bad.length ? fail(2, `color spread\n    ${bad.join('\n    ')}`) : pass(2, `color spread OK across ${n} token colors (light + dark)`);
}

/* ---------- #3 lines ---------- */
{
  const bad = [];
  for (const f of files.filter((x) => x.path.endsWith('.css') && !TOKEN_FILES.has(x.path))) {
    const t = stripComments(f.text);
    for (const m of t.matchAll(/(?:^|[;{\s])(border(?:-(?:top|bottom|left|right))?)\s*:\s*([^;}]+)/g)) {
      const v = m[2].trim();
      if (v === 'none' || v === '0') continue;
      const ln = lineOf(t, m.index);
      const sel = t.slice(t.lastIndexOf('}', m.index) + 1, t.indexOf('{', t.lastIndexOf('}', m.index) + 1)).trim();
      if (/dashed|dotted|double/.test(v)) bad.push(`${f.path}:${ln} dashed/dotted: ${v}`);
      else if (v.includes('var(--rule-quote)')) {
        if (!/quote|risk/.test(sel)) bad.push(`${f.path}:${ln} 2px rule outside quote/risk (${sel})`);
      } else if (!v.includes('var(--hairline)')) bad.push(`${f.path}:${ln} width not --hairline: ${v}`);
      else if (!/var\(--line-[\w]+\)|transparent/.test(v)) bad.push(`${f.path}:${ln} color not --line-*: ${v}`);
    }
  }
  bad.length ? fail(3, `borders\n    ${bad.join('\n    ')}`) : pass(3, 'all borders are 1px --line-*; 2px only on .quote / .risk; no dashed lines');
}

/* ---------- #6 mono usage ---------- */
{
  const uses = [];
  for (const f of files) {
    if (TOKEN_FILES.has(f.path)) continue;
    const t = stripComments(f.text);
    for (const m of t.matchAll(/var\(--(font-mono|t-mono[\w-]*)\)/g)) {
      const sel = t.slice(t.lastIndexOf('}', m.index) + 1, t.indexOf('{', t.lastIndexOf('}', m.index) + 1)).trim();
      uses.push(sel || f.path);
    }
  }
  const bad = uses.filter((s) => !/key|isbn/i.test(s));
  bad.length ? fail(6, `mono outside key/ISBN: ${bad.join(', ')}`) : pass(6, `mono only in: ${[...new Set(uses)].join(' | ')}`);
}

/* ---------- #7 type floor & tracking ---------- */
{
  const tok = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
  const bad = [];
  for (const m of tok.matchAll(/--(t-[\w-]+)\s*:\s*\d+\s+([\d.]+)rem\/([\d.]+)rem/g)) {
    const px = parseFloat(m[2]) * 16;
    if (px < 11) bad.push(`--${m[1]} = ${px}px`);
  }
  const body = tok.match(/--t-body:\s*400\s+1rem\/1\.75rem/);
  if (!body) bad.push('--t-body is not 16/28');
  for (const m of tok.matchAll(/--(track-[\w-]+)\s*:\s*(-[\d.]+em)/g)) {
    // v0.3 §7.1: --t-mega, --t-count and Latin-only hero titles are the only other negative tracks.
    if (!['track-numeral', 'track-display', 'track-mega', 'track-count', 'track-hero-latin'].includes(m[1])) bad.push(`negative tracking --${m[1]}`);
  }
  const base = readFileSync(join(ROOT, 'src/styles/base.css'), 'utf8');
  if (/\.t-display\s*\{[^}]*track-display/.test(base)) bad.push('negative display tracking applied to Chinese titles');
  bad.length ? fail(7, `type\n    ${bad.join('\n    ')}`) : pass(7, 'body 16/28; smallest type 11px (tab bar only); negative tracking only on Latin numerals / Latin titles');
}

{
  const uses = [];
  for (const f of files) {
    if (TOKEN_FILES.has(f.path)) continue;
    const t = stripComments(f.text);
    for (const m of t.matchAll(/var\(--t-micro\)|className=["'`][^"'`]*\bt-micro\b/g)) {
      const sel = f.path.endsWith('.css') ? t.slice(t.lastIndexOf('}', m.index) + 1, t.indexOf('{', t.lastIndexOf('}', m.index) + 1)).trim() : f.path;
      if (sel !== '.t-micro') uses.push(sel);
    }
  }
  const bad = uses.filter((s) => !/\.tab\b/.test(s));
  bad.length ? fail(7, `--t-micro (11px) outside the tab bar: ${bad.join(', ')}`) : pass(7, '--t-micro only on tab bar labels');
}

{
  const base = readFileSync(join(ROOT, 'src/styles/base.css'), 'utf8');
  /\*,\s*\*::before,\s*\*::after\s*\{\s*font-variant-numeric:\s*tabular-nums[^}]*!important/.test(base)
    ? pass(5, 'tabular figures forced on every element (survives the font shorthand)')
    : fail(5, 'tabular figures are not applied globally');
}

/* ---------- copy scans ---------- */
const COPY_FILES = (p) => !(p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.html'));
// STYLE v0.4 §3.19.8 (r21): games only — the 游玩 section and the Steam settings may say 成就 / 解锁 and show
// a game's achievement progress (bar + %). Nowhere else; every other banned word still holds there.
const GAME_EXEMPT = new Set(['src/components/SteamPlay.tsx', 'src/pages/SteamConnect.tsx']);
scan(35, 'banned copy: 连续 打卡 天没 暂无 完善 解锁 成就 等级 目标 ！ 加油 太棒了 你已经',
  // two v0.4 §3.16 originals are exempt, verbatim only: 「需要短信解锁」 (the backup tool's risk) and 「其中 N 部你已经有了」
  /连续|打卡|天没|暂无|完善|(?<!短信)解锁|成就|等级|目标|！|加油|太棒了|你已经(?!有了)/g, { skip: (p) => COPY_FILES(p) || GAME_EXEMPT.has(p) });
scan(35, 'game exception (§3.19.8): 成就 / 解锁 allowed in the 游玩 section and Steam settings, nothing else',
  /连续|打卡|天没|暂无|完善|等级|目标|！|加油|太棒了|你已经(?!有了)/g, { skip: (p) => !GAME_EXEMPT.has(p) });
// STYLE v0.4 §5: the date / review / delete words that turn 时间未知 into a chore or a report
scan(74, 'v0.4 banned copy: 待补全 去补全 未整理 未归类 缺少日期 年度报告 比去年 已删除 保存成功 心情 先放一本书 可能相关 Self-pedia',
  /待补全|去补全|未整理|未归类|缺少日期|年度报告|比去年|已删除|保存成功|心情|先放一本书|可能相关|Self-pedia/g, { skip: COPY_FILES });
// VOICE v0.1 §2.2: the collection is no longer 「我的百科」, and the copy never cheers, sells or coos.
// The user's own words (curated quotes, essays, the catalogue) are content, not copy.
const VOICE_SKIP = (p) => COPY_FILES(p) || /src\/(demo\/(curated|catalogue)|data\/generate)\.ts$/.test(p);
scan(75, 'VOICE v0.1 banned copy: 百科 成功 失败 一键 立即 宝藏 珍藏 回忆 时光 岁月 专属 惊喜 哦 呢 啦 呀 ～',
  /百科|成功|失败|一键|立即|宝藏|珍藏|回忆|时光|岁月|专属|惊喜|[哦呢啦呀～]/g, { skip: VOICE_SKIP });
// VOICE v0.1 §2.3: the metaphor stays in the design, never in names — no coined layer words in the copy
scan(75, 'VOICE v0.1 no coined names: 地层 地层柱 地层尺 翻层 一层层 层层 岩层 落在这里',
  /地层|翻层|一层层|层层|岩层|落在这里/g, { skip: VOICE_SKIP });
scan(35, 'no ASCII "!" inside Chinese copy', /[\u4e00-\u9fff》」]\s*!(?!=)|!\s*[\u4e00-\u9fff《「]/g, { skip: COPY_FILES });
scan(34, 'no furniture vocabulary: 书房 家具 书架 柜子 唱片架 游戏柜 海报墙 档案柜',
  /书房|家具|书架|柜子|唱片架|游戏柜|海报墙|档案柜/g, { skip: COPY_FILES });
{
  // Bangumi snapshot text is shown in the app too.
  const snap = join(ROOT, 'src/demo/bangumi.json');
  try {
    const t = readFileSync(snap, 'utf8');
    const m = t.match(/连续|打卡|天没|暂无|完善|解锁|成就|等级|目标|！|书房|家具|书架|柜子|唱片架|游戏柜|海报墙|档案柜/g);
    m ? fail(35, `Bangumi snapshot contains banned words: ${[...new Set(m)].join(' ')}`) : pass(35, 'Bangumi snapshot text clean');
  } catch { /* snapshot is a .ts module, already covered by the scan */ }
}

/* ---------- #36–38 ---------- */
scan(36, 'no badges / progress / percentages in UI code',
  /class(Name)?=["'`][^"'`]*\b(badge|progress|dot-unread|streak)\b|<progress|\d+\s*%\s*<|['"`][^'"`\n]*\d\s*%[^'"`\n]*['"`]/g, {
    // §3.19.8: a game's achievement progress (bar + %) in the 游玩 section and Steam settings only
    skip: (p) => nonToken(p) || p.endsWith('.css') || GAME_EXEMPT.has(p),
    filter: (m, f) => {
      const t = stripComments(f.text);
      const line = t.split('\n')[lineOf(t, m.index) - 1];
      return !/translate|calc|width|height|inset|left|top|scale|origin|maxHeight/i.test(line);
    },
  });
scan(37, 'no gradients outside the token file (spine light, fades, bar blur + §7.9 whitelist)', /(linear|radial|conic)-gradient\(/g, { skip: nonToken });
{
  // §7.9: each whitelisted material may only be used by its own element.
  const MATERIALS = {
    'wall-light': /\.wall-light/, 'pointer-light': /\.wall-pointer/, 'hero-glow': /\.hero-zone(\.[\w-]+)*::before/, sheen: /\.cover-sheen/,
    'contact-shadow': /\.contact-shadow/, 'spine-light': /\.cover\.is-book::after|\.spine|\.vol/,
  };
  const bad = [];
  for (const f of files.filter((x) => x.path.endsWith('.css') && !TOKEN_FILES.has(x.path))) {
    const t = stripComments(f.text);
    for (const m of t.matchAll(/var\(--(wall-light|pointer-light|hero-glow|sheen|contact-shadow|spine-light)\)/g)) {
      const open = t.lastIndexOf('{', m.index);
      const sel = t.slice(t.lastIndexOf('}', open) + 1, open).trim();
      if (!MATERIALS[m[1]].test(sel)) bad.push(`${f.path}:${lineOf(t, m.index)} --${m[1]} used by ${sel}`);
    }
  }
  bad.length ? fail(37, `material used off its element\n    ${bad.join('\n    ')}`) : pass(37, 'wall light / pointer light / hero tint / sheen / contact shadow / spine light only on their own elements (§7.9)');
}

/* ---------- v0.3 tokens, pointer rules, S6 / S7 (§7.7–7.9, §8.5) ---------- */
{
  const tok = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
  const need = ['sh-lift', 'sh-hero', 'focus-ring', 'hover-tint', 'grain-o', 'wall-fade', 'm-sign', 'm-space', 'm-sheen', 'm-tint', 'e-out', 'wall-mask', 'row-dim'];
  // the old v0.3 names (--dur-*, --ease-*, --rise …) were aliases and are gone: nothing may bring one back
  const OLD = /--(ease-(out|standard|in|flight)|dur-(press|fade|pop|page|link-in|flight-back|place|wall-in|flight|sheen|tint|pointer-light|tip-out|spin)|rise|pop-rise|pop-scale|tile-hover-scale)(?![\w-])/;
  const olds = [];
  for (const f of readdirSync(join(ROOT, 'src/styles')).filter((x) => x.endsWith('.css'))) if (OLD.test(readFileSync(join(ROOT, 'src/styles', f), 'utf8'))) olds.push(f);
  olds.length ? fail(39, `old motion aliases in ${olds.join(', ')}`) : pass(39, 'no old motion aliases (--dur-* / --ease-* / --rise): --m-* / --e-* / --d-* / --s-* only');
  const missing = need.filter((n) => !new RegExp(`--${n}\\s*:`).test(tok));
  missing.length ? fail(39, `missing v0.3 tokens: ${missing.join(', ')}`) : pass(39, `v0.3 tokens present (${need.length})`);
  const dark = tok.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)[1];
  /--bg:#0F0F0E/i.test(dark) ? pass(60, 'S7 墨夜: dark --bg is #0F0F0E') : fail(60, 'S7: dark --bg is not #0F0F0E');
  /--wall-filter:brightness\(\.9[5-9]/.test(dark) ? pass(60, 'S7: dark wall top brightness ≥ .95, rows step down') : fail(60, 'S7: dark --wall-filter brightness < .95');
  const red = tok.match(/:root\[data-motion="reduce"\]\s*\{([\s\S]*?)\}/)[1];
  const still = ['rise-flight', 'tile-hover-rise', 'hover-rise', 's-lift', 'dialog-scale'].filter((n) => !new RegExp(`--${n}:(0px|1)\\b`).test(red));
  still.length ? fail(62, `reduced motion keeps movement: ${still.join(', ')}`) : pass(62, 'reduced motion zeroes flight rise, hover lift/scale, dialog scale');
}
{
  let total = 0;
  const bad = [];
  for (const f of files.filter((x) => x.path.endsWith('.css'))) {
    const t = stripComments(f.text);
    // walk the CSS keeping a stack of the @media conditions we are inside
    const stack = [];
    let i = 0;
    const re = /@media([^{]*)\{|\{|\}|:hover/g;
    let m;
    while ((m = re.exec(t))) {
      if (m[0].startsWith('@media')) stack.push(m[1]);
      else if (m[0] === '{') stack.push(null);
      else if (m[0] === '}') stack.pop();
      else {
        total++;
        if (!stack.some((c) => c && /hover:\s*hover/.test(c) && /pointer:\s*fine/.test(c))) bad.push(`${f.path}:${lineOf(t, m.index)}`);
      }
      i++;
    }
  }
  bad.length ? fail(50, `:hover outside (hover:hover) and (pointer:fine)\n    ${bad.join('\n    ')}`)
    : total >= 15 ? pass(50, `${total} :hover rules, all inside (hover: hover) and (pointer: fine)`) : fail(50, `only ${total} :hover rules (< 15)`);
}
{
  const g = join(ROOT, 'public/grain.png');
  let size = 0;
  try { size = statSync(g).size; } catch { /* missing */ }
  const base = readFileSync(join(ROOT, 'src/styles/base.css'), 'utf8');
  size && size <= 12 * 1024 && /body::before\s*\{(?=[^}]*grain\.png)(?=[^}]*pointer-events:\s*none)(?![^}]*animation)[^}]*\}/.test(base)
    ? pass(59, `S6 grain: public/grain.png ${size} B ≤ 12KB, fixed under the app, never animated`)
    : fail(59, `S6 grain missing or too large (${size} B)`);
}
{
  const tok = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
  const tjs = readFileSync(join(ROOT, 'src/tokens.ts'), 'utf8');
  const long = [];
  for (const m of tok.matchAll(/--((?:dur|m)-[\w-]+)\s*:\s*(\d+)ms/g)) if (+m[2] > 600 && !['dur-spin', 'dur-sheen', 'm-sheen', 'dur-hold', 'dur-linger'].includes(m[1])) long.push(`--${m[1]} ${m[2]}ms`);
  const durBlock = tjs.match(/export const DUR = \{([\s\S]*?)\}/)[1];
  // toast lifetime / long-press hold / idle delay are waits, not animations; v0.4 §2.9: the delete-all
  // hold (the hand, not an animation) and the date picker's linger are waits too, as is a simulated read
  // (给人看's 「按住退出」 hold, showHold, is the same kind of wait)
  for (const m of durBlock.matchAll(/(\w+)\s*:\s*(\d+)/g)) if (+m[2] > 600 && !/toast|longPress|Delay|verifyKey|sheen|^hold$|^showHold$|^linger$|readFile|dotsWords/.test(m[1])) long.push(`DUR.${m[1]} ${m[2]}`);
  long.length ? fail(38, `durations > 600ms: ${long.join(', ')}`) : pass(38, 'all motion tokens ≤ 600ms (spinner is functional; the 700ms cover sheen is set by §7.9)');
}
scan(38, 'no shimmer skeletons', /shimmer|skeleton/gi, { skip: (p) => p.endsWith('check-spec.mjs') });

/* ---------- MOTION-SPEC v0.1 §5.4: one set of motion values ---------- */
{
  const tok = stripComments(readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8'));
  const bad = [];
  // tokens.ts takes M / EASE / stagger from motion.gen.ts, generated from tokens.css: it must be current
  const { motionTokens, render } = await import('./gen-motion-tokens.mjs');
  const want = render(motionTokens(tok));
  let have = ''; try { have = readFileSync(join(ROOT, 'src/motion.gen.ts'), 'utf8'); } catch { /* missing */ }
  if (have !== want) bad.push('src/motion.gen.ts is out of date: node scripts/gen-motion-tokens.mjs');
  if (/\b\d+\s*as const/.test(readFileSync(join(ROOT, 'src/tokens.ts'), 'utf8').match(/export const M\b[^;]*;/)?.[0] ?? '')) bad.push('tokens.ts hand-copies M');
  // every other duration in the stylesheets is a token: a literal ms only in tokens.css (keyframe offsets aside)
  for (const f of readdirSync(join(ROOT, 'src/styles')).filter((x) => x.endsWith('.css') && x !== 'tokens.css' && !x.includes('noto') && x !== 'fonts.css')) {
    const t = stripComments(readFileSync(join(ROOT, 'src/styles', f), 'utf8'));
    for (const x of t.matchAll(/\b(transition|animation)(-duration|-delay)?\s*:[^;]*?\b\d+m?s\b/g)) bad.push(`${f}: ${x[0].slice(0, 80)}`);
  }
  bad.length ? fail(76, `motion values out of step\n    ${bad.join('\n    ')}`) : pass(76, 'MOTION-SPEC §5: motion.gen.ts is generated from tokens.css and current; no literal durations in the stylesheets');
}

/* ---------- MOTION-SPEC v0.1 P0-4 / P0-10: nothing animates layout ---------- */
{
  // what moves is transform / opacity (colour fades allowed); a transition or keyframe on a box's size or
  // place lays the page out every frame, and one on its shadow, filter or background repaints it every
  // frame: neither stays on the compositor, which Android WebView cannot afford
  const LAYOUT = /\b(width|height|max-height|min-height|max-width|top|left|right|bottom|inset|margin(-\w+)?|padding(-\w+)?|grid-template-\w+|flex-basis|font-size|line-height|box-shadow|filter|backdrop-filter|background(-color|-image|-position|-size)?)\b/;
  const bad = [];
  for (const f of readdirSync(join(ROOT, 'src/styles')).filter((x) => x.endsWith('.css'))) {
    const t = stripComments(readFileSync(join(ROOT, 'src/styles', f), 'utf8'));
    for (const x of t.matchAll(/\btransition(-property)?\s*:([^;}]*)/g)) if (LAYOUT.test(x[2].replace(/var\([^)]*\)/g, ''))) bad.push(`${f}: ${x[0].trim().slice(0, 80)}`);
    for (const k of t.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^}]*\})*)[^{}]*\}/g)) {
      for (const d of k[2].matchAll(/([\w-]+)\s*:/g)) if (LAYOUT.test(d[1]) && LAYOUT.exec(d[1])[0] === d[1]) bad.push(`${f}: @keyframes ${k[1]} animates ${d[1]}`);
    }
  }
  bad.length ? fail(77, `layout animated\n    ${bad.join('\n    ')}`) : pass(77, 'MOTION-SPEC P0-4: transitions and keyframes never animate size, place, shadow, filter or background');
}

/* ---------- MOTION-SPEC audit: the same rule for motion written in script ---------- */
{
  // inline style transitions and el.animate keyframes in src/**/*.ts(x): transform, opacity, colour, and
  // clip-path (the editor's open, P1-5) only
  const BAD = /^(width|height|maxHeight|minHeight|maxWidth|top|left|right|bottom|inset|margin\w*|padding\w*|fontSize|lineHeight|boxShadow|filter|backdropFilter|WebkitBackdropFilter|background\w*)$/;
  const CSSBAD = /\b(width|height|max-height|top|left|right|bottom|margin|padding|box-shadow|filter|backdrop-filter|background(-color)?)\b/;
  const bad = [];
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.tsx?$/.test(f.name)) files.push(p); } };
  walk(join(ROOT, 'src'));
  const argOf = (t, i) => {   // the balanced first argument starting at t[i] (just after "animate(")
    let depth = 0, j = i;
    for (; j < t.length; j++) { const c = t[j]; if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) { if (!depth) break; depth--; } else if (c === ',' && !depth) break; }
    return t.slice(i, j).trim();
  };
  for (const p of files) {
    const t = readFileSync(p, 'utf8'), rel = relative(ROOT, p);
    // inline transitions: JSX style objects (transition: '...') and assignments (el.style.transition = '...'),
    // every quoted string on the right-hand side (both arms of a ternary), var() names ignored
    for (const m of t.matchAll(/(?:\btransition(?:Property)?\s*:|\.style\.transition(?:Property)?\s*=)([^;\n]*)/g)) {
      const strs = m[1].match(/`[^`]*`|'[^']*'|"[^"]*"/g) || [];
      if (strs.some((q) => CSSBAD.test(q.replace(/var\([^)]*\)/g, '')))) bad.push(`${rel}: inline ${m[0].slice(0, 70)}`);
    }
    for (const m of t.matchAll(/\.animate\(/g)) {
      let a = argOf(t, m.index + m[0].length);
      if (/^\w+$/.test(a)) { const d = t.match(new RegExp(`\\b(?:const|let)\\s+${a}\\b[^=]*=\\s*([\\s\\S]*?);\\n`)); a = d ? d[1] : ''; }
      for (const k of a.matchAll(/(?:[{,]\s*)(\w+)\s*:/g)) if (BAD.test(k[1])) bad.push(`${rel}: el.animate keyframe ${k[1]}`);
    }
  }
  bad.length ? fail(78, `script animates layout or paint\n    ${bad.join('\n    ')}`) : pass(78, 'MOTION-SPEC audit: inline transitions and el.animate keyframes move transform / opacity only');
}

/* ---------- report ---------- */
let failed = 0;
for (const r of results.sort((a, b) => a.item - b.item)) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  #${String(r.item).padEnd(3)} ${r.msg}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
