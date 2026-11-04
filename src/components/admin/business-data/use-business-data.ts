"use client";
import { useEffect, useRef, useState } from "react";
import { BusinessReadError, readBusinessResponse } from "./client";
import type { BusinessFilter, BusinessResponse } from "./types";

type State = { key: string; data: BusinessResponse | null; busy: boolean; error: string };
/** Wait between polls with abortable timer cleanup so superseded queries do not keep polling. */
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  /** Cancel the pending poll delay, detach its abort listener and reject with the original cancellation reason. */
  const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
  signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
});

/** Load and poll business snapshots keyed by administrator identity and filters, aborting superseded effects.
 * Keep timed-out sources unknown and discard retained data on access errors rather than showing stale authorized results.
 */
export function useBusinessData(filter: BusinessFilter, identity: string, ready: boolean, revision: number) {
  const filterKey = JSON.stringify(filter), key = identity + "\0" + filterKey;
  const [state, setState] = useState<State>({ key: "", data: null, busy: true, error: "" });
  const usedRevision = useRef(0);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    if (!ready) return () => controller.abort();
    /** Publish state only while this query effect remains current and its abort signal is still active. */
    const update = (data: BusinessResponse | null, busy: boolean, error = "") => {
      if (current && !controller.signal.aborted) setState({ key, data, busy, error });
    };
    update(null, true);
    void (async () => {
      let latest: BusinessResponse | null = null;
      try {
        const refresh = revision !== usedRevision.current;
        usedRevision.current = revision;
        latest = await readBusinessResponse("/api/admin/business", controller.signal, { ...JSON.parse(filterKey), refresh });
        update(latest, latest.sources.some(source => source.status === "pending"));
        const deadline = Date.now() + 90_000;
        while (latest.sources.some(source => source.status === "pending") && Date.now() < deadline) {
          await wait(2500, controller.signal);
          const next = await readBusinessResponse("/api/admin/business?requestId=" + encodeURIComponent(latest.requestId), controller.signal);
          if (next.requestId !== latest.requestId || next.query.asOf !== latest.query.asOf) throw new BusinessReadError("查询回执发生变化，请刷新");
          latest = next; update(latest, latest.sources.some(source => source.status === "pending"));
        }
        if (latest.sources.some(source => source.status === "pending")) latest = { ...latest, complete: false, sources: latest.sources.map(source => source.status === "pending" ? { ...source, status: "unknown", data: undefined, error: "等待回执超时" } : source) };
        update(latest, false);
      } catch (reason) {
        if (!current || controller.signal.aborted) return;
        const accessError = reason instanceof BusinessReadError && [401, 403, 404].includes(reason.status || 0);
        if (latest && !accessError) latest = { ...latest, complete: false, sources: latest.sources.map(source => source.status === "pending" ? { ...source, status: "unknown", data: undefined, error: "回执状态未确认" } : source) };
        update(accessError ? null : latest, false, reason instanceof Error ? reason.message : "站点数据读取失败");
      }
    })();
    return () => { current = false; controller.abort(); };
  }, [key, filterKey, ready, revision]);
  return state.key === key ? state : { key, data: null, busy: true, error: "" };
}
