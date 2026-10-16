export interface SpineColour { l: number; c: number; h: number }
export const INK_DARK: number[];
export const INK_LIGHT: number[];
export function oklchToRgb(l: number, c: number, h: number): [number, number, number];
export function inkFor(s: SpineColour): { ink: 'dark' | 'light'; contrast: number };
export function settle(l: number, c: number, h: number): SpineColour;
export function spineFromPixels(px: ArrayLike<number>, k?: number, iters?: number): SpineColour | null;
