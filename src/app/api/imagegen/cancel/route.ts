import {resolveUserEmail} from "@/lib/admin-auth";
import {sameSiteBillingMutation} from "@/lib/billing/access";
import {cancelImagegenOperation} from "@/lib/imagegen/cancel";
import {z} from "zod";
import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
export const runtime="nodejs";
async function handlePost(request:Request){
 if(!sameSiteBillingMutation(request))return Response.json({error:"请求来源无效"},{status:403});
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 try{const body=z.strictObject({action:z.literal("cancel"),operationId:z.uuid()}).parse(await request.json());await cancelImagegenOperation(body.operationId,owner);return Response.json({ok:true});}catch(error){return Response.json({error:error instanceof Error?error.message:"停止失败"},{status:400});}
}
export async function POST(request:Request){return withCreationReceiptRoute(request,()=>handlePost(request));}
