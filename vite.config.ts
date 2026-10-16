import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = import.meta.dirname ?? __dirname;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

/**
 * Preload the Latin serif (Source Serif 4, one 51 KB variable file every page uses). Discovered only
 * through the CSS, it otherwise lands after first render on a slow cold load and swaps in, and its
 * metrics size the essay drop cap (initial-letter) — a layout shift (polish r3, essay CLS .0023).
 */
function preloadLatinSerif(): Plugin {
  return {
    name: 'preload-latin-serif',
    apply: 'build',
    transformIndexHtml(_html, ctx) {
      const f = Object.keys(ctx.bundle ?? {}).find((k) => /source-serif-4-latin-wght-normal.*\.woff2$/.test(k));
      return f ? [{ tag: 'link', attrs: { rel: 'preload', href: `./${f}`, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head' }] : [];
    },
  };
}

/**
 * `@demo` is an empty stub (src/data/noDemo.ts): the public repository holds no demo library, so the dev
 * server and every build start with the empty home, as the app does.
 */
export default defineConfig({
  // base './' keeps the build relocatable (any static host, a sub-path, a Capacitor WebView); routes use the hash.
  base: './',
  plugins: [react(), preloadLatinSerif()],
  resolve: { alias: { '@demo': join(root, 'src/data/noDemo.ts') } },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173 },
});
