import {resolveUserEmail} from "@/lib/admin-auth";
import {sameSiteBillingMutation} from "@/lib/billing/access";
import {imagegenRequestSchema} from "@/lib/imagegen/schema";
import {planImagegen} from "@/lib/imagegen/plan";
import {planImagegenBatch} from "@/lib/imagegen/batch";
import {rateLimit} from "@/lib/rate-limit";
export const runtime="nodejs";
export async function POST(request:Request){
 if(!sameSiteBillingMutation(request))return Response.json({error:"请求来源无效"},{status:403});
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 if(!rateLimit(`imagegen-plan:${owner}`,60,600000))return Response.json({error:"预览过于频繁，请稍后重试"},{status:429});
 try{const parsed=imagegenRequestSchema.parse(await request.json());return Response.json(parsed.mode==="batch"?await planImagegenBatch(parsed,owner):await planImagegen(parsed,owner));}
 catch(error){return Response.json({error:error instanceof Error?error.message:"无法预览计划"},{status:400});}
}
