import {withBiRequest} from "@/lib/bi/request";
import {resolveUserEmail} from "@/lib/admin-auth";
import {sameSiteBillingMutation} from "@/lib/billing/access";
import { imageWorkerAuthorized } from "@/lib/worker/authorization";
import {imagegenRequestSchema} from "@/lib/imagegen/schema";
import {submitImagegen,getImagegenResult,resumeImagegen,readImagegenReceipt} from "@/lib/imagegen/dispatch";
import {submitImagegenBatch,readImagegenBatchReceipt} from "@/lib/imagegen/batch";
import {readImagegenJson} from "@/lib/imagegen/body";
import {ImagegenConfirmationChanged} from "@/lib/imagegen/confirmation";
import {readImagegenQuote,ImagegenQuoteError,assertImagegenQuoteReference} from "@/lib/imagegen/quotes";
import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
import {ImagegenScopeError} from "@/lib/imagegen/creation-scope";
export const runtime="nodejs";
export const maxDuration=300;
const acceptedReceipt=(operationId:string,owner:string)=>readImagegenReceipt(operationId,owner).then(async result=>result||await readImagegenBatchReceipt(operationId,owner));
async function handlePost(request:Request){
 if(!sameSiteBillingMutation(request)&&!imageWorkerAuthorized(request))return Response.json({error:"请求来源无效"},{status:403});
 const body=await readImagegenJson(request).catch(()=>null);
 if(body?.workerJobId){if(!imageWorkerAuthorized(request))return Response.json({error:"无权执行"},{status:403});await resumeImagegen(String(body.workerJobId));return Response.json({ok:true});}
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 let {confirmation,...value}=body||{};
 if(body?.quoteId!==undefined){
  try{
   if(Object.keys(body).some(key=>!["operationId","quoteId","confirmed"].includes(key))||body.confirmed!==undefined&&typeof body.confirmed!=="boolean")throw new ImagegenQuoteError();
   assertImagegenQuoteReference(body.quoteId,body.operationId);
  }catch(error){return Response.json({error:error instanceof Error?error.message:"报价凭据无效",code:"IMAGEGEN_QUOTE_INVALID"},{status:400});}
  try{
   // An accepted operation outlives its preview. This path is deliberately
   // read-only and never reads (or recreates) a missing/expired quote.
   const accepted=await acceptedReceipt(body.operationId,owner);
   if(accepted)return Response.json(accepted,{headers:{"cache-control":"private, no-store"}});
   const saved=await readImagegenQuote(body.quoteId,owner,body.operationId);value=saved.request;confirmation={quoteId:body.quoteId,confirmed:body.confirmed!==false};
  }catch(error){
   // The winner can commit between the first probe and quote lookup.
   try{const accepted=await acceptedReceipt(body.operationId,owner);if(accepted)return Response.json(accepted,{headers:{"cache-control":"private, no-store"}});}catch{/* An unavailable probe proves neither acceptance nor absence. */}
   return Response.json({error:error instanceof Error?error.message:"报价凭据无效",code:"IMAGEGEN_QUOTE_INVALID"},{status:400});
  }
 }
 const parsed=imagegenRequestSchema.safeParse(value);
 if(!parsed.success)return Response.json({error:"图像请求格式无效",accepted:false},{status:400});
 try{return Response.json(parsed.data.mode==="batch"?await submitImagegenBatch(parsed.data,owner,confirmation):await submitImagegen(parsed.data,owner,confirmation));}
 catch(error){let accepted:boolean|undefined;try{accepted=!!(parsed.data.mode==="batch"?await readImagegenBatchReceipt(parsed.data.operationId,owner):await readImagegenReceipt(parsed.data.operationId,owner));}catch{/* Cannot prove absence while the database is unavailable. */}return Response.json({error:error instanceof Error?error.message:"无法提交图像任务",accepted,...(error instanceof ImagegenConfirmationChanged||error instanceof ImagegenQuoteError||error instanceof ImagegenScopeError?{code:error.code}:{})},{status:error instanceof ImagegenConfirmationChanged||error instanceof ImagegenScopeError?error.status:400});}
}
async function handleGet(request:Request){
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 const id=new URL(request.url).searchParams.get("operationId")||"";if(!/^[a-f0-9-]{36}$/i.test(id))return Response.json({error:"操作编号无效"},{status:400});
 const result=await getImagegenResult(id,owner);return result?Response.json(result):Response.json({error:"任务不存在或无权访问"},{status:404});
}

export async function GET(request:Request){return withCreationReceiptRoute(request,()=>handleGet(request));}
export async function POST(request:Request){return withCreationReceiptRoute(request,()=>withBiRequest(request,()=>handlePost(request)));}
