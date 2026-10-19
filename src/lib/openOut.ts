/**
 * A web page outside the app (a sign-in, a key to copy, the source code), opened so the app is still there
 * when the person comes back:
 *   phone    the in-app browser (Android Custom Tabs, iOS Safari view): over the app, closed with ✕ or back;
 *            the system's own link handling would hand steamcommunity.com to the Steam app
 *   desktop  the default browser (tauri-plugin-opener, http/https/mailto allowed in src-tauri/capabilities)
 *   web      a new tab
 */
import { isDesktop, isNative } from './native';

export async function openOutside(url: string): Promise<void> {
  if (isDesktop()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
    return;
  }
  window.open(url, '_blank', 'noopener');
}

/** every http(s) link in the app goes through openOutside (mailto stays with the system: a mail app) */
export function linksThroughOpenOutside() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const a = (e.target as Element | null)?.closest?.('a[href]');
    const href = a?.getAttribute('href') ?? '';
    if (!/^https?:/i.test(href)) return;
    e.preventDefault();
    void openOutside(href).catch(() => undefined);
  }, true);
}
