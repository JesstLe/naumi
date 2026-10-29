import { NextResponse } from "next/server";

import { scanVideoWorkerOnce } from "@/lib/video/worker";
import { recoverCanvasImageTasks } from "@/lib/canvas-image-tasks";
import { recoverDurableImageJobs, imageWorkerAuthorized } from "@/lib/durable-image-jobs";
import { scanSupplierCostsOnce } from "@/lib/supplier-cost/worker";
import {scheduleMediaRecovery} from "@/lib/worker/media-recovery";
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
async function scan() {
  const startedAt=Date.now(),phases:Record<string,number>={};
  async function phase<T>(name:string,action:()=>Promise<T>){const start=Date.now();try{return await action();}finally{phases[name]=Date.now()-start;}}
  const videoProcessed = await phase('video',()=>scanVideoWorkerOnce());
  const imageProcessed = await phase('canvasImage',()=>recoverCanvasImageTasks(2));
  const generationProcessed = await phase('generation',()=>recoverDurableImageJobs());
  await phase('reference',()=>import("@/lib/reference-workbench/service").then(m=>m.recoverReferenceWorkbench()));
  const supplierCostsProcessed = await phase('supplierCosts',()=>scanSupplierCostsOnce());
  const mediaRecovery=await phase('mediaAdmission',()=>scheduleMediaRecovery());
  return {
    ok: true,
    processed: videoProcessed + imageProcessed + generationProcessed,
    // This receipt confirms dispatch, not completion of detached media work.
    mediaProcessed:0,
    generationProcessed,
    supplierCostsProcessed,
    mediaSaved:0,
    mediaRecovery,
    phasesMs:phases,
    durationMs:Date.now()-startedAt,
    videoProcessed,
    imageProcessed,
    at: new Date().toISOString(),
  };
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
