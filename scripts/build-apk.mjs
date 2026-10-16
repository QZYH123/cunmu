#!/usr/bin/env node
/**
 * A debug APK, from scratch: app.json → native projects, the app build (no demo content; check-dist must
 * pass), `cap sync android`, `gradlew assembleDebug`.
 *
 *   npm run apk:debug                    → android/app/build/outputs/apk/debug/app-debug.apk
 *   npm run apk:debug -- --out <file>    and a copy there
 *
 * Needs Node 22+ (Capacitor 8's CLI), JDK 21 and the Android SDK (platform 36, build-tools 35+):
 * JAVA_HOME / ANDROID_HOME, or the usual install paths. Debug-signed only: fine for sideloading and
 * 蒲公英 / Firebase testing, never for a store (that needs a release keystore, see README).
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const outArg = process.argv.indexOf('--out');
const out = outArg > 0 ? resolve(process.argv[outArg + 1]) : null;

if (Number(process.versions.node.split('.')[0]) < 22) { console.error(`apk: Capacitor 8 needs Node 22+ (this is ${process.version})`); process.exit(2); }
const env = { ...process.env };
if (!env.JAVA_HOME) {
  const jvm = '/usr/lib/jvm';
  const j = existsSync(jvm) && readdirSync(jvm).find((d) => /21/.test(d) && existsSync(join(jvm, d, 'bin/javac')));
  if (j) env.JAVA_HOME = join(jvm, j);
}
if (!env.ANDROID_HOME) env.ANDROID_HOME = env.ANDROID_SDK_ROOT || ['/opt/spike-tools/android-sdk', join(env.HOME ?? '', 'Android/Sdk'), join(env.HOME ?? '', 'Library/Android/sdk')].find(existsSync);
if (!env.ANDROID_HOME) { console.error('apk: no Android SDK — set ANDROID_HOME'); process.exit(2); }
env.ANDROID_SDK_ROOT = env.ANDROID_HOME;

const run = (cmd, args, cwd = ROOT) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`apk: ${cmd} failed`); process.exit(1); }
};
const bin = (n) => join(ROOT, 'node_modules/.bin', n);

run(process.execPath, [join(ROOT, 'scripts/apply-app-id.mjs')]);
run(bin('tsc'), ['--noEmit']);
run(bin('vite'), ['build', '--logLevel', 'warn']);
run(process.execPath, [join(ROOT, 'scripts/check-dist.mjs')]);
run(bin('cap'), ['sync', 'android']);
run(join(ROOT, 'android/gradlew'), ['assembleDebug', '--console=plain', '-q'], join(ROOT, 'android'));

const apk = join(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk');
if (!existsSync(apk)) { console.error('apk: no APK came out'); process.exit(1); }
const mb = (statSync(apk).size / 1048576).toFixed(1);
console.log(`\napk: ${apk} (${mb} MB)`);
if (out) { mkdirSync(dirname(out), { recursive: true }); copyFileSync(apk, out); console.log(`apk: copied to ${out}`); }
