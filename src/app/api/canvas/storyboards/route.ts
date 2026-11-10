import {NextResponse} from "next/server";
import {z} from "zod";
import {authenticatedEmail} from "@/lib/request-auth";
import {withCreationRoute,withCreationReceiptRoute} from "@/lib/saas/creation-context";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {ModelConfigError} from "@/lib/model-config/types";
import {TeamError} from "@/lib/teams/errors";
import {videoProjectKeySchema} from "@/lib/canvas/project-key";
import {listStoryboardPlans,saveStoryboardPlan,getStoryboardOperation} from "@/lib/storyboard/service";
export const runtime="nodejs",dynamic="force-dynamic";
function failure(error:unknown){
  if(error instanceof ModelConfigError||error instanceof TeamError)return NextResponse.json({error:error.message,code:"code" in error?error.code:undefined},{status:error.status});
  if(error instanceof z.ZodError||error instanceof SyntaxError)return NextResponse.json({error:"分镜方案字段无效"},{status:422});
  return NextResponse.json({error:"方案保存或读取尚未核实，请沿用原操作重试"},{status:503});
}
export function GET(request:Request){return withCreationReceiptRoute(request,async()=>{
  const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});
  try{const params=new URL(request.url).searchParams,project=videoProjectKeySchema.parse(params.get("projectKey")),operationId=params.get("operationId");return NextResponse.json(operationId!==null?{plan:await getStoryboardOperation(actor,project,z.uuid().parse(operationId)),operationId}:{plans:await listStoryboardPlans(actor,project)},{headers:{"cache-control":"private, no-store"}});}catch(error){return failure(error);}
});}
export function POST(request:Request){return withCreationRoute(request,async()=>{
  const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
  try{const input=JSON.parse(await readBounded(new Response(request.body),2*1024*1024));return NextResponse.json({plan:await saveStoryboardPlan(actor,input)});}catch(error){return failure(error);}
});}
