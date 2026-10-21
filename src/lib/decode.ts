/** a piece of a link read back; a broken escape (「%E0」) is kept as typed instead of throwing */
export const decodePart = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
