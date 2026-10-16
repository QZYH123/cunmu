#!/usr/bin/env node
// Writes src/data/licenses.json: every open-source package the shipped app contains, its licence and the
// copyright line from its licence file, plus the full text of each licence once. 我 → 开源许可 shows it.
//   node scripts/make-licenses.mjs        (needs node_modules; the Rust part needs cargo and its registry)
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LICENSE_FILE = /^(licen[cs]e|copying|notice)/i;
const readLicenseFiles = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => LICENSE_FILE.test(f)).sort().map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8') }));
};
const copyrightOf = (files) => {
  for (const { text } of files) {
    const line = text.split('\n').map((l) => l.trim().replace(/^[#*\s]+/, ''))
      .find((l) => /^(copyright\s*(\(c\)|©)?\s*(\d|-?\s*present)|copyright\s*(\(c\)|©)\s*\S|\(c\)\s*\d|©\s*\d)/i.test(l) && !/\[yyyy\]|<year>|\{yyyy\}/i.test(l));
    if (line) return line.replace(/\s+/g, ' ').replace(/\s*\(https?:[^)]*\).*$/, '').slice(0, 140);
  }
  return '';
};
const texts = {};
const keepText = (spdx, files) => {
  for (const id of spdx.split(/\s*(?:OR|AND|\/|\(|\))\s*/).filter(Boolean)) {
    if (texts[id]) continue;
    const want = { 'Apache-2.0': /apache/i, MIT: /mit|^licen[cs]e(\.md|\.txt)?$/i, 'OFL-1.1': /licen[cs]e/i }[id] ?? /licen[cs]e|copying/i;
    const f = files.find((x) => want.test(x.file) && x.text.length > 300);
    if (f && (id !== 'MIT' || /permission is hereby granted/i.test(f.text)) && (id !== 'Apache-2.0' || /apache license/i.test(f.text))) texts[id] = f.text.trim();
  }
};

// the fontsource packages carry the OFL text without the font's own notice
const FONT_COPYRIGHT = {
  '@fontsource-variable/source-serif-4': 'Copyright 2014-2023 Adobe, with Reserved Font Name ‘Source’',
  '@fontsource/noto-serif-sc': 'Copyright 2017 Adobe Systems Incorporated, with Reserved Font Name ‘Source’',
};

// ── the page and the phone apps: production npm packages ──
const tree = JSON.parse(execFileSync('npm', ['ls', '--omit=dev', '--all', '--json', '--long'], { cwd: ROOT, maxBuffer: 1 << 26 }).toString());
const web = new Map();
const walk = (deps) => {
  for (const [name, d] of Object.entries(deps ?? {})) {
    // build-time only (type declarations; sharp, which only scripts/make-icons uses, and what it pulls in)
    if (/^@types\/|^@img\/|^@emnapi\/|^(csstype|tslib|sharp)$/.test(name)) continue;
    if (!d.version || web.has(name)) { walk(d.dependencies); continue; }
    const dir = d.path ?? join(ROOT, 'node_modules', name);
    const pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const files = readLicenseFiles(dir);
    const license = typeof pj.license === 'string' ? pj.license : pj.license?.type ?? 'see package';
    keepText(license, files);
    const repo = typeof pj.repository === 'string' ? pj.repository : pj.repository?.url ?? pj.homepage ?? '';
    web.set(name, { name, version: d.version, license, copyright: copyrightOf(files) || FONT_COPYRIGHT[name] || '', url: repo.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://') });
    walk(d.dependencies);
  }
};
walk(tree.dependencies);
// the native shells link these too (not npm packages of the page, but shipped in the APK / IPA)
const nativeNotes = [
  { name: 'AndroidX (core, appcompat, webkit, splashscreen…)', version: '', license: 'Apache-2.0', copyright: 'Copyright The Android Open Source Project', url: 'https://developer.android.com/jetpack/androidx' },
];

// ── the Windows app: Rust crates linked into the exe ──
let rust = [];
try {
  const env = { ...process.env, PATH: `${homedir()}/.cargo/bin:${process.env.PATH}` };
  const meta = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--filter-platform', 'x86_64-pc-windows-msvc', '--offline'], { cwd: join(ROOT, 'src-tauri'), env, maxBuffer: 1 << 28 }).toString());
  const pkg = new Map(meta.packages.map((p) => [p.id, p]));
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const seen = new Set(), stack = [meta.resolve.root];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const d of nodes.get(id).deps) if (d.dep_kinds.some((k) => k.kind === null)) stack.push(d.pkg);
  }
  seen.delete(meta.resolve.root);
  rust = [...seen].map((id) => pkg.get(id)).map((p) => {
    const files = readLicenseFiles(dirname(p.manifest_path));
    const license = (p.license ?? 'see crate').replace(/\s*\/\s*/g, ' OR ');
    keepText(license, files);
    return { name: p.name, version: p.version, license, copyright: copyrightOf(files), url: p.repository ?? '' };
  }).sort((a, b) => a.name.localeCompare(b.name));
} catch (e) {
  console.error('make-licenses: cargo metadata failed, keeping the Rust list as it was:', e.message.split('\n')[0]);
  const old = JSON.parse(readFileSync(join(ROOT, 'src/data/licenses.json'), 'utf8'));
  rust = old.rust;
  Object.assign(texts, old.texts, texts);
}

const out = {
  web: [...[...web.values()].sort((a, b) => a.name.localeCompare(b.name)), ...nativeNotes],
  rust,
  texts: Object.fromEntries(Object.entries(texts).sort()),
};
writeFileSync(join(ROOT, 'src/data/licenses.json'), JSON.stringify(out) + '\n');
console.log(`licenses: ${out.web.length} app packages, ${out.rust.length} Rust crates, ${Object.keys(out.texts).length} licence texts`);
const used = new Set([...out.web, ...out.rust].flatMap((p) => p.license.split(/\s*(?:OR|AND|\(|\))\s*/).filter(Boolean)));
const missing = [...used].filter((id) => !out.texts[id]);
if (missing.length) console.log('  no text found for:', missing.join(', '));
