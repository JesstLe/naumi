type Point = { x: number; y: number };
type Size = { width: number; height: number };
type Rect = Point & Size;
type Candidate = Point & { distance: number; order: number };
const CELL = 512;
// Oversized rectangles use an exact linear fallback, not an input-size limit.
const MAX_BUCKETS = 64;

function earlier(a: Candidate, b: Candidate) {
  const difference = a.distance - b.distance;
  return difference < 0 || (difference === 0 || Number.isNaN(difference)) && a.order < b.order;
}
function push(heap: Candidate[], value: Candidate) {
  let at = heap.length; heap.push(value);
  while (at > 0) {
    const parent = (at - 1) >> 1;
    if (!earlier(value, heap[parent])) break;
    heap[at] = heap[parent]; at = parent;
  }
  heap[at] = value;
}
function pop(heap: Candidate[]) {
  const tail = heap.pop();
  if (!tail || !heap.length) return;
  let at = 0;
  while (at * 2 + 1 < heap.length) {
    let child = at * 2 + 1;
    if (child + 1 < heap.length && earlier(heap[child + 1], heap[child])) child++;
    if (!earlier(heap[child], tail)) break;
    heap[at] = heap[child]; at = child;
  }
  heap[at] = tail;
}

function cells(left: number, top: number, right: number, bottom: number): string[] | null {
  const x0 = Math.floor(left / CELL), x1 = Math.floor(right / CELL);
  const y0 = Math.floor(top / CELL), y1 = Math.floor(bottom / CELL);
  if (![x0, x1, y0, y1].every(Number.isSafeInteger) || x1 < x0 || y1 < y0 || (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_BUCKETS) return null;
  const keys: string[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(`${x},${y}`);
  return keys;
}

/** One placement pass owns this index. Candidate order, spacing and nearest-edge
 * semantics match the original preview allocator; saved positions never move. */
export function createPlacementSpace(initial: readonly Rect[]) {
  const occupied: Rect[] = [...initial], wide: Rect[] = [];
  const buckets = new Map<string, Rect[]>();
  let indexed = false;
  // Only one candidate frontier is retained. Consecutive siblings reuse it;
  // different anchors/sizes replace it, avoiding a quadratic per-anchor cache.
  let frontier: { preferred: Point; size: Size; cursor: number; seen: Set<string>; heap: Candidate[] } | undefined;
  function index(rect: Rect) {
    const keys = cells(rect.x - 32, rect.y - 48, rect.x + rect.width + 32, rect.y + rect.height + 48);
    if (!keys) { wide.push(rect); return; }
    for (const key of keys) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(rect); else buckets.set(key, [rect]);
    }
  }
  function add(rect: Rect) { occupied.push(rect); if (indexed) index(rect); }
  function nearby(point: Point, size: Size): Iterable<Rect> {
    if (!indexed) return occupied;
    const keys = cells(point.x, point.y, point.x + size.width, point.y + size.height);
    if (!keys) return occupied;
    const found = new Set(wide);
    for (const key of keys) for (const rect of buckets.get(key) || []) found.add(rect);
    return found;
  }
  const touches = (point: Point, size: Size, rect: Rect) =>
    point.x < rect.x + rect.width + 32 && point.x + size.width + 32 > rect.x &&
    point.y < rect.y + rect.height + 48 && point.y + size.height + 48 > rect.y;
  function blocked(point: Point, size: Size) {
    for (const rect of nearby(point, size)) if (touches(point, size, rect)) return true;
    return false;
  }
  function place(preferred: Point, size: Size): Point {
    const position = { ...preferred };
    if (!blocked(position, size)) return position;
    if (!indexed) { for (const rect of occupied) index(rect); indexed = true; }
    if (!frontier || !Object.is(frontier.preferred.x, preferred.x) || !Object.is(frontier.preferred.y, preferred.y)
      || !Object.is(frontier.size.width, size.width) || !Object.is(frontier.size.height, size.height)) {
      frontier = { preferred: { ...preferred }, size: { ...size }, cursor: 0, seen: new Set(), heap: [] };
    }
    const state = frontier;
    function candidate(x: number, y: number, order: number) {
      const key = `${x},${y}`;
      if (state.seen.has(key)) return;
      state.seen.add(key);
      push(state.heap, { x, y, distance: Math.hypot(x - preferred.x, y - preferred.y), order });
    }
    for (; state.cursor < occupied.length; state.cursor++) {
      const rect = occupied[state.cursor], order = state.cursor * 4;
      candidate(preferred.x, rect.y + rect.height + 48, order);
      candidate(rect.x + rect.width + 32, preferred.y, order + 1);
      candidate(preferred.x, rect.y - size.height - 48, order + 2);
      candidate(rect.x - size.width - 32, preferred.y, order + 3);
    }
    while (state.heap.length) {
      const point = state.heap[0];
      if (!blocked(point, size)) return { x: point.x, y: point.y };
      // Occupancy only grows in this pass: a blocked candidate cannot become
      // available later. Keep the free head until add() actually occupies it.
      pop(state.heap);
    }
    for (let i = 0; i <= occupied.length; i++) {
      let bottom = -Infinity;
      for (const rect of nearby(position, size)) if (touches(position, size, rect)) bottom = Math.max(bottom, rect.y + rect.height + 48);
      if (bottom === -Infinity) return position;
      position.y = bottom;
    }
    return position;
  }
  return { add, place };
}
