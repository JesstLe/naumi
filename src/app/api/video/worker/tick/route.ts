import { NextResponse } from "next/server";

import { imageWorkerAuthorized } from "@/lib/durable-image-jobs";
import { scanWorkerTick as scan } from "@/lib/worker/tick-scan";
import { dbEnabled } from "@/lib/db";
import { getWorkerTickPool } from "@/lib/db/connection";
import { createWorkerTickReceiptStore, runReceiptedWorkerTick, tickIdentity, workerTickWebIdentity, WorkerTickReceiptError, type WorkerTickReceiptStore } from "@/lib/release-runtime/worker-tick-receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

let receiptStore: { pool: ReturnType<typeof getWorkerTickPool>; store: WorkerTickReceiptStore } | undefined;
function store() {
  if (!dbEnabled) throw new WorkerTickReceiptError("DURABLE_TICK_RECEIPTS_REQUIRE_DATABASE",503);
  const pool = getWorkerTickPool();
  if (receiptStore?.pool !== pool) receiptStore = { pool, store: createWorkerTickReceiptStore(pool) };
  return receiptStore.store;
}
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function failure(error: unknown) {
  return NextResponse.json({error:error instanceof WorkerTickReceiptError ? error.code : "WORKER_TICK_RECEIPT_UNAVAILABLE"}, {status:error instanceof WorkerTickReceiptError ? error.status : 503,headers});
}
export async function POST(request: Request) {
  if (!imageWorkerAuthorized(request)) return NextResponse.json({ error: "worker authentication failed" }, { status: 401,headers });
  let input;
  try {input=tickIdentity(request);}catch(error){return failure(error);}
  // Legacy callers retain their existing scan contract; never infer that they have durable control.
  if (!input) return NextResponse.json(await scan(),{headers});
  try {
    const web=workerTickWebIdentity(),result=await runReceiptedWorkerTick(store(),input,web,scan);
    return NextResponse.json({ok:result.receipt.phase==="completed",...result,server:web},{status:result.receipt.phase==="completed"?200:202,headers});
  } catch(error) { return failure(error); }
}
export async function GET(request: Request) {
  if (!imageWorkerAuthorized(request)) return NextResponse.json({error:"worker authentication failed"},{status:401,headers});
  try {
    const input=tickIdentity(request);
    if(!input || new URL(request.url).searchParams.get("tickId")!==input.tickId) throw new WorkerTickReceiptError("INVALID_WORKER_TICK_QUERY",400);
    const web=workerTickWebIdentity(),receipt=await store().read(input,web);
    return NextResponse.json({ok:receipt.phase==="completed",receipt,server:web},{headers});
  } catch(error) { return failure(error); }
}
