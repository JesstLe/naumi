import {NextResponse} from "next/server";
import {z} from "zod";
import {bindUnknownVideoTaskUpstream,getVideoTask,resumeVideoTaskPolling} from "@/lib/db";
import {authenticatedEmail} from "@/lib/request-auth";
import {requireAdmin} from "@/lib/admin-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {confirmVideoTaskCancelled} from "@/lib/video/cancellation";
export const runtime="nodejs",dynamic="force-dynamic";
const schema=z.discriminatedUnion("action",[z.strictObject({action:z.literal("resume_poll")}),z.strictObject({action:z.literal("bind"),upstreamId:z.string().trim().min(1).max(500)}),
  z.strictObject({action:z.literal("cancel_confirmed_not_created"),confirmed:z.literal(true)})]);
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站核对"},{status:403});
  try{
    const parsed=schema.safeParse(JSON.parse(await readBounded(new Response(request.body),8192)));
    if(!parsed.success)return NextResponse.json({error:"核对字段无效"},{status:422});
    const task=await getVideoTask(email,(await context.params).id);if(!task)return NextResponse.json({error:"任务不存在"},{status:404});
    if(task.status!=="needs_attention")return NextResponse.json({error:"此任务无需人工核对"},{status:409});
    if(parsed.data.action==="resume_poll"){
      if(!await resumeVideoTaskPolling(email,task.id))return NextResponse.json({error:"此任务无法恢复轮询"},{status:409});
      return NextResponse.json({ok:true,status:"processing"});
    }
    if(!await requireAdmin(request))return NextResponse.json({error:"请由管理员核对上游创建记录"},{status:403});
    if(task.errorCode!=="creation_unknown")return NextResponse.json({error:"已有上游任务不能按未创建释放预扣"},{status:409});
    if(parsed.data.action==="bind"){
      if(!await bindUnknownVideoTaskUpstream({email,id:task.id,upstreamId:parsed.data.upstreamId}))return NextResponse.json({error:"上游任务关联失败"},{status:409});
      return NextResponse.json({ok:true,status:"processing"});
    }
    await confirmVideoTaskCancelled(email,task.id,"管理员已核对上游未创建，取消任务并释放预扣");return NextResponse.json({ok:true,status:"cancelled"});
  }catch{return NextResponse.json({error:"核对任务暂时不可用"},{status:503});}
}
