/** For bounded scenes, stable node/edge membership avoids per-frame visibility
 * geometry and mount/unmount churn. Images retain their own root-scoped visible
 * observer, so offscreen original bytes are never loaded merely by mounting.
 * Large scenes still use React Flow's native viewport virtualization. */
export function shouldVirtualizeCanvas(nodeCount: number, edgeCount: number) {
  return nodeCount > 300 || edgeCount > 1000;
}
