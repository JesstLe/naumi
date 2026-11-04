"use client";
import { useEffect, useRef, useState } from "react";
import { BusinessReadError, readBusinessResponse } from "./client";
import type { BusinessFilter, BusinessResponse } from "./types";

type State = { key: string; data: BusinessResponse | null; busy: boolean; error: string };
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
  signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
});

export function useBusinessData(filter: BusinessFilter, identity: string, ready: boolean, revision: number) {
  const filterKey = JSON.stringify(filter), key = identity + "\0" + filterKey;
  const [state, setState] = useState<State>({ key: "", data: null, busy: true, error: "" });
  const usedRevision = useRef(0);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    if (!ready) return () => controller.abort();
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
