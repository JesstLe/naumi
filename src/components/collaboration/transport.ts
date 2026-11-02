import type { CollaborationEvent } from "@/lib/collaboration/contracts";

export class CollaborationError extends Error {
  constructor(message: string, public status = 0, public uncertain = false) { super(message); }
}
export const newOperationId = () => crypto.randomUUID();
export function safeLink(value: string | undefined): string | undefined {
  if (!value) return;
  try { const url = new URL(value, window.location.origin); if (["https:", "http:", "mailto:"].includes(url.protocol)) return url.href; } catch { /* invalid link */ }
}
export function attachmentPath(id: string, enterpriseId: string, preview = false) {
  return `/api/collaboration/attachments/${encodeURIComponent(id)}?enterpriseId=${encodeURIComponent(enterpriseId)}${preview ? "&preview=1" : ""}`;
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : "请求失败，请重试";
export function isAbort(error: unknown) { return error instanceof DOMException && error.name === "AbortError"; }
export function aborted(): never { throw new DOMException("会话已变更", "AbortError"); }

/** One reader, bounded frame buffer, authenticated fetch owned by the root client.
 * Cursor advances only after the consumer has reconciled the invalidation. */
export async function readEvents(response: Response, signal: AbortSignal, receive: (event: CollaborationEvent) => Promise<void>) {
  if (!response.ok) throw new CollaborationError(`消息连接失败 (${response.status})`, response.status);
  if (!response.headers.get("content-type")?.includes("text/event-stream") || !response.body) throw new CollaborationError("消息流格式异常");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "";
  const stop = () => { void reader.cancel().catch(() => {}); };
  let watchdog = setTimeout(stop, 75_000);
  signal.addEventListener("abort", stop, { once: true });
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(watchdog); watchdog = setTimeout(stop, 75_000);
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 256 * 1024) throw new CollaborationError("消息流数据超出范围");
      // CRLF can straddle chunks: normalize only complete frames.
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index).replace(/\r\n/g, "\n");
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const lines = frame.split("\n");
        const kind = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
        if (kind !== "update") continue;
        let event: CollaborationEvent;
        try { event = JSON.parse(lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n")); }
        catch { throw new CollaborationError("消息流 JSON 异常"); }
        if (!event || typeof event.id !== "string" || !["invalidate", "reset"].includes(event.type) || !Array.isArray(event.topics) || event.topics.some(t => !["conversations", "messages", "members", "shares"].includes(t))) throw new CollaborationError("消息事件格式异常");
        if (signal.aborted) aborted();
        await receive(event);
      }
    }
    if (!signal.aborted) throw new CollaborationError("消息连接中断，正在重连");
  } finally { clearTimeout(watchdog); signal.removeEventListener("abort", stop); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
