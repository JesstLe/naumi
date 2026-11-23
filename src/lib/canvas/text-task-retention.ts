import type { CanvasTextTaskRequest } from "./text-task-request";
import {CANVAS_TEXT_RESULT_LIMIT} from "./text-output-policy";
import type { PartialText } from "./text-output-policy";
export type RetainedTextTask = { request: CanvasTextTaskRequest; partial?: PartialText; fallback?:PartialText; pending?: boolean };
const prefix = "naumi:canvas-text-reply:v1:";
/** Same owner/workspace/project/node partition as the existing text document cache.
 * This is a recovery hint, never authorization or billing evidence. */
export function readRetainedTextTask(key: string): RetainedTextTask | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(prefix + key) || "null") as RetainedTextTask | null;
    if (!v?.request?.node?.id || typeof v.request.payload?.prompt !== "string") return;
    if(v.pending && typeof v.request.operationId === "string" && /^[a-zA-Z0-9_-]{8,120}$/.test(v.request.operationId))return v;
    if(v.partial && typeof v.partial.text === "string" && v.partial.text.length <= CANVAS_TEXT_RESULT_LIMIT &&
      typeof v.partial.operationId === "string" && /^[a-zA-Z0-9_-]{8,120}$/.test(v.partial.operationId))return v;
  } catch { /* Storage may be disabled; the server receipt remains authoritative. */ }
}
export function retainTextTask(key: string, value?: RetainedTextTask) {
  try { if(value)localStorage.setItem(prefix+key,JSON.stringify(value));else localStorage.removeItem(prefix+key); } catch { /* No paid replay fallback. */ }
}
