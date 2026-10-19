/**
 * The app around the page (phones only): Android's back button closes whatever is open on top first (a sheet,
 * the cover viewer, a menu or preview, 选几部), then goes back a page, then to 首页, and from 首页 sends the
 * app to the background the way the system's own apps do (it stays where it was); haptics go through the
 * system instead of navigator.vibrate.
 */
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { isDesktop, isNative, platform } from './native';

export function startNativeShell() {
  // desktop: links out of the app open in the browser
  if (isDesktop()) { void import('./desktop').then((d) => d.openLinksOutside()); return; }
  if (!isNative()) return;
  // phone: links open in the in-app browser, over the app (not handed to another app, which may close this one)
  void import('./openOut').then((o) => o.linksThroughOpenOutside());
  keepFieldInView();
  if (platform() !== 'android') return;
  void App.addListener('backButton', ({ canGoBack }) => {
    const step = backStep({
      overlay: !!document.querySelector(OVERLAY),
      picking: document.documentElement.dataset.picking === '1',
      show: document.documentElement.dataset.show === '1',
      hash: location.hash,
      canGoBack,
    });
    if (step === 'escape') {
      // from the focused element, so a field's own Esc handler hears it as well as the window's
      (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    } else if (step === 'back') history.back();
    else if (step === 'home') location.hash = '#/';
    else if (step === 'leave') void App.minimizeApp();
    // 'stay': 给人看 on 首页 — the back button does not take a guest out of it, nor out of the app
  });
}

/**
 * The keyboard opens: the page gets shorter (Android pads the web view by the keyboard's height; iOS shrinks the
 * visual viewport). A field inside a sheet or near the bottom can end up under the keyboard, so once the page has
 * its new size the focused field is brought back into view, the least distance needed.
 */
function keepFieldInView() {
  const go = () => {
    const el = document.activeElement;
    if (el instanceof HTMLElement && el.matches('input, textarea, [contenteditable="true"]')) el.scrollIntoView({ block: 'nearest' });
  };
  window.visualViewport?.addEventListener('resize', go);
  window.addEventListener('resize', go);
}

/** what sits on top of the page and closes with Esc (the inline search panel on 搜索 is a page, not this) */
export const OVERLAY = '[role="dialog"][aria-modal="true"], .preview, .menu, .ds-pop';

export type BackStep = 'escape' | 'back' | 'home' | 'leave' | 'stay';
/**
 * Android back, one press: close the top thing, else back a page, else to 首页, else leave. In 给人看 it
 * never leaves the mode: back a page among the ones open to a guest, and on 首页 nothing at all.
 */
export function backStep({ overlay, picking, hash, canGoBack, show = false }: { overlay: boolean; picking: boolean; hash: string; canGoBack: boolean; show?: boolean }): BackStep {
  if (overlay || picking) return 'escape';
  const home = !hash || hash === '#' || hash === '#/';
  if (home) return show ? 'stay' : 'leave';
  return canGoBack ? 'back' : 'home';
}

/** a tap felt, not heard: the system's light impact / selection tick on a phone, a short vibrate elsewhere */
export function tick(kind: 'light' | 'selection' | 'medium') {
  if (isNative()) {
    if (kind === 'selection') void Haptics.selectionChanged().catch(() => undefined);
    else void Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : ImpactStyle.Medium }).catch(() => undefined);
    return;
  }
  try { navigator.vibrate?.(kind === 'selection' ? 4 : kind === 'light' ? 10 : 18); } catch { /* unsupported */ }
}
