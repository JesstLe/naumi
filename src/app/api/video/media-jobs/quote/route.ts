import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {mediaActionSchema} from "@/lib/video/media-job-schema";
import {mediaBillingQuote} from "@/lib/video/media-billing";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});
  const action=mediaActionSchema.safeParse(new URL(request.url).searchParams.get("action"));if(!action.success)return NextResponse.json({error:"处理动作无效"},{status:422});
  try{const quote=await mediaBillingQuote(actor,action.data);return NextResponse.json({ok:true,quote:{version:quote.configVersion,credits:quote.authorizedCredits}});}catch{return NextResponse.json({error:"媒体计费配置暂不可用"},{status:503});}
}
