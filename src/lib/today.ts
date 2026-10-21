const pad = (n: number) => String(n).padStart(2, '0');
/** Today as a local ISO date (YYYY-MM-DD) — what 「看过了」 and a new essay are dated with. */
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** the reader's own day of a moment stored as a UTC ISO time (a sync or an import at 07:00 in UTC+8 is that day, not the one before) */
export const localDay = (iso: string) => { if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;   // a day already
  const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : todayISO(d); };

/** Paragraphs from a textarea: blank lines or single line breaks both start a new paragraph. */
export const toParagraphs = (s: string) => s.split(/\n+/).map((p) => p.trim()).filter(Boolean);

/** Shrink a picked image to a data URL small enough to keep on the device (prototype: localStorage). */
export function shrinkImage(file: File, max = 960): Promise<{ url: string; aspect: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(src);
      resolve({ url: c.toDataURL('image/jpeg', 0.8), aspect: w / h });
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('image')); };
    img.src = src;
  });
}
