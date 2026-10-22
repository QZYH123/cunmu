#!/usr/bin/env node
/**
 * app.json (+ package.json's version) → capacitor.config.json, and — when the native projects exist — the
 * app id, the display name and the version into android/ and ios/. Run after changing app.json or the
 * version (npm run cap:sync and npm run apk:debug run it first).
 *
 * Capacitor's CLI can't load a TypeScript config in an ESM package ("type": "module"), so the config is
 * JSON, written here; edit app.json or this script, not capacitor.config.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(app.appId)) { console.error(`app:id: "${app.appId}" is not a valid app id`); process.exit(1); }

const NAME = app.appName, NAME_EN = app.appNameEn ?? app.appName;
const config = {
  appId: app.appId,
  // Capacitor's own name for the projects: the Latin one (the label people see is set per language below)
  appName: NAME_EN,
  webDir: 'dist',
  // Bangumi asks every client for a User-Agent naming it: the WebView's gets ours appended; native HTTP
  // (CapacitorHttp, which lib/bangumi.ts uses for api.bgm.tv on a phone) sends ours as the whole header
  appendUserAgent: app.userAgent.replace('{version}', version),
  android: {
    // the styles use :has() (Chrome 105); below that Capacitor shows its own "update WebView" notice
    minWebViewVersion: 105,
    allowMixedContent: false,
  },
  ios: { contentInset: 'never' },
  plugins: {
    // fetch() stays the WebView's own; lib/bangumi.ts calls CapacitorHttp itself where it needs to
    CapacitorHttp: { enabled: false },
    // the styles pad with env(safe-area-inset-*) (index.html asks for viewport-fit=cover): on a WebView older
    // than 140 Capacitor pads the view itself and env() reads 0, on a newer one the page draws edge to edge
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
  },
};
const put = (rel, text) => {
  const p = join(ROOT, rel);
  if (existsSync(p) && readFileSync(p, 'utf8') === text) return false;
  writeFileSync(p, text);
  return true;
};
const changed = [];
if (put('capacitor.config.json', JSON.stringify(config, null, 2) + '\n')) changed.push('capacitor.config.json');

// android: applicationId / namespace, versionName / versionCode, the launcher label
const gradle = join(ROOT, 'android/app/build.gradle');
if (existsSync(gradle)) {
  const [maj, min, pat] = version.split(/[.-]/).map((n) => Number(n) || 0);
  const code = maj * 10000 + min * 100 + pat;
  let g = readFileSync(gradle, 'utf8');
  g = g.replace(/namespace\s*=?\s*"[^"]+"/, `namespace = "${app.appId}"`)
    .replace(/applicationId\s+"[^"]+"/, `applicationId "${app.appId}"`)
    .replace(/versionCode\s+\d+/, `versionCode ${Math.max(1, code)}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
  if (put('android/app/build.gradle', g)) changed.push('android/app/build.gradle');
  const strings = 'android/app/src/main/res/values/strings.xml';
  if (existsSync(join(ROOT, strings))) {
    let s = readFileSync(join(ROOT, strings), 'utf8');
    // the label under the icon: the Latin name by default, 存目 on a Chinese system (values-zh, -rTW, -rHK)
    s = s.replace(/(<string name="app_name">)[^<]*(<\/string>)/, `$1${NAME_EN}$2`)
      .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, `$1${NAME_EN}$2`)
      .replace(/(<string name="package_name">)[^<]*(<\/string>)/, `$1${app.appId}$2`)
      .replace(/(<string name="custom_url_scheme">)[^<]*(<\/string>)/, `$1${app.appId}$2`);
    if (put(strings, s)) changed.push(strings);
    // values-zh alone is read as Simplified on Android 7+, so Taiwan and Hong Kong get their own folders
    for (const dir of ['values-zh', 'values-zh-rTW', 'values-zh-rHK']) {
      const zh = `android/app/src/main/res/${dir}/strings.xml`;
      mkdirSync(join(ROOT, 'android/app/src/main/res', dir), { recursive: true });
      if (put(zh, `<?xml version='1.0' encoding='utf-8'?>\n<resources>\n    <string name="app_name">${NAME}</string>\n    <string name="title_activity_main">${NAME}</string>\n</resources>\n`)) changed.push(zh);
    }
  }
}
// ios: the bundle id and the display name
const pbx = join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj');
if (existsSync(pbx)) {
  const p = readFileSync(pbx, 'utf8').replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${app.appId};`)
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
  if (put('ios/App/App.xcodeproj/project.pbxproj', p)) changed.push('ios/App/App.xcodeproj/project.pbxproj');
  const plist = join(ROOT, 'ios/App/App/Info.plist');
  if (existsSync(plist)) {
    const s = readFileSync(plist, 'utf8').replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${NAME_EN}$2`);
    if (put('ios/App/App/Info.plist', s)) changed.push('ios/App/App/Info.plist');
  }
  // the name under the icon per language: InfoPlist.strings in en / zh-Hans / zh-Hant, registered in the project once
  for (const [lp, name] of [['en', NAME_EN], ['zh-Hans', NAME], ['zh-Hant', NAME]]) {
    mkdirSync(join(ROOT, `ios/App/App/${lp}.lproj`), { recursive: true });
    const f = `ios/App/App/${lp}.lproj/InfoPlist.strings`;
    if (put(f, `/* the name under the icon (scripts/apply-app-id.mjs, from app.json) */\n"CFBundleDisplayName" = "${name}";\n`)) changed.push(f);
  }
  const proj = readFileSync(pbx, 'utf8');
  if (!proj.includes('InfoPlist.strings')) {
    const id = (n) => `C0DE57A1000000000000000${n}`;   // fixed ids: the patch is applied once, by this script
    const regions = [['en', 1], ['zh-Hans', 2], ['zh-Hant', 3]];
    const p2 = proj
      .replace('/* Begin PBXBuildFile section */\n', `/* Begin PBXBuildFile section */\n\t\t${id(4)} /* InfoPlist.strings in Resources */ = {isa = PBXBuildFile; fileRef = ${id(5)} /* InfoPlist.strings */; };\n`)
      .replace('/* Begin PBXFileReference section */\n', `/* Begin PBXFileReference section */\n${regions.map(([r, n]) => `\t\t${id(n)} /* ${r} */ = {isa = PBXFileReference; lastKnownFileType = text.plist.strings; name = "${r}"; path = "${r}.lproj/InfoPlist.strings"; sourceTree = "<group>"; };\n`).join('')}`)
      .replace(/(\/\* App \*\/ = \{\s*isa = PBXGroup;\s*children = \()/, `$1\n\t\t\t\t${id(5)} /* InfoPlist.strings */,`)
      .replace(/(isa = PBXResourcesBuildPhase;\s*buildActionMask = \d+;\s*files = \()/, `$1\n\t\t\t\t${id(4)} /* InfoPlist.strings in Resources */,`)
      .replace('/* End PBXVariantGroup section */', `\t\t${id(5)} /* InfoPlist.strings */ = {\n\t\t\tisa = PBXVariantGroup;\n\t\t\tchildren = (\n${regions.map(([r, n]) => `\t\t\t\t${id(n)} /* ${r} */,\n`).join('')}\t\t\t);\n\t\t\tname = InfoPlist.strings;\n\t\t\tsourceTree = "<group>";\n\t\t};\n/* End PBXVariantGroup section */`)
      .replace(/knownRegions = \(\s*en,\s*Base,\s*\);/, 'knownRegions = (\n\t\t\t\ten,\n\t\t\t\tBase,\n\t\t\t\t"zh-Hans",\n\t\t\t\t"zh-Hant",\n\t\t\t);');
    if ((p2.match(/InfoPlist\.strings/g) ?? []).length < 8 || !p2.includes('"zh-Hans"')) { console.error('app:id: could not register InfoPlist.strings in the Xcode project'); process.exit(1); }
    writeFileSync(pbx, p2);
    changed.push('ios/App/App.xcodeproj/project.pbxproj (InfoPlist.strings)');
  }
}
// desktop (Tauri 2, Windows): the whole tauri.conf.json is generated here; Cargo.toml gets the version
if (existsSync(join(ROOT, 'src-tauri/Cargo.toml'))) {
  const tauri = {
    $schema: 'https://schema.tauri.app/config/2',
    // Latin: Tauri names the install folder, the uninstall key, the registry keys and the installer file after
    // productName, and those stay ASCII (%LOCALAPPDATA%\\Cunmu). What people see — the installer's text, the
    // Start menu and desktop shortcuts, Apps & features — is 存目, from DISPLAYNAME in the NSIS template below;
    // the window title is set on the window. The program file is cunmu.exe.
    productName: NAME_EN,
    mainBinaryName: 'cunmu',
    version,
    identifier: app.appId,
    build: {
      frontendDist: '../dist',
      devUrl: 'http://localhost:5173',
      beforeDevCommand: 'npm run dev',
      beforeBuildCommand: '',
    },
    app: {
      windows: [{
        label: 'main', title: NAME, width: 1280, height: 860, minWidth: 960, minHeight: 640, center: true,
        // Bangumi asks for a User-Agent naming the client: the window's own (fetch can't set one)
        userAgent: app.userAgent.replace('{version}', version),
        // files dropped on the window reach the page as HTML drag-and-drop (backups, pictures)
        dragDropEnabled: false,
        backgroundColor: '#F8F7F5',
      }],
      security: {
        csp: "default-src 'self' ipc: http://ipc.localhost; img-src 'self' data: blob: https://lain.bgm.tv https://shared.cloudflare.steamstatic.com https://shared.steamstatic.com https://cdn.cloudflare.steamstatic.com https://cdn.akamai.steamstatic.com https://steamcdn-a.akamaihd.net asset: http://asset.localhost; connect-src 'self' ipc: http://ipc.localhost https://api.bgm.tv https://lain.bgm.tv; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'",
      },
    },
    bundle: {
      active: true,
      targets: ['nsis'],
      publisher: 'QZYH123', // also a registry key (Software\\<publisher>\\<product>): ASCII
      shortDescription: `${NAME} ${NAME_EN}`,
      copyright: '',
      icon: ['icons/32x32.png', 'icons/128x128.png', 'icons/128x128@2x.png', 'icons/icon.ico', 'icons/icon.png'],
      windows: {
        // WebView2 is on every current Windows 10/11; where it is missing the installer fetches it
        webviewInstallMode: { type: 'downloadBootstrapper', silent: true },
        nsis: {
          installMode: 'currentUser', languages: ['SimpChinese', 'English'], displayLanguageSelector: false, installerIcon: 'icons/icon.ico',
          // Tauri's template with the visible name split from the path name (see its header); hooks clear the earlier 存目 folder
          template: 'windows/installer.nsi', installerHooks: 'windows/hooks.nsh',
        },
      },
    },
    plugins: {},
  };
  if (put('src-tauri/tauri.conf.json', JSON.stringify(tauri, null, 2) + '\n')) changed.push('src-tauri/tauri.conf.json');
  const nsi = join(ROOT, 'src-tauri/windows/installer.nsi');
  const nsiText = readFileSync(nsi, 'utf8');
  if (!/^!define DISPLAYNAME "[^"]*"/m.test(nsiText)) { console.error('app:id: no DISPLAYNAME in src-tauri/windows/installer.nsi'); process.exit(1); }
  if (put('src-tauri/windows/installer.nsi', nsiText.replace(/^!define DISPLAYNAME "[^"]*"/m, `!define DISPLAYNAME "${NAME}"`))) changed.push('src-tauri/windows/installer.nsi');
  const cargo = readFileSync(join(ROOT, 'src-tauri/Cargo.toml'), 'utf8').replace(/^version = "[^"]+"/m, `version = "${version}"`);
  if (put('src-tauri/Cargo.toml', cargo)) changed.push('src-tauri/Cargo.toml');
}
console.log(changed.length ? `app:id: ${app.appId} · ${NAME} / ${NAME_EN} · ${version} → ${changed.join(', ')}` : `app:id: ${app.appId} · ${NAME} / ${NAME_EN} · ${version} (nothing to change)`);
