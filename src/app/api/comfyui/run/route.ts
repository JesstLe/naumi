import {NextResponse} from "next/server";
import {withCreationRoute,withCreationReceiptRoute} from "@/lib/saas/creation-context";
import {authenticatedEmail} from "@/lib/request-auth";
import {dbEnabled} from "@/platform/db/pool";
import {clientIp} from "@/lib/ip";
import {checkRateLimit} from "@/lib/rate-limit-http";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {safeError} from "@/lib/api-error";
import {executeComfyRun} from "@/lib/comfyui/run";
import {readComfyRunReceipt} from "@/lib/comfyui/run-receipt";
import type {ComfyRunInput} from "@/lib/comfyui/run-contract";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
const headers={"cache-control":"private, no-store"};
async function handlePost(request:Request){
  const email=await authenticatedEmail(request);
  if(dbEnabled&&!email)return NextResponse.json({error:"请先登录",accepted:false},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站执行",accepted:false},{status:403});
  const rateLimitResult=await checkRateLimit(`comfyui-run:${clientIp(request)||"0.0.0.0"}`,10,10*60*1000);
  if(rateLimitResult instanceof Response)return rateLimitResult;
  if(!rateLimitResult)return NextResponse.json({error:"工作流执行过于频繁，请稍后再试",accepted:false},{status:429});
  const body=await request.json().catch(()=>null) as ComfyRunInput|null;
  if(!email)return NextResponse.json({error:"请选择工作流",accepted:false},{status:400});
  const result=await executeComfyRun(email,body,{origin:request.url,canvas:request.headers.get("x-naumi-canvas")==="1",operationId:request.headers.get("x-naumi-billing-operation-id")});
  return NextResponse.json(result.body,{status:result.status,headers});
}
export function POST(request:Request){return withCreationRoute(request,()=>handlePost(request));}
export function GET(request:Request){return withCreationReceiptRoute(request,async()=>{
  const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401,headers});
  const operationId=new URL(request.url).searchParams.get("operationId");
  if(!operationId||operationId.length>100)return NextResponse.json({error:"原工作流编号无效"},{status:400,headers});
  try{const receipt=await readComfyRunReceipt(email,operationId);return receipt?NextResponse.json({ok:true,...receipt},{headers}):NextResponse.json({error:"原工作流回执尚未确认，请稍后检查原任务"},{status:404,headers});}
  catch(error){return NextResponse.json({error:safeError(error,"原工作流回执暂不可读")},{status:503,headers});}
});}
