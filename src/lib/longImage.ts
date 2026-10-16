/**
 * 存成一张长图: 首页 as 给人看 shows it, drawn into one PNG (html-to-image). Only the font slices the page
 * has actually loaded go into the drawing (a Chinese serif is split into many unicode-range slices;
 * embedding all of them would be megabytes for nothing). Covers come from their own addresses (Bangumi's
 * image host answers cross-origin), your own pictures are already on the device.
 */
import { toBlob } from 'html-to-image';

/** 'U+0000-00FF, U+0131' → '0-ff,131' (the browser and the stylesheet write the same range differently) */
export const normRange = (r: string) => (r || 'U+0-10FFFF').split(',').map((x) => x.trim().replace(/^u\+/i, '').split('-').map((h) => parseInt(h, 16).toString(16)).join('-')).sort().join(',');
const normFamily = (f: string) => f.replace(/^["']|["']$/g, '').trim().toLowerCase();
const normWeight = (w: string) => (w || '400').replace(/\s+/g, ' ').trim();

const dataUrlOf = (blob: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

/** @font-face rules for just the faces that are loaded, their files inlined */
export async function loadedFontCSS(doc: Document = document): Promise<string> {
  const loaded = new Set<string>();
  doc.fonts.forEach((f) => { if (f.status === 'loaded') loaded.add(`${normFamily(f.family)}|${normWeight(f.weight)}|${f.style}|${normRange(f.unicodeRange)}`); });
  const out: string[] = [];
  for (const sheet of [...doc.styleSheets]) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    const walk = async (list: CSSRuleList, base: string) => {
      for (const rule of [...list]) {
        if (rule instanceof CSSImportRule && rule.styleSheet) { await walk(rule.styleSheet.cssRules, rule.styleSheet.href ?? base); continue; }
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const st = rule.style;
        const key = `${normFamily(st.getPropertyValue('font-family'))}|${normWeight(st.getPropertyValue('font-weight'))}|${st.getPropertyValue('font-style') || 'normal'}|${normRange(st.getPropertyValue('unicode-range'))}`;
        if (!loaded.has(key)) continue;
        const src = st.getPropertyValue('src');
        const m = src.match(/url\(["']?([^"')]+)["']?\)/);
        if (!m) continue;
        try {
          const blob = await (await fetch(new URL(m[1], base).href)).blob();
          out.push(rule.cssText.replace(m[0], `url(${await dataUrlOf(blob)})`));
        } catch { /* a face that won't load is left to the fallback */ }
      }
    };
    await walk(rules, sheet.href ?? location.href);
  }
  return out.join('\n');
}

/** the element, drawn at twice its size, with the page's own background; the bars and owner-only bits left out */
export async function drawLong(el: HTMLElement): Promise<Blob> {
  const bg = getComputedStyle(document.body).backgroundColor;
  const fontEmbedCSS = await loadedFontCSS();
  const blob = await toBlob(el, {
    pixelRatio: 2,
    backgroundColor: bg,
    fontEmbedCSS,
    cacheBust: false,
    width: el.scrollWidth,
    height: el.scrollHeight,
    filter: (n) => !(n instanceof HTMLElement && (n.classList.contains('topbar') || n.classList.contains('desk-tools') || n.dataset.noImage === '1')),
  });
  if (!blob) throw new Error('nothing drawn');
  return blob;
}
