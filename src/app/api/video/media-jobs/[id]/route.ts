import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {getMediaJob,cancelMediaJob} from "@/lib/video/media-jobs";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {z} from "zod";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=240;
type Context={params:Promise<{id:string}>};
async function act(request:Request,context:Context,cancel=false){
  const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});
  if(cancel&&!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站停止"},{status:403});
  const {id}=await context.params;if(!z.uuid().safeParse(id).success)return NextResponse.json({error:"媒体任务不存在"},{status:404});
  try{const job=await (cancel?cancelMediaJob(actor,id):getMediaJob(actor,id));return job?NextResponse.json({ok:true,job}):NextResponse.json({error:"媒体任务不存在"},{status:404});}
  catch{return NextResponse.json({error:"媒体处理服务暂不可用，任务保留等待恢复"},{status:503});}
}
export function GET(request:Request,context:Context){return act(request,context);}
export function DELETE(request:Request,context:Context){return act(request,context,true);}
