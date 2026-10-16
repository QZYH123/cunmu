import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// the Windows app's config is generated from app.json by scripts/apply-app-id.mjs; this catches drift
const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const app = json('app.json');
const pkg = json('package.json');
const tauri = json('src-tauri/tauri.conf.json');
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
const caps = json('src-tauri/capabilities/default.json');

test('desktop: identity, version and User-Agent come from app.json / package.json', () => {
  assert.equal(tauri.identifier, app.appId);
  assert.equal(tauri.productName, app.appNameEn ?? app.appName);
  assert.equal(tauri.version, pkg.version);
  assert.match(cargo, new RegExp(`^version = "${pkg.version.replace(/\./g, '\\.')}"`, 'm'));
  const w = tauri.app.windows[0];
  assert.equal(w.label, 'main');
  assert.equal(w.title, app.appName);
  assert.equal(w.userAgent, app.userAgent.replace('{version}', pkg.version));
  assert.ok(w.width >= 1280 && w.height >= 860 && w.minWidth === 960 && w.minHeight === 640);
  assert.equal(w.dragDropEnabled, false, 'files dropped on the window must reach the page');
});

test('desktop: the policy lets Bangumi through and nothing else from outside', () => {
  const csp: string = tauri.app.security.csp;
  const connect = csp.split(';').find((d) => d.trim().startsWith('connect-src'))!;
  assert.ok(connect.includes('https://api.bgm.tv') && connect.includes('https://lain.bgm.tv'));
  assert.ok(!/douban/.test(csp), 'Douban is never contacted');
  assert.deepEqual(tauri.bundle.targets, ['nsis']);
});

test('desktop: file access is the app data folder only (exports go where the save dialog says)', () => {
  const scope = caps.permissions.find((p: { identifier?: string }) => p.identifier === 'fs:scope');
  assert.deepEqual(scope.allow.map((a: { path: string }) => a.path), ['$APPDATA', '$APPDATA/**']);
  assert.ok(caps.permissions.includes('dialog:allow-save'));
  assert.ok(!caps.permissions.some((p: unknown) => typeof p === 'string' && /shell:/.test(p)));
});

// Windows makes folders, registry keys and file names from these; they must stay ASCII (a Chinese install
// folder breaks tools and scripts). The names people see come from DISPLAYNAME in the NSIS template.
test('desktop: every path and key the installer makes is ASCII; people still see 存目', () => {
  const ascii = /^[\x20-\x7e]+$/;
  for (const [k, v] of Object.entries({ productName: tauri.productName, mainBinaryName: tauri.mainBinaryName, identifier: tauri.identifier, publisher: tauri.bundle.publisher })) {
    assert.match(String(v), ascii, `${k} "${v}" names folders / keys / files on Windows`);
  }
  const nsis = tauri.bundle.windows.nsis;
  assert.equal(nsis.installMode, 'currentUser');
  assert.equal(nsis.template, 'windows/installer.nsi');
  assert.equal(nsis.installerHooks, 'windows/hooks.nsh');
  const nsi = readFileSync('src-tauri/windows/installer.nsi', 'utf8');
  // the visible name, from app.json
  assert.match(nsi, new RegExp(`^!define DISPLAYNAME "${app.appName}"`, 'm'));
  assert.match(nsi, /^Name "\$\{DISPLAYNAME\}"/m);
  assert.match(nsi, /"DisplayName" "\$\{DISPLAYNAME\}"/);
  assert.match(nsi, /CreateShortcut "\$DESKTOP\\\$\{DISPLAYNAME\}\.lnk"/);
  // folders and keys from PRODUCTNAME (ASCII) only, never from the visible name
  for (const line of nsi.split('\n')) {
    if (/\$(LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES64)\\|INSTALLMODE_INSTDIR|define (UNINSTKEY|MANUKEY|MANUPRODUCTKEY|PLACEHOLDER_INSTALL_DIR)/.test(line) && !line.trim().startsWith(';')) {
      assert.ok(!line.includes('DISPLAYNAME'), `a path from the visible name: ${line.trim()}`);
    }
  }
  assert.match(nsi, /StrCpy \$INSTDIR "\$LOCALAPPDATA\\\$\{PRODUCTNAME\}"/);
  assert.match(nsi, /!define UNINSTKEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\\$\{PRODUCTNAME\}"/);
  // makensis reads an included file without a BOM in the system code page: the hooks name the 存目 folder
  assert.equal(readFileSync('src-tauri/windows/hooks.nsh').subarray(0, 3).toString('hex'), 'efbbbf', 'hooks.nsh needs its UTF-8 BOM');
  // the template is a patched copy of the bundler's: it must match the CLI that renders it
  const cli = json('node_modules/@tauri-apps/cli/package.json').version;
  assert.match(nsi, new RegExp(`tauri-cli v${cli.replace(/\./g, '\\.')}\\)`), `installer.nsi was taken from another tauri-cli; re-take it from v${cli} and re-apply the 存目 patch`);
});
