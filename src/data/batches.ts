import type { ImportBatch } from './persist';

/** the newest record of a provider still standing, by time — Steam's go at the end of the list, the others at the front */
export function lastBatchOf(batches: ImportBatch[], provider: ImportBatch['provider']): ImportBatch | null {
  let out: ImportBatch | null = null;
  for (const b of batches) if (b.provider === provider && !b.undoneAt && (!out || b.createdAt >= out.createdAt)) out = b;
  return out;
}
