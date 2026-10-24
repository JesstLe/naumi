import { z } from "zod";
import { biAuthorize, biJson, sameSiteBiMutation } from "@/lib/bi/access";
import { getPool } from "@/platform/db/pool";
import { ensurePostprocessSchema, PostprocessPending } from "@/lib/media-postprocess";
import { recoverPostprocess } from "@/lib/postprocess-recovery";
import { randomUUID } from "node:crypto";
export const runtime="nodejs",dynamic="force-dynamic";
export async function POST(request:Request) {
  const auth=await biAuthorize(request);if(auth instanceof Response)return auth;
  if(!sameSiteBiMutation(request))return biJson({error:"请求来源无效"},403);
  try {
    const {id}=z.strictObject({id:z.string().min(1).max(200)}).parse(await request.json()),pool=getPool();
    await ensurePostprocessSchema(pool);
    const row=(await pool.query("SELECT email FROM app_media_postprocess WHERE operation_id=$1",[id])).rows[0];
    if(!row)return biJson({error:"任务不存在"},404);
    await pool.query("INSERT INTO app_bi_access_log(id,actor,action,target_email,section) VALUES($1,$2,'postprocess-retry',$3,'billing')",[randomUUID(),auth.actor,row.email]);
    return biJson({ok:true,...await recoverPostprocess(id,row.email)});
  }catch(e){return biJson({error:e instanceof PostprocessPending?e.message:"后处理恢复失败"},e instanceof PostprocessPending?409:400);}
}
