import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {ModelConfigError} from "@/lib/model-config/types";
import {createMediaJob} from "@/lib/video/media-jobs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=240;
export async function POST(request:Request){
  const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});
  try{const job=await createMediaJob(actor,await request.json());return NextResponse.json({ok:true,jobId:job.id,job},{status:202});}
  catch(error){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):NextResponse.json({error:"媒体处理创建失败"},{status:502});}
}
