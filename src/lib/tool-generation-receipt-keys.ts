/** Storage layout of fusion/variation receipts, kept dependency-free so the
 * root-layout storage upkeep can use it without loading the tool client. */
export const TOOL_RECEIPT_PREFIX = "naumi:tool-generation-receipt:v1:";

/** Removes pointers whose job leaf is gone, and "latest" indexes naming a
 * removed pointer. A live accepted receipt always keeps its leaf, so it stays. */
export function pruneToolGenerationReceipts(storage: Storage = localStorage) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(TOOL_RECEIPT_PREFIX)) keys.push(key); }
  let removed = 0;
  for (const key of keys) {
    if (!key.startsWith(TOOL_RECEIPT_PREFIX + "input:") || key.includes(":job:")) continue;
    const jobId = storage.getItem(key);
    if (!jobId || storage.getItem(key + ":job:" + jobId) === null) { storage.removeItem(key); removed++; }
  }
  for (const key of keys) {
    if (!key.startsWith(TOOL_RECEIPT_PREFIX + "latest:")) continue;
    const pointer = storage.getItem(key);
    if (!pointer || storage.getItem(pointer) === null) { storage.removeItem(key); removed++; }
  }
  return removed;
}
