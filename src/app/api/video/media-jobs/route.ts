import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {ModelConfigError} from "@/lib/model-config/types";
import {createMediaJob,listMediaJobs} from "@/lib/video/media-jobs";
import {BillingError} from "@/lib/billing/types";
import {MediaPriceChangedError} from "@/lib/video/media-billing";
import {z} from "zod";
import {sameSiteBiMutation} from "@/lib/bi/access";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=240;
const cursorSchema=z.object({createdAt:z.iso.datetime(),id:z.uuid()}).strict();
export async function GET(request:Request){const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});
  const params=new URL(request.url).searchParams,operationId=params.get("operationId")||undefined,source=params.get("source")||undefined,limit=Number(params.get("limit")??30);
  let cursor:z.infer<typeof cursorSchema>|undefined;
  try{if(params.has("cursor"))cursor=cursorSchema.parse(JSON.parse(params.get("cursor")!));}catch{return NextResponse.json({error:"历史分页参数无效"},{status:422});}
  if(operationId&&!z.uuid().safeParse(operationId).success||source&&!['canvas','agent','workbench','workflow'].includes(source)||!Number.isInteger(limit)||limit<1||limit>100)return NextResponse.json({error:"媒体任务查询参数无效"},{status:422});
  try{const result=await listMediaJobs(actor,{projectKey:params.get("projectKey")||undefined,operationId,cursor,limit,source:source as "canvas"|"agent"|"workbench"|"workflow"|undefined});
    return NextResponse.json({ok:true,...result},{headers:{"cache-control":"private, no-store"}});
  }catch{return NextResponse.json({error:"媒体任务历史暂不可用"},{status:503});}}
export async function POST(request:Request){
  const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站处理"},{status:403});
  try{const job=await createMediaJob(actor,await request.json());return NextResponse.json({ok:true,jobId:job.id,job},{status:202});}
  catch(error){return error instanceof ModelConfigError||error instanceof BillingError?NextResponse.json({error:error.message,code:error.code,...(error instanceof MediaPriceChangedError?{quote:error.quote}:{})},{status:error.status}):NextResponse.json({error:"媒体处理创建失败"},{status:502});}
}
