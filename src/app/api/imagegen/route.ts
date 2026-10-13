import {resolveUserEmail} from "@/lib/admin-auth";
import {sameSiteBillingMutation} from "@/lib/billing/access";
import {imageWorkerAuthorized} from "@/lib/durable-image-jobs";
import {imagegenRequestSchema} from "@/lib/imagegen/schema";
import {submitImagegen,getImagegenResult,resumeImagegen,readImagegenReceipt} from "@/lib/imagegen/dispatch";
import {submitImagegenBatch,readImagegenBatch} from "@/lib/imagegen/batch";
import {rateLimit} from "@/lib/rate-limit";
import {readImagegenJson} from "@/lib/imagegen/body";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request){
 if(!sameSiteBillingMutation(request)&&!imageWorkerAuthorized(request))return Response.json({error:"请求来源无效"},{status:403});
 const body=await readImagegenJson(request).catch(()=>null);
 if(body?.workerJobId){if(!imageWorkerAuthorized(request))return Response.json({error:"无权执行"},{status:403});await resumeImagegen(String(body.workerJobId));return Response.json({ok:true});}
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 const {confirmation,...value}=body||{},parsed=imagegenRequestSchema.safeParse(value);
 if(!parsed.success)return Response.json({error:"图像请求格式无效",accepted:false},{status:400});
 try{if(!rateLimit(`imagegen:${owner}`,30,600000))throw new Error("提交过于频繁，请稍后重试");return Response.json(parsed.data.mode==="batch"?await submitImagegenBatch(parsed.data,owner,confirmation):await submitImagegen(parsed.data,owner,confirmation));}
 catch(error){let accepted:boolean|undefined;try{accepted=!!(parsed.data.mode==="batch"?await readImagegenBatch(parsed.data.operationId,owner):await readImagegenReceipt(parsed.data.operationId,owner));}catch{/* Cannot prove absence while the database is unavailable. */}return Response.json({error:error instanceof Error?error.message:"无法提交图像任务",accepted},{status:400});}
}
export async function GET(request:Request){
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 const id=new URL(request.url).searchParams.get("operationId")||"";if(!/^[a-f0-9-]{36}$/i.test(id))return Response.json({error:"操作编号无效"},{status:400});
 const result=await getImagegenResult(id,owner);return result?Response.json(result):Response.json({error:"任务不存在或无权访问"},{status:404});
}
