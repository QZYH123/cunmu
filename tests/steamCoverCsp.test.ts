import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STEAM_CDN } from '../src/lib/steam';

// shared.cloudflare.steamstatic.com answers every cover with a 301 to shared.steamstatic.com; the desktop
// policy checks the redirect's target too, so without it the Windows app showed no Steam cover at all.
const hosts = [new URL(STEAM_CDN).host, 'shared.steamstatic.com'];

test('steam covers: the desktop policy lets through the CDN and where it redirects', () => {
  const csp: string = JSON.parse(readFileSync(join(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8')).app.security.csp;
  const img = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('img-src'))!.split(/\s+/);
  for (const h of hosts) assert.ok(img.includes(`https://${h}`), h);
  const script = readFileSync(join(process.cwd(), 'scripts/apply-app-id.mjs'), 'utf8');
  for (const h of hosts) assert.ok(script.includes(`https://${h} `), `apply-app-id: ${h}`);
});

test('steam covers: a backup carries a cover on the redirect host', async () => {
  const { travels } = await import('../src/data/store');
  const c = (m: string) => ({ thumb: m, medium: m, aspect: 2 / 3 });
  assert.ok(travels(c('https://shared.steamstatic.com/store_item_assets/steam/apps/1/library_600x900.jpg')));
});
