import {withWorkflowContinuation} from "@/lib/video/workflow-creation";
import {ensureVideoWorkflowSchema} from "@/lib/video/workflow";
import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {getVideoWorkflow,resumeVideoWorkflow,cancelVideoWorkflow} from "@/lib/video/workflow";
import {ModelConfigError} from "@/lib/model-config/types";
import {confirmVideoWorkflowNode} from "@/lib/video/workflow";
import {readBounded} from "@/lib/supplier-cost/io";
import {z} from "zod";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=300;
type Context={params:Promise<{id:string}>};
function failure(error:unknown){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):NextResponse.json({error:"视频工作流暂时不可用"},{status:503});}
export async function GET(request:Request,context:Context){const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  try{return NextResponse.json({ok:true,run:await getVideoWorkflow(email,(await context.params).id)},{headers:{"cache-control":"private, no-store"}});}catch(error){return failure(error);}}
export async function POST(request:Request,context:Context){const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
  try{const parsed=z.discriminatedUnion("action",[z.strictObject({action:z.literal("resume")}),z.strictObject({action:z.literal("cancel")}),
      z.strictObject({action:z.literal("confirm"),nodeId:z.string().min(1).max(100),billingVersion:z.number().int().positive(),billingCredits:z.number().finite().nonnegative()})]).safeParse(JSON.parse(await readBounded(new Response(request.body),16384)));
    if(!parsed.success)return NextResponse.json({error:"工作流操作无效"},{status:422});const body=parsed.data,id=(await context.params).id;
    await ensureVideoWorkflowSchema();const run=await withWorkflowContinuation(request,email,id,async()=>body.action==="cancel"?await cancelVideoWorkflow(email,id):body.action==="confirm"?await confirmVideoWorkflowNode(email,id,body.nodeId,{version:body.billingVersion,credits:body.billingCredits}):await resumeVideoWorkflow(id,email));
    return NextResponse.json({ok:true,run});}catch(error){return failure(error);}}
