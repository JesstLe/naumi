import { z } from "zod";
import { authenticatedEmail } from "@/lib/request-auth";
import { sameSiteBillingMutation, billingJson } from "@/lib/billing/access";
import { recoverPostprocess } from "@/lib/postprocess-recovery";
import { PostprocessPending } from "@/lib/media-postprocess";
export const runtime = "nodejs", dynamic = "force-dynamic";
export async function POST(request: Request) {
  const email=await authenticatedEmail(request);if(!email)return billingJson({error:"请先登录"},401);
  if(!sameSiteBillingMutation(request))return billingJson({error:"请求来源无效"},403);
  try {
    const input=z.strictObject({id:z.string().min(1).max(200)}).parse(await request.json());
    const result=await recoverPostprocess(input.id,email);
    return billingJson({ok:true,...result,parentRecovery:"原任务工作器继续保存与结算，不重新生成底图"});
  } catch(e) {return billingJson({error:e instanceof PostprocessPending?e.message:"后处理恢复失败或无权访问"},e instanceof PostprocessPending?409:400);}
}
