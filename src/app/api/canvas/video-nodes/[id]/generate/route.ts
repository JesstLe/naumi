import {NextResponse} from "next/server";
import {z} from "zod";
import {withBillingIntent} from "@/lib/billing/intent";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {withBiRequest} from "@/lib/bi/model-observer";
import {authenticatedEmail} from "@/lib/request-auth";
import {readBounded} from "@/lib/supplier-cost/io";
import {requestQuoteConfirmation,billingErrorResponse} from "@/lib/billing/request";
import {BillingError} from "@/lib/billing/types";
import {ModelConfigError} from "@/lib/model-config/types";
import {VideoContractError} from "@/lib/video/contract";
import {submitCanvasVideo} from "@/lib/video/node-submission";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=120;
const schema=z.strictObject({expectedRevision:z.number().int().nonnegative(),idempotencyKey:z.string().min(1).max(100),billingVersion:z.number().int().positive().optional(),billingCredits:z.number().finite().nonnegative().optional()});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return withBillingIntent(request,()=>withBiRequest(request,async()=>{
  const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站生成"},{status:403});
  try{const parsed=schema.safeParse(JSON.parse(await readBounded(new Response(request.body),8192)));
    if(!parsed.success)return NextResponse.json({error:"生成字段无效"},{status:422});
    const result=await submitCanvasVideo(email,{nodeId:(await context.params).id,expectedRevision:parsed.data.expectedRevision,idempotencyKey:parsed.data.idempotencyKey,billingConfirmation:requestQuoteConfirmation(request,parsed.data)});
    return NextResponse.json({ok:true,...result},{status:202});
  }catch(error){if(error instanceof BillingError||error instanceof ModelConfigError)return billingErrorResponse(error);
    if(error instanceof VideoContractError)return NextResponse.json({error:error.message,code:error.code,fields:error.fields},{status:422});
    return NextResponse.json({error:"视频生成提交失败"},{status:503});}
}));}
