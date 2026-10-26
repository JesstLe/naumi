import {z} from "zod";
import {resolveUserEmail} from "@/lib/admin-auth";
import {sameSiteBillingMutation} from "@/lib/billing/access";
import { imageWorkerAuthorized } from "@/lib/worker/authorization";
import {readImagegenBatch,runImagegenBatchTick,cancelImagegenBatch} from "@/lib/imagegen/batch";
import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
export const runtime="nodejs";
export const maxDuration=300;
type Context={params:Promise<{id:string}>};
async function handleGet(request:Request,context:Context){
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 const parsed=z.uuid().safeParse((await context.params).id);if(!parsed.success)return Response.json({error:"批次编号无效"},{status:400});
 const row=await readImagegenBatch(parsed.data,owner);if(!row)return Response.json({error:"批次不存在或无权访问"},{status:404});
 await runImagegenBatchTick(parsed.data);return Response.json(await readImagegenBatch(parsed.data,owner));
}
async function handlePost(request:Request,context:Context){
 const worker=imageWorkerAuthorized(request);if(!worker&&!sameSiteBillingMutation(request))return Response.json({error:"请求来源无效"},{status:403});
 const parsed=z.uuid().safeParse((await context.params).id);if(!parsed.success)return Response.json({error:"批次编号无效"},{status:400});
 const body=await request.json().catch(()=>null);
 if(body?.action==="tick"){if(!worker)return Response.json({error:"无权执行"},{status:403});await runImagegenBatchTick(parsed.data);return Response.json({ok:true});}
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 if(body?.action!=="cancel")return Response.json({error:"操作无效"},{status:400});
 try{await cancelImagegenBatch(parsed.data,owner);return Response.json(await readImagegenBatch(parsed.data,owner));}catch{return Response.json({error:"批次不存在或无权访问"},{status:404});}
}
export async function GET(request:Request,context:Context){return withCreationReceiptRoute(request,()=>handleGet(request,context));}
export async function POST(request:Request,context:Context){return withCreationReceiptRoute(request,()=>handlePost(request,context));}
