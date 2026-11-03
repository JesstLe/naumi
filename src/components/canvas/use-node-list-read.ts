"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { withBrowserReadDeadline } from "@/lib/browser-read-deadline";

type NodeSnapshot = { id: string; projectKey: string; revision: number };
type PrivateRead = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Only the list READ is shared. Each node module still owns writes, CAS and
 * operation receipts. A malformed list must never become authoritative empty. */
export async function readNodeList<T extends NodeSnapshot>(
  request: PrivateRead, url: string, signal: AbortSignal,
  failure: (message: string, status: number, code?: string) => Error,
  headers?: HeadersInit,
): Promise<T[]> {
  return withBrowserReadDeadline(async bounded => {
    const response = await request(url, { cache: "no-store", signal: bounded, headers });
    bounded.throwIfAborted();
    const data = await response.json();
    bounded.throwIfAborted();
    if (!response.ok) throw failure(typeof data?.error === "string" ? data.error : "节点读取失败", response.status, data?.code);
    if (!data || !Array.isArray(data.nodes) || data.nodes.some((node: unknown) => {
      if (!node || typeof node !== "object") return true;
      const value = node as Partial<NodeSnapshot>;
      return typeof value.id !== "string" || !value.id || typeof value.projectKey !== "string" ||
        !value.projectKey || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0;
    })) throw failure("节点列表响应无效，请重试", 502);
    return data.nodes as T[];
  }, { timeoutMs: 15_000, signal });
}

/** ready means an authoritative list was read for this identity, not merely
 * that an attempt settled. Failures retain prior nodes and never replay writes. */
export function useNodeListRead<T>({ identityKey, enabled, read, accept, pollMs = 0 }: {
  identityKey: string; enabled: boolean;
  read: (signal: AbortSignal) => Promise<T>;
  accept: (value: T) => void;
  pollMs?: number;
}) {
  const [state, setState] = useState({ key: "", ready: false, loading: false, error: "" });
  const latest = useRef({ identityKey, read, accept });
  latest.current = { identityKey, read, accept };
  const live = useRef<{ refresh: () => Promise<void> } | null>(null);
  const refresh = useCallback(() => live.current?.refresh() ?? Promise.resolve(), []);
  useEffect(() => {
    const controller = new AbortController();
    let flight: Promise<void> | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => !controller.signal.aborted && latest.current.identityKey === identityKey && latest.current.read === read;
    setState({ key: identityKey, ready: !enabled, loading: enabled, error: "" });
    const run = (): Promise<void> => {
      if (!enabled || !current()) return Promise.resolve();
      if (flight) return flight;
      setState(previous => ({ ...previous, loading: true, error: "" }));
      flight = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return read(controller.signal);
      }).then(value => {
        if (!current()) return;
        accept(value);
        setState({ key: identityKey, ready: true, loading: false, error: "" });
      }).catch(cause => {
        if (current()) setState(previous => ({ ...previous, loading: false, error: cause instanceof Error ? cause.message : "节点读取失败" }));
        throw cause;
      }).finally(() => { flight = undefined; });
      return flight;
    };
    const session = { refresh: run }; live.current = session;
    const resume = () => { if (document.visibilityState === "visible") void run().catch(() => {}); };
    const tick = async () => {
      try { await run(); } catch { /* State exposes a read-only retry. */ }
      if (current() && enabled && pollMs) timer = setTimeout(tick, pollMs);
    };
    void tick();
    window.addEventListener("focus", resume); document.addEventListener("visibilitychange", resume);
    return () => {
      controller.abort(); clearTimeout(timer);
      window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume);
      if (live.current === session) live.current = null;
    };
  }, [identityKey, enabled, read, accept, pollMs]);
  return { ready: state.key === identityKey && state.ready, readError: state.key === identityKey ? state.error : "",
    loading: state.key !== identityKey || state.loading, refresh };
}
