import { useEffect, useState } from 'react';
import { FONT_WAIT_MS } from '../tokens';

const SERIF = '"Noto Serif SC"';
/** hero title (600) and epigraph (500) by default; the essay adds its drop cap (700) */
const BASE_FACES = ['600 40px', '500 20px'];

/**
 * The serif CJK face arrives in unicode-range slices, so on a cold load the hero title and epigraph
 * first lay out in a fallback whose punctuation can be narrower, then re-wrap when the slice lands —
 * a layout shift (§6.5 #63, phone entry was 0.038). This holds the text (not the cover, which may be
 * mid-flight) invisible until the slices for `text` are in, at most FONT_WAIT_MS. Warm loads, which
 * is every navigation after the first, pass straight through.
 */
export function useFontsFor(text: string, extra: [face: string, text: string][] = []): boolean {
  const faces = () => [...BASE_FACES.map((f) => [`${f} ${SERIF}`, text] as const), ...extra.filter(([, t]) => t).map(([f, t]) => [`${f} ${SERIF}`, t] as const)];
  const [ok, setOk] = useState(() => !('fonts' in document) || faces().every(([f, t]) => document.fonts.check(f, t)));
  useEffect(() => {
    if (ok) return;
    let live = true;
    const done = () => { if (live) setOk(true); };
    const t = window.setTimeout(done, FONT_WAIT_MS);
    Promise.all(faces().map(([f, s]) => document.fonts.load(f, s))).then(done, done);
    return () => { live = false; window.clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return ok;
}
