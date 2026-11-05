"use client";

import { useCallback, useEffect, useRef } from "react";

/** Coalesces typing, not model calls. The caller owns nodes, persistence,
 * history and the captured account/workspace guard. Blur/action flushes use
 * the latest node so reference and geometry edits are never rolled back. */
export function useTextNodeAutosave<T extends { id: string }, C extends { isCurrent: () => boolean }>({
  getNode, save, hasUnsaved, delay = 650,
}: { getNode: (id: string) => T | undefined; save: (node: T, context: C) => Promise<T | null>; hasUnsaved?: () => boolean; delay?: number }) {
  const callbacks = useRef({ getNode, save, hasUnsaved }); callbacks.current = { getNode, save, hasUnsaved };
  const pending = useRef(new Map<string, { context: C; timer: ReturnType<typeof setTimeout> }>());

  const flush = useCallback(async (id: string): Promise<T | null> => {
    const entry = pending.current.get(id);
    if (!entry) return callbacks.current.getNode(id) ?? null;
    clearTimeout(entry.timer); pending.current.delete(id);
    if (!entry.context.isCurrent()) return null;
    const node = callbacks.current.getNode(id);
    return node ? callbacks.current.save(node, entry.context) : null;
  }, []);

  function schedule(id: string, context: C) {
    const previous = pending.current.get(id);
    if (previous) clearTimeout(previous.timer);
    pending.current.set(id, { context, timer: setTimeout(() => { void flush(id); }, delay) });
  }

  function cancel(ids: readonly string[]) {
    for (const id of ids) {
      const entry = pending.current.get(id);
      if (entry) clearTimeout(entry.timer);
      pending.current.delete(id);
    }
  }

  const flushAll = useCallback(async () => {
    return Promise.all([...pending.current.keys()].map(flush));
  }, [flush]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!callbacks.current.hasUnsaved?.() && ![...pending.current.values()].some(entry => entry.context.isCurrent())) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      // Navigation flushes current-owner drafts; owner changes invalidate their
      // contexts and therefore perform zero writes into the new workspace.
      void flushAll();
    };
  }, [flushAll]);

  return { schedule, flush, flushAll, cancel, hasPending: (id: string) => pending.current.has(id) };
}
