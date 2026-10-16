#!/usr/bin/env node
/**
 * The Windows desktop app (Tauri 2 + WebView2), cross-built on Linux: app.json → tauri.conf.json, the
 * app build (no demo content; check-dist must pass), then `tauri build` for x86_64-pc-windows-msvc
 * through cargo-xwin (it fetches the MSVC CRT + Windows SDK on first use) and an NSIS installer.
 *
 *   npm run win:build                       → src-tauri/target/x86_64-pc-windows-msvc/release/
 *                                              bundle/nsis/<productName>_<version>_x64-setup.exe  and  cunmu.exe
 *   npm run win:build -- --out <dir>        and copies there (the installer + Cunmu_<version>_x64-portable.exe)
 *
 * Needs: rustup with the x86_64-pc-windows-msvc target, cargo-xwin, clang/lld/llvm (clang-cl, lld-link,
 * llvm-rc, llvm-lib) and makensis (nsis). Unsigned: Windows SmartScreen warns on first run (see docs/DEVELOPING.md).
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const outArg = process.argv.indexOf('--out');
const out = outArg > 0 ? resolve(process.argv[outArg + 1]) : null;
const TARGET = 'x86_64-pc-windows-msvc';

const env = { ...process.env };
const extra = [join(env.HOME ?? '', '.cargo/bin'), '/usr/lib/llvm-19/bin', '/usr/lib/llvm-20/bin'].filter(existsSync);
env.PATH = [...extra, env.PATH].join(':');
const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`], { env }).status === 0;
const missing = ['cargo', 'cargo-xwin', 'clang-cl', 'lld-link', 'llvm-rc', 'makensis'].filter((c) => !has(c));
if (missing.length) { console.error(`win: missing ${missing.join(', ')} — see the header of this script`); process.exit(2); }

const run = (cmd, args, cwd = ROOT) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`win: ${cmd} failed`); process.exit(1); }
};
const bin = (n) => join(ROOT, 'node_modules/.bin', n);

run(process.execPath, [join(ROOT, 'scripts/apply-app-id.mjs')]);
run(bin('tsc'), ['--noEmit']);
run(bin('vite'), ['build', '--logLevel', 'warn']);
run(process.execPath, [join(ROOT, 'scripts/check-dist.mjs')]);
run(bin('tauri'), ['build', '--runner', 'cargo-xwin', '--target', TARGET]);

const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const rel = join(ROOT, 'src-tauri/target', TARGET, 'release');
// the bundler names the installer after productName (Latin, Cunmu); the copies handed out keep that name,
// which survives every download page, chat app and zip tool
const { productName, mainBinaryName } = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8'));
const setup = join(rel, `bundle/nsis/${productName}_${version}_x64-setup.exe`);
const exe = join(rel, `${mainBinaryName ?? 'cunmu'}.exe`);
const APP = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
const LATIN = APP.appNameEn ?? APP.appName;
for (const f of [setup, exe]) if (!existsSync(f)) { console.error(`win: ${f} did not come out`); process.exit(1); }
const mb = (f) => `${(statSync(f).size / 1048576).toFixed(1)} MB`;
console.log(`\nwin: installer ${setup} (${mb(setup)})\nwin: app      ${exe} (${mb(exe)}; runs on its own where WebView2 is installed)`);
if (out) {
  mkdirSync(out, { recursive: true });
  copyFileSync(setup, join(out, `${LATIN}_${version}_x64-setup.exe`));
  copyFileSync(exe, join(out, `${LATIN}_${version}_x64-portable.exe`));
  console.log(`win: copied to ${out}`);
}
