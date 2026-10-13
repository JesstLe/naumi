import {resolveUserEmail} from "@/lib/admin-auth";
import {sameSiteBillingMutation} from "@/lib/billing/access";
import {imagegenRequestSchema} from "@/lib/imagegen/schema";
import {planImagegen} from "@/lib/imagegen/plan";
export const runtime="nodejs";
export async function POST(request:Request){
 if(!sameSiteBillingMutation(request))return Response.json({error:"请求来源无效"},{status:403});
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 try{return Response.json(await planImagegen(imagegenRequestSchema.parse(await request.json()),owner));}
 catch(error){return Response.json({error:error instanceof Error?error.message:"无法预览计划"},{status:400});}
}
