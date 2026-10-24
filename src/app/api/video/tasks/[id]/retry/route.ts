import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {z} from "zod";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {withBiRequest} from "@/lib/bi/request";
import {requestQuoteConfirmation,billingErrorResponse} from "@/lib/billing/request";
import {readBounded} from "@/lib/supplier-cost/io";
import {getVideoTask,getVideoTaskByIdempotencyKey} from "@/lib/db";
import {getVideoNode} from "@/lib/canvas/video-node-repository";
import {createVideoGeneration,requestFromQueuedTask} from "@/lib/video/service";
import {VideoContractError} from "@/lib/video/contract";
import {BillingError} from "@/lib/billing/types";
import {ModelConfigError} from "@/lib/model-config/types";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=120;
const schema=z.strictObject({idempotencyKey:z.string().min(1).max(100),billingVersion:z.number().int().positive().optional(),billingCredits:z.number().finite().nonnegative().optional()});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return withBiRequest(request,async()=>{
  const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站重试"},{status:403});
  try{
    const body=JSON.parse(await readBounded(new Response(request.body),8192)),parsed=schema.safeParse(body);
    if(!parsed.success)return NextResponse.json({error:"请提供新的重试操作编号"},{status:422});
    const task=await getVideoTask(email,(await context.params).id);if(!task)return NextResponse.json({error:"任务不存在"},{status:404});
    if(!["failed","cancelled"].includes(task.status))return NextResponse.json({error:"仅已失败或取消的任务可重试"},{status:409});
    const replay=await getVideoTaskByIdempotencyKey(email,parsed.data.idempotencyKey);
    if(replay){if(replay.parameters.retryOf!==task.id)return NextResponse.json({error:"操作编号已用于其他视频任务",code:"OPERATION_CONFLICT"},{status:409});return NextResponse.json({ok:true,taskId:replay.id,cost:replay.cost},{status:202});}
    if(task.parameters.byocSnapshot){const {retryByocVideoTask}=await import("@/lib/video/byoc");return NextResponse.json({ok:true,...await retryByocVideoTask(email,task,parsed.data.idempotencyKey)},{status:202});}
    const old=requestFromQueuedTask(task),{canvasNodeId,nodeRevision:_revision,...intent}=old;
    const node=canvasNodeId?await getVideoNode(email,canvasNodeId):null;
    const execution=(task.parameters.modelExecutions as import("@/lib/model-config/context").ExecutionBundle|undefined)?.video;
    const frozenIntent={...intent,orderedInputs:intent.orderedInputs?.map(input=>input.kind==="text"?{...input,nodeId:`inline:retry-${createHash("sha256").update(`${task.id}:${input.id}`).digest("hex")}`}:input),shots:intent.shots?.map(shot=>({...shot,textNodeId:undefined}))};
    const result=await createVideoGeneration(email,{...frozenIntent,modelId:execution?.publicModelId||String(task.parameters.publicModelId||task.model),
      prompt:typeof task.parameters.originalPrompt==="string"?task.parameters.originalPrompt:task.prompt,camera:task.parameters.camera as never,
      ...(node?{nodeId:node.id,nodeRevision:node.revision}:{}),retryOf:task.id,
      seconds:String(old.durationSeconds),size:old.resolution||"",idempotencyKey:parsed.data.idempotencyKey,billingConfirmation:requestQuoteConfirmation(request,parsed.data)});
    return NextResponse.json({ok:true,...result},{status:202});
  }catch(error){if(error instanceof BillingError||error instanceof ModelConfigError)return billingErrorResponse(error);
    if(error instanceof VideoContractError)return NextResponse.json({error:error.message,code:error.code,fields:error.fields},{status:422});
    return NextResponse.json({error:"重试创建失败"},{status:503});}
});}
