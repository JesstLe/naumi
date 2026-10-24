import { canvasDocumentFetch, type CanvasDocumentScope } from "./document-scope";
export type CanvasHistoryScope = CanvasDocumentScope;

export class CanvasHistoryRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Captured headers are applied AFTER auth; a delayed auth never switches owner
 * or workspace for a queued write. The response itself may represent a commit
 * even if navigation occurred while the request was on the wire. */
export async function postCanvasHistory(scope: CanvasHistoryScope, body: unknown) {
  const response = await canvasDocumentFetch(scope,"/api/canvas/history",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20_000)},true);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new CanvasHistoryRequestError(data?.error || "画布保存失败，请重试",response.status);
  if (!data?.ok) throw new Error("画布保存结果待核实，请重试原操作");
  return {persisted: data.persisted !== false};
}
