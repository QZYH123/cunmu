/**
 * How the app reaches api.bgm.tv and lain.bgm.tv: a phone goes through native HTTP (CapacitorHttp) with
 * our User-Agent, as Bangumi asks of every client; a browser uses fetch (CORS is open on both hosts, but
 * a page can't set User-Agent).
 */
import { CapacitorHttp } from '@capacitor/core';
import { createClient, type BgmClient, type Transport } from './bangumi';
import { isNative, USER_AGENT } from './native';

/** a request that hangs this long counts as offline (not a UI timing) */
const REQUEST_TIMEOUT_MS = 20_000;

const parse = (d: unknown) => {
  if (typeof d !== 'string') return d ?? null;
  try { return JSON.parse(d); } catch { return null; }
};
const retryAfterOf = (v: string | null | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);

export const bgmTransport: Transport = {
  async get(url, headers) {
    if (isNative()) {
      const r = await CapacitorHttp.get({ url, headers: { ...headers, 'User-Agent': USER_AGENT }, responseType: 'json', connectTimeout: 15000, readTimeout: 20000 });
      const h = Object.fromEntries(Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
      return { status: r.status, body: parse(r.data), retryAfter: retryAfterOf(h['retry-after']) };
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const r = await fetch(url, { headers, signal: ctrl.signal, credentials: 'omit' });
      const text = await r.text();
      return { status: r.status, body: parse(text), retryAfter: retryAfterOf(r.headers.get('retry-after')) };
    } finally { clearTimeout(t); }
  },
};

/** one shared client per token, so every Bangumi request in the app queues behind the others */
const clients = new Map<string, BgmClient>();
export function bgmClient(token?: string): BgmClient {
  const k = token ?? '';
  let c = clients.get(k);
  if (!c) { c = createClient({ transport: bgmTransport, token }); clients.set(k, c); }
  return c;
}
