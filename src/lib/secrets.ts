/**
 * The Bangumi personal token: on this device only — never in the save, never in an export, never synced.
 *   phone    the system's secure store: the iOS Keychain (this device only, not iCloud) / an Android Keystore
 *            key encrypting it (@aparajita/capacitor-secure-storage). A token an older build left in the app's
 *            private files (cunmu/secrets/bangumi-token) moves there on first read. If the secure store fails
 *            on some device, the private file is used instead, so the connection still works.
 *   desktop  localStorage of the app's own WebView profile (in the user's AppData; Windows has no store we
 *            can reach without more native code — see README)
 *   web      localStorage `cunmu/bangumi-token`
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { isNative } from './native';

const FILE = 'cunmu/secrets/bangumi-token';
const KEY = 'cunmu/bangumi-token';
const SECURE_PREFIX = 'cunmu.';
const SECURE_KEY = 'bangumi-token';
let cached: string | null | undefined;

type Secure = typeof import('@aparajita/capacitor-secure-storage')['SecureStorage'];
let securePromise: Promise<{ store: Secure } | null> | null = null;
/**
 * the secure store, ready (prefix set, no iCloud), or null where it can't be used. Boxed: a Capacitor plugin
 * proxy answers every property, `then` too, so a promise resolved with it never settles (the restore hung)
 */
const secure = () => (securePromise ??= import('@aparajita/capacitor-secure-storage')
  .then(async ({ SecureStorage }) => {
    await SecureStorage.setKeyPrefix(SECURE_PREFIX);
    await SecureStorage.setSynchronize(false);
    return { store: SecureStorage };
  })
  .catch(() => null));

const readFile = async () => {
  try {
    const r = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
    return (typeof r.data === 'string' ? r.data : await r.data.text()).trim() || null;
  } catch { return null; }
};
const dropFile = () => Filesystem.deleteFile({ path: FILE, directory: Directory.Data }).catch(() => undefined);

export async function getBangumiToken(): Promise<string | null> {
  if (cached !== undefined) return cached;
  if (!isNative()) {
    try { cached = localStorage.getItem(KEY); } catch { cached = null; }
    return cached;
  }
  const store = (await secure())?.store;
  if (store) {
    try {
      const got = await store.getItem(SECURE_KEY);
      if (got) return (cached = got);
      // nothing there yet: an older build's file moves in, then the file goes
      const old = await readFile();
      if (old) { await store.setItem(SECURE_KEY, old); await dropFile(); }
      return (cached = old);
    } catch { /* this device's secure store failed: the private file below */ }
  }
  return (cached = await readFile());
}

export async function setBangumiToken(token: string | null) {
  cached = token;
  if (!isNative()) {
    try { if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY); } catch { /* full */ }
    return;
  }
  const store = (await secure())?.store;
  if (store) {
    try {
      if (token) await store.setItem(SECURE_KEY, token); else await store.removeItem(SECURE_KEY);
      await dropFile();
      return;
    } catch { /* fall through to the file */ }
  }
  if (token) await Filesystem.writeFile({ path: FILE, data: token, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
  else await dropFile();
}

/**
 * r19 other keys kept the same way (the Steam Web API key): the secure store on a phone (falling back to a
 * private file), localStorage elsewhere. Never in the save, never in an export.
 */
export type SecretName = 'steam-key';
const secretCache = new Map<SecretName, string | null>();
const secretFile = (n: SecretName) => `cunmu/secrets/${n}`;
export async function getSecret(name: SecretName): Promise<string | null> {
  if (secretCache.has(name)) return secretCache.get(name)!;
  let v: string | null = null;
  if (!isNative()) {
    try { v = localStorage.getItem(`cunmu/${name}`); } catch { v = null; }
  } else {
    const store = (await secure())?.store;
    let done = false;
    if (store) { try { v = await store.getItem(name); done = true; } catch { /* the file below */ } }
    if (!done || !v) {
      try {
        const r = await Filesystem.readFile({ path: secretFile(name), directory: Directory.Data, encoding: Encoding.UTF8 });
        v = (typeof r.data === 'string' ? r.data : await r.data.text()).trim() || v;
      } catch { /* none */ }
    }
  }
  secretCache.set(name, v);
  return v;
}
export async function setSecret(name: SecretName, value: string | null) {
  secretCache.set(name, value);
  if (!isNative()) {
    try { if (value) localStorage.setItem(`cunmu/${name}`, value); else localStorage.removeItem(`cunmu/${name}`); } catch { /* full */ }
    return;
  }
  const store = (await secure())?.store;
  const dropIt = () => Filesystem.deleteFile({ path: secretFile(name), directory: Directory.Data }).catch(() => undefined);
  if (store) {
    try {
      if (value) await store.setItem(name, value); else await store.removeItem(name);
      await dropIt();
      return;
    } catch { /* fall through to the file */ }
  }
  if (value) await Filesystem.writeFile({ path: secretFile(name), data: value, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
  else await dropIt();
}
