import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A guest-facing page reads outwardView(), not me.interests / me.periods.
 * The allowlist is the owner's own data: the type and its repair, the view itself, saves,
 * backup (persist), and the suggestion cards the owner is offered (never rendered while 给人看).
 * A line marked outward-allow is the owner branch of a shared view (`show ? ov : me.…`).
 * 名片 and 偏爱 are not on the allowlist; a hit there fails on its own.
 */

const ROOT = process.cwd();
const PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bme\.interests\b/, label: 'me.interests' },
  { re: /\bme\.periods\b/, label: 'me.periods' },
  { re: /\bstore\.me\.interests\b/, label: 'store.me.interests' },
  { re: /\bstore\.me\.periods\b/, label: 'store.me.periods' },
  { re: /\.interests\.slice\b/, label: '.interests.slice' },
];

/** owner's data, and the function that filters it. Not a guest page. */
const ALLOW = new Set([
  'src/data/me.ts',
  'src/data/visible.ts',
  'src/data/store.tsx',
  'src/data/suggest.ts',
  'src/data/persist.ts',
]);

const HARD = [
  'src/data/taste',
  'src/data/card',
  'src/components/CardView.tsx',
  'src/components/CardSheet.tsx',
  'src/components/TasteBlock.tsx',
];

interface Hit { file: string; line: number; label: string; text: string }

function filesUnder(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) return /\.tsx?$/.test(abs) ? [abs] : [];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p.slice(ROOT.length + 1)));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function hitsIn(rel: string): Hit[] {
  const out: Hit[] = [];
  for (const abs of filesUnder(rel)) {
    const file = abs.slice(ROOT.length + 1).split(/[/\\]/).join('/');
    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
    lines.forEach((text, i) => {
      if (text.includes('outward-allow')) return;
      for (const { re, label } of PATTERNS) {
        if (re.test(text)) out.push({ file, line: i + 1, label, text: text.trim() });
      }
    });
  }
  return out;
}

const fmt = (h: Hit) => `${h.file}:${h.line} ${h.label} — 请改用 outwardView()`;

test('guest pages do not read me.interests or me.periods except the owner allowlist', () => {
  const hits = hitsIn('src').filter((h) => !ALLOW.has(h.file));
  assert.deepEqual(hits.map(fmt), []);
  // the walker is looking at the real tree: these files do contain these reads
  const all = hitsIn('src');
  for (const f of ['src/data/visible.ts', 'src/data/store.tsx', 'src/data/suggest.ts']) {
    assert.ok(all.some((h) => h.file === f), `${f} should still read me.interests or me.periods`);
  }
});

const NET = /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket/;

test('名片 and 偏爱 read neither me.interests nor me.periods', () => {
  const hits = HARD.flatMap((p) => hitsIn(p));
  assert.deepEqual(hits.map(fmt), []);
});

test('名片 and 偏爱 make no request', () => {
  for (const abs of HARD.flatMap((p) => filesUnder(p))) {
    const file = abs.slice(ROOT.length + 1);
    const hit = NET.exec(readFileSync(abs, 'utf8'));
    assert.equal(hit, null, `${file} contains ${hit?.[0]}`);
  }
});

const SKIP_DIR = new Set(['node_modules', 'dist', '.git']);

function textFiles(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) return [abs];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...textFiles(p.slice(ROOT.length + 1)));
    else out.push(p);
  }
  return out;
}

test('the coined comparison is not in the source or the readmes', () => {
  const phrase = '比 MBTI 更准';
  const hits: string[] = [];
  for (const rel of ['src', 'README.md', 'README.en.md']) {
    for (const abs of textFiles(rel)) {
      const file = abs.slice(ROOT.length + 1).split(/[/\\]/).join('/');
      const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
      lines.forEach((text, i) => { if (text.includes(phrase)) hits.push(`${file}:${i + 1}`); });
    }
  }
  assert.deepEqual(hits, []);
});

test('the scan matches a direct read and not a filtered slice', () => {
  assert.ok(PATTERNS.some((p) => p.re.test('const x = me.interests')));
  assert.ok(PATTERNS.some((p) => p.re.test('store.me.periods.find')));
  assert.ok(PATTERNS.some((p) => p.re.test('c.interests.slice(0, 2)')));
  assert.ok(!PATTERNS.some((p) => p.re.test('c.interests.filter((i) => i).slice(0, 2)')));
  assert.ok(!PATTERNS.some((p) => p.re.test('ctx.interests.filter((_, n) => n < 4)')));
});
