# 存目 · Cunmu — developing

The user-facing introduction is [README.md](../README.md) (中文) / [README.en.md](../README.en.md). This page is for building and changing the app.

**存目** (English name Cunmu): a personal encyclopedia of the books, anime, films, music, games and essays you have read, watched or played. Phone-first layout (designed at 390×844), with tablet and desktop layouts; built to the product plan v0.7, style guide v0.4 (with its §3.19.8 game exception), VOICE v0.1 and tech plan v0.4. It ships as a web build, an Android / iOS app (Capacitor 8) and a Windows app (Tauri 2).

**One build.** The public repository holds no demo library: `npm run dev` and `npm run build` both start with the empty home, exactly as the app does. `@demo` resolves to `src/data/noDemo.ts` (an empty stub). The development catalogue (500-item library, Bangumi snapshot, drawn covers, the 96-test `smoke.mjs`, the screenshot script) lives in a separate demo kit outside the repo, which lays its files and a small patch (the `@demo` switch, its covers) over a scratch checkout. Never commit the kit's files.

**The name.** 存目 is what the app calls itself and what a Chinese phone shows under the icon; Cunmu (its pinyin) is the
Latin name (other system languages, file names, the repo, the app id `com.qzyh123.cunmu`, the User-Agent, storage
keys and data folders). A backup exported before the rename (`strata-export/1`, `strata.json` in the ZIP) still restores. In the Siku Quanshu (四库全书) catalogue, 存目 are the books whose full text was not
taken in: only the title and a short abstract were kept. Both names live in `app.json` (`appName`, `appNameEn`);
`npm run app:id` writes them into Android (`values/` Cunmu; `values-zh`, `-zh-rTW`, `-zh-rHK` 存目), iOS (`InfoPlist.strings` for en /
zh-Hans / zh-Hant) and the Windows app (window title, installer text, Start menu and desktop shortcuts and Apps & features entry 存目;
every folder, registry key and file name stays Latin: installed to `%LOCALAPPDATA%\Cunmu`, program file `cunmu.exe`,
installers `Cunmu_<version>_x64-setup.exe` / `-portable.exe` — see `src-tauri/windows/installer.nsi`).

Nothing from `tests/fixtures/` (or a laid-over demo kit) may reach `dist/`: `scripts/check-dist.mjs` fails the build gate if a demo cover, a fixture or demo text gets in.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (open in a phone-sized viewport)
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Type-check and build the app into `dist/` (hash routing, any static host works; this is what goes into the phone apps) |
| `npm run check:dist` | Fail if `dist/` holds demo covers, fixture data or woff fonts |
| `npm run unit` | Unit tests (`tests/*.test.ts`, node:test, no browser, no network) |
| `npm run preview` | Serve `dist/` |
| `npm run check` | Static checks for the style guide §6 checklist (tokens, colours, lines, type, banned copy) |
| `npm run smoke` | App smoke tests (headless Chrome, `scripts/smoke-app.mjs`): first open, 看看示例, the storage move, Bangumi from recorded fixtures, the 豆瓣 import, export, the Windows CSP — fails on any uncaught or console error; no request may leave localhost |
| `npm run verify` | The standard gate: `build` → `check` → `check:dist` → `unit` → app smoke tests. Runs as the git pre-commit hook (`npm install` points `core.hooksPath` at `.githooks/`; skip once with `git commit --no-verify`) |
| `npm run apk:debug` | Build a debug APK (see below) |
| `npm run cap:sync` | App build → `npx cap sync` (copies `dist/` into `android/` and `ios/`) |
| `npm run app:id` | Write `app.json` (id, name) and the version into `capacitor.config.json`, `android/`, `ios/` |

## The phone apps (Capacitor 8)

- **Identity:** `app.json` holds the app id (`com.qzyh123.cunmu`), the display name (`Cunmu`) and the User-Agent sent to Bangumi. The id is permanent once anything is uploaded (TestFlight, 蒲公英, a store) — settle it first, then `npm run app:id`. `capacitor.config.json` is generated from it (Capacitor's CLI can't load a TS config in an ESM package).
- **Toolchain:** Node 22+ (Capacitor 8's CLI), JDK 21, Android SDK platform 36 + build-tools 35/36. On the shared build box: `export PATH=/opt/spike-tools/node22/bin:$PATH`, `ANDROID_HOME=/opt/spike-tools/android-sdk` (the script finds both).
- **Debug APK:** `npm run apk:debug [-- --out path/cunmu-debug.apk]` → `android/app/build/outputs/apk/debug/app-debug.apk`. Debug-signed: for sideloading and 蒲公英-style testing. A release build is signed when `CUNMU_KEYSTORE`, `CUNMU_KEYSTORE_PASSWORD`, `CUNMU_KEY_ALIAS` and `CUNMU_KEY_PASSWORD` are set (`android/app/build.gradle`; CI takes them from repository secrets). Keep the keystore out of git and back it up: a lost key means users can't upgrade.
- **iOS:** `ios/` is committed (Swift Package Manager, no CocoaPods). Building needs a Mac with Xcode 16+: `npm run cap:sync && npx cap open ios`, set the signing team, Product → Archive → TestFlight. Nothing iOS-specific can be built or checked on Linux.
- **Around the page** (`src/lib/shell.ts`, `src/lib/native.ts`): the system bars draw over the page (SystemBars `insetsHandling: 'native'`; the CSS pads with `env(safe-area-inset-*)`) and their icons follow the app's theme. Android back closes whatever is open on top, then goes back a page, then to 首页, then sends the app to the background. When the keyboard opens, Android shrinks the web view by its height; on both systems the focused field is scrolled back into view once the page has its new size. iOS has no `@capacitor/keyboard` (WKWebView's own scrolling plus that helper) — check on a device before release.
- **Where the data lives:** `Directory.Data/cunmu/library.json` (+ `.prev.json`, one generation back) and `cunmu/images/`; written via temp file + rename, batched, flushed when the app goes to the background (`src/lib/storage.ts`, `src/lib/durable.ts`). The WebView's localStorage / IndexedDB are read once on the first start and then left alone, because the system may clear them.

## The Windows app (Tauri 2)

- **What it is:** `src-tauri/` wraps the same app build (`dist/`) in a WebView2 window: 1280×860, minimum 960×640, title `Cunmu`. `src-tauri/tauri.conf.json` is generated from `app.json` by `npm run app:id` (id `com.qzyh123.cunmu`, version from package.json, the window's User-Agent = the Bangumi one).
- **Build on Linux (cross-compiled):** `npm run win:build [-- --out /workspace/cunmu-builds]` → `Cunmu_<version>_x64-setup.exe` (NSIS, per-user install to `%LOCALAPPDATA%\Cunmu`, no admin; the template in `src-tauri/windows/` is Tauri's with the visible name 存目 split from the Latin path name, and its hook removes an earlier test install in `%LOCALAPPDATA%\存目`) and the bare `cunmu.exe` (copied as `…-portable.exe`; runs without installing wherever WebView2 is present). Needs rustup + target `x86_64-pc-windows-msvc`, `cargo install cargo-xwin` (downloads the MSVC CRT and Windows SDK on first use, accepting Microsoft's licence), `clang` `lld` `llvm` (`clang-cl`, `lld-link`, `llvm-rc`) and `nsis`. MSI needs a Windows host; NSIS is enough.
- **WebView2:** on every current Windows 10/11. Where it's missing, the installer downloads Microsoft's bootstrapper and installs it silently (needs internet). The portable exe shows "Could not find the WebView2 Runtime" instead.
- **Data:** the library is `%APPDATA%\com.qzyh123.cunmu\cunmu\library.json` (+ `.prev.json`), written like the phones' (temp file, rename, one previous copy; flushed when the window closes) through tauri-plugin-fs, scoped to that folder. Pictures and the Bangumi token stay in WebView2's own storage, `%LOCALAPPDATA%\com.qzyh123.cunmu\EBWebView` (kept across restarts and updates; removed only by uninstalling with "delete app data" or by hand).
- **The Bangumi token on Windows** stays in WebView2's localStorage (above), readable by anything running as the same Windows user. The phones keep it in the iOS Keychain / an Android Keystore key (`@aparajita/capacitor-secure-storage`); the Windows Credential Manager would need a small Rust command (e.g. the `keyring` crate) — not done yet.
- **Export / links:** export asks where to save (system save dialog); http(s) links open in the default browser; the 「新标签页打开」 menu item is hidden. Files dropped on the window reach the page (`dragDropEnabled: false`).
- **Unsigned:** no code-signing certificate yet, so SmartScreen shows "Windows protected your PC" on first run (More info → Run anyway). Signing needs an OV/EV certificate (or Azure Trusted Signing) and `bundle.windows.signCommand`.
- **Checked here:** `smoke-app` runs the app under the window's content security policy; `tests/desktop.test.ts` keeps the config in step with `app.json`.

## Icon and launch screen

The mark is a small stack of covers on a sage tile — ink-indigo, ochre and cinnabar, fanned a little, the
things you've read, watched, played and listened to laid one on another. The front one carries nothing but its
title slip (题签): what is kept is the name, which is what 存目 means. Flat, with a soft tinted shadow under each
cover and a faint light from the top left. Drawn in `design/icon/mark.mjs` (a 1024 grid, rotated rounded rects);
below 48px it switches to hand-placed pixel drawings (`tile16`, `tile32`: covers on whole pixels), which the
favicon and the small sizes in the .ico use. The Android adaptive icon is the sage ground plus the stack inside the
66dp safe circle, with a one-colour layer for themed icons (the covers cut apart, the slip cut out).
How it got there: `design/icon/r13` (research-led minimal directions; the research notes are in the design docs)
and `design/icon/r14` (the refinement: `node design/icon/r14/stack.mjs out.png '{…}'` renders a variant,
`measure.py` reports where the stack sits). r11/r12 keep the earlier realistic and cartoon explorations, and
`design/icon/explore/` the first directions; their rendered PNGs are not in git (re-run their scripts).
`node scripts/make-icons.mjs [--sheet out.png]` writes every platform's files from it: `public/` (favicon,
touch icon, PWA icons), the Android launcher (adaptive, with a monochrome layer for themed icons) and the
Android 12 launch mark, the iOS app icon and launch screen (`SplashBg` follows dark mode), and `src-tauri/icons`.
The launch screens (Android 12, iOS, and the page's own start screen in index.html) show the same 96px tile on the page colour — paper in light, near-black in dark, so dark mode never flashes white or sage before the app's own colour (written into index.html by the same script); `public/boot.js` sets the
chosen look before the first paint, so a dark phone never flashes white.

## 我 → 关于

- **隐私说明** (`src/pages/About.tsx`): plain words, each claim checked against the code (the comment above it lists where). Change it with the code.
- **开源许可**: `node scripts/make-licenses.mjs` regenerates `src/data/licenses.json` (production npm packages, the Rust crates in the Windows exe, each licence's text). Run it after changing dependencies.
- **反馈**: `src/config.ts` → `FEEDBACK_EMAIL` (TODO: fill in). Empty, it opens `ISSUES_URL`.
- **复制诊断信息**: version, platform, counts per kind, connection state, sizes — no titles, names, notes, usernames or tokens (`src/lib/diagnostics.ts`).

## Imports and export (the app build)

- **Bangumi** (`src/lib/bangumi.ts`, `bangumiNet.ts`, `src/data/bangumiAgent.tsx`): the real API at `https://api.bgm.tv/v0`. By username (public collections) or a personal access token from https://next.bgm.tv/demo/access-token (also private ones). Reads 看过 + 在看, 100 per page, one request a second, backs off on 429/5xx; resyncs on open/resume after 6 h; core creators are fetched lazily (an opened entry jumps the queue). Token: Bangumi's API can't say when it expires (7 days minimum), so a 401 marks the connection 「令牌用不了了」 and 「换一个令牌」 resumes. It is kept outside the library so it never ends up in an export: on a phone in the system's secure store (Android Keystore / iOS Keychain through `@aparajita/capacitor-secure-storage`, no iCloud sync; if that store fails, the private file `Directory.Data/cunmu/secrets/bangumi-token`), localStorage `cunmu/bangumi-token` on the web and in the Windows app. Covers load from `lain.bgm.tv` at runtime; the app keeps a copy in `Directory.Cache/covers/` (at most 150 MB, least recently used go first). An export keeps each Bangumi work's cover *address* (not the image), so a restored library shows its covers before the first sync; 在看 is not in the file and comes back with that sync. In the app, requests go through CapacitorHttp with the User-Agent from `app.json`. Re-record the test fixtures by hand with `node scripts/record-bangumi-fixtures.mjs <username>` (ask first, and anonymise before committing — `tests/fixtures/bangumi/RECORDED.md`).
- **Douban** (`src/lib/douban.ts`, `doubak.ts`, `xlsx.ts`): files only — Cunmu never contacts Douban. 豆伴 (tofu) / douban-backup `.xlsx`, or 豆备 (doubak) canonical `marks.ndjson` + `subjects.ndjson` (pick both, or a zip of them). Works come in with paper covers. Test files: `scripts/make-doufen-fixture.mjs` (written by 豆伴's own SheetJS build, invented data), `scripts/make-doubak-fixture.mjs` (passes the doubak spec validator).
- **Export / restore:** the web downloads the ZIP; the app writes it to `Directory.Cache/exports/` and opens the system share sheet (`src/lib/saveOut.ts`). Restore picks a `.zip`/`.json` with the file picker on both. Android pickers take any file (the page checks it) because the WebView can't map every extension to a MIME type.

## Prototype switches (only with the demo kit laid over the tree)

- **Fake library size:** 我 → 原型调试, or triple-tap the masthead (default 「我看过的」) on the home page. Tiers: 0 / 1 / 3 / 5 / 12 / 50 / 500 / 3,000.
- **Reduced motion and 150% text:** switches in the same section (the OS settings work too).
- **URL overrides** (used by the screenshot script): `?tier=50&theme=dark&motion=reduce&font=1.5&reset=1#/entry/bgm-9585`.
- **Collage density on a period page:** `#/year/2013?n=8` caps the period to N works.

## Layout

- `src/styles/tokens.css` is the only place raw colours, sizes, radii, shadows and durations live; `src/tokens.ts` mirrors the timings for JS.
- `src/data/` holds the work model, the store, persistence, the sample generator and `noDemo.ts` (the empty `@demo` stub).
- `src/lib/native.ts` is the one place that knows whether it runs inside the app; `src/lib/storage.ts` / `images.ts` / `shell.ts` hold the native paths.
- `src/components/CoverWall.tsx` implements the justified-row wall (§3.9.2), the full wall is virtualised in `src/pages/FullWall.tsx`.

## Steam (games)

- `src/lib/steam.ts` (parsing, mapping), `src/lib/steamNet.ts` (requests, one at a time ≥ 350 ms apart), `src/pages/SteamConnect.tsx`, `src/components/SteamPlay.tsx`. The app builds call `api.steampowered.com` (GetOwnedGames, ResolveVanityURL, GetPlayerAchievements, GetSchemaForGame, GetGlobalAchievementPercentagesForApp) and `store.steampowered.com/api/appdetails` through CapacitorHttp / tauri-plugin-http (Steam sends no CORS headers, so the web build can only open a saved GetOwnedGames JSON). The user's own Web API key is kept like the Bangumi token (`lib/secrets.ts`, `steam-key`), never exported. Per Steam's Web API terms, no shared key ships with the app.

## CI

- `.github/workflows/verify.yml`: `npm run verify` on every push to main and every pull request.
- `.github/workflows/release.yml`: on a `v*` tag, the Android APK (release-signed if the `CUNMU_*` secrets exist, else debug) and the Windows installer + portable exe (cross-built like `npm run win:build`, unsigned), attached to a **draft** GitHub Release.
