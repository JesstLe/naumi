export type SelectionRunNode = {
  id: string;
  kind: "image" | "text" | "pending";
  x: number;
  y: number;
  locked?: boolean;
  busy?: boolean;
  runnable: boolean;
};

/** Snapshot only actual selected executable nodes; never include their ancestors. */
export function selectionRunTargets(ids: readonly string[], nodes: readonly SelectionRunNode[]) {
  const selected = new Set(ids);
  return [...new Map(nodes.filter(node => selected.has(node.id) && node.runnable && !node.locked && !node.busy).map(node => [node.id, node])).values()]
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

/** One failed node does not abort the batch. Context changes stop queued starts. */
export async function runSelectionBatch<T extends { id: string }>(targets: readonly T[], options: {
  isCurrent: () => boolean;
  canRun: (target: T) => boolean;
  run: (target: T) => Promise<boolean>;
  onProgress?: (completed: number, total: number) => void;
}) {
  const queue = [...new Map(targets.map(target => [target.id, target])).values()];
  const total = queue.length, result = { succeeded: 0, failed: 0, skipped: 0 };
  let completed = 0;
  const worker = async () => {
    while (queue.length) {
      const target = queue.shift()!;
      if (!options.isCurrent() || !options.canRun(target)) result.skipped++;
      else {
        try { if (await options.run(target)) result.succeeded++; else result.failed++; }
        catch { result.failed++; }
      }
      completed++;
      if (options.isCurrent()) options.onProgress?.(completed, total);
    }
  };
  // Submission orchestration only. Actual supplier capacity remains server-owned.
  await Promise.all([worker(), worker()]);
  return result;
}
