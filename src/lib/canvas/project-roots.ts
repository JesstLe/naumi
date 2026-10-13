type Parent = { id: string; parentId?: string | null };
/** Path compression for normal ancestry, preserving the old 200-hop guard and
 * its per-start behavior for corrupt cycles/overlong histories. */
export function createProjectRootResolver<T extends Parent>(byId: Map<string, T>) {
  const known = new Map<string, { root: T; depth: number }>();
  return (start: T): T => {
    let current = start, hops = 0;
    const trail: T[] = [];
    const seen = new Set<string>();
    while (current.parentId && byId.has(current.parentId) && hops < 200) {
      const cached = known.get(current.id);
      if (cached && hops + cached.depth <= 200) {
        const depth = cached.depth;
        for (let i = 0; i < trail.length; i++) known.set(trail[i].id, { root: cached.root, depth: trail.length - i + depth });
        return cached.root;
      }
      if (seen.has(current.id)) {
        // A cycle has no root. Reproduce the guarded legacy walk exactly.
        while (current.parentId && byId.has(current.parentId) && hops++ < 200) current = byId.get(current.parentId)!;
        return current;
      }
      seen.add(current.id); trail.push(current); current = byId.get(current.parentId)!; hops++;
    }
    if (!current.parentId || !byId.has(current.parentId)) {
      known.set(current.id, { root: current, depth: 0 });
      for (let i = 0; i < trail.length; i++) known.set(trail[i].id, { root: current, depth: trail.length - i });
    }
    return current;
  };
}
