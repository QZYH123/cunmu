#!/usr/bin/env node
/**
 * The app build ships no demo content (APP-PLAN v0.2 §item 1): fails when dist/ (or the directory given)
 * holds a demo cover, a woff font copy, or text that only the development catalogue / test fixtures carry.
 *
 *   node scripts/check-dist.mjs [dir]      (npm run verify runs it on dist/ right after `npm run build`)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIR = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, 'dist');
const problems = [];
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
try { walk(DIR); } catch { console.error(`check-dist: no ${DIR} — run npm run build first`); process.exit(2); }

// 1. files: the demo covers, any cover-named JPEG, woff copies, fixture workbooks
for (const f of files) {
  const r = relative(DIR, f);
  if (/(^|\/)covers\//.test(r)) problems.push(`demo cover directory: ${r}`);
  else if (/bgm-\d+-[sm]\.jpg$/.test(r)) problems.push(`demo cover: ${r}`);
  if (/\.woff$/.test(r)) problems.push(`woff font copy (woff2 only): ${r}`);
  if (/\.(xlsx|ndjson)$/.test(r)) problems.push(`fixture file: ${r}`);
}

// 2. text only the demo catalogue / the fixtures carry. The catalogue is not in the public repository; with
// the development kit laid over the tree its snapshot titles are checked too.
const SNAP = join(ROOT, 'src/demo/bangumi.json');
const snapshot = existsSync(SNAP) ? JSON.parse(readFileSync(SNAP, 'utf8')) : [];
const titles = snapshot.map((s) => s.nameCn || s.name).filter((t) => [...t].length >= 4).slice(0, 40);
const FINGERPRINTS = [
  ...titles.map((t) => [t, 'Bangumi snapshot title']),
  ['星星离得很远', 'curated quote'], ['工作第一年', 'demo named period'], ['essay-autumn', 'curated essay id'],
  ['有些路要一个人走', 'fake WeRead batch'], ['额尔古纳河右岸', '收录 candidates (ADDABLE)'], ['Anna Berg', 'demo name pool'],
  ['山田尚子', 'real-looking demo name'], ['./covers/', 'demo cover path'], ['self-pedia-prototype', 'old Bangumi User-Agent'],
  ['漫长的季节', 'douban-sample.xlsx fixture'], ['往前看，别回头', 'douban-sample.xlsx fixture'],
];
const texts = files.filter((f) => /\.(js|css|html|json|txt|map)$/.test(f)).map((f) => [relative(DIR, f), readFileSync(f, 'utf8')]);
for (const [needle, what] of FINGERPRINTS) {
  const hit = texts.find(([, t]) => t.includes(needle));
  if (hit) problems.push(`${what} «${needle}» in ${hit[0]}`);
}

const kb = Math.round(files.reduce((n, f) => n + statSync(f).size, 0) / 1024);
if (problems.length) {
  console.error(`check-dist: ${problems.length} problem(s) in ${relative(ROOT, DIR) || DIR}`);
  for (const p of problems.slice(0, 40)) console.error(`  FAIL ${p}`);
  process.exit(1);
}
console.log(`check-dist: ${files.length} files, ${kb} KB, no demo covers / fixtures / woff (${FINGERPRINTS.length} fingerprints)`);
