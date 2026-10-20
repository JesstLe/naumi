import { resolveUserEmail } from "@/lib/admin-auth";
import { sameSiteBillingMutation } from "@/lib/billing/access";
import { recoverStoredDelivery } from "@/lib/imagegen/stored-delivery";
import { rateLimit } from "@/lib/rate-limit";
export const runtime="nodejs";
export async function POST(request:Request){
 if(!sameSiteBillingMutation(request))return Response.json({error:"请求来源无效"},{status:403});
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 const body=await request.json().catch(()=>null),id=body?.operationId;
 if(typeof id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return Response.json({error:"操作编号无效"},{status:400});
 if(!rateLimit(`image-delivery-recovery:${owner}`,8,600000))return Response.json({error:"检查过于频繁，请稍后重试"},{status:429});
 try{return Response.json(await recoverStoredDelivery(`imagegen-${id}`,owner));}
 catch{return Response.json({error:"原结果恢复未完成，请稍后检查或联系管理员；没有重新生成"},{status:409});}
}
