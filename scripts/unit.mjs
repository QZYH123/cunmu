#!/usr/bin/env node
/**
 * Unit tests (no browser, no network): every tests/*.test.ts is bundled with esbuild — `@demo` mapped to the
 * app build's empty stub, as in `vite build` — and run with node:test.
 *
 *   npm run unit            all of them
 *   npm run unit -- bangumi only the files whose name contains "bangumi"
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const only = process.argv[2] ?? '';
const tests = readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.test.ts') && f.includes(only));
const out = mkdtempSync(join(tmpdir(), 'cunmu-unit-'));
try {
  await build({
    entryPoints: tests.map((f) => join(ROOT, 'tests', f)),
    outdir: out, bundle: true, platform: 'node', format: 'esm', target: 'node22', outExtension: { '.js': '.mjs' },
    alias: { '@demo': join(ROOT, 'src/data/noDemo.ts') },
    define: { __APP_VERSION__: JSON.stringify('0.0.0-test') },
    loader: { '.json': 'json' }, logLevel: 'error',
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const files = readdirSync(out).filter((f) => f.endsWith('.mjs')).map((f) => join(out, f));
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], { stdio: 'inherit', cwd: ROOT });
  process.exitCode = r.status ?? 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
