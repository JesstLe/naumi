import {resolveUserEmail} from "@/lib/admin-auth";
import {sameSiteBillingMutation} from "@/lib/billing/access";
import {imageWorkerAuthorized} from "@/lib/durable-image-jobs";
import {imagegenRequestSchema} from "@/lib/imagegen/schema";
import {submitImagegen,getImagegenResult,resumeImagegen} from "@/lib/imagegen/dispatch";
import {submitImagegenBatch} from "@/lib/imagegen/batch";
import {rateLimit} from "@/lib/rate-limit";
import {readImagegenJson} from "@/lib/imagegen/body";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request){
 if(!sameSiteBillingMutation(request)&&!imageWorkerAuthorized(request))return Response.json({error:"请求来源无效"},{status:403});
 const body=await readImagegenJson(request).catch(()=>null);
 if(body?.workerJobId){if(!imageWorkerAuthorized(request))return Response.json({error:"无权执行"},{status:403});await resumeImagegen(String(body.workerJobId));return Response.json({ok:true});}
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 if(!rateLimit(`imagegen:${owner}`,30,600000))return Response.json({error:"提交过于频繁，请稍后重试"},{status:429});
 try{const {confirmation,...value}=body||{},parsed=imagegenRequestSchema.parse(value);return Response.json(parsed.mode==="batch"?await submitImagegenBatch(parsed,owner,confirmation):await submitImagegen(parsed,owner,confirmation));}
 catch(error){return Response.json({error:error instanceof Error?error.message:"无法提交图像任务"},{status:400});}
}
export async function GET(request:Request){
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 const id=new URL(request.url).searchParams.get("operationId")||"";if(!/^[a-f0-9-]{36}$/i.test(id))return Response.json({error:"操作编号无效"},{status:400});
 const result=await getImagegenResult(id,owner);return result?Response.json(result):Response.json({error:"任务不存在或无权访问"},{status:404});
}
