import { NextResponse } from "next/server";
import {dbEnabled,getWorkerTickPool} from "@/platform/db/pool";
import {applicationTasksRunHere} from "@/lib/application/task-execution";
import {scanApplicationWorkerOnce as scanWorkerTick} from "@/lib/worker/scan";
import { createWorkerTickReceiptStore, runFencedWorkerTick, WorkerTickReceiptError, type WorkerTickReceiptStore } from "@/lib/release-runtime/worker-tick-receipts";
import { fencedTickIdentity, tickProtocolCapability, tickProtocolAuthorized } from "@/lib/release-runtime/worker-tick-protocol";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
let current:{pool:ReturnType<typeof getWorkerTickPool>;store:WorkerTickReceiptStore}|undefined;
function store() {
  if(!dbEnabled)throw new WorkerTickReceiptError("DURABLE_TICK_RECEIPTS_REQUIRE_DATABASE",503);
  const pool=getWorkerTickPool();
  if(current?.pool!==pool)current={pool,store:createWorkerTickReceiptStore(pool)};
  return current.store;
}
function failure(error:unknown) {
  return NextResponse.json({error:error instanceof WorkerTickReceiptError?error.code:"WORKER_TICK_RECEIPT_UNAVAILABLE"},
    {status:error instanceof WorkerTickReceiptError?error.status:503,headers});
}
export async function GET(request:Request) {
  if(!tickProtocolAuthorized(request))return NextResponse.json({error:"worker authentication failed"},{status:401,headers});
  try {
    const capability=tickProtocolCapability(),query=new URL(request.url).searchParams;
    if(query.get("action")==="capability" && [...query.keys()].length===1)return NextResponse.json(capability,{headers});
    const input=fencedTickIdentity(request);
    if(query.get("tickId")!==input.tickId)throw new WorkerTickReceiptError("INVALID_WORKER_TICK_QUERY",400);
    const receipt=await store().readFenced(input,capability.server);
    return NextResponse.json({ok:receipt.phase==="completed"||receipt.phase==="not_accepted",receipt,server:capability.server},{headers});
  }catch(error){return failure(error);}
}
export async function POST(request:Request) {
  if(!tickProtocolAuthorized(request))return NextResponse.json({error:"worker authentication failed"},{status:401,headers});
  try {
    const input=fencedTickIdentity(request),web=tickProtocolCapability().server;
    // Query action (not permissively parsed JSON) keeps the admission request tiny.
    const query=new URL(request.url).searchParams,action=query.get("action");
    if([...query.keys()].length!==1 || !["accept","prove-not-accepted"].includes(action||""))throw new WorkerTickReceiptError("INVALID_TICK_PROTOCOL_ACTION",400);
    if(action==="prove-not-accepted") {
      const receipt=await store().proveNotAccepted(input,web);
      return NextResponse.json({ok:true,receipt,server:web},{headers});
    }
    if(!applicationTasksRunHere())throw new WorkerTickReceiptError("APPLICATION_TASKS_ASSIGNED_TO_WORKER",409);
    const result=await runFencedWorkerTick(store(),input,web,scanWorkerTick),phase=result.receipt.phase;
    return NextResponse.json({ok:phase==="completed",...result,server:web},{status:phase==="completed"?200:phase==="not_accepted"?409:202,headers});
  }catch(error){return failure(error);}
}
