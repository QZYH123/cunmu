/**
 * The one place that knows whether we are inside the app (Capacitor on iOS / Android) or a browser.
 * Everything native goes through here or through a module that imports it.
 */
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import APP from '../../app.json';

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform() as 'ios' | 'android' | 'web';
/** the Windows desktop app (Tauri 2): a web page as far as Capacitor knows, with its own file access */
export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 存目: what the app calls itself (and a Chinese system under the icon) */
export const APP_NAME: string = APP.appName;
/** Cunmu: the Latin name (other systems, file names, the diagnostics line) */
export const APP_NAME_EN: string = APP.appNameEn ?? APP.appName;
export const APP_VERSION: string = __APP_VERSION__;
/** what we tell Bangumi we are (its API asks every client for a User-Agent naming it) */
export const USER_AGENT: string = APP.userAgent.replace('{version}', APP_VERSION);

/**
 * `accept` for a file input. Android's picker gets none (any file; the page checks what it got): the
 * WebView turns the list into MIME types and a type it can't map leaves the picker empty or failing.
 * iOS and the browser filter by extension.
 */
export const pickAccept = (list: string): string | undefined => (platform() === 'android' ? undefined : list);

/**
 * The page's look changed (or the app started): remember it for public/boot.js, which colours the very first
 * frame before any script of ours runs, and on a phone match the status-bar and gesture-bar icons to it.
 */
export function applyLook(theme: 'light' | 'dark' | 'system', resolved: 'light' | 'dark') {
  try { localStorage.setItem('cunmu/theme', theme); } catch { /* storage blocked: boot.js follows the system */ }
  if (!isNative()) return;
  SystemBars.setStyle({ style: resolved === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}
