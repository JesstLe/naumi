import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { workerSecret } from "@/lib/settings-secret";
import { tickIdentity, workerTickWebIdentity, WorkerTickReceiptError, type FencedTickIdentity } from "./worker-tick-receipts";

export const TICK_PROTOCOL_PATH = "/api/video/worker/tick/v2";
export const TICK_PROTOCOL_AUTH_HEADER="x-naumi-worker-v2-auth";
/** Domain-separated credential: an old /tick endpoint cannot authenticate v2,
 * even if a reverse proxy incorrectly rewrites the new URL to the old one. */
export function tickProtocolAuthorized(request: Request) {
  try {
    const expected=Buffer.from(createHmac("sha256",workerSecret()).update("naumi-worker-tick-v2").digest("hex"));
    const supplied=Buffer.from(request.headers.get(TICK_PROTOCOL_AUTH_HEADER)||"");
    return new URL(request.url).pathname===TICK_PROTOCOL_PATH && supplied.length===expected.length && timingSafeEqual(expected,supplied);
  }catch{return false;}
}
export const FENCED_TICK_HEADERS = {
  protocolVersion: "x-naumi-worker-tick-protocol",
  targetWebBootId: "x-naumi-worker-target-boot-id",
  targetWebCommit: "x-naumi-worker-target-commit",
} as const;

export function fencedTickIdentity(request: Request): FencedTickIdentity {
  const base=tickIdentity(request),boot=request.headers.get(FENCED_TICK_HEADERS.targetWebBootId),commit=request.headers.get(FENCED_TICK_HEADERS.targetWebCommit);
  if(!base || request.headers.get(FENCED_TICK_HEADERS.protocolVersion)!=="2" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(boot||"") || !/^[a-f0-9]{40}$/.test(commit||""))
    throw new WorkerTickReceiptError("INVALID_FENCED_TICK_IDENTITY",400);
  return {...base,protocolVersion:2,targetWebBootId:boot!,targetWebCommit:commit!};
}

export function tickProtocolCapability() {
  const web=workerTickWebIdentity();
  // Preload identity is process-wide across Next bundles; module fallbacks aren't.
  if(web.bootSource!=="preload") throw new WorkerTickReceiptError("TICK_PROTOCOL_PRELOAD_REQUIRED",503);
  return {ok:true,protocolVersion:2,endpoint:TICK_PROTOCOL_PATH,fence:"receipt-primary-key-v2",server:web};
}
