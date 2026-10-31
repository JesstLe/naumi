import {resolveUserEmail} from "@/lib/admin-auth";
import {sameSiteBillingMutation} from "@/lib/billing/access";
import {imagegenRequestSchema} from "@/lib/imagegen/schema";
import {planImagegen} from "@/lib/imagegen/plan";
import {ImagegenPlanError} from "@/lib/imagegen/plan-error";
import {planImagegenBatch} from "@/lib/imagegen/batch";
import {readImagegenJson} from "@/lib/imagegen/body";
import {issueImagegenQuote,readOriginalImagegenQuote} from "@/lib/imagegen/quotes";
import {withCreationRoute} from "@/lib/saas/creation-context";
export const runtime="nodejs";
async function handlePost(request:Request){
 if(!sameSiteBillingMutation(request))return Response.json({error:"请求来源无效"},{status:403});
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 try{
  const parsed=imagegenRequestSchema.parse(await readImagegenJson(request)),saved=await readOriginalImagegenQuote(parsed,owner);
  // The quote owner validates the original contract once, without current repricing.
  if(saved)return Response.json(saved,{headers:{"cache-control":"private, no-store"}});
  const plan=parsed.mode==="batch"?await planImagegenBatch(parsed,owner):await planImagegen(parsed,owner);
  return Response.json(await issueImagegenQuote(parsed,owner,plan),{headers:{"cache-control":"private, no-store"}});
 }
 catch(error){return Response.json({error:error instanceof Error?error.message:"无法预览计划",...(error instanceof ImagegenPlanError?{code:error.code}:{})},{status:error instanceof ImagegenPlanError?error.status:400});}
}
export async function POST(request:Request){return withCreationRoute(request,()=>handlePost(request));}
