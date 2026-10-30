import {NextResponse} from "next/server";
import {withBiRequest} from "@/lib/bi/request";
import {dbEnabled} from "@/platform/db/pool";
import {getUser} from "@/lib/accounts/session";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {clientIp} from "@/lib/ip";
import { checkRateLimit } from "@/lib/rate-limit-http";
import {readBounded} from "@/lib/supplier-cost/io";
import {createVideoGeneration} from "@/lib/video/creation";
import {type CreateVideoInput} from "@/lib/video/submission-types";
import {videoSubmissionSchema} from "@/lib/video/submission-schema";
import {VideoContractError} from "@/lib/video/contract";
import {requestQuoteConfirmation,billingErrorResponse} from "@/lib/billing/request";
import {BillingError} from "@/lib/billing/types";
import {ModelConfigError} from "@/lib/model-config/types";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=120;
async function handlePost(request:Request){
  const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站生成"},{status:403});
  const rateLimitResult = await checkRateLimit(`video-gen:${email}:${clientIp(request)||"0.0.0.0"}`,30,10*60*1000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) return NextResponse.json({error:"视频生成过于频繁，请稍后再试"},{status:429});
  try{
    const body=JSON.parse(await readBounded(new Response(request.body),1024*1024));
    if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({error:"视频请求无效"},{status:422});
    const {billingVersion:_version,billingCredits:_credits,...intent}=body;
    const parsed=videoSubmissionSchema.safeParse(intent);
    if(!parsed.success)return NextResponse.json({error:"视频提交字段无效",code:"INVALID_VIDEO_SUBMISSION",fields:parsed.error.issues.map(issue=>issue.path.join("."))},{status:422});
    const data=parsed.data;
    const result=await createVideoGeneration(email,{...data,idempotencyKey:data.idempotencyKey||request.headers.get("x-naumi-billing-operation-id")||undefined,billingConfirmation:requestQuoteConfirmation(request,body),
      source:data.source||(data.imageUrl?"agent":data.artworkId?"canvas":"workbench"),sourceId:data.sourceId||data.artworkId,
      prompt:data.prompt??"",seconds:data.seconds??String(data.durationSeconds??""),size:data.size??data.resolution??""} as CreateVideoInput);
    const user=dbEnabled?await getUser(email).catch(()=>null):null;return NextResponse.json({ok:true,...result,user});
  }catch(error){
    if(error instanceof BillingError||error instanceof ModelConfigError)return billingErrorResponse(error);
    if(error instanceof VideoContractError)return NextResponse.json({error:error.message,code:error.code,fields:error.fields},{status:422});
    if(error instanceof SyntaxError)return NextResponse.json({error:"视频请求JSON无效"},{status:422});
    return NextResponse.json({error:"视频任务创建失败"},{status:503});
  }
}
export async function POST(request:Request){return withBiRequest(request,()=>handlePost(request));}
