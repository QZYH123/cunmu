import { useEffect, useState } from 'react';
import type { Tint, Work } from '../data/types';
import { tintFromPixels } from './tintCore.js';

/**
 * S4 ambient tint (§7.5). Real covers carry a precomputed tint (the demo kit's make-tints.mjs); any other
 * cover is drawn once into a 24×36 canvas, clustered (k = 4) and cached by work id. Literal covers
 * and near-grey covers get no tint.
 */
const cache = new Map<string, Tint | null>();

function compute(src: string): Promise<Tint | null> {
  return new Promise((res) => {
    const img = new Image();
    img.decoding = 'async';
    // Bangumi's image host allows any origin: without this the canvas is tainted and the read fails
    if (/^https?:/.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 24; c.height = 36;
        const g = c.getContext('2d', { willReadFrequently: true });
        if (!g) return res(null);
        g.drawImage(img, 0, 0, 24, 36);
        res(tintFromPixels(g.getImageData(0, 0, 24, 36).data));
      } catch { res(null); }
    };
    img.onerror = () => res(null);
    img.src = src;
  });
}

export function tintOf(work: Work): Tint | null | undefined {
  if (!work.cover || work.coverBroken) return null;
  if (work.cover.tint !== undefined) return work.cover.tint;
  return cache.get(work.id);
}

export function useTint(work: Work | undefined): Tint | null {
  const known = work ? tintOf(work) : null;
  const [t, setT] = useState<Tint | null>(known ?? null);
  useEffect(() => {
    if (!work) return;
    const k = tintOf(work);
    if (k !== undefined) { setT(k); return; }
    let live = true;
    compute(work.cover!.thumb).then((v) => { cache.set(work.id, v); if (live) setT(v); });
    return () => { live = false; };
  }, [work?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return t;
}

/** Inline custom properties for .hero-zone; the colour itself is built in tokens.css (--hero-tint). */
export const tintVars = (t: Tint | null) => (t ? { '--tint-c': String(t.c), '--tint-h': String(t.h) } : {});
