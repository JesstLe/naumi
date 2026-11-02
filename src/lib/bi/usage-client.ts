import type { UsageResponse } from "./usage-contracts";

/** One bounded read, including the response body. No persistent or cross-account cache. */
export const USAGE_READ_TIMEOUT_MS = 30_000;
export class UsageReadError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "UsageReadError"; }
}
export function isUsageAccessError(reason: unknown): reason is UsageReadError {
  return reason instanceof UsageReadError && (reason.status === 401 || reason.status === 403 || reason.status === 404);
}
export async function readUsageResponse(url: string, signal: AbortSignal): Promise<UsageResponse> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAborted: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAborted = reject; });
  const stop = (reason: unknown) => { controller.abort(reason); rejectAborted(reason); };
  const onAbort = () => stop(signal.reason || new DOMException("Aborted", "AbortError"));
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) onAbort();
  else timer = setTimeout(() => stop(new UsageReadError("读取超时，请缩短日期范围或重试")), USAGE_READ_TIMEOUT_MS);
  try {
    const reading = (async () => {
      if (controller.signal.aborted) throw controller.signal.reason;
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      // Do not retain a previous authorized snapshot while reading an error body.
      if (response.status === 401 || response.status === 403 || response.status === 404) throw new UsageReadError(response.status === 401 ? "登录已失效，请重新登录" : "当前账号没有此用量数据的访问权限", response.status);
      const body = await response.json();
      if (!response.ok) throw new UsageReadError(body?.error || "用量数据读取失败，请重试", response.status);
      if (!Array.isArray(body?.users) || !Array.isArray(body?.daily) || !body?.summary || !body?.coverage) throw new UsageReadError("用量数据格式异常，请重试");
      return body as UsageResponse;
    })();
    return await Promise.race([reading, aborted]);
  } finally {
    // Also release a 401/403/404 body we deliberately did not consume.
    controller.abort();
    if (timer !== undefined) clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
