export interface Tint { l: number; c: number; h: number }
export function rgbToOklab(r: number, g: number, b: number): [number, number, number];
export function tintFromPixels(px: ArrayLike<number>, k?: number, iters?: number): Tint | null;
