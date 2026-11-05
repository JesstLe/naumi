import { canvasDocumentFetch, type CanvasDocumentScope } from "./document-scope";
export type CanvasHistoryScope = CanvasDocumentScope;

export function canvasHistoryFailureMessage(error:unknown,fallback="画布保存失败"){
  return error instanceof Error&&(error.name==="TimeoutError"||/signal timed out|request timed out/i.test(error.message))
    ?"保存响应超时，修改仍保留；请重试原操作":error instanceof Error?error.message:fallback;
}

export class CanvasHistoryRequestError extends Error {
  constructor(message: string, readonly status: number,readonly conflict?:{id:string;fields:string[];current:import("./text-document-model").CanvasTextNode|null},readonly artworkConflict?:import("./artwork-write").CanvasArtworkConflict) { super(message); }
}

/** Captured headers are applied AFTER auth; a delayed auth never switches owner
 * or workspace for a queued write. The response itself may represent a commit
 * even if navigation occurred while the request was on the wire. */
export async function postCanvasHistory(scope: CanvasHistoryScope, body: unknown) {
  const response = await canvasDocumentFetch(scope,"/api/canvas/history",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20_000)},true);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new CanvasHistoryRequestError(data?.error || "画布保存失败，请重试",response.status,data?.code==="CANVAS_TEXT_CONFLICT"?{id:data.id,fields:data.fields,current:data.current}:undefined,data?.code==="CANVAS_ARTWORK_CONFLICT"?{id:data.id,fields:data.fields,current:data.current}:undefined);
  if (!data?.ok) throw new Error("画布保存结果待核实，请重试原操作");
  return {nativeNodes:data.nativeNodes as import("./native-node-records").CanvasNativeRecords|undefined,artworkNodes:Array.isArray(data.artworkNodes)?data.artworkNodes as import("./artwork-write").CanvasArtworkReceipt[]:undefined,artworkIds:Array.isArray(data.artworkIds)?data.artworkIds as string[]:undefined,persisted: data.persisted !== false,textNodes:Array.isArray(data.textNodes)?data.textNodes as import("./text-document-model").CanvasTextNode[]:undefined};
}
