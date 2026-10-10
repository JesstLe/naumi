/** Deterministic, dimension-aware layered layout. No content or lineage is changed. */
export type LayoutNode = {
  id: string;
  width: number;
  height: number;
  x: number;
  y: number;
  fixed?: boolean;
  group?: string | null;
};
export type LayoutEdge = { source: string; target: string };
type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };
const COLUMN_GAP = 112;
const ROW_GAP = 64;
const COMPONENT_GAP = 160;
const mean = (values: number[], fallback: number) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
const touches = (a: Box, b: Box, gap: number) =>
  a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;

/** Project desired centers onto ordered, non-overlapping rectangles (isotonic regression). */
function spread(ids: string[], sizes: Map<string, LayoutNode>, desired: Map<string, number>) {
  const offsets: number[] = [];
  let cursor = 0;
  const blocks: Array<{ start: number; end: number; sum: number; count: number }> = [];
  ids.forEach((id, index) => {
    const height = sizes.get(id)!.height;
    offsets.push(cursor + height / 2);
    cursor += height + ROW_GAP;
    blocks.push({ start: index, end: index, sum: desired.get(id)! - offsets[index], count: 1 });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1], previous = blocks[blocks.length - 2];
      if (previous.sum / previous.count <= last.sum / last.count) break;
      blocks.splice(-2, 2, { start: previous.start, end: last.end,
        sum: previous.sum + last.sum, count: previous.count + last.count });
    }
  });
  const centers = new Map<string, number>();
  for (const block of blocks) for (let index = block.start; index <= block.end; index++) {
    centers.set(ids[index], offsets[index] + block.sum / block.count);
  }
  return centers;
}

export function smartLayout(input: LayoutNode[], inputEdges: LayoutEdge[]): Map<string, Point> {
  // Normalize malformed sizes; fixed coordinates remain untouched, including negatives.
  const nodes = new Map<string, LayoutNode>();
  for (const node of input) if (!nodes.has(node.id)) nodes.set(node.id, { ...node,
    width: Number.isFinite(node.width) && node.width > 0 ? node.width : 320,
    height: Number.isFinite(node.height) && node.height > 0 ? node.height : 240,
  });
  const order = new Map(Array.from(nodes.keys(), (id, index) => [id, index]));
  const next = new Map(Array.from(nodes.keys(), id => [id, [] as string[]]));
  const previous = new Map(Array.from(nodes.keys(), id => [id, [] as string[]]));
  const adjacent = new Map(Array.from(nodes.keys(), id => [id, new Set<string>()]));
  const edges: LayoutEdge[] = [];
  const seenEdges = new Set<string>();
  for (const edge of inputEdges) {
    const key = JSON.stringify([edge.source, edge.target]);
    if (edge.source === edge.target || !nodes.has(edge.source) || !nodes.has(edge.target) || seenEdges.has(key)) continue;
    seenEdges.add(key); edges.push(edge);
    next.get(edge.source)!.push(edge.target); previous.get(edge.target)!.push(edge.source);
    adjacent.get(edge.source)!.add(edge.target); adjacent.get(edge.target)!.add(edge.source);
  }
  // Existing user groups stay in the same packing panel without inventing lineage edges.
  const groups = new Map<string, string>();
  for (const node of nodes.values()) if (node.group) {
    const first = groups.get(node.group);
    if (first) { adjacent.get(first)!.add(node.id); adjacent.get(node.id)!.add(first); }
    else groups.set(node.group, node.id);
  }
  const components: string[][] = [], visited = new Set<string>();
  for (const id of nodes.keys()) {
    if (visited.has(id)) continue;
    const component: string[] = [], queue = [id]; visited.add(id);
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]; component.push(current);
      for (const neighbor of adjacent.get(current)!) if (!visited.has(neighbor)) {
        visited.add(neighbor); queue.push(neighbor);
      }
    }
    component.sort((a, b) => order.get(a)! - order.get(b)!); components.push(component);
  }
  // Iterative Kosaraju avoids recursive overflow and collapses historical cycles safely.
  const finished: string[] = []; visited.clear();
  for (const start of nodes.keys()) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack: Array<{ id: string; index: number }> = [{ id: start, index: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1], neighbors = next.get(frame.id)!;
      if (frame.index >= neighbors.length) { finished.push(frame.id); stack.pop(); continue; }
      const id = neighbors[frame.index++];
      if (!visited.has(id)) { visited.add(id); stack.push({ id, index: 0 }); }
    }
  }
  const scc = new Map<string, number>(); let count = 0;
  for (const start of finished.reverse()) {
    if (scc.has(start)) continue;
    const stack = [start]; scc.set(start, count);
    while (stack.length) for (const id of previous.get(stack.pop()!)!) {
      if (!scc.has(id)) { scc.set(id, count); stack.push(id); }
    }
    count++;
  }
  const dag = Array.from({ length: count }, () => new Set<number>());
  const indegree = Array(count).fill(0) as number[], rank = Array(count).fill(0) as number[];
  for (const edge of edges) {
    const from = scc.get(edge.source)!, to = scc.get(edge.target)!;
    if (from !== to && !dag[from].has(to)) { dag[from].add(to); indegree[to]++; }
  }
  const ready = indegree.flatMap((degree, index) => degree === 0 ? [index] : []);
  for (let index = 0; index < ready.length; index++) for (const to of dag[ready[index]]) {
    rank[to] = Math.max(rank[to], rank[ready[index]] + 1);
    if (--indegree[to] === 0) ready.push(to);
  }
  const panels = components.map(ids => {
    const layers: string[][] = [];
    for (const id of ids) (layers[rank[scc.get(id)!]] ??= []).push(id);
    const centers = new Map<string, number>();
    layers.forEach(layer => {
      let cursor = 0;
      layer.forEach(id => { const node = nodes.get(id)!;
        centers.set(id, cursor + node.height / 2); cursor += node.height + ROW_GAP; });
    });
    // Alternating barycentric sweeps order branches by ALL inputs, not just parentId.
    for (let pass = 0; pass < 10; pass++) {
      const reverse = pass % 2 === 1;
      const sequence = reverse ? [...layers].reverse() : layers;
      for (const layer of sequence) {
        const desired = new Map(layer.map(id => [id, mean(
          (reverse ? next : previous).get(id)!.filter(other => scc.get(other) !== scc.get(id))
            .map(other => centers.get(other)!), centers.get(id)!),
        ]));
        layer.sort((a, b) => desired.get(a)! - desired.get(b)! || order.get(a)! - order.get(b)!);
        for (const [id, center] of spread(layer, nodes, desired)) centers.set(id, center);
      }
    }
    // Keep the chosen ordering while relaxing parent/child center alignment.
    for (let pass = 0; pass < 6; pass++) for (const layer of pass % 2 ? [...layers].reverse() : layers) {
      const desired = new Map(layer.map(id => [id, mean(
        [...next.get(id)!, ...previous.get(id)!].filter(other => scc.get(other) !== scc.get(id))
          .map(other => centers.get(other)!), centers.get(id)!),
      ]));
      for (const [id, center] of spread(layer, nodes, desired)) centers.set(id, center);
    }
    const points = new Map<string, Point>(); let x = 0;
    for (const layer of layers) {
      for (const id of layer) points.set(id, { x, y: centers.get(id)! - nodes.get(id)!.height / 2 });
      x += Math.max(...layer.map(id => nodes.get(id)!.width)) + COLUMN_GAP;
    }
    const top = Math.min(...ids.map(id => points.get(id)!.y));
    for (const point of points.values()) point.y -= top;
    return { ids, points, width: x - COLUMN_GAP,
      height: Math.max(...ids.map(id => points.get(id)!.y + nodes.get(id)!.height)) };
  });
  const result = new Map<string, Point>();
  const obstacles: Box[] = Array.from(nodes.values()).filter(node => node.fixed)
    .map(node => ({ x: node.x, y: node.y, width: node.width, height: node.height }));
  for (const node of nodes.values()) if (node.fixed) result.set(node.id, { x: node.x, y: node.y });
  // Evaluate shelf widths instead of producing one very tall strip or one very wide row.
  const area = panels.reduce((sum, panel) => sum + panel.width * panel.height, 0);
  const minWidth = Math.max(1, ...panels.map(panel => panel.width));
  const candidates = [minWidth, Math.max(minWidth, Math.sqrt(area * 1.6))];
  let cumulative = 0;
  for (const panel of panels) {
    cumulative += panel.width + COMPONENT_GAP;
    candidates.push(Math.max(minWidth, cumulative - COMPONENT_GAP));
  }
  let targetWidth = minWidth, bestScore = Infinity;
  for (const width of candidates) {
    let x = 0, y = 0, rowHeight = 0, usedWidth = 0;
    for (const panel of panels) {
      if (x && x + panel.width > width) { x = 0; y += rowHeight + COMPONENT_GAP; rowHeight = 0; }
      usedWidth = Math.max(usedWidth, x + panel.width);
      x += panel.width + COMPONENT_GAP; rowHeight = Math.max(rowHeight, panel.height);
    }
    const height = Math.max(1, y + rowHeight);
    const score = Math.log(Math.max(1, usedWidth) / height / 1.6) ** 2 +
      0.25 * (Math.max(1, usedWidth) * height / Math.max(1, area) - 1);
    if (score < bestScore) { bestScore = score; targetWidth = width; }
  }
  let shelfX = 0, shelfY = 0, shelfHeight = 0;
  // Place anchored chains first, close to their pinned reference instead of stretching
  // their input edges across unrelated panels. Other chains pack around those boxes.
  const packingOrder = [...panels].sort((a, b) =>
    Number(b.ids.some(id => nodes.get(id)!.fixed)) - Number(a.ids.some(id => nodes.get(id)!.fixed)));
  for (const panel of packingOrder) {
    const mobile = panel.ids.filter(id => !nodes.get(id)!.fixed);
    if (!mobile.length) continue;
    const anchorId = panel.ids.find(id => nodes.get(id)!.fixed);
    if (!anchorId && shelfX && shelfX + panel.width > targetWidth) { shelfX = 0; shelfY += shelfHeight + COMPONENT_GAP; shelfHeight = 0; }
    const anchor = anchorId ? nodes.get(anchorId)! : null;
    const anchorPoint = anchorId ? panel.points.get(anchorId)! : null;
    const x = anchor && anchorPoint ? anchor.x - anchorPoint.x : shelfX;
    let y = anchor && anchorPoint ? anchor.y - anchorPoint.y : shelfY;
    // Shift the whole chain past pinned/running nodes; never scatter individual branches.
    while (true) {
      let shift = 0;
      for (const id of mobile) {
        const point = panel.points.get(id)!, node = nodes.get(id)!;
        const box = { x: x + point.x, y: y + point.y, width: node.width, height: node.height };
        for (const obstacle of obstacles) if (touches(box, obstacle, ROW_GAP)) {
          shift = Math.max(shift, obstacle.y + obstacle.height + ROW_GAP - box.y);
        }
      }
      if (shift <= 0) break;
      y += shift;
    }
    for (const id of mobile) {
      const point = panel.points.get(id)!, node = nodes.get(id)!;
      const position = { x: Math.round(x + point.x), y: Math.round(y + point.y) };
      result.set(id, position); obstacles.push({ ...position, width: node.width, height: node.height });
    }
    if (!anchor) {
      shelfHeight = Math.max(shelfHeight, y - shelfY + panel.height);
      shelfX += panel.width + COMPONENT_GAP;
    }
  }
  return result;
}
